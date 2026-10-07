import { NextResponse } from 'next/server';
import { localeOf } from '@seo/shared/i18n';
export async function GET(request: Request) {
  const url = new URL(request.url), locale = localeOf(url.searchParams.get('lang'));
  const path = url.searchParams.get('returnTo') ?? (locale === 'en' ? '/en/' : '/');
  // Reject external, protocol-relative and backslash redirects.
  const safePath = /^\/(?!\/)/.test(path) && !/[\\\r\n]/.test(path) ? path : '/';
  const response = NextResponse.redirect(new URL(safePath, process.env.NEXT_PUBLIC_APP_URL ?? url.origin));
  response.cookies.set('seo-locale', locale, { path: '/', maxAge: 31536000, httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:' });
  return response;
}
