import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({state:'RUNNING',batch:vi.fn(),run:vi.fn(),drop:vi.fn(),add:vi.fn(),update:vi.fn(),transition:vi.fn(),analyze:vi.fn(),options:[] as any[],stop:vi.fn(),urlUpdate:vi.fn()}));
vi.mock('@seo/db',()=>({db:{crawl:{updateMany:m.transition,update:m.update,findUniqueOrThrow:vi.fn(async()=>({fullCrawl:true,status:m.state,startedAt:null}))},crawlUrl:{updateMany:m.urlUpdate,upsert:vi.fn(),count:vi.fn(async()=>0),findMany:m.batch},page:{count:vi.fn(async()=>0)}}}));
vi.mock('@seo/shared',async()=>{const actual=await vi.importActual<any>('@seo/shared');return {...actual,assertSafeUrl:async(input:string)=>new URL(input)}});
vi.mock('./fetch-safe.js',()=>({safeFetch:async()=>({response:new Response('',{status:404})}),limitedText:vi.fn()}));
vi.mock('./analysis.js',()=>({analyzeStoredPages:m.analyze}));
vi.mock('crawlee',()=>({RequestQueue:{open:async()=>({addRequest:m.add,drop:m.drop,isEmpty:async()=>false})},CheerioCrawler:class{constructor(options:any){m.options.push(options)}run(){return m.run()}stop(){m.stop()}}}));
import {executeCrawl} from './crawl.js';
beforeEach(()=>{vi.clearAllMocks();m.options.length=0;m.state='QUEUED';m.transition.mockImplementation(async(input:any)=>{if(input.data.status==='RUNNING'){m.state='RUNNING';return {count:1}}return {count:m.state==='RUNNING'?1:0}});m.batch.mockResolvedValue([]);m.run.mockResolvedValue(undefined);m.analyze.mockResolvedValue(undefined)});
describe('crawl lifecycle boundaries',()=>{
  it('persists recovery metadata before changing the DB generation',async()=>{
    const onClaim=vi.fn(async(startedAt:Date,previous:Date|null)=>{
      expect(startedAt).toBeInstanceOf(Date);expect(previous).toBeNull();
      expect(m.transition).not.toHaveBeenCalled();
    });
    await executeCrawl('crawl','https://example.test/',false,onClaim);
    expect(onClaim).toHaveBeenCalledOnce();
    expect(m.transition.mock.calls[0][0].data.startedAt).toEqual(onClaim.mock.calls[0][0]);
  });
  it('does not allow a second recovery of the same crawl while the first is alive',async()=>{
    m.state='RUNNING';
    m.batch.mockResolvedValueOnce([{id:'url',normalized:'https://example.test/a/',depth:0}]).mockResolvedValue([]);
    let release!:()=>void;
    m.run.mockImplementationOnce(()=>new Promise<void>(r=>{release=r}));
    const first=executeCrawl('crawl','https://example.test/',true);
    try {
      while(!release)await new Promise(r=>setTimeout(r,1));
      await expect(executeCrawl('crawl','https://example.test/',true)).rejects.toThrow('already executing');
      expect(m.transition.mock.calls.filter(([q])=>q.data.status==='RUNNING')).toHaveLength(1);
      expect(m.transition.mock.calls[0][0].where).toEqual({id:'crawl',status:'RUNNING',startedAt:null});
    }finally{release();await first}
  });
  it.each([401,403,404,408,429])('preserves retry classification for HTTP %s',async status=>{
    m.batch.mockResolvedValueOnce([{id:'url',normalized:'https://example.test/a/',depth:0}]).mockResolvedValue([]);
    m.run.mockImplementationOnce(async()=>{
      const options=m.options[0], request={url:'https://example.test/a/',userData:{},noRetry:false};
      expect(options.sessionPoolOptions.blockedStatusCodes).toEqual([]);
      await expect(options.requestHandler({request,response:{statusCode:status,headers:{'content-type':'text/html'}}})).rejects.toThrow(`HTTP ${status}`);
      expect(request.noRetry).toBe(![408,429].includes(status));
    });
    await executeCrawl('crawl','https://example.test/');
  });
  it('enforces duration during a cooldown and returns unstarted URLs before partial analysis',async()=>{
    m.batch.mockResolvedValueOnce([{id:'url',normalized:'https://example.test/a/',depth:0}]).mockResolvedValue([]);
    const initial=Date.now(), now=vi.spyOn(Date,'now').mockReturnValue(initial);
    try {
      m.run.mockImplementationOnce(async()=>{
        now.mockReturnValue(initial+22*60*60*1000);
        expect(await m.options[0].autoscaledPoolOptions.isTaskReadyFunction()).toBe(false);
      });
      await executeCrawl('crawl','https://example.test/');
      expect(m.stop).toHaveBeenCalledOnce();
      expect(m.analyze).toHaveBeenCalledWith('crawl',false,'https://example.test/robots.txt',true,false);
      expect(m.transition).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status:'PARTIAL'})}));
    } finally {now.mockRestore()}
  });
  it('allows pause during a long Retry-After and restores unstarted URLs for resume',async()=>{
    m.batch.mockResolvedValueOnce([{id:'url',normalized:'https://example.test/a/',depth:0}]).mockResolvedValue([]);
    m.run.mockImplementationOnce(async()=>{
      const options=m.options[0];
      await options.postNavigationHooks[0]({request:{retryCount:0},response:{statusCode:429,headers:{'retry-after':'3600'},on:vi.fn()},log:{warning:vi.fn()}});
      m.state='PAUSED';
      expect(await options.autoscaledPoolOptions.isTaskReadyFunction()).toBe(false);
      expect(m.stop).toHaveBeenCalledOnce();
    });
    await executeCrawl('crawl','https://example.test/');
    expect(m.urlUpdate).toHaveBeenLastCalledWith({where:{crawlId:'crawl',status:'PROCESSING'},data:{status:'DISCOVERED'}});
    expect(m.analyze).not.toHaveBeenCalled();
  });
  it('shares site admission across concurrent crawl jobs and releases it afterwards',async()=>{
    m.batch.mockResolvedValueOnce([{id:'one',normalized:'https://example.test/a/',depth:0}]).mockResolvedValueOnce([{id:'two',normalized:'https://example.test/b/',depth:0}]).mockResolvedValue([]);
    let release!:()=>void;
    const hold=new Promise<void>(r=>{release=r});
    m.run.mockImplementation(()=>hold);
    const runs=[executeCrawl('one','https://example.test/'),executeCrawl('two','https://example.test/')];
    try {
      while(m.options.length<2)await new Promise(r=>setTimeout(r,1));
      expect(await m.options[0].autoscaledPoolOptions.isTaskReadyFunction()).toBe(true);
      expect(await m.options[1].autoscaledPoolOptions.isTaskReadyFunction()).toBe(false);
    } finally {release();await Promise.all(runs)}
    m.state='QUEUED';
    m.batch.mockResolvedValueOnce([{id:'new',normalized:'https://example.test/c/',depth:0}]).mockResolvedValue([]);
    m.run.mockImplementationOnce(async()=>expect(await m.options[2].autoscaledPoolOptions.isTaskReadyFunction()).toBe(true));
    await executeCrawl('new','https://example.test/');
  });
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
