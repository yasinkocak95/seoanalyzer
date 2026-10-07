import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from '@seo/db';
import { notFound } from 'next/navigation';
export const sessionCookie = 'seo-workspace';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const newCapability = () => randomBytes(32).toString('hex');
export async function ownerHash() {
  const value = (await cookies()).get(sessionCookie)?.value;
  return value && /^[a-f0-9]{64}$/.test(value) ? digest(value) : null;
}
export async function requireCrawl(id: string) {
  const owner = await ownerHash();
  if (!owner || !await db.crawl.findFirst({ where: { id, ownerHash: owner }, select: { id: true } })) notFound();
  return owner;
}
export { sameOrigin } from './request-origin';
