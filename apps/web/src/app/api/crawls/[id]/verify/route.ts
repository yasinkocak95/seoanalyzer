import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@seo/db';
import { VERIFIABLE_CODES } from '@seo/shared';
import { requireCrawl, sameOrigin } from '@/lib/access';
import { rateLimit } from '@/lib/rate-limit';
import { getVerifyQueue } from '@/lib/queue';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  const { id } = await params; await requireCrawl(id);
  const code = new URL(request.url).searchParams.get('code') ?? '';
  const result = await db.fixVerification.findUnique({ where: { crawlId_code: { crawlId: id, code } }, select: { status: true, checkedAt: true, targets: true } });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request, { params }: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params, owner = await requireCrawl(id);
  let body: { code: string; url?: string };
  try { body = await request.json(); if (!body || typeof body.code !== 'string' || body.code.length > 100 || (body.url !== undefined && typeof body.url !== 'string')) throw new Error(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  try {
    if (!await rateLimit(`verify-${owner}`, 30, 3600)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    const crawl = await db.crawl.findUnique({ where: { id }, select: { status: true } });
    if (!crawl || !['COMPLETED', 'PARTIAL'].includes(crawl.status)) return NextResponse.json({ error: 'Report unavailable' }, { status: 409 });
    const findings = await db.finding.findMany({ where: { crawlId: id, code: body.code }, select: { affectedUrls: true }, take: 2001 });
    if (!findings.length) return NextResponse.json({ error: 'Unknown issue' }, { status: 404 });
    if (findings.length > 2000) return NextResponse.json({ error: 'Select a URL' }, { status: 413 });
    const urls = [...new Set(findings.flatMap(f => Array.isArray(f.affectedUrls) ? f.affectedUrls.filter((u): u is string => typeof u === 'string') : []))];
    if (body.url && !urls.includes(body.url)) return NextResponse.json({ error: 'Unknown URL' }, { status: 400 });
    const targets = body.url ? [body.url] : urls;
    if (targets.length > 100) return NextResponse.json({ error: 'Select a URL' }, { status: 413 });
    const generation = randomUUID();
    const record = await db.fixVerification.upsert({ where: { crawlId_code: { crawlId: id, code: body.code } }, create: { crawlId: id, code: body.code, targets: [], generation: '', status: 'COULD_NOT_VERIFY' }, update: {} });
    if (['QUEUED', 'RUNNING'].includes(record.status)) return NextResponse.json(record, { status: 202 });
    const status = VERIFIABLE_CODES.has(body.code) ? 'QUEUED' : 'COULD_NOT_VERIFY';
    const claim = await db.fixVerification.updateMany({ where: { id: record.id, generation: record.generation, status: { notIn: ['QUEUED', 'RUNNING'] } }, data: { generation, targets, status, checkedAt: status === 'COULD_NOT_VERIFY' ? new Date() : null } });
    if (!claim.count) return NextResponse.json({ status: 'QUEUED' }, { status: 202 });
    if (status === 'QUEUED') {
      try { await getVerifyQueue().add('verify', { verificationId: record.id, generation }, { jobId: `verify-${record.id}-${generation}`, attempts: 2, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 100, removeOnFail: 100 }); }
      catch { await db.fixVerification.updateMany({ where: { id: record.id, generation }, data: { status: 'COULD_NOT_VERIFY', checkedAt: new Date() } }); return NextResponse.json({ error: 'Queue unavailable' }, { status: 503 }); }
    }
    return NextResponse.json({ status, targets }, { status: status === 'QUEUED' ? 202 : 200 });
  } catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }); }
}
