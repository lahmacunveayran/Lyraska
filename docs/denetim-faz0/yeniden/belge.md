# BELGE (belgeler, hata kaydı formu, lisans uyumu, karşılama ekranı): bağımsız denetim raporu (Faz 0)

Denetlenen kod: commit `9ae1b6d` (dal `ccr-e33a525d-dywq26`, sürüm 0.0.61). Önemli not: denetim sırasında
`/home/user/Lyraska` çalışma klasöründe başka bir iş `main`'i birleştiriyordu (çakışmalı dosyalar: `UU CLAUDE.md`,
`UU package.json`...). Bu yüzden bütün okumalar ve deneyler, `9ae1b6d`'de temiz duran bir kopyada yapıldı:
`scratchpad/yeniden/belge-repo`, iş bitince silindi.

## 1. Özet

- **Puan (a) depodaki kod ve yapılandırma: 6/10.** Belgeler çok ayrıntılı ve büyük ölçüde doğru. Depo adı, veri
  klasörleri, sürümler ve sabit link tutarlı. Ama bu daldaki bir değişiklik Ayarlar > Lisanslar metinlerini
  programın kendi CSP'siyle açılamaz hale getiriyor (BEL-01). "Kurallar" kapısı ise hem CI'da çalışmıyor hem de
  "uzak adres" denetimi hiçbir zaman tetiklenmiyor (BEL-02).
- **Puan (b) GitHub ayarları ve satın alınacaklar dahil: 5/10.** SECURITY.md ve hata formu, depoda **kapalı** olan
  "Report a vulnerability" düğmesine yönlendiriyor (BEL-03). Şu anki yayın derleme kanıtı (attestation) taşımıyor.
  Kurulum dosyası imzasız; bu durum belgede dürüstçe yazıyor.
- **Yüksek:** BEL-01. Lisans ve GPL metinleri `fetch()` ile yükleniyor, CSP `connect-src`'de `'self'` yok. Sürüm
  derlemesinde "Metin açılamadı" çıkar; birim testi `fetch`'i taklit ettiği için yeşil kalıyor.
- **Yüksek:** BEL-02. `npm run check:rules` CI'da yok (README "CI ile aynı" diyor). İçindeki "uzak adres" denetimi
  yorum ayıklayıcısı yüzünden `https://` içeren her satırı görmüyor. `.skip`'li test ve uzak `fetch` içeren kopyada
  bütün CI adımları yeşil kaldı.
- **Orta:** BEL-03 gizli güvenlik bildirimi kapalı. BEL-04 `check:docs` mimari ağacı kapısı tek yönlü ve kelime
  tesadüfüyle geçiyor (`eq.ts`, `drop.ts`, `analysis.ts` anlatılmadığı halde geçer).
- **Temiz:** dört dosyada sürüm aynı ve test ediliyor. GPL metni LICENSE ile aynı. Bildirimler güncel (185 paket,
  hepsi metinli). Form şeması geçerli ve UI yolları kodla birebir uyuşuyor. Karşılama gösterisi "Gösteri" diye
  etiketli, hareket azaltmaya uyuyor ve parlama sınırının çok altında (normal 1,07/sn, güvenli 0,55/sn). Koyu zeminde
  kontrast AA'nın üstünde.

## 2. Kapsam ve yöntem

**Okunan dosyalar:** `CLAUDE.md`, `README.md`, `SECURITY.md`, `docs/MIMARI.md`, `docs/LISANSLAR.md`,
`docs/DOGRULAMA.md`, `docs/ROADMAP.md` (Faz 0 ve faz durumları), `.github/ISSUE_TEMPLATE/{config,hata-kaydi}.yml`,
`.github/workflows/ci.yml`, `.github/workflows/test-surumu.yml` (tetikleyici ve attestation kısmı),
`scripts/check-docs.mjs`, `scripts/check-rules.mjs`, `scripts/third-party-notices.mjs`, `scripts/notices/README.md`,
`public/lisanslar/*`, `src/components/{NowPlaying,SpectrumDemo,SpectrumDemo.test,SceneStage,SpectrumView,DotMatrix,SettingsPanel,PlayerScreen}.tsx`,
`src/lib/{scene,flash}.ts`, `src/hooks/useScene.ts`, `src/styles/global.css` (`:root`, karşılama, spektrum, hareket
azaltma), `index.html`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/*`, `src-tauri/deny.toml`,
`src-tauri/build.rs`, `src-tauri/src/diagnostics.rs`, `commands.rs` (sürüm testleri), Tauri 2.12.1 kaynağı
(`manager/mod.rs` `set_csp`, `protocol/tauri.rs`).

**Okunmayanlar (yalıtım):** `docs/DENETIM*.md`, `docs/denetim-2/`, `docs/denetim-faz0/`, `docs/devlog/`,
issue/PR yorumları.

**Çalıştırılan komutlar ve deneyler** (kopyada; `node_modules` sembolik bağ):

- `node scripts/check-{docs,rules,licenses,no-audio,commands}.mjs`, `third-party-notices.mjs --check`: hepsi yeşil.
- `git remote -v`, `curl -sSI` ile sabit link (yeni ve eski hesap adıyla), GitHub REST (kimliksiz, salt okuma):
  `labels`, `releases/tags/test-surumu`, `git/ref/tags/test-surumu`, `private-vulnerability-reporting`,
  `attestations/sha256:…`, `actions/runs?branch=main`.
- Mutasyon sınamaları: `check:docs` (ağaç, veri klasörü, eski hesap linki, GPL kopyası) ve `check:rules` (`.skip`,
  uzak adres, CSP). Ayrıca `eslint`, `tsc`, `vitest` ile CI'ın arayüz adımlarının neyi yakaladığı ölçüldü.
- Karşılama gösterisinin parlama ölçümü: 60 sn, bas sütunu, alt üçte bir ve bütün matris. Geçici bir vitest dosyası
  kopyada çalıştırıldı ve silindi.
- WCAG kontrastları `:root` değişkenlerinden Python ile hesaplandı (sRGB bağıl parlaklık, alfa birleştirme).

**Sınırlar:** makinede tarayıcı yok. CSP davranışı (BEL-01) ve aurora üstündeki metin kontrastı gerçek WebView2'de
görüntülenemedi. Eski hesap adının durumu API'de 403 döndü.

## 3. Bulgular

### BEL-01: Ayarlar > Lisanslar metinleri sürüm derlemesinde açılmaz (CSP `connect-src` aynı kaynağa izin vermiyor)

- Önem: **Yüksek** · Güven: **Yüksek** (CSP kuralı ve Tauri kaynağıyla tartışmasız; WebView2'de çalıştırılarak
  gösterilemedi) · Standart: GPL-3.0 §0 "Appropriate Legal Notices" (lisansın nasıl görüntüleneceği), MIT/BSD/ISC
  bildirim şartı, Tauri 2 CSP modeli, CSP Level 3 `connect-src`
- Yer: `src/components/SettingsPanel.tsx:236`, `src-tauri/tauri.conf.json:25`
- Kanıt:
  - `SettingsPanel.tsx:236`: `fetch(src)` ile `src="/lisanslar/GPL-3.0.txt"` ve `"/lisanslar/UCUNCU-TARAF.txt"`
    yükleniyor (satır 216–217).
  - CSP: `"default-src 'self'; ... connect-src ipc: http://ipc.localhost; ..."`. `connect-src` açıkça verildiği için
    `default-src 'self'`'e geri düşülmez. `fetch()` `connect-src`'ye tabidir. Sayfanın kendi kaynağı
    (Windows'ta `http://tauri.localhost`) listede yok.
  - Tauri CSP'ye yalnızca betik ve stil nonce'ı ekliyor: `tauri-2.12.1/src/manager/mod.rs:53-107` (`set_csp` →
    yalnızca `"script-src"`, `"style-src"`). `connect-src`'ye dokunan kod yok
    (`grep connect-src tauri-2.12.1/src tauri-codegen-2.7.1/src` → boş).
  - Gerileme bu dalda: `git show 03b0aca -- src/components/SettingsPanel.tsx`. Önceki `<iframe src=…>`
    (`frame-src` → `default-src 'self'`, izinli) `fetch()` ile değiştirilmiş. `docs/DOGRULAMA.md:433-437` (F2) iframe
    sürümünde doğrulanmıştı.
  - Kapılar görmüyor: `components.test.tsx:455-458` `vi.stubGlobal("fetch", fetchMock)` (CSP yok).
    `check:scenes` programın CSP'sini uyguluyor ama Ayarlar'ı açmıyor, çekmeceyi gizliyor
    (`check-scenes.mjs:185` `.drawer { visibility: hidden }`).
- Senaryo ve etki: PR #100 birleşip test sürümü çıkınca her kullanıcı Ayarlar > Lisanslar'da iki düğmeye bastığında
  "Metin açılamadı (/lisanslar/…)" görür. 185 paketin telif ve izin metni programda görüntülenemez (dosya ikilide
  gömülü, ama kullanıcıya ulaşmıyor). GPL'in "lisansın nasıl görüntüleneceği" şartı yalnızca kurulum sihirbazındaki
  lisans sayfasına kalır. README, LISANSLAR.md ve CLAUDE.md "Ayarlar → Lisanslar'da gösterilir" diyor.
- Çürütme denemesi:
  - (1) Tauri CSP'yi `'self'` ile genişletiyor mu? Kaynakta hayır.
  - (2) Tauri başka bir yolla `'self'` ekliyor mu? İzolasyon deseni `default-src`'ye ekliyor, `connect-src`'ye değil;
    bu projede izolasyon da kullanılmıyor.
  - (3) Metin başka bir yoldan yükleniyor olabilir mi? `grep "fetch(" src` → tek kullanım burası.
  - (4) `main`'deki CSP farklı mı? `main`'de de aynı `connect-src` var, ama orada iframe kullanılıyor.
  - Gerçek WebView2'de denenemedi; bu yüzden güven "Kanıtlandı" değil.
- Öneri: `tauri.conf.json` CSP'sinde `connect-src 'self' ipc: http://ipc.localhost` (`check-rules.mjs` `'self'`'e
  izin veriyor), ya da iframe'e geri dönmek. Gerilemenin yinelenmemesi için `check:scenes`'e bir adım: programın
  CSP'siyle Ayarlar > Lisanslar'ı açıp iki metnin ilk satırını beklesin. Alternatif bir birim testi: `fetch` ile
  açılan bir yol varsa CSP'nin `connect-src`'sinde `'self'` bulunmalı.

### BEL-02: `check:rules` CI'da çalışmıyor; "uzak adres" denetimi hiç tetiklenmiyor

- Önem: **Yüksek** · Güven: **Kanıtlandı** · Standart: ISO/IEC 25010 (bakım kolaylığı ve test edilebilirlik),
  OpenSSF Scorecard "CI-Tests" ruhu, proje kuralı "Her kural ya bir testle ya da CI'daki bir adımla denetlenir"
  (`docs/MIMARI.md:307`)
- Yer: `.github/workflows/ci.yml:54-55`, `README.md:89-94`, `scripts/check-rules.mjs:76`
- Kanıt:
  - CI adımının adı "Belgeler **ve kurallar** kodla uyumlu mu" ama yalnızca `npm run check:docs` çalışıyor.
    `git log -S"check:rules" -- .github/workflows/ci.yml` boş: bu adım hiçbir zaman CI'da olmamış. README:89
    "Checks (the same ones CI runs)" diyerek `npm run check:rules`'u listeliyor.
  - Mutasyon (kopyada): `src/lib/format.test.ts`'te bir `it(` → `it.skip(`, ayrıca `src/lib/format.ts`'e
    `fetch("https://example.com/t")` eklendi. Sonuç: `eslint=0`, `tsc=0`, vitest "17 passed | 1 skipped",
    `check:docs=0`, yani CI'ın arayüz adımlarının hepsi yeşil. Yalnızca `check:rules` kırmızı, o da **yalnızca
    `.skip` için**; `https://` satırını görmedi.
  - Kök neden (`check-rules.mjs:76`): `const code = line.replace(/\/\/.*$/, "")…`. Bu ifade `https://` içindeki
    `//`'den sonrasını "yorum" diye siliyor; ardından `/https?:\/\//` hiçbir zaman eşleşemiyor. İkinci deney:
    `index.html`'e `<script src="https://cdn.example.com/x.js">`, `global.css`'e
    `@import url("https://fonts.example.com/a.css")`, koda `fetch("http://example.com/t")` eklendi →
    "Kural denetimi tamam … uzak adres yok", çıkış 0.
  - CSP parçası çalışıyor: `connect-src`'ye `https://telemetry.example.com` eklenince kırmızı oldu. Ama `ws:`/`wss:`
    ya da şemasız ana bilgisayar adı yakalanmaz.
- Senaryo ve etki: bir oturum, kırmızı bir testi geçirmek için `it.skip` ya da Rust'ta gerekçesiz `#[ignore]`
  ekliyor. CI yeşil kalıyor ve CLAUDE.md'nin "Testler atlanmaz, devre dışı bırakılmaz" kuralı sessizce aşınıyor.
  `.only` vitest'in CI'daki `allowOnly=false` varsayılanıyla yakalanır, `.skip` ve `#[ignore]` yakalanmaz.
  `unsafe`'in yalnızca WASAPI'de kalması ve izinlerin en dar listede kalması da CI'da denetlenmiyor. "Program
  internete bağlanmaz" sözünü fiilen CSP koruyor (çalışma anında); kaynak kodu denetimi ise ölü.
- Çürütme denemesi: kuralları denetleyen başka bir yer arandı. `grep -rn "check-rules\|check:rules"` yalnızca
  README ve package.json'u buluyor; vitest testi, ESLint kuralı ya da git kancası yok (`eslint.config.js`'de
  test eklentisi yok, `.husky` yok). `origin/main`'de betik hiç yok (yeni). Bulgu ayakta.
- Öneri:
  - `ci.yml` arayüz işine `- run: npm run check:rules` ekleyin.
  - Satır 76'da yorumu yalnızca satır başında ya da boşluktan sonra gelen `//` olarak ayıklayın, ör.
    `line.replace(/(^|\s)\/\/.*$/, "$1")`, ve `wss?:\/\/` de arayın.
  - Kapının kendisi için `scripts/lib/rules.test.mjs`: bilinen kötü örneklerin (https, `.skip`, `#[ignore]`) kırmızı
    olduğunu sınayın. Mutasyon sınaması kalıcı hale gelir.

### BEL-03: SECURITY.md ve hata formu kapalı bir bildirme yoluna yönlendiriyor

- Önem: **Orta** · Güven: **Kanıtlandı** · Standart: OpenSSF Scorecard "Security-Policy", GitHub Docs "Privately
  reporting a security vulnerability" · **Proje sahibinin ayarına bağlı**
- Yer: `SECURITY.md:10-11`, `SECURITY.md:29-30`, `.github/ISSUE_TEMPLATE/config.yml:3-5`
- Kanıt:
  - `curl -sS https://api.github.com/repos/lahmacunveayran/Lyraska/private-vulnerability-reporting` →
    `{"enabled": false}`; `gh api` ile de aynı sonuç.
  - SECURITY.md "**Security** sekmesindeki **Report a vulnerability** düğmesiyle" diyor. Form bağlantısı
    `…/security/advisories/new`. Aynı dosyada `blank_issues_enabled: true`.
- Senaryo ve etki: bozuk bir FLAC'ın ayrıştırıcıyı çökerttiğini bulan biri SECURITY.md'yi izliyor, düğmeyi
  bulamıyor. Elinde kalan tek yol herkese açık issue: açık, düzeltme yayımlanmadan herkesçe görünür hale gelir.
  Kullanıcı kitlesi küçük olduğu için önem Orta.
- Öneri: GitHub'da depo **Settings → Code security (Advanced Security) → Private vulnerability reporting →
  Enable**. Yedek olarak SECURITY.md'ye ikinci bir gizli yol (ör. proje e-postası) yazılabilir.

### BEL-04: `check:docs`'un mimari ağacı denetimi tek yönlü ve kelime tesadüfüyle geçiyor

- Önem: **Orta** · Güven: **Kanıtlandı** · Standart: ISO/IEC 25010 bakım kolaylığı (analiz edilebilirlik)
- Yer: `scripts/check-docs.mjs:44-61`
- Kanıt:
  - Ad, CLAUDE.md'nin **herhangi bir yerinde** `\bad\b` olarak geçerse dosya "ağaçta" sayılıyor.
    `src/lib/eq.ts`, `src/lib/drop.ts`, `src/lib/analysis.ts` lib açıklamasında yok
    (`awk '/├── lib\//,/└── styles\//' CLAUDE.md | grep -wE "eq|drop|analysis"` → boş). Yine de geçiyorlar, çünkü
    `audio/eq.rs`, "drop sayacı" ve `analysis/` başka satırlarda geçiyor.
  - Mutasyon: `src/lib/beat.ts` eklendi → "Belge denetimi tamam: 113 dosya" (CLAUDE.md'de "beat" kelimesi var).
    `src/lib/zzzqux.ts` eklendi → kırmızı (yalnızca hiç geçmeyen ad yakalanıyor).
  - Ters yön yok: `git rm src/hooks/useCover.ts src-tauri/src/file_manager.rs` sonrası yeşil ("110 dosya"); ağaçta
    olmayan dosyayı anlatan satır kalıyor.
  - `src/components/`, `scripts/`, `docs/` hiç denetlenmiyor: `Zzzqux.tsx` ve `check-zzz.mjs` eklenince yeşil.
    Bugün `docs/DENETIM-FAZ0.md`, `docs/denetim-faz0/`, `docs/arastirma/` ağaçta yok. Scripts açıklaması
    `check-docs`/`check-rules`'u saymıyor.
  - Veri klasörü denetimi `.github/ISSUE_TEMPLATE`'i kapsamıyor: `hata-kaydi.yml:101`'deki klasör adı
    `lahmacunveayran.lyraska` yapılınca yeşil kaldı. Kullanıcıya en çok giden yol tam da bu dosyada.
- Senaryo ve etki: CLAUDE.md her yapay zekâ oturumunun haritası. Kapı "112 dosya CLAUDE.md'de" diye güven veriyor,
  ama yeni bir yardımcı ya da bileşen haritaya girmeden kalabiliyor. Silinen dosyanın satırı ise sonraki oturumu
  var olmayan bir dosyaya yönlendirebiliyor.
- Öneri:
  - Eşleşmeyi `CLAUDE.md`'nin kod bloğuyla ve ilgili klasör bölümüyle sınırlayın (lib dosyaları `├── lib/` ile
    `└── styles/` arasında aranmalı).
  - Ters yönü ekleyin: ağaçta `*.rs`/`use*`/lib adı geçip diskte olmayan → kırmızı.
  - `walk("src/components")` ile `docs/*.md` ve `scripts/*.mjs` en azından ad düzeyinde denetlensin.
  - Veri klasörü taramasına `.github/ISSUE_TEMPLATE/*.yml`'i ekleyin.

### BEL-05: CLAUDE.md komut tablosu ve "push'tan önce" listesi CI kapılarının bir kısmını saymıyor

- Önem: Düşük · Güven: Kesin · Standart: ISO/IEC 25010 (öğrenilebilirlik / bakım)
- Yer: `CLAUDE.md` "Komutlar" tablosu ve "Test kuralları" son maddesi
- Kanıt: package.json'da `check:docs` ve `check:rules` var, CI `check:docs`'u, `check:audio -- --history`'yi ve
  `npm audit --audit-level=high`'ı çalıştırıyor. CLAUDE.md tablosunda bunların hiçbiri yok. "Push'tan önce: biçim,
  lint, tür denetimi, testler, lisans denetimi" listesi de komut sözleşmesini, belgeleri ve bildirimleri saymıyor.
  "CI iki denetim yapar" (lisans) cümlesi `check:notices`'i dışarıda bırakıyor.
- Senaryo ve etki: bir oturum yeni bir hook ekliyor, CLAUDE.md'yi güncellemeden push ediyor ve CI kırmızı oluyor.
  Bir tur kaybı. README:91-99 doğru listeyi zaten veriyor.
- Öneri: CLAUDE.md'ye "Belgeler ve kurallar: `npm run check:docs`, `npm run check:rules`" satırını ekleyin.
  "Push'tan önce" maddesini README:91-99'daki listeye bağlayın.

### BEL-06: DOGRULAMA.md hata günlüğünün kişisel bilgi içermediğini söylüyor; günlükte tam yol (Windows kullanıcı adı) var

- Önem: Düşük · Güven: Kesin · Standart: OWASP ASVS V7/V8 (günlükte hassas veri), proje sözü "telemetri yok"
- Yer: `docs/DOGRULAMA.md:21-22`; karşıtı `.github/ISSUE_TEMPLATE/hata-kaydi.yml:102-104`
- Kanıt:
  - DOGRULAMA: "`lyraska.log` dosyasını gönderin. Kişisel bilgi içermez (yalnızca program olayları ve dosya
    adları)."
  - Kod tam yolu yazıyor: `src-tauri/src/analysis/background.rs:83` (`crashed.0.display()`), `:97`
    (`path.display()`), `library/db.rs:92,98` (`moved.display()`). Yollar `C:\Users\<ad>\Music\…` biçimindedir.
  - Hata formu bunu doğru söylüyor: "klasör yolu (Windows kullanıcı adınız dahil) geçebilir".
- Senaryo ve etki: proje sahibi ya da bir test kullanıcısı DOGRULAMA'ya güvenip günlüğü herkese açık bir issue'ya
  ekliyor; Windows kullanıcı adı ve klasör yapısı yayımlanıyor. Etkisi küçük, ama iki belge birbiriyle çelişiyor.
- Öneri: DOGRULAMA.md:22'yi formdaki cümleyle değiştirin ("dosya adları ve klasör yolları, Windows kullanıcı adınız
  dahil, geçebilir; isterseniz Not Defteri ile açıp bakın").

### BEL-07: Ayarlar > Klavye listesi eski: "1 – 5 Sahne seç"; PageDown/PageUp yok

- Önem: Düşük · Güven: Kesin · Standart: WCAG 2.2 3.3.5 (Yardım, AAA, rehber niteliğinde), belge-kod tutarlılığı
- Yer: `src/components/SettingsPanel.tsx:21-27`
- Kanıt: `["1 – 5", "Sahne seç"]`. Oysa `src/lib/scene.ts:19-28` ve `src/hooks/useScene.ts:5-6` 1–9 ve 0 tuşlarıyla
  ilk on sahneyi, PageDown/PageUp ile hepsini seçiyor. Programdaki hata metni de doğru aralığı söylüyor
  (`PlayerScreen.tsx:281` "(1–9, 0)"). CLAUDE.md ve MIMARI.md doğru.
- Senaryo ve etki: klavye kullanıcısı galeri sahnelerine tuşla gidilebildiğini öğrenemiyor.
- Öneri: `["1 – 9, 0", "Sahne seç"]` ve `["PageDown / PageUp", "Sıradaki / önceki sahne"]`.

### BEL-08: README, ROADMAP ve betik yorumlarında küçük güncellik kaymaları

- Önem: Düşük · Güven: Kesin · Standart: belge-kod tutarlılığı
- Yer ve kanıt:
  - `README.md:7` "drives five scenes", `README.md:24` "scenes (three of them WebGL2)". Bugün 5 klasik + 10 galeri
    sahnesi var (`src/lib/scene.ts:6-12`, `shaderScene.ts:35-89`); galeri sahnelerinin hepsi WebGL2.
  - `README.md:89` "the same ones CI runs" `check:rules`'u içeriyor (bkz. BEL-02).
  - `docs/ROADMAP.md:19` Faz 0 "CI: her push ve PR'da". `ci.yml:11-12`'de push yalnızca `main`'de (dallara push'ta
    CI yok, yalnızca PR'da).
  - `scripts/third-party-notices.mjs:2` "Ayarlar > Program'dan açılır"; doğrusu "Ayarlar > Lisanslar".
  - ROADMAP:18 "Karşılama ekranı (eski araba teybi ekranı havasında)". Bugün ilk açılışta gece göğü açılıyor
    (`scene.ts:39` `DEFAULT_SCENE = "sky"`); teyp havasındaki VFD gösterisi yalnızca Spektrum seçilince görünür.
- Öneri: README'de "15 scenes (5 classic, 10 in the gallery; 12 WebGL2)". ROADMAP'e "(push: main; dallar PR
  üzerinden)" notu ve karşılamanın bugünkü hali. Betik yorumunu düzeltin.

### BEL-09: Programdaki yasal bildirim, "bu lisansla dağıtabilirsiniz" bilgisini açıkça vermiyor

- Önem: Düşük · Güven: Kesin · Standart: GPL-3.0 §0 "Appropriate Legal Notices": telif bildirimi, garanti
  olmadığı, **lisans sahiplerinin eseri bu lisansla aktarabileceği** ve lisansın nasıl görüntüleneceği
- Yer: `src/components/SettingsPanel.tsx:208-212`
- Kanıt: metin "özgür yazılımdır … ile dağıtılır ve hiçbir garanti verilmez. © 2026 Lyraska katkıcıları" diyor.
  Telif ve garanti var; kullanıcının yeniden dağıtma hakkı açıkça yazmıyor. "Nasıl görüntülenir" kısmı BEL-01
  yüzünden sürüm derlemesinde çalışmıyor.
- Öneri: "Bu programı GPL-3.0'ın koşullarıyla kopyalayabilir, değiştirebilir ve dağıtabilirsiniz; lisans metni
  aşağıda." cümlesini ekleyin.

### BEL-10: Karşılama metni yalnızca sürükle-bırakı anlatıyor

- Önem: Düşük · Güven: Kesin · Standart: WCAG 2.2 2.5.7 Sürükleme hareketleri (AA; alternatif var ama
  söylenmiyor), 3.3.2 Etiketler/yönergeler
- Yer: `src/components/NowPlaying.tsx:76`
- Kanıt: "Müzik klasörünüzü ya da şarkılarınızı pencereye sürükleyin." Sürüklemesiz yollar var ama yazmıyor:
  Ctrl+O (`usePlayer.ts:284`), Kütüphane > Şarkı ekle.
- Senaryo ve etki: fareyle sürükleyemeyen (motor engelli, klavye ya da dokunmatik kullanan) ilk kez açan biri ne
  yapacağını ekrandan öğrenemiyor.
- Öneri: "… pencereye sürükleyin ya da Kütüphane'den ekleyin (Ctrl+O)."

### BEL-11: Üçüncü taraf bildirimlerinde 37 paketin telif satırı yok

- Önem: Düşük · Güven: Kanıtlandı · Standart: MIT/BSD "the above copyright notice", SPDX
- Yer: `public/lisanslar/UCUNCU-TARAF.txt`
- Kanıt: 185 paketin hepsinde lisans metni var, `BİLİNMİYOR` yok. Ama 37 pakette telif ya da yazar satırı yok
  (Python sayımı): `anyhow`, `serde`, `itoa`, `once_cell`, `rtrb`, `semver`… Bunların lisans dosyalarında telif
  satırı bulunmuyor.
- Öneri: telif satırı bulunamazsa `Cargo.toml` `authors` alanını ("Yazarlar: …") yazdırın. Masrafı küçük,
  bildirimi tamamlar.

### BEL-12: README/SECURITY'deki `gh attestation verify` bugünkü yayında çalışmaz (bilgi)

- Önem: Bilgi · Güven: Kanıtlandı · Standart: SLSA v1.0 Build L2 (kanıt) · **Proje sahibinin ayarına ve
  birleştirmeye bağlı**
- Kanıt: yayın 0.0.58 (`f00ce64`, etiket aynı commit'te). Varlığın özeti için
  `api.github.com/repos/…/attestations/sha256:dec823db…` → "Not Found". `origin/main`'in `test-surumu.yml`'ında
  `attest` yok; adım ve belge yalnızca bu dalda.
- Etki: PR birleşip ilk yeşil `main` yayını çıkana kadar belgedeki komut başarısız olur. Sonrasında kendiliğinden
  düzelir. Yeni yayından sonra bir kez denenmeli.

## 4. Olası riskler (kanıtı yetmeyenler)

- **Karşılama metninin aurora üstündeki kontrastı.**
  - `.now__over` 12 px büyük harf `--ink-3`. Koyu zeminde 5,8–6,1:1 (AA) ölçüldü.
  - Ama zeminde %25 `--aurora` (#46f0a6) karışırsa 3,87:1, %40 karışırsa 2,86:1. `--ink-2` byline %40'ta 3,69:1.
  - Gökteki aurora ile alt kenar karartmasının (`.stage__shade`) metnin altında nasıl birleştiği tarayıcısız
    görülemedi. Bir ekran görüntüsünde metnin altındaki piksellerden ölçülmeli.
- **"Gösteri" etiketi küçük pencerede.** `.spectrum-scene__demo` `top: calc(52vh + 8px)`; pencere en az 560 px
  yüksek. 720×560'ta etiket ≈299 px'te, alt katman (başlık, şerit, düğmeler) yukarı doğru büyüyor. Çakışıp etiketin
  okunmaz kalması olası; görülemedi.
- **Eski hesap adı.** Eski linkler 301 ile yeni depoya gidiyor. GitHub'da hesap adı değişip eski ad boşa çıkarsa
  başkası alabilir ve yönlendirme biter. Eski sürümlerin Ayarlar metnindeki `github.com/gozlemesevdalisi/Lyraska`
  ve devlog bağlantıları o kişiye gider. Hesabın durumu API'de 403 döndüğü için doğrulanamadı.
- **Paketlenen ama bildirimde olmayanlar.** NSIS'e gömülen WebView2 önyükleyicisi (Microsoft'un yeniden dağıtım
  şartları), Rust standart kütüphanesi (MIT/Apache) ve MSVC çalışma zamanı ne LISANSLAR.md'de ne UCUNCU-TARAF'ta.
  Statik bağlama ayrıntısı doğrulanmadı.
- **WCAG 2.2.2 Duraklat/Durdur.** Karşılamadaki gök sürekli hareket ediyor. Programda durdurma düğmesi yok;
  yalnızca işletim sisteminin "animasyonları azalt" ayarı var. Görselleştirici için "temel işlev" sayılabilir,
  tartışmalı.

## 5. Temiz bulunanlar

- **Sürüm tutarlılığı:** `package.json`, `package-lock.json` (iki yer), `src-tauri/Cargo.toml`, `Cargo.lock`
  (`lyraska`) hepsi 0.0.61. `tauri.conf.json` sürümü `../package.json`'dan alıyor. Rust testi
  `surum_package_json_ile_ayni` (`commands.rs:861`) farkı yakalar. Derleme kodu `build.rs` ile
  `LYRASKA_COMMIT`'ten geliyor.
- **Depo adı ve sabit link:** `git remote` = `lahmacunveayran/Lyraska`. Canlı belgelerin hepsi, ayarlar metni, form
  ve iş akışı aynı adı kullanıyor.
  - `curl -sSI …/releases/download/test-surumu/Lyraska-Kurulum.exe` → 302 → varlık (5,8 MB). Yayında SHA-256 özeti
    var, etiket yayının commit'inde.
  - Eski hesap adıyla link 301 ile yönleniyor.
  - Program kimliği `io.github.gozlemesevdalisi.lyraska` bilerek korunuyor ve bu belgede açıklanmış.
- **`check:docs`'un çalışan kısımları (mutasyonla kırmızı):** README'deki yanlış veri klasörü, eski hesap adına
  link, `public/lisanslar/GPL-3.0.txt` ≠ `LICENSE`.
- **Lisans uyumu (kod tarafı):**
  - GPL metni `LICENSE` ile birebir aynı. Inter OFL kopyası paketteki `LICENSE` ile özdeş.
  - `third-party-notices.mjs --check` "güncel". 185 paket (179 Rust + 6 npm), her biri metinli. Lisans dağılımı
    izin listesinde: MPL-2.0 (symphonia) GPL-3 ile uyumlu, kaynak deposu yazılı.
  - SPDX `GPL-3.0-only` package.json, Cargo.toml ve NSIS'te; kurulum sihirbazı `licenseFile` ile GPL'i gösteriyor.
  - `deny.toml` izin listesi ile CLAUDE.md ve LISANSLAR.md uyumlu.
  - Yeni dalda kaldırılan `rfd` doğrudan bağımlılığı bildirimleri bozmuyor: diyalog eklentisi üzerinden kalıyor,
    `--check` yeşil.
- **Belgelerdeki yollar ve linkler:** CLAUDE.md, README, SECURITY, MIMARI, DOGRULAMA, ISARETLEME, LISANSLAR,
  SARKI-HARITASI ve notices/README'deki bütün göreli linkler ve `src/…`, `docs/…` yolları diskte var (betikle
  tarandı; tek "eksik" devlog şablonu). CLAUDE.md ağacında anlatılan her `.rs`, hook ve lib dosyası mevcut.
- **Hata kaydı formu:**
  - YAML geçerli, `id`'ler tekil, zorunlu alanlar makul. `labels: ["hata"]` depoda var (API).
  - Anlatılan yollar kodla aynı: dişli sağ üst `topbar__actions` (`PlayerScreen.tsx:340`), "Program" başlığı,
    "Hata günlüğü" düğmesi, "Sürüm … · …" metni (`SettingsPanel.tsx:184-201`). Günlük klasörü program kimliğiyle
    aynı.
  - Gizlilik uyarısı doğru. Işık hassasiyeti kutusu ve "Açılmıyor" seçeneği iyi düşünülmüş.
- **Karşılama ekranı:**
  - `lang="tr"`: büyük harf dönüşümü "HOŞ GELDİNİZ", "GÖSTERİ" doğru.
  - Gösteri spektrumu yalnızca şarkı yokken ve "Gösteri · şarkı açınca gerçek spektrum" etiketiyle çıkıyor
    (`SceneStage.tsx:63-71`). Diğer sahneler boşta sahte veri üretmiyor (VU, sürüş ve spektrum gerçek
    `VisualFrame`'den).
  - Hareket azaltma: SpectrumDemo donuyor, gök ve kayan yazı uyuyor, CSS `.stage > *`, çekmece ve geçişler
    kapatılıyor (`global.css:3716-3730`).
  - Parlama (60 sn, sayaç `flash.ts`): normal mod bas sütunu 1,07/sn, alt üçte bir 0,93/sn, bütün matris 0,08/sn;
    güvenli mod 0,55/0,6/0,18. Hepsi WCAG 2.3.1 sınırının (3/sn) ve güvenli modun 1/sn sözünün altında.
    `SpectrumDemo.test.ts` bunu sürekli denetliyor.
  - Kontrast: `--ink` 19:1, `--ink-2` 8,8–9,8:1, `--ink-3` 5,8–6,1:1 (CSS yorumundaki "≈5,9:1" doğru), `--aurora`
    13,9:1, hata kutusu 10,7:1. Odak göstergeleri (`:focus-visible`) düğmelerde ve sekmelerde var. Hata
    `role="alert"`.
  - Şarkı yokken arayüz gizlenmiyor (`useIdle` yalnızca çalarken).
  - Türkçe metinler düzgün ve sade.
- **Diğer kapılar:** `check:commands` (55 komut eşleşiyor), `check:audio` (416 dosya), `check:licenses` (274
  paket) yeşil. `check:rules`'un CSP ve izin parçaları mutasyonla kırmızı oluyor (ama CI'da çalışmıyor).

## 6. Öncelikli düzeltme sırası

1. **BEL-01:** CSP'ye `connect-src 'self'` ekleyin (ya da iframe'e dönün). `check:scenes`'e programın CSP'siyle
   "Ayarlar > Lisanslar açılır" adımını koyun. PR #100 birleşmeden yapılmalı.
2. **BEL-02:** `ci.yml`'e `npm run check:rules` ekleyin. `check-rules.mjs:76` yorum ayıklayıcısını düzeltin, `ws(s)`
   ekleyin. Kapının kendi testini (`rules.test.mjs`) yazın.
3. **BEL-03 (proje sahibi):** GitHub > Settings > Code security > Private vulnerability reporting > **Enable**.
4. **BEL-04:** `check:docs`'u iki yönlü ve bölüm sınırlı yapın; bileşenleri, betikleri, `docs/`'u ve hata formunun
   veri klasörünü kapsatın.
5. **BEL-06:** DOGRULAMA.md'deki "kişisel bilgi içermez" cümlesini düzeltin.
6. **BEL-07:** Ayarlar'daki kısayol listesini güncelleyin (1–9, 0; PageDown/PageUp).
7. **BEL-05 ve BEL-08:** CLAUDE.md komut tablosu ve "push'tan önce" listesi; README sahne sayısı ve CI eşitliği;
   ROADMAP "her push"; betik yorumu.
8. **BEL-09 ve BEL-10:** GPL "dağıtabilirsiniz" cümlesi; karşılamada Ctrl+O / Kütüphane yolu.
9. **BEL-11:** telif satırı olmayan crate'ler için `authors` yazdırın.
10. **BEL-12:** birleşmeden sonraki ilk yayında `gh attestation verify`'ı bir kez çalıştırıp README/SECURITY'yi
    doğrulayın.
