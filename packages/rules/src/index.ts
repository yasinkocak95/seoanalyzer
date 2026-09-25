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
  x.statusCode === 200 && (x.responseKind ?? "HTML") === "HTML";
const catalog: Record<string, [string, string, string]> = {
  HTTP_ERROR: [
    "Hata veren sayfa",
    "Başarılı olmayan HTTP yanıtı içeriğe erişimi engelleyebilir.",
    "Sayfayı geri yükleyin veya ilgili bağlantıları çalışan hedefe güncelleyin.",
  ],
  REDIRECT_CHAIN: [
    "Yönlendirme zinciri",
    "Adres birden fazla yönlendirmeden geçiyor.",
    "Bağlantıları ve sitemap adresini doğrudan son hedefe güncelleyin.",
  ],
  ROBOTS_UNAVAILABLE: [
    "robots.txt erişilemiyor",
    "robots.txt başarılı yanıt vermedi.",
    "Kök dizinde erişilebilir bir robots.txt sunun.",
  ],
  NOINDEX: [
    "Dizine eklememe sinyali",
    "Meta robots veya X-Robots-Tag içinde noindex bulundu.",
    "Sayfanın görünmesi amaçlanıyorsa noindex yönergesini kaldırın.",
  ],
  NOFOLLOW: [
    "Bağlantıları takip etmeme sinyali",
    "nofollow yönergesi bulundu.",
    "Site içi keşif amaçlanıyorsa nofollow yönergesini gözden geçirin.",
  ],
  TITLE_MISSING: [
    "Eksik veya boş sayfa başlığı",
    "Dolu bir title değeri yok.",
    "Sayfayı tanımlayan benzersiz bir title yazın.",
  ],
  DESCRIPTION_MISSING: [
    "Eksik veya boş meta açıklama",
    "Dolu meta description bulunamadı.",
    "İçeriği özetleyen özgün bir meta açıklama ekleyin.",
  ],
  H1_MISSING: [
    "H1 başlığı eksik",
    "Ana konuyu belirten H1 bulunamadı.",
    "Görünür içerikte açıklayıcı bir H1 kullanın.",
  ],
  MULTIPLE_H1: [
    "Birden fazla H1 kullanımı",
    "Bu tek başına kritik hata değildir; yapı gözden geçirilmelidir.",
    "Başlık hiyerarşisinin anlaşılır olduğunu doğrulayın.",
  ],
  HEADING_ORDER: [
    "Başlık hiyerarşisinde atlama",
    "Başlık seviyelerinde basamak atlanmış.",
    "Örneğin H2’den doğrudan H4’e geçmeyin.",
  ],
  CANONICAL_MISSING: [
    "Canonical etiketi eksik",
    "Tercih edilen adres belirtilmemiş.",
    "Mutlak tercih edilen URL’yi gösteren canonical ekleyin.",
  ],
  CANONICAL_MULTIPLE: [
    "Çelişkili canonical sinyali",
    "Birden fazla canonical etiketi bulundu.",
    "Tek bir tutarlı canonical etiketi bırakın.",
  ],
  CANONICAL_UNREACHABLE: [
    "Canonical hedefi erişilebilir değil",
    "Canonical hedefi başarılı yanıt vermedi.",
    "Canonical adresini çalışan tercih edilen sayfaya yönlendirin.",
  ],
  SITEMAP_CANONICAL_MISMATCH: [
    "Sitemap ve canonical tutarsız",
    "Sitemap URL’sinin canonical adresi farklı.",
    "Sitemap’e yalnızca tercih edilen canonical URL’leri ekleyin.",
  ],
  BROKEN_INTERNAL_LINK: [
    "Kırık site içi bağlantı",
    "Bağlantı hata veren hedefe gidiyor.",
    "Kaynak sayfadaki bağlantıyı çalışan hedefe güncelleyin.",
  ],
  IMAGE_ALT: [
    "Görsel alternatif metni eksik",
    "Dekoratif olmayan görselde alt eksik veya boş.",
    'Anlamlı alt metni ekleyin; dekoratif görsellerde alt="" kullanın.',
  ],
  JSONLD_INVALID: [
    "JSON-LD biçim hatası",
    "JSON-LD geçerli JSON olarak ayrıştırılamadı.",
    "JSON sözdizimini düzeltip yeniden doğrulayın.",
  ],
  HREFLANG_RETURN_MISSING: [
    "Hreflang karşılıklı bağlantısı eksik",
    "Hedefte kaynağa dönen bağlantı bulunamadı.",
    "Dil alternatiflerini geçerli URL’lerle karşılıklı bağlayın.",
  ],
  TITLE_TOO_SHORT: [
    "Sayfa başlığı çok kısa",
    `Title ${TITLE_MIN} karakterden kısa; sayfayı yeterince tanımlamıyor olabilir.`,
    "Sayfanın konusunu ve ayırt edici yönünü anlatan daha açıklayıcı bir title yazın.",
  ],
  TITLE_TOO_LONG: [
    "Sayfa başlığı çok uzun",
    `Title ${TITLE_MAX} karakterden uzun; arama sonuçlarında kesilebilir.`,
    "En önemli ifadeyi başa alıp title’ı kısaltın.",
  ],
  DESCRIPTION_TOO_SHORT: [
    "Meta açıklama çok kısa",
    `Meta açıklama ${DESCRIPTION_MIN} karakterden kısa; arama sonucunda sayfayı yeterince özetlemiyor olabilir.`,
    "İçeriği ve kullanıcıya faydasını anlatan daha dolu bir açıklama yazın.",
  ],
  DESCRIPTION_TOO_LONG: [
    "Meta açıklama çok uzun",
    `Meta açıklama ${DESCRIPTION_MAX} karakterden uzun; arama sonuçlarında kesilebilir.`,
    "Asıl mesajı ilk cümlede verip açıklamayı kısaltın.",
  ],
  THIN_CONTENT: [
    "Zayıf içerik",
    `Sayfada ${THIN_WORDS} kelimeden az metin var. Menü ve alt bilgi metinleri de sayıma dahildir.`,
    "Sayfaya kullanıcının sorusunu yanıtlayan özgün içerik ekleyin veya benzer sayfalarla birleştirin.",
  ],
  MIXED_CONTENT: [
    "HTTPS sayfada HTTP kaynak",
    "Güvenli sayfa, şifrelenmemiş HTTP üzerinden kaynak yüklüyor. Tarayıcılar bu kaynakları engelleyebilir veya güvenlik uyarısı gösterebilir.",
    "Kaynak adreslerini https:// ile değiştirin.",
  ],
  LANG_MISSING: [
    "Sayfa dili belirtilmemiş",
    "<html> etiketinde lang özniteliği yok.",
    'Sayfanın diline uygun lang değeri ekleyin, örneğin <html lang="tr">.',
  ],
  VIEWPORT_MISSING: [
    "Mobil görünüm etiketi eksik",
    "meta viewport etiketi yok; sayfa mobil cihazlarda küçültülmüş masaüstü görünümüyle açılabilir.",
    '<meta name="viewport" content="width=device-width, initial-scale=1"> ekleyin.',
  ],
  OPEN_GRAPH_MISSING: [
    "Open Graph etiketleri eksik",
    "og:title, og:description veya og:image etiketlerinden en az biri yok. Sayfa sosyal medyada paylaşıldığında önizleme eksik görünebilir.",
    "Eksik Open Graph etiketlerini sayfaya özel değerlerle ekleyin.",
  ],
  TWITTER_CARD_MISSING: [
    "Twitter/X kart etiketi eksik",
    "twitter:card etiketi yok. X, başlık ve görsel için Open Graph’a dönebilir ancak kart türünü bu etiketle belirler.",
    '<meta name="twitter:card" content="summary_large_image"> ekleyin.',
  ],
  SITEMAP_MISSING: [
    "Sitemap bulunamadı",
    "robots.txt içinde belirtilen veya /sitemap.xml adresinde okunabilir bir sitemap bulunamadı.",
    "Sitemap oluşturup kök dizinde sunun ve robots.txt içine Sitemap: satırı ekleyin.",
  ],
  BROKEN_IMAGE: [
    "Kırık görsel",
    "Sayfadaki görsel hata veriyor veya yüklenemiyor.",
    "Görseli geri yükleyin, adresini düzeltin veya sayfadan kaldırın.",
  ],
};
/** Uygulanan tüm kurallar; "Kontrol edildi, sorun yok" listesi bundan üretilir. */
export const RULE_CATALOG: { code: string; title: string }[] = [
  ...Object.entries(catalog).map(([code, [title]]) => ({ code, title })),
  { code: "DUPLICATE_TITLE", title: "Tekrarlanan sayfa başlığı" },
  { code: "DUPLICATE_DESCRIPTION", title: "Tekrarlanan meta açıklama" },
  { code: "DUPLICATE_CONTENT", title: "Birebir aynı içerik adayı" },
  { code: "SITEMAP_URL_UNCRAWLED", title: "Sitemap URL’si taranamadı" },
  { code: "POSSIBLE_ORPHAN", title: "Olası yetim sayfa" },
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
    if (!p.statusCode || p.statusCode < 200 || p.statusCode >= 300 || p.error)
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
    (x) => ({ durum: x.statusCode ?? "Yanıt alınamadı", hata: x.error }),
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
      !!x.canonical &&
      by.has(x.canonical) &&
      by.get(x.canonical)?.statusCode !== 200,
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
    ["DUPLICATE_TITLE", "Tekrarlanan sayfa başlığı", (x: PageInput) => x.title],
    [
      "DUPLICATE_DESCRIPTION",
      "Tekrarlanan meta açıklama",
      (x: PageInput) => x.description,
    ],
  ] as const)
    for (const [value, ps] of groups(p, pick))
      out.push({
        code,
        severity: "WARNING",
        title,
        description: "Aynı değer birden fazla sayfada kullanılıyor.",
        recommendation: "Her sayfa için özgün bir değer yazın.",
        affectedUrls: ps.map((x) => x.url),
        evidence: ps.map((x) => ({ url: x.url, deger: value })),
      });
  for (const [, ps] of groups(p, (x) => x.contentHash))
    out.push({
      code: "DUPLICATE_CONTENT",
      severity: "WARNING",
      title: "Birebir aynı içerik adayı",
      description:
        "Metin özeti aynı. Bu teknik bir adaydır; Google değerlendirmesi değildir.",
      recommendation:
        "Sayfaları birleştirmeyi, özgünleştirmeyi veya canonical sinyalini değerlendirin.",
      affectedUrls: ps.map((x) => x.url),
      evidence: ps.map((x) => ({ url: x.url, icerikOzeti: x.contentHash })),
    });
  const missing = c.sitemapUrls.filter((u) => !by.has(u));
  if (missing.length)
    out.push({
      code: "SITEMAP_URL_UNCRAWLED",
      severity: "WARNING",
      title: "Sitemap URL’si taranamadı",
      description: "Sitemap adresi tarama sonuçlarında bulunamadı.",
      recommendation: "Adresin erişilebilir ve kapsamda olduğunu kontrol edin.",
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
      title: "Olası yetim sayfa",
      description: `Sitemap’te var ancak taranan iç bağlantı grafiğinde referans yok.${c.crawlLimited ? " Tarama sınırlı olduğu için bu kesin değildir." : ""}`,
      recommendation:
        "Önemliyse bağlamsal iç bağlantı ekleyin; değilse sitemap gerekliliğini değerlendirin.",
      affectedUrls: orphan,
      evidence: orphan.map((url) => ({
        url,
        not: "Kesin Google dizin bilgisi değildir",
      })),
    });
  for (const x of p)
    for (const h of x.hreflangs ?? []) {
      const target = by.get(h.url);
      if (!target || !target.hreflangs?.some((b) => b.url === x.url))
        out.push(
          make("HREFLANG_RETURN_MISSING", "WARNING", [
            { url: x.url, evidence: { dil: h.lang, hedef: h.url } },
          ]),
        );
    }
  if (c.sitemapFound === false)
    out.push(
      make("SITEMAP_MISSING", "WARNING", [
        { url: c.robotsUrl.replace(/robots\.txt$/, "sitemap.xml"), evidence: { durum: "Bulunamadı" } },
      ]),
    );
  if (!c.robotsAccessible)
    out.push(
      make("ROBOTS_UNAVAILABLE", "WARNING", [
        { url: c.robotsUrl, evidence: { durum: "Erişilemedi" } },
      ]),
    );
  return out;
}
