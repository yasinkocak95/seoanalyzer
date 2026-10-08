import { expect, it, vi } from 'vitest';
import { LockManager } from 'bullmq';
import { runCrawlThread } from './crawl-runtime.js';
const entry = new URL('../../../tests/fixtures/crawl-thread-cpu.mjs', import.meta.url);
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
function heartbeat() {
  let expires = Date.now() + 100;
  const events = vi.fn();
  const context = {
    name: 'fixture', trace: async (_kind: any, _operation: any, _name: any, work: any) => work(), emit: events,
    extendJobLocks: async (ids: string[], _tokens: string[], duration: number) => {
      if (Date.now() >= expires) return ids;
      expires = Date.now() + duration; return [];
    },
  };
  const manager = new LockManager(context as any, { lockDuration: 100, lockRenewTime: 40, workerId: 'fixture' });
  manager.trackJob('job', 'token', Date.now()); manager.start();
  return { manager, events };
}
it('reproduces missed BullMQ renewal when CPU work blocks the owning event loop', async () => {
  const { manager, events } = heartbeat();
  try {
    const end = Date.now() + 200; while (Date.now() < end) {}
    await pause(50);
    expect(events.mock.calls.some(([name]) => name === 'lockRenewalFailed')).toBe(true);
  } finally { await manager.close(); }
});
it('renews the actual BullMQ LockManager while the crawl thread saturates its event loop', async () => {
  const { manager, events } = heartbeat();
  try {
    await runCrawlThread({ crawlId: 'fixture', rootUrl: 'https://x.test', recoverRunning: false, ms: 600 } as any, new AbortController().signal, entry);
    expect(events.mock.calls.filter(([name]) => name === 'locksRenewed').length).toBeGreaterThan(5);
    expect(events.mock.calls.some(([name]) => name === 'lockRenewalFailed')).toBe(false);
  } finally { await manager.close(); }
});
it('waits for thread exit on cancellation, before allowing a retry to run', async () => {
  const counter = new SharedArrayBuffer(4), view = new Int32Array(counter), controller = new AbortController();
  const work = runCrawlThread({ counter, ms: 5000 } as any, controller.signal, entry);
  const result = expect(work).rejects.toThrow('ownership lost');
  while (!Atomics.load(view, 0)) await pause(5);
  controller.abort(); await result;
  const stopped = Atomics.load(view, 0); await pause(50);
  expect(Atomics.load(view, 0)).toBe(stopped);
});
it('reports thread crash instead of completing a crawl so durable retry can recover', async () => {
  await expect(runCrawlThread({ crash: true } as any, new AbortController().signal, entry)).rejects.toThrow('exited before completion (2)');
});
it('does no page work until the parent persists the claim generation', async () => {
  const counter = new SharedArrayBuffer(4), view = new Int32Array(counter);
  const onClaim = vi.fn(async (startedAt: string) => {
    expect(startedAt).toBe('2026-10-08T10:00:00.000Z');
    expect(Atomics.load(view, 0)).toBe(0); await pause(40);
    expect(Atomics.load(view, 0)).toBe(0);
  });
  await runCrawlThread({ claim: true, counter, ms: 30 } as any, new AbortController().signal, entry, onClaim);
  expect(onClaim).toHaveBeenCalledOnce(); expect(Atomics.load(view, 0)).toBeGreaterThan(0);
});
