import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({findUnique:vi.fn(),updateMany:vi.fn(),execute:vi.fn(),processor:undefined as unknown as (job:any)=>Promise<void>,events:new Map<string,Function>(),getJobs:vi.fn(async()=>[] as any[])}));
vi.mock('@seo/db',()=>({db:{crawl:{findUnique:mocks.findUnique,updateMany:mocks.updateMany}}}));
vi.mock('./crawl.js',()=>({executeCrawl:mocks.execute}));
vi.mock('./ai-worker.js',()=>({startAiWorker:()=>({reconcile:vi.fn()})}));
vi.mock('ioredis',()=>({Redis:class {on(){return this}}}));
vi.mock('bullmq',()=>({Queue:class{on(){return this}getJobs(){return mocks.getJobs()}},Worker:class{constructor(_name:string,fn:(job:any)=>Promise<void>){mocks.processor=fn}on(name:string,fn:Function){mocks.events.set(name,fn);return this}}}));
import {reconcileFailedJobs} from './index.js';
beforeEach(()=>{vi.clearAllMocks();mocks.findUnique.mockResolvedValue({status:'QUEUED'});mocks.updateMany.mockResolvedValue({count:1});mocks.execute.mockResolvedValue(undefined);mocks.getJobs.mockResolvedValue([])});
const job=(attemptsMade=0,stalledCounter=0)=>({data:{crawlId:'crawl',rootUrl:'https://example.test/'},attemptsMade,stalledCounter,opts:{attempts:2}});
describe('worker recovery regressions',()=>{
 it('queues a retry instead of making a retryable job permanently FAILED',async()=>{
  mocks.execute.mockRejectedValueOnce(new Error('DB transient failure'));
  await expect(mocks.processor(job())).rejects.toThrow('transient');expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'QUEUED'})}));
  await mocks.processor(job(1));expect(mocks.execute).toHaveBeenLastCalledWith('crawl','https://example.test/',true);
 });
 it('marks FAILED only when job retries are exhausted',async()=>{
  mocks.execute.mockRejectedValue(new Error('failure'));await expect(mocks.processor(job(1))).rejects.toThrow();expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'FAILED'})}));
 });
 it('recovers RUNNING state when BullMQ identifies a stalled job',async()=>{mocks.findUnique.mockResolvedValue({status:'RUNNING'});await mocks.processor(job(0,1));expect(mocks.execute).toHaveBeenCalledWith('crawl','https://example.test/',true)});
 it.each(['FAILED','COMPLETED','PAUSED'])('does not reprocess %s',async status=>{mocks.findUnique.mockResolvedValue({status});await mocks.processor(job());expect(mocks.execute).not.toHaveBeenCalled()});
 it('repairs terminal job state after a database outage',async()=>{mocks.getJobs.mockResolvedValue([{data:{crawlId:'orphan'},failedReason:'Database offline'}]);await reconcileFailedJobs();expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:'orphan',status:{in:['QUEUED','RUNNING']}},data:expect.objectContaining({status:'FAILED'})}))});
 it('handles worker and Redis error events',()=>expect(mocks.events.has('error')).toBe(true));
});
