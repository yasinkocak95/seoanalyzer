# Crawl stall / memory incelemesi — 2026-10-08

Production/server tarafında işlem yapılmadı. İnceleme repo, kurulu BullMQ
**5.81.5** / Crawlee **3.18.2**, gerçek LockManager testleri ve yerel HTTP
fixture'larıyla sınırlı. Redis/PostgreSQL/Docker servisi yerelde bulunmadığından
gerçek Redis expiry/Lua, container OOM ve production replay doğrulanamadı.

## 1. Stall root cause ve önceki optimizasyonun etkisi

`job stalled more than allowable limit`, job lock'u kaybolduktan sonra izin
verilen stall sayısının aşıldığını ifade ediyor; uzun job süresinin timeout'u
değil. Kurulu Worker default'ları ve korunan değerler:

| Ayar | Değer |
| --- | ---: |
| lockDuration | 30000 ms |
| lockRenewTime | 15000 ms |
| stalledInterval | 30000 ms |
| maxStalledCount | 1 |

Kurulu LockManager renewal kontrol timer'ını `lockRenewTime / 2` ile çalıştırıyor.
Async HTTP beklemesi veya Retry-After cooldown'u event loop'u bloklamaz. Uzun
handler, kilit yenilendiği sürece saatlerce çalışabilir; sadece daha uzun süre
CPU/GC/Redis/restart risklerine maruz kalır.

**Doğrulanan mimari açık:** crawl processor ve BullMQ bookkeeping aynı event
loop'taydı. HTML parsing, DOM clone, metin çıkarımı, JSON/XML parsing ve GC
yenileme timer'ının çalışmasını geciktirebilir. Gerçek BullMQ LockManager +
expiry simülasyonu testinde aynı loop'u 200 ms bloklayarak 100 ms lock kaybı
üretildi; aynı CPU işi ayrı thread'de 600 ms çalışırken lock yenilenmeye devam
etti. Test kısa TTL ile mekanizmayı gösterir, production'da 30 saniyelik blok
yaşandığını kanıtlamaz.

**Production olayının ilk tetikleyicisi kesinleşmedi:** verilen loglar CPU/GC
baskısıyla uyumlu, ancak Redis bağlantı kesilmesi, container OOM veya tekrarlanan
restart da aynı sonuca yol açabilir. Yerel küçük fixture'da yaklaşık 0,2–0,45 s
event-loop maksimumları ölçüldü; bunlar tek başına 30 s lock kaybını açıklamaz.
Bu yüzden production hatasını kesin olarak CPU'ya bağlamak doğru değildir.

Önceki URL deduplication DB işini/süreyi azalttı; paging resume sorgusunun geçici
belleğini azalttı. Retry-After gate async beklemeyi doğru yaptı. Ancak CPU işini
heartbeat loop'undan ayırmadı ve hızlandırılmış fixture'da tepe RSS'i artırdı;
**stall riskini çözdüğü veya kesin azalttığı söylenemez.**

**İkinci doğrulanmış açık:** recovery claim `RUNNING → RUNNING` olduğu için
birden fazla processor başarılı claim alabiliyordu. Ayrıca eski failed job'un
`finishedOn` zamanı yeni attempt başladıktan sonra olabilirdi; yalnızca zaman
karşılaştırması yeni RUNNING kaydını korumaya yetmiyordu.

Kaynaklar: [BullMQ stalled jobs](https://docs.bullmq.io/guide/workers/stalled-jobs),
[CPU izolasyonu açıklaması](https://docs.bullmq.io/guide/workers/sandboxed-processors).
Sayısal default'lar ayrıca kurulu `classes/worker.js` ve `lock-manager.js`
üzerinden kontrol edildi.

## 2. Yapılan düzeltme ve sahiplik

- Her crawl attempt'i yeni bir native `worker_threads` thread'inde çalışıyor.
  Ana loop BullMQ renewal, Redis, scheduling ve hafif durum yönetimini sürdürüyor.
  Thread bittiğinde tüm attempt'e ait Crawlee/sampler heap ve cache'leri bırakılıyor.
  Promise ancak thread exit sonrası tamamlanıyor; abort eski thread'i terminate
  edip exit'i bekliyor. Eski CPU işi retry ile aynı anda sürdürülemiyor.
- BullMQ crawl concurrency **2 → 1**. Repo production bütçesi 1 CPU / 1 GiB;
  ayrı V8 isolate eklenirken iki büyük crawl'ın birlikte çalışması engellendi.
  Crawlee page concurrency üst sınırı/env davranışı değişmedi (default 2).
- BullMQ job-ID lock'a ek olarak crawl-ID başına Redis lease var. Yeni dependency
  veya DB migration yok. Lease aynı **30 s** TTL ile 7,5 s arayla yenileniyor;
  owner token'ı kontrol eden Lua, başka sahibin lease'ini yenilemez/silmez.
  Çakışan farklı job ID gecikmeli kuyruğa alınır; retry hakkı tüketilmez, crawl
  durumu veya mevcut sampling state'i değiştirilmez.
- Lease renewal başarısızlığı/Redis close/lockRenewalFailed/stalled eski thread'i
  durduruyor. Redis komutu süresiz pending kalırsa watchdog son doğrulanmış TTL
  bitmeden abort ediyor; renewal başarısızlığında timeout yükseltilmiyor.
- DB claim status + önceki startedAt generation ile compare-and-set yapılıyor;
  aynı runtime'da aynı crawl için ikinci giriş de reddediliyor. startedAt önceki
  generation'dan en az 1 ms ilerliyor. Hazırlanan generation ve önceki generation
  parent'a bildirilip BullMQ job data'ya **executionStartedAt** ve
  **executionPreviousStartedAt** olarak yazılmadan DB claim/URL işlemesi başlamıyor.
  Böylece Redis metadata yazımı ile DB claim arasındaki crash penceresi de
  doğru generation'larla reconciliation kapsamına alınıyor.
- Processor failure, terminal failed event ve reconciliation yeni job'larda
  hazırlanan veya claim henüz commit olmamışsa önceki exact generation'a bağlı.
  Eski attempt yeni RUNNING/QUEUED attempt'i FAILED
  veya QUEUED yapamaz. Generation bilgisi olmayan legacy failed job'lar önceki
  zaman sınırı fallback'ini kullanır; bu legacy sınırlaması devam ediyor.
- Crash/restart sonrasında DB'nin PROCESSING URL'leri DISCOVERED'a dönüyor;
  PROCESSED/ERROR URL'ler, sampler load/review ve 25'lik batch sınırı korunuyor.
  Process crash'inde lease TTL ile düşüyor; BullMQ stalled/retry yeniden teslimi
  recovery bilgisini veriyor. İkinci gerçek stall'ın FAILED olması korunuyor.
- Metin çıkarımındaki clone/remove/after zinciri aynı DOM üzerinde iteratif okuma
  ile değiştirildi. Legacy çıktı, whitespace/block sınırları ve 100000 karakter
  truncation eşdeğerliği test edildi; bu değişikliğe RSS iyileşmesi atfedilmiyor.
- Lock failure/stalled loglarında son ölçüm penceresinin parent loop max/p99,
  process RSS ve parent heap değerleri var. Böylece sonraki olaylarda CPU loop
  gecikmesi ile başka tetikleyicileri ayırmak için kanıt toplanabilir.

BullMQ hâlâ **at-least-once** teslim sağlar; dağıtık sistemde exactly-once
garantisi iddia edilmiyor. Bir DB isteği abort anında zaten server'a gönderilmişse
commit olmuş olabilir; mevcut unique upsert anahtarları korunuyor. Lease ve
thread termination canlı iki processor'ın sıradan recovery/Redis kesintisi
akışında birlikte ilerlemesini engeller. Tüm process'in OS tarafından TTL'den
uzun süre dondurulması veya ağ bölünmesi için DB düzeyinde bütün page writes'a
fencing uygulanmış değildir; bunun ayrı container/Redis/DB kabul testi gerekir.

## 3. Memory sonucu

Eski tek koşunun 306 → 376 MiB artışını üç eşleştirilmiş, ayrı-process tekrar
ile kontrol ettim. Aynı 56 sayfa/4 batch/100 tekrar link/300 div fixture ve
yapay Prisma write latency; **50 ms delay**, concurrency 2. Major GC yalnızca
benchmark teşhisi için inspector ile tetiklendi; production'da forced GC yok.

| Direct Vitest fixture, 3 koşu | Önce | Önceki optimizasyon |
| --- | ---: | ---: |
| Tepe RSS aralığı | 299,7–309,5 MiB | 334,9–361,2 MiB |
| Tepe RSS medyanı | 303,8 MiB | 340,0 MiB |
| GC sonrası heap medyanı | 149,1 MiB | 151,3 MiB |
| GC sonrası RSS medyanı | 275,9 MiB | 277,3 MiB |
| Süre medyanı | 40,451 s | 14,164 s |

**Sonuç: hızlandırılmış fixture'da geçici tepe RSS regression'ı tekrar ediyor
(medyan yaklaşık +%12); yalnızca rastgele varyasyon değil.** Daha az DB beklemesi
ile DOM allocation'larının daha kısa sürede birikmesi açıklaması ölçümlerle
uyumlu bir çıkarım; allocation profiler ile tek tek retained object kökenleri
kanıtlanmış değil. GC sonrası yaklaşık +2,2 MiB heap farkı ve yakın RSS değerleri
bu kısa koşuda büyük bir kalıcı leak göstermez; uzun/büyük site leak'ini dışlamaz.

Son kodun aynı 50 ms direct fixture üç koşusunda tepe RSS medyanı 359,1 MiB;
GC sonrası heap yaklaşık 151,1 MiB. DOM kopyasını kaldırmak tek başına tepe RSS
iyileştirmedi. **Production cadence'i 500 ms** ile direct pair: tepe RSS
307,1 → 313,4 MiB (+%2,1), GC sonrası heap 149,3 → 149,8 MiB. Tek 500 ms pair'i
regression yok diye yorumlamak için yeterli değil, ancak 50 ms testinin production
cadence'ini temsil etmediğini gösteriyor.

Yeni thread runtime, standalone harness'te aynı 56 sayfa/4 batch ve **500 ms**
cadence ile aynı parent process içinde art arda üç crawl çalıştırdı:

| Yeni thread fixture | Sonuç |
| --- | ---: |
| Process tepe RSS | 259,3–271,8 MiB |
| Thread exit sonrası process RSS | 74,5–85,3 MiB |
| Parent heap | 35,5 / 35,8 / 35,7 MiB |
| Parent event-loop max | 34,2 / 40,0 / 37,1 ms |
| Parent event-loop p99 | yaklaşık 32,5 ms |
| Crawl süreleri | 38,644 / 38,563 / 38,788 s |

Bu harness Vitest değildir; direct fixture ile mutlak RSS kıyaslanıp “%X
production bellek kazancı” iddia edilmez. Gerçek Prisma/Redis/AI/verification ve
1 CPU cgroup yok. Veriler thread exit'te belleğin bırakıldığını, parent heap'in
bu üç attempt boyunca birikmediğini ve heartbeat loop'unun serbest kaldığını
destekliyor. Runtime kendi içinde page concurrency hâlâ 2; bu testte artırılmadı.

Ham özetler: [crawl-stall-memory-benchmark.json](crawl-stall-memory-benchmark.json).
Yerel raw loglar `.tmp-test/crawl-performance-*` ve `.tmp-test/crawl-thread-benchmark.log`.
Standalone test tekrar komutu: `node tests/crawl-thread-benchmark.mjs`.
Direct tekrar için önceki rapordaki baseline hazırlanıp `CRAWL_BENCHMARK=before`
ve `after/final`, `CRAWL_BENCHMARK_RUN=1/2/3` kullanılabilir. Snapshot olmayan
`after` artık current source'u çalıştırır; JSON'daki ölçümler bu çalışmada
değişiklik öncesi source ile alındı. Production cadence testi için
`CRAWL_BENCHMARK_DELAY=500` kullanılır.

## 4. Test sonuçları

- Son birleşik worker + shared URL/security + web resume/queue API koşusunda
  **177 test geçti**, opt-in benchmark skip edildi.
- Gerçek LockManager CPU-block reproduction, thread'de renewal, crash, abort ve
  exit sonrası yazmanın durması; generation persist edilmeden iş başlamaması.
- Lease overlap, 90 saniyelik async handler renewal, successor lease'i silmeme,
  renewal kaybı, blackholed Redis pending komutu, crash sonrası retry.
- RUNNING double recovery rejection, generation CAS, late failed reconciliation,
  stale owner status update engeli; pause/duration, HTTP retry ve sampling resume
  regressions; legacy text çıkarımı eşdeğerliği.
- 11 direct fixture koşusu ve 3 ardışık thread fixture crawl geçti.
- Shared build, worker build/typecheck, source lint ve `git diff --check` geçti.
- Gerçek Redis/PostgreSQL/container entegrasyonu çalıştırılmadı. LockManager
  testlerinde TTL Redis sınırı simüle edildi; Lua'nın gerçek Redis yürütümü için
  integration kabul testi hâlâ gereklidir.

## 5. Production için öneri — uygulanmadı

Mevcut **1 CPU / 1 GiB** için başlangıç: **1 crawl job**, **CRAWL_CONCURRENCY=1**,
REQUEST_DELAY_MS=500 veya hedef sitenin daha uzun ihtiyacı, batch=25.
Worker kodu job concurrency 1'e ayarlandı; page default'u 2 olarak bırakıldı,
server env değiştirilmedi. 429 ölçümü olmadan page/job concurrency artırılmamalı.

İlk rollout ölçümünde **CRAWLEE_MEMORY_MBYTES=768**, **NODE_OPTIONS old-space=640**
ve 1 GiB container bütçesi değişmeden karşılaştırılabilir; bunlar daha yüksek
yapılarak uyarılar gizlenmedi. **640 MiB old-space artık her V8 isolate için
geçerlidir; parent+thread toplamı 640 MiB ile sınırlanmaz.** RSS total process
olarak izlenmeli; önceki 727 MiB ölçümü büyük site ve parent/diğer worker'lar
eklendiğinde 1 GiB garantisi vermez.

Page/job concurrency 1 ile total RSS sürekli 768 MiB üstüne çıkarsa retention
ve response/DOM boyutu profili alınmalı. Büyük siteler için **2 GiB container**
değerlendirilebilir; bu kapasite önerisi ancak aynı crawl üzerinde ölçümle
doğrulanmalı. Container değişmeden Crawlee budget veya heap artırılmamalı.
İlk ölçümlerde 2 GiB seçilse bile concurrency'yi aynı tutup mevcut 768/640
bütçelerini korumak karşılaştırmayı anlaşılır kılar; sonra ayrı kapasite testi
yapılır. BullMQ lock/stall ayarları 30 s / 15 s / 30 s / 1 olarak kalmalı.

OOMKilled/restart timestamps, Redis reconnect logları ve yeni lock diagnostics
aynı zaman çizelgesinde karşılaştırılmadan production tetikleyicisi kesinleşmiş
sayılmamalı. Thread crash ve at-least-once recovery çalışması production'ın
artık hiç stall üretmeyeceği anlamına gelmez.
