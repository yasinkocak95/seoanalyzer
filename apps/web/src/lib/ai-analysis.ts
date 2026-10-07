import { parseAiResult, localeOf, type AiSnapshot } from '@seo/shared';
import { getAiConfig } from '@seo/shared/ai-config';
import type { Locale } from '@seo/shared/i18n';

export function idleAiSnapshot(locale: Locale): AiSnapshot {
  return { enabled: !!getAiConfig().apiKey, locale, status: 'IDLE', result: null, error: null, generatedAt: null };
}

export function aiSnapshot(analysis: { locale: string; status: AiSnapshot['status']; result: unknown; error: string | null; generatedAt: Date | null }): AiSnapshot {
  let result = null;
  try { if (analysis.result) result = parseAiResult(analysis.result); } catch { /* A corrupt stored result must not break the report. */ }
  return { enabled: !!getAiConfig().apiKey, locale: localeOf(analysis.locale), status: analysis.status, result, error: analysis.error?.startsWith('ai.') ? analysis.error : analysis.error ? 'ai.providerUnavailable' : null, generatedAt: analysis.generatedAt?.toISOString() ?? null };
}
