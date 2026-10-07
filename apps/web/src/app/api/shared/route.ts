import { NextResponse } from 'next/server';
import { db } from '@seo/db';
import { digest, sameOrigin } from '@/lib/access';
import { rateLimit } from '@/lib/rate-limit';
import { publicReport } from '@/lib/public-report';
import { localeOf } from '@seo/shared';
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  try {
    const body = await request.json();
    if (!body || typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) return NextResponse.json({ error: 'Unavailable' }, { status: 404, headers });
    // Global admission limit also bounds random capability guessing without trusting forwarded IP headers.
    if (!await rateLimit('public-reports', 600, 60)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers });
    const share = await db.reportShare.findFirst({ where: { tokenHash: digest(body.token), revokedAt: null, expiresAt: { gt: new Date() } }, select: { crawlId: true } });
    if (!share) return NextResponse.json({ error: 'Unavailable' }, { status: 404, headers });
    if (await db.finding.count({ where: { crawlId: share.crawlId } }) > 2000) return NextResponse.json({ error: 'Report too large' }, { status: 413, headers });
    const crawl = await db.crawl.findUnique({ where: { id: share.crawlId }, select: { normalizedHost: true, score: true, completedAt: true, findings: { select: { code: true, severity: true, title: true, description: true, recommendation: true, affectedUrls: true } } } });
    if (!crawl) return NextResponse.json({ error: 'Unavailable' }, { status: 404, headers });
    if (crawl.findings.reduce((sum, f) => sum + (Array.isArray(f.affectedUrls) ? f.affectedUrls.length : 0), 0) > 20000) return NextResponse.json({ error: 'Report too large' }, { status: 413, headers });
    return NextResponse.json(publicReport({ ...crawl, findings: crawl.findings.map(f => ({ ...f, evidence: [] })) }, localeOf(body.locale)), { headers });
  } catch { return NextResponse.json({ error: 'Unavailable' }, { status: 503, headers }); }
}
