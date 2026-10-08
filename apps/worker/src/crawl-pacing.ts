/** Retry-After is a minimum delay, in seconds or as an HTTP date. */
export function retryAfterMs(value: string | string[] | undefined, now = Date.now()) {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) {
    const ms = Number(raw) * 1000;
    return Number.isFinite(ms) ? ms : 0;
  }
  // Do not let Date.parse interpret negative/decimal seconds as calendar dates.
  if (!/[a-z]/i.test(raw)) return 0;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export function retryDelayMs(attempt: number, random = Math.random) {
  const ceiling = Math.min(30_000, 2000 * 2 ** Math.min(20, Math.max(0, attempt - 1)));
  return Math.round(ceiling / 2 + random() * ceiling / 2);
}

/** Gate task admission instead of sleeping inside navigation (and its timeout).
 * AutoscaledPool still controls CPU/memory concurrency; 429 controls site cadence.
 */
export class CrawlPacing {
  private nextStart = 0;
  private cooldown = 0;
  private interval: number;
  private successes = 0;
  constructor(private delay: number, private now = Date.now, private random = Math.random) {
    this.delay = Number.isFinite(delay) ? Math.max(0, delay) : 500;
    this.interval = this.delay;
  }
  ready() { return this.now() >= Math.max(this.nextStart, this.cooldown); }
  admit() {
    if (!this.ready()) return false;
    this.nextStart = this.now() + this.interval;
    return true;
  }
  retry(attempt: number) {
    this.cooldown = Math.max(this.cooldown, this.now() + retryDelayMs(attempt, this.random));
  }
  rateLimited(attempt: number, retryAfter?: string | string[]) {
    this.successes = 0;
    this.interval = Math.max(this.delay, Math.min(30_000, Math.max(this.interval * 2, 1000)));
    const wait = Math.max(retryDelayMs(attempt, this.random), retryAfterMs(retryAfter, this.now()));
    this.cooldown = Math.max(this.cooldown, this.now() + wait);
    return wait;
  }
  succeeded() {
    if (++this.successes >= 10) {
      this.interval = Math.max(this.delay, this.interval * 0.9);
      this.successes = 0;
    }
  }
}
