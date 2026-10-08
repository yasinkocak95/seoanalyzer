import { describe, expect, it } from 'vitest';
import { CrawlPacing, retryAfterMs, retryDelayMs } from './crawl-pacing.js';

describe('crawl task admission', () => {
  it('supports Retry-After seconds and HTTP dates without shortening server cooldown', () => {
    const now = Date.parse('2026-10-08T10:00:00Z');
    expect(retryAfterMs('120', now)).toBe(120000);
    expect(retryAfterMs('Thu, 08 Oct 2026 10:02:00 GMT', now)).toBe(120000);
    for (const value of [undefined, '', '-1', '1.5', 'bad', 'Thu, 08 Oct 2026 09:00:00 GMT'])
      expect(retryAfterMs(value, now)).toBe(0);
  });
  it('uses capped exponential backoff with jitter', () => {
    expect([1, 2, 3, 4, 5, 6].map(n => retryDelayMs(n, () => 1))).toEqual([2000, 4000, 8000, 16000, 30000, 30000]);
    expect(retryDelayMs(3, () => 0)).toBe(4000);
  });
  it('does not admit simultaneous tasks or reset at a new batch', () => {
    let now = 0;
    const gate = new CrawlPacing(500, () => now, () => 0);
    expect(gate.admit()).toBe(true);
    expect(gate.admit()).toBe(false);
    now = 499; expect(gate.admit()).toBe(false);
    now = 500; expect(gate.admit()).toBe(true);
  });
  it('slows the entire site after 429, then recovers gradually to configured cadence', () => {
    let now = 0;
    const gate = new CrawlPacing(500, () => now, () => 0);
    gate.admit();
    expect(gate.rateLimited(1, '120')).toBe(120000);
    gate.rateLimited(2, '1'); // A shorter response cannot clear the original cooldown.
    now = 119999; expect(gate.admit()).toBe(false);
    now = 120000; expect(gate.admit()).toBe(true);
    now += 1000; expect(gate.admit()).toBe(false); // interval doubled twice to 2000
    now += 1000; expect(gate.admit()).toBe(true);
    for (let i = 0; i < 10; i++) gate.succeeded();
    now += 2000; expect(gate.admit()).toBe(true);
    now += 1799; expect(gate.admit()).toBe(false);
    now += 1; expect(gate.admit()).toBe(true);
  });
  it('backs off transient failures before admitting unrelated tasks', () => {
    let now = 0;
    const gate = new CrawlPacing(500, () => now, () => 1);
    gate.retry(3);
    now = 7999; expect(gate.admit()).toBe(false);
    now = 8000; expect(gate.admit()).toBe(true);
  });
  it('never speeds up a site configured with a delay above the adaptive cap', () => {
    let now = 0;
    const gate = new CrawlPacing(60000, () => now, () => 0);
    gate.rateLimited(1); now = 1000; expect(gate.admit()).toBe(true);
    now = 31000; expect(gate.admit()).toBe(false);
    now = 61000; expect(gate.admit()).toBe(true);
  });
});
