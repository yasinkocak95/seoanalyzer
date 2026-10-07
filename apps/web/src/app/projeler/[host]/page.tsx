import { ScheduleControls } from '@/components/schedule-controls';
import { HealthHistory } from '@/components/health-history';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ownerHash } from '@/lib/access';
import { getLocale } from '@/lib/locale';
import { projectHistory, pageIndex } from '@/lib/projects';
import { translator, numberLocale } from '@seo/shared/i18n';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default async function Project({ params, searchParams }: { params: Promise<{ host: string }>; searchParams: Promise<{ page?: string }> }) {
  const { host } = await params, owner = await ownerHash(), locale = await getLocale(), t = translator(locale), page = pageIndex((await searchParams).page);
  if (!owner) notFound();
  const history = await projectHistory(owner, host, page);
  if (!history.length) notFound();
  return <main className="container py-10"><Link className="text-sm text-action" href="/projeler">← {t('saas.projects')}</Link><h1 className="mt-3 break-all text-3xl font-black text-brand">{host}</h1><ScheduleControls host={host} /><HealthHistory history={history} locale={locale} /><h2 className="mt-8 text-xl font-bold">{t('saas.history')}</h2><div className="card mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr>{['saas.lastCrawl', 'ui.score', 'm340', 'saas.status', 'saas.report'].map(k => <th className="border-b p-4" key={k}>{t(k)}</th>)}</tr></thead><tbody>{history.map((c, i) => <tr className="border-b" key={c.id}><td className="p-4">{c.createdAt.toLocaleString(numberLocale(locale))}</td><td className="p-4">{c.score ?? '—'}</td><td className="p-4">{c.critical}</td><td className="p-4">{t(c.status)}</td><td className="p-4"><Link className="text-action underline" href={['COMPLETED', 'PARTIAL'].includes(c.status) ? `/rapor/${c.id}` : `/tarama/${c.id}`}>{t('saas.report')}</Link>{history[i + 1]?.status === 'COMPLETED' && <Link className="ml-3 text-action underline" href={`/karsilastir/${c.id}?onceki=${history[i + 1].id}`}>{t('m122')}</Link>}</td></tr>)}</tbody></table></div><nav className="mt-5 flex gap-3" aria-label={t('saas.pagination')}>{page > 0 && <Link className="btn" href={`/projeler/${encodeURIComponent(host)}?page=${page - 1}`}>{t('saas.previous')}</Link>}{history.length === 60 && <Link className="btn" href={`/projeler/${encodeURIComponent(host)}?page=${page + 1}`}>{t('saas.next')}</Link>}</nav></main>;
}
