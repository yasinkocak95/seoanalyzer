import { db } from "@seo/db";
import type { FindingGroup } from "./findings";

export type TemplateSummary = {
  pattern: string;
  /** SAMPLED: örneklendi; MIXED: örnekler farklı sayfa türleri çıktı, tamamı analiz edildi. */
  status: "SAMPLING" | "SAMPLED" | "MIXED";
  similarity: number | null;
  discovered: number;
  analyzed: number;
  /** Keşfedildi, analiz edilmedi. */
  skipped: number;
  samples: string[];
};
export type TemplateHit = {
  pattern: string;
  urls: string[];
  sampleCount: number;
  discovered: number;
  skipped: number;
};

export async function getTemplates(crawlId: string): Promise<TemplateSummary[]> {
  const templates = await db.urlTemplate.findMany({ where: { crawlId } });
  if (!templates.length) return [];
  const [counts, samples] = await Promise.all([
    db.crawlUrl.groupBy({
      by: ["template", "status"],
      where: { crawlId, template: { not: null } },
      _count: { _all: true },
    }),
    // Karışık şablonların tamamı analiz edildiğinden örnek listesi yalnız örneklenenler için tutulur.
    db.crawlUrl.findMany({
      where: {
        crawlId,
        template: { in: templates.filter((t) => t.status !== "MIXED").map((t) => t.pattern) },
        status: { in: ["PROCESSED", "ERROR"] },
      },
      select: { normalized: true, template: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return templates
    .map((t) => {
      const c = (status: string) =>
        counts.find((x) => x.template === t.pattern && x.status === status)?._count._all ?? 0;
      const analyzed = c("PROCESSED") + c("ERROR"),
        skipped = c("SKIPPED");
      return {
        pattern: t.pattern,
        status: t.status,
        similarity: t.similarity,
        discovered: analyzed + skipped + c("DISCOVERED") + c("PROCESSING"),
        analyzed,
        skipped,
        samples: samples.filter((s) => s.template === t.pattern).map((s) => s.normalized),
      };
    })
    .sort((a, b) => b.discovered - a.discovered);
}

/**
 * Örneklenen şablonlara ait URL'leri bulgu listelerinden çıkarıp şablon özeti olarak
 * ekler. Böylece binlerce benzer URL yerine "şablon – kaç örnekte görüldü" gösterilir.
 */
export function attachTemplates(groups: FindingGroup[], templates: TemplateSummary[]) {
  const bySample = new Map<string, TemplateSummary>();
  for (const t of templates) if (t.status !== "MIXED") for (const u of t.samples) bySample.set(u, t);
  if (!bySample.size) return groups;
  return groups.map((f) => {
    const hits = new Map<string, TemplateHit>();
    for (const u of f.urls) {
      const t = bySample.get(u);
      if (!t) continue;
      const h =
        hits.get(t.pattern) ??
        { pattern: t.pattern, urls: [], sampleCount: t.samples.length, discovered: t.discovered, skipped: t.skipped };
      h.urls.push(u);
      hits.set(t.pattern, h);
    }
    if (!hits.size) return f;
    const keep = (u: unknown) => !bySample.has(String(u ?? ""));
    return {
      ...f,
      templateHits: [...hits.values()],
      groups: f.groups
        .map((g) => ({
          ...g,
          urls: g.urls.filter(keep),
          evidence: g.evidence.filter((e) => keep(e.url)),
        }))
        .filter((g) => g.urls.length || g.evidence.length),
    };
  });
}
