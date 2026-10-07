import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requestOrigin } from './lib/request-origin';
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete('x-seo-locale');
  // Public landing URLs always have deterministic language, independent of cookies.
  if (request.nextUrl.pathname === '/') headers.set('x-seo-locale', 'tr');
  if (/^\/en\/?$/.test(request.nextUrl.pathname)) headers.set('x-seo-locale', 'en');
  const response=NextResponse.next({request:{headers}});
  if (/^\/(?:api|rapor|tarama|taramalar|projeler|karsilastir|shared)(?:\/|$)/.test(request.nextUrl.pathname)) {
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  const locale=headers.get('x-seo-locale');
  const secure = requestOrigin(request).startsWith('https:');
  if(locale && request.cookies.get('seo-locale')?.value!==locale)response.cookies.set('seo-locale',locale,{path:'/',maxAge:31536000,httpOnly:true,sameSite:'lax',secure});
  if (!/^[a-f0-9]{64}$/.test(request.cookies.get('seo-workspace')?.value ?? '')) response.cookies.set('seo-workspace', randomBytes(32).toString('hex'), { path: '/', httpOnly: true, sameSite: 'strict', secure, maxAge: 31536000 });
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
