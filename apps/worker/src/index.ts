import { scheduleRunner } from './schedules.js';
import { startVerificationWorker } from './verification.js';
import { turkish } from '@seo/shared/i18n';
import { DelayedError, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { CRAWL_QUEUE, type CrawlJob } from '@seo/shared';
import { db } from '@seo/db';
import { runCrawlThread, CrawlOwnershipLostError } from './crawl-runtime.js';
import { CrawlBusyError, crawlLockOptions, withCrawlLease } from './crawl-lease.js';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { startAiWorker } from './ai-worker.js';
import { monitorEventLoopDelay } from 'node:perf_hooks';
try { loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
const verificationWorker = startVerificationWorker(connection);
const aiWorker = startAiWorker(connection);
const activeAttempts = new Map<string, AbortController>();
const parentLoop = monitorEventLoopDelay({ resolution: 20 }); parentLoop.enable();
function lockDiagnostics() {
  const memory = process.memoryUsage();
  return { parentEventLoopMaxMs: parentLoop.max / 1e6, parentEventLoopP99Ms: parentLoop.percentile(99) / 1e6,
    rssMiB: memory.rss / 2 ** 20, parentHeapMiB: memory.heapUsed / 2 ** 20 };
}
const worker = new Worker<CrawlJob>(CRAWL_QUEUE, async (job, token) => {
  const controller = new AbortController();
  let generation: Date | null | undefined;
  let previousGeneration: Date | null | undefined;
  activeAttempts.set(job.id!, controller);
  try {
  const crawl = await db.crawl.findUnique({ where: { id: job.data.crawlId }, select: { status: true, startedAt: true } });
  generation = crawl?.startedAt;
  if (!crawl || crawl.status === 'FAILED' || crawl.status === 'COMPLETED') {
    console.log(`Tarama yeniden işlenmedi: ${job.data.crawlId} (${crawl?.status ?? turkish("m223")})`);
    return;
  }
  // A resumed job may still be waiting for a paused batch to stop.
  if (crawl.status === 'PAUSED') return;
    await withCrawlLease(connection, job.data.crawlId, signal => runCrawlThread({ ...job.data, recoverRunning: crawl.status === 'RUNNING' || job.attemptsMade > 0 || job.stalledCounter > 0 }, signal, undefined, async (startedAt, previous) => {
      if (signal.aborted) throw new CrawlOwnershipLostError();
      generation = new Date(startedAt);
      previousGeneration = previous === undefined ? undefined : previous === null ? null : new Date(previous);
      await job.updateData({ ...job.data, executionStartedAt: startedAt, executionPreviousStartedAt: previous });
    }), controller.signal);
  } catch (error) {
    if (error instanceof CrawlBusyError) {
      // Wait for the previous execution to drain; do not consume a retry or mark it complete.
      await job.moveToDelayed(Date.now() + 1000, token);
      throw new DelayedError();
    }
    // A lost owner cannot rewrite the state of the next running attempt.
    if (error instanceof CrawlOwnershipLostError || controller.signal.aborted) throw error;
    if (generation === undefined) throw error;
    const retrying = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
    await db.crawl.updateMany({
      where: { id: job.data.crawlId, status: { in: ['RUNNING', 'QUEUED'] }, ...generationWhere(generation, previousGeneration) },
      data: { status: retrying ? 'QUEUED' : 'FAILED', error: error instanceof Error ? error.message : String(error), statusMessage: retrying ? turkish("m159") : turkish("m017") },
    }).catch(e => console.error('Tarama durumu kaydedilemedi', e));
    throw error;
  } finally {
    activeAttempts.delete(job.id!);
  }
// 1 CPU / 1 GiB production budget: one crawl thread, with existing page concurrency.
}, { connection, concurrency: 1, ...crawlLockOptions });
worker.on('lockRenewalFailed', jobIds => {
  console.error('Crawl job lock renewal failed; stopping execution', { jobIds, ...lockDiagnostics() });
  for (const id of jobIds) activeAttempts.get(id)?.abort();
});
worker.on('stalled', id => {
  console.error('Crawl job stalled', { jobId: id, ...lockDiagnostics() });
  activeAttempts.get(id)?.abort();
});
connection.on('close', () => {
  // Fail closed during a Redis disconnect, before another worker can recover the job.
  for (const controller of activeAttempts.values()) controller.abort();
});
worker.on('closed', () => parentLoop.disable());
worker.on('error', error => console.error('İşçi bağlantı hatası', error));
connection.on('error', error => console.error('Redis bağlantı hatası', error));
worker.on('failed', (job, error) => {
  console.error('Tarama hatası', job?.id, error);
  if(job?.finishedOn && (job.attemptsMade >= (job.opts.attempts??1) || /stalled more than/i.test(error.message)))
    void db.crawl.updateMany({where:failedAttemptWhere(job.data.crawlId,job.finishedOn,job.data.executionStartedAt,job.data.executionPreviousStartedAt),data:{status:'FAILED',error:error.message,statusMessage:turkish('m017')}}).catch(error=>console.error('Final crawl status could not be saved',error));
});
worker.on('completed', job => {
  console.log(`Tarama işi tamamlandı: ${job.data.crawlId}`);
  void aiWorker.enqueueCompleted(job.data.crawlId).catch(() => console.error('Automatic AI enqueue deferred'));
});
console.log('SEO tarama işçisi hazır.');

// Retry exhaustion can happen while PostgreSQL is unavailable. Reconcile durable
// BullMQ failures after the database reconnects, without rewriting paused/completed crawls.
const recoveryQueue=new Queue<CrawlJob>(CRAWL_QUEUE,{connection});
recoveryQueue.on('error',error=>console.error('Recovery queue error',error));
let recoveryOffset=0,recovering=false;
function generationWhere(generation: Date | null, previous?: Date | null) {
  return previous === undefined ? { startedAt: generation } : { OR: [{ startedAt: generation }, { startedAt: previous }] };
}
function failedAttemptWhere(id: string, finishedOn: number, generation?: string, previous?: string | null) {
  // A failed job from a paused attempt must not terminate a later resumed attempt.
  return { id, status: { in: ['QUEUED', 'RUNNING'] as ('QUEUED' | 'RUNNING')[] },
    ...(generation ? generationWhere(new Date(generation), previous === undefined ? undefined : previous === null ? null : new Date(previous)) : { OR: [{ startedAt: null }, { startedAt: { lte: new Date(finishedOn) } }] }) };
}
export async function reconcileFailedJobs() {
  if(recovering)return;
  recovering=true;
  try {
    const jobs=await recoveryQueue.getJobs(['failed'],recoveryOffset,recoveryOffset+99);
    for(const job of jobs)if(job?.data.crawlId && job.finishedOn)await db.crawl.updateMany({where:failedAttemptWhere(job.data.crawlId,job.finishedOn,job.data.executionStartedAt,job.data.executionPreviousStartedAt),data:{status:'FAILED',error:job.failedReason,statusMessage:turkish('m017')}});
    recoveryOffset=jobs.length===100?recoveryOffset+100:0;
  }catch(error){console.error('Failed crawl reconciliation deferred',error)}
  finally{recovering=false}
}
const runSchedules = scheduleRunner(recoveryQueue);
const recoveryTimer=setInterval(()=>{ parentLoop.reset(); void runSchedules().catch(() => console.error('Schedule processing deferred')); void reconcileFailedJobs(); void aiWorker.reconcile(); void verificationWorker.reconcile().catch(() => console.error('Verification recovery deferred'));  },30000);
recoveryTimer.unref();
void reconcileFailedJobs();
void aiWorker.reconcile(); void verificationWorker.reconcile().catch(() => console.error('Verification recovery deferred'));

void runSchedules().catch(() => console.error('Schedule processing deferred'));
