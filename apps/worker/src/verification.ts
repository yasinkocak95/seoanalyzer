import { load } from 'cheerio';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { db } from '@seo/db';
import { runRules } from '@seo/rules';
import { VERIFY_QUEUE, VERIFIABLE_CODES, verificationResult, type VerifyJob } from '@seo/shared';
import { safeFetch, limitedText } from './fetch-safe.js';
import { robotsAllows } from './crawl.js';
export async function verifyUrl(code: string, url: string) {
  if (!VERIFIABLE_CODES.has(code)) return 'COULD_NOT_VERIFY';
  try {
    const robotsUrl = new URL('/robots.txt', url).toString();
    const robots = await safeFetch(robotsUrl);
    if (robots.response.ok) { if (!robotsAllows(await limitedText(robots.response), new URL(url).pathname + new URL(url).search)) return 'COULD_NOT_VERIFY'; }
    else { await robots.response.body?.cancel(); if (robots.response.status !== 404) return 'COULD_NOT_VERIFY'; }
    const { response, finalUrl } = await safeFetch(url);
    if (response.status === 429 || response.status >= 500) { await response.body?.cancel(); return 'COULD_NOT_VERIFY'; }
    if (code === 'HTTP_ERROR') { await response.body?.cancel(); return response.status >= 400 ? 'STILL_PRESENT' : response.ok ? 'FIXED' : 'COULD_NOT_VERIFY'; }
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html') || new URL(finalUrl).hostname !== new URL(url).hostname) { await response.body?.cancel(); return 'COULD_NOT_VERIFY'; }
    const $ = load(await limitedText(response));
    const findings = runRules({ pages: [{ url, statusCode: response.status, responseKind: 'HTML', title: $('title').first().text(), description: $('meta[name="description"]').attr('content'), h1: $('h1').map((_, e) => $(e).text()).get(), canonical: $('link[rel="canonical"]').first().attr('href'), canonicalCount: $('link[rel="canonical"]').length, robots: $('meta[name="robots"]').map((_, e) => $(e).attr('content') ?? '').get().join(','), xRobots: response.headers.get('x-robots-tag') }], sitemapUrls: [], robotsAccessible: true, robotsUrl, crawlLimited: true, sitemapFound: true });
    return findings.some(f => f.code === code) ? 'STILL_PRESENT' : 'FIXED';
  } catch { return 'COULD_NOT_VERIFY'; }
}
export function startVerificationWorker(connection: Redis) {
  const queue = new Queue<VerifyJob>(VERIFY_QUEUE, { connection });
  const worker = new Worker<VerifyJob>(VERIFY_QUEUE, async job => {
    const record = await db.fixVerification.findUnique({ where: { id: job.data.verificationId } });
    if (!record || record.generation !== job.data.generation || !['QUEUED', 'RUNNING'].includes(record.status)) return;
    const where = { id: record.id, generation: record.generation, status: { in: ['QUEUED', 'RUNNING'] } };
    const claim = await db.fixVerification.updateMany({ where, data: { status: 'RUNNING' } });
    if (!claim.count) return;
    const targets = Array.isArray(record.targets) ? record.targets.filter((u): u is string => typeof u === 'string') : [];
    const results: string[] = [];
    if (targets.length <= 100) for (const url of targets) { results.push(await verifyUrl(record.code, url)); await new Promise(resolve => setTimeout(resolve, 500)); }
    await db.fixVerification.updateMany({ where, data: { status: verificationResult(results), checkedAt: new Date() } });
  }, { connection, concurrency: 1 });
  worker.on('error', () => console.error('Verification worker unavailable'));
  queue.on('error', () => console.error('Verification queue unavailable'));
  return { async reconcile() {
    const records = await db.fixVerification.findMany({ where: { status: { in: ['QUEUED', 'RUNNING'] }, updatedAt: { lt: new Date(Date.now() - 60000) } }, take: 100 });
    for (const record of records) {
      const jobId = `verify-${record.id}-${record.generation}`, job = await queue.getJob(jobId);
      if (!job) await queue.add('verify', { verificationId: record.id, generation: record.generation }, { jobId, attempts: 2, removeOnComplete: 100, removeOnFail: 100 });
      else if (['failed', 'completed'].includes(await job.getState())) await db.fixVerification.updateMany({ where: { id: record.id, generation: record.generation, status: { in: ['QUEUED', 'RUNNING'] } }, data: { status: 'COULD_NOT_VERIFY', checkedAt: new Date() } });
    }
  } };
}
