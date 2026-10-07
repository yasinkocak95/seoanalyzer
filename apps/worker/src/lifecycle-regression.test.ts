import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({state:'RUNNING',batch:vi.fn(),run:vi.fn(),drop:vi.fn(),add:vi.fn(),update:vi.fn(),transition:vi.fn(),analyze:vi.fn()}));
vi.mock('@seo/db',()=>({db:{crawl:{updateMany:m.transition,update:m.update,findUniqueOrThrow:vi.fn(async()=>({fullCrawl:true,status:m.state}))},crawlUrl:{updateMany:vi.fn(),upsert:vi.fn(),count:vi.fn(async()=>0),findMany:m.batch},page:{count:vi.fn(async()=>0)}}}));
vi.mock('@seo/shared',async()=>{const actual=await vi.importActual<any>('@seo/shared');return {...actual,assertSafeUrl:async(input:string)=>new URL(input)}});
vi.mock('./fetch-safe.js',()=>({safeFetch:async()=>({response:new Response('',{status:404})}),limitedText:vi.fn()}));
vi.mock('./analysis.js',()=>({analyzeStoredPages:m.analyze}));
vi.mock('crawlee',()=>({RequestQueue:{open:async()=>({addRequest:m.add,drop:m.drop})},CheerioCrawler:class{run(){return m.run()}}}));
import {executeCrawl} from './crawl.js';
beforeEach(()=>{vi.clearAllMocks();m.state='RUNNING';m.transition.mockImplementation(async(input:any)=>({count:input.data.status==='RUNNING'||m.state==='RUNNING'?1:0}));m.batch.mockResolvedValue([]);m.run.mockResolvedValue(undefined);m.analyze.mockResolvedValue(undefined)});
describe('crawl lifecycle boundaries',()=>{
  it('finishes an empty exhausted queue and keeps progress below 100 until completion',async()=>{
    await executeCrawl('crawl','https://example.test/');
    expect(m.update.mock.calls.every(([v])=>v.data.progress<100)).toBe(true);
    expect(m.transition).toHaveBeenLastCalledWith(expect.objectContaining({where:{id:'crawl',status:'RUNNING'},data:expect.objectContaining({status:'COMPLETED',progress:100})}));
  });
  it('preserves a pause arriving during final analysis',async()=>{
    m.analyze.mockImplementationOnce(async()=>{m.state='PAUSED'});
    await executeCrawl('crawl','https://example.test/');
    expect(m.transition).toHaveBeenLastCalledWith(expect.objectContaining({where:{id:'crawl',status:'RUNNING'}}));
    expect(await m.transition.mock.results.at(-1)!.value).toEqual({count:0});
  });
  it('does not enter a crawl whose atomic claim was lost',async()=>{
    m.transition.mockResolvedValueOnce({count:0});await executeCrawl('crawl','https://example.test/');expect(m.batch).not.toHaveBeenCalled();
  });
  it.each([false,true])('drops persistent batch storage when the crawler fails: %s',async failure=>{
    m.batch.mockResolvedValueOnce([{id:'url',normalized:'https://example.test/a/',depth:0}]).mockResolvedValue([]);
    if(failure)m.run.mockRejectedValueOnce(new Error('worker interrupted'));
    const result=executeCrawl('crawl','https://example.test/');
    if(failure)await expect(result).rejects.toThrow('worker interrupted');else await result;
    expect(m.drop).toHaveBeenCalledOnce();expect(m.add).toHaveBeenCalledWith(expect.objectContaining({url:'https://example.test/a/',uniqueKey:'https://example.test/a/'}));
  });
});
