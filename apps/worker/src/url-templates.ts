// Klasör adı kodlamadan URL şablonu çıkarır. Yol parçalarından yalnızca son parça
// değişken kabul edilir; ara parçalarda sadece ID benzeri değerler genelleştirilir.
// Böylece "/urunler/{slug}" ile "/urunler/kategori/{slug}" ayrı şablonlar olur.

const ID = /^(\d+|[0-9a-f]{12,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * URL'nin aday şablonunu döndürür. Kök seviyedeki sorgusuz adresler (örn. /hakkimizda)
 * farklı sayfa türleri olabileceği için şablona alınmaz ve null döner.
 */
export function templatePattern(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  const segs = u.pathname.split("/").filter(Boolean);
  const names = [...new Set(u.searchParams.keys())].sort();
  const generic = (s: string) => (ID.test(s) ? "{id}" : s);
  if (names.length) {
    // Sorgu değerleri içeriği değiştirebilir: aynı yol + aynı parametre adları bir şablondur,
    // yol ise değişken sayılmaz (/a?x=1 ile /b?x=1 birleşmez).
    const path = "/" + segs.map(generic).join("/");
    return `${path}?${names.map((n) => `${n}={değer}`).join("&")}`;
  }
  if (segs.length < 2) return null;
  const last = segs[segs.length - 1],
    ext = last.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? "",
    stem = ext ? last.slice(0, -ext.length) : last;
  return (
    "/" +
    [...segs.slice(0, -1).map(generic), (ID.test(stem) ? "{id}" : "{slug}") + ext].join("/")
  );
}

/** Jaccard benzerliği; iki boş küme aynı sayılır. */
function jaccard(a: string[], b: string[]) {
  const A = new Set(a),
    B = new Set(b);
  if (!A.size && !B.size) return 1;
  let common = 0;
  for (const x of A) if (B.has(x)) common++;
  return common / (A.size + B.size - common);
}

/** Örnek sayfaların yapı imzaları arasındaki en düşük ikili benzerlik. */
export function minSimilarity(signatures: string[][]) {
  let min = 1;
  for (let i = 0; i < signatures.length; i++)
    for (let j = i + 1; j < signatures.length; j++)
      min = Math.min(min, jaccard(signatures[i], signatures[j]));
  return min;
}
