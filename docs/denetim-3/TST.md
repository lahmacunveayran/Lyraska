# Test etkinliği, iddia–kanıt izlenebilirliği ve kalite kapıları — Bağımsız denetim raporu (Faz 3, Denetim 2)

Denetçi: TST (test etkinliği / mutasyon testi / iddia–kanıt / kalite kapıları). Kaynak: main @ 5805853 (sürüm 0.0.55).
Tarih: 22 Ekim 2026.

Kanıt klasörü: `docs/denetim-3/hesap/TST/`
(aşağıda kısaca `hesap/TST/`). Her betik `python3 -I <betik>` ile tek başına yeniden üretilebilir; Rust kanıt
testleri `hesap/TST/denetim_tst.rs` dosyasındadır (kurulum ve çalıştırma komutu dosyanın başında).

## 1. Kapsam ve yöntem

**Dosyalar.** Faz 3 çekirdeği: `src-tauri/src/audio/biquad.rs` (1041 satır), `crossfeed.rs` (655), `limiter.rs` (468),
`peq.rs` (1786), `render.rs` (945); arayüz hesapları `src/lib/parametric.ts` (283), `src/lib/crossfeed.ts` (139) ve
testleri; `player.rs`'in Faz 3 bağlantıları (parametrik EQ, A/B, crossfeed, görseller); `components.test.tsx`'in
parametrik EQ ve crossfeed bölümleri. Belgeler: `docs/ROADMAP.md` Faz 3, `docs/MIMARI.md`, `docs/DOGRULAMA.md` C5–C6,
modül belgeleri. Toplam ~5 300 satır kod + ~2 700 satır test okundu.

**Yöntem.**

1. Bütün kalite kapıları kendi çalışma ağacımda (main @ 5805853'e alınmış, temiz) çalıştırıldı; süre ve çıkış kodu
   `hesap/TST/kapilar.tsv`'de, tam çıktılar `hesap/TST/kapilar/*.log`'da.
2. Rust mutasyon testi: `cargo-mutants 27.1.0`, `--in-place`, kendi derleme klasöründe; testler `--lib` ve
   `audio:: settings::` süzgeciyle (Faz 3 kodunu kullanan bütün modüller `audio::` altında).
3. TypeScript elle mutasyon: 34 mutasyon, betik `hesap/TST/ts_mutasyon.py`, sonuç `ts_mutasyon.tsv`.
4. Belgelerdeki her ölçülebilir iddia için onu doğrulayan test arandı, testin eşiği iddiayla karşılaştırıldı; eşiği
   gevşek ya da testi olmayan sayısal iddialar bağımsız olarak yeniden hesaplandı (Python betikleri) ya da kanıt
   testiyle ölçüldü.
5. Ürün kodunda elle mutasyon (oynatıcı → ses yolu bağlantıları): iki mutasyon, ardından kod geri alındı.
6. Belirlenimcilik: zamanlamaya bağlı Rust testleri ve bileşen testleri 5'er kez çalıştırıldı.

**Standart/ölçüt.** CLAUDE.md test kuralları; belgede yazan her sayının bir testle ya da hesapla doğrulanması
(BRIEF); ITU-R BS.1770-4 Ek 2 (gerçek tepe); RBJ Audio EQ Cookbook.

## 2. Genel değerlendirme

**Puan: 7/10.**

- **En güçlü yan:** Kalite kapılarının hepsi yeşil (bir tanesi yalnızca makine yükü altında kırmızı, bkz. TST-05);
  çekirdek matematik testleri çoğunlukla **doğru şeyi** ve belgedeki eşikle ölçüyor (örn. `ses_yolu_bellek_ayirmaz`
  Faz 3'ün bütün yeni işlemlerini kapsıyor; crossfeed'in "orta ses bit bit aynı" ve "|G| ≤ 1" iddiaları 4 hız ×
  12 ayarda kesin denetleniyor; belgedeki sayıların çoğu benim bağımsız hesabımla birebir tuttu). Mutasyon skorları
  aşağıda.
- **En zayıf yan:** Testler çoğunlukla **tek örnekleme hızında** (44,1 ya da 48 kHz) ve **tek katmanda** (çekirdek
  birimi) ölçüyor; hız değişince ya da katmanlar birleşince (oynatıcı → kanal → ses yolu, çekirdek eğrisi → ekran)
  bozulan iddialar yakalanmıyor. Üç sayısal iddia kanıt testiyle kırmızı yandı (TST-01, TST-02, TST-03).
- **Bir numaralı risk:** Parametrik ekolayzerin A/B telafisi ve korumaya yükseltme bildirimi oynatıcı katmanında
  hiç test edilmiyor: işaret ters çevrilince (A/B iki kat yanlış seviye) bütün 409 Rust testi yeşil kalıyor (TST-04).

**Mutasyon skorları (özet).**

| Kapsam                                                                                                 | Denenen            | Yakalanan | Kaçan | Derlenmeyen | Zaman aşımı | Skor (yakalanan / derlenen)                                           |
| ------------------------------------------------------------------------------------------------------ | ------------------ | --------- | ----- | ----------- | ----------- | --------------------------------------------------------------------- |
| Rust `crossfeed.rs` satır 101–223 (`sanitized`, `ratio`, `SideFilter::design`, `SideFilter::response`) | 83 / 304 planlanan | 74        | 5     | 4           | 0           | **%93,7** (kaçan 5'in 5'i eşdeğer ya da ulaşılamaz → etkin skor %100) |
| TypeScript elle (`parametric.ts` 22, `crossfeed.ts` 12)                                                | 34                 | 20        | 14    | 0           | —           | **%58,8**; 5 eşdeğer çıkarılınca **%69,0**                            |
| Rust elle (oynatıcı → ses yolu bağlantısı, `player.rs`)                                                | 2                  | 0         | 2     | 0           | —           | **%0** (TST-04)                                                       |

Rust mutasyon koşusu (`cargo-mutants 27.1.0`, `--in-place -C --lib`, testler `audio:: settings::`; mutant başına
~20 sn derleme + ~19 sn test) koordinatörün süre sınırı nedeniyle 83. mutantta durduruldu; `limiter.rs`, `biquad.rs`,
`peq.rs`, `render.rs` ve `crossfeed.rs`'in 223. satırdan sonrası (işlemci, kilitsiz kanal, çapraz geçiş) mutasyonla
**denetlenemedi** (bkz. bölüm 6). Ham sonuçlar: `hesap/TST/mut_cf_lim_run1/` (ilk koşu, disk dolunca kesildi) ve
`hesap/TST/mut_cf_lim/mutants.out/` (`--iterate` ile sürdürülen koşu); kayıtlar `mut_cf_lim.log`, `mut_cf_lim2.log`.

**Kaçan Rust mutantları ve sınıfı:**

| Yer                 | Değişiklik                    | Sınıf       | Gerekçe                                                                                                                            |
| ------------------- | ----------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| crossfeed.rs:203:24 | `zero * pole` → `zero + pole` | (c) önemsiz | Ön bükme noktası ~√(z·p) yerine ~10 Hz'e kayar; çift doğrusal dönüşüm                                                              | G   | ≤ 1, DC ve Nyquist değerlerini yine korur; 48 kHz'te 2 kHz altındaki fark < %1 (testin toleransı). Duyulmaz. |
| crossfeed.rs:203:24 | `zero * pole` → `zero / pole` | (c) önemsiz | Aynı (ön bükme 0,16 rad/s'ye kayar, yani ön bükmesiz çift doğrusal).                                                               |
| crossfeed.rs:205:22 | `&&` → `\|\|` (koruma koşulu) | (b) eşdeğer | `sanitized` kesimi 300–1200 Hz'e sınırladığı için her gerçek hızda (≥ 8 kHz) t zaten (0, π/2·0,99) içinde; koşul hiç yanlış olmaz. |
| crossfeed.rs:205:16 | `t > 0.0` → `t >= 0.0`        | (b) eşdeğer | t = 0 ulaşılamaz (kesim ≥ 300 Hz).                                                                                                 |
| crossfeed.rs:205:32 | `PI / 2.0` → `PI * 2.0`       | (b) eşdeğer | Üst sınıra yalnızca fs < ~1,3 kHz'te ulaşılır; aygıt hızlarında yok.                                                               |

**Kaçan TypeScript mutantları ve sınıfı** (`hesap/TST/ts_mutasyon.tsv`):

| Kimlik | Değişiklik                                    | Sınıf                                                           |
| ------ | --------------------------------------------- | --------------------------------------------------------------- |
| P10    | yüksek raf önizlemesinin paydası `A` → `1`    | **(a) gerçek boşluk** — TST-08; önerilen test yakalıyor         |
| X12    | crossfeed önizlemesinde ρ'nun kesimi ×2       | **(a) gerçek boşluk** — TST-08; önerilen test yakalıyor         |
| P16    | `PEQ_LIMITS.maxBands` 20 → 16                 | (a) küçük: çekirdekle kopya sabit, eşitlik testi yok            |
| X04    | `CROSSFEED_LIMITS.minLevelDb` 1 → 0,5         | (a) küçük: aynı neden                                           |
| X08    | hazır ayar seviye toleransı 0,05 → 1 dB       | (c) önemsiz: yalnızca hazır ayar adının vurgusu                 |
| P13    | önizlemede yükseltme 0'ın altına inebilir     | (c) önemsiz: yalnızca tarayıcı önizlemesi                       |
| P18    | `DEFAULT_PARAMETRIC.design` "matched" → "rbj" | (c) önemsiz: çekirdeğin durumu gelince ezilir                   |
| X10    | önizleme sınırlanmamış ayarla çizer           | (c) önemsiz: ayar zaten sınırlanmış gelir                       |
| X11    | eğri alanı alt sınırı 36 → 30 dB              | (c) önemsiz: görsel ölçek                                       |
| P02    | `roundHz` `< 100` → `<= 100`                  | (b) eşdeğer: 100 Hz iki adımda da 100                           |
| P07    | `>= 0.005` → `> 0.005`                        | (b) eşdeğer: kazanç 0,1 dB'e yuvarlanır, 0,005 olamaz           |
| P11    | tüm geçiren payının işareti                   | (b) eşdeğer: genlik aynı (yalnızca faz değişir, çizilen genlik) |
| X02    | ρ'nun sanal kısmının işareti                  | (b) eşdeğer: yalnızca                                           | ρ   | kullanılıyor |
| X09    | eğri yolu üst kırpma 0 → +6 dB                | (b) eşdeğer: yakın/uzak kulak hiçbir zaman 0 dB'i aşmaz         |

## 3. Bulgular (önem sırasıyla)

### [TST-01] Gerçek tepe sınırlayıcı 48 kHz'te −1 dBTP tavanını 0,31 dB aşıyor; belgedeki "0,06 dB" ve testi yalnızca 44,1 kHz için

- Önem: **Orta** | Güven: kesin (testle ve hesapla kanıtlandı)
- Yer: `src-tauri/src/audio/limiter.rs:14-16` (belge), `limiter.rs:225-263` (`interpolator`, faz başına 16 katsayı),
  test `limiter.rs:385-402` (`kirpilmis_yuksek_frekans_tavani_asmaz`, yalnızca `let rate = 44_100;`)
- İddia: "Ölçülen kaçırma payı fs/4 sinüste 0,04 dB, sert kırpılmış 9 kHz'te 0,06 dB …; testler 0,1 dB tolerans
  tanır." MIMARI.md:89-91: "çıkışı −1 dBTP'de tutar".
- Kanıt 1 (Rust, projenin kendi testinin aynısı, aynı referans ölçer ve aynı 0,1 dB tolerans, yalnızca hız 48 kHz):
  `hesap/TST/denetim_tst.rs` → `tst01_kirpilmis_9khz_48khz_te_de_tavani_asmaz`
  ```
  TST01 44100 Hz: çıkışın gerçek tepesi -0.940 dBTP (sınır -1 + 0,1)
  TST01 48000 Hz: çıkışın gerçek tepesi -0.690 dBTP (sınır -1 + 0,1)
  panicked: 48000 Hz: gerçek tepe -0.690 dBTP > −0,9 dBTP
  ```
- Kanıt 2 (bağımsız hesap, kesin referans: tam sayıda periyotlu sinyalin FFT ile ara değeri): `hesap/TST/kirpilmis_48k.py`
  ```
  44100 Hz, 9000 Hz × 1.6 kırpılmış: kesin +2.543 dBTP, sınırlayıcının gördüğü +2.480 dBTP, kaçırma 0.063 dB
  48000 Hz, 9000 Hz × 1.6 kırpılmış: kesin +2.445 dBTP, sınırlayıcının gördüğü +2.130 dBTP, kaçırma 0.315 dB
  48000 Hz, 9000 Hz × 1.3 kırpılmış: kesin +1.741 dBTP, sınırlayıcının gördüğü +1.528 dBTP, kaçırma 0.213 dB
  ```
  Belgedeki 44,1 kHz sayıları (0,04 ve 0,06 dB) bağımsız hesabımla tutuyor (`iddia_crossfeed_limiter.out`); sorun
  yalnızca başka hızda. Neden: 16 katsayılı Blackman sinc'in geçirme bandı Nyquist'e yakın düşüyor; 48 kHz'te
  kırpılmış 9 kHz'in Nyquist'e katlanan harmonikleri (ör. 21 kHz) bu bölgeye denk geliyor.
- Kullanıcıya ulaşma yolu: Windows'ta paylaşımlı modun en yaygın hızı 48 kHz'tir; yüksek basılmış (kırpılmış) bir
  pop şarkı + eşitleme kapalı ya da ekolayzer yükseltmesi → sınırlayıcı devrede, çıkış −0,69 dBTP.
- Etki: 0 dBFS aşılmıyor (cızırtı yok); ama "EBU R128 tavanı −1 dBTP" vaadi 48 kHz'te 0,3 dB tutmuyor ve bunu
  denetleyen test yok. Belge–kod sayısal uyumsuzluğu.
- Önerilen düzeltme: ara değerleyiciyi uzatmak (faz başına 24–32 katsayı ya da Kaiser penceresi) **ya da** tavanı
  ölçülen en kötü kaçırma kadar içeriden hedeflemek; belgeyi hızlara göre yazmak. Kilit test: projenin
  `kirpilmis_yuksek_frekans_tavani_asmaz` ve `ornekler_arasi_tepe_tavani_asmaz` testlerini
  `for rate in [44_100, 48_000, 88_200, 96_000, 192_000]` ve birkaç kırpılmış frekans (7–11 kHz) üzerinde döngüye
  almak (TST01 bunun ilk adımıdır).

### [TST-02] Parametrik EQ'nun "en büyük yükseltme" taraması dar bantlarda tepeyi 5 dB'e kadar kaçırıyor; belgedeki "Q = 3'te 0,05 dB" de tutmuyor

- Önem: **Orta** | Güven: kesin (testle ve hesapla kanıtlandı)
- Yer: `src-tauri/src/audio/peq.rs:69-71` (iddia), `peq.rs:424-438` (`coefs_peak_db`: oktavda 48 sabit nokta),
  kullananlar `peq.rs:405-410` (`reference_peak_db` → `boost_db`, profil ön kazancı `sanitized`) ve `peq.rs:1007-1012`
  (ses yolunda profil ön kazancı). Sınırlar: `MAX_Q = 30` (peq.rs:50), `PARAMETRIC_MAX_GAIN_DB = 24` (peq.rs:572).
- İddia: "Tepe … oktavda 48 noktayla taranır: dar (Q = 3) bir tepe bile 0,05 dB içinde bulunur." ve peq.rs:30-31
  "düzeltme hiçbir hızda taşırmaz".
- Kanıt (Rust, `tst02_dar_tepe_korumaya_eksik_bildirilmez`, merkez 1896,7 Hz, gerçek tepe 0,01 Hz adımla):
  ```
  TST02 Q= 3.0  +6.0 dB Rbj: gerçek tepe +6.000, bildirilen +5.991, eksik 0.009 dB
  TST02 Q= 3.0 +24.0 dB Rbj: gerçek tepe +24.000, bildirilen +23.909, eksik 0.091 dB
  TST02 Q=10.0 +24.0 dB Rbj: gerçek tepe +24.000, bildirilen +23.083, eksik 0.917 dB
  TST02 Q=30.0 +24.0 dB Rbj: gerçek tepe +24.000, bildirilen +19.088, eksik 4.912 dB
  TST02 Q=30.0 +24.0 dB Matched: gerçek tepe +24.000, bildirilen +19.159, eksik 4.841 dB
  ```
  Bağımsız Python hesabı (`hesap/TST/tepe_tarama.py`, 2001 merkez frekansı): Q=3/+24 dB 0,129 dB; Q=10/+24 dB
  1,25 dB; Q=30/+6 dB 1,00 dB; Q=30/+24 dB 5,99 dB eksik.
- Kullanıcıya ulaşma yolu: (1) Parametrik ekolayzerde fare tekerleğiyle Q'yu daraltıp (sınır 30) bir bandı
  yükseltmek; (2) REW/Equalizer APO'dan yüksek Q'lu (REW oda düzeltmesinde Q 5–15 olağan) bir dosya yüklemek —
  hem parametrik EQ'ya hem kulaklık profiline.
- Etki: Korumaya (`Leveler`) eksik yükseltme bildirilir; kulaklık profilinde ön kazanç tepeyi karşılamaz. Son
  aşamadaki gerçek tepe sınırlayıcı taşmayı yine yakalar (cızırtı yok), ama "boşluk yönetimi" yerine o frekansta
  sınırlayıcı çalışır (kazanç pompalaması) ve "düzeltme hiçbir hızda taşırmaz" iddiası tutmaz.
- Önerilen düzeltme (küçük): tarama noktalarına her süzgecin kendi `freq_hz`'ini (tepe/çentik/bant merkezi) eklemek
  ya da bulunan en büyük noktanın iki komşusu arasında altın oran/parabol ile inceltmek. Kilit test: TST02 (Q 0,3–30,
  kazanç ±24, 44,1/48 kHz; eşik 0,05 dB).

### [TST-03] "Çizilen eğri duyulan eğridir" iddiası testsiz ve 44,1/48 kHz'te tutmuyor (RBJ'de 2,65 dB)

- Önem: **Orta** | Güven: kesin (testle kanıtlandı)
- Yer: `peq.rs:619` ve MIMARI.md:57-58 (iddia); `peq.rs:65` (`ANALYSIS_RATE = 96_000.0`), `peq.rs:821-833`
  (`response_curve`: ekrandaki eğri 96 kHz tasarımından); ses yolunda tasarım aygıtın hızında (`peq.rs:987-1003`).
  `from_profile` (peq.rs:714-732) Equalizer APO dosyasından gelen ayarı RBJ yapar.
- Projenin testi `parametrik_egri_tasarlanan_sesle_ayni` (peq.rs:1741-1785) işlemciyi `settings.response_db(…, 48_000.0)`
  ile karşılaştırıyor, **ekrandaki** `state.curve_db` ile değil: iddiayı ölçmüyor.
- Kanıt (`tst03_cizilen_egri_duyulan_egriyle_ayni`; PK 1 kHz +6/Q1, HSC 10 kHz +6/Q0,7, PK 16 kHz +6/Q2):
  ```
  TST03 Matched 44100 Hz: çizilen − duyulan en büyük fark 0.58 dB (12619 Hz'te)
  TST03 Matched 48000 Hz: çizilen − duyulan en büyük fark 0.41 dB (12619 Hz'te)
  TST03 Rbj 44100 Hz: çizilen − duyulan en büyük fark 2.65 dB (18346 Hz'te)
  TST03 Rbj 48000 Hz: çizilen − duyulan en büyük fark 2.07 dB (18881 Hz'te)
  ```
- Kullanıcıya ulaşma yolu: AutoEq/APO dosyasını parametrik ekolayzere yüklemek (tasarım RBJ olur) ya da "Equalizer
  APO ile aynı" tasarımını seçmek; 44,1 kHz'lik bir CD albümü çalmak (aygıt 44,1 kHz'te açıksa) ya da 48 kHz aygıt.
- Etki: Ekranda görülen tiz eğrisi duyulandan 2–2,7 dB farklı; kullanıcı eğriye bakarak ayar yapıyor. DOGRULAMA C5
  sahibine "eğri duyduğunuzu gösterir" diye denetletiyor; bu kulakla doğrulanamaz.
- Önerilen düzeltme: eğriyi çalan aygıtın hızında hesaplamak (oynatıcı hızı biliyor; yoksa 48 kHz) ya da belgeyi
  "eşlenmiş tasarımda ±0,6 dB içinde" diye düzeltmek. Kilit test: TST03 (eşik iddiaya göre seçilir).

### [TST-04] A/B telafisi ve korumaya yükseltme bildirimi oynatıcı katmanında testsiz: iki elle mutasyon bütün testlerden kaçıyor

- Önem: **Orta** | Güven: kesin (elle mutasyonla kanıtlandı)
- Yer: `src-tauri/src/audio/player.rs:1328-1352` (`set_parametric`, `apply_parametric_compare`)
- İddia (MIMARI.md:59-61, ROADMAP Faz 3): A/B "eşit yükseklikte", "en büyük yükseltme taşma korumasına bildirilir".
  MIMARI kural tablosu bunları `audio::peq` testlerine bağlıyor; o testler `PeqControl::set_filters/set_compare`'i elle
  doğru değerle çağırıyor, oynatıcının çağırıp çağırmadığını ölçmüyor.
- Kanıt (`hesap/TST/elle_rust_mutasyon.out`; kod değiştirildi, `cargo test --lib` çalıştırıldı, kod geri alındı; `git diff` temiz):
  ```
  M1 player.rs:1351  self.parametric.loudness_db()  →  -self.parametric.loudness_db()
     test result: ok. 409 passed; 0 failed; 3 ignored
  M2 player.rs:1333  settings.boost_db()  →  0.0
     test result: ok. 409 passed; 0 failed; 3 ignored
  ```
- Kullanıcıya ulaşma yolu: gelecekteki bir değişiklikte işaret ya da bağlantı bozulursa A/B'de ekolayzersiz taraf
  2 × telafi kadar (geniş bir +6 dB ayarda ~12 dB) yanlış seviyede çalar ve hiçbir test kırmızı yanmaz; ekran testi
  (`components.test.tsx`) sahte çekirdekle çalıştığı için bunu göremez.
- Önerilen düzeltme: `hesap/TST/player_oneri_testi.rs`'teki oynatıcı testi (boost'un kanala ulaştığını ve karşılaştırma
  kazancının `+loudness_db` olduğunu ses yolu işlemcisiyle ölçer). Test yazıldı; süre sınırı nedeniyle M1/M2 üzerinde çalıştırılıp kırmızı yandığı **gösterilemedi** (bölüm 6). Mantığı: M1'de karşılaştırma kazancı `10^(−L/20)` olur ve `expected` ile tutmaz; M2'de `boost_db()` 0 olur ve ilk assert düşer.

### [TST-05] Kararsız test: bileşen testlerinden biri 5 sn zaman aşımının %95–99'unda bitiyor; yük altında 23 test kırmızı

- Önem: **Orta** | Güven: kesin (5 tekrar + yük altında çalıştırma)
- Yer: `src/components/components.test.tsx:2291-2294` ("şarkı boyunca durmadan işaretlerken de ara ara kaydeder",
  gerçek zamanlı `tapBeats(16, 250)`), `vite.config.ts` (`testTimeout` ayarı yok → 5000 ms)
- Kanıt: `hesap/TST/kararlilik_vitest.out` (4 çekirdek, 5 tur, hepsi yeşil):
  ```
  tur 1: 4750 ms  … şarkı boyunca durmadan işaretlerken de ara ara kaydeder
  tur 2: 4861 ms   tur 3: 4801 ms   tur 4: 4958 ms   tur 5: 4754 ms
  ```
  Makine Rust derlemesiyle yüklüyken ilk `npm test` (`kapilar/npm_test.log`): `Tests 23 failed | 286 passed`,
  19'u "Test timed out in 5000ms", hepsi `components.test.tsx`; aynı kod yük azken `309 passed`.
- Kullanıcıya ulaşma yolu: CI'da (GitHub'ın 2–4 çekirdekli makineleri) rastgele kırmızı → "CI yeşil olmadan
  birleştirme yok" kuralı yüzünden boşuna yeniden çalıştırma ya da testin gevşetilmesi baskısı.
- CLAUDE.md'ye aykırılık: testler belirlenimci olmalı (zamanlama bağımlılığı yok).
- Önerilen düzeltme: bu testte `vi.useFakeTimers()` ile zamanı ilerletmek; olmuyorsa teste açık zaman aşımı
  (`it(…, 15_000)`) vermek. Kilit: vitest `--reporter=verbose` süresinin < 1 sn olduğunu gösteren bir koşu.

### [TST-06] Belgedeki doğruluk sayıları ve "hiçbir ayarda RBJ'den uzak değil" testle kilitli değil; gerçek en kötü fark +0,74 dB

- Önem: **Düşük** | Güven: kesin (testle ve tablo çalıştırılarak)
- Yer: `biquad.rs:953-982` (`dogruluk_tablosu`: `#[ignore]`, yalnızca `println!`), `biquad.rs:888-899`
  (`e_m <= e_r + 1.0` ve `avg_m < avg_r * 0.7`); iddia ROADMAP.md:122-123, MIMARI.md:53-56, biquad.rs:34.
- Kanıt: Tablo bugün belgeyle aynı (`hesap/TST/dogruluk_tablosu.out`: 44,1 kHz tepe 0,696 → 0,157, alçak geçiren
  3,972 → 0,161, bant geçiren 4,059 → 0,328) — sayılar doğru, ama hiçbir assert onları korumuyor: test ortalamada
  yalnızca %30 iyileşme ister (belgede %77–96). "Hiçbir ayarda RBJ'den uzak değil" 1 dB payla denetleniyor;
  `tst04_eslenmis_hicbir_ayarda_rbj_den_uzak_degil`:
  ```
  TST04 18676 ayarın 3 tanesinde eşlenmiş RBJ'den 0,05 dB'den fazla uzak; en kötü +0.739 dB:
        Spec { kind: LowShelf, freq_hz: 6324.6, gain_db: 18.0, q: 8.0 } @ 48000: eşlenmiş 7.10, RBJ 6.36
  ```
  (Seçim kaba ızgarada yapılıyor, ölçüm sık ızgarada: uç ayarda eşlenmiş aday RBJ'den biraz kötü kalabiliyor.)
- Etki: Bugün kullanıcıya yansıyan bir hata değil (uç ayar, 0,74 dB); ama ileride doğruluğu düşüren bir değişiklik
  belgedeki sayıları bozarsa test yeşil kalır.
- Önerilen düzeltme: tablo testini assert'li yapmak (ör. 44,1 kHz'te tepe ortalaması ≤ 0,20 dB, alçak geçiren
  ≤ 0,20 dB) ve iddiayı "0,8 dB'den fazla uzak değil" diye yazmak ya da seçimdeki ızgarayı sıklaştırmak.

### [TST-07] Faz 3 belgelerinde testsiz kalan ölçülebilir iddialar

- Önem: **Düşük** | Güven: kesin (test aramasıyla ve hesapla)
- (a) crossfeed.rs:28-29 / MIMARI.md:71-72 "tam ölçekli geniş gürültüde ~1,6 dB": testi yok ve tanımsız. Bağımsız
  hesap (`iddia_crossfeed_limiter.out`, 48 kHz, 10 sn, 5 tohum): bağımsız düzgün gürültüde Hafif +1,26, Orta +1,78,
  Güçlü +2,03, Hoparlör gibi +2,50 dB; ters fazlı gürültüde Orta +2,26 dB. "Orta: +4 dB" sınırı doğru (+3,94/+3,98 dB),
  ama "Hoparlör gibi"de sınır **+5,19 dB** — belgede yazmıyor.
- (b) MIMARI.md:62 "Görseller (spektrum) parametrik ekolayzeri de yansıtır" (`player.rs:1615-1627`): görsel testi
  `gorseller_ekolayzer_yukseltmesini_duyuldugu_gibi_gosterir` parametrik EQ'yu hiç kurmuyor (dosyada "parametric"
  geçmiyor).
- (c) ROADMAP Faz 3 "bütün ses yolu … en fazla −140 dB bozulma ve gürültü": `ses_yolu_bozulma_ve_gurultu_eklemez`
  parametrik EQ'yu kapalı bırakıyor (`parametric: Arc::default()`, render.rs:788). Kapsam testi
  `tst05_ses_yolu_parametrik_ekolayzer_aciktayken_de_temiz` ile ölçtüm: −151,1 / −154,5 / −151,3 / −152,2 dB
  (100 Hz/1/3/10 kHz) — **iddia tutuyor**, yalnızca test kapsamı eksik.
- (d) ROADMAP "tekerlek Q", "Shift ince ayar" (sürüklemede): bileşen testlerinde `wheel` olayı hiç yok; Shift
  yalnızca klavyede sınanıyor.
- (e) crossfeed "kulaklar arası seviye ve zaman farkı hedefte" yalnızca bir ayarda (700 Hz/6 dB, 48 kHz) ölçülüyor;
  dört hazır ayarın zaman farkları (245/227/227/279 µs) formülle tutuyor.
- Önerilen düzeltme: her biri için tek bir test; (c) için TST05 doğrudan alınabilir.

### [TST-08] Arayüzdeki önizleme formüllerinde iki gerçek test boşluğu; çekirdekle kopya sabitler kilitli değil

- Önem: **Düşük** | Güven: kesin (elle mutasyonla)
- Yer: `src/lib/parametric.ts:191-195` (yüksek raf paydası), `src/lib/crossfeed.ts:63-65` (ρ'nun kesim frekansı),
  `parametric.ts:8` (`PEQ_LIMITS`), `crossfeed.ts:5-10` (`CROSSFEED_LIMITS`)
- Kanıt: `hesap/TST/ts_mutasyon.tsv` — P10 (`[a, 0]` → `one`: yüksek raf önizlemesi alçak frekansta 0 dB yerine
  kazancın yarısını çizer) ve X12 (`x = hz / (2·fc)`: sürüklerken çizilen crossfeed eğrisi bir oktav kayar) bütün
  testlerden kaçtı. Sürgü sürüklenirken ekranda **bu** formül çiziliyor (crossfeed.ts:80-85, MIMARI.md:73-74).
  Önerdiğim iki test (`hesap/TST/denetim_tst.test.ts.txt`) mutasyonsuz kodda yeşil, iki mutantı da yakalıyor
  (`ts_oneri_dogrula.out`: `P10 YAKALANDI`, `X12 YAKALANDI`).
- Ayrıca P16 (`maxBands 20→16`) ve X04 (`minLevelDb 1→0,5`) kaçtı: çekirdekle elle eşitlenen sabitlerin, crossfeed
  hazır ayarlarında olduğu gibi (`crossfeed.test.ts:62-77`), çekirdek kaynağından okunarak karşılaştırılması yok.

### [TST-09] DOGRULAMA.md'nin Faz 3 maddeleri sahibine tam uygulanabilir değil

- Önem: **Düşük** | Güven: kesin (belge okuması)
- Yer: `docs/DOGRULAMA.md:14`, `:236-262`, `:409-422`
- (a) Satır 14: "sürüm **0.0.46 ya da sonrası** yazmalı" — C5 0.0.53, C6 0.0.54 ister; 0.0.46–0.0.52 kurulu bir
  sahip C5/C6'yı bulamaz.
- (b) C5 "Dosyaya kaydet ile kaydedilen dosya Equalizer APO'da aynı duyulur": Equalizer APO'nun kurulması, aygıt
  seçimi ve karşılaştırmanın nasıl yapılacağı yazmıyor; yazılımcı olmayan sahip için uygulanamaz. "Eğri duyduğunuzu
  gösterir" kulakla doğrulanamaz (ve TST-03'e göre RBJ'de doğru değil).
- (c) C6'da kalıcılık (programı kapatıp açınca), "Gelişmiş" sürgüleri ve bit-perfect'te devre dışı görünme maddesi
  yok (C5'te kalıcılık var).
- (d) "Bildirdikleriniz" tablosunda C5/C6 sonucu yok; ROADMAP'te iki madde [x] işaretli ama gerçek cihazda
  doğrulanmamış (doğrulama haftası 22 Ekim'de kapandı).
- Önerilen düzeltme: sürüm satırını "en son test sürümü" yapmak; C5'ten APO karşılaştırmasını çıkarmak ya da adım
  adım yazmak; C6'ya kalıcılık ve gelişmiş ayar adımı eklemek; ROADMAP'te "gerçek cihazda doğrulanmadı" notu.

## 4. Şüpheler (kanıtlanamayanlar, güven "olası")

- `PeqControl::design` (peq.rs:967-1016) eşlenmiş tasarımı ses iş parçacığında, ayar her değiştiğinde 20 süzgeç ×
  birkaç aday × ~74 noktalı ızgara + 48 nokta/oktav tepe taraması olarak yapıyor. Bellek ayırmıyor (test kapsıyor);
  ama bir doldurma turundaki süresi ölçülmüyor. Sürükleme sırasında art arda ayar gelirken tur süresinin aşılıp
  aşılmadığı denetlenemedi (gerçek zamanlı alan denetçisinin konusu).
- `PeqControl`'da ayar alanları `Relaxed` yazılıp sürüm `Release` ile artırılıyor; okuyucu iki yazım arasına denk
  gelirse yırtık (yarı eski, yarı yeni) bir süzgeç takımını bir tur kullanabilir; bir sonraki sürümle düzelir.
  Kanıt testi yazılmadı.
- `limiter.rs:14-16`'daki "BS.1770'in 4×/12 katsayılı süzgeci 0,17 dB kaçırır": hesabımda fs/4 sinüste 0,077 dB çıktı
  (0,17 dB ideal 16 noktalı ızgaranın kuramsal sınırıdır). Katsayı tablosunu bellekten yazdığım için bu sayıyı
  bulgu yapmadım.

## 5. Güçlü yanlar (kanıtla)

- **Kapılar temiz:** fmt, clippy (Linux ve Windows hedefi, `-D warnings`), 409 Rust testi, 309 arayüz testi, lint, tür,
  biçim, komut sözleşmesi (53/53), lisanslar (242 npm paketi; cargo-deny licenses/bans/sources ve advisories), ses
  dosyası, bildirimler, sahneler (Chromium'da) — hepsi 0 çıkış kodu (`kapilar.tsv`). `cargo test` sonrası
  `git status -- src/lib/bindings` temiz: üretilen tipler depodakiyle aynı.
- **Ses yolu bellek testi gerçekten kapsamlı:** `ses_yolu_bellek_ayirmaz` (render.rs:410-592) Faz 3'ün bütün yeni
  işlemlerini (eşlenmiş + RBJ parametrik EQ yeniden tasarımı, A/B aç/kapa, crossfeed ayar değişimi/kapanma/açılma,
  bit-perfect yolu) çalarken ölçüyor; CLAUDE.md kuralına tam uyum.
- **Belgedeki sayılar büyük ölçüde doğru:** crossfeed "Orta +4 dB" (+3,94/+3,98), zaman farkları (227/279 µs),
  sınırlayıcının 44,1 kHz kaçırma payları (0,040/0,062 dB), süzgeç doğruluk tablosu (bütün satırlar) bağımsız
  hesabımla tuttu; yol gürültüsü parametrik EQ açıkken de ≤ −151 dB.
- **Belirlenimcilik (Rust):** zamanlamaya bağlı `audio::player` (41 test) ve `analysis::background`/`audio::abx`/
  `library::service` (31 test) 5'er kez, başka işlerle yüklü makinede, hep yeşil (`kararlilik_player.out`).
- **Testler sayıyı iddiayla aynı eşikte ölçüyor:** `MAX_PATH_NOISE_DB = 140` (iddia −140 dB), `MIN_ALIAS_REJECTION_DB
= 140`, `tipik_ayarlarda_…` 2,5 dB / 0,3 dB (belgeyle aynı), crossfeed `|G|² ≤ 1 + 1e-12`.

## 6. Denetlenemeyenler ve sınırlar

- **Rust mutasyon testi yarım kaldı** (koordinatörün süre sınırı): 304 planlı mutantın (crossfeed 162 + limiter 142)
  83'ü denendi. `limiter.rs` (142 mutant), `biquad.rs` (1129 mutant listelendi; 81'i `Biquad::shape` dönüş değeri
  bileşimleri), `peq.rs` test dışı kod (299), `render.rs` (43) ve `crossfeed.rs` satır 223 sonrası (işlemci,
  `CrossfeedControl`, çapraz geçiş) **mutasyonla denetlenemedi**. Bu dosyaların test etkinliği yalnızca iddia–kanıt
  incelemesi, kanıt testleri ve elle mutasyonlarla değerlendirildi. Sürdürmek için:
  `cd src-tauri && cargo mutants --in-place --iterate -f src/audio/crossfeed.rs -f src/audio/limiter.rs -C --lib -o <klasör> -- -- audio:: settings::`
  (mutant başına ~40 sn; kalan 221 mutant ≈ 2,5 saat; biquad için `--shard k/n --sharding round-robin` önerilir).
- TST-04 için önerilen oynatıcı testi (`hesap/TST/player_oneri_testi.rs`) yazıldı ama süre sınırı nedeniyle
  çalıştırılmadı; iki elle mutantın kaçtığı ise kesin olarak ölçüldü.
- `npm run check:scenes` ilk denemede ortamdaki Playwright tarayıcı sürümü uyuşmadığı için açılamadı
  (`chromium_headless_shell-1243` yok); `SCENE_BROWSER_PATH=/opt/pw-browsers/chromium` ile geçti. Ürün bulgusu değil.
- Gerçek ses aygıtı (WASAPI) ve Windows CI çalıştırılamadı; Windows'a özel kod yalnızca Clippy ile denetlendi.
- Disk bir ara doldu (paylaşılan makine); mutasyon koşusu bir kez yarıda kaldı, `--iterate` ile sürdürüldü
  (yakalananlar yeniden denenmedi; sayılar iki koşunun birleşimidir).

## 7. Önerilen öncelik sırası

1. TST-04 — oynatıcı katmanı testi (yazılı, tek test; ileride A/B'nin sessizce bozulmasını önler).
2. TST-02 — tepe taramasına süzgeç merkezlerini eklemek + TST02 testi (küçük değişiklik).
3. TST-01 — sınırlayıcı testlerini bütün hızlara yaymak; ara değerleyiciyi uzatmak ya da belgeyi düzeltmek.
4. TST-05 — kararsız bileşen testini sahte zamanlayıcıya almak.
5. TST-03 — eğriyi çalan hızda çizmek ya da belgeyi düzeltmek.
6. TST-08, TST-06, TST-07 — eksik/gevşek testler (çoğu tek satırlık assert).
7. TST-09 — DOGRULAMA.md düzeltmeleri.

## Ek A. İddia–kanıt matrisi (Faz 3)

Durum: **kanıtlı** = test iddiayı aynı eşikle ölçüyor; **gevşek** = test var ama eşik iddiadan gevşek ya da yanlış
şeyi ölçüyor; **testsiz** = assert eden test yok; **tutmuyor** = kanıt testim kırmızı.

| #   | İddia (yer)                                                                                                         | Doğrulayan test                                                                     | Ölçtüğü / eşik                                                               | Durum                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | Sekiz süzgeç türü (ROADMAP:121, MIMARI:49)                                                                          | `biquad::eslenmis_…`, `rbj_equalizer_apo_ile_ayni`                                  | 8 türün hepsi                                                                | kanıtlı                                                |
| 2   | 44,1 kHz ortalama sapma tepe 0,70→0,16, LP 3,97→0,16, raflar ~0,6→~0,2, BP 4,06→0,33 dB (ROADMAP:122, MIMARI:55-56) | `dogruluk_tablosu` (`#[ignore]`, yalnız yazdırır); `eslenmis_…` `avg_m < 0,7·avg_r` | sayılar doğru (çalıştırdım), assert yok                                      | gevşek (TST-06)                                        |
| 3   | Eşlenmiş "hiçbir ayarda RBJ'den uzak değil" (ROADMAP:123, MIMARI:54, biquad.rs:34)                                  | `eslenmis_…` `e_m <= e_r + 1.0`                                                     | 1 dB pay; gerçek en kötü +0,74 dB                                            | tutmuyor (küçük, TST-06)                               |
| 4   | Tipik ayarlarda en kötü ~2,5 dB, ortalama < 0,3 dB (biquad.rs:905-907)                                              | `tipik_ayarlarda_…`                                                                 | 2,5 / 0,3                                                                    | kanıtlı                                                |
| 5   | Eşlenmiş kararlı, en küçük fazlı (MIMARI:248)                                                                       | `eslenmis_…`                                                                        | her ayarda                                                                   | kanıtlı                                                |
| 6   | APO anlamları: LS/HS köşe, S=0,9, eğim, BW Oct, LP/HP/BP Q 0,707, NO 30 (ROADMAP:123-124, MIMARI:75-77)             | `peq::apo_…` (4 test)                                                               | yazarın formülleriyle (gerçek APO çıktısıyla değil)                          | kanıtlı (bağımsız referans yok)                        |
| 7   | Profil ön kazancı 44,1/48 kHz'te taşırmaz; ses yolu çalan hızda sınırlar (peq.rs:27-32)                             | `on_kazanc_siniri_…`, `ses_yolu_on_kazanci_…`                                       | Q ≤ 3 profillerle                                                            | gevşek: yüksek Q'da tutmuyor (TST-02)                  |
| 8   | Tepe taraması Q=3'te 0,05 dB (peq.rs:69-71)                                                                         | yok                                                                                 | —                                                                            | tutmuyor (TST-02)                                      |
| 9   | Parametrik: en çok 20 bant, varsayılan eşlenmiş (MIMARI:57-58)                                                      | `parametrik_ayar_sinirlara_…`, `parametrik_varsayilan_…`                            | evet                                                                         | kanıtlı                                                |
| 10  | "Çizilen eğri duyulan eğridir" (MIMARI:58, peq.rs:619)                                                              | `parametrik_egri_tasarlanan_sesle_ayni`                                             | işlemciyi 48 kHz tasarımıyla karşılaştırıyor, ekrandaki 96 kHz eğriyle değil | tutmuyor (TST-03)                                      |
| 11  | 30 ms çapraz geçiş, tık yok (MIMARI:59, 68)                                                                         | `profil_degisirken_ani_sicrama_olmaz`, `ayar_degisirken_ani_sicrama_olmaz`          | örnekler arası adım < 0,02 / 0,015 (süre ölçülmüyor)                         | gevşek (süre testsiz)                                  |
| 12  | A/B filtresiz ve eşit yükseklikte (MIMARI:60-61)                                                                    | `karsilastirma_…`, `ses_yuksekligi_telafisi_…`                                      | çekirdek birimi doğru; oynatıcı bağlantısı testsiz                           | gevşek (TST-04)                                        |
| 13  | Parametrik yükseltme korumaya bildirilir, ikinci kez kısılmaz (MIMARI:252)                                          | `bildirilen_yukseltme_…`                                                            | birim doğru; `Player::set_parametric` testsiz                                | gevşek (TST-04)                                        |
| 14  | Parametrik EQ APO dosyasıyla gidip gelir (MIMARI:251)                                                               | `parametrik_apo_ile_gidip_gelir`                                                    | 0,006 Hz/dB, 1e-4 Q                                                          | kanıtlı                                                |
| 15  | Görseller parametrik EQ'yu yansıtır (MIMARI:62)                                                                     | yok                                                                                 | —                                                                            | testsiz (TST-07b)                                      |
| 16  | Crossfeed orta ses bit bit aynı (ROADMAP:139, MIMARI:64)                                                            | `ortadaki_ses_bit_bit_ayni`, render `crossfeed_ses_yolunda_…`                       | 4 hazır ayar, tüm yol                                                        | kanıtlı                                                |
| 17  | Yan kanal hiçbir frekansta yükselmez (ROADMAP:139)                                                                  | `yan_suzgec_hicbir_frekansi_yukseltmez`                                             | 4 hız × 3 kesim × 4 seviye, 2001 frekans                                     | kanıtlı                                                |
| 18  | Kulaklar arası seviye ve zaman farkı hedefte (ROADMAP:139-140)                                                      | `kulaklar_arasi_…`, `sola_kaydirilmis_…`                                            | yalnız 700 Hz / 6 dB, 48 kHz, %1 / 0,3 dB                                    | gevşek (tek ayar, TST-07e)                             |
| 19  | Örnek tepesi sınırı ‖g‖₁ = 2·b0 − G(1) < 2; Orta +4 dB (MIMARI:70-71)                                               | `ornek_tepesi_siniri_dogru`                                                         | sınır formülü kesin; "+4 dB" sayısı assert değil (hesabım +3,94/+3,98 dB)    | kanıtlı                                                |
| 20  | Geniş gürültüde ~1,6 dB (MIMARI:72, crossfeed.rs:28-29)                                                             | yok                                                                                 | hesabım 1,26–2,50 dB                                                         | testsiz (TST-07a)                                      |
| 21  | Ekrandaki crossfeed eğrisi analog formülle ≤ 0,07 dB (< 5 kHz), ≤ 1,4 dB (crossfeed.ts:82-84)                       | `durum_egrisi_analog_formulle_uyusur` (Rust tarafındaki formülle)                   | eşik aynı; TS formülü yalnız 1 Hz/20 kHz uçlarında                           | gevşek (TST-08)                                        |
| 22  | Kesim 300–1200 Hz, seviye 1–15 dB (ROADMAP:142)                                                                     | `durum_egrileri_ve_ayar_sinirlari`, `crossfeed.test.ts`                             | Rust: yalnız üst kesim ve NaN; TS: alt kesim, üst seviye                     | kanıtlı (iki taraf birlikte)                           |
| 23  | Crossfeed bit-perfect'te atlanır, kapalıyken bit bit aynı, ayar kalıcı                                              | render `crossfeed_ses_yolunda_…`, `kapaliyken_…`, `settings::crossfeed_alani_…`     | evet                                                                         | kanıtlı                                                |
| 24  | Sınırlayıcı −1 dBTP, 8× ara değer, kaçırma 0,04/0,06 dB, tolerans 0,1 dB (limiter.rs:9-16, MIMARI:89-91)            | `ornekler_arasi_…`, `kirpilmis_…`, `tasan_tepeler_…`                                | yalnız 44,1/48 kHz; kırpılmış durum yalnız 44,1 kHz                          | tutmuyor 48 kHz'te (TST-01)                            |
| 25  | Gecikme 1,5 ms; bit-perfect'te yalnız gecikme hattı                                                                 | `gecikme_yaklasik_1_5_ms`, `bit_perfect_kipte_…`                                    | 72/66 kare                                                                   | kanıtlı                                                |
| 26  | Tavanın altındaki ses bit bit aynı                                                                                  | `sinirin_altinda_…`, `tavana_kadar_…`                                               | bit eşitliği                                                                 | kanıtlı                                                |
| 27  | Ses yolu ≤ −140 dB bozulma + gürültü (ölçülen −152) (ROADMAP:167-168, MIMARI:224)                                   | `ses_yolu_bozulma_ve_gurultu_eklemez`                                               | eşik 140 (aynı) ama parametrik EQ kapalı                                     | gevşek kapsam (TST-07c; ölçümüm −151…−154 dB, tutuyor) |
| 28  | Yeniden örneklemede Nyquist üstü ≥ 140 dB                                                                           | `resample` `MIN_ALIAS_REJECTION_DB = 140`                                           | aynı                                                                         | kanıtlı                                                |
| 29  | Ses yolunda bellek ayırma yok (CLAUDE.md, MIMARI:220)                                                               | `ses_yolu_bellek_ayirmaz`                                                           | Faz 3'ün bütün yeni işlemleri dahil                                          | kanıtlı                                                |
| 30  | Elle ayar: sürükleme, çift tıklama, klavye, kutular, A/B, dosya (ROADMAP:126-129)                                   | bileşen testleri (parametrik ekolayzer 4 test)                                      | tekerlek Q ve Shift-sürükleme yok                                            | gevşek (TST-07d)                                       |

**CLAUDE.md test kurallarına uyum.** "Her yeni işlev testleriyle": çekirdek işlevlerde evet; oynatıcı bağlantıları
(TST-04), görsellere yansıma (TST-07b), tekerlek/Shift-sürükleme (TST-07d) testsiz. "Ses yoluna eklenen her işlem
`ses_yolu_bellek_ayirmaz` kapsamında": evet (Faz 3'ün parametrik EQ, A/B, crossfeed, bit-perfect yolları ölçüde).
"Testler belirlenimci": Rust tarafı 5/5 kararlı; arayüzde bir test gerçek zamana bağlı ve zaman aşımı sınırında
(TST-05). Rastgelelik: yalnızca `abx.rs:248` (kör test X seçimi; ürünün gereği, testler bunu kullanmıyor).
