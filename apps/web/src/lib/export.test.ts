import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {inflateRawSync} from 'node:zlib';
import {translator,type Locale} from '@seo/shared/i18n';
import {createPdfReport} from './pdf-report';
import {createDocxReport} from './docx-report';
import {reportFilename,verifyExport,signExport,type ReportData} from './report-data';
const data=(locale:Locale):ReportData=>({locale,crawl:{id:'sample',host:'example.test',rootUrl:'https://example.test/',status:'COMPLETED',createdAt:new Date('2026-09-24T10:00:00Z'),completedAt:new Date('2026-09-24T10:15:00Z'),processed:2,discovered:2,pending:0,errors:0,html:2,redirects:0,skipped:0,fullCrawl:true,partialReason:null},counts:{critical:0,warning:1,info:0},score:94,previousScore:null,passed:[{code:'H1_MISSING',title:translator(locale)('m247')}],findings:[{code:'TITLE_MISSING',severity:'WARNING',title:translator(locale)('m241'),description:translator(locale)('m242'),recommendation:translator(locale)('m243'),urls:['https://example.test/a/'],groups:[{label:null,urls:['https://example.test/a/']}],templateHits:[],evidence:['{"URL":"https://example.test/a/"}']}],templates:[],excluded:[],comparison:{new:1,ongoing:0,resolved:0,unverified:0,hasPrevious:false}});
function zipText(buffer:Buffer){let offset=0,text='';while(offset+30<buffer.length&&buffer.readUInt32LE(offset)===0x04034b50){const method=buffer.readUInt16LE(offset+8),size=buffer.readUInt32LE(offset+18),nameSize=buffer.readUInt16LE(offset+26),extraSize=buffer.readUInt16LE(offset+28),start=offset+30+nameSize+extraSize;const name=buffer.subarray(offset+30,offset+30+nameSize).toString();const payload=buffer.subarray(start,start+size);if(name.endsWith('.xml'))text+=(method===8?inflateRawSync(payload):payload).toString();offset=start+size}return text}
beforeEach(()=>vi.stubEnv('EXPORT_SIGNING_SECRET', 'test-only-signing-value'.repeat(3)));
afterEach(()=>vi.unstubAllEnvs());
describe('document export regressions',()=>{
  it.each(['tr','en'] as Locale[])('generates PDF and Word in %s',async locale=>{
    const report=data(locale),pdf=await createPdfReport(report),word=await createDocxReport(report);
    expect(pdf.subarray(0,5).toString()).toBe('%PDF-');
    const xml=zipText(word);expect(xml).toContain(locale==='en'?'Executive summary':'Yönetici özeti');expect(xml).toContain(locale==='en'?'Missing or empty meta title':'Eksik veya boş sayfa başlığı');expect(xml).toContain('https://example.test/a/');
    expect(xml).not.toMatch(/undefined|\[object Object\]|>m\d+</);
    if(locale==='en')expect(xml).not.toMatch(/Tarama tarihi|Yönetici özeti|Nasıl|Düzeltme/);
    expect(reportFilename(report,'pdf')).not.toMatch(/[\/\\]/);
    expect(translator(locale)('m086')).toBe('SEO Analyzer');
  });
  it('rejects malformed and altered export tokens',()=>{
    const token=signExport('sample');expect(verifyExport('sample',token)).toBe(true);expect(verifyExport('other',token)).toBe(false);expect(verifyExport('sample',null)).toBe(false);expect(verifyExport('sample',token+'garbage')).toBe(false);
  });
  it.each(['', 'short', 'yerel-gelistirme-icin-degistirin'])('disables signing with an absent or insecure configuration: %s', secret => {
    vi.stubEnv('EXPORT_SIGNING_SECRET', secret);
    expect(signExport('sample')).toBe('');
    expect(verifyExport('sample', 'a'.repeat(64))).toBe(false);
  });
  it.each(['tr', 'en'] as Locale[])('discloses unverified differences in a partial %s Word export', async locale => {
    const report = data(locale); report.crawl.status = 'PARTIAL'; report.comparison = { new: 0, ongoing: 0, resolved: 0, unverified: 2, hasPrevious: true };
    const xml = zipText(await createDocxReport(report));
    expect(xml).toContain(`${translator(locale)('comparison.unverified')}: 2`);
    expect(xml).toContain(translator(locale)('comparison.scope'));
  });
});
