import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({findUnique:vi.fn(),updateMany:vi.fn(),execute:vi.fn(),set:vi.fn(),eval:vi.fn(),options:{} as any,processor:undefined as unknown as (job:any)=>Promise<void>,events:new Map<string,Function>(),redisEvents:new Map<string,Function>(),getJobs:vi.fn(async()=>[] as any[])}));
vi.mock('@seo/db',()=>({db:{crawl:{findUnique:mocks.findUnique,updateMany:mocks.updateMany}}}));
vi.mock('./verification.js',()=>({startVerificationWorker:()=>({reconcile:vi.fn(async()=>{})})}));
vi.mock('./schedules.js',()=>({scheduleRunner:()=>vi.fn(async()=>{})}));
vi.mock('./crawl-runtime.js',async()=>({...await vi.importActual<any>('./crawl-runtime.js'),runCrawlThread:mocks.execute}));
vi.mock('./ai-worker.js',()=>({startAiWorker:()=>({reconcile:vi.fn(),enqueueCompleted:vi.fn(async()=>{})})}));
vi.mock('ioredis',()=>({Redis:class {set(...args:any[]){return mocks.set(...args)}eval(...args:any[]){return mocks.eval(...args)}on(name:string,fn:Function){mocks.redisEvents.set(name,fn);return this}}}));
vi.mock('bullmq',()=>({DelayedError:class extends Error{},Queue:class{on(){return this}getJobs(){return mocks.getJobs()}},Worker:class{constructor(_name:string,fn:(job:any)=>Promise<void>,options:any){mocks.processor=fn;mocks.options=options}on(name:string,fn:Function){mocks.events.set(name,fn);return this}}}));
import {reconcileFailedJobs} from './index.js';
beforeEach(()=>{vi.clearAllMocks();mocks.set.mockResolvedValue('OK');mocks.eval.mockResolvedValue(1);mocks.findUnique.mockResolvedValue({status:'QUEUED',startedAt:null});mocks.updateMany.mockResolvedValue({count:1});mocks.execute.mockResolvedValue(undefined);mocks.getJobs.mockResolvedValue([])});
const job=(attemptsMade=0,stalledCounter=0)=>({id:'job',data:{crawlId:'crawl',rootUrl:'https://example.test/'} as any,attemptsMade,stalledCounter,opts:{attempts:2},moveToDelayed:vi.fn(async()=>{}),updateData:vi.fn(async function(this:any,data:any){this.data=data})});
describe('worker recovery regressions',()=>{
 it('recovers an orphan RUNNING crawl only after acquiring its exclusive crawl lease',async()=>{
  mocks.findUnique.mockResolvedValue({status:'RUNNING',startedAt:new Date(1000)});
  await mocks.processor(job());
  expect(mocks.execute.mock.calls[0][0].recoverRunning).toBe(true);
 });
 it('reconciles a crash between durable preparation and DB claim without touching a newer generation',async()=>{
  const previous='2026-10-08T10:00:00.000Z',prepared='2026-10-08T10:00:01.000Z';
  mocks.getJobs.mockResolvedValue([{data:{crawlId:'crawl',executionStartedAt:prepared,executionPreviousStartedAt:previous},finishedOn:Date.parse(prepared)+1000,failedReason:'crash before DB claim'}]);
  await reconcileFailedJobs();
  expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({OR:[{startedAt:new Date(prepared)},{startedAt:new Date(previous)}]})}));
 });
 it('does not update a crawl when the initial DB read did not establish its generation',async()=>{
  mocks.findUnique.mockRejectedValueOnce(new Error('DB offline'));
  await expect(mocks.processor(job())).rejects.toThrow('DB offline');expect(mocks.updateMany).not.toHaveBeenCalled();
 });
 it('fences an unclaimed failure with null startedAt instead of overwriting a new owner',async()=>{
  mocks.set.mockRejectedValueOnce(new Error('lease unavailable'));
  await expect(mocks.processor(job())).rejects.toThrow('lease unavailable');
  expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({startedAt:null})}));
 });
 it('queues a retry instead of making a retryable job permanently FAILED',async()=>{
  mocks.execute.mockRejectedValueOnce(new Error('DB transient failure'));
  await expect(mocks.processor(job())).rejects.toThrow('transient');expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'QUEUED'})}));
  await mocks.processor(job(1));expect(mocks.execute).toHaveBeenLastCalledWith({crawlId:'crawl',rootUrl:'https://example.test/',recoverRunning:true},expect.any(AbortSignal),undefined,expect.any(Function));
 });
 it('marks FAILED only when job retries are exhausted',async()=>{
  mocks.execute.mockRejectedValue(new Error('failure'));await expect(mocks.processor(job(1))).rejects.toThrow();expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'FAILED'})}));
 });
 it('recovers RUNNING state when BullMQ identifies a stalled job',async()=>{mocks.findUnique.mockResolvedValue({status:'RUNNING'});await mocks.processor(job(0,1));expect(mocks.execute).toHaveBeenCalledWith({crawlId:'crawl',rootUrl:'https://example.test/',recoverRunning:true},expect.any(AbortSignal),undefined,expect.any(Function))});
 it('persists the claim generation before processing and scopes failure updates to that generation',async()=>{
  const running=job();const generation='2026-10-08T10:00:00.001Z';
  mocks.execute.mockImplementationOnce(async(_data,_signal,_entry,onClaim)=>{await onClaim(generation);throw new Error('processor failure')});
  await expect(mocks.processor(running)).rejects.toThrow('processor failure');
  expect(running.updateData).toHaveBeenCalledWith(expect.objectContaining({executionStartedAt:generation}));
  expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({startedAt:new Date(generation)})}));
 });
 it('does not let late terminal reconciliation overwrite a successor that started before the old failure finished',async()=>{
  const generation='2026-10-08T10:00:00.000Z',successor=new Date('2026-10-08T10:00:01.000Z');
  mocks.getJobs.mockResolvedValue([{data:{crawlId:'crawl',executionStartedAt:generation},finishedOn:successor.getTime()+1000,failedReason:'old stall'}]);
  mocks.updateMany.mockImplementation(async({where})=>({count:where.startedAt?.getTime()===successor.getTime()?1:0}));
  await reconcileFailedJobs();
  expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({startedAt:new Date(generation)})}));
  expect(await mocks.updateMany.mock.results[0].value).toEqual({count:0});
 });
 it('keeps BullMQ lock defaults and uses one crawl slot for the 1 GiB budget',()=>{
  expect(mocks.options).toMatchObject({concurrency:1,lockDuration:30000,lockRenewTime:15000,stalledInterval:30000,maxStalledCount:1});
 });
 it('delays an overlapping crawl job without resetting status or using a retry',async()=>{
  mocks.set.mockResolvedValue(null);const duplicate=job();
  await expect(mocks.processor(duplicate)).rejects.toThrow();
  expect(duplicate.moveToDelayed).toHaveBeenCalledOnce();
  expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.updateMany).not.toHaveBeenCalled();
 });
 it.each(['lockRenewalFailed','stalled','redisClose'])('cancels the old owner on %s without rewriting recovery state',async event=>{
  let started!:()=>void;
  const entered=new Promise<void>(r=>{started=r});
  mocks.execute.mockImplementationOnce(async(_data,signal)=>{started();await new Promise<void>(r=>signal.addEventListener('abort',()=>r(),{once:true}))});
  const running=mocks.processor(job());const assertion=expect(running).rejects.toThrow('ownership lost');
  await entered;
  if(event==='redisClose')mocks.redisEvents.get('close')!();else mocks.events.get(event)!(event==='stalled'?'job':['job']);
  await assertion;expect(mocks.updateMany).not.toHaveBeenCalled();
 });
 it.each(['FAILED','COMPLETED','PAUSED'])('does not reprocess %s',async status=>{mocks.findUnique.mockResolvedValue({status});await mocks.processor(job());expect(mocks.execute).not.toHaveBeenCalled()});
 it('repairs terminal job state after a database outage',async()=>{mocks.getJobs.mockResolvedValue([{data:{crawlId:'orphan'},finishedOn:1000,failedReason:'Database offline'}]);await reconcileFailedJobs();expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:'orphan',status:{in:['QUEUED','RUNNING']},OR:[{startedAt:null},{startedAt:{lte:new Date(1000)}}]}),data:expect.objectContaining({status:'FAILED'})}))});
 it('handles worker and Redis error events',()=>expect(mocks.events.has('error')).toBe(true));
 it('keeps old failed jobs from marking a newer resumed execution FAILED', async () => {
  const resumedAt = new Date(2000);
  mocks.getJobs.mockResolvedValue([{ data: { crawlId: 'resumed' }, finishedOn: 1000, failedReason: 'Old paused batch failed' }]);
  mocks.updateMany.mockImplementation(async ({ where }) => ({ count: where.OR.some((condition: any) => condition.startedAt === null ? false : resumedAt <= condition.startedAt.lte) ? 1 : 0 }));
  await reconcileFailedJobs();
  expect(await mocks.updateMany.mock.results[0].value).toEqual({ count: 0 });
 });
});
