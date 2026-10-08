import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { CrawlOwnershipLostError } from './crawl-runtime.js';

// Same TTL as the existing BullMQ default; no stall/timeout inflation.
export const crawlLockOptions = { lockDuration: 30000, lockRenewTime: 15000, stalledInterval: 30000, maxStalledCount: 1 };
export class CrawlBusyError extends Error {}
const renew = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";
const release = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/** BullMQ locks job IDs; resumes can have a different job ID for the same crawl.
 * A renewable crawl-ID lease prevents concurrent recovery/claim across jobs.
 * Cancellation terminates the thread before releasing the lease.
 */
export async function withCrawlLease(connection: Pick<Redis, 'set' | 'eval'>, crawlId: string,
  work: (signal: AbortSignal) => Promise<void>, outerSignal?: AbortSignal) {
  const key = `seo:crawl-execution:${crawlId}`, owner = randomUUID();
  let validUntil = Date.now() + crawlLockOptions.lockDuration;
  if (outerSignal?.aborted) throw new CrawlOwnershipLostError();
  if (!await connection.set(key, owner, 'PX', crawlLockOptions.lockDuration, 'NX'))
    throw new CrawlBusyError('Crawl already has an active execution');
  const controller = new AbortController();
  const abort = () => controller.abort(new CrawlOwnershipLostError());
  outerSignal?.addEventListener('abort', abort, { once: true });
  if (outerSignal?.aborted) abort();
  let renewing: Promise<void> | undefined;
  const timer = setInterval(() => {
    // A blackholed Redis command may never reject (maxRetriesPerRequest=null).
    // Stop before the last confirmed lease can expire, even while renewal awaits.
    if (Date.now() >= validUntil - crawlLockOptions.lockRenewTime / 2) { abort(); return; }
    if (renewing || controller.signal.aborted) return;
    const attemptedExpiry = Date.now() + crawlLockOptions.lockDuration;
    renewing = (async () => {
      try {
        if (await connection.eval(renew, 1, key, owner, crawlLockOptions.lockDuration) !== 1) abort();
        else validUntil = attemptedExpiry;
      } catch { abort(); }
    })().finally(() => { renewing = undefined; });
  }, crawlLockOptions.lockRenewTime / 2);
  timer.unref();
  if (Date.now() >= validUntil - crawlLockOptions.lockRenewTime / 2) abort();
  try {
    await work(controller.signal);
    if (controller.signal.aborted) throw new CrawlOwnershipLostError();
  } finally {
    clearInterval(timer);
    outerSignal?.removeEventListener('abort', abort);
    await renewing;
    // A stale attempt must never delete the successor's lease.
    await connection.eval(release, 1, key, owner).catch(() => {});
  }
}
