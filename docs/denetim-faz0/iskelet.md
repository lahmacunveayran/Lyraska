# İskelet — bağımsız denetim raporu (Faz 0)

Alan: Faz 0'da kurulan mimari iskelet bugün (0.0.56, commit `94bc3d6`) taşıyıcı mı. Bulgu öneki `ISK-`.
Ses/DSP/analiz algoritmalarının doğruluğu kapsam dışıdır; bu rapor yapıya bakar.

## 1. Özet

- **Puan: 7/10.** İskelet sağlam ve büyük ölçüde sözünü tutuyor. Göç çerçevesi, atomik ayar yazımı, tek köprü
  (`backend.ts`), ts-rs tip üretimi ve CI kapısı, komut adı sözleşmesi, panik günlüğü ve hata sınırları örnek
  gösterilecek düzeyde. Puanı düşüren dört orta kusur var: kilit disiplini, çökme yalıtımı, işaretlerde kayıp
  güncelleme ve tip denetlemeyen komut sözleşmesi.
- **Kritik ya da Yüksek bulgu yok.** Orta önemde 4, Düşük önemde 6, Bilgi düzeyinde 3 bulgu var.
- **ISK-01 (Orta):** "Hazırlık oynatıcı kilidinin dışında yapılır" kuralı yalnızca `open_track` ve `seek_playback`'te
  uygulanıyor. Durdurma, bitmiş ya da hatalı şarkıyı yeniden çalma, aygıt kurtarma, bit-perfect değişimi, kör test
  kurma/bitirme, parametrik EQ kaydı (fsync) ve sıradaki şarkının analizini başlatma hâlâ `Mutex<Player>` altında
  bloklayan iş yapıyor. Aygıt kurtarma her `visual_frame` çağrısının içinden tetikleniyor.
- **ISK-02 (Orta):** `panic = "abort"` ile tek bir panik, arka plandaki analiz ya da tarama iş parçacığında bile,
  bütün programı kapatıyor. "Bu dosya çökertti" bilgisi kalıcı tutulmadığı için aynı dosya her açılışta yeniden
  denenir (çökme döngüsü). Mekanizma deneyle kanıtlandı. Tetik bulunamadı: symphonia 0.6.1 üzerinde 54 000
  mutasyonda panik çıkmadı. Önem bu yüzden düşürüldü.
- **ISK-03 (Orta):** `annotation_evaluate` dosyayı okur, saniyelerce ölçer ve sonra yazar. Ölçüm sürerken otomatik
  kaydedilen yeni işaretler ölçüm sonucuyla birlikte eski hâline döner (kullanıcı emeği kaybolur).
- **ISK-04 (Orta):** `check:commands` yalnızca komut ve argüman **adlarını** denetliyor. Tür değişikliği (ör.
  `seconds: f64` → `String`) yeşil geçiyor (mutasyonla gösterildi). `invoke<T>` dönüş türü de hiçbir yerde
  doğrulanmıyor.
- Ölçek: Rust 30 564 satır, testler dışında boş olmayan 17 785 satır. TS testler dışında 12 567 satır, testler
  6 270 satır. 54 komut var. En büyük taşıyıcı `audio/player.rs`: testler dışında 1 743 satır ve 51 `pub fn`.
  Bütün komutlar tek bir `Mutex<Player>`'dan geçiyor. Bu bugün yönetilebilir, ama büyümenin darboğazı burası.

## 2. Kapsam ve yöntem

**Okunan dosyalar (tamamı ya da ilgili bölümleri):**

- `CLAUDE.md`, `docs/MIMARI.md`, `README.md` (veri klasörü bölümü).
- `src-tauri/src/{lib.rs, main.rs, commands.rs, settings.rs, storage.rs, diagnostics.rs, data_dirs.rs}`.
- `library/{mod,db,service,scan}.rs` (açma, işlemler, tarama), `analysis/{cache,background,annotation}.rs`,
  `analysis/map_file.rs` (`MapStore`).
- `audio/player.rs` (kilit altındaki yollar, `Drop`'lar, geçiş), `audio/decode.rs` (`open`, `probe`, çözme döngüsü).
- `src-tauri/Cargo.toml`, `tauri.conf.json`, `capabilities/default.json`, `.github/workflows/ci.yml` (ilgili adımlar).
- `src/{main.tsx, App.tsx}`, `src/lib/{backend.ts, errorReporting.ts, eq.ts, sync.ts, crossfeed.ts, parametric.ts}`.
- `src/components/{ErrorBoundary.tsx, PlayerScreen.tsx (hook dökümü), MarkerPanel.tsx}`.
- `src/hooks/{useVisualFeed, usePlayer, useParametric, useMarker, useLibrary, useSongMap, useSongKey}.ts`.
- `scripts/check-commands.mjs`.

**Yalıtım:** Yasaklı kaynaklar okunmadı. Ana depoya yazılmadı; ana depoda derleme ya da test çalıştırılmadı. Bütün
deneyler `.../bagimsiz/iskelet/` altında yapıldı. Ana depodaki `src/lib/bindings` denetim sırasında geçici olarak
silinmişti (başka bir işin CI taklidi). Bu yüzden okumalar `git clone` ile alınan kopyadan (`iskelet/repo`, `94bc3d6`)
yapıldı.

**Komutlar ve deneyler (hepsi kendi klasörümde):**

1. **Ölçek:** `wc -l`. `strip_tests.py` `#[cfg(test)] mod …` bloklarını ayıklar ve testler dışındaki Rust kodunu
   `prod/` altına koyar; panik makroları ve `unwrap` bu kopyada arandı.
2. **Kullanılmayan `pub fn`'ler:** `deadpub.py` ile. **Döngüsel bağımlılık:** `cycles.py` ile (TS içe aktarma
   grafiği, Tarjan) ve Rust modül referanslarının grep'iyle.
3. **`check:commands` mutasyonları:**
   - M1: argüman adı değişti. Kapı kırmızı (doğru).
   - M2: Rust parametre türü değişti. Kapı yeşil (açık).
   - M3: `commands::` dışında kayıtlı komut. Kapı yeşil (görmüyor).
4. **Vitest mutasyonları:** TS crossfeed hazır ayarı değiştirildi; Rust'la karşılaştıran test kırmızı (doğru). TS'deki
   Rust aynası sınırlar (`eq.ts`, `sync.ts`, `parametric.ts`) değiştirildi; yalnızca TS'deki sabitlenmiş testler
   kırmızı (bkz. ISK-10).
5. **`panic = "abort"` kanıtı:** `abort/abort.rs` küçük bir programdır. Arka plan iş parçacığında dilim taşması,
   abort ile derlenince süreci çıkış kodu 134 ile öldürüyor. Unwind ile derlenince ana iş parçacığı yaşıyor.
6. **symphonia mutasyon taraması (`fuzz/`):** Program, `decode.rs`'teki
   `probe → default_track → make_audio_decoder → next_packet/decode → copy_to_slice_interleaved` akışını aynen
   izler. `src-tauri/tests/data/` altındaki 6 sentetik dosyanın her biri önce 3 000 başlık mutasyonundan, sonra
   6 000 tüm dosya mutasyonundan geçti. Toplam 54 000 mutasyonda **0 panik** çıktı. Özgün dosyaların hepsi doğru
   çözüldü (sağlama).
7. **SQLite bozulma deneyi (`bozuk/deney.py`):** Python sqlite3 3.45.1 ile `storage.rs`'teki V1–V7 göçleri
   kuruldu. Sonra farklı sayfalar bozuldu ve `Library::init` + `storage::migrate` + ilk sorgu sırası tek tek
   izlendi (bkz. ISK-07).

**Sınırlar:**

- Windows'ta çalışma yapılmadı. Kilit altındaki işlerin gerçek süreleri (WASAPI açma, NTFS fsync) ölçülmedi.
- Bu yüzden ISK-01'in etkisi kod okumasına ve kodun kendi yorumlarına dayanıyor ("yüzlerce ms").
- Rust derlemesi yalnızca ISK-02 deneyi için (yalnızca symphonia) yapıldı. Uygulamanın kendisi derlenmedi.

## 3. Bulgular

### ISK-01 — Hazırlığı kilit dışında yapma kuralı yarım: birçok geçiş hâlâ oynatıcı kilidini tutuyor

- Önem: Orta · Güven: Kesin (akış), Yüksek (sürelerin Windows'taki etkisi) · Standart: ISO/IEC 25010 performans
  verimliliği / zaman davranışı, Tokio "blocking in async" kılavuzu.
- Yer:
  - `src-tauri/src/commands.rs:213-219` (`stop_playback`), `:205-211` (`toggle_playback`), `:540-551`
    (`apply_parametric`), `:196-203` (`set_next_track`), `:592-608` (`song_map_import`).
  - `src-tauri/src/audio/player.rs:1284-1290` (`stop` → `load`), `:1242`, `:1248` (`play`: bitmiş ya da hatalı
    oturum), `:946-966` (`recover_device` → `restart`), `:1502` ve `:1644` (`visual_now` ve `status` önce
    `recover_device` çağırır).
  - `player.rs:995-1027` (`abx_install` → `close_session` + aygıt açma), `:1056` (`abx_stop` → `restart`),
    `:1394-1414` (`set_playback_options` → `restart`), `:1085` (`set_next` → `Analysis::start`, içinde
    `cache.load` + `Decoder::open`, `:531`, `:546`).
- Kanıt:
  - `open_track` ve `seek_playback` doğru deseni kullanıyor: `begin_transition` kilit altında,
    `spawn_blocking(Player::prepare)` kilit dışında, `install` kilit altında (`commands.rs:168-172`, `:227-233`).
  - Ama:

    ```rust
    // commands.rs:215-218
    let mut player = player.lock()?;
    player.stop().map_err(reported)?;      // stop → load → restart → prepare (aynı iş parçacığı)
    ```

    ```rust
    // player.rs:755-762  restart: "geçişin üç adımı art arda, aynı iş parçacığında"
    let transition = self.begin_transition(path, autoplay, start_secs);
    self.install(Self::prepare(transition))
    ```

  - `prepare` içinde kısılmanın bitmesi beklenir (`FADE_OUT_TIMEOUT` 300 ms, `player.rs:54`). Eski oturumun iş
    parçacıkları `join` edilir, dosya açılır, ön dolum yapılır ve ses aygıtı açılır. Kodun kendi yorumu bu işin
    "yüzlerce ms (yavaş diskte saniyeler)" sürdüğünü söylüyor (`player.rs:666-670`).
  - `apply_parametric` kilidi tutarken `store.update` çağırıyor. Bu çağrı `File::create` + `sync_all` +
    `rename` yapıyor (`settings.rs:154-167`):

    ```rust
    let mut player = player.lock()?;
    let applied = player.set_parametric(settings);
    store.update(|s| s.parametric = applied.clone())   // fsync kilit altında
    ```

  - `useParametric.ts:84-104` sürükleme boyunca istekleri arka arkaya gönderir (bir yanıt dönünce sıradaki).
    Yani sürükleme süresince kilit altında art arda fsync yapılır.
  - Bütün bu komutlar `async fn`. Kilit `std::sync::Mutex`, yani bekleme Tauri'nin Tokio iş parçacıklarında
    bloklayarak yapılıyor (iş parçacığı sayısı = çekirdek sayısı).
- Senaryo ve etki:
  - Kullanıcı çalarken parametrik EQ bandını sürükler. Her adımda fsync yapılır. Bu sürede `visual_frame` (saniyede 60) ve `playback_status` (250 ms) aynı kilidi bekler, görseller takılır. HDD'de ya da antivirüsün yazmaları
    taradığı bir makinede bu hissedilir.
  - Kulaklık takılıp çıkarılır. Aygıt kurtarma bir `visual_frame` çağrısının içinden yeniden açılır ve görseller ile
    durum sorgusu yüzlerce ms donar.
  - 2 çekirdekli bir dizüstünde iki yoklama kilitte beklerken Tokio'nun iki iş parçacığı da dolar. Bu sırada
    `track_cover`, `library_search` gibi ilgisiz komutlar da bekler.
  - Ses zaten bu anlarda kesildiği için önem Orta tutuldu. Sürükleme sırasındaki takılma dışında kullanıcıya etkisi
    kısa.
- Öneri:
  1. `stop_playback`, `toggle_playback` (Ended/Error dalı), `playback_options_set` ve `abx_stop` için
     `open_track`'teki üçlüyü kullanın. `Player`'a ör. `begin_stop()`, `begin_resume()` ekleyin; bunlar
     `Option<Transition>` döndürsün ve komut `spawn_blocking(prepare)` ile hazırlasın.
  2. `recover_device`'ı `status`/`visual_now`'dan çıkarın. Yalnızca bir bayrak dönsün; `playback_status` komutu
     geçişi kilit dışında başlatsın.
  3. `apply_parametric`'te kilidi `set_parametric`'ten hemen sonra bırakın (`equalizer_set` gibi). Ayar yazımını
     sürükleme bitince yapın (ya da 300 ms sonra birleştirin).
  4. `set_next` içindeki `Analysis::start`'ı `Transition` gibi iki adıma bölün ya da `spawn_blocking`'e alın.
  5. Kuralı bir testle denetleyin: kilit tutulurken `prepare` çağrılırsa test başarısız olsun.

### ISK-02 — `panic = "abort"` ile çökme yalıtımı yok; sorunlu dosya her açılışta programı yeniden çökertebilir

- Önem: Orta · Güven: Kanıtlandı (mekanizma), Olası (tetik) · Standart: ISO/IEC 25010 güvenilirlik / hata
  toleransı ve kurtarılabilirlik.
- Yer:
  - `src-tauri/Cargo.toml` (`[profile.release] panic = "abort"`).
  - `src-tauri/src/lib.rs:52-53` (açılışta `request_scan`), `:60-73` (arka plan analizi açılışta başlar).
  - `analysis/background.rs:124` (`skip` yalnızca bellekte), `:137-152`.
  - `library/scan.rs` (paralel `Decoder::open`).
- Kanıt:
  - `background.rs` içinde şu satır var:

    ```rust
    let mut skip: HashSet<(PathBuf, FileStamp)> = HashSet::new();   // her açılışta boş
    ```

  - Kodun hiçbir yerinde `catch_unwind` ya da kalıcı bir "işleniyor" işareti yok (`grep`). Zaten
    `panic = "abort"` ile `catch_unwind` işe yaramaz.
  - Deney (`abort/`):

    ```
    panic=abort çıkış kodu: 134      (arka plan iş parçacığındaki dilim taşması süreci öldürdü)
    ana iş parçacığı yaşıyor ...      (unwind ile yalnızca iş parçacığı ölür)
    panic=unwind çıkış kodu: 0
    ```

  - Testler dışındaki Rust kodunda `unwrap`/`expect`/`panic!` yok (temiz). Ama 188 dilim indeksleme yeri var (çoğu
    DSP ve analiz). Clippy'de `indexing_slicing` açık değil. Bu yerlerden biri kullanıcının dosyasından gelen veriyle
    taşarsa, kütüphanedeki bütün dosyaları işleyen arka plan iş parçacığı programı kapatır.
- Senaryo ve etki: Kullanıcının müzik klasöründe çözücüyü ya da analizi taşıran bir dosya var. Program açılır,
  tarama ve analiz sırası o dosyaya gelir, pencere kaybolur. Her açılışta aynısı olur. Günlükte `ÇÖKME` satırı
  kalır (iyi), ama yazılımcı olmayan sahibi için çıkış yolu yoktur.
- Çürütme denemesi:
  - `decode.rs` akışıyla aynı bir test programı yazıldı ve symphonia 0.6.1, projenin 6 sentetik dosyasından
    türetilen 54 000 mutasyonla zorlandı: **0 panik**. Yani bugün bilinen bir tetik yok. Önem bu yüzden Yüksek'ten
    Orta'ya düşürüldü.
  - Projenin kendi analiz kodu (188 indeksleme) bu taramanın kapsamında değildi.
- Öneri:
  1. Arka plan analizi ve tarama bir dosyaya başlamadan önce yolunu küçük bir "işleniyor" dosyasına (ya da
     veritabanı satırına) yazsın, bitince silsin.
  2. Açılışta bu kayıt duruyorsa, o dosya kalıcı "atla" listesine alınsın ve günlüğe yazılsın.
  3. Daha geniş seçenek: arka plan analizini `panic = "unwind"` + `catch_unwind` ile yalıtmak (profil başına seçilemez,
     bu yüzden ayrı bir süreç gerekir). Bu büyük bir değişiklik; önce 1. ve 2. maddeler yeterli.

### ISK-03 — İşaret dosyasında kayıp güncelleme: ölçüm sürerken kaydedilen işaretler geri alınır

- Önem: Orta · Güven: Kesin · Standart: ISO/IEC 25010 güvenilirlik / veri bütünlüğü (işlevsel doğruluk).
- Yer:
  - `src-tauri/src/commands.rs:664-689` (`annotation_evaluate`).
  - `src/hooks/useMarker.ts:157-182` (otomatik kayıt), `:250-262` (`evaluate`).
  - `src/components/MarkerPanel.tsx:284` (yalnızca "Doğruluğu ölç" düğmesi kapanıyor).
- Kanıt:

  ```rust
  let mut annotation = store.load(&track)...;            // t0: işaretler A
  let result = spawn_blocking(|| evaluate_file(...)).await  // "birkaç saniye sürer"
  annotation.evaluation = Some(result);
  store.save(&annotation)                                 // A + sonuç yazılır (B'nin üstüne)
  ```

  - Arayüzde ölçüm sürerken işaretleme (Space/D) ve otomatik kayıt kapalı değil. Otomatik kayıt `evaluating`'e
    bakmıyor. `AnnotationStore` dosya başına kilit ya da sürüm denetimi yapmıyor (`annotation.rs:121-139`).

- Senaryo ve etki:
  1. Sahibi işaretlerken "Doğruluğu ölç"e basar.
  2. Ölçüm sürerken şarkı çalmaya ve işaretleme sürmeye devam eder. Yeni vuruşlar (B) otomatik kaydedilir ve
     `dirty=false` olur.
  3. Ölçüm biter ve dosyaya A + sonuç yazılır.
  4. Arayüzde B görünür, ama artık "kirli" değildir. Kullanıcı başka şarkıya geçerse B diske hiç yazılmaz.

  İşaretler projenin beat F-ölçüsü hedefinin doğruluk verisi; kaybolması emek kaybı.

- Öneri:
  - `annotation_evaluate` yalnızca `evaluation` alanını güncellesin: kaydetmeden hemen önce dosyayı yeniden okusun ve
    `beats`/`drops` değişmişse sonucu yazmasın (ya da "işaretler değişti" hatası dönsün).
  - Arayüzde `evaluating` sürerken işaretlemeyi kapatın.

### ISK-04 — Komut sözleşmesi denetimi türleri görmüyor; `invoke<T>` dönüşleri doğrulanmıyor

- Önem: Orta · Güven: Kanıtlandı · Standart: ISO/IEC 25010 bakım kolaylığı / test edilebilirlik; OpenSSF
  "gerçek kalite kapısı" ilkesi.
- Yer: `scripts/check-commands.mjs:26-55` (yalnızca ad ve `Option<` bilgisi), `:61` (yalnızca `commands::`
  önekli kayıtlar), `src/lib/backend.ts` (54 `invoke<T>` çağrısı).
- Kanıt (kendi kopyamda):

  ```
  M1 (open_track { filePath }):            Komut sözleşmesi bozuk ... exit=1   ✔
  M2 (seek_playback seconds: f64→String):  Komut sözleşmesi tamam ... exit=0   ✘
  M3 (generate_handler'a diagnostics::ghost_command): tamam ... exit=0         ✘
  ```

  - `backend.ts`'teki `invoke<number>("audio_delay_get")` gibi dönüş türleri elle yazılmış. Rust tarafındaki
    `Result<i32, String>` değişirse `tsc` bunu yakalamaz.
  - ts-rs yalnızca yapı tiplerini üretiyor; komut imzalarını üretmiyor.

- Senaryo ve etki: Bir oturum Rust'ta bir parametrenin türünü değiştirir. CI'daki her şey yeşil kalır. Sahibi
  düğmeye bastığında "invalid args `seconds` for command …" diye İngilizce bir hata görür. `MIMARI.md`'deki
  "Arayüzün çağırdığı komut ve argümanlar çekirdekte var" satırı doğru, ama "aynı türde" garantisi yok.
- Öneri: Komut imzalarını da üretin. `tauri-specta` ya da küçük bir yol: `check-commands.mjs`'te parametre
  türlerini `f64|i32|usize → number`, `bool → boolean`, `String|PathBuf → string`, diğerleri → bindings tipi
  olarak eşleyin ve `backend.ts`'teki fonksiyon imzalarıyla karşılaştırın. `commands::` dışı kayıtları hata sayın.

### ISK-05 — `commands.rs` "ince" kuralından sapma: komut katmanında dosya G/Ç, çözücü açma, iş kuralı ve platform kodu

- Önem: Düşük · Güven: Kesin · Standart: ISO/IEC 25010 bakım kolaylığı / modülerlik.
- Yer: `commands.rs`. Dosya testler dışında 770 satır (boş olmayan); 54 komut, 41 `player.lock()`.
- Kanıt (iş yapan yerler, sayım: 11):
  - Dosya okuma, yazma ve yol türetme: `headphone_import` (`:436-443`, okuma + ad türetme), `parametric_import`
    (`:527`), `parametric_export` (`:537`), `song_map_export` (`:588`), `calibration_track` (`:366-372`).
  - Yalnızca kimlik ya da süre için `Decoder::open`: `track_lyrics` (`:189`), `song_map_export` (`:582`),
    `song_map_import` (`:598`), `annotated_track` (`:718`; `annotation_get`, `annotation_save` ve
    `annotation_evaluate` her çağrıda şarkıyı açar).
  - İş kuralı: "en az 8 beat" (`:672-674`). Aynı eşik arayüzde de var (`MarkerPanel.tsx:284`): iki yerde tutuluyor.
  - Platform kodu (`explorer`, `xdg-open`): `:739-784`.
  - Açılış kurulumu: `restore_settings`, `start_analysis_cache`, `set_map_store` (`:92-118`, `:629`).
  - Sabit `"Faz 2"`: `:67` (aynısı `backend.ts:150`'de de var).

  Bu `async` komutlardaki dosya G/Ç ve `Decoder::open` Tokio iş parçacığında bloklayarak yapılıyor (ağ
  paylaşımındaki bir dosyada uzun sürebilir).

- Senaryo ve etki: Bugün okunabilir. Ama her yeni özellik aynı deseni kopyalıyor. Dosya 965 satıra ulaştı ve kural
  hiçbir kapıyla denetlenmiyor (bkz. ISK-08).
- Öneri: G/Ç'yi ilgili modüle taşıyın: `HeadphoneProfile::from_file`, `ParametricSettings::{import,export}_file`,
  `MapFile::write`, `AnnotationStore::evaluate(path)`. Platform kodunu `platform.rs` dosyasına alın. Dosya açan
  `async` komutları `spawn_blocking` ile sarın.

### ISK-06 — Atomik yazma üç ayrı kopya; ikisinde diske işleme (`sync_all`) yok

- Önem: Düşük · Güven: Kesin (kod), Olası (etkinin NTFS'te görülmesi) · Standart: ISO/IEC 25010 güvenilirlik /
  kurtarılabilirlik.
- Yer: `settings.rs:154-167` (`sync_all` var), `analysis/annotation.rs:129-132` ve `analysis/map_file.rs:663-666`
  (`fs::write` + `rename`, `sync_all` yok).
- Kanıt: `std::fs::write(&temp, text)?; std::fs::rename(&temp, &path)?;` Ayrıca sabit `.json.tmp` adı kullanılıyor;
  aynı dosyaya eşzamanlı iki kayıt aynı geçici dosyayı ezer.
- Senaryo ve etki: İşaretleme sırasında elektrik kesilir. Yeniden adlandırma günlüğe işlenmiş, veri işlenmemiş
  olabilir ve işaret dosyası boş ya da bozuk kalır. Okuma `None` döner ve işaretler kaybolmuş görünür. Seyrek bir
  olay ama veri kullanıcı emeği.
- Öneri: Tek bir `fs_util::write_atomic(path, bytes)` yazın: benzersiz geçici ad + `sync_all` + `rename`. Üç yer
  bunu kullansın.

### ISK-07 — Veritabanı bozulması yalnızca açılışta ve yalnızca şema sayfasında yakalanıyor

- Önem: Düşük · Güven: Kanıtlandı (SQLite davranışı; Python sqlite3 3.45.1 ile aynı SQL sırası) · Standart:
  ISO/IEC 25010 kurtarılabilirlik.
- Yer: `library/db.rs:66-91` (`open`), `:435-446` (`is_corruption`).
- Kanıt (`bozuk/deney.py`):

  ```
  baslik(ilk 100 bayt)            -> init pragma: file is not a database       (yakalanır, kenara alınır)
  sayfa1 btree baslik             -> init pragma: database disk image is malformed (yakalanır)
  sayfa1 hucreler(sqlite_master)  -> init pragma: malformed                    (yakalanır)
  sayfa2 tamamen                  -> açılış+göç+count(*) geçti; integrity_check: malformed
  orta sayfa tamamen              -> açılış+göç+count(*) geçti; integrity_check: malformed
  ```

  - Veri sayfası bozuksa kütüphane "açılır". Sonraki sorgular (arama, tarama yazımı) her seferinde "database disk
    image is malformed" döner ve dosya hiçbir zaman kenara alınmaz.
  - `is_corruption`, `LibraryError::Schema(SchemaError::Database(..))` sarmalını da görmüyor. Deneyde göç
    sırasında bozulma çıkmadı; bu açık kuramsal.

- Senaryo ve etki: WAL + `synchronous=NORMAL` ile bozulma çok seyrek. Ama olursa kütüphane kalıcı olarak hata verir
  ve kendiliğinden düzelmez.
- Öneri: `init`'te `PRAGMA quick_check(1)` çalıştırın (büyük dosyada maliyeti ölçülmeli; gerekirse yalnızca önceki
  oturum düzgün kapanmadıysa). `is_corruption`'a `Schema(SchemaError::Database(e))` dalını ekleyin.

### ISK-08 — Belgeler kodla uyuşmuyor; "elle hatırlanacak kural yok" iddiası tutmuyor

- Önem: Düşük · Güven: Kesin · Standart: ISO/IEC 25010 bakım kolaylığı / analiz edilebilirlik.
- Yer: `README.md:48-49`, `docs/MIMARI.md:214-215`, `src-tauri/src/library/mod.rs:11`, `docs/MIMARI.md`
  ("Kurallar ve onları denetleyenler"), `CLAUDE.md` (mimari ağacı).
- Kanıt:
  - **Veri klasörü:** README ve MIMARI `%APPDATA%\com.lyraska.app` diyor. Uygulamanın kimliği
    `io.github.gozlemesevdalisi.lyraska` (`tauri.conf.json:5`), Tauri klasörü buna göre seçer. `library/mod.rs:11`
    kütüphaneyi hâlâ `%APPDATA%` (Roaming) altında gösteriyor, oysa `lib.rs:37-42` ve `data_dirs.rs` onu
    `%LOCALAPPDATA%`'ya taşıdı.
  - **Kural denetimi:** MIMARI "Her kural ya bir testle ya da CI'daki bir adımla denetlenir. Elle hatırlanması
    gereken kural yoktur" diyor. Ama "commands.rs ince kalır", "hazırlık kilit dışında" ve "komut dönüş türü
    bindings'ten" kurallarının denetleyeni yok.
  - **CLAUDE.md ağacı eksik:** `usePlayer`, `useKeyboardFocus`, `data_dirs.rs` ve `lib/` altındaki
    `analysis, clock, drop, eq, marks, scene, sceneClock, virtual` listede yok. `usePrefersReducedMotion.ts` bir hook
    olduğu hâlde `src/lib/` altında.
- Senaryo ve etki: Sahibine "şu klasörü silin" denirse yanlış klasörü arar. Yeni bir oturum belgeye güvenip
  denetlenmeyen kuralı çiğner.
- Öneri: Klasör adlarını düzeltin. MIMARI tablosuna "denetleyen: yok (gözden geçirme)" satırlarını dürüstçe ekleyin.
  Ağacı `ls` ile güncelleyin.

### ISK-09 — Ayar dosyası ileriye uyumlu değil: eski sürüm yeni alanları siler

- Önem: Düşük · Güven: Kesin · Standart: SemVer / veri uyumluluğu, ISO/IEC 25010 uyumluluk.
- Yer: `settings.rs:19-35` (`#[serde(default)]`, bilinmeyen alanlar atılıyor), `:91-101` (her değişiklikte bütün yapı
  yeniden yazılıyor).
- Kanıt: `Settings` yapısında `#[serde(flatten)] extra: serde_json::Map` gibi bir alan yok. Bilinmeyen alanlar
  okunurken düşüyor ve ilk kayıtta dosyadan siliniyor. Veritabanı tarafı bu durumu reddediyor
  (`storage.rs:187-189` `Newer`); ayarlar ise sessizce kaybediyor.
- Senaryo ve etki: Yeni bir test sürümü sorunlu çıkar ve sahibi eski bir kurulum dosyasına döner. İlk ayar
  değişikliğinde yeni sürümün ayarları (ör. ileride eklenecek bir crossfeed alanı) silinir. Sabit link tek sürüm
  verdiği için senaryo seyrek.
- Öneri: `Settings`'e `#[serde(flatten)] unknown: serde_json::Map<String, Value>` ekleyin. Bilinmeyen alanlar olduğu
  gibi geri yazılsın.

### ISK-10 — Rust sınırlarının TS aynaları çoğunlukla çapraz denetimsiz

- Önem: Düşük · Güven: Kanıtlandı (TS tarafı) / Kesin (Rust tarafında karşılaştırma yok) · Standart: ISO/IEC 25010
  bakım kolaylığı.
- Yer:
  - `src/lib/eq.ts:4-34` (`EQ_BANDS_HZ`, `EQ_MAX_DB`, `BASS_MAX_DB`, `BASS_CLUB_DB`, `PUNCH_MAX_DB`).
  - `src/lib/sync.ts:13-14` (gecikme sınırları), `src/lib/parametric.ts:8` (`PEQ_LIMITS`), `src/lib/musicalKey.ts`
    (Camelot).
  - Önizleme formülleri: `previewEqState`, `analogDb`.
- Kanıt:
  - Rust'ı okuyan karşılaştırma testi yalnızca iki tane: `src/lib/crossfeed.test.ts:62-71` (crossfeed hazır
    ayarları, mutasyonla kırmızı, doğru) ve `analysis/structure.rs:925` (`songMap.ts`).
  - Diğer sabitler değiştirildiğinde kırmızı olan testler yalnızca TS'deki sabitlenmiş değerler. Rust'taki değer
    (ör. `bass.rs:47 MAX_BASS_DB`) değişse TS testleri yeşil kalır, çünkü hiçbiri `src-tauri`'yi okumuyor (`grep`).
  - Değerler bugün tutarlı (elle karşılaştırıldı).
  - Not: `EqState` zaten `bandsHz` ve `maxGainDb` taşıyor; TS kopyaları bunlar için gereksiz.
- Öneri: `crossfeed.test.ts`'teki deseni `eq.ts`, `sync.ts` ve `parametric.ts` sınırlarına uygulayın. Daha iyisi
  sınırları bir `Limits` yapısıyla ts-rs üzerinden dışa verin.

### ISK-11 — Kapanış ve tek örnek: oynatıcı kapanışta durdurulmuyor, ikinci örnek engellenmiyor

- Önem: Bilgi · Güven: Yüksek (Tauri 2 olay döngüsü süreçten çıkarken yönetilen durumu düşürmez) · Standart:
  ISO/IEC 25010 güvenilirlik.
- Yer: `lib.rs:183-188`, `library/service.rs:262-264`, `Cargo.toml` (single-instance eklentisi yok).
- Kanıt:
  - `RunEvent::Exit`'te `LibraryState::shutdown` yalnızca `scan.cancel()` yapıyor; tarama `join` edilmiyor.
    `BackgroundState::shutdown` `join` ediyor (iyi, analiz iptal edilebilir).
  - `PlayerState` için kapanış yok: WASAPI oturumu süreç sonlanırken kesilir (olası bir "tık").
  - Program iki kez açılabiliyor. İki örnek aynı `settings.json`, aynı günlük ve aynı SQLite dosyasını kullanır
    (son yazan kazanır; SQLite WAL + `busy_timeout` ile güvenli).
- Öneri: `Exit`'te `PlayerState`'i kilitleyip `close_session` çağırın. `tauri-plugin-single-instance` ekleyin (lisansı
  MIT/Apache, `deny.toml` ile uyumlu).

### ISK-12 — Zehirlenmiş kilit yolları sürümde ölü kod; geliştirmede günlüğü saniyede ~64 satırla doldurur

- Önem: Bilgi · Güven: Kesin · Standart: ISO/IEC 25010 analiz edilebilirlik.
- Yer: `commands.rs:84-88` (`PlayerState::lock` her başarısızlıkta `reported(...)` ile günlüğe yazar).
- Kanıt: Sürüm derlemesi `panic = "abort"`: Mutex hiç zehirlenmez. Geliştirme derlemesinde (unwind) bir komut
  kilit altında paniklerse `visual_frame` (saniyede 60) ve `playback_status` (saniyede 4) her çağrıda bir HATA
  satırı yazar. Arayüzdeki tekrar süzgeci (`errorReporting.ts`) Rust'ın kendi yazdığı satırlara uygulanmıyor.
- Öneri: `PlayerState::lock`'ta günlük satırını bir kez yazın (`AtomicBool`).

### ISK-13 — Küçük düzensizlikler

- Önem: Bilgi · Güven: Kesin.
- Kanıt:
  - `src/lib/backend.ts:100`: `getSongMap`'e ait belge yorumu sahipsiz kalmış, `getTrackCover`'ın üstünde.
  - `eq.ts` ↔ `backend.ts` içe aktarma döngüsü var, ama tek yönü `import type` (çalışma anında döngü yok).
  - Rust'ta `audio` ↔ `analysis` ↔ `director`, `audio` ↔ `visual_bridge` karşılıklı referans var. Crate içinde
    sorun değil, ama `audio::player` her şeyi bilen düğüm (51 `pub fn`).
  - Testler dışında yalnızca testlerde kullanılan birkaç `pub fn` var (`meter::tatums` hiç kullanılmıyor).

## 4. Olası riskler (kanıtı yetmeyenler)

- **Kilit zinciri:** `PlayerState` → `AnalysisCache.conn` (Mutex) → SQLite yazma kilidi (5 sn `busy_timeout`).
  Arka plan analizi `cache.store` sırasında Mutex'i tutarken kütüphane taramasının yazma işlemini bekleyebilir.
  O sırada `set_next_track` (oynatıcı kilidi altında `Analysis::start` → `cache.load`) bu Mutex'i bekler.
  Tarama işlemleri kısa toplu yazımlar (`db.rs:254-299`), bu yüzden pratikte milisaniyeler. Ölçülmedi.
- **Yeniden çizim yükü:** `PlayerScreen` yaklaşık 24 özel hook'u tek bileşende topluyor ve context kullanmıyor.
  Durum yoklaması saniyede 4 kez bütün kabuğu yeniden çizdiriyor. MIMARI'de "çizim yükü" testi var; büyüdükçe izlenmeli.
- **Kullanıcının seçtiği yola yazma:** Bütün komutlar webview'den çağrılabilir (Tauri 2'de uygulama komutları için
  izin bildirimi yok). Örnekler: `parametric_export` ve `song_map_export` istenen yola yazar, `headphone_import`
  istenen dosyayı okur. CSP sıkı ve içerik yerel olduğu için ancak bir XSS ile sömürülebilir. Ayrıntısı güvenlik
  denetiminin alanı.
- **Panik kancası:** Günlük açılamazsa (`diagnostics::init` erken döner) panik kancası hiç kurulmaz. Sürümde konsol
  da yok (`windows_subsystem`), yani çökme izsiz kalır. `big_data_dir` taşıması günlük açılmadan önce yapılıyor;
  hataları da yazılmıyor.

## 5. Temiz bulunanlar

- **Göç çerçevesi (`storage.rs`):**
  - `user_version`, `BEGIN IMMEDIATE` ve savepoint ile adımlar bir işlem içinde ve atomik; hata olursa her şey geri
    alınıyor.
  - İleri sürüm dosyası açılmıyor ve kullanıcıya Türkçe bir mesaj gösteriliyor (`Newer`).
  - Önbellek tablosu uyuşmazsa yalnızca önbellek yeniden kuruluyor; kütüphaneye dokunulmuyor.
  - Göç adımlarında `IF NOT EXISTS` disiplini var. Dilim indeksleri güvenli (`start ≤ supported`).
- **Ayarlar (`settings.rs`):**
  - Geçici dosya + `sync_all` + `rename` kullanılıyor.
  - Bozuk alan tek başına varsayılana dönüyor. JSON değilse dosya `.bozuk` olarak saklanıyor.
  - Okunamayan (kilitli) dosyanın üstüne yazılmıyor.
  - `update` Mutex altında yapıldığı için ayarlarda kayıp güncelleme yok.
- **Panik politikası:** Testler dışındaki Rust kodunda `unwrap()`, `expect()`, `panic!`, `unreachable!`, `todo!`
  yok (testlere ait `#[cfg(test)]` yardımcıları hariç).
- **Lint susturma:** Susturma yalnızca iki yerde: `eq.rs` `needless_range_loop` ve `wasapi.rs`'te fonksiyon düzeyinde
  belgeli `unsafe` izni.
- **Çökme günlüğü (`diagnostics.rs`):**
  - Kanca `panic = "abort"`tan önce çalışıyor; yığın izi var, iş parçacığı adı var.
  - Günlük 1 MB'ta döndürülüyor (en fazla ~2 MB). Her satırda boyut denetleniyor.
  - Günlük hatası programı çökertmiyor; yazımlar tek bir Mutex ile sıralanıyor.
  - Arayüzden gelen satırlar 4 000 karakterle sınırlı; arayüzdeki tekrar süzgeci döngü hatalarında günlüğü
    koruyor.
- **Tek köprü:** `@tauri-apps/api` yalnızca `src/lib/backend.ts` içinden kullanılıyor (`grep`). 54 komutun hepsi
  arayüzden çağrılıyor ve hepsi kayıtlı (`check:commands` yeşil).
- **ts-rs:**
  - Arayüze giden bütün tiplerin bindings karşılığı var.
  - CI bindings'i silip yeniden üretiyor ve fark varsa kırmızı oluyor (`ci.yml:91-104`).
  - `ts-rs` dışında kalan `Serialize` tipleri (`MapFile`, `Settings`, `HeadphoneSettings`, `BeatGrid`,
    `Loudness`...) arayüze gitmiyor; bunlar dosya ya da önbellek biçimleri.
- **Hata modeli:**
  - `thiserror` türleri kendi katmanında. Komut sınırında Türkçe `String`'e çevriliyor ve `reported()` ile günlüğe
    yazılıyor.
  - Arayüz hata metnini eşleştirmeye çalışmıyor (`errorMessage` tek nokta). Bu ölçekte yeterli.
- **Hata sınırları:** Kök sınır var, panel ve sahneler de kendi sınırlarında (`PlayerScreen` içinde 19 kullanım).
  Yakalanmamış hata ve söz reddi günlüğe gidiyor.
- **Hook temizliği:**
  - Her `setInterval`, `setTimeout`, `requestAnimationFrame` ve `addEventListener` için bir temizleme var
    (`useVisualFeed` modül düzeyinde abonelik sayacıyla iptal ediyor).
  - Yoklamalar "yanıt gelmeden yenisi yok" kuralını uyguluyor (`usePlayer.ts:231-253`, `useVisualFeed.ts:111-128`).
  - `StrictMode` altında çift efekt güvenli.
- **"Ağır iş Rust'ta":** `src/lib` ve `src/hooks` içinde ses ya da analiz hesabı yok. TS'deki eğri önizlemeleri
  (~120 noktalık analog formül) sürükleme anındaki geri bildirim için ve hafif. Gerçek eğri Rust'tan geliyor.
- **Arka plan analizi:** Düşük öncelikli, iptal edilebilir, kapanışta `join` ediliyor. Ön plan analizini bekliyor.
- **Kütüphane:** Taramanın toplu yazımları işlem içinde. Klasör çıkarılırken yarış (yabancı anahtar) önleniyor.
- **Modül yapısı:** Alt modül düzeni tutuluyor (`audio/output/{wasapi,simulated}.rs`, `analysis/*`, `library/*`).
  Döngüsel çalışma anı bağımlılığı yok.

## 6. Öncelikli düzeltme sırası

1. **ISK-03:** `annotation_evaluate` kaydetmeden önce dosyayı yeniden okusun ve işaretler değiştiyse sonucu
   yazmasın. Ölçüm sürerken işaretlemeyi kapatın.
2. **ISK-02:** Arka plan analizi ve tarama için kalıcı "işleniyor" işareti ve "atla" listesi (çökme döngüsünü kırar).
3. **ISK-01:** `stop`, `toggle` (Ended/Error), `abx_stop` ve `playback_options_set`'i
   `begin_* → spawn_blocking(prepare) → install` desenine taşıyın. `recover_device`'ı yoklamalardan çıkarın.
   `apply_parametric`'te kilidi kaydetmeden önce bırakın.
4. **ISK-04:** `check-commands.mjs`'e tür eşlemesi ekleyin ve `commands::` dışı kayıtları reddedin (ya da imzaları
   üretin).
5. **ISK-06:** Tek bir `write_atomic` (benzersiz geçici ad + `sync_all`) yazın ve üç yer onu kullansın.
6. **ISK-05:** Dosya G/Ç'sini ve `Decoder::open`'ı modüllere taşıyın; `async` komutlarda `spawn_blocking`
   kullanın.
7. **ISK-08:** README, MIMARI ve `library/mod.rs`'teki veri klasörü adlarını düzeltin. MIMARI'deki "denetleyen"
   tablosunu dürüst hâle getirin.
8. **ISK-07:** Açılışta `quick_check`; `is_corruption`'a `Schema` dalı.
9. **ISK-10:** `eq.ts`, `sync.ts` ve `parametric.ts` sınırlarına Rust'ı okuyan karşılaştırma testi.
10. **ISK-09 / ISK-11:** Ayarlarda bilinmeyen alanları koruyun. Kapanışta oynatıcıyı kapatın ve tek örnek
    eklentisini ekleyin.

Deney dosyaları:

- `/tmp/claude-0/-home-user-Lyraska/1cce850b-acae-5ab5-93b5-aa4dd064f1d6/scratchpad/bagimsiz/iskelet/fuzz/`
  (`src/main.rs`, `sonuc-tum-dosya.txt`)
- `/tmp/claude-0/-home-user-Lyraska/1cce850b-acae-5ab5-93b5-aa4dd064f1d6/scratchpad/bagimsiz/iskelet/abort/abort.rs`
- `/tmp/claude-0/-home-user-Lyraska/1cce850b-acae-5ab5-93b5-aa4dd064f1d6/scratchpad/bagimsiz/iskelet/bozuk/deney.py`
- `/tmp/claude-0/-home-user-Lyraska/1cce850b-acae-5ab5-93b5-aa4dd064f1d6/scratchpad/bagimsiz/iskelet/strip_tests.py`
- `/tmp/claude-0/-home-user-Lyraska/1cce850b-acae-5ab5-93b5-aa4dd064f1d6/scratchpad/bagimsiz/iskelet/deadpub.py`
- `/tmp/claude-0/-home-user-Lyraska/1cce850b-acae-5ab5-93b5-aa4dd064f1d6/scratchpad/bagimsiz/iskelet/cycles.py`
