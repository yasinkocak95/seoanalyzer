import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ current: vi.fn(), previous: vi.fn(), history: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock('@seo/db', () => ({ db: { crawl: { findUnique: mocks.current, findFirst: mocks.previous, findMany: async () => [] } } }));
vi.mock('./access', () => ({ requireCrawl: async () => 'owner', ownerHash: async () => 'owner' }));
vi.mock('./locale', () => ({ getLocale: async () => 'en' }));
vi.mock('./projects', async original => ({ ...await original<typeof import('./projects')>(), projectHistory: mocks.history }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: () => { throw new Error('notFound'); } }));
import Compare from '../app/karsilastir/[id]/page';
import Project from '../app/projeler/[host]/page';
beforeEach(() => { vi.clearAllMocks(); mocks.history.mockResolvedValue([]); });
it.each(['QUEUED', 'RUNNING', 'PAUSED', 'FAILED'])('routes an unfinished %s comparison back to crawl progress', async status => {
  mocks.current.mockResolvedValue({ status });
  await expect(Compare({ params: Promise.resolve({ id: 'c' }), searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/tarama/c');
  expect(mocks.previous).not.toHaveBeenCalled();
});
it('does not offer a comparison for unfinished project history rows', async () => {
  mocks.history.mockResolvedValue([
    { id: 'running', status: 'RUNNING', score: null, critical: 0, createdAt: new Date() },
    { id: 'complete', status: 'COMPLETED', score: 80, critical: 1, createdAt: new Date(0) },
  ]);
  const html = renderToStaticMarkup(await Project({ params: Promise.resolve({ host: 'example.com' }), searchParams: Promise.resolve({}) }));
  expect(html).toContain('/tarama/running'); expect(html).not.toContain('/karsilastir/running');
});
