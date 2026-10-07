import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ crawl: vi.fn(), upsert: vi.fn(), update: vi.fn(), add: vi.fn(), key: 'key' }));
vi.mock('@seo/db', () => ({ db: { crawl: { findUnique: mocks.crawl }, aiAnalysis: { upsert: mocks.upsert, updateMany: mocks.update } } }));
vi.mock('@seo/shared/ai-config', () => ({ getAiConfig: () => ({ apiKey: mocks.key }) }));
import { enqueueExecutiveSummaries } from './ai-auto.js';
beforeEach(() => { vi.clearAllMocks(); mocks.key = 'key'; mocks.crawl.mockResolvedValue({ status: 'COMPLETED' }); mocks.upsert.mockResolvedValue({ id: 'a', status: 'IDLE', generation: '', result: null }); mocks.update.mockResolvedValue({ count: 1 }); });
it('queues both languages after completion', async () => { await enqueueExecutiveSummaries('c', { add: mocks.add } as any); expect(mocks.upsert.mock.calls.map(c => c[0].create.locale)).toEqual(['tr', 'en']); expect(mocks.add).toHaveBeenCalledTimes(2); });
it('never repeats a cached or claimed generation', async () => { mocks.upsert.mockResolvedValue({ status: 'COMPLETED', result: {} }); await enqueueExecutiveSummaries('c', { add: mocks.add } as any); expect(mocks.add).not.toHaveBeenCalled(); });
it('does nothing without a key', async () => { mocks.key = ''; await enqueueExecutiveSummaries('c', { add: mocks.add } as any); expect(mocks.crawl).not.toHaveBeenCalled(); });
