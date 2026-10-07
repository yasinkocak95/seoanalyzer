import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ locale: 'tr' as 'tr' | 'en' }));
vi.mock('./locale', () => ({ getLocale: async () => state.locale }));
vi.mock('next/navigation', () => ({ usePathname: () => state.locale === 'en' ? '/en/' : '/' }));
import Layout, { generateMetadata } from '../app/layout';

describe('shared product branding', () => {
  it.each(['tr', 'en'] as const)('uses the same accessible logo and preserves home routing in %s', async locale => {
    state.locale = locale;
    const html = renderToStaticMarkup(await Layout({ children: React.createElement('main') }));
    expect(html.match(/alt="SEO Analyzer"/g)).toHaveLength(2);
    expect(html.match(/class="brand-logo-frame"/g)).toHaveLength(2);
    expect(html).not.toContain('brand-mark');
    const links = html.match(/<a\b[^>]*class="site-brand"[^>]*>/g) ?? [];
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toMatch(locale === 'en' ? /href="\/en\/?"/ : /href="\/"/);
    expect(html).toContain('seo-analyzer-logo.png');
    const metadata = await generateMetadata();
    expect(metadata.icons).toEqual({ icon: [
      { url: '/branding/icon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/branding/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ], apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }] });
  });
  it('serves all six supplied files from the intended public/App Router paths', () => {
    const pairs = [
      ['../../seo-analyzer-logo.png', '../../public/branding/seo-analyzer-logo.png'],
      ['../../icon-16.png', '../../public/branding/icon-16.png'],
      ['../../icon-32.png', '../../public/branding/icon-32.png'],
      ['../../favicon.ico', '../app/favicon.ico'],
      ['../../icon-512.png', '../app/icon.png'],
      ['../../apple-touch-icon.png', '../app/apple-icon.png'],
    ];
    for (const [original, served] of pairs) expect(readFileSync(new URL(served, import.meta.url)).equals(readFileSync(new URL(original, import.meta.url))), served).toBe(true);
    const icon = readFileSync(new URL('../app/icon.png', import.meta.url));
    expect([icon.readUInt32BE(16), icon.readUInt32BE(20)]).toEqual([512, 512]);
    const apple = readFileSync(new URL('../app/apple-icon.png', import.meta.url));
    expect([apple.readUInt32BE(16), apple.readUInt32BE(20)]).toEqual([180, 180]);
  });
});
