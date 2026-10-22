# Ses motoru ve çalma (SES) — Denetim 1 raporu

Kaynak: main @ 94bc3d6 (0.0.56). Karşılaştırma tabanı: dbfb3e4 (0.0.50). Tarih: 22 Ekim 2026.

## 1. Kapsam ve yöntem

- **Okunanlar (satır satır):** `audio/output/wasapi.rs`, `output.rs`, `output/simulated.rs`, `player.rs` (oturum,
  geçiş, aygıt toparlama, çözme döngüsü, testler), `render.rs`, `limiter.rs`, `normalize.rs` (seviye tablosu, Leveler),
  `decode.rs` (open/seek/next_chunk, `read_lyrics`), `gapless.rs`, `resample.rs` (kurulum), `crossfeed.rs` (işlemci),
  `eq.rs` (işlemci), `bass.rs`/`punch.rs` (flush), `loudness.rs` (`gain_db`, kanal ağırlıkları), `lyrics.rs::for_track`,
  `commands.rs` (oynatıcı komutları), `analysis/spectrogram.rs::measure_loudness`/`early_loudness`, `tests/formats.rs`.
  Arayüz tarafında yalnızca ses yolunu tetikleyen kısımlar: `src/hooks/usePlayer.ts`, `usePlayback.ts`, `lib/queue.ts`.
- **Gerileme okuması:** `git diff dbfb3e4..HEAD` (ses dosyaları + `commands.rs`; 5 commit: 0.0.52 #90, 0.0.53 #83,
  0.0.54 #93, 0.0.55, 0.0.56).
- **Bağımlılık doğrulaması:** `windows-0.62.2` kaynağında `AvSetMmThreadCharacteristicsW` /
  `AvRevertMmThreadCharacteristics` imzaları (`src/Windows/Win32/System/Threading/mod.rs:34, 109-115`).
- **Deneyler** (`scratchpad/d1/ses/`):
  - `limiter_sim.py`, `limiter_tp.py`: `limiter.rs`'in birebir python kopyası (8×/4×/2× çok fazlı sinc, kayan en küçük +
    hızlı iniş/80 ms dönüş + kayan ortalama, 72 karelik gecikme). Gerçek tepe ölçümü 16× Kaiser ara değerleme, kenarlar
    atılarak.
  - ffmpeg ile `tests/data` seslerinin çözülmesi ve örnek sayıları.
- Derleme/test çalıştırılmadı (koordinatör bildirdi: Rust 424 + 4 kodek testi, clippy ve Windows hedefli clippy temiz).
  Windows'a özel davranış (WASAPI, MMCSS, aygıt değişimi) yalnızca kod okumasıyla değerlendirildi.

## 2. Önceki bulguların durumu

| Kod          | Konu                                                     | Bugünkü durum                                                                                                                                                                                                        | Kanıt                                                                                                                                                                                                                                               |
| ------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SES-01       | Aygıt değişince akış eski aygıtta kalır                  | **kısmen** (izleme ve otomatik yeniden açma var; başarısız toparlamada yeni bir çıkmaz doğdu → D1-SES-01; sayaç hiç sıfırlanmıyor → D1-SES-03)                                                                       | `wasapi.rs:192-204` (izleyici), `:225-228`; `player.rs:946-967`                                                                                                                                                                                     |
| SES-02 / A9  | Kilit altında bloklayan açma/sarma                       | **kısmen** (aç ve sar kilit dışında; durdur, bitince/hatada "çal", bit-perfect değişimi, aygıt toparlama, kör test hâlâ kilit altında → D1-SES-06)                                                                   | `commands.rs:165-175, 222-234`; `player.rs:754-762, 966, 1241-1250, 1284-1290, 1409-1413, 1013, 1056`                                                                                                                                               |
| SES-03 / S4  | Ses iş parçacığına öncelik yok                           | **birleşti, doğrulandı**                                                                                                                                                                                             | `wasapi.rs:151-182`; imza `windows-0.62.2 …/Threading/mod.rs:109-115` (NULL → `Err`), `is_invalid` ek kontrolü zararsız; tutamaç aynı iş parçacığında (`spawn` kapanışı `:216`) düşer                                                               |
| SES-04       | İlk ses için 0,6 s bekleme                               | **birleşti** (0,15 s + erken tahmin); erken tahminin yükseltme yapabilmesi yeni risk → D1-SES-05                                                                                                                     | `render.rs:58`, `spectrogram.rs:509-527`, `normalize.rs:186-199, 232-244`                                                                                                                                                                           |
| MAT-01       | Sınırlayıcı örnekler arası tepeyi görmüyor               | **birleşti, doğrulandı (44,1/48 kHz)**; tavanın −1 dBTP seçilmesi nötr yolu değiştirdi → D1-SES-04; 96/192 kHz'te kaçırma payı belgedekinden büyük → D1-SES-09                                                       | `limiter.rs:9-20, 36-38, 147-176`; deney §4                                                                                                                                                                                                         |
| SES-10       | Bit-perfect'te sınırlayıcı yolda                         | **kısmen**: sınırlayıcı atlanıyor (`render.rs:122-123`, `limiter.rs:117-121`); kayan noktalı kaynak hâlâ "32 bit, bit-perfect" sayılıyor (`decode.rs:102-106`) ve `to_device` kırpması duruyor (`render.rs:294-300`) |                                                                                                                                                                                                                                                     |
| SES-11       | "Crossfeed var" belge–kod uyumsuzluğu                    | **kapandı** (0.0.54'te gerçekten eklendi)                                                                                                                                                                            | `crossfeed.rs`, `render.rs:221`                                                                                                                                                                                                                     |
| S1           | MP3'te ilk 47 örnek                                      | **birleşti, doğrulandı**                                                                                                                                                                                             | `decode.rs:207-215` `pts + trim_start`; ffmpeg ile `uc-uc-ton.mp3/.ogg/.flac` = 66 150 örnek, testteki değerle aynı; `.m4a` akış süresi `duration_ts=66150` (ffmpeg'in ham çıkışı 66 560: son dolguyu atmıyor; proje doğru)                         |
| S2 / S3      | Bit-perfect dar bit; özel modda son tampon               | **birleşti**                                                                                                                                                                                                         | `player.rs:323-338`; `wasapi.rs:452-466`                                                                                                                                                                                                            |
| S5           | EQ korumasına bildirilen yükseltme anlık                 | **açık** (pratikte küçük)                                                                                                                                                                                            | `eq.rs:740-742` `-self.design.preamp_db` (o anki tasarım, hedef değil); bas motoru `max(current,target)` bildiriyor (`bass.rs:522-525`). EQ yumuşak yürüdüğü ve koruma 10 ms'de indiği için etkisi bir blok kadar gecikme                           |
| S6           | Bas/vuruş zarfı denormal                                 | **kısmen**                                                                                                                                                                                                           | biquad durumları her turda sıfırlanıyor (`bass.rs:569-579`, `punch.rs:132-140`, `crossfeed.rs:355-360`, `peq.rs:1116`); skaler zarflar hâlâ geometrik sönüyor ve sıfırlanmıyor: `bass.rs:361-363, 615`, `punch.rs:156`. CPU etkisi ihmal edilebilir |
| S7           | Bozuk `elst`'te u64 taşması                              | **açık**                                                                                                                                                                                                             | `gapless.rs:47` `let delay = media_time * rate / media_scale;` (sürümde sarar; `checked_mul`/u128 yok)                                                                                                                                              |
| S8 / SES-08  | Kör test başlangıç < 0,5 s'de eksi kayma aranmıyor       | **açık**                                                                                                                                                                                                             | `abx.rs:369, 386` değişmedi (0.0.50'den beri commit yok)                                                                                                                                                                                            |
| S9 / SES-09  | Hata yutma noktaları, `ResetRequired`                    | **açık**                                                                                                                                                                                                             | `resample.rs:62` "Ses aygıtı hatası" olarak dönüyor; `player.rs:1737-1744` dönüştürücü kurulamazsa sessiz `break`; `player.rs:1817-1820` `open_next` `.ok()?`; `decode.rs:267-268` yalnızca `DecodeError` atlanıyor                                 |
| S10          | `SLOTS = 8`; `next_path` boşluksuz geçişten sonra eski   | **açık**                                                                                                                                                                                                             | `normalize.rs:27`; `player.rs:1071-1073` erken dönüş (`[X, Y, Y]` sırasında ikinci Y boşluksuz çalmaz)                                                                                                                                              |
| S11 / SES-06 | 5/7.1 ağırlıkları, çok kanal                             | **açık**                                                                                                                                                                                                             | `loudness.rs:228-235` (5 kanalda Ls/Rs 1,0); `resample.rs:82-88` yalnızca mono→stereo                                                                                                                                                               |
| U2           | Boşluksuz olmayan geçiş 250 ms yoklamaya bağlı           | **açık**                                                                                                                                                                                                             | `usePlayer.ts:18` `POLL_MS = 250`, `onEnded` yalnızca `applyStatus` içinde; çekirdekte `emit` yok (`grep -rn "\.emit(" src-tauri/src` boş)                                                                                                          |
| SES-05       | Opus/HE-AAC uzantıları                                   | **açık**                                                                                                                                                                                                             | `decode.rs:25-28` (`mka`, `webm`, `aac` hâlâ listede)                                                                                                                                                                                               |
| SES-07       | Duraklatınca konum ~100 ms geride                        | **açık**                                                                                                                                                                                                             | `wasapi.rs:436-450` değişmedi                                                                                                                                                                                                                       |
| SES-13       | `TrackLevels::count` yük–yaz                             | **açık**                                                                                                                                                                                                             | `normalize.rs:125-132`; `player.rs:1833-1842` sıra hâlâ `push_segment` → `begin_track`                                                                                                                                                              |
| SES-12       | Test boşlukları (stereo/44,1 kHz kodek, sınırlayıcı THD) | **açık**                                                                                                                                                                                                             | `tests/formats.rs` 0.0.50'den beri değişmedi (yalnızca 22,05 kHz mono); `limiter.rs` testlerinde THD yok, 96/192 kHz durumu yok                                                                                                                     |
| SES-14b/c    | Dosya üç kez açılıyor; `Session::drop` 2 s               | **kötüleşti / kısmen**                                                                                                                                                                                               | b: artık her yeni şarkıda 6 açılış (D1-SES-08); c: yalnızca kilit altında kalan yollarda (D1-SES-06)                                                                                                                                                |

## 3. Gerileme denetimi (0.0.50 → 0.0.56)

- **0.0.52 aygıt değişimi (SES-01).** İzleyici ayrı iş parçacığında, ses döngüsüne COM sorgusu eklemiyor (doğru).
  Ama toparlama `restart`'ı kullanıyor: `begin_transition` eski oturumu `take` eder; açılış başarısızsa `install`
  oturumu `None` bırakır. 0.0.50'de aygıt koptuğunda hatalı oturum yerinde kalıyor ve "çal" kaldığı yerden
  sürdürüyordu; şimdi toparlama denendi ve başarısızsa "çal" hiçbir şey yapmaz (D1-SES-01). Toparlama sayacı yalnızca
  `load` ve `play`'de sıfırlanıyor, arayüzün şarkı açma yolu (`begin_transition`) sıfırlamıyor (D1-SES-03).
  Toparlama durum/görsel sorgusunun içinde, kilit altında tam geçiş yapıyor (D1-SES-06).
- **0.0.52 açma/sarmanın üçe bölünmesi (SES-02).** Sıra numarası eski hazırlığın takılmasını doğru engelliyor
  (`player.rs:914-921`, test `daha_yeni_gecis_baslamissa_eski_hazirlik_takilmaz`). Gözden kaçanlar: (a) sıradaki şarkı
  `begin_transition` anında kopyalanıyor ve `install` yeni oturuma oynatıcının güncel `next_path`'ini yazmıyor →
  yanlış şarkı boşluksuz çalabiliyor (D1-SES-02); (b) hazırlık sürerken `session` boş olduğundan duraklat/durdur/sar/
  bit-perfect değişimi sessizce yok sayılıyor; aynı anda iki hazırlık iki oturum açabiliyor (D1-SES-07).
- **0.0.52 gerçek tepe sınırlayıcı (MAT-01).** Matematik ve 44,1/48 kHz tavanı deneyle doğrulandı. Tavanın 0 dBFS'den
  −1 dBTP'ye inmesi, EQ düz ve eşitleme kapalıyken bile tepesi −1 dBTP'yi aşan her kaydı (ticari kayıtların çoğu)
  sınırlıyor; ekolayzer korumasının boşluk hesabı ise hâlâ 0 dBTP'ye göre (D1-SES-04).
- **0.0.52 MMCSS.** `unsafe` iki satır, imzalar doğru, tutamaç aynı iş parçacığında bir kez geri veriliyor. Belge
  "tek `unsafe` çağrı" diyor, gerçekte iki blok (Set + Revert); ikisi de aynı modülde ve gerekçeli. Sorun yok.
- **0.0.52 erken ses yüksekliği tahmini (SES-04).** Bekleme 0,6 → 0,15 s doğru. Tahmin `ESTIMATED` durumunda kesin
  ölçümle aynı biçimde kullanılıyor; sessiz girişli şarkıda **yükseltme** yapabiliyor (D1-SES-05). 0.0.50'de ölçümsüz
  başlangıç her zaman −4 dB kısmaydı.
- **0.0.53–0.0.54 parametrik EQ ve crossfeed.** Ses yoluna sırayla eklendi (`render.rs:216-221`), bellek testi ikisini
  de, çapraz geçiş ve kapat/aç dahil kapsıyor (`render.rs` `ses_yolu_bellek_ayirmaz`, 95–145. bloklar). Crossfeed
  stereo dışında ve kapalıyken sese dokunmuyor (`crossfeed.rs:341-343, 366-371`), durum sıfırlaması var. Parametrik
  EQ'nun yükseltmesi korumaya ekleniyor (`render.rs:174-177`); crossfeed bilerek eklenmiyor ve belgelenmiş
  (‖g‖₁ < 2 sınırı, sınırlayıcı yakalıyor). Gerileme görülmedi.
- **0.0.56 gömülü sözler.** `decode.rs`'e yalnızca ayrı bir `read_lyrics` (probe + etiket) eklendi; `Decoder::open`,
  `seek`, `next_chunk` değişmedi → çalma yoluna doğrudan etkisi yok. Dolaylı etki: `track_lyrics` komutu yalnızca süre
  için tam `Decoder::open` yapıyor, ardından `read_lyrics` dosyayı yeniden probluyor; ikisi de `async` komutta, tokio
  iş parçacığında bloklayarak (D1-SES-08).

## 4. Yeni bulgular (önem sırasıyla)

### [D1-SES-01] Aygıt toparlaması başarısız olunca şarkı kaybolur; "çal" artık hiçbir şey yapmaz

- **Önem:** Yüksek · **Güven:** yüksek (kod yolu kesin; ne sıklıkla olduğu aygıt düzenine bağlı)
- **Yer:** `player.rs:946-967` (`recover_device`), `:782` (`let old = self.session.take();`), `:925-940` (`install`
  hata dalı), `:1234-1238` (`play`), `:1643-1684` (`status`, oturumsuz dal)
- **Kanıt:**
  ```rust
  // recover_device
  // Açılamazsa (aygıt hiç yok) hata durumu gösterilir; kullanıcı "çal" ile yeniden dener.
  let _ = self.restart(&track.path, resume, Some(position));
  // play
  let Some(session) = &self.session else { return Ok(()); };
  ```
  `restart` → `begin_transition` eski (hatalı) oturumu oynatıcıdan alır, `prepare` onu düşürür; yeni oturum açılamazsa
  (`AudioError::NoOutputDevice` ya da `Output`) `install` yalnızca `last_error` yazar, `session = None`,
  `pending = None`. Sonuç: `status()` → `state: Error`, `track: None`, `position_secs: 0`. Kullanıcı "çal"a basınca
  `play()` oturum olmadığı için `Ok(())` döner; şarkı ve konum bilgisi yoktur. Arayüzde `hasTrack` false olduğu için
  durum yoklaması da durur (`usePlayer.ts:233-236`). Koddaki yorum ("kullanıcı çal ile yeniden dener") yanlış.
  Testler bu yolu sınamıyor: sanal çıkış hep açılıyor (`simulated.rs:61-70` yalnızca özel modda hata üretebiliyor);
  `aygit_kopunca_otomatik_toparlanir_…` yalnızca sayaç bitince oturumun yerinde kaldığı durumu sınıyor.
- **Etki:** Masaüstünde tek çıkış aygıtı (USB kulaklık/DAC, tek Bluetooth kulaklık; jak algılamalı Realtek'te boş jak
  "takılı değil" sayılır) çıkarılınca varsayılan aygıt kalmaz → toparlama başarısız → kulaklık geri takılıp "çal"a
  basılınca hiçbir şey olmaz; şarkı kütüphaneden yeniden açılmalı, konum kaybolur. Windows'un varsayılan aygıtı
  değiştirmesi akış hatasından geç gelirse (yarış; ~16 ms sonra deneniyor) aynı çıkmaz dizüstünde de oluşabilir.
  0.0.50'de bu senaryoda "çal" kaldığı yerden sürüyordu (test `aygit_hatasindan_sonra_cal_kaldigi_yerden_surer`):
  SES-01 düzeltmesinin gerilemesi.
- **Önerilen test (önce):** `simulated.rs`'e iş parçacığı yerel "aygıt yok" bayrağı (`spawn` → `NoOutputDevice`).
  Çalarken `fail` + `device_changed` → `status()` = Error ve `track` hâlâ şarkı; bayrak kalkınca `play()` → Playing ve
  `start_frame` kalınan yer.
- **Önerilen düzeltme:** Toparlamada eski oturumu, yeni oturum hazır olmadan bırakmamak: `restart` başarısızsa
  `(path, position, resume)`'u bir `resume_after_error` alanına yazıp `play()`/`status()` oturumsuzken onu kullansın
  (şarkı bilgisi de `status.track`'te kalsın). Daha basiti: toparlamada önce `Session::start` dene, başarılıysa takas
  et, değilse hatalı oturumu yerinde bırak.

### [D1-SES-02] Hazırlık sürerken bildirilen "sıra yok" yeni oturuma ulaşmaz: eski sıranın şarkısı boşluksuz çalar

- **Önem:** Orta · **Güven:** yüksek (kod ve arayüz akışıyla; sanal testle kanıtlanmadı)
- **Yer:** `player.rs:825` (`next: self.next_path.clone()` — geçiş başında kopya), `:392` (`shared.set_next(next)`),
  `:908-940` (`install` güncel `next_path`'i yazmıyor), `:1069-1076` (`set_next`: oturum yoksa yalnızca alanı
  değiştirir; aynı değerse erken döner); arayüz `usePlayback.ts:96-103`, `queue.ts:42-46`, `usePlayer.ts:233-248`
- **Kanıt (akış):** A çalıyor, sırada A2 (`next_path = A2`). Kullanıcı "Dosya aç" ile tek bir B açar (ya da listenin
  son şarkısını seçer). `begin_transition(B)` → `Transition.next = A2`. Hazırlık ~150–400 ms sürer (eski oturumun
  kısılması ≤300 ms + aç + ön dolum + aygıt); bu arada 250 ms'lik durum yoklaması `track: None` döndürür
  (`status()` oturumsuz dal, `pending.track` yalnızca aynı şarkıda dolu) → `upcomingPath(queue, null) = null` →
  `setNextTrack(null)` → `set_next(None)`: `next_path = None`, oturum olmadığı için başka bir şey yapılmaz. `install`
  B oturumunu `shared.next_path = A2` ile takar. Sonra B'nin sırası yok → `upcoming` yine `null` → effect çalışmaz,
  `set_next` çağrılmaz. B bitince çözme döngüsü `open_next` ile A2'yi alır ve boşluksuz çalar.
- **Etki:** Tek dosya açıldığında ya da sıranın son şarkısı seçildiğinde, şarkı bitince kullanıcının istemediği,
  önceki sıradan bir şarkı çalar. (Yoklama hazırlık penceresine denk gelmezse sorun olmaz; pencere 250 ms'lik yoklamayla
  karşılaştırılabilir uzunlukta olduğu için sık.)
- **Önerilen test:** `begin_transition(B)` → `set_next(None)` → `prepare` → `install` → `session.shared.take_next()`
  `None` olmalı (bugün `Some(A2)`).
- **Önerilen düzeltme:** `install`'da (sıra eşleşince) `session.shared.set_next(self.next_path.clone())`; ya da
  `Transition.next` hiç kullanılmayıp oturum takılırken oynatıcının güncel değeri yazılsın.

### [D1-SES-03] Aygıt toparlama sayacı başarılı toparlamadan sonra sıfırlanmıyor: 3 olaydan sonra otomatik geçiş biter

- **Önem:** Orta · **Güven:** kesin
- **Yer:** `player.rs:687-689` (`MAX_DEVICE_RECOVERIES = 3`), `:953-958`, sıfırlama yalnızca `:748` (`load`) ve `:1235`
  (`play`); arayüzün şarkı açma ve sarma yolu `begin_transition`/`begin_seek` sıfırlamaz (`commands.rs:165-175,
222-234`).
- **Kanıt:** `self.device_recoveries += 1;` her başarılı toparlamada da artar; belge "art arda en fazla" diyor
  (`:687-688`) ama sayaç başarıdan sonra ya da şarkı değişince sıfırlanmıyor.
- **Etki:** Kuyruktan otomatik geçişle (ya da Sonraki/Önceki ile) dinleyen, "çal"a hiç basmayan kullanıcıda gün içinde
  üçüncü kulaklık tak/çıkar olayından sonra ses eski aygıtta kalır ya da kopunca hata durumunda bekler — SES-01'in asıl
  sorunu geri gelir. Kapanıp açılan Bluetooth kulaklıkta çabuk dolar.
- **Önerilen test:** 4 kez `device_changed` + `status()`, aralarda oturum en az birkaç saniye sorunsuz çalsın
  (ya da `begin_transition`/`install` ile şarkı değişsin) → dördüncüsü de toparlanmalı.
- **Önerilen düzeltme:** Sayaç `install` başarılı olunca kullanıcı geçişinde sıfırlansın ve toparlama sonrası oturum
  belli bir süre (ör. 10 s çalma) hatasız sürünce sıfırlansın; ya da sayaç yerine son denemenin zaman damgası.

### [D1-SES-04] −1 dBTP tavanı nötr çalmayı değiştiriyor; ekolayzer korumasının boşluğu 0 dBTP'ye göre

- **Önem:** Orta · **Güven:** kesin (mekanizma ve sayı deneyle)
- **Yer:** `limiter.rs:9-11, 36-38` (`CEILING = 10^(−1/20)`); `render.rs:294-297` (her yol sınırlayıcıdan geçer, bit-perfect
  hariç); `normalize.rs:242` (`headroom_db: (-(loudness.true_peak_dbtp + gain_db)).max(0.0)` — 0 dBTP'ye göre);
  `loudness.rs:50-56` (eşitleme kısmayı tam yapar, yükseltmeyi −1 dBTP'ye göre)
- **Kanıt:** 0.0.50'de tavan örnek tepesi için 1,0'dı: EQ düz, eşitleme kapalıyken tam ölçeğe kadar her kayıt bit bit
  geçiyordu. Şimdi gerçek tepesi −1 dBTP'yi aşan her kayıt (günümüz ticari kayıtlarının çoğu örnek tepesini −0,1…0 dBFS'e
  basar) eşitleme kapalıyken, ya da açıkken sessiz ama tepeli kayıtlarda (`gain_db` 0 kalır), sınırlanır. Deney
  (`limiter_sim.py`, 48 kHz, 2 s oturmuş bölüm):
  ```
     50 Hz genlik 1.00 (+0.01 dBTP): giriş THD+N -136.2 dB, çıkış THD+N -50.7 dB, kazanç -1.00…-0.92 dB
     40 Hz genlik 1.00 (+0.01 dBTP): giriş THD+N -136.2 dB, çıkış THD+N -48.1 dB, kazanç -1.00…-0.90 dB
    100 Hz genlik 1.00 (+0.01 dBTP): çıkış THD+N -61.0 dB
   1000 Hz genlik 0.99 (-0.08 dBTP): çıkış THD+N -136.2 dB (sabit -0.91 dB kısma)
  müzik benzeri (55 Hz bas + 2 kHz + darbeler), örnek tepe -0.10 dBFS: örneklerin %50'sinde kazanç < 1
  ```
  Yani tam ölçekli bas, 80 ms dönüşlü kazanç dalgalanması yüzünden %0,3–0,4 THD alır (0.0.50'de sıfır). Ayrıca koruma
  boşluğu 0 dBTP'ye göre hesaplandığından "bas +6 dediğinizde bas gerçekten +6 dB artar" (`normalize.rs:11-14`)
  tepelerde 1 dB eksik kalır: koruma 0 dBTP'ye kadar izin verir, sınırlayıcı −1 dBTP'den keser.
- **Etki:** "Profesyonel ses" vaadinde nötr ayarlar artık şeffaf değil; eşitlemeyi kapatan (genellikle titiz)
  dinleyici her yüksek kayıtta sürekli çalışan bir sınırlayıcı dinliyor. Duyulabilirlik küçük ama ölçülebilir ve
  belgelenmemiş (`limiter.rs:7` "sınırın altındayken bit bit aynen" — sınır artık çoğu kaydın tepesinin altında).
- **Önerilen test:** `render.rs`: EQ düz, eşitleme kapalı, 40 Hz genlik 1,0 sinüs → çıkış girişle (gecikme hizalı)
  bit bit aynı olmalı (bugün başarısız). `normalize.rs`: koruma sonrası tepe ≤ sınırlayıcı tavanı.
- **Önerilen düzeltme:** Tavanı sinyali yükselten bir işlem olup olmamasına göre seç: ses yolunda hiçbir yükseltme
  yokken (EQ/PEQ/bas düz, eşitleme kazancı ≤ 0) tavan 0 dBTP (ya da örnek tepesi 1,0); yükseltme varken −1 dBTP. Her
  durumda `headroom_db`'yi sınırlayıcı tavanına göre hesapla (`-(tp + gain) + CEILING_DBTP`). Karar ürün tercihi
  olduğu için proje sahibine sorulmalı; şu anki davranış en azından belgede açıkça yazmalı.

### [D1-SES-05] Erken ses yüksekliği tahmini sessiz girişli şarkıda yükseltme yapıp sınırlayıcıyı zorlayabilir

- **Önem:** Düşük · **Güven:** mekanizma kesin, ortaya çıkma sıklığı olası
- **Yer:** `spectrogram.rs:509-527, 540` (tahmin yalnızca ilk 5 s; gerçek tepe de ilk 5 s'nin);
  `normalize.rs:186-199` (`set_loudness_estimate`), `:232-244` (`ESTIMATED`, `MEASURED` ile aynı işlenir: kazanç ve
  boşluk); `loudness.rs:50-56`
- **Kanıt:** Giriş −22 LUFS, tepe −6 dBTP olan şarkıda tahmin kazancı `min(−14+22, −1+6) = +5 dB`, boşluk 0. Ana bölüm
  (−9 LUFS, 0 dBTP) kesin ölçüm gelene kadar +5 dB ile çalar → sınırlayıcı her tepede ~6 dB keser. Kesin ölçüm bütün
  dosyanın çözülmesini bekler (`measure_loudness` `Ok(None)`'a kadar); 4 dk'lık şarkıda 1–3 s, 1 saatlik DJ
  karışımında onlarca saniye; sonra kazanç 1,5 s zaman sabitiyle iner. 0.0.50'de ölçümsüz başlangıç her zaman
  −10 LUFS varsayımıyla −4 dB'di (asla yükseltme yoktu).
- **Etki:** Önbellekte olmayan, sessiz girişli uzun şarkılarda ilk yüksek bölümde birkaç saniye belirgin sınırlama/
  pompalama. Arka plan analizi önbelleği doldurdukça seyrekleşir.
- **Önerilen test:** `normalize.rs`: `set_loudness_estimate(−22 LUFS, −6 dBTP)` → `level(0, true).gain_db ≤ 0`.
- **Önerilen düzeltme:** Tahmin durumunda kazancı `min(gain, 0)` ile sınırla (yalnızca kısma) ya da `ASSUMED_LUFS`
  kazancının altına inmesine izin verip üstüne çıkmasına izin verme; boşluğu tahminden türetme.

### [D1-SES-06] Kilit altında tam geçiş yapan yollar kaldı (SES-02'nin kalanı)

- **Önem:** Düşük · **Güven:** kesin
- **Yer:** `player.rs:946-967` (aygıt toparlama `restart`'ı `status()` ve `visual_now()` içinden, yani `visual_frame`
  komutunun kilidi altında çağırır: `:1502`, `:1644`); `:1284-1290` (`stop` → `load`); `:1239-1250` (bittiğinde/
  hatada "çal"); `:1409-1413` (bit-perfect değişimi); `:1013-1014`, `:1056` (kör test kur/kapat: `close_session` +
  `prepared.start()` / `restart`); `commands.rs:206-218, 415`
- **Kanıt:** `restart` = `begin_transition` + `prepare` (≤300 ms kısılma beklemesi + dosya açma + ≤3 s ön dolum +
  aygıt açma) + `install`, hepsi `PlayerState` kilidi tutulurken.
- **Etki:** Kulaklık takılınca, "Durdur"a basınca, şarkı bitip yeniden "çal"ınca ve bit-perfect açılıp kapanınca
  görseller ve durum sorguları 150–400 ms (yavaş diskte saniyeler) donar. SES-02 bunlar için kapanmış sayılmamalı.
- **Önerilen düzeltme:** Bu yollar da üçlüyü kullansın (komut katmanında `spawn_blocking`); toparlama için durum
  sorgusu yalnızca işareti görüp ayrı bir görev başlatsın.

### [D1-SES-07] Geçiş sürerken gelen komutlar ve üst üste iki hazırlık

- **Önem:** Düşük · **Güven:** yüksek (kod okuması; arayüz komutları kısmen sıraya koyuyor)
- **Yer:** `player.rs:782` (oturum `take`), `:1258-1262` (`pause`), `:1265-1272` (`toggle`, `state()` bekleyen geçişin
  hedefini döndürür `:1292-1299`), `:1284-1287` (`stop`), `:832-836` (`begin_seek` oturum yoksa `None`), `:1403-1405`
  (`set_playback_options`), `:999-1013` (`abx_install`); `usePlayer.ts:123-160` (`run` toggle/stop/open'ı sıraya koyar
  ama sarma bunun dışında: `:189-225`)
- **Kanıt ve etki:**
  1. Sarma sürerken (arayüzde sarma `run` dışında) Boşluk/Durdur: oturum yok → `pause`/`stop` hiçbir şey yapmaz,
     `toggle` `Ok` döner; ardından `install` çalan oturumu takar. Kullanıcının basışı kaybolur.
  2. Açılış sürerken sarma (←/→, şerite tıklama): `begin_seek` `None` → sessizce yok sayılır.
  3. Açılış sürerken bit-perfect değişimi: bayrak değişir ama oturum eski kipte açılır; ekran "bit-perfect açık",
     sinyal yolu kapalı — bir sonraki şarkıya kadar.
  4. Sarma sürerken başka şarkı açılırsa ikinci `begin_transition`'ın `old`'u boştur: ikinci hazırlık birincinin
     kısılmasını beklemeden yeni oturumu açar ve çalar; eski oturum (≤300 ms kısılma) ve birinci hazırlığın oturumu
     (eskiyse `install`'da `stop` ile yumuşatmasız kesilir → tık) aynı anda aygıtta olabilir. Bit-perfect (özel mod)
     açıkken ikinci açılış aygıt meşgul olduğu için hem özel hem paylaşımlı modda başarısız olur → hata durumu.
  5. Açılış sürerken kör test kurulursa `close_session` boş oturumla çalışır; ardından `install` şarkıyı takar ve kör
     test ile şarkı aynı anda çalar (`install` `abx`'i kapatmaz).
- **Önerilen test:** `begin_transition` → `pause()` → `prepare` → `install` → durum Paused olmalı (bugün Playing).
- **Önerilen düzeltme:** `PendingTransition`'a istenen `playing` durumu yazılsın ve `install` onu uygulasın (pause/stop/
  toggle bekleyen geçişin hedefini değiştirir); bekleyen sarma hedefi saklanıp `install`'dan sonra uygulansın; `install`
  kör test kuruluysa oturumu takmasın; ikinci `begin_transition` önceki hazırlığın bitmesini beklesin ya da bir
  "geçiş kilidi" ile sıraya girsin.

### [D1-SES-08] Her yeni şarkıda dosya 6 kez açılıyor; söz ve kapak komutları tokio iş parçacığını blokluyor

- **Önem:** Düşük · **Güven:** kesin
- **Yer:** `player.rs:310` (oturum), `:544-551` (tam analiz + hızlı ölçüm), `commands.rs:177-184` (`track_cover`),
  `:187-194` (`track_lyrics`: yalnızca süre için `Decoder::open`, sonra `lyrics::for_track` → `read_lyrics` → yeniden
  `probe`); `decode.rs:285-290` (`read_tags` bütün revizyonları kapak resimleriyle birlikte `clone`'lar)
- **Etki:** Ağ sürücüsü/uyuyan HDD'de şarkı değişiminde altı kat G/Ç; büyük kapak resmi (MB'larca) her açılışta
  kopyalanır. `async fn` içinde bloklayan dosya erişimi Tauri'nin çalışma zamanı iş parçacığını tutar. SES-14b'nin
  büyümüş hâli.
- **Önerilen düzeltme:** `track_lyrics` süreyi oynatıcının `TrackInfo`'sundan alsın (ya da `read_lyrics` aynı probe'dan
  süreyi de versin); kapak/söz komutlarında `spawn_blocking`; `read_tags` görselleri kopyalamasın.

### [D1-SES-09] 96/192 kHz'te gerçek tepe kaçırma payı belgedekinden büyük; testler yalnızca 44,1/48 kHz

- **Önem:** Düşük · **Güven:** kesin (deney)
- **Yer:** `limiter.rs:12-15` ("kaçırma payı fs/4 sinüste 0,04 dB … testler 0,1 dB tolerans"), `:222-231` (96 kHz'te
  4×, 192 kHz'te 2×); testler `:357, 386` yalnızca 48/44,1 kHz
- **Kanıt** (`limiter_tp.py`, tavan −1 dBTP, çıkış gerçek tepesi):
  ```
  44100/48000: fs/4 −0,96; kırpılmış 9/15 kHz −0,92…−0,94; 20 kHz bantlı kırpılmış gürültü −0,76…−0,81 dBTP
  96000:  fs/4 −0,83; gürültü −0,70 dBTP
  192000: fs/4 −0,31; gürültü −0,57 dBTP
  ```
  Paylaşımlı modda sınırlayıcı aygıtın hızında çalışır; 96/192 kHz karışım biçimli USB DAC'larda kaçırma 0,3–0,7 dB.
  Hiçbir durumda 0 dBTP aşılmıyor (gerçek kırpma yok), ama belgedeki sayı yalnızca < 96 kHz için doğru. 44,1/48 kHz
  gürültüde 0,2 dB'lik kaçırma da belgedeki 0,06 dB'den büyük (kazancın ara değerleme penceresi içinde değişmesi).
- **Önerilen düzeltme:** Belgeyi hıza göre düzelt; 96/192 kHz için test ekle; istenirse yüksek hızda da 4× kullan.

### [D1-SES-10] Küçük doğruluk/belge notları

- **Önem:** Düşük · **Güven:** kesin
- (a) `wasapi.rs:342-348`: izleyici iş parçacığı ayrık (`JoinHandle` atılıyor), oturum kapanınca ≤500 ms daha yaşar ve
  `SharedState`'i tutar; her sarma yeni bir izleyici açar. Zararsız ama `Session::drop` "bütün iş parçacıkları
  birleşir" varsayımının dışında.
- (b) `wasapi.rs:14-16`: "depodaki tek `unsafe` çağrı" — iki blok var (Set + Revert); MIMARI.md ile birlikte
  "tek modül" denmeli.
- (c) Kör test oturumu da `output::spawn` kullandığı için izleyici `device_changed`'i kör testin `SharedState`'ine
  yazar; kör testte bunu okuyan yok (`abx.rs`'te `device_changed` geçmiyor) → kulaklık takılınca test eski aygıtta sürer.
- (d) `player.rs:956-966`: toparlamada konum `output_heard`'den alınır; eski oturum kısılırken arabellekteki ~100–300 ms
  çalınır, yeni oturum o konumdan başlar → kulaklık takılınca son ~0,1–0,3 s yeniden duyulur.

## 5. Şüpheler

- **Ş-1 Varsayılan aygıt geçişi ile akış hatası arasındaki sıra (D1-SES-01'in dizüstü durumu):** aygıt çıkarılınca
  `AUDCLNT_E_DEVICE_INVALIDATED` ile Windows'un yeni varsayılanı bildirmesi arasındaki gecikme ölçülemedi; toparlama
  ~16 ms sonra denendiği için eski (geçersiz) aygıtı ya da hiç aygıt almama olasılığı var. Gerçek cihazda DOGRULAMA
  B13'e "kulaklığı çıkar → tek aygıt kalmadan / kalarak" iki durum eklenmeli.
- **Ş-2 Hazırlık penceresinin süresi (D1-SES-02 sıklığı):** 150–400 ms tahmini kod yoluna dayanır; gerçek cihazda
  `open_track` süresi ölçülmeli.
- **Ş-3 MMCSS ile özel mod yoklaması:** "Pro Audio" sınıfındaki iş parçacığı özel modda 1–5 ms'lik `sleep` ile
  yokluyor; bazı sürücülerde periyodun yarısı < 1 ms çıkarsa (`wasapi.rs:322` alt sınır 1 ms) aç kalan çekirdek olur
  mu, gerçek USB DAC'ta denenmeli.
- **Ş-4 `is_supported_exclusive_with_quirks` aygıt başka oturumca özel modda tutulurken ne döner** (D1-SES-07/4):
  wasapi crate kaynağından kesinleştirilemedi; sonuç her iki durumda da hata, yalnızca mesaj farklı olur.

## 6. Güçlü yanlar (kanıtla)

- **Gerçek zamanlı kural korunmuş:** 0.0.53–0.0.54'te eklenen parametrik EQ ve crossfeed `ses_yolu_bellek_ayirmaz`
  kapsamına alınmış; testte çapraz geçiş, kapat/aç, karşılaştırma ve tasarım yöntemi değişimi ses iş parçacığında
  (`render.rs` test blokları 95–145). Crossfeed'in çapraz geçişi sırasında gelen ikinci ayar kaybolmuyor
  (`crossfeed.rs:346-354`: sürüm yalnızca geçiş bitince alınır).
- **Sınırlayıcı matematiği doğrulandı:** python kopyasında 44,1/48 kHz'te fs/4 45° sinüs (+2,92 dBTP) → −0,96 dBTP,
  kırpılmış 9/15 kHz → −0,92…−0,94 dBTP; örnek tepesi testteki gibi tavanın altında. Ara değerleme penceresi en
  büyük örnek × `max_gain` ile atlanıyor (kesin üst sınır, sonucu değiştirmez).
- **MMCSS doğru:** `windows-0.62.2` imzası `Result<HANDLE>` (NULL → `Err`), tutamaç aynı iş parçacığında bir kez geri
  veriliyor, başarısızlık hata sayılmıyor, gerekçe yorumu ve `#[allow]` fonksiyon düzeyinde (`wasapi.rs:140-182`).
- **Aygıt izleme ses döngüsünü kirletmiyor:** COM sorgusu ayrı iş parçacığında, döngüde yalnızca atomik
  (`wasapi.rs:342-348`).
- **Geçiş sıra numarası:** üst üste iki açılışta eski hazırlığın takılmaması test edilmiş ve doğru
  (`player.rs:914-921, 2429-2445`); hazırlık sürerken durum sorgusu hedefi gösteriyor (`:2387-2427`).
- **Boşluksuz çalma ve hizalama:** `tests/data` dosyaları ffmpeg ile çözüldü: MP3/OGG/FLAC 66 150 örnek (testteki
  sayı), M4A'da proje akışın `duration_ts=66150` değerini veriyor (ffmpeg'in varsayılan ham çıkışı son dolguyu
  atmadığı için 66 560) — dolgu işleme ffmpeg'in varsayılanından doğru.
- **Bit-perfect artık gerçekten işlemsiz:** sınırlayıcı atlanıyor (`render.rs:122-123`), test
  `bit_perfect_kipte_ses_aynen_gecer` ve `bit_perfect_zinciri_dosyadaki_tamsayilari_aynen_aygita_verir`.
- **Ölçümsüz şarkı beklemesi kalktı:** analiz başlatılamazsa `set_loudness(0, None)` ile ilk ses beklemiyor
  (`player.rs:376-379`, test `analiz_baslatilamazsa_ilk_ses_beklemez`).
