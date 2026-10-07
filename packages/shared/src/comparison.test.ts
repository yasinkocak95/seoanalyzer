import { describe, it, expect } from 'vitest';
import { compareCrawls } from './comparison.js';
const base = { normalizedHost: 'example.com', status: 'COMPLETED', score: 70, processedPages: 10, analyzedHtmlPages: 10, errorUrls: 0 };
const issue = (code: string, urls: string[], severity = 'WARNING') => ({ code, title: code, severity, affectedUrls: urls });
describe('crawl comparison', () => {
  it('detects new, resolved, ongoing and worsened across storage chunks', () => {
    const result = compareCrawls({ ...base, findings: [issue('A', ['a']), issue('B', ['b']), issue('C', ['c'])] }, { ...base, score: 80, findings: [issue('A', ['a']), issue('A', ['d']), issue('C', ['c']), issue('D', ['d'])] });
    expect(result.rows.map(r => r.status)).toEqual(['worsened', 'resolved', 'ongoing', 'new']);
    expect(result.score).toBe(10);
  });
  it('rejects another domain', () => expect(() => compareCrawls({ ...base, findings: [] }, { ...base, normalizedHost: 'other.com', findings: [] })).toThrow());
  it('does not claim resolution on a partial crawl', () => expect(compareCrawls({ ...base, findings: [issue('A', ['a'])] }, { ...base, status: 'PARTIAL', findings: [] }).rows[0].status).toBe('unverified'));
  it('detects severity increases with unchanged URL counts', () => expect(compareCrawls({ ...base, findings: [issue('A', ['a'])] }, { ...base, findings: [issue('A', ['a'], 'CRITICAL')] }).rows[0].status).toBe('worsened'));
});
