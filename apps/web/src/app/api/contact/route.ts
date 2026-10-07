import { NextResponse } from 'next/server';
import { db } from '@seo/db';
import { ownerHash, sameOrigin } from '@/lib/access';
import { rateLimit } from '@/lib/rate-limit';
import { parseContact } from '@/lib/contact';
export async function POST(request: Request) {
  const owner = await ownerHash();
  if (!owner || !sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let data;
  try { data = parseContact(await request.json()); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  try {
    if (!await rateLimit(`contact-${owner}`, 3, 3600) || !await rateLimit('contact-global', 100, 3600)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    await db.contactRequest.create({ data: { ownerHash: owner, ...data } });
    return NextResponse.json({ recorded: true }, { status: 201 });
  } catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }); }
}
