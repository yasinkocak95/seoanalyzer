import http from 'node:http';
const pages={
  '/':'<!doctype html><html><head><title>Ana Sayfa</title><meta name="description" content="Aynı açıklama"><link rel="canonical" href="http://127.0.0.1:4010/"></head><body><h1>Ana</h1><a href="/urun">Ürün</a><a href="/kirik">Kırık</a><img src="/x.png"></body></html>',
  '/urun':'<!doctype html><html><head><title>Ana Sayfa</title><meta name="description" content="Aynı açıklama"></head><body><h1>Ürün</h1><h3>Atlanan başlık</h3><script type="application/ld+json">{"@type":}</script></body></html>',
  '/robots.txt':'User-agent: *\nDisallow: /gizli\nSitemap: http://127.0.0.1:4010/sitemap.xml',
  '/sitemap.xml':'<?xml version="1.0"?><urlset><url><loc>http://127.0.0.1:4010/</loc></url><url><loc>http://127.0.0.1:4010/urun</loc></url><url><loc>http://127.0.0.1:4010/yetim</loc></url></urlset>',
  '/yetim':'<!doctype html><title>Yetim</title><h1>Yetim sayfa</h1>'
};
http.createServer((req,res)=>{const body=pages[req.url];if(!body){res.writeHead(404,{'content-type':'text/html'});return res.end('<h1>Bulunamadı</h1>')}res.writeHead(200,{'content-type':req.url?.endsWith('.xml')?'application/xml':req.url?.endsWith('.txt')?'text/plain':'text/html'});res.end(body)}).listen(4010,()=>console.log('Fixture http://127.0.0.1:4010'));
