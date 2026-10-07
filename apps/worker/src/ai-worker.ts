import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { db, type Prisma } from '@seo/db';
import { AI_QUEUE, type AiJob, localeOf } from '@seo/shared';
import { AiError, generateAiAnalysis } from './ai-analysis.js';
import { getAiConfig } from '@seo/shared/ai-config';

export function startAiWorker(connection: Redis) {
  const queue = new Queue<AiJob>(AI_QUEUE, { connection });
  const worker = new Worker<AiJob>(AI_QUEUE, async job => {
    const where = { id: job.data.analysisId, generation: job.data.generation, status: { in: ['QUEUED', 'RUNNING'] as ('QUEUED' | 'RUNNING')[] } };
    if (!getAiConfig().apiKey) {
      // A job queued before a key was removed is skipped safely, without Claude.
      await db.aiAnalysis.updateMany({ where, data: { status: 'IDLE', error: null } });
      return;
    }
    const analysis = await db.aiAnalysis.findUnique({ where: { id: job.data.analysisId } });
    if (!analysis || analysis.generation !== job.data.generation || !['QUEUED', 'RUNNING'].includes(analysis.status)) return;
    try {
      const claimed = await db.aiAnalysis.updateMany({ where, data: { status: 'RUNNING', error: null } });
      if (!claimed.count) return;
      const { result, model } = await generateAiAnalysis(analysis.crawlId, localeOf(analysis.locale));
      await db.aiAnalysis.updateMany({ where, data: { status: 'COMPLETED', result: result as unknown as Prisma.InputJsonValue, model, generatedAt: new Date(), error: null } });
    } catch (error) {
      const retrying = (!(error instanceof AiError) || error.retryable) && job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      await db.aiAnalysis.updateMany({ where, data: { status: retrying ? 'QUEUED' : 'FAILED', error: error instanceof AiError ? error.message : 'ai.providerUnavailable' } });
      if (retrying || !(error instanceof AiError)) throw new Error('AI analysis job failed');
    }
  }, { connection, concurrency: 1 });
  worker.on('error', () => console.error('AI worker connection error'));
  queue.on('error', () => console.error('AI queue connection error'));
  worker.on('failed', job => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) void db.aiAnalysis.updateMany({ where: { id: job.data.analysisId, generation: job.data.generation, status: { in: ['QUEUED', 'RUNNING'] } }, data: { status: 'FAILED', error: 'ai.providerUnavailable' } }).catch(() => {});
  });
  let reconciling = false;
  return { async reconcile() {
    if (!getAiConfig().apiKey) return;
    if (reconciling) return;
    reconciling = true;
    try {
      // Repair DB/Redis enqueue gaps and final failures after a DB outage.
      const pending = await db.aiAnalysis.findMany({ where: { status: { in: ['QUEUED', 'RUNNING'] }, updatedAt: { lt: new Date(Date.now() - 60000) } }, orderBy: { updatedAt: 'asc' }, take: 100 });
      for (const analysis of pending) {
        const jobId = `ai-${analysis.id}-${analysis.generation}`;
        const job = await queue.getJob(jobId);
        if (!job) await queue.add('recommendations', { analysisId: analysis.id, generation: analysis.generation }, { jobId, attempts: 2, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 100 });
        else if (['failed', 'completed'].includes(await job.getState())) await db.aiAnalysis.updateMany({ where: { id: analysis.id, generation: analysis.generation, status: { in: ['QUEUED', 'RUNNING'] } }, data: { status: 'FAILED', error: 'ai.providerUnavailable' } });
      }
    } catch { console.error('AI job reconciliation deferred'); }
    finally { reconciling = false; }
  } };
}
