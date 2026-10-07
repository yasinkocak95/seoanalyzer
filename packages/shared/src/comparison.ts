type Issue = { code: string; severity: string; title: string; affectedUrls: unknown };
type Snapshot = { normalizedHost: string; status: string; score: number | null; processedPages: number; analyzedHtmlPages: number; errorUrls: number; findings: Issue[] };
const rank: Record<string, number> = { INFO: 0, WARNING: 1, CRITICAL: 2 };
export function issueTotals(findings: Issue[]) {
  const groups = new Map<string, { code: string; title: string; severity: string; urls: Set<string> }>();
  for (const f of findings) {
    const g = groups.get(f.code) ?? { code: f.code, title: f.title, severity: f.severity, urls: new Set<string>() };
    if (rank[f.severity] > rank[g.severity]) g.severity = f.severity;
    for (const url of Array.isArray(f.affectedUrls) ? f.affectedUrls : []) if (typeof url === 'string') g.urls.add(url);
    groups.set(f.code, g);
  }
  return groups;
}
export function compareCrawls(before: Snapshot, after: Snapshot) {
  if (before.normalizedHost !== after.normalizedHost) throw new Error('comparison.domainMismatch');
  const old = issueTotals(before.findings), now = issueTotals(after.findings);
  const rows = [...new Set([...old.keys(), ...now.keys()])].map(code => {
    const a = old.get(code), b = now.get(code);
    const status = !a ? 'new' : !b ? (after.status === 'COMPLETED' ? 'resolved' : 'unverified') : rank[b.severity] > rank[a.severity] || b.urls.size > a.urls.size ? 'worsened' : 'ongoing';
    return { code, title: (b ?? a)!.title, status, before: a?.urls.size ?? 0, after: b?.urls.size ?? 0, added: [...(b?.urls ?? [])].filter(u => !a?.urls.has(u)), removed: [...(a?.urls ?? [])].filter(u => !b?.urls.has(u)) };
  });
  return { rows, score: before.score === null || after.score === null ? null : after.score - before.score, pages: after.processedPages - before.processedPages, html: after.analyzedHtmlPages - before.analyzedHtmlPages, errors: after.errorUrls - before.errorUrls, critical: [...now.values()].filter(f => f.severity === 'CRITICAL').length - [...old.values()].filter(f => f.severity === 'CRITICAL').length };
}
