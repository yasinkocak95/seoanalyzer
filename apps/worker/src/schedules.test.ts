import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ schedules: vi.fn(), scheduleUpdate: vi.fn(), crawls: vi.fn(), active: vi.fn(), create: vi.fn(), lock: vi.fn(), add: vi.fn(), getJob: vi.fn(), safe: vi.fn() }));
vi.mock('@seo/db', () => ({ db: { crawlSchedule: { findMany: mocks.schedules, updateMany: mocks.scheduleUpdate }, crawl: { findMany: mocks.crawls }, $transaction: async (fn: Function) => fn({ $executeRaw: mocks.lock, crawl: { findFirst: mocks.active, create: mocks.create }, crawlSchedule: { updateMany: mocks.scheduleUpdate } }) } }));
vi.mock('@seo/shared', async original => ({ ...await original<typeof import('@seo/shared')>(), assertSafeUrl: mocks.safe }));
import { scheduleRunner } from './schedules.js';
const schedule = { id: 's', ownerHash: 'owner', normalizedHost: 'example.com', rootUrl: 'https://example.com/', frequency: 'WEEKLY', fullCrawl: false, nextRunAt: new Date(0) };
beforeEach(() => { vi.clearAllMocks(); mocks.schedules.mockResolvedValue([schedule]); mocks.crawls.mockResolvedValue([]); mocks.active.mockResolvedValue(null); mocks.scheduleUpdate.mockResolvedValue({ count: 1 }); mocks.create.mockResolvedValue({ id: 'c', rootUrl: schedule.rootUrl }); mocks.safe.mockResolvedValue(new URL(schedule.rootUrl)); });
it('atomically creates one scheduled crawl and enqueues with a stable job ID', async () => { await scheduleRunner({ add: mocks.add, getJob: mocks.getJob } as any)(); expect(mocks.lock).toHaveBeenCalled(); expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.add).toHaveBeenCalledWith('crawl', { crawlId: 'c', rootUrl: schedule.rootUrl }, expect.objectContaining({ jobId: 'c' })); });
it('skips projects with an existing active crawl', async () => { mocks.active.mockResolvedValue({ id: 'active' }); await scheduleRunner({ add: mocks.add } as any)(); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled(); });
it('defers blocked plans so the earliest due batch cannot starve other projects', async () => {
  mocks.active.mockResolvedValue({ id: 'paused' });
  await scheduleRunner({ add: mocks.add } as any)();
  expect(mocks.scheduleUpdate).toHaveBeenCalledWith({ where: { id: 's', enabled: true, nextRunAt: schedule.nextRunAt }, data: { nextRunAt: expect.any(Date) } });
  expect(mocks.scheduleUpdate.mock.calls[0][0].data.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  expect(mocks.create).not.toHaveBeenCalled();
});
it('does not create a duplicate when another scheduler wins the claim', async () => { mocks.scheduleUpdate.mockResolvedValue({ count: 0 }); await scheduleRunner({ add: mocks.add } as any)(); expect(mocks.create).not.toHaveBeenCalled(); });
it('rechecks SSRF and defers blocked targets without losing plans during DNS outages', async () => { mocks.safe.mockRejectedValue(new Error('Private address')); await scheduleRunner({ add: mocks.add } as any)(); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.scheduleUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { nextRunAt: expect.any(Date) } })); });
