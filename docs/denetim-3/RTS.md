# Gerçek zamanlı ses motoru, eşzamanlılık ve ses yolu bütünlüğü — Bağımsız denetim raporu (Faz 3, Denetim 2)

Denetçi: RTS (gerçek zamanlı ses / eşzamanlılık). Kaynak: main @ 5805853. Tarih: 22 Ekim 2026.

## 1. Kapsam ve yöntem

**Satır satır okunan dosyalar** (5805853):

| Dosya                                                                      |          Satır | Odak                                                                                             |
| -------------------------------------------------------------------------- | -------------: | ------------------------------------------------------------------------------------------------ |
| `src-tauri/src/audio/render.rs`                                            |            945 | sinyal zinciri, bit-perfect dalı, duraklatma geçişi, `to_device`                                 |
| `src-tauri/src/audio/peq.rs`                                               |           1786 | `PeqControl` (kilitsiz kanal), `Bank`, `PeqProcessor`, `coefs_peak_db`                           |
| `src-tauri/src/audio/biquad.rs`                                            |           1041 | ses iş parçacığında çağrılan RBJ/eşlenmiş tasarım (ayırma, döngü sınırları)                      |
| `src-tauri/src/audio/crossfeed.rs`                                         |            655 | `CrossfeedControl`, `CrossfeedProcessor`, çapraz geçiş                                           |
| `src-tauri/src/audio/eq.rs`                                                |           1252 | `EqControl` (kilitsiz kanal), `EqProcessor`                                                      |
| `src-tauri/src/audio/limiter.rs`, `normalize.rs`                           |      468 + 789 | ses yolundaki kullanım (`Leveler`, `TrackLevels`, sınırlayıcı)                                   |
| `src-tauri/src/audio/player.rs`                                            |           3242 | oturumlar, halka tampon, boşluksuz geçiş, `begin_transition`/`prepare`/`install`, aygıt değişimi |
| `src-tauri/src/audio/output.rs`, `output/wasapi.rs`, `output/simulated.rs` | 302 + 495 + 97 | çıkış soyutlaması, WASAPI, MMCSS `unsafe`                                                        |
| `src-tauri/src/audio/abx.rs`                                               |           1015 | kör test çıkış yolu                                                                              |
| `src-tauri/src/commands.rs`, `lib.rs`                                      |      954 + 188 | Faz 3 komutları, kilit sırası, kilit altındaki iş                                                |
| (bağlam) `src/hooks/usePlayer.ts`, `src/components/PlayerScreen.tsx`       |              — | komutların arayüzden nasıl, hangi eşzamanlılıkla çağrıldığı                                      |
| (bağlam) `wasapi-0.25.0` crate kaynağı                                     |              — | `write_to_device`, `is_supported_exclusive_with_quirks`                                          |

**Standartlar / kurallar:** CLAUDE.md gerçek zamanlı kuralları (geri çağrıda ayırma/kilit/dosya/panik yok), Rust bellek
sıralaması (Acquire/Release, seqlock deseni), WASAPI paylaşımlı/özel mod kuralları (IAudioClient Initialize/GetBuffer/
ReleaseBuffer, olay güdümlü ve yoklamalı mod), `docs/MIMARI.md` ve kod yorumlarındaki iddialar (SES-01/02/03, KUT-08, #79).

**Kanıt testleri** çalışma ağacında `#[cfg(test)]` modülleri olarak yazıldı (üretim koduna dokunulmadı; yalnızca dört
`#[cfg(test)] #[path = …] mod denetim_rts;` bağlama satırı). Tam kaynaklar ve çıktılar:
`docs/denetim-3/hesap/RTS/`
(`denetim_rts_peq.rs`, `denetim_rts_player.rs`, `denetim_rts_render.rs`, `denetim_rts_commands.rs`, `baglama.diff`,
`test_cikti_debug.txt`, `test_cikti_release.txt`, `clippy_windows.txt`).

**Çalıştırılan komutlar ve sonuçları:**

| Komut                                                                                             | Sonuç                             |
| ------------------------------------------------------------------------------------------------- | --------------------------------- |
| `cargo test --lib audio::` (mevcut testler)                                                       | 223 geçti, 0 kaldı, 2 yok sayıldı |
| `cargo test --lib denetim_rts -- --nocapture --test-threads=1` (test profili, opt-level 1)        | 9 kanıt testi geçti               |
| `cargo test --release --lib denetim_rts -- --nocapture --test-threads=1`                          | 9 kanıt testi geçti               |
| `cargo clippy --target x86_64-pc-windows-gnu --all-targets -- -D warnings` (kanıt testleri dahil) | temiz (EXIT 0)                    |

Not: Kanıt testleri “bulguyu gösteren” biçimde yazılmıştır: geçmeleri hatanın **var olduğunu** kanıtlar. Düzeltmeden sonra
her birinin iddiası tersine çevrilip kilit test olarak kullanılabilir (her bulguda yazılı).

## 2. Genel değerlendirme

**Puan: 7/10.**

En güçlü yan: ses çıkış iş parçacığının kendisi örnek niteliğinde: en ağır ayarlarla (20 + 20 eşlenmiş süzgeç, 10 bant,
bas/vuruş/alt oktav, crossfeed, eşitleme, sınırlayıcı) ve **her blokta ayar değişirken** 600 blokta sıfır bellek ayırma,
aygıta asla NaN/aşım gitmiyor, bit-perfect zinciri bit bit doğru, `unsafe` dar ve doğru gerekçeli. En zayıf yan: ses
iş parçacığının **dışındaki** eşzamanlılık: üç adımlı geçiş yalnızca “aç” ve “sar” için kilitsiz; durdurma, aygıt
değişimi, bit-perfect değişimi ve kör test aynı uzun işi oynatıcı kilidi altında yapıyor ve iki geçiş aynı anda
hazırlanabiliyor. Bir numaralı risk: sarma ile şarkı açma üst üste geldiğinde **iki oturumun aynı anda çalması** ve
eskisinin kısılmadan kesilmesi (tık; özel modda aygıt çakışması).

## 3. Bulgular (önem sırasıyla)

Özet: Kritik 0, Yüksek 0, Orta 3, Düşük 4.

### [RTS-01] Sarma ve şarkı açma üst üste gelince iki oturum aynı anda çalar; eskisi kısılmadan kesilir

- Önem: **Orta** | Güven: kesin (testle kanıtlandı)
- Yer: `src-tauri/src/audio/player.rs:766-829` (`begin_transition`), `:840-904` (`prepare`), `:908-922` (`install`);
  `src-tauri/src/commands.rs:163-172` (`open_track`), `:212-224` (`seek_playback`); `src/hooks/usePlayer.ts:128`, `:189-224`.
- Kanıt: `begin_transition` çalan oturumu `self.session.take()` ile alır. İkinci bir geçiş hemen ardından başlarsa
  `old = None` olur ve onun `prepare`'i eski oturumun kısılmasını beklemeden, birincinin hazırlığıyla **aynı anda**
  `Session::start` çağırır (dosya açar, ön dolum yapar, aygıtı açar, çalmaya başlar). Daha eski sıradaki hazırlık
  `install`'a gelince kısılmadan durdurulur:

  ```rust
  // player.rs:914-919
  if seq != self.transition_seq {
      return match outcome {
          Ok(session) => {
              session.shared.stop.store(true, Ordering::Release);   // fade yok
              Ok(session.info.clone())
  ```

  Kanıt testi `audio::player::denetim_rts::rts_sarma_ve_acma_ust_uste_iki_oturum_ayni_anda_calar`
  (`hesap/RTS/denetim_rts_player.rs`): çalan şarkıda `begin_seek(1.0)` ardından `begin_transition(b)`, iki `prepare`
  ayrı iş parçacığında. Çıktı (release):

  ```
  RTS üst üste: sarma oturumu 6000 kare, açma oturumu 6000 kare aynı 20 ms'de çaldı; duraklatılmış mı: false / false
  RTS eski hazırlık: stop=true faded_out=false (kısılma beklenmeden kesildi)
  ```

  Yani iki ayrı çıkış iş parçacığı aynı 20 ms içinde duraklatılmamış ses üretti; eski hazırlık tam seviyede kesildi.
  Mevcut test `daha_yeni_gecis_baslamissa_eski_hazirlik_takilmaz` yalnızca **sıralı** (`prepare` art arda) durumu sınar;
  eşzamanlı durumu kapsamaz.

- Kullanıcıya ulaşma yolu: arayüz şarkı açmayı `busy` kuyruğuyla (usePlayer.ts:128), sarmayı ayrı bir `seekInFlight`
  kuyruğuyla (usePlayer.ts:201) sıraya koyar; ikisi birbirini beklemez. Kullanıcı ilerleme çubuğunu sürükleyip bırakır
  ve hazırlık (gerçek aygıtta eski oturumun kısılmasını bekleme ≤300 ms + dosya açma + ön dolum + WASAPI açılışı) sürerken
  “Sonraki”ye basar ya da şarkı sırası kendiliğinden bir sonrakine geçer (veya tersi).
- Etki: kısa süre iki şarkı üst üste çalar; kaybeden oturum tam seviyede kesilir (aygıt arabelleğinde ~100 ms ses
  varken `stop_stream`) ve tık duyulur. Bit-perfect (özel mod) açıkken ikinci `Session::start` aygıtı ilki tuttuğu
  için özel modda açamaz, paylaşımlı yola düşer; paylaşımlı açılış da özel mod sahibi varken başarısız olabilir
  (bu son kısım sanal aygıtla gösterilemedi, bkz. Şüpheler Ş-1). Ayrıca kaybeden oturumun iş parçacıkları
  `install` içinde, yani oynatıcı kilidi altında `join` edilir.
- Önerilen düzeltme (en küçük): geçişleri çekirdekte sıraya koyun. `Player` içinde `Arc<Mutex<()>>` bir “geçiş kapısı”
  tutup `Transition` ile taşıyın; `prepare` işine bu kapıyı alarak başlasın (yeni geçiş, öncekinin hazırlığı bitene
  kadar bekler; öncekinin oturumu da `old` olarak devralınabilir). Ek olarak `prepare`, `Session::start`'tan önce
  paylaşılan `AtomicU64 latest_seq`'e bakıp eskimişse hiç aygıt açmasın; `install`'daki eskimiş oturum `paused=true` +
  `wait_for_fade_out` ile ve kilit dışında kapatılsın. Kilit test: yukarıdaki testin iddiaları tersine (“aynı anda en çok
  bir oturum duraklatılmamış ses üretir”, “eskimiş oturum `faded_out` olmadan durdurulmaz”).

### [RTS-02] Durdurma, şarkı bitince “çal”, bit-perfect değişimi, aygıt değişimi ve kör test oturumu kilit altında yeniden kurar

- Önem: **Orta** | Güven: kesin (testle kanıtlandı; gerçek aygıttaki süre koddaki sınırlardan)
- Yer: `player.rs:1284-1290` (`stop` → `load`), `:1240-1249` (`play`: Ended/Error → `load`/`restart`),
  `:1394-1416` (`set_playback_options` → `restart`), `:946-967` (`recover_device` → `restart`; `status()` `:1644` ve
  `visual_now()` `:1502` içinden), `:995-1026` ve `:1052-1059` (`abx_install` → `close_session` + `prepared.start()`,
  `abx_stop` → `restart`); `commands.rs:196-208` (`toggle_playback`, `stop_playback` kilidi baştan sona tutar).
- Kanıt: `restart` = `begin_transition` + `prepare` + `install` **aynı iş parçacığında ve çağıranın kilidiyle**:

  ```rust
  // player.rs:754-762
  fn restart(&mut self, path: &Path, autoplay: bool, start_secs: Option<f64>) -> Result<TrackInfo, AudioError> {
      let transition = self.begin_transition(path, autoplay, start_secs);
      self.install(Self::prepare(transition))
  }
  ```

  `prepare` içinde `wait_for_fade_out(…, FADE_OUT_TIMEOUT = 300 ms)`, `Session::start` içinde `Decoder::open`,
  `wait_for_prefill(…, PREFILL_TIMEOUT = 3 s)` ve aygıt açılışı vardır. Oysa `commands.rs:159-161` “görseller ve durum
  sorguları bu sırada beklemez (SES-02)” der; bu yalnızca `open_track` ve `seek_playback` için doğrudur.
  Kanıt testi `audio::player::denetim_rts::rts_durdurma_ve_aygit_degisimi_kilidi_gecis_boyunca_tutar` (`Arc<Mutex<Player>>`,
  bir iş parçacığı kilitli işi yaparken öteki `status()` için kilit bekler). Çıktı (test profili / release):

  ```
  RTS kilit: açma/sarma hazırlığı 8.6 ms sürdü, durum sorgusu 0.01 ms bekledi; durdur 8.1 ms (sorgu 8.1 ms bekledi);
             aygıt değişimi 10.2 ms (sorgu 10.3 ms bekledi)
  RTS kilit: açma/sarma hazırlığı 7.2 ms sürdü, durum sorgusu 0.01 ms bekledi; durdur 11.5 ms (sorgu 6.7 ms bekledi);
             aygıt değişimi 12.0 ms (sorgu 12.0 ms bekledi)
  ```

  Sanal aygıt 50 kat hızlı çalar ve arabelleği yoktur; bu yüzden milisaniyeler küçüktür. Oran belirleyicidir: aynı iş
  açmada sorguyu hiç bekletmez, durdurmada ve aygıt değişiminde sorgu işin tamamını bekler. Gerçek aygıtta beklenen
  süre: kısılmanın hoparlöre ulaşması (100 ms WASAPI arabelleği + 10 ms geçiş, en çok 300 ms) + WASAPI açılışı + ön dolum
  (0,25 sn ses çözme; yavaş diskte 3 sn'ye kadar).

- Kullanıcıya ulaşma yolu: “Durdur” düğmesi; şarkı bitince oynat; Ayarlar → Bit-perfect aç/kapat; kulaklık takma/çıkarma
  (aygıt değişimi her `visual_frame` ve `playback_status` sorgusunda yakalanır: kurtarma, o an gelen görsel kare
  isteğinin içinde yapılır); kör testi başlatma/bitirme.
- Etki: bu işlemlerin her birinde görseller (60 fps `visual_frame`) ve durum sorguları ~0,1–0,4 sn (yavaş diskte
  saniyeler) donar; arayüz yorumu (usePlayer.ts “kilit birkaç saniye tutulabilir”) bunu kabullenmiş görünüyor ama
  belge (SES-02/KUT-08) aksini söylüyor. Belge–kod uyumsuzluğu.
- Önerilen düzeltme: `stop_playback`, `toggle_playback` (Ended/Error dalı), `playback_options_set` (bit-perfect değişimi)
  ve `abx_start`/`abx_stop`'u `open_track` gibi üç adıma bölün (`Player`'a `begin_stop`, `begin_play`, `begin_reopen`
  gibi `Option<Transition>` döndüren yöntemler; `prepare`'i `spawn_blocking`'de çalıştırın). `recover_device` geçişi
  kendisi yapmasın: `status()` yalnızca `Transition`'ı başlatsın ve bir kilitsiz hazırlık görevine versin (ör.
  `PlayerState` yanında bir `std::sync::mpsc` kanalı + arka plan iş parçacığı). Kilit test: yukarıdaki test, “durdurma ve
  aygıt değişiminde sorgu beklemesi < hazırlık süresinin ¼'ü” iddiasıyla.

### [RTS-03] Bit-perfect'te boşluksuz geçiş bit derinliğini denetlemiyor: 24 bitlik şarkı 16 bitlik özel mod akışında yuvarlanır, ekran “bit-perfect” der

- Önem: **Orta** | Güven: kesin (testle kanıtlandı)
- Yer: `src-tauri/src/audio/player.rs:1817-1830` (`open_next`); karşılaştırma için ilk şarkıdaki denetim `:318-334` (#79).
- Kanıt: ilk şarkıda aygıtın özel mod biçimi şarkının bit derinliğinden darsa bit-perfect açılmaz (#79). Sıradaki
  şarkı ise yalnızca kanal sayısı ve hızla denetlenir:

  ```rust
  // player.rs:1821-1828
  if Converter::output_channels(info.channels) != spec.channels { return None; }
  if matches!(spec.mode, OutputMode::Exclusive(_)) && info.sample_rate != spec.sample_rate { return None; }
  Some(decoder)   // decoder.source_bits() hiç denetlenmez
  ```

  Kanıt testi `audio::player::denetim_rts::rts_bit_perfect_bosluksuz_geciste_bit_derinligi_denetlenmez`: sanal aygıt
  özel modda yalnızca 16/16 kabul ediyor; aynı 24 bitlik dosya doğrudan açılınca bit-perfect **açılmıyor** (doğru), ama
  16 bitlik bir şarkının ardından sıradaki olarak gelince akışa ekleniyor:

  ```
  RTS boşluksuz: çalan "rts-bp-24", ekranda bit_perfect=true bit_depth=Some(16)
  RTS 24 bit örnek 0x12d65a aygıta 0x12d600 olarak gider
  ```

- Kullanıcıya ulaşma yolu: özel modda en çok 16 bit kabul eden aygıt (birçok HDMI/Bluetooth/eski USB aygıtı) + bit-perfect
  açık + sırada 16 bitlik bir şarkının ardından aynı hızda 24 bitlik bir şarkı (karışık çalma listesi, farklı albümler).
- Etki: ürünün bit-perfect vaadi sessizce bozulur: 24 bitlik şarkının alt 8 biti atılır (titreşimsiz yuvarlama), “Sesin
  yolu” satırı “bit-perfect (özel mod, 16 bit)” yazmayı sürdürür. DOGRULAMA B12'de proje sahibine gösterilen durum
  yalnızca ilk şarkı için doğrudur.
- Önerilen düzeltme: `open_next` içinde
  `if let OutputMode::Exclusive(f) = spec.mode { if decoder.source_bits().is_some_and(|b| b > u32::from(f.valid_bits)) { return None; } }`
  (oturum biter, arayüz sıradakini kendi biçiminde açar ve #79'daki notu gösterir). Kilit test: bu testin son iki
  iddiası tersine (“çalan şarkı ilk şarkı kalır, durum Ended”).

### [RTS-04] Kilitsiz ayar kanallarında yırtık okuma: ses iş parçacığı iki ayarın karışımını tasarlayabiliyor; sürüm sayacı bunu engellemiyor

- Önem: **Düşük** (gerçek kullanımda olasılığı ve etkisi küçük; aşağıda gerekçe) | Güven: kesin (testle kanıtlandı)
- Yer: `src-tauri/src/audio/peq.rs:918-944` (`set_filters`), `:967-1016` (`design`), `:1107-1118` (`begin_block`);
  aynı desen `eq.rs:320-354` (`EqControl`), `crossfeed.rs:238-280` (`CrossfeedControl`).
- Kanıt: yazıcı alanları `Relaxed` yazar, **sonra** sürümü `fetch_add(…, Release)` ile artırır. Okuyucu sürümü
  `Acquire` ile **bir kez, okumadan önce** alır, alanları `Relaxed` okur; okuma sonrası karşılaştırma ya da “yazma
  sürüyor” işareti (tek sayılı sürüm) yoktur. (`EqControl`'ün belgesi, eq.rs:284-286, yarım okumayı kabul edip “bir sonraki turda düzelir” der; `PeqControl`
  ve `CrossfeedControl` için böyle bir not yok.) Kanıt testi `audio::peq::denetim_rts::rts_peq_kanali_yirtik_okur`: bir iş parçacığı
  iki 20 süzgeçlik ayarı (A, B) art arda yazarken ses tarafının `design` çağrısı:

  ```
  RTS yırtık okuma: 200000 tasarım; A 52618, B 22517, karışık 124865 (karışıkken sürüm önce = sonra: 19181)   (release)
  ```

  Karışık tasarımların bir kısmında okumadan önceki ve sonraki sürüm **aynıdır** (yazıcı henüz artırmamıştır): yani
  yalnızca “okuma sonrası sürüm denetimi” eklemek yetmez, seqlock gerekir. En kötü durum testi
  `rts_peq_yirtik_okuma_iki_duz_ayardan_yuksek_tepe_uretir`: A = [PK 1 kHz +24, PK 1 kHz −24], B = tersi; ikisi de düz
  (bildirilen yükseltme 0 dB), ama karışık tasarım:

  ```
  RTS en kötü: A tepe 0.00 dB, B tepe 0.00 dB; 400000 tasarım, A 197632, B 180340, karışık 22028,
               karışığın 1 kHz kazancı en çok ±48.0 dB
  ```

- Kullanıcıya ulaşma yolu ve neden Düşük: karışım ancak ses iş parçacığı tasarım yaparken (ayar değişiminden sonraki ilk
  blokta, ~0,2 ms) **ikinci bir yazma** sürüyorsa olur; bu da yalnızca sürükleme gibi art arda gönderimlerde mümkündür ve
  ardışık sürükleme adımları birbirine çok yakındır (karışımları da yakındır). Sürüm, yazma bittikten sonra arttığı için
  bir sonraki blokta doğru tasarım 30 ms'lik çapraz geçişle gelir (kendiliğinden düzelir; toplam ~30–60 ms). Bildirilen
  yükseltmeyi aşan bir karışımı taşma koruması (`Leveler`) görmez; tavanı −1 dBTP sınırlayıcı tutar (işitme riski yok).
- Etki: nadiren 30–60 ms süren yanlış eğri (en kötü durumda sınırlayıcıya çarpan kısa bir patlama/çukur).
- Önerilen düzeltme: tek yazıcı (oynatıcı kilidi zaten tek yazıcıyı garanti ediyor) için seqlock: yazıcı
  `version.fetch_add(1, Relaxed)` (tek sayı) → `fence(Release)` → alanlar → `version.fetch_add(1, Release)`; okuyucu
  `v1 = load(Acquire)`; `v1` tekse bu blokta tasarlamaz; alanları okur; `fence(Acquire)`; `v2 = load(Relaxed)`;
  `v1 != v2` ise sonucu atar ve `seen_version`'ı güncellemez (sonraki blokta yeniden dener). Aynı yardımcıyı `EqControl` ve
  `CrossfeedControl` kullansın. Kilit test: `rts_peq_kanali_yirtik_okur`'u seqlock'lu okuma yoluyla (`v1 == v2` ve çift
  iken kabul) çalıştırıp “kabul edilen karışık = 0” iddiası.

### [RTS-05] `parametric_set` oynatıcı kilidini ayar dosyasının diske yazılıp `sync_all` beklenmesi ve eğri hesabı boyunca tutuyor

- Önem: **Düşük** | Güven: kesin (testle ölçüldü)
- Yer: `src-tauri/src/commands.rs:529-540` (`apply_parametric`); karşılaştırma: `apply_headphone` `:463-475`,
  `crossfeed_set` `:550-560`, `equalizer_set` `:310-320` kilidi `store.update`'ten önce bırakır.

  ```rust
  let mut player = player.lock()?;                    // kilit fonksiyon sonuna kadar
  let applied = player.set_parametric(settings);
  store.update(|s| s.parametric = applied.clone())   // settings.rs:154-167: yaz + sync_all + rename
  …;
  Ok(ParametricState::new(applied, player.parametric_comparing()))   // 20 bant × eğriler, kilit altında
  ```

- Kanıt: `commands::denetim_rts::rts_parametrik_ayar_kilit_altinda_diske_yazar` (20 bant, eşlenmiş, gerçek dosya):

  ```
  RTS parametric_set: kilit ortalama 14.89 ms, en kötü 65.40 ms; parçalar: ses kanalı 1.235 ms, disk (sync_all) 1.344 ms, eğriler 2.181 ms
  RTS parametric_set: kilit ortalama 6.54 ms, en kötü 36.89 ms; …                               (release)
  (ilk koşuda en kötü 236 ms: sync_all süresi dosya sistemine göre çok oynak)
  ```

- Kullanıcıya ulaşma yolu: parametrik ekolayzerde bant sürüklemek (useParametric her yanıttan sonra yenisini gönderir;
  her adım bir `sync_all`).
- Etki: sürükleme boyunca `visual_frame` ve `playback_status` her adımda bu kadar bekler; 60 fps'te (16,7 ms) görsellerde
  takılma. Ses etkilenmez.
- Önerilen düzeltme: `let (applied, comparing) = { let mut p = player.lock()?; let a = p.set_parametric(settings); (a, p.parametric_comparing()) };`
  sonra kilitsiz `store.update` ve `ParametricState::new`. Kilit test: aynı ölçümde “kilit süresi ≈ yalnızca ses kanalı”.

### [RTS-06] Çok kanallı (ör. 5.1) şarkıda crossfeed sessizce atlanıyor; arayüz ışığı “ses şekilleniyor” demeyi sürdürüyor

- Önem: **Düşük** | Güven: kesin (testle ve kodla)
- Yer: `crossfeed.rs:330` (`stereo: channels == 2`), `:366`; `src/components/PlayerScreen.tsx:98-104`.
- Kanıt: `audio::render::denetim_rts::rts_crossfeed_cok_kanalda_sessizce_atlanir`: 6 kanallı akışta crossfeed açık, sol
  öndeki ses sağ öne hiç gitmiyor: `RTS 5.1: crossfeed açık, sağ ön kanalın tepesi 0`. Arayüz yalnızca bit-perfect'i
  hesaba katıyor:

  ```ts
  const soundShaped = (equalizer.active || headphone.active || crossfeed.active || …) && !bitPerfect;
  ```

- Kullanıcıya ulaşma yolu: crossfeed açıkken çok kanallı FLAC/WAV çalmak. `set_crossfeed` belgesi (player.rs:1359-1361)
  “mono/çok kanallı şarkıda ses işlenmez” der (mono'da L=R olduğu için zaten etkisizdir, sorun yoktur), ama ekranda
  bu belirtilmez.
- Etki: “ekranda açık, sese uygulanmıyor” tutarsızlığı (işitme etkisi yok).
- Önerilen düzeltme: `CrossfeedStrip`'in `bypassed` değeri `bitPerfect || (status.output?.channels ?? 2) !== 2` olsun;
  ışık hesabında da aynı. Kilit test: arayüz testi (6 kanallı `SignalPath` ile `bypassed`).

### [RTS-07] Süzgeç tasarımı ses iş parçacığında: ayırma yok ama süre libm'e bağlı ve blok bütçesinin anlamlı bir kısmı

- Önem: **Düşük** (iyileştirme; kural ihlali değil) | Güven: kesin (ölçüldü)
- Yer: `peq.rs:1107-1118` (`begin_block` → `design` → `Biquad::matched`, kulaklık takımında ek olarak `coefs_peak_db`
  `:424-438`), `eq.rs:793-815` (2 ms'de bir yeniden tasarım), `bass.rs:544-595`.
- Kanıt: `rts_peq_tasarim_suresi_ve_ayirma` (20 eşlenmiş süzgeç, release): parametrik takım ortalama **167–185 µs**,
  kulaklık takımı (tepe taraması dahil) **215–249 µs**; test profilinde (opt-level 1) neredeyse aynı (süre
  `powf/log10/exp`'te). Bellek ayırma 0. Uçtan uca `rts_en_agir_ayarlarla_blok_suresi_ve_ayirma` (10 ms'lik blok,
  her 2 blokta parametrik, her 5 blokta kulaklık/ekolayzer/bas/crossfeed değişimi, 600 blok):

  ```
  release: medyan 480 µs, %99 1208 µs, en kötü 4550 µs (periyodun %45.5'i); bellek ayırma 0
  test   : medyan 738 µs, %99 1577 µs, en kötü 2167 µs (periyodun %21.7'i); bellek ayırma 0
  ```

  (Ortam paylaşımlı 4 çekirdekli kapsayıcı; en kötü değerler zamanlayıcı gürültüsü içerir.) Kulaklık ve parametrik
  takım aynı blokta değişirse ~0,4–0,5 ms yalnızca tasarımdır.

- Etki: 10 ms periyotta pay var (takılma beklenmez); ama özel modda küçük periyotlu aygıtlarda ve zayıf dizüstü
  işlemcilerinde pay daralır; DOGRULAMA B16'daki “ağır yükte takılma yok” ölçümü ayar sürüklenirken yapılmamış.
- Önerilen düzeltme: katsayıları yazıcı tarafında (komut iş parçacığı) hesaplayıp ses tarafına hazır `[Biquad; 20]`
  olarak yayımlamak (örnek hızı oturumla bilinir; ya da birkaç yaygın hız için önceden). Bu aynı zamanda RTS-04'ü de
  kökten çözer (tek bir `Arc` takası/triple buffer). Kilit test: ses tarafında `design` çağrısının hiç yapılmadığını
  ölçen sayaç ya da blok süresi üst sınırı.

## 4. Şüpheler (kanıtlanamayanlar, güven “olası”)

- **Ş-1 (RTS-01'in özel mod ayağı):** iki `Session::start` aynı anda özel mod isterse ikincisi `AUDCLNT_E_DEVICE_IN_USE`
  alır, paylaşımlı yola düşer; özel mod sahibi varken paylaşımlı `Initialize` de başarısız olabilir ve kullanıcının
  istediği şarkı hata durumunda kalabilir. Sanal aygıt aygıt sahipliğini modellemediği için gösterilemedi.
- **Ş-2:** `PeqProcessor::begin_block` yeni takımı sıfır durumla başlatır (`self.next.clear()`, peq.rs:1112); crossfeed ise
  eski durumu kopyalar. Uzun zaman sabitli süzgeçlerde (20 Hz, Q = 30) yeni takım 30 ms'lik geçiş bittiğinde henüz
  oturmamış olabilir: kısa bir alçak frekans “oturma” sapması. Tık değil (çıkış sürekli); ölçülmedi.
- **Ş-3:** sınırlayıcının kayan ortalaması (`smoothed_sum += held − smoothed[pos]`, limiter.rs) uzun ve sürekli sınırlama
  altında kayan nokta birikimi yapar; kazanç 1'e `1 − 1e-12` eşiğiyle oturtulduğu için saatlerce ağır sınırlamadan sonra
  kazanç 1'e tam dönmeyebilir. Etkisi ~1e-10 dB mertebesinde (duyulmaz); bit-perfect'te sınırlayıcı zaten atlanıyor.
- **Ş-4:** her oturum bir aygıt izleme iş parçacığı açar ve `join` etmez (wasapi.rs:343-348); oturum kapandıktan sonra
  en çok 500 ms yaşar. Çok hızlı art arda geçişlerde birkaç tanesi birikir; zararı görülmedi.

## 5. Güçlü yanlar (kanıtla)

- **Ses yolunda sıfır bellek ayırma, en ağır koşulda bile:** mevcut `ses_yolu_bellek_ayirmaz` testi 2–3 süzgeçle
  çalışıyordu; bu denetimin testi 20 + 20 eşlenmiş süzgeç, ekolayzer, bas/vuruş/alt oktav/küçük hoparlör ve crossfeed
  ayarları **her blokta** değişirken 600 blokta 0 ayırma ölçtü; ayrıca tek başına `PeqControl::design` 44,1–192 kHz'te
  0 ayırma. Tasarım fonksiyonları sabit boyutlu dizilerle (`Grid`, `[Biquad; MAX_FILTERS]`) yazılmış; döngüler sabit
  sınırlı (ızgara ≤ 74 nokta, tepe taraması ≤ ~600 nokta).
- **Panik yolu yok:** ses yolundaki bütün indekslemeler sınırlı (`chunks_exact_mut`, `get_mut`, `% delay`, `take(channels)`);
  `unwrap` yok (`pop().unwrap_or(0.0)`). `wasapi::write_to_device` (crate kaynağı okundu) yalnızca `GetBuffer` +
  `copy_from_slice` + `ReleaseBuffer` yapar, ayırmaz; `is_supported_exclusive_with_quirks` yalnızca yapı türünü ve kanal
  maskesini değiştirir, bit derinliğini değil: `block_align` ile `IntFormat::bytes()` tutarlı kalır.
- **NaN/sonsuz asla yayılmaz:** çözücü sonlu olmayan örnekleri sıfırlar (decode.rs:232-238, test `…NaN…`); aygıta son adımda
  `to_device` NaN'ı 0'a, aşımı ±1'e çevirir; testte 600 blokta bütün çıkış sonlu ve |x| ≤ 1.
- **Bit-perfect zinciri ve bypass doğru:** bit-perfect oturumda kulaklık düzeltmesi, parametrik, ekolayzer, bas, crossfeed,
  eşitleme ve sınırlayıcı atlanıyor (render.rs:205-209, limiter `with_bypass`); oturum özel modu açamazsa
  `bit_perfect=false` ile tam işlemli yoldan çalıyor (player.rs:388) ve görseller de buna göre ekolayzer etkisini
  ekliyor/eklemiyor (player.rs:1529). Crossfeed'de orta ses çapraz geçiş sırasında da bit bit aynı
  (`old + (new − old)·t` iki taraf da `mid` iken `mid`).
- **`unsafe` doğru ve dar:** yalnızca `boost_thread_priority` / `ThreadPriority::drop` (wasapi.rs:151-182),
  `#[allow(unsafe_code)]` fonksiyon düzeyinde, `// GÜVENLİK:` gerekçeli; UTF-16 dizisi çağrı boyunca yaşıyor, tutamaç aynı
  iş parçacığında (`_priority` kapanış içinde yerel) bir kez geri veriliyor; dizi ayırması döngü öncesinde. Windows
  hedefi için clippy `-D warnings` temiz.
- **Kilit sırası tutarlı:** her yerde oynatıcı → ayarlar (`restore_settings`, `apply_parametric`); tersi yok, kilitlenme
  (deadlock) yolu bulunmadı. Zehirlenmiş kilit anlaşılır hataya çevriliyor.
- **Kısılma beklemesi doğru tasarlanmış:** `FadeWatch`, aygıt arabelleğindeki çalınmamış sesi (`padding`) hesaba katıyor;
  sıralı geçişlerde eski oturum ancak sessizlik hoparlöre ulaşınca kapanıyor (mevcut test
  `calarken_sarinca_eski_oturum_sesi_kisilinca_kapanir`).

## 6. Denetlenemeyenler ve sınırlar

- Gerçek WASAPI aygıtı yok (Linux kapsayıcı): olay güdümlü/yoklamalı mod zamanlaması, MMCSS'in etkisi, gerçek aygıt
  değişimi ve özel mod çakışması (Ş-1) yalnızca kodla ve sanal aygıtla değerlendirildi. Gerçek aygıt için
  `examples/ses_denemesi.rs` çalıştırılamadı.
- Zaman ölçümleri paylaşımlı 4 çekirdekli kapsayıcıda; en kötü değerler zamanlayıcı gürültüsü içerir, medyan ve %99
  daha güvenilirdir. Windows'ta `sync_all` (FlushFileBuffers) süresi ölçülemedi.
- `loom` kullanılmadı; yırtık okuma çok iş parçacıklı stres testiyle gösterildi (x86-64 bellek modelinde). ARM'da
  `Relaxed` yeniden sıralama ek karışımlar doğurabilir (ör. yeni `count` + eski süzgeç yuvası); hedef şu an yalnızca x86-64.
- Arayüz tarafı (erişilebilirlik, bileşen durum yarışları) bu alanın dışında; yalnızca çekirdek komutlarını nasıl
  çağırdığı kadarıyla okundu.

## 7. Önerilen öncelik sırası

1. **RTS-03** (tek satırlık düzeltme, bit-perfect vaadi): `open_next`'e bit derinliği denetimi.
2. **RTS-01** (geçiş kapısı / `latest_seq`, eskimiş oturumu kısarak kapatma): iki oturumun üst üste çalması ve tık.
3. **RTS-02** (durdurma, oynat-bitti, bit-perfect değişimi, aygıt değişimi, kör test için üç adım): görsellerin donması
   ve belge–kod uyumu. RTS-01 ile aynı altyapıyı (sıralı, kilitsiz hazırlık) kullanır; birlikte yapılmalı.
4. **RTS-05** (iki satır): `apply_parametric`'te kilidi diske yazmadan önce bırakmak.
5. **RTS-04 + RTS-07** birlikte: katsayıları yazıcı tarafında hesaplayıp hazır takımı yayımlamak (ya da en azından seqlock).
6. **RTS-06**: arayüzde crossfeed'in çok kanallıda “atlandı” gösterimi.
