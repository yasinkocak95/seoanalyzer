# SEO Denetim

Ücretsiz ve kendi sunucunuzda çalışabilen, site çapında SEO analiz uygulaması. URL gönderme, BullMQ kuyruğu, Crawlee taraması, PostgreSQL kaydı, Türkçe rapor ve iki tarama arasında bulgu karşılaştırması uçtan uca çalışır.

Uygulama yalnızca SEO sinyallerini inceler; Lighthouse, PageSpeed, hız/Core Web Vitals, erişilebilirlik puanı, Google sıralaması veya gerçek dizin durumunu ölçmez.

## Hızlı başlangıç (Docker)

Gereksinimler: Docker Desktop ve Docker Compose.

```bash
docker compose up --build
```

Servisler sağlıklı olduğunda `http://localhost:3000` adresini açın. İlk imaj kurulumu bağımlılıklar nedeniyle birkaç dakika sürebilir. Durdurmak için `docker compose down` kullanın. Verileri de silmek isterseniz ayrıca `docker compose down -v` komutunu bilinçli olarak çalıştırın.

## Yerel geliştirme

Node.js 22, PostgreSQL ve Redis gerekir.

```bash
copy .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

Web arayüzü `http://localhost:3000` üzerinde, tarama işçisi aynı terminal grubunda çalışır. Ayrı çalıştırmak isterseniz:

```bash
npm run dev -w @seo/web
npm run dev -w @seo/worker
```

## Test ve derleme

```bash
npm test
npm run build
```

## Yapı

- `apps/web`: Next.js arayüzü ve tarama API’leri
- `apps/worker`: BullMQ işçisi; Crawlee, robots/sitemap keşfi ve güvenli indirme
- `packages/rules`: Tarayıcıdan bağımsız, test edilebilir SEO kuralları
- `packages/shared`: URL normalizasyonu, SSRF koruması ve ortak kuyruk türleri
- `packages/db`: Prisma şeması ve migration

## Tarama sınırları ve güvenlik

Varsayılan tarama aynı hostname, 12 bağlantı derinliği, 2 eşzamanlı istek ve site başına en az 500 ms istek aralığıyla çalışır. Bağlantı kopması, zaman aşımı, 5xx ve 429 gibi geçici hatalar artan beklemeyle 2 kez yeniden denenir; 404 gibi kalıcı hatalar yeniden denenmez. Sabit sayfa sınırı yoktur. URL durumları PostgreSQL'de kalıcı tutulur; tarama duraklatılabilir, sürdürülebilir ve süre korumasına ulaştığında açıkça kısmi olarak raporlanır. 5 MB yanıt ve 15 saniye istek sınırı vardır. `robots.txt` engelleri raporlanır. HTTP(S) dışındaki protokoller, kullanıcı bilgisi içeren URL’ler, özel/yerel/ayrılmış IP’ler ve bunlara çözümlenen alan adları reddedilir; yönlendirme hedefleri tekrar denetlenir.

### URL şablonu örneklemesi

Varsayılan taramada tekrar eden URL şablonları siteye göre otomatik tespit edilir; klasör adları kodlanmaz. Aynı üst yolu paylaşan ve yalnızca son parçası değişen en az `TEMPLATE_MIN_URLS` (8) adres bir şablon oluşturur (ör. `/urunler/{slug}`, `/cfi/{slug}`). Sayısal/hash parçaları `{id}` olur. Sorgu parametreli adresler, parametre adlarına göre ayrı şablondur (`/liste?kategori={değer}`). Kök seviyedeki sorgusuz sayfalar gruplanmaz. Her şablondan `TEMPLATE_SAMPLE_SIZE` (5) örnek analiz edilir, kalanlar “keşfedildi, analiz edilmedi” olarak kaydedilir ve istek atılmaz. Örneklerin içerik alanındaki CSS sınıfları ve JSON-LD türleri karşılaştırılır; en düşük benzerlik `TEMPLATE_SIMILARITY` (0,5) altındaysa grup farklı sayfa türleri içeriyor sayılır ve tamamı analiz edilir. Başlangıç formundaki “Tam tarama” seçeneği örneklemeyi kapatır.

Yerel fixture testi gerektiğinde yalnızca geliştirici `.env` içinde `ALLOW_LOCAL_TEST_URLS=true` yapabilir. Bu seçenek varsayılan olarak kapalıdır ve açık internete sunulan ortamda açılmamalıdır. JavaScript render geçişi `ENABLE_PLAYWRIGHT=true` ile açılır; yalnızca metni neredeyse boş kök sayfada tek sayfalık kontrollü geçiş yapar. Playwright tarayıcı ikilisi gerekiyorsa ayrıca `npx playwright install chromium` çalıştırın.

Aynı URL için 30 dakikalık tamamlanmış rapor önbelleği vardır.

## Ortam değişkenleri

Tüm seçenekler `.env.example` içinde belgelenmiştir. Üretimde PostgreSQL/Redis parolalarını değiştirin, servisleri internete doğrudan açmayın ve `ALLOW_LOCAL_TEST_URLS=false` bırakın.
