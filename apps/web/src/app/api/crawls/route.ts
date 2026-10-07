import { NextRequest, NextResponse } from 'next/server';
import { db } from '@seo/db';
import { assertSafeUrl, normalizeUrl } from '@seo/shared';
import { translator } from '@seo/shared/i18n';
import { getLocale } from '@/lib/locale';
import { getQueue } from '@/lib/queue';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
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
    const cached = body.force === true ? null : await db.crawl.findFirst({ where: { rootUrl, fullCrawl, status: 'COMPLETED', completedAt: { gte: new Date(Date.now() - Number(process.env.CACHE_TTL_SECONDS ?? 1800) * 1000) } }, orderBy: { completedAt: 'desc' } });
    if (cached) return NextResponse.json({ id: cached.id, cached: true });
    const crawl = await db.crawl.create({ data: { rootUrl, normalizedHost: safe.hostname, fullCrawl } });
    crawlId = crawl.id;
    await getQueue().add('crawl', { crawlId, rootUrl }, { jobId: crawlId, attempts: 2, backoff: { type: 'exponential', delay: 3000 } });
    return NextResponse.json({ id: crawlId }, { status: 202 });
  } catch (error) {
    console.error('Could not enqueue crawl', error);
    if (crawlId) await db.crawl.updateMany({ where: { id: crawlId, status: 'QUEUED' }, data: { status: 'FAILED', error: t('m371'), statusMessage: t('m017') } }).catch(error => console.error('Could not persist enqueue failure', error));
    return NextResponse.json({ error: t('m371') }, { status: 503 });
  }
}
export async function GET() { return NextResponse.json(await db.crawl.findMany({ orderBy: { createdAt: 'desc' }, take: 30 })); }
