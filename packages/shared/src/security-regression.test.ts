import { describe, it, expect, vi, afterEach } from 'vitest';
import dns from 'node:dns/promises';
import { assertSafeUrl, isPublicIp, normalizeUrl, safeLookup } from './url-security.js';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()});
describe('SSRF regression',()=>{
  it.each(['127.0.0.1','10.0.0.1','172.16.0.1','192.168.0.1','169.254.169.254','100.64.0.1','0.0.0.0','255.255.255.255','224.0.0.1','::1','::','fc00::1','fe80::1','ff02::1','::ffff:127.0.0.1','::ffff:10.0.0.1','bad IP'])('rejects %s',ip=>expect(isPublicIp(ip)).toBe(false));
  it.each(['8.8.8.8','1.1.1.1','2606:4700:4700::1111','::ffff:8.8.8.8'])('accepts public %s',ip=>expect(isPublicIp(ip)).toBe(true));
  it.each(['http://localhost.','http://[::1]/','http://2130706433/','http://0x7f000001/','http://127.1/','http://user:pass@example.com/','ftp://example.com/','file:///etc/passwd'])('rejects unsafe URL %s',async url=>await expect(assertSafeUrl(url,false)).rejects.toThrow());
  it('rejects mixed public/private DNS answers and failed DNS',async()=>{
    vi.spyOn(dns,'lookup').mockResolvedValueOnce([{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}] as never);
    await expect(assertSafeUrl('https://mixed.test',false)).rejects.toThrow(/özel/);
    vi.spyOn(dns,'lookup').mockRejectedValueOnce(new Error('ENOTFOUND'));
    await expect(assertSafeUrl('https://missing.test',false)).rejects.toThrow(/DNS/);
  });
  it('revalidates DNS at socket resolution to prevent rebinding',async()=>{
    vi.stubEnv('ALLOW_LOCAL_TEST_URLS','false');
    vi.spyOn(dns,'lookup').mockResolvedValueOnce([{address:'8.8.8.8',family:4}] as never).mockResolvedValueOnce([{address:'127.0.0.1',family:4}] as never);
    await assertSafeUrl('https://rebind.test',false);
    await expect(new Promise((resolve,reject)=>safeLookup('rebind.test',{},(error,address)=>error?reject(error):resolve(address)))).rejects.toThrow(/özel/);
  });
  it('preserves slash distinctions while stripping fragments and default ports',()=>{
    expect(normalizeUrl('https://EXAMPLE.com:443/a/#x')).toBe('https://example.com/a/');
    expect(normalizeUrl('https://example.com/a')).not.toBe(normalizeUrl('https://example.com/a/'));
    expect(normalizeUrl(' example.com ')).toBe('https://example.com/');
    expect(normalizeUrl('example.com:8443/a')).toBe('https://example.com:8443/a');
  });
});
