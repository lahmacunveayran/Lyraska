# Bağımsız denetim: "Sahneler v2" tasarım belgesi

Tarih: 24 Ekim 2026 · Denetlenen: `sahneler-v2/README.md` · Denetçi: bağımsız inceleme ajanı (belgeyi yazan değil;
gerçek zamanlı grafik + konser/VJ görsel yönetmenliği + şüpheci editör gözüyle). Depoda hiçbir şey değiştirilmedi.
Kod gerçekleri `/tmp/claude-0/wt-sinir` (main, 03834c9) ve `/tmp/claude-0/wt-sahne` (`sahne-son-islem`, 1934023)
üzerinden yalnızca okunarak doğrulandı.

---

## 0. Karar (özet)

**Belge iyi bir yön belgesi, ama olduğu gibi uygulanmaya hazır değil.** Teşhis (bölüm 1) isabetli ve kodla
doğrulanıyor; "şarkıyı önceden bilmek" kozunu kurgu defterine (cue sheet) bağlama fikri projenin en güçlü fikri.
Ama:

1. **Bir veri kaynağı yanlış:** `BassHit` olaylarının "bas tepeleri"nden geleceği yazıyor. `BassPeaks` bir zaman
   dizisi değil, bas düğmesinin taşma payı için şarkı başına **iki sayılık** bir özet (`audio/bass.rs:160`). Bas
   darbeleri 60 kare/sn spektrumun alt bantlarından ya da başlangıç gücünden (`onset`) yeni bir hesapla çıkarılmalı.
2. **Güvenli mod sigortası yanlış yere konmuş:** "Bütün yeni sahneler güvenli modda parlaklık freninden geçsin"
   önerisi, projenin kendi dersine (BILGI-BIRIKIMI §5: kendi sahnelerimizde koruma yapının içinde; fren yalnızca
   güvenilmeyen MilkDrop için) ve frenin matematiğine ters düşüyor. Fren piksel başı değişimi ~0,095/sn ile
   sınırladığı için güvenli modda her kesme ~10 sn'lik bir erimeye, her hareketli parlak çizgi (lazer, lamba, kum)
   bir hayalet izine döner. Belgenin kendi güvenli mod tablosundaki "ortalama parlaklık yakınsa kesme serbest"
   kuralıyla çelişiyor.
3. **Dramaturji neredeyse tamamen EDM dropuna dayanıyor.** Örnek şarkı 128 BPM EDM. Proje sahibinin kütüphanesinde
   Türkçe pop, 9/8, akustik ağırlıklıysa çoğu şarkıda güvenilir drop olmayacak; üç sahnenin de "vay" anı hiç
   gelmeyecek. Dropsuz şarkı için "doruk" tanımı (nakarat girişi, enerji sıçraması, son nakarat) motorun birinci
   sınıf olayı olmalı.
4. **Analiz hazır değilken ne olacağı yok.** Sürükle-bırakla ilk kez açılan şarkıda harita gelene kadar kurgu
   defteri boş. Her sahnenin "canlı mod" (yalnızca o anki ses) yedeği olmalı.
5. **İlk gösterim çok geç.** Plan sahibine ilk şeyi 11 PR sonra gösteriyor (E0–E7, S1a–S3a). Sahibinin "zor
   beğenir" geçmişi düşünülünce, 3–4 PR'lık bir dikey dilimle (tek sahne + asgari kurgu defteri) başlanmalı.
6. **Zaman Vadisi, kaldırılan "Gece otoyolu"na tehlikeli derecede benziyor** (vuruşa kilitli şerit, ölçü başına
   kilitli lamba: `src/lib/highway.ts`) ve fikir olarak Audiosurf'ün (2008) yakın akrabası. Belge ikisini de
   anmıyor. Sahibi "yine yol" diyebilir.

Bu altı madde düzeltilirse plan ilerlemeye değer. İlk üç seçimine (Işık Ustası, Zaman Vadisi, Ebru) büyük ölçüde
katılıyorum, ama kapsamları daraltılarak ve farklı bir yapım sırasıyla (bölüm 5).

---

## 1. Doğruluk denetimi (iddialar ve kaynaklar)

Derece: ✔ doğru · ≈ büyük ölçüde doğru, küçük düzeltme · ✖ yanlış · ? doğrulanamadı

### 1.1 Kod tabanı iddiaları

| İddia                                                                                                      | Derece      | Not                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Galeri sahneleri "birkaç yüzde" kuralı, `clamp(col,0,1)`, `pulse/beatPhase/section` uniform listesinde yok | ✔           | `shaderSources.ts` satır 15, 22–32, 430. Teşhis tablosu sağlam.                                                                                                                                                                                                                                                              |
| Yönetmen "10 değer" üretiyor                                                                               | ≈           | Gerçekte 13 alan: `section, theme, mood, warmth` / `pulse, accent, beatPhase, barPhase, anticipation, release, barsConfident` / `detail, motion`. Önemsiz, ama `barsConfident` kurgu defteri için önemli bir alan ve listede yok.                                                                                            |
| `SongMap` vuruş listesini taşımıyor; vuruşlar önbellekte var                                               | ✔           | `BeatGrid.beats: Vec<f64>` önbellekte (`cache.rs` `beats` sütunu); `SongMap` yalnızca `downbeats`. `song_timeline` ihtiyacı gerçek.                                                                                                                                                                                          |
| "Veri zaten önbellekte, yeni hesap yok, önbellek sürümü artmaz; yalnızca boşluk tespiti yeni"              | ✖ (kısmen)  | Vuruşlar ve 60 kare/sn × 32 bant kareler önbellekte, doğru. Ama **`BassHit` için kaynak yok**: `BassPeaks` = `shelf_rise_db[STEPS]` + `octave_band_db`, şarkı başına sabit (bas rafının taşma payı). Bas darbe tespiti de yeni bir saf fonksiyon. Sürüm artmaz iddiası, hesap her açılışta karelerden yapılırsa doğru kalır. |
| `Section` etiketli (aynı etiket = aynı tür)                                                                | ≈           | `label: number` var (`structure.rs` `label_sections`: öznitelik kümeleme). Ama etiketin anlamı yok (kıta/nakarat bilinmiyor) ve etiket doğruluğu hiç ölçülmemiş. `isFinalChorus` ancak sezgisel olabilir; belge bunu kesin bilgi gibi kullanıyor.                                                                            |
| 10 Hz × 32 bant ≈ 96 KB / 5 dk                                                                             | ✔           | 300 × 10 × 32 bayt = 96 000.                                                                                                                                                                                                                                                                                                 |
| `Gap` (0,2–2 sn) 10 Hz özetten bulunur                                                                     | ✖ (tasarım) | 0,2 sn = 10 Hz'de 2 örnek; güvenilir değil. Boşluk ve bas darbesi 60 kare/sn karelerden **Rust'ta** hesaplanıp olay olarak gönderilmeli; 10 Hz özet yalnızca arazi gibi görsel amaçlı.                                                                                                                                       |
| `gl.ts` bağlamı `depth: false`                                                                             | ✔           | `gl.ts:21`.                                                                                                                                                                                                                                                                                                                  |
| `sahne-son-islem` dalı: RGBA16F, dinamik çözünürlük, 13 dokunuşlu küçültme, çadır büyütme, mavi gürültü    | ≈           | Doğru; ama dinamik çözünürlük **PI denetleyici değil**, histerezisli adım denetleyici (`RESOLUTION_STEP_DOWN 0,1`, `STEP_UP 0,05`, `COOLDOWN 2 sn`, `postProcess.ts:219–233`). Ton eşleme AgX değil, diz eğrili kendi eğrisi (`TONE_KNEE 0,7`).                                                                              |
| Parlaklık freni "hücre ortalaması ve ince desen dönüşünü saniyede ≤ 1 ile sınırlıyor"                      | ≈           | Güvenli modda `r_p = 0,095/sn` (≤ 1,04 tersine dönme/sn); beyaz ekran ~10,6 sn'de belirir (MIMARI.md ~s. 255–280). Bu sayılar, frenin yeni sahnelere neden uymadığını gösteriyor (bkz. bölüm 3.3).                                                                                                                           |
| Fren SwiftShader'da 320×180'de 8–10 ms                                                                     | ✔           | MIMARI.md'de aynen.                                                                                                                                                                                                                                                                                                          |
| CI sahne denetimi "yazılımsal GPU'da, SwiftShader"                                                         | ≈           | CI işi `windows-2025` üzerinde Edge + `--use-angle=d3d11`; GPU'suz runner'da bu büyük olasılıkla **WARP** (Direct3D yazılımsal), SwiftShader yerel Linux denetiminde. Sonuç aynı: zamanlama ölçümü CI'da anlamsız, süre zaten 17–20 dk, iş sınırı 45 dk.                                                                     |

### 1.2 Araştırma ve dış iddialar

| İddia                                                                                                | Derece | Not                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keltner & Haidt (2003): huşunun iki çekirdeği vastness + accommodation                               | ✔      | Cognition & Emotion 17(2). "Büyüklük tek başına yetmez" yorumu makalenin "prototipik huşu" tanımıyla uyumlu. **Eksik uyarı:** huşu literatüründe ekran boyutu ve sürükleyicilik etkiyi belirgin büyütüyor; dizüstü ekranında "büyüklük" en zayıf kaldıraç, "uyum ihtiyacı" (dönüşüm, "bu nasıl oldu") en güçlüsü. Belgenin kahraman + ölçek kuralı bu yüzden tek başına yetmez.                                                  |
| Salimpoor ve ark. (2011): dopamin beklentide (kaudat) ve doruğda (çekirdek akumbens), iki ayrı bölge | ✔      | Doğru. Görsel beklentiye aktarılması **[çıkarım]** olarak işaretlenmiş; doğru davranılmış.                                                                                                                                                                                                                                                                                                                                       |
| Huron ITPRA: doğru tahmin kendi başına ödüllendirilir                                                | ✔      | "Prediction response" doğru özetlenmiş.                                                                                                                                                                                                                                                                                                                                                                                          |
| Ses–görüntü penceresi asimetrik; ses önce ~75–110 ms, görüntü önce ~190–270 ms                       | ✔      | Dixon & Spitz: çekiç 75/188 ms, konuşma 131/258 ms; ses önde pencere daha dar ve eğitilemez. Sonuç ("asla geç kalma, gerekirse erken") doğru. Ek: kısa flaş–tık uyaranlarında (strob) duyarlılık daha yüksek; strob için hedef ±1 kare olmalı.                                                                                                                                                                                   |
| Zavagno parlama yanılsaması; köken beyin kabuğu; hale büyüyünce etki artar                           | ≈      | Laeng & Endestad (2012, PNAS) ve Zavagno, Tommasi & Laeng (2017): yanılsama göz bebeğini daraltıyor; hareketli (dinamik) sürüm etkiyi ~2 kat artırıyor. "Köken göz değil beyin" ifadesi biraz kesin ama savunulabilir. **Pratik uyarı:** bloom'un aşırısı 2006 oyun estetiği gibi "ucuz" okunur; dozunu sahne değil kurgu defteri yönetmeli.                                                                                     |
| Shepard rampası build-up'ta kullanılır; dropta inen ses                                              | ≈      | Bazı prodüktörler kullanır; "build-up'larda yaygın teknik" demek abartı. Risers/white-noise sweep daha yaygın. Görsel karşılık fikri yine de geçerli.                                                                                                                                                                                                                                                                            |
| ILDA: lazer ışını ancak pus ile görünür                                                              | ✔      |                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Ryoji Ikeda _test pattern_ "saniyede yüzlerce kare"                                                  | ?      | YCAM sayfasına erişilemedi; "yüksek hızlı" yansıtma biliniyor ama "yüzlerce kare" doğrulanamadı. Yük taşıyan bir iddia değil; belgeden çıkarılabilir ya da "çok hızlı" denebilir.                                                                                                                                                                                                                                                |
| Revision 2025: PC demo _Melodice_/Damage, 64k _Tension_/DD & Aenima                                  | ≈      | Melodice iki kaynakta doğrulandı. 64k sonucu yine tek kaynak (geeks3d); belge bunu dürüstçe "doğrulayamadım" diye yazmış.                                                                                                                                                                                                                                                                                                        |
| Crutchfield (1984) video geri beslemesi                                                              | ≈      | Physica D makalesi doğru; "tepkime-yayılımla modelledi" ifadesi bir genelleme (makale yayılımlı dinamik sistem modeli öneriyor). Yük taşımıyor.                                                                                                                                                                                                                                                                                  |
| Anyma Sphere: Disguise, 100+ kişilik ekip; HOLO 24×11 m                                              | ?      | İkincil haber kaynakları; doğrulanamadı, yük taşımıyor.                                                                                                                                                                                                                                                                                                                                                                          |
| Synesthesia "41 ses değişkeni"                                                                       | ?      | Kaynak bir forum gönderisi; resmi belgede sayıyı görmedim.                                                                                                                                                                                                                                                                                                                                                                       |
| "Gerçek zamanlı görselleştiriciler yalnızca şimdiye tepki verir"                                     | ≈      | Tüketici çalarlar için doğru. Ama "şarkıyı baştan analiz edip geleceği göstermek" yeni bir fikir değil: **Audiosurf (2008)** yolu bütün şarkıdan önceden üretir, sakin kısım yokuş, yoğun kısım iniş; ritim oyunları (Guitar Hero otoyolu, Beat Saber) geleceği zaten gösteriyor; çevrimdışı müzik videosu üreticileri bütün parçayı önceden analiz eder. "Lyraska'dan başka kimse yapamaz" yerine "**çalarlarda** yok" denmeli. |

### 1.3 Donanım, API ve lisans iddiaları

| İddia                                                                                | Derece      | Not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Iris Xe 96EU ~1,7–2,3 TFLOPS, 23–37 Gpiksel/sn                                       | ≈           | 96 EU × 8 × 2 (FMA) × ~1,3 GHz ≈ 2,0 TFLOPS, doğru. **İki önemli eksik:** (1) FLOPS FMA'yı 2 sayar; "piksel başına 13 700 işlem" gerçekte ~6 800 komut (tavan) demek, %35 verimle ~2 400. Yarım çözünürlükte ~9 500. Belgedeki 48 adımlı ışın yürütme sonucu değişmiyor ama pay yarı yarıya küçük. (2) **Tek kanallı RAM'li dizüstülerde Iris Xe, "UHD Graphics" olarak <80 EU ile çalışır** (Intel destek makalesi 000094617). 8 GB tek modüllü ucuz dizüstüler çok yaygın; bunlar fiilen "Orta" katman. Ayrıca 15 W'ta birkaç dakika sonra ısıl kısma: bütçe soğuk ölçümle ≤ 8 ms tutulmalı.                                                                                            |
| Mobil bloom 10,3 ms → Iris Xe'de 1–1,5 ms                                            | ?           | Makul bir tahmin, ama ölçülmemiş; dürüstçe [çıkarım] işaretli.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `EXT_disjoint_timer_query_webgl2` Edge raporlarının ~%95'inde                        | ?           | Web3dsurvey'e bu oturumda erişilemedi; arama özetinde Windows raporlarının ~%86'sı, Chrome/Chromium raporlarının ~%72'si görünüyor. %95 doğrulanamadı, iyimser olabilir. Chrome'un zaman ölçümünü 2018'de (GLitch) kapatıp sonra mikro saniye çözünürlükle geri açtığı biliniyor. Sonuçlar 1–3 kare gecikmeli ve "disjoint" olunca atılmalı. Yedek (kare süresi) şart; belge bunu doğru öngörmüş. WARP'ta anlamsız.                                                                                                                                                                                                                                                                       |
| WebGPU: Edge/Chrome 113'ten beri Windows'ta; "Baseline"                              | ≈           | web.dev (25 Kasım 2025): Chrome/Edge 113, Firefox 141 (önce yalnızca Windows), Safari 26. MDN bazı sayfalarda hâlâ "Baseline değil" diyor. "Baseline" iddiası tartışmalı; "bütün büyük tarayıcılarda var" demek daha doğru.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| "WebView2'de varsayılan açık olduğu doğrulanamadı; Tauri 2023'te bayrak gerekiyordu" | ✖ (eskimiş) | Tauri #6381 (Mart 2023) Chromium 113 öncesine ait. WebView2 Windows'ta Edge ile aynı Chromium'u kullanan güncel (evergreen) bir çalışma zamanı; WebView2Feedback #4138'de (Kasım 2023) Microsoft deposunda "WebView2'de Windows'ta WebGPU çalışıyor" deniyor. Büyük olasılıkla varsayılan açık. Kesin doğrulama programın içinde `navigator.gpu` + `requestAdapter()` ile 10 dakikalık bir iş. **WebGL2'de kal kararı yine doğru**, ama gerekçe "doğrulanamadı" değil: "yeniden yazım maliyeti, mevcut WebGL2 altyapısı (fren, son işlem, check:scenes), Butterchurn'ün WebGL olması ve iki API'nin aynı GPU'da tam ekran parça gölgelendiricide belirgin bir hız farkı kanıtı olmaması". |
| AMD FSR1 MIT lisanslı                                                                | ✔           | `GPUOpen-Effects/FidelityFX-FSR/license.txt`: standart MIT metni, © 2021 AMD. Yine de gerekli değil (bkz. 3.4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Shadertoy varsayılanı CC BY-NC-SA, IQ makale kodu MIT                                | ✔           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| "AgX benzeri" ton eşleme                                                             | !           | Bir AgX yaklaşımı kopyalanırsa kaynağının lisansına bakılmalı (three.js uygulaması MIT). Dal zaten kendi eğrisini yazmış; en temizi onu geliştirmek.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Mathematical Marbling damla formülü `p' = c + (p−c)·√(1 + r²/                        | p−c         | ²)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | ✔   | Jaffer/Lu formülü, alan koruyan. Ters dönüşüm `c + (p−c)·√(1 − r²/ | p−c | ²)` ( | p−c | > r). Doğru. |
| Chladni kare plaka `cos(nπx)cos(mπy) − cos(mπx)cos(nπy)`, taneler `−∇(u²)`           | ≈           | Bilinen yaklaşım; koordinat aralığı ([0,1] mi [−1,1] mi) ve işaret (±) belirtilmeli, yoksa düğüm çizgileri yanlış yere düşer. Görsel için yeterli.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### 1.4 Belgenin iç tutarlılığı

- Başlık "On yeni sahne" ama 9 sahne + 1 modül var.
- Puan tablosunda "Sıra" sütunu toplamla çelişiyor (Usturlap 20 puanla 5., Kum 19 puanla 4.; Işık Ustası 19 puanla 1.).
  Yazar bunu açıkça gerekçelendirmiş, ama sonuç şu: ölçütler "Vay"ı yeterince ağırlıklandırmıyor ve "ucuz görünme
  riski" diye bir ölçüt yok. Önerim: Vay ×2, Koz ×1,5, ve yeni bir "ucuz görünme riski" (ters puan) sütunu.
- Güvenli mod tablosu (kesme serbest, 1–2 sn pozlama artışı) ile "bütün sahneler frenden geçsin" sigortası birbirini
  dışlıyor (bkz. 3.3).

---

## 2. Sahne sahne acımasız değerlendirme

Ölçek: dizüstü ekranında (14–16", 1080p, oturarak, 50–70 cm) gerçek etki. Festival değil. Maliyetler benim
tahminim: GPU = Yüksek katman, Iris Xe çift kanal, 1080p, ortak son işlem hariç. Emek = Claude PR'ı (bir PR ≈ bir
günlük oturum) + sahibin geri bildirim turları.

### 2.1 Işık Ustası: **güçlü fikir, yanlış kapsam**

- **Vay:** Işınlar pusta, kamera ışınların içinde, dropta levha açılıyor: dizüstünde de çalışır. Ama **"konser
  sahnesinin resmi"** (iskele, LED duvar, kalabalık silueti, havaya kalkan eller, çıkış lambası) dizüstünde "oyun
  içi konser" ya da "stok video" gibi okunur. Kalabalık silueti, ucuz görünmenin bir numaralı nedeni: tekrarlı
  siluetler ve vuruşa göre kalkan eller hemen "yapay" der. Gerçek lazer şovunun etkisi ışınların izleyicinin
  **etrafını** sarmasından gelir; ekranda bunu ancak kamerayı ışınların içine koyarak verebiliriz.
- **Öneri:** v1 = **"Işık Mimarisi"**: yalnızca pus, ışınlar, koniler, yansıyan zemin. Kalabalık, LED duvar,
  iskele, konfeti yok. Kamera ışın yelpazesinin içinde, ışınlar kameranın yanından geçer (paralaks = derinlik).
  Sahne öğeleri ancak sahibi "daha çok konser" derse v2'de.
- **Koz:** Çok iyi. Ölçü başına sönen ışın (8→1) en okunur geri sayım fikri.
- **Özgünlük:** Orta. "Sanal lazer şovu" görselleştiricilerde var; fark koreografinin zamanlamasında.
- **GPU:** Belgedeki 3–5 ms bütün öğelerle iyimser; benim tahminim 4–7 ms (özellikle ıslak zemin yansıması ikinci
  bir değerlendirme ister). Analitik ışın hesabı ucuz (96 ışın × ~30 işlem yarım çözünürlükte ~90 GFLOPS); asıl
  maliyet **ışın başına 3B gürültü okuması** (96 × 0,5 MP ≈ 50 M okuma/kare). Pus yoğunluğu piksel başına **bir kez**
  okunmalı, ışınlar ekran uzayında sınır kutusuyla elenmeli ya da ışınlar katkılı (additive) dörtgen olarak
  rasterlenmeli (maliyet kapladığı alanla orantılı). Yansıma: analitik ışını zeminin altına aynalayıp
  bulanıklaştırmak, ekran uzayı yansımasından çok daha ucuz. Işık Mimarisi kapsamında 2,5–4 ms gerçekçi.
- **Emek:** v1 ~2–3 PR (kurgu bağlantısı hariç).
- **Güvenli mod:** Zor ama yapılabilir: ışınlar yavaş, strob yok, parlaklık tavanlı. Hareketli ince parlak çizgiler
  yüksek karşıtlıklı desen sayılabilir: aynı anda görünen ışın sayısı ve karşıtlığı güvenli modda sınırlanmalı.
- **Lisans/IP:** Düşük risk. Belirli şovların imza düzenleri (Prydz'in hologram katmanları, Anyma'nın androidleri)
  kopyalanmamalı; genel ışın geometrisi serbest.
- **Ek uyarı:** 1/16 strob 128 BPM'de 8,53 Hz; 60 Hz ekranda 7/7/7/8 kare düzensiz örüntü verir. Strob evresi kare
  sayısından değil mutlak zamandan hesaplanmalı; kare kaçınca strob kaymamalı. 120/144 Hz ekranlar da düşünülmeli.

### 2.2 Zaman Vadisi: **en özgün kimlik, ama iki büyük tuzak**

- **Vay:** Uzakta parlayan drop dağı, yolun üstünde bekleyen sözler, sonda yukarıdan görülen şarkının tüm
  haritası: gerçek bir "bunu nasıl biliyor?" anı. Finaldeki "şarkının kartpostalı" çok güçlü.
- **Tuzak 1, eski sahneyle benzerlik:** Kaldırılan "Gece otoyolu"nda şerit çizgileri vuruşa, sokak lambaları ölçü
  başına kilitliydi (`src/lib/highway.ts` başı). Zaman Vadisi'nin "vuruşta pist lambası, ölçü başında büyük direk"
  eşlemesi bunun neredeyse aynısı. Sahibi o sahneyi sıkıcı buldu. Ayırıcı öğe lambalar değil, **önceden görülen
  arazi, drop dağı, sözler ve final haritası** olmalı. Lambalar ikincil kalmalı ya da tamamen çıkarılmalı.
- **Tuzak 2, Audiosurf:** "Yoğun kısımda dalış" mekaniği Audiosurf'ün (2008) yokuş/iniş mantığına çok yakın.
  IP sorunu yok (mekanik korunmaz), ama "özgün" iddiası yumuşatılmalı.
- **Tuzak 3, spektrum arazisi gürültülü ve "Unknown Pleasures" klişesi:** 32 bantlık ham özet doğrudan yükseklik
  olursa "spektrum dağları" (2000'lerin Winamp eklentileri) olur. Arazi daha az ve daha anlamlı veriden
  kurulmalı: bant enerjileri değil, **bölüm enerjisi + bas zarfı + parlaklık (spektral merkez)**, büyük ölçekte
  güçlü yumuşatma, küçük ölçekte prosedürel ayrıntı.
- **Koz:** En yüksek. Ama drop dağının güveni düşükse "dağ küçük" kuralı doğru; dropsuz şarkıda doruk ne olacak,
  tanımlanmamış (bkz. 3.2).
- **GPU:** 2–3,5 ms makul (131k köşe önemsiz).
- **Emek:** En yüksek: kamera eğrisi, arazi normalleştirme, 3B'de söz yerleşimi (Türkçe karakterler, uzun satır,
  hızlı rap), kemerler. ~4–5 PR + Rust komutu.
- **Güvenli mod:** İyi. Yanından geçen lambalar küçük alanlı, sorun değil; dalış eğimi tavanlı.
- **Lisans:** Temiz (OFL yazı tipinden SDF atlas).

### 2.3 Ebru: **en özgün ve en ucuz; "oha" riski var, güvenli mod iddiası yanlış**

- **Vay:** Tarağın tek ölçüde yüzlerce halkayı gelgit desenine çevirmesi gerçek bir "accommodation" anı; ebruyu
  ilk kez gören hep "vay" der. Ama giriş ve kıtada vuruş başına bir damla, dizüstünde "sakin sanat ekran koruyucusu"
  gibi kalabilir. Sahibi "o ışık şovunu istiyorum" dedi; Ebru'yu "oha" listesine sokan tek şey tarak ve kâğıt
  finali. Bu iki an prototipin ilk 20 saniyesinde gösterilmeli.
- **Koz:** Orta-yüksek: tarak dropta, kâğıt finalinde, 9/8'in kâğıtta iz bırakması çok güzel bir fikir.
- **Özgünlük:** En yüksek. Müzikle senkron ebru görselleştiricisi ben de bulamadım.
- **Teknik risk, bulanıklaşma:** Her olay bir yeniden örnekleme. 128 BPM'de 4 dakikada ~500 damla + taraklar.
  Bilinear örneklemenin her geçişte ~0,3 piksellik yayılması birikince 1024²'de σ ≈ √500 × 0,3 ≈ 6–7 piksel:
  desen belirgin yumuşar. Belgedeki "16 bit doku, keskin kenar korumalı örnekleme" bunu çözmez. Seçenekler:
  (a) son K olayı (ör. 32) piksel başına bileşik ters dönüşümle her karede analitik uygulamak, eskileri ara ara
  dokuya "pişirmek"; (b) 2048² renk indeksi dokusu + en yakın komşu + son geçişte kenar yumuşatma; (c) Lu ve
  ark.'nın çokgen sınırlı vektör yöntemi. Prototipte (a) öneririm.
- **Sarma (seek):** Desen geçmişe bağlı. Kullanıcı şarkının ortasına sararsa 0'dan t'ye bütün olaylar yeniden
  uygulanmalı (500 × 0,2 ms ≈ 100 ms; kabul edilebilir bir takılma). Belgede yok.
- **Güvenli mod, yanlış iddia:** "Doğası gereği parlamasız, en kolay güvenli sahne" doğru değil. Gelgit ve şal
  desenleri tanımı gereği **çok sayıda paralel, yüksek karşıtlıklı şerit**; tarak geçerken bu şeritler geniş alanda
  akar. Bu, desene duyarlı epilepside (ITU-R BT.1702 / Ofcom "zararlı desen") tam olarak kaçınılan durum. Güvenli
  modda boya gamının karşıtlığı (komşu boyalar arası bağıl parlaklık farkı ≤ ~0,1) ve tarak hızı sınırlanmalı.
  Bunlar `check:scenes`'in desen ölçümüyle denetlenmeli.
- **GPU:** 1–2,5 ms doğru.
- **Emek:** ~3 PR; asıl zorluk görünüm (boya dokusu, kitre suyu ışığı, kâğıt lifi). Gerçek ebru videolarıyla
  ayarlanmalı; belge bunu söylüyor.
- **Lisans:** Temiz. Makaleyi kendimiz uygularız; Amanda Ghassaei ya da Jaffer'in kodları kopyalanmaz.

### 2.4 Kum Plakası (Chladni): **iyi ikinci dalga sahnesi**

- Strobun havadaki taneleri dondurması varsayılan modda gerçekten etkileyici. Ama Chladni figürleri YouTube
  "cymatics" videolarıyla doymuş durumda; ilk görüşte "bunu gördüm" riski var. Ayırıcı öğe: figürün şarkı
  yapısıyla tırmanması ve dropta havaya fırlama.
- 1 piksellik nokta çizimi 1080p'de pırıltılı titreme (aliasing) yapar; taneler 1,5–2 piksel, yumuşak kenarlı
  çizilmeli. GPU 2–3,5 ms makul. Güvenli modda 250k parlak tanenin vuruşta zıplaması "kar pırıltısı" titremesi
  verebilir; parıltı güvenli modda kapatılmalı.
- Emek ~2–3 PR (parçacık altyapısı hazırsa).

### 2.5 Usturlap: **kâğıt üstünde güzel, ekranda en çok ucuz görünme riski**

- Fikir zarif (Camelot rete, 9/8 usul halkası en iyi aksak ölçü gösterimi). Ama pirinç, oyma, fırçalanmış metal
  ve alan derinliği ancak usta işçilikle inandırıcı olur; SDF + GGX ile ilk denemeler genellikle "plastik oyuncak
  saat" gibi durur. Ayrıca durağan, merkezi bir nesne: dizüstünde "vay" değil "hoş". Belgenin 4 puan Vay'ı
  iyimser; bence 3.
- GPU 2,5–4 ms makul, emek en yüksek gruptan (sanat yönetimi). IP riski yok. Lyra bağı güzel ama sahibi bunu
  önemsemedikçe puan getirmez. Sonraya.

### 2.6 Monolit: **küçümsenmiş**

- Dizüstünde en sinematik "ölçek" sahnesi: ıslak tuz düzlüğünde gökyüzü yansıması, dev blok, minicik insan, saç teli
  inceliğinde ışık yarığı → patlama. Islak düzlemin yansıması analitik (düzlem aynası), yani ucuz. Levhalar
  rasterlenmiş kutular. 2,5–4 ms. Karanlık–patlama kontrastını en saf biçimde kullanan sahne.
- Risk: "2001" çağrışımı (IP değil, klişe), sahnenin boş görünmesi. Bence Vay 4, Ucuzluk 4. Usturlap'ın önüne,
  Kum'la aynı sıraya koyarım.

### 2.7 Vitray: **kişisel, ama iki klişe**

- Kapağı kişisel kılması büyük artı. Ama "cam kırılma geçişi" eski bir video kurgu klişesi; gül penceresi de
  güçlü dinî çağrışım taşıyor. Kapağın Voronoi'ye bölünmesi düşük çözünürlüklü kapağı gizler, doğru.
- Daha iyi bir kapak sahnesi önerim bölüm 4.1'de (Kapak Tozu).

### 2.8 Olay Ufku: **çıkarılmalı**

- Sahibi uzay temasını açıkça sıkıcı buldu; Interstellar'ın Gargantua'sı herkesin aklına gelir; en pahalı sahne
  (yarım çözünürlükte bükülen ışın, 4–6 ms; UHD 620'de çalışmaz). Belge riskleri doğru saymış ama yine de listede
  tutmuş. Liste dışı bırakılmalı.

### 2.9 Sinyal: **yedek olarak doğru, sahne olarak Ikeda'ya fazla yakın**

- WARP/SwiftShader ve zayıf GPU için yedek olarak mantıklı (< 1 ms). Ama siyah-beyaz barkod + tek aralıklı veri +
  1/16 tersine çakma, Ikeda'nın _test pattern_/_datamatics_ imzasının ta kendisi. Üslup telifle korunmaz, ama
  yaşayan bir sanatçının imza işinin bu kadar yakın taklidi itibar riski ("kopya") taşır. Ayrıca Ikeda'nın bu
  işleri ışığa duyarlılık uyarısıyla sergilenir.
- Öneri: Sinyal'i "Ikeda" değil "**şarkı haritası panosu**" olarak tasarla: Lyraska'nın kendi tipografisi
  (Martian Mono, JetBrains Mono, pembe vurgu `#FF5A88`), renk tondan, barkod yerine şarkı haritası şeridi. Tersine
  çakma yalnızca "Çılgın" yoğunlukta.

### 2.10 Sözün Işığı (modül): **doğru karar, eksik bir kural**

- Sözleri sahneye gömmek doğru. Eksik: Türkçe uzun satırlar, hızlı rap ve çok kelimeli satırlar için yerleşim ve
  okunabilirlik kuralı (en fazla kaç harf, en küçük punto, karşıtlık). `estimated` bayrağı satır düzeyinde
  (`LyricLine.estimated`); belge doğru kullanıyor.

### 2.11 Benim puanlarım

Ağırlıklar: Vay ×2, Koz ×1,5, Özgünlük ×1, Güvenli ×1, Ucuzluk ×1, Ucuz görünme riski (ters: 5 = düşük risk) ×1.

| Sahne                                  | Vay | Koz | Özg. | Güv. | Ucuz. | Risk(ters) | Ağırlıklı |
| -------------------------------------- | --- | --- | ---- | ---- | ----- | ---------- | --------- |
| Işık Ustası (Işık Mimarisi kapsamında) | 5   | 5   | 3    | 3    | 4     | 4          | 31,5      |
| Zaman Vadisi                           | 5   | 5   | 4    | 4    | 2     | 3          | 30,5      |
| Ebru                                   | 4   | 4   | 5    | 3    | 4     | 4          | 30        |
| Monolit                                | 4   | 3   | 3    | 4    | 4     | 3          | 26,5      |
| Kum Plakası                            | 4   | 3   | 3    | 3    | 3     | 4          | 25,5      |
| Vitray                                 | 3   | 3   | 3    | 4    | 3     | 3          | 23,5      |
| Usturlap                               | 3   | 4   | 5    | 4    | 2     | 2          | 25        |
| Sinyal (pano olarak)                   | 2   | 5   | 2    | 3    | 5     | 3          | 24,5      |
| Olay Ufku                              | 4   | 2   | 1    | 4    | 1     | 2          | 19        |

---

## 3. Motor planı ve yapım sırası

### 3.1 İyi olanlar

- Kurgu defteri = olaylar + anahtar kareli kanallar + ileriye bakış (GNU Rocket mantığı). Doğru soyutlama.
- Olayların yumuşatılmaması, sürekli değerlerde hızlı yükseliş / yavaş düşüş.
- Dropta yükün önceden bilinip çözünürlüğün önceden düşürülmesi: güzel ve Lyraska'ya özgü.
- Son işlem dalını temel almak, eski sahneleri yenisi gelmeden silmemek.
- Güven düşükse vaat etmemek ("yanlış vaat, vaatsizlikten kötüdür"): projenin `meterConfidence` ilkesiyle uyumlu.

### 3.2 Eksik parçalar (önem sırasıyla)

1. **Dropsuz doruk.** `Climax{kind: drop | chorusEntry | energyStep | finalSection, strength}` gibi tek bir doruk
   olayı. Kaynak: güvenilir drop yoksa bölüm sınırında enerji sıçraması (`Section.energy` farkı), en yüksek enerjili
   etiketin son tekrarı. Geri sayım, boşluk ve açılım bu olaya bağlanmalı, yalnızca `Drop`'a değil. Sahibinin
   23 Ekim geri bildirimi de "drop gösterimi tam olmamış" diyor; bu, sahnelerin en sık yaşayacağı durum olacak.
2. **Analiz yokken canlı mod.** İlk açılışta (analiz bitene kadar) ve analiz başarısızsa: kurgu defteri boş,
   sahne `VisualFrame.bands/rmsDb` ile oynar; harita gelince kurguya yumuşakça geçer (sıçramadan). Testi olmalı.
3. **Sarma, duraklatma, şarkı geçişi.** Kurgu defteri `at(t)` saf olduğu için sarmada doğru. Ama simülasyonlu
   sahneler (Ebru, Kum, geri besleme, parçacıklar) geçmişe bağlı: her sahne "t'ye yeniden kur" (replay) ya da
   "yeniden yerleş" davranışını bildirmeli. Boşluksuz geçişte (gapless) bir sonraki şarkının kurgusuna nasıl
   geçileceği de tanımlanmalı.
4. **Sunum zamanı.** Olaylar kare başlangıcına değil **ekrana çıkış zamanına** göre örneklenmeli: `t_göster =
ses konumu + gecikme telafisi (visual_bridge) + boru hattı`. İki kare arasına düşen olay kaçırılmamalı ("olay
   mandalı": önceki ve şimdiki gösterim zamanı arasındaki her olay bu karede tetiklenir). Kare düşünce strob ve
   geri sayım evresi mutlak zamandan hesaplanmalı.
5. **DPR sınırı.** `gl.ts` DPR'yi 2'ye kadar kabul ediyor. 1440p/4K dizüstünde tuval 2560×1440 ya da 3840×2160
   olur; "1080p hedefi" sessizce aşılır. Sahne çözünürlüğü DPR'den bağımsız olarak **piksel sayısıyla**
   sınırlanmalı (ör. sahne ≤ 1,6 MP, son geçiş tuval boyunda).
6. **Arayüz camlarının maliyeti.** Stil dosyalarında 13 `backdrop-filter` var. Her karede değişen bir tuvalin
   üstündeki bulanık cam, tümleşik GPU'da her kare yeniden bulanıklaştırılır. Bu maliyet bütçeden ölçülmeli; gerekirse
   sinema görünümünde camlar kapatılmalı ya da cam bulanıklığı sahnenin bloom mip'lerinden (aynı tuvalde) verilmeli.
7. **Kendi donanımında görünür ölçüm.** CI'da zaman ölçümü anlamsız (WARP/SwiftShader). Test sürümüne gizli bir
   kısayolla açılan bir "ms ve ekran kartı adı" göstergesi eklenmeli. Sahibine "şu tuşa bas, ekrandaki sayıyı
   yaz" denebilir. **Sahibinin dizüstünün ekran kartı bilinmiyor; ilk iş bu öğrenilmeli.** Asıl hedef donanım o.
8. **Kurgu defteri belirlenimciliği.** Tohum ses parmak izinden gelirse analiz sürümü değişince (spektrum kareleri
   değişince parmak izi de değişir) koreografi de değişir. Tohum dosya içeriğinden bağımsız ve kararlı olmalı (ör.
   süre + vuruş sayısı + etiketlerden ya da dosya karmasından), sürümle değişen alanlar tohuma girmemeli. "Aynı
   girdi → aynı kurgu" için, verilen bir harita JSON'undan kurgu defterinin anlık görüntüsünü (snapshot) karşılaştıran
   bir test şart.
9. **Kurgu olayları nerede hesaplanmalı?** Belge saf TS öneriyor. Ama Yönetmen Rust'ta ve zaten `anticipation`,
   `release` üretiyor. TS'te ikinci bir "ne zaman ne olacak" mantığı iki doğruluk kaynağı yaratır. Önerim: **olay
   çıkarma Rust'ta** (`director/` altında `cue.rs`; boşluk, bas darbesi, doruk, geri sayım, cümle başları;
   cargo testli, ts-rs tipli, `song_timeline` içinde gelir). TS yalnızca kanallar ve anahtar kareler
   (sahneye özgü yorum). Bu, CLAUDE.md'deki "ağır iş ve analiz Rust'ta" kuralıyla da uyumlu. Gelecekte
   `director::Rhythm.anticipation` da aynı olay listesinden türetilebilir.

### 3.3 Güvenli mod mekanizması: düzeltilmesi gereken

- Fren, piksel başı mutlak değişimi blok başına `r_p·dt` ile sınırlar. Güvenli modda `r_p = 0,095/sn`. Yani:
  - Belgenin güvenli modda izin verdiği **kesme** fren içinde ~10 sn'lik bir erimeye döner.
  - **Hareketli ince parlak öğeler** (yavaş süpüren lazer, geçen lamba, zıplayan kum tanesi, söz harfleri) her
    karede pikselleri değiştirdiği için bulanık bir iz bırakır. Güvenli mod "bozuk" görünür.
- Projenin kendi dersi bunu zaten söylüyor (BILGI-BIRIKIMI §5): kendi sahnelerimizde koruma yapının içinde
  (`sceneLevel`, hız sınırlı), fren yalnızca güvenilmeyen içerik için.
- **Doğrusu:** (1) güvenli yorumlayıcı kanalları dönüştürür (strob → yok, patlama → mekânsal, kesme → yalnızca
  ortalama ve desen farkı küçükse), (2) parlaklık tek bir "pozlama" kanalından geçer ve hız sınırı orada uygulanır,
  (3) `check:scenes` her sahneyi güvenli modda frensiz ölçer; **fren bir test kâhini** (oracle) olarak kullanılır:
  "frenden geçmiş görüntü ile geçmemiş görüntü arasındaki fark ≈ 0" ise sahne kendiliğinden güvenlidir. Runtime
  sigortası istenirse, yalnızca ani bir aykırılıkta devreye giren gevşek bir bekçi olmalı; sürekli açık bir fren değil.
- Varsayılan modda: sahibinin kararı (sınır yok) saygı duyulacak bir karar. Yine de yoğunluk düğmesi önerisine
  katılıyorum; "Çılgın" dışında tam ekran doymuş kırmızı çakma kullanılmamasını öneririm (en riskli tür, estetik
  getirisi de az).

### 3.4 Aşırı mühendislik (ilk aşamada kesilmeli)

- **5 kalite katmanı + gizli tuvalde 2 sn ısınma ölçümü** → 2 katman (Yüksek / Düşük) + daldaki dinamik çözünürlük.
  Isınma ölçümü WebView2'de ilk açılışta GPU sürücüsü gölgelendirici derlerken yanlış sonuç verir.
- **Lens hayaletleri, anamorfik çizgi, FSR benzeri keskinleştirerek büyütme** → ertele. Gren ve mavi gürültüyle
  %75 çözünürlükten bilinear büyütme, müzik görselinde fark edilmez. Gerekirse 5 dokunuşlu karşıtlık uyarlamalı
  keskinleştirme (FSR1 MIT, ama EASU gereksiz).
- **WebGPU'ya hazır soyutlama** → gereksiz. YAGNI; CLAUDE.md da "ihtiyaç doğunca" diyor.
- **Sahne başına 6–12 çekim × 9 sahne** → ilk sahnede 3 çekim + 1 "büyük final" çekimi.
- **256k parçacık hedefi** → Ebru ve Işık Ustası parçacık istemiyor; transform feedback altyapısı Kum'a kadar
  ertelenebilir.

### 3.5 CI riski

- Windows sahne denetimi zaten ~17–20 dk, sınır 45 dk. 9 sahne × 2 mod × zamana bağlı parlama ölçümü bu sınırı aşar.
- Gereken: (a) `SceneV2.render(t)` **dışarıdan verilen sanal zamanla** çalışabilmeli (gerçek zaman değil), böylece
  CI düşük çözünürlükte, sabit adımlı, belirlenimci kareler üretir; (b) sahne başına kısa bir "en kötü an" penceresi
  (geri sayım + boşluk + doruk, ~10 sn) ölçülür, bütün şarkı değil; (c) ağır sahneler CI'da Düşük katmanda;
  (d) gerekirse sahne denetimi ikiye bölünüp paralel çalıştırılır (CI'daki Windows test işi gibi).

### 3.6 Daha iyi bir ilk kilometre taşı

Belgenin planı (E0–E7 + üç sahne, ~11 PR) sahibine gösterilmeden önce çok uzun. Önerim:

| #   | PR                                         | İçerik                                                                                                                                                                                                                                        |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Son işlem zincirini modül olarak birleştir | Daldaki `postChain`/`postProcess` + testleri. Eski galeriye bağlamak zorunlu değil (silinecekler). DPR/piksel sınırı burada.                                                                                                                  |
| M2  | `song_timeline` (Rust)                     | Vuruşlar; 60 kare/sn karelerden bas darbeleri ve boşluklar; doruk olayı (drop ya da enerji sıçraması); geri sayım için ölçü başları; arazi için 10 Hz yumuşatılmış özet. ts-rs, `check:commands`, cargo testleri (4/4, 9/8, dropsuz, sessiz). |
| M3  | Asgari kurgu defteri + Işık Mimarisi v0    | 3 kanal (pozlama, ışın sayısı, kamera itişi), 3 çekim, geri sayım → boşluk → doruk; strob kanalı; güvenli yorum; canlı mod yedeği; gizli ms göstergesi; `check:scenes` iki modda.                                                             |
| —   | **Sahibine gösterim**                      | Kendi dizüstünde, kendi 2–3 şarkısında (biri dropsuz Türkçe şarkı).                                                                                                                                                                           |
| M4+ | Geri bildirime göre                        | Zaman Vadisi, sonra Ebru; ortak modüller (SDF yazı, simülasyon) ihtiyaç doğdukça.                                                                                                                                                             |

Bu sırayla sahibi ~3–4 PR sonra gerçek bir şey görür. Kurgu defterinin en zor sorusu ("dropsuz şarkıda ne olacak")
da ilk günden test edilir.

---

## 4. Önerilen iyileştirmeler ve gözden kaçan fikirler

### 4.1 Yeni sahne fikirleri (en fazla üç)

1. **Kapak Tozu (kişisel heykel).** Albüm kapağı 150–250k parçacığa ayrılır (her parçacık kapağın bir pikselinin
   rengini taşır). Girişte kapak hafifçe nefes alır. Yükselişte parçacıklar ölçü ölçü bir girdaba çekilir (geri
   sayım: girdap her ölçüde bir tur daralır). Boşlukta tek bir parlak noktaya sıkışır. Dropta 3B bir heykele
   patlar: biçimi şarkıdan gelir (bölüm etiketlerine göre halka, sarmal, dalga yüzeyi). Final: parçacıklar yeniden
   kapağı kurar. **Neden güçlü:** dizüstünde "benim albümüm" tanıma anı (kişisel huşu), her albüm farklı görünür,
   GPU'da ucuz (transform feedback, 1,5–2,5 ms), güvenli modda kendiliğinden iyi (parlaklık değil hareket). Kapak
   yoksa mevcut "baskı kapak" (`printCover.ts`) kullanılır. Risk: "resimden parçacık" demo klişesi; fark kurguda.
   Vitray'ın yerine önerilir.
2. **Söz Klibi (kinetik tipografi sahnesi).** Sözlerin kendisi kahraman: profesyonel "lyric video" kurgusu,
   kendiliğinden. Kelimeler vurguda ekrana çarpar, nakaratın ana cümlesi dev puntoyla gelir, aksak ölçüde kelimeler
   grup başlarına kilitlenir, dropsuz şarkıda nakarat girişi doruk olur. Mevcut `LyricsOverlay` kinetik sözlerden
   farkı, tam ekran kompozisyon, 3B tipografi ve kamera. Türkçe pop ağırlıklı bir kütüphanede, **drop olmadan da**
   "vay" verebilecek tek sahne bu; ucuz (< 1,5 ms); sözü olmayan şarkıda sahne önerilmez. Risk: söz zamanlarının
   doğruluğuna bağlı (tahminiyse satır düzeyi).
3. **Geriye çözülen kamera (çapraz teknik, sahne değil).** Şarkı bilindiği için kamera yolu **doruktan geriye
   doğru** planlanabilir: "drop anında kamera tam şu açıda, şu nesnenin önünde olsun" denir, hız eğrisi geriye
   integre edilir. Böylece her sahne dropta kusursuz bir "kompozisyon kilidi" (nesne tam ekranın ortasına, tam
   karede oturur) yaşar. Gerçek zamanlı görselleştiricilerin yapamadığı, sinemanın "match cut"una denk düşen bir
   numara. Işık Ustası (ışın levhası tam dropta kameranın üstünde açılır), Zaman Vadisi (zirve tam dropta) ve
   Monolit'te kullanılabilir. Kurgu defterine `arriveAt(event, pose)` olarak eklenir.

### 4.2 Diğer somut öneriler

- Her sahnenin **ilk 10 saniyesi** başlı başına "vay" olmalı. Sahibi büyük olasılıkla sahneleri art arda
  değiştirerek deneyecek, dropu beklemeyecek. Bir "önizleme" modu (şarkının doruğuna 15 sn kala atla) sahiplerin
  sahne seçimini kolaylaştırır.
- Prototip gösteriminde aynı şarkının yanında **dropsuz bir Türkçe şarkı ve bir 9/8 şarkı** olmalı; yalnızca EDM ile
  sunmak yanıltıcı olur.
- Ton → renk eşlemesinde kütüphanenin zaten verdiği karar var: Camelot çarkı renk çemberine oturur
  (`--key-1…12`, BILGI-BIRIKIMI). Sahneler aynı 12 rengi kullanmalı; yeni bir eşleme icat edilmemeli. Belgenin
  "Oklab açısı 30° adım" önerisi bununla hizalanmalı.
- Puanlama ölçütlerine "ucuz görünme riski" ve "dropsuz şarkıda etki" eklenmeli.
- Olay Ufku listeden çıkarılmalı; Usturlap "sonra, sanat yönetmeni denetimiyle" diye işaretlenmeli.
- Belgede doğrulanamayan, yük taşımayan ayrıntılar (HOLO ekran ölçüsü, Sphere ekip sayısı, Synesthesia değişken
  sayısı, Ikeda kare hızı) kısaltılmalı. Bunlar sahibinin karar vermesine yardım etmiyor.
- Belge sahibi için yazılmış, ama 880 satır ve çok teknik. Sahibine bir sayfalık "neyi göreceksin, neye karar
  vereceksin" özeti ve her sahne için bir görsel (taslak kare ya da kısa video) verilmeli. Sahibi metinle değil
  görüntüyle karar veriyor (BILGI-BIRIKIMI: "seçenekleri gerçek boyutta, yan yana görsel olarak sun").

---

## 5. Sıralamam, ilk üç ve karar

**Sıralama:** 1. Işık Ustası (Işık Mimarisi kapsamında) · 2. Zaman Vadisi (lambasız, eski otoyoldan ayrışmış) · 3. Ebru · 4. Kapak Tozu (yeni) · 5. Söz Klibi (yeni) · 6. Monolit · 7. Kum Plakası · 8. Usturlap · 9. Sinyal (yalnızca
yedek/pano) · 10. Vitray (Kapak Tozu'yla yer değiştirsin) · — Olay Ufku (çıkar).

**İlk prototip için üçlü:** yazarla aynı sahneler, farklı kapsam ve sıra.

1. **Işık Mimarisi (Işık Ustası v0):** Sahibinin doğrudan istediği şey ("o ışık şovunu istiyorum"). Motorun asıl
   parçalarını sınar (HDR, bloom, hacim, strob, kurgu defteri). Kalabalık ve LED duvar olmadan daha ucuz, daha az
   "ucuz".
2. **Zaman Vadisi:** Lyraska'nın kimliği. Ama eski otoyolun lamba/şerit dilinden kesin olarak ayrılmalı ve arazi ham
   spektrumdan değil yumuşatılmış yapı verisinden kurulmalı.
3. **Ebru:** Tamamen farklı bir dil, en özgün sahne, ucuz. Tarak ve kâğıt finali prototipin önünde olmalı. Güvenli
   modu şerit karşıtlığı sınırıyla yeniden tanımlanmalı.

Yedek: sahibi Ebru'yu "sakin" bulursa yerine **Kapak Tozu**.

**Karar: ilerlenebilir, ama önce şunlar değişmeli (zorunlu):**

1. `BassHit` kaynağını düzelt: bas darbeleri ve boşluklar 60 kare/sn karelerden, Rust'ta.
2. Güvenli modda "bütün sahneler frenden geçsin" önerisini kaldır. Koruma yapının içinde, fren test kâhini.
   Ebru dahil "doğası gereği güvenli" iddialarını desen karşıtlığı ölçütüyle yeniden yaz.
3. Dropsuz doruk olayını (`Climax`) ve analiz yokken canlı modu motorun birinci sınıf parçası yap.
4. İlk kilometre taşını 3–4 PR'lık dikey dilime indir (M1–M3); sahibine kendi dizüstünde, kendi şarkılarıyla göster.
   Ondan önce sahibinin dizüstünün ekran kartını öğren.
5. Zaman Vadisi'ni eski "Gece otoyolu"ndan ayrıştır; Audiosurf benzerliğini ve "kimse yapamaz" iddiasını düzelt.
6. Sarma/duraklatma/gapless, sunum zamanı (olay mandalı), DPR piksel sınırı ve belirlenimci tohum kurallarını
   motor tasarımına ekle; `check:scenes` için sanal zaman ve "en kötü an penceresi" planla.
7. WebGPU bölümünü güncelle: WebView2'de büyük olasılıkla varsayılan açık; WebGL2'de kalma gerekçesi "kanıt yok"
   değil maliyet ve mevcut altyapı olmalı.

---

## 6. Kaynaklar

**Kod (yalnızca okundu):** `wt-sinir`: `src/lib/bindings/{SongMap,Section,DirectorFrame,Rhythm,Atmosphere,Texture,
LyricLine,LyricWord,KeyMap,VisualFrame}.ts`, `src-tauri/src/audio/bass.rs` (BassPeaks), `src-tauri/src/analysis/
{beats,cache,spectrogram,structure,fingerprint}.rs`, `src/lib/shaderSources.ts`, `src/lib/gl.ts`, `src/lib/highway.ts`,
`docs/MIMARI.md` (parlaklık freni), `docs/BILGI-BIRIKIMI.md` (§4–5, sahibin kararları), `.github/workflows/ci.yml`
(sahneler işi), `scripts/check-scenes.mjs`. `wt-sahne`: `src/lib/postChain.ts`, `src/lib/postProcess.ts`.

**Algı**

- Keltner & Haidt (2003), Approaching awe, Cognition & Emotion 17(2): https://pubmed.ncbi.nlm.nih.gov/29715721/
- Salimpoor ve ark. (2011), Nature Neuroscience: https://www.zlab.mcgill.ca/publications/docs/salimpoor_2011_nn.pdf
- Ses–görüntü pencereleri, ses önde dar ve eğitilemez pencere: https://pmc.ncbi.nlm.nih.gov/articles/PMC4915493/ ;
  Dixon & Spitz değerleri (özet): https://www.frontiersin.org/articles/10.3389/fpsyg.2015.00736/pdf ;
  https://pmc.ncbi.nlm.nih.gov/articles/PMC4744562
- Parlama yanılsaması ve göz bebeği (Zavagno, Tommasi & Laeng 2017; Laeng & Endestad 2012 PNAS 109(6):2162–2167):
  https://pmc.ncbi.nlm.nih.gov/articles/PMC5555513/ ; https://www.tut.ac.jp/english/introduction/docs/pr20190808_suzuki.pdf

**Donanım ve API**

- Intel, tek kanallı bellekte Iris Xe = UHD Graphics: https://www.intel.com/content/www/us/en/support/articles/000094617/graphics.html ;
  https://www.intel.com/content/www/us/en/support/articles/000059744.html
- Zaman ölçümü eklentisi: https://web3dsurvey.com/webgl2/extensions/EXT_disjoint_timer_query_webgl2 (bu oturumda
  doğrudan açılamadı; oranlar arama özetinden) ; Chrome'un 2018 kapatma/çözünürlük tartışması:
  https://www.khronos.org/webgl/public-mailing-list/public_webgl/1805/msg00010.php
- WebGPU tarayıcı desteği (25 Kasım 2025): https://web.dev/blog/webgpu-supported-major-browsers
- WebView2'de WebGPU (Windows'ta çalışıyor, Kasım 2023): https://github.com/MicrosoftEdge/WebView2Feedback/discussions/4138 ;
  eski bayrak tartışması (Mart 2023): https://github.com/tauri-apps/tauri/issues/6381 ;
  https://github.com/MicrosoftEdge/WebView2Feedback/issues/1285
- AMD FSR1 lisansı (MIT): https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/master/license.txt

**Benzer işler ve önceller**

- Audiosurf (2008): sakin kısım yokuş, yoğun kısım iniş: https://www.gamespot.com/audiosurf/reviews/audiosurf-review-6189185 ;
  https://www.pcgames.de/Audiosurf-Spiel-18404/Specials/Unser-Interview-mit-dem-Audiosurf-Schoepfer-Dylan-Fitterer-632002/2/
- Revision 2025 sonuçları: https://glslhacker.geeks3d.com/20250422/demoscene-revision-2025 ;
  https://discourse.panda3d.org/t/melodice-by-damage-1st-place-at-revision-2025-pc-demo-competition/31057

**Desen hassasiyeti (güvenli mod)**

- ITU-R BT.1702 / Ofcom zararlı desen tanımları: projenin `docs/MIMARI.md` parlaklık freni bölümünde özetlendiği
  biçimiyle (koyu–açık farkı ≥ ~0,1 bağıl parlaklık, çok şeritli, titreyen/akan desen).
