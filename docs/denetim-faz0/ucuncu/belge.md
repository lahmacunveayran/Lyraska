# Belgeler ve karşılama ekranı: bağımsız denetim raporu (Faz 0)

Denetlenen: `kod/` kopyası, commit `4d09cb9` (`main`, sürüm 0.0.62). Bulgu öneki: **BEL**.

## 1. Özet

- **Puan (a), depodaki kod ve yapılandırma: 7/10.** Belgeler alışılmadık ölçüde ayrıntılı ve çoğunlukla kodla
  birebir uyuşuyor: sahne sayısı, veri klasörleri, sürüm/derleme kodu, hata günlüğü yolu, Ayarlar'daki yasal
  bildirimler ve hata formunun yönlendirmeleri doğru. Ancak belge kapısı (`check:docs`) en kritik iddiayı, yani sahibin
  tek indirme linkini, hiç denetlemiyor. Karşılama gösterisinin "güvenli modda ≤ 1 nabız" testi de nabız hızını
  ölçmüyor.
- **Puan (b), GitHub ayarları ve satın alınacaklar dahil: 6/10.** SECURITY.md ve hata formu, depoda "özel güvenlik
  bildirimi" (Private vulnerability reporting) açık olursa çalışır. CLAUDE.md'nin "main'e doğrudan push yok" kuralı
  dal korumasına bağlı. İkisi de depodan doğrulanamadı (GitHub sayfaları bu oturuma 403 döndü). Kod imzası yok, belgeler
  bunu dürüstçe yazıyor.
- En önemli bulgu (BEL-01, Orta): sabit indirme linki `CLAUDE.md`, `README.md`, `SECURITY.md`, `DOGRULAMA.md`
  ve iş akışında elle tekrar ediliyor. Mutasyonla gösterildi: link belgelerde bozulsa ya da iş akışındaki dosya adı
  değişse de `check:docs` yeşil kalıyor. Hata formundaki veri klasörü yolu da denetim dışında.
- BEL-02 (Orta): karşılama gösterisinin parlama testi, güvenli modda nabız 0,83/sn'den 3,1/sn'ye çıkarılınca da yeşil
  kalıyor. Bugünkü kod kurala uyuyor, ama kuralı test korumuyor.
- BEL-03 (Düşük): README "Local klasörünü silmek güvenli" diyor. Oysa kullanıcının adıyla kaydettiği sahne hazır
  ayarları (WebView2 deposu) o klasörde durur ve silinince geri gelmez.
- Sahibe yol gösteren belgelerde birkaç yanlış yer var (BEL-04): `DOGRULAMA.md` B16 ve D11 sahibi Ayarlar'da
  olmayan öğelere gönderiyor, `ISARETLEME.md` var olmayan bir "alt panel"den söz ediyor.
- Yasal bildirimler sağlam (GPL metni LICENSE'ın kendisi, kaynak yeri, garanti reddi, 189 paketin bildirimi). Eksik
  olan, Rust'a uyarlanan `milkdrop-preset-utils` (MIT) bildiriminin programın içindeki dosyada bulunmaması (BEL-05).

## 2. Kapsam ve yöntem

**Okunan dosyalar:** `CLAUDE.md`, `README.md`, `SECURITY.md`, `docs/ROADMAP.md`, `docs/MIMARI.md`,
`docs/DOGRULAMA.md`, `docs/LISANSLAR.md`, `docs/ISARETLEME.md` (yönlendirmeler), `.github/ISSUE_TEMPLATE/*`,
`.github/workflows/{ci,test-surumu}.yml`, `guvenlik-taramasi.yml` ve `dependabot.yml` (başları), `public/lisanslar/*`
(UCUNCU-TARAF.txt'nin başı ve JS bölümü), `src/components/{NowPlaying,SpectrumDemo,SpectrumDemo.test,SettingsPanel,
SceneStage,PlayerScreen(üst çubuk, paneller),icons}.tsx`, `src/lib/{scene,flash}.ts`, `src/styles/global.css`
(renk değişkenleri ve ilgili sınıflar), `src-tauri/{tauri.conf.json,Cargo.toml,build.rs,deny.toml}`,
`src-tauri/src/{commands.rs (AppInfo),data_dirs.rs,diagnostics.rs,lib.rs (veri klasörleri),settings.rs (alanlar)}`,
`audio/decode.rs` (uzantılar), `analysis/cache.rs` (VERSIONS), `scripts/{check-docs,check-rules,check-licenses}.mjs`,
Tauri 2.12.1 kaynağı (`manager/webview.rs`, WebView2 veri klasörü).

**Okunmayanlar (yalıtım):** `docs/DENETIM*.md`, `docs/denetim-2/`, `docs/denetim-faz0/`, `docs/devlog/`. Bu yüzden
CLAUDE.md'nin devir notu kuralının uygulanıp uygulanmadığı denetlenmedi.

**Çalıştırılan komutlar ve deneyler:** kendi kopyamda (`is-belge/repo`, `node_modules` sembolik bağ):

- `node scripts/check-docs.mjs`, `check-rules.mjs`, `check-commands.mjs`, `check-licenses.mjs`: hepsi yeşil.
- `check:docs` için 7 mutasyon (BEL-01).
- `npx vitest run src/components/SpectrumDemo.test.ts src/components/components.test.tsx`: 96 test geçti.
- `SpectrumDemo.tsx` için 3 mutasyon, ardından ölçüm testi (BEL-02).
- `curl` ile bu deponun herkese açık sayfaları: `releases/tag/test-surumu` 200 döndü (0.0.61 · 33ce52a; 0.0.62
  birleştirmesi 7 dk önceydi, derleme sürüyordu). `/security` ve `/labels` bu oturumun ağ geçidinden 403 döndü.

**Sınırlar:** Rust derlemesi yok. Windows'ta görsel deneme yok. GitHub ayarları görülemedi.

## 3. Bulgular

### BEL-01: Belge kapısı sahibin tek indirme linkini ve hata formundaki klasör yolunu denetlemiyor

- Önem: Orta · Güven: Kanıtlandı · Standart: ISO/IEC 25010 bakım kolaylığı (değiştirilebilirlik, test edilebilirlik); BRIEF yöntem 5
- Yer: `scripts/check-docs.mjs:22-32` (LIVE_DOCS'ta `.github/ISSUE_TEMPLATE` yok), `:117-128` (yalnızca klasör adı),
  `:130-150` (yalnızca eski hesap adı); link `CLAUDE.md:18`, `README.md:42`, `SECURITY.md:19`, `docs/DOGRULAMA.md:12`,
  `.github/workflows/test-surumu.yml:37-38`
- Kanıt: kopyada mutasyonlar (her biri ayrı, sonra geri alındı):
  ```
  M1 CLAUDE.md ağacından useIdle silindi                        → exit=1 (doğru: kırmızı)
  M2 src-tauri/src/eq.rs eklendi (kökte, belgelenmemiş)         → exit=0 (audio/eq.rs'nin adı yetiyor)
  M3 test-surumu.yml ASSET_NAME: Lyraska-Setup.exe              → exit=0
  M4 ci.yml'de check:scenes adımı "echo atlandi # npm run check:scenes" → exit=0
  M5 hata-kaydi.yml'de %LOCALAPPDATA%\io.github.lahmacunveayran.lyraska → exit=0
  M6 CLAUDE.md+README'de .../download/test-surum/... (yanlış etiket) → exit=0
  M7 docs/YENI-BELGE.md, scripts/check-yeni.mjs, src/styles/yeni.css, src/Yeni.tsx → exit=0
  ```
- Senaryo ve etki: bir oturum iş akışında yayın adını ya da etiketini değiştirir (M3), ya da belgede bir harf kaçar
  (M6). Sahip, CLAUDE.md'nin "Test için sahibine her zaman sabit indirme linki verilir" kuralıyla 404 veren bir link
  alır. Hata formundaki klasör yolu yanlışsa (M5) program açılmayan kullanıcı günlüğü bulamaz. M4: bir `check:*`
  adımı yorumla etkisizleştirilse de "her check:* CI'da çalışır" denetimi geçer.
- Çürütme denemesi: başka bir kapı linki denetliyor mu diye `scripts/` ve iş akışları arandı. `RELEASE_TAG` ya da
  `ASSET_NAME`'i belgelerle karşılaştıran bir yer yok. Release notu linki iş akışının kendi değişkenlerinden ürettiği
  için orada tutarlı. Belgelerdeki kopyalar ise denetlenmiyor. Bugün bütün kopyalar doğru, yani risk ileriye dönük:
  önem bu yüzden Yüksek değil, Orta.
- Öneri: `check-docs.mjs`'e üç kural eklenmeli. (1) `test-surumu.yml`'den `RELEASE_TAG` ve `ASSET_NAME` okunsun, LIVE_DOCS ve
  `.github/ISSUE_TEMPLATE/*`'teki her `releases/download/…` linki `https://github.com/lahmacunveayran/Lyraska/releases/download/${tag}/${asset}`
  olsun. (2) Veri klasörü taramasına `.github/ISSUE_TEMPLATE/*.yml` eklensin. (3) `check:*` taramasında ci.yml'nin
  yorum satırları atılsın ve eşleşme yalnızca `run:` satırında aransın.

### BEL-02: Karşılama gösterisinin "güvenli modda ≤ 1 nabız" testi nabız hızını görmüyor

- Önem: Orta · Güven: Kanıtlandı · Standart: WCAG 2.2 SC 2.3.1 (proje kuralı bundan sıkı), BRIEF yöntem 5
- Yer: `src/components/SpectrumDemo.test.ts:27-38`, `src/components/SpectrumDemo.tsx:90` (`s.frame % (safe ? 30 : 12)`), kural `CLAUDE.md` "Görsel güvenlik"
- Kanıt: `(safe ? 30 : 12)` → `(safe ? 8 : 4)` yapıldı. Güvenli modda vuruş 0,32 sn'de bir (3,1/sn), normalde
  6,25/sn oldu. `npx vitest run src/components/SpectrumDemo.test.ts` sonucu: `Tests 3 passed (3)`. Ayrı mutasyonlar
  (`safe ? 8`, `: 4`, `kickSize 0.9`) de yeşil kaldı. Ölçüm testi `countFlashes` değerlerini verdi:
  ```
  özgün:    safe=false whole=0.1/sn bass=1.1/sn   safe=true whole=0.1/sn bass=0.5/sn
  mutasyon: safe=false whole=0/sn   bass=0.7/sn   safe=true whole=0/sn   bass=0.55/sn
  ```
  Bas sütunu vuruşlar arasında yavaş düştüğü için (düşüş 0,12, tepe tutma) %10'luk zıt değişim sayısı nabız hızını
  izlemiyor. Test adı "bas sütunu saniyede en fazla 1 kez değişir" diyor, ama saniyede 3 nabız geçiyor.
- Senaryo ve etki: bir oturum gösteriyi "daha canlı" yapmak için vuruş aralığını kısaltır. CI yeşil kalır, güvenli
  modu açan ışığa duyarlı kullanıcı karşılama ekranında (Spektrum sahnesi, şarkı yokken) söz verilen "en fazla 1 nabız"
  yerine 3 nabız görür. WCAG anlamında parlama sayısı yine düşük kalıyor, gerçek zarar sınırlı: Orta.
- Çürütme denemesi: kuralı başka bir şeyin korumasına bakıldı. `check:scenes` Spektrum'un gösteri hâlini ölçüyor mu
  diye `scripts/check-scenes.mjs`'te `SpectrumDemo` ve `spectrum` arandı, sonuç yok. Bileşen testleri yalnızca metni
  denetliyor. Koruma yok.
- Öneri: testin içinde nabız doğrudan sayılsın. Örneğin `stepDemo`'ya vuruşu döndüren bir alan (`s.lastBeat`)
  eklensin, 20 sn'de güvenli mod için `beats/20 ≤ 1`, normal mod için `≤ 3` beklensin. Ya da bas sütununun yükselme
  olayları (artış ≥ eşik) sayılsın.

### BEL-03: README Local klasörünün silinmesini "güvenli" diyor, ama kullanıcının kaydettiği hazır ayarlar orada

- Önem: Düşük · Güven: Kesin (Windows davranışı Tauri kaynağından) · Standart: Windows uygulama verisi kuralları (Roaming = kullanıcıya ait, Local = makineye özgü), ISO/IEC 25010 güvenilirlik
- Yer: `README.md:58-65`, `docs/MIMARI.md` "Veri ve kalıcılık" paragrafı; `src/lib/scenePreset.ts:6,109-123`,
  `src/lib/sky.ts:83`, `src/lib/sceneLook.ts:102`, `src/lib/milkdrop.ts:207-208`
- Kanıt: README: "`%LOCALAPPDATA%\…` — library database with the analysis cache, and logs. Deleting it is safe but
  you will have to add your music folders again". Tauri 2.12.1 `src/manager/webview.rs:559-565`:
  `if pending.webview_attributes.data_directory.is_none() { match manager.path().app_local_data_dir() …` Yani
  WebView2'nin `localStorage`'ı da `%LOCALAPPDATA%\io.github.gozlemesevdalisi.lyraska\` altında. Orada duranlar:
  `lyraska.scenePresets` (kullanıcının adıyla kaydettiği en fazla 50 hazır ayar), `lyraska.sceneLooks`,
  `lyraska.skyLook`, `lyraska.lyrics.visible`, `lyraska.milkdrop.skipped` (donduran görseller listesi).
- Senaryo ve etki: kullanıcı yer açmak ya da sorunu çözmek için README'ye güvenip Local klasörünü siler. Kendi
  hazır ayarları geri gelmeyecek biçimde kaybolur. Atlananlar listesi de silinir, programı donduran bir MilkDrop
  görseli bir kez daha açılabilir.
- Öneri: README ve MIMARI'ye bir satır eklenmeli: "Local klasöründe ayrıca arayüzün kendi deposu (kaydettiğiniz
  sahne hazır ayarları, son sahne, görünümler) durur; silinince bunlar da gider." Uzun vadede hazır ayarlar
  `settings.json`'a (Roaming) taşınabilir.

### BEL-04: Sahibe yol gösteren belgelerde yanlış yerler

- Önem: Düşük · Güven: Kesin · Standart: ISO/IEC 25010 kullanılabilirlik (öğrenilebilirlik)
- Yer ve kanıt:
  - `docs/DOGRULAMA.md:209`: "Ayarlar'da 'analiz ediliyor' sayısı". Ayarlar panelinde böyle bir sayı yok; analiz
    sayısı Kütüphane panelinde (`LibraryPanel.tsx:207`).
  - `docs/DOGRULAMA.md:211`: "**Ayarlar → Program** altındaki takılma sayacı". Sayaç "Sesin yolu" bölümünde
    (`SettingsPanel.tsx:158-161`, "Kesinti: N"). B7 maddesi (satır 137) bunu doğru yazıyor.
  - `docs/DOGRULAMA.md:345`: "**Ayarlar → Ses gecikmesi**". Ayar Senkron panelinde (`SyncPanel.tsx:65`); Ayarlar'da
    yok.
  - `docs/ISARETLEME.md:9`: "Alt paneldeki **İşaretle** sekmesine geçin". Paneller sağdan açılan çekmecede
    (`PlayerScreen.tsx:64-71`, `drawer__tabs`), üst çubukta İşaretle düğmesi yok: sahip önce Kütüphane, Ekolayzer ya
    da Ayarlar'a basıp sekmeyi seçmeli.
  - `ROADMAP.md:286`: "Ekolayzerde sıradaki iş: elle parametrik EQ arayüzü (öneri…)" ve "loudness". İkisi de aynı
    belgede bitmiş olarak işaretli (satır 118-128, 131).
- Senaryo ve etki: yazılımcı olmayan sahip madde başında aradığını bulamaz, testi yapmaz ya da "olmadı" bildirir.
- Öneri: yolları "**Kütüphane** panelinin altındaki 'Şarkı haritası: X / Y' satırı", "**Ayarlar → Sesin yolu →
  Kesinti**", "**Senkron → Ses gecikmesi**", "sağ üstteki **Kütüphane** düğmesiyle çekmeceyi açın, **İşaretle**
  sekmesine geçin" olarak düzeltmek. ROADMAP'in "Bekleyen kararlar"ından biten işler çıkarılmalı.

### BEL-05: Programa uyarlanan `milkdrop-preset-utils` (MIT) bildirimi programın içindeki dosyada yok; bazı MIT paketlerinde telif satırı eksik

- Önem: Düşük · Güven: Kesin (eksiklik); hukuki ağırlığı Olası · Standart: MIT lisansı ("…shall be included in all copies or substantial portions"), GPL-3.0 §7, SPDX
- Yer: `src-tauri/src/milkdrop/parse.rs:22-23` ("`milkdrop-preset-utils` (0.2.1, MIT) paketinden uyarlanmıştır"),
  `docs/LISANSLAR.md:60-69` (bildirim yalnızca bu belgede), `public/lisanslar/UCUNCU-TARAF.txt`
- Kanıt: `grep -n "milkdrop-preset-utils" public/lisanslar/UCUNCU-TARAF.txt` boş döndü. Ayrıca `eel-wasm`,
  `ecma-proposal-math-extensions`, `@assemblyscript/loader` için dosyada yalnızca "(pakette lisans dosyası yok; …
  metin için kaynak deposuna bakın)" yazıyor. Telif satırı ve MIT/Apache metnine iç bağlantı yok, oysa aynı metinler
  dosyanın sonunda başka paketler için var.
- Senaryo ve etki: kurulum dosyasını alan kişi, programa giren uyarlanmış kodun telif bildirimini programda göremez.
  Eser küçük (anahtar eşleme tablosu) ve aynı yazarın Butterchurn bildirimi zaten var; pratik risk düşük.
- Öneri: `scripts/third-party-notices.mjs`'e elle yazılmış bir "kaynaktan uyarlanan kod" bölümü eklensin:
  `milkdrop-preset-utils 0.2.1 — MIT — Copyright (c) 2018 Jordan Berg → metin <MIT özeti>`. Lisans dosyası olmayan
  paketlerde "metin için kaynak deposuna bakın" yerine dosyadaki ilgili `metin <özet>`'e bağlantı verilsin.

### BEL-06: CLAUDE.md'de küçük ama yanıltıcı kayma (gelecek oturumlara yanlış bilgi)

- Önem: Düşük · Güven: Kesin · Standart: ISO/IEC 25010 bakım kolaylığı
- Yer ve kanıt:
  - `CLAUDE.md:203`: "`npm run check` (biçim, lint, tür, testler, `check:*`…)". `package.json` `check` betiği
    `check:notices` ve `check:scenes`'i çalıştırmıyor. Bir oturum bağımlılık güncelleyip `npm run check` yeşil
    diye push edebilir, sonra CI'daki bildirim denetimi kırmızı olur. README (satır 96) doğru listeliyor.
  - `CLAUDE.md:60`: "SpectrumDemo karşılama gösterisi". Karşılama ekranı artık son seçilen sahne (varsayılan gece
    göğü) ve `NowPlaying`'deki "Hoş geldiniz" (`scene.ts` `DEFAULT_SCENE = "sky"`). `SpectrumDemo` yalnızca
    Spektrum sahnesi seçiliyken ve şarkı yokken görünüyor (`SceneStage.tsx:58-79`). `ROADMAP.md:18` ("eski araba
    teybi ekranı havasında") da bu yüzden bugünü anlatmıyor. `commands.rs:46` ("Karşılama ekranında gösterilen
    program bilgisi") ve kullanılmayan `AppInfo.analysis` ve `visualBridge` alanları ("şarkı haritası yolda",
    `analysis/mod.rs:42`) Faz 0 iskeletinden kalma.
  - `CLAUDE.md:152` scripts açıklamasında `check-docs`, `check-rules`, `webview2-imzasi.ps1` yok. `docs/` ağacında
    `DENETIM-FAZ0.md` ve `denetim-faz0/` yok (BEL-01 M7: kapı bunları görmüyor).
- Öneri: satır 203'e "(`check:notices` ve `check:scenes` hariç; bkz. README Checks)" eklensin. Satır 60
  "SpectrumDemo: Spektrum sahnesinin şarkısız gösterisi" olsun. Karşılama tanımı NowPlaying'e taşınsın. `AppInfo`'nun
  kullanılmayan alanları kaldırılsın ya da yorum düzeltilsin. Ağaçtaki eksikler tamamlansın.

### BEL-07: "Her kural testle denetlenir, elle hatırlanacak kural yok" iddiası abartılı

- Önem: Düşük · Güven: Kesin · Standart: ISO/IEC 25010 test edilebilirlik
- Yer: `docs/MIMARI.md:373`, `CLAUDE.md:262` ("Kalite hedefleri ölçülebilir testlere bağlanır: … 1080p dahili GPU'da
  60 fps; 1 saat çalmada sıfır takılma")
- Kanıt: kodda 60 fps ya da 1 saatlik çalma ölçen bir test yok (`grep -rn "fps\|3600\|1 saat"` testlerde sonuç
  vermedi). Bu iki hedef yalnızca elle denenen `DOGRULAMA.md` B7 ve D2'de. MIMARI'nin tablosu da "gerçek ses
  aygıtı… proje sahibinde" diye kendi istisnasını yazıyor. Kurallardan "commands.rs ince kalır" ve "commit mesajları
  Türkçe" hiçbir kapıda yok. Bunun yanında `CLAUDE.md:226` "Kod tanımlayıcıları İngilizce" diyor, ama 443 Rust test
  fonksiyonunun adları Türkçe (ör. `ses_yolu_bellek_ayirmaz`); CLAUDE.md bunu kendisi de anıyor.
- Senaryo ve etki: oturumlar "CI yeşilse her kural tutuyor" diye düşünür, elle denenmesi gerekenler atlanır.
- Öneri: MIMARI:373 "Elle denenenler: DOGRULAMA.md (60 fps, 1 saat, gerçek aygıt)" olarak düzeltilsin. CLAUDE.md'ye
  "test fonksiyon adları Türkçe olabilir" istisnası yazılsın.

### BEL-08 (Bilgi): Ayarlar simgesi dişli değil, belgeler "dişli" diyor

- Önem: Bilgi · Güven: Kesin (çizim), Olası (karışıklık)
- Yer: `src/components/icons.tsx:148-155` (çember + 8 ışın, güneş/parlaklık simgesine benziyor);
  `.github/ISSUE_TEMPLATE/hata-kaydi.yml:240,259` ve `docs/DOGRULAMA.md:14` "dişli simgesi".
- Öneri: simge dişli biçimine çevrilsin ya da metin "sağ üstteki üç düğmenin en sağdaki (Ayarlar)" olsun.

### BEL-09 (Bilgi): README "npm paketleri de yalnızca deny.toml'daki lisanslar" diyor; geliştirme araçları için ek iki lisans var

- Yer: `README.md:125-127`, `scripts/check-licenses.mjs:24-27` (`DEV_ONLY = ["BlueOak-1.0.0", "CC-BY-4.0"]`).
  Pakete girmiyorlar, ikisi de izin verici. Yalnızca belge doğruluğu sorunu.
- Öneri: README'ye "(pakete girmeyen geliştirme araçlarında ayrıca BlueOak-1.0.0, CC-BY-4.0)" eklensin.

## 4. Olası riskler

- **WebView2'nin kendi ağ trafiği:** README "the player itself never connects to the internet" diyor. Program kodu
  bağlanmıyor (`check:rules` uzak adres ve ağ crate'i taraması yeşil), ama Edge WebView2 çalışma zamanı Windows
  ayarına göre kendi tanılama ve güncelleme trafiğini yapabilir. Doğrulanmadı. Belgeye "WebView2 çalışma zamanı
  Microsoft'un kendi güncellemelerini alır" notu eklenebilir.
- **Hata formundaki `labels: ["hata"]`:** etiket depoda yoksa GitHub sessizce atlar. `/labels` sayfası bu oturuma
  403 döndü, doğrulanamadı.
- **Günlük taşınamadığında yol:** `data_dirs.rs` taşıma başarısızsa günlük Roaming'de kalır, ama hata formu yalnızca
  `%LOCALAPPDATA%\…\logs` diyor. Seyrek bir durum.
- **Karşılama metninin okunabilirliği:** `--ink-2/--ink-3` koyu zeminde ≈ 5,9:1, ama metin hareketli kuzey
  ışıklarının üstünde. Parlak perde altında karşıtlık düşebilir (WCAG 1.4.3). Ölçülmedi.

## 5. Temiz bulunanlar

- README'nin iddiaları kodla aynı: 16 sahne (`scene.ts` 5 klasik + `shaderScene.ts` 10 + MilkDrop), biçimler
  (`decode.rs:25-28`), WebView2 önyükleyicisi (`tauri.conf.json` `embedBootstrapper`), `currentUser` kurulum, Node
  22.22.0 (`.nvmrc`), sabit Rust sürümü, "Checks" listesi CI ile eşleşiyor, SmartScreen yönergesi, attestation komutu
  iş akışındaki adla aynı.
- Veri klasörleri: README, MIMARI ve hata formu `data_dirs.rs` ve `lib.rs` ile tutarlı (Roaming'de `settings.json`,
  `isaretler/`, `haritalar/`; Local'de `library.sqlite3`, `logs/`). İstisna BEL-03.
- Hata formu: "Program" bölümü, "Sürüm X · abc1234" (`SettingsPanel.tsx:187`, `build.rs` ile CI'nın
  `LYRASKA_COMMIT`'i), "Hata günlüğü" düğmesi ve `explorer /select` ile dosyanın seçili açılması (`file_manager.rs`),
  günlükte sürüm, derleme kodu ve Windows sürümü (`diagnostics.rs:54-56`), gizlilik uyarısı (kullanıcı adı yolda) doğru.
  Güvenlik açığı için ayrı ve gizli bağlantı var (`config.yml`).
- SECURITY.md: gizli bildirim yolu, desteklenen sürüm, doğrulama komutu ve sürümü bulma yolu doğru.
- Yasal bildirimler: `public/lisanslar/GPL-3.0.txt` LICENSE ile aynı (`check:docs` kural 5). Ayarlar → Lisanslar'da
  GPL-3.0-only, "hiçbir garanti verilmez", telif ve kaynak yeri yazıyor (GPL-3.0 §5 "Appropriate Legal Notices").
  Kurulum dosyası LICENSE'ı gösteriyor (`licenseFile`). Release etiketi derlenen commit'e taşınıyor, böylece
  GitHub'ın kaynak arşivi ikiliye karşılık geliyor (GPL §6(d)). Inter (OFL-1.1) ve Butterchurn bildirimleri
  dosyada. `check:licenses` 278 paket, `check:commands` 58 komut, ikisi de yeşil.
- Karşılama ekranı: şarkı yokken "Hoş geldiniz / Lyraska", sürükle-bırak ve "Klasör ekle" daveti doğru (klasör
  bırakma `useDropToLibrary.ts:14-16`). Hata kehribar renkte ve yanıp sönmeden çıkıyor. "Animasyonları azalt"ta
  gösteri duruyor (`SpectrumDemo.tsx:141`). "Gösteri" etiketi görünüyor. Test geçiyor (`components.test.tsx:444`).
- Sürüm tutarlılığı testli (`commands.rs:1043` `surum_package_json_ile_ayni`). `cache::VERSIONS`'ın beş parçası
  CLAUDE.md ile aynı. Clippy lint'leri ve `panic = "abort"` CLAUDE.md'deki gibi.
- `check:docs` mimari ağacın iki yönünü de gerçekten denetliyor (M1 kırmızı).

## 6. Öncelikli düzeltme sırası

1. BEL-01: `check-docs.mjs`'e indirme linki kuralı (iş akışındaki etiket ve dosya adıyla), ISSUE_TEMPLATE taraması ve
   ci.yml yorumlarının atılması.
2. BEL-02: `SpectrumDemo.test.ts`'e nabız sayımı (güvenli ≤ 1/sn, normal ≤ 3/sn).
3. BEL-04: DOGRULAMA B16, D11 ve ISARETLEME:9 yollarının düzeltilmesi, ROADMAP "Bekleyen kararlar"ın temizlenmesi.
4. BEL-03: README ve MIMARI'ye WebView2 deposundaki kullanıcı verisi notu.
5. BEL-05: bildirim dosyasına `milkdrop-preset-utils` bölümü ve lisans dosyası olmayan paketler için metin bağlantısı.
6. BEL-06: CLAUDE.md:203 ve :60, AppInfo yorumu, scripts ve docs ağacı.
7. BEL-07: MIMARI:373 düzeltmesi ve test adı istisnası.
8. BEL-08 ve BEL-09: simge veya metin, README lisans cümlesi.

### Proje sahibinin ayarına bağlı

- **Özel güvenlik bildirimi:** SECURITY.md ve `ISSUE_TEMPLATE/config.yml` için GitHub → Settings → Code security →
  "Private vulnerability reporting" → **Enable** açık olmalı. Kapalıysa "Report a vulnerability" düğmesi görünmez ve
  bildirim yolu kopar. Doğrulanamadı (403).
- **Dal koruması:** CLAUDE.md "main'e doğrudan push yok, CI yeşil olmadan birleştirme yok" ve ci.yml:288 "koruma
  kuralı bu adı zorunlu denetim olarak bekler" diyor. Bu ancak Settings → Branches'ta `main` kuralı ve zorunlu
  denetimler tanımlıysa gerçek. Doğrulanamadı.
- **`hata` etiketi:** Issues → Labels'ta var olmalı (bkz. Olası riskler).
- **Kod imzası:** sertifika satın alınana kadar SmartScreen uyarısı sürer. README, SECURITY ve release notu bunu doğru
  ve yol gösterir biçimde anlatıyor.
