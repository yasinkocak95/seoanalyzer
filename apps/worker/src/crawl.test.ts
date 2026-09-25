import { describe, expect, it } from "vitest";
import { crawlTrapReason, errorStatus, normalizeCrawlUrl } from "./crawl.js";
describe("hata durum kodu", () => {
  it("farklı hata mesajlarından durum kodunu çıkarır", () => {
    expect(errorStatus("HTTP 404")).toBe(404);
    expect(errorStatus("503 - Service Unavailable")).toBe(503);
    expect(errorStatus("Request blocked - received 403 status code.")).toBe(403);
    expect(errorStatus("Stream closed with error code NGHTTP2_REFUSED_STREAM")).toBeNull();
    expect(errorStatus("HTTP yanıt yok")).toBeNull();
  });
});
describe("büyük site URL denetimleri", () => {
  it("izleme parametrelerini kaldırıp sorguyu kararlı sıralar", () => {
    expect(normalizeCrawlUrl("https://x.test/a?utm_source=b&z=2&a=1")).toBe(
      "https://x.test/a?a=1&z=2",
    );
  });
  it("döngüsel ve sınırsız sorgu yapılarını dışlar", () => {
    expect(crawlTrapReason("https://x.test/a?offset=999999", 2)).toMatch(
      /sayaç/,
    );
    expect(
      crawlTrapReason("https://x.test/a/b/a/b/a/b/a/b/a", 4),
    ).toMatch(/Döngüsel/);
  });
});
