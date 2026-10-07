import { getLocale } from '@/lib/locale';
import { translator } from '@seo/shared/i18n';
export default async function Loading() {
  const t = translator(await getLocale());
  return <main className="container py-12" aria-busy="true"><div className="card p-8" role="status"><p className="font-bold text-brand">{t('saas.loading')}</p><div className="mt-5 h-3 w-2/3 rounded-full bg-slate-100" aria-hidden="true"/><div className="mt-3 h-3 w-1/2 rounded-full bg-slate-100" aria-hidden="true"/></div></main>;
}
