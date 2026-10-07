export const VERIFY_QUEUE = 'seo-fix-verification';
export type VerifyJob = { verificationId: string; generation: string };
export const VERIFIABLE_CODES = new Set(['HTTP_ERROR', 'NOINDEX', 'TITLE_MISSING', 'TITLE_TOO_SHORT', 'TITLE_TOO_LONG', 'DESCRIPTION_MISSING', 'DESCRIPTION_TOO_SHORT', 'DESCRIPTION_TOO_LONG', 'H1_MISSING', 'MULTIPLE_H1', 'CANONICAL_MISSING', 'CANONICAL_MULTIPLE']);
export function verificationResult(results: string[]) {
  return results.includes('STILL_PRESENT') ? 'STILL_PRESENT' : !results.length || results.some(r => r !== 'FIXED') ? 'COULD_NOT_VERIFY' : 'FIXED';
}
