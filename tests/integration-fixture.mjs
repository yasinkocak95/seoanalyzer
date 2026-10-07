import http from 'node:http';
let retry=0;
const origin='http://fixture:4010';
const html=(title,extra='')=>`<!doctype html><html lang="en"><head><title>${title}</title><meta name="description" content="${title} description"><link rel="canonical" href="${origin}/normal">${extra}</head><body><h1>${title}</h1>${'<p>Some useful page content.</p>'.repeat(60)}</body></html>`;
const paths=['/normal','/malformed','/redirect','/redirect2','/loop1','/missing','/failed','/retry','/binary','/canonical','/en','/tr','/noindex','/private','/timeout','/normal#fragment','/normal?utm_source=test','/slash/','/large','/stream','/xml','/distinct','/distinct/'];
http.createServer((req,res)=>{
 const url=new URL(req.url,origin),path=url.pathname;
 if(path==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});return res.end('User-agent: *\nUser-agent: OtherBot\nDisallow: /private\nSitemap: '+origin+'/sitemap.xml')}
 if(path==='/sitemap.xml'){res.writeHead(200,{'content-type':'application/xml'});return res.end('<urlset><url><loc>'+origin+'/</loc></url><url><loc>'+origin+'/normal</loc></url></urlset>')}
 if(path==='/redirect'){res.writeHead(301,{location:'/redirect2'});return res.end()}
 if(path==='/redirect2'){res.writeHead(302,{location:'/normal'});return res.end()}
 if(path==='/slash/'){res.writeHead(301,{location:'/slash'});return res.end()}
 if(path==='/loop1'){res.writeHead(302,{location:'/loop2'});return res.end()}
 if(path==='/loop2'){res.writeHead(302,{location:'/loop1'});return res.end()}
 if(path==='/missing'){res.writeHead(404,{'content-type':'text/html'});return res.end('Missing')}
 if(path==='/failed'){res.writeHead(500,{'content-type':'text/html'});return res.end('Failed')}
 if(path==='/retry'&&++retry===1){res.writeHead(503,{'content-type':'text/html'});return res.end('Temporary')}
 if(path==='/timeout')return;
 if(path==='/large'){res.writeHead(200,{'content-type':'text/html','content-length':'9999999'});return res.end('Large')}
 if(path==='/stream'){res.writeHead(200,{'content-type':'text/html'});return res.end('X'.repeat(100000))}
 if(path==='/binary'){res.writeHead(200,{'content-type':'application/x-custom-binary'});return res.end('binary fixture')}
 if(path==='/xml'){res.writeHead(200,{'content-type':'application/xml'});return res.end('<root>Not HTML</root>')}
 res.writeHead(200,{'content-type':'text/html'});
 if(path==='/')return res.end(html('Fixture home')+paths.map(p=>`<a href="${p}">${p}</a>`).join('')+'<a href="mailto:person@example.test">mail</a>');
 if(path==='/malformed')return res.end('<title>Malformed<head><meta name="robots" content="noindex"><body><h1>Unclosed');
 if(path==='/canonical')return res.end(html('Canonical test','<link rel="canonical" href="'+origin+'/normal">'));
 if(path==='/tr')return res.end(html('Türkçe','<link rel="alternate" hreflang="en" href="'+origin+'/en">'));
 if(path==='/en')return res.end(html('English','<link rel="alternate" hreflang="tr" href="'+origin+'/tr"><link rel="alternate" hreflang="fr" href="https://uncrawled.example.test/">'));
 if(path==='/noindex')return res.end(html('No index','<meta name="robots" content="noindex,nofollow">'));
 res.end(html(path==='/retry'?'Retried successfully':'Normal HTML '+path));
}).listen(4010,'0.0.0.0',()=>console.log('Integration fixture ready'));
