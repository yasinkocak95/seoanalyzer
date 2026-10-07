import { describe, expect, it } from "vitest";
import { crawlTrapReason, errorStatus, normalizeCrawlUrl, robotsAllows } from "./crawl.js";
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

describe('robots regression',()=>{
 it('honors consecutive user agents',()=>expect(robotsAllows('User-agent: *\nUser-agent: OtherBot\nDisallow: /private','/private')).toBe(false));
 it('uses specific bot groups over wildcard groups',()=>expect(robotsAllows('User-agent: *\nDisallow: /\nUser-agent: SEO-Denetim\nAllow: /','/public')).toBe(true));
 it('honors wildcard, end anchors, query paths and longest allow match',()=>{
  const robots='User-agent: *\nDisallow: /*?secret=*$\nDisallow: /private\nAllow: /private/public';
  expect(robotsAllows(robots,'/a?secret=1')).toBe(false);
  expect(robotsAllows(robots,'/a')).toBe(true);
  expect(robotsAllows(robots,'/private/public')).toBe(true);
 });
});

it('does not exclude normal numeric product identifiers',()=>expect(crawlTrapReason('https://example.test/product?id=123456789',1)).toBeNull());
