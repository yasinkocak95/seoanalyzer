import { turkish } from '@seo/shared/i18n';
import type { Finding, PageInput, SiteContext } from "./types.js";
export * from "./types.js";
const TITLE_MIN = 30,
  TITLE_MAX = 60,
  DESCRIPTION_MIN = 70,
  DESCRIPTION_MAX = 160,
  THIN_WORDS = 200;
const chars = (s: string | null | undefined) => [...(s?.trim() ?? "")].length;
const words = (s: string | null | undefined) =>
  s?.split(/\s+/).filter(Boolean).length ?? 0;
// responseKind verilmemişse eski çağrılarla uyum için HTML kabul edilir.
const okHtml = (x: PageInput) =>
  !!x.statusCode && x.statusCode >= 200 && x.statusCode < 300 && (x.responseKind ?? "HTML") === "HTML";
const catalog: Record<string, [string, string, string]> = {
  HTTP_ERROR: [
    turkish("m356"),
    turkish("m231"),
    turkish("m232"),
  ],
  REDIRECT_CHAIN: [
    turkish("m233"),
    turkish("m234"),
    turkish("m235"),
  ],
  ROBOTS_UNAVAILABLE: [
    turkish("m178"),
    turkish("m179"),
    turkish("m180"),
  ],
  NOINDEX: [
    turkish("m357"),
    turkish("m236"),
    turkish("m237"),
  ],
  NOFOLLOW: [
    turkish("m238"),
    turkish("m239"),
    turkish("m240"),
  ],
  TITLE_MISSING: [
    turkish("m241"),
    turkish("m242"),
    turkish("m243"),
  ],
  DESCRIPTION_MISSING: [
    turkish("m244"),
    turkish("m245"),
    turkish("m246"),
  ],
  H1_MISSING: [
    turkish("m247"),
    turkish("m248"),
    turkish("m249"),
  ],
  MULTIPLE_H1: [
    turkish("m250"),
    turkish("m251"),
    turkish("m252"),
  ],
  HEADING_ORDER: [
    turkish("m253"),
    turkish("m254"),
    turkish("m255"),
  ],
  CANONICAL_MISSING: [
    turkish("m358"),
    turkish("m256"),
    turkish("m257"),
  ],
  CANONICAL_MULTIPLE: [
    turkish("m258"),
    turkish("m359"),
    turkish("m259"),
  ],
  CANONICAL_UNREACHABLE: [
    turkish("m182"),
    turkish("m260"),
    turkish("m184"),
  ],
  SITEMAP_CANONICAL_MISMATCH: [
    turkish("m185"),
    turkish("m186"),
    turkish("m187"),
  ],
  BROKEN_INTERNAL_LINK: [
    turkish("m188"),
    turkish("m261"),
    turkish("m190"),
  ],
  IMAGE_ALT: [
    turkish("m262"),
    turkish("m263"),
    turkish("m264"),
  ],
  JSONLD_INVALID: [
    turkish("m265"),
    turkish("m266"),
    turkish("m267"),
  ],
  HREFLANG_RETURN_MISSING: [
    turkish("m191"),
    turkish("m268"),
    turkish("m193"),
  ],
  TITLE_TOO_SHORT: [
    turkish("m269"),
    turkish("m270", [TITLE_MIN]),
    turkish("m271"),
  ],
  TITLE_TOO_LONG: [
    turkish("m272"),
    turkish("m273", [TITLE_MAX]),
    turkish("m274"),
  ],
  DESCRIPTION_TOO_SHORT: [
    turkish("m275"),
    turkish("m276", [DESCRIPTION_MIN]),
    turkish("m277"),
  ],
  DESCRIPTION_TOO_LONG: [
    turkish("m278"),
    turkish("m279", [DESCRIPTION_MAX]),
    turkish("m280"),
  ],
  THIN_CONTENT: [
    turkish("m281"),
    turkish("m282", [THIN_WORDS]),
    turkish("m283"),
  ],
  MIXED_CONTENT: [
    turkish("m360"),
    turkish("m284"),
    turkish("m285"),
  ],
  LANG_MISSING: [
    turkish("m286"),
    turkish("m287"),
    turkish("m288"),
  ],
  VIEWPORT_MISSING: [
    turkish("m289"),
    turkish("m290"),
    turkish("m363"),
  ],
  OPEN_GRAPH_MISSING: [
    turkish("m361"),
    turkish("m291"),
    turkish("m292"),
  ],
  TWITTER_CARD_MISSING: [
    turkish("m362"),
    turkish("m293"),
    turkish("m364"),
  ],
  SITEMAP_MISSING: [
    turkish("m294"),
    turkish("m295"),
    turkish("m296"),
  ],
  BROKEN_IMAGE: [
    turkish("m297"),
    turkish("m298"),
    turkish("m299"),
  ],
};
/** Uygulanan tüm kurallar; "Kontrol edildi, sorun yok" listesi bundan üretilir. */
export const RULE_CATALOG: { code: string; title: string }[] = [
  ...Object.entries(catalog).map(([code, [title]]) => ({ code, title })),
  { code: "DUPLICATE_TITLE", title: turkish("m171") },
  { code: "DUPLICATE_DESCRIPTION", title: turkish("m173") },
  { code: "DUPLICATE_CONTENT", title: turkish("m175") },
  { code: "SITEMAP_URL_UNCRAWLED", title: turkish("m194") },
  { code: "POSSIBLE_ORPHAN", title: turkish("m197") },
];
/** Sitemap bulunamazsa anlamsız kalan, bu yüzden "sorun yok" sayılmaması gereken kurallar. */
export const SITEMAP_RULES = [
  "SITEMAP_CANONICAL_MISMATCH",
  "SITEMAP_URL_UNCRAWLED",
  "POSSIBLE_ORPHAN",
];
const SITE_LEVEL = new Set(["SITEMAP_MISSING", "ROBOTS_UNAVAILABLE"]);
const WEIGHT = { CRITICAL: 15, WARNING: 6, INFO: 1 } as const;
/**
 * 0–100 arası SEO puanı. Her kural bir kez sayılır (aynı kuralın parçalı kayıtları
 * birleştirilir). Ceza, önem ağırlığının %40'ı sabit + %60'ı etkilenen HTML sayfa
 * oranıyla orantılıdır; site geneli kurallar tam oranla sayılır.
 */
export function scoreFindings(
  findings: Pick<Finding, "code" | "severity" | "affectedUrls">[],
  htmlPages: number,
) {
  const byCode = new Map<string, { severity: Finding["severity"]; urls: Set<string> }>();
  for (const f of findings) {
    const g = byCode.get(f.code) ?? { severity: f.severity, urls: new Set<string>() };
    for (const u of f.affectedUrls) g.urls.add(u);
    byCode.set(f.code, g);
  }
  let penalty = 0;
  for (const [code, g] of byCode) {
    const ratio = SITE_LEVEL.has(code)
      ? 1
      : Math.min(1, g.urls.size / Math.max(1, htmlPages));
    penalty += WEIGHT[g.severity] * (0.4 + 0.6 * ratio);
  }
  return Math.max(0, Math.round(100 - penalty));
}
const make = (
  code: string,
  severity: Finding["severity"],
  rows: { url: string; evidence: Record<string, unknown> }[],
): Finding => {
  const [t, d, r] = catalog[code];
  return {
    code,
    severity,
    title: t,
    description: d,
    recommendation: r,
    affectedUrls: [...new Set(rows.map((x) => x.url))],
    evidence: rows.map((x) => ({ url: x.url, ...x.evidence })),
  };
};
const groups = (
  ps: PageInput[],
  pick: (p: PageInput) => string | null | undefined,
) => {
  const m = new Map<string, PageInput[]>();
  for (const p of ps) {
    if (!okHtml(p) || p.error)
      continue;
    const v = pick(p)?.trim().toLocaleLowerCase("tr-TR");
    if (v) m.set(v, [...(m.get(v) ?? []), p]);
  }
  return [...m.entries()].filter((x) => x[1].length > 1);
};
export function runRules(c: SiteContext) {
  const out: Finding[] = [];
  const p = c.pages,
    by = new Map(p.map((x) => [x.url, x]));
  const collect = (
    code: string,
    s: Finding["severity"],
    filter: (x: PageInput) => boolean,
    evidence: (x: PageInput) => Record<string, unknown>,
  ) => {
    const rows = p
      .filter(filter)
      .map((x) => ({ url: x.url, evidence: evidence(x) }));
    if (rows.length) out.push(make(code, s, rows));
  };
  collect(
    "HTTP_ERROR",
    "CRITICAL",
    (x) => !!x.error || (x.statusCode ?? 0) >= 400,
    (x) => ({ durum: x.statusCode ?? turkish("m300"), hata: x.error }),
  );
  collect(
    "REDIRECT_CHAIN",
    "WARNING",
    (x) => (x.redirectChain?.length ?? 0) > 2,
    (x) => ({ zincir: x.redirectChain }),
  );
  collect(
    "NOINDEX",
    "INFO",
    (x) => /noindex/i.test(`${x.robots},${x.xRobots}`),
    (x) => ({ metaRobots: x.robots, xRobotsTag: x.xRobots }),
  );
  collect(
    "NOFOLLOW",
    "INFO",
    (x) => /nofollow/i.test(`${x.robots},${x.xRobots}`),
    (x) => ({ metaRobots: x.robots, xRobotsTag: x.xRobots }),
  );
  collect(
    "TITLE_MISSING",
    "WARNING",
    (x) => okHtml(x) &&!x.title?.trim(),
    (x) => ({ deger: x.title ?? null }),
  );
  collect(
    "DESCRIPTION_MISSING",
    "WARNING",
    (x) => okHtml(x) &&!x.description?.trim(),
    (x) => ({ deger: x.description ?? null }),
  );
  collect(
    "H1_MISSING",
    "WARNING",
    (x) => okHtml(x) &&!x.h1?.filter(Boolean).length,
    (x) => ({ h1Sayisi: 0 }),
  );
  collect(
    "MULTIPLE_H1",
    "INFO",
    (x) => (x.h1?.filter(Boolean).length ?? 0) > 1,
    (x) => ({ basliklar: x.h1 }),
  );
  collect(
    "TITLE_TOO_SHORT",
    "INFO",
    (x) => okHtml(x) && chars(x.title) > 0 && chars(x.title) < TITLE_MIN,
    (x) => ({ deger: x.title, uzunluk: chars(x.title) }),
  );
  collect(
    "TITLE_TOO_LONG",
    "WARNING",
    (x) => okHtml(x) && chars(x.title) > TITLE_MAX,
    (x) => ({ deger: x.title, uzunluk: chars(x.title) }),
  );
  collect(
    "DESCRIPTION_TOO_SHORT",
    "INFO",
    (x) =>
      okHtml(x) &&
      chars(x.description) > 0 &&
      chars(x.description) < DESCRIPTION_MIN,
    (x) => ({ deger: x.description, uzunluk: chars(x.description) }),
  );
  collect(
    "DESCRIPTION_TOO_LONG",
    "INFO",
    (x) => okHtml(x) && chars(x.description) > DESCRIPTION_MAX,
    (x) => ({ deger: x.description, uzunluk: chars(x.description) }),
  );
  collect(
    "THIN_CONTENT",
    "WARNING",
    // Metni hiç kaydedilmemiş sayfalar (eski taramalar) yanlışlıkla işaretlenmesin.
    (x) =>
      okHtml(x) && x.textContent != null && words(x.textContent) < THIN_WORDS,
    (x) => ({ kelimeSayisi: words(x.textContent) }),
  );
  collect(
    "MIXED_CONTENT",
    "WARNING",
    (x) => x.url.startsWith("https:") && !!x.mixedContent?.length,
    (x) => ({ httpKaynaklar: x.mixedContent }),
  );
  // Aşağıdaki etiket kuralları yalnızca bu alanları toplayan taramalarda çalışır.
  collect(
    "LANG_MISSING",
    "WARNING",
    (x) => okHtml(x) && x.lang !== undefined && !x.lang?.trim(),
    () => ({ lang: null }),
  );
  collect(
    "VIEWPORT_MISSING",
    "WARNING",
    (x) => okHtml(x) && x.viewport !== undefined && !x.viewport?.trim(),
    () => ({ viewport: null }),
  );
  const ogMissing = (x: PageInput) =>
    (
      [
        ["og:title", x.socialTags?.ogTitle],
        ["og:description", x.socialTags?.ogDescription],
        ["og:image", x.socialTags?.ogImage],
      ] as const
    )
      .filter(([, v]) => !v?.trim())
      .map(([k]) => k);
  collect(
    "OPEN_GRAPH_MISSING",
    "INFO",
    (x) => okHtml(x) && !!x.socialTags && ogMissing(x).length > 0,
    (x) => ({ eksikEtiketler: ogMissing(x) }),
  );
  collect(
    "TWITTER_CARD_MISSING",
    "INFO",
    (x) => okHtml(x) && !!x.socialTags && !x.socialTags.twitterCard?.trim(),
    () => ({ twitterCard: null }),
  );
  const brokenMap = c.brokenImages ?? {};
  const brokenImgs = p.flatMap((x) =>
    [...new Set((x.images ?? []).map((i) => i.src))]
      .filter((src) => src in brokenMap)
      .map((src) => ({ url: x.url, evidence: { gorsel: src, durum: brokenMap[src] } })),
  );
  if (brokenImgs.length) out.push(make("BROKEN_IMAGE", "WARNING", brokenImgs));
  collect(
    "HEADING_ORDER",
    "WARNING",
    (x) =>
      !!x.headings?.some((h, i, a) => i > 0 && h.level - a[i - 1].level > 1),
    (x) => ({ basliklar: x.headings }),
  );
  collect(
    "CANONICAL_MISSING",
    "WARNING",
    (x) => okHtml(x) &&!x.canonical,
    (x) => ({ canonical: null }),
  );
  collect(
    "CANONICAL_MULTIPLE",
    "CRITICAL",
    (x) => (x.canonicalCount ?? 0) > 1,
    (x) => ({ canonicalSayisi: x.canonicalCount }),
  );
  collect(
    "CANONICAL_UNREACHABLE",
    "CRITICAL",
    (x) =>
      okHtml(x) && !!x.canonical &&
      by.has(x.canonical) &&
      !okHtml(by.get(x.canonical)!),
    (x) => ({
      canonical: x.canonical,
      hedefDurumu: by.get(x.canonical!)?.statusCode,
    }),
  );
  collect(
    "SITEMAP_CANONICAL_MISMATCH",
    "WARNING",
    (x) =>
      c.sitemapUrls.includes(x.url) && !!x.canonical && x.canonical !== x.url,
    (x) => ({ canonical: x.canonical }),
  );
  const broken = [];
  for (const x of p)
    for (const l of x.links ?? [])
      if (
        l.internal &&
        by.has(l.url) &&
        (by.get(l.url)?.statusCode ?? 0) >= 400
      )
        broken.push({
          url: x.url,
          evidence: { hedef: l.url, baglantiMetni: l.text },
        });
  if (broken.length) out.push(make("BROKEN_INTERNAL_LINK", "CRITICAL", broken));
  const imgs = p.flatMap((x) =>
    (x.images ?? [])
      .filter((i) => !i.decorative && (!i.alt || !i.alt.trim()))
      .map((i) => ({ url: x.url, evidence: { gorsel: i.src, alt: i.alt } })),
  );
  if (imgs.length) out.push(make("IMAGE_ALT", "WARNING", imgs));
  const json = p.flatMap((x) =>
    (x.jsonLd ?? [])
      .filter((j) => !j.valid)
      .map((j) => ({
        url: x.url,
        evidence: { hata: j.error, ornek: j.raw.slice(0, 160) },
      })),
  );
  if (json.length) out.push(make("JSONLD_INVALID", "WARNING", json));
  for (const [code, title, pick] of [
    ["DUPLICATE_TITLE", turkish("m171"), (x: PageInput) => x.title],
    [
      "DUPLICATE_DESCRIPTION",
      turkish("m173"),
      (x: PageInput) => x.description,
    ],
  ] as const)
    for (const [value, ps] of groups(p, pick))
      out.push({
        code,
        severity: "WARNING",
        title,
        description: turkish("m301"),
        recommendation: turkish("m302"),
        affectedUrls: ps.map((x) => x.url),
        evidence: ps.map((x) => ({ url: x.url, deger: value })),
      });
  for (const [, ps] of groups(p, (x) => x.contentHash))
    out.push({
      code: "DUPLICATE_CONTENT",
      severity: "WARNING",
      title: turkish("m175"),
      description:
        turkish("m303"),
      recommendation:
        turkish("m304"),
      affectedUrls: ps.map((x) => x.url),
      evidence: ps.map((x) => ({ url: x.url, icerikOzeti: x.contentHash })),
    });
  const missing = c.sitemapUrls.filter((u) => !by.has(u));
  if (missing.length)
    out.push({
      code: "SITEMAP_URL_UNCRAWLED",
      severity: "WARNING",
      title: turkish("m194"),
      description: turkish("m305"),
      recommendation: turkish("m306"),
      affectedUrls: missing,
      evidence: missing.map((url) => ({ url })),
    });
  const linked = new Set(
    p.flatMap((x) =>
      (x.links ?? []).filter((l) => l.internal).map((l) => l.url),
    ),
  );
  const orphan = c.sitemapUrls.filter(
    (u) => by.has(u) && u !== p[0]?.url && !linked.has(u),
  );
  if (orphan.length)
    out.push({
      code: "POSSIBLE_ORPHAN",
      severity: "WARNING",
      title: turkish("m197"),
      description: turkish("m307", [c.crawlLimited ? turkish("m308") : ""]),
      recommendation:
        turkish("m309"),
      affectedUrls: orphan,
      evidence: orphan.map((url) => ({
        url,
        not: turkish("m201"),
      })),
    });
  for (const x of p)
    for (const h of x.hreflangs ?? []) {
      const target = by.get(h.url);
      if (target && okHtml(target) && !target.hreflangs?.some((b) => b.url === x.url))
        out.push(
          make("HREFLANG_RETURN_MISSING", "WARNING", [
            { url: x.url, evidence: { dil: h.lang, hedef: h.url } },
          ]),
        );
    }
  if (c.sitemapFound === false)
    out.push(
      make("SITEMAP_MISSING", "WARNING", [
        { url: c.robotsUrl.replace(/robots\.txt$/, "sitemap.xml"), evidence: { durum: turkish("m310") } },
      ]),
    );
  if (!c.robotsAccessible)
    out.push(
      make("ROBOTS_UNAVAILABLE", "WARNING", [
        { url: c.robotsUrl, evidence: { durum: turkish("m311") } },
      ]),
    );
  return out;
}
