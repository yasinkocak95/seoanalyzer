import { turkish } from '@seo/shared/i18n';
import { safeFetch } from "./fetch-safe.js";

const maxChecks = Number(process.env.MAX_IMAGE_CHECKS ?? 300),
  concurrency = Number(process.env.CRAWL_CONCURRENCY ?? 2),
  delay = Number(process.env.REQUEST_DELAY_MS ?? 500);
export const imageChecksEnabled = maxChecks > 0;

async function status(src: string): Promise<number | string | null> {
  try {
    let { response } = await safeFetch(src, { method: "HEAD" });
    // Bazı sunucular HEAD desteklemez; gövdeyi okumadan GET ile yeniden dener.
    if ([403, 405, 501].includes(response.status)) {
      ({ response } = await safeFetch(src));
      await response.body?.cancel();
    }
    return response.status >= 400 ? response.status : null;
  } catch (error) {
    return error instanceof Error ? error.message : turkish("m221");
  }
}

/** Kırık görselleri adres → HTTP durumu veya hata mesajı olarak döndürür. */
export async function findBrokenImages(sources: Iterable<string>) {
  const queue = [...new Set(sources)]
      .filter((s) => /^https?:\/\//i.test(s))
      .slice(0, maxChecks),
    broken: Record<string, number | string> = {};
  const worker = async () => {
    for (let src = queue.shift(); src; src = queue.shift()) {
      const result = await status(src);
      if (result !== null) broken[src] = result;
      if (delay) await new Promise((r) => setTimeout(r, delay));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return broken;
}
