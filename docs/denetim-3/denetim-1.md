# Faz 3 — Denetim 1 (ilk denetim) raporu

Denetçi: geliştirme oturumunun kendisi (Claude). Kaynak: `main` @ `5805853` (0.0.55). Tarih: 22 Ekim 2026.

## 1. Kapsam ve yöntem

- **Kapsam:** Faz 3'ün kodu ve onu ses yoluna, ayarlara, komutlara ve ekrana bağlayan her şey:
  `audio/biquad.rs` (1041 satır), `audio/peq.rs` (1786), `audio/crossfeed.rs` (655), `audio/render.rs` (945),
  `audio/limiter.rs` (468), `audio/normalize.rs` (ilgili kısımlar), `audio/player.rs` (Faz 3 kısımları),
  `commands.rs` ve `settings.rs` (Faz 3 komutları ve alanları); arayüzde `ParametricEq.tsx`, `CrossfeedStrip.tsx`,
  `EqualizerPanel.tsx`, `useParametric.ts`, `useCrossfeed.ts`, `lib/parametric.ts`, `lib/crossfeed.ts`. Belgelerde
  `docs/MIMARI.md`, `docs/ROADMAP.md` Faz 3 bölümü, `docs/DOGRULAMA.md` C5–C6.
- **Yöntem:** kodun satır satır okunması; her aday bulgu için kırmızı yanan bir kanıt testi (Rust ya da Vitest)
  ya da python3/scipy hesabı. Kanıt testleri denetim sırasında geçici olarak koda eklendi, çalıştırıldı ve geri
  alındı; kodları `denetim-1-kanit/` altında.
- **Kalite kapıları** (bu oturumda, `main` @ `5805853`): `cargo test` 409 + 4 kodek testi geçti (3 ignored: gerçek
  aygıt isteyenler); `cargo clippy --all-targets -D warnings` Linux'ta ve `x86_64-pc-windows-gnu` hedefinde temiz;
  `cargo fmt --check` temiz; Vitest 309/309; ESLint, `tsc`, Prettier temiz; `check:commands` (53 komut, 53 çağrı),
  `check:audio` (329 dosya), `check:licenses` (242 paket), `check:notices` temiz; üretilen bağlamalarda fark yok.
- **Sınır:** bu denetçi Faz 3 kodunu yazan oturumlarla aynı model ailesindendir (kör nokta riski). Denetim 2 bu
  riske karşı tasarlandı.

## 2. Genel değerlendirme

Puan: **7/10.** Faz 3'ün matematik çekirdeği (RBJ, eşlenmiş tasarım, crossfeed türetmesi) sağlam ve iyi testli;
ses yolunun gerçek zamanlı kuralları korunmuş. Zayıf yan, parçaların **birbirine bağlandığı yerler**: taşma
koruması ile sınırlayıcının farklı tavanlara göre çalışması, ekranda çizilen eğrinin başka bir örnekleme hızında
hesaplanması, sürükleme/tekerlek etkileşimleri. Bir numaralı risk: kullanıcının "gördüğü" ile "duyduğu" arasındaki
farklar (D1-01, D1-04, D1-06).

## 3. Bulgular

Önem: Kritik / Yüksek / Orta / Düşük. Güven: kesin = kırmızı yanan test ya da hesapla gösterildi.

### [D1-01] Taşma koruması 0 dBTP'ye, sınırlayıcı −1 dBTP'ye göre çalışıyor

- Önem: Orta · Güven: kesin
- Yer: `audio/normalize.rs:242` (`headroom_db: (-(loudness.true_peak_dbtp + gain_db)).max(0.0)`), `audio/limiter.rs`
  (`CEILING_DBTP = -1.0`), `audio/loudness.rs:26` (`PEAK_CEILING_DBTP = -1.0`).
- Kanıt: `render::denetim1_kanit::d1a_koruma_varken_sinirlayici_calismamali` — −14 LUFS, −1 dBTP'lik şarkı,
  parametrik +6 dB (1 kHz), eşitleme açık: korumaya 6,00 dB bildiriliyor, koruma yalnızca 5 dB kısıyor (boşluk 0 dBTP'ye
  göre 1 dB sanılıyor), **sınırlayıcı her tepede −1,00 dB kısıyor** (test kırmızı).
- Etki: 0.0.52'de sınırlayıcının tavanı −1 dBTP'ye indi (MAT-01) ama ekolayzer/bas korumasının boşluk hesabı 0 dBTP'de
  kaldı. Ekolayzer ya da bas boşluğu tam kullandığında "koruma yetti" sanılırken sınırlayıcı sürekli çalışır (80 ms
  dönüşlü kazanç azaltması: bas vuruşlarında hafif "pompalama"). Eşitleme kapalıyken yüksek basılmış her kayıt
  (gerçek tepe > −1 dBTP) hiçbir ayar açık değilken de sınırlanır.
- Önerilen düzeltme: boşluğu aynı tavana göre hesaplamak (`-(PEAK_CEILING_DBTP - (tp + gain))`), ya da sınırlayıcıyı
  yalnızca koruma yetmediğinde devreye girecek bir tavanda tutmak; testi kırmızıdan yeşile çevirmek.

### [D1-02] Sürüklerken grafik ölçeği değişince kazanç ~6 dB sıçrıyor

- Önem: Orta · Güven: kesin
- Yer: `components/ParametricEq.tsx` `onNodePointerMove` (`yToDb(dbToY(start.db, range) + dy, range)`), `range =
plotRangeDb(...)` her çizimde yeniden hesaplanır.
- Kanıt: `denetim-1-kanit/arayuz.test.tsx.txt` (src/ altına `.tsx` olarak kopyalanıp çalıştırılır) "D1-c": düğüm 1'er piksel yukarı sürüklenince kazançlar
  `16.7, 16.8, 16.9, 17, 17.1, **23**, 23.1, 24, 24` — tek pikselde **+5,9 dB** (test kırmızı).
- Etki: ±17 dB'yi geçen ilk pikselde ölçek ±18'den ±24'e geçer, aynı imleç konumu daha büyük bir kazanca karşılık
  gelir; ses anında ~6 dB yükselir, düğüm hemen +24'e kaçar. Kesmede de aynısı.
- Önerilen düzeltme: sürükleme başında `range`'i dondurmak (`drag.current.range`), bırakınca yeniden hesaplamak.

### [D1-03] Fare tekerleği grafiğin üstünden geçerken seçili bandın Q'sunu değiştiriyor, sayfa kaymıyor

- Önem: Orta · Güven: kesin
- Yer: `components/ParametricEq.tsx` `onWheel` (grafiğin tamamına `passive: false`, her zaman `preventDefault`).
- Kanıt: `denetim-1-kanit/arayuz.test.tsx.txt` (src/ altına `.tsx` olarak kopyalanıp çalıştırılır) "D1-d": tek tekerlek olayı Q'yu 0,707 → 0,667 yapıyor, `defaultPrevented = true`.
- Etki: Ekolayzer çekmecesini tekerlekle aşağı kaydıran kullanıcının imleci grafiğin üstünden geçince çekmece durur
  ve görmediği bir bandın Q'su değişir (ses değişir). Kullanıcının düzenli karşılaşacağı bir durum.
- Önerilen düzeltme: tekerleği yalnızca bir düğümün üstündeyken ya da düğüm odaktayken (veya Ctrl/Alt ile) yakalamak.

### [D1-04] Ekranda çizilen eğri 96 kHz'te, duyulan aygıtın hızında; "çizilen = duyulan" testi bunu ölçmüyor

- Önem: Orta · Güven: kesin
- Yer: `audio/peq.rs` `response_curve` (`ANALYSIS_RATE = 96_000`), test `parametrik_egri_tasarlanan_sesle_ayni`
  işlemciyi ekran eğrisiyle değil 48 kHz'teki hesapla karşılaştırıyor.
- Kanıt: `peq::denetim1_kanit::d1o_ekran_egrisi_ile_duyulan_44k`, 44,1 kHz'te ekran ile ses arasındaki en büyük fark:
  eşlenmiş tasarımda PK 18 kHz −8 dB Q4 → **1,49 dB**, PK 16 kHz Q2 → 0,51 dB; "Equalizer APO ile aynı" (RBJ)
  seçiliyken **3,0–4,7 dB** (test kırmızı).
- Etki: MIMARI ve arayüz "çizilen eğri duyulan eğridir" diyor; 12 kHz üstünde, özellikle RBJ'de, bu doğru değil.
- Önerilen düzeltme: eğriyi çalan aygıtın hızında hesaplamak (hız durumdan bilinir) ya da en azından RBJ seçiliyken
  44,1 kHz'te çizmek; testi ekran eğrisiyle işlemciyi karşılaştıracak biçimde düzeltmek.

### [D1-05] Equalizer APO'nun `Channel:` bölümleri yok sayılıp filtreler toplanıyor

- Önem: Orta · Güven: kesin
- Yer: `audio/peq.rs` `HeadphoneProfile::parse` ("Device:, Include: vb. yok sayılır").
- Kanıt: `peq::denetim1_kanit::d1f_channel_bolumleri_toplanmamali`: `Channel: L` altında 1 kHz +6 dB, `Channel: R`
  altında 1 kHz +6 dB → Lyraska iki kanala da **+12 dB** uyguluyor; iki `Preamp: -3 dB` satırı APO'da −6 dB, Lyraska'da
  sonuncusu (test kırmızı; sonuç ön kazanç sınırıyla −12 dB çıktı).
- Etki: kanal kanal düzeltme içeren APO/REW dosyaları sessizce yanlış (iki kat) uygulanır. AutoEq dosyalarında
  `Channel:` yok, bu yüzden en yaygın kullanımı etkilemez.
- Önerilen düzeltme: `Channel:` (L/R dışında bir kanal ya da kanal başına farklı filtre) görülünce anlaşılır hata
  vermek; `Preamp:` satırlarını toplamak.

### [D1-06] Nyquist'e yakın bant: ekranda +20 dB, 44,1 kHz'te seste yok ama ses 23,5 dB kısılıyor

- Önem: Orta · Güven: kesin
- Yer: `audio/biquad.rs` (`freq_hz >= 0,49·fs` → `IDENTITY`), `audio/peq.rs` `reference_peak_db` (44,1 ve 48 kHz'in
  kötüsü), arayüz `PEQ_FREQ_MAX = 24000`.
- Kanıt: `peq::denetim1_kanit::d1e_…`: PK 23 kHz +24 dB Q1 → ekranda 20 kHz'te +20,2 dB; seste 44,1 kHz'te **0,0 dB**
  (bant yok), 48 kHz'te 19,4 dB; korumaya bildirilen 23,5 dB (48 kHz'e göre).
- Etki: 44,1 kHz'te çalan bir aygıtta bant duyulmaz ama koruma şarkının boşluğunu aşan kısmı kadar sesi kısar.
  Ulaşma yolu: sayı kutusuna 21,6 kHz üstü yazmak ya da böyle bir dosya yüklemek.
- Önerilen düzeltme: 0,49·fs üstündeki bantları analog eğriye en yakın biçimde (raf/tepe eteği) tasarlamak ya da
  frekansı 20 kHz ile sınırlamak; korumaya o hızda gerçekten çalan tepeyi bildirmek.

### [D1-07] `apply_parametric` oynatıcı kilidini dosya yazma (fsync) ve eğri hesabı boyunca tutuyor

- Önem: Orta · Güven: kesin (kod) / ölçüm
- Yer: `commands.rs:529-540` (`let mut player = player.lock()?; … store.update(…); ParametricState::new(…)`).
  `equalizer_set`, `apply_headphone`, `crossfeed_set` kilidi kaydetmeden önce bırakıyor.
- Kanıt: kod; `ParametricState::new` 20 eşlenmiş bantta 4,0 ms (hata ayıklama derlemesi). Sürüklemede her fare
  hareketi bir istek: her biri `settings.json`'u `sync_all` ile yazar; bu sırada görsel kare (`visual_frame`) ve durum
  sorgusu oynatıcı kilidini bekler.
- Etki: yavaş diskte ya da virüs taraması sırasında sürüklerken görseller takılır; sürükleme boyunca saniyede onlarca
  fsync.
- Önerilen düzeltme: öteki komutlar gibi kilidi `set_parametric`'ten sonra bırakmak; kaydetmeyi sürükleme bitince
  (ya da 300 ms sessizlikten sonra) yapmak.

### [D1-08] Frekans kutusunda Türkçe binlik noktası: "1.000" → 10 Hz

- Önem: Düşük · Güven: kesin (kod)
- Yer: `lib/parametric.ts` `parseFrequency` (`Number("1.000") = 1`, sonra `roundHz` 10 Hz'e çeker).
- Etki: Türkçe yazımda "1.000 Hz" yazan kullanıcının bandı sessizce 10 Hz'e gider.
- Önerilen düzeltme: nokta + üç rakam kalıbını binlik ayırıcı saymak ya da belirsizse reddetmek.

### [D1-09] Dışa aktarmada ekolayzer kapalıyken de ön kazanç düşük yazılıyor

- Önem: Düşük · Güven: kesin (kod)
- Yer: `audio/peq.rs` `to_apo` (`boost` `self.filters()`'tan, `enabled`'a bakmadan).
- Etki: kapalı ekolayzer kaydedilince bütün filtreler OFF ama `Preamp: -X dB`: APO'da ses gereksiz kısılır.

### [D1-10] Kilitsiz kanalda yırtık okuma (en çok ~30 ms)

- Önem: Düşük · Güven: yüksek (kod)
- Yer: `audio/peq.rs` `PeqControl::set_filters` / `design`: alanlar `Relaxed` yazılır, sürüm sonra artar; okuyucu
  sürümü okuyup alanları okurken yazıcı yeni bir ayar yazarsa karışık bir takım tasarlanabilir. Sonraki sürüm farkı
  bunu bir çapraz geçiş (30 ms) sonra düzeltir.
- Etki: sürüklerken kısa bir ara eğri; ön kazanç her durumda o hızdaki tepeye göre sınırlandığı için taşma yok.
- Önerilen düzeltme: tasarımdan sonra sürümü yeniden okuyup değiştiyse tekrar denemek (seqlock).

### [D1-11] Yeni süzgeç takımı sıfır durumdan başlıyor

- Önem: Düşük · Güven: yüksek (kod)
- Yer: `audio/peq.rs` `PeqProcessor::begin_block` (`self.next.clear()`); crossfeed ise eski durumu kopyalıyor.
- Etki: alçak frekansta yüksek Q'lu bantta (ör. 30 Hz Q 8) yeni süzgecin oturma süresi 30 ms'lik geçişten uzun;
  ayar değişiminde bas kısa bir an eksik/şişkin duyulabilir.

### [D1-12] Crossfeed'in uygulanmadığı durumlar yazılı söylenmiyor

- Önem: Düşük · Güven: kesin (kod)
- Yer: `CrossfeedStrip.tsx` yalnızca soluk görünür; parametrik görünümdeki bit-perfect uyarısı crossfeed'i anmaz;
  mono ve çok kanallı şarkıda crossfeed sessizce uygulanmaz.

### [D1-13] Profil/APO dosyası yalnızca UTF-8 okunuyor; hata İngilizce, boyut sınırı yok

- Önem: Düşük · Güven: kesin (kod)
- Yer: `commands.rs` `headphone_import`, `parametric_import` (`std::fs::read_to_string`).
- Etki: Not Defteri'nin ANSI ya da UTF-16 kaydettiği bir APO dosyası "stream did not contain valid UTF-8" hatasıyla
  reddedilir.

### [D1-14] Belge: kulaklık profili için eşlenmiş tasarım "istenirse" kullanılır deniyor, seçilemiyor

- Önem: Düşük · Güven: kesin
- Yer: `audio/peq.rs` modül belgesi; ne komut ne arayüz kulaklık profilinin tasarım yöntemini değiştirir.

### Bilgi (bulgu değil)

- Ayar değişince 20 eşlenmiş bandın tasarımı ses çıkış iş parçacığında yapılıyor: hata ayıklama derlemesinde 397 µs
  (RBJ 52 µs), 10 ms'lik bloğun %4'ü. Sürüm derlemesinde çok daha kısa olmalı; gerçek aygıtta ölçülmesi önerilir.
- Crossfeed örnek tepesi sınırı ve "Orta +4 dB" bağımsız hesapla doğrulandı (+3,94 dB = ‖g‖₁ sınırı).

## 4. Güçlü yanlar

- RBJ formülleri ve eşlenmiş tasarımın aday seçimi (RBJ'ye geri düşme) savunmacı ve testli; crossfeed'de orta sesin
  bit bit aynı kalması hem modülde hem bütün ses yolunda testli.
- Arayüzden çekirdeğe "aynı anda tek istek, araya gelenlerden en sonuncusu" deseni doğru uygulanmış.
- Bütün kalite kapıları yeşil; komut sözleşmesi Faz 3 komutlarını kapsıyor.

## 5. Öncelik sırası

D1-01 → D1-02 → D1-03 → D1-04 → D1-06 → D1-05 → D1-07 → geri kalanlar.
