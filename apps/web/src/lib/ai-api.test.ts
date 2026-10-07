vi.mock('@/lib/access', () => ({ requireCrawl: async () => 'owner', ownerHash: async () => 'owner', sameOrigin: (request: Request) => !request.headers.get('origin') || request.headers.get('origin') === new URL(request.url).origin }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => true }));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ crawl: { findUnique: vi.fn() }, ai: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() }, add: vi.fn(), locale: 'en' as 'en' | 'tr' }));
vi.mock('@seo/db', () => ({ db: { crawl: mocks.crawl, aiAnalysis: mocks.ai } }));
vi.mock('./queue', () => ({ getAiQueue: () => ({ add: mocks.add }) }));
vi.mock('./locale', () => ({ getLocale: async () => mocks.locale }));
vi.mock('@seo/shared/ai-config', () => ({ getAiConfig: () => ({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() || '' }) }));
import { GET, POST } from '../app/api/crawls/[id]/ai/route';
const result = { summary: 'Fix titles', actions: [{ priority: 'High', title: 'Titles', description: 'Missing titles', action: 'Add titles', findingCodes: ['TITLE_MISSING'], affectedCount: 2, affectedPages: ['https://example.test/'] }] };
const record = { id: 'analysis', crawlId: 'crawl', locale: 'en', status: 'IDLE', generation: '', result: null, error: null, generatedAt: null };
const context = { params: Promise.resolve({ id: 'crawl' }) };
const request = (body: unknown = {}, origin?: string) => new Request('http://localhost/api/crawls/crawl/ai', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
beforeEach(() => { vi.stubEnv('ANTHROPIC_API_KEY', 'server-test-key'); vi.clearAllMocks(); mocks.locale = 'en'; mocks.crawl.findUnique.mockResolvedValue({ status: 'COMPLETED' }); mocks.ai.upsert.mockResolvedValue(record); mocks.ai.findUnique.mockResolvedValue(null); mocks.ai.updateMany.mockResolvedValue({ count: 1 }); mocks.add.mockResolvedValue({}); });
afterEach(() => vi.unstubAllEnvs());
describe('durable AI API', () => {
  it.each(['', '   ', undefined])('returns disabled success without DB or queue when the key is %s', async key => {
    vi.stubEnv('ANTHROPIC_API_KEY', key);
    for (const endpoint of [GET, POST]) {
      const response = await endpoint(request(), context);
      expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ enabled: false, status: 'IDLE', error: null });
    }
    expect(mocks.crawl.findUnique).not.toHaveBeenCalled(); expect(mocks.ai.upsert).not.toHaveBeenCalled(); expect(mocks.ai.findUnique).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
  });
  it('automatically enables on the next request once a key becomes available', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', ''); expect((await (await GET(request(), context)).json()).enabled).toBe(false);
    vi.stubEnv('ANTHROPIC_API_KEY', 'new-server-key'); expect((await (await GET(request(), context)).json()).enabled).toBe(true);
    expect((await POST(request(), context)).status).toBe(202); expect(mocks.add).toHaveBeenCalledTimes(1);
  });
  it('queues a completed crawl with no secrets in job data or response', async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(202);
    expect(mocks.add).toHaveBeenCalledWith('recommendations', { analysisId: 'analysis', generation: expect.any(String) }, expect.objectContaining({ attempts: 2 }));
    expect(JSON.stringify(await response.json())).not.toMatch(/ANTHROPIC|apiKey/);
  });
  it.each(['RUNNING', 'PARTIAL', 'FAILED', 'PAUSED'])('rejects %s crawls', async status => {
    mocks.crawl.findUnique.mockResolvedValue({ status }); expect((await POST(request(), context)).status).toBe(409); expect(mocks.add).not.toHaveBeenCalled();
  });
  it('returns 404 for unknown crawls', async () => { mocks.crawl.findUnique.mockResolvedValue(null); expect((await POST(request(), context)).status).toBe(404); });
  it.each(['QUEUED', 'RUNNING', 'COMPLETED'])('never duplicates an existing %s analysis', async status => {
    mocks.ai.upsert.mockResolvedValue({ ...record, status, result: status === 'COMPLETED' ? result : null });
    expect((await POST(request(), context)).status).toBe(200); expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.ai.updateMany).not.toHaveBeenCalled();
  });
  it('regenerates explicitly while keeping the saved result', async () => {
    mocks.ai.upsert.mockResolvedValue({ ...record, status: 'COMPLETED', result, generation: 'previous' });
    const response = await POST(request({ regenerate: true }), context);
    expect(response.status).toBe(202); expect((await response.json()).result).toEqual(result);
    expect(mocks.ai.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ generation: 'previous' }), data: expect.not.objectContaining({ result: null }) }));
  });
  it('loses a concurrent atomic claim without enqueuing', async () => {
    mocks.ai.updateMany.mockResolvedValue({ count: 0 }); mocks.ai.findUnique.mockResolvedValue({ ...record, status: 'QUEUED' });
    expect((await POST(request(), context)).status).toBe(200); expect(mocks.add).not.toHaveBeenCalled();
  });
  it('preserves the previous result after Redis failure', async () => {
    mocks.ai.upsert.mockResolvedValue({ ...record, result, status: 'COMPLETED' }); mocks.add.mockRejectedValue(new Error('secret provider text'));
    const response = await POST(request({ regenerate: true }), context);
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain('secret');
    expect(mocks.ai.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: 'FAILED', error: 'ai.queueUnavailable' } }));
  });
  it.each(['tr', 'en'] as const)('reads saved %s analysis without invoking queue', async locale => {
    mocks.locale = locale; mocks.ai.findUnique.mockResolvedValue({ ...record, locale, status: 'COMPLETED', result });
    expect((await (await GET(request(), context)).json()).result).toEqual(result);
    expect(mocks.ai.findUnique).toHaveBeenCalledWith({ where: { crawlId_locale: { crawlId: 'crawl', locale } } });
    expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.ai.upsert).not.toHaveBeenCalled();
  });
  it('returns idle without creating an analysis on read', async () => { expect((await (await GET(request(), context)).json()).status).toBe('IDLE'); expect(mocks.ai.upsert).not.toHaveBeenCalled(); });
  it('can replace corrupt persisted JSON', async () => { mocks.ai.upsert.mockResolvedValue({ ...record, status: 'COMPLETED', result: { bad: true } }); expect((await POST(request(), context)).status).toBe(202); });
  it('rejects malformed and cross-site generation', async () => { expect((await POST(request({ regenerate: 'true' }), context)).status).toBe(400); expect((await POST(request({}, 'https://evil.test'), context)).status).toBe(403); expect(mocks.add).not.toHaveBeenCalled(); });
});
