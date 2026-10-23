# Mimari iskelet — bağımsız denetim raporu (Faz 0)

Denetlenen: `kod/` kopyası, commit `4d09cb9` (sürüm 0.0.62). Önek: **ISK**.

## 1. Özet

- **Puan (a) depodaki kod ve yapılandırma: 8/10.** Modül yapısı, kalıcılık (bölünmez yazma, sıralı göç, bozuk dosyayı kenara alma, çökme döngüsü koruması) ve Rust ↔ arayüz sözleşmesi örnek düzeyinde. Ama oynatıcı kilidinin altında hâlâ disk G/Ç'si ve ses aygıtı açılışı yapan üç yol var. Bu, projenin kendi "kilit dışında hazırla" kuralıyla çelişiyor.
- **Puan (b) GitHub ayarları dahil: 7/10.** Sözleşme kapıları (`check:commands`, ts-rs farkı) CI'da gerçekten kırmızı oluyor. Ama `main`'i koruyup korumadıkları dal koruması ayarına bağlı ve bu ayar depodan doğrulanamıyor (bkz. 6. bölümün sonu).
- En önemli bulgu (Orta) **ISK-01**: bit-perfect ayarının çalarken değişmesi, kör testin kurulması ve sıradaki şarkının bildirilmesi işlerini `Mutex<Player>` altında yapıyor. Bu işler dosya açma, önbellek sorgusu, sesin kısılmasını bekleme (≤ 300 ms), ön dolum (≤ 1–3 sn) ve ses aygıtını açmayı içeriyor. Kilit tutulduğu sürece görsel kareler ve durum sorguları bekliyor.
- **ISK-02 (Düşük):** Geçiş sürerken (sarma ya da açılış) basılan "duraklat" ve "çal" sessizce kayboluyor. Arayüz de "çalıyor" göstermeye devam ediyor.
- **ISK-03 (Düşük):** Kütüphane dışından açılan şarkıların analiz kayıtları hiç silinmiyor. Veritabanı dosyası hiç küçülmüyor (VACUUM yok).
- **ISK-04 / ISK-05 (Düşük):** Arayüzde aynı "tek istek uçuşta, son değer bekler" deseni üç hook'ta ayrı ayrı yazılmış ve testsiz. `Player` 56 genel yöntemli bir "her şey nesnesi" olmuş.
- Doğru yapılanlar (mutasyonla doğrulandı): Komut sözleşmesi denetimi 14 farklı bozmanın 14'ünü de yakaladı. Kilit sırası tutarlı, kilitlenme döngüsü bulunmadı. Ses çıkış iş parçacığında kilit ya da bellek ayırma yok. 440 arayüz testinin hepsi ve tür denetimi geçiyor.

## 2. Kapsam ve yöntem

**Okunan dosyalar:**

- `src-tauri/src/`:
  - `lib.rs`, `commands.rs`, `settings.rs`, `atomic_file.rs`, `data_dirs.rs`, `storage.rs`
  - `library/{mod,db,scan,service}.rs` (ilgili kısımlar)
  - `analysis/{background,cache,annotation}.rs`, `analysis/map_file.rs` (`MapStore`, `verify`)
  - `audio/player.rs`: oturum, geçiş, ABX, ayarlar, görsel yolu ve testlerin adları
  - `audio/render.rs`, `audio/eq.rs` ve `audio/peq.rs`: kilitsiz kanallar
  - `audio/output/wasapi.rs` (döngü ve iş parçacıkları), `audio/decode.rs` (`open`), `diagnostics.rs` (kilit ve panik kancası)
- `src/lib/backend.ts`, `src/lib/bindings/` (56 dosya), `src/lib/errorReporting.ts`, `src/lib/coreMirrors.test.ts`
- `src/hooks/`: `usePlayer`, `usePlayback`, `useEqualizer`, `useLibrary`, `useVisualFeed`
- `scripts/check-commands.mjs`, `scripts/check-rules.mjs`, `.github/workflows/ci.yml` (ilgili adımlar)
- `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
- `docs/MIMARI.md`: yalnızca kodla karşılaştırmak için

**Deneyler:** Kendi klasörümde (`is-iskelet/repo`) bir klon açtım ve `node_modules`'ı sembolik bağla ekledim.

- `node scripts/check-commands.mjs` temiz kodda: "58 komut, arayüzde 58 çağrı; … 54 dönüş türü eşleşiyor".
- **Mutasyon sınaması (14 bozma, hepsi kırmızı):**
  1. argüman adı değişti (`secs`)
  2. argüman türü `string`
  3. dönüş türü yanlış
  4. `generate_handler!`'dan komut silindi
  5. Rust parametresi `String` yapıldı
  6. Rust parametresi `Option`'dan zorunluya çevrildi
  7. Rust dönüşü `bool → i32`
  8. `Option` dönüşünde `| null` eksik
  9. `invoke` takma adla çağrıldı
  10. komut adı değişkenle verildi
  11. `core.invoke` ile yanlış komut adı
  12. `as unknown as` ile tür sahteciliği
  13. nesne literali
  14. `commands.rs` dışında tanımlı komut
- `npm test`: 53 dosya, 440 test, hepsi geçti. `npm run typecheck`: temiz.
- Hook'ların test kapsamını grep ile saydım: 26 hook'tan 19'una hiçbir testte doğrudan atıf yok.

**Sınırlar:** BRIEF gereği Rust derlemesi ve testi çalıştırılmadı. Rust tarafındaki bulgular kod okumasına dayanıyor. Windows'ta süre ölçümü yapılamadı: ISK-01'deki süreler koddaki üst sınırlardan (`FADE_OUT_TIMEOUT`, `PREFILL_TIMEOUT`) alındı. DSP ve analiz algoritmaları kapsam dışı.

## 3. Bulgular

### ISK-01 — Oynatıcı kilidi altında hâlâ G/Ç ve ses aygıtı açılışı var (kural kısmen uygulanmış)

- Önem: **Orta** · Güven: **Kesin** (kilit altında yapıldığı). Sürenin ne kadar olduğu ortama bağlı (Yüksek). · Standart: ISO/IEC 25010 performans verimliliği ve güvenilirlik; projenin kendi kuralı (`docs/MIMARI.md` "Tauri komutları: Kısa sürer; ağır işi arka plana verir").
- Yer:
  - `src-tauri/src/commands.rs:546` → `audio/player.rs:1483-1503` (`set_playback_options` → `restart`)
  - `commands.rs:984` → `player.rs:1050-1091` (`abx_install` → `close_session` + `prepared.start()`)
  - `commands.rs:233` → `player.rs:1143-1162` (`set_next` → `Analysis::start` → `start_analysis` `player.rs:561-597`)
  - `player.rs:1286-1295` (`adopt_analysis`, her görsel karede)
- Kanıt:
  - `commands.rs:546`: `let applied = player.lock()?.set_playback_options(options);` Bu çağrı çalan şarkıda bit-perfect değişince `self.restart(&track.path, resume, Some(position))` yapıyor (`player.rs:1499`). `restart` ise `self.install(Self::prepare(transition))`. Yani kilit altında şunlar oluyor: eski sesin kısılması (`wait_for_fade_out`, ≤ 300 ms), `Decoder::open`, ön dolum (`PREFILL_TIMEOUT` = 3 sn'ye kadar), aygıtı özel modda açma ve gerekirse paylaşımlı modda ikinci kez açma.
  - `commands.rs:984`: `player.lock()?.abx_install(prepared)`. Bunun içinde `self.close_session();` (≤ 300 ms bekleme ve iş parçacığı birleştirme) ve `prepared.start()` → `Playback::start` (`abx.rs:542-572`: `wait_for_prefill(&shared, Duration::from_secs(1))`, `output::spawn`) çalışıyor. Hata dalında `self.abx_stop()` tam şarkı açılışını yine kilit altında yapıyor (`player.rs:1118-1123`).
  - `commands.rs:233`: `player.lock()?.set_next(path);` → `Analysis::start` → `cache.load(...)` (önbellek `Mutex<Connection>` ve SQLite, `busy_timeout` 5 sn), `Decoder::open(path)` iki kez ve `maps.load(path)` (dosya okuma). Hepsi oynatıcı kilidi tutulurken.
  - Aynı komut dosyası öbür yolları bilerek kilit dışına almış: `open_track`, `toggle_playback`, `seek_playback`, `stop_playback`, aygıt toparlama ve `abx_stop` hep "kilit altında başlat → kilit dışında `prepare` → kilit altında `install`" kalıbında (`commands.rs:194-198`, `255-266`). Yani kural biliniyor ama her yola uygulanmamış.
- Senaryo ve etki:
  - (1) Kullanıcı şarkı çalarken Ayarlar'da bit-perfect'i açıp kapatıyor. Kilit 0,3–1 sn (sürücü özel modu reddederse daha uzun) tutuluyor. `visual_frame` (saniyede 60) ve `playback_status` beklediği için sahneler donuyor, süre ilerlemiyor.
  - (2) Kör test başlatılıyor: aynı donma.
  - (3) Kütüphanedeki şarkı ağ paylaşımında ya da uyuyan bir harici diskteyse, her şarkı açılışından hemen sonra `usePlayback` `set_next_track` gönderiyor (`usePlayback.ts:99-103`). Sıradaki dosyanın açılışı ve önbellek sorgusu kilidi yüzlerce ms tutabiliyor.
  - Ek etki: Tauri async komutları tokio işçilerinde std `Mutex` beklerken işçiyi bağlıyor. 2 çekirdekli bir dizüstünde bekleyen `visual_frame` + `playback_status` + asıl komut bütün işçileri doldurup kütüphane aramasını bile bekletebilir. Bu kısım ölçülmedi (Olası).
  - Ses kesilmiyor (çıkış iş parçacığı ayrı). Veri kaybı yok. Bu yüzden Orta.
- Öneri:
  - (a) `set_playback_options`'ı `begin_*` kalıbına çevirin: `Player::begin_playback_options(options) -> (Result<()>, Option<Transition>)`. Komut `finish_transition` ile tamamlasın.
  - (b) `abx_install`'ı ikiye bölün: kilit altında `begin_abx` (oturumu `take()` edip kısmaya başlasın), kilit dışında `close + Playback::start`, kilit altında `seq` denetimiyle takma.
  - (c) `set_next`'te `Analysis::start`'ı kilit dışına alın: komut önce kilitsiz `Analysis::start` çağırsın, sonra kilit altında `install_next(path, analysis)` ile yalnızca yol hâlâ aynıysa taksın.
  - (d) `player.rs` testlerine "geçiş kilit dışında" testinin (`gecis_kilit_disinda_hazirlanir_…`) bu üç yol için eşini ekleyin.
- Çürütme denemesi:
  - Arayüz `set_next_track`'i ve bit-perfect değişimini seyrek gönderiyor olabilir. Doğru, ama `usePlayback` her şarkı değişiminde gönderiyor ve bit-perfect bir kullanıcı ayarı. Etkinin seyrek ama gerçek olduğu sonucunu değiştirmiyor.
  - `Analysis::start`'ın kilit dışına alındığını gösteren başka bir sarmalayıcı aradım (`commands.rs` tümü, `player.rs:1143`): yok.
  - Bu yolları kilit dışında yapan bir test aradım (test adları listesi): yok.
  - Önemi Orta'da bıraktım, çünkü ses ve veri etkilenmiyor.

### ISK-02 — Geçiş sürerken "duraklat" ve "çal" kayboluyor

- Önem: **Düşük** · Güven: **Kesin** · Standart: ISO/IEC 25010 işlevsel doğruluk
- Yer: `src-tauri/src/audio/player.rs:1347-1352` (`pause`), `1317-1338` (`begin_play`), `1381-1389` (`state`); `commands.rs:239-252`
- Kanıt:
  - Geçiş sürerken `self.session` boş ve `self.pending` dolu.
  - `toggle_playback` önce `player.state() == PlaybackState::Playing` sorusunu soruyor (`pending.playing` ise evet) ve `player.pause()` çağırıyor. `pause` ise yalnızca `if let Some(session) = &self.session` olunca bir şey yapıyor: işlem yapılmıyor.
  - Ters durumda (`pending.playing == false`) `begin_play`'in ilk satırı `let session = self.session.as_ref()?;`. `None` dönüyor, çalma isteği de düşüyor.
  - Hazırlık bitince oturum, `Transition.autoplay`'deki eski hedefle kuruluyor.
  - Arayüzde sarma (`usePlayer.ts:189-227`) komut sırasına (`run`) girmediği için, sarma sürerken Boşluk tuşu bu yola gerçekten ulaşabiliyor.
- Senaryo ve etki: Yavaş diskte sarma 0,3–3 sn sürebiliyor (eski sesin kısılması, ön dolum). Kullanıcı ok tuşuyla sarıp hemen Boşluk'a basıyor. Şarkı duraklamıyor, ekranda "çalıyor" kalıyor ve hiçbir hata gösterilmiyor. Kullanıcı ikinci kez basmak zorunda kalıyor.
- Öneri: `pause` ve `begin_play` içinde `session` yoksa `pending.playing`'i güncelleyin ve `install` takarken bu değeri uygulasın (`Prepared` içine taşınan `autoplay` yerine `pending`'den okunan). Bir birim testi ekleyin: `begin_seek` → `pause` → `prepare` → `install` sonunda durum `Paused` olmalı.

### ISK-03 — Kütüphane dışı şarkıların analiz kayıtları silinmiyor; veritabanı hiç küçülmüyor

- Önem: **Düşük** · Güven: **Kesin** (silinmediği). Boyut etkisi Olası. · Standart: ISO/IEC 25010 kaynak kullanımı; Windows uygulama verisi kuralları (Local'daki yeniden üretilebilir veri)
- Yer: `src-tauri/src/storage.rs:69-70` (tek silme yolu tetikleyici), `analysis/cache.rs:268-275` (`INSERT OR REPLACE`), `player.rs:589-597` (her açılan dosya önbelleğe yazılıyor)
- Kanıt:
  - `grep -rn 'DELETE FROM\|VACUUM\|wal_checkpoint' src-tauri/src` komutu, analiz kayıtları için yalnızca `analyses_follow_tracks` tetikleyicisini (`AFTER DELETE ON tracks`) buluyor.
  - "Dosya aç" ile açılan, kütüphanede olmayan her yol (kalibrasyon `tiklama.wav` dahil) `analyses` tablosuna yazılıyor ve hiçbir koşulda silinmiyor.
  - Taşınan ya da adı değişen bir kütüphane dışı dosya yeni bir satır açıyor. Eskisi kalıyor.
  - `auto_vacuum` ya da `VACUUM` olmadığı için kütüphaneden çıkarılan klasörlerin boşalttığı sayfalar da dosyayı küçültmüyor.
  - Bir analiz kaydı dakika başına 3600 kare × (32 + 4 + 4) bayt ham veri taşıyor (`BANDS = 32`, `VALUES_PER_FRAME = 4`, `onset f32`), sonra deflate ile sıkıştırılıyor.
- Senaryo ve etki: Kütüphane kullanmadan sürekli "Dosya aç" ile dinleyen ya da indirme klasöründen çalan bir kullanıcının `%LOCALAPPDATA%\…\library.sqlite3` dosyası sınırsız büyüyor. Etki yavaş ve yalnızca disk alanı. Ayrıca ilgili olası risk: büyük dosyada açılıştaki `quick_check` uzuyor (4. bölüm).
- Öneri: `storage.rs` sonuna yeni bir adım eklemeden yapılabilir. Arka plan analizi boşta kaldığında (`background::idle`) şunu çalıştırın: `DELETE FROM analyses WHERE path NOT IN (SELECT path FROM tracks) AND rowid NOT IN (son N açılan)`, ya da bir `last_used` sütunu ekleyip (yeni göç adımı) 90 günden eski kütüphane dışı kayıtları silin. Ayrıca yeni dosyalarda `PRAGMA auto_vacuum = INCREMENTAL` (göç adımıyla) ve boşta `incremental_vacuum` kullanın.

### ISK-04 — Arayüzdeki istek birleştirme deseni üç kez kopyalanmış ve testsiz

- Önem: **Düşük** · Güven: **Kesin** · Standart: ISO/IEC 25010 bakım kolaylığı (yeniden kullanılabilirlik, test edilebilirlik); CLAUDE.md "Hesaplama mantığı saf fonksiyonlara ayrılır ve test edilir"
- Yer: `src/hooks/useEqualizer.ts:88-108`, `useParametric.ts`, `useCrossfeed.ts` (`inFlight` ve `pending` referansları)
- Kanıt:
  - `grep -n 'inFlight\|pending.current' src/hooks/*.ts` sonucu: `useEqualizer` 8, `useParametric` 9, `useCrossfeed` 8 satır. Üçü de "tek istek uçuşta, aradakilerden son değer gönderilir" mantığını kendi içinde yazıyor.
  - Hiçbir test dosyası bu üç hook'a atıf yapmıyor (grep: 0).
  - Çekirdek tarafı bu sıralamaya güveniyor. `equalizer_set` önce oynatıcıya uyguluyor, sonra kilit dışında `store.update` çağırıyor (`commands.rs:417-420`). İki istek aynı anda gelirse ses B'de, diskteki ayar A'da kalabiliyor. Bunu önleyen tek şey bu testsiz arayüz sıralaması.
- Senaryo ve etki: İleride bir oturum bu hook'lardan birini düzenleyip sıralamayı bozarsa, yeniden açılışta ayar kullanıcının son duyduğundan farklı geri yükleniyor. Bunu hiçbir test yakalamıyor.
- Öneri: `src/lib/latestOnly.ts` adında saf bir yardımcı yazın (`createLatestSender(send)`) ve `latestOnly.test.ts` ile sınayın. Üç hook onu kullansın. Çekirdekte de `equalizer_set` ve benzerlerinde `store.update` kapanışı içinde `player.equalizer()`'ı okuyarak "son uygulanan değer yazılır" garantisini sağlayın (oynatıcı kilidi → ayar kilidi sırası zaten bu yönde).

### ISK-05 — `Player` her şeyi taşıyan tek nesne; `commands.rs` "ince" değil

- Önem: **Düşük** · Güven: **Kesin** · Standart: ISO/IEC 25010 bakım kolaylığı (modülerlik, analiz edilebilirlik)
- Yer: `src-tauri/src/audio/player.rs` (testlerden önce 1 975 satır, `impl Player` içinde 56 `pub fn`); `commands.rs` (testlerden önce 1 037 satır)
- Kanıt: Komut çıktısı: `player.rs test-oncesi=1975`, `impl Player` `pub fn` sayısı 56. `Player` aynı anda şunları yönetiyor:
  - oturum ve geçiş
  - analiz düzenleme (önbellek, sıradaki şarkı, arka plan sayacı)
  - şarkı haritası içe/dışa aktarma (`export_song_map`, `import_song_map`: parmak izi doğrulaması ve dosya yazma, kilit altında)
  - ABX
  - EQ, PEQ, crossfeed ve eşitleme ayarları
  - görsellerin EQ yansıması

  `commands.rs` da 58 komutun yanında oynatıcıyla ilgili geçiş mantığını (`finish_transition`, `ask_save_path`, `write_chosen`) taşıyor.

- Senaryo ve etki: Faz 1+ işleri (yeni görsel verisi, çalma listeleri, crossfade) çoğunlukla bu iki dosyaya ekleniyor. Her ekleme tek büyük kilidin kapsamını büyütüyor (ISK-01'in kök nedeni). Yeni oturumların bir yolu kilit altında unutma olasılığı artıyor.
- Öneri: Küçük adımlarla ayırın:
  - `audio/player/transition.rs` (Transition/Prepared/Session)
  - `analysis/orchestrator.rs` (Analysis, AnalysisContext, `set_next`'in analiz kısmı)
  - `analysis/map_file.rs` içine `import/export` işlevleri (yalnızca `Arc<Spectrogram>` alsın; komut kilitten yalnızca spektrumu klonlayıp alsın)

  Davranış değişmesin; mevcut testler korunsun.

### ISK-06 — Kütüphane dışı işler async işçide engelleyici disk yazması yapıyor

- Önem: **Bilgi** · Güven: **Kesin** · Standart: ISO/IEC 25010 performans verimliliği
- Yer:
  - `commands.rs:418` (ve diğer `store.update` çağrıları): `atomic_file::write` → `sync_all`
  - `commands.rs:853` (`store.load`) ve `867` (`store.save`): `blocking` dışında
- Kanıt: `blocking(...)` yardımcısı (`commands.rs:271-277`) "diskte uzun süren bir okuma onları bağlarsa görsel kareleri … sıraya girer" diyor. Ama ayar ve işaret yazmaları (fsync dahil) doğrudan async işçide çalışıyor.
- Senaryo ve etki: Sürgü sürüklenirken (birleştirme sayesinde saniyede birkaç kez) HDD'de fsync 10–50 ms işçiyi bağlıyor. Pratikte fark edilmez.
- Öneri: `store.update` ve `AnnotationStore` çağrılarını `blocking(...)` içine alın. Tutarlılık için yeterli.

## 4. Olası riskler (kanıtı yetmeyenler)

- **Açılışta büyük veritabanında `quick_check` ana iş parçacığını bekletebilir.** `lib.rs:98-107`, `setup` içinde `open_checked(..., unclean)` çağırıyor. Önceki oturum düzgün kapanmadıysa `PRAGMA quick_check(1)` bütün sayfaları okuyor (`library/db.rs:131-139`).
  - Binlerce analizli bir dosya yüzlerce MB'ı geçebilir (ISK-03 hesabı). `setup` Tauri'de ana iş parçacığında çalışıyor ve pencere bu sürede yanıt vermiyor.
  - Windows yeniden başlatılırken programın `RunEvent::Exit`'i görüp görmediği (oturum işaretinin silinip silinmediği) doğrulanamadı. Görmüyorsa her güncelleme sonrası açılışta bu denetim yapılıyor.
  - Öneri: Denetimi arka plan iş parçacığına alın. Pencere "kütüphane denetleniyor" diye açılsın.
- **Arama sonucu her tarama turunda 50 000 satıra kadar yeniden gönderiliyor.** `useLibrary.ts:83-94`, `status.trackCount` her değiştiğinde (tarama sırasında 600 ms'de bir) `searchLibrary(query)` çağırıyor, sınır `MAX_RESULTS = 50_000` (`db.rs:14`). Büyük kütüphanenin ilk taramasında saniyede megabaytlarca JSON üretilebilir. Ölçülmedi.
- **İşaret dosyası adında Windows'a ayrılmış adlar.** `annotation.rs` `file_name`, `CON`/`NUL`/`AUX`/`COM1` gibi adları ayıklamıyor. Sanatçısız ve başlığı "Con" olan bir şarkıda `Con.xxxxxxxx.json` oluşuyor. Bunun Windows 10'da reddedildiği ya da aygıta yönlendiği bilinen bir davranış ama burada denenmedi.
- **Bölünmez yazmada geçici dosya adı sabit (`<ad>.tmp`).** Bugün bütün çağıranlar kendi kilidini tutuyor: `SettingsStore` Mutex'i, `AnnotationStore::writes`, `MapStore` oynatıcı kilidi altında. Bu şart `atomic_file.rs` belgesinde yazmıyor. Kilitsiz yeni bir çağıran iki yazmayı karıştırabilir.
  - Ek risk: Windows'ta bir virüs tarayıcısı hedefi açık tuttuğunda `rename` başarısız oluyor ve ayar kaydı yeniden denenmeden hata veriyor.
- **Eski hazırlık sessizce durduruluyor.** Bayat bir `install` (`player.rs:953-959`) hazırlanan oturumu kısmadan `stop` ile kapatıyor ve kilit altında iş parçacıklarını birleştiriyor. Sarma sürerken yeni şarkı açılınca iki oturum çok kısa üst üste çalıp "tık" sesi duyulabilir. Özel modda ikinci oturum aygıtı meşgul bulabilir. Arayüz açılışları sıraya soktuğu için seyrek.

## 5. Temiz bulunanlar

- **Rust ↔ arayüz sözleşmesi:**
  - `check:commands`, mutasyon sınamasında 14 bozmanın 14'ünü yakaladı: ad, tür, dönüş, `null`, kayıt, takma ad, değişken ad, tür zorlaması, `commands.rs` dışı komut.
  - ts-rs tipleri CI'da önce silinip yeniden üretiliyor ve fark varsa iş kırmızı oluyor (`ci.yml:100-114`). Silinen bir tipin eski dosyası da yakalanıyor.
  - `coreMirrors.test.ts`, arayüzdeki sabitlerin Rust'taki asıllarıyla aynı olduğunu denetliyor.
  - Hatalar Türkçe metin olarak dönüyor. Arayüzde metin eşleştirmesiyle karar veren kod yok.
- **Kilit sırası:** Bulunan sıralar oynatıcı → ayarlar, oynatıcı → önbellek bağlantısı, oynatıcı → `segments`, kütüphane → sorunlar. Ters yönde alınan kilit bulunmadı, kilitlenme döngüsü yok. Async komutlarda std `Mutex` koruyucusu hiçbir `await`'in ötesine taşınmıyor (koruyucular geçici değer olarak aynı ifadede bırakılıyor).
- **Ses çıkış iş parçacığı:** `render.rs` ve WASAPI döngüsünde kilit, dosya erişimi ya da ayırma yok. EQ, PEQ ve crossfeed ayarları atomik sürüm sayaçlarıyla iletiliyor. Hata dalında yalnızca `shared.fail` kilitleniyor (akış zaten bitiyor).
- **Geçiş tasarımı:** `begin → prepare → install` ve sıra numarası. Bayat hazırlık testle korunuyor (`daha_yeni_gecis_baslamissa_eski_hazirlik_takilmaz`).
- **Kalıcılık:**
  - Ayarlarda alan alan hoşgörülü okuma ve tanınmayan alanların korunması (`settings.rs:37-40, 124-176`). Okunamayan dosyanın üstüne yazılmıyor.
  - `atomic_file` geçici dosya + `sync_all` + ad değiştirme kullanıyor.
  - İşaret ölçümünde kayıp güncelleme koruması var (`save_evaluation`).
  - Bozuk SQLite dosyası tarihli adla kenara alınıyor.
  - Göçler `IMMEDIATE` işlemde. Önbellek uyuşmazlığında kütüphaneye dokunulmadan yeniden kuruluyor. Daha yeni şema reddediliyor.
- **Veri klasörleri:** Roaming'de küçük ve yeniden üretilemez veri, Local'da büyük ve yeniden üretilebilir veri (Windows kuralına uygun). Taşıma ya hep ya hiç yapılıyor. Tek örnek kilidi işletim sisteminin dosya kilidiyle alınıyor.
- **Arka plan işleri:** Analiz düşük öncelikli ve oynatıcının analizini bekliyor. Çökme döngüsü koruması hem analizde hem taramada var. Taramada klasör arada silinirse yazma yapılmıyor. Kapanışta arka plan analizi durdurulup birleştiriliyor.
- **Arayüz katmanı:**
  - `usePlayer` komutları sıraya koyuyor. `useVisualFeed` tek döngü kullanıyor ve aynı anda tek istek uçuşta. Durum sorguları birikmiyor.
  - Hata raporlama tekrar süzgeçli.
  - Tauri izinleri dar (`core:event` dinleme/bırakma, `dialog:allow-open`). CSP `unsafe-eval`'e izin vermiyor.
- **Testler ve tür denetimi:** `npm test` 440/440 geçti, `npm run typecheck` temiz.

## 6. Öncelikli düzeltme sırası

1. **ISK-01:** `set_playback_options` ve `abx_install`'ı `begin/prepare/install` kalıbına geçirin. `set_next`'in analiz başlatmasını kilit dışına alın. Üçü için "kilit dışında" testi yazın.
2. **ISK-02:** Geçiş sürerken gelen duraklat/çal isteğini `pending` üzerinden saklayıp `install`'da uygulayın. Testini ekleyin.
3. **ISK-04:** İstek birleştirmeyi tek saf yardımcıya alıp test edin. Çekirdekte "son uygulanan değer kaydedilir" garantisini sağlayın.
4. **ISK-03:** Kütüphane dışı analiz kayıtlarını boşta temizleyin. Artımlı vacuum için göç adımı ekleyin.
5. **Olası risk (`quick_check`):** Açılıştaki denetimi arka plana alın.
6. **ISK-05:** `player.rs`'i geçiş, analiz düzenleme ve harita içe/dışa aktarma olarak üç modüle bölün (davranış aynı kalsın).
7. **ISK-06:** Ayar ve işaret yazmalarını `blocking` içine alın.
8. `atomic_file.rs` belgesine "aynı yola eşzamanlı yazma çağıranın kilidiyle önlenmeli" şartını yazın. `annotation.rs`'te Windows'a ayrılmış adları ayıklayın.

### Proje sahibinin ayarına bağlı

- Komut sözleşmesi (`check:commands`) ve ts-rs farkı denetimi ancak `main` dal korumasında **zorunlu durum denetimi** olarak işaretliyse birleştirmeyi engeller. Dal koruması depo kodundan görülemediği için doğrulanmadı. (b) puanı bu yüzden bir puan düşük. Yapılacak iş:
  1. GitHub'da `lahmacunveayran/Lyraska` → Settings → Branches (ya da Rules → Rulesets) sayfasını açın.
  2. `main` için "Require status checks to pass" seçeneğini açın.
  3. "Arayüz (TypeScript)" ve "Çekirdek (Rust)" işlerini zorunlu yapın.
- Bu alanda kod imzası sertifikası gerektiren bir madde yok.
