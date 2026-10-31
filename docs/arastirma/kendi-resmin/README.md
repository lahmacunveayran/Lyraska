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

## Tepki teşhisi (30 Ekim 2026; `teshis-2026-10-30/`)

Sahibi: "asıl hali daha canlı, daha tepkisel; bizimkinde orta bölge oynamıyor". Önce sahibinin Windows kaydı ile
örneğin kısa kaydı karşılaştırıldı (şarkının farklı anları), sonra sahibinin yüklediği **orijinal videonun tamamı**
(854×480, 30 kare/sn, kendi sesi; sahibinin dosyası aynı videonun sesi) ile aynı saniyeler. Lyraska'nın çıktısı bu
ortamda **gerçek kodla** üretildi: `spectrum.rs` ve `loudness.rs` değiştirilmeden ayrı bir crate'te derlendi
(`lyraska-cubuk/`; model.py ile en büyük fark 4,9e-4), çubuklar gerçek PhotoScene'de başsız Chromium'da çizildi
(`ciz.mjs`; çizilen boy ↔ seviye r 0,9999).

- **Model doğru:** orijinal videonun çubukları kendi sesiyle havuz r 0,996, çubuk başı r 0,938; 17 pencerede (10 sn)
  bölge oranı (ölçülen / model) ortanca 0,99, %10–90 aralığı 0,96–1,00; ses yüksekliğiyle değişmiyor
  (< 0,011/dB): orijinalde sıkıştırma, otomatik kazanç, bant normalizesi yok; doğrusal genlik, (L+R)/2.
- **Tek fark ölçek:** orijinal boy/H = 0,732 · ham genlik; Lyraska (−14 LUFS kazancı −9,52 dB ile) 0,524 · ham
  genlik: **0,72 kat** (−2,9 dB), her bölgede aynı. Küçük çubuklar taban çentiğinden ayrılamadığı için orta seslerde
  hareketli kare % düşüyordu (bastan tize, 20–35 sn): orijinal 74 65 53 46 39 31 28 33 32, Lyraska 67 56 43 34 25 21
  17 19 19; ×1,4 ile 75 68 54 47 39 32 29 31 31. Seviyesi 1'e değen çubuk-kare oranı %0,015. Düzeltme:
  `FULL_AMPLITUDE` 0,285 → 0,204 (0.0.98; sahibinin seçimi, yan yana videolarla).
- **Zamanlama:** orijinal çubuklar sesten **0,12 sn önce** oynuyor (ekranda aynı saniyede benzerlik 0,23; kaydırınca
  0,96). Lyraska sesle aynı anda kalır (±20 ms kuralı); sahibi "1,4 kat, önden değil"i seçti.
- **Sahibinin kaydındaki ses** dosyadan farklı: orta kanalda bas ~−10 dB, tiz +6 dB, yan kanal şişirilmiş, sol–sağ
  ters faz (Windows/sürücü "uzamsal ses / netlik" iyileştirmesine benziyor; Lyraska'da ekolayzer kapalıydı). Çubukları
  etkilemiyor (sahibinin ekranındaki çubuklar bu ortamdaki çizimle aynı: hareketli kare % 67/49/39 ↔ 68/53/42).
  İlk turda bu farkı Lyraska'nın ekolayzerine bağlayan sonuç bu yüzden geri alındı.
- Beyaz zeminde (kanat, saç) çubuklar görünmez: orijinalde de aynı; benzerlik için değişiklik gerekmiyor.
- **Renk:** orijinalin ışıltısı saf kırmızı (eklenen ışığın tonu 5,7°); Lyraska resmin baskın tonunu aynen alıyordu
  (bu resimde renklerin çoğu 340–350°: 346°, pembemsi kızıl). Yapımcı rengi resimden hesaplamıyor, saf renk seçiyor:
  baskın ton artık en yakın saf tona oturur (kırmızı, turuncu, sarı, yeşil, camgöbeği, mavi, mor, pembe;
  `nearestPureHue`). Sahibinin seçimi, üç satırlı önizlemeyle.
- **Bağımsız değerlendirme** (ayrı ajan, kendi betikleri): model ve ölçek doğrulandı (yeni ölçek bu şarkıda orijinalin
  1,03 katı), 0,12 sn öndelik doğru, Windows iyileştirmesi çubukları etkilemiyor. Risk: ölçek tek ve çok yüksek sesli
  (−4,5 LUFS) bir şarkıdan; bas ağırlıklı türlerde sert kırpmada karelerin %70–99'unda 1–2 bas çubuğu tavanda. Çözüm:
  **yumuşak tavan** (`SOFT_KNEE` 0,7'nin üstü `tanh`, dizinde eğim 1); sentetik trap'te tavandaki kare oranı %77 →
  %19, Flying High'ta fark yok (sahibinin seçimi, önizlemeyle). Renk: saf tonlar arası sınırda ani renk değişimi ve gök
  mavisi → camgöbeği riski sahibine söylendi; sahibi "en yakın saf renk" kalsın dedi.

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
  ışıltının dikey kuyrukları çubuğun üstündeki ve ucunun altındaki gerçek satırlarla, kısa çubukta sönük ışıltıyla (`boxPeak`, `boxTail`).
- Işıltının σ'sı CSS pikselindedir. Tuvalin dönüşümü bulanıklık süzgecini ölçeklemediği için çizimde
  cihaz piksel oranıyla çarpılır (`glowFilter`); yoksa DPR 2'de ışıltı yarı genişlikte ve iki kat
  tepeli olur, sınır geçersizleşir. `check:scenes` DPR 1 ve 2'de çizginin aynı genişlikte (≤ 1 CSS
  px farkla) olduğunu ölçer.

Ölçümler (1920×1080):

- Örnek videonun kendisi: pencerede 1/3 sn içindeki en büyük değişim **0,032** (`a`), **0,047** (`c`).
- Kaydın sesiyle Lyraska: kırmızı resimde kısaltma **hiç** gerekmedi (sınır en çok 0,075); açık test
  resminde karelerin %1'inde, en az 0,90 oranında. Gerçek modelle hesaplanan artış en çok 0,035 / 0,039.
- Gerçek tarayıcıda (Chromium, ekran görüntüleri, `parlama.py ekran`, en gürültülü 80 kare): çubuksuz
  resme göre en büyük artış **0,026** (kırmızı) ve **0,034** (açık), kareden kareye en çok 0,007 / 0,012.

Koyu bant kaldırıldı: renk resmin rengi ve ışık eklendiği için açık yerlerde çubuk zaten az şey
değiştirir; ek pay gerekmedi.

### Kırmızı parlama (WCAG 2.3.1)

Bağımsız denetim gerçek Chromium'da çok koyu doymuş kırmızı zeminde (40, 0, 0) sessizlikten bütün
çubuklar doluya geçişte pencerenin kırmızı ölçüsünü **21,1** (eşik 20), (110, 10, 20)'de 15,6
ölçtü. Ölçü: pencerede ortalama `320 · (R − G − B)` (doğrusal bileşenler), piksel doygun kırmızı
değilse (`R/(R+G+B) < 0,8`) 0 ("kapılı", Trace Center / PEAT); WCAG'nin çalışma tanımında değer
`320 · max(0, R − G − B)` ("sürekli"). Sınır ikisini birden kapsar.

**Neden ikili pay.** Parlaklığın tersine kırmızı ölçü eklenen ışıkla tekdüze değil: kırmızı
ışıltı koyu kırmızıyı daha kırmızı yapar (artış), beyaza yakın öz doymuş kırmızıyı doygunluktan
çıkarır (değeri bütünüyle düşer), pembeyi doygun kırmızıya çevirebilir (0'dan sıçrar). "Her kare
`[taban, taban + pay]`" burada ikili farkı sınırlamaz. Bu yüzden her karede çubukların çubuksuz
resme göre pencerede yapabileceği en büyük **artış** `I_t` ve en büyük **azalış** `D_t` ayrı
sınırlanır: `I_t ≤ I`, `D_t ≤ D`, `I + D = 16` (eşiğin %80'i; güvenli modda 8). Herhangi iki kare
t, u için `R(t) − R(u) ≤ I_t + D_u ≤ 16 < 20`. Bölüşüm resmin ilk ölçümünden (bütün çubuklar
doluyken artış/azalış oranı, `[0,1; 0,9]`) ve resim değişene dek sabit; bilinmezken ikisi de
`0,1 · 16`: bölüşüm, güvenli mod ya da yeniden ölçüm değişse de her karenin artışıyla başka bir
karenin azalışının toplamı 16'yı geçmez (test: `pay bölüşümü`).

**Piksel sınırı** (`redChange`): eklemeden sonra kanal `min(255, b + a)`; doğrusal artışlar kanal
başına aralıkta. `L = R − G − B` ve `Q = R/4 − G − B` (`Q ≥ 0` ⇔ doygun) doğrusal,
`max(0, L)` 1-Lipschitz: artış ≤ `max(0, ΔR⁺ − ΔG⁻ − ΔB⁻)`, azalış ≤ `max(0, ΔG⁺ + ΔB⁺ − ΔR⁻)`;
doygun olmayan renk doygunlaşabiliyorsa (`Q + ΔR⁺/4 − ΔG⁻ − ΔB⁻ ≥ 0`) sıçrama
`L + ΔR⁺ − ΔG⁻ − ΔB⁻`, doygun renk doygunluğunu yitirebiliyorsa azalış önceki değerin tamamı.
Tek renkli pikselde (sabit resim) ayrıca eklenen ışığın yolu boyunca ortalama değer kuramı
(kanallar aynı `t` ile birlikte artar; eşit kanallı beyaz ışıkta tuvalin yuvarlaması da ortak):
uydurma "kırmızı R, koyu G" karışımı yok. Her ekran pikseli, ölçülen 3×3 komşudan birinin
**kendi** rengi sayılır (eski denemedeki gibi komşuların kanallarını karıştırıp hayalî kırmızı
üretmez).

**Pencere sınırı.** Bütün ışıltıların rengi aynı; bir piksele gelen ışıltı `τ · u`. Her piksel için
`τ ≤ RED_LEVELS[l] · T` düzeylerinde (14 düzey, `T` en büyük toplam ışıltı) ve özün kapladığı
pay aralıklarında (dörtte birlik, kaba düzeylerle) en büyük değişim ölçülür; her sütun bir şeride
(en yakın çubuk) ait, şeridin satır satır birikimli tabloları tutulur. Bir karede şeridin her
satırının düzeyi o satıra ışığı düşebilen çubukların boylarından bulunur: satırda ışıltı en çok
`min(Σ_k τ_k · v_k, max v · T_m)` (`τ_k` çubuğun şeritteki en büyük ışıltısı, `v_k` dikey değeri:
içeride `boxPeak(e_k)`, dışarıda kenara uzaklıkla `boxTail`); çubuğun kendi öz sütunlarında öz
yalnız çubuk o satırdaysa. Her piksel bir kez sayılır (eski "her çubuğa ayrı pay" sınırı yoğun
çubukta pikselleri çubuk sayısı kadar sayıyordu). Kuyruklar ölçümde, en uzun komşunun boyuna
göre. Kare başına maliyet 1080p kırmızı resimde ~1 ms, ölçüm 1–3 sn (ayrı iş parçacığında).

**Gerçekle karşılaştırma** (640×360, tarayıcı gibi model, pencerede en büyük artış): (40, 0, 0)
sessiz 2,3 → sınır 6,5; yarı 115 → 137; tam 225 → 270. Proje sahibinin kırmızı resmi: sessiz
2,4 → 10,1; tam 160 → 226. Sınır hiçbir durumda gerçeğin altında değil (testler: her desen,
her pencere, iki tanım).

**Gerçek tarayıcıda** (`check:scenes`, Chromium): sessiz → tam ses kırmızı farkı (40, 0, 0)'da
**8,56** (önce 21,1), (110, 10, 20)'de **10,09** (önce 15,6); gri ve resimsizde 0.

**Etki** (1080p, kaydın sesiyle 246 kare, bütün çubukların boyu, px, ortanca / %90 / %99):

| Resim                        | Yalnız parlaklık    | Parlaklık + kırmızı |
| ---------------------------- | ------------------- | ------------------- |
| 2 (kırmızı, sahibinin resmi) | 39,2 / 95,6 / 193,6 | 11,0 / 22,0 / 49,8  |
| 3 (mor)                      | 39,5 / 94,8 / 217,2 | aynı                |
| 4 (çok renkli, beyaz çizgi)  | 35,2 / 83,5 / 203,5 | aynı                |
| 5 (mavi)                     | 22,7 / 51,6 / 124,9 | aynı                |
| düz (40, 0, 0)               | 26,3 / 60,4 / 146,0 | 8,9 / 16,9 / 39,9   |
| düz (110, 10, 20)            | 24,2 / 55,3 / 133,6 | 7,8 / 14,2 / 31,7   |

Bas çubukları (ilk 20) kırmızı resimde 20,2 / 67,0 / 140,8 → 7,2 / 15,1 / 36,9. Kırmızı olmayan
resimler etkilenmez. Kırmızı resimde sınır gerçekten ~1,4× (tam çubuk) – ~4× (sessizlik)
temkinli: tarayıcıda ölçülen fark payın (16) altında kaldığı için çubuklar fiziksel olarak
gerekenden kısadır (kaydın sesiyle yaklaşık %40'ı yetecekken %28'i).

**Güvenli modda kırmızı resim** (31 Ekim 2026 ölçümü, 640×360, tarayıcı gibi model): güvenli modun kırmızı payı
(`I + D = 8`) kırmızı resimde sessizlik boyunda dolar; çubuklar hiç uzamaz (2 px, hedef 82 px). Payı tam kullanan
"kusursuz" sınır bile en çok 3–12 px verirdi (dolu desen / rastgele desen; düz (40, 0, 0), (110, 10, 20), degrade,
tüylü). Beyaz ışık (yalnızca güvenli modda, yalnızca kırmızı resimde) bugünkü sınırla 4–19 px, kusursuz sınırla
12–55 px; camgöbeği ve turuncu daha az. Pay güvenli modun sözü olduğu için değişmez; kırmızı resimde çubukların
durması bu sözün sonucu. Sahibi kararı Claude'a bıraktı; Claude olduğu gibi bırakmayı seçti (BILGI §7).

### Hareketli arka plan (GIF, APNG, hareketli WebP)

Kareler WebView'da çözülür (`ImageDecoder`, Chromium ≥ 94), WebGL tuvalinde **parlaklık freninden**
(MilkDrop'unki; kırmızı kanalıyla) geçerek çizilir; hiçbir zaman `<img>` ile oynatılmaz. Fren ilk
kareyle başlar (sabit resmin belirmesi gibi tek geçiş). Animasyon yalnız çalarken ilerler;
"animasyonları azalt" açıksa, `ImageDecoder` yoksa, fren kurulamazsa ya da resim sınırları aşıyorsa
(600 kare, 50 milyon piksel; çekirdek seçerken reddeder) ilk kare sabit gösterilir.

- **Zarf.** Fren gösterilen pikseli önceki gösterilenle yeni karenin doğrusal ışıkta karışımı
  olarak çizer: ekrandaki her renk karelerin renklerinin dışbükey zarfındadır. Çubukların sınırı
  bu zarfla ölçülür (`FrameEnvelope`: kanal başına en koyu/en açık, `L` ve `Q`'nun uçları — doğrusal
  oldukları için uçları karelerin uçları —, ekranın 8 biti için pay).
- **Fren.** Parlaklıkta (`flashGuardMath.ts` 1.–8. adım) her pencerenin ortalaması saniyede en çok
  `ρ_L = r_p · N⁺/N · (1 + GUARD_MAX_DT)` yol alır (normal r_p = 0,27); kırmızı kanalda
  (9. adım) `ρ_R = 320 · r_r · N⁺/N · (1 + GUARD_MAX_DT)` (r_r = 0,09/sn; güvenli 0,03/sn).
- **Birlikte.** Pencerenin görünen değeri `Y = S + e + A`: `S` frenin saklanan görüntüsü, `|e| ≤ ε`
  ekranın 8 biti, çubuklar `A ∈ [0, a]` (kırmızıda `[−D, I]`). Bir değişim (eşik Δ = 0,1 ya da 20)
  sayılması için `S` son değişimden bu yana en az `Δ − (a + 2ε)` yol almalı; 1 saniyede değişim
  sayısı `N ≤ 1 + ρ / (Δ − a − 2ε)`. Bant `N ≤ 7` (saniyede ≤ 3 parlama; güvenli `N ≤ 3`, ≤ 1)
  olacak biçimde %90 payla seçilir (`animatedBudgets`): 1080p'de parlaklık payı **0,035** (sabit
  resimde 0,08), kırmızı **5,26** (16); güvenli modda yarısı.
- **Denetim.** Tarayıcı gibi modelde (işlemcideki fren `guardStep` + çubuklar) bilerek parlayan
  resim (siyah ↔ beyaz, kırmızı ↔ aynı parlaklıkta gri, koyu ↔ parlak kırmızı, 10 Hz) ve onunla aynı
  ritimde yanıp sönen çubuklar: frenli ≤ 3/sn (güvenli ≤ 1) parlama, parlaklıkta da kırmızıda da;
  frensiz denetim > 6/sn. Gerçek Chromium'da (`check:scenes`, projenin ürettiği APNG) frenli
  **0** parlama/sn (güvenli de 0), frensiz 4,75/sn; görüntü hareket ediyor.
- **Bedel.** Fren hızlı ve keskin hareketi yavaşlatır (iz bırakır; MilkDrop'taki gibi), kırmızı
  içerik daha da yavaş değişir. Zarf her pikselin bütün karelerdeki en kötü rengini sayar: kırmızı
  ya da parlak içerikli, çok hareketli resimde çubuklar sessizlik boyuna yakın kalabilir.

### Kalan farklar

- **Kırmızı ölçünün süreksizliği**: kapılı PEAT ölçüsü doygunluk sınırında (`R/(R+G+B) = 0,8`)
  sıçrar; hareketli arka planda renkler sınırın iki yanında gidip gelirse (gözle görülmeyecek bir
  değişim) bu ölçü fark gösterebilir, hiçbir hız sınırı bunu önleyemez. Fren sürekli tanımı
  sınırlar; çubukların sınırı iki tanımı da kapsar.
- **Ekran ölçeklemesi**: ekrandaki pikselin ölçülen 3×3 komşudan birinin rengi olduğu varsayılır
  (tarayıcının ölçeklemesi bir piksel kaydırabilir); sRGB'de iki rengin karışımı ölçülmemiş bir
  kırmızılık verebilir (keskin beyaz–kırmızı kenarda). Gerçek tarayıcı denetimi düz renklerde.
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
