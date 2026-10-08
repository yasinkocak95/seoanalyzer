import { Worker } from 'node:worker_threads';
import type { CrawlJob } from '@seo/shared';

export class CrawlOwnershipLostError extends Error {
  constructor() { super('Crawl execution ownership lost'); }
}

/** Keep synchronous HTML/JSON work off BullMQ's lock-renewal event loop.
 * A fresh thread per attempt also releases Crawlee caches after a crawl.
 * Resolve only after thread exit, including on cancellation.
 */
export function runCrawlThread(data: CrawlJob & { recoverRunning: boolean }, signal: AbortSignal,
  entry = new URL(`./crawl-thread.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`, import.meta.url),
  onClaim?: (startedAt: string, previous?: string | null) => Promise<void>) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new CrawlOwnershipLostError()); return; }
    const thread = new Worker(entry, { workerData: data });
    let completed = false, error: Error | undefined;
    const abort = () => { error = new CrawlOwnershipLostError(); void thread.terminate(); };
    signal.addEventListener('abort', abort, { once: true });
    thread.on('message', async message => {
      if (message?.type === 'claim') {
        try {
          if (signal.aborted) return;
          await onClaim?.(message.startedAt, message.previousStartedAt);
          if (!signal.aborted) thread.postMessage({ claimAccepted: true });
        } catch (failure) { error = failure instanceof Error ? failure : new Error(String(failure)); void thread.terminate(); }
        return;
      }
      if (message?.ok === true) completed = true;
      else if (message?.ok === false) error = new Error(message.error);
    });
    thread.on('error', failure => { error = failure; });
    thread.on('exit', code => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(new CrawlOwnershipLostError());
      else if (error) reject(error);
      else if (code !== 0 || !completed) reject(new Error(`Crawl thread exited before completion (${code})`));
      else resolve();
    });
  });
}
