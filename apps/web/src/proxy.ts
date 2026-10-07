import { NextRequest, NextResponse } from 'next/server';
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete('x-seo-locale');
  // Public landing URLs always have deterministic language, independent of cookies.
  if (request.nextUrl.pathname === '/') headers.set('x-seo-locale', 'tr');
  if (/^\/en\/?$/.test(request.nextUrl.pathname)) headers.set('x-seo-locale', 'en');
  const response=NextResponse.next({request:{headers}});
  const locale=headers.get('x-seo-locale');
  if(locale && request.cookies.get('seo-locale')?.value!==locale)response.cookies.set('seo-locale',locale,{path:'/',maxAge:31536000,httpOnly:true,sameSite:'lax',secure:request.nextUrl.protocol==='https:'});
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
