import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@seo/db";
import { countBySeverity, groupFindings, passedRules } from "./findings";
import { attachTemplates, getTemplates } from "./templates";
const secret = () =>
  process.env.EXPORT_SIGNING_SECRET ?? "yalnizca-yerel-gelistirme-anahtari";
export const signExport = (crawlId: string) =>
  createHmac("sha256", secret()).update(crawlId).digest("hex");
export function verifyExport(crawlId: string, token: string | null) {
  if (!token) return false;
  const expected = signExport(crawlId);
  try {
    return timingSafeEqual(
      Buffer.from(token, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}
const safe = (value: unknown, max = 4000) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .slice(0, max);
export async function getReportData(crawlId: string) {
  const crawl = await db.crawl.findUnique({
    where: { id: crawlId },
    include: { findings: { orderBy: { severity: "asc" } }, exclusions: true },
  });
  if (!crawl) throw new Error("Rapor bulunamadı.");
  const affectedCount = crawl.findings.reduce(
    (sum, f) =>
      sum + (Array.isArray(f.affectedUrls) ? f.affectedUrls.length : 0),
    0,
  );
  if (crawl.findings.length > 2000 || affectedCount > 20000)
    throw new Error(
      "Rapor dışa aktarma sınırını aşıyor; filtrelenmiş rapor üretimi gerekir.",
    );
  const excludedCount = await db.crawlUrl.count({
    where: {
      crawlId,
      status: { in: ["EXCLUDED", "ERROR", "DISCOVERED", "PROCESSING"] },
    },
  });
  if (excludedCount > 5000)
    throw new Error(
      "Kapsam dışı ve bekleyen URL listesi dışa aktarma sınırını aşıyor.",
    );
  const previous = await db.crawl.findFirst({
    where: {
      normalizedHost: crawl.normalizedHost,
      status: "COMPLETED",
      createdAt: { lt: crawl.createdAt },
    },
    orderBy: { createdAt: "desc" },
    include: { findings: true },
  });
  const templates = await getTemplates(crawlId);
  const groups = attachTemplates(groupFindings(crawl.findings), templates);
  const old = new Set(previous?.findings.map((f) => f.fingerprint) ?? []),
    now = new Set(crawl.findings.map((f) => f.fingerprint));
  const excluded = await db.crawlUrl.findMany({
    where: {
      crawlId,
      status: { in: ["EXCLUDED", "ERROR", "DISCOVERED", "PROCESSING"] },
    },
    select: { url: true, status: true, lastError: true },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });
  return {
    crawl: {
      id: crawl.id,
      host: crawl.normalizedHost,
      rootUrl: crawl.rootUrl,
      status: crawl.status,
      createdAt: crawl.createdAt,
      completedAt: crawl.completedAt,
      processed: crawl.processedPages,
      discovered: crawl.discoveredPages,
      pending: crawl.pendingUrls,
      errors: crawl.errorUrls,
      html: crawl.analyzedHtmlPages,
      redirects: crawl.redirectCount,
      skipped: crawl.skippedUrls,
      fullCrawl: crawl.fullCrawl,
      partialReason: crawl.partialReason,
    },
    counts: countBySeverity(groups),
    score: crawl.score,
    previousScore: previous?.score ?? null,
    passed: passedRules(crawl.checkedRules, groups)?.map((r) => ({
      code: r.code,
      title: safe(r.title, 300),
    })) ?? null,
    findings: groups.map((f) => ({
      code: f.code,
      severity: f.severity,
      title: safe(f.title, 300),
      description: safe(f.description),
      recommendation: safe(f.recommendation),
      urls: f.urls.map((u) => safe(u, 2048)),
      // Tekrar bulgularında URL'ler paylaşılan değere göre alt başlıklar altında listelenir.
      groups: f.groups.map((g, i) => ({
        label:
          g.label === null
            ? null
            : f.code === "DUPLICATE_CONTENT"
              ? `Grup ${i + 1}`
              : `“${safe(g.label, 300)}”`,
        urls: g.urls.map((u) => safe(u, 2048)),
      })),
      templateHits: (f.templateHits ?? []).map((h) => ({
        ...h,
        pattern: safe(h.pattern, 500),
      })),
      evidence: f.groups
        .flatMap((g) => g.evidence)
        .map((e) => safe(JSON.stringify(e), 3000)),
    })),
    templates: templates.map((t) => ({
      ...t,
      pattern: safe(t.pattern, 500),
      samples: t.samples.map((u) => safe(u, 2048)),
    })),
    excluded: excluded.map((x) => ({
      url: safe(x.url, 2048),
      status: x.status,
      reason: safe(x.lastError ?? "Bekliyor", 500),
    })),
    comparison: {
      new: crawl.findings.filter((f) => !old.has(f.fingerprint)).length,
      ongoing: crawl.findings.filter((f) => old.has(f.fingerprint)).length,
      resolved:
        previous?.findings.filter((f) => !now.has(f.fingerprint)).length ?? 0,
      hasPrevious: !!previous,
    },
  };
}
export type ReportData = Awaited<ReturnType<typeof getReportData>>;
/** Bir şablonun örneklerinde görülen bulguların tek satırlık özeti (PDF ve Word için). */
export function templateFindings(data: ReportData, pattern: string, samples: number) {
  const found = data.findings.flatMap((f) => {
    const h = f.templateHits.find((x) => x.pattern === pattern);
    return h ? [`${f.title} (${h.urls.length}/${samples} örnekte)`] : [];
  });
  return found.length
    ? `Örneklerin bulguları: ${found.join(", ")}`
    : "Örneklerde sorun bulunmadı.";
}
export function reportFilename(data: ReportData, extension: "pdf" | "docx") {
  const date = new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(data.crawl.completedAt ?? data.crawl.createdAt)
    .replace(/\./g, "-");
  return `seo-raporu-${data.crawl.host.replace(/[^a-z0-9.-]/gi, "-")}-${date}.${extension}`;
}
