import { NextResponse } from 'next/server';
import { db } from '@seo/db';
import { assertSafeUrl, nextScheduledRun } from '@seo/shared';
import { ownerHash, sameOrigin } from '@/lib/access';
import { rateLimit } from '@/lib/rate-limit';
type Context = { params: Promise<{ host: string }> };
export async function GET(_request: Request, { params }: Context) {
  const owner = await ownerHash(), { host } = await params;
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const schedule = await db.crawlSchedule.findUnique({ where: { ownerHash_normalizedHost: { ownerHash: owner, normalizedHost: host } }, select: { enabled: true, frequency: true, nextRunAt: true, lastRunAt: true } });
  return NextResponse.json(schedule, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request, { params }: Context) {
  const owner = await ownerHash(), { host } = await params;
  if (!owner || !sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let frequency: 'WEEKLY' | 'MONTHLY';
  try { const body = await request.json(); if (!body || !['WEEKLY', 'MONTHLY'].includes(body.frequency)) throw new Error(); frequency = body.frequency; } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  try {
    if (!await rateLimit(`schedule-${owner}`, 20, 3600)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    const crawl = await db.crawl.findFirst({ where: { ownerHash: owner, normalizedHost: host }, orderBy: { createdAt: 'desc' }, select: { rootUrl: true, fullCrawl: true } });
    if (!crawl) return NextResponse.json({ error: 'Project unavailable' }, { status: 404 });
    await assertSafeUrl(crawl.rootUrl, false);
    const result = await db.crawlSchedule.upsert({ where: { ownerHash_normalizedHost: { ownerHash: owner, normalizedHost: host } }, create: { ownerHash: owner, normalizedHost: host, rootUrl: crawl.rootUrl, fullCrawl: crawl.fullCrawl, frequency, nextRunAt: nextScheduledRun(new Date(), frequency) }, update: { enabled: true, frequency, rootUrl: crawl.rootUrl, fullCrawl: crawl.fullCrawl, nextRunAt: nextScheduledRun(new Date(), frequency) }, select: { enabled: true, frequency: true, nextRunAt: true, lastRunAt: true } });
    return NextResponse.json(result);
  } catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }); }
}
export async function DELETE(request: Request, { params }: Context) {
  const owner = await ownerHash(), { host } = await params;
  if (!owner || !sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try { await db.crawlSchedule.updateMany({ where: { ownerHash: owner, normalizedHost: host }, data: { enabled: false } }); return NextResponse.json({ enabled: false }); } catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }); }
}
