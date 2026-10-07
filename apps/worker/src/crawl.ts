import { turkish } from '@seo/shared/i18n';
import type { CheerioRoot } from "crawlee";
import { CheerioCrawler, RequestQueue } from "crawlee";
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { db } from "@seo/db";
import { assertSafeUrl, isSameSite, normalizeUrl, safeLookup } from "@seo/shared";
import { limitedText, safeFetch } from "./fetch-safe.js";
import { analyzeStoredPages } from "./analysis.js";
import { TemplateSampler } from "./sampler.js";
const batchSize = Number(process.env.CRAWL_BATCH_SIZE ?? 25),
  maxDepth = Number(process.env.MAX_DEPTH ?? 12),
  delay = Number(process.env.REQUEST_DELAY_MS ?? 500),
  maxDurationMs =
    Number(process.env.MAX_CRAWL_DURATION_SECONDS ?? 21600) * 1000,
  maxSitemapFiles = Number(process.env.MAX_SITEMAP_FILES ?? 50),
  retries = Number(process.env.CRAWL_MAX_RETRIES ?? 2);
const hash = (s: string) =>
  s.length > 100
    ? createHash("sha256").update(s.toLocaleLowerCase("tr-TR")).digest("hex")
    : undefined;
export function normalizeCrawlUrl(input: string) {
  const u = new URL(normalizeUrl(input));
  for (const k of [...u.searchParams.keys()])
    if (/^(utm_.+|fbclid|gclid|yclid|mc_cid|mc_eid)$/i.test(k))
      u.searchParams.delete(k);
  u.searchParams.sort();
  return u.toString();
}
export function crawlTrapReason(input: string, depth: number) {
  const u = new URL(input),
    keys = [...u.searchParams.keys()],
    values = [...u.searchParams.values()],
    segments = u.pathname.split("/").filter(Boolean);
  if (depth > maxDepth) return turkish("m202");
  if (keys.length > 12) return turkish("m203");
  if ([...u.searchParams].some(([key,value]) => /^(offset|page|start|skip)$/i.test(key) && /^\d{6,}$/.test(value)))
    return turkish("m204");
  if (
    segments.length > 30 ||
    segments.some(
      (s, i) => i > 3 && segments.slice(0, i).filter((x) => x === s).length > 2,
    )
  )
    return turkish("m205");
  if ((u.pathname.match(/\/20\d{2}\/\d{1,2}\/\d{1,2}/g) ?? []).length > 1)
    return turkish("m206");
  return null;
}
/**
 * Başarısız istek mesajından HTTP durum kodunu çıkarır. Mesajlar üç kaynaktan gelir:
 * kendi işleyicimiz ("HTTP 404"), Crawlee'nin 5xx hatası ("503 - ...") ve
 * engellenen istek hatası ("... received 403 status code"). Bağlantı hatalarında null döner.
 */
export function errorStatus(message: string) {
  const m = message.match(
    /^HTTP (\d{3})\b|^(\d{3}) - |received (\d{3}) status code/,
  );
  return m ? Number(m[1] ?? m[2] ?? m[3]) : null;
}
/**
 * Sayfa türünü ayırt etmek için yapı imzası: içerik alanında en sık geçen CSS
 * sınıfları, JSON-LD türleri ve og:type. Site genelinde ortak olan başlık, menü ve
 * alt bilgi dışarıda bırakılır; aksi halde tüm sayfalar birbirine benzer görünür.
 */
function structureSignature(
  $: CheerioRoot,
  jsonLd: { raw: string; valid: boolean }[],
) {
  const root = ($("main").length ? $("main") : $("body")).first().clone();
  root.find("header,footer,nav,aside,script,style,noscript,template").remove();
  const freq = new Map<string, number>();
  root.find("[class]").each((_, e) => {
    for (const c of ($(e).attr("class") ?? "").split(/\s+/))
      // Sayı içeren sınıflar genellikle sayfaya özeldir (post-123 gibi) ve türü ayırt etmez.
      if (c && c.length <= 40 && !/\d/.test(c)) freq.set(c, (freq.get(c) ?? 0) + 1);
  });
  const tokens = [...freq]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([c]) => c);
  for (const j of jsonLd)
    if (j.valid)
      try {
        const walk = (v: unknown): void => {
          if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === "object") {
            const t = (v as Record<string, unknown>)["@type"];
            for (const x of Array.isArray(t) ? t : [t]) if (typeof x === "string") tokens.push(`ld:${x}`);
            walk((v as Record<string, unknown>)["@graph"]);
          }
        };
        walk(JSON.parse(j.raw));
      } catch {}
  const og = $('meta[property="og:type" i]').attr("content");
  if (og) tokens.push(`og:${og.trim().toLowerCase()}`);
  return [...new Set(tokens)];
}
const absolute = (v: string | undefined, b: string) => {
  try {
    return v ? normalizeCrawlUrl(new URL(v, b).toString()) : undefined;
  } catch {
    return undefined;
  }
};
export function robotsAllows(text:string,path:string) {
  const groups:{agents:string[];rules:{allow:boolean;path:string}[]}[]=[];
  let group={agents:[] as string[],rules:[] as {allow:boolean;path:string}[]};
  for (const raw of text.split(/\r?\n/)) {
    const line=raw.split('#')[0].trim(), colon=line.indexOf(':');
    if (colon<0) continue;
    const key=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim();
    if (key==='user-agent') {
      if(group.rules.length){groups.push(group);group={agents:[],rules:[]};}
      group.agents.push(value.toLowerCase());
    } else if (group.agents.length && ['allow','disallow'].includes(key) && value) group.rules.push({allow:key==='allow',path:value});
  }
  groups.push(group);
  const specific=groups.filter(g=>g.agents.includes('seo-denetim'));
  const applicable=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
  let best:{allow:boolean;length:number}|undefined;
  for(const rule of applicable.flatMap(g=>g.rules)) {
    const end=rule.path.endsWith('$'),value=end?rule.path.slice(0,-1):rule.path;
    const pattern='^'+value.split('*').map(v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+(end?'$':'');
    const length=value.replace(/\*/g,'').length;
    if(new RegExp(pattern).test(path) && (!best || length>best.length || length===best.length && rule.allow)) best={allow:rule.allow,length};
  }
  return !best || best.allow;
}
async function sitemaps(root: URL, robots: string) {
  const declared = robots
      .split(/\r?\n/)
      .map((x) => x.match(/^\s*sitemap\s*:\s*(.+)/i)?.[1]?.trim())
      .filter(Boolean) as string[],
    urls = new Set<string>();
  const list = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []);
  const locOf = (item: unknown) =>
    typeof item === "string"
      ? item
      : (item as { loc?: unknown } | null)?.loc?.toString();
  // Sitemap index dosyaları alt sitemap'lere işaret eder; kuyruk bunları da işler.
  const queue = [
      ...new Set([...declared, new URL("/sitemap.xml", root).toString()]),
    ],
    seen = new Set(queue);
  let found = false,
    fetched = 0;
  while (queue.length && fetched < maxSitemapFiles) {
    const candidate = queue.shift()!;
    fetched++;
    try {
      const { response } = await safeFetch(candidate);
      if (!response.ok) continue;
      const xml = new XMLParser().parse(await limitedText(response));
      if (xml?.urlset) {
        found = true;
        for (const item of list(xml.urlset.url)) {
          const loc = locOf(item);
          if (loc && isSameSite(loc, root.toString()))
            urls.add(normalizeCrawlUrl(loc));
        }
      } else if (xml?.sitemapindex) {
        found = true;
        for (const item of list(xml.sitemapindex.sitemap)) {
          const loc = locOf(item);
          if (loc && !seen.has(loc)) {
            seen.add(loc);
            queue.push(loc);
          }
        }
      }
    } catch {}
  }
  return { urls: [...urls], found };
}
async function discover(
  crawlId: string,
  values: Array<{
    url: string;
    depth: number;
    sourceUrl?: string;
    fromSitemap?: boolean;
    linked?: boolean;
  }>,
  robots: string,
  sampler?: TemplateSampler,
) {
  for (const v of values) {
    const normalized = normalizeCrawlUrl(v.url),
      reason = crawlTrapReason(normalized, v.depth);
    if (reason) {
      await db.crawlUrl.upsert({
        where: { crawlId_normalized: { crawlId, normalized } },
        create: {
          crawlId,
          url: v.url,
          normalized,
          depth: v.depth,
          sourceUrl: v.sourceUrl,
          status: "EXCLUDED",
          lastError: reason,
        },
        update: {},
      });
      continue;
    }
    if (!robotsAllows(robots, new URL(normalized).pathname+new URL(normalized).search)) {
      await db.crawlUrl.upsert({
        where: { crawlId_normalized: { crawlId, normalized } },
        create: {
          crawlId,
          url: v.url,
          normalized,
          depth: v.depth,
          sourceUrl: v.sourceUrl,
          status: "EXCLUDED",
          lastError: turkish("m207"),
        },
        update: {},
      });
      continue;
    }
    // Örneklemeli taramada yeni URL'nin şablonu ve kuyruğa girip girmeyeceği belirlenir.
    const assigned = sampler ? await sampler.assign(normalized) : null;
    await db.crawlUrl.upsert({
      where: { crawlId_normalized: { crawlId, normalized } },
      create: {
        crawlId,
        url: v.url,
        normalized,
        depth: v.depth,
        sourceUrl: v.sourceUrl,
        fromSitemap: v.fromSitemap ?? false,
        linked: v.linked ?? false,
        template: assigned?.template ?? null,
        status: assigned?.status ?? "DISCOVERED",
      },
      update: {
        linked: v.linked ? true : undefined,
        fromSitemap: v.fromSitemap ? true : undefined,
      },
    });
  }
}
async function counts(crawlId: string) {
  const [d, ing, done, errors, excluded, skipped, html, redirects] = await Promise.all(
    ["DISCOVERED", "PROCESSING", "PROCESSED", "ERROR", "EXCLUDED", "SKIPPED"]
      .map((status) =>
        db.crawlUrl.count({ where: { crawlId, status: status as never } }),
      )
      .concat([
        db.page.count({
          where: {
            crawlId,
            responseKind: "HTML",
            statusCode: { gte: 200, lt: 300 },
          },
        }),
        db.page.count({ where: { crawlId, responseKind: "REDIRECT" } }),
      ]),
  );
  await db.crawl.update({
    where: { id: crawlId },
    data: {
      discoveredPages: d + ing + done + errors + excluded + skipped,
      progress: Math.min(99,Math.floor((done+errors)/Math.max(1,d+ing+done+errors)*100)),
      skippedUrls: skipped,
      processedPages: done + errors,
      pendingUrls: d + ing,
      errorUrls: errors,
      analyzedHtmlPages: html,
      redirectCount: redirects,
      statusMessage: turkish("m208", [done + errors, d + ing, skipped ? turkish("m209", [skipped]) : ""]),
    },
  });
}
export async function executeCrawl(crawlId: string, rootInput: string, recoverRunning=false) {
  const root = await assertSafeUrl(rootInput),
    started = Date.now(),
    robotsUrl = new URL("/robots.txt", root).toString();
  const claimed = await db.crawl.updateMany({
    where: { id: crawlId, status: { in: recoverRunning ? ["QUEUED", "PARTIAL", "RUNNING"] : ["QUEUED", "PARTIAL"] } },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      completedAt: null,
      partialReason: null,
      statusMessage: turkish("m355"),
      error: null,
    },
  });
  // Aynı tarama için eski ve yeni BullMQ işleri çakışırsa yalnızca biri ilerler.
  if (claimed.count !== 1) return;
  await db.crawlUrl.updateMany({
    where: { crawlId, status: "PROCESSING" },
    data: { status: "DISCOVERED" },
  });
  const { fullCrawl } = await db.crawl.findUniqueOrThrow({
    where: { id: crawlId },
    select: { fullCrawl: true },
  });
  // Tam taramada her URL analiz edilir; aksi halde tekrar eden şablonlardan örnek alınır.
  const sampler = fullCrawl ? undefined : new TemplateSampler(crawlId);
  await sampler?.load();
  let robots = "",
    robotsOk = false;
  try {
    const r = await safeFetch(robotsUrl);
    robotsOk = r.response.ok;
    if (robotsOk) robots = await limitedText(r.response);
  } catch {}
  const sitemap = await sitemaps(root, robots);
  await discover(
    crawlId,
    [
      { url: root.toString(), depth: 0 },
      ...sitemap.urls.map((url) => ({
        url,
        depth: 0,
        fromSitemap: true,
      })),
    ],
    robots,
    sampler,
  );
  let batchNo = 0;
  while (true) {
    const state = await db.crawl.findUniqueOrThrow({
      where: { id: crawlId },
      select: { status: true },
    });
    if (state.status === "PAUSED") {
      await counts(crawlId);
      return;
    }
    if (Date.now() - started > maxDurationMs) {
      await counts(crawlId);
      await analyzeStoredPages(crawlId, robotsOk, robotsUrl, true, sitemap.found);
      await db.crawl.updateMany({
        where: { id: crawlId, status: "RUNNING" },
        data: {
          status: "PARTIAL",
          partialReason: turkish("m210"),
          statusMessage:
            turkish("m211"),
        },
      });
      return;
    }
    // Örnekleri biten şablonlar değerlendirilir; yapısı karışık çıkanların atlanan URL'leri kuyruğa döner.
    await sampler?.review();
    const batch = await db.crawlUrl.findMany({
      where: { crawlId, status: "DISCOVERED" },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });
    if (!batch.length) break;
    await db.crawlUrl.updateMany({
      where: { id: { in: batch.map((x) => x.id) }, status: "DISCOVERED" },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    const queue = await RequestQueue.open(
      `crawl-${crawlId}-${Date.now()}-${batchNo++}`,
    );
    for (const item of batch)
      await queue.addRequest({
        url: item.normalized,
        uniqueKey: item.normalized,
        userData: { crawlUrlId: item.id, depth: item.depth },
      });
    let last = 0;
    const crawler = new CheerioCrawler({
      requestQueue: queue,
      maxRequestsPerCrawl: batch.length,
      maxConcurrency: Number(process.env.CRAWL_CONCURRENCY ?? 2),
      // Bağlantı kopması, zaman aşımı, 5xx ve 429 gibi geçici hatalar yeniden denenir;
      // kalıcı 4xx yanıtları requestHandler içinde noRetry ile hemen kaydedilir.
      maxRequestRetries: retries,
      additionalMimeTypes: ['*/*'],
      ignoreHttpErrorStatusCodes: Array.from({length:100},(_,i)=>400+i).filter(x=>![408,429].includes(x)),
      requestHandlerTimeoutSecs: 25,
      navigationTimeoutSecs: Math.max(1,Number(process.env.REQUEST_TIMEOUT_MS??15000)/1000),
      preNavigationHooks: [
        async ({ request }, options) => {
          await assertSafeUrl(request.url);
          // Sunucu yük nedeniyle reddettiyse her denemede biraz daha uzun beklenir.
          const backoff = request.retryCount * 2000;
          const wait = Math.max(backoff, delay - (Date.now() - last));
          if (wait) await new Promise((r) => setTimeout(r, wait));
          last = Date.now();
          options.followRedirect = false;
          options.maxRedirects = 0;
          // HTTP/2'de sunucular eş zamanlı akışları REFUSED_STREAM ile reddedebiliyor;
          // HTTP/1.1 her istek için ayrı bağlantı kullandığından bu sorunu yaşamaz.
          options.http2 = false;
          options.dnsLookup = safeLookup;
          options.timeout = { request: Number(process.env.REQUEST_TIMEOUT_MS ?? 15000) };
        },
      ],
      postNavigationHooks: [async ({ response }) => {
        const max=Number(process.env.MAX_RESPONSE_BYTES??5242880);
        if (Number(response.headers['content-length']??0)>max) {
          response.destroy();
          throw new Error(turkish('m220'));
        }
        let bytes=0;
        response.on('data', chunk => {
          bytes+=Buffer.byteLength(chunk);
          if (bytes>max) response.destroy(new Error(turkish('m220')));
        });
      }],
      async requestHandler({ request, response, $ }) {
        const url = normalizeCrawlUrl(request.url),
          status = response?.statusCode ?? null,
          type = String(response?.headers["content-type"] ?? "").toLowerCase();
        if (status && status >= 300 && status < 400) {
          const location = String(response?.headers.location ?? ""),
            target = location ? absolute(location, url) : undefined;
          if (target) {
            try { await assertSafeUrl(target); } catch (error) { request.noRetry=true; throw error; }
            if (isSameSite(target, root.toString()))
              await discover(
                crawlId,
                [
                  {
                    url: target,
                    depth: Number(request.userData.depth) + 1,
                    sourceUrl: url,
                    linked: true,
                  },
                ],
                robots,
                sampler,
              );
          }
          await db.page.upsert({
            where: { crawlId_url: { crawlId, url } },
            create: {
              crawlId,
              url,
              statusCode: status,
              contentType: type,
              responseKind: "REDIRECT",
              redirectTarget: target,
              redirectChain: target ? [url, target] : [url],
            },
            update: {
              statusCode: status,
              contentType: type,
              responseKind: "REDIRECT",
              redirectTarget: target,
              redirectChain: target ? [url, target] : [url],
              title: null,
              description: null,
              h1: [],
              headings: [],
              images: [],
              textContent: null,
              contentHash: null,
              links: [],
              hreflangs: [],
              jsonLd: [],
              mixedContent: [],
            },
          });
          await db.crawlUrl.update({
            where: { id: request.userData.crawlUrlId },
            data: { status: "PROCESSED" },
          });
          return;
        }
        if (!status || status < 200 || status >= 300) {
          if (status && status >= 400 && status < 500 && ![408, 429].includes(status))
            request.noRetry = true;
          throw new Error(`HTTP ${status ?? turkish("m212")}`);
        }
        if (!type.includes("text/html") || !$) {
          await db.page.upsert({
            where: { crawlId_url: { crawlId, url } },
            create: {
              crawlId,
              url,
              statusCode: status,
              contentType: type,
              responseKind: "NON_HTML",
              title: null,
              description: null,
              h1: [],
              headings: [],
              images: [],
              textContent: null,
              contentHash: null,
              links: [],
              hreflangs: [],
              jsonLd: [],
              mixedContent: [],
            },
            update: {
              statusCode: status,
              contentType: type,
              responseKind: "NON_HTML",
              title: null,
              description: null,
              h1: [],
              headings: [],
              images: [],
              textContent: null,
              contentHash: null,
              links: [],
              hreflangs: [],
              jsonLd: [],
              mixedContent: [],
            },
          });
          await db.crawlUrl.update({
            where: { id: request.userData.crawlUrlId },
            data: { status: "PROCESSED" },
          });
          return;
        }
        const title = $("title").first().text().trim(),
          description = $('meta[name="description" i]').attr("content")?.trim(),
          canonical = absolute(
            $('link[rel="canonical" i]').first().attr("href"),
            url,
          ),
          meta = $('meta[name="robots" i]').attr("content"),
          xrobots = String(response?.headers["x-robots-tag"] ?? ""),
          h1 = $("h1")
            .map((_, e) => $(e).text().trim())
            .get(),
          headings = $("h1,h2,h3,h4,h5,h6")
            .map((_, e) => ({
              level: Number(e.tagName.slice(1)),
              text: $(e).text().trim(),
            }))
            .get(),
          images = $("img")
            .map((_, e) => ({
              src: absolute($(e).attr("src"), url) ?? $(e).attr("src") ?? "",
              alt: $(e).attr("alt") ?? null,
              decorative:
                $(e).attr("role") === "presentation" ||
                $(e).attr("aria-hidden") === "true",
            }))
            .get(),
          text = $("main,article,body")
            .first()
            .clone()
            .find("script,style,noscript,template")
            .remove()
            .end()
            // Boşluksuz HTML'de bitişik bloklardaki kelimeler birleşmesin.
            .find(
              "p,div,li,h1,h2,h3,h4,h5,h6,br,td,th,dt,dd,section,article,header,footer,nav,aside,blockquote,figcaption,a,button,label,option",
            )
            .after(" ")
            .end()
            .text()
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 100000),
          links = $("a[href]")
            .map((_, e) => {
              const target = absolute($(e).attr("href"), url);
              return target
                ? {
                    url: target,
                    text: $(e).text().trim().slice(0, 120),
                    internal: isSameSite(target, root.toString()),
                  }
                : null;
            })
            .get()
            .filter(Boolean),
          hreflangs = $('link[rel="alternate"][hreflang]')
            .map((_, e) => ({
              lang: $(e).attr("hreflang")!,
              url: absolute($(e).attr("href"), url)!,
            }))
            .get()
            .filter((x) => x.url),
          jsonLd = $('script[type="application/ld+json"]')
            .map((_, e) => {
              const raw = $(e).text();
              try {
                JSON.parse(raw);
                return { raw, valid: true };
              } catch (err) {
                return {
                  raw,
                  valid: false,
                  error: err instanceof Error ? err.message : turkish("m213"),
                };
              }
            })
            .get();
        // Boş dize "etiket yok", null ise "bu alan toplanmadı" (eski taramalar) anlamına gelir.
        const signals = {
          structure: structureSignature($, jsonLd),
          lang: $("html").attr("lang")?.trim() ?? "",
          viewport:
            $('meta[name="viewport" i]').attr("content")?.trim() ?? "",
          socialTags: {
            canonicalCount: $('link[rel="canonical" i]').length,
            ogTitle: $('meta[property="og:title" i]').attr("content") ?? null,
            ogDescription:
              $('meta[property="og:description" i]').attr("content") ?? null,
            ogImage: $('meta[property="og:image" i]').attr("content") ?? null,
            twitterCard:
              $('meta[name="twitter:card" i], meta[property="twitter:card" i]')
                .first()
                .attr("content") ?? null,
          },
          mixedContent: url.startsWith("https:")
            ? [
                ...new Set(
                  $(
                    "img[src],script[src],iframe[src],video[src],audio[src],source[src],embed[src],link[rel~='stylesheet'][href],object[data]",
                  )
                    .map((_, e) => {
                      const raw =
                        $(e).attr("src") ?? $(e).attr("href") ?? $(e).attr("data");
                      try {
                        return raw ? new URL(raw, url).toString() : null;
                      } catch {
                        return null;
                      }
                    })
                    .get()
                    .filter((x): x is string => !!x?.startsWith("http:")),
                ),
              ].slice(0, 50)
            : [],
        };
        await db.page.upsert({
          where: { crawlId_url: { crawlId, url } },
          create: {
            crawlId,
            url,
            statusCode: status,
            contentType: type,
            responseKind: "HTML",
            ...signals,
            title,
            description,
            canonical,
            robots: [meta, xrobots].filter(Boolean).join(", "),
            h1,
            headings,
            images,
            textContent: text,
            contentHash: hash(text),
            links,
            hreflangs,
            jsonLd,
            redirectChain: [],
          },
          update: {
            statusCode: status,
            contentType: type,
            responseKind: "HTML",
            ...signals,
            redirectTarget: null,
            title,
            description,
            canonical,
            robots: [meta, xrobots].filter(Boolean).join(", "),
            h1,
            headings,
            images,
            textContent: text,
            contentHash: hash(text),
            links,
            hreflangs,
            jsonLd,
            redirectChain: [],
            error: null,
          },
        });
        await discover(
          crawlId,
          [
            ...links.filter((x) => x.internal).map((x) => ({
              url: x.url,
              depth: Number(request.userData.depth) + 1,
              sourceUrl: url,
              linked: true,
            })),
            ...(canonical && isSameSite(canonical, root.toString())
              ? [{ url: canonical, depth: Number(request.userData.depth) + 1, sourceUrl: url }]
              : []),
            ...hreflangs
              .filter((x) => isSameSite(x.url, root.toString()))
              .map((x) => ({ url: x.url, depth: Number(request.userData.depth) + 1, sourceUrl: url })),
          ],
          robots,
          sampler,
        );
        await db.crawlUrl.update({
          where: { id: request.userData.crawlUrlId },
          data: { status: "PROCESSED" },
        });
      },
      async failedRequestHandler({ request }, error) {
        const url = normalizeCrawlUrl(request.url),
          statusCode = errorStatus(error.message);
        await db.page.upsert({
          where: { crawlId_url: { crawlId, url } },
          create: { crawlId, url, statusCode, responseKind: "ERROR", error: error.message },
          update: { statusCode, responseKind: "ERROR", error: error.message },
        });
        await db.crawlUrl.update({
          where: { id: request.userData.crawlUrlId },
          data: { status: "ERROR", lastError: error.message },
        });
      },
    });
    try { await crawler.run(); }
    finally { await queue.drop(); }
    await counts(crawlId);
  }
  await counts(crawlId);
  const finalState = await db.crawl.findUniqueOrThrow({ where: { id: crawlId }, select: { status: true } });
  if (finalState.status !== 'RUNNING') return;
  await analyzeStoredPages(crawlId, robotsOk, robotsUrl, false, sitemap.found);
  await db.crawl.updateMany({
    where: { id: crawlId, status: "RUNNING" },
    data: {
      status: "COMPLETED",
      progress: 100,
      completedAt: new Date(),
      partialReason: null,
      statusMessage: turkish("m214"),
    },
  });
}
