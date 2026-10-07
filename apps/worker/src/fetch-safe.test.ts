import { gzipSync } from 'node:zlib';
import { createServer, type Server } from 'node:http';
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { safeFetch, limitedText } from './fetch-safe.js';
let server:Server,base:string;
beforeAll(async()=>{
  server=createServer((req,res)=>{
    const path=req.url;
    if(path==='/gzip'){res.writeHead(200,{'content-type':'text/html','content-encoding':'gzip'});return res.end(gzipSync('<title>Compressed HTML</title>'))}
    if(path==='/redirect'){res.writeHead(301,{location:'/chain'});return res.end()}
    if(path==='/chain'){res.writeHead(302,{location:'/html'});return res.end()}
    if(path==='/loop'){res.writeHead(302,{location:'/loop'});return res.end()}
    if(path==='/invalid'){res.writeHead(302,{location:'file:///etc/passwd'});return res.end()}
    if(path==='/timeout')return;
    if(path==='/slowbody'){res.writeHead(200,{'content-type':'text/html'});res.write('<h1>');return}
    if(path==='/oversized'){res.writeHead(200,{'content-length':'99999999'});res.write('x');return}
    if(path==='/chunked'){res.writeHead(200);return res.end('x'.repeat(100))}
    if(path==='/404'){res.writeHead(404,{'content-type':'text/html'});return res.end('missing')}
    if(path==='/500'){res.writeHead(500,{'content-type':'text/html'});return res.end('failed')}
    if(path==='/invalid-status'){res.writeHead(600);return res.end('invalid')}
    if(path==='/nonhtml'){res.writeHead(200,{'content-type':'application/octet-stream'});return res.end('binary')}
    res.writeHead(200,{'content-type':'text/html'});res.end('<title>Normal HTML</title><h1>Unclosed');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterAll(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))});
beforeEach(()=>vi.stubEnv('ALLOW_LOCAL_TEST_URLS','true'));
afterEach(()=>vi.unstubAllEnvs());
describe('safe HTTP fetch',()=>{
  it('reads normal and malformed HTML without throwing',async()=>{const r=await safeFetch(base+'/html');expect(r.response.status).toBe(200);expect(await limitedText(r.response)).toContain('Unclosed')});
  it('decodes compressed HTML without changing observed content',async()=>{const r=await safeFetch(base+'/gzip');expect(await limitedText(r.response)).toBe('<title>Compressed HTML</title>')});
  it('follows a redirect chain and records its original URLs',async()=>{const r=await safeFetch(base+'/redirect');expect(r.chain).toEqual([base+'/redirect',base+'/chain',base+'/html']);expect(await limitedText(r.response)).toContain('Normal HTML')});
  it('returns a manual redirect without requesting its destination', async () => { const r = await safeFetch(base + '/redirect', { redirect: 'manual' }); expect(r.response.status).toBe(301); expect(r.finalUrl).toBe(base + '/redirect'); expect(r.chain).toEqual([base + '/redirect']); await r.response.body?.cancel(); });
  it.each(['/loop','/invalid'])('rejects redirect edge case %s',async path=>await expect(safeFetch(base+path)).rejects.toThrow());
  it.each([404,500])('preserves HTTP %s',async status=>{const r=await safeFetch(base+'/'+status);expect(r.response.status).toBe(status);await r.response.body?.cancel()});
  it('preserves non-HTML type',async()=>{const r=await safeFetch(base+'/nonhtml');expect(r.response.headers.get('content-type')).toBe('application/octet-stream');expect(await limitedText(r.response)).toBe('binary')});
  it('rejects an invalid upstream status without an uncaught event callback exception', async () => { await expect(safeFetch(base + '/invalid-status')).rejects.toThrow(); });
  it('bounds both header and body timeouts',async()=>{vi.stubEnv('REQUEST_TIMEOUT_MS','80');await expect(safeFetch(base+'/timeout')).rejects.toThrow(/zaman/);const r=await safeFetch(base+'/slowbody');await expect(limitedText(r.response)).rejects.toThrow()});
  it.each(['/oversized','/chunked'])('bounds response bytes %s',async path=>{vi.stubEnv('MAX_RESPONSE_BYTES','20');const r=await safeFetch(base+path);await expect(limitedText(r.response)).rejects.toThrow(/boyutu/)})
});
