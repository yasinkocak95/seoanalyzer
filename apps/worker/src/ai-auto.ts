import { randomUUID } from 'node:crypto';
import { db } from '@seo/db';
import { getAiConfig } from '@seo/shared/ai-config';
import type { AiJob } from '@seo/shared';
import type { Queue } from 'bullmq';
export async function enqueueExecutiveSummaries(crawlId: string, queue: Queue<AiJob>) {
  if (!getAiConfig().apiKey) return;
  const crawl = await db.crawl.findUnique({ where: { id: crawlId }, select: { status: true } });
  if (crawl?.status !== 'COMPLETED') return;
  for (const locale of ['tr', 'en']) {
    const record = await db.aiAnalysis.upsert({ where: { crawlId_locale: { crawlId, locale } }, create: { crawlId, locale }, update: {} });
    if (record.status !== 'IDLE' || record.result) continue;
    const generation = randomUUID();
    const claim = await db.aiAnalysis.updateMany({ where: { id: record.id, status: 'IDLE', generation: record.generation }, data: { status: 'QUEUED', generation } });
    if (!claim.count) continue;
    // Durable QUEUED state lets existing reconciliation repair enqueue failures.
    await queue.add('recommendations', { analysisId: record.id, generation }, { jobId: `ai-${record.id}-${generation}`, attempts: 2, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 100 });
  }
}
