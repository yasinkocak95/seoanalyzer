export function issuePattern(value: string) {
  try {
    const url = new URL(value), parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return url.pathname;
    return '/' + parts.slice(0, -1).map(p => /^(?:\d+|[a-f0-9]{16,}|[a-f0-9-]{36})$/i.test(p) ? '*' : p).join('/') + '/*';
  } catch { return '—'; }
}
export function groupIssuePatterns(urls: string[]) {
  const groups = new Map<string, Set<string>>();
  for (const url of urls) { const pattern = issuePattern(url), group = groups.get(pattern) ?? new Set<string>(); group.add(url); groups.set(pattern, group); }
  return [...groups].map(([pattern, urls]) => ({ pattern, urls: [...urls] })).sort((a, b) => b.urls.length - a.urls.length);
}
