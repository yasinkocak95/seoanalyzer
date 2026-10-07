import { turkish } from './i18n/index.js';
import dns from 'node:dns/promises';
import type { LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
const forbiddenHosts = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal']);
export function normalizeUrl(input: string) {
  const raw = input.trim();
  if (!raw || (/^[a-z][a-z\d+.-]*:(?!\d+(?:[/?#]|$))/i.test(raw) && !/^https?:\/\//i.test(raw)))
    throw new Error(turkish("m312"));
  let url:URL;
  try {url=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`)}
  catch {throw new Error(turkish('m110'))}
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(turkish("m312"));
  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  return url.toString();
}
export function isPublicIp(address: string) {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === 'ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress()) ip = (ip as ipaddr.IPv6).toIPv4Address();
    return ip.range() === 'unicast';
  } catch { return false; }
}
const hostnameOf = (url: URL) => url.hostname.replace(/^\[|\]$/g, '');
export async function resolveSafeHost(hostname: string, allowLocal = process.env.ALLOW_LOCAL_TEST_URLS === 'true') {
  const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!allowLocal && forbiddenHosts.has(host)) throw new Error(turkish("m313"));
  let records: { address: string; family: number }[];
  let timer:ReturnType<typeof setTimeout>|undefined;
  try { records = await Promise.race([dns.lookup(host,{all:true,verbatim:true}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(turkish('m314'))),Number(process.env.REQUEST_TIMEOUT_MS??15000))})]); }
  catch { throw new Error(turkish("m314")); }
  finally {clearTimeout(timer);}
  if (!records.length || (!allowLocal && records.some(x => !isPublicIp(x.address)))) throw new Error(turkish("m315"));
  return records;
}
/** Validate the resolution used by the socket, including DNS changes after URL validation. */
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  void resolveSafeHost(hostname).then(records => {
    const family = typeof options === 'number' ? options : options?.family;
    const eligible = family ? records.filter(r => r.family === family) : records;
    if (!eligible.length) throw new Error(turkish("m314"));
    if (typeof options === 'object' && options.all) callback(null, eligible as never);
    else callback(null, eligible[0].address, eligible[0].family);
  }).catch(error => callback(error, '', 0));
};
export async function assertSafeUrl(input: string, allowLocal = process.env.ALLOW_LOCAL_TEST_URLS === 'true') {
  const url = new URL(normalizeUrl(input));
  if (url.username || url.password) throw new Error(turkish("m316"));
  await resolveSafeHost(hostnameOf(url), allowLocal);
  return url;
}
export function isSameSite(candidate: string, root: string) {
  try { const a = new URL(candidate), b = new URL(root); return a.hostname === b.hostname && ['http:', 'https:'].includes(a.protocol); }
  catch { return false; }
}
