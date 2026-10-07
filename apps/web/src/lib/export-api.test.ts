import { beforeEach, it, expect, vi } from 'vitest';
import { translator } from '@seo/shared/i18n';
const mocks = vi.hoisted(() => ({ data: vi.fn(), verify: vi.fn(), guard: vi.fn() }));
vi.mock('./report-data', async original => ({ ...await original<typeof import('./report-data')>(), getReportData: mocks.data, verifyExport: mocks.verify }));
vi.mock('./access', () => ({ requireCrawl: mocks.guard }));
vi.mock('./locale', () => ({ getLocale: async () => 'en' }));
import { GET as pdf } from '../app/api/crawls/[id]/export/pdf/route';
import { GET as word } from '../app/api/crawls/[id]/export/word/route';
beforeEach(() => { vi.clearAllMocks(); mocks.verify.mockReturnValue(true); mocks.guard.mockResolvedValue('owner'); });
it.each([pdf, word])('does not disclose database/provider details in export failure responses', async get => {
  mocks.data.mockRejectedValue(new Error('postgresql://private:password@internal-db:5432/customer'));
  const r = await get(new Request('https://example.com/api/crawls/c/export?token=valid'), { params: Promise.resolve({ id: 'c' }) });
  expect(r.status).toBe(503); expect(await r.json()).toEqual({ error: translator('en')('saas.error') });
});
it.each([pdf, word])('returns a localized size boundary instead of a server error', async get => {
  mocks.data.mockRejectedValue(new Error(translator('en')('m093')));
  const r = await get(new Request('https://example.com/api/crawls/c/export?token=valid'), { params: Promise.resolve({ id: 'c' }) });
  expect(r.status).toBe(413);
});
