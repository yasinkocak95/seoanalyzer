'use client';
import { useEffect, useState } from 'react';
import { numberLocale } from '@seo/shared/i18n';
import { useLocale, useTranslation } from './language';
type Result = { status: string; checkedAt?: string; targets?: string[] };
export function VerifyControl({ crawlId, code, urls }: { crawlId: string; code: string; urls: string[] }) {
  const locale = useLocale(), t = useTranslation(), [result, setResult] = useState<Result | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(false), [url, setUrl] = useState(urls.length > 100 ? urls[0] : '');
  const endpoint = `/api/crawls/${crawlId}/verify`;
  useEffect(() => {
    let active = true; const controller = new AbortController();
    async function refresh() { try { const r = await fetch(`${endpoint}?code=${encodeURIComponent(code)}`, { signal: controller.signal }); if (!r.ok) throw new Error(); if (active) { setResult(await r.json()); setError(false); } } catch { if (active) setError(true); } }
    void refresh(); const timer = ['QUEUED', 'RUNNING'].includes(result?.status ?? '') ? setInterval(refresh, 5000) : undefined; return () => { active = false; controller.abort(); if (timer) clearInterval(timer); };
  }, [endpoint, code, result?.status]);
  async function verify() { setBusy(true); setError(false); try { const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, ...(url ? { url } : {}) }) }); if (!r.ok) throw new Error(); setResult(await r.json()); } catch { setError(true); } finally { setBusy(false); } }
  return <div className="mt-4 rounded-xl border p-4"><label className="block text-sm">{t('saas.verifyScope')}<select className="mt-2 w-full rounded-lg border p-2" value={url} onChange={e => setUrl(e.target.value)}>{urls.length <= 100 && <option value="">{t('saas.allAffected')}</option>}{urls.map(u => <option value={u} key={u}>{u}</option>)}</select></label><button className="btn mt-3" disabled={busy || ['QUEUED', 'RUNNING'].includes(result?.status ?? '')} onClick={verify}>{t('saas.verify')}</button><p className="mt-2 text-sm" role="status">{error ? t('saas.error') : result ? t(`saas.${result.status}`) : ''}{result?.checkedAt && ` · ${new Date(result.checkedAt).toLocaleString(numberLocale(locale))}`}</p>{result?.targets && <p className="mt-1 break-all text-xs text-muted">{t('saas.checkedScope')}: {result.targets.length === 1 ? result.targets[0] : `${result.targets.length} ${t('m039')}`}</p>}</div>;
}
