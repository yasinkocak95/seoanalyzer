import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { requestOrigin, sameOrigin } from './request-origin';
import { proxy } from '../proxy';
import { GET } from '../app/api/language/route';
beforeEach(() => vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://seo.example.com'));
afterEach(() => vi.unstubAllEnvs());
it('allows a legitimate HTTPS origin behind the standalone internal HTTP listener', () => {
  expect(sameOrigin(new Request('http://0.0.0.0:3000/api/crawls', { headers: { origin: 'https://seo.example.com', host: 'seo.example.com', 'sec-fetch-site': 'same-origin' } }))).toBe(true);
});
it('uses the request URL for same-origin browser requests without a configured public URL', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
  const request = new Request('http://localhost:3000/api/crawls', { headers: { origin: 'http://localhost:3000', host: 'localhost:3000', 'sec-fetch-site': 'same-origin' } });
  expect(requestOrigin(request)).toBe('http://localhost:3000');
  expect(sameOrigin(request)).toBe(true);
  expect(sameOrigin(new Request(request, { headers: { origin: 'http://localhost:3001', host: 'localhost:3001' } }))).toBe(false);
});
it('compares against the configured URL origin, including its port and excluding its path', () => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', ' https://seo.example.com:8443/app/ ');
  const request = new Request('http://0.0.0.0:3000/api/crawls', { headers: { origin: 'https://seo.example.com:8443', host: 'seo.example.com:8443', 'sec-fetch-site': 'same-origin' } });
  expect(requestOrigin(request)).toBe('https://seo.example.com:8443');
  expect(sameOrigin(request)).toBe(true);
  expect(sameOrigin(new Request(request, { headers: { origin: 'https://seo.example.com' } }))).toBe(false);
});
it('does not trust forged forwarded origins or cross-site mutations', () => {
  expect(sameOrigin(new Request('http://0.0.0.0:3000/api/crawls', { headers: { origin: 'https://evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' } }))).toBe(false);
  expect(sameOrigin(new Request('http://0.0.0.0:3000/api/crawls', { headers: { origin: 'https://seo.example.com', 'sec-fetch-site': 'cross-site' } }))).toBe(false);
  expect(sameOrigin(new Request('http://0.0.0.0:3000/api/crawls', { headers: { origin: 'https://evil.example', host: 'evil.example' } }))).toBe(false);
  expect(sameOrigin(new Request('http://0.0.0.0:3000/api/crawls', { headers: { origin: 'http://0.0.0.0:3000', 'sec-fetch-site': 'same-origin' } }))).toBe(false);
});
it('sets secure workspace and locale cookies behind HTTPS termination', () => {
  const response = proxy(new NextRequest('http://0.0.0.0:3000/en/'));
  expect(response.cookies.get('seo-workspace')?.secure).toBe(true); expect(response.cookies.get('seo-locale')?.secure).toBe(true);
});
it('keeps language redirects and cookies on the configured public origin', async () => {
  const response = await GET(new Request('http://0.0.0.0:3000/api/language?lang=en&returnTo=%2Fprojeler'));
  expect(response.headers.get('location')).toBe('https://seo.example.com/projeler'); expect(response.cookies.get('seo-locale')?.secure).toBe(true);
});
