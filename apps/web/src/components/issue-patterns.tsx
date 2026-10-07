'use client';
import { useState } from 'react';
import { useTranslation } from './language';
import { groupIssuePatterns } from '@seo/shared/issue-patterns';
export function IssuePatterns({ urls }: { urls: string[] }) {
  const t = useTranslation(), patterns = groupIssuePatterns(urls);
  return <section className="mt-5"><h3 className="mb-3 font-bold">{t('saas.patternGroups')}</h3><div className="space-y-3">{patterns.map(g => <Pattern key={g.pattern} {...g} />)}</div></section>;
}
function Pattern({ pattern, urls }: { pattern: string; urls: string[] }) {
  const t = useTranslation(), [limit, setLimit] = useState(100);
  return <div className="rounded-xl border p-4"><p className="break-all font-bold text-brand">{pattern} <span className="text-sm font-normal text-muted">· {urls.length} {t('m039')}</span></p><div className="mt-2 text-xs text-muted">{urls.slice(0, 3).map(u => <p className="break-all" key={u}>{u}</p>)}</div><details className="mt-3 text-sm"><summary className="cursor-pointer text-action">{t('saas.affectedDetails')}</summary><div className="mt-2 max-h-72 overflow-auto">{urls.slice(0, limit).map(u => <p className="break-all py-1 text-xs" key={u}>{u}</p>)}</div>{urls.length > limit && <button className="btn mt-3" onClick={() => setLimit(n => n + 100)}>{t('saas.showMore')}</button>}</details></div>;
}
