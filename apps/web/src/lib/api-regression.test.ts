vi.mock('@/lib/access', () => ({ requireCrawl: async () => 'owner', ownerHash: async () => 'owner', sameOrigin: (request: Request) => !request.headers.get('origin') || request.headers.get('origin') === new URL(request.url).origin }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => true }));
import { describe,it,expect,vi,beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({
 crawl:{findFirst:vi.fn(),create:vi.fn(),updateMany:vi.fn(),findUnique:vi.fn(),findMany:vi.fn()},
 queue:{add:vi.fn(),getJobs:vi.fn()},
}));
vi.mock('@seo/db',()=>({db:{crawl:mocks.crawl,$transaction:async(fn:Function)=>fn({crawl:mocks.crawl,$executeRaw:async()=>1})}}));
vi.mock('./queue',()=>({getQueue:()=>mocks.queue}));
vi.mock('./locale',()=>({getLocale:async()=>'en'}));
vi.mock('@seo/shared',()=>({assertSafeUrl:vi.fn(async(url:string)=>new URL(url)),normalizeUrl:(url:string)=>url}));
import { POST } from '../app/api/crawls/route';
import { POST as control } from '../app/api/crawls/[id]/control/route';
import { GET as language } from '../app/api/language/route';
import { proxy } from '../proxy';
beforeEach(()=>{vi.clearAllMocks();mocks.crawl.findFirst.mockResolvedValue(null);mocks.crawl.create.mockResolvedValue({id:'crawl'});mocks.crawl.updateMany.mockResolvedValue({count:1});mocks.queue.add.mockResolvedValue({id:'crawl'});mocks.queue.getJobs.mockResolvedValue([])});
const request=(body:unknown)=>new NextRequest('http://localhost/api/crawls',{method:'POST',body:JSON.stringify(body)});
describe('queue/API state regressions',()=>{
 it('does not leave a QUEUED crawl when Redis fails',async()=>{
  mocks.queue.add.mockRejectedValue(new Error('Redis unavailable'));
  const response=await POST(request({url:'https://example.test/'}));
  expect(response.status).toBe(503);expect((await response.json()).error).toContain('queue');
  expect(mocks.crawl.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:'crawl',status:'QUEUED'},data:expect.objectContaining({status:'FAILED'})}));
 });
 it('reuses a completed crawl without creating duplicate jobs',async()=>{mocks.crawl.findFirst.mockResolvedValue({id:'cached'});const response=await POST(request({url:'https://example.test/'}));expect(await response.json()).toEqual({id:'cached',cached:true});expect(mocks.queue.add).not.toHaveBeenCalled()});
 it.each([null,{}, {url:3}])('validates malformed request %s',async body=>expect((await POST(request(body))).status).toBe(400));
 it('reuses a concurrent active crawl even when force is requested',async()=>{mocks.crawl.findFirst.mockResolvedValueOnce({id:'active',rootUrl:'https://example.test/',status:'RUNNING'});const response=await POST(request({url:'https://example.test/',force:true}));expect(await response.json()).toEqual({id:'active',active:true});expect(mocks.crawl.create).not.toHaveBeenCalled();expect(mocks.queue.add).not.toHaveBeenCalled()});
 it('restores PAUSED if resume enqueue fails',async()=>{
  mocks.crawl.findUnique.mockResolvedValue({id:'crawl',status:'PAUSED',rootUrl:'https://example.test/',statusMessage:'paused'});mocks.queue.add.mockRejectedValue(new Error('Redis down'));
  const response=await control(request({action:'resume'}),{params:Promise.resolve({id:'crawl'})});
  expect(response.status).toBe(503);expect(mocks.crawl.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({where:{id:'crawl',status:'QUEUED'},data:expect.objectContaining({status:'PAUSED'})}));
 });
 it('prevents resume while a paused batch is still active',async()=>{
  mocks.crawl.findUnique.mockResolvedValue({id:'crawl',status:'PAUSED'});mocks.queue.getJobs.mockResolvedValue([{data:{crawlId:'crawl'}}]);expect((await control(request({action:'resume'}),{params:Promise.resolve({id:'crawl'})})).status).toBe(409);expect(mocks.queue.add).not.toHaveBeenCalled();
 });
 it('prevents duplicate resumes after an atomic state claim loses',async()=>{
  mocks.crawl.findUnique.mockResolvedValue({id:'crawl',status:'PAUSED'});mocks.crawl.updateMany.mockResolvedValue({count:0});expect((await control(request({action:'resume'}),{params:Promise.resolve({id:'crawl'})})).status).toBe(409);expect(mocks.queue.add).not.toHaveBeenCalled();
 });
});
describe('language routing',()=>{
 it('persists English from direct landing access and strips forged locale headers',()=>{
  const response=proxy(new NextRequest('https://example.test/en/',{headers:{'x-seo-locale':'tr'}}));expect(response.cookies.get('seo-locale')?.value).toBe('en');expect(response.headers.get('x-middleware-request-x-seo-locale')).toBe('en');
  const tr=proxy(new NextRequest('https://example.test/',{headers:{'x-seo-locale':'en'}}));expect(tr.cookies.get('seo-locale')?.value).toBe('tr');
 });
 it('switches language without external redirects',async()=>{
  const response=await language(new Request('http://localhost/api/language?lang=en&returnTo=%2F%2Fevil.test'));
  expect(response.cookies.get('seo-locale')?.value).toBe('en');expect(new URL(response.headers.get('location')!).hostname).not.toBe('evil.test');
 });
});
