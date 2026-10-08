import { parentPort, workerData } from 'node:worker_threads';
if (workerData.crash) process.exit(2);
if (workerData.claim) {
  parentPort.postMessage({ type: 'claim', startedAt: '2026-10-08T10:00:00.000Z' });
  await new Promise(resolve => parentPort.once('message', resolve));
}
const counter = workerData.counter ? new Int32Array(workerData.counter) : undefined;
const end = Date.now() + (workerData.ms ?? 600);
while (Date.now() < end) { if (counter) Atomics.add(counter, 0, 1); }
parentPort.postMessage({ ok: true });
parentPort.close();
