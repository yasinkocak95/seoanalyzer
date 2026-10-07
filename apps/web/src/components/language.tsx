'use client';

import { createContext, useContext, useState } from 'react';
import { usePathname } from 'next/navigation';
import { translator, type Locale } from '@seo/shared/i18n';
const LanguageContext = createContext<Locale>('tr');
export function LanguageProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LanguageContext.Provider value={locale}>{children}</LanguageContext.Provider>;
}
export const useLocale = () => useContext(LanguageContext);
export const useTranslation = () => translator(useLocale());
export function LanguageSwitcher() {
  const locale = useLocale(), path = usePathname(), t = useTranslation(), [error, setError] = useState(false);
  const target = (language: Locale) => path === '/' || path === '/en' || path === '/en/' ? (language === 'en' ? '/en/' : '/') : path;
  return <div className="language-switcher" aria-label="Language">
    {(['tr', 'en'] as const).map(language => <a key={language} href={`/api/language?lang=${language}&returnTo=${encodeURIComponent(target(language))}`} onClick={async event => {
      if (!/^\/shared\/?$/.test(path)) {
        // Keep the selected comparison baseline, pagination and section on full navigation.
        event.currentTarget.href = `/api/language?lang=${language}&returnTo=${encodeURIComponent(target(language) + location.search + location.hash)}`;
        return;
      }
      event.preventDefault();
      // Keep the sharing capability in the fragment throughout language changes.
      setError(false);
      try { const response = await fetch(`/api/language?lang=${language}`, { method: 'POST' }); if (!response.ok) throw new Error(); location.reload(); }
      catch { setError(true); }
    }} lang={language} aria-current={locale === language ? 'true' : undefined} className={locale === language ? 'text-action underline' : 'text-muted'}>{language.toUpperCase()}</a>)}
    {error && <span role="alert" className="text-xs text-red-700">{t('saas.error')}</span>}
  </div>;
}
