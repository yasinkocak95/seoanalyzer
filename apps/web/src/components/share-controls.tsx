'use client';
import { useState } from 'react';
import { useTranslation } from './language';
export function ShareControls({ crawlId }: { crawlId: string }) {
  const t = useTranslation(), [busy, setBusy] = useState(false), [link, setLink] = useState(''), [message, setMessage] = useState('');
  async function act(method: string) {
    setBusy(true); setMessage('');
    try { const response = await fetch(`/api/crawls/${crawlId}/share`, { method }); if (!response.ok) throw new Error(); const data = await response.json(); setLink(data.path ? location.origin + data.path : ''); setMessage(t(method === 'DELETE' ? 'saas.revoked' : 'saas.shareExpiry')); }
    catch { setMessage(t('saas.error')); } finally { setBusy(false); }
  }
  return <section className="card mb-6 p-5" aria-busy={busy}><h2 className="font-bold text-brand">{t('saas.share')}</h2><div className="mt-3 flex flex-wrap gap-2"><button className="btn" disabled={busy} onClick={() => act('POST')}>{t('saas.createLink')}</button><button className="btn" disabled={busy} onClick={() => act('DELETE')}>{t('saas.revoke')}</button></div>{link && <label className="mt-3 block text-sm">{t('saas.link')}<input className="mt-2 w-full rounded-lg border p-3" readOnly value={link} onFocus={e => e.target.select()} /></label>}<p className="mt-2 text-sm text-muted" role="status">{message}</p></section>;
}
