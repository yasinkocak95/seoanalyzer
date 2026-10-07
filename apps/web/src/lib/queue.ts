import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { CRAWL_QUEUE, AI_QUEUE } from '@seo/shared';
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

const aiGlobal = globalThis as unknown as { aiQueue?: Queue };
export function getAiQueue() {
  if (!aiGlobal.aiQueue) {
    const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1, connectTimeout: 5000,
      retryStrategy: times => times <= 2 ? 500 : null,
    });
    connection.on('error', () => console.error('AI queue connection error'));
    connection.on('end', () => { aiGlobal.aiQueue = undefined; });
    aiGlobal.aiQueue = new Queue(AI_QUEUE, { connection });
    aiGlobal.aiQueue.on('error', () => console.error('AI queue error'));
  }
  return aiGlobal.aiQueue;
}

import { VERIFY_QUEUE } from '@seo/shared';
const verifyGlobal = globalThis as unknown as { verifyQueue?: Queue };
export function getVerifyQueue() {
  if (!verifyGlobal.verifyQueue) {
    const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 1, connectTimeout: 5000, retryStrategy: times => times <= 2 ? 500 : null });
    connection.on('error', () => console.error('Verification connection unavailable'));
    connection.on('end', () => { verifyGlobal.verifyQueue = undefined; });
    verifyGlobal.verifyQueue = new Queue(VERIFY_QUEUE, { connection });
    verifyGlobal.verifyQueue.on('error', () => console.error('Verification queue unavailable'));
  }
  return verifyGlobal.verifyQueue;
}
