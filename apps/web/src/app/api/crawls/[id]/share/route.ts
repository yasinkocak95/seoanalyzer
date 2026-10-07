import { NextResponse } from 'next/server';
import { db } from '@seo/db';
import { digest, newCapability, requireCrawl, sameOrigin } from '@/lib/access';
import { rateLimit } from '@/lib/rate-limit';
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params, owner = await requireCrawl(id);
  try {
    if (!await rateLimit(`share-${owner}`, 20, 3600)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    const crawl = await db.crawl.findUnique({ where: { id }, select: { status: true } });
    if (!crawl || !['COMPLETED', 'PARTIAL'].includes(crawl.status)) return NextResponse.json({ error: 'Report unavailable' }, { status: 409 });
    const token = newCapability(), expiresAt = new Date(Date.now() + 30 * 86400000);
    await db.reportShare.create({ data: { crawlId: id, tokenHash: digest(token), expiresAt } });
    return NextResponse.json({ path: `/shared#${token}`, expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }); }
}
export async function DELETE(request: Request, { params }: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params; await requireCrawl(id);
  try { await db.reportShare.updateMany({ where: { crawlId: id, revokedAt: null }, data: { revokedAt: new Date() } }); return NextResponse.json({ revoked: true }); }
  catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }); }
}
