# İskelet — bağımsız denetim raporu (Faz 0)

Denetlenen commit: `9ae1b6d` (dal `ccr-e33a525d-dywq26`, sürüm 0.0.61). Önek: `ISK-`.

## 1. Özet

- **Puan (a) depodaki kod ve yapılandırma: 7/10.** İskelet taşıyıcı: kalıcılık katmanı örnek düzeyde
  (bölünmez yazma, sıralı ve işlemli göçler, bozuk veritabanını kenara alma, ileriye uyumlu ayarlar). Ama
  kurallardan birini zorlayan kapı CI'da hiç koşmuyor. Oynatıcı kilidi altında hâlâ yavaş işler var.
- **Puan (b) GitHub ayarları dahil: 5/10.** `main` dalı korumasız (`protected: false`, kural seti yok). CI kırmızıyken
  birleştirmeyi ya da `main`'e doğrudan push'u hiçbir şey engellemiyor; bkz. "Proje sahibinin ayarına bağlı".
- **Yüksek — ISK-01:** `check:rules` (atlanan test yasağı, `unsafe` istisnası, sıkı CSP, dar Tauri izinleri) hiçbir
  CI iş akışında çalışmıyor. README "CI'ın koştuğu denetimler" diye listeliyor. Mutasyonla gösterildi: `it.skip` ve
  CSP'ye `'unsafe-inline'` eklemek CI'daki bütün kapılardan yeşil geçiyor.
- **Orta — ISK-02:** Tek `Mutex<Player>` altında yavaş iş sürüyor: aygıt değişiminde yeniden açma (300 ms kısılma +
  3 sn'ye kadar ön dolum + aygıt açma) her görsel karenin ve durum sorgusunun içinden çağrılıyor. Bit-perfect
  değişimi, kör test kurma/kapama ve sıradaki şarkının analizinin başlatılması da kilit altında. Bu, belgelenen
  "komutlar kısa sürer" kuralına aykırı.
- **Orta — ISK-03:** Çökme döngüsü koruması yalnızca arka plan analizini kapsıyor. Açılışta kendiliğinden başlayan
  kütüphane taraması etiket okurken bir dosyada panik olursa (`panic = "abort"`), program her açılışta aynı dosyada
  kapanır.
- **Orta — ISK-04:** `Player` 1946 üretim satırlık, 55 açık yöntemli bir "tanrı nesnesi". 55 komutun neredeyse hepsi
  (60 kare/sn görsel sorgu dahil) aynı kilitten geçiyor; kilitsiz kanallı DSP ayarları bile.
- Temiz bulunanlar: gerçek zamanlı ses yolunda ayırma veya kilit yok. Kütüphane kodunda
  `unwrap`/`expect`/`panic!` yok. Arayüze giden her tür camelCase + ts-rs ile üretiliyor. `backend.ts` tek köprü.
  TS'de döngüsel bağımlılık yok. `check:commands` ve `check:docs` mutasyonda gerçekten kırmızı oluyor.

## 2. Kapsam ve yöntem

**Okunan dosyalar (9ae1b6d'nin temiz kopyasında):** `src-tauri/src/commands.rs` (tamamı), `lib.rs`, `main.rs`,
`diagnostics.rs` (tamamı, son commit'in `notice_dialog` değişikliği dahil), `settings.rs`, `atomic_file.rs`,
`data_dirs.rs`, `file_manager.rs`, `storage.rs` (göç çerçevesi), `library/db.rs` (açılış, bozulma kurtarma),
`library/scan.rs` (tarama işçileri), `library/service.rs` (kilit, kapanış), `analysis/cache.rs` (bağlantı kilidi),
`analysis/annotation.rs` (eşzamanlı yazma), `analysis/background.rs` (CrashGuard, durdurma).
`audio/player.rs`'ten Session, Analysis, Transition/prepare/install, abx_*, set_next, set_playback_options,
visual_now ve status. `audio/output/wasapi.rs` gerçek zamanlı döngü. `audio/decode.rs` `open`. `Cargo.toml`
`[lints]`/`[profile]`, `clippy.toml`, `tauri.conf.json`, `capabilities/default.json`. `src/main.tsx`, `src/App.tsx`,
`src/lib/backend.ts`, `src/lib/errorReporting.ts`, `src/components/ErrorBoundary.tsx`, `PlayerScreen.tsx`
(hata sınırları), `src/hooks/useEqualizer.ts` (istek birleştirme), `useParametric.ts`, `useCrossfeed.ts`,
`useVisualFeed.ts`, `usePlayer.ts` (yoklama). `scripts/check-rules.mjs`, `scripts/check-commands.mjs`,
`.github/workflows/*.yml`, `README.md` (denetim listesi), `docs/MIMARI.md` (iş parçacığı tablosu, kural tablosu).
Tauri 2.12.1 kaynağı (`app.rs`'te `setup` sırası) ve wasapi 0.25.0 kaynağı (`write_to_device`) da okundu.

**Çalıştırılan komutlar ve deneyler:**

- Önce `/home/user/Lyraska`'nın çalışma ağacında okumaya başladım. Okuma sırasında ağaç başka bir işin birleştirmesi
  yüzünden değişti (`UU` dosyalar, `milkdrop` modülü). Denetim bu yüzden kendi klasörümde `git clone` +
  `git checkout 9ae1b6d` kopyasında sürdürüldü. Bulgularda alıntılanan her satır o kopyadan doğrulandı.
  `commands.rs` ve `player.rs` 57f3e7b ile 9ae1b6d arasında değişmedi (`git diff --stat` boş).
- Mutasyon sınamaları (kopyada, `node_modules` sembolik bağla): `it.skip`, CSP gevşetme, izin ekleme,
  `check:commands` için argüman adı değişikliği ve Rust parametre ekleme, `check:docs` için belgelenmemiş dosya.
- Ölçek: üretim/test satır sayımları, Serialize türü taraması (Python betiği), TS import döngüsü ve içe
  aktarılmayan modül taraması (Node betiği), kullanılmayan dışa aktarım taraması, modüller arası `crate::` bağımlılık
  sayımı, test dışı `unwrap`/`expect`/`panic!` ve değişkenli indeks taraması.
- `gh api repos/lahmacunveayran/Lyraska/branches/main` ve `.../rules/branches/main` ile herkese açık okuma yapıldı.

**Sınırlar:** BRIEF gereği Rust derlemesi yapılmadı (`cargo test/clippy` yok). Panik tetikleyen gerçek bir ses dosyası
üretilemedi. Kilit süreleri ölçülmedi, koddan çıkarıldı. Windows'a özel davranış (PowerShell, dosya yeniden
adlandırma) Windows'ta denenmedi.

## 3. Bulgular

### ISK-01 — `check:rules` CI'da koşmuyor; dört kural fiilen denetimsiz

- Önem: **Yüksek** · Güven: **Kanıtlandı** · Standart: OpenSSF Scorecard "CI-Tests"; ISO/IEC 25010 bakım kolaylığı
  (test edilebilirlik); Tauri 2 güvenlik modeli (CSP, capabilities)
- Yer: `.github/workflows/ci.yml` (adım yok), `package.json:21`, `scripts/check-rules.mjs:1-11`, `README.md:89-94`
- Kanıt:
  ```
  $ grep -c "run: npm run check:rules" .github/workflows/*.yml
  ci.yml:0  guvenlik-taramasi.yml:0  test-surumu.yml:0
  $ git log --oneline -S "check:rules" -- .github/workflows/ci.yml   # boş: hiç eklenmemiş
  ```
  Betiği ekleyen commit (`6904ead`) mesajında "Yeni kapılar: check:rules … ve check:docs" diyor; CI'a yalnızca
  `check:docs` eklenmiş. README:89 "Checks (the same ones CI runs…)" başlığı altında `npm run check:rules` sayıyor.
  Mutasyon 1: `src/lib/format.test.ts:32`'de `it(` yerine `it.skip(` yazıldı:
  ```
  check-rules: "src/lib/format.test.ts:32: it.skip — testler atlanmaz"  exit=1
  eslint --max-warnings 0: exit=0 · vitest: "17 passed | 1 skipped" exit=0 · check:docs: exit=0
  ```
  Mutasyon 2: CSP'de `style-src 'self'` yerine `style-src 'self' 'unsafe-inline'` yazıldı. Sonuç: `check:rules`
  exit=1. `check:docs` 0, `check:commands` 0, `vitest` "51 passed / 398 passed". Mutasyon 3: izinlere
  `shell:allow-execute` eklendi. Yalnızca `check:rules` yakaladı.
- Senaryo ve etki: Kodu yapay zekâ oturumları yazıyor, proje sahibi yalnızca CI'nın rengine bakıyor. Son commit'te
  CSP sahne denetimini gerçekten engelledi. Bir sonraki oturum bunu `'unsafe-inline'` ekleyerek ya da inatçı bir
  testi `.skip`/`#[ignore]` ile "çözerse" CI yeşil kalır. CLAUDE.md'nin "Testler atlanmaz", "CSP sıkı",
  "`unsafe` yalnızca WASAPI'de" sözleri sessizce bozulur. `unsafe_code = "deny"` başka dosyada
  `#[allow(unsafe_code, reason=…)]` ile aşılabilir. Bu aşmayı yakalayan tek kapı da bu betik.
- Çürütme denemesi: Kuralları başka bir yer yakalıyor mu diye baktım. `check-docs.mjs` `check-rules`'u çağırmıyor
  (grep boş). ESLint'te atlanan test kuralı yok (mutasyonda exit 0). Rust testlerinde CSP'yi okuyan test yok
  (`grep -rn "unsafe-eval\|csp"` yalnızca betiği buluyor). `check:scenes` CSP'yi gevşetmeyle bozulmaz, aksine
  rahatlar. `guvenlik-taramasi.yml` ve `test-surumu.yml` de koşmuyor. Çürütülemedi.
- Öneri: `ci.yml`'nin `arayuz` işinde "Belgeler ve kurallar kodla uyumlu mu" adımının yanına
  `- name: Proje kuralları` / `run: npm run check:rules` ekleyin. Kapı betiklerinin CI'a bağlı olduğunu da bir
  testle güvenceye alın: `scripts/lib/*.test.mjs` içinde `package.json`'daki her `check:*` betiği `ci.yml`'de geçmeli.

### ISK-02 — Oynatıcı kilidi altında hâlâ saniyeler sürebilen iş var

- Önem: **Orta** · Güven: **Kesin** (kod yolu) / **Yüksek** (süre ortama bağlı) · Standart: ISO/IEC 25010
  performans verimliliği (zaman davranışı), güvenilirlik (kullanılabilirlik)
- Yer: `src-tauri/src/audio/player.rs:983-1004` (`recover_device` → `restart`), `:1560-1561` (`visual_now` içinde
  çağrı), `:1720-1721` (`status` içinde çağrı), `:1453-1474` (`set_playback_options` → `restart`), `:1057-1058`
  (`abx_install` → `close_session` + `prepared.start()`), `:1100` (`abx_stop` → `restart`), `:1129` (`set_next` →
  `Analysis::start`), `:1265` (`adopt_analysis` → `Analysis::start`, `visual_now`'dan); `:51`, `:56`;
  `src-tauri/src/analysis/cache.rs:155,201`; `docs/MIMARI.md:30`
- Kanıt:
  ```rust
  // player.rs:1560
  pub fn visual_now(&mut self) -> Option<VisualData> {
      self.recover_device();
  // player.rs:1003 (recover_device)
      let _ = self.restart(&track.path, resume, Some(position));
  // restart = begin_transition + prepare + install, aynı iş parçacığında, kilit altında:
  // prepare: wait_for_fade_out(FADE_OUT_TIMEOUT = 300 ms) + Decoder::open + wait_for_prefill(PREFILL_TIMEOUT = 3 s) + output::spawn
  ```
  `visual_frame` ve `playback_status` komutları `player.lock()?` altında `visual_now()` / `status()` çağırıyor
  (`commands.rs:269`, `:854`). `Analysis::start` önbellekten okurken (`cache.load`, `cache.rs:201`) arka plan
  analiziyle **ortak** `Mutex<Connection>`'ı bekliyor (`cache.rs:155`, aynı `Arc` `commands.rs:124`'te iki tarafa
  veriliyor). Önbellekte kayıt yoksa dosyayı iki kez açıyor (`player.rs` `start_analysis`). Bütün bunlar oynatıcı
  kilidi tutulurken oluyor. `docs/MIMARI.md:30`: "Tauri komutları | … | Kısa sürer; ağır işi arka plana verir".
  `commands.rs:172-174` "görseller ve durum sorguları bu sırada beklemez" diyor. Bu yalnızca `open_track`, `seek`,
  `stop` ve `toggle` için doğru.
- Senaryo ve etki: Kullanıcı ağ paylaşımındaki (NAS) ya da uyuyan USB diskteki bir şarkıyı dinlerken kulaklığı
  takıyor. İlk gelen `visual_frame` çağrısı kilidi alıp yeniden açmayı onun içinde yapıyor. Ön dolum yavaşsa 3,3 sn'ye
  kadar bütün komutlar bekliyor: görseller, ilerleme çubuğu, ekolayzer ve paneller. Ses yolunun kendisi etkilenmiyor
  (çıkış iş parçacığı bu kilidi almıyor). Bit-perfect anahtarı ve kör test aynı biçimde donduruyor. Yerel SSD'de
  süre yüzlerce ms'ye iniyor. Bu yüzden önem Orta.
- Öneri: `recover_device` ve `set_playback_options` yalnızca `Option<Transition>` döndürsün (`begin_*` kalıbı).
  Komut katmanı (`visual_frame`, `status`, `playback_options_set`) bunu `finish_transition` ile kilit dışında
  hazırlasın. `abx_install`/`abx_stop` için de aynısı yapılsın: `close_session` beklemesi ve `restart` kilit dışına
  çıksın. `Analysis::start`'ı (önbellek okuma + dosya açma) kilit dışında yapın, kilit altında yalnızca sonucu takın.
  Ya da `AnalysisCache` için okuma ve yazma bağlantılarını ayırın (WAL okuyucuyu bekletmez).

### ISK-03 — Çökme döngüsü koruması kütüphane taramasını kapsamıyor

- Önem: **Orta** (tetikleyici kanıtlanırsa Yüksek) · Güven: **Kesin** (koruma yok) / **Olası** (tetikleyici)
  · Standart: ISO/IEC 25010 güvenilirlik (hata toleransı, kurtarılabilirlik)
- Yer: `src-tauri/src/lib.rs:93`, `src-tauri/src/library/scan.rs:209,222`, `src-tauri/Cargo.toml` `[profile.release]`
  `panic = "abort"`, `src-tauri/src/analysis/background.rs:13-16` (korumanın kapsamı)
- Kanıt:
  ```rust
  // lib.rs:93 — her açılışta, kullanıcı bir şey yapmadan
  Ok(service) => service.request_scan(),
  // scan.rs:209 — paralel işçiler, koruma yok
  let info = Decoder::open(path).ok().map(|d| (d.info().clone(), *stamp));
  // scan.rs:222 — okunamayan dosya kaydedilmez, her taramada yeniden denenir
  None => summary.failed += 1,
  ```
  `CrashGuard` yalnızca `analysis/background.rs`'te kullanılıyor (`grep CrashGuard` → background.rs, commands.rs,
  lib.rs). Depoda `catch_unwind` yalnızca bir testte var. Ayrıca `panic = "abort"` altında `catch_unwind` zaten işe
  yaramaz. Kodun kendisi bu sınıfı tanıyor: `decode.rs:101-103` bir WAV başlık hatasının "her açılışta yeniden
  çökertir" olduğunu yazıp yalnızca o tek nedeni kapatıyor.
- Senaryo ve etki: Kullanıcının müzik klasöründe bozuk bir dosya var (yarım indirilmiş, bozuk etiketli). symphonia
  0.6.1'in ayrıştırıcısı bu dosyada panik veriyor (dilim sınırı vb.; sürüm derlemesinde taşma denetimi kapalı, ama
  indeks paniği açık). Program her açılışta taramayı başlatıyor, birkaç saniye içinde aynı dosyada kapanıyor ve bir
  daha kullanılamıyor. Panik günlüğe yazılıyor ama hangi dosyanın suçlu olduğunu söylemiyor: panik symphonia'nın
  içinde, işçi iş parçacığının adı yok. Yazılımcı olmayan kullanıcı dosyayı bulamaz. Gerçek bir panik dosyası
  üretmedim, bu yüzden önem Orta.
- Öneri: `CrashGuard`'ı genelleştirin: `scan.rs` işçisi `Decoder::open`'dan önce yolu bir "okunuyor" dosyasına
  eklesin, sonra silsin. İşçiler paralel çalıştığı için dosyada satır başına bir yol tutulsun. Açılışta
  `CrashGuard::recover` mantığıyla iki kez kapanan dosyayı `skip` kümesine koyup kullanıcıya göstersin. Ayrıca
  `Builder::spawn` ile işçilere ad verin (`lyraska-tarama-N`).

### ISK-04 — `Player` tanrı nesnesi; DSP ayarları bile tek kilitten geçiyor

- Önem: **Orta** · Güven: **Kesin** · Standart: ISO/IEC 25010 bakım kolaylığı (modülerlik, değiştirilebilirlik)
- Yer: `src-tauri/src/audio/player.rs:728-774` (alanlar), `commands.rs:84` (`PlayerState(Mutex<Player>)`),
  `commands.rs:355-616`
- Kanıt: `player.rs` 3571 satır, bunun 1946'sı üretim kodu. 55 `pub fn` var. `Player` 22 alanla oturum yaşam
  döngüsünü, boşluksuz geçişi, analiz düzenlemesini, kör testi, şarkı haritası içe/dışa aktarmayı, aygıt kurtarmayı,
  görsel veriyi ve beş DSP denetimini taşıyor. DSP denetimleri zaten kilitsiz kanallar (`Arc<EqControl>`,
  `Arc<PeqControl>`, `Arc<CrossfeedControl>`, `Arc<LoudnessControl>`). Yine de `equalizer_set`, `crossfeed_set`,
  `parametric_set` vb. önce `player.lock()` alıyor. Saniyede 60 kez gelen `visual_frame` de aynı kilidi kullanıyor.
  Modüller arası bağımlılık sayımı `audio → analysis`, `analysis → audio`, `audio → visual_bridge →
audio`, `analysis ↔ director` döngülerini gösteriyor. Uygulamanın asıl düzenleyicisi `audio` modülünün içinde
  duruyor.
- Senaryo ve etki: Her yeni özellik (MilkDrop, sözler, harita) `Player`'a alan ve yöntem ekliyor. Kilit altında
  yavaş iş hatası (ISK-02) bu yüzden tekrar tekrar ortaya çıkıyor: her yeni yöntem için "kilit altında mı?" sorusu
  elle düşünülmek zorunda. İnceleme ve test maliyeti büyüyor. Çalışma anında ekolayzer sürüklemek, kilit tutan yavaş
  bir işin bitmesini bekliyor.
- Öneri: Kilitsiz kanalları (`EqControl` vb.) açılışta ayrı bir `tauri::State` (ör. `DspState`) olarak yönetin. Ayar
  komutları `Player` kilidine hiç dokunmasın. Kör test (`abx`) ve harita içe/dışa aktarma (`export_song_map`,
  `import_song_map`) için `Player`'dan yalnızca `Arc<Spectrogram>` alan ayrı servisler kurun. Orta vadede
  `player.rs`'i `audio/session.rs` (oturum, geçiş) ve kökte bir `playback/` düzenleyicisi (analiz + görsel) olarak
  bölün.

### ISK-05 — Async komutlarda `spawn_blocking`'siz dosya ve veritabanı işi

- Önem: **Düşük** · Güven: **Yüksek** · Standart: Tauri 2 komut belgesi (async komutlar async çalışma zamanında
  koşar), tokio belgesi ("blocking in async tasks blocks the worker"); ISO/IEC 25010 zaman davranışı
- Yer: `commands.rs:190-195` (`track_cover`: dosyadan kapak + base64), `:200-205` (`track_lyrics`: `Decoder::open`),
  `:286-351` (`library_*`: SQLite, 5 sn `busy_timeout`), `:471-483`, `:562-577` (dosya okuma/yazma), `:627`, `:643`,
  `:770` (`Decoder::open`)
- Kanıt: Bu komutlar `async fn` ama işleri doğrudan async görevde yapıyor. Yalnızca `open_track`, `toggle`/`seek`/
  `stop`, `annotation_evaluate` ve `abx_start` `tauri::async_runtime::spawn_blocking` kullanıyor.
- Senaryo ve etki: Tauri'nin tokio çalışma zamanında çekirdek sayısı kadar işçi var (bu makinede 4). Şarkı
  değişirken `track_cover` + `track_lyrics` + `library_search` (tarama yazarken bekleyen) aynı anda işçileri
  bağlarsa `visual_frame` ve `playback_status` sıraya girer. Arayüz istekleri tek uçuşla sınırladığı için
  (`useVisualFeed.ts:111`, `usePlayer.ts:239`) etkisi sınırlı. Bu yüzden önem Düşük.
- Öneri: Dosya ya da veritabanı dokunan her komutun gövdesini `spawn_blocking`'e alan küçük bir yardımcı yazın
  (`fn blocking<T>(f) -> impl Future<Output=Result<T,String>>`). Komutlar bunu kullansın.

### ISK-06 — Kör test kurulumu süren bir şarkı geçişiyle çakışabilir

- Önem: **Düşük** · Güven: **Kesin** (kod yolu) · Standart: ISO/IEC 25010 güvenilirlik (olgunluk)
- Yer: `player.rs:945-975` (`install` kör testi denetlemiyor), `:1039-1071` (`abx_install` `transition_seq`'i
  artırmıyor; `abx_resume` için `pending`'e bakmıyor)
- Kanıt: `begin_transition` `self.abx = None` yapıyor, sonra kilit bırakılıyor. Bu arada `abx_install` testi
  kuruyor (`self.abx = Some(test)`). Ardından eski geçişin `install`'u `seq == transition_seq` olduğu için oturumu da
  takıyor. Sonuçta paylaşımlı modda iki akış (şarkı + kör test) aynı anda çalıyor. Geçiş sürerken `self.session`
  `None` olduğu için `abx_resume` boş kalıyor. Test bitince şarkı geri gelmiyor.
- Senaryo ve etki: Kullanıcı bir şarkıya tıkladıktan sonraki birkaç yüz ms içinde kör testi başlatırsa ses üst üste
  biner. Pencere dar, bu yüzden önem Düşük.
- Öneri: `abx_install` `self.transition_seq += 1; self.pending = None;` yapsın. Süren geçişin `install`'u o zaman
  oturumu kendiliğinden kapatır. `abx_resume` için `pending.track` yedeği kullanılsın.

### ISK-07 — `check:commands` sarmalayıcıyı "kullanım" sayıyor; ürün kodunda karşılığı olmayan komut ve dalga dokunuşu

- Önem: **Düşük** · Güven: **Kesin** · Standart: ISO/IEC 25010 bakım kolaylığı (çözümlenebilirlik)
- Yer: `src/lib/backend.ts:326-331` (`getVisualWaveform`), `commands.rs:276-282` (`visual_waveform`),
  `src-tauri/src/audio/waveform.rs` (555 satır), `scripts/check-commands.mjs:6` ("Kayıtlı her komutu arayüz
  kullanıyor mu? (Kullanılmayan komut ölü koddur.)")
- Kanıt: `grep -rn getVisualWaveform src` → yalnızca `backend.ts` ve `backend.test.ts`. 9ae1b6d'de MilkDrop sahnesi
  yok, ama çözme iş parçacığı her şarkıda dalga kopyasını üretiyor (`decode_loop`: `shared.waveform.start`,
  `Decimator`). Kapı `invoke("visual_waveform")` satırını `backend.ts`'te görüp komutu "kullanılıyor" sayıyor.
  Kullanılmayan diğer dışa aktarımlar (tarama sonucu): `clearCoverCache`, `trackTechLine`. Rust'ta `Player::toggle`,
  `scan_folders`, `visual_time` yalnızca testlerden çağrılıyor.
- Senaryo ve etki: Ölü yol bakım yükü getiriyor ve kapının "ölü kod yok" sözünü zayıflatıyor. Çalışma zamanı
  maliyeti küçük.
- Öneri: `check-commands.mjs` `backend.ts`'teki dışa aktarımların ürün kodunda (test dışı) çağrıldığını da
  denetlesin. MilkDrop birleşene kadar dalga dokunuşunu bir ayarla kapalı tutun.

### ISK-08 — Clippy `indexing_slicing` açılmamış; `panic = "abort"` altında indeks paniği programı kapatır

- Önem: **Düşük** · Güven: **Kesin** · Standart: ISO/IEC 25010 güvenilirlik (hata toleransı)
- Yer: `src-tauri/clippy.toml` (`allow-indexing-slicing-in-tests = true`), `src-tauri/Cargo.toml` `[lints.clippy]`
  (`indexing_slicing` yok)
- Kanıt: `clippy.toml` testlerde indekslemeye izin veren ayarı taşıyor. Ama lint hiç açılmadığı için bu ayar ölü.
  Test dışı kodda yaklaşık 137 değişkenli indeks ifadesi var (kaba tarama, `eq.rs` 19, `limiter.rs` 7). CLAUDE.md
  "kütüphane kodunda panic yok" diyor. Clippy yalnızca açık `panic!`/`unwrap`/`expect`'i yakalıyor.
- Senaryo ve etki: Bir sınır hatası sürüm derlemesinde süreci sonlandırır. Ses iş parçacığındaysa müzik birden
  kesilir.
- Öneri: Önce ses yolu modüllerinde (`render`, `limiter`, `eq`, `peq`) modül düzeyinde
  `#![warn(clippy::indexing_slicing)]` açın, `get()`/`chunks_exact` ile temizleyin. Sonra kapsamı genişletin.

### ISK-09 — Belge ve kod arası küçük kaymalar

- Önem: **Düşük** · Güven: **Kesin** · Standart: ISO/IEC 25010 bakım kolaylığı
- Yer ve kanıt:
  - `README.md:89` "Checks (the same ones CI runs…)" `check:rules`'u sayıyor (bkz. ISK-01).
  - `docs/MIMARI.md:30` "Tauri komutları kısa sürer" (bkz. ISK-02, ISK-05).
  - CLAUDE.md "Görseller ses yolundan veri çekmez". Oysa `visual_waveform` çözme iş parçacığının yazdığı kopyayı
    okuyor (`player.rs:1610-1622`). Bu bilinçli bir istisna; MIMARI.md'de var, kuralda yok.
  - `src/lib/backend.ts:100`: sahipsiz belge yorumu ("Çalan şarkının yapısı…"). `getTrackCover`'ın belgesinin
    üstünde duruyor; ait olduğu `getSongMap` 20 satır aşağıda.
- Öneri: README başlığını CI ile eşitleyin (ISK-01 düzeltilince kendiliğinden doğrulanır). Kuralı "görseller ses
  yolunu beklemez; tek istisna salt-okunur dalga kopyası" diye yazın. Sahipsiz yorumu taşıyın.

### ISK-10 — Pencere dışı uyarı kutusu ve sürüm bilgisi göreli adla süreç başlatıyor

- Önem: **Düşük** · Güven: **Yüksek** (Windows davranışına bağlı) · Standart: OWASP ASVS V14 (yapılandırma),
  Windows uygulama klasörü kuralları
- Yer: `src-tauri/src/diagnostics.rs:212` (`Command::new("powershell")`), `:72` (`Command::new("cmd")`, her
  açılışta), `file_manager.rs:7,26` (`explorer`)
- Kanıt: Rust standart kütüphanesi Windows'ta göreli adı önce programın kendi klasöründe arıyor. Kurulum
  `installMode: "currentUser"` (`tauri.conf.json:47`), yani kullanıcının yazabildiği bir klasör. PowerShell
  kuruluşta engelliyse (AppLocker, Constrained Language Mode: `Add-Type` yasak) uyarı kutusu sessizce hiç çıkmıyor.
  Açılış çökmesinde kullanıcının tek izi de bu kutu. Metnin ortam değişkeniyle geçirilmesi doğru: komut enjeksiyonu
  yok.
- Senaryo ve etki: Kurulum klasörüne yazabilen biri `Lyraska.exe`'yi de değiştirebilir, yani gerçek bir yetki sınırı
  aşılmıyor. Kurumsal makinede açılış hatası görünmez kalabilir.
- Öneri: Tam yol kullanın (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`, `…\System32\cmd.exe`,
  `%SystemRoot%\explorer.exe`; `GetSystemDirectory` yerine `std::env::var("SystemRoot")`). PowerShell başarısız
  olursa (`status` hata ya da sıfır dışı) günlüğe "uyarı kutusu gösterilemedi" satırı yazın.

## 4. Olası riskler (kanıtı yetmeyenler)

- **Ardışık iki `open_track`'te kısa ses üst üste binmesi:** İlk geçişin `prepare`'i aygıtı açıp çalmaya başlar,
  `install` onu eski `seq` diye kapatana kadar iki akış birlikte duyulabilir (`player.rs:950-957`). Süre büyük
  olasılıkla ms düzeyinde. Ölçülmedi.
- **Ayar ve işaret dosyalarında Windows'ta `rename` engeli:** `atomic_file::write` `std::fs::rename` ile hedefin
  üstüne yazıyor. Virüs tarayıcı ya da arama dizinleyici hedefi `FILE_SHARE_DELETE` olmadan açık tutuyorsa yazma
  "erişim reddedildi" ile başarısız olur. Ses değişir ama ayar kaydedilmez, kullanıcı hata görür. Yeniden deneme yok.
  Windows'ta denenmedi.
- **Ayrılmış Windows adları:** İşaret dosyası adı etiketten geliyor (`annotation.rs` `file_name`). "CON", "NUL",
  "AUX" gibi bir başlık `CON.1a2b3c4d.json` üretir. Eski Windows sürümlerinde bu bir aygıt adıdır. Seyrek.
- **Veri klasörü taşıma tek örnek kilidinden önce:** `lib.rs:39` (`DataDirs::resolve` → `big_data_dir` taşıması)
  `:46`'daki kilitten önce koşuyor. İlk açılışta iki hızlı çift tıklama, iki sürecin aynı taşımayı denemesine yol
  açabilir. Kod taşınamayınca eskiye dönüyor; kayıp senaryosu bulamadım.
- **Bozulma yalnızca kirli kapanışta denetleniyor:** `quick_check` yalnızca önceki oturum düzgün kapanmadıysa koşuyor
  (`db.rs:132`). Temiz kapanışla gelen veri sayfası bozulması çalışma anında `SQLITE_CORRUPT` olarak kalıcı hata
  verir ve çalışma anında kurtarma yok.
- **İkinci örnek günlüğü döndürebilir:** `diagnostics::init` tek örnek kilidinden önce çağrılıyor (`lib.rs:42-43`).
  Rust Windows'ta dosyayı `FILE_SHARE_DELETE` ile açtığı için ikinci süreç 1 MB'ı aşmış günlüğü birincinin altından
  yeniden adlandırabilir. Etkisi kozmetik.

## 5. Temiz bulunanlar

- **Gerçek zamanlı ses yolu:** `output/wasapi.rs:378-450` döngüsünde ayırma, kilit, dosya erişimi yok. Hata
  dalları dışında `format!` ve `to_string` yok. wasapi 0.25 `write_to_device` ayırmıyor (kaynak okundu). DSP
  modüllerinde (`render`, `normalize`, `eq`, `peq`, `crossfeed`, `limiter`, `bass`, `punch`) hiç `Mutex`/`lock`
  yok. `ses_yolu_bellek_ayirmaz` testi `render`'ı kapsıyor.
- **Kütüphane kodunda `unwrap`/`expect`/`panic!` yok:** Test dışı taramada kalan altı eşleşmenin hepsi
  `#[cfg(test)]` fonksiyonlarında. `Cargo.toml` lint'leri ve `clippy.toml` test istisnaları tutarlı.
  `allow_attributes_without_reason` açık. Tek `#[allow]` WASAPI'de, gerekçeli.
- **camelCase + ts-rs:** Arayüze giden her `Serialize` tür `rename_all = "camelCase"` ve `ts(export)` taşıyor.
  Taşımayanlar yalnızca disk biçimleri (`Settings`, `MapFile*`, `ImportedMap`, önbellek satırları). CI bindings'i
  silip yeniden üretiyor ve farkı reddediyor (`ci.yml:99-109`).
- **`backend.ts` tek köprü:** `@tauri-apps` içe aktarımı ve `invoke` çağrısı başka hiçbir üretim dosyasında yok.
  `check:commands` mutasyonda gerçekten kırmızı oldu (yanlış argüman adı, eksik Rust parametresi).
  `check:docs` belgelenmemiş yeni dosyayı yakaladı.
- **Döngüsel bağımlılık (TS):** 151 dosyada döngü 0. İçe aktarılmayan tek üretim modülü `flashGuardCheck.ts`;
  belgelendiği gibi yalnızca `check:scenes` kullanıyor.
- **Göç çerçevesi (`storage.rs`):** Tek `IMMEDIATE` işlem ve savepoint var. Sürümü yalan söyleyen eski dosyalar ele
  alınıyor (`found <= 1`). Önbellek şeması tutmazsa yalnızca önbellek yeniden kuruluyor, kütüphane tablosu takılırsa
  dosyaya dokunulmuyor. Daha yeni şema reddediliyor. Eşzamanlı iki bağlantı testli. Şema `storage.rs` dışında
  değişmiyor (yalnızca testlerde `CREATE`/`DROP`).
- **Bozulma kurtarma (`db.rs`):** Yalnızca `NotADatabase`/`DatabaseCorrupt`'ta dosya `-wal`/`-shm` eşleriyle
  `.bozuk-<zaman>` adıyla kenara alınıyor. Bağlantı yeniden adlandırmadan önce kapanıyor. Diğer hatalar (izin,
  kilit) dosyaya dokunmuyor. Kullanıcıya `recovery_notice` gösteriliyor.
- **Ayarlar (`settings.rs`):** Alan alan esnek okuma var. Bilinmeyen alanlar `flatten` ile korunuyor (eski sürüme
  dönüşte yeni ayar silinmiyor). JSON olmayan dosya `.bozuk` yedekleniyor. Okunamayan dosyanın üstüne yazılmıyor.
  Yazma `atomic_file` ile (`sync_all` + `rename`) ve ayar kilidi altında sıralı. Arayüz ayar isteklerini tek uçuşa
  birleştiriyor (`useEqualizer.ts:88-108`, `useParametric`, `useCrossfeed`), yani diske yazma sırası ile oynatıcı
  sırası ayrışmıyor.
- **İşaretler (`annotation.rs`):** Yazmalar `writes` kilidiyle sıraya giriyor. `save_evaluation` ölçülen işaretler
  hâlâ diskte mi diye bakıyor (kayıp güncelleme yok).
- **Arka plan analizinin çökme koruması:** `CrashGuard` iki kapanışta dosyayı atlıyor. Dosya değişince yeniden
  deniyor. İz yazımı bölünmez. `stop()` iş parçacığını bekliyor.
- **Kapanış:** `RunEvent::Exit` sırası ses → tarama → analiz → oturum işareti. Kirli kapanış bir sonraki açılışta
  `quick_check` tetikliyor. `panic = "abort"` olduğu için sürümde zehirlenmiş kilit oluşamıyor. Geliştirme
  derlemesinde zehirlenme kullanıcıya Türkçe hata olarak dönüyor (`commands.rs:87-91`).
- **Hata modeli ve günlük:** Günlük Tauri'den önce açılıyor. Panik kancası yer, iş parçacığı ve adresli yığın izi
  yazıyor. Açılış tamamlanmadan gelen çökmede uyarı kutusu var. Tauri 2.12.1'de pencereler `setup` içinde, `Ready`
  olayında kuruluyor ve hata `panic!` ediyor (`app.rs:1443`), yani `lib.rs:228-229`'daki yorum doğru. 1 MB'ta
  döndürme yapılıyor, döndürme başarısızsa yazmaya devam ediliyor. Arayüz hataları tekrar süzgecinden geçiyor (aynı
  hata 3 kez, sonra her 100'de bir) ve 4000 karakterle sınırlı. Kullanıcıya dönen hatalar `reported()` ile günlüğe
  de yazılıyor. Arayüzde 10 hata sınırı var (kök, sahne, üst çubuk, çalma denetimleri, 6 panel); sahne sınırı sahne
  değişince sıfırlanıyor (`key`).
- **Tek örnek kilidi:** İşletim sisteminin dosya kilidi (`File::try_lock`) kullanılıyor, çökmede kendiliğinden
  kalkıyor. İkinci kopya dosyalara dokunmadan kapanıyor.
- **Ölçek göstergeleri:** Rust 51 dosya / 19 918 üretim satırı / 409 test. TS 15 630 üretim satırı / 398 test.
  En büyük üretim birimleri: `player.rs` 1946, `peq.rs` 1145, `spectrogram.rs` 941, `commands.rs` 856 (55 komut;
  çoğu 3–10 satır, yani "ince" kuralı büyük ölçüde tutuyor). Arayüzde `backend.ts` 631, `PlayerScreen.tsx` 615
  (22 alan kancasını bir araya getiren kompozisyon kökü).

### Proje sahibinin ayarına bağlı

- `main` dalı korumasız: `gh api repos/lahmacunveayran/Lyraska/branches/main` →
  `{"protected":false,"required":{"checks":[],"contexts":[],"enforcement_level":"off"}}`, `rules/branches/main` →
  `[]`. CLAUDE.md'nin "PR'da CI yeşil olmadan birleştirme yapılmaz" kuralı yalnızca oturumların uymasına bağlı.
  Kırmızı CI ile birleştirmeyi ya da `main`'e doğrudan push'u (bu da test sürümünü herkese dağıtır) hiçbir ayar
  engellemiyor. Öneri, sahibine adım adım: GitHub'da depo → **Settings** → **Rules** → **Rulesets** →
  **New branch ruleset**, hedef `main`. "Require a pull request before merging" ve "Require status checks to pass"
  seçilsin, CI'daki "Arayüz", "Çekirdek (Rust)" ve Windows işleri eklensin. ISK-01 düzeltilince `check:rules` de
  bu zorunlu işlerin içinde koşar.

## 6. Öncelikli düzeltme sırası

1. **ISK-01:** `ci.yml`'ye `npm run check:rules` adımını ekleyin. `package.json`'daki her `check:*`'ın CI'da
   koştuğunu denetleyen bir test yazın.
2. **Sahibin ayarı:** `main` için kural seti kurun (PR zorunlu + zorunlu CI işleri).
3. **ISK-03:** Tarama işçilerine çökme izi ekleyin (CrashGuard'ı genelleştirin), suçlu dosyayı kullanıcıya gösterin.
4. **ISK-02:** `recover_device`, `set_playback_options`, `abx_install`/`abx_stop` ve `Analysis::start`'ı
   `begin → prepare (kilit dışı) → install` kalıbına taşıyın.
5. **ISK-04:** DSP kanallarını ayrı `tauri::State`'e alın, ayar komutları oynatıcı kilidine dokunmasın.
   `player.rs`'i oturum ve düzenleyici olarak bölmeyi planlayın.
6. **ISK-06:** `abx_install` geçiş sırasını (`transition_seq`) artırsın, `pending`'i temizlesin.
7. **ISK-05:** Dosya ya da veritabanı dokunan async komutları `spawn_blocking` yardımcısına alın.
8. **ISK-08:** Ses yolu modüllerinde `clippy::indexing_slicing`'i açın.
9. **ISK-07 / ISK-09:** `check:commands`'a "sarmalayıcı ürün kodunda kullanılıyor mu" denetimini ekleyin. README ve
   MIMARI.md'yi gerçeğe eşitleyin.
10. **ISK-10:** Sistem araçlarını tam yolla çağırın, uyarı kutusu gösterilemezse günlüğe yazın.
