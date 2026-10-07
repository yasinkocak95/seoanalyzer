'use client';

import { createContext, useContext } from 'react';
import { usePathname } from 'next/navigation';
import { translator, type Locale } from '@seo/shared/i18n';
const LanguageContext = createContext<Locale>('tr');
export function LanguageProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LanguageContext.Provider value={locale}>{children}</LanguageContext.Provider>;
}
export const useLocale = () => useContext(LanguageContext);
export const useTranslation = () => translator(useLocale());
export function LanguageSwitcher() {
  const locale = useLocale(), path = usePathname();
  const target = (language: Locale) => path === '/' || path === '/en' || path === '/en/' ? (language === 'en' ? '/en/' : '/') : path;
  return <div className="language-switcher" aria-label="Language">
    {(['tr', 'en'] as const).map(language => <a key={language} href={`/api/language?lang=${language}&returnTo=${encodeURIComponent(target(language))}`} lang={language} aria-current={locale === language ? 'true' : undefined} className={locale === language ? 'text-action underline' : 'text-muted'}>{language.toUpperCase()}</a>)}
  </div>;
}
