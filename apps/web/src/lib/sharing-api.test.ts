import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ guard: vi.fn(), limited: vi.fn(), create: vi.fn(), revoke: vi.fn(), share: vi.fn(), crawl: vi.fn(), count: vi.fn() }));
vi.mock('@seo/db', () => ({ db: { reportShare: { create: mocks.create, updateMany: mocks.revoke, findFirst: mocks.share }, crawl: { findUnique: mocks.crawl }, finding: { count: mocks.count } } }));
vi.mock('./access', async original => ({ ...await original<typeof import('./access')>(), requireCrawl: mocks.guard }));
vi.mock('./rate-limit', () => ({ rateLimit: mocks.limited }));
import { POST, DELETE } from '../app/api/crawls/[id]/share/route';
import { POST as resolve } from '../app/api/shared/route';
import { digest } from './access';
const context = { params: Promise.resolve({ id: 'c' }) };
const req = (body = {}, options: { path?: string; method?: string; origin?: string; fetchSite?: string } = {}) => {
  const app = new URL(process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://example.com');
  const method = options.method ?? 'POST';
  return new Request(new URL(options.path ?? '/api/shared', app.origin), {
    method,
    headers: { Origin: options.origin ?? app.origin, Host: app.host, 'Sec-Fetch-Site': options.fetchSite ?? 'same-origin', 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
};
const shareReq = (options: Parameters<typeof req>[1] = {}) => req({}, { path: '/api/crawls/c/share', ...options });
beforeEach(() => { vi.clearAllMocks(); mocks.guard.mockResolvedValue('owner'); mocks.limited.mockResolvedValue(true); mocks.crawl.mockResolvedValue({ status: 'COMPLETED', normalizedHost: 'example.com', score: 80, completedAt: null, findings: [] }); mocks.count.mockResolvedValue(0); mocks.share.mockResolvedValue(null); });
it('stores only a hash and gives a fragment capability with expiry', async () => { const r = await POST(shareReq(), context); expect(r.status).toBe(200); const result = await r.json(); expect(result.path).toMatch(/^\/shared#[a-f0-9]{64}$/); const token = result.path.split('#')[1]; expect(mocks.create).toHaveBeenCalledWith({ data: { crawlId: 'c', tokenHash: digest(token), expiresAt: expect.any(Date) } }); expect(JSON.stringify(mocks.create.mock.calls)).not.toContain(token); });
it('revokes all links for the authorized report', async () => { expect((await DELETE(shareReq({ method: 'DELETE' }), context)).status).toBe(200); expect(mocks.revoke).toHaveBeenCalledWith(expect.objectContaining({ where: { crawlId: 'c', revokedAt: null } })); });
it('does not resolve expired, revoked or unknown capabilities', async () => { const r = await resolve(req({ token: 'a'.repeat(64), locale: 'en' })); expect(r.status).toBe(404); expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: digest('a'.repeat(64)), revokedAt: null, expiresAt: { gt: expect.any(Date) } } })); });
it('returns read-only data without internal IDs, evidence or mutation links', async () => { mocks.share.mockResolvedValue({ crawlId: 'c' }); const r = await resolve(req({ token: 'a'.repeat(64), locale: 'en' })); expect(r.status).toBe(200); expect(await r.json()).toEqual({ host: 'example.com', score: 80, completedAt: null, counts: { critical: 0, warning: 0, info: 0 }, findings: [] }); expect(r.headers.get('cache-control')).toBe('no-store'); });
it('fails closed under admission limits', async () => { mocks.limited.mockResolvedValue(false); expect((await resolve(req({ token: 'a'.repeat(64) }))).status).toBe(429); });
it.each([{ origin: 'https://evil.com' }, { fetchSite: 'cross-site' }])('rejects cross-site sharing requests before accessing data: %j', async options => {
  expect((await POST(shareReq(options), context)).status).toBe(403);
  expect((await DELETE(shareReq({ ...options, method: 'DELETE' }), context)).status).toBe(403);
  expect((await resolve(req({ token: 'a'.repeat(64) }, options))).status).toBe(403);
  for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
});
it('does not expose incomplete findings while a previously shared partial report resumes', async () => {
  mocks.share.mockResolvedValue({ crawlId: 'c' }); mocks.crawl.mockResolvedValue({ status: 'RUNNING', findings: [] });
  expect((await resolve(req({ token: 'a'.repeat(64) }))).status).toBe(409);
});
