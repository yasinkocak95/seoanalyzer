import { db } from '@seo/db';
export async function projectHistory(owner: string, host: string, page = 0) {
  const crawls = await db.crawl.findMany({ where: { ownerHash: owner, normalizedHost: host }, orderBy: { createdAt: 'desc' }, skip: page * 60, take: 60, select: { id: true, rootUrl: true, normalizedHost: true, status: true, score: true, createdAt: true, completedAt: true, fullCrawl: true } });
  const critical = await db.finding.groupBy({ by: ['crawlId', 'code'], where: { crawlId: { in: crawls.map(c => c.id) }, severity: 'CRITICAL' } });
  return crawls.map(c => ({ ...c, critical: critical.filter(f => f.crawlId === c.id).length }));
}
export function pageIndex(value: string | undefined) { return value && /^\d{1,5}$/.test(value) ? Math.min(Number(value), 10000) : 0; }
