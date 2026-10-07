// Operator-only migration utility. Dry-run by default; never invoked by the web app.
import { PrismaClient } from '@prisma/client';
const args = process.argv.slice(2);
const option = name => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
const ownerHash = option('--owner-hash'), crawlIds = args.flatMap((v, i) => v === '--crawl-id' && args[i + 1] ? [args[i + 1]] : []);
if (!ownerHash || !/^[a-f0-9]{64}$/.test(ownerHash) || !crawlIds.length || crawlIds.some(id => !/^[a-zA-Z0-9_-]{1,100}$/.test(id))) {
  throw new Error('Specify --owner-hash (SHA-256 of the verified workspace cookie) and one or more --crawl-id arguments. Add --apply only after reviewing the dry-run.');
}
const db = new PrismaClient();
try {
  const records = await db.crawl.findMany({ where: { id: { in: crawlIds }, ownerHash: null }, select: { id: true, normalizedHost: true } });
  console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'dry-run', eligible: records }, null, 2));
  if (args.includes('--apply')) {
    const result = await db.crawl.updateMany({ where: { id: { in: records.map(r => r.id) }, ownerHash: null }, data: { ownerHash } });
    console.log(`Assigned ${result.count} previously unowned crawls. Existing ownership was not changed.`);
  }
} finally { await db.$disconnect(); }
