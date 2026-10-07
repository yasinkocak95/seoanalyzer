import { NextResponse } from 'next/server';
import { db } from '@seo/db';
import { getQueue } from '@/lib/queue';
import { getLocale } from '@/lib/locale';
import { translator, turkish } from '@seo/shared/i18n';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = translator(await getLocale()), { id } = await params;
  let body: { action?: string };
  try { body = await request.json(); if (!body) throw new Error(); }
  catch { return NextResponse.json({ error: t('m372') }, { status: 400 }); }
  const crawl = await db.crawl.findUnique({ where: { id } });
  if (!crawl) return NextResponse.json({ error: t('m157') }, { status: 404 });
  try {
    if (body.action === 'pause') {
      const changed = await db.crawl.updateMany({ where: { id, status: 'RUNNING' }, data: { status: 'PAUSED', statusMessage: turkish('m158') } });
      if (changed.count) return NextResponse.json({ status: 'PAUSED' });
    }
    if (body.action === 'resume' && ['PAUSED', 'PARTIAL'].includes(crawl.status)) {
      // A pause takes effect after the active batch; do not launch a second processor.
      const queue = getQueue(), active = await queue.getJobs(['active']);
      if (active.some(job => job.data.crawlId === id)) return NextResponse.json({ error: t('m160') }, { status: 409 });
      const changed = await db.crawl.updateMany({ where: { id, status: crawl.status }, data: { status: 'QUEUED', statusMessage: turkish('m159') } });
      if (!changed.count) return NextResponse.json({ error: t('m160') }, { status: 409 });
      try { await queue.add('crawl', { crawlId: id, rootUrl: crawl.rootUrl }, { jobId: `${id}-${Date.now()}`, attempts: 2, backoff: { type: 'exponential', delay: 3000 } }); }
      catch (error) {
        await db.crawl.updateMany({ where: { id, status: 'QUEUED' }, data: { status: crawl.status, statusMessage: crawl.statusMessage } });
        throw error;
      }
      return NextResponse.json({ status: 'QUEUED' });
    }
    return NextResponse.json({ error: t('m160') }, { status: 409 });
  } catch (error) { console.error('Crawl control failed', error); return NextResponse.json({ error: t('m373') }, { status: 503 }); }
}
