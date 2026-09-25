import { describe, expect, it } from "vitest";
import { minSimilarity, templatePattern } from "./url-templates.js";

describe("URL şablonları", () => {
  it("klasör adını kodlamadan son parçayı genelleştirir", () => {
    expect(templatePattern("https://x.test/urunler/kirmizi-elbise")).toBe("/urunler/{slug}");
    expect(templatePattern("https://x.test/cfi/ahmet-yilmaz")).toBe("/cfi/{slug}");
    expect(templatePattern("https://x.test/aircraft/cessna-172")).toBe("/aircraft/{slug}");
  });
  it("farklı derinlikleri ve ara klasörleri ayrı tutar", () => {
    expect(templatePattern("https://x.test/urunler/kategori/ayakkabi")).toBe("/urunler/kategori/{slug}");
    expect(templatePattern("https://x.test/urunler/kategori/ayakkabi")).not.toBe(templatePattern("https://x.test/urunler/ayakkabi"));
  });
  it("sayısal ve hash parçaları {id} yapar, uzantıyı korur", () => {
    expect(templatePattern("https://x.test/haber/2024/12345")).toBe("/haber/{id}/{id}");
    expect(templatePattern("https://x.test/urun/abc-123.html")).toBe("/urun/{slug}.html");
  });
  it("kök seviyedeki sorgusuz sayfaları gruplamaz", () => {
    expect(templatePattern("https://x.test/hakkimizda")).toBeNull();
    expect(templatePattern("https://x.test/")).toBeNull();
  });
  it("sorgu parametrelerini ayrı şablon olarak değerlendirir", () => {
    expect(templatePattern("https://x.test/liste?kategori=a")).toBe("/liste?kategori={değer}");
    expect(templatePattern("https://x.test/liste?kategori=a&sayfa=2")).toBe("/liste?kategori={değer}&sayfa={değer}");
    expect(templatePattern("https://x.test/a?x=1")).not.toBe(templatePattern("https://x.test/b?x=1"));
    expect(templatePattern("https://x.test/urunler/a?renk=kirmizi")).not.toBe(templatePattern("https://x.test/urunler/a"));
  });
  it("yapısı farklı örnekleri benzemez bulur", () => {
    const urun = ["gallery", "price", "add-to-cart", "ld:Product"], kategori = ["product-grid", "filter", "pagination", "ld:CollectionPage"];
    expect(minSimilarity([urun, urun, [...urun, "badge"]])).toBeGreaterThan(0.7);
    expect(minSimilarity([urun, urun, kategori])).toBe(0);
    expect(minSimilarity([[], []])).toBe(1);
  });
});
