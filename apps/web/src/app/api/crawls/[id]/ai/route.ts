import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@seo/db';
import { getAiQueue } from '@/lib/queue';
import { getLocale } from '@/lib/locale';
import { aiSnapshot, idleAiSnapshot } from '@/lib/ai-analysis';
import { translator } from '@seo/shared/i18n';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const locale = await getLocale(), t = translator(locale), { id } = await params;
  const availability = idleAiSnapshot(locale);
  if (!availability.enabled) return NextResponse.json(availability, { headers: { 'Cache-Control': 'no-store' } });
  try {
    if (!await db.crawl.findUnique({ where: { id }, select: { id: true } })) return NextResponse.json({ error: t('m157') }, { status: 404 });
    const analysis = await db.aiAnalysis.findUnique({ where: { crawlId_locale: { crawlId: id, locale } } });
    return NextResponse.json(analysis ? aiSnapshot(analysis) : availability, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: t('ai.queueUnavailable') }, { status: 503 }); }
}

export async function POST(request: Request, { params }: Context) {
  const locale = await getLocale(), t = translator(locale), { id } = await params;
  // Paid generation must not be triggered from another site's browser session.
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') return NextResponse.json({ error: t('ai.invalidRequest') }, { status: 403 });
  const availability = idleAiSnapshot(locale);
  if (!availability.enabled) return NextResponse.json(availability, { headers: { 'Cache-Control': 'no-store' } });
  let regenerate = false;
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || (body.regenerate !== undefined && typeof body.regenerate !== 'boolean')) throw new Error();
    regenerate = body.regenerate === true;
  } catch { return NextResponse.json({ error: t('ai.invalidRequest') }, { status: 400 }); }
  try {
    const crawl = await db.crawl.findUnique({ where: { id }, select: { status: true } });
    if (!crawl) return NextResponse.json({ error: t('m157') }, { status: 404 });
    if (crawl.status !== 'COMPLETED') return NextResponse.json({ error: t('ai.crawlNotReady') }, { status: 409 });
    const analysis = await db.aiAnalysis.upsert({ where: { crawlId_locale: { crawlId: id, locale } }, create: { crawlId: id, locale }, update: {} });
    if (['QUEUED', 'RUNNING'].includes(analysis.status) || (aiSnapshot(analysis).result && !regenerate)) return NextResponse.json(aiSnapshot(analysis));
    const generation = randomUUID();
    const claimed = await db.aiAnalysis.updateMany({ where: { id: analysis.id, generation: analysis.generation, status: { in: ['IDLE', 'COMPLETED', 'FAILED'] } }, data: { status: 'QUEUED', generation, error: null } });
    if (!claimed.count) {
      const current = await db.aiAnalysis.findUnique({ where: { id: analysis.id } });
      return NextResponse.json(current ? aiSnapshot(current) : { error: t('m157') }, { status: current ? 200 : 404 });
    }
    try {
      await getAiQueue().add('recommendations', { analysisId: analysis.id, generation }, { jobId: `ai-${analysis.id}-${generation}`, attempts: 2, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 100 });
    } catch {
      await db.aiAnalysis.updateMany({ where: { id: analysis.id, generation, status: 'QUEUED' }, data: { status: 'FAILED', error: 'ai.queueUnavailable' } });
      return NextResponse.json({ error: t('ai.queueUnavailable') }, { status: 503 });
    }
    return NextResponse.json(aiSnapshot({ ...analysis, status: 'QUEUED', error: null }), { status: 202 });
  } catch { return NextResponse.json({ error: t('ai.queueUnavailable') }, { status: 503 }); }
}
