import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { CRAWL_QUEUE } from '@seo/shared';
const globalQueue = globalThis as unknown as { queue?: Queue };
export function getQueue() { if (!globalQueue.queue) globalQueue.queue = new Queue(CRAWL_QUEUE, { connection: new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null }) }); return globalQueue.queue; }
