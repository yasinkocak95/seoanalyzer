import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({count:vi.fn(),findUnique:vi.fn(),previous:vi.fn(),excludedCount:vi.fn(),excluded:vi.fn()}));
vi.mock('@seo/db',()=>({db:{finding:{count:mocks.count},crawl:{findUnique:mocks.findUnique,findFirst:mocks.previous},crawlUrl:{count:mocks.excludedCount,findMany:mocks.excluded}}}));
vi.mock('./templates',()=>({getTemplates:async()=>[],attachTemplates:(groups:unknown)=>groups}));
import {getReportData} from './report-data';
beforeEach(()=>vi.clearAllMocks());
describe('report size boundary',()=>{
  it.each(['tr','en'] as const)('rejects oversized %s reports before loading their findings',async locale=>{
    mocks.count.mockResolvedValue(2001);
    await expect(getReportData('large',locale)).rejects.toThrow();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it('permits a report at the existing finding limit to reach the crawl lookup',async()=>{
    mocks.count.mockResolvedValue(2000);mocks.findUnique.mockResolvedValue(null);
    await expect(getReportData('missing')).rejects.toThrow('Rapor bulunamadı');
    expect(mocks.findUnique).toHaveBeenCalledOnce();
  });
  it.each(['PARTIAL', 'COMPLETED'])('does not invent resolved export findings for %s coverage', async status => {
    mocks.count.mockResolvedValue(0); mocks.excludedCount.mockResolvedValue(0); mocks.excluded.mockResolvedValue([]);
    mocks.findUnique.mockResolvedValue({ id: 'c', rootUrl: 'https://example.com/', status, findings: [], errorUrls: 0, skippedUrls: 0, checkedRules: [{ code: 'TITLE_MISSING' }], partialReason: null });
    mocks.previous.mockResolvedValue({ rootUrl: 'https://example.com/', findings: [{ code: 'TITLE_MISSING', title: 'Title missing', severity: 'WARNING', affectedUrls: ['https://example.com/'] }], score: 50 });
    const data = await getReportData('c');
    expect(data.comparison.resolved).toBe(status === 'COMPLETED' ? 1 : 0);
    expect(data.comparison.unverified).toBe(status === 'PARTIAL' ? 1 : 0);
  });
  it('rejects an old signature while the report is being rebuilt', async () => {
    mocks.count.mockResolvedValue(0); mocks.findUnique.mockResolvedValue({ status: 'RUNNING' });
    await expect(getReportData('c')).rejects.toThrow(); expect(mocks.previous).not.toHaveBeenCalled();
  });
  it('bounds the previous snapshot before calculating an export comparison', async () => {
    mocks.count.mockResolvedValue(0); mocks.excludedCount.mockResolvedValue(0);
    mocks.findUnique.mockResolvedValue({ status: 'COMPLETED', findings: [] });
    mocks.previous.mockResolvedValue({ findings: Array(2001).fill({}) });
    await expect(getReportData('c')).rejects.toThrow();
    expect(mocks.previous).toHaveBeenCalledWith(expect.objectContaining({ include: { findings: { take: 2001 } } }));
  });
  it('counts an issue as ongoing when its affected URL fingerprint changes', async () => {
    const finding = { code: 'TITLE_MISSING', title: 'Title missing', description: 'Missing', recommendation: 'Add title', severity: 'WARNING', affectedUrls: ['https://example.com/a'], evidence: [], fingerprint: 'new' };
    mocks.count.mockResolvedValue(1); mocks.excludedCount.mockResolvedValue(0); mocks.excluded.mockResolvedValue([]);
    mocks.findUnique.mockResolvedValue({ status: 'COMPLETED', findings: [finding], errorUrls: 0, skippedUrls: 0 });
    mocks.previous.mockResolvedValue({ findings: [{ ...finding, affectedUrls: ['https://example.com/a', 'https://example.com/b'], fingerprint: 'old' }] });
    const report = await getReportData('c');
    expect(report.comparison).toEqual({ new: 0, ongoing: 1, resolved: 0, unverified: 0, hasPrevious: true });
  });
});
