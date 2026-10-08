import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rows: vi.fn(), templates: vi.fn(), upsert: vi.fn(), update: vi.fn() }));
vi.mock('@seo/db', () => ({ db: {
  crawlUrl: { findMany: m.rows, updateMany: m.update },
  urlTemplate: { findMany: m.templates, upsert: m.upsert },
} }));
import { TemplateSampler } from './sampler.js';
beforeEach(() => { vi.clearAllMocks(); m.templates.mockResolvedValue([]); });
it('pages resume state and retains duplicate detection across page boundaries', async () => {
  const rows = Array.from({ length: 1201 }, (_, n) => ({ id: String(n), normalized: `https://x.test/item/${n}`, status: 'PROCESSED', template: null }));
  m.rows.mockResolvedValueOnce(rows.slice(0, 500)).mockResolvedValueOnce(rows.slice(500, 1000)).mockResolvedValueOnce(rows.slice(1000));
  const sampler = new TemplateSampler('crawl');
  await sampler.load();
  expect(m.rows).toHaveBeenCalledTimes(3);
  expect(m.rows.mock.calls.map(([q]) => q.take)).toEqual([500, 500, 500]);
  expect(m.rows.mock.calls[1][0]).toMatchObject({ cursor: { id: '499' }, skip: 1, orderBy: { id: 'asc' } });
  expect(await sampler.assign(rows[0].normalized)).toBeNull();
  expect(await sampler.assign(rows[1200].normalized)).toBeNull();
  expect(m.upsert).not.toHaveBeenCalled();
});
it('restores sample quota and MIXED behavior without changing stored URL statuses', async () => {
  m.templates.mockResolvedValue([{ pattern: '/item/{id}', status: 'SAMPLED' }, { pattern: '/mixed/{id}', status: 'MIXED' }]);
  m.rows.mockResolvedValue([
    ...Array.from({ length: 5 }, (_, n) => ({ id: String(n), normalized: `https://x.test/item/${n}`, status: 'PROCESSED', template: '/item/{id}' })),
    { id: 'skip', normalized: 'https://x.test/item/6', status: 'SKIPPED', template: '/item/{id}' },
  ]);
  const sampler = new TemplateSampler('crawl'); await sampler.load();
  expect(await sampler.assign('https://x.test/item/999')).toEqual({ template: '/item/{id}', status: 'SKIPPED' });
  expect(await sampler.assign('https://x.test/mixed/999')).toEqual({ template: '/mixed/{id}', status: 'DISCOVERED' });
  expect(m.update).not.toHaveBeenCalled();
});

