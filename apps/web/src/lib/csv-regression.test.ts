import { describe,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({findUnique:vi.fn(),getTemplates:vi.fn(async()=>[])}));
vi.mock('@seo/db',()=>({db:{crawl:{findUnique:mocks.findUnique}}}));
vi.mock('./locale',()=>({getLocale:async()=>'tr'}));
vi.mock('./templates',()=>({getTemplates:mocks.getTemplates}));
import { GET } from '../app/api/crawls/[id]/export/csv/route';
import { signExport } from './report-data';
import {tr} from '@seo/shared/i18n';
it.each(['tr','en'])('preserves CSV technical contract and neutralizes formulas in %s',async locale=>{
 const finding={code:'DUPLICATE_TITLE',severity:'WARNING',title:tr.m241,description:tr.m242,recommendation:tr.m243,affectedUrls:['https://example.test/a/'],evidence:[{url:'https://example.test/a/',deger:'   =HYPERLINK("https://evil.test")',hedef:'https://example.test/Türkçe'}]};
 mocks.findUnique.mockResolvedValue({findings:[finding],createdAt:new Date(),completedAt:null,normalizedHost:'example.test'});
 const response=await GET(new Request(`http://localhost/api/crawls/sample/export/csv?token=${signExport('sample')}&lang=${locale}`),{params:Promise.resolve({id:'sample'})});
 expect(response.status).toBe(200);const csv=await response.text();expect(csv).toContain('DUPLICATE_TITLE');expect(csv).toContain("'   =HYPERLINK");expect(csv).toContain('https://example.test/a/');expect(csv).toContain('https://example.test/Türkçe');expect(csv).toContain('hedef:');expect(csv).toContain(locale==='en'?'Missing or empty meta title':'Eksik veya boş sayfa başlığı');expect(csv).toContain('";"');
});
it('rejects invalid export token before reading data',async()=>{mocks.findUnique.mockClear();const response=await GET(new Request('http://localhost/api/crawls/sample/export/csv?token=bad'),{params:Promise.resolve({id:'sample'})});expect(response.status).toBe(403);expect(mocks.findUnique).not.toHaveBeenCalled()});
