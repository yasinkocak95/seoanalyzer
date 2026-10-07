import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {inflateRawSync} from 'node:zlib';
const base=process.env.SMOKE_BASE_URL??'https://seo.yasinkocak.com.tr';
const artifacts='/tmp/seo-audit-artifacts';await fs.mkdir(artifacts,{recursive:true});
let cookie='';
async function request(path,options={}){
 const r=await fetch(base+path,{...options,redirect:'manual',headers:{cookie,...options.headers}});
 const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return r;
}
const result={};
for(const [path,locale] of [['/','tr'],['/en/','en']]){
 const r=await request(path),html=await r.text();assert.equal(r.status,200,path);assert.ok(html.includes(`lang="${locale}"`));assert.ok(html.includes(locale==='en'?'Start analysis':'Analizi Başlat'));
 assert.ok(html.includes(`href="${base}${locale==='en'?'/en/':'/'}"`),'canonical');assert.ok(html.includes('hrefLang="x-default"')||html.includes('hreflang="x-default"'));
 await fs.writeFile(`${artifacts}/${locale}-landing.html`,html);result[locale+'HTTP']=r.status;
}
const switched=await request('/api/language?lang=en&returnTo=%2Ftaramalar');assert.equal(switched.status,307);assert.equal(cookie,'seo-locale=en');const history=await request('/taramalar');assert.ok((await history.text()).includes('Previous crawls'));result.languageSwitch='PASS';
const create=await request('/api/crawls',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://example.com/',full:true,force:true})});
assert.equal(create.status,202);const {id}=await create.json();assert.equal(typeof id,'string');
let crawl;const deadline=Date.now()+120000;
while(Date.now()<deadline){const r=await request('/api/crawls/'+id);assert.equal(r.status,200);crawl=await r.json();if(['COMPLETED','FAILED','PARTIAL'].includes(crawl.status))break;await new Promise(r=>setTimeout(r,1500))}
assert.equal(crawl.status,'COMPLETED');assert.equal(crawl.pendingUrls,0);assert.equal(crawl.progress,100);assert.ok(crawl.analyzedHtmlPages>0);result.crawl={id,status:crawl.status,processed:crawl.processedPages,findings:crawl._count.findings};
function zipText(buffer){let offset=0,text='';while(offset+30<buffer.length&&buffer.readUInt32LE(offset)===0x04034b50){const method=buffer.readUInt16LE(offset+8),size=buffer.readUInt32LE(offset+18),nameSize=buffer.readUInt16LE(offset+26),extraSize=buffer.readUInt16LE(offset+28),start=offset+30+nameSize+extraSize;const name=buffer.subarray(offset+30,offset+30+nameSize).toString();const payload=buffer.subarray(start,start+size);if(name.endsWith('.xml'))text+=(method===8?inflateRawSync(payload):payload).toString();offset=start+size}return text}
result.exports={};
for(const locale of ['tr','en']){
 cookie=`seo-locale=${locale}`;
 const page=await request(`/rapor/${id}`),html=await page.text();assert.equal(page.status,200);assert.ok(html.includes(locale==='en'?'Site overview':'Site özeti'));
 assert.ok(html.includes('noindex'));assert.ok(!html.match(/>m\d+</));
 const links=[...html.matchAll(/href="(\/api\/crawls\/[^" ]+\/export\/(pdf|word|csv)\?[^" ]+)"/g)].map(m=>({path:m[1].replaceAll('&amp;','&'),format:m[2]}));assert.equal(links.length,3);
 for(const link of links){const response=await request(link.path);assert.equal(response.status,200,`${locale} ${link.format}`);const data=Buffer.from(await response.arrayBuffer());assert.ok(data.length>100);
  if(link.format==='pdf'){assert.equal(data.subarray(0,5).toString(),'%PDF-');assert.ok(data.toString('latin1').includes(locale==='en'?'SEO Audit Report':'SEO Analiz Raporu'));}
  if(link.format==='word'){const xml=zipText(data);assert.ok(xml.includes(locale==='en'?'Executive summary':'Yönetici özeti'));assert.ok(xml.includes('https://example.com/'));if(locale==='en')assert.ok(!/Yönetici özeti|Tarama tarihi|Düzeltme:/.test(xml));}
  if(link.format==='csv'){const csv=data.toString();assert.ok(csv.includes(locale==='en'?'Severity':'Önem'));assert.ok(csv.includes('";"'));assert.ok(csv.includes('https://example.com/'));}
  await fs.writeFile(`${artifacts}/${locale}-report.${link.format==='word'?'docx':link.format}`,data);result.exports[locale+'-'+link.format]=data.length;
 }
 await fs.writeFile(`${artifacts}/${locale}-report.html`,html);
}
const missing=await request('/missing-audit-page');assert.equal(missing.status,404);assert.ok((await missing.text()).includes('Page not found'));result.notFound='PASS';
await fs.writeFile(artifacts+'/smoke-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
