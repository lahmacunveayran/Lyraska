# Sinyal işleme matematiği ve ölçüm doğruluğu — Bağımsız Faz 1 denetim raporu
Denetçi: B-DSP. Kaynak: main @ 94bc3d6 (0.0.56). Tarih: 22–23 Ekim 2026.

## 1. Kapsam ve yöntem

**Denetlenen dosyalar** (toplam 7 497 satır): `src-tauri/src/audio/eq.rs` (1 252; 10 bant grafik ekolayzer),
`biquad.rs` (1 041), `limiter.rs` (468; gerçek tepe sınırlayıcı), `normalize.rs` (789; eşitleme ve koruma),
`loudness.rs` (467; EBU R128 ölçer), `resample.rs` (318; rubato FFT yeniden örnekleyici), `render.rs` (945; ses
yolu, duraklatma geçişi), `src-tauri/src/analysis/spectrogram.rs` (1 575; 60 kare/sn, 32 bant), `analysis/levels.rs`
(206; VU seviyeleri ve 0 VU referansı); arayüzde `src/lib/meter.ts` (88), `vu.ts` (90), `eq.ts` (258). Ayrıca
bağlam için `audio/player.rs`'te dönüştürücü/sınırlayıcı bağlantısı ve `audio/bass.rs`'in bypass koşulu okundu.

**Standartlar:** ITU-R BS.1770-4 (K ağırlığı, kapılama, gerçek tepe Ek 2), EBU R128 ve EBU Tech 3341 (2016)
test sinyalleri, IEC 60268-17 (VU balistiği), RBJ "Audio EQ Cookbook" (süzgeç formülleri).

**Yöntem (kodun kendi testlerine güvenilmedi):** Kaynağın kopyası `calisma/B-DSP/kopya/` altına alındı ve oraya
gerçek Rust kodunu çağıran bir ölçüm koşumu yazıldı: `kopya/src-tauri/tests/dsp_olcum.rs` (9 test; `assert` yok,
yalnızca ham `f64` çıktı ve CSV üretir; `EqProcessor`, `Design`, `Limiter`, `Converter`, `LoudnessMeter`,
`Loudness::gain_db`, `analyze_source`/`Spectrogram::frame_at`/`meters_at`/`vu_reference_db`,
`LevelAccumulator`, `Renderer` doğrudan kullanılır). Bütün ölçümler **kodun dışında, Python 3 + numpy/scipy**
ile yapıldı. Betikler ve kanıt dosyaları `/home/user/denetim-bagimsiz/calisma/B-DSP/` altında:

| Dosya | İş |
| --- | --- |
| `girdi_uret.py` | EBU Tech 3341 durum 1–6, kapı sınır sinyalleri, K-eğrisi sinüsleri, gerçek tepe sinyalleri (59 sinyal, `girdi/`) |
| `olc_eq.py`, `olc_zipper.py` | Dürtü yanıtı FFT'si (2²¹ nokta) ↔ sürgü hedefi; tasarım eğrisiyle tutarlılık; kararlılık; zipper; gürültü tabanı |
| `olc_limiter.py`, `tp_ref.py` | Bağımsız gerçek tepe (FFT tabanlı ideal 32× ara değerleme + 32×1024 Kaiser sinc çapraz denetimi; BS.1770-4 Ek 2'nin 4×/48 katsayılı süzgeci), gecikme, THD+N, pompalama |
| `olc_resample.py` | Dürtü yanıtından frekans/faz yanıtı, basamaklı sinüslerle THD+N ve yansıma, uzunluk ve hizalama |
| `olc_loudness.py` | 3341 durumları, K eğrisi (normatif 48 kHz katsayılarıyla ayrıca doğrulandı), gerçek tepe, eşitleme kazancı |
| `olc_spectrum.py` | Bant sınırları, 160 tonluk tarama → en parlak bant, dB ölçeği, kare zamanlaması, VU RMS/tepe, VU referansı |
| `olc_e2e.py` | Giriş = çıkış (bit bit), duraklat/devam tıkları, devam konumu |
| `olc_vu_balistik.py` | `vu.ts` ibre modelinin IEC 60268-17'ye göre adım yanıtı |
| `*_cikti.txt`, `olcum/` | Betik çıktıları ve ham ölçüm verileri (916 dosya) |

Komutlar: `python3 -I girdi_uret.py`; `cd kopya/src-tauri && CARGO_TARGET_DIR=/home/user/denetim-bagimsiz/target
cargo test --test dsp_olcum` (koşum 72 s); ardından `python3 olc_*.py`. Rapordaki her sayı bu betiklerle yeniden
üretilebilir.

Terimler: **dBTP** = örnekler arası (gerçek) tepe; **LUFS** = algılanan ses yüksekliği birimi; **THD+N** =
bozulma + gürültü; **zipper** = ayar değişirken duyulan cızırtı/tık; **IR** = dürtü yanıtı.

## 2. Genel değerlendirme

**Puan: 8/10.** Ses zincirinin matematiği büyük ölçüde doğru ve ölçülebilir biçimde yüksek kalitede: yeniden
örnekleyici ve ses yüksekliği ölçeri standart sınırlarının çok içinde, ekolayzer kararlı ve iddia edilen doğrulukta,
ses yolu kazanç 1 iken bit bit şeffaf, duraklatma geçişi tıksız. En zayıf yan, "gerçek tepe" ölçümünün kısa ara
değerleyicilerle yapılması: sınırlayıcı −1 dBTP tavanını kırpılmış/geniş bantlı sinyallerde tutmuyor (bağımsız
ölçümle +1,5 dBTP'ye kadar) ve analizdeki tepe ölçer aynı sinyallerde 2,5–3,3 dB eksik okuyor. Bir numaralı risk:
kullanıcı eşitlemeyi kapatıp ekolayzeri düz bıraksa bile sınırlayıcı günümüzün −1 dBTP üstü kayıtlarını değiştiriyor
ve bunu arayüzde hiçbir gösterge söylemiyor; "ekolayzer düzken ses işlenmez" vaadi bu haliyle eksik.

## 3. Bulgular (önem sırasıyla)

### [B-DSP-01] Sınırlayıcı −1 dBTP tavanını kırpılmış / geniş bantlı seste tutmuyor; iç tepe ölçer kısa
- Önem: **Orta** / Güven: **kanıtlandı**
- Yer: `src-tauri/src/audio/limiter.rs:44-45` (`TAPS = 16`, `MAX_PHASES = 8`), `:225-263` (`interpolator`: 96 kHz'te
  4×, 192 kHz'te 2×), `:152-176` (`true_peak`), modül belgesi `:9-16` ("çıkışı −1 dBTP'de tutar … kaçırma payı
  0,04/0,06 dB").
- Kanıt: `olc_limiter.py` (`lim_cikti.txt`). Çıkışın gerçek tepesi, ideal (FFT tabanlı 32×) ara değerleyiciyle;
  karşılaştırma için BS.1770-4 Ek 2'nin 4×/48 katsayılı ölçeri:

  | Sinyal | Hız | Giriş dBTP | **Çıkış dBTP (ideal 32×)** | Çıkış (BS.1770 4×) | Çıkış örnek tepe | En düşük kazanç |
  | --- | --- | --- | --- | --- | --- | --- |
  | fs/4 sinüs 45°, 1,4 | 44,1/48 k | +2,92 | −0,96 | −0,92 | −3,97 | 0,631 |
  | fs/4 sinüs 45°, 1,4 | 96 k | +2,92 | **−0,83** | −0,79 | −3,84 | 0,641 |
  | 0,2·fs kırpılmış sinüs | 96 k | +2,20 | **−0,81** | −1,01 | −3,01 | 0,690 |
  | kırpılmış Gauss gürültü (σ 0,7, ±1) | 44,1/48/96 k | +6,4…+6,5 | **+1,53** | −0,53/−0,36 | −4,1…−4,4 | 0,51 |
  | "modern master" taklidi (−0,3 dBFS kırpık) | 44,1/48/96 k | +1,0…+1,3 | **−0,40 / −0,34 / −0,22** | −0,97/−0,89/−0,93 | −1,4…−1,5 | 0,826 |
  | aynı sinyal −1,5 dBFS | 44,1/48/96 k | −0,19/−0,02/+0,13 | **−0,48 / −0,34 / −0,22** | −0,97/−0,90/−0,93 | −1,55 | 0,949 |
  | 1 kHz 0 dBFS sinüs | hepsi | 0,00 | −1,00 | −0,99 | −1,00 | 0,891 |
  | 0,48·fs sinüs 1,0; kare dalga; darbeler | hepsi | … | −0,98…−1,00 | | | |

  Referans ölçerin doğruluğu bilinen tepeli sinüslerle doğrulandı (`tp_ref.py`: fs/4·1,4 → 2,923 dB; 0,48 fs → 0,000;
  997 Hz −6 dB → −6,020; FFT ve 32×1024 Kaiser sinc birbirinden ≤ 0,001 dB farklı). Kodun kendi `ornekler_arasi_tepe_tavani_asmaz`
  testi 64 katsayılı (8×) pencereli sinc ile yalnızca fs/4 ve kırpılmış 9 kHz sinüsünü 44,1/48 kHz'te sınar; 96 kHz
  ve geniş bantlı kırpılmış ses sınanmaz.
- Etki: Tavanın 1 dB'lik payı sayesinde 0 dBFS'i (DAC kırpmasını) yalnızca aşırı kırpılmış geniş bantlı seste aşar
  (+1,5 dBTP); günümüzün sert basılmış kayıtlarında çıkış −0,2…−0,5 dBTP kalır, yani vaat edilen tavanın 0,5–0,8 dB
  üstü. Pratik zarar küçük; ama "−1 dBTP tavanı" (EBU R128 önerisi) ve belgedeki "0,04 dB kaçırma" iddiası ancak
  BS.1770'in kendi 4× ölçerine göre doğru (o ölçerle bütün durumlar ≤ −0,9 dBTP, kırpılmış gürültü hariç). 96 kHz'te
  4× ara değerleyici sinüslerde bile 0,17–0,2 dB kaçırır.
- Önerilen düzeltme: faz başına 16 yerine 32 katsayı (gecikme 8 kare artar, ≈ 0,2 ms) ve 96 kHz'te de 8×; ya da
  tavanı 0,5 dB pay ile (−1,5 dBTP iç hedef) uygulamak. Belgedeki kaçırma payını ideal ara değerleyiciyle ölçüp
  yeniden yazmak.
- Hatayı yakalayacak test: `kirpilmis_gurultu_tavani_asmaz` — tam ölçekli kırpılmış Gauss gürültü, 44,1/48/96 kHz;
  çıkış gerçek tepesi FFT tabanlı 32× ara değerlemeyle (ya da ≥ 1 024 katsayılı sinc) ≤ −1 + 0,1 dBTP.

### [B-DSP-02] Eşitleme kapalı, ekolayzer düzken bile −1 dBTP üstündeki kayıtlar değiştiriliyor; arayüzde iz yok
- Önem: **Orta** / Güven: **kanıtlandı**
- Yer: `src-tauri/src/audio/render.rs:205-229` (bit-perfect değilse her kare sınırlayıcıdan geçer, `write_frame`
  `:248-253`), `limiter.rs:36` (`CEILING_DBTP = -1.0`), `player.rs:1877-1890` (`SignalPath`'te eşitleme kazancı var,
  sınırlayıcı etkinliği yok), `eq.rs:31` ("Ekolayzer düzken ses hiç işlenmez").
- Kanıt: `olc_e2e.py` (`e2e_cikti.txt`), `RenderControls` varsayılan (ekolayzer düz, eşitleme kapalı, bit-perfect
  kapalı), 16 bite yuvarlanmış müzik taklidi:
  ```
  48000 flat_-1.5dBFS   gecikme 72: bit bit aynı: True
  48000 flat_-0.3dBFS   gecikme 72: bit bit aynı: False; fark RMS -46.5 dBFS; (limiter: kazanç <1 olan kare oranı 100 %)
  ```
  44,1 ve 96 kHz'te aynı (fark −45,3 / −47,4 dBFS). `olc_limiter.py`'de "master_-0.3dBFS" için en düşük kazanç 0,826
  (−1,65 dB), 80 ms geri dönüşle sürekli kazanç sürme.
- Etki: Günümüz pop/rock/elektronik kayıtlarının büyük çoğunluğu −1 dBTP'nin üstünde basılmıştır. Kullanıcı
  "hiçbir işlem" istese bile (eşitleme kapalı, ekolayzer düz) sesi bir sınırlayıcıdan geçer; bu, −14 LUFS
  eşitlemesi açıkken zaten kısıldığı için görünmez, ama eşitleme kapalıyken 1–2 dB'lik kazanç sürme ve pompalama
  (bkz. §4: 10 ms'lik patlamalarda 5,9 dB modülasyon) oluşur. Belge ve kod yorumu ("ses hiç işlenmez") yanıltıcı;
  sinyal yolu göstergesi sınırlayıcının çalıştığını söylemiyor.
- Önerilen düzeltme: (a) eşitleme kapalı ve bütün süzgeçler düzken sınırlayıcıyı yalnızca 0 dBFS'i aşan örneklerde
  devreye sokmak (tavan 0 dBTP ya da yalnızca örnek kırpması), ya da (b) `SignalPath`'e "taşma koruması çalışıyor /
  en fazla −x dB" alanı ekleyip belgeyi düzeltmek. En küçük doğru düzeltme (b).
- Hatayı yakalayacak test: `islem_yokken_ses_aynen_gecer_veya_bildirilir` — eşitleme kapalı, ekolayzer düz,
  −0,3 dBFS'e kırpılmış sinyal: ya çıkış bit bit aynı ya da `SignalPath` sınırlayıcı etkinliğini bildiriyor.

### [B-DSP-03] Spektrumun alt bantları ayrışmıyor: 44,1/48 kHz'te ilk 7 bant tek FFT kutusundan dar
- Önem: **Orta** (görsel kalite; Faz 1 vaadi "32 bant") / Güven: **kanıtlandı**
- Yer: `src-tauri/src/analysis/spectrogram.rs:32` (`BASE_FFT_SIZE = 2048`), `:46-47` (30 Hz – 16 kHz), `:852-863`
  (`BandPick::Interpolate`: kutudan dar bantlar aynı kutulardan doğrusal ara değerle okunur), `:934-940` (`band_edges`).
- Kanıt: `olc_spectrum.py` (`spec_cikti.txt`). Bant oranı 1,2168 (3,4 yarım ton); kutu genişliği 44,1 kHz'te 21,5 Hz,
  48 kHz'te 23,4 Hz; **ilk 7 bant (30–118 Hz) kutudan dar**, Hann ana lobu ±2 kutu (±43–47 Hz). Tarama (160 ton,
  −20 dBFS):
  ```
  48000: ton 40 Hz: 6 dB içinde yanan bantlar [0, 1, 2, 3] (sayı 4)
  48000: ton 62 Hz: 6 dB içinde yanan bantlar [1, 2, 3, 4, 5] (sayı 5)
  48000: ton 124 Hz: 6 dB içinde yanan bantlar [6, 7, 8] (sayı 3);  ton 1000 Hz: [17] (sayı 1)
  ±3 bant dışına sızma: 31 Hz: −17 dB, 62 Hz: −27 dB, 124 Hz: −37 dB, 1 kHz: −45 dB
  ```
  22,05 kHz'te (aynı 2048 pencere = 93 ms, kutu 10,8 Hz) alt uç daha iyi ayrışır (40 Hz: 3 bant).
- Etki: Nokta matris spektrumda 30–120 Hz arası (bas davul, bas gitar: görsellerin en çok "vurduğu" yer) tek
  blok halinde yanıp sönüyor; "32 bant"ın alt beşi görsel olarak aynı bilgiyi taşıyor. Görsel Yönetmen'in
  karelerden türettiği bas ölçütleri de bu çözünürlükle sınırlı.
- Önerilen düzeltme: alt bantlar için ayrı, daha uzun bir pencere (ör. 8192 örnek ≈ 186 ms, yalnızca < 250 Hz;
  çok çözünürlüklü analiz) ya da alt sınırı/oranı bant genişliği ≥ 1 kutu olacak biçimde yeniden bölmek (ör. 30 Hz'ten
  başlayıp ilk bantları ikişer birleştirmek). Bu spektrum sürümünü artırır (bütün önbellek yeniden hesaplanır).
- Hatayı yakalayacak test: `alt_bantlar_ayrisir` — 40 ve 62 Hz tonlarında en parlak bandın 6 dB içinde en çok 2
  komşu bant.

### [B-DSP-04] Bant sınırları FFT kutusuna yuvarlanıyor: bir bandın üst kenarındaki ton bir üst bantta görünüyor
- Önem: **Düşük** / Güven: **kanıtlandı**
- Yer: `spectrogram.rs:859-861` (`start = round(e0/bin_hz)`, `end = round(e1/bin_hz)`).
- Kanıt: `spec_cikti.txt`: 48 kHz'te 147 tonun 19'u, 44,1 kHz'te 9'u, 22,05 kHz'te 14'ü beklenen bandın bir üstünde
  en parlak (ör. 48 kHz, 141,3 Hz: beklenen bant 7 = 118,5–144,2 Hz, bulunan 8; 44,1 kHz, 1 240 Hz: beklenen 18 =
  1 024–1 246 Hz, bulunan 19). Sapma hep bir üst banda ve en çok yarım kutu (≈ 12 Hz).
- Etki: Yalnızca görsel; 1–2 kutu genişliğindeki bantlarda (48 kHz'te 7–12. bantlar) notalar komşu bantta yanar.
- Önerilen düzeltme: bant sınırını kutu merkezine yuvarlamak yerine kutunun enerjisini kesirli sınıra göre iki banda
  paylaştırmak (ya da `floor`/`ceil` ile tutarlı kapsama).
- Hatayı yakalayacak test: tarama testi — her ton için en parlak bant, `band_edges`'in verdiği bant ±0.

### [B-DSP-05] Analizdeki gerçek tepe ölçeri kırpılmış geniş bantlı seste 2,5–3,3 dB, 96 kHz'te fs/4'te 0,6 dB eksik okuyor
- Önem: **Düşük** / Güven: **kanıtlandı**
- Yer: `src-tauri/src/audio/loudness.rs:34` (`TAPS_PER_PHASE = 12`), `:133-140` (96 kHz'te 2×, 192 kHz'te 1× =
  hiç ara değer yok), `normalize.rs:242` (boşluk bu tepeden hesaplanır), `loudness.rs:50-56` (yükseltme sınırı).
- Kanıt: `loud_cikti.txt`:
  ```
  tp_997_-6 (997 Hz −6 dB)   referans −6,00  kod −6,00   (Tech 3341: ±0,2 → geçer)
  tp_fs4_45deg 48 k          referans +3,01  kod +2,93   (±0,4 → geçer);  96 k: kod +2,40 (kaçırma −0,61 dB)
  tp_clipnoise 44,1/48/96 k  referans +6,7/+6,7/+6,9  kod +4,17/+4,17/+3,58  (kaçırma −2,5…−3,3 dB)
  ```
- Etki: Tech 3341'in sinüs temelli tepe testleri geçer; ama kırpılmış kayıtlarda tepe eksik ölçülünce eşitleme
  kısık bir şarkıyı (−20 LUFS gibi) fazla yükseltebilir, boşluk fazla hesaplanır ve iş sınırlayıcıya kalır (o da
  B-DSP-01'deki gibi eksik). 192 kHz'te hiç ara değerleme yok (BS.1770 192 kHz için 1× diyor; kabul edilebilir).
- Önerilen düzeltme: faz başına 24–32 katsayı, 96 kHz'te 4×; analiz iş parçacığında maliyet önemsiz.
- Hatayı yakalayacak test: kırpılmış Gauss gürültüde kodun tepesi ideal 32× referansın en fazla 0,3 dB altında.

### [B-DSP-06] Ekolayzer ayar değişiminde ölçülebilir geniş bantlı geçiş yapıları (zipper)
- Önem: **Düşük** / Güven: **kanıtlandı**
- Yer: `eq.rs:80-85` (2 ms'de bir yeniden tasarım, 40 ms zaman sabiti), `:793-815` (`step`/`redesign`: katsayılar
  süzgeç belleği korunarak değiştirilir).
- Kanıt: `olc_zipper.py`: 100 Hz −6 dBFS sinüs çalarken 2 kHz −12 / 8 kHz +12 ayarı girip çıkarken tonun bandı
  dışındaki (400 Hz üstü) içerik 1 ms RMS olarak en çok **−43,7 dBFS (sinyale göre −37,7 dB)**, olay anlarında
  −66…−69 dBFS; bileşenler 1,1–2,1 kHz (geniş bantlı, tondan türetilemez). Kendi bandı değişen 1 kHz tonda
  (0 → +12 → −12) bant dışı içerik en çok −68 dBFS (−54 dB). Sabit ayarda kalan −250…−280 dBFS (yani yapay tamamen
  ayar değişiminden). Genlik adımları pencereler arası ≤ 0,0 dB (uzak bant) / 5 dB (kendi bandı, beklenen rampa);
  tık yok, cızırtı seviyesi düşük.
- Etki: Sürgü sürüklenirken müziğin 38 dB altında kısa, geniş bantlı bir "hışırtı" izi; kulaklıkla sessiz pasajda
  fark edilebilir, kayıt değildir (ayar bitince kaybolur). "Cızırtı olmasın" hedefi büyük ölçüde sağlanmış.
- Önerilen düzeltme: katsayı güncellemesinde iki süzgeç kümesi arasında 2 ms'lik çapraz geçiş (parametrik EQ'da
  zaten yapılan yöntem) ya da katsayıların kendisini (hedef tasarıma doğru) her örnekte doğrusal ara değerlemek.
- Hatayı yakalayacak test: `ayar_degisirken_bant_disi_icerik_sinirli` — ton bandı dışı 1 ms RMS ≤ sinyal −50 dB.

### [B-DSP-07] Ekolayzer "hepsi +12" bant ortalarında +12,8 dB; kuyruk rafları zikzakta sürgüyü 3 dB aşıyor
- Önem: **Düşük** / Güven: **kanıtlandı**
- Yer: `eq.rs:66-72` (kuyruk rafı sabitleri, `TAIL_LOW_RATIO = 1.8`), `:107-113` (`TUNING`), `:23-25` (iddia: ≤ 1,2 dB).
- Kanıt: `eq_cikti.txt` (48 kHz, dürtü yanıtından):
  ```
  all+12   12.36 12.78 12.78 12.78 12.77 12.77 12.75 12.64 12.44 12.14 | 20 Hz 10.42  20 kHz 11.96
  all+6     6.17  6.37  6.35  6.35  6.35  6.35  6.34  6.31  6.19  6.04
  zigzag   11.70 -12.17 12.05 -11.94 11.99 -11.99 11.99 -12.04 12.21 -11.61 | 20 Hz 13.22  20 kHz -15.01
  single9+12  … 0.17 12.05 | 20 kHz 13.28
  ```
  Bütün hızlarda bant ortası en kötü sapma 0,78–0,80 dB, ara noktalarda 0,90 dB (iddia edilen 1,2 dB içinde);
  sürgü-arası doğrusal eğriye göre en kötü 2,9 dB (22,05 kHz'te 9,75 kHz; 48 kHz zikzakta 19,7 kHz).
- Etki: Sistematik (+0,78 dB bütün sürgüler aynıyken; bu yönde tutarlı olması, en küçük kareler çözümünün uç
  noktalardaki tasarım hedefine ağırlık vermesinden). Kullanıcı farkı duymaz; "sürgü = duyulan eğri" vaadi ±0,8 dB
  doğru. Uç bantların dışına (20 Hz / 20 kHz) taşan raflar zikzak gibi sıra dışı ayarlarda 3 dB abartır.
- Önerilen düzeltme: tasarım hedefine 20 Hz ve 20 kHz noktalarını (uç sürgü değeriyle) eklemek; raf oranlarını buna
  göre yeniden taramak.
- Hatayı yakalayacak test: 20 Hz ve 20 kHz'te yanıt, ilgili uç sürgünün ±1,5 dB içinde (bütün test ayarlarında).

## 4. Doğrulanan güvenceler

**Yeniden örnekleme (`resample.rs`, rubato 5.0.1 FFT, BlackmanHarris2)** — `olc_resample.py`, 6 çift
(44,1↔48, 96→48, 44,1→96, 22,05→48, 192→48):
- Geçirme bandı 20 Hz – 0,97·Nyquist düz: **±0,0000 dB**; 0,99·Nyquist'te −0,10 dB (44,1→48), −0,34 dB (48→44,1);
  96→48'de geçiş bandı 23,3–24 kHz.
- Yansıma / görüntü bastırması: Nyquist_out üstü tonlar çıkışta **−194…−231 dB**; görüntü bandı ≤ −193 dB.
- THD+N basamaklı sinüslerde (48 ton, 20 Hz – 0,499·fs): en kötü **−168,7 dB**, çoğu < −200 dB.
- Faz: doğrusal (sapma ±0,000°); gecikme tam telafili: 1,000 s'deki darbe çıkışta tam 1,000 s'de (enerji merkezi
  ≤ 0,011 ms kayma); parça boyutundan bağımsız (1000 ve 777 kare aynı çıktı).
- Uzunluk: 10, 2048, 2049 ve 1 000 001 karelik girişlerde çıkış tam `round(n·to/from)` (fark 0); eksik/fazla örnek yok.

**Ses yüksekliği (`loudness.rs`)** — `olc_loudness.py`:
- EBU Tech 3341 durum 1–6 (48 kHz) ve 1–2 (44,1, 96 kHz): hepsi **±0,02 LU** içinde (tolerans ±0,1): −22,993,
  −32,993, −23,014 (durum 3), −23,014 (4), −22,979 (5), −23,016 (5.0 kanal, durum 6).
- Mutlak kapı: −69 dBFS → −68,99 LUFS; −71 dBFS → ölçüm yok (doğru). Göreli kapı sınır durumu (60 s −23 + 20 s
  −33,5): kod −24,111, standarda göre beklenen −24,122 (kapı mutlak-kapılı ortalamaya göre; fark 0,01).
- K ağırlığı: 48 kHz'te BS.1770-4 Tablo 1–2'nin normatif katsayılarıyla **≤ 0,001 dB** fark (40 Hz – 20 kHz, 10
  frekans); 44,1 kHz'te 48 kHz'e göre +0,004 dB, 96 kHz'te −0,02 dB (çift doğrusal önbükme doğru).
- Gerçek tepe sinüs testleri (997 Hz −6 dB; fs/4 45° → +3,01): 44,1/48 kHz'te kaçırma ≤ 0,08 dB (Tech 3341
  toleransları ±0,2/±0,4 içinde). Sınırlama: B-DSP-05.
- `Loudness::gain_db` 12 durumda beklenenle birebir (kısma tam, yükseltme −1 dBTP ile sınırlı, 0'ın altına inmez).
- 400 ms'den kısa seste tek blok (−22,99); standart dışı ama zararsız.

**Sınırlayıcı (`limiter.rs`)** — `olc_limiter.py`:
- Gecikme tam `latency_frames` kadar (66 / 72 / 144 kare; darbe değeri 0,5000 aynen).
- Tavanın altındaki ses bit bit aynı (e2e: −1,5 dBFS müzik, üç hızda `True`).
- Kararlı durum 1 kHz 0 dBFS: çıkış tam −1,000 dBFS, THD+N −240 dB (48/96 k), −117,5 dB (44,1 k, kazanç yerleşimi).
- Sinüs, kırpılmış sinüs, kare dalga, 0,48·fs sinüs, darbeler: çıkış gerçek tepesi **−0,96…−1,00 dBTP** (44,1/48 k).
- Kazanç adımları küçük (kare başına ≤ 0,009; tık yok); geri dönüş 1−1/e'ye 80,7 ms (hedef 80 ms); stereo kazanç
  bağlı (taşmayan kanal da aynı kazançla iner, görüntü kaymaz).
- Pompalama: 100 Hz −6 dBFS taşıyıcı + her 500 ms'de 10 ms'lik +2,3 dB patlama → taşıyıcı 5,9 dB modüle olur
  (80 ms geri dönüşlü sınırlayıcı için beklenen davranış; tasarım tercihi, bulgu değil).

**Ekolayzer (`eq.rs`)** — `olc_eq.py` (88 ayar × 5 hız = 440 dürtü yanıtı; 22,05–192 kHz):
- Kararlılık: 440 IR'nin hiçbirinde NaN yok; IR kuyruğu (son %10) tepeye göre ≤ **−532 dB** (bütün kutuplar
  birim çemberin içinde; en uç ayarlarda, Nyquist'e yakın bantlarda, 192 kHz'te de).
- Arayüzde çizilen eğri (`Design::response_db`) ile gerçek IR yanıtı **≤ 0,0013 dB** uyumlu (192 kHz'te 0,02 dB,
  FFT çözünürlüğü).
- Bant ortası sapma ≤ 0,80 dB, ara nokta ≤ 0,90 dB (iddia < 1,2 dB; yumuşak hazır ayarlarda ≤ 0,2 dB: "Bas"
  4,12/3,12/1,09, "Rock" 4,11/4,71/2,62/…). Tek bant +12: komşu bant ortasında ≤ 0,27 dB sızma. 22,05 kHz'te
  16 kHz bandı doğru biçimde yok sayılıyor.
- Gürültü tabanı: −60 dBFS sinüs, "Rock": kalan −300 dBFS (sinüse göre −237 dB); sayısal gürültü yok.
- Sürgü aç/kapa geçişinde (1,5 s / 2,0 s) tık yok; düz olunca işlem gerçekten atlanıyor (kalan −280 dBFS).

**Spektrum ve VU (`spectrogram.rs`, `levels.rs`, `vu.ts`, `meter.ts`)** — `olc_spectrum.py`, `olc_vu_balistik.py`:
- Bant sınırları 30 Hz – 16 kHz logaritmik (3,4 yarım ton/bant), pencere 2048/4096/8192 (süre 43–46 ms hızdan
  bağımsız), Hann; 1 kHz'te tam ölçekli sinüs 0 dB'ye ölçekli; dB ölçeği −66…−6 dB → 0…1 **doğru**: 1 kHz
  −6/−12/−40/−60/−66 dBFS'te hata 48 kHz'te −0,74 dB, 44,1 kHz'te −1,2 dB (Hann kutu arası kaybı), 22,05 kHz'te
  −0,15 dB; 100 Hz'te −2,0 dB (ara değerli okuma). Eğim (+3 dB/oktav, 1 kHz üstü) hesaba uygun.
- 1 kHz üstünde ton doğru banda düşüyor; ±3 bant dışına sızma 1 kHz'te −45, 8 kHz'te −55 dB.
- Kare zamanlaması: 50 ms'lik 1 kHz patlama (2,000–2,050 s) spektrumda 1,988–2,070 s (48 k; pencere yarısı
  kadar simetrik yayılma, 22,05 kHz'te 93 ms pencereyle 1,962–2,095), VU'da (`meters_at`) 2,001–2,050 s: 60 kare/sn
  zamanlaması ve `frame_at`'in pencere-ortası düzeltmesi doğru çalışıyor; hız bağımsız.
- VU RMS/tepe: −30…−3 dBFS sinüs basamaklarında RMS tam dBFS − 3,0, tepe tam dBFS, sağ kanal −6; 0,25 dB
  saklama çözünürlüğü; −60 dBFS tabanı.
- 0 VU referansı: kodun −7,923 dBFS'i, saklanan karelerden Python'da yeniden hesaplanan −7,923 ile birebir, ham
  sinyalden −7,890 (0,25 dB yuvarlama). Hızdan bağımsız (dört hızda −6,79).
- VU balistiği (`vu.ts`, ω = 13,1 rad/s, ζ = 0,8): analitik %99'a varış 300,1 ms, aşma %1,52; kodun 2 ms'lik
  yarı-örtük Euler'i 60 fps'te 317 ms / %1,34 — IEC 60268-17 (300 ms ±10 %, %1–1,5) içinde. Ölçek konumları
  (0 VU = %70,8, +3 VU = %100) gerçek VU ölçeğine uygun; kırmızı lamba 0,5 s tutma → ≤ 2 yanış/sn.
- `meter.ts`: iniş 2,4/s, tepe tutma 0,6 s, düşme 0,8/s; 0,25 s adım sınırı; sayısal sorun yok (kod okuması).

**Uçtan uca (`render.rs`)** — `olc_e2e.py`, 44,1/48/96 kHz stereo:
- Ekolayzer düz (kapalı ya da açık-sıfır), eşitleme kapalı ya da sessiz şarkı, tepe < −1 dBTP: çıkış = giriş
  **bit bit** (gecikme hariç); bit-perfect kipte −0,1 dBFS'te de bit bit; gecikme hattı boşalınca kuyruk tam sessiz.
- Eşitleme −9 LUFS ölçümüyle: ortanca çıkış/giriş tam −5,000 dB (hedef −14).
- Duraklat/devam: kazanç 10 ms'de (ölçülen 9,9 ms) doğrusal iner/çıkar; ardışık örnek adımı sinüsün doğal
  adımının 1,00 katı (tık yok); devam edince ses tam kaldığı yerden (500 ms duraklatma → 490 ms kayma: geçişte
  tüketilen 10 ms doğru); geçiş ortasında devam de tıksız.

## 5. Şüpheler (kanıtlanamayanlar, güven "olası")

- **Sınırlayıcının 44,1 kHz'te kararlı durum THD+N'si −117,5 dB** (48/96 kHz'te −240 dB): 0 dBFS 1 kHz sinüste
  kazancın 44,1 kHz'te tam yerleşmeyip 1 ms periyotla hafifçe salındığına işaret ediyor (1000 Hz / 44 100 tam
  bölünmez, kayan en küçük penceresi 59 kare). −117 dB duyulmaz; yalnızca not.
- **Eşitleme kapalıyken "boşluk 0" varsayımı** (`normalize.rs:220-243`: `headroom_db` yalnızca eşitleme açıkken
  tepeden hesaplanır; kapalıyken 0): ekolayzer +6 dB ile eşitleme kapalı, tepesi −12 dBTP olan sessiz bir kayıt
  bile 6 dB kısılır. Tasarım kararı olabilir; kod akışından okundu, kullanıcı etkisi ölçülmedi.
- **`ASSUMED_LUFS = −10`** (`normalize.rs:25`): ölçüm gelmeden çalan şarkı −4 dB'den başlar; sessiz klasik
  kayıtlarda (−25 LUFS) ilk 1,5 s 15 dB fazla kısık. Faz 1 akışında erken tahmin bunu çoğu zaman önler (SES-04);
  ölçülmedi.

## 6. Denetlenemeyenler ve sınırlar

- WASAPI çıkışı, özel mod tamsayı dönüşümü (`output/wasapi.rs`), gerçek aygıt gecikmesi ve 32-bit f32 paylaşımlı
  çıkışın etkisi Linux'ta çalıştırılamadı (yalnızca kod okuması; ölçüm B-SES/B-SUR kapsamında).
- EBU Tech 3342 (ses yüksekliği aralığı, LRA) ve Tech 3341'in anlık/kısa süreli (M/S) durumları: kod bunları
  hesaplamıyor (Faz 1'de yalnızca bütünleşik LUFS ve dBTP kullanılıyor); uygulanamaz.
- Tech 3341'in gerçek kayıt dosyası (durum 7) ve EBU'nun resmi WAV'ları kullanılmadı (telif/ağ); sinyaller
  belgedeki tanımlardan üretildi.
- Bas motoru, parametrik EQ, crossfeed ve `punch.rs` kapsam dışı (Faz 3); yalnızca bypass koşulları (bas 0 iken
  `is_bypass`) ses yolunun şeffaflığı için doğrulandı.
- Dinleme testi yapılmadı; "duyulur/duyulmaz" yargıları ölçülen seviyelere dayanır.

## 7. Önerilen öncelik sırası

1. **B-DSP-02** — Eşitleme kapalı ve ekolayzer düzken sınırlayıcının davranışını ya kaldırmak (0 dBTP) ya da
   sinyal yolu göstergesinde ve belgede açıkça bildirmek (küçük iş, kullanıcı güveni).
2. **B-DSP-01 + B-DSP-05** — Sınırlayıcı ve analiz tepe ölçerinin ara değerleyicisini uzatmak (32 katsayı, 96 kHz'te
   8×/4×), kırpılmış gürültü testini ideal referansla eklemek; belgedeki "0,04 dB" iddiasını düzeltmek.
3. **B-DSP-03 + B-DSP-04** — Spektrumun alt bantları için çok çözünürlüklü pencere ya da bant bölümlemesi;
   sınırların kutuya yuvarlanmasını düzeltmek (spektrum sürümü artar).
4. **B-DSP-06** — Ekolayzer katsayı güncellemesinde çapraz geçiş (zipper −38 → −50 dB altı).
5. **B-DSP-07** — Tasarım hedefine 20 Hz / 20 kHz noktalarını eklemek (kozmetik doğruluk).
