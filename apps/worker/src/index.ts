import { turkish } from '@seo/shared/i18n';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { CRAWL_QUEUE, type CrawlJob } from '@seo/shared';
import { db } from '@seo/db';
import { executeCrawl } from './crawl.js';
const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
const worker = new Worker<CrawlJob>(CRAWL_QUEUE, async job => {
  try {
  const crawl = await db.crawl.findUnique({ where: { id: job.data.crawlId }, select: { status: true } });
  if (!crawl || crawl.status === 'FAILED' || crawl.status === 'COMPLETED') {
    console.log(`Tarama yeniden işlenmedi: ${job.data.crawlId} (${crawl?.status ?? turkish("m223")})`);
    return;
  }
  // A resumed job may still be waiting for a paused batch to stop.
  if (crawl.status === 'PAUSED') return;
    await executeCrawl(job.data.crawlId, job.data.rootUrl, job.attemptsMade > 0 || job.stalledCounter > 0);
  } catch (error) {
    const retrying = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
    await db.crawl.updateMany({
      where: { id: job.data.crawlId, status: { in: ['RUNNING', 'QUEUED'] } },
      data: { status: retrying ? 'QUEUED' : 'FAILED', error: error instanceof Error ? error.message : String(error), statusMessage: retrying ? turkish("m159") : turkish("m017") },
    }).catch(e => console.error('Tarama durumu kaydedilemedi', e));
    throw error;
  }
}, { connection, concurrency: 2 });
worker.on('error', error => console.error('İşçi bağlantı hatası', error));
connection.on('error', error => console.error('Redis bağlantı hatası', error));
worker.on('failed', (job, error) => {
  console.error('Tarama hatası', job?.id, error);
  if(job && (job.attemptsMade >= (job.opts.attempts??1) || /stalled more than/i.test(error.message)))
    void db.crawl.updateMany({where:{id:job.data.crawlId,status:{in:['QUEUED','RUNNING']}},data:{status:'FAILED',error:error.message,statusMessage:turkish('m017')}}).catch(error=>console.error('Final crawl status could not be saved',error));
});
worker.on('completed', job => console.log(`Tarama işi tamamlandı: ${job.data.crawlId}`));
console.log('SEO tarama işçisi hazır.');

// Retry exhaustion can happen while PostgreSQL is unavailable. Reconcile durable
// BullMQ failures after the database reconnects, without rewriting paused/completed crawls.
const recoveryQueue=new Queue<CrawlJob>(CRAWL_QUEUE,{connection});
recoveryQueue.on('error',error=>console.error('Recovery queue error',error));
let recoveryOffset=0,recovering=false;
export async function reconcileFailedJobs() {
  if(recovering)return;
  recovering=true;
  try {
    const jobs=await recoveryQueue.getJobs(['failed'],recoveryOffset,recoveryOffset+99);
    for(const job of jobs)if(job?.data.crawlId)await db.crawl.updateMany({where:{id:job.data.crawlId,status:{in:['QUEUED','RUNNING']}},data:{status:'FAILED',error:job.failedReason,statusMessage:turkish('m017')}});
    recoveryOffset=jobs.length===100?recoveryOffset+100:0;
  }catch(error){console.error('Failed crawl reconciliation deferred',error)}
  finally{recovering=false}
}
const recoveryTimer=setInterval(()=>void reconcileFailedJobs(),30000);
recoveryTimer.unref();
void reconcileFailedJobs();
