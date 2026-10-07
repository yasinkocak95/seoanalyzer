import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('/app/package.json');
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
const {Queue,Worker}=require('bullmq');
const {Redis}=require('ioredis');
const {executeCrawl}=await import('/app/apps/worker/dist/crawl.js');
const connection=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:null});
const queue=new Queue('audit-only',{connection});
let worker;
try{
 const crawl=await db.crawl.create({data:{rootUrl:'http://fixture:4010/',normalizedHost:'fixture',fullCrawl:true}});
 worker=new Worker('audit-only',async job=>executeCrawl(job.data.id,'http://fixture:4010/'),{connection});
 worker.on('error',error=>console.error('Audit worker error',error));
 await queue.add('crawl',{id:crawl.id},{jobId:crawl.id,attempts:2});
 const deadline=Date.now()+115000;let result;
 while(Date.now()<deadline){result=await db.crawl.findUnique({where:{id:crawl.id},include:{pages:true,findings:true,crawlUrls:true}});if(result.status==='COMPLETED')break;await new Promise(r=>setTimeout(r,500))}
 assert.equal(result.status,'COMPLETED');assert.equal(result.pendingUrls,0);assert.equal(result.progress,100);
 const page=path=>result.pages.find(p=>p.url==='http://fixture:4010'+path),codes=new Set(result.findings.map(f=>f.code));
 assert.equal(page('/normal').responseKind,'HTML');assert.equal(page('/binary').responseKind,'NON_HTML');assert.equal(page('/xml').responseKind,'NON_HTML');
 assert.equal(page('/missing').statusCode,404);assert.equal(page('/failed').statusCode,500);assert.equal(page('/retry').statusCode,200);assert.equal(page('/timeout').responseKind,'ERROR');
 assert.equal(page('/large').responseKind,'ERROR');assert.equal(page('/stream').responseKind,'ERROR');
 assert.equal(page('/malformed').responseKind,'HTML');assert.equal(page('/slash/').responseKind,'REDIRECT');assert.equal(page('/slash').responseKind,'HTML');
 assert.equal(page('/distinct').responseKind,'HTML');assert.equal(page('/distinct/').responseKind,'HTML');
 assert.equal(result.pages.filter(p=>p.url==='http://fixture:4010/normal').length,1);
 assert.deepEqual(page('/redirect').redirectChain,['http://fixture:4010/redirect','http://fixture:4010/redirect2','http://fixture:4010/normal']);
 assert.match(page('/loop1').error,/döngüsü/);assert.ok(codes.has('REDIRECT_CHAIN'));assert.ok(codes.has('BROKEN_INTERNAL_LINK'));assert.ok(codes.has('NOINDEX'));assert.ok(codes.has('CANONICAL_MULTIPLE'));
 assert.ok(!codes.has('HREFLANG_RETURN_MISSING'));assert.ok(!codes.has('POSSIBLE_ORPHAN'));assert.equal(page('/private'),undefined);
 assert.equal(result.crawlUrls.find(p=>p.normalized==='http://fixture:4010/private').status,'EXCLUDED');
 assert.equal(result.crawlUrls.filter(p=>p.status==='PROCESSING').length,0);
 console.log(JSON.stringify({result:'PASS',crawl:result.status,pages:result.pages.length,processed:result.processedPages,errors:result.errorUrls,findings:[...codes].sort()},null,2));
}finally{await worker?.close();await queue.close();await connection.quit();await db.$disconnect()}
