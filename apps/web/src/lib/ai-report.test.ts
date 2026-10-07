vi.mock('@/lib/access', () => ({ requireCrawl: async () => 'owner', ownerHash: async () => 'owner', sameOrigin: (request: Request) => !request.headers.get('origin') || request.headers.get('origin') === new URL(request.url).origin }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => true }));
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ crawl: vi.fn(), previous: vi.fn(), analysis: vi.fn() }));
vi.mock('@seo/db', () => ({ db: { crawl: { findUnique: mocks.crawl, findFirst: mocks.previous }, aiAnalysis: { findUnique: mocks.analysis } } }));
vi.mock('./locale', () => ({ getLocale: async () => 'en' }));
vi.mock('@seo/shared/ai-config', () => ({ getAiConfig: () => ({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() || '' }) }));
vi.mock('./templates', () => ({ getTemplates: async () => [], attachTemplates: (groups: unknown) => groups }));
vi.mock('./report-data', () => ({ signExport: () => 'token' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), redirect: vi.fn(), notFound: vi.fn() }));
import Report from '../app/rapor/[id]/page';
import { LanguageProvider } from '../components/language';
beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'server-test-key');
  vi.clearAllMocks();
  mocks.crawl.mockResolvedValue({ id: 'crawl', rootUrl: 'https://example.test/', normalizedHost: 'example.test', status: 'COMPLETED', findings: [], pages: [], checkedRules: [], processedPages: 2, analyzedHtmlPages: 2, redirectCount: 0, pendingUrls: 0, errorUrls: 0, skippedUrls: 0, score: 90, fullCrawl: false, createdAt: new Date('2026-10-07T12:00:00Z'), completedAt: new Date('2026-10-07T12:00:00Z') });
  mocks.previous.mockResolvedValue(null); mocks.analysis.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
const render = async () => renderToStaticMarkup(React.createElement(LanguageProvider, { locale: 'en', children: await Report({ params: Promise.resolve({ id: 'crawl' }) }) }));
describe('AI card in existing reports', () => {
  it('renders a disabled card and existing exports without querying AI storage when no key exists', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', ''); mocks.analysis.mockRejectedValue(new Error('AI storage unavailable'));
    const html = await render(); expect(html).toContain('Coming soon'); expect(html).toContain('disabled=""');
    for (const type of ['pdf', 'word', 'csv']) expect(html).toContain(`/export/${type}`);
    expect(mocks.analysis).not.toHaveBeenCalled(); expect(html).not.toContain('role="alert"');
  });
  it('shows explicit generation only for completed crawls and keeps exports/findings', async () => { const html = await render(); expect(html).toContain('Generate AI Recommendations'); expect(html).toContain('/export/pdf'); expect(html).toContain('/export/word'); expect(html).toContain('/export/csv'); expect(mocks.analysis).toHaveBeenCalledWith({ where: { crawlId_locale: { crawlId: 'crawl', locale: 'en' } } }); });
  it('shows the saved analysis on report open', async () => { mocks.analysis.mockResolvedValue({ locale: 'en', status: 'COMPLETED', result: { summary: 'Persisted summary', actions: [] }, error: null, generatedAt: new Date('2026-10-07T12:00:00Z') }); const html = await render(); expect(html).toContain('Persisted summary'); expect(html).toContain('Regenerate AI Analysis'); });
  it('keeps partial reports available without AI generation', async () => { const crawl = await mocks.crawl(); mocks.crawl.mockResolvedValue({ ...crawl, status: 'PARTIAL', partialReason: 'Duration limit' }); const html = await render(); expect(html).not.toContain('AI Insights'); expect(html).toContain('/export/pdf'); expect(mocks.analysis).not.toHaveBeenCalled(); });
});
