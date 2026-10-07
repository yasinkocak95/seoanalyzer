import { pageTitle } from '@/lib/page-title';
import Link from 'next/link';
import { db } from '@seo/db';
import { ownerHash } from '@/lib/access';
import { getLocale } from '@/lib/locale';
import { pageIndex } from '@/lib/projects';
import { translator, numberLocale } from '@seo/shared/i18n';
export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: await pageTitle('projects'),  robots: { index: false, follow: false } }; }
export default async function Projects({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const locale = await getLocale(), t = translator(locale), owner = await ownerHash() ?? 'unauthenticated', page = pageIndex((await searchParams).page);
  const domains = await db.crawl.groupBy({ by: ['normalizedHost'], where: { ownerHash: owner }, _max: { createdAt: true }, _count: { id: true }, orderBy: { _max: { createdAt: 'desc' } }, take: 30, skip: page * 30 });
  const projects = await Promise.all(domains.map(async d => {
    const crawls = await db.crawl.findMany({ where: { ownerHash: owner, normalizedHost: d.normalizedHost }, orderBy: { createdAt: 'desc' }, take: 1 });
    const current = crawls[0];
    const completed = await db.crawl.findMany({ where: { ownerHash: owner, normalizedHost: d.normalizedHost, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 2, select: { id: true, score: true } });
    const critical = current ? await db.finding.groupBy({ by: ['code'], where: { crawlId: current.id, severity: 'CRITICAL' } }) : [];
    return { host: d.normalizedHost, count: d._count.id, current, critical: current && ['COMPLETED', 'PARTIAL'].includes(current.status) ? critical.length : null, change: completed.length === 2 && completed[0].score !== null && completed[1].score !== null ? completed[0].score - completed[1].score : null };
  }));
  return <main className="container py-10"><div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-black text-brand">{t('saas.projects')}</h1><p className="mt-2 text-muted">{t('saas.projectsIntro')}</p></div><Link className="btn" href={locale === 'en' ? '/en/#analiz' : '/#analiz'}>{t('m317')}</Link></div>
    <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{projects.map(p => <article className="card p-6" key={p.host}><h2 className="break-all text-xl font-bold text-brand"><Link href={`/projeler/${encodeURIComponent(p.host)}`}>{p.host}</Link></h2><dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted">{t('ui.score')}</dt><dd className="text-2xl font-bold">{p.current?.score ?? '—'}</dd></div><div><dt className="text-muted">{t('m340')}</dt><dd className="text-2xl font-bold">{p.critical ?? '\u2014'}</dd></div><div><dt className="text-muted">{t('saas.change')}</dt><dd>{p.change === null ? '—' : `${p.change > 0 ? '+' : ''}${p.change}`}</dd></div><div><dt className="text-muted">{t('saas.lastCrawl')}</dt><dd>{p.current?.createdAt.toLocaleDateString(numberLocale(locale))}</dd></div></dl><p className="mt-4 text-sm text-muted">{t(p.current?.status)} · {p.count} {t('m318')}</p>{p.current && <Link className="btn mt-4" href={['COMPLETED', 'PARTIAL'].includes(p.current.status) ? `/rapor/${p.current.id}` : `/tarama/${p.current.id}`}>{t('saas.latestReport')}</Link>}</article>)}</div>
    {!projects.length && <section className="card mt-8 p-8"><h2 className="font-bold">{t('saas.noProjects')}</h2><p className="mt-2 text-muted">{t('saas.noProjectsDetail')}</p></section>}
    <nav className="mt-6 flex gap-3" aria-label={t('saas.pagination')}>{page > 0 && <Link className="btn" href={`/projeler?page=${page - 1}`}>{t('saas.previous')}</Link>}{domains.length === 30 && <Link className="btn" href={`/projeler?page=${page + 1}`}>{t('saas.next')}</Link>}</nav>
  </main>;
}
