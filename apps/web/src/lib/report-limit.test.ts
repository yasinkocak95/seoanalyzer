import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({count:vi.fn(),findUnique:vi.fn()}));
vi.mock('@seo/db',()=>({db:{finding:{count:mocks.count},crawl:{findUnique:mocks.findUnique}}}));
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
});
