# SEO Analyzer

[English](README.md) | **Türkçe**

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
copy .env.example .env   # macOS/Linux: cp .env.example .env
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

## Claude AI önerileri

Sunucunun kök `.env` dosyasında `ANTHROPIC_API_KEY` değerini tanımlayın ve güncel uygulamayı başlatmadan önce `npm run db:migrate` çalıştırın. `ANTHROPIC_MODEL` varsayılanı `claude-sonnet-4-6` değeridir. Docker Compose anahtarı yalnızca web sunucusu ve worker'a aktarır; Claude isteklerini worker gönderir. Anahtarda `NEXT_PUBLIC_` öneki kullanmayın.

Anahtar isteğe bağlıdır. Tanımlı değilse veya boşsa AI kartında pasif **Yakında** butonu gösterilir. AI API'leri, AI veritabanına veya kuyruğa erişmeden başarılı bir pasif durum döndürür; worker mevcut AI işlerini Claude çağrısı yapmadan atlar. Crawl, rapor ve export akışları çalışmaya devam eder. Yerel sunucu ve worker her istek/iş sırasında kök `.env` dosyasını yeniden okur; anahtar eklendiğinde özellik otomatik etkinleşir. Açık pasif kart 15 saniyede bir yalnızca kullanılabilirliği kontrol eder, analiz üretmez. Docker'da ortam değişkenleri container'a başlangıçta aktarıldığından `.env` değişikliğini `docker compose up -d --force-recreate web worker` ile uygulayın (canlı dosya güncellemeleri için sunucu `.env` dosyasını `/app/.env` konumuna salt okunur bağlayabilirsiniz).

Claude yapılandırıldığında tamamlanan taramalar için TR/EN yönetici özetleri otomatik olarak kuyruğa alınır. Rapordaki **AI Insights → AI Önerileri Oluştur** butonuyla da analiz başlatabilirsiniz. Mevcut worker içinde ayrı BullMQ kuyruğu, bulgu özetini Claude'un [yapılandırılmış Messages API'sine](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) gönderir. Kritik / yüksek / orta öncelikli aksiyonlar döner; etkilenen sayfa sayıları ve örnek URL'ler tarama verisinden hesaplanır. Ham HTML, sayfa metni, kanıtlar ve URL kullanıcı bilgileri/sorgu değerleri gönderilmez. Sınırlar: 2.000 bulgu, 20.000 sayfa referansı ve 100.000 girdi karakteri. Anthropic API kullanımı ayrıca ücretlidir.

Sonuçlar tarama ve dil (TR/EN) bazında DB'de saklanır. Rapor açılışı ve durum sorguları yeni Claude çağrısı yapmaz. **AI Analizini Yeniden Oluştur**, yalnızca başarılı sonuçtan sonra önceki kaydı değiştirir; hatada önceki analiz korunur. Eşzamanlı tıklamalar aynı işi paylaşır. Geçici hatalarda bir tekrar yapılır. Eksik anahtar veya geçersiz yanıt güvenli hata mesajıyla sonuçlanır. Kurtarma döngüsü kesinti sonrası eksik kuyruk işlerini ve tükenen işleri uzlaştırır. Kısmi taramaların mevcut rapor/devam davranışı korunur; AI özelliği tamamlandığında kullanılabilir.

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

Aynı URL için 30 dakikalık tamamlanmış rapor önbelleği vardır. Rapordaki "Yeniden tara" düğmesi bu önbelleği atlar.

## Ortam değişkenleri

Tüm seçenekler `.env.example` içinde belgelenmiştir. Üretimde PostgreSQL/Redis parolalarını değiştirin, servisleri internete doğrudan açmayın ve `ALLOW_LOCAL_TEST_URLS=false` bırakın.

[SaaS özellikleri, doğrulama sonuçları ve deployment adımları](docs/saas-upgrade.md). Mevcut kayıtlar korunur; eski taramalar için güvenli çalışma alanı sahiplik eşleştirmesi gerekir.
