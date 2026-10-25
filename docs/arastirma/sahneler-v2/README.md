# Lyraska Sahneler v2: "oha, vay be" dedirtecek yeni görseller

Tarih: 24 Ekim 2026 · Hazırlayan: Claude (araştırma + tasarım; depoda hiçbir şey değiştirilmedi)
Kimin için: proje sahibi (yazılımcı değil). Teknik terimler parantez içinde kısaca açıklanıyor. Kod adları İngilizce
kalabilir. **[çıkarım]** = kendi yorumum ya da tahminim; kaynaklı bilgiler sondaki listede.

Önceki araştırma (`docs/arastirma/gorsel-vay-arastirma.md`, 23 Ekim) güvenlik sınırları içinde "nasıl
güzelleştiririz" sorusunu yanıtlamıştı: son işlem zinciri, tondan palet, beklenti ve açılım. Bu belge onu
tekrarlamıyor, üstüne kuruyor. Değişen iki şey var:

1. **Varsayılan modda parlama sınırı kalktı** (24 Ekim kararı). Artık stroboskop (çakar ışık), tam ekran
   patlama ve hızlı lazer serbest. Epilepsi güvenli modunda her sahnenin sakin bir sürümü olacak.
2. **Bütün eski sahneler değişecek.** VU ibreleri ve gece sürüşü tamamen kalkıyor. Yalnızca MilkDrop ve
   "Kendi resmin" kalıyor.

---

## İçindekiler

1. [Kısa teşhis: bugünkü sahneler neden sıkıcı?](#1-kısa-teşhis-bugünkü-sahneler-neden-sıkıcı)
2. ["Vay be" etkisinin ilkeleri (araştırma)](#2-vay-be-etkisinin-ilkeleri-araştırma)
3. [Motor önerisi: bütün yeni sahnelerin ortak altyapısı](#3-motor-önerisi-bütün-yeni-sahnelerin-ortak-altyapısı)
4. [On yeni sahne](#4-on-yeni-sahne)
5. [Sıralama, ilk üç ve yapım sırası](#5-sıralama-ilk-üç-ve-yapım-sırası)
6. [Proje sahibinin vereceği kararlar](#6-proje-sahibinin-vereceği-kararlar)
7. [Kaynaklar](#7-kaynaklar)

---

## 0. Tek paragrafta öneri

Önce **ortak bir sahne motoru** kurulur: sahne kayan noktalı bir ara görüntüye çizilir (HDR: ekranın
gösterebileceğinden daha parlak değerleri saklayabilen görüntü). Sonra ışık taşması (bloom), hacimli ışık,
ton eşleme ve gren eklenir. Motorun kalbi bir **"kurgu defteri"** olur (cue sheet: konser ışıkçılarının
zaman kodlu ipucu listesi gibi). Şarkı haritasından otomatik doldurulur: bölüm başları, droptan önceki geri
sayım, drop anı, sessizlik boşluğu, ton değişimi, şarkı sözünün her kelimesi. Sahneler bu deftere göre
"oynar". Sonra on sahne tasarlandı. İlk prototip için üçünü öneriyorum:

- **Işık Ustası:** sanal bir konser sahnesi. Lazerler, hareketli ışıklar, LED duvar ve dumanlı hava var. Işık
  şovu şarkıyı önceden bilen bir ışık yönetmeni tarafından programlanmış gibi oynar.
- **Zaman Vadisi:** şarkının tamamı önümüzde uzanan bir manzara. Drop ufukta bir dağ sırası olarak
  yaklaşırken görünür, şarkı sözleri yolun üstünde bekler ve söylendiği anda tutuşur.
- **Ebru:** gerçek ebru sanatının matematiği. Vuruşlarda suya boya damlar, dropta tarak geçer, şarkının
  sonunda desen kâğıda alınır.

---

## 1. Kısa teşhis: bugünkü sahneler neden sıkıcı?

`src/lib/shaderSources.ts` (10 galeri sahnesi), `shaderRenderer.ts` ve `director/mod.rs` okunarak:

| #   | Gözlem                                                                                                                                                                                                | Koddaki kanıt                                                                                                                                                                    | Sonuç                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | **Hepsi "kartpostal".** Ay ve deniz, kum tepesi, orman kıyısı, yağmurlu cam. Hepsi sabit kamerayla bakılan durgun bir manzara.                                                                        | `sea`: `moon` sabit koordinatta; `dunes`: `moon = vec2(-0.45, 0.3)`                                                                                                              | Ekran koruyucu hissi verir, gösteri hissi vermez. Müzik değişse de kompozisyon hiç değişmez.                       |
| 2   | **Müzik biçimi "birkaç yüzde" değiştiriyor.**                                                                                                                                                         | Dosya başı kuralı: "Enerjiler biçimi en fazla birkaç yüzde değiştirir". Örnek: `swell = 0.6 + 0.4*uEnergy.x`, `r * (1.0 + 0.04*uEnergy.x)` (tünelde bas yalnızca %4 etki ediyor) | Sesi kapatınca fark edilmiyor. Bu kural güvenlik için konmuştu; o sınır artık varsayılan modda yok.                |
| 3   | **10 sahnenin 7'si aynı malzemeden yapılmış:** değer gürültüsü (fbm, bulutumsu rastgele desen).                                                                                                       | `fbm`, `fbm3`, `noise` hemen hepsinde var                                                                                                                                        | Bulutsu, galaksi, tünel ve kaleydoskop aynı "bulanık leke" dokusunu taşıyor. Göz bir kez görünce gerisini tanıyor. |
| 4   | **İki renk.** Her sahne yalnızca `uLow` ve `uHigh` arasında karışım yapıyor, palet de bölüm temasından geliyor.                                                                                       | `mix(uLow, uHigh, …)` her yerde                                                                                                                                                  | Ton (Camelot) kullanılmıyor. Işık ile gölge arasında sıcaklık farkı yok.                                           |
| 5   | **Işık yok, yalnızca renk var.** Tek geçiş, HDR yok, bloom yok. Sonuç `clamp(col, 0, 1)` ile kesiliyor. Değerler çoğunlukla 0,05–0,35 aralığında.                                                     | `MAIN`: `outColor = vec4(clamp(col,0,1),1)`                                                                                                                                      | Hiçbir şey "yanmıyor". Göz parlaklığı karşıtlıktan ve haleden algılar (bkz. 2.4). Burada ikisi de yok.             |
| 6   | **Olay yok.** Drop yalnızca yakınlaştırmayı ±%30 değiştiriyor (`uTension`, `uBloom`). Vuruş nabzı (`pulse`) gölgelendiriciye hiç gitmiyor. Ölçü başı yalnızca iki sahnede ince bir dalga (`uRipple`). | `UNIFORMS` listesinde `pulse`, `beatPhase`, `section` yok                                                                                                                        | Lyraska'nın en büyük kozu, yani şarkıyı önceden bilmek, ekranda görünmüyor.                                        |
| 7   | **Kamera, derinlik ve kurgu yok.** 3B nesne, parçacık ya da kesme yok. Bölüm değişince sahne aynı kalıyor.                                                                                            | Bütün sahneler `scene(uv, p)` biçiminde 2B                                                                                                                                       | 4 dakikalık şarkıda 4 dakika aynı görüntü.                                                                         |

**Özet:** Sorun ince ayar değil, mimari. Sahneler "müziğe hafifçe tepki veren duvar kâğıdı" olarak tasarlanmış.
Yeni sahneler **"şarkıyı ezbere bilen bir ışık ve kamera ekibinin canlı şovu"** olarak tasarlanmalı.

---

## 2. "Vay be" etkisinin ilkeleri (araştırma)

### 2.1 Huşu = büyüklük + "bu nasıl oldu?"

Keltner ve Haidt'in (2003) huşu (awe) tanımında iki çekirdek var: **algılanan büyüklük** (vastness) ve
**uyum ihtiyacı** (accommodation). İkincisi, deneyimin zihindeki kalıplara sığmaması demek. Yazarlara göre
büyüklük tek başına yetmez; zihin "bunu anlayamadım" demeli.
**Lyraska için anlamı [çıkarım]:**

- **Ölçek:** ekranda bir ölçek ipucu olmalı (insan silueti, kalabalık, minicik bir figür). Dev nesne ancak
  onunla kıyaslanınca dev görünür. Anyma'nın Sphere gösterisinde insanın üstünde yükselen dev androidler, Eric
  Prydz'in HOLO'sunda iki katmanlı ekranla oluşturulan derinlik bu ilkenin sahne karşılıkları.
- **Dönüşüm:** sahne şarkı boyunca **kendi kuralını bozmalı**. Dropta monolit parçalanır, ebrunun düzgün
  halkalarından tarak geçer, kum bir anda havaya fırlar. "Bu nasıl oldu?" duygusu dönüşümden gelir.

### 2.2 Beklenti ödülü: Lyraska'nın asıl kozu

- Salimpoor ve arkadaşları (Nature Neuroscience, 2011), PET taramasıyla müzikte **dopaminin iki ayrı anda**
  salındığını ölçtü: zirveden önceki **beklentide** ve zirvenin kendisinde. İki an beyinde farklı bölgelerde
  gerçekleşiyor.
- Huron'un ITPRA kuramına (Sweet Anticipation) göre beklentinin bir **"tahmin tepkisi"** var: tahmin doğru
  çıkınca beyin kendini ödüllendirir. Bu ödül olaydan bağımsız, tahminin doğruluğuna verilir.
- Prodüktörlerin **Shepard rampası** (hiç bitmeden yükseliyormuş gibi duyulan ses yanılsaması) build-up'ta
  gerilimi sürekli tutmak için kullanılıyor. Dropta da çoğunlukla aşağı inen bir "çözülme" sesi geliyor.

**Sonuç [çıkarım]:** Gerçek zamanlı görselleştiriciler (MilkDrop, NestDrop, Synesthesia, Magic) yalnızca o
anki sese tepki verir. NestDrop'un belgelediği şey "vuruş algılayınca preset değiştir"; Magic'in forumunda
kullanıcılar sahne geçişini elle saniye girerek zamanlıyor. Lyraska ise **gerilimi görünür biçimde kurup tam
dropta çözebilir.** Gözün "şimdi patlayacak" tahmini birebir doğrulanır, yani ITPRA'daki tahmin ödülü
devreye girer. Her yeni sahnenin bir **görsel Shepard rampası** (bitmeyen yükseliş: sonsuz yakınlaşma, sürekli
tırmanan ışık, berber direği gibi dönen çizgiler) ve bir **görsel çözülmesi** olmalı.

### 2.3 Eşzamanlılık: kare kare doğru olmak

- Ses ile görüntü arasındaki "aynı anda" penceresi asimetriktir. **Ses görüntüden önce gelirse** fark çok daha
  çabuk sezilir (basit uyaranlarda ~75–110 ms, müzisyenlerde daha dar). Görüntü önce gelirse ~190–270 ms'ye
  kadar tolerans var.
- **Sonuç:** Vuruş anındaki ışık **asla geç kalmamalı**. Gerekirse bir kare erken gelmesi daha iyi. Lyraska'nın
  hedefi ±20 ms ve gecikme telafisi zaten var (`visual_bridge`). Yeni motorda "olay" niteliğindeki değişimler
  (strob, kesme, patlama) yumuşatılmamalı. Olay, olayın çakıştığı karede başlamalı, ardından üstel olarak
  sönmeli.
- Ryoji Ikeda'nın _test pattern_ işi tek renkli barkodları sesle **sıkı eşzamanlı** ve saniyede yüzlerce kare
  hızında gösteriyor. Karmaşıklık değil, **kusursuz eşzamanlılık** etkiliyor. Bu, en ucuz donanımda bile "vay"
  dedirtmenin yolu (bkz. Sinyal sahnesi).

### 2.4 Işık, karanlık ve hava

- **Parlama yanılsaması** (Zavagno): çevresi koyuya doğru sönen bir hale ile sarılmış beyaz alan, aynı
  parlaklıktaki düz beyazdan **daha parlak** ve kendinden ışıklı görünür. Etkinin kaynağı göz değil, beyin
  kabuğu. Hale zamanla büyüyünce etki artıyor. Yani **bloom bir süs değil**: ekranın en beyaz değerinden daha
  parlak ışık algısını yaratan tek araç. Dropta hale yarıçapını büyütmek bu yüzden işe yarıyor.
- **Duman ışını görünür kılar.** ILDA'ya göre lazer ışını havada ancak duman ya da pus varsa görünür. İnce ve
  eşit dağılmış pus düzgün ışın verir, yoğun duman deseni bozar. Gerçek zamanlı grafikte bunun karşılığı
  **hacimli ışık** (volumetric light). Lazer ve spot sahnelerinde ışığın kendisi kadar önemli.
- **Karanlık bir araçtır.** Ekranın %60'ı sakin ve koyu olmalı (önceki araştırma). Varsayılan modda yeni bir
  araç daha var: **droptan hemen önceki sessizlikte karartma**. Pek çok elektronik şarkıda dropun öncesinde bir
  vuruş ya da bir ölçü boşluk olur. O anda ekranın kararması ve ardından patlaması, en güçlü kontrastı verir
  [çıkarım].

### 2.5 Profesyonel şovlar zaman koduyla programlanır

- Büyük konser ve festival şovlarında ışık ve video **zaman kodlu ipuçlarıyla** önceden programlanır.
  Anyma'nın Sphere gösterisinde senkron Disguise gibi zaman kodlu yazılımlarla yapılmış; ekip 100 kişiyi
  geçiyor. Prydz'in HOLO'su 24×11 m'lik LED ekranın önünde ikinci, saydam bir ekranla katmanlı derinlik
  kuruyor.
- Resolume'un BPM senkronunda "Resync" komutu her şeyi "ilk cümlenin ilk ölçüsünün ilk vuruşuna" döndürüyor.
  Yani VJ dünyası da **cümle (phrase) düzeyini** önemsiyor.
- Synesthesia gölgelendiricilere 41 ses değişkeni veriyor: bas, orta, orta-tiz, tiz bantları ve vuruş. Bunların
  hepsi "şimdi"yi anlatıyor.
- Demoscene'de (Revision 2025 PC demo birincisi _Melodice_ / Damage, 64k birincisi _Tension_ / Digital
  Dynamite & Aenima) müzik baştan bilinir. Kamera, kesme ve vurgu elle koreografe edilir (önceki araştırmada
  GNU Rocket).
- **Sonuç:** Lyraska'nın kurgu defteri, **100 kişilik ekibin elle yaptığını şarkı haritasından otomatik
  yapan** bir yönetmen olmalı.

### 2.6 Organik karmaşıklık: geri besleme ve simülasyon

- Crutchfield (1984), kameranın kendi monitörünü çekmesiyle oluşan video geri beslemesinin karmaşık ve
  canlı desenler ürettiğini gösterdi; bunu tepkime-yayılım (reaction-diffusion) denklemleriyle modelledi.
  MilkDrop'un canlılığı da bu ilkeden geliyor.
- Gerçek fizik kuralları (sıvı, kum, mürekkep) göze "doğru" gelir. Doğanın kuralını tanıyan göz, onu ekranda
  görünce şaşırır. Gray-Scott tepkime-yayılım modeli (Karl Sims), Harris'in GPU akışkan yöntemi (GPU Gems 38)
  ve ebrunun matematiği (Lu, Jaffer ve ark., IEEE CG&A 2012) bunun için kullanılabilir.

### 2.7 Büyük platformlar neden sakin?

Önceki araştırmada görüldü: Apple Music ve Spotify Canvas yanıp sönmeyen, kapağa sadık, yavaş görseller
istiyor. Bu, **güvenli mod için doğru dil**. Yeni sahnelerin sakin sürümü bu dili kullanır: hareket ve renk
akışı var, parlaklık sıçraması yok.

### 2.8 Bu ilkelerden çıkan 10 tasarım kuralı (her yeni sahnenin kontrol listesi)

1. **Kahraman + ölçek:** tek bir kahraman öğe ve onu dev gösteren bir ölçek ipucu.
2. **Dönüşüm:** sahne her dropta kendi kuralını bir kez bozar (parçalanma, açılma, yön değişimi).
3. **Görünür geri sayım:** dropa 8 ölçü kala izleyici sayabileceği bir şey görür (ışık sayısı azalır, dağ
   yaklaşır, halka kapanır).
4. **Kare kare isabet:** olaylar (strob, kesme, patlama) tam vuruş karesinde başlar, yumuşatılmaz.
5. **Karanlık–patlama kontrastı:** dropa giden sessizlikte karartma (varsayılan mod).
6. **Işık = HDR + bloom + hava:** en parlak nokta gerçekten "yanar", ışınlar pusta görünür.
7. **Kurgu:** her bölümde kamera ya da kompozisyon değişir. İkinci nakarat birinciden büyüktür.
8. **Tondan palet:** şarkının tonu rengi belirler, ton değişince renk kayar.
9. **İki hız:** yavaş akış (enerji, bölüm) ve keskin olay (vuruş, drop). Aynı anda en fazla iki katman
   vuruşla oynar.
10. **Güvenli ikiz:** aynı koreografinin parlamasız, yavaş sürümü (bkz. 3.5).

---

## 3. Motor önerisi: bütün yeni sahnelerin ortak altyapısı

### 3.1 Genel resim

```
Şarkı açılır
  └─ Rust: analiz (zaten var) + YENİ "song_timeline" komutu (vuruşlar, 10 Hz özet spektrum, bas tepeleri)
       └─ TS: Kurgu Defteri (CueSheet) kurulur ── saf fonksiyon, test edilir
            └─ Her karede: VisualFrame (zaten var) + CueSheet.at(t) → SceneInput (kanallar)
                 └─ Sahne v2: simülasyon geçişleri → HDR sahne → (geri besleme) → (hacimli ışık)
                      └─ Ortak son işlem: bloom → lens → ton eşleme + renk → strob/pozlama → titretme + gren → ekran
                           └─ Güvenli modda: güvenli yorumlayıcı + parlaklık freni (flashGuard) sigortası
```

### 3.2 Geçişler, ara görüntüler ve bütçe (entegre GPU, 1080p, 60 fps)

**Donanım gerçekleri (Intel Iris Xe 96EU, hedef sınıf):** ~1,7–2,3 TFLOPS (FP32), piksel doldurma
23–37 Gpiksel/sn, 15 W, bellek sistem RAM'iyle paylaşımlı.
**Hesap [çıkarım]:** 1,7 TFLOPS ÷ (1920×1080 piksel × 60 kare) ≈ piksel başına karede **~13 700 işlem**
(kuramsal tavan). Gerçekte %30–40 verimle ~4 500 işlem. Yarım çözünürlükte (piksel sayısının dörtte biri)
~18 000. Yani 48 adımlı ışın yürütme (SDF raymarching; nesnelere ışın göndererek çizme) ancak yarım
çözünürlükte rahat sığar. Tam çözünürlükte yalnızca son işlem yapılmalı.

Kare süresi 16,6 ms. Arayüzün cam katmanları (bulanık arka plan) ve WebView2'nin kendi birleştirmesi için pay
bırakarak **GPU hedefi ≤ 11 ms**.

| Geçiş                                                                                                                                               | Çözünürlük                                 | Ara görüntü biçimi                                                | Bütçe (Iris Xe, tahmin) | Hangi sahnelerde                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- | ----------------------- | ------------------------------------------ |
| 0. Simülasyon (parçacık / sıvı / ebru / kum)                                                                                                        | 256²–1024² ya da 64k–256k parçacık         | RGBA16F ping-pong, transform feedback tamponu                     | 0–2,0 ms                | Ebru, Kum, Monolit, Işık Ustası (duman)    |
| 1. Sahne                                                                                                                                            | Dinamik %50–100 (ışın yürütmede %50 sabit) | RGBA16F (destek varsa R11G11B10F: yarı bant genişliği) + derinlik | 3–6 ms                  | hepsi                                      |
| 2. Geri besleme / iz                                                                                                                                | yarım                                      | RGBA16F ×2                                                        | 0,3–0,6 ms              | Işık Ustası (lazer izi), Sinyal, Olay Ufku |
| 3. Hacimli ışık (ışın huzmeleri)                                                                                                                    | çeyrek                                     | RGBA16F                                                           | 0,5–1,0 ms              | Monolit, Vitray, Usturlap, Işık Ustası     |
| 4. Bloom (mip zinciri, 5–6 seviye)                                                                                                                  | yarımdan başlayarak                        | RGBA16F                                                           | 0,8–1,5 ms              | hepsi                                      |
| 5. Lens: kenarda renk sapması, yatay "anamorfik" çizgi, hayalet parlama                                                                             | tam / bloom mip'lerinden                   | —                                                                 | 0,2–0,4 ms              | seçmeli                                    |
| 6. Birleştirme: pozlama, ton eşleme (AgX benzeri), Oklab renk derecelendirme, vinyet, strob, mavi gürültü titretme + gren, keskinleştirerek büyütme | tam                                        | ekran                                                             | 0,6–1,0 ms              | hepsi                                      |
| **Toplam**                                                                                                                                          |                                            |                                                                   | **~6–11 ms**            |                                            |

Notlar:

- **Bloom ölçümü:** önceki araştırmada mobil GPU'da mip zinciri bloom 10,3 ms ölçülmüş, en hızlı yöntem bu.
  Iris Xe mobilden birkaç kat güçlü, 1–1,5 ms beklenir [çıkarım].
- **`sahne-son-islem` dalı** (5a8a980, 1934023) bunun çekirdeğini zaten yazmış: RGBA16F ara görüntü, dinamik
  çözünürlük, 13 dokunuşlu küçültme ve çadır büyütme ile bloom, tonu koruyan ton eşleme, renk sıcaklığı,
  program içinde üretilen void-and-cluster mavi gürültü. **Yeni motor bunu temel alır, baştan yazmaz.**
  Eksikler: hacimli ışık, geri besleme tamponu, lens, strob ve pozlama kanalı, derinlik tamponu (yeni sahnelerde
  3B geometri var; `gl.ts` bağlamı şu an `depth: false` açıyor, ara görüntüye ayrı derinlik eklenir),
  keskinleştirerek büyütme.
- **Büyütme:** AMD FSR1 (EASU kenar uyumlu büyütme + RCAS keskinleştirme) açık kaynak; MIT lisanslı olduğu
  biliniyor ama bu oturumda doğrulayamadım. Eklemeden önce depodaki LICENSE dosyasına bakılmalı. En temizi
  "karşıtlığa uyarlanan keskinleştirme" fikrini kendimiz yazmak (tek geçiş, 5 dokunuş).
- **Parçacıklar:** WebGL2'nin "transform feedback" özelliği (köşe gölgelendiricisinin sonucu bir tampona geri
  yazması; bilgisayar gölgelendiricisinin yerine geçer) ile 64k–256k parçacık. Ölçüm olarak yalnızca eski bir
  dizüstünde (GTX 460M, ayrık kart) 1,2 milyon parçacığın 60 fps'de güncellenip çizildiği raporu var. Iris Xe
  için 256k gerçekçi bir tavan [çıkarım; ilk PR'da ölçülmeli].
- **Ölçüm:** `EXT_disjoint_timer_query_webgl2` (GPU'da geçen süreyi ölçen eklenti) web3dsurvey verisine göre
  Edge raporlarının ~%95'inde var. Motor her geçişin süresini bununla ölçer. Eklenti yoksa kare süresine bakar.

### 3.3 Kalite katmanları ve zayıf GPU yedeği

| Katman                                               | Ne zaman                  | Sahne çözünürlüğü    | Parçacık | Işın yürütme adımı | Bloom seviyesi | Hacimli ışık                                   |
| ---------------------------------------------------- | ------------------------- | -------------------- | -------- | ------------------ | -------------- | ---------------------------------------------- |
| **Ultra**                                            | ayrık kart                | %100                 | 256k     | 96                 | 6              | yarım çöz., 64 örnek                           |
| **Yüksek** (hedef: Iris Xe)                          | varsayılan                | %75 (dinamik 60–100) | 128k     | 64                 | 6              | çeyrek, 48                                     |
| **Orta**                                             | eski Intel UHD 620 sınıfı | %60                  | 64k      | 40                 | 5              | çeyrek, 32                                     |
| **Düşük**                                            | çok zayıf / pil           | %50                  | 32k      | 24                 | 4              | kapalı (sahte ışın dokusu)                     |
| **Yazılımsal** (SwiftShader/WARP, `data-gpu-caveat`) | ekran kartı yok           | %35                  | 8k       | 16                 | 3              | kapalı. Ağır sahneler yerine "Sinyal" önerilir |

- **Otomatik seçim:** İlk açılışta 2 saniyelik ısınma ölçümü yapılır (görünmeyen tuvalde Işık Ustası'nın bir
  karesi). Sonuç ekran kartı adıyla birlikte tarayıcı deposunda saklanır. Kullanıcı Ayarlar'dan değiştirebilir.
- **Dinamik çözünürlük:** basit bir PI denetleyici (kare süresini hedefte tutan geri beslemeli ayar), önceki
  araştırmada önerilmişti ve dalda başlanmış. Sahne çözünürlüğünü 0,5 sn'de bir ±%5 adımla oynatır. Dropta
  yük artacağı **önceden bilindiği için** çözünürlük droptan 1 ölçü önce düşürülür, kare kaçmaz. Bu da
  Lyraska'ya özgü bir numara [çıkarım].
- **Her sahne katman başına "düğmeler" bildirir** (parçacık sayısı, adım, efekt aç/kapa). Motor bunları
  katmana göre ayarlar.

### 3.4 Kurgu defteri (CueSheet): şarkı haritası sahneye nasıl bağlanır?

Bugün Görsel Yönetmen (`director/mod.rs`) her kare için 10 değer üretiyor: `mood, warmth, pulse, accent,
beat_phase, bar_phase, anticipation, release, detail, motion`. Bunlar "şimdi"yi anlatıyor. Yeni sahnelerin
ihtiyacı ise **"ne zaman, ne olacak"** bilgisi. Öneri: Yönetmen notu kalır, üstüne **olay listesi ve
ileriye bakış** eklenir.

**a) Olaylar (şarkı açılınca bir kez hesaplanır, saf TS fonksiyonu, birim testli):**

| Olay                                                                           | Kaynak                                                                           | Ne işe yarar                                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `SectionStart{label, repeat, energy, isFinalChorus}`                           | `SongMap.sections` (aynı etiket = aynı bölüm türü; `repeat` = kaçıncı tekrar)    | kamera "çekimi" değişimi; tekrar eden nakaratta varyasyon; son nakarat en büyüğü |
| `BuildStart{dropAt}`, `Countdown{barsLeft: 8…1}`, `FinalBeats{beatsLeft: 4…1}` | güvenilir droplar + ölçü başları                                                 | görünür geri sayım                                                               |
| `Gap{start, end}`                                                              | dropun hemen öncesinde enerjinin düştüğü 0,2–2 sn (YENİ: 10 Hz özet spektrumdan) | varsayılan modda karartma, güvenli modda yavaş kısma                             |
| `Drop{confidence, index}`                                                      | `drops` + `dropConfidence`                                                       | patlama. Güven düşükse daha küçük bir "vurgu"                                    |
| `Release`, `Breakdown`, `Outro`                                                | drop sonrası, enerjisi düşen bölüm, son bölüm                                    | sakinleşme, kamera geri çekilir; final çekimi                                    |
| `KeyChange{from, to}`                                                          | `KeyMap.sections`                                                                | paletin Camelot çarkında kayması                                                 |
| `Phrase{bars: 4/8/16}`                                                         | ölçü başları                                                                     | büyük döngüler (ışık "sahnesi" değişimi)                                         |
| `GroupHead{index, length}`                                                     | `SongMap.grouping` (ör. 9/8 = 2+2+2+3)                                           | aksak ölçünün grup başları; uzun grup ayrı vurgu                                 |
| `Word{text, start, end, lineStart}`                                            | `Lyrics.lines[].words` (kelime zamanları; tahminiyse `estimated`)                | sözlerin sahnenin içinde ışık olarak belirmesi                                   |
| `BassHit{strength}`                                                            | YENİ: bas tepeleri / başlangıç gücü özetinden                                    | kick (bas davul) darbesi; vuruştan bağımsız bas olayları                         |

**b) Kanallar (demoscene'deki GNU Rocket mantığı):** Her sahne adlandırılmış sayı kanalları bildirir
(`cameraDolly`, `exposure`, `beamCount`, `strobeRate`, `fogDensity`, `paletteHue`…). Kurgu defteri olayları
bu kanallara **anahtar karelere** çevirir (zamanı belli değer + yumuşatma türü: basamak, doğrusal, yumuşak,
yaylı). Örnek: `Countdown{3}` → `beamCount = 3`, basamak.

**c) İleriye bakış fonksiyonları (Lyraska'ya özgü):** `timeTo("Drop")`, `barsTo("Drop")`,
`buildProgress()` (0→1), `nextSection()`, `nextWord()`. Bunlarla sahne olaydan **önce** hazırlık yapar.
Animasyondaki "anticipation" ilkesi: dropun 1 vuruş öncesinde kamera hafifçe geri çekilir (nefes alır),
dropta ileri fırlar.

**d) Çekim kitaplığı ve tohum:** Her sahne 6–12 "çekim" (kamera açısı + kompozisyon) tanımlar. Bölüm başında
hangisinin seçileceğini **şarkının parmak izinden üretilen tohum** belirler (`analysis/fingerprint.rs` zaten
var). Böylece aynı şarkı her çalışta aynı koreografiyi alır (izleyici "ezber" kurabilir), farklı şarkılar
farklı koreografi alır. Kurallar: aynı etiketli bölüm aynı çekim ailesinden seçilir ama `repeat` arttıkça bir
büyük varyant seçilir. Son nakarat her zaman en büyük çekimdir.

**e) Zarf (envelope) kuralları:** Sürekli değerlerde yükseliş hızlı, düşüş en az 10 kat yavaş (önceki
araştırma). Olaylar yumuşatılmaz (bkz. 2.3).

**f) Rust tarafında gereken küçük ekler:**

1. `SongMap` vuruş listesini taşımıyor (yalnızca ölçü başları var; anlık vuruş `BeatFrame`'de). Geleceğe
   bakmak için yeni bir komut gerekiyor: `song_timeline` → vuruşlar, 10 Hz'de 32 bantlık özet spektrum
   (5 dakikalık şarkıda ~96 KB), bas olayları. Veri zaten analiz önbelleğinde. Yeni hesap gerekmediği için
   önbellek sürümü artmaz. Yalnızca "boşluk" tespiti yeni bir saf fonksiyon olur.
2. ts-rs ile `bindings/` altına `SongTimeline` tipi üretilir. `check:commands` sözleşmesine eklenir.

**g) Ton → palet:** Camelot 1–12 → Oklab renk açısı (30°'lik adımlar; komşu tonlar komşu renk). Minör (A)
daha koyu ve soğuk, majör (B) daha açık ve sıcak. Bölüm enerjisi doygunluğu belirler. Her sahne bu ana
renkten kendi 3 renk + 1 vurgu paletini türetir (ör. Ebru'da toprak boyalar gamı, Işık Ustası'nda neon jel
renkleri). Ton güveni düşükse kapaktan ya da bölüm temasından palet alınır. Bu eşleme kültürel bir seçim, bilimsel
bir gerçek değil (önceki araştırmada da belirtildi).

### 3.5 Güvenli mod mekanizması: "aynı koreografi, sakin yorum"

Her sahne **tek** koreografi yazar. Güvenli modda motor onu bir **güvenli yorumlayıcıdan** geçirir:

| Varsayılan mod                | Güvenli mod karşılığı                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Strob (saniyede 4–16 çakma)   | Saniyede ≤ 1 yavaş "nefes" ya da hiç. Vurgu yerine hareket (kamera itişi, parçacık doğumu)                               |
| Tam ekran beyaz patlama       | 1–2 sn'lik yumuşak pozlama artışı, tavanlı. Patlama **mekânsal** anlatılır (parçalar dışarı saçılır, kamera geri açılır) |
| Kesme (anında çekim değişimi) | Ortalama parlaklık yakınsa kesme serbest; değilse ≥ 0,6 sn çapraz geçiş                                                  |
| Karartma (`Gap`)              | 1 sn'de yarıya kısma                                                                                                     |
| Hızlı lazer süpürmesi         | Yavaş süpürme. Yüksek karşıtlıklı ince ve yinelenen desenler (şerit, ızgara) geniş alanda akmaz                          |
| Pulse (her vuruş)             | Yönetmenin güvenli nabzı (≤ 1/sn, zaten var)                                                                             |

**Sigorta:** Projede kanıtlı bir **parlaklık freni** zaten var (`flashGuard.ts`, kanıtı `flashGuardMath.ts`;
MilkDrop için yazıldı). Bu fren hücre ortalaması ve ince desen dönüşünü saniyede ≤ 1 ile sınırlıyor. Öneri:
güvenli modda **bütün yeni sahneler de bu frenden geçsin**. Tasarım sakin olsa bile hatalı bir kurguyu
matematik yakalar. Her sahne yine kendi parlama testini taşır ve `check:scenes`'te iki modda ölçülür (proje
kuralı). Frenin gerçek GPU'daki maliyeti ilk motor PR'ında ölçülmeli. SwiftShader'da 320×180'de 8–10 ms
ölçülmüş; gerçek kartta çok daha düşük beklenir [çıkarım].

"Animasyonları azalt" (`prefers-reduced-motion`) açıkken kamera durur, sarsıntı ve hızlı kesme olmaz. Renk ve
ışık akışı kalır.

**Varsayılan modda yoğunluk düğmesi (öneri):** "Sakin · Normal · Çılgın". Strob hızını ve patlama gücünü
ayarlar. Güvenli moddan ayrıdır. Bazı kullanıcılar epilepsi riski olmadan da strobdan rahatsız olur.

### 3.6 WebGPU mi, WebGL2 mi?

- **Bulgular:** WebGPU, Edge/Chrome 113'ten beri Windows'ta açık. 2026 itibarıyla "Baseline" (bütün büyük
  tarayıcılarda var) sayılıyor. Ancak **WebView2'de varsayılan açık olduğunu doğrulayan bir kaynak
  bulamadım**. Tauri'nin 2023 tarihli kaydında `--enable-unsafe-webgpu` bayrağıyla açılabildiği yazıyor.
- **Performans:** Tam ekran parça gölgelendiricisi ağırlıklı işlerde iki API'yi aynı GPU'da adil karşılaştıran
  bir ölçüm bulamadım. Forumlardaki raporlar çelişkili (three.js ve Babylon'da WebGPU'nun daha yavaş kaldığı
  örnekler var). WebGPU'nun gerçek kazancı bilgisayar gölgelendiricisi (compute shader); bizim parçacık, sıvı,
  ebru ve kum ihtiyacımız WebGL2'nin transform feedback ve ping-pong dokularıyla karşılanıyor.
- **Önerim:** **WebGL2'de kalınsın.** "Çok daha iyi olur" diyecek kanıt yok. Motorun arayüzü (geçiş ve ara
  görüntü soyutlaması) ileride bir WebGPU arka ucu eklenebilecek biçimde yazılır. Karar proje sahibinin.

---

## 4. On yeni sahne

Her sahnede ortak örnek şarkı zaman çizelgesi (128 BPM, 4/4):

```
0:00 Giriş (16 ölçü) · 0:30 Kıta · 1:00 Yükseliş (8 ölçü) · 1:15 DROP 1 · 1:45 Breakdown (sakin ara)
2:15 Yükseliş 2 · 2:30 DROP 2 (son nakarat, en büyüğü) · 3:00 Çıkış
```

"Sakin akustik şarkı": drop yok, enerji düşük, gitar ve vokal. "9/8 Türk şarkısı": 2+2+2+3 gruplama (karşılama
gibi), ölçüde 4 vuruş (grup başları), sonuncusu uzun.

Maliyetler **Yüksek katmanda, Iris Xe sınıfı, 1080p** tahmini; motorun ortak son işlemi (~2,5 ms) dahil değil.

---

### 4.1 Işık Ustası: şarkıyı ezbere bilen bir konser ışık şovu

**Tasvir.** Karanlık, hafif puslu dev bir sahnenin önündeyiz. Tepede bir metal iskele (truss), üzerinde 24
hareketli ışık (moving head), 8 lazer kaynağı ve arkada dev bir LED duvar var. Ekranın altında binlerce kişilik
kalabalığın siyah silueti, havaya kalkmış eller görünüyor. Giriş yalnızca iki mavi ışın ve pusun içinde yavaşça
dönen tozla başlar. Şarkı ilerledikçe ışıklar birer birer uyanır. Yükselişte bütün ışınlar tepede tek bir
noktaya toplanır ve her ölçüde bir ışın söner: 8, 7, 6… Sonda tek ışın kalır ve titreyerek kalabalığa iner.
Dropun hemen öncesindeki boşlukta her şey kararır, yalnızca kalabalığın nefesi duyulur gibidir. Drop karesinde
96 lazer ışını kalabalığın üstüne "sıvı gökyüzü" levhası olarak açılır. LED duvar beyaz çakar, strob 1/16
notada patlar. Gerçek bir festivalin en iyi anı, her şarkıda.

- **Kahraman ve kompozisyon:** ışın geometrisi (yelpaze, tünel, levha). Ölçek ipucu kalabalık silueti ve
  iskele. Kamera "salon ortası" (FOH) konumunda, bölümlere göre sahneye yakın, kalabalığın içinden, tepeden
  vinç çekimi.
- **Müzik eşlemesi:**
  - Vuruş: hareketli ışıkların "tık" konum değiştirmesi (pozisyon basamakları). Strob yalnızca drop ve son
    nakaratta.
  - Ölçü başı: ışık "sahnesi" (desen: yelpaze → çapraz → tünel) değişimi.
  - Bas (bas tepeleri / `BassHit`): LED duvarın alt bandında dalga ve pus yoğunluğunda nabız.
  - Orta: ışınların açısal yayılımı.
  - Tiz (`detail`): lazerlerin "tarama" hızı ve ince parıltılar.
  - Enerji: aktif ışık sayısı ve pus yoğunluğu.
  - Bölüm: kamera çekimi ve renk jeli. Aynı nakarat aynı desen ailesi; tekrarı bir büyük varyant.
  - Ton: jel renkleri (Camelot rengi + tamamlayıcı).
  - Sözler: lazer "yazı" modu. Nakaratın ilk sözcüğü lazerle havaya yazılır (kelime zamanında).
- **Zaman çizelgesi:**

| Bölüm     | Görüntü                                                                                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Giriş     | Karanlık. 2 mavi ışın yavaşça tarar, pusta toz dönüyor. Kamera kalabalığın arkasından yavaşça ilerler.                                                                                                                  |
| Kıta      | Hareketli ışıklar vuruşa göre konum değiştirir, renk yumuşak. LED duvarda sakin gradyan.                                                                                                                                |
| Yükseliş  | Işınlar tepede tek noktaya toplanır. Her ölçü başında biri söner (8→1). LED duvarda sayı yok, büyüyen çizgi var. Kamera sahneye doğru dolly (kayarak yaklaşma). Strob hızı 1/4 → 1/8 → 1/16 hızlanır (Shepard rampası). |
| Boşluk    | Tam karartma (varsayılan mod). Yalnızca kalabalık silueti ve sönük bir kırmızı çıkış lambası.                                                                                                                           |
| DROP 1    | 96 lazer "sıvı gökyüzü" levhası kalabalığın üstünde açılır, LED duvar beyaz, strob 1/16, kamera geriye açılır. 2 ölçü sonra desen yelpazeye döner.                                                                      |
| Breakdown | Tek sıcak spot ışığı sahnenin ortasında, pus yavaşça döner. Kamera tepeden vinç çekimi. Lazerler yavaş tünel.                                                                                                           |
| DROP 2    | Drop 1'in büyüğü: lazerler kalabalığın üstünde tünel olur, kamera tünelin içine girer. Konfeti parçacıkları ve renk sapması.                                                                                            |
| Çıkış     | Işıklar birer birer söner, son ışın yukarıyı gösterir ve kapanır. Kalabalık elleri iner.                                                                                                                                |

- **Sakin akustik şarkı:** "Küçük kulüp" çekimi. Tek sıcak spot, bir iki yumuşak ışın, pusta toz. Vuruşta değil
  ölçüde değişim. Strob yok. Kalabalık yerine boş sahnede bir mikrofon silueti.
- **9/8 şarkı:** Hareketli ışıklar 2+2+2+3 grup başlarında konum değiştirir. Uzun gruptaki (3) vuruşta ışık
  yelpazesi geniş açılır, böylece aksaklık gözle görülür. Ölçü güveni düşükse (`barsConfident = false`) yalnızca
  vuruşa göre oynar.
- **Güvenli mod:** strob yok, karartma yavaş, lazerler yavaş süpürür, LED duvar pastel ve sabit parlaklıkta.
  Drop: ışınların açılması ve kameranın geri çekilmesi (mekânsal). Parlaklık freni sigortası açık.
- **Teknikler:** Işın başına **analitik hacimli ışın**: bakış ışını ile lazer doğrusu arasındaki en yakın
  uzaklık kapalı formülle bulunur, `exp(-d²/w²)` ve bir 3B gürültü dokusundan pus yoğunluğu okunur. Işın başına
  ~30 işlem, 96 ışın yarım çözünürlükte rahat. Hareketli ışık konileri için koni içinde ters kare kanunlu
  yaklaşık tümleme. Islak sahne zemininde ayna yansıması. LED duvarı düşük çözünürlüklü bir dokuya ayrı
  çizilir (piksel ızgarası görünür). Kalabalık 2B SDF siluetleri, eller vuruşa göre. Geri besleme tamponu ile
  lazer izi. Yatay anamorfik parlama.
- **GPU maliyeti:** 3–5 ms (96 ışın + 24 koni yarım çöz. ~2,5 ms; LED duvar 0,3; kalabalık 0,3; iz 0,4).
- **Riskler:** Işınlar "çizgi" gibi yapay görünebilir. Pus gürültüsü ve kenar yumuşaklığı ayarı belirleyici.
  Çok efekt "kaosa" dönebilir; aynı anda en fazla iki katman vuruşla oynamalı. Kalabalık silueti tekrarlı
  görünmesin diye tohumlu çeşitlilik gerekiyor.
- **Özgünlük ve lisans:** tamamen kendi kodumuz. Gerçek ışık markası ya da model adı yok, cihazlar genel
  biçimli. Festival adı yok.

---

### 4.2 Zaman Vadisi: geleceği gördüğün manzara

**Tasvir.** Gece, sisli bir vadinin içinde alçaktan uçuyoruz. Vadinin duvarları **şarkının kendisi**: her
sıradağ şarkının bir anı. Bas sesleri yolun yakınında ağır, büyük dağlar; tizler uzakta ince, parıltılı sırtlar.
Önümüzde ileride, sisin içinden dev ve ışıklı bir dağ sırası yükseliyor: **o, drop**. Ona yaklaştığımızı
görüyoruz. Yol kenarındaki pist lambaları her vuruşta bir tane olmak üzere dizilmiş. Dropa 8 ölçü kala lambalar
kırmızılaşıyor ve sayıyor. Yolun üstünde ışıktan harfler duruyor: **şarkı sözleri**. Söylenmeden önce
uzaktan görünüyor, söylendiği an üzerinden geçerken tutuşuyorlar. Dropta zirveyi aşıp lunapark treni gibi
aşağı dalıyoruz. Şarkının sonunda kamera yükseliyor ve **şarkının tüm haritasını yukarıdan görüyoruz**.
Biten şarkının kendi manzarası.

- **Kahraman ve kompozisyon:** ufuktaki drop dağı ve kameraya doğru gelen yol. Şimdiki an, arazinin üstünde
  enlemesine parlayan bir "şimdi çizgisi". Bu çizgi canlı 200 çubuklu spektrumla (`visual_spectrum`) titreşir.
  Geçmiş arkada köze dönüşür.
- **Müzik eşlemesi:**
  - Arazi: bütün şarkının 10 Hz özet spektrumu (YENİ `song_timeline`). Zaman ileri doğru, frekans yanlara.
    Vadi simetrik: bas yolun dibinde, tizler dış sırtlarda (tiz → küçük ve yüksek, bas → büyük ve alçak).
  - Vuruş: pist lambaları. Lambalar vuruş zamanlarına yerleştirildiği için aralıkları gerçek ritmi gösterir.
  - Ölçü: her ölçü başında daha büyük bir lamba direği.
  - Bölüm: bölüm sınırında ışıktan bir **kapı kemeri**. Kamera içinden geçerken çekim değişir (alçak uçuş,
    yan kayma, yüksek kartal bakışı). Her bölüm bir "iklim" rengi alır (tondan).
  - Bas: şimdi çizgisinde arazinin kabarması.
  - Tiz: dış sırtlarda kıvılcım parçacıkları.
  - Enerji: kamera hızı ve sis yoğunluğu (yoğun bölümde açık hava).
  - Drop: arazide zaten görünür. Geri sayımda lambalar sayar, kamera zirveye tırmanır, dropta dalar. Hız
    çizgileri, görüş açısında "yumruk", strob.
  - Ton: iklim paleti. Ton değişen bölüm farklı renk bir vadi.
  - **Sözler:** her kelime kendi zamanındaki arazi konumunda dikey duran ışık harfleri. Kelime süresi uzunsa
    harf büyük. Söylenince tutuşup kıvılcıma dönüşür. Sözler varsa `LyricsOverlay` bu sahnede gizlenir.
- **Zaman çizelgesi:**

| Bölüm     | Görüntü                                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Giriş     | Kamera yüksekten iner, ufukta bütün şarkı sisli bir silüet olarak görünür, uzakta drop dağı parlar.                                      |
| Kıta      | Alçak uçuş. Lambalar vuruşta yanar, sözler yolun üstünde.                                                                                |
| Yükseliş  | Arazi tırmanır. Lambalar kırmızı ve sayıyor (8→1), kamera eğim alır, sis açılır, drop dağı ekranı doldurur.                              |
| Boşluk    | Zirvede bir an asılı kalma: kamera yavaşlar, ses kesilince görüntü donar gibi (varsayılan modda karartma).                               |
| DROP 1    | Dalış. Geniş açı, hız çizgileri, strob, yanlardaki bas dağları bas vuruşlarıyla parlar.                                                  |
| Breakdown | Kamera yükselir, kartal bakışı. Vadi sakin, sözler büyük ve yavaş.                                                                       |
| DROP 2    | Daha büyük dalış ve kanyonda alçak uçuş. Kanyon duvarları LED gibi spektrumla yanar.                                                     |
| Çıkış     | Kamera dikine yükselir. Biten şarkının bütün haritası alttan görünür (bölüm renkleri, drop zirveleri). Son kare: şarkının "kartpostalı". |

- **Sakin akustik şarkı:** yumuşak, yuvarlak tepeler. Altın saat (gün batımı) paleti, nehirde bir kayık hızında
  yavaş seyir. Sözler ön planda (karaoke manzarası). Drop olmadığı için dağ yok, yol nazikçe kıvrılır.
- **9/8 şarkı:** pist lambaları vuruş zamanlarına göre dizildiği için **2+2+2+3 ritmi yolun üstünde gözle
  görülür**: üç kısa aralık, bir uzun aralık. Grup başları büyük lamba. Bu aksak ritmin çok güzel ve doğal bir
  görselleştirmesi.
- **Güvenli mod:** strob yok, dalış daha yumuşak (eğim tavanlı), lambalar sönükten parlağa 1 sn'de geçer, kemer
  geçişlerinde çapraz geçiş.
- **Teknikler:** 256×512'lik ızgara ağı (131k köşe). Köşe gölgelendiricisi yükseklik için spektrum dokusunu
  okur. Kayan pencere: kameranın önündeki ~40 sn. Uzun şarkıda doku 2B dizi dokusuna bölünür, çünkü 10 dakika
  × 10 Hz = 6000 satır, bazı kartlarda doku boyu sınırı 4096. Türevle hesaplanan parlak ızgara çizgileri, üstel
  yükseklik sisi, lambalar ve sözler örneklenmiş (instanced) dörtgenler. Harfler için bir SDF yazı atlası
  (keskin kalan yazı dokusu) projenin OFL lisanslı yazı tipinden program içinde üretilir. Kıvılcımlar parçacık.
  Kamera eğrisi kurgu defterinden.
- **GPU maliyeti:** 2,5–4 ms (arazi 1,5; lamba ve söz 0,5; parçacık 0,5; sis birleşik).
- **Riskler:** Özet spektrum gürültülü görünebilir. Zaman ve frekansta yumuşatma, şarkı bazında normalleştirme
  gerekir. Drop dağının **gerçekten** dropta olması harita doğruluğuna bağlı; güveni düşük dropta dağ küçük
  çizilir (yanlış vaat, vaatsizlikten kötüdür). Yeni Rust komutu gerekiyor (küçük). Uzun şarkıda bellek: 10 dk
  × 10 Hz × 32 bayt ≈ 190 KB, sorun değil.
- **Özgünlük ve lisans:** "Spektrum dağları" fikri (Joy Division kapağı, eski "3B spektrum" görselleri) tanıdık.
  **Bütün şarkıyı önceden gösterip içinde uçmak, sözleri zamana yerleştirmek ve dropu ufukta göstermek**
  gerçek zamanlı çalarlarda bulamadığım bir şey; şarkıyı önceden bilmeyen bir program bunu yapamaz. Kod
  tamamen kendimizin.

---

### 4.3 Ebru: suya damlayan boya, dropta geçen tarak

**Tasvir.** Tepeden, kitreli suyla dolu bir ebru teknesine bakıyoruz. Yüzeyde ışık hafifçe yansıyor. Her
vuruşta yüzeye bir damla boya düşüyor ve halka halka açılıyor. Her yeni damla eskileri kenara itiyor ve zamanla
gerçek ebrudaki "battal" zemin oluşuyor. Ölçü başlarında daha büyük, farklı renkte damlalar düşüyor. Yükselişte
damlalar hızlanıyor ve küçülüyor, ortada iç içe halkalardan bir hedef deseni büyüyor. Ekranın kenarında tahta
bir tarağın dişleri suya iniyor ve bekliyor. Dropta tarak tek ölçüde ekranı boydan boya geçiyor ve halkalar bir
anda "gelgit" desenine dönüşüyor. Bir sonraki cümlede ikinci tarak dik geçerek "şal" desenini kuruyor.
Breakdown'da bir biz (ince çubuk) suyun üstünde bir **lale** çiziyor. Şarkının sonunda kâğıt yüzeye iniyor,
kaldırılıyor ve desen kâğıtta kalıyor: **her şarkının kendi ebrusu**.

- **Kahraman ve kompozisyon:** boya yüzeyi, tam ekran. Ölçek ipucu olarak tarak dişleri ve tekne kenarı.
  Kamera tam tepeden, bölümlere göre hafif eğik (yüzeyde ışık kayar), breakdown'da makro.
- **Müzik eşlemesi:**
  - Vuruş: küçük damla. Konumu kurgu tohumuyla belirlenir, palet içinden renk.
  - Ölçü başı: büyük damla, vurgu renginde.
  - Bas (`BassHit`): yüzeyde dairesel dalga (yalnızca ışık yansıması ve kırılma; boyayı bozmaz).
  - Tiz: damla kenarlarında ince "serpme" (minik damlacık yağmuru).
  - Orta: tarak dişlerinin sıklığı.
  - Enerji: damla sıklığı (1/2 → 1/4 → 1/8).
  - Bölüm: desen tekniği. Kıta battal, nakarat gelgit, ikinci nakarat şal, breakdown çiçek.
  - Drop: tarak geçişi. Güven düşükse yalnızca biz ile tek çizgi.
  - Ton: **toprak boya gamı** (aşı boyası, çivit, kök boya kırmızısı, hardal). Camelot rengi bu gam içinde bir
    kayma olarak uygulanır. Ton değişiminde yeni boya kaplarından damlamaya başlanır.
  - Sözler: kullanılmaz (sahne "sessiz sanat").
- **Zaman çizelgesi:**

| Bölüm     | Görüntü                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Giriş     | Boş, ışıltılı su. Serpme ile zemin rengi atılır (ince damlacık yağmuru).                                                       |
| Kıta      | Vuruşta damlalar, battal zemin oluşur.                                                                                         |
| Yükseliş  | Merkezde iç içe halkalar hızlanır. Tarak kenarda belirir ve suya iner (geri sayım: her ölçüde bir diş daha suya değer, 8 diş). |
| Boşluk    | Su durur, son damla havada asılı (varsayılan modda ışık söner, yalnızca yansıma kalır).                                        |
| DROP 1    | Tarak 1 ölçüde geçer → gelgit deseni. Strob ile yansıma çakması, yüzeyde şok dalgası.                                          |
| Breakdown | Makro çekim. Biz bir lale motifi çizer (kurgu defterindeki önceden tanımlı yol).                                               |
| DROP 2    | Dik ikinci tarak → şal. Sonra spiral tarak ("bülbül yuvası" kıvrımı).                                                          |
| Çıkış     | Kâğıt iner, kalkar, desen kâğıtta. Son kare: ebru, kenarında şarkı adı küçük ve kurşun kalemle.                                |

- **Sakin akustik şarkı:** sahnenin en doğal hâli. Yavaş damlalar, çiçek motifleri (lale, karanfil), sıcak boya
  gamı. Tarak yok, yalnızca biz ile zarif çizgiler.
- **9/8 şarkı:** damlalar 2+2+2+3 düzeninde. Üç grupta küçük yuvarlak damla, uzun grupta **uzayan, damla
  biçimli** bir damla. Aksak ritim desende iz bırakır, kâğıtta bile okunur.
- **Güvenli mod:** Ebru doğası gereği parlamasız: renk yer değiştirir, parlaklık sabit kalır. Strob ve
  yansıma çakması kapanır, tarak 2 ölçüde geçer. En kolay güvenli sahne.
- **Teknikler:** Lu, Jaffer ve ark. (2012) "Mathematical Marbling": her damla ve her tarak **kapalı formüllü,
  alanı koruyan bir dönüşüm**. Sıvı çözücüsü gerekmiyor. Damla için dışarıdaki her nokta
  `p' = c + (p−c)·√(1 + r²/|p−c|²)` ile itilir, içi yeni renktir. Tarak dişi için yer değiştirme, çizgiye
  dik uzaklığın azalan bir fonksiyonu. Uygulama: 1024² RGBA16F boya dokusu ping-pong. Her olay, tersine
  dönüşümle bir tam ekran yeniden örnekleme geçişi (~0,2 ms). Tarak geçişi kareler boyunca küçük adımlara
  bölünür. Yüzey ışığı boya gradyanından türetilen normal + parlaklık + kâğıt lifi dokusu. Bas dalgaları
  yalnızca normal bozulması.
- **GPU maliyeti:** 1–2,5 ms (olay geçişleri 0,2 ms × birkaç, yüzey 0,6).
- **Riskler:** Tekrarlanan yeniden örnekleme deseni bulanıklaştırır. 16 bit doku, keskin kenar korumalı
  örnekleme ve gerekirse vektör (damla listesi) yöntemiyle çözülür; yayın kodu "kapalı formüllü işleyici"
  diye geçiyor. Tarak yanlış ayarlanırsa yapay görünür; gerçek ebru videolarıyla karşılaştırarak ayarlanmalı.
- **Özgünlük ve lisans:** Ebru UNESCO'nun somut olmayan kültürel mirası listesinde. Geleneksel motifler kamu
  malı. Matematik yayımlanmış bir makale; kodu kendimiz yazarız. Hiçbir ebru ustasının eseri ya da
  fotoğrafı kopyalanmaz. Türk dinleyiciye "bizim" hissi veren, dünyada da özgün bir görselleştirici
  [çıkarım: müzikle senkron ebru görselleştiricisi bulamadım].

---

### 4.4 Kum Plakası: sesin şekli (Chladni)

**Tasvir.** Karanlık bir laboratuvarda, yandan yalayan sert bir ışıkla aydınlanmış siyah metal bir plaka var.
Üstünde 250 bin kum tanesi. Plaka titreşince taneler titreşmeyen çizgilere (düğüm çizgileri) kaçıyor ve
gözümüzün önünde kusursuz, simetrik figürler beliriyor. Her vuruşta plaka tekmelenir ve taneler zıplar. Her
ölçüde figür bir üst kalıba geçer, desenler karmaşıklaşarak tırmanır. Dropun öncesindeki sessizlikte titreşim
durur ve kum en net figürde donar. Dropta dev bir tekme gelir: taneler havaya, kameraya doğru fırlar. Strob
uçuşan taneleri havada dondurur (gerçek stroboskopun titreşen kumda yaptığı gibi). Sonra hepsi dropun büyük
figürüne yağar.

- **Kahraman ve kompozisyon:** figürün kendisi. Ölçek ipucu olarak tek tek görünen taneler ve kenardaki
  titreşim sürücüsü. Kamera tepeden; bölüm değişiminde alçak yan açı ve makro.
- **Müzik eşlemesi:**
  - Titreşim modu (n, m): tonik perde sınıfından ve bölümden seçilir; aynı ton aynı figür ailesi.
  - Bas: titreşim gücü (taneler karın bölgelerinden daha hızlı kaçar).
  - Vuruş / `BassHit`: tekme, yani taneler zıplar (gölge kayar, hareket bulanıklığı).
  - Tiz: tanelerde parıltı (sert ışıkta minik yansımalar).
  - Ölçü: mod geçişi.
  - Yükseliş: n+m her ölçüde artar (görsel Shepard rampası: desen hep "yükselir").
  - Drop: patlama ve yeni figür. Breakdown: yavaş mod karışımı (iki modun üst üste binmesi).
  - Ton: ışık jelinin rengi ve kumun tonu (bakır, kar beyazı, kehribar).
- **Zaman çizelgesi:** Giriş: kum düzgün yayılmış, hafif titreşimle ilk basit figür. Kıta: vuruşta zıplamalar,
  ölçüde figür. Yükseliş: figürler hızla karmaşıklaşır, kum sise dönüşür. Boşluk: donma ve net figür. Drop 1:
  havaya fırlama, strob, kamera eğilir. Breakdown: makro, alçak açı, tanelerin arasında alan derinliği.
  Drop 2: plaka biçimi değişir (kareden daireye ya da gitar gövdesine benzer özgün bir biçime). Çıkış: titreşim
  söner, son figür kalır, ışık kapanır.
- **Sakin akustik şarkı:** meditatif. Yavaş mod geçişleri, zıplama yok, sıcak ışık. Her akorda nazik bir figür
  değişimi (bölüm ve ölçüden).
- **9/8 şarkı:** tekmeler grup başlarında. Uzun gruptaki tekmede taneler daha yükseğe zıplar, böylece aksaklık
  "uzun nefes" gibi görünür.
- **Güvenli mod:** strob yok, tekmeler hafif (gölge kayması küçük), patlama yavaş "kabarma". Parlaklık sabit,
  çünkü hareket kumda.
- **Teknikler:** Transform feedback ile parçacıklar. Her tane `v += −k·∇(u²)` ile itilir (u = mod biçimi;
  merkezden tutturulmuş kare plaka için `cos(nπx)cos(mπy) − cos(mπx)cos(nπy)`), artı `|u|` ile orantılı
  rastgele zıplama. Taneler nokta olarak çizilir, yükseklik değeriyle gölge ve parıltı eklenir. Plaka yüzeyi
  basit bir PBR (fiziksel tabanlı ışıklandırma) yaklaşımı.
- **GPU maliyeti:** 2–3,5 ms (128k tanede güncelleme 0,6, nokta çizimi 1,2, plaka 0,4).
- **Riskler:** Basit kosinüs modeli gerçek plakayı tam üretmez (yayınlarda belirtilmiş), ama görsel için yeterli.
  Figürler zamanla birbirine benzeyebilir; mod karışımları ve farklı plaka biçimleri gerekiyor. YouTube'daki
  "cymatics" videolarıyla benzerlik: bizimki fizik simülasyonu ve şarkı yapısına bağlı.
- **Özgünlük ve lisans:** Chladni figürleri 1787'den beri bilinen kamu malı fizik. Kod kendimizin.

---

### 4.5 Usturlap: şarkının pirinç saati

**Tasvir.** Kadife bir karanlığın içinde, müze ışığıyla aydınlanmış dev bir pirinç usturlap (astrolabe) var.
Üstündeki oyma yıldız haritası halkası (rete) aslında **Camelot çarkı**: 12 ton oyulmuş, çalan şarkının tonunu
gösteren yıldız işaretçisi parlıyor. Alttaki plakaya **şarkının haritası** daire olarak kazınmış: bir tur bir
şarkı, bölümler dilimler, droplar yıldız delikleri. Okuma kolu (alidade) saat ibresi gibi şarkıyı tarıyor.
Kenar halkasındaki çentikler vuruşları sayıyor. Ölçü başlarında mekanik bir "tık" ile iç halka dönüyor.
Yükselişte kol drop yıldızına yaklaştıkça çentikler birer birer yanıyor. Dropta usturlap **katlarına
ayrılıyor**: plakalar derinlikte birbirinden uzaklaşıyor ve yıldız deliklerinden pusa ışık hüzmeleri fışkırıyor.

- **Kahraman ve kompozisyon:** usturlap, ekranın %70'i, 3/4 açıdan. Ölçek ipucu olarak oymaların inceliği.
  Kamera breakdown'da makro, dropta açılır.
- **Müzik eşlemesi:**
  - Vuruş: kenar çentiğinde ışık kıvılcımı ve küçük çekiç titreşimi.
  - Ölçü: iç halkada mekanik tık (yaylı aşma ile).
  - Bas: halkalarda çok hafif radyal titreşim ve pirinçte uğultu parlaması.
  - Tiz: yıldız işaretçilerinde parıltı.
  - Enerji: ışığın sıcaklığı (mum ışığından gün ışığına).
  - Bölüm: okuma kolunun geçtiği dilimin parlaması ve kamera çekimi.
  - Ton: rete dönerek yeni tonu gösterir (ton değişiminde gerçek bir mekanik dönüş).
  - Drop: patlatılmış görünüm (exploded view) ve hüzmeler.
  - Sözler: kelimeler kenar halkasına oyma yazı olarak geçer (isteğe bağlı).
- **Zaman çizelgesi:** Giriş: karanlıkta tek spot, usturlap belirir. Kıta: tık-tık işleyiş. Yükseliş: çentikler
  yanar, halkalar hızlanır. Boşluk: her şey durur, tek çentik yanık. Drop 1: katlara ayrılma, hüzmeler, strob,
  plakalar dönerek süzülür. Breakdown: oymalara makro, alan derinliği. Drop 2: plakalar bu kez spiral merdiven
  gibi açılır. Çıkış: plakalar birleşir, kol başlangıca döner, spot söner.
- **Sakin akustik şarkı:** mum ışığı, yavaş işleyiş, tik-tak. Sözler oyma yazı olarak halkada.
- **9/8 şarkı:** iç "usul halkası" 9 çentikli, 2+2+2+3 gruplu oyulmuş. Grup başları uzun çentik. **Aksak
  ölçü geometri olur.** Düm ve tek vuruşları (bas ve tiz başlangıçlar) farklı çentik biçimiyle yanar.
- **Güvenli mod:** strob yok, hüzmeler yavaş açılır, çentik parlaması yumuşak ve küçük alanda.
- **Teknikler:** 2,5B katmanlı SDF çizim (halkalar, çentikler, yıldızlar analitik), SDF yazı atlası, pirinç için
  GGX parlaklık (tek ışık + ortam gradyanı) ve fırçalanmış metal hissi için yönlü parlaklık. Katman paralaksı,
  hacimli ışık (radyal bulanıklık), alan derinliği.
- **GPU maliyeti:** 2,5–4 ms.
- **Riskler:** "Steampunk saat" klişesine kayabilir; sade ve müze gerçekliğinde tutulmalı. Metal malzeme ince
  işçilik ister.
- **Özgünlük ve lisans:** Usturlap tarihî bir alet (kamu malı tasarım). Müze fotoğrafı kullanılmaz, çizim
  özgündür. Lyraska adındaki Lyra (takımyıldız) ile güzel bir bağ [çıkarım].

---

### 4.6 Monolit: tuz çölünde ışık yarığı

**Tasvir.** Mavi saatte uçsuz bucaksız ıslak bir tuz çölü var; gökyüzü yerde yansıyor. Ortada gökdelen
büyüklüğünde, simsiyah bir taş blok duruyor. Dibinde minicik bir insan silueti (ölçek). Bloğun yüzeyinde ince
oyma çizgiler var; spektrum bu çizgilerde yukarı tırmanan ışık olarak akıyor. Yükselişte blok yerden kalkar,
tuz tozu yukarı çekilir, bulutlar etrafında girdap olur, gök kararır. Boşlukta yalnızca bloğun ortasında saç
teli inceliğinde bir ışık yarığı kalır. Dropta blok 40 levhaya ayrılarak ağır çekimde açılır. İçinden kör edici
bir ışık çekirdeği ve hüzmeler fışkırır, tuz çölünde bir şok dalgası yansımaları dalgalandırır. Breakdown'da
levhalar yavaşça yörüngede döner. İkinci dropta yeni bir biçim kurarlar: halka, spiral merdiven, kapı.

- **Kahraman:** blok, ışık çekirdeği ve ölçek ipucu olarak insan silueti. **Müzik:** vuruşta çizgilerde ışık
  nabzı. Ölçüde levha dizilimi bir adım döner. Bas yerden toz kaldırır. Tiz gökyüzünde yıldız parıltısı. Bölüm
  kamera çekimini değiştirir (yerden, havadan, yarığın içinden). Ton gökyüzü gradyanını belirler. Sözler
  levhalara oyma olarak düşebilir.
- **Zaman çizelgesi:** Giriş: geniş çekim, rüzgâr. Kıta: çizgilerde spektrum. Yükseliş: yükselme ve girdap
  (Shepard rampası: yükselişin sonu gelmez). Boşluk: yarık. Drop: patlama ve hüzmeler. Breakdown: yörünge.
  Drop 2: yeni biçim. Çıkış: levhalar yere iner, blok yeniden oluşur, gece çöker.
- **Sakin akustik:** yalnızca gün doğumu ve blokta yavaş ışık akışı. Bölüm geçişinde ışık yön değiştirir (güneş
  döner). **9/8:** levhalar 2+2+2+3 gruplar hâlinde nabız atar.
- **Güvenli mod:** çekirdek ışığı 2 sn'de açılır, strob yok, şok dalgası yalnızca yansımada.
- **Teknikler:** levhalar rasterlenmiş kutular (ışın yürütme gerektirmez, ucuz). Analitik gökyüzü, yükseklik sisi,
  ekran uzayında ayna yansıması (ıslak tuz), radyal hacimli ışık (GPU Gems 3, bölüm 13), toz parçacıkları.
- **GPU maliyeti:** 3–5 ms. **Riskler:** "2001" filmindeki monolit çağrışımı; oranlar ve hikâye farklı tutulmalı.
  Sahne fazla boş görünebilir, bu yüzden ışık işçiliği belirleyici. **Lisans:** kendi kodumuz; film varlığı yok.

---

### 4.7 Vitray: kapaktan gül penceresi

**Tasvir.** Çalan albümün kapağı, gotik bir katedralin **12 dilimli gül penceresine** dönüşüyor. Kapak
Voronoi hücrelerine (her noktanın en yakın merkeze göre bölündüğü mozaik) bölünmüş renkli camlar ve kurşun
çerçevelerden oluşuyor. Arkadan güneş vuruyor, renkli ışık hüzmeleri puslu havadan geçip taş zemine renk
havuzları düşürüyor. 12 dilim Camelot çarkı gibi; şarkının tonu tepedeki dilimde. Vuruşta okuma açısındaki
hücreler sırayla yanar. Yükselişte dilimler geri sayımla birer birer aydınlanır (8 ölçü, 8 dilim). Dropta cam
kameraya doğru ağır çekimde paramparça olur; parçalar ışığı kırarak süzülür. Breakdown'da parçalar havada asılı
kalır, yavaşça kapağın başka bir düzeninde birleşir.

- **Müzik:** vuruşta hücre parlaması, ölçüde pencerenin bir dilim dönmesi. Bas toz parçacıklarını hüzmede
  dalgalandırır. Tiz camda parıltı. Bölümde kamera (karşıdan, zeminden yukarı, hüzmenin içinden). Ton
  güneşin rengi. Drop parçalanma.
- **Sakin akustik:** sabah ışığı, yavaş dönen güneş, toz zerreleri. **9/8:** pencere 9 alt dilimle 2+2+2+3
  gruplanır.
- **Kapak yoksa:** tondan üretilen palet ve sanatçı adından tohumlu desen (kütüphanedeki "baskı kapak" mantığı).
- **Güvenli mod:** parçalanma yavaş ve parlamasız, güneş sabit.
- **Teknikler:** kapak → Voronoi (CPU'da bir kez ya da GPU'da "jump flooding" ile en yakın merkez bulma),
  kaleydoskopik 12 kat yansıma, örneklenmiş üçgen parçalar (kırılma için ekran uzayında bükme), hacimli ışık.
- **GPU maliyeti:** 3–4,5 ms. **Riskler:** düşük çözünürlüklü kapaklar bulanık görünebilir (Voronoi bunu
  saklar, avantaj). Dini çağrışım; nötr gotik geometri tutulmalı. **Lisans:** kullanıcının kendi kapağı, yalnızca
  yerel; kod kendimizin.

---

### 4.8 Olay Ufku: kara deliğin şarkısı

**Tasvir.** Bir kara deliğin etrafında dönen akkor bir toplanma diski (accretion disk) var. Disk, kütleçekiminin
büktüğü ışık yüzünden deliğin üstünde ve altında da görünüyor (çekimsel mercek). Yükselişte madde spiral
çizerek içeri düşer, disk ısınır (kırmızıdan mavi-beyaza), kamera yaklaşır, arka plandaki yıldızlar halka
gibi bükülür. Dropta iki kutuptan ışık hızında fışkırmalar (jet) ve bir şok halkası. Breakdown'da disk sakin,
uzak.

- **Müzik:** bas disk türbülansını, vuruş diskteki parlak topakların dönüşünü belirler. Tiz sıcak noktalar
  olarak parlar. Bölümde kamera açısı (diskin düzleminden, tepeden). Ton disk rengi. Drop jetler.
  **9/8:** topaklar 2+2+2+3 düzende diziliyor.
- **Sakin akustik:** uzak, yavaş, mor-turuncu bir disk.
- **Güvenli mod:** jet 2 sn'de büyür, strob yok.
- **Teknikler:** yarım çözünürlükte bükülen ışın yürütme (Schwarzschild yaklaşımı, 32–64 adım), hacimli
  disk yoğunluğu, Doppler parlaklık asimetrisi.
- **GPU maliyeti:** 4–6 ms (en pahalılardan biri). **Riskler:** proje sahibi uzay temalarını (bulutsu, galaksi)
  sıkıcı buldu. Bu sahne olay ve fizikle farklı olsa da tema yorgunluğu riski yüksek. Bir filmin kara deliğine
  benzetilebilir. **Lisans:** kendi kodumuz; filmden varlık yok.

---

### 4.9 Sinyal: verinin kendisi gösteri olsun

**Tasvir.** Siyah ekran ve beyaz çizgiler. Şarkı haritası **ham veri** olarak bir saat hassasiyetinde
oynuyor: 200 çubuklu spektrum barkod sütunları, kayan vuruş ızgarası, zaman kodu rakamları, ölçü sayacı,
BPM, Camelot tonu, bölüm etiketleri. Dropa 8 ölçü kala dev rakamlar beliriyor: **−8 … −1**. Dropta ekran
1/16 notada tersine dönerek çakıyor, tam beyaz. Aksak şarkıda ekranda "2+2+2+3" düzeni ışıkla sayılıyor.
Sözler tek aralıklı yazıyla akıyor. Minimal, keskin ve **kusursuz eşzamanlı**.

- **Müzik:** her şey birebir veri: vuruş, ölçü, bölüm, enerji eğrisi, ton ve sözler.
- **Zaman çizelgesi:** Giriş: tek yatay çizgi ve zaman kodu. Kıta: barkodlar. Yükseliş: geri sayım rakamları.
  Boşluk: siyah. Drop: tersine çakma ve ızgara patlaması. Breakdown: tek çizgi, büyük ton harfi. Çıkış: harita
  bir zaman çizelgesi olarak katlanır.
- **Sakin akustik:** gri tonlar, yavaş akış, sözler büyük. **9/8:** grup düzeni sayılarla.
- **Güvenli mod:** tersine çakma yok. Geniş alanda yüksek karşıtlıklı ince şerit ve ızgara akmaz
  (desen hassasiyeti de bir ışığa duyarlılık riski); renk gri tonlara iner. Parlaklık freni sigortası açık.
- **Teknikler:** 2B çizgiler, SDF yazı, geri besleme izleri. Son işlemin çoğu gereksiz.
- **GPU maliyeti:** < 1 ms. **Zayıf GPU ve yazılımsal çizimde önerilen sahne.**
- **Riskler:** Ikeda estetiğine çok yakın düşebilir. Onun belirli düzenleri kopyalanmaz; Lyraska'nın
  kendi verisi ve tipografisi kullanılır. Bazı kullanıcılara soğuk gelebilir.
- **Lisans:** kendi kodumuz.

---

### 4.10 Sözün Işığı (sahne değil, motor modülü önerisi)

Sözlerden yapılan ayrı bir sahne yerine, **kelimeleri ışık nesnesi olarak sahnelere gömen ortak bir modül**
öneriyorum: Işık Ustası'nda lazerle havaya yazı, Zaman Vadisi'nde yoldaki harfler, Usturlap'ta oyma yazı,
Monolit'te levhalardaki yazılar. Kelime süresi büyüklüğü, satır başı vurguyu belirler. Söylenince tutuşan
harfler parçacığa dönüşür. Kelime zamanları tahminiyse (`estimated`) yalnızca satır düzeyinde canlanır, yani
yanlış kelimede tutuşma olmaz. Modül SDF yazı atlası ve örneklenmiş dörtgenlerle yapılır, ~0,3 ms. Apple Music
Sing'in hece hece canlanması (önceki araştırma) referanstır. Mevcut `LyricsOverlay` sözleri kendi içinde
gösteren sahnelerde gizlenir.

---

## 5. Sıralama, ilk üç ve yapım sırası

### 5.1 Puan tablosu

Ölçütler: **Vay** (ilk görüşte etki), **Koz** (şarkıyı önceden bilmeyi ne kadar görünür kılıyor),
**Özgünlük**, **Güvenli** (sakin sürümün kolaylığı), **Ucuzluk** (GPU ve emek). Her biri 1–5.

| Sıra | Sahne            | Vay | Koz | Özgünlük | Güvenli | Ucuzluk | Toplam | Yorum                                                                                                                     |
| ---- | ---------------- | --- | --- | -------- | ------- | ------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Işık Ustası**  | 5   | 5   | 3        | 3       | 3       | 19     | Varsayılan modun yeni özgürlüğünü (strob, lazer) en iyi kullanan sahne. Festivalin en iyi anı her şarkıda.                |
| 2    | **Zaman Vadisi** | 5   | 5   | 5        | 4       | 3       | 22     | Lyraska'dan başka kimsenin yapamayacağı sahne: geleceği gösteriyor. Sözler manzarada. Küçük bir Rust komutu gerektiriyor. |
| 3    | **Ebru**         | 4   | 4   | 5        | 5       | 4       | 22     | Kültürel, zarif, ucuz, doğası gereği güvenli. Kâğıda baskı finali çok güçlü.                                              |
| 4    | Kum Plakası      | 4   | 4   | 4        | 4       | 3       | 19     | Fizik büyüsü ve strobla donma anı. Parçacık altyapısı gerektirir.                                                         |
| 5    | Usturlap         | 4   | 4   | 5        | 4       | 3       | 20     | Aksak ölçüyü en güzel gösteren sahne; ince işçilik ister.                                                                 |
| 6    | Monolit          | 4   | 3   | 3        | 4       | 3       | 17     | Ölçek ve huşu, ama "film" çağrışımı.                                                                                      |
| 7    | Vitray           | 4   | 3   | 4        | 4       | 3       | 18     | Kapağı kişisel kılar. Parçalanma etkileyici.                                                                              |
| 8    | Sinyal           | 3   | 5   | 2        | 3       | 5       | 18     | Zayıf GPU'nun kurtarıcısı; uygulaması hızlı.                                                                              |
| 9    | Olay Ufku        | 4   | 3   | 2        | 4       | 2       | 15     | Pahalı ve uzay teması riski.                                                                                              |

Toplam puanda Zaman Vadisi ve Ebru önde. **Işık Ustası'nı yine de 1. sıraya koyuyorum**, çünkü proje
sahibinin "oha" tepkisini en garantili verecek sahne bu ve motorun bütün parçalarını (hacimli ışık, strob
kanalı, geri besleme, kurgu defteri, çekim kitaplığı) ilk elden sınıyor.

### 5.2 İlk prototip için üç sahne

1. **Işık Ustası:** motorun "vitrini". Bütün ortak parçaları kullanır.
2. **Zaman Vadisi:** Lyraska'nın kimliği. Kurgu defteri ve `song_timeline`'ı sınar.
3. **Ebru:** tamamen farklı bir dil (sakin, sanatsal, yerli). Güvenli modun "doğal" örneği. Simülasyon geçiş
   altyapısını sınar.

Üçü birbirinden çok farklı: biri gece kulübü, biri yolculuk, biri sanat atölyesi. Proje sahibi "hep aynı"
demez. Önceki derse göre (sahibi zor beğenir, seçenekler yan yana ve gerçek boyutta sunulmalı) önce **her biri
için 20–30 saniyelik gerçek prototip** gösterilir: aynı şarkının build ve drop kısmı, test sürümünde "Deneme"
bölümünde. Beğenilen derinleştirilir.

### 5.3 Yapım sırası (küçük PR'lar)

| #           | PR                                                              | İçerik                                                                                                                                                                                              | Bağımlılık         |
| ----------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| E0          | Son işlem zincirini birleştir                                   | `sahne-son-islem` dalının işi (bloom, ton eşleme, mavi gürültü, dinamik çözünürlük)                                                                                                                 | —                  |
| E1          | Sahne v2 iskeleti                                               | `SceneV2` arayüzü (kur, boyut, güncelle, çiz, bırak), derinlikli HDR ara görüntü, geçiş başına GPU zaman ölçümü, kalite katmanları ve ısınma ölçümü                                                 | E0                 |
| E2          | `song_timeline` komutu (Rust)                                   | vuruşlar, 10 Hz özet spektrum, bas olayları; ts-rs tipi; `check:commands`                                                                                                                           | — (E1 ile paralel) |
| E3          | Kurgu defteri (saf TS)                                          | olaylar, geri sayım, boşluk tespiti, aksak gruplar, kelimeler, çekim tohumu; kapsamlı birim testleri (4/4, 9/8, dropsuz, sözsüz şarkılar)                                                           | E2                 |
| E4          | Kanallar ve güvenli yorumlayıcı                                 | anahtar kareler, zarf, strob ve pozlama kanalı, güvenli mod dönüşümü, flashGuard sigortası; parlama testleri                                                                                        | E1, E3             |
| E5          | Ortak modüller (1)                                              | analitik ışın ve koni hacim fonksiyonları, hacimli ışık geçişi, geri besleme tamponu, Camelot → Oklab palet                                                                                         | E1                 |
| S1a         | Işık Ustası v1                                                  | pus, lazerler, hareketli ışıklar, kurgu bağlantısı, güvenli mod, `check:scenes` iki modda                                                                                                           | E4, E5             |
| E6          | Ortak modüller (2)                                              | SDF yazı atlası ve "Sözün Işığı" modülü, örneklenmiş dörtgen çizici                                                                                                                                 | E1                 |
| S2a         | Zaman Vadisi v1                                                 | arazi, lambalar, kemerler, kamera eğrisi                                                                                                                                                            | E3, E4, E6         |
| E7          | Simülasyon altyapısı                                            | ping-pong doku geçişleri, transform feedback parçacık modülü (ölçümlü)                                                                                                                              | E1                 |
| S3a         | Ebru v1                                                         | damla ve tarak dönüşümleri, yüzey ışığı, kâğıt finali                                                                                                                                               | E4, E7             |
| —           | **Sahibine gösterim**                                           | üç prototip yan yana, aynı şarkıda                                                                                                                                                                  |                    |
| S1b/S2b/S3b | v2'ler                                                          | LED duvar, kalabalık, sözler, ikinci tarak vb. (geri bildirime göre)                                                                                                                                |                    |
| R1          | Eski sahneleri kaldır                                           | VU, gece sürüşü, otoyol, spektrum, gece göğü, 10 galeri sahnesi + testleri, `check:scenes` listeleri, CLAUDE.md ağacı. **Yeni üç sahne birleşmeden kaldırılmaz**, program hiçbir an sahnesiz kalmaz | S1a–S3a            |
| S4…         | Sinyal (hızlı, zayıf GPU için), Kum, Usturlap, Vitray, Monolit… | sıralamaya göre                                                                                                                                                                                     |                    |

Her PR'da: önce testler, `npm run check`, Rust kontrolleri, `check:scenes` (yeni sahne iki modda, SwiftShader'da
düşük çözünürlükte), bağımsız inceleme ajanı. **CI notu:** `check:scenes` yazılımsal GPU'da çalışıyor; ağır
sahneler orada "Yazılımsal" katmanla ölçülmeli, yoksa süre ve zaman aşımı sorunu çıkar (Windows sahne denetimi
şimdiden ~17–20 dk).

---

## 6. Proje sahibinin vereceği kararlar

| Karar                             | Seçenekler                                                                          | Önerim                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| İlk üç sahne                      | (a) Işık Ustası + Zaman Vadisi + Ebru, (b) başka bir üçlü                           | (a)                                                                   |
| WebGPU                            | (a) WebGL2'de kal, (b) WebGPU'ya geç                                                | (a): kanıt yok, WebView2'de varsayılan açık olduğu doğrulanmadı       |
| Varsayılan modda yoğunluk düğmesi | (a) "Sakin / Normal / Çılgın" ekle, (b) ekleme                                      | (a): strobdan rahatsız olan ama epilepsi riski olmayan kullanıcı için |
| Eski sahnelerin kaldırılması      | (a) yeni üçü gelince toptan, (b) hemen                                              | (a): program sahnesiz kalmasın                                        |
| Sahnenin içinde sözler            | (a) sözleri gösteren sahnelerde alt yazıyı gizle, (b) ikisi birden                  | (a)                                                                   |
| Ton → renk eşlemesi               | (a) Camelot çarkı = renk çarkı (önerilen), (b) kapaktan renk, (c) ikisinin karışımı | (c): ton varsa tondan, yoksa kapaktan                                 |

---

## 7. Kaynaklar

**Lyraska kodu (okundu, değiştirilmedi):** `src/lib/shaderSources.ts`, `src/lib/shaderRenderer.ts`, `src/lib/gl.ts`,
`src/lib/scene.ts`, `src/hooks/useVisualFeed.ts`, `src-tauri/src/director/mod.rs`, `src-tauri/src/visual_bridge/mod.rs`,
`src-tauri/src/commands.rs`, `src/lib/bindings/*` (VisualFrame, DirectorFrame, SongMap, KeyMap, LyricWord…),
`docs/MIMARI.md` (epilepsi güvenliği, parlaklık freni), `docs/BILGI-BIRIKIMI.md`, `docs/arastirma/gorsel-vay-arastirma.md`,
`sahne-son-islem` dalı (5a8a980 "Galeri sahnelerine ortak son işlem zinciri ekle", 1934023).

**Algı ve psikoloji**

- Keltner & Haidt (2003), Approaching awe: https://pubmed.ncbi.nlm.nih.gov/29715721/ ; https://www.stern.nyu.edu/experience-stern/news/prof-jonathan-haidt-s-research-awe-featured
- Salimpoor ve ark. (2011), Nature Neuroscience 14:257–262: https://www.zlab.mcgill.ca/publications/docs/salimpoor_2011_nn.pdf ; https://www.sciencedaily.com/releases/2011/01/110112111117.htm
- Huron, Sweet Anticipation / ITPRA: https://en.wikipedia.org/wiki/Anticipation ; https://storage.gmth.de/zgmth/pdf/731
- Ses–görüntü eşzamanlılık penceresi: https://pmc.ncbi.nlm.nih.gov/articles/PMC4451240 ; https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.00736/full ; https://pmc.ncbi.nlm.nih.gov/articles/PMC4744562
- Zavagno parlama yanılsaması: https://boa.unimib.it/retrieve/22f75e41-2fbe-451b-98ab-d52fcc036149/Zavagno_2021_i-Perception-VoR.pdf ; https://pmc.ncbi.nlm.nih.gov/articles/PMC5555513/
- Shepard rampası: https://www.izotope.com/en/learn/shepard-tone ; https://attackmagazine.com/?p=97650
- Spence (2011), crossmodal correspondences (önceki araştırmadan): https://www.psy.ox.ac.uk/publications/115721

**Şovlar, VJ araçları, sanat**

- Eric Prydz HOLO: https://thecreatorsproject.vice.com/blog/eric-prydzs-holo-brings-largest-hologram-ever-to-this-years-ultra-music-festival ; https://www.e-techasia.com/?p=11037 ; https://direct.djmag.com/content/eric-prydz-shares-visuals-new-holo-live-tour-watch
- Anyma, The End of Genesys (Sphere): https://ymcinema.com/2025/01/30/the-making-of-anymas-the-end-of-genesys-at-the-las-vegas-sphere-a-groundbreaking-fusion-of-music-and-technology/ ; https://magneticmag.com/2025/01/anyma-sphere-residency-event-review/
- Lazer, pus ve ışın: https://ilda.com/hazefoglasers.htm ; https://pangolin.com/blogs/news/types-of-laser-shows
- Ryoji Ikeda, test pattern: https://special.ycam.jp/datamatics/en/testpattern.html ; https://www.e-flux.com/announcements/39634/ryoji-ikeda-datamatics
- Synesthesia ses değişkenleri: https://community.troikatronix.com/post/49692
- Resolume BPM senkronu: https://resolume.com/article/38
- NestDrop: https://nestimmersion.ca/nestdrop.php ; https://nestimmersion.ca/assets/nestdrop_user_manual_V2x2.pdf
- Magic Music Visuals: https://en.wikipedia.org/wiki/Magic_Music_Visuals ; https://magicmusicvisuals.com/forums/viewtopic.php?p=8733
- Plane9: https://alternativeto.net/software/plane9/
- TouchDesigner audioAnalysis: https://interactiveimmersive.io/blog/touchdesigner-lessons/how-to-make-anything-audio-reactive-in-touchdesigner/
- Revision 2025 sonuçları: https://glslhacker.geeks3d.com/20250422/demoscene-revision-2025 ; https://discourse.panda3d.org/t/melodice-by-damage-1st-place-at-revision-2025-pc-demo-competition/31057
- Crutchfield (1984), video geri beslemesi: https://csc.ucdavis.edu/~cmg/papers/Crutchfield.PhysicaD1984

**Teknikler ve donanım**

- Intel Iris Xe 96EU özellikleri: https://nanoreview.net/en/gpu-compare/intel-iris-xe-graphics-g7-96eu-vs-intel-arc-igpu-4-cores ; https://technical.city/en/gpu/Iris-Xe-Graphics-96EU
- WebGL2 parçacıklar (transform feedback): https://gpfault.net/posts/webgl2-particles.txt.html ; ölçüm raporu: https://gamedev.net/forums/topic/626098-output-data-types-for-transform-feedback/ ; https://github.com/JJPro/OpenGL--Particle-Simulation-with-TransformFeedback-Buffer
- GPU zaman ölçümü eklentisi: https://web3dsurvey.com/webgl2/extensions/EXT_disjoint_timer_query_webgl2 ; https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query
- Hacimli ışık, GPU Gems 3 bölüm 13: https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process
- GPU akışkanı, GPU Gems bölüm 38: https://developer.nvidia.com/gpugems/GPUGems/gpugems_ch38.html ; WebGL akışkanı (MIT): https://github.com/hirajanwin/WebGL-Fluid-Simulation/blob/master/README.md
- Tepkime-yayılım (Karl Sims): https://www.karlsims.com/rd.html ; https://github.com/piellardj/reaction-diffusion-webgl
- Mathematical Marbling (Lu, Jaffer ve ark., IEEE CG&A 2012): https://Www.Gwern.net/doc/cs/cellular-automaton/2012-lu.pdf ; https://blog.amandaghassaei.com/2022/10/25/digital-marbling/ ; https://people.csail.mit.edu/jaffer/Marbling/transfer.pdf
- Chladni figürleri: https://barbegenerativediary.com/en/tutorials/how-to-create-a-chladni-figure-with-processing/ ; https://link.springer.com/article/10.1007/s42452-020-04062-6 ; https://arxiv.org/pdf/2008.01693
- Usturlap parçaları: https://www.mhs.ox.ac.uk/students/03to04/Astrolabes/Starholder_parts.html ; https://www.whipplemuseum.cam.ac.uk/explore-whipple-collections/astronomy/medieval-astrolabe/parts-astrolabe
- AMD FSR1: https://gpuopen.com/manuals/fidelityfx_sdk/techniques/super-resolution-spatial/ ; https://github.com/GPUOpen-Effects/FidelityFX-FSR/releases/tag/v1.0.2 ; https://threejs.org/docs/pages/FSR1Node.html
- AgX (three.js tartışması): https://discourse.threejs.org/t/is-agx-tonemapping-implemented-correctly/60609
- Inigo Quilez kod lisansı (algoritma kodu MIT, sanat eseri kodu telifli): https://iquilezles.org/articles/ ; https://iquilezles.org/
- Önceki araştırmadaki teknik kaynaklar (Jimenez bloom, Dual Kawase, mobil bloom ölçümü, Oklab, mavi gürültü,
  Shadertoy ve LYGIA lisans uyarıları): `docs/arastirma/gorsel-vay-arastirma.md` "Kaynaklar" bölümü.

**WebGPU**

- https://web.dev/blog/webgpu-supported-major-browsers ; https://developer.chrome.com/docs/web-platform/webgpu ;
  https://github.com/tauri-apps/tauri/issues/6381 ; https://www.utsubo.com/blog/frontier-web-apis-2026-production-ready
- Karşılaştırma uyarıları: https://https-toji_dev.proxy.bugsmash.io/webgpu-best-practices/webgl-performance-comparison ;
  https://discourse.threejs.org/t/webgpu-significant-performance-drop-and-shadow-quality-regression-in-r182-vs-webgl-r170/89322 ;
  https://forum.babylonjs.com/t/about-webgpu-vs-webgl2-rendering-performance/39964

**Doğrulayamadıklarım:** WebView2'de WebGPU'nun varsayılan durumu; FSR1'in lisans dosyası (MIT olduğu
biliniyor, görmedim); Iris Xe'de WebGL2 parçacık ve bloom için doğrudan ölçüm (tablodaki süreler tahmin, E1
PR'ında ölçülecek); Revision 2025 64k sonucunun ikinci bir kaynağı.
