import { getLocale } from '@/lib/locale';
import { translator } from '@seo/shared/i18n';
import { LanguageProvider, LanguageSwitcher } from '@/components/language';
import { SiteFooter } from '@/components/site-footer';
import './globals.css';
import Link from 'next/link';
import { ArrowUpRight, SearchCheck } from 'lucide-react';

export async function generateMetadata() {
  const locale = await getLocale(), t = translator(locale);
  return { title: t('m001'), description: t('m002') };
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale(), t = translator(locale);
  const home = locale === 'en' ? '/en/' : '/';
  return <html lang={locale}><body><LanguageProvider locale={locale}>
    <header className="site-header">
      <div className="container site-navbar">
        <Link href={home} className="site-brand"><span className="brand-mark"><SearchCheck size={22} /></span>{t('m003')}</Link>
        <nav className="site-nav" aria-label={t('ui.navigation')}>
          <Link className="nav-analysis" href={home}>{t('m317')}<ArrowUpRight size={15} /></Link>
          <Link href="/taramalar">{t('m318')}</Link>
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
    {children}
    <SiteFooter locale={locale} />
  </LanguageProvider></body></html>;
}
