// Opt-in: real Crawlee + loopback HTTP, in-memory Prisma boundary (no Redis/DB).
import { expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Session } from 'node:inspector';
const store = vi.hoisted(() => ({ urls: new Map<string, any>(), pages: new Map<string, any>(), status: 'QUEUED', writes: 0 }));
vi.mock('@seo/db', () => ({ db: {
  crawl: {
    updateMany: async ({ where, data }: any) => {
      if (where.status?.in && !where.status.in.includes(store.status)) return { count: 0 };
      if (typeof where.status === 'string' && where.status !== store.status) return { count: 0 };
      store.status = data.status ?? store.status; return { count: 1 };
    },
    update: async () => ({}),
    findUniqueOrThrow: async () => ({ status: store.status, fullCrawl: true }),
  },
  crawlUrl: {
    upsert: async ({ where, create, update }: any) => {
      store.writes++;
      // Reproducible 1ms per DB round trip; this is a fixture, not a DB benchmark.
      await new Promise(r => setTimeout(r, 1));
      const key = where.crawlId_normalized.normalized;
      if (!store.urls.has(key)) store.urls.set(key, { id: key, ...create });
      else Object.assign(store.urls.get(key), Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined)));
      return store.urls.get(key);
    },
    findMany: async ({ where, take }: any) => [...store.urls.values()].filter(row => row.status === where.status).slice(0, take),
    updateMany: async ({ where, data }: any) => {
      for (const row of store.urls.values()) if ((!where.status || row.status === where.status) && (!where.id || where.id.in.includes(row.id))) Object.assign(row, data);
      return { count: 1 };
    },
    update: async ({ where, data }: any) => Object.assign(store.urls.get(where.id), data),
    count: async ({ where }: any) => [...store.urls.values()].filter(row => row.status === where.status).length,
  },
  page: {
    upsert: async ({ where, create, update }: any) => {
      const key = where.crawlId_url.url;
      store.pages.set(key, store.pages.has(key) ? { ...store.pages.get(key), ...update } : create);
    },
    count: async () => 0,
  },
} }));
vi.mock('./analysis.js', () => ({ analyzeStoredPages: async () => undefined }));

it.skipIf(!process.env.CRAWL_BENCHMARK)('compares worker batches, retry timing, CPU and memory on a fixed HTTP fixture', async () => {
  vi.stubEnv('ALLOW_LOCAL_TEST_URLS', 'true');
  vi.stubEnv('REQUEST_DELAY_MS', process.env.CRAWL_BENCHMARK_DELAY ?? '50');
  vi.stubEnv('CRAWL_CONCURRENCY', '2');
  vi.stubEnv('CRAWL_BATCH_SIZE', '25');
  vi.stubEnv('CRAWLEE_MEMORY_MBYTES', '768');
  vi.stubEnv('CRAWLEE_SYSTEM_INFO_V2', 'false');
  vi.stubEnv('CRAWLEE_STORAGE_DIR', resolve('.tmp-test', `crawl-benchmark-${process.env.CRAWL_BENCHMARK}`));
  const mode = process.env.CRAWL_BENCHMARK!;
  const events: { path: string; at: number; status: number }[] = [];
  let retryCount = 0;
  const server = createServer((req, res) => {
    const path = req.url!;
    let status = 200;
    if (path === '/robots.txt' || path === '/sitemap.xml' || path === '/missing' || path === '/nested/product') status = 404;
    if (path === '/retry' && retryCount++ === 0) { status = 429; res.setHeader('retry-after', '4'); }
    events.push({ path, at: Date.now(), status });
    res.writeHead(status, { 'content-type': 'text/html' });
    if (status !== 200) { res.end(`HTTP ${status}`); return; }
    const links = path === '/' ? [
      ...Array.from({ length: 51 }, (_, n) => `<a href="/page-${n}">Page</a>`),
      '<a href="/nested/page">Base</a><a href="/retry">Retry</a><a href="/missing">Missing</a>',
    ].join('') : path === '/nested/page' ? '<base href="/catalog/"><a href="product">Product</a>' : '<a href="/page-0">Duplicate</a>'.repeat(100);
    res.end(`<html><head><title>Fixture</title></head><body>${links}<main>${'<div class="content">fixture text</div>'.repeat(300)}</main></body></html>`);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  let peakRss = process.memoryUsage().rss, peakHeap = process.memoryUsage().heapUsed;
  const sample = setInterval(() => { const m = process.memoryUsage(); peakRss = Math.max(peakRss, m.rss); peakHeap = Math.max(peakHeap, m.heapUsed); }, 20);
  const initial = process.memoryUsage(), cpu = process.cpuUsage(), start = Date.now();
  const lag = monitorEventLoopDelay({ resolution: 20 }); lag.enable();
  try {
    // Sandbox disallows ps-tree subprocesses. This HTTP worker has no children;
    // sample its RSS directly, while retaining real Crawlee scheduling/storage.
    const { Configuration } = await import('crawlee');
    const eventManager = Configuration.getGlobalConfig().getEventManager() as any;
    eventManager.createMemoryInfo = async () => ({ memTotalBytes: 1024 ** 3, memCurrentBytes: process.memoryUsage().rss });
    const baselinePath = resolve('.tmp-test/crawl-baseline.ts');
    const module = mode === 'before' ? await import(/* @vite-ignore */ baselinePath) : await import('./crawl.js');
    await module.executeCrawl('benchmark', `http://127.0.0.1:${port}/`);
    expect(store.status).toBe('COMPLETED');
    expect([...store.urls.values()].some(row => row.status === 'PROCESSING' || row.status === 'DISCOVERED')).toBe(false);
    const retry = events.filter(e => e.path === '/retry');
    if (mode !== 'before') {
      expect(store.writes).toBeLessThan(200);
      expect(store.pages.get(`http://127.0.0.1:${port}/page-0`).links).toHaveLength(100);
      expect(retry[1].at - retry[0].at).toBeGreaterThanOrEqual(4000);
      expect(events.some(e => e.path === '/nested/product')).toBe(false);
      expect(events.some(e => e.path === '/catalog/product' && e.status === 200)).toBe(true);
      expect(events.filter(e => e.path === '/missing')).toHaveLength(1);
    }
    const usage = process.cpuUsage(cpu);
    const wallMs = Date.now() - start;
    lag.disable();
    const preGCHeapMiB = process.memoryUsage().heapUsed / 2 ** 20;
    const inspector = new Session(); inspector.connect();
    try { await new Promise<void>((r, reject) => inspector.post('HeapProfiler.collectGarbage', error => error ? reject(error) : r())); }
    finally { inspector.disconnect(); }
    const result = { mode, wallMs: Date.now() - start, cpuMs: (usage.user + usage.system) / 1000,
      initialRssMiB: initial.rss / 2 ** 20, peakRssMiB: peakRss / 2 ** 20, peakHeapMiB: peakHeap / 2 ** 20,
      endHeapMiB: preGCHeapMiB, postGCHeapMiB: process.memoryUsage().heapUsed / 2 ** 20, postGCRssMiB: process.memoryUsage().rss / 2 ** 20,
      eventLoopMaxMs: lag.max / 1e6, eventLoopP99Ms: lag.percentile(99) / 1e6, pages: store.pages.size, discoveryWrites: store.writes,
      http429: events.filter(e => e.status === 429).length, http404: events.filter(e => e.status === 404 && !['/robots.txt', '/sitemap.xml'].includes(e.path)).length,
      retryWaitMs: retry[1].at - retry[0].at, events };
    await mkdir('.tmp-test/crawl-performance', { recursive: true });
    result.wallMs = wallMs;
    const run = process.env.CRAWL_BENCHMARK_RUN ? `-${process.env.CRAWL_BENCHMARK_RUN}` : '';
    await writeFile(`.tmp-test/crawl-performance/${mode}${run}.json`, JSON.stringify(result, null, 2));
    console.log('WORKER_BENCHMARK', JSON.stringify({ ...result, events: undefined }));
  } finally {
    lag.disable(); clearInterval(sample); server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r())); vi.unstubAllEnvs();
  }
}, 120000);
