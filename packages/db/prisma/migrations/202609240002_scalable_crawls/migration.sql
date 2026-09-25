ALTER TYPE "CrawlStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "CrawlStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
CREATE TYPE "CrawlUrlStatus" AS ENUM ('DISCOVERED','PROCESSING','PROCESSED','ERROR','EXCLUDED');
CREATE TYPE "ResponseKind" AS ENUM ('HTML','REDIRECT','NON_HTML','ERROR');
ALTER TABLE "Crawl" DROP COLUMN "maxPages";
ALTER TABLE "Crawl" DROP COLUMN "limited";
ALTER TABLE "Crawl" ADD COLUMN "analyzedHtmlPages" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Crawl" ADD COLUMN "redirectCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Crawl" ADD COLUMN "pendingUrls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Crawl" ADD COLUMN "errorUrls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Crawl" ADD COLUMN "partialReason" TEXT;
ALTER TABLE "Page" ADD COLUMN "responseKind" "ResponseKind" NOT NULL DEFAULT 'HTML';
ALTER TABLE "Page" ADD COLUMN "redirectTarget" TEXT;
ALTER TABLE "Page" ADD COLUMN "headings" JSONB;
ALTER TABLE "Page" ADD COLUMN "images" JSONB;
CREATE TABLE "CrawlUrl" (
  "id" TEXT PRIMARY KEY,
  "crawlId" TEXT NOT NULL REFERENCES "Crawl"("id") ON DELETE CASCADE,
  "url" TEXT NOT NULL,
  "normalized" TEXT NOT NULL,
  "status" "CrawlUrlStatus" NOT NULL DEFAULT 'DISCOVERED',
  "depth" INTEGER NOT NULL DEFAULT 0,
  "sourceUrl" TEXT,
  "fromSitemap" BOOLEAN NOT NULL DEFAULT false,
  "linked" BOOLEAN NOT NULL DEFAULT false,
  "lastError" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CrawlUrl_crawlId_normalized_key" ON "CrawlUrl"("crawlId","normalized");
CREATE INDEX "CrawlUrl_crawlId_status_createdAt_idx" ON "CrawlUrl"("crawlId","status","createdAt");
