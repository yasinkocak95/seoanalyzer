import { it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ crawls: vi.fn(), groups: vi.fn() }));
vi.mock('@seo/db', () => ({ db: { crawl: { findMany: mocks.crawls }, finding: { groupBy: mocks.groups } } }));
import { projectHistory, pageIndex } from './projects';
import { healthSeries } from '../components/health-history';
it('reuses owned crawl history with unique critical rule counts', async () => { mocks.crawls.mockResolvedValue([{ id: 'c' }]); mocks.groups.mockResolvedValue([{ crawlId: 'c', code: 'A' }, { crawlId: 'c', code: 'B' }]); expect((await projectHistory('owner', 'example.com'))[0].critical).toBe(2); expect(mocks.crawls).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerHash: 'owner', normalizedHost: 'example.com' } })); });
it('bounds pagination', () => { expect(pageIndex('-1')).toBe(0); expect(pageIndex('99999')).toBe(10000); });
it('plots completed history in chronological order without fabricating partial scores', () => { const history = [{ id: 'new', status: 'COMPLETED', score: null, critical: 1, createdAt: new Date() }, { id: 'partial', status: 'PARTIAL', score: 80, critical: 2, createdAt: new Date() }, { id: 'old', status: 'COMPLETED', score: 70, critical: 3, createdAt: new Date() }]; expect(healthSeries(history).map(p => p.id)).toEqual(['old', 'new']); expect(healthSeries(history)[1].score).toBeNull(); });
