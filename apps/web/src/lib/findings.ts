import {translator,turkish,type Locale} from '@seo/shared/i18n';
export type Severity = "CRITICAL" | "WARNING" | "INFO";
export type RawFinding = {
  code: string;
  severity: Severity;
  title: string;
  description: string;
  recommendation: string;
  affectedUrls: unknown;
  evidence: unknown;
};
export type Evidence = Record<string, unknown>;
export type FindingGroup = {
  code: string;
  severity: Severity;
  title: string;
  description: string;
  recommendation: string;
  urls: string[];
  /** Tekrar bulgularında her değer ayrı bir alt gruptur; diğer kurallarda tek grup vardır. */
  groups: { label: string | null; urls: string[]; evidence: Evidence[] }[];
  /** Örneklenen şablonlarda görülen etkiler; bu URL'ler groups listesinden çıkarılır. */
  templateHits?: {
    pattern: string;
    urls: string[];
    sampleCount: number;
    discovered: number;
    skipped: number;
  }[];
};
export type CheckedRule = { code: string; title: string };

const order: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
// Bu kurallarda her kayıt "aynı değeri paylaşan sayfalar" grubudur ve ayrı gösterilmelidir.
const LABELED = new Set(["DUPLICATE_TITLE", "DUPLICATE_DESCRIPTION", "DUPLICATE_CONTENT"]);
const list = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);

/** Aynı kurala ait parçalı kayıtları tek bulguda birleştirir. */
export function groupFindings(findings: RawFinding[]): FindingGroup[] {
  const byCode = new Map<string, FindingGroup>();
  for (const f of findings) {
    const g =
      byCode.get(f.code) ??
      ({ ...f, urls: [], groups: [] } as unknown as FindingGroup);
    byCode.set(f.code, g);
    if (order[f.severity] < order[g.severity]) g.severity = f.severity;
    const urls = list<string>(f.affectedUrls),
      evidence = list<Evidence>(f.evidence);
    if (LABELED.has(f.code)) {
      // Çok sayfalı tekrar grupları 100'erli parçalara bölünerek kaydediliyor; değere göre birleşir.
      const raw = evidence[0]?.deger ?? evidence[0]?.icerikOzeti;
      const label = raw == null ? null : String(raw),
        existing = label ? g.groups.find((x) => x.label === label) : undefined;
      if (existing) {
        existing.urls.push(...urls);
        existing.evidence.push(...evidence);
      } else g.groups.push({ label, urls: [...urls], evidence: [...evidence] });
    } else {
      if (!g.groups.length) g.groups.push({ label: null, urls: [], evidence: [] });
      g.groups[0].urls.push(...urls);
      g.groups[0].evidence.push(...evidence);
    }
  }
  for (const g of byCode.values())
    g.urls = [...new Set(g.groups.flatMap((x) => x.urls))];
  return [...byCode.values()].sort(
    (a, b) => order[a.severity] - order[b.severity] || b.urls.length - a.urls.length,
  );
}

export function countBySeverity(groups: FindingGroup[]) {
  return {
    critical: groups.filter((f) => f.severity === "CRITICAL").length,
    warning: groups.filter((f) => f.severity === "WARNING").length,
    info: groups.filter((f) => f.severity === "INFO").length,
  };
}

/** Uygulanan ama bulgu üretmeyen kurallar. Eski taramalarda liste yoksa null döner. */
export function passedRules(checked: unknown, groups: FindingGroup[]) {
  if (!Array.isArray(checked)) return null;
  const found = new Set(groups.map((g) => g.code));
  return (checked as CheckedRule[]).filter((r) => !found.has(r.code));
}

export const severityLabel: Record<Severity, string> = {
  CRITICAL: turkish("m035"),
  WARNING: turkish("m036"),
  INFO: turkish("m037"),
};

export function scoreLabel(score: number,locale:Locale='tr') {
  const t=translator(locale);
  return score >= 90 ? t("m082") : score >= 75 ? t("m083") : score >= 50 ? t("m084") : t("m085");
}
