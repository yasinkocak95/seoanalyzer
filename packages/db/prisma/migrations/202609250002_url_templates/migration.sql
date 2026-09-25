ALTER TYPE "CrawlUrlStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';
CREATE TYPE "TemplateStatus" AS ENUM ('SAMPLING','SAMPLED','MIXED');
ALTER TABLE "Crawl" ADD COLUMN "fullCrawl" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Crawl" ADD COLUMN "skippedUrls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Page" ADD COLUMN "structure" JSONB;
ALTER TABLE "CrawlUrl" ADD COLUMN "template" TEXT;
CREATE INDEX "CrawlUrl_crawlId_template_idx" ON "CrawlUrl"("crawlId", "template");
CREATE TABLE "UrlTemplate" (
  "id" TEXT PRIMARY KEY,
  "crawlId" TEXT NOT NULL REFERENCES "Crawl"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "pattern" TEXT NOT NULL,
  "status" "TemplateStatus" NOT NULL DEFAULT 'SAMPLING',
  "similarity" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "UrlTemplate_crawlId_pattern_key" ON "UrlTemplate"("crawlId", "pattern");
