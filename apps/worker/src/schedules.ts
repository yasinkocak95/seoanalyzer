import { db, type Prisma } from '@seo/db';
import { assertSafeUrl, nextScheduledRun, healthChange, type CrawlJob, type ScheduleFrequency } from '@seo/shared';
import type { Queue } from 'bullmq';
export async function recordHealthEvent(crawlId: string) {
  const crawl = await db.crawl.findUnique({ where: { id: crawlId } });
  if (!crawl || crawl.status !== 'COMPLETED' || !crawl.scheduleId || !crawl.ownerHash || crawl.notificationCheckedAt) return;
  const previous = await db.crawl.findFirst({ where: { ownerHash: crawl.ownerHash, normalizedHost: crawl.normalizedHost, status: 'COMPLETED', createdAt: { lt: crawl.createdAt } }, orderBy: { createdAt: 'desc' } });
  let change = null;
  if (previous) {
    const critical = await db.finding.groupBy({ by: ['crawlId', 'code'], where: { crawlId: { in: [crawl.id, previous.id] }, severity: 'CRITICAL' } });
    change = healthChange({ score: previous.score, critical: critical.filter(f => f.crawlId === previous.id).length }, { score: crawl.score, critical: critical.filter(f => f.crawlId === crawl.id).length });
  }
  await db.$transaction(async tx => {
    if (change) await tx.notificationEvent.upsert({ where: { crawlId }, create: { ownerHash: crawl.ownerHash!, normalizedHost: crawl.normalizedHost, crawlId, type: 'SEO_HEALTH_CHANGED', payload: { ...change, previousCrawlId: previous!.id } as unknown as Prisma.InputJsonValue }, update: {} });
    await tx.crawl.update({ where: { id: crawlId }, data: { notificationCheckedAt: new Date() } });
  });
}
export function scheduleRunner(queue: Queue<CrawlJob>) {
  let running = false;
  return async function tick() {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const schedules = await db.crawlSchedule.findMany({ where: { enabled: true, nextRunAt: { lte: now } }, orderBy: { nextRunAt: 'asc' }, take: 30 });
      for (const schedule of schedules) {
        // Revalidate DNS at execution, even if this URL was safe when configured.
        try { await assertSafeUrl(schedule.rootUrl, false); } catch {
          // DNS outages and rebinding checks both fail closed. Retry later rather
          // than permanently disabling a valid plan after a transient outage.
          await db.crawlSchedule.updateMany({ where: { id: schedule.id, enabled: true, nextRunAt: schedule.nextRunAt }, data: { nextRunAt: new Date(now.getTime() + 300000) } });
          continue;
        }
        if (!['WEEKLY', 'MONTHLY'].includes(schedule.frequency)) continue;
        const crawl = await db.$transaction(async tx => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${schedule.ownerHash + ':' + schedule.normalizedHost}, 0))`;
          const active = await tx.crawl.findFirst({ where: { ownerHash: schedule.ownerHash, normalizedHost: schedule.normalizedHost, status: { in: ['QUEUED', 'RUNNING', 'PAUSED', 'PARTIAL'] } }, select: { id: true } });
          if (active) return null;
          const claim = await tx.crawlSchedule.updateMany({ where: { id: schedule.id, enabled: true, nextRunAt: schedule.nextRunAt }, data: { nextRunAt: nextScheduledRun(now, schedule.frequency as ScheduleFrequency), lastRunAt: now } });
          if (!claim.count) return null;
          return tx.crawl.create({ data: { ownerHash: schedule.ownerHash, normalizedHost: schedule.normalizedHost, rootUrl: schedule.rootUrl, fullCrawl: schedule.fullCrawl, scheduleId: schedule.id } });
        });
        if (crawl) await queue.add('crawl', { crawlId: crawl.id, rootUrl: crawl.rootUrl }, { jobId: crawl.id, attempts: 2, backoff: { type: 'exponential', delay: 3000 } });
      }
      // Repair a process/Redis failure between durable crawl creation and enqueue.
      const pending = await db.crawl.findMany({ where: { scheduleId: { not: null }, status: 'QUEUED' }, take: 100, orderBy: { createdAt: 'asc' } });
      for (const crawl of pending) {
        const job = await queue.getJob(crawl.id);
        if (!job) await queue.add('crawl', { crawlId: crawl.id, rootUrl: crawl.rootUrl }, { jobId: crawl.id, attempts: 2, backoff: { type: 'exponential', delay: 3000 } });
      }
      const completed = await db.crawl.findMany({ where: { scheduleId: { not: null }, status: 'COMPLETED', notificationCheckedAt: null }, take: 100, orderBy: { completedAt: 'asc' }, select: { id: true } });
      for (const crawl of completed) await recordHealthEvent(crawl.id);
    } finally { running = false; }
  };
}
