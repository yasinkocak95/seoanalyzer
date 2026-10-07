import Link from 'next/link';
import { getLocale } from '@/lib/locale';
import { translator } from '@seo/shared/i18n';
export default async function NotFound() {
  const locale=await getLocale(),t=translator(locale);
  return <main className="container py-16"><div className="card p-8"><h1 className="text-2xl font-bold">{t('m365')}</h1><p className="my-4">{t('m366')}</p><Link className="btn" href={locale==='en'?'/en/':'/'}>{t('m367')}</Link></div></main>;
}
