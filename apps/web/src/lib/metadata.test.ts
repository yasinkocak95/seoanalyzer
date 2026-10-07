import { describe, expect, it, vi } from 'vitest';
import { translator } from '@seo/shared/i18n';

const state = vi.hoisted(() => ({ locale: 'tr' as 'tr' | 'en' }));
vi.mock('./locale', () => ({ getLocale: async () => state.locale }));
vi.mock('@seo/db', () => ({ db: {} }));

const pages = [
  ['report', () => import('../app/rapor/[id]/page'), true],
  ['crawl', () => import('../app/tarama/[id]/page'), true],
  ['crawls', () => import('../app/taramalar/page'), true],
  ['projects', () => import('../app/projeler/page'), true],
  ['project', () => import('../app/projeler/[host]/page'), true],
  ['compare', () => import('../app/karsilastir/[id]/page'), true],
  ['shared', () => import('../app/shared/page'), true],
  ['about', () => import('../app/about/page'), false],
  ['privacy', () => import('../app/privacy/page'), false],
  ['terms', () => import('../app/terms/page'), false],
  ['contact', () => import('../app/contact/page'), false],
] as const;

describe('localized page metadata', () => {
  it.each(['tr', 'en'] as const)('gives every page a concise branded title and preserves metadata in %s', async locale => {
    state.locale = locale;
    const t = translator(locale);
    for (const [key, load, privatePage] of pages) {
      const metadata = await (await load()).generateMetadata();
      expect(metadata).toEqual({
        title: t(`metadata.${key}`),
        ...(privatePage ? { robots: { index: false, follow: false } } : {}),
        ...(key === 'shared' ? { referrer: 'no-referrer' } : {}),
      });
      expect(metadata.title).toMatch(/^SEO Analyzer .+/);
      expect(metadata.title).not.toMatch(/[—\-|:]/);
      expect(metadata.title.match(/SEO Analyzer/g)).toHaveLength(1);
      expect(metadata.title).not.toContain('?');
    }
    for (const load of [() => import('../app/page'), () => import('../app/en/page')]) {
      const metadata = await (await load()).generateMetadata();
      expect(metadata.title).toBe(locale === 'tr'
        ? 'SEO Analyzer Teknik SEO Analizi ve AI Önerileri'
        : 'SEO Analyzer Technical SEO Audit and AI Insights');
      expect(metadata.description).toBe(t('m002'));
      const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://seo.yasinkocak.com.tr';
      expect(metadata.alternates).toEqual({
        canonical: new URL(locale === 'en' ? '/en/' : '/', base).toString(),
        languages: { tr: new URL('/', base).toString(), en: new URL('/en/', base).toString(), 'x-default': new URL('/', base).toString() },
      });
    }
  });
});
