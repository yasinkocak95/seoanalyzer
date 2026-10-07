import { cookies, headers } from 'next/headers';
import { localeOf, type Locale } from '@seo/shared/i18n';
export async function getLocale(): Promise<Locale> {
  const h = await headers();
  const routeLocale = h.get('x-seo-locale');
  if (routeLocale) return localeOf(routeLocale);
  return localeOf((await cookies()).get('seo-locale')?.value);
}
