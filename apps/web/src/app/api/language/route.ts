import { NextResponse } from 'next/server';
import { localeOf } from '@seo/shared/i18n';
import { sameOrigin } from '@/lib/access';
import { requestOrigin } from '@/lib/request-origin';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(request.url), locale = localeOf(url.searchParams.get('lang'));
  const response = NextResponse.json({ locale });
  response.cookies.set('seo-locale', locale, { path: '/', maxAge: 31536000, httpOnly: true, sameSite: 'lax', secure: requestOrigin(request).startsWith('https:') });
  return response;
}
export async function GET(request: Request) {
  const url = new URL(request.url), locale = localeOf(url.searchParams.get('lang'));
  const path = url.searchParams.get('returnTo') ?? (locale === 'en' ? '/en/' : '/');
  // Reject external, protocol-relative and backslash redirects.
  const safePath = /^\/(?!\/)/.test(path) && !/[\\\r\n]/.test(path) ? path : '/';
  const response = NextResponse.redirect(new URL(safePath, requestOrigin(request)));
  response.cookies.set('seo-locale', locale, { path: '/', maxAge: 31536000, httpOnly: true, sameSite: 'lax', secure: requestOrigin(request).startsWith('https:') });
  return response;
}
