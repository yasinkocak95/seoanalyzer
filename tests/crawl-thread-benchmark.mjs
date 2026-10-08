// Local fixture only. Run: node tests/crawl-thread-benchmark.mjs
// Uses existing TypeScript, real Crawlee and the production thread runner.
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import ts from 'typescript';
const out = resolve('.tmp-test/crawl-thread-benchmark');
await mkdir(out, { recursive: true });
const test = await readFile('apps/worker/src/crawl-benchmark.test.ts', 'utf8');
const fragment = test.split("vi.mock('@seo/db', () => ({ db: {")[1]?.split('} }));')[0];
if (!fragment) throw new Error('Benchmark Prisma fixture not found');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
await writeFile(`${out}/fixture-db.mjs`, compile(`export const store={urls:new Map(),pages:new Map(),status:'QUEUED',writes:0};export const db={${fragment}};db.$disconnect=async()=>{};`));
await writeFile(`${out}/analysis.js`, 'export async function analyzeStoredPages() {}');
await writeFile(`${out}/package.json`, '{"type":"module"}');
for (const name of ['crawl', 'crawl-pacing', 'sampler', 'url-templates', 'fetch-safe', 'crawl-runtime']) {
  let source = await readFile(`apps/worker/src/${name}.ts`, 'utf8');
  source = source.replace(/from (["'])@seo\/db\1/g, 'from "./fixture-db.mjs"')
    .replace(/from (["'])crawlee\1/g, `from ${JSON.stringify(pathToFileURL(resolve('apps/worker/node_modules/crawlee/index.mjs')).href)}`);
  await writeFile(`${out}/${name}.js`, compile(source));
}
await writeFile(`${out}/entry.mjs`, `
import {parentPort,workerData} from 'node:worker_threads';
import {writeFile} from 'node:fs/promises';
import {Configuration} from ${JSON.stringify(pathToFileURL(resolve('apps/worker/node_modules/crawlee/index.mjs')).href)};
import {executeCrawl} from './crawl.js';
import {store} from './fixture-db.mjs';
Configuration.getGlobalConfig().getEventManager().createMemoryInfo=async()=>({memTotalBytes:1024**3,memCurrentBytes:process.memoryUsage().rss});
let peakHeap=0;const timer=setInterval(()=>{peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed)},20);
try {
 await executeCrawl(workerData.crawlId,workerData.rootUrl,false,async startedAt=>new Promise(r=>{parentPort.once('message',r);parentPort.postMessage({type:'claim',startedAt:startedAt.toISOString()})}));
 await writeFile(workerData.result,JSON.stringify({status:store.status,pages:store.pages.size,writes:store.writes,peakThreadHeapMiB:peakHeap/2**20,endThreadHeapMiB:process.memoryUsage().heapUsed/2**20}));
 parentPort.postMessage({ok:true});
}catch(error){parentPort.postMessage({ok:false,error:error.message})}
finally{clearInterval(timer);parentPort.close()}
`);
Object.assign(process.env, { ALLOW_LOCAL_TEST_URLS: 'true', REQUEST_DELAY_MS: '500', CRAWL_CONCURRENCY: '2', CRAWLEE_MEMORY_MBYTES: '768', CRAWLEE_SYSTEM_INFO_V2: 'false' });
const { runCrawlThread } = await import(pathToFileURL(`${out}/crawl-runtime.js`).href);
let retry = 0;
const server = createServer((req, res) => {
  const path = req.url;
  let status = ['/robots.txt', '/sitemap.xml', '/missing'].includes(path) ? 404 : 200;
  if (path === '/retry' && retry++ === 0) { status = 429; res.setHeader('retry-after', '4'); }
  res.writeHead(status, { 'content-type': 'text/html' });
  if (status !== 200) { res.end('error'); return; }
  const links = path === '/' ? Array.from({ length: 51 }, (_, n) => `<a href="/page-${n}">Page</a>`).join('') + '<a href="/nested/page">Base</a><a href="/retry">Retry</a><a href="/missing">Missing</a>'
    : path === '/nested/page' ? '<base href="/catalog/"><a href="product">Product</a>' : '<a href="/page-0">Duplicate</a>'.repeat(100);
  res.end(`<html><head><title>Fixture</title></head><body>${links}<main>${'<div class="content">fixture text</div>'.repeat(300)}</main></body></html>`);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const results = [];
try {
  for (let n = 1; n <= Number(process.env.CRAWL_THREAD_BENCHMARK_RUNS ?? 3); n++) {
    retry = 0;
    process.env.CRAWLEE_STORAGE_DIR = `${out}/storage-${n}`;
    const lag = monitorEventLoopDelay({ resolution: 20 }); lag.enable();
    let peakRss = process.memoryUsage().rss;
    const sample = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 20);
    const start = Date.now(), cpu = process.cpuUsage();
    try {
      const result = `${out}/thread-${n}.json`;
      await runCrawlThread({ crawlId: `fixture-${n}`, rootUrl: `http://127.0.0.1:${server.address().port}/`, recoverRunning: false, result }, new AbortController().signal, pathToFileURL(`${out}/entry.mjs`));
      const child = JSON.parse(await readFile(result, 'utf8'));
      if (child.status !== 'COMPLETED' || child.pages !== 56 || child.writes !== 109) throw new Error('Crawl fixture changed');
      const usage = process.cpuUsage(cpu);
      const row = { run: n, wallMs: Date.now() - start, cpuMs: (usage.user + usage.system) / 1000, peakRssMiB: peakRss / 2 ** 20,
        endRssMiB: process.memoryUsage().rss / 2 ** 20, parentHeapMiB: process.memoryUsage().heapUsed / 2 ** 20,
        parentEventLoopMaxMs: lag.max / 1e6, parentEventLoopP99Ms: lag.percentile(99) / 1e6, ...child };
      results.push(row); console.log('CRAWL_THREAD_BENCHMARK', JSON.stringify(row));
    } finally { clearInterval(sample); lag.disable(); }
  }
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
} finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
