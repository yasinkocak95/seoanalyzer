import { ownerHash, sameOrigin } from '@/lib/access';
import { rateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@seo/db';
import { assertSafeUrl, normalizeUrl } from '@seo/shared';
import { translator } from '@seo/shared/i18n';
import { getLocale } from '@/lib/locale';
import { getQueue } from '@/lib/queue';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  const owner = await ownerHash();
  if (!owner || !sameOrigin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  try { if (!await rateLimit(`crawl-${owner}`, 10, 3600)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 }); } catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }); }
  const t = translator(await getLocale());
  let body: { url: string; full?: boolean; force?: boolean }, safe: URL;
  try {
    body = await req.json();
    if (!body || typeof body.url !== 'string' || body.url.length > 2048) return NextResponse.json({ error: t('m110') }, { status: 400 });
    safe = await assertSafeUrl(body.url, false);
  } catch (error) {
    return NextResponse.json({ error: error instanceof SyntaxError ? t('m372') : t(error instanceof Error ? error.message : t('m110')) }, { status: 400 });
  }
  const rootUrl = normalizeUrl(safe.toString()), fullCrawl = body.full === true;
  let crawlId: string | undefined;
  try {
    const cached = body.force === true ? null : await db.crawl.findFirst({ where: { ownerHash: owner, rootUrl, fullCrawl, status: 'COMPLETED', completedAt: { gte: new Date(Date.now() - Number(process.env.CACHE_TTL_SECONDS ?? 1800) * 1000) } }, orderBy: { completedAt: 'desc' } });
    if (cached) return NextResponse.json({ id: cached.id, cached: true });
    const crawl = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${owner + ':' + safe.hostname}, 0))`;
      const active = await tx.crawl.findFirst({ where: { ownerHash: owner, normalizedHost: safe.hostname, status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true, rootUrl: true, status: true } });
      if (active) return { ...active, reused: true };
      return { ...await tx.crawl.create({ data: { ownerHash: owner, rootUrl, normalizedHost: safe.hostname, fullCrawl } }), reused: false };
    });
    if (crawl.reused) return NextResponse.json({ id: crawl.id, active: true }, { status: 202 });
    crawlId = crawl.id;
    await getQueue().add('crawl', { crawlId, rootUrl }, { jobId: crawlId, attempts: 2, backoff: { type: 'exponential', delay: 3000 } });
    return NextResponse.json({ id: crawlId }, { status: 202 });
  } catch (error) {
    console.error('Could not enqueue crawl', error);
    if (crawlId) await db.crawl.updateMany({ where: { id: crawlId, status: 'QUEUED' }, data: { status: 'FAILED', error: t('m371'), statusMessage: t('m017') } }).catch(error => console.error('Could not persist enqueue failure', error));
    return NextResponse.json({ error: t('m371') }, { status: 503 });
  }
}
export async function GET() { const owner = await ownerHash(); if (!owner) return NextResponse.json([], { status: 403 }); return NextResponse.json(await db.crawl.findMany({ where: { ownerHash: owner }, orderBy: { createdAt: 'desc' }, take: 30 })); }
