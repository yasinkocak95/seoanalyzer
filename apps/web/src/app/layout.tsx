import { getLocale } from '@/lib/locale';
import { translator } from '@seo/shared/i18n';
import { LanguageProvider, LanguageSwitcher } from '@/components/language';
import { SiteFooter } from '@/components/site-footer';
import { BrandLogo } from '@/components/brand-logo';
import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale(), t = translator(locale);
  return {
    title: t('m001'), description: t('m002'),
    icons: { icon: [
      { url: '/branding/icon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/branding/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ], apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }] },
  };
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale(), t = translator(locale);
  const home = locale === 'en' ? '/en/' : '/';
  return <html lang={locale}><body><LanguageProvider locale={locale}>
    <header className="site-header">
      <div className="container site-navbar">
        <Link href={home} className="site-brand"><BrandLogo priority /></Link>
        <nav className="site-nav" aria-label={t('ui.navigation')}>
          <Link className="nav-analysis" href={home}>{t('m317')}<ArrowUpRight size={15} /></Link>
          <Link href="/projeler">{t('saas.projects')}</Link>
          <Link href="/taramalar">{t('m318')}</Link>
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
    {children}
    <SiteFooter locale={locale} />
  </LanguageProvider></body></html>;
}
