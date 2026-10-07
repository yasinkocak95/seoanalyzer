import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect, vi } from 'vitest';
import { LanguageProvider } from '../components/language';
import { ShareControls } from '../components/share-controls';
import { VerifyControl } from '../components/verify-control';
import { ScheduleControls } from '../components/schedule-controls';
import { HealthHistory } from '../components/health-history';
import { ContactForm } from '../components/contact-form';
import { LegalPage } from '../components/legal-page';
const state = vi.hoisted(() => ({ locale: 'en' as 'en' | 'tr' }));
vi.mock('./locale', () => ({ getLocale: async () => state.locale }));
it.each(['tr', 'en'] as const)('renders all product controls with localized labels and accessible forms in %s', async locale => {
  state.locale = locale;
  const children = React.createElement(React.Fragment, null, React.createElement(ShareControls, { crawlId: 'c' }), React.createElement(VerifyControl, { crawlId: 'c', code: 'TITLE_MISSING', urls: ['https://example.com/a'] }), React.createElement(ScheduleControls, { host: 'example.com' }), React.createElement(ContactForm), React.createElement(HealthHistory, { locale, history: [] }), await LegalPage({ kind: 'privacy' }));
  const html = renderToStaticMarkup(React.createElement(LanguageProvider, { locale, children }));
  expect(html).toContain(locale === 'en' ? 'Verify Fix' : 'Düzeltmeyi doğrula'); expect(html).toContain(locale === 'en' ? 'Privacy' : 'Gizlilik'); expect(html).toContain('role="status"'); expect(html).toContain('for="contact-email"'); expect(html).not.toMatch(/>saas\.|>legal\.|undefined|\[object Object\]/);
});
it('renders a chart and describes its accessible table fallback', () => { const history = [{ id: 'new', status: 'COMPLETED', score: 90, critical: 1, createdAt: new Date('2026-10-07') }, { id: 'old', status: 'COMPLETED', score: 70, critical: 4, createdAt: new Date('2026-10-01') }]; const html = renderToStaticMarkup(React.createElement(HealthHistory, { history, locale: 'en' })); expect(html.match(/role="img"/g)).toHaveLength(2); expect(html).toContain('history table below'); });
