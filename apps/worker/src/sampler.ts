import { db } from "@seo/db";
import { minSimilarity, templatePattern } from "./url-templates.js";

const minUrls = Number(process.env.TEMPLATE_MIN_URLS ?? 8),
  sampleSize = Number(process.env.TEMPLATE_SAMPLE_SIZE ?? 5),
  threshold = Number(process.env.TEMPLATE_SIMILARITY ?? 0.5);

type State = "SAMPLING" | "SAMPLED" | "MIXED";

/**
 * Keşfedilen URL'leri şablonlara ayırır. Bir şablon en az `minUrls` farklı adrese
 * ulaşınca tanınır; `sampleSize` örnek analiz edilir, kalanlar SKIPPED olur.
 * Örnekler bittiğinde yapıları karşılaştırılır; benzemiyorlarsa şablon MIXED olur
 * ve atlanan tüm adresler yeniden kuyruğa alınır.
 */
export class TemplateSampler {
  private known = new Set<string>();
  private pending = new Map<string, Set<string>>(); // henüz tanınmamış aday şablonlar
  private state = new Map<string, State>();
  private samples = new Map<string, number>();
  // İstek işleyicileri eş zamanlı çalıştığından durum değişiklikleri sıraya alınır.
  private lock: Promise<unknown> = Promise.resolve();

  constructor(private crawlId: string) {}

  private serial<T>(fn: () => Promise<T>) {
    const next = this.lock.then(fn, fn);
    this.lock = next.catch(() => undefined);
    return next;
  }

  /** Sürdürülen taramada bellek durumunu veritabanından yeniden kurar. */
  async load() {
    const [templates, rows] = await Promise.all([
      db.urlTemplate.findMany({ where: { crawlId: this.crawlId } }),
      db.crawlUrl.findMany({
        where: { crawlId: this.crawlId },
        select: { normalized: true, status: true, template: true },
      }),
    ]);
    for (const t of templates) this.state.set(t.pattern, t.status);
    for (const r of rows) {
      this.known.add(r.normalized);
      if (r.status === "EXCLUDED") continue;
      if (r.template && this.state.has(r.template)) {
        if (r.status !== "SKIPPED")
          this.samples.set(r.template, (this.samples.get(r.template) ?? 0) + 1);
      } else {
        const p = templatePattern(r.normalized);
        if (p) this.pending.set(p, (this.pending.get(p) ?? new Set()).add(r.normalized));
      }
    }
  }

  /**
   * Yeni keşfedilen bir URL'nin kuyruğa mı gireceğini yoksa atlanacağını belirler.
   * Daha önce görülmüş URL'ler için null döner; mevcut kayıt olduğu gibi kalır.
   */
  assign(url: string) {
    return this.serial(async () => {
      if (this.known.has(url)) return null;
      this.known.add(url);
      const p = templatePattern(url);
      if (!p) return { template: null, status: "DISCOVERED" as const };
      if (!this.state.has(p)) {
        const set = (this.pending.get(p) ?? new Set<string>()).add(url);
        this.pending.set(p, set);
        if (set.size < minUrls) return { template: null, status: "DISCOVERED" as const };
        await this.recognize(p, set, url);
      }
      return { template: p, status: this.take(p) };
    });
  }

  private take(p: string): "DISCOVERED" | "SKIPPED" {
    if (this.state.get(p) === "MIXED") return "DISCOVERED";
    const n = this.samples.get(p) ?? 0;
    if (n >= sampleSize) return "SKIPPED";
    this.samples.set(p, n + 1);
    return "DISCOVERED";
  }

  /** Şablonu kaydeder; daha önce kuyruğa girmiş üyelerden örnek kotası dışındakileri atlar. */
  private async recognize(p: string, members: Set<string>, incoming: string) {
    this.pending.delete(p);
    this.state.set(p, "SAMPLING");
    await db.urlTemplate.upsert({
      where: { crawlId_pattern: { crawlId: this.crawlId, pattern: p } },
      create: { crawlId: this.crawlId, pattern: p },
      update: {},
    });
    const rows = await db.crawlUrl.findMany({
      where: {
        crawlId: this.crawlId,
        normalized: { in: [...members].filter((u) => u !== incoming) },
      },
      select: { id: true, status: true },
      orderBy: { createdAt: "asc" },
    });
    // İşlenmiş veya işlenmekte olanlar zaten örnektir; kota dolana kadar bekleyenler de örnek olur.
    const started = rows.filter((r) => r.status !== "DISCOVERED"),
      waiting = rows.filter((r) => r.status === "DISCOVERED"),
      keep = waiting.slice(0, Math.max(0, sampleSize - started.length)),
      skip = waiting.slice(keep.length);
    this.samples.set(p, started.length + keep.length);
    await db.crawlUrl.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { template: p },
    });
    if (skip.length)
      await db.crawlUrl.updateMany({
        where: { id: { in: skip.map((r) => r.id) }, status: "DISCOVERED" },
        data: { status: "SKIPPED" },
      });
  }

  /**
   * Örnekleri biten şablonların yapısını karşılaştırır. Her tarama partisinden sonra,
   * kuyrukta işlenmekte olan URL yokken çağrılmalıdır.
   */
  review() {
    return this.serial(async () => {
      for (const [p, s] of this.state) {
        if (s !== "SAMPLING") continue;
        const samples = await db.crawlUrl.findMany({
          where: { crawlId: this.crawlId, template: p, status: { not: "SKIPPED" } },
          select: { normalized: true, status: true },
        });
        if (samples.some((x) => x.status === "DISCOVERED" || x.status === "PROCESSING"))
          continue;
        const pages = await db.page.findMany({
          where: {
            crawlId: this.crawlId,
            url: { in: samples.map((x) => x.normalized) },
            responseKind: "HTML",
            statusCode: { gte: 200, lt: 300 },
          },
          select: { structure: true },
        });
        const sigs = pages.map((x) => (Array.isArray(x.structure) ? (x.structure as string[]) : []));
        // Karşılaştırılacak en az iki başarılı sayfa yoksa örnekleme güvenilir değildir.
        const similarity = sigs.length >= 2 ? minSimilarity(sigs) : 0,
          next: State = similarity >= threshold ? "SAMPLED" : "MIXED";
        this.state.set(p, next);
        await db.urlTemplate.update({
          where: { crawlId_pattern: { crawlId: this.crawlId, pattern: p } },
          data: { status: next, similarity },
        });
        if (next === "MIXED")
          await db.crawlUrl.updateMany({
            where: { crawlId: this.crawlId, template: p, status: "SKIPPED" },
            data: { status: "DISCOVERED" },
          });
      }
    });
  }
}
