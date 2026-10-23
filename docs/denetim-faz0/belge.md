# BELGE (belgeler, hata kaydı formu, lisans uyumu, karşılama ekranı) — bağımsız denetim raporu (Faz 0)

Denetlenen: `/home/user/Lyraska`, commit `94bc3d6` (`main`, sürüm 0.0.56). Tarih: 22 Ekim 2026.

## 1. Özet

- **Puan: 6/10.** Teknik belgeler (MIMARI, LISANSLAR, form) ayrıntılı ve çoğunlukla doğru. Ama kullanıcıya ve
  gelecekteki yapay zekâ oturumlarına giden birkaç temel bilgi yanlış ya da eskimiş: indirme ve kaynak adresinin
  sahibi, veri klasörlerinin adı, programın hangi fazda olduğu. Ayrıca npm lisans kapısı, belgelerin söylediğinden
  zayıf.
- **Yüksek (1):** Sabit indirme linki (`CLAUDE.md`, README, iş akışı yorumu), programın içindeki "kaynak kodu" adresi
  ve `UCUNCU-TARAF.txt` eski GitHub adına (`gozlemesevdalisi`) bağlı. Depo artık `lahmacunveayran/Lyraska`'da ve link
  yalnızca GitHub'ın yönlendirmesiyle çalışıyor (`301`). Eski ad başkası tarafından alınırsa bu yönlendirme ele
  geçirilebilir (repojacking): imzasız bir kurulum dosyası, kullanıcılara "Yine de çalıştır" denen bir linkten
  dağıtılmış olur (BEL-01).
- **Orta:** README ve MIMARI'deki veri klasörü adı yanlış (`com.lyraska.app`; gerçek ad
  `io.github.gozlemesevdalisi.lyraska`). "İkisi de güvenle silinebilir" sözü de yanlış: silinince işaretler ve klasör
  listesi kaybolur (BEL-02). DOGRULAMA A0, 0.0.51'den beri yanlış klasörü tarif ediyor (BEL-03). npm lisans denetimi
  bir yasak listesi; GPL-2.0-only, CC-BY-ND, JSON ve "Proprietary" lisanslarını geçiriyor, deneyle kanıtlandı
  (BEL-04). README'deki durum cümleleri ve "planned" listesi eskimiş, CLAUDE.md kendi içinde çelişiyor (BEL-05).
  README'deki "CI ile aynı denetimler" listesi temiz bir klonda çalışmıyor (BEL-06). CLAUDE.md'nin mimari ağacında
  `data_dirs.rs` ve en az 11 dosya yok (BEL-07). Hata günlüğünde derleme kodu ve Windows sürümü yok; form ise
  "Windows sürümü dosyada var" diyor (BEL-08).
- **Karşılama ekranı sağlam.** `lang="tr"`, h1 "Lyraska" ve "Hoş geldiniz" testli. Kütüphane çekmecesi açık
  başlıyor ve iki ekleme düğmesi var; "animasyonları azalt" tercihine uyuluyor. Gösteri spektrumu WCAG 2.3.1 alan
  eşiğinin altında kalıyor (benzetimle 0 parlama). Kalan kusurlar küçük: gösteri spektrumu etiketsiz, güvenli modu
  dinlemiyor ve parlama testi yok (BEL-12).
- **Sürüm tutarlılığı temiz.** `package.json`, `Cargo.toml` ve `Cargo.lock` hepsi 0.0.56; eşitlik
  `commands::tests::surum_package_json_ile_ayni` testiyle denetleniyor.
- **Hata kaydı formu** GitHub şemasına uygun. `hata` etiketi depoda var ve kişisel veri uyarısı iyi. Bölüm
  seçenekleri ise bugünkü programın beş bölümünü kapsamıyor (BEL-09).

## 2. Kapsam ve yöntem

**Okunan dosyalar:** `README.md`, `CLAUDE.md` (oturum talimatı olarak verildi), `docs/ROADMAP.md`, `docs/MIMARI.md`,
`docs/LISANSLAR.md`, `docs/DOGRULAMA.md` (bölüm A0), `.github/ISSUE_TEMPLATE/{hata-kaydi,config}.yml`,
`.github/workflows/{ci,test-surumu}.yml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `Cargo.lock`
(lyraska girdisi), `package.json`, `index.html`, `src-tauri/build.rs`, `src-tauri/src/{lib.rs,data_dirs.rs,diagnostics.rs}`,
`commands.rs` (AppInfo, open_log, sürüm testi), `analysis/cache.rs` (VERSIONS), `src/components/{NowPlaying,SpectrumDemo,
SceneStage,PlayerScreen,SettingsPanel,DotMatrix}.tsx`, `src/hooks/{useDrawer,useScene,useDropToLibrary}.ts`,
`src/lib/{scene,flash,usePrefersReducedMotion}.ts`, `src/styles/global.css` (:root, .now, spektrum sahnesi,
reduced-motion), `components.test.tsx` (karşılama testi), `scripts/{check-licenses,third-party-notices}.mjs`,
`src-tauri/deny.toml`, `public/lisanslar/*`.

**Okunmayanlar (yalıtım):** `docs/DENETIM*.md`, `docs/denetim-2/`, `docs/devlog/`, issue ve PR yorumları.

**Çalıştırılan komutlar ve deneyler** (hepsi yalnızca okuyan ya da kendi klasörümde):

- `git remote -v` → `https://github.com/lahmacunveayran/Lyraska`.
- `git log` yazar sayımı: `gozlemesevdalisi <kalekomando49@gmail.com>` 27 commit (16 Ekim'e kadar),
  `lahmacunveayran <kalekomando49@gmail.com>` 23 commit (16 Ekim'den sonra). E-posta aynı, ad değişmiş.
- `curl -D -` ile bağlantılar:
  - `…/gozlemesevdalisi/Lyraska/releases/download/test-surumu/Lyraska-Kurulum.exe` → **301** →
    `…/lahmacunveayran/Lyraska/…` → 302 → dosya.
- `gh api repos/lahmacunveayran/Lyraska`: sahibi `User`, `GPL-3.0`, herkese açık. `/labels`: `hata` var.
  `/releases/tags/test-surumu`: sürüm 0.0.56, derleme kodu `94bc3d6`, SHA-256 yazıyor, tek dosya (5,8 MB).
  - `gh api repos/gozlemesevdalisi/Lyraska` ve `users/...` oturum kısıtıyla reddedildi. Eski adın şu an boşta mı
    olduğu doğrulanamadı.
- `node scripts/check-commands.mjs`, `check-no-audio.mjs`, `check-licenses.mjs`: üçü de temiz (54 komut; 340 dosya;
  242 paket).
- **Mutasyon sınaması (npm lisans kapısı):** `belge/lisans-mutasyon/node_modules/` altında sahte paketler
  oluşturuldu ve betik o klasörden çalıştırıldı. Sonuç BEL-04'te.
- **Kontrast hesabı:** `belge/kontrast.py`, çıktısı `belge/kontrast.txt`.
- **Gösteri spektrumunun parlama benzetimi:** `belge/demo_parlama.mjs`, çıktısı `belge/demo_parlama.txt`.
  `SpectrumDemo` benzetiminin birebir kopyası, 60 sn; `countFlashes` mantığıyla, 341 px'lik her pencere ve matrisin
  tamamı için sayıldı.
- Issue formu `python3 yaml` ile ayrıştırıldı. Anahtarlar, id tekliği ve alan türleri denetlendi.

**Sınırlar:**

- docs.github.com ve diğer belge siteleri bu ortamdan açılamadı (DNS ve vekil sunucu 403). GitHub davranışına dair
  sözler GitHub belgelerinin bilinen içeriğine dayanıyor ("Changing your GitHub username", "About issue and pull
  request templates/syntax for issue forms", "Attaching files").
- Rust derlemesi yapılmadı (BEL-06'daki `dist/` gereksinimi CLAUDE.md'nin kendi notu ve kodla gerekçelendirildi).
- Denetim sırasında depoda başka bir iş çalışıyordu: ikinci `git status`'ta `src/lib/bindings/*.ts` silinmiş
  görünüyordu. Bu benim yaptığım bir değişiklik değil; depoya hiçbir şey yazılmadı.

## 3. Bulgular

### BEL-01 — Sabit indirme linki ve kaynak adresi, yönlendirmesi ele geçirilebilir eski bir GitHub adına bağlı

- Önem: **Yüksek** (eski ad başkasının eline geçerse Kritik) · Güven: Yüksek (GitHub hesap durumuna bağlı) ·
  Standart: OpenSSF (yazılım tedarik zinciri: repojacking), GPL-3.0 §6(d) ("kaynağın nerede olduğunu açıkça
  gösteren yönerge"), SLSA v1.0 (dağıtım kaynağının doğrulanabilirliği)
- Yer:
  - `CLAUDE.md:18` (sabit link) ve `CLAUDE.md:22` ("Depo: `gozlemesevdalisi/Lyraska`")
  - `README.md:41`
  - `.github/workflows/test-surumu.yml:3`
  - `src/components/SettingsPanel.tsx:210` ("Kaynak kodu: github.com/gozlemesevdalisi/Lyraska")
  - `scripts/third-party-notices.mjs:169` ve `public/lisanslar/UCUNCU-TARAF.txt:3`
  - `src-tauri/Cargo.toml:7`
  - `docs/ROADMAP.md`: 6 issue bağlantısı
- Kanıt:
  ```
  $ git remote -v        → origin https://github.com/lahmacunveayran/Lyraska
  $ curl -D - https://github.com/gozlemesevdalisi/Lyraska/releases/download/test-surumu/Lyraska-Kurulum.exe
  HTTP/1.1 301 Moved Permanently
  Location: https://github.com/lahmacunveayran/Lyraska/releases/download/test-surumu/Lyraska-Kurulum.exe
  $ git log (yazarlar) → gozlemesevdalisi <kalekomando49@gmail.com> (≤16 Ekim), lahmacunveayran <kalekomando49@gmail.com> (22 Ekim)
  ```
  - Aynı e-postayla yazar adı değişmiş. Bu, GitHub hesabının yeniden adlandırıldığını gösteriyor (devredilen bir depo
    da aynı yönlendirmeyi üretir).
  - GitHub'ın kullanıcı adı değiştirme belgesine göre eski kullanıcı adı başkası tarafından alınabilir. Yeni sahibi
    aynı adla bir depo açarsa eski depo yönlendirmesi biter.
  - Yani `gozlemesevdalisi/Lyraska/releases/download/test-surumu/Lyraska-Kurulum.exe` adresi, o adı alan kişinin
    yüklediği dosyayı vermeye başlar.
- Senaryo ve etki:
  - Bir saldırgan `gozlemesevdalisi` adını alır, `Lyraska` deposunu ve `test-surumu` Release'ini açar, oraya
    `Lyraska-Kurulum.exe` adında zararlı bir dosya yükler.
  - Proje sahibi CLAUDE.md'nin talimatıyla her oturumda bu linki alır. README'yi okuyan kullanıcılar da aynı linki
    kullanır. Dosya imzasız olduğu için ikisine de "Ek bilgi → Yine de çalıştır" denir; SmartScreen uyarısı zaten
    "normal" sayılıyor.
  - Programın Ayarlar > Lisanslar bölümündeki GPL kaynak kodu adresi de saldırganın deposunu gösterir.
  - Saldırgan için kullanıcı adını almak dışında bir engel yok. Depo adını tarayan otomatik repojacking araçları
    bilinen bir tehdit.
- Çürütme denemesi:
  1. _Eski hesap hâlâ ayrı bir hesap olarak duruyorsa_ (yeniden adlandırma değil de devir yapıldıysa ve hesap
     silinmediyse) ad boşta değildir ve risk o hesabın güvenliğine bağlı kalır. Aynı e-posta ve yazar adının
     değişmesi yeniden adlandırmayı güçlü biçimde gösteriyor, ama `users/gozlemesevdalisi` sorgusu oturum kısıtıyla
     reddedildi, yani kesinleşmedi.
  2. _GitHub'ın "popüler depo ad alanı emekliliği"_ yalnızca yeniden adlandırmadan önceki haftada 100'den fazla
     klonlanan depoları korur; bu küçük depo için olası değil.
  3. Release notları SHA-256 veriyor, ama kullanıcıya bunu denetlemesi söylenmiyor ve sahte Release kendi notlarını
     yazar.

  Sonuç: risk, yalnızca eski adın bugünkü durumuna bağlı. Önem Yüksek'te bırakıldı.

- Öneri:
  1. Bütün linkleri `lahmacunveayran/Lyraska` olarak güncelleyin: CLAUDE.md, README, `test-surumu.yml` yorumu,
     `SettingsPanel.tsx:210`, `third-party-notices.mjs:169` (ardından `npm run notices`), `Cargo.toml` `repository`,
     ROADMAP issue linkleri.
  2. Proje sahibi eski `gozlemesevdalisi` adını hemen ikinci bir (boş) hesapla geri alıp tutsun. Bu, var olan bütün
     eski linkleri korur.
  3. `tauri.conf.json` `identifier` **değiştirilmesin**: değişirse kullanıcıların veri klasörü yetim kalır
     (bkz. BEL-02).

### BEL-02 — README ve MIMARI'de veri klasörü adı yanlış; "ikisi de güvenle silinebilir" sözü kullanıcı verisini kaybettirir

- Önem: Orta · Güven: Kesin · Standart: Windows uygulama veri klasörü kuralları, ISO/IEC 25010 (kullanılabilirlik:
  öğrenilebilirlik)
- Yer:
  - `README.md:48-50`
  - `docs/MIMARI.md:214-215`
  - `src-tauri/src/library/mod.rs:11`: hâlâ kütüphaneyi `%APPDATA%\…` altında gösteriyor
- Kanıt:
  ```
  README.md:48  Data lives in two folders: `%APPDATA%\com.lyraska.app` (settings, annotations) and
  README.md:49  `%LOCALAPPDATA%\com.lyraska.app` (library + analysis cache, logs). Both can be deleted safely;
  README.md:50  the library is rebuilt from your music folders.
  src-tauri/tauri.conf.json:5   "identifier": "io.github.gozlemesevdalisi.lyraska",
  src-tauri/src/lib.rs:37-39    app.path().app_data_dir() / app_local_data_dir()  (Tauri: <klasör>\<identifier>)
  src-tauri/src/lib.rs:78,88,95 settings.json, haritalar/, isaretler/  → Roaming
  ```
  - `identifier` ilk commit'ten beri `io.github.gozlemesevdalisi.lyraska`; hiç `com.lyraska.app` olmadı
    (`git log -S` ile bakıldı: `com.lyraska.app` dizgesi 0.0.51'de belgelere girmiş).
  - Kütüphane veritabanı kaynak listesini de tutuyor (`library/db.rs`: "kaynak (klasör ya da tek şarkı) ve şarkı
    tabloları"). Local klasör silinirse program hangi müzik klasörlerinin ekli olduğunu da unutur; "rebuilt from your
    music folders" kendiliğinden olmaz.
  - Roaming silinirse `isaretler/` (kullanıcının elle işaretlediği beat/drop'lar, saatlerce emek) ve `haritalar/`
    kaybolur.
- Senaryo ve etki:
  - Bir kullanıcı ya da proje sahibi programı sıfırlamak için README'deki klasörü arar ve bulamaz.
  - Bulursa, "güvenle silinebilir" sözüne güvenip işaretlerini ve klasör listesini kaybeder.
  - Gelecekteki bir yapay zekâ oturumu MIMARI'ye dayanarak sahibine yanlış klasör yolu tarif eder.
- Öneri: README ve MIMARI'de klasör adını `io.github.gozlemesevdalisi.lyraska` yapın ve hangi klasörün neyi
  tuttuğunu yazın. "Both can be deleted safely" cümlesini şununla değiştirin: "Local klasörünü silmek kütüphaneyi ve
  analizleri sıfırlar (müzik klasörlerini yeniden eklemeniz gerekir); Roaming klasörünü silmek ayarlarınızı,
  işaretlerinizi ve içe aktardığınız haritaları siler." `library/mod.rs:11` yorumunu düzeltin.

### BEL-03 — DOGRULAMA A0 (proje sahibinin deneme listesi) 0.0.51'den beri işe yaramayan bir yol tarif ediyor

- Önem: Orta · Güven: Kesin · Standart: ISO/IEC 25010 (bakım kolaylığı: değiştirilebilirlik, belge tutarlılığı)
- Yer: `docs/DOGRULAMA.md:31-35`
- Kanıt:
  ```
  DOGRULAMA.md:31  2. Dosya Gezgini'nin adres çubuğuna `%APPDATA%\io.github.gozlemesevdalisi.lyraska` yazıp Enter'a basın.
  DOGRULAMA.md:32  3. Şimdiki `library.sqlite3` dosyasının adını `library.sqlite3.yeni` yapın. …
  DOGRULAMA.md:35  4. Yedeğiniz `library.sqlite3.bak` dosyasının adını `library.sqlite3` yapın.
  data_dirs.rs:23-26  if !old_library.exists() || local.join(MOVED_FILES[0]).exists() { return local … }
  ```
  - 0.0.51'den beri kütüphane `%LOCALAPPDATA%`'da. Taşınan dosyalar yalnızca `library.sqlite3` ve onun `-wal`/`-shm`
    eşleri (`MOVED_FILES`); `.bak` dosyası Roaming'de kalır.
  - Talimata uyan sahip, Roaming'de `.bak` dosyasını `library.sqlite3` yapar. Ama Local'da zaten bir kütüphane
    olduğu için `big_data_dir` Local'ı döndürür ve geri yüklenen yedek hiç açılmaz.
- Senaryo ve etki: Proje sahibi A0'ı dener, "eski klasörlerim görünmüyor" diye hata bildirir ya da yanlışlıkla
  "çalışıyor" der. Doğrulama sonucu güvenilmez olur ve boşa bir hata ayıklama oturumu açılır.
- Öneri: A0'ı şöyle düzeltin: adres `%LOCALAPPDATA%\io.github.gozlemesevdalisi.lyraska`; `.bak` dosyası Roaming'de
  kalmışsa önce oraya taşınsın. Ya da maddeyi "0.0.51 öncesine özgü" diye kapatın.

### BEL-04 — npm lisans kapısı bir yasak listesi: GPL-2.0-only, CC-BY-ND, JSON, "Proprietary" ve "Commercial" lisanslı paketler CI'dan geçiyor

- Önem: Orta · Güven: **Kanıtlandı** · Standart: GPL-3.0 uyumluluğu (GPL-2.0-only, GPL-3.0 ile birleştirilemez),
  SPDX, OpenSSF (lisans politikası)
- Yer:
  - `scripts/check-licenses.mjs:11-23` (FORBIDDEN listesi), `:58-63`
  - İddialar: `CLAUDE.md` "İzin verilen lisanslar `src-tauri/deny.toml` içinde listelidir", `README.md:104-105`
    "this is enforced in CI", `docs/MIMARI.md` "Yasaklı lisans yok — npm run check:licenses, cargo deny"
- Kanıt (kendi klasörümde, depoya dokunmadan):
  ```
  $ cd belge/lisans-mutasyon && node /home/user/Lyraska/scripts/check-licenses.mjs
  # node_modules: sahte1 GPL-2.0-only, sahte2 CC-BY-ND-4.0, sahte3 JSON, sahte4 LicenseRef-Proprietary, sahte5 Commercial
  Lisans denetimi tamam: 5 paket incelendi, yasak lisans yok.
  cikis=0
  ```
  Aynı denemede `CC-BY-NC-4.0`, `AGPL-3.0-only` ve `SEE LICENSE IN …` doğru biçimde yakalandı (çıkış 1). Kapı yalnızca
  adı yasak listede geçen lisansları tanıyor.
- Senaryo ve etki:
  - Bir oturum arayüze, `license` alanı "Commercial", "LicenseRef-…" ya da "GPL-2.0-only" olan bir npm paketi ekler.
  - CI yeşil kalır ve paket kurulum dosyasına girer. GPL-2.0-only paket GPL-3.0-only programla dağıtılamaz; tescilli
    paket lisans ihlali olur.
  - Bugün pakete giren yalnızca 5 doğrudan npm bağımlılığı var. Gerçekleşme olasılığı orta-düşük, ama belgeler
    kapıyı olduğundan güçlü anlatıyor.
- Öneri: `check-licenses.mjs`'i `deny.toml`'daki `allow` listesini okuyan bir **izin listesine** çevirin (SPDX
  ifadesini `OR`/`AND`'e göre ayrıştırın). Listede olmayan lisans CI'yi kırsın; istisnalar için tek bir
  `exceptions` tablosu tutun. Testi sahte paketlerle yazın (yukarıdaki deney).

### BEL-05 — README'deki durum cümleleri ve "planned" listesi eskimiş; CLAUDE.md kendi içinde çelişiyor; programda "Faz 2" sabit yazılı

- Önem: Orta · Güven: Kesin · Standart: ISO/IEC 25010 (bakım kolaylığı), belge doğruluğu
- Yer:
  - `README.md:3-6` (sürüm durumu)
  - `README.md:20-21` ve `:23-35` ("Highlights (planned)", "crossfeed (planned)" iki kez, "five WebGL2 scenes")
  - `CLAUDE.md:28-29` ("crossfeed planlanıyor (yol haritası)")
  - `CLAUDE.md` Görsel güvenlik ("Faz 2'de bu kural … denetlenebilir hale gelir")
  - `src-tauri/src/commands.rs:67` (`phase: "Faz 2"`)
  - `components.test.tsx:449` (`/Faz 2 · Sürüm/`)
- Kanıt:
  - README: "Phase 1 (a playing program) is complete and Phase 2 (the Visual Director) is in progress … drives five
    WebGL2 scenes".
  - ROADMAP: Faz 2'nin bütün maddeleri `[x]`, Faz 3'ün bütün maddeleri `[x]` (crossfeed 0.0.54), Faz 4'ten kinetik
    sözler (0.0.56) ve açık şarkı haritası (0.0.55) bitmiş.
  - Beş sahneden yalnızca üçü WebGL2 kullanıyor: Gece göğü (`SkyScene`), Gece otoyolu (`HighwayScene`) ve Gece
    sürüşünün ön camı. VU ibreleri ve spektrum SVG/DOM ile çiziliyor (`VuScene.tsx`, `SpectrumView.tsx` importları).
  - CLAUDE.md'nin "Ürün" bölümü crossfeed'i "planlanıyor" diye anıyor; aynı dosyanın mimari ağacında
    `audio/crossfeed.rs`, `useCrossfeed` ve `lib/crossfeed` var.
  - "Photosensitivity-safe", "Pro audio" gibi bitmiş özellikler README'de "Highlights (planned)" başlığı altında.
- Senaryo ve etki:
  - README'yi okuyan bir kullanıcı programı olduğundan geride sanar (crossfeed yok, güvenli mod plan aşamasında).
  - CLAUDE.md'yi okuyan yeni bir oturum, crossfeed'i "yapılacak iş" diye ele alabilir.
  - Ayarlar > Program "Faz 2" yazdığı için hata kayıtlarında faz bilgisi yanıltıcı olur. Test de bu eski değeri
    kilitliyor.
- Öneri:
  - README'nin ilk paragrafını ROADMAP'e bağlayın: "Faz 1–3 tamamlandı, Faz 4 (v1.0) sürüyor". "Highlights
    (planned)" başlığını "Highlights" yapın; gerçekten planlı olanları (15+ sahne, MilkDrop, kod imzalama) ayrı
    yazın. "five WebGL2 scenes" yerine "five scenes (three WebGL2)" yazın.
  - CLAUDE.md'den "crossfeed planlanıyor" ve "Faz 2'de … hale gelir" ifadelerini çıkarın.
  - `AppInfo.phase` değerini ROADMAP ile eşleyin; ya da kaldırıp yalnızca sürüm ve derleme kodunu gösterin.

### BEL-06 — README'nin "Checks (the same ones CI runs)" bloğu temiz bir klonda çalışmıyor ve CI'nın bütün denetimlerini içermiyor

- Önem: Orta · Güven: Yüksek (Tauri'nin `frontendDist` gereksinimi: CLAUDE.md'nin kendi notu ve
  `ci.yml:73` yorumu) · Standart: ISO/IEC 25010 (taşınabilirlik ve kurulabilirlik), OpenSSF (yeniden üretilebilir
  denetim)
- Yer: `README.md:80-86`
- Kanıt:
  ```
  README.md:83  npm run check:commands && npm run check:licenses && npm run check:audio && npm run check:notices
  README.md:84  cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
  README.md:85  cd src-tauri && cargo deny check licenses bans sources advisories
  CLAUDE.md     "Not: Rust derlemesi için önce `npm run build` ile `dist/` oluşturulmuş olmalıdır."
  ci.yml:73-77  # Tauri, derleme sırasında arayüz dosyalarını (dist/) gömer.  → npm run build
  ci.yml:132-134 (cd src-tauri && cargo fetch --locked --target x86_64-pc-windows-msvc); npm run check:notices
  third-party-notices.mjs:79  throw new Error(`${file} bulunamadı; önce 'cd src-tauri && cargo fetch --locked --target …'`)
  ```
  Bloğun dört eksiği var:
  1. `npm run build` yok: `dist/` olmadan `tauri::generate_context!` derlenmez.
  2. `check:notices`'tan önce Windows hedefinin `cargo fetch` adımı yok; temiz makinede betik "bulunamadı" hatası
     verir.
  3. Satırlar tek kabukta art arda yapıştırılırsa ikinci `cd src-tauri` başarısız olur (zaten o klasördesiniz).
  4. CI'nın `check:scenes`, `npm audit --omit=dev`, "Arayüz tipleri güncel mi" ve `--locked` adımları blokta yok.
- Senaryo ve etki: Katkı yapmak isteyen biri ya da yeni bir oturum README'deki bloğu çalıştırır, derleme hatası alır
  ya da "her şey yeşil" sanıp CI'da kırmızıyla karşılaşır.
- Öneri: Bloğu CI'nın sırasıyla yazın:
  1. `npm ci && npm run build`
  2. Arayüz denetimleri.
  3. `(cd src-tauri && cargo fetch --locked --target x86_64-pc-windows-msvc) && npm run check:notices`
  4. Tek bir `cd src-tauri` altında Rust denetimleri, `--locked` ile.
  5. `cargo install cargo-deny` notu.

  "the same ones CI runs" yerine "the main checks CI runs" yazın.

### BEL-07 — CLAUDE.md'nin mimari ağacı gerçek dosya ağacıyla eşleşmiyor (en önemlisi `data_dirs.rs` yok)

- Önem: Orta · Güven: Kesin · Standart: ISO/IEC 25010 (bakım kolaylığı: analiz edilebilirlik)
- Yer: `CLAUDE.md` "Mimari" bölümü
- Kanıt: `find src src-tauri/src scripts -type f` çıktısı (`belge/agac.txt`, 233 dosya) CLAUDE.md'deki adlarla
  karşılaştırıldı. Ağaçta olmayanlar:
  - **Rust:** `src-tauri/src/data_dirs.rs` (veri klasörlerinin Roaming/Local ayrımı ve taşıma) ve
    `audio/test_util.rs` (yalnızca testlerde, önemsiz).
  - **Hook'lar:** `useKeyboardFocus`, `usePlayer` (`useLivePosition` dahil; MIMARI bu ada atıf yapıyor).
  - **lib:** `analysis`, `clock`, `drop`, `eq`, `marks`, `scene`, `sceneClock`, `virtual`,
    `usePrefersReducedMotion`. Sonuncusu bir hook ama `lib/` altında; CLAUDE.md'ye göre `lib/` saf yardımcılar
    içindir.
  - **Bileşenler:** ağaç yalnızca 5'ini adıyla anıyor. `SceneStage`, `SpectrumDemo`, `Dock`, `SettingsPanel` gibi
    karşılama ekranını oluşturan bileşenler adsız.
- Senaryo ve etki:
  - CLAUDE.md her oturumun talimatı. Veri klasörü düzenini belirleyen `data_dirs.rs`'i bilmeyen bir oturum,
    sahibine yanlış klasör tarif eder (bu tam olarak BEL-02 ve BEL-03'te oldu) ya da ikinci bir klasör mantığı yazar.
  - `usePrefersReducedMotion`'ın yeri, "hook'lar `hooks/`'ta" kuralıyla çelişiyor.
- Öneri:
  - Ağaca `data_dirs.rs # veri klasörleri: Roaming (ayarlar, işaretler, haritalar) / Local (kütüphane, önbellek,
günlük), eski sürümden taşıma` satırını ekleyin.
  - Hook ve lib listelerini tamamlayın. `usePrefersReducedMotion`'ı `hooks/`'a taşıyın.
  - Ağacın güncelliğini `check:commands` gibi küçük bir betikle denetleyin (her `src/hooks`, `src/lib` ve
    `src-tauri/src/**` dosya adı CLAUDE.md'de geçiyor mu?).

### BEL-08 — Hata günlüğünde derleme kodu ve Windows sürümü yok; form tersini söylüyor, sürüm alanı da zorunlu değil

- Önem: Orta · Güven: Kesin · Standart: ISO/IEC 25010 (güvenilirlik: hata bulunabilirliği), OWASP ASVS V7
  (günlük içeriği)
- Yer:
  - `src-tauri/src/diagnostics.rs:39-44`
  - `.github/ISSUE_TEMPLATE/hata-kaydi.yml` (`surum` alanı ve `gunluk` alanının açıklaması)
  - `src-tauri/build.rs:2-3`
- Kanıt:
  ```
  diagnostics.rs:39  info(&format!("Lyraska {} başladı · {} {}", env!("CARGO_PKG_VERSION"),
                       std::env::consts::OS, std::env::consts::ARCH));   → "Lyraska 0.0.56 başladı · windows x86_64"
  build.rs:2-3  "aynı sürüm numarasıyla birden çok test sürümü çıktığı için hata kayıtlarında derlemeyi ayırt eder"
  grep LYRASKA_COMMIT → yalnızca commands.rs:66 (AppInfo); günlükte yok
  hata-kaydi.yml: "Dosyada program sürümü, Windows sürümü ve hata mesajları vardır"
  hata-kaydi.yml: id: surum … (validations yok → zorunlu değil); id: windows (zorunlu değil)
  ```
  - `std::env::consts::OS` yalnızca "windows" verir; Windows 10 mu 11 mi, hangi derleme, bilinmez.
  - Derleme kodu (commit) günlükte yok. Oysa aynı sürüm numarasıyla birden çok derleme yayımlanıyor ve semboller
    commit'e göre saklanıyor (`test-surumu.yml`: `semboller-<sürüm>-<sha>`).
- Senaryo ve etki: Kullanıcı yalnızca günlüğü ekler, sürüm ve Windows alanlarını boş bırakır (ikisi de isteğe
  bağlı). Geliştirici çökme yığın izini hangi derlemenin sembolleriyle çözeceğini bilemez, Windows sürümüne bağlı bir
  hatayı (ör. WASAPI) ayıramaz.
- Öneri:
  - `diagnostics::init` açılış satırına `env!("LYRASKA_COMMIT")` ve Windows sürümünü ekleyin (`RtlGetVersion` ya da
    kayıt defterindeki `CurrentBuild`; `unsafe` gerektirmeyen bir crate ile).
  - Ya da formdaki cümleyi "program sürümü ve hata mesajları" olarak düzeltin ve `surum` alanını
    `validations: required: true` yapın.

### BEL-09 — Formun "Sorun nerede?" seçenekleri bugünkü programın bölümlerini kapsamıyor; "Sağ üstteki Ayarlar düğmesi" yazısız bir simge

- Önem: Düşük · Güven: Kesin · Standart: ISO/IEC 25010 (kullanılabilirlik), WCAG 2.2 3.3.2 (Etiketler ve
  Yönergeler, formun yönergesi olarak)
- Yer: `.github/ISSUE_TEMPLATE/hata-kaydi.yml` (`bolum` seçenekleri; `surum` ve `gunluk` açıklamaları);
  `src/components/PlayerScreen.tsx:335` ve `:62-68`
- Kanıt:
  - Seçenekler: Kurulum / Açılış ve karşılama / Şarkı çalma ve ses / Müzik kütüphanesi / Görseller / Ekolayzer ve
    ses ayarları / Diğer.
  - Programın çekmece sekmeleri: Kütüphane, Ekolayzer, **İşaretle, Senkron, Kör test, Ayarlar**
    (`PANELS`, `PlayerScreen.tsx:62-68`). Bunlara ek olarak **Şarkı sözleri** ve **Şarkı haritası dosyası** var.
  - Ayarlar düğmesi `chromeButton("settings", "Ayarlar", <SettingsIcon />)`: yalnızca simge. Metin yalnızca
    `title`/`aria-label`'da. Sinema görünümünde düğmeler çekiliyor (`is-cinema`).
- Senaryo ve etki:
  - Senkron, kör test ya da sözlerle ilgili hatalar "Diğer"e düşer ve önceliklendirme zorlaşır.
  - Teknik olmayan bir kullanıcı "Ayarlar düğmesi"ni yazı olarak arar, dişli simgesi olduğunu bilmez.
- Öneri:
  - Seçeneklere "İşaretleme / şarkı haritası dosyası", "Senkron (ses–görüntü)", "Kör test", "Şarkı sözleri" ve
    "Ayarlar" ekleyin.
  - Açıklamayı "Sağ üstteki dişli simgesine (Ayarlar) basın; düğmeler görünmüyorsa fareyi oynatın" yapın.

### BEL-10 — Üç MIT crate'inin lisans metni ve telif satırı programla dağıtılmıyor

- Önem: Düşük · Güven: Kesin · Standart: MIT lisansı ("The above copyright notice and this permission notice shall
  be included in all copies or substantial portions"), SPDX
- Yer: `public/lisanslar/UCUNCU-TARAF.txt` (`realfft 3.5.0`, `webview2-com 0.39.1`, `webview2-com-sys 0.39.1`)
- Kanıt:
  ```
  $ grep -c "pakette lisans dosyası yok; lisans ifadesi" public/lisanslar/UCUNCU-TARAF.txt  → 3
  realfft 3.5.0 / Lisans: MIT / (pakette lisans dosyası yok; lisans ifadesi yukarıda, metin için kaynak deposuna bakın)
  ```
  LISANSLAR.md bunu "Sınır" olarak açıkça kabul ediyor. Telif sahibinin adı ise dosyanın hiçbir yerinde yok.
- Senaryo ve etki: Uyumluluk açısından teknik bir eksik: ikili dağıtımda bu üç paketin telif bildirimi yok. Pratik
  risk düşük.
- Öneri: `third-party-notices.mjs`'e küçük bir `MANUAL_NOTICES` tablosu ekleyin (crate adı → yukarı akış deposundaki
  `LICENSE` metni ve telif satırı; metin depoda `scripts/notices/` altında tutulsun).

### BEL-11 — Programın içinde GPL metni görüntülenemiyor; lisans adı ve garanti yokluğu eksik

- Önem: Düşük · Güven: Kesin (yükümlülük yorumu: Yüksek) · Standart: GPL-3.0 §4 ve §6 ("give all recipients a copy
  of this License"), §0 ve §5(d) ("Appropriate Legal Notices"), SPDX (`GPL-3.0-only`)
- Yer: `src/components/SettingsPanel.tsx:208-213`; `public/lisanslar/` (yalnızca `Inter-OFL-1.1.txt` ve
  `UCUNCU-TARAF.txt` var)
- Kanıt:
  - `"Lyraska özgür yazılımdır (GNU GPL 3.0). Kaynak kodu: github.com/gozlemesevdalisi/Lyraska"`.
  - "yalnızca sürüm 3" (`-only`) bilgisi, garanti verilmediği ve lisans metnine nasıl ulaşılacağı yazmıyor.
  - Lisans metni yalnızca kurulum sihirbazında gösteriliyor (`tauri.conf.json:36 "licenseFile": "../LICENSE"`).
    Kurulumdan sonra kullanıcının programda ya da kurulum klasöründe GPL metnine ulaşacağı bir yer görünmüyor (NSIS
    şablonunun dosyayı kopyalayıp kopyalamadığı doğrulanamadı; bkz. Olası riskler).
- Senaryo ve etki:
  - Proje kendi kodunun lisans veren tarafı olduğu için bu katı bir ihlal değil.
  - Ama ikili dosyayı yeniden dağıtan biri için gereken bilgiler eksik kalıyor. Kaynak adresi de BEL-01'deki eski ada
    gidiyor.
- Öneri:
  - `LICENSE`'ı `public/lisanslar/GPL-3.0.txt` olarak kopyalayın ve Lisanslar bölümünde
    `<details>` ile gösterin (UCUNCU-TARAF.txt gibi).
  - Metni şöyle yazın: "Lyraska, GNU GPL sürüm 3 (yalnızca bu sürüm) ile lisanslanmıştır ve HİÇBİR GARANTİ
    VERİLMEZ. © 2026 Lyraska katkıcıları."

### BEL-12 — Karşılamadaki gösteri spektrumu etiketsiz ve güvenli modu dinlemiyor; parlama testi yok

- Önem: Düşük · Güven: Kanıtlandı (parlama benzetimi), Kesin (kod) · Standart: WCAG 2.2 2.3.1 (Üç Parlama ya da Eşik
  Altı), 2.2.2 (Duraklat, Durdur, Gizle), 2.3.3 (Etkileşimden Doğan Animasyon)
- Yer:
  - `src/components/SpectrumDemo.tsx:59-122`
  - `src/components/SceneStage.tsx:45-58` (`safe` gösteriye verilmiyor)
- Kanıt:
  - `SpectrumDemo`'nun `safe` parametresi yok. Her 12 karede bir (480 ms) "vuruş" var (`s.frame % 12 === 0`);
    bantlar ayrıca her karede %18 olasılıkla yeni hedef alıyor.
  - Benzetim (`belge/demo_parlama.txt`) şunu verdi:

    ```
    worstFlashesPerSec_341pxWindow: 0, wholeMatrixWorst: 0, maxRegionLum: 0.067,
    bassColumnLitFractionChangesPerSec_notWCAG: 3
    ```

    Bölge ortalamasında bağıl parlaklık en fazla 0,067'ye çıkıyor, %10'luk zıt değişim hiç olmuyor. WCAG 2.3.1
    **geçiliyor**.

  - Bir bas sütununun kendi doluluğu saniyede 3'e kadar yükselip iniyor. Bu, güvenli modun "≤ 1 nabız/sn" sözünün
    ruhuna aykırı (o söz Görsel Yönetmen'in nabızları için yazılmış).
  - Gösteri ekranda hiçbir yerde "gösteri" diye anılmıyor. Kodda "Gerçek ses verisi değildir" yorumu var ama
    ekranda yok.
  - Animasyon bileşenin içinde; `flash.ts` ile sınanan saf bir fonksiyon değil. Diğer sahnelerin parlama testi var
    (`sky`, `highway`, `vu`, `stageLight`), bunun yok.
- Senaryo ve etki:
  - Kullanıcı spektrum sahnesini seçip programı kapattıysa, sonraki açılışta şarkı yokken ~120 BPM'lik bir vuruşla
    "müzik çalıyor gibi" hareket eden bir ekran görür. Bunu bir sesin (ör. mikrofonun) dinlendiği ya da bir şeyin
    çaldığı şeklinde yorumlayabilir.
  - Işığa duyarlı ve güvenli modu açmış bir kullanıcı, bu ekranda modun etkisini görmez.
- Öneri:
  - Gösteri boştayken spektrum sahnesine küçük bir "Gösteri — şarkı açınca gerçek spektrum" yazısı koyun.
  - `SpectrumDemo`'ya `safe` verin; güvenli modda vuruşu kapatın ya da hedef değişimini ≤ 1/sn yapın.
  - Benzetim adımını saf bir fonksiyona (`lib/spectrumDemo.ts`) ayırın ve `countFlashes` ile test edin.

### BEL-13 — Güvenlik açığı bildirme yolu yok (SECURITY.md yok, form herkese açık)

- Önem: Düşük · Güven: Kesin · Standart: OpenSSF Scorecard "Security-Policy"
- Yer: depo kökü ve `.github/` (`SECURITY.md` yok); `.github/ISSUE_TEMPLATE/config.yml` (yalnızca
  `blank_issues_enabled: true`)
- Kanıt: `git ls-files | grep -i security` boş.
- Senaryo ve etki: Program güvenilmeyen ses ve harita dosyaları açıyor. Bir ayrıştırıcı açığı bulan biri bunu
  herkese açık hata formuna yazar ve açık, düzeltme yayımlanmadan önce ifşa olur.
- Öneri:
  - Kısa bir Türkçe `SECURITY.md` ekleyin: GitHub'ın "Private vulnerability reporting" özelliğini anlatsın.
  - `config.yml`'e `contact_links` ile "Güvenlik açığı bildir" bağlantısı koyun.

### BEL-14 — LISANSLAR.md'deki Inter açıklamasında küçük yanlışlar; telif sahibi adı tutarsız

- Önem: Bilgi · Güven: Kesin · Standart: OFL-1.1 (koşul 3: Reserved Font Name)
- Yer: `docs/LISANSLAR.md:33-35`, `src-tauri/tauri.conf.json:34`, `src-tauri/Cargo.toml:5`
- Kanıt:
  - LISANSLAR.md: "değiştirilirse 'Inter' adıyla dağıtılamaz. Lyraska yazı tipini değiştirmeden kullanır".
  - Ama `Inter-OFL-1.1.txt`'nin ilk satırında Reserved Font Name yok; OFL'nin ad kısıtı yalnızca ayrılmış adlar
    için geçerli. Fontsource paketi de zaten alt kümelere ayrılmış woff2'ler (dönüştürülmüş biçim).
  - Telif sahibi bir yerde "Lyraska katkıcıları" (`tauri.conf.json`), başka bir yerde "Lyraska geliştiricileri"
    (`Cargo.toml`) diye geçiyor.
- Öneri: Cümleyi "Inter'in ayrılmış yazı tipi adı yoktur; Fontsource'un alt kümelere ayrılmış woff2 dosyaları
  kullanılır" olarak düzeltin. Telif adını tek biçimde tutun.

### BEL-15 — Karşılamadaki küçük üst satırın kontrastı sınırda

- Önem: Bilgi · Güven: Kesin (koyu zeminde) · Standart: WCAG 2.2 1.4.3 (Kontrast, en az 4,5:1)
- Yer: `src/styles/global.css:485-496` (`.now__over`, `--ink-3`, 12 px, büyük harf)
- Kanıt (`belge/kontrast.txt`):
  - `--ink-3` metni `--bg #02040b` üstünde **4,68:1**, `--sky-horizon` üstünde 4,61:1. AA geçiliyor ama pay %3.
  - `--ink` (başlık) 19,07:1, `--ink-2` (davet cümlesi) 9,75:1.
  - Gölge katmanı olmadan parlak kuzey ışığı üstüne denk gelirse oran 1,1'e düşer. Alt kenardaki %82 gölge ve
    `text-shadow` bunu bugün önlüyor.
- Öneri: `--ink-3`'ü 0,48'den 0,56'ya çıkarın (≈ 5,9:1). İleride gölge katmanı değişirse kontrast kendiliğinden
  düşmesin.

## 4. Olası riskler (kanıtı yetmeyenler)

- **Lisans bildirimlerinin karakter kodlaması:** `UCUNCU-TARAF.txt` BOM'suz UTF-8 ve `<iframe src=…txt>` ile
  gösteriliyor (`SettingsPanel.tsx:222-226`). Tauri, `.txt` dosyasını `charset`'siz `text/plain` olarak sunuyorsa
  WebView2 Türkçe Windows'ta Windows-1254 varsayabilir; "Ü", "ş" gibi harfler bozuk görünür. Windows'ta denenemedi.
  Önlem: metni `fetch` edip `<pre>` içinde gösterin.
- **Derleme kodu ile Release notu ayrışabilir:** `build.rs` commit'i `GITHUB_SHA`'dan alıyor. `workflow_run`
  olayında `GITHUB_SHA` varsayılan dalın o anki son commit'idir, oysa derlenen `head_sha`'dır
  (`test-surumu.yml:46-50`). CI bittikten hemen sonra `main`'e yeni bir push gelirse, programda yazan derleme kodu
  Release notundakiyle farklı olabilir. Pencere dar çünkü CI, `main`'deki yeni push'ta iptal ediliyor. Önlem:
  derleme adımına `env: GITHUB_SHA: ${{ steps.kaynak.outputs.sha }}` verin.
- **NSIS kurulumu GPL metnini kopyalıyor mu?** Tauri'nin NSIS şablonu `licenseFile`'ı yalnızca lisans sayfasında
  gösteriyor olabilir. Şablon bu ortamda yoktu (BEL-11'in önemi buna göre Düşük tutuldu).
- **`.log` eki:** Form, kullanıcıdan `lyraska.log`'u kutuya sürüklemesini istiyor. GitHub'ın desteklenen ek türleri
  arasında `.log`'un olduğu biliniyor, ama belge bu ortamdan açılamadı. Yaklaşık 2 MB'lık iki dosyalı günlük (rotasyon)
  boyut sınırının altında.
- **Eski kullanıcı adının bugünkü durumu** (BEL-01) doğrulanamadı. Ad şu an boştaysa BEL-01 fiilen Kritik'tir.

## 5. Temiz bulunanlar

- **Sürüm tutarlılığı:** `package.json` 0.0.56 = `Cargo.toml` 0.0.56 = `Cargo.lock` (lyraska) 0.0.56 =
  `package-lock.json` 0.0.56. `tauri.conf.json` sürümü `../package.json`'dan alıyor. Eşitlik testle denetleniyor
  (`commands.rs:866-875`).
- **Issue formu şeması:**
  - Anahtarlar `name/description/title/labels/body` geçerli.
  - 10 id tekil ve kurala uygun. Alan türleri (markdown, dropdown, textarea, input, checkboxes) doğru anahtarları
    kullanıyor.
  - Zorunlu alanlar `validations.required` ile işaretli. `hata` etiketi depoda var (`gh api …/labels`).
- **Formun anlattığı yol gerçek:** Ayarlar > "Program" başlığı (`SettingsPanel.tsx:185`), "Sürüm … · <commit>"
  satırı ve "Hata günlüğü" düğmesi var. Düğme `explorer /select,"…"` ile dosyayı seçili gösteriyor (boşluklu kullanıcı
  adları için tırnaklama doğru, `commands.rs:765-773`).
- **Kişisel veri uyarısı yeterli:** Formda dosya yolu ve kullanıcı adının görünebileceği, Not Defteri ile
  bakılabileceği ve şarkıların dosyada olmadığı yazıyor. Günlük hiçbir yere gönderilmiyor (`diagnostics.rs:1-6`).
  "Işık hassasiyeti" onay kutusu iyi bir uygulama.
- **Release notları:** Sürüm, commit, SHA-256, kurulum adımları ve "yönetici izni istemez" bilgisi var. Bu bilgi
  `installMode: currentUser` ile tutarlı.
- **GPL kaynak erişimi (§6(d)):** `test-surumu` etiketi derlenen commit'e taşınıyor. Release sayfasında GitHub'ın
  otomatik "Source code" arşivleri ve commit bağlantısı var; kaynak, ikili dosyayla aynı yerden ücretsiz alınabiliyor.
  Derleme betikleri ve `Cargo.lock` depoda.
- **Üçüncü taraf bildirimleri:** 185 paket ve sonda bütün metinler var; CI bayatlığı denetliyor. Apache NOTICE
  dosyaları da toplanıyor (`LICENSE_FILE` düzeni NOTICE'i içeriyor). Symphonia (MPL-2.0) için kaynak deposu yazılı;
  Exhibit B olmadığından GPL-3.0 ile uyumlu.
- **Inter (OFL-1.1):** `public/lisanslar/Inter-OFL-1.1.txt`, paketteki `LICENSE` ile bayt bayt aynı (`diff`).
  `UCUNCU-TARAF.txt` da OFL metnini içeriyor. Yalnızca `opsz.css` içe aktarılıyor (`main.tsx:6`), söylendiği gibi.
- **`deny.toml`:** Gerçek bir izin listesi. AGPL ve ticari kullanım yasaklayan lisanslar listede yok;
  `unknown-registry/git = deny`.
- **Karşılama ekranı:**
  - `<html lang="tr">` var; büyük harfe çevirmede "İ" doğru çıkıyor.
  - Tek h1 "Lyraska" ve `aria-label="Çalan şarkı"` bölümü var.
  - Çekmece kütüphane açık başlıyor; boş kütüphanede "Klasör ekle" ve "Şarkı ekle" yönergeleri var. Sürükle-bırakın
    tek dokunuşlu alternatifi mevcut (WCAG 2.5.7).
  - Sekmeler ARIA örüntüsüne uygun (ok tuşları, Home/End). Odak çekmeceden açan düğmeye geri dönüyor.
  - `prefers-reduced-motion` gösteride, sahnelerde ve CSS geçişlerinde uygulanıyor.
  - Hata mesajı kehribar renkli ve yanıp sönmüyor.
  - Karşılama testi var (`components.test.tsx:440-462`).
- **WCAG 2.3.1:** Gösteri spektrumunun benzetimi 341 px'lik her pencerede ve matrisin tamamında 0 parlama verdi.
- **Çalışan denetim betikleri:** `check:commands` (54 komut eşleşiyor), `check:audio` ve `check:licenses` temiz.
  CLAUDE.md'deki komut tablosunda adı geçen bütün npm betikleri `package.json`'da var.
- **CLAUDE.md'nin diğer içeriği doğru:** `cache::VERSIONS` beş parça, sabit Rust araç zinciri ve Windows clippy
  notu kodla tutarlı. Git akışı kuralları birbiriyle çelişmiyor.

## 6. Öncelikli düzeltme sırası

1. **BEL-01:** Eski `gozlemesevdalisi` adını proje sahibine hemen geri aldırın (boş hesap). Ardından bütün linkleri
   `lahmacunveayran/Lyraska`'ya çevirin; `npm run notices` ile bildirimleri yeniden üretin.
2. **BEL-02 ve BEL-03:** README, MIMARI ve `library/mod.rs`'te veri klasörünün doğru adını ve neyin silinince
   kaybolacağını yazın. DOGRULAMA A0'ı Local klasörüne göre düzeltin.
3. **BEL-04:** `check-licenses.mjs`'i `deny.toml` izin listesini okuyan bir denetime çevirin ve sahte paketli
   testini ekleyin.
4. **BEL-08:** Günlüğün açılış satırına derleme kodunu ve Windows sürümünü ekleyin. Formdaki cümleyi düzeltin, sürüm
   alanını zorunlu yapın.
5. **BEL-05:** README durumunu ROADMAP ile eşleyin. CLAUDE.md'den "crossfeed planlanıyor" ifadesini çıkarın.
   `AppInfo.phase` değerini ve onu kilitleyen testi güncelleyin.
6. **BEL-07:** CLAUDE.md ağacına `data_dirs.rs` ve eksik hook/lib dosyalarını ekleyin; bir ağaç denetimi betiği
   yazın.
7. **BEL-06:** README'nin denetim bloğunu CI sırasıyla ve `npm run build` / `cargo fetch` adımlarıyla yeniden
   yazın.
8. **BEL-09:** Forma eksik bölümleri ekleyin; Ayarlar düğmesini "dişli simgesi" diye tarif edin.
9. **BEL-11 ve BEL-10:** GPL metnini programa koyun ("yalnızca sürüm 3", garanti yok). Üç crate'in telif metnini
   elle eklenen bildirimlerle tamamlayın.
10. **BEL-12, BEL-13, BEL-15:** Gösteriye etiket koyun, güvenli moda bağlayın ve parlama testi yazın. `SECURITY.md`
    ekleyin. `--ink-3` kontrastını artırın.
