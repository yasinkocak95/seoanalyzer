import { translator, numberLocale, type Locale } from '@seo/shared/i18n';
type Point = { id: string; status: string; score: number | null; critical: number; createdAt: Date };
export function healthSeries(history: Point[]) { return history.filter(c => c.status === 'COMPLETED').slice().reverse(); }
export function HealthHistory({ history, locale }: { history: Point[]; locale: Locale }) {
  const t = translator(locale), points = healthSeries(history);
  return <section className="mt-8"><h2 className="text-xl font-bold text-brand">{t('saas.healthHistory')}</h2><p className="mt-2 text-sm text-muted">{t('saas.trendScope')}</p>{points.length < 2 ? <p className="card mt-4 p-6 text-muted">{t('saas.trendEmpty')}</p> : <div className="mt-4 grid gap-5 lg:grid-cols-2">{(['score', 'critical'] as const).map(metric => {
    const maximum = metric === 'score' ? 100 : Math.max(1, ...points.map(p => p.critical));
    const coords = points.map((p, i) => ({ x: 45 + i * 510 / (points.length - 1), y: p[metric] === null ? null : 170 - p[metric]! * 140 / maximum }));
    // Separate line segments at unknown scores rather than inventing zeroes.
    const segments: string[][] = [[]]; coords.forEach(p => { if (p.y === null) segments.push([]); else segments.at(-1)!.push(`${p.x},${p.y}`); });
    const label = t(metric === 'score' ? 'ui.score' : 'm340');
    return <figure className="card p-5" key={metric}><figcaption className="font-bold">{label}</figcaption><svg viewBox="0 0 600 220" className="mt-3 w-full" role="img" aria-label={label}><title>{label}</title><desc>{t('saas.chartDescription')}</desc>{[0, .5, 1].map(f => <g key={f}><line x1="45" x2="555" y1={170 - f * 140} y2={170 - f * 140} stroke="#e2e8f0"/><text x="5" y={175 - f * 140} fontSize="12" fill="#64748b">{Math.round(maximum * f)}</text></g>)}{segments.filter(s => s.length).map((s, i) => <polyline key={i} points={s.join(' ')} fill="none" stroke={metric === 'score' ? '#2563eb' : '#dc2626'} strokeWidth="3"/>)}{coords.map((p, i) => p.y === null ? null : <circle key={points[i].id} cx={p.x} cy={p.y} r="4" fill={metric === 'score' ? '#2563eb' : '#dc2626'}><title>{`${points[i].createdAt.toLocaleDateString(numberLocale(locale))}: ${points[i][metric]}`}</title></circle>)}<text x="45" y="205" fontSize="12" fill="#64748b">{points[0].createdAt.toLocaleDateString(numberLocale(locale))}</text><text x="555" y="205" textAnchor="end" fontSize="12" fill="#64748b">{points.at(-1)!.createdAt.toLocaleDateString(numberLocale(locale))}</text></svg></figure>;
  })}</div>}</section>;
}
