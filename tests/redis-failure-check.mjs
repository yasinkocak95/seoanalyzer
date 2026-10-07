import assert from 'node:assert/strict';
import {getQueue} from '/app/apps/web/src/lib/queue.ts';
const start=Date.now(),queue=getQueue();
try{
 await assert.rejects(queue.add('crawl',{crawlId:'failure-check',rootUrl:'https://example.test/'}));
 assert.ok(Date.now()-start<15000,'Queue failure must be bounded');
 console.log(JSON.stringify({result:'PASS',redisFailureMs:Date.now()-start}));
}finally{await queue.close().catch(()=>{})}
