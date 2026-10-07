ALTER TABLE "Crawl" ADD COLUMN "ownerHash" TEXT;
CREATE INDEX "Crawl_ownerHash_normalizedHost_createdAt_idx" ON "Crawl"("ownerHash", "normalizedHost", "createdAt");
CREATE TABLE "ReportShare" ("id" TEXT PRIMARY KEY, "crawlId" TEXT NOT NULL REFERENCES "Crawl"("id") ON DELETE CASCADE, "tokenHash" TEXT NOT NULL UNIQUE, "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "ReportShare_crawlId_idx" ON "ReportShare"("crawlId");
