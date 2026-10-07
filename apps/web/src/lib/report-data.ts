import {translator,numberLocale,localizeFinding,localizeEvidence,turkish,type Locale} from '@seo/shared/i18n';
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@seo/db";
import { countBySeverity, groupFindings, passedRules } from "./findings";
import { attachTemplates, getTemplates } from "./templates";
import { compareCrawls } from '@seo/shared';
export const signExport = (crawlId: string) => {
  const secret = process.env.EXPORT_SIGNING_SECRET?.trim();
  const legacyDefault = secret === 'yerel-gelistirme-icin-degistirin' || secret === 'yalnizca-yerel-gelistirme-anahtari';
  return secret && secret.length >= 32 && !legacyDefault ? createHmac('sha256', secret).update(crawlId).digest('hex') : '';
};
export function exportFailure(error: unknown, locale: Locale) {
  const t = translator(locale), message = error instanceof Error ? error.message : '';
  if (message === t('m092')) return { error: message, status: 404 };
  if (message === t('m160')) return { error: message, status: 409 };
  if (message === t('m093') || message === t('m094')) return { error: message, status: 413 };
  return { error: t('saas.error'), status: 503 };
}
export function verifyExport(crawlId: string, token: string | null) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const expected = signExport(crawlId);
  if (!expected) return false;
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
export async function getReportData(crawlId: string,locale:Locale='tr') {
  const t=translator(locale);
  if(await db.finding.count({where:{crawlId}})>2000)throw new Error(t('m093'));
  const crawl = await db.crawl.findUnique({
    where: { id: crawlId },
    include: { findings: { orderBy: { severity: "asc" }, take: 2001 } },
  });
  if (!crawl) throw new Error(t("m092"));
  if (!['COMPLETED', 'PARTIAL'].includes(crawl.status)) throw new Error(t('m160'));
  const affectedCount = crawl.findings.reduce(
    (sum, f) =>
      sum + (Array.isArray(f.affectedUrls) ? f.affectedUrls.length : 0),
    0,
  );
  if (crawl.findings.length > 2000 || affectedCount > 20000)
    throw new Error(
      t("m093"),
    );
  const excludedCount = await db.crawlUrl.count({
    where: {
      crawlId,
      status: { in: ["EXCLUDED", "ERROR", "DISCOVERED", "PROCESSING"] },
    },
  });
  if (excludedCount > 5000)
    throw new Error(
      t("m094"),
    );
  const previous = await db.crawl.findFirst({
    where: {
      ownerHash: crawl.ownerHash,
      normalizedHost: crawl.normalizedHost,
      status: "COMPLETED",
      createdAt: { lt: crawl.createdAt },
    },
    orderBy: { createdAt: "desc" },
    include: { findings: { take: 2001 } },
  });
  if (previous && previous.findings.length > 2000) throw new Error(t('m093'));
  const templates = await getTemplates(crawlId);
  const groups = attachTemplates(groupFindings(crawl.findings.map(f=>localizeFinding(f,locale))), templates);
  const comparison = previous ? compareCrawls(previous, crawl).rows : [];
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
    locale,
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
      partialReason: crawl.partialReason===null?null:t(crawl.partialReason),
    },
    counts: countBySeverity(groups),
    score: crawl.score,
    previousScore: previous?.score ?? null,
    passed: passedRules(crawl.checkedRules, groups)?.map((r) => ({
      code: r.code,
      title: safe(t(r.title), 300),
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
              ? t("m331", [i + 1])
              : `“${safe(g.label, 300)}”`,
        urls: g.urls.map((u) => safe(u, 2048)),
      })),
      templateHits: (f.templateHits ?? []).map((h) => ({
        ...h,
        pattern: safe(h.pattern, 500),
      })),
      evidence: f.groups
        .flatMap((g) => g.evidence)
        .map((e) => safe(JSON.stringify(localizeEvidence(e,locale)), 3000)),
    })),
    templates: templates.map((t) => ({
      ...t,
      pattern: safe(t.pattern, 500),
      samples: t.samples.map((u) => safe(u, 2048)),
    })),
    excluded: excluded.map((x) => ({
      url: safe(x.url, 2048),
      status: t(x.status),
      reason: safe(t(x.lastError ?? t("m095")), 500),
    })),
    comparison: {
      new: previous ? comparison.filter(row => row.status === 'new').length : groups.length,
      ongoing: comparison.filter(row => row.status === 'ongoing' || row.status === 'worsened').length,
      resolved: comparison.filter(row => row.status === 'resolved').length,
      unverified: comparison.filter(row => row.status === 'unverified').length,
      hasPrevious: !!previous,
    },
  };
}
export type ReportData = Awaited<ReturnType<typeof getReportData>>;
/** Bir şablonun örneklerinde görülen bulguların tek satırlık özeti (PDF ve Word için). */
export function templateFindings(data: ReportData, pattern: string, samples: number) {
  const locale=data.locale,t=translator(locale);
  const found = data.findings.flatMap((f) => {
    const h = f.templateHits.find((x) => x.pattern === pattern);
    return h ? [t("m096", [f.title, h.urls.length, samples])] : [];
  });
  return found.length
    ? t("m097", [found.join(", ")])
    : t("m098");
}
export function reportFilename(data: ReportData, extension: "pdf" | "docx") {
  const locale=data.locale,t=translator(locale);
  const date = new Intl.DateTimeFormat(numberLocale(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(data.crawl.completedAt ?? data.crawl.createdAt)
    .replace(/[.\/]/g, "-");
  return `seo-raporu-${data.crawl.host.replace(/[^a-z0-9.-]/gi, "-")}-${date}.${extension}`;
}
