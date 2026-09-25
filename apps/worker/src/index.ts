import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { CRAWL_QUEUE, type CrawlJob } from '@seo/shared';
import { db } from '@seo/db';
import { executeCrawl } from './crawl.js';
const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
const worker = new Worker<CrawlJob>(CRAWL_QUEUE, async job => {
  const crawl = await db.crawl.findUnique({ where: { id: job.data.crawlId }, select: { status: true } });
  if (!crawl || crawl.status === 'FAILED' || crawl.status === 'COMPLETED') {
    console.log(`Tarama yeniden işlenmedi: ${job.data.crawlId} (${crawl?.status ?? 'bulunamadı'})`);
    return;
  }
  await executeCrawl(job.data.crawlId, job.data.rootUrl);
}, { connection, concurrency: 2 });
worker.on('failed', async (job, error) => { if (job) await db.crawl.update({ where: { id: job.data.crawlId }, data: { status: 'FAILED', error: error.message, statusMessage: 'Tarama tamamlanamadı' } }).catch(() => {}); console.error('Tarama hatası', error); });
worker.on('completed', job => console.log(`Tarama tamamlandı: ${job.data.crawlId}`));
console.log('SEO tarama işçisi hazır.');
