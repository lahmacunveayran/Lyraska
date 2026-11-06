# E. Görselleştirme: koreografi, senkron, MilkDrop, WebGL2/WebGPU, ışığa duyarlılık standartları

Tarama 1, 6 Kasım 2026. İşaretler: **[birincil]** kaynak bu oturumda okundu; **[özet]** arama özeti; **[kod]** Lyraska'nın
kodunda bakıldı; **[tahmin]** çıkarımım. Önceki çalışmalar geniş: `gorsel-vay-arastirma.md` (işçilik ilkeleri, MilkDrop,
VJ/zaman kodu, demoscene GNU Rocket, WebGL2 teknikleri), `sahneler-v2/` (on sahne, kurgu defteri, güvenli mod), `kendi-
resmin/` (WCAG kırmızı parlaması, PEAT ölçüsü). Burada tekrar edilmez; standartların **güncel sürümleri**, senkronun
**algı eşikleri**, araç zincirinin durumu ve gözden kaçan noktalar eklenir.

## 0. Kısa sonuç

1. **Senkron hedefi (±20 ms) algı eşiklerinin çok altında; kalan iş ortalama değil, kararlılık ve yön.** ITU-R BT.1359-1:
   ortalama fark edilme eşiği ses önde **+45 ms**, ses geride **−125 ms**; kabul edilebilirlik +90 / −185 ms [özet; ITU
   PDF'i arama sonucunda, bağlantı itu.int]. EBU R37: uçtan uca +40 / −60 ms [özet]. Müzikte davul–ışık eşzamanlılık
   penceresi 120 BPM'de ~150 ms, 60 BPM'de ~200 ms; müzisyenlerde < 100 ms [özet: PMC derlemeleri]. **Asimetri önemli:**
   insanlar sesin görüntüden _geç_ gelmesine (ışık sesten hızlıdır) çok daha toleranslıdır. Lyraska belirsizlikte
   görüntüyü **hafif erken** (0–10 ms) vermeyi seçmeli, geç değil [tahmin; eşiklerin asimetrisinden].
2. **Işığa duyarlılık standartlarının güncel sürümleri:** ITU-R **BT.1702-3 (11/2023)** yürürlükte (önceki -2, 10/2019)
   [birincil: itu.int]. WCAG 2.2 "Understanding 2.3.1": genel parlama = bağıl parlaklıkta ≥ %10'luk karşıt değişim çifti,
   koyu olan < 0,80; ≥ 3/sn yasak, alan 10° görüş alanının %25'i (0,006 sr; 1024×768'de 341×256 CSS px); doymuş kırmızı
   için yeni çalışma tanımı ISO 9241-391'den: R/(R+G+B) ≥ 0,8 ve CIE 1976 u′v′ farkı > 0,2; HDR/geniş renk uzayında
   "≥ 20 cd/m² değişim, koyu < 160 cd/m²" (BT.1702) [birincil: w3.org]. Lyraska'nın parlaklık freni (`flashGuardMath.ts`)
   bu tanımlara zaten dayanıyor ve bölge başına daha sıkı [kod]. **Açık:** MilkDrop'ta kırmızı kanal sınırlanmıyor
   ("bilinen boşluk", MIMARI.md) [kod].
3. **Butterchurn durgun:** npm'de `beta: 3.0.0-beta.5`, `latest: 2.6.7`, son değişiklik 2025-07-13 [birincil: npm
   kayıt API'si]. Lyraska beta.5'e bağlı ve kendi HLSL→GLSL çeviricisini yazdı; yani bakım yükü zaten Lyraska'da.
   projectM v4 kütüphanesi (LGPL) etkin; Rust ön yüzü geliştirme önizlemesinde [birincil: projectM README]. Uzun vadede
   projectM'in WebAssembly derlemesi (README'de Emscripten derleme rozeti var) Butterchurn'ün yerine geçebilir; LGPL,
   GPL-3.0 ile uyumlu [tahmin; büyük iş, şimdi gerekmez].
4. **WebGPU:** Tauri sorun kaydında (#6381, Mart 2023) WebView2'de WebGPU yalnızca bayrakla (`--enable-unsafe-webgpu`
   `additionalBrowserArgs`) açılıyordu; sonrası için kesin bilgi yok [birincil: GitHub issue]. Chromium 113'ten beri
   Windows'ta varsayılan açık [bilgim]; WebView2'nin bugünkü durumu **doğrulanmadı**. 10 dakikalık deneme: sahibinin
   programında `navigator.gpu` var mı. ROADMAP "WebView2 desteği olgunlaşınca" notu bu denemeyle güncellenmeli.
5. **Akademik literatür "yapıyı bilen" görselleştiriciyi hâlâ ürün olarak göstermiyor.** QMUL C4DM'in gerçek zamanlı sesle
   sürülen görselleştirme çalışması (Graf, Opara, Barthet, 2021; 34 katılımcı) kullanıcıların "ses özelliklerinin
   anlamını kavramakta" zorlandığını bildiriyor [özet: arXiv 2106.10134] — yani eşleme **okunaklı** olmalı (bas = büyük
   ve aşağıda, tiz = küçük ve yukarıda; önceki araştırmadaki Spence 2011 ile uyumlu). musicolors (2025, 8 katılımcılı
   nitel çalışma) perde/enerji/tını eşlemesi [özet]. Lyraska'nın "önceden bilen koreografi"si hâlâ ayırt edici.

## 1. Senkron: Lyraska için anlamı

| Kaynak                   | Eşik                                                                 | Lyraska karşılaştırması                                                  |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| ITU-R BT.1359-1 (1998)   | fark edilme +45 / −125 ms; kabul +90 / −185 ms (+ = ses önde) [özet] | ±20 ms hedefi bunun 2–6 katı sıkı                                        |
| EBU R37 (2007)           | uçtan uca +40 / −60 ms; her aşama +5 / −15 ms [özet]                 | Lyraska'nın "programın payı" ~±8 ms (sözler README) — aşama payına uygun |
| Davul–ışık eşzamanlılığı | 120 BPM ~150 ms, 60 BPM ~200 ms pencere; müzisyen < 100 ms [özet]    | hızlı tempoda (DnB 174) pencere daralır [tahmin]                         |

**Öneri E-1 (küçük):** kalibrasyon belirsizliği varken (ör. Bluetooth ölçülmemiş) görsel olayları sesten _erken_ değil
_geç_ kaydırma riskine karşı varsayılan kaymayı 0 değil, ölçüm belirsizliğinin yarısı kadar erken tutmak. Ölçüm: yok
(algı asimetrisine dayalı tasarım kararı); sahibinin denemesinde "vuruş göstergesi" ile.

**Öneri E-2 (ölçüm):** ±20 ms hedefinin yanında **titreme** (kareden kareye sapmanın standart sapması) hedefi. Literatür
düzensiz gecikmenin sabit gecikmeden daha rahatsız edici olduğunu söylüyor [bilgim; doğrulanmadı]. Lyraska `check:scenes`
zaten kare damgasıyla ölçüyor; ölçüt eklenir: 1 saatlik çalmada vuruş olayı sapmasının standart sapması ≤ 5 ms.

## 2. Işığa duyarlılık: standartlar ve Lyraska

| Standart              | Güncel sürüm                     | Ana kural                                                                                                           | Lyraska                                                                                                   |
| --------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| WCAG 2.2 SC 2.3.1     | 2023 (2.2)                       | ≤ 3 genel/kırmızı parlama/sn ya da alan ≤ 0,006 sr; ince dengeli desen (< 0,1° kareler) muaf [birincil]             | Güvenli modda ≤ 1/sn; varsayılan modda sınır yok (sahibinin kararı, uyarı ekranı var)                     |
| ITU-R BT.1702         | **-3, 11/2023** [birincil]       | TV yayını: parlama, desen (şerit), kırmızı; HDR için cd/m² eşikleri                                                 | Kod BT.1702'ye atıf yapıyor ama sürüm yazmıyor [kod] → `flashGuardMath.ts` yorumuna "-3 (2023)" eklenmeli |
| ISO 9241-391:2016     | 2016                             | Işığa duyarlı nöbetleri azaltmak için görüntü içeriği; WCAG'nin yeni kırmızı tanımının kaynağı [birincil: W3C atfı] | Kırmızı ölçü PEAT/WCAG tanımıyla (kapılı) [kod]                                                           |
| Ofcom yayın kuralları | —                                | BT.1702 ile uyumlu; Harding testi İngiltere'de fiilî araç [bilgim]                                                  | —                                                                                                         |
| Harding FPA / PEAT    | ticari / ücretsiz (Trace Center) | Otomatik video analizi                                                                                              | Lyraska kendi gerçek tarayıcı ölçümünü yapıyor (`check:scenes`)                                           |

**Gözden kaçan iki nokta [tahmin]:**

1. **Ekran parlaklığı ve HDR:** WCAG bağıl parlaklıkla (0–1) tanımlar; Windows'ta HDR açık bir ekranda sRGB beyazı
   200–400 cd/m²'ye eşlenebilir ve BT.1702'nin cd/m² eşikleri (20 cd/m² değişim) bağıl 0,1'den daha küçük bir değişime
   denk gelir. Lyraska'nın güvenli modu bağıl 0,1 eşiğine göre tasarlanmış. HDR ekranda güvenli payı daraltmak (ya da
   güvenli modda HDR'ı kapatma uyarısı) düşünülmeli. Ölçüm: yok; belge notu ve sahibine bilgi.
2. **Varsayılan modda "uyarı bir kez" yeterli mi:** WCAG'ye göre 2.3.1'i geçmeyen içerik bütün sayfayı etkiler (uyumsuzluk
   gerekçesi). Kişisel kullanımda sahibinin kararı geçerli; ama sahibinin evine gelen biri için uyarı yalnızca ilk açılışta
   çıkıyor. Öneri: Ayarlar'da tek tıkla güvenli mod ve "MilkDrop'ta kırmızı fren" (bugün kapalı) seçeneği — küçük iş.

## 3. Koreografi: araştırma ile Lyraska'nın durumu

- Önceki araştırmanın ilkeleri (zarf ↔ olay ayrımı, saldırı/bırakma, "her şey nabız atmasın", beklenti–açılım, bölüm =
  kurgu kesmesi, ton → palet) geçerli; literatürde çelişen bir bulgu görmedim.
- **Eksik olan veri katmanı:** A ve B dosyalarındaki yeni analizler Görsel Yönetmen'e şu yeni kanalları verebilir:
  ölçü başı olasılığı (Beat This), kick/trampet/hi-hat ayrı olayları (bant bölünmüş HPSS ya da DrumSep), vokal girişi
  (söz zamanı ya da CTC blank-VAD), tür ve uyarılma (Discogs-EffNet), tekrar eden bölüm kimliği (söz + benzerlik). Her biri
  `DirectorFrame`'e bir alan; sahne kullanmak zorunda değil.
- **Okunaklılık kuralı (Graf ve ark. 2021'in dersi):** her sahnede bir sesi bir görsel öğeye bağlayan **tek** açık eşleme
  (ör. kick = yerdeki halka, vokal = gökteki ışık) — izleyici neyin neye tepki verdiğini 10 sn'de anlamalı. Ölçü: sahibinin
  önizleme videosunda "neyin neye tepki verdiğini söyleyebiliyor mu" sorusu.

## 4. WebGL2/WebGPU ve performans

- 60 fps / 1080p / dahili GPU hedefi CI'da ölçülmüyor (ROADMAP). Yazılım çizimli başsız Chromium'da kare süreleri anlamsız
  (BILGI §5). Öneri E-3: sahibinin bilgisayarında (RTX 4050 ve işlemcinin dahili Radeon'u ayrı ayrı) her sahne için 60 sn
  kare süresi dağılımı (p50, p99) kaydeden bir "performans" düğmesi; ölçüt p99 ≤ 16,7 ms dahili GPU'da.
- WebGPU denemesi (§0.4) yalnızca bilgi toplama; geçiş önerisi değil (WebGL2 sahneleri çalışıyor, Butterchurn WebGL2).
