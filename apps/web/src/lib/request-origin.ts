export function requestOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    if (['http:', 'https:'].includes(url.protocol)) return url.origin;
  }
  return new URL(request.url).origin;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  // Public deployment configuration is authoritative; forwarded headers are untrusted input.
  return (!origin || origin === requestOrigin(request)) && request.headers.get('sec-fetch-site') !== 'cross-site';
}
