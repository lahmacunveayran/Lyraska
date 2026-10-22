# DSP ve matematik — Bağımsız denetim raporu (Faz 3, Denetim 2)

Denetçi: DSP ve matematik (önek `DSP`). Kaynak: main @ 5805853. Tarih: 22 Ekim 2026.

## 1. Kapsam ve yöntem

**Kaynağı hizalama:** Bana verilen çalışma ağacı `dbfb3e4`'teydi (crossfeed.rs, parametric.ts, crossfeed.ts o sürümde
yok). Dal değiştirmeden dosyalar `git checkout 5805853 -- .` ile hedef sürüme getirildi. `git diff --stat 5805853`
boş çıktı verdi, yani denetlenen dosyalar 5805853 ile birebir aynı.

**Denetlenen dosyalar (satır):** `audio/biquad.rs` (1041), `audio/peq.rs` (1786), `audio/crossfeed.rs` (655),
`audio/limiter.rs` (468), `audio/eq.rs` (1252), `audio/bass.rs` (1154, Faz 3 kısmı), `audio/normalize.rs` (789),
`audio/resample.rs` (318), `audio/loudness.rs` (467, gerçek tepe ve K ağırlığı), `audio/render.rs` (945, sinyal
zinciri ve koruma bağlantısı), `audio/player.rs` (parametrik ve crossfeed bağlantısı, 1315–1360 ve 1595–1640),
`src/lib/parametric.ts` (283), `src/lib/crossfeed.ts` (139). Toplam ~9 300 satır.

**Karşılaştırılan standartlar:** RBJ Audio EQ Cookbook (analog prototipler, BW tanımı), Vicanek 2016 (φ tabanı),
ITU-R BS.1770-4 (K ağırlığı katsayıları, Ek 2 gerçek tepe), EBU R128 (−1 dBTP), bs2b (libbs2b init/cross_feed_d),
Equalizer APO'nun filtre anlamları (kaynak koduna ağdan erişilemedi, bkz. §6).

**Çalıştırılan komutlar ve sonuçları:**

- `cargo test --lib -- --skip denetim_dsp`: mevcut testler **409 geçti, 0 kaldı**, 3 yok sayıldı.
- `cargo test --lib denetim_dsp -- --nocapture`: benim kanıt testlerim. **8 tanesi kırmızı**, 4'ü geçti (yalnızca
  ölçüm yazdıranlar ve doğrulamalar). Tam çıktı: `hesap/DSP/rust_denetim_cikti.txt`.
- `cargo test --lib -- --ignored denetim_dsp_katsayi_dokumu denetim_dsp_sinirlayici_dosya`: 96 760 ayarın RBJ ve
  eşlenmiş katsayıları döküldü (`rust_katsayilar.csv`, 193 520 satır); sınırlayıcıdan sinyal dosyaları geçirildi.
- `python3 -I hesap/DSP/dsp01…dsp10_*.py`: bağımsız türetme ve tarama betikleri. Her birinin çıktısı yanındaki
  `dspNN_cikti.txt` dosyasında.

**Kanıt dosyaları:** `docs/denetim-3/hesap/DSP/`.
Rust testlerinin tam kodu `hesap/DSP/rust_testleri/denetim_dsp_*.rs` altında. Testler çalışma ağacında ilgili
dosyanın altına `#[cfg(test)] #[path = "denetim_dsp_<modül>.rs"] mod denetim_dsp;` satırı eklenerek bağlandı.
Commit atılmadı.

## 2. Genel değerlendirme

**Puan: 6,5/10.**

- **En güçlü yan:** Matematik çekirdeği doğru. RBJ formülleri ve analog prototipler cookbook'la makine
  hassasiyetinde aynı. Eşlenmiş tasarım 96 760 ayarın hiçbirinde kararsız, en küçük fazdan sapan ya da sonlu
  olmayan katsayı vermedi. Crossfeed'in türetmesi kusursuz ve belgedeki sayıların çoğu yeniden üretildi.
- **En zayıf yan:** Belgedeki birkaç güçlü iddia tutmuyor:
  - "çizilen eğri duyulan eğridir",
  - "eşlenmiş hiçbir ayarda RBJ'den uzak olamaz",
  - "−1 dBTP'de tutar",
  - "APO ile bire bir".

  Bunun nedeni şu: ekran, ses yüksekliği telafisi ve taşma korumasına bildirilen yükseltme, sesin gerçekten
  çaldığı hızdan ve frekans aralığından farklı bir yerde hesaplanıyor.

- **Bir numaralı risk:** Taşma korumasına bildirilen yükseltme birkaç yoldan eksik kalıyor ve hepsini en sondaki
  sınırlayıcı karşılamak zorunda kalıyor:
  - 20 Hz altındaki süzgeçler: profilde +16,6 dB,
  - grafik ekolayzer: en çok 3 dB,
  - 192 kHz'te parametrik: 1,85 dB.

  Sınırlayıcının kendisi de yüksek frekanslı içerikte −1 dBTP tavanını 1 dB'e kadar aşıyor. Taşma (clipping) yok,
  ama "ekolayzer sesi kısmadan yükseltir, koruma gerektiği kadar kısar" vaadi bu durumlarda sınırlayıcının sert
  çalışmasına (pompalama) dönüşüyor.

**Bulgu sayısı:** Kritik 0, Yüksek 0, Orta 8, Düşük 4.

## 3. Bulgular (önem sırasıyla)

### [DSP-01] Taşma koruması ve kulaklık ön kazancı 20 Hz altını ve dar tepeleri görmüyor

- **Önem:** Orta | **Güven:** kesin (testle kanıtlandı)
- **Yer:**
  - `peq.rs:46` (`MIN_FREQ: f64 = 10.0`), `peq.rs:69-72`, `peq.rs:424-438` (`coefs_peak_db`: 20 Hz'ten 0,49·fs'e,
    oktavda 48 nokta),
  - `peq.rs:356-359` (profilin ön kazancı),
  - `peq.rs:686-689` (`boost_db`),
  - arayüz `parametric.ts:10` (`PEQ_FREQ_MIN = 10`).
- **Kanıt:**

  ```rust
  const PEAK_SCAN_LOW_HZ: f64 = 20.0;            // peq.rs:72
  (0..=points).map(|i| PEAK_SCAN_LOW_HZ * 2f64.powf(octaves * i as f64 / points as f64))
  ```

  Test `denetim_dsp_kulaklik_on_kazanci_tepeyi_karsilar` (rust_testleri/denetim_dsp_peq.rs) kırmızı. Profil
  düzeltmeden geçen tam ölçekli sinüsün çıkışı (yükseltme korumaya bildirilmez):

  | Profil süzgeci                            | Ön kazanç    | Gerçek tepe          | Çıkış           |
  | ----------------------------------------- | ------------ | -------------------- | --------------- |
  | `LSC Fc 15 Hz Gain 12 dB Q 2`             | **−0,00 dB** | 16,58 dB (9,6 Hz'te) | **+16,58 dBFS** |
  | `PK 14 Hz +12 Q 2`                        | −4,10 dB     | 12 dB                | **+7,90 dBFS**  |
  | `PK Q30 +12`, iki tarama noktası arasında | —            | —                    | +1,73 dBFS      |
  | `PK Q10 +12`, iki tarama noktası arasında | —            | —                    | +0,24 dBFS      |

  `dsp07_tepe_taramasi.py`: Q = 3'te tepe 0,03 dB içinde bulunuyor, belgedeki iddia doğru. Ama izin verilen Q
  sınırı 30, orada tepe +12 dB'de 2,24 dB kaçırılıyor. Parametrik ekolayzerde `PK 10 Hz +24 dB Q 4` için tarama
  1,58 dB görüyor, oysa gerçek yükseltme 24 dB. Korumaya bildirilen 1,6 dB.

- **Kullanıcıya ulaşma yolu:** Parametrik ekolayzerde frekans kutusuna "15" yazılır (10 Hz'e kadar kabul edilir) ve
  bas rafı ya da tepesi yükseltilir. Ya da 20 Hz altında süzgeci olan bir APO/REW profili içe aktarılır.
- **Etki:** Şarkıda 20 Hz altı içerik (sentezleyici altı, org, DC kayması) varsa ses yolu 0 dBFS'i 8–17 dB aşar. Son
  sınırlayıcı bunu yakalar ama bütün karışımı 17 dB'e kadar kısarak pompalar. Belge (MIMARI, normalize.rs) bu durumda
  korumanın gerektiği kadar kısacağını söylüyor, ama koruma hiç devreye girmiyor.
- **Önerilen düzeltme:**
  - Taramayı `MIN_FREQ`'den (10 Hz) başlatın, ya da daha iyisi 1 Hz'ten başlatın (rezonanslı raf tepesi f0'ın
    altına düşer).
  - Her filtrenin kendi tepe frekansını (tepe süzgecinde f0, raflarda analitik tepe) tarama noktalarına ekleyin.
    Böylece Q 30 tepeler de tam bulunur.
  - Kilit test: yukarıdaki test, eşik ≤ 0,01 dBFS.

### [DSP-02] Parametrik ekranın eğrisi ve A/B ses yüksekliği telafisi 96 kHz'te hesaplanıyor, ses aygıt hızında çalıyor

- **Önem:** Orta | **Güven:** kesin (testle kanıtlandı)
- **Yer:**
  - `peq.rs:62-65` (`ANALYSIS_RATE = 96_000`), `peq.rs:821-833` (`response_curve`), `peq.rs:839-870`
    (`loudness_gain_db`),
  - `player.rs:1349-1352` (`set_compare(…, loudness_db())`),
  - MIMARI.md: "varsayılan eşlenmiş tasarım (çizilen eğri duyulan eğridir)".
- **Kanıt:** Test `denetim_dsp_parametrik_cizilen_egri_duyulan_egri` kırmızı. Ölçüm doğrudan `PeqProcessor`'dan
  sinüsle yapıldı:

  | Ayar                                                                     | Hız      | Çizilen                | Duyulan  | Fark       |
  | ------------------------------------------------------------------------ | -------- | ---------------------- | -------- | ---------- |
  | APO dosyasından içe aktarılmış (RBJ): HSC 10 kHz +6, PK 16 kHz +6 Q 1,41 | 44,1 kHz | +9,69 dB (19,4 kHz'te) | +6,68 dB | **3,0 dB** |
  | aynı                                                                     | 48 kHz   | —                      | —        | 2,4 dB     |
  | Eşlenmiş HS 22 kHz +12                                                   | 44,1 kHz | +5,26 dB (20 kHz'te)   | 0,00 dB  | **5,3 dB** |
  | Eşlenmiş PK 12 kHz +9 Q 2                                                | 44,1 kHz | —                      | —        | 0,38 dB    |
  | Varsayılan HS 10 kHz +6                                                  | —        | —                      | —        | 0,11 dB    |

  `dsp09_cizim_hizi.py`: AutoEq benzeri 7 süzgeçli bir profilde çizilen ile duyulan arasındaki fark 44,1 kHz'te
  1,68 dB, 48 kHz'te 1,35 dB.

  Test `denetim_dsp_ab_telafisi_calan_hizdaki_sesle_uyusur` kırmızı. `LS 24 kHz +6` için 48 kHz'te `loudness_db`
  5,85 dB, `boost_db` 0. Ekolayzerli taraf +0,00 dB çalıyor, karşılaştırma tarafı **+5,85 dB**. A/B'nin amacı iki
  tarafı eşit yükseklikte dinletmek, burada tersine dönüyor. Üstelik karşılaştırma tarafının yükseltmesi korumaya
  bildirilmiyor.

  **Test boşluğu:** `peq.rs:1757` "İşlemci aynı eğriyi çalar" der, ama işlemciyi ekrana giden `state.curve_db`
  (96 kHz) ile değil, `settings.response_db(&[hz], 48_000.0)` ile karşılaştırıyor. Yani test ekranı denetlemiyor.

- **Kullanıcıya ulaşma yolu:** Equalizer APO dosyası parametrik ekolayzere yüklenir. Tasarım RBJ olur
  (`from_profile`) ve tiz bölgede ekran 1,5–3 dB yanlış gösterir. Ya da kullanıcı 21–24 kHz'e "hava" rafı koyar,
  arayüz buna 24 kHz'e kadar izin verir.
- **Etki:** Ana vaat ("çizilen eğri duyulan eğridir") içe aktarılan profillerde ve tiz rafta tutmuyor. A/B
  karşılaştırması bu ayarlarda yanıltıyor.
- **Önerilen düzeltme:**
  - `ParametricState`'e aygıtın o anki hızını verin ve eğriyi, `boost_db`'yi, `loudness_db`'yi o hızda hesaplayın.
    Hız bilinmiyorsa 48 kHz kullanın; 96 kHz yalnızca analog önizleme içindir.
  - Kilit test: `ParametricState::new(s, rate).curve_db[i]` ile `PeqProcessor(rate)` ölçümü 0,1 dB içinde olsun;
    A/B iki tarafı 1 kHz'te 0,5 dB içinde olsun.

### [DSP-03] Nyquist'e yakın (f ≥ 0,49·fs) tepe, raf, alçak geçiren, çentik ve tüm geçiren süzgeçler sessizce siliniyor

- **Önem:** Orta | **Güven:** kesin
- **Yer:**
  - `biquad.rs:55-56` (`MAX_FREQ_RATIO = 0.49`), `biquad.rs:179-187` (`shape` → `None` → `IDENTITY`),
    `biquad.rs:241-244`, `biquad.rs:276-278`, `biquad.rs:290-292`, `biquad.rs:333-337`,
  - `peq.rs:47` (`MAX_FREQ = 24_000`),
  - `parametric.ts:11`.
- **Kanıt:**
  - Test `denetim_dsp_nyquist_yakininda_raf_sessizce_kaybolur` kırmızı: `LS 24 kHz +6 dB @48k` sayısalda 1 kHz'te
    0,00 dB, analogda 6,00 dB. `HS 22 kHz +12 @44,1k` sayısalda 16/20 kHz'te 0,00/0,00 dB, analogda 2,96/5,02 dB.
  - `dsp02_eslenmis_tarama.py`: 7 756 ayar birim süzgece dönüyor, analog eğri duyulur bantta 59 dB'e kadar
    kazanç ya da kısma istiyor (uç örnek LS +30 Q 30).
  - Yüksek geçiren ve bant geçiren ise 0,49·fs'e çekiliyor (`biquad.rs:256`, `:268`), yani davranış türler arasında
    tutarsız.
- **Kullanıcıya ulaşma yolu:** Parametrik ekolayzerde 21,6 kHz (44,1 kHz'te) ya da 23,5 kHz (48 kHz'te) üstüne
  raf veya tepe konur. Ekran (96 kHz, DSP-02) etkiyi gösterir, ses hiç değişmez.
- **Etki:** Alçak rafta bütün bant kazancı, yüksek rafta 16–20 kHz'teki birkaç dB kayboluyor. Korumaya ve A/B'ye
  bildirilenler de tutarsız oluyor (DSP-02).
- **Önerilen düzeltme:**
  - Raf ve tepeyi silmek yerine 0,49·fs'e çekin, kazancı analog eğrinin o noktadaki değerine göre ayarlayın.
  - Ya da en azından arayüzde frekans üst sınırını `0,49·fs` yapın ve kullanıcıya "bu hızda etkisiz" deyin.
  - Kilit test: f ≥ 0,49·fs olan raflarda 1 kHz ve 16 kHz'te analog eğriden sapma < 1 dB.

### [DSP-04] Grafik ekolayzerin korumaya bildirdiği yükseltme (en yüksek sürgü) gerçek tepeyi 3 dB'e kadar karşılamıyor

- **Önem:** Orta | **Güven:** kesin
- **Yer:** `eq.rs:581` (`preamp_db: -gains_db…max`), `eq.rs:740-742` (`boost_db`), `render.rs:177`.
- **Kanıt:** Test `denetim_dsp_ekolayzer_bildirilen_yukseltme_gercek_tepeyi_karsilar` kırmızı:
  - Duyulur bantta en kötü eksik **3,01 dB**: zikzak ±12 @48 kHz, tepe 15,01 dB (20 kHz'te), bildirilen 12.
  - 20 Hz altında en kötü eksik 3,02 dB.
  - 4 hız × 307 ayarda (testtekiyle aynı 300 rastgele + uç durumlar), **339/1228** durumda 0,5 dB'den fazla
    eksik bildirim var.

  Belgedeki "en fazla 1,2 dB (ölçülen 1,11)" iddiası yalnızca tasarım noktalarında geçerli; mevcut test
  `her_ayarda…` geçiyor. Ama aradaki frekanslarda eğri sürgüleri aşıyor ve koruma bunu görmüyor.

- **Kullanıcıya ulaşma yolu:** Komşu bantları zıt yönde (ör. "V" ya da zikzak) ayarlamak.
- **Etki:** Eşitlemenin açtığı boşluk tam kullanıldığında ses 0 dBFS'i ~3 dB aşabiliyor, sınırlayıcı sert
  çalışıyor.
- **Önerilen düzeltme:** `boost_db`'yi en yüksek sürgüden değil, `Design::response_db`'nin 20 Hz – 0,49·fs
  taramasından bulun (`coefs_peak_db` gibi), bas rafıyla birlikte. Kilit test: yukarıdaki test, eşik 0,1 dB.

### [DSP-05] Parametrik ekolayzerin bildirilen yükseltmesi 44,1/48 kHz'e göre; 96/192 kHz'te eksik kalıyor

- **Önem:** Orta | **Güven:** kesin
- **Yer:** `peq.rs:66-68` (`REFERENCE_RATES`), `peq.rs:686-689`, `peq.rs:1005-1012` (bildirilen takım ses yolunda
  yeniden sınırlanmaz).
- **Kanıt:** Test `denetim_dsp_parametrik_yukseltme_her_hizda_karsilanir` kırmızı. 3000 rastgele ayar × 2 yöntem
  denendi. En kötü durum 192 kHz, eşlenmiş tasarım: bildirilen 14,95 dB, **duyulur bantta (≤ 20 kHz) gerçek
  tepe 16,80 dB**, eksik 1,85 dB. Örnek ayar: HS 5,7 kHz +7,7 Q 2,18 ile LS 14 kHz −9,7 Q 4,5 ve iki tepe süzgeci.
  `peq.rs:1416` testinin yorumu da hızlar arasında 3 dB fark olduğunu kabul ediyor.
- **Kullanıcıya ulaşma yolu:** 96/192 kHz paylaşımlı mod aygıtı ya da bit-perfect olmayan yüksek hızlı oturum.
- **Etki:** DSP-04 ile aynı: koruma eksik, sınırlayıcı devreye giriyor.
- **Önerilen düzeltme:** Kulaklık takımında olduğu gibi ses yolunda çalan hızın tepesini hesaplayın
  (`coefs_peak_db`). Leveler'a `max(bildirilen, çalan hızdaki tepe)` gitsin, ya da `boost_db` hız parametresi alsın.

### [DSP-06] Gerçek tepe sınırlayıcı −1 dBTP tavanını yüksek frekanslı içerikte 1 dB'e kadar aşıyor

- **Önem:** Orta | **Güven:** kesin
- **Yer:** `limiter.rs:9-16` (iddia: "çıkışı −1 dBTP'de tutar… testler 0,1 dB tolerans"), `limiter.rs:225-260`
  (ara değerleyici: Blackman pencereli sinc, kesim tam fs/2, faz başına 16 katsayı).
- **Kanıt:**
  - Fazların 44,1 kHz'teki genliği (`denetim_dsp_ara_degerleyici_yaniti` ve dsp05): 18 kHz'te en çok −0,97 dB,
    **20 kHz'te −4,59 dB**. Ara değerleyici tize doğru tepeyi küçük görüyor.
  - Uçtan uca ölçüm (`dsp08_sinirlayici_uctan_uca.py` + Rust `denetim_dsp_sinirlayici_dosya`): örnek tepesi 1,4 olan
    44,1 kHz sinyaller gerçek `Limiter`'dan geçirildi, çıkışın gerçek tepesi 32× FFT ile ölçüldü:

    | Sinyal             | Çıkışın gerçek tepesi |
    | ------------------ | --------------------- |
    | pembe gürültü      | **−0,77 dBTP**        |
    | beyaz 20 Hz–20 kHz | **−0,32 dBTP**        |
    | 12–20 kHz gürültü  | **−0,01 dBTP**        |

    Örnek tepeleri tam −1,00'de kalıyor. Belgedeki ölçümler (fs/4 sinüste 0,04 dB, kırpılmış 9 kHz'te 0,06 dB)
    yalnız dar bantlı sinyallerde doğru.

  - Sinüs taraması (`denetim_dsp_yuksek_frekansta…`): 20 kHz @48 kHz'te **−0,884 dBTP**. Tolerans 0,1 dB, aşım
    0,116 dB, test kırmızı.
- **Kullanıcıya ulaşma yolu:** Yüksek basılmış, tizi parlak kayıtlar (zil, sibilans), özellikle tiz yükselten
  ekolayzer ya da profil açıkken.
- **Etki:** −1 dBTP (EBU R128) vaadi tutmuyor. 0 dBTP aşılmıyor, yani DAC'ta örnekler arası kırpılma riski düşük.
- **Önerilen düzeltme:** Ara değerleyicinin kesimini fs/2'nin altına çekin ya da geçiş bandı payı bırakın
  (Kaiser β≈8, 0,45·fs'e kadar düz, faz başına 24–32 katsayı). Ya da tavana ölçülen kaçırma kadar pay ekleyin
  (`CEILING` −1,3 dB). Kilit test: dsp08 sinyalleri Rust testine gömülsün, çıkışın gerçek tepesi ≤ −0,95 dBTP olsun.

### [DSP-07] "Eşlenmiş tasarım hiçbir ayarda RBJ'den uzak olamaz" tutmuyor (rezonanslı raflarda 6,9 dB'e kadar kötü)

- **Önem:** Orta | **Güven:** kesin
- **Yer:**
  - `biquad.rs:30-34` (iddia), `biquad.rs:438-443` (seçim yalnızca ızgarada),
  - `biquad.rs:663-666` (merkez çevresi ızgarası `freq_hz` etrafında; rafın kutbu `√A·f0`'da),
  - ROADMAP: "hiçbir ayarda RBJ'den uzak değil",
  - mevcut test `biquad.rs:888-891` 1,0 dB'e kadar kötüye izin veriyor.
- **Kanıt:**
  - Test `denetim_dsp_eslenmis_hicbir_ayarda_rbj_den_kotu_degil` (projenin kendi ayar ızgarası ve ölçüsü) kırmızı:
    `LowShelf 6,3 kHz +18 Q 8 @48k`'da eşlenmiş 7,10 dB sapıyor, RBJ 6,36 dB. Eşlenmiş **0,74 dB daha kötü**.
  - Geniş tarama (`dsp02`, 96 760 ayar): **112 ayarda** eşlenmiş RBJ'den > 0,05 dB kötü. Hepsi yüksek Q'lu raflar.
    En kötüsü `HS 8,7 kHz +12 Q 8 @48k`: eşlenmiş 13,99, RBJ 7,12 dB, fark **+6,87 dB**.
  - `dsp10_rezonansli_raf.py`: bu ayarda eşlenmiş eğri 6,6 kHz'te analogdan **−14,0 dB** sapıyor. Merkez çevresi
    ızgarası 7,3–10,3 kHz'i kapsıyor, analog kutup ise 12,3 kHz'te.
- **Kullanıcıya ulaşma yolu:** Parametrik ekolayzerde (varsayılan tasarım eşlenmiş) bir rafın Q'su 4–30 arasına
  çıkarılır. Arayüz 30'a kadar izin veriyor.
- **Etki:** Bu ayarlarda duyulan eğri, ekrandaki (96 kHz) eğriden 10+ dB farklı olabiliyor.
- **Önerilen düzeltme:** Ölçü ızgarasına kutup ve sıfır frekanslarının (`√A·f0`, `f0/√A`) çevresini ekleyin. Son
  seçimi sık bir doğrulama ızgarasıyla (ör. 256 nokta) yeniden yapın. Kilit test: `denetim_dsp_eslenmis_…` ve mevcut
  testin toleransı 1,0 → 0,05 dB.

### [DSP-08] "BW Oct" → Q dönüşümü analog tanımla yapılıyor; RBJ/APO'nun sayısal BW tanımından 16 kHz'te 3 dB farklı

- **Önem:** Orta | **Güven:** yüksek (RBJ Cookbook tanımı kesin; APO kaynağına erişilemedi, ama kodun kendi yorumu
  APO'nun sayısal tanım kullandığını söylüyor)
- **Yer:** `peq.rs:451-455`
  ```rust
  /// (Equalizer APO bant genişliğini sayısal alanda, örnekleme hızına bağlı tanımlar; fark yalnızca çok yüksek frekanslarda.)
  fn q_from_bandwidth(octaves: f64) -> f64 { 1.0 / (2.0 * (LN_2 / 2.0 * octaves).sinh()) }
  ```
  ROADMAP: "Kulaklık profilleri Equalizer APO'nun kaynak kodundaki anlamlarla okunur (… BW Oct …)". MIMARI: "APO ile
  bire bir aynı ses".
- **Kanıt:** `dsp03_bant_genisligi.py`, PK +6 dB, BW 1 oktav, 44,1 kHz. Eğri farkı:

  | f0        | 1 kHz | 4 kHz | 8 kHz    | 12 kHz   | 16 kHz   | 19 kHz |
  | --------- | ----- | ----- | -------- | -------- | -------- | ------ |
  | Fark (dB) | 0,01  | 0,16  | **0,68** | **1,65** | **3,25** | 5,09   |

  48 kHz'te farklar biraz daha küçük (8 kHz'te 0,57 dB). Bu "yalnızca çok yüksek frekanslarda" değil, 8 kHz'ten
  itibaren duyulur düzeyde.

- **Kullanıcıya ulaşma yolu:** REW ya da elle yazılmış "BW Oct" içeren APO dosyası (kulaklık profili ya da
  parametrik ekolayzere yükleme).
- **Etki:** Profil Equalizer APO'dakinden tizde 0,7–3 dB farklı çalıyor.
- **Önerilen düzeltme:** BW'yi Q'ya okuma anında çevirmeyin, `bandwidth_oct` olarak saklayın. Tasarım anında
  `α = sin w0 · sinh(ln2/2 · BW · w0/sin w0)` kullanın (RBJ yönteminde). Kilit test: `BW Oct 1 @ 12 kHz`'in
  katsayıları cookbook'un BW formülüyle 1e-12 içinde olsun.

### [DSP-09] A/B telafisindeki "K ağırlığı" BS.1770'in K ağırlığı değil (0,49 dB eğri farkı)

- **Önem:** Düşük | **Güven:** kesin
- **Yer:** `peq.rs:843-855`. libebur128'in Vh/Vb biçimi için türetilmiş (f0, G, Q) değerleri RBJ yüksek raf
  prototipine konmuş. `loudness.rs:90-121` ise doğru biçimi kullanıyor.
- **Kanıt:** `dsp04_k_agirlik.py`: BS.1770-4'ün 48 kHz katsayılarına göre en büyük fark −0,491 dB (1,6 kHz'te).
  Doğru biçimle kurulsaydı fark 0,052 dB olurdu. Telafiye etkisi: PK 1,5 kHz +12 Q 0,7 için −0,15 dB, tipik
  ayarlarda < 0,03 dB.
- **Önerilen düzeltme:** `loudness.rs`'teki Vh/Vb analog biçimini kullanın.

### [DSP-10] Crossfeed hazır ayarları bs2b'nin kulaklar arası zaman farkını vermiyor; tepe iddiası yalnız "Orta" için

- **Önem:** Düşük | **Güven:** kesin (bs2b, libbs2b'nin init formülleriyle yeniden kuruldu)
- **Yer:** `crossfeed.rs:38-42`, `crossfeed.rs:64-74`, `crossfeed.ts` ipuçları ("Chu Moy'un devresi",
  "bs2b'nin varsayılanı"), MIMARI.md:71.
- **Kanıt:** `dsp06_crossfeed.py`. Alçak frekans seviye farkı (ILD) birebir aynı (9,53 / 6,02 / 4,52 dB). Farklar:
  - **Kulaklar arası zaman farkı (ITD):** bs2b 264 / 256 / 261 µs, Lyraska 244 / 227 / 227 µs (%8–13 daha kısa).
  - **Karşı kulak 1–5 kHz'te:** Lyraska'da 1–1,6 dB daha yüksek.
  - **Örnek tepesi sınırı ‖g‖₁:** "Orta +4 dB" doğrulandı (+3,98 dB). Ama "Hoparlör gibi" +5,19 dB, sınır değerlerde
    (300 Hz, 1 dB, 96 kHz) +5,61 dB. Belgede yalnız "Orta +4" yazıyor. Tam ölçekli gürültüde "~1,6 dB" Orta için
    doğru (+1,68 ile +1,77), "Hoparlör gibi"de +2,41 dB.
  - **Ekran ile duyulan:** Ekran (96 kHz) ile 44,1 kHz'te duyulan arasında 5 kHz altında 0,25 dB fark var. Belgedeki
    "≤ 0,07 dB" ekran ile analog önizleme arasındaki farktır.
- **Önerilen düzeltme:** Belgede "aynı kesim/seviye, ITD ~%10 daha kısa" deyin, ya da ωc'yi ITD'yi tutturacak
  biçimde ölçekleyin. ‖g‖₁'i bütün hazır ayarlar için yazın.

### [DSP-11] Analizdeki gerçek tepe ölçeri (4×/12 katsayı) geniş bantlı içerikte 1 dB'e kadar az ölçüyor

- **Önem:** Düşük | **Güven:** kesin
- **Yer:** `loudness.rs:14`, `loudness.rs:133-176`. Eşitleme kazancı `loudness.rs:50-56`'da ölçülen gerçek tepeye
  göre sınırlanıyor.
- **Kanıt:** `dsp05_cikti.txt`: 44,1 kHz'te beyaz gürültüde −1,02 dB, 12–20 kHz'te −1,43 dB, 48 kHz'te −0,56 dB az
  ölçüyor (32× FFT referansına göre).
- **Etki:** Yükseltilen sessiz şarkılarda gerçek tepe −1 dBTP'yi aşabiliyor; son sınırlayıcı yakalıyor (ama o da
  DSP-06'daki payla).
- **Önerilen düzeltme:** DSP-06 ile aynı ara değerleyici.

### [DSP-12] Toplam yükseltme en kötü durum olarak toplanıyor (gereksiz kısma); kulaklık kısması parametrikten düşülmüyor

- **Önem:** Düşük | **Güven:** kesin (kod okuması ve hesap)
- **Yer:** `render.rs:174-180` (`eq.boost_db() + parametric.boost_db()`), `normalize.rs:330-333`.
- **Kanıt:**
  - Grafik ekolayzer 31 Hz +12 ile parametrik PK 8 kHz +12 birlikte açıkken bildirilen 24 dB, gerçek tepe ~12 dB.
    Koruma boşluğun 12 dB fazlasını gereksiz yere kısıyor. Kod yorumu bunu "en kötü durum" olarak kabul ediyor.
  - Kulaklık profilinin aynı frekanstaki kısmaları da parametrik yükseltmeden düşülmüyor (profil −6 @3 kHz ile
    parametrik +6 @3 kHz: bildirilen 6 dB, gerçek 0).
- **Önerilen düzeltme:** Üç takımın (kulaklık, parametrik, grafik + bas rafı) birleşik eğrisinin tepesini tek
  taramada bulun (hepsi biquad; `coefs_peak_db` zaten ayırmasız).

## 4. Şüpheler (kanıtlanamayanlar, güven "olası")

- **LS/HS köşe → orta frekans dönüşümü** (`orta = köşe × 10^(|G|/(80·S))`) ve Q'suz rafta S = 0,9 varsayılanı.
  Equalizer APO'nun kaynak koduna (SourceForge) ağdan erişilemedi, doğrulanamadı. Kendi içinde tutarlı ve testli.
- **"≤ 0,8 dB gereksiz kısma" iddiası** depoda bulunamadı (kod, MIMARI, ROADMAP'te grep). Ölçülmedi.
- **Bas motorunun ölçülen bas tepeleri** (`BassPeakMeter`) örnek tepesine mi gerçek tepeye mi dayanıyor,
  ayrıntılı denetlenmedi. DSP-04/05'teki toplama zinciri üzerinde etkisi olası.

## 5. Güçlü yanlar (kanıtla)

- **RBJ tasarımı:** `dsp01`. Formüller, ön bükmeli `scipy.signal.bilinear` + cookbook prototipleriyle 4000
  rastgele ayarda 6,7e−16 göreli fark veriyor. `Spec::analog` cookbook ile 2e−14 dB aynı. Rust'ın döktüğü 96 760
  RBJ satırının en büyük göreli farkı 7e−9 (8 kHz'te 17 Hz Q 0,05 gibi uç ayarda yuvarlama).
- **Eşlenmiş tasarımın sağlamlığı:** `dsp02`. 8 hız (8 kHz – 192 kHz), Q 0,05–30, ±30 dB içinde hiçbir ayarda
  kararsız kutup, en küçük fazdan sapma ya da NaN/∞ yok. Ortalama doğruluk büyük ölçüde iyileşiyor (44,1 kHz:
  PK 2,12 → 0,28; LP 4,30 → 0,20; BP 5,64 → 0,34 dB).
- **Belgedeki doğruluk tablosu:** `denetim_dsp_dogruluk_tablosu_yazdir` ile birebir yeniden üretildi: PK
  0,696 → 0,157; LS 0,643 → 0,200; HS 0,589 → 0,241; LP 3,972 → 0,161; BP 4,059 → 0,328 dB. Belgedeki 0,70 → 0,16,
  3,97 → 0,16 ve 4,06 → 0,33 değerleri doğru.
- **Crossfeed matematiği:** `dsp06`. G(s) özdeşliği, BLT katsayıları (scipy ile 2e−16), |G| ≤ 1, ‖g‖₁ = 2·b0 − G(1)
  ve "Orta +4 dB" hepsi doğru. Orta ses bit bit aynı (mevcut test).
- **Yeniden örnekleme:** `denetim_dsp_yeniden_ornekleme_yaniti`. 44,1 ↔ 48, 96 → 48, 192 → 44,1 kHz dönüşümlerinde
  21 kHz'e kadar ±0,000 dB düz. Örtüşme bastırması −181 dB ve daha iyi. "~20 kHz'e kadar düz" iddiası fazlasıyla
  sağlanıyor.
- **Mevcut testler:** 409 test geçiyor. Grafik ekolayzerin "tasarım noktalarında ≤ 1,2 dB" iddiası mevcut testle
  doğrulanıyor.

## 6. Denetlenemeyenler ve sınırlar

- Equalizer APO ve AutoEq kaynak kodları ağdan indirilemedi (SourceForge 404, GitHub erişimi oturumla sınırlı). APO
  anlamları kodun kendi yorumlarına ve RBJ Cookbook'a dayanılarak denetlendi.
- BS.1770-4 Ek 2'nin 48 katsayılı ara değerleme süzgeci elde yoktu. Sınırlayıcı ideal (FFT) referansa göre ölçüldü.
- Gerçek aygıtta (WASAPI) dinleme yapılmadı. Bütün ölçümler sayısal.
- Bas motorunun alt oktav osilatörü ve vuruş (punch) ayrıntılı denetlenmedi. Yalnızca taşma korumasına bağlandığı
  yer incelendi.

## 7. Önerilen öncelik sırası

1. **DSP-01:** Taramayı 10 Hz (tercihen 1 Hz) altından başlatın ve her süzgecin tepe frekansını taramaya ekleyin.
   Küçük değişiklik, en büyük taşma (+16,6 dB) kapanır.
2. **DSP-04 ve DSP-05, DSP-12 ile birlikte:** Korumaya bildirilen yükseltmeyi çalan hızda, üç takımın birleşik
   eğrisinden tarayarak bulun. Böylece hem eksik hem fazla kısma biter.
3. **DSP-02 ve DSP-03:** Parametrik ekranı, A/B telafisini ve yükseltmeyi aygıt hızında hesaplayın. Nyquist
   yakınındaki rafları silmeyin. "Çizilen = duyulan" testini ekrana giden eğriyle yazın.
4. **DSP-06 ve DSP-11:** Geçiş bandı paylı gerçek tepe ara değerleyicisi.
5. **DSP-07:** Eşlenmiş tasarımın ızgarasına kutup ve sıfır bölgelerini ekleyin. Test toleransı 1,0 → 0,05 dB.
6. **DSP-08:** BW'yi sayısal tanımla tasarlayın.
7. **DSP-09 ve DSP-10:** Belge ve küçük düzeltmeler.
