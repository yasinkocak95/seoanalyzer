vi.mock('@/lib/access', () => ({ requireCrawl: async () => 'owner', ownerHash: async () => 'owner', sameOrigin: (request: Request) => !request.headers.get('origin') || request.headers.get('origin') === new URL(request.url).origin }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => true }));
import { describe,it,expect,vi,beforeEach,afterEach } from 'vitest';
const mocks=vi.hoisted(()=>({count:vi.fn(),findUnique:vi.fn(),getTemplates:vi.fn(async()=>[])}));
vi.mock('@seo/db',()=>({db:{crawl:{findUnique:mocks.findUnique},finding:{count:mocks.count}}}));
vi.mock('./locale',()=>({getLocale:async()=>'tr'}));
vi.mock('./templates',()=>({getTemplates:mocks.getTemplates}));
import { GET } from '../app/api/crawls/[id]/export/csv/route';
import { signExport } from './report-data';
import {tr} from '@seo/shared/i18n';
beforeEach(()=>{ vi.clearAllMocks(); vi.stubEnv('EXPORT_SIGNING_SECRET', 'test-only-signing-value'.repeat(3)); mocks.count.mockResolvedValue(0); });
afterEach(()=>vi.unstubAllEnvs());
it.each(['tr','en'])('preserves CSV technical contract and neutralizes formulas in %s',async locale=>{
 const finding={code:'DUPLICATE_TITLE',severity:'WARNING',title:tr.m241,description:tr.m242,recommendation:tr.m243,affectedUrls:['https://example.test/a/'],evidence:[{url:'https://example.test/a/',deger:'   =HYPERLINK("https://evil.test")',hedef:'https://example.test/Türkçe'}]};
 mocks.findUnique.mockResolvedValue({status:'COMPLETED',findings:[finding],createdAt:new Date(),completedAt:null,normalizedHost:'example.test'});
 const response=await GET(new Request(`http://localhost/api/crawls/sample/export/csv?token=${signExport('sample')}&lang=${locale}`),{params:Promise.resolve({id:'sample'})});
 expect(response.status).toBe(200);const csv=await response.text();expect(csv).toContain('DUPLICATE_TITLE');expect(csv).toContain("'   =HYPERLINK");expect(csv).toContain('https://example.test/a/');expect(csv).toContain('https://example.test/Türkçe');expect(csv).toContain('hedef:');expect(csv).toContain(locale==='en'?'Missing or empty meta title':'Eksik veya boş sayfa başlığı');expect(csv).toContain('";"');
});
it('rejects invalid export token before reading data',async()=>{mocks.findUnique.mockClear();const response=await GET(new Request('http://localhost/api/crawls/sample/export/csv?token=bad'),{params:Promise.resolve({id:'sample'})});expect(response.status).toBe(403);expect(mocks.findUnique).not.toHaveBeenCalled()});
it('rejects oversized CSV before loading findings', async () => {
  mocks.count.mockResolvedValue(2001);
  const r = await GET(new Request(`http://localhost/api/crawls/sample/export/csv?token=${signExport('sample')}`), { params: Promise.resolve({ id: 'sample' }) });
  expect(r.status).toBe(413); expect(mocks.findUnique).not.toHaveBeenCalled();
});
it('returns a safe JSON error when the CSV database is unavailable', async () => {
  mocks.count.mockRejectedValue(new Error('database credentials should stay private'));
  const r = await GET(new Request(`http://localhost/api/crawls/sample/export/csv?token=${signExport('sample')}`), { params: Promise.resolve({ id: 'sample' }) });
  expect(r.status).toBe(503); expect(await r.text()).not.toContain('credentials');
});
it('rejects an old CSV signature while a partial crawl is resumed', async () => {
  mocks.findUnique.mockResolvedValue({ status: 'RUNNING', findings: [] });
  const r = await GET(new Request(`http://localhost/api/crawls/sample/export/csv?token=${signExport('sample')}`), { params: Promise.resolve({ id: 'sample' }) });
  expect(r.status).toBe(409);
});
