# Production crawl incelemesi — 2026-10-08

Bu ilk incelemenin worker concurrency/bellek bulguları sonraki
[stall ve memory incelemesiyle](crawl-stall-review.md) güncellendi. Son kodda
BullMQ job concurrency 1 ve crawl thread izolasyonu var; aşağıdaki tek-koşu
benchmark tarihsel ilk karşılaştırmadır.

İnceleme kapsamı: repo production compose ayarları, kurulu Crawlee **3.18.2**
kaynakları, kullanıcı tarafından bildirilen log belirtileri ve yerel worker
fixture karşılaştırması. Production sunucuya bağlanılmadı, deploy yapılmadı.
Yerelde Docker daemon çalışmadığı için PostgreSQL/Redis/container entegrasyon
testleri bu çalışmada çalıştırılamadı.

## Doğrulanan nedenler ve kararlar

| Konu | Kanıt / karar |
| --- | --- |
| 768 MiB eşik | `docker-compose.override.yml` worker için `mem_limit: 1g`, `NODE_OPTIONS=--max-old-space-size=640`, `CRAWLEE_MEMORY_MBYTES=768` tanımlıyor. 727/768 = %94,7; container'ın 1 GiB sınırına göre %71. Bunlar farklı bütçeler. |
| AutoscaledPool | Kurulu `MemoryLoadSignal` varsayılanı %90'da overload, %95 üzerinde critical uyarı. 768 MiB bütçede yaklaşık 691/730 MiB. CPU/memory geri bildirimi korunuyor; bütçe veya concurrency artırılmadı. V8 old-space limiti tüm RSS'i sınırlamaz. |
| Batch 25 | Her DB batch'i ayrı queue/crawler açıp `run()` sonunda queue'yu siliyor. `maxRequestsPerCrawl=batch.length` queue zaten batch ile sınırlı olduğu için toplam tarama sınırı değil. Kurulum/teardown maliyeti var; ancak batch sınırı pause/duration/counts ve `sampler.review()` kontrol noktası. Ölçümde de 4 batch korunuyor; yeniden tasarım yapılmadı. |
| Retry | Eski kod `retryCount*2000` doğrusal bekleme kullanıyor; jitter ve Retry-After yok. 429 ilk denemesi yerel fixture'da 4 saniyelik server talebine rağmen 2094 ms sonra yeniden gönderildi. Exponential equal-jitter (1–2, 2–4, 4–8… saniye; 30 saniye tavan) eklendi. Server Retry-After seconds/date süresi bu tavanla kısaltılmıyor. |
| Site hız kontrolü | Eski `last` iki hook arasında atomik değil; bekleyen istekler aynı anda başlayabiliyor ve her batch'te sıfırlanıyor. Yeni kontrol task kabulünü aralıklı yapıyor, aynı hostname'e giden eşzamanlı BullMQ crawl işleri kontrolü paylaşıyor. 429 aralığı iki kat artırıyor (en çok 30 saniye veya zaten daha uzun olan configured delay); 10 başarılı HTTP yanıtta %10 azaltıp configured delay'e kadar dönüyor. Pool concurrency üst sınırı **2** kalıyor. |
| Kalıcı 4xx | Crawlee default session blocked codes `[401,403,429]` user handler'dan önce çalışıyor; 401/403 mevcut `noRetry` sınıflandırmasına ulaşmıyordu. `blockedStatusCodes: []` ile 4xx handler'a geliyor. 401/403/404 tek denemede ERROR; 408/429 retry bütçesini koruyor. Cookie/session pool kaldırılmadı. |
| Relative URL / 404 | `new URL(relative, documentUrl)` doğru standart çözümleme; ayrıca slash ekleyen veya relative URL uyduran kod bulunmadı. Ancak `<base href>` yok sayılıyordu. Fixture `/nested/page` + `<base href="/catalog/">` + `href="product"` için eski kod `/nested/product` 404 üretiyor; yeni kod `/catalog/product` 200 buluyor. Canonical, images, hreflang ve mixed-content de aynı document base kullanıyor. Gerçek bozuk linklerin 404 raporlanması korunuyor. Production 404'lerin bu nedenle oluştuğu henüz doğrulanmadı. |
| Gereksiz DB işi | Aynı sayfadaki 100 aynı link için 100 discovery upsert çalışıyordu. Normalize edilmiş aynı hedef artık sayfa başına bir kez yazılıyor; linked/fromSitemap kanıtları birleşiyor. Saklanan link listesi ve link metinleri korunuyor. Site genelindeki durable DB dedup/resume aynı kalıyor. |
| Büyük site belleği | `TemplateSampler.load()` tüm crawl URL kayıtlarını tek sorguda alıyordu; şimdi id cursor ile 500'er okunuyor. `known` ve pending template setleri hâlâ **O(URL sayısı)**; bu değişiklik onları bounded-memory yapmıyor. Sitemap URL seti de siteyle büyüyor; HTML parse/text/structure clone işlemleri geçici ek bellek kullanıyor. Crawl sayısıyla artan bir leak kanıtlanmadı; sampler/queue yaşam döngüsü bittiğinde referanslar bırakılıyor. |

[Crawlee configuration kaynağı](https://github.com/apify/crawlee/blob/master/packages/core/src/configuration.ts)
memoryMbytes bütçesinin AutoscaledPool için kullanıldığını açıklıyor. Yukarıdaki
sayısal eşikler ayrıca kurulu 3.18.2 `core/autoscaling/memory_load_signal.js`
üzerinden doğrulandı; production heap snapshot bulunmuyor.

## Worker benchmark ve log karşılaştırması

Real CheerioCrawler + RequestQueue + loopback HTTP; Prisma boundary in-memory,
her discovery write için `setTimeout(1)` ile yapay DB latency. Windows timer
çözünürlüğü nedeniyle gerçek bekleme 1 ms'den uzun olabilir. Redis/BullMQ,
analiz aşaması ve 1 GiB Linux container benchmark kapsamı dışındadır.
Sandbox `ps-tree` subprocess'ini reddettiğinden memory event'leri worker process
RSS'inden örneklendi; Crawlee scheduling/HTTP/storage gerçek olarak çalıştı.

56 sayfa, 25'lik dört batch, concurrency 2, delay 50 ms, sayfa başına 100 tekrar
link ve 300 içerik div'i, bir `Retry-After: 4` 429, bir gerçek missing URL ve bir
base href sayfası. Her ölçüm ayrı Vitest process'inde çalıştı. Bu kısa fixture,
production performans veya leak kabul testi olarak yorumlanmamalı.

| Ölçüm | Önce | Sonra (son kod) |
| --- | ---: | ---: |
| Toplam süre | 44,381 s | 15,739 s |
| Process CPU süresi | 9,563 s | 9,765 s |
| Tepe RSS | 306,4 MiB | 376,3 MiB |
| Tepe heapUsed | 160,6 MiB | 170,5 MiB |
| Son heapUsed | 160,4 MiB | 159,9 MiB |
| Discovery upsert | 5256 | 109 |
| Sayfa / batch | 56 / 4 | 56 / 4 |
| 429 sayısı | 1 | 1 |
| 429 retry aralığı | 2094 ms | 5065 ms |
| Crawl 404 (robots/sitemap hariç) | 2 | 1 |

Discovery yazmaları yaklaşık **%97,9**, fixture süresi **%64,5** azaldı.
CPU süresi azalmadı; daha kısa çalışmada ortalama CPU kullanımı daha yüksek.
**Tepe RSS arttı. Bellek optimizasyonunun production RSS'i düşürdüğü veya leak
çözüldüğü iddia edilmiyor.** İlk after koşusunda 345,3 MiB RSS / 6,907 s CPU
ölçülmüştü; kısa koşuların GC ve sistem yüküne duyarlılığı görülüyor. Son
koşunun değerleri tablo ve JSON'da esas alındı. Sampler pagination etkisi full
crawl fixture'ında ölçülmedi; ayrıca regression testiyle doğrulandı.

Log farkı: önce `Request blocked - received 429 status code` ardından yaklaşık
2 s retry; sonra `Crawl rate limited; delaying task admission` (`waitMs=4000`)
ardından yaklaşık 5 s retry. Her iki tarafta batch başına `Starting the crawler`
ve `maxRequestsPerCrawl` kapanış logları devam ediyor. Yeni 429 logunda crawlId,
batch, retryCount ve waitMs var; URL veya body yazılmıyor.

Özet ölçümler: [crawl-performance-benchmark.json](crawl-performance-benchmark.json).
Ham loglar ve request timestamp'leri yerel `.tmp-test/crawl-performance*` altında.

## Doğrulama ve tekrar çalıştırma

Worker + shared URL/security suite: **132 test geçti**, opt-in benchmark skip
edildi. Ardından eklenen concurrency, 4xx, long-cooldown pause/duration ve uzun
configured-delay testlerini içeren iki dosyada **19 test geçti**. Son benchmark
ayrıca geçti; 4 saniyeden erken retry olmaması, base URL düzeltmesi, tek 404
denemesi, discovery yazmalarının azalması ve 100 saklanan linkin korunması
assert edildi. Worker TypeScript, source lint ve `git diff --check` geçti.

PowerShell; baseline HEAD bu çalışmanın değişikliklerinden önceki crawl.ts olmalı:
Ölçülen baseline commit: `7e8b54070a03aaaa726cf58e40aa7798305e2e1a`.

```powershell
$baseline = git show HEAD:apps/worker/src/crawl.ts
New-Item -ItemType Directory -Force .tmp-test | Out-Null
($baseline -join "`n").Replace('"./', '"../apps/worker/src/').Replace('from "crawlee"', 'from "../apps/worker/node_modules/crawlee/index.mjs"') | Set-Content .tmp-test/crawl-baseline.ts -Encoding utf8
$env:CRAWL_BENCHMARK='before'
node node_modules/vitest/vitest.mjs run --config tests/vitest-local.config.mjs --configLoader native apps/worker/src/crawl-benchmark.test.ts
$env:CRAWL_BENCHMARK='after'
node node_modules/vitest/vitest.mjs run --config tests/vitest-local.config.mjs --configLoader native apps/worker/src/crawl-benchmark.test.ts
Remove-Item Env:CRAWL_BENCHMARK
```

## Kalan production doğrulaması

Bu değişiklik 727 MiB / 1 GiB bellek belirtisini çözmüş sayılmamalı. Aynı sitenin
full/sampled ve resume koşularında, aynı URL/response boyutu ve eşzamanlı job
sayısıyla worker RSS/heapUsed/CPU, 429 oranı ve crawl süreleri karşılaştırılmalı.
Batch sonlarında bellek sürekli büyürse heap snapshot/retained object profili
ile sampler setleri, sitemap seti, Crawlee/session storage ve DOM retention
ayrıştırılmalı. CPU/RSS iyileşmesi doğrulanmadan concurrency, batch veya bellek
bütçesi artırılmamalı.

Site pacing process içinde ortak; ayrı worker replica'ları arasında distributed
rate limit sağlamıyor. Cooldown process restart/resume sonrasında veya aynı
hostun son aktif crawl'i bittikten sonra kalıcı olarak saklanmıyor.
Robots/sitemap ve analiz image fetch'leri bu Crawlee
task gate'inin kapsamı dışında. Tek seferde zaten başlamış HTTP istekleri 429
sonrası iptal edilmiyor; cooldown yeni task kabulünü durduruyor. İstek başlatma
cadence'i task admission seviyesinde; DNS/socket gecikmeleri wire zamanı
aralığını değiştirebilir. Gate deadline/pause kontrolü cooldown sırasında en
çok yaklaşık 5 saniye arayla çalışıyor; ardından in-flight istekler bitiyor ve
başlamayan PROCESSING kayıtları DISCOVERED olarak korunuyor.
