import { groupFindings, countBySeverity, type RawFinding } from './findings';
import { localizeFinding, type Locale } from '@seo/shared/i18n';
export function publicUrl(value: string) {
  try { const u = new URL(value); u.username = ''; u.password = ''; u.search = ''; u.hash = ''; return u.toString(); } catch { return ''; }
}
export function publicReport(crawl: { normalizedHost: string; score: number | null; completedAt: Date | null; findings: RawFinding[] }, locale: Locale) {
  const findings = groupFindings(crawl.findings.map(f => localizeFinding(f, locale)));
  // No evidence, page text, credentials, query parameters, internal IDs or action links.
  return { host: crawl.normalizedHost, score: crawl.score, completedAt: crawl.completedAt?.toISOString() ?? null, counts: countBySeverity(findings), findings: findings.map(f => ({ code: f.code, severity: f.severity, title: f.title, description: f.description, recommendation: f.recommendation, affectedCount: f.urls.length, samples: f.urls.slice(0, 5).map(publicUrl) })) };
}
