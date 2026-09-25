import { NextRequest, NextResponse } from 'next/server';
import { db } from '@seo/db';
import { assertSafeUrl, normalizeUrl } from '@seo/shared';
import { getQueue } from '@/lib/queue';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.url !== 'string' || body.url.length > 2048) return NextResponse.json({ error: 'Geçerli bir site adresi girin.' }, { status: 400 });
    const safe = await assertSafeUrl(body.url), rootUrl = normalizeUrl(safe.toString()), fullCrawl = body.full === true;
    // force: kullanıcı "Yeniden tara" dediğinde son 30 dakikalık önbellek atlanır.
    const cached = body.force === true ? null : await db.crawl.findFirst({ where: { rootUrl, fullCrawl, status: 'COMPLETED', completedAt: { gte: new Date(Date.now() - Number(process.env.CACHE_TTL_SECONDS ?? 1800) * 1000) } }, orderBy: { completedAt: 'desc' } });
    if (cached) return NextResponse.json({ id: cached.id, cached: true });
    const crawl = await db.crawl.create({ data: { rootUrl, normalizedHost: safe.hostname, fullCrawl } });
    await getQueue().add('crawl', { crawlId: crawl.id, rootUrl }, { jobId: crawl.id, attempts: 2, backoff: { type: 'exponential', delay: 3000 } });
    return NextResponse.json({ id: crawl.id }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Analiz başlatılamadı.' }, { status: 400 }); }
}
export async function GET() { return NextResponse.json(await db.crawl.findMany({ orderBy: { createdAt: 'desc' }, take: 30 })); }
