'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, CheckCheck, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { AiSnapshot } from '@seo/shared';
import { translator, numberLocale, type Locale } from '@seo/shared/i18n';

export function AiInsights({ crawlId, locale, initial }: { crawlId: string; locale: Locale; initial: AiSnapshot }) {
  const t = translator(locale);
  const [analysis, setAnalysis] = useState<AiSnapshot>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = analysis.enabled && ['QUEUED', 'RUNNING'].includes(analysis.status);
  const endpoint = `/api/crawls/${encodeURIComponent(crawlId)}/ai`;

  useEffect(() => {
    if (analysis.enabled && !pending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error();
        const next: AiSnapshot = await response.json();
        if (stopped) return;
        setAnalysis(previous => ({ ...next, result: next.result ?? previous.result, generatedAt: next.generatedAt ?? previous.generatedAt })); setError(null);
        if (next.enabled && !['QUEUED', 'RUNNING'].includes(next.status)) return;
      } catch { if (!stopped && analysis.enabled) setError(t('ai.refreshFailed')); }
      if (!stopped) timer = setTimeout(poll, analysis.enabled ? 2500 : 15000);
    };
    timer = setTimeout(poll, analysis.enabled ? 1000 : 15000);
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [pending, analysis.enabled, endpoint, locale]);

  async function generate() {
    if (!analysis.enabled || submitting || pending) return;
    setSubmitting(true); setError(null);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ regenerate: !!analysis.result }) });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || t('ai.queueUnavailable'));
      setAnalysis(previous => ({ ...next, result: next.result ?? previous.result, generatedAt: next.generatedAt ?? previous.generatedAt }));
    } catch (e) { setError(e instanceof Error ? e.message : t('ai.queueUnavailable')); }
    finally { setSubmitting(false); }
  }

  return <section className="ai-insights" aria-labelledby="ai-insights-title" aria-busy={pending || submitting}>
    <div className="ai-header">
      <div className="ai-heading"><span className="ai-icon"><Sparkles size={24} /></span><div><div className="ai-eyebrow">{t('ai.powered')}</div><h2 id="ai-insights-title">{t('ai.title')}</h2><p>{t('ai.subtitle')}</p></div></div>
      <button type="button" className="btn ai-button" onClick={generate} disabled={!analysis.enabled || pending || submitting} title={!analysis.enabled ? t('ai.unavailable') : undefined}>
        {pending || submitting ? <Loader2 size={17} className="animate-spin" /> : analysis.result ? <RefreshCw size={17} /> : <Sparkles size={17} />}
        {!analysis.enabled ? t('ai.comingSoon') : pending || submitting ? t('ai.pending') : t(analysis.result ? 'ai.regenerate' : 'ai.generate')}
      </button>
    </div>
    {analysis.enabled && (error || analysis.error) && <div className="ai-notice critical" role="alert">{error || t(analysis.error)} {analysis.result && t('ai.previous')}</div>}
    {!analysis.enabled && <p className="ai-notice info">{t('ai.unavailable')}</p>}
    {pending && <div className="ai-notice info" role="status"><Loader2 size={18} className="animate-spin" /><div><b>{t('ai.pending')}</b><p>{t('ai.pendingDescription')}</p></div></div>}
    {analysis.result ? <>
      <div className="ai-summary"><span className="ai-summary-icon"><CheckCheck size={19} /></span><div><p>{analysis.result.summary}</p>{analysis.generatedAt && <small>{t('ai.saved', [new Intl.DateTimeFormat(numberLocale(locale), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(analysis.generatedAt))])}</small>}</div></div>
      <div className="ai-actions">{analysis.result.actions.map((item, index) => <article className="ai-action-card" key={`${item.title}-${index}`}>
        <div className="ai-action-top"><span className={`badge ai-priority-${item.priority.toLowerCase()}`}>{t(`ai.${item.priority}`)}</span><span className="ai-page-count">{t('ai.pages', [item.affectedCount.toLocaleString(numberLocale(locale))])}</span></div>
        <h3>{item.title}</h3><p className="ai-description">{item.description}</p>
        <div className="ai-next-action"><span><ArrowUpRight size={16} />{t('ai.action')}</span><p>{item.action}</p></div>
        {!!item.affectedPages.length && <details className="ai-page-samples"><summary>{t('ai.samples')}</summary><ul>{item.affectedPages.map(url => <li key={url}>{url}</li>)}</ul></details>}
      </article>)}</div>
      {!analysis.result.actions.length && <p className="ai-notice success">{t('ai.noActions')}</p>}
    </> : !pending && <div className="ai-empty"><span className="ai-empty-icon"><Sparkles size={28} /></span><h3>{t('ai.empty')}</h3><p>{t('ai.emptyDescription')}</p><div className="ai-priority-preview">{(['Critical', 'High', 'Medium'] as const).map(p => <span key={p} className={`badge ai-priority-${p.toLowerCase()}`}>{t(`ai.${p}`)}</span>)}</div></div>}
  </section>;
}
