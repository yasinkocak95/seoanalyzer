import { turkish } from '@seo/shared/i18n';
import { createHash } from "node:crypto";
import { db, type Severity } from "@seo/db";
import {
  RULE_CATALOG,
  SITEMAP_RULES,
  runRules,
  scoreFindings,
  type Finding,
  type PageInput,
} from "@seo/rules";
import { findBrokenImages, imageChecksEnabled } from "./image-check.js";
const fingerprint = (code: string, urls: string[]) =>
  createHash("sha256")
    .update(`${code}:${[...urls].sort().join("|")}`)
    .digest("hex");
async function save(crawlId: string, f: Finding) {
  await db.finding.create({
    data: {
      crawlId,
      code: f.code,
      severity: f.severity as Severity,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
      affectedUrls: f.affectedUrls,
      evidence: f.evidence as never,
      fingerprint: fingerprint(f.code, f.affectedUrls),
    },
  });
}
export async function analyzeStoredPages(
  crawlId: string,
  robotsAccessible: boolean,
  robotsUrl: string,
  partial: boolean,
  sitemapFound: boolean,
) {
  await db.finding.deleteMany({ where: { crawlId } });
  await buildRedirectChains(crawlId);
  const brokenImages = await checkImages(crawlId);
  let cursor: string | undefined;
  do {
    const rows = await db.page.findMany({
      where: { crawlId },
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (!rows.length) break;
    cursor = rows.at(-1)!.id;
    const pages: PageInput[] = rows.map((r) => ({
      url: r.url,
      statusCode: r.statusCode,
      responseKind: r.responseKind,
      title: r.title,
      description: r.description,
      canonical: r.canonical,
      canonicalCount: r.socialTags && typeof r.socialTags === "object" && !Array.isArray(r.socialTags) ? Number(r.socialTags.canonicalCount??0) : undefined,
      robots: r.robots,
      h1: Array.isArray(r.h1) ? (r.h1 as string[]) : [],
      headings: Array.isArray(r.headings) ? (r.headings as never) : [],
      images: Array.isArray(r.images) ? (r.images as never) : [],
      contentHash: r.contentHash,
      textContent: r.textContent,
      // null: alan bu taramada toplanmadı; kurallar bu durumda sessiz kalır.
      lang: r.lang ?? undefined,
      viewport: r.viewport ?? undefined,
      socialTags: r.socialTags ? (r.socialTags as never) : undefined,
      mixedContent: Array.isArray(r.mixedContent)
        ? (r.mixedContent as string[])
        : [],
      links: Array.isArray(r.links) ? (r.links as never) : [],
      hreflangs: Array.isArray(r.hreflangs) ? (r.hreflangs as never) : [],
      jsonLd: Array.isArray(r.jsonLd) ? (r.jsonLd as never) : [],
      redirectChain: Array.isArray(r.redirectChain)
        ? (r.redirectChain as string[])
        : [],
      error: r.error,
    }));
    const fs = runRules({
      pages,
      sitemapUrls: [],
      robotsAccessible: true,
      robotsUrl,
      crawlLimited: partial,
      brokenImages,
    }).filter(
      (f) =>
        ![
          "DUPLICATE_TITLE",
          "DUPLICATE_DESCRIPTION",
          "DUPLICATE_CONTENT",
          "POSSIBLE_ORPHAN",
          "SITEMAP_URL_UNCRAWLED",
          "ROBOTS_UNAVAILABLE",
          "CANONICAL_UNREACHABLE",
          "SITEMAP_CANONICAL_MISMATCH",
          "BROKEN_INTERNAL_LINK",
          "HREFLANG_RETURN_MISSING",
        ].includes(f.code),
    );
    for (const f of fs) await save(crawlId, f);
  } while (cursor);
  const configs = [
    {
      field: "title" as const,
      code: "DUPLICATE_TITLE",
      title: turkish("m171"),
      description:
        turkish("m172"),
    },
    {
      field: "description" as const,
      code: "DUPLICATE_DESCRIPTION",
      title: turkish("m173"),
      description:
        turkish("m174"),
    },
    {
      field: "contentHash" as const,
      code: "DUPLICATE_CONTENT",
      title: turkish("m175"),
      description:
        turkish("m176"),
    },
  ];
  for (const c of configs) {
    let groupOffset = 0;
    while (true) {
      const grouped = (await db.page.groupBy({
        by: [c.field],
        where: {
          crawlId,
          responseKind: "HTML",
          statusCode: { gte: 200, lt: 300 },
          [c.field]: { notIn: [""] },
        },
        _count: { _all: true },
        having: { [c.field]: { _count: { gt: 1 } } },
        orderBy: { [c.field]: "asc" },
        skip: groupOffset,
        take: 100,
      } as never)) as unknown as Array<Record<string, string>>;
      if (!grouped.length) break;
      for (const g of grouped) {
      const value = g[c.field];
      let skip = 0;
      while (true) {
        const rows = await db.page.findMany({
          where: {
            crawlId,
            responseKind: "HTML",
            statusCode: { gte: 200, lt: 300 },
            [c.field]: value,
          },
          select: { url: true },
          orderBy: { url: "asc" },
          skip,
          take: 100,
        });
        if (!rows.length) break;
        const urls = rows.map((r) => r.url);
        await save(crawlId, {
          code: c.code,
          severity: "WARNING",
          title: c.title,
          description: c.description,
          recommendation:
            turkish("m177"),
          affectedUrls: urls,
          evidence: urls.map((url) => ({ url, deger: value })),
        });
        skip += rows.length;
      }
      }
      groupOffset += grouped.length;
    }
  }
  await analyzeCrossPageSignals(crawlId, partial);
  for (const f of runRules({
    pages: [],
    sitemapUrls: [],
    robotsAccessible: true,
    robotsUrl,
    crawlLimited: partial,
    sitemapFound,
  }))
    await save(crawlId, f);
  if (!robotsAccessible)
    await save(crawlId, {
      code: "ROBOTS_UNAVAILABLE",
      severity: "WARNING",
      title: turkish("m178"),
      description: turkish("m179"),
      recommendation: turkish("m180"),
      affectedUrls: [robotsUrl],
      evidence: [{ url: robotsUrl }],
    });
  await saveSummary(crawlId, sitemapFound);
}

/** Puanı ve bu taramada gerçekten uygulanabilen kuralların listesini kaydeder. */
async function saveSummary(crawlId: string, sitemapFound: boolean) {
  const [findings, htmlPages] = await Promise.all([
    db.finding.findMany({
      where: { crawlId },
      select: { code: true, severity: true, affectedUrls: true },
    }),
    db.page.count({
      where: { crawlId, responseKind: "HTML", statusCode: { gte: 200, lt: 300 } },
    }),
  ]);
  const skipped = new Set([
    ...(sitemapFound ? [] : SITEMAP_RULES),
    ...(imageChecksEnabled ? [] : ["BROKEN_IMAGE"]),
  ]);
  await db.crawl.update({
    where: { id: crawlId },
    data: {
      score: scoreFindings(
        findings.map((f) => ({
          ...f,
          affectedUrls: Array.isArray(f.affectedUrls) ? (f.affectedUrls as string[]) : [],
        })),
        htmlPages,
      ),
      checkedRules: RULE_CATALOG.filter((r) => !skipped.has(r.code)),
    },
  });
}

async function checkImages(crawlId: string) {
  await db.crawl.update({
    where: { id: crawlId },
    data: { statusMessage: turkish("m181") },
  });
  const sources = new Set<string>();
  const maxChecks=Number(process.env.MAX_IMAGE_CHECKS??300);
  if (maxChecks<=0) return {};
  let cursor: string | undefined;
  while (true) {
    const rows = await db.page.findMany({
      where: { crawlId, responseKind: "HTML", statusCode: { gte: 200, lt: 300 } },
      select: { id: true, images: true },
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!rows.length) break;
    cursor = rows.at(-1)!.id;
    for (const r of rows)
      for (const i of (Array.isArray(r.images) ? r.images : []) as Array<{ src?: string }>)
        if (i.src && /^https?:\/\//i.test(i.src)) sources.add(i.src);
    if (sources.size>=maxChecks) break;
  }
  return findBrokenImages(sources);
}

async function analyzeCrossPageSignals(crawlId: string, partial: boolean) {
  const pending = new Map<string, Array<{ url: string; evidence: unknown }>>();
  const definitions: Record<
    string,
    { severity: "CRITICAL" | "WARNING"; title: string; description: string; recommendation: string }
  > = {
    CANONICAL_UNREACHABLE: {
      severity: "CRITICAL",
      title: turkish("m182"),
      description: turkish("m183"),
      recommendation: turkish("m184"),
    },
    SITEMAP_CANONICAL_MISMATCH: {
      severity: "WARNING",
      title: turkish("m185"),
      description: turkish("m186"),
      recommendation: turkish("m187"),
    },
    BROKEN_INTERNAL_LINK: {
      severity: "CRITICAL",
      title: turkish("m188"),
      description: turkish("m189"),
      recommendation: turkish("m190"),
    },
    HREFLANG_RETURN_MISSING: {
      severity: "WARNING",
      title: turkish("m191"),
      description: turkish("m192"),
      recommendation: turkish("m193"),
    },
    SITEMAP_URL_UNCRAWLED: {
      severity: "WARNING",
      title: turkish("m194"),
      description: turkish("m195"),
      recommendation: turkish("m196"),
    },
    POSSIBLE_ORPHAN: {
      severity: "WARNING",
      title: turkish("m197"),
      description: turkish("m198", [partial ? turkish("m199") : ""]),
      recommendation: turkish("m200"),
    },
  };
  const add = async (code: string, url: string, evidence: unknown) => {
    const items = pending.get(code) ?? [];
    items.push({ url, evidence });
    pending.set(code, items);
    if (items.length >= 100) await flush(code);
  };
  const flush = async (code: string) => {
    const items = pending.get(code) ?? [];
    if (!items.length) return;
    pending.set(code, []);
    const d = definitions[code];
    await save(crawlId, {
      code,
      severity: d.severity,
      title: d.title,
      description: d.description,
      recommendation: d.recommendation,
      affectedUrls: items.map((x) => x.url),
      evidence: items.map((x) => x.evidence) as never,
    });
  };
  let cursor: string | undefined;
  while (true) {
    const pages = await db.page.findMany({
      where: { crawlId, responseKind: "HTML", statusCode: { gte: 200, lt: 300 } },
      select: { id: true, url: true, canonical: true, links: true, hreflangs: true },
      orderBy: { id: "asc" },
      take: 25,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!pages.length) break;
    cursor = pages.at(-1)!.id;
    const sitemapRows = await db.crawlUrl.findMany({
      where: { crawlId, normalized: { in: pages.map((p) => p.url) } },
      select: { normalized: true, fromSitemap: true },
    });
    const sitemapSet = new Set(sitemapRows.filter((x) => x.fromSitemap).map((x) => x.normalized));
    for (const page of pages) {
      if (page.canonical) {
        const target = await db.page.findUnique({
          where: { crawlId_url: { crawlId, url: page.canonical } },
          select: { statusCode: true, responseKind: true },
        });
        if (target && (target.responseKind !== "HTML" || !target.statusCode || target.statusCode < 200 || target.statusCode >= 300))
          await add("CANONICAL_UNREACHABLE", page.url, { canonical: page.canonical, hedefDurumu: target.statusCode });
        if (sitemapSet.has(page.url) && page.canonical !== page.url)
          await add("SITEMAP_CANONICAL_MISMATCH", page.url, { canonical: page.canonical });
      }
      const links = (Array.isArray(page.links) ? page.links : []) as Array<{ url: string; text?: string; internal?: boolean }>;
      for (let i = 0; i < links.length; i += 100) {
        const part = links.slice(i, i + 100).filter((x) => x.internal);
        const targets = await db.page.findMany({
          where: { crawlId, url: { in: part.map((x) => x.url) } },
          select: { url: true, statusCode: true, responseKind: true },
        });
        const byUrl = new Map(targets.map((x) => [x.url, x]));
        for (const link of part) {
          let target = byUrl.get(link.url);
          if (target?.responseKind === 'REDIRECT') {
            const redirect = await db.page.findUnique({where:{crawlId_url:{crawlId,url:link.url}},select:{redirectChain:true,error:true}});
            const chain=Array.isArray(redirect?.redirectChain)?redirect.redirectChain:[];
            const end=chain.at(-1);
            if (redirect?.error) target={...target,responseKind:'ERROR'};
            else if (typeof end==='string') target=await db.page.findUnique({where:{crawlId_url:{crawlId,url:end}},select:{url:true,statusCode:true,responseKind:true}})??undefined;
          }
          if (target && (target.responseKind === "ERROR" || (target.statusCode ?? 0) >= 400))
            await add("BROKEN_INTERNAL_LINK", page.url, { hedef: link.url, baglantiMetni: link.text, hedefDurumu: target.statusCode });
        }
      }
      const hreflangs = (Array.isArray(page.hreflangs) ? page.hreflangs : []) as Array<{ lang: string; url: string }>;
      for (const hreflang of hreflangs) {
        const target = await db.page.findUnique({
          where: { crawlId_url: { crawlId, url: hreflang.url } },
          select: { hreflangs: true, responseKind: true },
        });
        const returns = Array.isArray(target?.hreflangs)
          ? (target.hreflangs as Array<{ url?: string }>).some((x) => x.url === page.url)
          : false;
        if (target?.responseKind === "HTML" && !returns)
          await add("HREFLANG_RETURN_MISSING", page.url, { dil: hreflang.lang, hedef: hreflang.url });
      }
    }
  }
  const crawl=await db.crawl.findUniqueOrThrow({where:{id:crawlId},select:{rootUrl:true}});
  let sitemapCursor: string | undefined;
  while (true) {
    const rows = await db.crawlUrl.findMany({
      where: { crawlId, fromSitemap: true },
      select: { id: true, normalized: true, status: true, linked: true },
      orderBy: { id: "asc" },
      take: 100,
      ...(sitemapCursor ? { skip: 1, cursor: { id: sitemapCursor } } : {}),
    });
    if (!rows.length) break;
    sitemapCursor = rows.at(-1)!.id;
    for (const row of rows) {
      // Şablon örneklemesiyle bilerek atlanan URL'ler taranamamış sayılmaz.
      if (row.status === "SKIPPED") continue;
      if (row.status !== "PROCESSED")
        await add("SITEMAP_URL_UNCRAWLED", row.normalized, { durum: row.status });
      else if (!row.linked && row.normalized!==crawl.rootUrl)
        await add("POSSIBLE_ORPHAN", row.normalized, { not: turkish("m201") });
    }
  }
  for (const code of pending.keys()) await flush(code);
}

/** Redirects are crawled independently; reconstruct chains from recorded responses. */
async function buildRedirectChains(crawlId:string) {
  const redirects=await db.page.findMany({where:{crawlId,responseKind:'REDIRECT'},select:{url:true,redirectTarget:true}});
  const byUrl=new Map(redirects.map(p=>[p.url,p.redirectTarget]));
  for (const page of redirects) {
    const chain=[page.url]; let next=page.redirectTarget,loop=false;
    while(next && chain.length<=100) {
      if(chain.includes(next)) {chain.push(next);loop=true;break;}
      chain.push(next);next=byUrl.get(next)??null;
    }
    await db.page.update({where:{crawlId_url:{crawlId,url:page.url}},data:{redirectChain:chain,error:loop?turkish('m218'):null}});
  }
}
