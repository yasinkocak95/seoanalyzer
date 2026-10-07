import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('/app/package.json');
const {PrismaClient}=require('@prisma/client'),{Queue,Worker}=require('bullmq'),{Redis}=require('ioredis');
const db=new PrismaClient(),connection=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:null}),queue=new Queue('seo-crawls',{connection});
const crawl=await db.crawl.create({data:{rootUrl:'http://fixture:4010/',normalizedHost:'fixture',status:'RUNNING'}});
const fake=new Worker('seo-crawls',async()=>{throw new Error('Simulated terminal failure during DB outage')},{connection});
fake.on('error',()=>{});
const failed=new Promise(resolve=>fake.once('failed',resolve));
await queue.add('crawl',{crawlId:crawl.id,rootUrl:crawl.rootUrl},{jobId:crawl.id,attempts:1});await failed;await fake.close();
await import('/app/apps/worker/dist/index.js');
let status;const deadline=Date.now()+10000;
while(Date.now()<deadline){status=(await db.crawl.findUnique({where:{id:crawl.id}})).status;if(status==='FAILED')break;await new Promise(r=>setTimeout(r,100))}
assert.equal(status,'FAILED');console.log(JSON.stringify({result:'PASS',reconciledStatus:status}));
await queue.close();await connection.quit();await db.$disconnect();process.exit(0);
