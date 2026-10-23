# KABUK (Tauri kabuğu, güvenlik yapılandırması, Windows kurulumu): bağımsız denetim raporu (Faz 0)

Denetlenen commit: `9ae1b6d` (PR #100 dalı, sürüm 0.0.61). Satır numaraları bu commit'e göredir. Denetim sırasında
`/home/user/Lyraska` çalışma ağacı başka bir işin yarım birleştirmesindeydi (`UU` dosyalar). Bu yüzden bütün okumalar
ve deneyler `9ae1b6d`'nin kendi klasörümdeki temiz bir kopyasında yapıldı.

## 1. Özet

- **Puan (a), depodaki kod ve yapılandırma: 6/10.** Kabuğun iskeleti sağlam: sıkı CSP, en dar izin listesi, Rust'ta ağ
  kodu yok, açılış öncesi günlük ve tek örnek kilidi var. Ancak sıkılaştırılmış CSP, programdaki lisans metinlerini
  gösteren paneli sessizce kırıyor (KAB-01). "Program internete bağlanmaz" kuralının denetim kapısı da hiç çalışmıyor:
  CI'da koşmuyor (KAB-02), koşsa bile URL denetimi ölü kod (KAB-03).
- **Puan (b), GitHub ayarları ve satın alınacaklar dahil: 5/10.** `main`'de dal koruması ya da kural seti yok. SECURITY.md'nin
  gösterdiği özel güvenlik bildirimi kapalı. Kurulum dosyası imzasız.
- **Yüksek, KAB-01:** CSP'deki `connect-src ipc: http://ipc.localhost` satırında `'self'` yok. Ayarlar → Lisanslar'daki
  `fetch("/lisanslar/…")` engelleniyor. Bunu Chromium'da programın CSP'siyle gösterdim (`TypeError: Failed to fetch`).
  GPL metni ve üçüncü taraf bildirimleri programda açılmıyor. Kurulumda gösterilen GPL dışında, bildirimlerin
  kullanıcıya ulaştığı tek yer bu panel. Birim testi `fetch`'i taklit ediyor, `check:scenes` paneli açmıyor: iki kapı da
  yeşil kalıyor. Hata henüz `main`'de değil (main'de `<iframe>` kullanılıyor); bu dal birleşince her kullanıcıya gider.
- **Orta, KAB-02:** `check:rules` CI'daki hiçbir iş akışında yok. README bunun "CI'ın koştuğu denetimlerden" biri
  olduğunu söylüyor. `unsafe` yeri, izin listesi, çevrimdışı ve CSP kuralları yalnızca yerelde denetleniyor.
- **Orta, KAB-03:** `check-rules.mjs:76` yorumları silmek için ilk `//`'dan sonrasını atıyor. Bu, `https://` içindeki
  `//`'ı da yediği için uzak adres denetimi hiçbir zaman tetiklenmiyor. Kopyada beş mutasyonun beşi de yeşil kaldı.
- **Orta, KAB-04:** Açılışta çökme ve ikinci kopya uyarısı artık PATH'te aranan `powershell` ile gösteriliyor.
  PowerShell kısıtlıysa (CLM, AppLocker), PATH bozuksa ya da program klasöründe aynı adlı bir dosya varsa kutu ya
  hiç çıkmıyor ya da başka bir program çalışıyor. Yedek yol yok.
- Düşük düzeydekiler: sessiz kalan açılış hata yolları; ön yüzün verdiği herhangi bir yola yazan komutlar; veri klasörü
  taşımasının geri alma yolu; kalibrasyon WAV dosyasının Roaming'e yazılması; WebView2 onarım iletisinin yanlış olması.
- Temiz bulunanlar: izinler, uzak kaynak erişimi, WebView2 SmartScreen, ayar dosyası, tek örnek kilidi, kaldırıcının
  veri silmesi ve MSRV'nin bağımlılık tarafı.

## 2. Kapsam ve yöntem

**Okunan dosyalar.** Dosyalar `9ae1b6d`'deki hâlleriyle okundu: `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`,
`src-tauri/Cargo.toml`, `rust-toolchain.toml`, `src-tauri/build.rs`, `src-tauri/src/{main,lib,data_dirs,diagnostics,file_manager,atomic_file,settings}.rs`,
`commands.rs` (dosyaya ve dış dünyaya dokunan komutlar), `visual_bridge/calibration.rs` (yazma kısmı),
`src/main.tsx`, `src/lib/browserGuard.ts`, `src/lib/errorReporting.ts`, `src/components/SettingsPanel.tsx`
(lisanslar), `components.test.tsx` (lisans testi), `index.html`, `vite.config.ts`, `README.md`, `SECURITY.md`,
`docs/MIMARI.md` (veri klasörleri ve kural tablosu), `docs/DOGRULAMA.md` (F2), `.github/workflows/{ci,test-surumu}.yml`,
`.github/ISSUE_TEMPLATE/hata-kaydi.yml`, `scripts/check-rules.mjs`, `scripts/check-scenes.mjs`, `scripts/check-docs.mjs` (baş kısmı).

Tauri 2.12.1 kaynağından okunanlar:

- `app.rs:2688-2700`: pencere, kullanıcının `setup`'ından önce kurulur; `1444` satırında setup hatası panik olur.
- `webview/mod.rs:2080`: uygulama komutları için ACL yalnızca uzak kaynakta, eklentide ya da uygulama manifestinde denetlenir.
- `manager/mod.rs:53-107`: CSP'de yalnızca `script-src` ve `style-src` değiştirilir.
- `protocol/tauri.rs:182`: CSP yanıt başlığı olarak gönderilir.

wry 0.57: `webview2/mod.rs:303`, varsayılan `--disable-features=…msSmartScreenProtection`.

Tauri CLI 2.12.1'in gömülü NSIS şablonu `strings` ile çıkarıldı: WebView2 bölümü ve kaldırıcının veri silme bölümü.
Rust std 1.97.0'ın `sys/process/windows.rs` dosyası (`search_paths`) GitHub'dan okundu.

**Çalıştırılan komutlar ve deneyler.** Hepsi `9ae1b6d` kopyasında yapıldı; `node_modules` için sembolik bağ kullanıldı.

1. `npm run build` (yalnızca kopyada).
2. **CSP deneyi:** küçük bir Playwright betiği `dist/`'i programın CSP'si başlıkta olacak şekilde Vite önizlemesiyle
   sundu (`/opt/pw-browsers/chromium-1194`). Betik iki lisans metnini `fetch` etti. Ardından aynı deney
   `connect-src 'self' …` ile tekrarlandı.
3. **`check:scenes` mutasyon sınaması** (`SCENE_ONLY=sky`; kopyada port 4199, çünkü 4179'u başka bir iş kullanıyordu):
   - CSP olduğu gibi: yeşil.
   - `style-src 'none'`: kırmızı.
   - `font-src 'none'`: kırmızı.
4. **`check:rules` mutasyon sınaması** (beş değişiklik, sonuçlar KAB-03'te).
5. `cargo metadata --locked --offline`: bağımlılıkların `rust-version` değerleri.
6. `cargo tree -e features -i rfd --target x86_64-pc-windows-msvc`.
7. Ağ crate'i taraması: `cargo tree --target x86_64-pc-windows-msvc`.
8. GitHub REST'ten herkese açık sorgular:
   - `private-vulnerability-reporting`
   - `branches/main/protection`, `rules/branches/main`, `rulesets`
   - `releases/tags/test-surumu`, `attestations/sha256:…`
   - `gh run list --workflow "Test sürümü"`

**Sınırlar.**

- Rust derlemesi yapılmadı (BRIEF kuralı). Clippy, Windows derlemesi ve MSRV derlemesi kanıtı yok.
- Gerçek Windows ve WebView2 yok. CSP deneyi Linux Chromium'da yapıldı; WebView2 de aynı Blink motorudur.
- NSIS kurulumu ve kaldırma çalıştırılmadı; davranış şablon metninden okundu.
- Dal koruması API'si yönetici izni olmadan "Branch not protected" döndürüyor. Kural seti listeleri boş geldi.

## 3. Bulgular

### KAB-01: CSP lisans metinlerinin yüklenmesini engelliyor; GPL ve üçüncü taraf bildirimleri programda açılmıyor

- Önem: **Yüksek** · Güven: **Kanıtlandı** · Standart: GPL-3.0 §4 ve §6 (lisansın ve bildirimlerin alıcıya
  verilmesi), Apache-2.0 §4(d), BSD-2/3 "binary form" maddesi, W3C CSP3 `connect-src`, ISO/IEC 25010 işlevsel doğruluk.
- Yer:
  - `src-tauri/tauri.conf.json:25`: `connect-src ipc: http://ipc.localhost` (`'self'` yok)
  - `src/components/SettingsPanel.tsx:236`: `fetch(src)`; `src` değerleri `/lisanslar/GPL-3.0.txt` ve `/lisanslar/UCUNCU-TARAF.txt`
- Kanıt (programın CSP'si başlıkta, Chromium 1194):

  ```
  KONSOL HATASI: Refused to connect to 'http://localhost:4188/lisanslar/GPL-3.0.txt' because it violates the
  following Content Security Policy directive: "connect-src ipc: http://ipc.localhost".
  /lisanslar/GPL-3.0.txt -> HATA TypeError: Failed to fetch
  /lisanslar/UCUNCU-TARAF.txt -> HATA TypeError: Failed to fetch
  ```

  Aynı deney `connect-src 'self' ipc: http://ipc.localhost` ile: `ok 200 35149 bayt` ve `ok 200 462751 bayt`.

  Kapılar bunu görmüyor:
  - `components.test.tsx:455-458` `fetch`'i `vi.stubGlobal("fetch", …)` ile taklit ediyor; jsdom CSP uygulamıyor.
  - `check:scenes` Lisanslar panelini açmıyor. Program CSP'siyle koşan sky denetimi kopyada yeşil bitti.
  - `main`'de (`origin/main:SettingsPanel.tsx:222`) metin `<iframe>` ile yükleniyor ve `frame-src` → `default-src 'self'`
    izni sayesinde çalışıyor. `fetch`'e geçiş (03b0aca) ile CSP sıkılaştırması (0797c3f) aynı gün bu dalda yapıldı.
    `DOGRULAMA.md` F2'deki gerçek cihaz doğrulaması eski `<iframe>` sürümüne aitti.

- Senaryo ve etki: PR #100 birleşir ve sabit linkteki test sürümü yenilenir. Ardından Ayarlar → Lisanslar'ı açan her
  kullanıcı iki metinde de "Metin açılamadı (…)" görür.
  - GPL metni kurulum sihirbazında da gösteriliyor (`licenseFile`).
  - Üçüncü taraf telif bildirimleri ise ikili dağıtımda kullanıcının görebileceği tek bu yerde. Dosya exe'ye gömülü
    ama erişilemiyor.
  - MIT, BSD ve Apache-2.0 bileşenlerinin bildirim yükümlülüğü her sürümde fiilen karşılanmamış olur.
  - README'nin "Settings → Licenses altında gösterilir" sözü tutmaz.
- Çürütme denemesi:
  - (1) Tauri CSP'yi değiştirip `connect-src`'ye `'self'` ekliyor olabilir mi? Hayır. `manager/mod.rs:53-107` yalnızca
    `script-src` ve `style-src`'ye hash/nonce ekliyor. tauri, tauri-codegen ve tauri-utils kaynaklarında `connect-src`'yi
    değiştiren kod yok.
  - (2) WebView2'nin özel şema yakalaması CSP'yi atlıyor olabilir mi? CSP denetimi istek ağa çıkmadan önce Blink'te
    yapılıyor. Tauri sayfayı `http://tauri.localhost` adresinden aynı kökenle sunuyor ve CSP başlığını HTML yanıtına
    koyuyor (`protocol/tauri.rs:182`). Bu yüzden durum deneydeki aynı kökenli `fetch` ile birebir aynı.
  - (3) Metin başka bir yoldan yükleniyor olabilir mi? Hayır. Bileşen hata durumunda yalnızca uyarı gösteriyor.
  - Önemi düşüren tek etken: hata henüz `main`'de değil.
- Öneri: en küçük düzeltme `connect-src 'self' ipc: http://ipc.localhost`. `check:rules`'un `'self'`'e bir itirazı yok.
  Alternatif olarak, `connect-src` hiç gevşetilmeden metinler `import(…?raw)` ile tembel bir parça olarak yüklenebilir.
  Ayrıca `check:scenes`'e programın CSP'siyle Lisanslar panelini açıp metnin göründüğünü denetleyen küçük bir adım
  eklenmeli. Birim testinin taklidi bu hatayı hiçbir zaman göremez.

### KAB-02: `check:rules` CI'da hiç çalışmıyor; README çalıştığını söylüyor

- Önem: **Orta** · Güven: **Kesin** · Standart: OpenSSF Scorecard "CI-Tests"; MIMARI.md "Elle hatırlanması gereken kural
  yoktur" ilkesi; ISO/IEC 25010 bakım kolaylığı (test edilebilirlik).
- Yer: `.github/workflows/ci.yml:42-59` (arayüz işinde `check:licenses`, `check:audio`, `check:docs`,
  `check:commands` var, `check:rules` yok); `README.md:89-94`.
- Kanıt:

  ```
  $ grep -c "rules" .github/workflows/*.yml
  .github/workflows/ci.yml:0  guvenlik-taramasi.yml:0  test-surumu.yml:0
  $ git log -S"check:rules" -- .github/workflows/ci.yml      # boş: hiçbir zaman eklenmemiş
  ```

  `check-docs.mjs` `check-rules.mjs`'i içe aktarmıyor ya da çağırmıyor. README:89'da "Checks (the same ones CI
  runs…)" yazıyor; 94. satırda `npm run check:rules` geçiyor.

- Senaryo ve etki: Bir oturum `capabilities/default.json`'a `shell:allow-execute` ya da `fs:default` ekler, ya da
  başka bir dosyada `#[allow(unsafe_code)]` açar. CI yeşil kalır ve değişiklik birleşir.
  - "Tauri izinleri en dar listede" kuralı tamamen yerel disipline kalmış durumda.
  - "unsafe yalnızca WASAPI'de" kuralı da öyle. `unsafe_code = "deny"` lint'i ancak `#[allow]` açılmadığı sürece koruyor.
  - CLAUDE.md'nin "hiçbir teknik iş sahibine bırakılmaz" modelinde bu kapıyı insan gözü de yakalamıyor.
- Öneri: `ci.yml`'deki arayüz işine `- name: Proje kuralları` / `run: npm run check:rules` adımı eklenmeli. KAB-03
  düzeltilmeden eklenirse yalnızca izin ve `unsafe` kuralları gerçekten çalışır.

### KAB-03: "Program internete bağlanmaz" denetimi ölü kod; CSP denetimi şemasız ve `ws(s)` kaynakları kaçırıyor; Rust tarafında kapı yok

- Önem: **Orta** · Güven: **Kanıtlandı** · Standart: OpenSSF Scorecard (kapıların gerçekliği), OWASP ASVS V14
  (yapılandırma), Tauri 2 güvenlik modeli (CSP).
- Yer: `scripts/check-rules.mjs:76`, `84-90`; `src-tauri/deny.toml` `[bans]` (ağ crate'i yasağı yok).
- Kanıt: Satır 76 `const code = line.replace(/\/\/.*$/, "")…`. Bu ifade ilk `//`'dan sonrasını "yorum" sayıyor, bu
  yüzden `https://…` kaynaktan `https:` olarak çıkıyor:

  ```
  $ node -e '…replace(/\/\/.*$/,"")…'  →  "  const r = await fetch(\"https:"  false
  ```

  Kopyadaki mutasyonların hepsi `Kural denetimi tamam: … uzak adres yok, CSP sıkı.` ile bitti:

  | Mutasyon                                                                                                | Sonuç |
  | ------------------------------------------------------------------------------------------------------- | ----- |
  | `src/lib/kabMut.ts`: `fetch("https://example.com/t")`                                                   | yeşil |
  | `new WebSocket("wss://…")` ve `fetch("//example.com/t")`                                                | yeşil |
  | `index.html`'e `<script src="https://cdn.example.com/x.js">`, `global.css`'e `@import url("https://…")` | yeşil |
  | CSP: `connect-src ipc: http://ipc.localhost api.example.com wss://t.example.com`                        | yeşil |
  | Rust: `std::net::TcpStream::connect("example.com:443")`                                                 | yeşil |

  Bugünkü kodda uzak adres yok: Rust'ta `std::net` ve `http` yok, Windows bağımlılık ağacında `reqwest`, `ureq`,
  `hyper` ya da `rustls` yok. Yani bugün açık bir sızıntı yok. Ama kural yazılışından beri (0797c3f) hiçbir uzak
  adresi yakalayamadı.

- Senaryo ve etki: Gerçek koruma CSP. Arayüzden uzak `fetch`, `<script>` ya da stil yüklemesini CSP engelliyor ve
  `check:scenes` bunu konsol hatası olarak yakalıyor (mutasyonla doğrulandı). Ancak CSP'ye şemasız bir alan ya da
  `wss:` eklenirse hiçbir kapı uyarmaz. Rust'a bir HTTP crate'i eklenirse de hiçbir kapı uyarmaz. Bu, programın
  temel sözü olan "çevrimdışı ve telemetrisiz" ifadesine doğrudan dokunuyor.
- Öneri:
  - (1) Yorum silmeyi `line.replace(/(^|[^:])\/\/.*$/, "$1")` yap; daha iyisi URL'yi yorum silmeden önce ara.
  - (2) CSP'yi yönerge yönerge izin listesiyle doğrula: her kaynak `'self'`, `'none'`, `data:`, `blob:`, `ipc:` ya da
    `http://ipc.localhost` olmalı. Gerekirse `'wasm-unsafe-eval'` eklenir.
  - (3) `deny.toml` `[bans] deny = [{ name = "reqwest" }, { name = "ureq" }, { name = "hyper" }, { name = "isahc" }, { name = "curl" }]`.
  - (4) `check-rules`'a bilinen kötü örneklerle bir öz-sınama (`check-rules.test.mjs`) ekle.

### KAB-04: Açılış ve ikinci kopya uyarısı PATH'teki PowerShell'e bağlı; kısıtlı ortamda sessiz, program klasörüne dosya bırakmaya açık

- Önem: **Orta** · Güven: **Yüksek** (davranış Windows ortamına bağlı) · Standart: CWE-427 (Uncontrolled Search Path
  Element), OWASP ASVS V14, ISO/IEC 25010 güvenilirlik (hata görünürlüğü).
- Yer: `src-tauri/src/diagnostics.rs:204-221` (`Command::new("powershell")`), `diagnostics.rs:72` (`Command::new("cmd")`),
  `file_manager.rs:7,26` (`Command::new("explorer")`).
- Kanıt:

  ```rust
  let _ = std::process::Command::new("powershell")
      .args(["-NoProfile", "-NonInteractive", "-Command", script])   // script: Add-Type -AssemblyName System.Windows.Forms; …
      .env("LYRASKA_NOTICE", text) … .creation_flags(CREATE_NO_WINDOW).status();
  ```

  Rust std 1.97 `search_paths` arama sırası: (1) çocuğun PATH'i, (2) **programın kendi klasörü**, (3) System32,
  (4) Windows klasörü, (5) üst sürecin PATH'i.
  - `powershell.exe` System32'nin kökünde değil, `System32\WindowsPowerShell\v1.0\` altında. Bu yüzden yalnızca 5. adımda
    (PATH) bulunuyor.
  - Kurulum `currentUser` modunda, yani `%LOCALAPPDATA%\Lyraska\`. Kullanıcının yazabildiği bu klasördeki
    `powershell.exe`, `cmd.exe` ya da `explorer.exe` dosyası, sistemdekinin önüne geçiyor.
  - Metin ortam değişkeniyle geçiriliyor, komut enjeksiyonu yok (doğru).

- Senaryo ve etki:
  - (a) Asıl hedef, WebView2'nin olmadığı ya da bozuk olduğu bir makinede açılış çökmesini kullanıcıya göstermek.
    PATH'i bozulmuş bir makinede (yükleyicilerin PATH'i kırpması sık görülür) bu kutu çıkmıyor. Kurumsal
    AppLocker/WDAC ile Constrained Language Mode'da da çıkmıyor, çünkü orada `Add-Type` yasak. Konsolsuz bir programda
    kullanıcı hiçbir şey görmüyor. Kod yorumu bu kutuyu "başka hiçbir iz kalmazdı" diye gerekçelendiriyor.
  - (b) İmzasız bir exe'nin gizli pencereyle `powershell -NonInteractive -Command … Add-Type` başlatması, uç nokta
    koruma ürünlerinin bilinen bir sezgisel kalıbı. Program yanlışlıkla şüpheli işaretlenebilir. Bu kısım olası.
  - (c) Program klasörüne dosya bırakmak aynı kullanıcı düzeyinde kalıyor (yetki yükseltmesi yok), bu yüzden etkisi
    sınırlı.
- Çürütme denemesi: Önem Orta olarak bırakıldı; ev kullanıcısında PowerShell genelde PATH'te ve FullLanguage modunda
  çalışıyor. Commit (9ae1b6d) `rfd`'yi bilinçli olarak kaldırmış: Dialog eklentisi `rfd`'nin `common-controls-v6`
  özelliğini zaten açıyor (`cargo tree` çıktısı), muhtemelen test exe'sinde TaskDialog içe aktarma sorunu yüzünden.
  Bu yüzden önerilen düzeltme `rfd`'ye dönmek değil.
- Öneri:
  - (1) Tam yol kullan: `PathBuf::from(env::var_os("SystemRoot")?).join(r"System32\WindowsPowerShell\v1.0\powershell.exe")`.
    `cmd` ve `explorer` için de aynısı (`System32\cmd.exe`, `explorer.exe`).
  - (2) Kutu açılamazsa (çıkış kodu sıfırdan farklıysa ya da başlatma hatası varsa) bir sonraki başarılı açılışta
    programın içinde "son açılış çöktü, günlük burada" uyarısı göster. `oturum-acik` işareti bu iş için zaten var.
  - (3) Uzun vadede `windows` crate'iyle tek bir `MessageBoxW` çağrısı düşünülebilir. Bu, `unsafe` istisna listesine
    gerekçeli bir ekleme ister ve proje sahibine sorulmalı.

### KAB-05: Bazı açılış hataları tamamen sessiz kalıyor

- Önem: **Düşük** · Güven: **Kesin** · Standart: ISO/IEC 25010 güvenilirlik (hata görünürlüğü).
- Yer:
  - `src-tauri/src/lib.rs:220-229`: `build()` hatası yalnızca günlüğe ve `eprintln!`'e yazılıyor, sonra `exit(1)`.
    Uyarı kutusu yok, `windows_subsystem = "windows"` olduğu için konsol da yok.
  - `diagnostics.rs:45-48`: günlük açılamazsa `return` ediliyor ve 57. satırdaki `install_panic_hook()` hiç
    çalışmıyor. Sonrasında gelen açılış çökmesinde kutu çıkmıyor.
  - `data_dirs.rs:141-172`: Roaming'den Local'a taşıma günlük açılmadan önce yapılıyor ve başarısızlığı hiçbir yere
    yazılmıyor.
- Kanıt: kod yukarıda; üç yolun hiçbirinde `notice_dialog` ya da günlük satırı yok.
- Senaryo ve etki: Olay döngüsü ya da eklenti kurulamazsa (ör. kısıtlı oturum) ya da `%LOCALAPPDATA%` yazılamıyorsa
  program iz bırakmadan kapanıyor. Taşıma başarısız olunca Roaming'de kalındığı bilgisi hata kaydında görünmüyor.
  Hepsi seyrek durumlar.
- Öneri:
  - `lib.rs:225`'ten sonra `diagnostics::notice_dialog(&message, true)` çağır.
  - `install_panic_hook()`'u `init`'in başına al. Kanca, günlük olmasa da (`log_path()` `None`) kutuyu gösterebiliyor.
  - `big_data_dir`'ın sonucunu (taşındı / atlandı / Roaming'de kaldı ve neden) döndür ve `lib.rs`'te günlük açılınca yaz.

### KAB-06: Ön yüzün verdiği herhangi bir yola yazan ve okuyan komutlar (derinlemesine savunma eksik)

- Önem: **Düşük** · Güven: **Kesin** · Standart: Tauri 2 güvenlik modeli ("ön yüze güvenme", komut kapsamları),
  OWASP ASVS V12.3 (dosya yolu), CWE-73.
- Yer:
  - Yazanlar: `commands.rs:575-577` `parametric_export(path: String)` → `std::fs::write(&path, …)`; `commands.rs:633`
    `song_map_export(target)` → `std::fs::write(&target, …)`.
  - Okuyanlar: `headphone_import` (471), `parametric_import` (562), `track_cover` (190).
  - `capabilities/default.json` yalnızca eklenti izinlerini tanımlıyor. Uygulama ACL manifesti yok, bu yüzden 52
    uygulama komutunun hepsi yerel köken için açık (Tauri `webview/mod.rs:2080`).
- Kanıt: kod yukarıda. Yol, `plugin-dialog`'un `save()` sonucu olarak ön yüzden geliyor; Rust tarafında hiçbir
  bağlama ya da kapsam denetimi yok.
- Senaryo ve etki: Yalnızca arayüzde betik çalıştırılabildiğinde (XSS) etkili. Bugün HTML enjeksiyonu yapılabilecek
  bir nokta yok (`dangerouslySetInnerHTML`, `innerHTML` ya da link yok), CSP sıkı ve uzak kaynaklar komut çağıramıyor.
  Gelecekte kullanıcının içe aktardığı MilkDrop presetleri, sözler ya da etiketlerin işlendiği bir yolda hata
  olursa, bu komutlar kullanıcının yazabildiği her yere (ör. Başlangıç klasörü) dosya yazabilen bir araca dönüşür.
- Öneri: Kaydetme penceresini Rust'tan aç (`app.dialog().file().blocking_save_file()`) ve yolu ön yüzden alma.
  Okuyan komutlarda da aynısı yapılabilir. Daha geniş bir çözüm: `tauri_build::Attributes::app_manifest` ile
  uygulama komutlarına da ACL tanımla.

### KAB-07: Veri klasörü taşımasının geri alma yolu eski bir kopyayı kalıcı kılabiliyor

- Önem: **Düşük** · Güven: **Kesin** (kod okuması; tetiklenmesi Windows ve paylaşım koşullarına bağlı) · Standart:
  ISO/IEC 25010 güvenilirlik; Windows uygulama verisi kuralları (Known Folders).
- Yer: `src-tauri/src/data_dirs.rs:103-122` (`copy_then_remove`), `141-172` (`big_data_dir`), `lib.rs:37-47`
  (taşıma tek örnek kilidinden önce yapılıyor).
- Kanıt: `copy_then_remove` kopyalama başarılı olduğu hâlde kaynak silinemezse hatayla dönüyor ve hedefteki kopyayı
  bırakıyor (109-115 yalnızca kopyalama hatasında temizliyor). `big_data_dir` geri almayı (156-161) hata sonucuna
  bakmadan deniyor (`let _ = move_path(...)`). Geri alma da başarısız olursa Local'da bir kopya kalıyor. Sonraki
  açılışta 146. satırdaki `local.join(MOVED_FILES[0]).exists()` koşulu doğru çıkıyor ve **o eski kopya** kullanılıyor.
  Bu arada Roaming'deki sürüm o oturumda güncellenmiş olabilir. Ayrıca geri alma yolunda `copy_then_remove`'un
  temizliği, önceden var olan **asıl** Roaming dosyasını silmeyi deniyor (113. satır, `to` = asıl dosya). SQLite
  dosyayı `FILE_SHARE_DELETE` olmadan açtığı için bu genelde başarısız oluyor.
- Senaryo ve etki: Klasör yönlendirmeli kurumsal bir profil düşünelim: Roaming ağ paylaşımında, `rename` birimler
  arası olduğu için çalışmıyor. Kullanıcının başka bir makinedeki oturumu aynı veritabanını açık tutuyor. Kütüphane
  ve analiz önbelleği "yeniden üretilebilir" sınıfında olduğu için gerçek bir kayıp yok, ama kullanıcı klasör
  listesinin eski hâline döndüğünü görebilir. Bu seyrek bir durum.
- Öneri:
  - `copy_then_remove` kaynağı silemezse hedefteki kopyayı da silsin (taşıma ya hep ya hiç olsun).
  - Geri alma yolunda `move_path` yerine yalnızca `rename` kullan ve hedef zaten varsa hedefe dokunma.
  - Taşımayı tek örnek kilidinden sonraya almak, iki kopyanın aynı anda taşıma yapmasını da önler.

### KAB-08: Kalibrasyon kaydı (yaklaşık 1,6 MB, yeniden üretilebilir) gezici klasöre yazılıyor

- Önem: **Düşük** · Güven: **Kesin** · Standart: Windows uygulama verisi kuralı (Roaming yalnızca küçük, kullanıcıya ait
  veri için), MIMARI.md ve README'nin klasör ayrımı.
- Yer: `src-tauri/src/commands.rs:404-418` (`app.path().app_data_dir()` → `kalibrasyon/tiklama.wav`),
  `visual_bridge/calibration.rs:13-21,55-80`.
- Kanıt: süre (2 + 23·0,6 + 1) s = 16,8 s; 48 kHz, mono, 16 bit → **≈1,61 MB**. Dosya `%APPDATA%` (Roaming) altına
  gidiyor. README ve MIMARI bu klasör için yalnızca "ayarlar, işaretler, haritalar" yazıyor. Yazma da bölünmez değil
  (`File::create` + `write_all`).
- Senaryo ve etki: Gezici profilde her oturum açılışında 1,6 MB fazladan eşitleniyor. Etkisi küçük, ama data_dirs'ün
  kendi gerekçesiyle ("gezici profillerde oturum açmayı yavaşlatmasın") çelişiyor.
- Öneri: `LibraryState` ya da `DataDirs`'teki `big` (Local) klasörünü kullan ve yazmayı `atomic_file::write` ile yap.

### KAB-09: Açılış uyarısındaki "yeniden kurmak WebView2'yi de onarır" sözü yanlış; en düşük WebView2 sürümü tanımlı değil

- Önem: **Düşük** · Güven: **Kesin** (NSIS şablonu) · Standart: ISO/IEC 25010 kullanılabilirlik; Tauri `minimumWebview2Version`.
- Yer:
  - `src-tauri/src/diagnostics.rs:192-194`: "WebView2 kurulu değilse ya da bozulduysa Lyraska'yı yeniden kurmak onu da kurar."
  - `tauri.conf.json:45-51`: `minimumWebview2Version` yok.
  - `vite.config.ts`: `target: "chrome120"`.
- Kanıt: Tauri CLI 2.12.1 NSIS şablonunun `Section WebView2` bölümü `EdgeUpdate\Clients\{F3017226…}` anahtarındaki
  `pv` değerini okuyor ve **değer varsa** kurulumu atlıyor (`${If} $4 == ""`). Bozuk ama kayıtlı bir runtime
  onarılmıyor. `MINIMUMWEBVIEW2VERSION` boş olduğu için eski bir runtime da güncellenmiyor. `embedBootstrapper`
  internetten indiriyor; README bunu açıkça yazıyor (doğru).
- Senaryo ve etki: Bozuk WebView2 yüzünden açılamayan kullanıcı uyarıyı izleyip programı yeniden kuruyor, ama sorun
  sürüyor. Güncellemeleri kapalı bir makinede 120'den eski bir runtime varsa arayüz sözdizimi hatasıyla boş
  kalabilir. Bu kısım olası.
- Öneri:
  - Metni şöyle değiştir: "…WebView2 kurulu değilse yeniden kurmak onu da kurar; bozulduysa Windows Ayarlar →
    Uygulamalar → Microsoft Edge WebView2 Runtime → Değiştir → Onar."
  - `bundle.windows.nsis.minimumWebview2Version`'ı chrome120'ye karşılık gelen sürüme ayarla.

### KAB-10: MSRV (`rust-version = "1.90"`) hiçbir yerde derlenerek sınanmıyor

- Önem: **Bilgi** · Güven: **Kesin** · Standart: Cargo `rust-version`, Semantic Versioning (MSRV sözü).
- Yer: `src-tauri/Cargo.toml:9`, `rust-toolchain.toml` (`channel = "1.97.0"`), `.github/workflows/*.yml` (1.90 işi yok).
- Kanıt:
  - `cargo metadata --locked` ile en yüksek bağımlılık `rust_version` değeri **1.90**: tauri 2.12.1, tauri-plugin-dialog
    2.8.1, muda ve tray-icon. Yani bağımlılık tarafı tutuyor.
  - Kodda 1.82'den yeni std API'si bulunmadı: `is_none_or` 1.82, `repeat_n` 1.82, `File::try_lock` 1.89.
  - Clippy'nin `incompatible_msrv` lint'i (`clippy::all` içinde, CI'da `-D warnings`) std API'leri `rust-version`'a
    göre denetliyor. Dil özellikleri ve derleyici davranışı ise sınanmıyor.
- Öneri: CI'ya `cargo +1.90 check --locked` ile tek bir hafif iş ekle, ya da `rust-version`'ı araç zinciriyle (1.97)
  eşitle. Proje sahibine MSRV'nin bir söz olup olmadığı sorulmalı.

### KAB-11: İzin listesinde gereğinden geniş `core:default`; prototip dondurma kapalı

- Önem: **Bilgi** · Güven: **Kesin** · Standart: Tauri 2 capabilities (en az yetki).
- Yer: `src-tauri/capabilities/default.json` (`"core:default"`), `tauri.conf.json` (`freezePrototype` yok).
- Kanıt ve etki: `core:default` pencere, webview, uygulama, yol, menü, tepsi, resim ve kaynak varsayılanlarını
  topluca açıyor. Bunların çoğu yalnızca okuma ve sürükle-bırak için gerçekten bir kısmı gerekiyor. Saldırı yüzeyine
  katkısı küçük.
- Öneri: kullanılanları açıkça yaz (ör. `core:event:default`, `core:webview:default`, `core:window:default`,
  `core:app:default`). `app.security.freezePrototype: true` denenmeli.

## Proje sahibinin ayarına bağlı

### KAB-S1: SECURITY.md'nin gösterdiği "Report a vulnerability" kapalı

- Önem: **Orta** · Güven: **Kanıtlandı** · Standart: OpenSSF Scorecard "Security-Policy"; GitHub Docs "Private vulnerability reporting".
- Kanıt: `gh api repos/lahmacunveayran/Lyraska/private-vulnerability-reporting` → `{"enabled":false}`. Buna karşılık
  `SECURITY.md:10-11` ve `.github/ISSUE_TEMPLATE/config.yml:4` `security/advisories/new` sayfasını gösteriyor.
- Senaryo ve etki: Bir açık bulan kişi düğmeyi bulamıyor ve büyük olasılıkla herkese açık bir hata kaydı açıyor.
  Kötü niyetli bir ses dosyası açığı da böyle herkesin önüne düşebilir.
- Öneri (sahibe): GitHub'da depo → **Settings** → **Code security** → "Private vulnerability reporting" satırında **Enable**.

### KAB-S2: `main` dalında koruma ya da kural seti yok

- Önem: **Orta** · Güven: **Kanıtlandı** (herkese açık API) · Standart: OpenSSF Scorecard "Branch-Protection"; SLSA v1.0 kaynak bütünlüğü.
- Kanıt: `branches/main/protection` → `Branch not protected` (404); `rules/branches/main` → `[]`; `rulesets` → `[]`.
- Senaryo ve etki: CLAUDE.md'deki "main'e doğrudan push yok; CI yeşil olmadan birleştirme yok" kuralı teknik olarak
  zorlanmıyor. Test sürümü iş akışı yalnızca CI'si yeşil olan `main` push'unu derlediği için kırmızı kod sabit linke
  çıkmıyor (iyi). Ama zorunlu inceleme yok, durum denetimi yok ve zorla push yasağı yok. Bu bulgu CI/yayın
  denetçisininkiyle çakışabilir.
- Öneri (sahibe): **Settings → Rules → Rulesets → New branch ruleset**, hedef `main`:
  - "Require a pull request before merging"
  - "Require status checks to pass": CI işleri
  - "Block force pushes"

### KAB-S3: Kurulum dosyası imzasız

- Önem: **Orta** · Güven: **Kesin** · Standart: OpenSSF Scorecard "Signed-Releases" (kısmen: GitHub derleme kanıtı bu
  dalda ekleniyor), Microsoft SmartScreen.
- Kanıt: `tauri.conf.json`'da `certificateThumbprint` ya da `signCommand` yok. README ve sürüm notları "Yine de
  çalıştır" demeyi öğretiyor.
- Etki: Kullanıcılar SmartScreen uyarısını geçmeye alıştırılıyor. Sahte bir "Lyraska-Kurulum.exe" de aynı uyarıyı
  verir. Not: yayındaki dosya (0.0.58, `f00ce64`) için `attestations/sha256:dec823db…` → 404. Derleme kanıtı yalnızca
  bu dalın iş akışında var, birleşince başlayacak. README'nin "Every build carries…" cümlesi de yalnızca bu dalda.
- Öneri (sahibe, satın alma): bir kod imzalama yolu seçilmeli (Azure Trusted Signing ya da bir OV sertifikası) ve
  Tauri `signCommand` ile bağlanmalı. O zamana kadar sürüm notlarında `gh attestation verify` öne çıkarılmalı.

## 4. Olası riskler (kanıtı yetmeyenler)

- **Uç nokta koruması sezgileri:** İmzasız bir exe her açılışta gizli `cmd /C ver` başlatıyor (`diagnostics.rs:72`),
  hata anında da gizli PowerShell + `Add-Type`. Bunlar Defender ya da başka bir EDR tarafından şüpheli
  işaretlenebilir. Doğrulanamadı. Windows sürümü için `cmd` yerine kayıt defteri
  (`HKLM\…\CurrentVersion` `CurrentBuild`, `UBR`) okunabilir.
- **Ayar kaydında paylaşım ihlali:** `atomic_file::write` → `std::fs::rename` (MoveFileEx, REPLACE_EXISTING). Virüs
  tarayıcı ya da dizin oluşturucu `settings.json`'u o an paylaşımsız tutarsa kayıt hatayla dönüyor (arayüzde
  görünür) ve `.tmp` dosyası kalıyor. Kısa bir yeniden deneme eklenebilir.
- **Eşzamanlı ilk açılış:** `DataDirs::resolve` içindeki taşıma tek örnek kilidinden önce yapılıyor (`lib.rs:37` →
  `46`). Arka arkaya iki kez çift tıklanan bir güncelleme sonrası açılışta iki süreç aynı anda taşıma yapabilir.
  Okuduğum akışta veri kaybı bulamadım.
- **Uzak sayfaya gezinme:** `on_navigation` engeli yok. Bugün arayüzde link olmadığı için gezinme yolu yok; uzak
  sayfa da uygulama komutlarına erişemiyor (Tauri ACL). Gelecekte bir "Kaynak kodu" linki eklenirse pencere GitHub'a
  gidebilir.
- **Günlük sahteciliği:** `log_frontend_error` çok satırlı metni olduğu gibi yazıyor (`commands.rs:776-781`), yani
  arayüz sahte `[ÇÖKME]` satırları üretebilir. Yalnızca yerel ve tanı amaçlı bir sorun. Satır sonlarını `⏎`'e çevirmek
  yeterli.

## 5. Temiz bulunanlar

- **CSP gerçekten sınanıyor:** `check:scenes` CSP'yi `tauri.conf.json`'dan okuyup başlık olarak uyguluyor
  (`check-scenes.mjs:644-646`). Mutasyonla doğrulandı: `style-src 'none'` ve `font-src 'none'` → çıkış kodu 1,
  "Refused to load the stylesheet/font"; asıl CSP → yeşil. Kapsamı sayfa yüklemesiyle sınırlı (bkz. KAB-01).
  9ae1b6d'deki CSSOM ile stil ekleme değişikliği CSP'yi gevşetmiyor.
- **Komut erişimi:** uzak kökenler uygulama komutlarını çağıramıyor (Tauri `webview/mod.rs:2080`). `withGlobalTauri`,
  asset protokolü, `shell`, `fs` ve `http` eklentileri yok. Devtools sürüm derlemesinde kapalı (`tauri` özelliklerinde
  `devtools` yok).
- **Çevrimdışı sözü bugünkü kodda tutuyor:**
  - Rust'ta `std::net` ve HTTP crate'i yok; Windows bağımlılık ağacında `reqwest`, `ureq`, `hyper`, `rustls` ve `curl` yok.
  - Arayüzde uzak adres, `innerHTML` ya da `<a href>` yok.
  - WebView2'nin SmartScreen'i wry varsayılanıyla kapalı (`msSmartScreenProtection`).
  - WebView2 eksikse kurulumun internet istediği README'de açıkça yazıyor.
- **Açılış çökmesi:** Pencere ve WebView2, kullanıcının `setup`'ından önce kuruluyor (`app.rs:2688-2700`). Kurulum hatası
  panik oluyor (`app.rs:1444`), dolayısıyla `mark_started()`'ın yeri doğru. Panik kancası yeri, iş parçacığını ve
  adresli yığın izini yazıyor; sürümde `panic = "abort"` öncesinde de kanca çalışıyor. Günlük 1 MB'ta döndürülüyor ve
  yedek kilitliyken de yazmayı sürdürüyor (testli).
- **PowerShell iletisinde enjeksiyon yok:** metin ortam değişkeniyle geçiriliyor.
- **Tek örnek:** İşletim sisteminin dosya kilidi kullanılıyor (`File::try_lock`, 1.89+); çökmede kendiliğinden kalkıyor.
  `begin_session`'dan önce alınıyor; testi var.
- **Ayarlar:** bölünmez yazma (`sync_all` + `rename`). Bozuk alan tek başına varsayılana dönüyor. JSON değilse
  `.bozuk` yedeği alınıyor. Okunamayan dosyanın üstüne yazılmıyor. Bilinmeyen alanlar korunuyor (eski sürüme dönüşte
  veri kaybı yok).
- **Veri klasörleri:** Tauri'nin kuralıyla aynı (`dirs::data_dir`/`data_local_dir` + kimlik). README, MIMARI ve hata
  formu tutarlı; `check:docs` adları kimlikle karşılaştırıyor. Hata formu günlükte kullanıcı adı ve yol
  bulunabileceğini açıkça yazıyor.
- **Kurulum ve kaldırma:** `currentUser` modunda yönetici izni gerekmiyor. Kaldırıcı iki veri klasörünü
  (`$APPDATA\${BUNDLEID}`, `$LOCALAPPDATA\${BUNDLEID}`) yalnızca kutu işaretliyse ve güncelleme modunda değilse
  siliyor (şablon metni). WebView2 veri klasörü (EBWebView) Local kimlik klasöründe, onunla birlikte gidiyor. Kurulum
  sihirbazı GPL metnini (`licenseFile`) gösteriyor.
- **MSRV, bağımlılık tarafı:** en yüksek `rust_version` 1.90 (bkz. KAB-10).
- **`browserGuard`:** F5, Ctrl+R/P/F/U, Alt+← ve fare geri düğmesi kapalı. Yakınlaştırma açık (erişilebilirlik); metin
  kutusunda sağ tık çalışıyor. Ön yüz hata akışı tekrar süzgeçli (günlüğü doldurmuyor).
- **`explorer /select,"…"`:** boşluklu kullanıcı adında da doğru tırnaklanıyor (testli).

## 6. Öncelikli düzeltme sırası

1. **KAB-01:** `connect-src`'ye `'self'` ekle (ya da `?raw` ile içe aktar). `check:scenes`'e programın CSP'siyle "Lisanslar
   paneli metni gösteriyor" adımını ekle. Bu dal birleşmeden önce yapılmalı.
2. **KAB-02:** `ci.yml`'e `npm run check:rules` adımını ekle.
3. **KAB-03:** URL ve yorum ayrımını düzelt, CSP'yi yönerge yönerge izin listesiyle doğrula, `deny.toml`'a ağ crate'i
   yasağı ekle, `check-rules`'a öz-sınama yaz.
4. **KAB-S1:** Private vulnerability reporting'i aç (sahip, tek düğme).
5. **KAB-S2:** `main` için kural seti: PR zorunlu, CI zorunlu, zorla push yasak (sahip).
6. **KAB-04:** `powershell`, `cmd` ve `explorer`'ı `%SystemRoot%`'tan tam yolla çağır. Kutu açılamazsa bir sonraki açılışta
   programın içinde uyarı göster.
7. **KAB-05:** `build()` hatasında `notice_dialog`; panik kancasını günlükten bağımsız kur; taşıma sonucunu günlüğe yaz.
8. **KAB-06:** Kaydetme ve açma pencerelerini Rust'tan aç; yol argümanlarını kaldır.
9. **KAB-07 ve KAB-08:** Taşımada "ya hep ya hiç" ilkesi; kalibrasyon kaydını Local klasöre ve bölünmez yazmaya al.
10. **KAB-09, KAB-10 ve KAB-S3:** WebView2 iletisi ve `minimumWebview2Version`; MSRV işi ya da sözün kaldırılması; kod
    imzalama planı.
