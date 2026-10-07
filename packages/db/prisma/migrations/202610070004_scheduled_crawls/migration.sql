CREATE TABLE "CrawlSchedule" ("id" TEXT PRIMARY KEY, "ownerHash" TEXT NOT NULL, "normalizedHost" TEXT NOT NULL, "rootUrl" TEXT NOT NULL, "fullCrawl" BOOLEAN NOT NULL DEFAULT false, "frequency" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "nextRunAt" TIMESTAMP(3) NOT NULL, "lastRunAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "CrawlSchedule_ownerHash_normalizedHost_key" ON "CrawlSchedule"("ownerHash", "normalizedHost");
CREATE INDEX "CrawlSchedule_enabled_nextRunAt_idx" ON "CrawlSchedule"("enabled", "nextRunAt");
ALTER TABLE "Crawl" ADD COLUMN "scheduleId" TEXT REFERENCES "CrawlSchedule"("id") ON DELETE SET NULL;
ALTER TABLE "Crawl" ADD COLUMN "notificationCheckedAt" TIMESTAMP(3);
CREATE TABLE "NotificationEvent" ("id" TEXT PRIMARY KEY, "ownerHash" TEXT NOT NULL, "normalizedHost" TEXT NOT NULL, "crawlId" TEXT NOT NULL UNIQUE, "type" TEXT NOT NULL, "payload" JSONB NOT NULL, "deliveredAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "NotificationEvent_deliveredAt_createdAt_idx" ON "NotificationEvent"("deliveredAt", "createdAt");
