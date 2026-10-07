import type { Locale } from './i18n/index.js';

export const AI_QUEUE = 'seo-ai-analysis';
export type AiJob = { analysisId: string; generation: string };
export type AiPriority = 'Critical' | 'High' | 'Medium';
export type AiAction = {
  priority: AiPriority;
  title: string;
  description: string;
  action: string;
  findingCodes: string[];
  affectedCount: number;
  affectedPages: string[];
};
export type AiResult = { summary: string; actions: AiAction[] };
export type AiSnapshot = {
  enabled: boolean;
  locale: Locale;
  status: 'IDLE' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  result: AiResult | null;
  error: string | null;
  generatedAt: string | null;
};

/** Treat provider responses and persisted JSON as untrusted data. */
export function parseAiResult(value: unknown): AiResult {
  const invalid = () => { throw new Error('ai.invalidResponse'); };
  const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : invalid();
  const text = (v: unknown, max: number): string => typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : invalid();
  const strings = (v: unknown, max: number, length: number): string[] => Array.isArray(v) && v.length <= max ? v.map(item => text(item, length)) : invalid();
  const input = record(value);
  if (!Array.isArray(input.actions) || input.actions.length > 15) invalid();
  const actions = (input.actions as unknown[]).map(item => {
    const a = record(item);
    if (!['Critical', 'High', 'Medium'].includes(String(a.priority))) invalid();
    if (!Number.isSafeInteger(a.affectedCount) || (a.affectedCount as number) < 0) invalid();
    return {
      priority: a.priority as AiPriority, title: text(a.title, 200), description: text(a.description, 1200), action: text(a.action, 2000),
      findingCodes: strings(a.findingCodes, 30, 100), affectedCount: a.affectedCount as number, affectedPages: strings(a.affectedPages, 5, 2000),
    };
  });
  const rank = { Critical: 0, High: 1, Medium: 2 };
  return { summary: text(input.summary, 2000), actions: actions.sort((a, b) => rank[a.priority] - rank[b.priority]) };
}
