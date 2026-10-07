import { beforeEach, it, expect, vi } from 'vitest';
import { verificationResult } from '@seo/shared';
const fetch = vi.hoisted(() => vi.fn());
vi.mock('./fetch-safe.js', () => ({ safeFetch: fetch, limitedText: (r: Response) => r.text() }));
import { verifyUrl } from './verification.js';
beforeEach(() => { vi.clearAllMocks(); fetch.mockImplementation(async (url: string) => ({ response: new Response(url.endsWith('robots.txt') ? 'User-agent: *\nAllow: /' : '<html><title>A complete and useful title for this product</title><h1>Product</h1></html>', { headers: { 'content-type': 'text/html' } }), finalUrl: url })); });
it('reuses page rules to verify a fixed title without a crawl', async () => { expect(await verifyUrl('TITLE_MISSING', 'https://example.com/a')).toBe('FIXED'); expect(fetch).toHaveBeenCalledTimes(2); });
it('reports a remaining issue', async () => expect(await verifyUrl('DESCRIPTION_MISSING', 'https://example.com/a')).toBe('STILL_PRESENT'));
it('never claims fixed when fetching is blocked', async () => { fetch.mockRejectedValue(new Error('Unsafe URL')); expect(await verifyUrl('TITLE_MISSING', 'http://127.0.0.1')).toBe('COULD_NOT_VERIFY'); });
it('does not verify site-wide issues from a single page', async () => { expect(await verifyUrl('DUPLICATE_TITLE', 'https://example.com/a')).toBe('COULD_NOT_VERIFY'); expect(fetch).not.toHaveBeenCalled(); });
it.each(['TITLE_MISSING', 'HTTP_ERROR'])('does not certify %s on an external redirect', async code => {
  fetch.mockImplementation(async (url: string) => ({ response: url.endsWith('robots.txt') ? new Response('User-agent: *\nAllow: /') : new Response(null, { status: 302, headers: { location: 'https://other.com/fixed' } }), finalUrl: url }));
  expect(await verifyUrl(code, 'https://example.com/a')).toBe('COULD_NOT_VERIFY');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenLastCalledWith('https://example.com/a', { redirect: 'manual' });
});
it('checks robots for a redirect destination before fetching that page', async () => {
  fetch.mockImplementation(async (url: string) => ({ response: url.endsWith('robots.txt') ? new Response('User-agent: *\nDisallow: /blocked') : new Response(null, { status: 302, headers: { location: '/blocked' } }), finalUrl: url }));
  expect(await verifyUrl('TITLE_MISSING', 'https://example.com/a')).toBe('COULD_NOT_VERIFY');
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/blocked'))).toBe(false);
});
it('recognizes case-insensitive meta robots and description names', async () => {
  fetch.mockImplementation(async (url: string) => ({ response: new Response(url.endsWith('robots.txt') ? 'User-agent: *\nAllow: /' : '<meta name="ROBOTS" content="noindex"><meta name="DESCRIPTION" content="Description">', { headers: { 'content-type': 'text/html' } }), finalUrl: url }));
  expect(await verifyUrl('NOINDEX', 'https://example.com/a')).toBe('STILL_PRESENT');
  expect(await verifyUrl('DESCRIPTION_MISSING', 'https://example.com/a')).toBe('FIXED');
});
it('aggregates uncertainty safely', () => { expect(verificationResult(['FIXED', 'COULD_NOT_VERIFY'])).toBe('COULD_NOT_VERIFY'); expect(verificationResult(['FIXED', 'STILL_PRESENT'])).toBe('STILL_PRESENT'); expect(verificationResult([])).toBe('COULD_NOT_VERIFY'); });
