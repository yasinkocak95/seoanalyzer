import { tr } from './tr.js';
import { en } from './en.js';
export { tr, en };
export type Locale = 'tr' | 'en';
export const localeOf = (value: unknown): Locale => value === 'en' ? 'en' : 'tr';
export const numberLocale = (locale: Locale) => locale === 'en' ? 'en-GB' : 'tr-TR';
const byText = new Map<string, string>(Object.entries(tr).map(([key, value]) => [value, key]));
const patterns = Object.entries(tr).filter(([, value]) => /\{\d+\}/.test(value)).map(([key, value]) => {
  const ids: string[] = [];
  const source = value.split(/(\{\d+\})/).map(part => {
    if (/^\{\d+\}$/.test(part)) { ids.push(part); return '([\\s\\S]*?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { key, ids, pattern: new RegExp('^' + source + '$') };
});
/** Unknown stored text falls back to Turkish. Values such as URLs are never passed here. */
export function translator(locale: Locale) {
  const dictionary: Record<string, string> = locale === 'en' ? en : tr;
  return function t(keyOrText: string | null | undefined, values: unknown[] = []): string {
    if (keyOrText == null) return '';
    if (typeof keyOrText!=='string')return '—';
    const key = Object.hasOwn(tr, keyOrText) ? keyOrText : byText.get(keyOrText);
    if (key) {
      const template = dictionary[key] || (tr as Record<string, string>)[key];
      return template.replace(/\{(\d+)\}/g, (token, index) => values[Number(index)] === undefined ? '—' : ['string','number'].includes(typeof values[Number(index)]) ? String(values[Number(index)]) : '—');
    }
    if (locale === 'en') for (const { key, ids, pattern } of patterns) {
      const match = pattern.exec(keyOrText);
      if (match) return dictionary[key].replace(/\{\d+\}/g, token => {const value=match[ids.indexOf(token)+1]??'';return byText.has(value)||/\s/.test(value)?t(value):value;});
    }
    // Unknown symbolic translation keys cannot leak into the interface.
    return /^m\d+$|^[a-z][a-zA-Z0-9_]*(?:\.[a-z][a-zA-Z0-9_]*)+$/.test(keyOrText) ? '—' : keyOrText;
  };
}
export const turkish = translator('tr');
export function localizeFinding<T extends { title: string; description: string; recommendation: string }>(finding: T, locale: Locale): T {
  const t = translator(locale);
  return { ...finding, title: t(finding.title), description: t(finding.description), recommendation: t(finding.recommendation) };
}
const evidenceLabels: Record<string, string> = {
  durum: 'HTTP status', hata: 'Error', deger: 'Value', uzunluk: 'Length', kelimeSayisi: 'Word count',
  basliklar: 'Headings', h1Sayisi: 'H1 count', canonicalSayisi: 'Canonical count', hedefDurumu: 'Target HTTP status',
  hedef: 'Target', baglantiMetni: 'Link text', gorsel: 'Image', ornek: 'Sample', dil: 'Language',
  zincir: 'Redirect chain', httpKaynaklar: 'HTTP resources', eksikEtiketler: 'Missing tags', icerikOzeti: 'Content hash', not: 'Note',
};
export function localizeEvidence(value: unknown, locale: Locale): unknown {
  if (locale === 'tr' || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => localizeEvidence(v, locale));
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [evidenceLabels[key] ?? key, ['not','durum'].includes(key)&&typeof v==='string'?translator(locale)(v):localizeEvidence(v, locale)]));
}
