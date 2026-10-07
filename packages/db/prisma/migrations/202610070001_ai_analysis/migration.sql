CREATE TYPE "AiAnalysisStatus" AS ENUM ('IDLE', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TABLE "AiAnalysis" (
  "id" TEXT NOT NULL,
  "crawlId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "status" "AiAnalysisStatus" NOT NULL DEFAULT 'IDLE',
  "generation" TEXT NOT NULL DEFAULT '',
  "result" JSONB,
  "model" TEXT,
  "error" TEXT,
  "generatedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiAnalysis_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiAnalysis_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "Crawl"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AiAnalysis_crawlId_locale_key" ON "AiAnalysis"("crawlId", "locale");
