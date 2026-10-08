import { parentPort, workerData } from 'node:worker_threads';
import { db } from '@seo/db';
import { executeCrawl } from './crawl.js';
try {
  await executeCrawl(workerData.crawlId, workerData.rootUrl, workerData.recoverRunning, async (startedAt, previous) => {
    // Persist the attempt generation in BullMQ before doing page writes.
    await new Promise<void>(resolve => {
      parentPort!.once('message', () => resolve());
      parentPort!.postMessage({ type: 'claim', startedAt: startedAt.toISOString(), previousStartedAt: previous?.toISOString() ?? null });
    });
  });
  parentPort!.postMessage({ ok: true });
} catch (error) {
  parentPort!.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
} finally {
  await db.$disconnect();
  parentPort!.close();
}
