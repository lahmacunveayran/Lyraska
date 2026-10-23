# Lyraska için "vay be" araştırması: görseller ve kütüphane

Tarih: 23 Ekim 2026 · Kapsam: sahnelerin müziğe tepkisi, işçilik ilkeleri, WebGL2 teknikleri, kütüphane
maketlerinin "premium" hissi · Kaynaklar sonda. Kendi yorumlarım **[çıkarım]** diye işaretlidir; doğrulayamadığım
yerde "bulamadım" ya da "doğrulayamadım" yazıyor.

---

## 0. Kısa teşhis: sahneler bugün neden "sönük"?

Depoyu okuyarak gördüklerim (`src/lib/shaderSources.ts`, `shaderRenderer.ts`, `src-tauri/src/director/mod.rs`):

1. **Tek geçişli çizim, son işlem (post-process) yok.** Galeri sahneleri tek bir parça gölgelendiricide
   (`scene(uv, p)`) ekranı çiziyor; ışık taşması (bloom), ton eşleme, film greni, ışık sızması, ara bellek
   (feedback) yok. Yalnızca hafif bir titreme gürültüsü (dither) var. Profesyonel gerçek zamanlı görüntünün
   "parlayan, derin, sinematik" hissinin büyük kısmı tam bu katmandan gelir **[çıkarım]**.
2. **Müzik tepkisi bilerek "birkaç yüzde" ile sınırlı.** Dosya başındaki kural: "Enerjiler biçimi en fazla
   birkaç yüzde değiştirir; parlaklık çarpanı ortak gövdededir." Bu epilepsi güvenliği için doğru bir karar ama
   müziği yalnızca parlaklık ve küçük biçim değişimi kanalından ifade etmeye çalışınca sonuç zayıf kalıyor.
   Çözüm güvenliği gevşetmek değil, **müziği parlaklık dışındaki kanallara taşımak** (hareket, kamera, yoğunluk,
   renk tonu, sahne kurgusu, küçük alanlı ışık) — aşağıda ayrıntılı.
3. **Yönetmen notu zengin ama sahnelere dar akıyor.** Yönetmen `mood, warmth, pulse, accent, beat_phase,
bar_phase, anticipation, release, detail, motion` üretiyor; galeri sahneleri bunun bir kısmını `uEnergy,
uTension, uBloom, uRipple, uLow/uHigh` olarak görüyor. **Ton (Camelot) yönetmende hiç kullanılmıyor**;
   bölüm değişimi yalnızca tema rengini değiştiriyor; sahnenin "kurgusu" (bölümden bölüme kamera, yoğunluk,
   kompozisyon değişimi) yok.
4. **Ekran parlaklığı düşük, karşıtlık dar.** Sahneler çoğunlukla 0,05–0,35 aralığında renk topluyor; ton eşleme
   olmadan bu değerler sRGB'de soluk görünür. Parlak noktaların "yanması" yerine her şey aynı griye yakın
   **[çıkarım]**.

Kısacası: Lyraska'nın asıl kozu olan **şarkıyı önceden bilmek** bugün ekranda pek görünmüyor. Asıl iş bu kozu
görünür kılmak.

---

## A. "Vay be" etkisinin işçilik ilkeleri

### A1. Işık: parlama, taşma, hacim

- **Bloom (ışık taşması)** parlak alanların çevresine yumuşak hale yayar; ekrana "gerçek ışık" hissi veren tek en
  etkili adımdır. Modern yaklaşım eşikli tek bulanıklık değil, **yarım çözünürlüklü küçülen bir görüntü zinciri**:
  önce aşağı örnekleme (13 dokunuşlu süzgeç), sonra yukarı çıkarken 3×3 "çadır" süzgeçle toplama. Bu yöntem
  Jorge Jimenez'in SIGGRAPH 2014 _Call of Duty: Advanced Warfare_ sunumundan gelir; zamansal kararlılığı
  (kıpırtısızlığı) arttırdığı yazılıdır. **Dual Kawase** (Marius Bjørge, ARM, SIGGRAPH 2015 "Bandwidth-Efficient
  Rendering") aynı fikrin bant genişliği dostu sürümü; KDE KWin ve VLC bulanıklıklarında kullanılıyor.
  Mobil GPU ölçümünde mip zinciri bloom'u en hızlı çıkmış (10,3 ms; Kawase+HDR 11,5 ms; compute 21,6 ms).
- **Hacimsel ışık / ışık huzmeleri (god rays)**: Ekran uzayında ışık kaynağından radyal bulanıklık (GPU Gems 3'te
  Kenny Mitchell'in yöntemi; bu oturumda sayfası açılmadı) ucuz bir yaklaşımdır; çeyrek çözünürlükte 32–64 örnekle yapılır **[çıkarım:
  maliyet tahmini]**.
- **Parlama ≠ parıltı.** Göz yanan küçük noktaları (yıldız, ışık topu, kıvılcım) "değerli" algılar; geniş alanı
  parlatmak ise hem ucuz görünür hem epilepsi riski taşır. WCAG'nin alan eşiği de bunu destekler: eşzamanlı
  parlamalar 10°'lik görüş alanının yaklaşık %25'ini (0,006 steradyan) geçmezse "parlama" sayılmaz.
  **Lyraska için anahtar:** vuruşta _küçük alanlar_ parlar, _büyük alan_ yalnızca yavaş değişir **[çıkarım]**.

### A2. Derinlik

- **Paralaks**: aynı hareket katmanlara farklı hızla verilince (uzak yıldızlar yavaş, yakın toz hızlı) düz ekran
  derinlik kazanır. Bugünkü sahnelerin çoğu tek düzlem.
- **Atmosferik perspektif**: uzak nesne kontrastını düşürüp sis rengine yaklaştırmak (Inigo Quilez'in "better
  fog" makalesi bu tekniği anlatır, kodu MIT).
- **Alan derinliği (DoF)**: ön plandaki birkaç parçacığı bulanık, büyük ve soluk çizmek ucuz bir "lens" hissi verir;
  gerçek DoF yerine parçacık boyutu ve saydamlığı ile taklit edilir **[çıkarım]**.

### A3. Malzeme: cam, gren, titreme gürültüsü

- **Cam (Apple "materials")**: Apple HIG'e göre materyaller arkadaki içeriği bulanıklaştırıp yarı saydamlık
  verir; "vibrancy" arka plandaki rengi öndeki içeriğe taşır. Seçim renge göre değil **kullanım amacına** göre
  yapılır. Lyraska'nın çekmece ve kütüphane camı için doğrudan örnek.
- **Gren ve titreme (dither)**: 8 bit ekranda koyu gradyanlar (gece göğü!) bantlaşır. Mavi gürültü (blue noise)
  ile titretmek, beyaz gürültüye göre çok daha az fark edilir (Christoph Peters, _Moments in Graphics_; Robert
  Ulichney'in terimi). Animasyonlu sahnede **uzay-zamansal mavi gürültü** (NVIDIA, STBN) daha kararlıdır.
  Doku, ekrana 1:1 ve en yakın komşu örnekleme ile yayılmalı; aksi halde bantlaşmayı gidermediği bildirilmiş.
  Lisans: Peters'in hazır dokularının lisansını **doğrulayamadım** (siteye erişilemedi) → en temizi dokuyu
  "void-and-cluster" algoritmasıyla (Ulichney 1993; demofox blog anlatımı) **kendimiz üretip** commit etmek.
- **Film greni**: çok ince (±1–2 kod değeri), luma'ya bağlı, zamanla değişen ama parlamayan gren, dijital
  "plastik" hissini kırar **[çıkarım]**.

### A4. Renk

- **Algısal renk uzayı (Oklab/OKLCH)**: Björn Ottosson 2020'de yayımladı; CIELAB'ın mavilerdeki ton ve açıklık
  kaymalarını düzeltir, daha düzgün gradyan verir; kamu malı. CSS Color 4/5'te `oklch()` olarak var. Uyarı: tonu
  açı olarak enterpole etmek "uzun yoldan" dolanabilir ve doygun tonlarda sRGB dışına taşar; OKLCH açıklığı
  kontrast ölçüsü olarak güvenilir değil.
- **Ton eşleme (tone mapping)**: Sahneyi doğrusal ışıkta 0..∞ hesaplayıp sonda bir eğriyle 0..1'e sıkıştırmak,
  parlak bölgelerin "yanmasını" ve doygunluğun beyaza doğru doğal açılmasını sağlar. Seçenekler: Narkowicz'in
  2016 ACES eğri uydurması (çok ucuz, ama doygun renkleri sarıya/kırmızıya kaydırır), Hill'in daha doğru ACES
  yaklaşımı, **AgX** (Troy Sobotka; Blender 4.0'ın varsayılanı; log uzayı + sigmoid + giriş/çıkış matrisleri,
  doygun ışıkları yumuşakça beyaza götürür). Gece/neon sahneleri için AgX benzeri davranış daha zarif
  **[çıkarım]**.
- **Sınırlı palet ve renk derecelendirme**: Her sahnede 2–3 ana ton + 1 vurgu rengi; gölgeler soğuk, ışıklar sıcak
  (ya da tersi) "split toning". Lyraska'nın tema renkleri `uLow/uHigh` zaten iki tonlu; eksik olan ışık/gölge
  ayrımı ve ton eşleme.

### A5. Hareket

- **Disney'in 12 ilkesi UI'da**: beklenti (anticipation), takip/aşma (follow-through, overshoot-and-settle),
  yavaş giriş-çıkış, ikincil hareket. Bunlar UX yazılarında (uxdesign.cc, Marvel, Dribbble) uygulayıcı rehberi
  olarak anlatılıyor; araştırma değil.
- **Yay fiziği (spring)**: Material 3 Expressive, bezier eğrileri yerine sertlik/sönüm/hız ile tanımlanan yaylara
  geçti; "uzamsal" (konum, boyut) ve "efekt" (opaklık, renk) yayları ayrı. (Resmi değerleri m3.material.io'dan
  doğrulayamadım; üçüncü taraf paketler varsayılan uzamsal yayı sertlik 380, sönüm 0,73 olarak veriyor.)
- **Apple**: hareket amaçlı olmalı, mekânsal ilişki anlatmalı; "Hareketi azalt" açıkken çapraz geçiş (crossfade)
  sunulmalı.
- **Müzik görselinde iki hız**: yavaş ortam hareketi (saniyeler–dakikalar) + keskin ama küçük vurgular. Bugün
  Lyraska'da ikisi de var ama genlikleri birbirine çok yakın, bu yüzden "her şey hafifçe kıpırdıyor" hissi
  oluşuyor **[çıkarım]**.

### A6. Kompozisyon ve boşluk

- Ödüllü WebGL sitelerinde (ör. Awwwards 2024 Yılın Sitesi geliştirici ödülü _Igloo Inc_, Bureaux/Abeto) ortak
  nokta: **tek bir kahraman nesne**, bol karanlık boşluk, kod ve 3B sanatın tarayıcıda, gerçek zamanlı ayar
  araçlarıyla birlikte geliştirilmesi. Ekip "yalnızca üç bölümle ilgiyi canlı tutmak" sorununu etkileşimle çözmüş.
- **[çıkarım]** Lyraska sahnelerinde odak noktası çoğu zaman yok (her yer eşit dokulu gürültü). Her sahneye bir
  "kahraman" (ay, galaksi çekirdeği, tünelin ağzı) ve ona yönelen ışık/çizgi kurgusu verilmeli; ekranın %60'ı
  sakin kalmalı.

### A7. Hareketli tipografi

- Apple Music Sing (iOS 16.2): sözler **hece hece** canlanıyor, uzatılan hecede vurgu ve dalgalanma var, arka
  vokaller ayrı ve daha küçük, düette satır hizası şarkıcıya göre değişiyor. Lyraska'nın kinetik sözleri (`LyricsOverlay`)
  için doğrudan referans: büyüklük/hizalama ile _kim_ söylüyor, hareketle _nasıl_ söylüyor.

---

## B. Müzik görselleştirme: "zıplayan çubuklar" ile "canlı" arasındaki fark

### B1. MilkDrop / projectM / Butterchurn

- MilkDrop'un özü üç katman: **kare başı denklemleri** (zoom, dönme, renk; `bass`, `mid`, `treb` ve yumuşatılmış
  `bass_att` vb. okur), **ağ/piksel başı denklemleri** (warp mesh: görüntünün her noktası bir öncekine göre
  nereye akacak) ve **geri besleme**: önceki kare hafifçe büzülüp dönerek ve kararıp yeni karenin altına çizilir
  ("video echo" ikinci katman). Görselin "canlı ve organik" görünmesinin sırrı bu geri besleme: ses yalnızca
  _akış alanını_ biraz iter, görüntü kendi geçmişinden büyür **[çıkarım; Geiss'in rehberi sitesi bu oturumda
  açılamadı, ayrıntılar preset dosyalarından]**.
- Gerçek presetler kendi vuruş algılayıcılarını yazar: ör. `volume = 0.15*(bass_att+bass+mid+mid_att)` ve tepe
  izleme ile eşik. Yani MilkDrop bile ham spektrumu doğrudan değil, **yumuşatılmış + tepe izlenmiş** değerleri
  kullanır.
- Lisans: Butterchurn MIT (Jordan Berg), projectM LGPL; Lyraska zaten Butterchurn uyumlu JSON üretiyor.
- **Sınırı**: MilkDrop şarkıyı bilmez; geçişler rastgele zamanlı, drop'u ancak oldukça yakalar.

### B2. AVS, Plane9, Kodi

- Winamp AVS (Justin Frankel) 2005'te BSD benzeri lisansla açıldı; katmanlı "efekt listesi" + bellek tamponları
  mantığı MilkDrop'a benzer.
- Plane9: kapalı kaynak ücretsiz, 2016'dan beri güncellenmiyor; 250 sahne + 37 geçiş sahnesi, çalışma zamanında
  birleşerek "10 000+" kombinasyon. Ders: **geçişin kendisi bir sahnedir.**
- Kodi'nin 12 görselleştiricisi (projectM, Shadertoy, Goom, Spectrum…) tamamen anlık sese tepki verir; şarkı
  yapısı bilgisi yok.

### B3. Apple Music, Spotify Canvas, Plexamp

- **Apple Music Album Motion**: hareket kapaktan başlamalı, kapak hep odakta kalmalı, tek kesme, "çılgın
  yanıp sönme" yasak; 8–35 sn döngü.
- **Spotify Canvas**: 3–8 sn dikey döngü; hızlı kesmeler ve yoğun yanıp sönen grafiklerden kaçınma tavsiyesi;
  sanatçı adı yazılmaz (uygulama zaten gösteriyor).
- **Plexamp**: tema renklerini çalan kapaktan örnekler; "UltraBlur" arka planı kapaktan çıkarılan birkaç rengin
  bulanık karışımı (sunucu dört onaltılık renk saklıyor) ve isterseniz arama çubuğu/düğmeler de bu renge boyanır.
  Plex'in "Sonic Analysis"i her parçayı ~50 parametreyle N boyutlu bir "müzik evrenine" yerleştirir.
  ("UltraSonic" adlı bir Plexamp görselleştiricisi **bulamadım**; büyük olasılıkla UltraBlur ile karıştırılıyor.)
- **Ortak ders**: Büyük platformlar müzik görselinde _yavaş, kapağa sadık, yanıp sönmeyen_ bir dil seçiyor; heyecanı
  hareket ve renk akışıyla veriyor.

### B4. VJ ve sahne tasarımı pratiği

- Konser ışık ve video tasarımında yapı bilgisi **zaman kodu (timecode)** ile kullanılır: çalma bilgisayarı
  konsola zaman kodu gönderir, ışık ve video önceden programlanmış ipuçlarını şarkının tam anlarında çalar
  (PLSN, NAMM/Umphrey's McGee, LSi/John Newman turnesi, A.R. Rahman turnesi sanal stüdyoda önceden
  programlanmış). John Newman'ın direktörü bunun "elle çalınamayacak sekanslar" yapmayı mümkün kıldığını söylüyor.
- Festival rehberi (TicketFairy): büyük ipuçlarını şarkı yapısına ve drop'lara hizala, **sürekli flaş yerine**.
- **Demoscene**: GNU Rocket "sync tracker" — müzik izleyicisi gibi satır (zaman) × sütun (parametre) tablosu;
  ara değerler basamak/doğrusal/yumuşak enterpolasyonla. Demolar müziği önceden bildiği için kamera, sahne
  geçişi ve vurguları elle "koreografe" eder. **Lyraska'nın Görsel Yönetmeni bunun otomatik sürümüdür**
  **[çıkarım]**; şarkı haritası = otomatik doldurulan Rocket tablosu.

### B5. Sese tepki: iyi uygulamalar

1. **Zarf (envelope) ile başlangıç (onset) ayrı kanallardır.** Zarf: sürekli enerji → yavaş parametreler
   (renk sıcaklığı, sis, hız, yoğunluk). Başlangıç/vuruş: anlık olay → kısa vurgular (bir kıvılcım, kamera
   sarsıntısı değil "itiş", çizgi doğuşu).
2. **Saldırı/bırakma (attack/release) yumuşatma.** Yükselişte hızlı, düşüşte yavaş; ses araçları kılavuzları
   bırakmanın saldırının en az ~10 katı olmasını önerir (Applied Acoustics). Tepki "pompalamak" yerine "nefes
   alır".
3. **Her şey nabız atmasın.** Bir anda yalnızca bir-iki katman vuruşa bağlı olmalı; geri kalanı ölçü, bölüm ya da
   enerji eğrisine **[çıkarım; MilkDrop presetlerindeki pratik ve festival ışık rehberiyle tutarlı]**.
4. **Vuruşa tepki "olay + sönüm" biçiminde**: vuruş anında değer sıçrar, üstel düşer (ör. 120–250 ms). Lyraska
   şarkıyı bildiği için **vuruştan önce** de hazırlık yapılabilir (ör. vuruştan 60 ms önce hafif geri çekilme =
   animasyondaki "anticipation").
5. **Algısal eşleşmeler (crossmodal correspondences)**: Spence (2011) derlemesine göre insanlar tiz sesleri
   _küçük, parlak ve yukarıda_ nesnelerle eşler. Bu, "tiz → küçük parlak parçacıklar üstte, bas → büyük, ağır,
   aşağıda kütle" eşlemesinin bilimsel dayanağıdır.

### B6. Yapıyı önceden bilmek: Lyraska'nın asıl kozu

- **Araştırma**: Solberg & Jensenius (2016) hareket yakalama ile house parçalarında breakdown → build-up → drop
  boyunca dansçı hareketini inceledi, drop sonrası artış öngördü; Solberg & Dibben'in çalışmasında deri iletkenliği
  tepkisi drop bölümünde en yüksekti (bu ikinciyi yalnızca ikincil kaynaktan gördüm). Yazarlar build-up'ın
  uzatılmasıyla beklenti/gerilim-çözülmeyi ileriki araştırma konusu olarak bırakıyor.
- **Önceki işler**: Foote, Cooper & Girgensohn, "Creating music videos using automatic media analysis" (ACM MM 2002) müzik yapısına göre video kurgusu; arXiv 2108.00970 müzik kliplerinde ses–görüntü senkronunun vuruş, ölçü ve
  bölüm düzeyinde yapılandığını gösteriyor; MIT Media Lab "Music Visualization via Musical Information Retrieval"
  projesi MIR verisini görsel nesnelere eşliyor; ISMIR 2016'da konser kayıtlarının yapısal bölütleme ve
  görselleştirmesi. **Gerçek zamanlı bir müzik çalarda şarkı haritasına göre koreografi yapan yaygın bir ürün
  bulamadım** — bu Lyraska'nın gerçek farkı.
- **Nasıl kullanılır [çıkarım]**:
  - _Beklenti (drop'tan 4–16 ölçü önce)_: kamera yavaşça içeri çekilir, renk doygunluğu azalır, parçacıklar merkeze
    toplanır, ortam "nefesini tutar". Gerilim **karartma ve sadeleştirme** ile anlatılır (güvenli!).
  - _Açılım (drop anı)_: bir kere, tek yönlü, büyük **mekânsal** değişim: kamera geriye açılır, parçacıklar dışarı
    saçılır, palet sıcak tona döner, bloom'un _yarıçapı_ büyür. Parlaklık artışı yavaş (≥ 0,5 sn) ve küçük alanlarda.
  - _Bölüm değişimi_: kompozisyon değişir (kamera açısı, sahne içi "set" değişimi) — bir müzik klibindeki kesme gibi.
  - _Ton değişimi (modülasyon)_: paletin tonu Camelot çemberinde komşu tona kayar.
  - _Ölçü_: ölçü başında küçük ikincil hareket (rüzgâr, dalga, kıvılcım halkası değil bir kaç parçacık).
  - _Tekrar eden nakarat_: ikinci nakarat birinciden "daha büyük" — varyasyon (renk tonu kayar, katman eklenir).

---

## C. Entegre GPU'da 60 fps için WebGL2 teknikleri

Hedef: Intel Iris Xe, 1080p, WebView2. Somut Iris Xe ölçümü **bulamadım**; aşağıdaki maliyetler **[çıkarım]**
(dolum hızı / doku bant genişliği mantığı ve yaygın pratiğe dayanır). Genel kural: **pahalı sahne gölgelendiricisini
düşük çözünürlükte, ucuz son işlemi tam çözünürlükte** çalıştır.

| Teknik                                                         | Ne verir                                 | Maliyet notu                                                                | Lisans / kaynak                                                                          |
| -------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Çözünürlük ölçekleme (sahne %50–75, son işlem 100%)            | Pahalı gürültü sahnelerini kurtarır      | En büyük kazanç; DPR şu an 2'ye kadar                                       | Kendi kodumuz                                                                            |
| Dinamik çözünürlük (kare süresine göre)                        | 60 fps garantisi                         | Basit PI denetleyici                                                        | Kendi kodumuz                                                                            |
| Bloom: mip zinciri (5–6 seviye)                                | Gerçek ışık hissi                        | Yarım çöz. ve altı; ~1 ms civarı beklenir                                   | Jimenez 2014, Bjørge 2015 (teknik)                                                       |
| Ton eşleme (AgX/ACES yaklaşımı) + renk derecelendirme          | Doygunluk, yanma, sinema                 | Tek geçişte, çok ucuz                                                       | Narkowicz eğrisi blog'da yayımlandı; AgX Blender (GPL uyumlu) — kendi yazımımız önerilir |
| Mavi gürültü titretme + gren                                   | Bantlaşma yok, "film" dokusu             | 1 doku okuma                                                                | Dokuyu kendimiz üretelim                                                                 |
| Geri besleme / ping-pong (iz, akış)                            | MilkDrop tarzı canlılık, kuyruklu ışık   | 2 ek doku; yarım çözünürlükte ucuz                                          | Kendi kodumuz                                                                            |
| Alan bükmeli fbm (domain warping)                              | Organik bulut, ipek                      | Oktav sayısı pahalı (fbm içinde fbm = 3× fbm)                               | iq makaleleri: teknik kod MIT                                                            |
| Curl-noise parçacıklar (doku tabanlı ya da transform feedback) | Duman, toz, ateşböceği sürüleri, akışkan | 50–200 bin parçacık makul **[çıkarım]**; WebGL2 transform feedback destekli | Bridson ve ark. 2007 (yöntem); kod kendimiz                                              |
| İşaretli uzaklık alanı ışın yürütme (SDF raymarching)          | Kristal, gezegen, soyut heykel           | Adım sayısı × piksel; yarım çözünürlük + ≤ 64 adım                          | iq SDF makaleleri (MIT)                                                                  |
| Hacimsel ışık yaklaşımı (radyal bulanıklık)                    | Işık huzmeleri                           | Çeyrek çözünürlük, 32–64 örnek                                              | GPU Gems 3 (teknik)                                                                      |
| Renk sapması (chromatic aberration)                            | Lens hissi                               | Ucuz; **yalnızca kenarlarda, çok az**                                       | —                                                                                        |
| Zamansal biriktirme (TAA benzeri karışım)                      | Düşük çözünürlükte gürültüsüz görüntü    | Hareketli sahnede iz bırakabilir                                            | —                                                                                        |

**Kütüphaneler ve lisanslar:**

- **three.js**: MIT. **pmndrs/postprocessing**: **Zlib** (MIT değil; ikisi de GPL-3.0 ile uyumlu, `deny.toml`'da
  Zlib var). Ama Lyraska ham WebGL2 kullanıyor; tüm three.js'i almak ağır olur — **[çıkarım]** tekniği kendimiz
  yazmak daha uygun.
- **Butterchurn**: MIT. **projectM**: LGPL.
- **stegu/webgl-noise** (simplex/Perlin GLSL): MIT.
- **Inigo Quilez makaleleri**: siteye göre _algoritma/teknik_ gösteren kod MIT; _sanat eseri_ olan kod (kendi
  Shadertoy eserleri) telifli, kullanılamaz. Her parçanın başlığına bakılmalı.
- ⚠️ **LYGIA**: Prosperity License + Patron License çift lisansı. Prosperity **ticari olmayan kullanım**
  sınırlaması içerir (destekçi/katkıcı olmayanlar için). Proje kuralına göre **kullanılamaz**. (lygia.xyz/license
  sayfasına bu oturumda erişilemedi; README'deki ifadeye dayanıyorum.)
- ⚠️ **Shadertoy**: yazar başka bir lisans belirtmedikçe varsayılan **CC BY-NC-SA 3.0** (Ticari Olmayan +
  Aynı Lisansla Paylaş) olarak biliniyor; üçüncü taraf kaynaklar (Godot Shaders, three.js kılavuzundaki iq
  başlıkları) böyle diyor, Shadertoy'un kendi sayfasını doğrulayamadım. **Shadertoy'dan kod kopyalanmaz**;
  yalnızca makalelerde anlatılan tekniklerden kendi kodumuz yazılır.
- Oklab: kamu malı (Wikipedia'ya göre).

---

## D. Lyraska için öneriler

### D1. Görsel kalite çıtası (her sahne birleşmeden önce)

1. **Odak**: Ekranda tek bir kahraman öğe var; ekranın en az yarısı sakin.
2. **Işık**: Doğrusal ışıkta hesaplanıyor, sonda ton eşleme + bloom; en parlak noktalar gerçekten "yanıyor".
3. **Bantlaşma yok**: koyu gradyanlarda mavi gürültü titretme; 8 bit ekranda ekran görüntüsünde basamak görünmüyor.
4. **Derinlik**: en az üç katman (uzak, orta, yakın) farklı hızlarda.
5. **Palet**: en fazla 3 ana ton + 1 vurgu; Oklab'da karıştırılıyor; ışık/gölge farklı sıcaklıkta.
6. **Müzik**: dinleyici 10 sn içinde (a) vuruşu, (b) bölüm değişimini, (c) drop'u gözüyle fark ediyor; sesi kapatıp
   videoyu izleyen biri drop'un nerede olduğunu tahmin edebiliyor.
7. **Çeşitlilik**: 4 dakikalık şarkıda aynı kompozisyon 30 sn'den uzun sürmüyor; ikinci nakarat birinciden farklı.
8. **Güvenlik**: parlama testi geçiyor; parlaklık değişimleri küçük alanda ya da yavaş; güvenli modda vurgular yalnızca
   hareketle; "hareketi azalt"ta kamera durur, renk akışı kalır.
9. **Performans**: Iris Xe sınıfında 1080p'de 16,6 ms altı (dinamik çözünürlükle); 1 saatte takılma yok.
10. **Özgünlük**: hiçbir Shadertoy/NC kaynaklı kod yok; marka yok.

### D2. Sahneler için en iyi 10 yükseltme (etki / emek)

| #   | Yükseltme                                                                                                                                                                                                                                                                                          | Harita bağlantısı                                               | Etki                     | Emek        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------ | ----------- |
| 1   | **Ortak son işlem zinciri**: sahneyi kayan noktalı (RGBA16F) dokuya çiz → mip zinciri bloom → AgX benzeri ton eşleme → renk derecelendirme → mavi gürültü titretme + ince gren. Tüm sahneler bir kerede güzelleşir.                                                                                | Bloom yarıçapı ← `release`; derecelendirme sıcaklığı ← `warmth` | Çok yüksek               | Orta        |
| 2   | **Dinamik çözünürlük + sahne/son işlem ayrımı**: sahne %60–100, son işlem tam çözünürlük. 1'in bedelini öder.                                                                                                                                                                                      | —                                                               | Yüksek (performans)      | Düşük       |
| 3   | **Beklenti–açılım kurgusu (drop dramaturjisi)**: drop'tan 8 ölçü önce sadeleş, doygunluk düş, kamera içeri; drop'ta kamera geri açılır, palet döner, parçacık saçılır (mekânsal, parlamasız). Her sahne için yazılı bir "drop senaryosu".                                                          | `anticipation`, `release`, `drops`                              | Çok yüksek (asıl kimlik) | Orta        |
| 4   | **Bölüm = sahne içi kurgu**: her bölümde kamera açısı/kompozisyon "seti" değişir (ör. Deniz: ufuk alçalır, ay yükselir; Tünel: dönüş yönü değişir). Tekrarlanan bölüm biraz farklı varyasyonla döner.                                                                                              | `section`, `theme`                                              | Yüksek                   | Orta        |
| 5   | **Ton → palet**: Camelot çemberi Oklab ton açısına eşlenir (komşu tonlar komşu renkler; minör = daha soğuk/koyu, majör = daha sıcak/açık **[çıkarım; tartışmalı bir eşleme, bir kural seçmek gerekir]**). Bölüm bölüm ton değişiminde palet yavaşça kayar. Bugün ton yönetmende hiç kullanılmıyor. | `key` (analiz var)                                              | Yüksek                   | Düşük       |
| 6   | **Geri besleme (feedback) katmanı**: önceki kare hafif büzülüp akış alanıyla bükülür ve sönümlenir; MilkDrop'un canlılığı, ama yönetmen kontrolünde (akış hızı ← enerji, akış yönü ← bölüm). Kuyruklu ışık izleri.                                                                                 | `motion`, enerji                                                | Yüksek                   | Orta        |
| 7   | **Curl-noise parçacık katmanı** (ateşböceği, toz, kıvılcım, kar): bas = yavaş büyük akış, tizler = küçük parlak parçacıklar üstte (Spence eşleşmesi). Vuruşta parlama yerine _doğum_ (yeni parçacık) ve _itiş_.                                                                                    | `pulse`, `detail`, spektrum bantları                            | Yüksek                   | Orta-yüksek |
| 8   | **İki hızlı hareket**: ortam hareketi enerjiye bağlı ve yavaş (yay fiziğiyle), vurgular kısa ve küçük alanlı; vuruştan ~60 ms önce minik "hazırlık" (önceden bilmenin görünür kanıtı). Bir anda en fazla iki katman vuruşa bağlı.                                                                  | `beat_phase`, `bar_phase`, `accent`                             | Orta-yüksek              | Düşük       |
| 9   | **Derinlik katmanları ve sis**: her sahneye uzak/orta/yakın katman, atmosferik perspektif, ön planda bulanık büyük parçacıklar (sahte DoF).                                                                                                                                                        | `mood` → sis yoğunluğu                                          | Orta-yüksek              | Orta        |
| 10  | **Tını → doku**: spektral parlaklık (centroid) ve bant dağılımı dokunun inceliğini/kenar keskinliğini belirler (parlak tını = ince keskin desen, koyu tını = yumuşak geniş form). Yeni bir analiz parçası gerekiyorsa "doku" sürümüyle önbelleğe eklenir.                                          | `detail`, bantlar                                               | Orta                     | Orta        |

Önerilen sıra: **2 → 1 → 5 → 3 → 8 → 4 → 6 → 7 → 9 → 10** (önce altyapı ve hızlı kazançlar, sonra kimlik). Her biri
CLAUDE.md'deki "küçük PR" kuralına uygun ayrı parçalara bölünebilir.

### D3. Kütüphane maketlerini "premium" yapan 8 yükseltme

1. **Kapaktan ortam ışığı** (Plexamp UltraBlur gibi): çalan kapaktan 3–4 renk Oklab'da çıkarılır; arka plandaki gece
   göğü ve camın kenar ışığı bu renklere çok yavaş (2–3 sn yay) döner. Renkler doygunluk tavanıyla sınırlanır.
2. **Çalan şarkıyı izleyen ışık**: listede çalan satırın arkasında yumuşak bir ışık havuzu; şarkı değişince ışık yeni
   satıra _kayarak_ gider (yay fiziği, hafif aşma). Işık şiddeti şarkının enerji eğrisiyle çok az nefes alır.
3. **Gerçek cam**: arka planın bulanık örneklenmesi (CSS `backdrop-filter` ya da WebGL), 1 px iç kenar parıltısı,
   üstte çok hafif mavi gürültü greni — düz yarı saydam gri değil. Apple'ın kullanım amacına göre materyal seçme
   ilkesi.
4. **Gök görünümü paralaksı**: yıldızlar (şarkılar) üç derinlik katmanında; fare/klavye ile gezinirken yakın katman
   daha çok kayar. Ton (Camelot) açısal konum, tempo yarıçap ya da yükseklik. Benzer işler: Every Noise at Once
   (Glenn McDonald, 13 değişkenli dağılım haritası), Plex'in "müzik evreni". Yıldız parlaklığı = çalınma sıklığı
   ya da enerji; çalan yıldızın çevresinde yavaş bir ışık halesi.
5. **Üretken kapaklar özgün ama tutarlı**: şarkı haritasından (bölüm renkleri, enerji eğrisi, ton) türetilen soyut
   desen; aynı şarkı hep aynı kapak (tohum = parmak izi). Kapak yoksa "boş gri kare" asla.
6. **Mini şarkı haritaları**: satırda ince bir şerit — bölümler renk tonu, drop'lar küçük ışık noktası, enerji
   yükseklik. Üzerine gelince (anticipation) şerit hafifçe genişler; tıklayınca o bölümden çalar.
7. **Yay fiziğiyle geçişler**: çekmece, satır seçimi, görünüm değişimi bezier değil yay (az aşma, ~300–450 ms);
   paylaşılan öğe geçişi (kapak listeden büyük başlığa _uçar_). "Hareketi azalt" açıksa çapraz geçiş.
8. **Tipografi ve boşluk**: büyük, ince başlık; sayısal değerler (BPM, ton, süre) eşit genişlikte rakamla;
   ikincil bilgi düşük kontrastla; satır yüksekliği cömert. Liste kaydırmasında başlık hafif paralaksla küçülür.

### D4. Kaçınılacaklar

- **Her şeyin nabız atması**: bütün ekranın vuruşta ölçeklenmesi/parlaması — hem ucuz görünür hem epilepsi riski.
- **Doymuş neon gökkuşağı**: tüm tonların aynı anda; HSV'de tam doygunluk. Sınırlı palet, Oklab.
- **Bantlaşma**: koyu lacivert gradyanlarda basamaklar (titretme yoksa kesin olur).
- **Bloom'u abartmak**: her şeyin sisli, düşük kontrastlı görünmesi; eşik/yoğunluk sahneye göre ayarlanmalı.
- **Renk sapması, VHS, glitch'i sürekli kullanmak**: klişe; varsa yalnızca kenarda ve anlık.
- **Ani tam ekran beyaz/kırmızı**, ekranın büyük alanında yüksek karşıtlıklı tekrarlayan desen (şerit/halka),
  saniyede 3'ten fazla parlama (WCAG 2.3.1; doymuş kırmızı için ayrı eşik). Drop'un "patlaması" parlaklıkla değil
  mekânla anlatılır.
- **Rastgele sahne geçişi** (MilkDrop'un zayıflığı): geçişler bölüm sınırına ve ölçü başına hizalanmalı.
- **Kopya estetik**: Shadertoy'dan "esinlenme" adı altında kod alma; marka logoları, Pioneer benzeri arayüz.
- **Ağır sahneyi tam çözünürlükte çizmek**: entegre GPU'da kare düşmesi = premium hissin en hızlı katili.

---

## Kaynaklar

- Lyraska kodu: `src/lib/shaderSources.ts`, `src/lib/shaderRenderer.ts`, `src-tauri/src/director/mod.rs` (okundu, değiştirilmedi)
- Inigo Quilez, Domain warping: https://iquilezles.org/articles/warp
- Inigo Quilez makaleler dizini ve kod lisansı: https://iquilezles.org/articles/ , https://iquilezles.org/
- Jorge Jimenez, Next Generation Post Processing in Call of Duty: AW (SIGGRAPH 2014): https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/
- LearnOpenGL, Bloom: https://learnopengl.com/advanced-lighting/bloom
- Dual Kawase (Bjørge 2015) atıfları: https://code.videolan.org/videolan/vlc/-/merge_requests/7461 , https://gitlab.gnome.org/GNOME/gtk/issues/1283
- Mobil GPU bloom karşılaştırması: https://etasr.com/index.php/ETASR/article/download/19101/6940
- Narkowicz ACES eğrisi: https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
- ACES ton ölçeği belgesi: https://docs.acescentral.com/system-components/output-transforms/technical-details/tone-mapping/
- AgX (darktable belgesi, Blender kökeni): https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/agx/
- Oklab: https://en.wikipedia.org/wiki/Oklab_color_space , https://uxdesign.cc/stop-using-oklch-lightness-for-your-color-scale-02025deca49d
- Christoph Peters, blue noise: https://momentsingraphics.de/BlueNoise.html
- NVIDIA, Spatiotemporal blue noise: https://developer.nvidia.com/blog/rendering-in-real-time-with-spatiotemporal-blue-noise-textures-part-1
- demofox, void and cluster: https://blog.demofox.org/2019/06/25/generating-blue-noise-textures-with-void-and-cluster/
- Bridson ve ark., Curl-Noise for Procedural Fluid Flow (2007): https://history.siggraph.org/?p=115355
- WebGL2 parçacıklar (transform feedback): https://gpfault.net/posts/webgl2-particles.txt.html
- Apple HIG Materials: https://developer.apple.com/design/human-interface-guidelines/materials
- Disney ilkeleri ve UX: https://uxdesign.cc/disneys-12-principles-of-animation-exemplified-in-ux-design-5cc7e3dc3f75
- Material 3 Expressive hareket (ikincil): https://proandroiddev.com/android-16-x-material-3-e-biggest-ui-change-yet-updates-for-android-jetpack-compose-and-flutter-35d6b53a5242 , resmi: https://m3.material.io/styles/motion
- Awwwards Igloo Inc vaka çalışması: https://awwwards.com/igloo-inc-case-study.html
- MilkDrop preset yazım rehberi: https://www.geisswerks.com/milkdrop/milkdrop_preset_authoring.html ; örnek preset: https://gfiber.googlesource.com/vendor/opensource/projectM/+/master/presets_milkdrop_200/Various%20-%20Fire%20and%20Brimstone.milk
- Butterchurn (MIT): https://www.npmjs.com/package/butterchurn
- AVS: https://en.wikipedia.org/wiki/Advanced_Visualization_Studio
- Plane9: https://www.majorgeeks.com/files/details/plane9.html
- Kodi görselleştiricileri: https://kodi.tv/addons/omega/category/visualisations
- Apple Music Album Motion: https://help.apple.com/itc/albummotionguide/en.lproj/static.html , https://help.apple.com/itc/musicstyleguide/en.lproj/itc7d4b161d8.html
- Apple Music Sing: https://techcrunch.com/2022/12/06/apple-music-is-getting-a-new-karaoke-like-feature-apple-sing , https://appleinsider.com/articles/22/12/07/hands-on-with-apple-music-sing-on-iphone-ipad-apple-tv
- Spotify Canvas yönergeleri: https://support.spotify.com/tr-en/artists/article/canvas-guidelines/
- Plexamp ayarları (UltraBlur): https://forums.plex.tv/t/how-to-plexamp-4-6-1-settings/724870 ; UltraBlurProcessor: https://forums.plex.tv/t/ultrablurprocessor-log-messages/893375
- Plex Sonic Analysis: https://support.plex.tv/articles/sonic-analysis-music/ , https://www.plex.tv/en-ca/blog/super-sonic-get-closer-to-your-music-in-plexamp/
- Every Noise at Once: https://en.wikipedia.org/wiki/Every_Noise_at_Once
- GNU Rocket: https://github.com/rocket/rocket
- Zaman kodlu şovlar: https://plsn.com/articles/technopolis/slaying-the-beast-a-modern-tale-of-timecode , https://ww1.namm.org/node/50176 , https://lsionline.com/news/xl-video-back-on-the-road-with-john-newman-w0wc7l , https://www.timroutledge.co.uk/portfolio/music/a-r-rahman-concert-lighting-designer
- Festival ışığı ve drop'lar: https://www.ticketfairy.com/blog/kinetic-festival-lighting-without-chaos-movement-cues-for-drops
- Zarf izleyici (attack/release): https://www.applied-acoustics.com/multiphonics-cv-3/manual/envelope-follower , https://elementary.audio/docs/tutorials/envelope-generators
- Spence (2011) Crossmodal correspondences: künye: Attention, Perception & Psychophysics 73 (2011), 971–995, doi:10.3758/s13414-010-0073-7 (DOI bellekten, bu oturumda açılmadı); kayıt: https://www.psy.ox.ac.uk/publications/115721
- Solberg & Jensenius (2016), drop ve dans hareketi: https://www.osu.tests.sfulib4.publicknowledgeproject.org/index.php/EMR/article/view/5300/4608 ; Drop (music): https://en.wikipedia.org/wiki/Drop_(music)
- Foote, Cooper, Girgensohn (ACM MM 2002) atfı: https://ar5iv.labs.arxiv.org/html/1905.12245
- Müzik kliplerinde senkron: https://ar5iv.labs.arxiv.org/html/2108.00970
- MIT Media Lab, MIR ile müzik görselleştirme: https://www.media.mit.edu/projects/music-visualization-via-musical-information-retrieval/overview/
- ISMIR 2016 yapısal bölütleme ve görselleştirme: https://ir.webis.de/anthology/2016.ismir_conference-2016.31
- WCAG 2.3.1: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
- LYGIA lisansı: https://github.com/patriciogonzalezvivo/lygia (README "License"), https://lygia.xyz/license
- Shadertoy varsayılan lisansı (ikincil): https://godotshaders.com/shader/creation-by-silexars/ , https://threejs.org/manual/en/shadertoy.html
- pmndrs/postprocessing (Zlib): https://github.com/pmndrs/postprocessing
- stegu/webgl-noise (MIT): https://github.com/stegu/webgl-noise
