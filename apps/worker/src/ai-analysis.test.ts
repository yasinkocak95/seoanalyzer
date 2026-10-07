import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ crawl: vi.fn(), findings: vi.fn() }));
vi.mock('@seo/db', () => ({ db: { crawl: { findUnique: mocks.crawl }, finding: { findMany: mocks.findings } } }));
vi.mock('@seo/shared/ai-config', () => ({ getAiConfig: () => ({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() || '', model: 'claude-sonnet-4-6' }) }));
import { generateAiAnalysis, aiPageUrl } from './ai-analysis.js';
const result = { summary: 'Plan', actions: [{ priority: 'High', title: 'Titles', description: 'Missing titles', action: 'Write titles', findingCodes: ['TITLE_MISSING'], affectedCount: 999, affectedPages: ['https://invented.test'] }] };
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('ANTHROPIC_API_KEY', 'test-server-secret'); vi.stubGlobal('fetch', fetchMock);
  mocks.crawl.mockResolvedValue({ status: 'COMPLETED', rootUrl: 'https://example.test/', analyzedHtmlPages: 2, score: 70, processedPages: 2, skippedUrls: 0 });
  mocks.findings.mockResolvedValue([{ code: 'TITLE_MISSING', severity: 'WARNING', title: 'Missing', description: 'Missing title', recommendation: 'Add title', affectedUrls: ['https://example.test/a?token=private', 'https://example.test/b'] }]);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(result) }] })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('Claude analysis boundary', () => {
  it.each(['tr', 'en'] as const)('sends bounded crawl facts and asks for %s prose', async locale => {
    const { result: generated } = await generateAiAnalysis('crawl', locale);
    const [endpoint, options] = fetchMock.mock.calls[0]; const payload = JSON.parse(options.body);
    expect(endpoint).toBe('https://api.anthropic.com/v1/messages'); expect(options.headers['x-api-key']).toBe('test-server-secret');
    expect(payload.system).toContain(locale === 'tr' ? 'Turkish' : 'English'); expect(payload.output_config.format.type).toBe('json_schema');
    expect(options.body).not.toMatch(/test-server-secret|token=private/);
    expect(generated.actions[0]).toMatchObject({ affectedCount: 2, affectedPages: ['https://example.test/a', 'https://example.test/b'] });
  });
  it('fails safely if no key is configured', async () => { vi.stubEnv('ANTHROPIC_API_KEY', ''); await expect(generateAiAnalysis('crawl', 'en')).rejects.toThrow('ai.notConfigured'); expect(fetchMock).not.toHaveBeenCalled(); });
  it.each([401, 429, 503])('does not expose provider response body on HTTP %s', async status => {
    fetchMock.mockResolvedValue(new Response('secret request details', { status }));
    await expect(generateAiAnalysis('crawl', 'en')).rejects.toMatchObject({ message: status === 401 ? 'ai.notConfigured' : 'ai.providerUnavailable', retryable: status !== 401 });
  });
  it('rejects truncated responses', async () => { fetchMock.mockResolvedValue(new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [{ type: 'text', text: JSON.stringify(result) }] }))); await expect(generateAiAnalysis('crawl', 'en')).rejects.toThrow('ai.invalidResponse'); });
  it('rejects invented finding codes', async () => { fetchMock.mockResolvedValue(new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ ...result, actions: [{ ...result.actions[0], findingCodes: ['INVENTED'] }] }) }] }))); await expect(generateAiAnalysis('crawl', 'en')).rejects.toThrow('ai.invalidResponse'); });
  it('allows no actions when crawl has no findings', async () => { mocks.findings.mockResolvedValue([]); fetchMock.mockResolvedValue(new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ summary: 'No issues', actions: [] }) }] }))); expect((await generateAiAnalysis('crawl', 'en')).result.actions).toEqual([]); });
  it('rejects oversized crawls before making a paid request', async () => { mocks.findings.mockResolvedValue(Array(2001).fill({})); await expect(generateAiAnalysis('crawl', 'en')).rejects.toThrow('ai.inputTooLarge'); expect(fetchMock).not.toHaveBeenCalled(); });
  it('strips sensitive URL components and ignores non-web URLs', () => { expect(aiPageUrl('https://user:password@example.test/path?token=secret#value')).toBe('https://example.test/path'); expect(aiPageUrl('javascript:alert(1)')).toBeNull(); });
});
