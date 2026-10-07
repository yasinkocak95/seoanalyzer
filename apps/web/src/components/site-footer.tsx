import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { translator, type Locale } from '@seo/shared/i18n';
import { LanguageSwitcher } from './language';
import { BrandLogo } from './brand-logo';

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = translator(locale), home = locale === 'en' ? '/en/' : '/';
  return <footer className="site-footer">
    <div className="container">
      <div className="footer-grid">
        <div className="footer-brand">
          <Link href={home} className="site-brand"><BrandLogo /></Link>
          <p>{t('footer.description')}</p>
          <Link href={`${home}#analiz`} className="footer-cta">{t('m317')}<ArrowUpRight size={16} /></Link>
        </div>
        <nav className="footer-column" aria-label={t('footer.product')}>
          <h2>{t('footer.product')}</h2>
          <Link href={`${home}#analiz`}>{t('m317')}</Link>
          <Link href="/taramalar">{t('m318')}</Link>
          <Link href="/projeler">{t('saas.projects')}</Link>
          <Link href={`${home}#ozellikler`}>{t('footer.features')}</Link>
        </nav>
        <nav className="footer-column" aria-label={t('footer.resources')}>
          <h2>{t('footer.resources')}</h2>
          <Link href={`${home}#nasil-calisir`}>{t('footer.how')}</Link>
          <Link href={`${home}#sss`}>{t('footer.faq')}</Link>
          {['about', 'privacy', 'terms', 'contact'].map(kind => <Link key={kind} href={`/${kind}`}>{t(`legal.${kind}`)}</Link>)}
        </nav>
        <div className="footer-column footer-language">
          <h2>{t('footer.language')}</h2>
          <LanguageSwitcher />
          <p>{t('footer.positioning')}</p>
        </div>
      </div>
      <div className="footer-bottom"><p>© {new Date().getFullYear()} SEOAnalyzer. {t('footer.copyright')}</p><span>{t('footer.positioning')}</span></div>
    </div>
  </footer>;
}
