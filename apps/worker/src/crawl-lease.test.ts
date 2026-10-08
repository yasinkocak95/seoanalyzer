import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrawlBusyError, withCrawlLease } from './crawl-lease.js';

afterEach(() => vi.useRealTimers());
function redisFixture() {
  let owner: string | undefined, expires = 0;
  return {
    set: vi.fn(async (_key, value, _px, duration) => {
      if (owner && expires > Date.now()) return null;
      owner = value; expires = Date.now() + duration; return 'OK';
    }),
    eval: vi.fn(async (script, _keys, _key, value, duration) => {
      if (owner !== value || expires <= Date.now()) return 0;
      if (script.includes('pexpire')) expires = Date.now() + duration;
      else owner = undefined;
      return 1;
    }),
    steal() { owner = 'successor'; expires = Date.now() + 30000; },
    owner() { return owner; },
  };
}
describe('crawl execution lease', () => {
  it('excludes another job ID for the same crawl and releases after completion', async () => {
    const redis = redisFixture(); let release!: () => void;
    const first = withCrawlLease(redis as any, 'crawl', async () => new Promise<void>(r => { release = r; }));
    await Promise.resolve();
    await expect(withCrawlLease(redis as any, 'crawl', async () => {})).rejects.toBeInstanceOf(CrawlBusyError);
    release(); await first;
    await withCrawlLease(redis as any, 'crawl', async () => {});
    expect(redis.owner()).toBeUndefined();
  });
  it('renews through a long async handler without increasing the 30s TTL', async () => {
    vi.useFakeTimers(); const redis = redisFixture(); let release!: () => void;
    const work = withCrawlLease(redis as any, 'crawl', async () => new Promise<void>(r => { release = r; }));
    await Promise.resolve(); await vi.advanceTimersByTimeAsync(90000);
    expect(redis.eval.mock.calls.filter(([script]) => script.includes('pexpire')).length).toBe(12);
    await expect(withCrawlLease(redis as any, 'crawl', async () => {})).rejects.toBeInstanceOf(CrawlBusyError);
    release(); await work;
  });
  it('cancels the old execution on renewal failure and cannot delete the successor lease', async () => {
    vi.useFakeTimers(); const redis = redisFixture(); let aborted = false;
    const work = withCrawlLease(redis as any, 'crawl', async signal => new Promise<void>(r => signal.addEventListener('abort', () => { aborted = true; r(); })));
    const result = expect(work).rejects.toThrow('ownership lost');
    await Promise.resolve(); redis.steal(); await vi.advanceTimersByTimeAsync(7500);
    await result; expect(aborted).toBe(true); expect(redis.owner()).toBe('successor');
  });
  it('aborts before TTL expiry when Redis renewal remains pending', async () => {
    vi.useFakeTimers(); const redis = redisFixture(); let finishRenewal!: () => void, aborted = false;
    redis.eval.mockImplementationOnce(async () => new Promise<0 | 1>(r => { finishRenewal = () => r(0); }));
    const work = withCrawlLease(redis as any, 'crawl', async signal => new Promise<void>(r => signal.addEventListener('abort', () => { aborted = true; r(); })));
    const result = expect(work).rejects.toThrow('ownership lost');
    await Promise.resolve(); await vi.advanceTimersByTimeAsync(22500);
    expect(aborted).toBe(true); finishRenewal(); await result;
  });
  it('releases the lease after a crash/error so the retry can recover', async () => {
    const redis = redisFixture();
    await expect(withCrawlLease(redis as any, 'crawl', async () => { throw new Error('thread crash'); })).rejects.toThrow('thread crash');
    await withCrawlLease(redis as any, 'crawl', async () => {});
  });
});
