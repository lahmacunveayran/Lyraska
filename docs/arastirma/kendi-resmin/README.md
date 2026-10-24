# "Kendi resmin" sahnesi: örnek videolardan ters mühendislik

Proje sahibi sahnenin, YouTube'daki yaygın müzik görselleştirme videolarına **birebir** benzemesini
istedi ve üç şikâyet bildirdi: (1) bas çubukları örnekten yumuşak, örnekte ince, bağımsız, tırtıklı
sivri çubuklar var; (2) renk: "arka planda hangi renk baskınsa çubuklar o renk"; kırmızı resimde
kırmızı, açık resimde beyaz; (3) çizginin arkasındaki koyu bant beyaz kanatları griye boyuyor.

Bu klasör tahmin değil ölçüm yapar: üç ekran kaydında (2712×1220, ~24 kare/sn, sesli; 98, 136 ve
158 kare) her karede her çubuğun boyu ölçüldü, kaydın sesiyle hizalandı ve model seçenekleri
ölçümle karşılaştırıldı. Kayıtlar, kareler ve ses telifli olduğu için **depoya girmez**; burada
yalnızca betikler ve sonuçlar var. Kayıtlar: `a` (kırmızı resim, kırmızı çubuklar, 200 çubuk),
`b` ve `c` (aynı açık resimli video, beyaz çubuklar, 220 çubuk).

## Bulgular

### Geometri (`olc.py`, `renk.py isilti`)

- Video alanı kaydın ortasındaki 2168×1220'lik 16:9 bölge. **Çizgi tam ortada** (1220'de 610.
  satır) ve **çubuklar yalnızca aşağı sarkar**: bütün çubukların üst kenarı aynı satırda, yukarı
  uzanan kısım ölçülmedi (eski sürümdeki "yukarıya kısa uç" yanlıştı).
- **Kenardan kenara**: `a`'da 200 çubuk, ortaları `k · W / 199` (aralık 10,894 px; uydurma artığı
  0,63 px); ilk çubuk sol kenarda, son çubuk sağ kenarda. `b`/`c`'de 220 çubuk (aralık 9,90 px).
- Özün yarı yükseklikteki genişliği ~3,5 px (aralığın **%32**'si). Sessizlikte her çubuk ~4 px
  (yüksekliğin %0,33'ü) kısa bir çentik: noktalı taban çizgisi.

### Renk ve ışıltı (`renk.py`)

- `a`'da özün ortası **(254, 226, 230)**: beyaz, ışıltı renginden ~%12 karışmış. Işıltı saf kırmızı:
  koyu kırmızı zeminde (61, 8, 19) yalnızca kırmızı bileşen artıyor, yeşil ve mavi değişmiyor; yani
  ışık **eklenmiş** (saydam boyama olsaydı yeşil/mavi azalırdı). Beyaz tüyün üstünde çubuk beyaz
  görünüyor (eklenecek yer yok).
- Işıltının yatay kesiti, **çubuk aralığı genişliğinde bir dikdörtgenin Gauss bulanıklığı**
  (σ = aralığın 0,6'sı = 6,5 px): model 6 ve 12 px'te 0,425 ve 0,153 veriyor, ölçülen 0,43 ve 0,16.
  Yoğun bas çubuklarının arası bu yüzden tümden kırmızıya boyanıyor.
- `c`'de öz (252, 250, 255), ışıltı beyazımsı ve sönük. Beyaz ışıltının eklediği parlaklık kırmızınınkine
  yakın (oran 0,76): kural "ışıltının bağıl parlaklığı sabit" (beyazda saydamlık 0,21).
- **Baskın renk kuralı** (`renk.py baskin`): her pikselin tonu renkliliğiyle (en büyük − en küçük)
  ağırlıklı bir yön; yönlerin ortalaması baskın tonu, ortalamanın uzunluğunun ortalama renkliliğe
  oranı (**tutarlılık**) resmin tek renge boyanıp boyanmadığını verir:

  | Resim                    | Tutarlılık | Renk         |
  | ------------------------ | ---------- | ------------ |
  | `a` (kırmızı)            | 0,99       | (255, 0, 35) |
  | proje sahibinin resmi    | 0,99       | (255, 0, 24) |
  | `c` (açık, çok renkli)   | 0,28       | beyaz        |
  | telifsiz açık test resmi | 0,44       | beyaz        |

  Tutarlılık 0,5'in altında beyaz, 0,9'un üstünde saf ton, arada geçiş. Ortalama, ortanca, en sık
  renk ve k-ortalama denendi: hiçbiri iki örneği birlikte vermedi (ortalama kırmızı resimde pembe
  (255, 166, 177), en sık renk açık resimde lacivert verdi). Renk, tonun **kendisi** ve tam
  parlaklıktadır; resmin kırmızısı koyu (doygunluk 0,76) olduğu için onu parlatmak pembe (255, 62, 99) verirdi; örnekteki ışıltının doygunluğu ise ~0,97. Eski sürümdeki %25 beyaz karışımı ve
  doygunluk artırma kaldırıldı.

### Ses–görüntü hizası (`uydur.py gecikme`)

Bas zarfı (30–150 Hz) ile soldaki 30 çubuğun ortalama boyu arasında ilinti 0,87 / 0,77 / 0,77.
Kayıtta görüntü sesten önde (ekran kaydedicinin ses gecikmesi): `a` 0,185 s, `b` 0,17 s, `c` 0,25 s
(`a`'da vuruşlar düzenli olduğu için zarf birkaç kayma veriyor; model uydurmasıyla 0,185 seçildi).

### Spektrum modeli (`uydur.py`)

Skor: her çubuğun boy dizisi ile modelin o çubuk için verdiği dizi arasındaki ilintinin ortalaması.

| Soru                | Sonuç                                                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frekans ekseni      | **Doğrusal, 20 Hz → 2000 Hz**, `k`. çubuk `20 + k·1980/N`: `a` 0,775, `c` 0,834; en iyi logaritmik eksen 0,11 / 0,10. İki farklı videoda (200 ve 220 çubuk) aynı uçlar. |
| Çubuk neyi gösterir | **Tek frekans** (o frekansta okunan genlik): 0,775; aralığın en büyüğü 0,69, ortalaması 0,71                                                                            |
| Pencere             | **Hann, ~4096 örnek** (93 ms): 2048 → 0,60, 3072 → 0,72, 4096 → 0,775, 5120 → 0,78; dikdörtgen pencere en iyi 0,67                                                      |
| Genlik ölçeği       | **Doğrusal**: havuz ilintisi doğrusal 0,924 / karekök 0,861 / dB 0,496 (`c`: 0,914 / 0,826 / 0,459); en iyi üs 0,95–1,00; kesişim ~4 px (sessizlik çentiği)             |
| Frekans ağırlığı    | **Yok**: 10 frekans grubunda boy/genlik eğimi düz (`c`: 1389–1851, eğilimsiz)                                                                                           |
| Zaman               | **Yumuşatma yok**: sönme süresi 0 → 0,775, 20 ms → 0,775, 70 ms → 0,74 (`c`: 0,834 → 0,804); her kare kendi spektrumu                                                   |
| Ölçek               | −14 LUFS'e ve (L+R)/2 tek kanala göre: boy = 1,87 / 1,22 / 1,66 × genlik × yükseklik (ortalama **1,58**)                                                                |

Eski sürümün uzaklaştığı yerler: logaritmik 40 Hz – 16 kHz eksen (bas çubukları ~1,8 Hz aralıklı,
komşular aynı tepeyi gösteriyordu: "yumuşak bas"), aralığın en büyüğü, +2 dB/oktav eğim ve 85 ms
sönme. Yeni modelde basın (20–200 Hz) soldaki ilk ~18 çubuk olması örnekteki görüntünün aynısı.

Bu desen (başlangıç/bitiş frekansı 20/2000 Hz, ~90 ms ses süresi, yalnızca bir yana çizilen
çubuklar, beyaz iç renk ve renkli dış ışıltı) After Effects'in "Audio Spectrum" efektinin
ayarlarına çok benziyor; ama bu bir tahmin, modelin hiçbir parçası buna dayanmıyor.

### Çekirdeğin doğrulaması (`dogrula.py`)

`src-tauri/src/audio/spectrum.rs`'in kaydın sesinden (−14 LUFS kazancıyla) hesapladığı
seviyeler, ölçülen boylarla:

| Kayıt | Havuz ilintisi | Çubuk başına ortalama | Ölçülen / model eğimi |
| ----- | -------------- | --------------------- | --------------------- |
| `a`   | 0,915          | 0,78                  | 1,21                  |
| `b`   | 0,831          | 0,69                  | 0,79                  |
| `c`   | 0,904          | 0,83                  | 1,11                  |

1080p'de boylar (aynı ses): örnek `a`'da bas çubukları (ilk 20) ortanca 35 px, %90'ı 170 px,
%99'u 431 px; Lyraska kırmızı resimde 34 / 151 / 331 px. Bütün çubuklarda örnek ortanca 12,4 px,
%95'i 82 px; Lyraska 12,9 / 61 px. `c`'nin sesi ve açık test resmiyle: bas 13 / 84 / 137 px (örnek
`c` 9 / 55 / 172 px).

## Epilepsi güvenliği

Işık yalnızca **eklenir** (tuval `mix-blend-mode: plus-lighter`): hiçbir piksel kararmaz. Her
WCAG penceresinin ortalaması çubuksuz resimle onun üstüne o karenin eklediği ışık arasında
kalır. `src/lib/photoScene.ts` her karede bu ışığın üst sınırını resmin kendi pikselleriyle
hesaplar ve 0,08'i geçecekse çubukları o kare için orantılı kısaltır; böylece hiçbir pencere
herhangi iki kare arasında 0,08'den fazla değişmez (eşik 0,1). Sınır:

- sRGB toplama 1'de kesilir ve eğri dışbükeydir: `p` eklenen bir kanal en çok
  `min(p · kiriş eğimi, 1 − lin(b))` artar; kiriş, piksele binebilecek en büyük toplam ışığa
  (ışıltının toplamı ≤ saydamlık × renk) çekilir. Her pikselin zemini 3×3 komşuluğunun en koyusu
  ve en açığıdır (tarayıcının ölçeklemesi ölçümden kayabilir). Özün dokunduğu piksel, üstüne
  binen ışıltılarla birlikte zeminin bütün payı kadar sayılır.
- Pencereye ışığının bir kısmı bile düşebilen çubuğun bütün ışığı, bütün satırlar sayılır;
  ışıltının dikey kuyrukları en parlak satırıyla.

Ölçümler (1920×1080):

- Örnek videonun kendisi: pencerede 1/3 sn içindeki en büyük değişim **0,032** (`a`), **0,047** (`c`).
- Kaydın sesiyle Lyraska: kırmızı resimde kısaltma **hiç** gerekmedi (sınır en çok 0,075); açık test
  resminde karelerin %1'inde, en az 0,90 oranında. Gerçek modelle hesaplanan artış en çok 0,035 / 0,039.
- Gerçek tarayıcıda (Chromium, ekran görüntüleri, `parlama.py ekran`, en gürültülü 80 kare): çubuksuz
  resme göre en büyük artış **0,026** (kırmızı) ve **0,034** (açık), kareden kareye en çok 0,007 / 0,012.

Koyu bant kaldırıldı: renk resmin rengi ve ışık eklendiği için açık yerlerde çubuk zaten az şey
değiştirir; ek pay gerekmedi.

### Kalan farklar

- **Fiziksel sınır**: çok koyu bir resimde uzun ve yoğun bas çubukları sınırı aşar. 1080p'de koyu
  zeminde kırmızı çubuklar: ilk 10 çubuk aynı anda en büyük boyda olabilir (486 px'in 347'si);
  ilk 20 çubuk birden dolarsa 171 px'te kalır. Örnek video bu kurala uymak zorunda değil; onun
  resminde de bizim kaydın sesiyle yaptığımız denemede de kısaltma gerekmedi.
- Özün genişliği videodan videoya değişiyor (`c`'de ~5 px); `a`'nınki seçildi. Beyaz ışıltı `c`'de
  eşit parlaklık kuralından biraz sönük (0,76).
- Renk resmin tonudur: proje sahibinin resminde 354° (kırmızıya çok yakın lâl); örnek video saf
  kırmızı (~2°) kullanmış.
- Kayıtlar kısa (4–6,5 sn) ve 24 kare/sn: ölçek ±%25 (0,79–1,21), 20 ms altındaki zaman ayrıntısı
  ölçülemez. Orijinal videonun ses ile görüntü arasındaki gecikmesi bilinemez; pencere duyulan
  ana ortalanır.

## Betikler ve yeniden üretme

Python 3 (numpy, scipy, Pillow, pyloudnorm) ve ffmpeg. Çalışma klasörü depo dışında olmalı
(kareler ve ses telifli).

```sh
python3 kareler.py ornek-a.mp4 a        # kareler, kare zamanları, ses
python3 olc.py a                        # çubuk yerleri ve boylar → a-E.npy
python3 uydur.py a gecikme              # ses–görüntü kayması (model.py'deki LAG)
python3 uydur.py a eksen | pencere | olcek | agirlik | zaman
python3 renk.py isilti a                # özün ve ışıltının kesiti
python3 renk.py baskin resim.png        # baskın renk kuralı
python3 parlama.py ornek a              # örneğin kendi pencere değişimi
python3 acik_resim.py acik.png          # telifsiz açık test resmi
```

Çekirdeğin seviyeleri (`<ad>.f32.levels.json`) `spectrum.rs`'e geçici olarak eklenen bir testle
üretilir (depoya girmez): kayıt `ffmpeg -ac 1` ile (L+R)/√2 karıştığı için kazanç
`10^((−14 − LUFS) / 20) / √2`; her 1/60 sn'de `WINDOW` örneklik pencere o anın üstüne ortalanıp
`bar_levels`'a verilir. Sonra `python3 dogrula.py a 0.185`.

Önizleme: depo kökünde `npx vite --port 5181`, sonra
`node onizleme.mjs cikti seq resim.txt 1920 1080 107.4 8 2.4686 a.f32.levels.json` (resim
`data:` adresi olarak metin dosyasında; `REST=1` önce çubuksuz kare). `python3 karsilastir.py a
cikti 40 karsilastirma.png` örnek kareyle aynı ses anını yan yana koyar, `python3 parlama.py
ekran cikti` gerçek tarayıcıdaki pencere değişimini ölçer.
