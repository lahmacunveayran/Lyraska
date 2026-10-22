# Kabuk (Tauri uygulama kabuğu, güvenlik yapılandırması, Windows kurulumu) — bağımsız denetim raporu (Faz 0)

Denetlenen: `/home/user/Lyraska`, commit `94bc3d6` (sürüm 0.0.56). Bulgu öneki: `KAB-`.

## 1. Özet

- **Puan: 7/10.** Kabuk sağlam: en az izinli capabilities, uzak içerik yok, HTTP istemcisi yok, sürümde
  geliştirici araçları kapalı, ayar dosyası atomik yazılıyor. Ama iki "teşhis" sözü (çökme yığın izi ve açılış
  hatasının günlüğe yazılması) gerçekte tutmuyor, belgelerdeki veri klasörü adı yanlış.
- **Kritik ya da Yüksek bulgu yok.** Uzak içerik yüklemeyen, CSP'si `default-src 'self'` olan bir uygulamada
  sınırsız yol alan komutlar gerçek bir saldırı yüzeyi değil. Bunlar derinlemesine savunma notu olarak yazıldı (KAB-08).
- **Orta (KAB-01):** çökme günlüğündeki yığın izi sürüm derlemesinde yalnızca `<unknown>` satırlarından oluşuyor.
  Adres ve modül tabanı yazılmadığı için CI'nin 90 gün sakladığı `.pdb` dosyaları hiçbir işe yaramıyor (Linux'ta deneyle gösterildi).
- **Orta (KAB-02):** pencere ya da WebView2 açılamazsa program sessizce kapanıyor. Tauri 2.12 pencereyi `build()`'de
  değil `run()` içinde, kullanıcının `setup`'ından **önce** açıyor. Hata `panic!` olarak çıkıyor; o anda ne günlük açık ne
  çökme yakalayıcı kurulu. `lib.rs`'teki "günlüğe yazılır, düzgünce kapanır" dalı ölü kod.
- **Orta (KAB-03):** README ve MIMARI veri klasörünü `com.lyraska.app` olarak yazıyor, gerçek ad
  `io.github.gozlemesevdalisi.lyraska`. README ayrıca iki klasörün de "güvenle silinebileceğini" söylüyor; oysa Roaming
  klasörü elle yapılmış, yeniden üretilemeyen işaretleri (`isaretler/`) tutuyor.
- **Orta (KAB-04, KAB-05):** tek örnek koruması yok. İki pencere aynı `settings.json`'u "son yazan kazanır" biçiminde
  ezer, iki ses akışı aynı anda çalar. Kurulum dosyası ve exe imzasız.
- **Düşük:** `rust-version = "1.85"` yanlış (Tauri 1.90 istiyor); CSP'de `base-uri`/`form-action`/`object-src` açıkça
  yazılmamış ve gereksiz bir `'unsafe-inline'` var; "çevrimdışı" sözünü ve CSP'yi hiçbir kapı denetlemiyor; WebView2'nin
  tarayıcı sağ tık menüsü ve F5/Ctrl+P kısayolları açık; Roaming→Local taşıması farklı birimde hep başarısız.

## 2. Kapsam ve yöntem

**Okunan dosyalar:** `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/Cargo.toml`,
`src-tauri/build.rs`, `src-tauri/src/main.rs`, `lib.rs`, `data_dirs.rs`, `diagnostics.rs`, `commands.rs` (bütün komut
imzaları, dosya ve kabuk erişen gövdeler), `settings.rs` (açma/yazma), `library/db.rs` (bozuk veritabanı dalı),
`library/service.rs` ve `analysis/background.rs` (kapanış), `analysis/annotation.rs` (dosya adı üretimi),
`analysis/map_file.rs` (şema), `audio/decode.rs` (probe), `index.html`, `vite.config.ts`, `README.md`,
`docs/MIMARI.md` (veri bölümü ve kural tablosu), `src/lib/backend.ts`, `src/components/SettingsPanel.tsx`
(lisans iframe'i), `.github/workflows/{ci,test-surumu}.yml` (yalnızca `.pdb` ve imza adımları), `docs/DOGRULAMA.md` (A0).

**Bağımlılık kaynakları (`~/.cargo/registry`, salt okuma):** `tauri-2.12.1` (`app.rs` yaşam döngüsü,
`manager/mod.rs` CSP, `path/desktop.rs`, `permissions/*/reference.md`), `tauri-codegen-2.7.1`, `tauri-utils-2.10.1`
(`html.rs`), `wry-0.57.0` (WebView2 ayarları), `tauri-plugin-dialog-2.8.1`. NSIS şablonu, Tauri CLI 2.12.1 ikilisinin
(`node_modules/@tauri-apps/cli-linux-x64-gnu/cli.linux-x64-gnu.node`) içinden çıkarıldı: `installer.nsi.txt`.

**Çalıştırılan komutlar ve deneyler** (hepsi bu klasörde: `.../bagimsiz/kabuk/`):

1. `grep` ile `src/`, `src-tauri/src`, `index.html` ve `public/` altında `https?://` adresleri, `innerHTML`,
   `dangerouslySetInnerHTML`, `eval`, `fetch(`, `WebSocket`, `new Worker`, `convertFileSrc` arandı.
2. `cargo tree --offline --locked -e normal --target x86_64-pc-windows-msvc`: HTTP istemcisi (`reqwest`, `ureq`,
   `hyper`, `curl`, `rustls`, `native-tls`…) arandı; Tauri özellikleri listelendi.
3. `cargo metadata --format-version 1 --offline --locked` → `metadata.json`; bağımlılıkların `rust_version` alanları
   çıkarıldı.
4. **Yığın izi deneyi** (`bt/bt.rs`): `diagnostics.rs`'deki çökme yakalayıcının birebir benzeri;
   `panic=abort`, `debuginfo=line-tables-only`, `split-debuginfo=packed` ile derlendi ve sembolleri silindi
   (dağıtılan exe'nin `.pdb`'siz hali). `{}` ve `{:#}` çıktıları karşılaştırıldı.
5. **Bulanıklaştırma (fuzz) deneyi** (`fuzz/`): projedeki `symphonia 0.6.1` (`all`, `opt-simd`) ile `Decoder::open` +
   etiket okuma + 200 paket çözme, test verisindeki 6 dosyanın 24 000 bozulmuş kopyasında denendi. Amaç,
   `panic = "abort"` + açılıştaki tarama birleşiminin bir çökme döngüsü üretip üretmediğini görmekti.
6. Tam geçmiş için deponun herkese açık kopyası `full/` altına klonlandı (`--filter=blob:none`); `identifier`'ın ve
   `com.lyraska.app` dizgesinin geçmişi `git log -S` ile izlendi (yerel depo sığ: 67 commit).

**Sınırlar:** Windows makinesi yok. WebView2 hatası, iki örnek ve imzasız exe davranışı kod ve belgeyle
değerlendirildi, Windows'ta yeniden üretilmedi. Tauri uygulamasının tamamı derlenmedi (kural: depoda derleme yok;
kopyada 10+ dakika sürerdi ve Tauri kaynağını okumak aynı kesinliği veriyordu).

## 3. Bulgular

### KAB-01 — Çökme günlüğündeki yığın izi sürüm derlemesinde çözülemiyor; saklanan `.pdb` işe yaramıyor

- Önem: Orta · Güven: Kanıtlandı (Linux'ta); Windows için Yüksek · Standart: ISO/IEC 25010 bakım kolaylığı (analiz
  edilebilirlik)
- Yer: `src-tauri/src/diagnostics.rs:235-241`, `src-tauri/Cargo.toml:37-42`, `.github/workflows/test-surumu.yml:87-94`
- Kanıt:
  ```rust
  let backtrace = std::backtrace::Backtrace::force_capture();
  write("ÇÖKME", &format!("iş parçacığı \"{}\": {message} ({location})\n{backtrace}", ...));
  ```
  `Cargo.toml`: `debug = "line-tables-only"`, `split-debuginfo = "packed"` ("CI onu saklar"). CI ise
  `src-tauri/target/release/*.pdb` dosyasını 90 gün saklıyor. Deney (`bt/`): aynı ayarlarla derlenen ve sembolleri
  silinen ikilide `{}` biçimi şunu yazar:
  ```
  ÇÖKME panicked at bt.rs:3:69: index out of bounds: the len is 0 but the index is 1
  --- Display {} ---
     0: <unknown>
     1: <unknown>
     ...
    12: <unknown>
  --- Alternate {:#} ---
     0:     0x55940f085c3b - <unknown>
  ```
  Standart kütüphane, adresleri yalnızca "tam" biçimde (`{:#}`) yazıyor. Program `{}` kullandığı için günlükte adres
  yok. Adres olsa bile ASLR nedeniyle modülün yüklendiği taban adres de gerekir, o da yazılmıyor.
- Senaryo ve etki: Kullanıcı ya da sahibi çöken programın `lyraska.log` dosyasını hata kaydına ekler. Windows'ta exe'nin
  yanında `.pdb` yoktur (NSIS paketine girmez; exe'deki yol CI makinesini gösterir), bu yüzden bütün satırlar
  `<unknown>` çıkar. Paniğin mesajı ve `dosya:satır` yeri yine yazılır (bu kısım çalışıyor), ama kimin çağırdığı
  bilinmez. Bütün `.pdb` saklama hattı boşa çalışır.
- Öneri: `diagnostics.rs`'te `{backtrace}` yerine `{backtrace:#}` yazılsın. Açılış satırına bir başvuru adresi eklensin,
  ör. `format!("taban: {:#x}", lyraska_lib::run as usize)`; çözümleyici bunu `.pdb`'deki RVA'yla eşler. Alternatif:
  açılış satırına `GetModuleHandleW(NULL)` değeri yazılabilir. Ama bu `unsafe` ister; başvuru adresi yöntemi istemez.

### KAB-02 — Pencere ya da WebView2 açılamazsa program sessizce kapanıyor; günlüğe hiçbir şey yazılmıyor

- Önem: Orta · Güven: Kesin (Tauri 2.12.1 kaynağı) · Standart: ISO/IEC 25010 güvenilirlik (hata toleransı),
  analiz edilebilirlik
- Yer: `src-tauri/src/lib.rs:43-46`, `lib.rs:172-182`; `tauri-2.12.1/src/app.rs:1441-1446`, `app.rs:2688-2699`
- Kanıt: Tauri'de pencereler `build()`'de değil, olay döngüsünün `Ready` anında, kullanıcının setup'ından önce açılır,
  hata da paniğe çevrilir:
  ```rust
  // tauri-2.12.1/src/app.rs:2691
  for window_config in app.config().app.windows.iter().filter(|w| w.create) {
    WebviewWindowBuilder::from_config(app.handle(), window_config)?.build()?;   // önce pencere
  }
  ...
  if let Some(setup) = app.setup.take() { (setup)(app)... }                     // sonra Lyraska'nın setup'ı
  // app.rs:1442
  RuntimeRunEvent::Ready => { if let Err(e) = setup(&mut self) { panic!("Failed to setup app: {e}"); } ... }
  ```
  Lyraska günlüğü ve çökme yakalayıcıyı kendi setup'ında açıyor (`lib.rs:44-46`: `diagnostics::init(&dir.join("logs"))`).
  Pencere hatası anında ikisi de yok. `panic = "abort"` ve `windows_subsystem = "windows"` (konsol yok) ile süreç
  iz bırakmadan biter. `lib.rs:172-182`'deki dal ("Pencere ya da WebView2 açılamadı. Günlük açılmışsa nedeni oraya da
  yazılır … program panik yerine düzgünce kapanır") bu yüzden yanlış: `build()` pencere açmaz, bu dala düşüldüğünde de
  günlük hiçbir zaman açık olmaz (`diagnostics::error` sessizce hiçbir şey yapmaz, `eprintln!` görünmez).
- Senaryo ve etki: WebView2'si bozuk ya da kaldırılmış bir makine (Türkiye'de yaygın "debloat" betikleri Edge ile
  birlikte WebView2'yi de siler), WebView2'yi engelleyen bir kurum ilkesi, ya da yazılamayan bir
  `%LOCALAPPDATA%\…\EBWebView` klasörü. Kullanıcı simgeye tıklar, hiçbir şey olmaz; günlük dosyası yoktur, hata kaydına
  eklenecek bir şey de yoktur. Proje sahibi bu hatayı teşhis edemez.
- Öneri: (1) Pencereyi yapılandırmadan kaldırmak yerine en küçük değişiklik şu: `diagnostics::init`'i `Builder`'dan önce,
  `main`/`run` başında çağırmak. Klasör `std::env::var_os("LOCALAPPDATA")` + `identifier` ile hesaplanır; Tauri'nin
  kuralı da tam olarak budur (`path/desktop.rs:265-270`). Böylece çökme yakalayıcı Tauri'nin paniğini de yazar.
  (2) Panik yakalayıcı, açılış tamamlanmadan gelen bir panikte kullanıcıya yerel bir ileti kutusu göstersin
  (`rfd::MessageDialog`, bağımlılık ağacında zaten var). (3) `lib.rs:172-182` yorumu gerçeğe göre düzeltilsin.

### KAB-03 — README ve MIMARI'deki veri klasörü adı yanlış; README Roaming klasörünü "güvenle silinebilir" diyor

- Önem: Orta · Güven: Kesin · Standart: Windows uygulama veri klasörü kuralları (Roaming = kullanıcıya ait veri);
  ISO/IEC 25010 kullanılabilirlik
- Yer: `README.md:48-50`, `docs/MIMARI.md:214-215`, `src-tauri/src/library/mod.rs:11`, `docs/DOGRULAMA.md:31`
- Kanıt:
  ```
  README.md:48  Data lives in two folders: `%APPDATA%\com.lyraska.app` (settings, annotations) and
  README.md:49  `%LOCALAPPDATA%\com.lyraska.app` (library + analysis cache, logs). Both can be deleted safely;
  ```
  Gerçek ad `tauri.conf.json:5` `"identifier": "io.github.gozlemesevdalisi.lyraska"`; Tauri bunu kullanıyor
  (`tauri-2.12.1/src/path/desktop.rs:251-270`: `dirs::data_dir().join(identifier)`, `data_local_dir().join(identifier)`).
  Tam geçmişte (`full/`) `com.lyraska.app` hiçbir zaman `tauri.conf.json`'da yer almadı; yalnızca 0.0.51'de
  (`ce85e4f`) belgelere yanlış yazıldı. Ek olarak `library/mod.rs:11` kütüphaneyi hâlâ `%APPDATA%\…` altında
  gösteriyor (0.0.51'den beri `%LOCALAPPDATA%`). `DOGRULAMA.md:31` sahibine kütüphane yedeği için `%APPDATA%\…`
  klasörüne gitmesini söylüyor; taşınmış kurulumda `library.sqlite3` orada yok.
- Senaryo ve etki: Sahip ya da bir kullanıcı sorunu çözmek için README'deki klasöre gider; klasör yoktur. Yanlış klasörü
  bulduğunu sanıp "ikisi de güvenle silinebilir" cümlesine güvenerek doğru Roaming klasörünü silen biri,
  `isaretler/*.json` içindeki elle işaretlenmiş beat ve drop'ları (saatlerce emek, yeniden üretilemez) ve içe aktardığı
  haritaları kaybeder. Kütüphane yeniden kurulur; işaretler kurulmaz.
- Öneri: README'de ve MIMARI'de iki satır düzeltilsin: `%APPDATA%\io.github.gozlemesevdalisi.lyraska` ve
  `%LOCALAPPDATA%\io.github.gozlemesevdalisi.lyraska`. README'de "yalnızca Local klasör güvenle silinebilir; Roaming
  klasörü işaretlerinizi tutar" yazılsın. `library/mod.rs:11` yorumu ve `DOGRULAMA.md` A0 adımı `%LOCALAPPDATA%`
  olarak güncellensin. Bir birim testi `tauri.conf.json`'daki `identifier`'ın README'de geçtiğini denetleyebilir.

### KAB-04 — Tek örnek koruması yok: iki kopya aynı ayar dosyasını ezer, iki ses akışı çalar

- Önem: Orta · Güven: Kesin (kod), Yüksek (Windows davranışı) · Standart: ISO/IEC 25010 güvenilirlik (veri bütünlüğü)
- Yer: `src-tauri/src/lib.rs:30-32` (eklenti listesi), `src-tauri/src/settings.rs:91-101`, `settings.rs:154-167`
- Kanıt: `Cargo.toml`'da ve `package.json`'da `single-instance` yok. `SettingsStore` bütün ayarları süreç belleğinde
  tutuyor ve her değişiklikte **tüm** dosyayı yazıyor:
  ```rust
  pub fn update(&self, change: impl FnOnce(&mut Settings)) -> io::Result<Settings> {
      let mut current = self.current.lock()...;
      change(&mut current);
      if let Some(path) = &self.path { save(path, &current)?; }
  ```
  İki süreç aynı geçici dosyayı da kullanıyor (`path.with_extension("json.tmp")`).
- Senaryo ve etki: Açılış yavaş olduğu için kullanıcı simgeye iki kez tıklar. Pencere A'da ekolayzer ayarlanır, pencere
  B'de crossfeed açılır. B, belleğindeki eski ekolayzerle bütün dosyayı yeniden yazar ve A'nın ayarı sessizce kaybolur.
  Aynı anda iki şarkı iki kez çalar; özel (bit-perfect) modda ikinci aygıt açılışı başarısız olur. İki kütüphane
  taraması ve iki arka plan analizi aynı SQLite'ı kullanır (`busy_timeout` 5 sn olduğu için bozulma beklenmez, yalnızca
  iş iki kez yapılır). İki sürecin aynı anda `.json.tmp`'ye yazması Windows'ta paylaşım ihlaliyle "kaydedilemedi"
  hatası verebilir.
- Öneri: `tauri-plugin-single-instance` (MIT/Apache-2.0) eklensin. Geri çağrıda var olan pencere öne getirilir
  (`lib.rs`'te `.plugin(tauri_plugin_single_instance::init(|app, _, _| { /* ana pencereyi göster/odakla */ }))`, ilk
  eklenti olarak). Lisans bildirimi `npm run notices` ile yeniden üretilmeli.

### KAB-05 — Kurulum dosyası ve exe imzasız; kullanıcılara SmartScreen uyarısını geçmeleri öğretiliyor

- Önem: Orta · Güven: Kesin · Standart: OpenSSF Scorecard "Signed-Releases"; SLSA v1.0 Build L2 (imzalı köken)
- Yer: `src-tauri/tauri.conf.json:44-51` (`certificateThumbprint`/`signCommand` yok), `README.md:41-43`
- Kanıt: `bundle.windows` altında imza ayarı yok. README şöyle diyor: "Builds are not code-signed yet, so Windows
  SmartScreen will show an 'unknown publisher' warning: click More info → Run anyway". Test sürümü iş akışı yalnızca
  sürüm notuna SHA-256 yazıyor (`test-surumu.yml:119-126`); bu değer dosyayla aynı yerde, aynı güvenle yayımlanıyor.
- Senaryo ve etki: Sabit link herkese açık ve "kullanıcılara" dağıtılıyor. "Run anyway" demeye alışan kullanıcı, sahte
  bir "Lyraska-Kurulum.exe"yi (ör. bir forumda paylaşılan) aynı uyarıyla çalıştırır ve gerçeğinden ayıramaz.
  Kurulum `currentUser` olduğu için yerleşik exe `%LOCALAPPDATA%\Lyraska` altında kullanıcı yetkisiyle değiştirilebilir;
  imza olmadan bunu fark edecek bir şey yok. Bilinen ve açıkça yazılmış bir durum; test sürümü için kabul edilebilir ama
  dağıtım temeli için açık bir borç.
- Öneri: Ücretsiz açık kaynak imzası için SignPath Foundation'a ya da Azure Trusted Signing'e başvurulsun ve
  `bundle.windows.signCommand` ile bağlansın. Kısa vadede `actions/attest-build-provenance` ile GitHub köken
  belgesi eklensin, README'ye `gh attestation verify Lyraska-Kurulum.exe -R gozlemesevdalisi/Lyraska` adımı yazılsın.

### KAB-06 — `rust-version = "1.85"` yanlış: bağımlılıklar en az Rust 1.90 istiyor

- Önem: Düşük · Güven: Kesin · Standart: Semantic Versioning / Cargo MSRV sözleşmesi
- Yer: `src-tauri/Cargo.toml:9`
- Kanıt: `cargo metadata --format-version 1 --offline --locked` çıktısında en yüksek `rust_version` değerleri:
  ```
  1.90 tauri 2.12.1        1.90 tauri-plugin-dialog 2.8.1    1.90 tauri-build 2.7.1
  1.90 tauri-runtime-wry 2.12.1   1.90 tauri-utils 2.10.1   1.88.0 time 0.3.55
  1.87 rubato 5.0.1        1.85 symphonia 0.6.1, wasapi 0.25.0, wry 0.57.0
  ```
  Bunlar doğrudan bağımlılıklar (`tauri`, `tauri-plugin-dialog`), yani her platformda geçerli. CI 1.97.0 ile derliyor
  (`ci.yml:24`, `test-surumu.yml:60`), bu yüzden fark hiç görünmüyor.
- Senaryo ve etki: README'ye uyan bir katkıcı "Rust 1.85 yeter" diye 1.85–1.89 ile derlemeye çalışır; Cargo,
  "rustc 1.85 is not supported by the following packages: tauri@2.12.1 requires rustc 1.90" hatasıyla durur. Zararı
  yalnızca kafa karışıklığı.
- Öneri: `rust-version = "1.90"` yazılsın (ya da CI'daki `RUST_TOOLCHAIN` ile aynı tutulsun). İstenirse CI'ya
  `cargo +1.90 check --locked` işi eklenebilir.

### KAB-07 — CSP'de tanımsız yönergeler ve gereksiz `'unsafe-inline'`; CSP'yi ve "çevrimdışı" sözünü hiçbir kapı denetlemiyor

- Önem: Düşük · Güven: Kesin · Standart: Tauri 2 güvenlik modeli (CSP); OWASP ASVS v4 14.4.3 / v5 3.4.3 (CSP)
- Yer: `src-tauri/tauri.conf.json:25`; `docs/MIMARI.md` "Kurallar ve onları denetleyenler" bölümü
- Kanıt:
  ```
  "csp": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src ipc: http://ipc.localhost"
  ```
  - `base-uri`, `form-action` ve `frame-ancestors` `default-src`'ye geri düşmez, yani sınırsız. `object-src` açıkça
    `'none'` değil (`default-src 'self'`e düşüyor). OWASP, `object-src 'none'` ve `base-uri 'none'` önerir.
  - Tauri, `script-src`'ye dağıtımdaki JS dosyalarının SHA-256 özetlerini ekliyor (`tauri-codegen embedded_assets.rs:174-196`).
    `style-src`'ye nonce yalnızca HTML'de `<style>` öğesi varsa ekleniyor (`tauri-utils html.rs:155-157`); üretilen
    `dist/index.html`'de satır içi stil yok. Yani `'unsafe-inline'` hâlâ etkili. Kodda `cssText`,
    `setAttribute("style")` ya da `<style>` ekleme yok; React'in `style` özelliği CSSOM ile yazar ve CSP'ye takılmaz.
    `'unsafe-inline'` büyük olasılıkla gereksiz (kanıtlamak için gerçek WebView2'de deneme gerekir).
  - `grep -rln "tauri.conf\|Content-Security\|\bcsp\b" src src-tauri/src src-tauri/tests scripts .github package.json`
    → eşleşme yok. CSP'yi, capabilities'i ya da "uzak adres yok" kuralını okuyan bir test veya CI adımı yok. MIMARI ise
    "Her kural ya bir testle ya da CI'daki bir adımla denetlenir. Elle hatırlanması gereken kural yoktur" diyor; CLAUDE.md'nin
    "Program hiçbir zaman internete bağlanmak zorunda değildir" kuralı bu tabloda yok.
- Senaryo ve etki: Bugün sömürülebilir bir yol yok: uzak içerik yok, `innerHTML` yok, şarkı etiketleri ve sözler React
  metni olarak basılıyor. Risk gelecekte: bir oturum bir yazı tipini ya da kütüphaneyi CDN'den almak için CSP'ye
  `https:` eklerse ya da bir sahne için `'unsafe-eval'` açarsa hiçbir kapı kırmızı olmaz.
- Öneri: CSP şöyle olsun: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:;
connect-src ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
  (`'unsafe-inline'`'ı kaldırdıktan sonra sahne denetimi ve elle bir deneme). Bir Rust birim testi `tauri.conf.json`'u
  okuyup CSP'de `http:`/`https:`/`*`/`unsafe-eval` olmadığını ve capabilities'in tam olarak beklenen listede kaldığını
  denetlesin. `src/` altında `https?://` geçmediğini denetleyen bir satır `check:audio` benzeri bir betiğe eklensin.

### KAB-08 — Uygulama komutları diskte herhangi bir yolu okuyup yazabiliyor (derinlemesine savunma)

- Önem: Düşük · Güven: Kesin · Standart: Tauri 2 güvenlik modeli (komut erişimi, kapsamlar); OWASP ASVS 12.3 (dosya yolu)
- Yer: `src-tauri/src/commands.rs:534-538` (`parametric_export`), `commands.rs:575-589` (`song_map_export`),
  `commands.rs:430-438` (`headphone_import`), `commands.rs:521-528` (`parametric_import`), `commands.rs:163-193`
  (`open_track`, `track_cover`, `track_lyrics`)
- Kanıt:
  ```rust
  pub async fn parametric_export(path: String, player: State<'_, PlayerState>) -> Result<(), String> {
      let text = player.lock()?.parametric().to_apo();
      std::fs::write(&path, text)...
  ```
  `song_map_export` aynı biçimde `target: PathBuf`'a JSON yazıyor. `build.rs` uygulama komutları için bir
  `AppManifest` tanımlamadığından Tauri 2 bütün uygulama komutlarını ana pencereye açar. Dialog eklentisinin seçilen
  yolu kapsama ekleme mekanizması da (`tauri-plugin-dialog/src/commands.rs:163-253`) bu komutları sınırlamaz.
- Senaryo ve etki: Arayüzde kod çalıştırabilen biri (bugün bir yol yok; bkz. KAB-07) herhangi bir dosyanın üstüne APO
  metni ya da JSON yazabilir: Başlangıç klasörüne bir `.bat`/`.cmd` yazmak gibi. Ayrıca UNC yoluyla (`\\host\share\x.mp3`)
  NTLM kimlik doğrulaması tetikleyebilir. Uzak içerik yüklemeyen bir uygulamada bu yalnızca ikinci savunma hattı;
  önem bu yüzden Düşük.
- Öneri: Dışa aktarma komutlarında hedefin uzantısı denetlensin (`parametric_export` yalnızca `.txt`,
  `song_map_export` yalnızca `.json`). Yerel olmayan (UNC, `\\?\`) yollar `open_track` ve tarama girişinde reddedilsin
  ya da kullanıcı onayına bağlansın. İleride `build.rs`'te `tauri_build::Attributes::new().app_manifest(AppManifest::new().commands(&[...]))`
  ile komutlar capabilities'e alınabilir.

### KAB-09 — WebView2'nin tarayıcı sağ tık menüsü ve kısayolları açık (F5, Ctrl+R, Ctrl+P, Alt+←)

- Önem: Düşük · Güven: Kesin (wry varsayılanları) · Standart: ISO/IEC 25010 kullanılabilirlik
- Yer: `src-tauri/tauri.conf.json:13-23` (pencere), `wry-0.57.0/src/lib.rs:1768-1769`
- Kanıt: `browser_accelerator_keys: true, default_context_menus: true // WebView2's default`. Arayüzde
  `contextmenu` dinleyicisi yok (`grep -rn "contextmenu" src` → boş).
- Senaryo ve etki: Kullanıcı sahnede sağ tıklayınca "Geri / Yenile / Farklı kaydet / Yazdır" menüsü çıkar. F5'e
  basınca arayüz baştan yüklenir, Rust tarafında çalma sürer; arayüz durumu (çekmece, işaretleme oturumu, kör test
  ekranı) kaybolur. Ctrl+P yazdırma penceresi açar. Bir müzik çalarda tarayıcı izlenimi verir.
- Öneri: `src/main.tsx`'te `contextmenu` için `preventDefault` (metin alanları hariç). Pencere oluşturmayı Rust'a
  almadan en küçük yol: `keydown`'da `F5`, `Ctrl+R`, `Ctrl+P`, `Ctrl+Shift+R` engellensin.

### KAB-10 — Roaming→Local taşıması, Roaming başka birime yönlendirilmişse hiç gerçekleşmiyor

- Önem: Düşük · Güven: Yüksek (Rust belgesi: `fs::rename` birimler arası çalışmaz) · Standart: Windows uygulama veri
  klasörü kuralları (klasör yönlendirmesi)
- Yer: `src-tauri/src/data_dirs.rs:31-42`
- Kanıt: Taşıma yalnızca `std::fs::rename` ile yapılıyor; başarısızsa `roaming` dönüyor. Rust belgesine göre
  `rename` "will not work if the new name is on a different mount point". Windows'ta da `MoveFileExW`
  `MOVEFILE_COPY_ALLOWED` olmadan çağrılıyor.
- Senaryo ve etki: Bu taşıma, gezici profilli kurumsal kullanıcılar için yazılmış (modül yorumu). Ama tam bu kullanıcılarda
  Roaming çoğu zaman bir ağ paylaşımına yönlendirilmiştir. `rename` her açılışta başarısız olur ve kütüphane kalıcı olarak
  ağ paylaşımında kalır: amaçlanan iyileşme hiç gelmez. Veri kaybı yok; geri dönüş doğru yazılmış ve testli.
- Öneri: `rename` başarısız olursa kopyala + `sync_all` + doğrula + eskisini sil yolu denensin (yalnızca kütüphane
  kapalıyken, açılışta zaten öyle). Sonuç `diagnostics::info` ile yazılsın. Bunun için taşıma, `diagnostics::init`'ten
  sonra yapılmalı; şu an önce yapılıyor ve hiçbir sonucu günlüğe yazılmıyor.

### KAB-11 — Kurulum, WebView2 yoksa internet istiyor (belgelenmiş)

- Önem: Bilgi · Güven: Kesin · Standart: —
- Yer: `src-tauri/tauri.conf.json:45`; NSIS şablonu `installer.nsi.txt:578-584`
- Kanıt: `"webviewInstallMode": { "type": "embedBootstrapper" }`. Şablon gömülü önyükleyiciyi
  `$TEMP\MicrosoftEdgeWebview2Setup.exe` olarak çalıştırıyor; önyükleyici, çalışma ortamını Microsoft'tan indirir.
  README:45-46 bunu doğru anlatıyor ("If it is missing, the installer downloads it once").
- Senaryo ve etki: WebView2'siz ve internetsiz bir makinede kurulum biter ama program açılmaz; KAB-02 yüzünden de
  sessizce kapanır. "Program internete bağlanmak zorunda değildir" sözü programın kendisi için doğru, kurulum için
  koşullu.
- Öneri: Bilgi. İstenirse çevrimdışı kurulum için ikinci bir `offlineInstaller` paketi (≈ +130 MB) üretilebilir.

## 4. Olası riskler (kanıtı yetmeyenler)

- **Bağımlılık paniği + `panic = "abort"` + açılıştaki tarama = çökme döngüsü.** Tarama her açılışta başlıyor
  (`lib.rs:53`). Her dosyayı `Decoder::open` ile açıyor (`library/scan.rs:209`), `catch_unwind` yok ve sürüm
  derlemesi zaten unwind etmiyor. Bir bağımlılık kötü biçimli bir dosyada paniklerse program her açılışta aynı dosyada
  kapanır. **Çürütme denemesi:** `symphonia 0.6.1` ile test verisinin 24 000 bozulmuş kopyası denendi
  (`fuzz/`); **hiç panik çıkmadı**. Bu yüzden bulgu değil. Yine de taramanın "şu dosyayı açıyorum" kaydını önce
  yazması (ve bir sonraki açılışta o dosyayı atlaması) ucuz bir sigorta olur.
- **WebView2 çalışma ortamının kendi ağ trafiği.** Tauri SmartScreen'i kapatıyor
  (`wry webview2/mod.rs:303`: `--disable-features=…msSmartScreenProtection`). Ama Edge WebView2'nin güncelleme
  hizmeti ve Windows tanılama ayarına bağlı telemetrisi uygulamanın denetiminde değil. Lyraska telemetri göndermiyor;
  "hiç ağ trafiği yok" demek için Windows'ta bir ağ izlemesi gerekir.
- **Çökme yakalayıcı içinde kilit.** `diagnostics::write` `LOG` kilidini tutarken paniklerse yakalayıcı aynı kilidi
  ister (kendini kilitleme). Bugünkü `write_line`'da panikleyen bir çağrı yok; uzak.
- **Panik dışı çökmeler** (yığın taşması, erişim ihlali, WebView2 süreci çöküşü) günlüğe yazılmaz; Windows Hata
  Bildirimi'nin yerel döküm ayarı (`LocalDumps`) belgelenebilir.
- **Explorer'ın arama sırası.** `Command::new("explorer")` (`commands.rs:741`, `759`) önce exe'nin klasörüne bakar.
  `currentUser` kurulumunda bu klasör kullanıcı yazılabilir; ama oraya yazabilen saldırgan zaten kullanıcının
  kendisidir. Gerçek bir sınır aşımı yok.

## 5. Temiz bulunanlar

- **Capabilities en az izinli:** `capabilities/default.json` yalnızca `core:default`, `dialog:allow-open`,
  `dialog:allow-save` veriyor; `windows: ["main"]` varsayılan pencere etiketiyle eşleşiyor. `core:window:default`
  yalnızca okuyucular (`permissions/window/autogenerated/reference.md`). `fs`, `shell`, `http`, `opener` izni yok;
  `dialog`'un `message/ask/confirm` izni bile verilmemiş.
- **Kabuk açan komutlar arayüzden yol almıyor:** `open_log` yolu `diagnostics::log_path()`'ten, `annotation_open_folder`
  yolu `AnnotationStore::dir()`'den alıyor; ikisi de argümansız. `/select,"…"` biçimi boşluklu kullanıcı adları için
  doğru ve testli (`commands.rs:765-776`, `858-861`).
- **İşaret dosya adları temizleniyor:** `annotation.rs:190-203` `<>:"/\|?*`, denetim karakterlerini ve sondaki noktaları
  temizliyor, ".." boşa düşüyor, ad + yol özeti benzersiz. Harita deposu adı `{hash:016x}.json`. Yol geçişi yok.
  Harita dosyası şemasında yol alanı yok.
- **Uzak kaynak yok:** `src/`, `src-tauri/src`, `index.html` altında hiç `http(s)://` yok. Yazı tipi paketli
  (`@fontsource-variable/inter`). `fetch`, `WebSocket`, `Worker`, `innerHTML`, `dangerouslySetInnerHTML`, `eval` yok.
  Lisans iframe'i aynı kökenden bir `.txt` dosyası gösteriyor.
- **Rust tarafında HTTP istemcisi yok:** Windows hedefli `cargo tree`'de `reqwest/ureq/hyper/curl/rustls/native-tls`
  yok; yalnızca `http` tür paketi var (Tauri'nin iç türleri).
- **Geliştirici araçları sürümde kapalı:** `tauri` özelliklerinde `devtools` yok; `tauri-runtime-wry`'de devtools
  `cfg(any(debug_assertions, feature = "devtools"))` koşuluna bağlı. `withGlobalTauri` kapalı (varsayılan).
  `vite.config.ts`: `sourcemap: false`, geliştirme sunucusu yalnızca localhost'a (`host: false`), sabit port.
- **CSP etkin ve dar:** `script-src` `default-src 'self'`'e düşüyor; Tauri yalnızca paketli JS'nin özetlerini ekliyor.
  `unsafe-eval` yok. IPC yalnızca `ipc:` ve `http://ipc.localhost`.
- **Ayar dosyası:** geçici dosya + `sync_all` + `rename` (atomik). Okunamayan dosyanın üstüne yazılmıyor, bozuk JSON
  `.bozuk` olarak saklanıyor, alan alan toleranslı okuma var.
- **SQLite:** WAL + `busy_timeout(5 s)`; "bozuk" sayılıp kenara alınma yalnızca `NotADatabase`/`DatabaseCorrupt`
  için. Kilitli (`Busy`) veritabanı bozuk sayılmıyor, ikinci örnekte veri kaybı yok.
- **Çökme yakalayıcı `panic = "abort"` ile de çalışıyor:** yakalayıcı abort'tan önce çalışır, mesajı ve `dosya:satır`'ı
  yazar, dosyayı her satırda `flush` eder (yığın izi hariç, bkz. KAB-01). Günlük 1 MB'ta dönüyor (en çok ~2 MB);
  `log_frontend_error` mesajı 4000 karakterle sınırlıyor.
- **Kapanış:** `RunEvent::Exit`'te tarama iptal ediliyor, arka plan analizi bayrakla durdurulup bekleniyor. Analiz
  döngüsü bayrağı iş içinde de denetliyor (`background.rs:125-226`).
- **Data klasörü göçü:** `data_dirs.rs` yarım kalan taşımayı geri alıyor (`-wal`/`-shm` eşleri birlikte), iki kopya
  oluşmuyor; üç testi var.
- **NSIS:** `currentUser` (yönetici istemiyor) → `%LOCALAPPDATA%\Lyraska`. Kaldırma, kullanıcı verisini yalnızca
  "uygulama verilerini sil" kutusu işaretlenirse ve güncelleme kipinde değilse siliyor; silinen klasörler
  (`$APPDATA\${BUNDLEID}`, `$LOCALAPPDATA\${BUNDLEID}`, `installer.nsi.txt:871-884`) programın gerçek klasörleriyle
  aynı. Güncelleme kipinde (`/UPDATE`) veri hiç silinmiyor, WebView2 yeniden kurulmuyor. Program açıkken kurulum,
  kapatma onayı istiyor. Türkçe ve İngilizce dilleri var; seçici kapalı, sistem diline göre seçiliyor.
- **`identifier` kararlı:** tam geçmişte yalnızca bir kez değişmiş (`de5d487`, 2 Ekim 2026,
  `…muzikcalar` → `…lyraska`, ikinci commit, kalıcı veri yokken). O günden beri aynı, sürümler arasında yetim kalan
  veri klasörü yok. `.app` ile bitmiyor.
- **Sürüm derlemesi:** `windows_subsystem = "windows"`, LTO, `codegen-units = 1`, `unsafe_code = "deny"`, Clippy
  `unwrap/expect/panic` uyarıları. `build.rs` commit kimliğini yalnızca okuyarak alıyor.
- **Bulanıklaştırma (negatif sonuç):** `symphonia 0.6.1`'de 24 000 bozulmuş dosyada sıfır panik.

## 6. Öncelikli düzeltme sırası

1. **KAB-02:** `diagnostics::init`'i `Builder`'dan önce çağır (klasör `LOCALAPPDATA` + identifier). Açılış hatasında
   `rfd` ile ileti kutusu göster. `lib.rs:172-182` yorumunu düzelt.
2. **KAB-01:** günlükte `{backtrace:#}` ve bir başvuru adresi (`lyraska_lib::run as usize`) yaz. Bunlar olmadan `.pdb`
   saklamak boşa.
3. **KAB-03:** README, MIMARI, `library/mod.rs:11` ve `DOGRULAMA.md` A0'daki klasör adlarını düzelt. README'de "Roaming
   işaretlerinizi tutar, silmeyin" yaz.
4. **KAB-04:** `tauri-plugin-single-instance` ekle (ve `npm run notices`).
5. **KAB-07:** CSP'ye `object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` ekle;
   `'unsafe-inline'`'ı kaldırmayı dene. CSP, capabilities ve "uzak adres yok" kuralı için bir test yaz.
6. **KAB-05:** SignPath Foundation ya da Azure Trusted Signing başvurusu; o zamana kadar `attest-build-provenance`.
7. **KAB-06:** `rust-version = "1.90"`.
8. **KAB-08:** dışa aktarma komutlarında uzantı denetimi; UNC yollarını reddet.
9. **KAB-09:** sağ tık menüsünü ve F5/Ctrl+R/Ctrl+P kısayollarını arayüzde engelle.
10. **KAB-10:** taşımayı `diagnostics::init`'ten sonraya al; birimler arası kopyalama yolu ekle.
