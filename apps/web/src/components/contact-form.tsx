'use client';
import { useState } from 'react';
import { useTranslation } from './language';
export function ContactForm() {
  const t = useTranslation(), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [failed, setFailed] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget, values = Object.fromEntries(new FormData(form)); setBusy(true); setMessage(''); setFailed(false);
    try { const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }); if (!r.ok) throw new Error(); setMessage(t('legal.contactSaved')); form.reset(); }
    catch { setFailed(true); setMessage(t('saas.error')); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="card mt-6 space-y-4 p-6" aria-busy={busy}><label className="block text-sm font-bold" htmlFor="contact-email">{t('legal.email')}</label><input id="contact-email" name="email" type="email" required maxLength={254} autoComplete="email" className="w-full rounded-lg border p-3"/><label className="block text-sm font-bold" htmlFor="contact-subject">{t('legal.subject')}</label><input id="contact-subject" name="subject" required minLength={3} maxLength={150} className="w-full rounded-lg border p-3"/><label className="block text-sm font-bold" htmlFor="contact-message">{t('legal.message')}</label><textarea id="contact-message" name="message" required minLength={10} maxLength={4000} rows={6} className="w-full rounded-lg border p-3"/><p className="text-xs text-muted">{t('legal.contactPrivacy')}</p><button className="btn" disabled={busy}>{t(busy ? 'saas.loading' : 'legal.submit')}</button><p role={failed ? 'alert' : 'status'} className="text-sm">{message}</p></form>;
}
