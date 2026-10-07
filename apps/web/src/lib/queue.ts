import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { CRAWL_QUEUE } from '@seo/shared';
const globalQueue = globalThis as unknown as { queue?: Queue };
export function getQueue() {
  if (!globalQueue.queue) {
    const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1, connectTimeout: 5000,
      retryStrategy: times => times <= 2 ? 500 : null,
    });
    connection.on('error', error => console.error('Crawl queue connection error', error.message));
    connection.on('end', () => { globalQueue.queue = undefined; });
    globalQueue.queue = new Queue(CRAWL_QUEUE, { connection });
    globalQueue.queue.on('error', error => console.error('Crawl queue error', error.message));
  }
  return globalQueue.queue;
}
