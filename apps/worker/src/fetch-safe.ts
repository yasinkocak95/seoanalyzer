import { turkish } from '@seo/shared/i18n';
import { assertSafeUrl, safeLookup } from '@seo/shared';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import {createGunzip,createInflate,createBrotliDecompress} from 'node:zlib';

async function request(url: string, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers = Object.fromEntries(new Headers({ 'user-agent': 'SEO-Denetim/1.0', accept: 'text/html,application/xml,text/plain,*/*;q=.1' }));
    new Headers(init.headers).forEach((value, key) => { headers[key] = value; });
    const req = (url.startsWith('https:') ? https : http).request(url, { method: init.method ?? 'GET', headers, lookup: safeLookup }, res => {
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(res.headers)) if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
      const status = res.statusCode ?? 500;
      const noBody = init.method === 'HEAD' || [204, 205, 304].includes(status);
      if (noBody) res.resume();
      const encoding=res.headers['content-encoding'];
      const decoder=encoding==='gzip'?createGunzip():encoding==='deflate'?createInflate():encoding==='br'?createBrotliDecompress():null;
      const stream=decoder?res.pipe(decoder):res;
      if(decoder)res.on('error',error=>decoder.destroy(error));
      resolve(new Response(noBody ? null : Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status, headers: responseHeaders }));
      res.once('close', cleanup);
    });
    const timer = setTimeout(() => req.destroy(new Error(turkish("m215"))), Number(process.env.REQUEST_TIMEOUT_MS ?? 15000));
    const abort = () => req.destroy(new Error(turkish("m216")));
    function cleanup() { clearTimeout(timer); init.signal?.removeEventListener('abort', abort); }
    req.once('error', error => { cleanup(); reject(error); });
    init.signal?.addEventListener('abort', abort, { once: true });
    if (init.signal?.aborted) abort();
    req.end();
  });
}
export async function safeFetch(input: string, init: RequestInit = {}, redirects = 5) {
  let current = (await assertSafeUrl(input)).toString();
  const chain = [current];
  for (let i = 0; i <= redirects; i++) {
    await assertSafeUrl(current);
    const response = await request(current, init);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const loc = response.headers.get('location');
      if (!loc) return { response, finalUrl: current, chain };
      await response.body?.cancel();
      if (i === redirects) throw new Error(turkish("m217"));
      current = (await assertSafeUrl(new URL(loc, current).toString())).toString();
      if (chain.includes(current)) throw new Error(turkish("m218"));
      chain.push(current);
      continue;
    }
    return { response, finalUrl: current, chain };
  }
  throw new Error(turkish("m219"));
}
export async function limitedText(response: Response) {
  const max = Number(process.env.MAX_RESPONSE_BYTES ?? 5242880), declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > max) { await response.body?.cancel(); throw new Error(turkish("m220")); }
  if (!response.body) return '';
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) { await reader.cancel(); throw new Error(turkish("m220")); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
