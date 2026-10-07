import { requireCrawl } from '@/lib/access';
import { db } from '@seo/db';
import { compareCrawls } from '@seo/shared';
import { translator } from '@seo/shared/i18n';
import { getLocale } from '@/lib/locale';
import { notFound } from 'next/navigation';
export const metadata = { robots: { index: false, follow: false } };
export default async function Compare({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ onceki?: string }> }) {
  const t = translator(await getLocale()), { id } = await params, { onceki } = await searchParams;
  const owner = await requireCrawl(id);
  const current = await db.crawl.findUnique({ where: { id }, include: { findings: true } });
  if (!current) notFound();
  const history = await db.crawl.findMany({ where: { ownerHash: owner, normalizedHost: current.normalizedHost, status: 'COMPLETED', createdAt: { lt: current.createdAt } }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, createdAt: true } });
  const previous = await db.crawl.findFirst({ where: { ...(onceki ? { id: onceki } : {}), ownerHash: owner, normalizedHost: current.normalizedHost, status: 'COMPLETED', createdAt: { lt: current.createdAt } }, orderBy: { createdAt: 'desc' }, include: { findings: true } });
  if (onceki && !previous) notFound();
  if (!previous) return <main className="container py-16"><h1 className="text-3xl font-black text-brand">{t('m113')}</h1><p className="card mt-6 p-6">{t('m111')}</p></main>;
  const result = compareCrawls(previous, current);
  const labels = { new: 'm114', resolved: 'm116', ongoing: 'm115', worsened: 'comparison.worsened', unverified: 'comparison.unverified' };
  return <main className="container py-10"><h1 className="text-3xl font-black text-brand">{t('m113')}</h1><p className="mt-2 text-muted">{current.normalizedHost}</p>
    <form className="card my-6 flex flex-wrap items-end gap-3 p-5"><label className="flex flex-col gap-2">{t('comparison.choose')}<select className="rounded-lg border p-2" name="onceki" defaultValue={previous.id}>{history.map(c => <option key={c.id} value={c.id}>{c.createdAt.toISOString()}</option>)}</select></label><button className="btn">{t('m122')}</button></form>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[[t('ui.score'), result.score], [t('comparison.pages'), result.pages], [t('comparison.errors'), result.errors], [t('comparison.critical'), result.critical]].map(([label, value]) => <div className="card p-5" key={String(label)}><p className="text-sm text-muted">{label}</p><strong className="text-2xl">{value === null ? '\u2014' : Number(value) > 0 ? `+${value}` : value}</strong></div>)}</div>
    <p className="my-5 text-sm text-muted">{t('comparison.scope')}</p><div className="grid gap-5 lg:grid-cols-2">{Object.entries(labels).map(([status, key]) => <section key={status}><h2 className="mb-3 font-bold">{t(key)} ({result.rows.filter(r => r.status === status).length})</h2>{result.rows.filter(r => r.status === status).map(r => <article className="card mb-3 p-5" key={r.code}><h3 className="font-bold">{t(r.title)}</h3><p className="text-sm text-muted">{r.code} {'\u00b7'} {r.before} {'\u2192'} {r.after} {t('m039')}</p><details className="mt-3 text-sm"><summary>{t('m139')}</summary>{r.added.map(u => <p className="break-all" key={'+' + u}>+ {u}</p>)}{r.removed.map(u => <p className="break-all" key={'-' + u}>- {u}</p>)}</details></article>)}{!result.rows.some(r => r.status === status) && <p className="card p-5 text-muted">{t('m352')}</p>}</section>)}</div></main>;
}
