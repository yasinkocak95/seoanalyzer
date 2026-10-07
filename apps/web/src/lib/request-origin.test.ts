import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { sameOrigin } from './request-origin';
import { proxy } from '../proxy';
import { GET } from '../app/api/language/route';
beforeEach(() => vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://seo.example.com'));
afterEach(() => vi.unstubAllEnvs());
it('allows a legitimate HTTPS origin behind the standalone internal HTTP listener', () => {
  expect(sameOrigin(new Request('http://0.0.0.0:3000/api/crawls', { headers: { origin: 'https://seo.example.com' } }))).toBe(true);
});
it('does not trust forged forwarded origins or cross-site mutations', () => {
  expect(sameOrigin(new Request('http://0.0.0.0:3000/api/crawls', { headers: { origin: 'https://evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' } }))).toBe(false);
  expect(sameOrigin(new Request('http://0.0.0.0:3000/api/crawls', { headers: { origin: 'https://seo.example.com', 'sec-fetch-site': 'cross-site' } }))).toBe(false);
});
it('sets secure workspace and locale cookies behind HTTPS termination', () => {
  const response = proxy(new NextRequest('http://0.0.0.0:3000/en/'));
  expect(response.cookies.get('seo-workspace')?.secure).toBe(true); expect(response.cookies.get('seo-locale')?.secure).toBe(true);
});
it('keeps language redirects and cookies on the configured public origin', async () => {
  const response = await GET(new Request('http://0.0.0.0:3000/api/language?lang=en&returnTo=%2Fprojeler'));
  expect(response.headers.get('location')).toBe('https://seo.example.com/projeler'); expect(response.cookies.get('seo-locale')?.secure).toBe(true);
});
