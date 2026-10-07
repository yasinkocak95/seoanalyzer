export type ScheduleFrequency = 'WEEKLY' | 'MONTHLY';
export function nextScheduledRun(now: Date, frequency: ScheduleFrequency) {
  const next = new Date(now);
  if (frequency === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7);
  else { const day = next.getUTCDate(); next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1); const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate(); next.setUTCDate(Math.min(day, lastDay)); }
  return next;
}
export function healthChange(before: { score: number | null; critical: number }, after: { score: number | null; critical: number }) {
  const scoreDelta = before.score === null || after.score === null ? null : after.score - before.score;
  const criticalDelta = after.critical - before.critical;
  return criticalDelta !== 0 || (scoreDelta !== null && scoreDelta !== 0) ? { before, after, scoreDelta, criticalDelta } : null;
}
