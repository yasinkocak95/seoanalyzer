import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AiInsights } from '../components/ai-insights';
import { parseAiResult, type AiSnapshot } from '@seo/shared';
const result = { summary: 'A focused plan', actions: [{ priority: 'High' as const, title: '<script>bad()</script>', description: 'Missing titles', action: 'Write a unique title', findingCodes: ['TITLE_MISSING'], affectedCount: 12, affectedPages: ['https://example.test/page'] }] };
describe('AI Insights rendering', () => {
  it.each(['tr', 'en'] as const)('renders generation state in %s', locale => { const html = renderToStaticMarkup(React.createElement(AiInsights, { crawlId: 'crawl', locale, initial: { enabled: true, locale, status: 'IDLE', result: null, error: null, generatedAt: null } })); expect(html).toContain(locale === 'en' ? 'Generate AI Recommendations' : 'AI Önerileri Oluştur'); expect(html).toContain('AI Insights'); });
  it.each(['tr', 'en'] as const)('renders a quiet disabled state in %s when Claude is not configured', locale => {
    const html = renderToStaticMarkup(React.createElement(AiInsights, { crawlId: 'crawl', locale, initial: { enabled: false, locale, status: 'FAILED', result, error: 'ai.notConfigured', generatedAt: null } }));
    expect(html).toContain(locale === 'en' ? 'Coming soon' : 'Yakında'); expect(html).toContain('disabled=""'); expect(html).not.toContain('role="alert"'); expect(html).toContain('A focused plan'); expect(html).toContain('aria-busy="false"');
  });
  it.each(['tr', 'en'] as const)('renders saved actions and regeneration in %s', locale => {
    const initial: AiSnapshot = { enabled: true, locale, status: 'COMPLETED', result, error: null, generatedAt: '2026-10-07T12:00:00Z' };
    const html = renderToStaticMarkup(React.createElement(AiInsights, { crawlId: 'crawl', locale, initial }));
    expect(html).toContain(locale === 'en' ? 'Regenerate AI Analysis' : 'AI Analizini Yeniden Oluştur');
    expect(html).toContain(locale === 'en' ? '12 affected pages' : '12 etkilenen sayfa'); expect(html).toContain('Write a unique title'); expect(html).toContain('https://example.test/page'); expect(html).not.toContain('<script>');
  });
  it('disables generation while pending and retains the previous plan', () => { const html = renderToStaticMarkup(React.createElement(AiInsights, { crawlId: 'crawl', locale: 'en', initial: { enabled: true, locale: 'en', status: 'RUNNING', result, generatedAt: null, error: null } })); expect(html).toContain('disabled=""'); expect(html).toContain('aria-busy="true"'); expect(html).toContain('A focused plan'); });
  it('orders Critical, High and Medium actions and rejects invalid priorities', () => {
    const a = result.actions[0]; expect(parseAiResult({ summary: 'Plan', actions: [{ ...a, priority: 'Medium' }, { ...a, priority: 'Critical' }, a] }).actions.map(a => a.priority)).toEqual(['Critical', 'High', 'Medium']);
    expect(() => parseAiResult({ summary: 'Plan', actions: [{ ...a, priority: 'Low' }] })).toThrow('ai.invalidResponse');
    expect(() => parseAiResult({ summary: 'Plan', actions: [{ ...a, affectedCount: -1 }] })).toThrow();
  });
});
