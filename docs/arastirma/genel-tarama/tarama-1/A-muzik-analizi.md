# A. Müzik analizi: beat, ölçü, aksak, yapı, drop, ton/akor, enerji, duygu

Tarama 1, 6 Kasım 2026. Çerçeve: yeni karar (6 Kasım 2026) — ticari olmayan (NC) ya da araştırma lisanslı **model
ağırlıkları ve veri setleri** yalnızca sahibinin bilgisayarında yerel paket olarak kullanılabilir; kod GPL-3.0 ile
uyumlu kalır; lisansı hiç yazılmamış model alınmaz.

**Erişim notu.** Oturumun ilk yarısında yalnızca GitHub (ham dosyalar), PyPI ve YouTube açıktı; sonra ağ genişletildi
(arXiv, Hugging Face API'si, ISMIR arşivi vb.; ayrıntı `00-OZET.md` sonunda). Önemli sayılar ve lisanslar sonradan
birincil kaynaktan yeniden okundu; iki arama özeti yanlış çıktı (aşağıda "düzeltme" diye işaretli).

- **[birincil]** = kaynak dosyası (depo README/LICENSE, makale PDF'i, Hugging Face model kartı) bu oturumda okundu.
- **[özet]** = yalnızca arama motorunun özeti; makalenin kendisi okunmadı → sayılar "doğrulanmadı".
- **[tahmin]** = benim hesabım ya da çıkarımım.

## 0. Kısa sonuç (bu dosyanın en önemli 6 bulgusu)

1. **Beat This! (JKU Linz, ISMIR 2024) kodu ve ağırlıkları MIT** [birincil: README "The code and the published model
   weights are released under the MIT license"]. Eski kurala göre bile "ağırlık açık lisanslı, veri karışık" sınıfına
   girerdi (Spleeter/Omnilingual gibi); yeni kararla yerel pakette tartışmasız kullanılabilir. Beat **ve ölçü başı**
   verir, DBN (olasılıklı son işlem) gerektirmez. Ana model ~20 M parametre (~78 MB), küçük model ~2 M (~8,1 MB).
   GTZAN'da (eğitime girmemiş) beat F1 **89,1**, ölçü başı F1 **78,3**; küçük model 88,8 / 77,2 [birincil: makale
   Tablo 2, arXiv 2407.21658]. Hazır **ONNX dönüşümü de MIT** (HF `thebluescreen/beat-this-onnx`: 22,05 kHz mono dalga
   girer, log-mel ön ucu grafiğin içinde, 50 kare/sn beat ve ölçü başı logit'i çıkar; PyTorch'la 1e-4 içinde aynı)
   [birincil: model kartı]. Lyraska'nın hedefi F ≥ 0,80; mevcut klasik izleyici sentetik
   sette 0,94–0,96 ama **gerçek kütüphanede ölçülmedi** (köy işinde doğru beat zamanı yoktu). En büyük tek kazanç adayı.
2. **Ağırlıksız kullanım fırsatı:** Beat This'in çıktısı bir "beat etkinliği" eğrisidir. Lyraska'nın bugünkü
   `beats.rs` dinamik programlaması (Ellis 2007) ve `tempo.rs`/`meter.rs` kuralları **başlangıç gücünün yerine bu
   eğriyi** alabilir. Böylece mevcut Türk müziği ve oktav kuralları korunur, yalnızca "kanıt" güçlenir. [tahmin]
3. **Beat This'in eğitim setinde Türk makam/aksak verisi yok** [birincil: annotations README'deki 16 set: asap,
   ballroom, beatles, candombe, filosax, groove_midi, gtzan, guitarset, hainsworth, harmonix, hjdb, jaah, rwc, simac,
   smc, tapcorrect]. Aksak usullerde (9/8, 7/8) sinir ağı modelinin iyi olacağı varsayılamaz; `meter.rs` kalmalı,
   ölçüm şart. Literatürde Türk makamı için Bayesçi ölçü izleme (Holzapfel, Krebs, Srinivasamurthy, ISMIR 2014):
   usul bilinirken aksak 9/8'de beat F 91,0 ve ölçü başı F 88,6, düyek 8/8'de 85,2 / 75,4, curcuna 10/8'de 89,1 /
   48,6; usul bilinmeden (tek büyük model) ölçü başı F aksak 65,1, düyek 72,6, curcuna 41,1 [birincil: makale Tablo 1].
   **Düzeltme:** arama özetinin "ölçü başı doğruluğu %69,6" dediği sayı aslında usulün (ritim sınıfının) **tanınma**
   oranı.
4. **Yapı/bölüm etiketleme (intro/verse/chorus):** SongFormer (ASLP-lab, 2025) HarmonixSet'te HR.5F 0,703, ACC 0,795
   [birincil: depo README tablosu]; All-In-One (KAIST, WASPAA 2023) ACC 0,740 [aynı tablo]. Ama ikisi de ağır:
   All-In-One önce **Demucs** ile ayrıştırma ister; SongFormer **MuQ** (ağırlıklar CC-BY-NC 4.0 [birincil]) + MusicFM
   (FMA ile eğitilmiş, MIT/Apache [birincil]) ister, 420 sn pencereli. Yerel pakette lisans olarak mümkün; CPU
   maliyeti yüksek [tahmin: 4 dk şarkı için dakikalar]. Lyraska'nın asıl ihtiyacı etiket değil "aynı bölüm aynı tema",
   bu zaten Foote + benzerlikle var.
5. **Drop:** akademik literatür ince (Yadati ve ark., ISMIR 2014; MediaEval 2014). Lyraska'nın drop işi literatürden
   ileride; asıl eksik gerçek veride ölçüm. EDM için yeni bir yapı modeli var (EDMFormer, 2026 ön baskı [özet]).
6. **Ton:** Krumhansl–Kessler profilleri EDM'de bilinen zayıflık (Faraldo, "Key Estimation in Electronic Dance
   Music"). **libKeyFinder GPL-3.0** (Mixxx'in kullandığı) — Lyraska'nın lisansıyla doğrudan uyumlu, karşılaştırma
   temeli olarak ideal. Sinir ağı ton modelleri GiantSteps'te %71–75 civarı [özet: S-KEY makalesi madmom'u %71,0,
   kendini %72,1 ölçüyor]; madmom ton modeli CC BY-NC-SA → yeni kararla yerel pakette kullanılabilir.

## 1. Beat ve tempo

### 1.1 Bugünkü durum (Lyraska)

`analysis/beats.rs`: logaritmik bantlarda spektral akı → öz-ilinti tempo → Ellis DP; `tempo.rs`: oktav kuralları
(davul kanıtı, yarım tempo hissi, 3:2); `meter.rs`: aksak. Sentetik son sınamada 66 şarkının 60'ı doğru tempo, beat F
0,95 (`docs/arastirma/tempo/README.md`). Köy işinde (656 gerçek şarkı) tempo yayımlanan BPM'lerle karşılaştırıldı ama
**vuruş zamanlarının doğrusu yoktu**: F-ölçüsü hedefi (≥ 0,80) gerçek müzikte hâlâ ölçülmemiş durumda. Bu, yol
haritasında da yazıyor ("yalnızca yerel araçlarla ölçülüyor").

### 1.2 Literatür ve modeller

| Yöntem                                                  | Ne                                                                                                                                               | Kod / Ağırlık / Veri lisansı                                              | Yerel pakette?                                                          | Kaynak                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| **Beat This!** (Foscarin, Schlüter, Widmer, ISMIR 2024) | Transformer + kısmi transformer, beat ve ölçü başı; DBN yok; "small" ~2 M parametre                                                              | MIT / **MIT** / 16 set (bazısı telifli ya da sınırlı CC; README uyarıyor) | **Evet** (ağırlık açıkça MIT; dağıtım bile tartışılabilir)              | [birincil] github.com/CPJKU/beat_this README, LICENSE |
| madmom (Böck ve ark.) RNN/TCN + DBN                     | Klasik derin beat/ölçü başı, 2016–2020'nin standardı                                                                                             | BSD / **CC BY-NC-SA 4.0** / çeşitli                                       | Evet (yeni kararla; eskiden yasak)                                      | [birincil] CPJKU/madmom LICENSE                       |
| BeatNet (Heydari ve ark., ISMIR 2021)                   | CRNN + parçacık süzgeci, çevrimiçi                                                                                                               | README'ye göre; LICENSE dosyası **CC BY 4.0**                             | Evet (ağırlıklar depoda; ayrıca doğrulanmalı)                           | [birincil] mjhydri/BeatNet LICENSE                    |
| All-In-One (Kim, Nam; WASPAA 2023)                      | Beat, ölçü başı, tempo, bölüm sınırı ve etiketi; Demucs ile ayrılmış seste                                                                       | MIT / **MIT** (HF kartı `taejunkim/allinone`) / Harmonix                  | Kendisi evet; ama girişi Demucs (ağırlık "not clear") → zincir belirsiz | [birincil] README, loaders.py, HF API                 |
| BeatFM (2025)                                           | Önceden eğitilmiş müzik temel modeli üstüne beat                                                                                                 | okunmadı                                                                  | Belirsiz                                                                | [özet] arXiv 2508.09790                               |
| Maskeli difüzyon ile tutarlı beat (2026)                | Beat This'in "iki ızgarayı karıştırma" hatasını (ardışık iki ölçü başı, tempo sıçraması) maskeli difüzyonla düzeltir                             | okunmadı                                                                  | Belirsiz                                                                | [özet] arXiv 2608.04624; yazarın paylaşımı            |
| "SMC Blind Spot" (2026)                                 | SMC setinde (zor, ifadeli müzik) hata türleri: oktav, süreklilik, tam kayıp; DBN'in 55 BPM alt sınırı SMC'nin ~%21'inde doğru tempoyu engelliyor | —                                                                         | —                                                                       | [özet] arXiv 2605.12287                               |
| TCN-HSMM (Oyama ve ark., IPSJ 2022)                     | TCN olasılıkları + gizli yarı-Markov, ölçü değişen şarkılar                                                                                      | —                                                                         | —                                                                       | [özet] Japonca IPSJ raporu                            |

Sonuç tabloları [birincil: Beat This makalesi Tablo 2, GTZAN]: Beat This 89,1 / 78,3; Hung ve ark. (2022) 88,7 / 75,6;
Beat This + DBN 88,1 / 77,4. **Önemli ayrıntı:** süreklilik ölçüleri (CMLt) Beat This'te Hung'dan düşük (beat 79,8'e
81,2; ölçü başı 67,3'e 71,5). Yazarlar nedenini "karmaşık ya da az temsil edilen parçalarda ağ periyodik olmayan
vuruşlar üretiyor" diye açıklıyor [birincil]. Bu, Lyraska için iyi haber: Beat This'in olasılığı Lyraska'nın kendi
dinamik programlamasına (periyodikliği zorlar) girerse iki tarafın gücü birleşir. SMC'de Beat This 62,7 [özet,
derleyici site]. **Önemli bağlam:** GTZAN, Ballroom gibi "ana akım,
vurmalı" setlerde F1 neredeyse tavanda; zor olan ifadeli, davulsuz müzik (SMC) ve oktav seçimi. Lyraska'nın
kütüphanesinde (çoğu EDM) zorluk oktav ve tür kuralı (DnB 170'ler, dubstep 140); bunu Lyraska zaten kendi kuralıyla
çözüyor. Sinir ağının katkısı **vuruşun yeri** ve **ölçü başında** olur, temponun oktavında değil.

### 1.3 Lyraska'nın "önceden bilme" avantajı ve beat

- Çevrimiçi (anlık) izleyiciler geleceği göremez; Lyraska bütün şarkıyı görür. Beat This zaten çevrimdışı
  (iki yönlü) çalışır; bu açıdan Lyraska'yla aynı sınıfta.
- Ek avantaj: **tekrar eden bölümler**. Aynı nakarat şarkıda 3 kez geçiyorsa, üçünün beat ızgarası aynı olmalı.
  Benzerlik matrisi zaten var (`structure.rs`); tekrarlar arasında ızgara tutarlılığı bir sınama ve düzeltme işareti
  olabilir. Literatürde "structure-informed beat tracking" diye ayrı bir alan görmedim [tahmin; doğrulanmadı].
- Ayrılmış davul kanalı (bkz. B dosyası) varsa beat kanıtı ondan alınabilir; All-In-One'ın tasarımı bunun işe yaradığı
  iddiasına dayanıyor [birincil: başlıkta "on Demixed Audio"].

### 1.4 Öneri A-1 (öncelik yüksek)

- **İş:** Beat This "small" (sonra "final") ONNX'e çevrilir (sahibinin bilgisayarında Python ile, bir kez), tract ile
  çalışır. Çıktı (50 kare/sn beat ve ölçü başı olasılığı) `beats.rs`'te spektral akının yerine ya da yanına girer;
  `tempo.rs`, `meter.rs` kuralları aynen kalır. Yeni analiz parçası (kendi sürümü, `cache::VERSIONS`).
- **Modül:** `analysis/beats.rs` (+ yeni `analysis/beat_model.rs`), `lyrics_model.rs`'teki tract kalıbı (ayrı kısa
  ömürlü iş parçacığı — AVX `vzeroupper` dersi, BILGI §5).
- **CPU tahmini [tahmin]:** small modelde 4 dk şarkı ~1–3 sn, final modelde ~5–15 sn, bellek < 500 MB. Önce
  sahibinin VNNI'siz Ryzen'inde ölçülür (BILGI §5 dersi).
- **Ölçüm:** (1) GTZAN (eğitime girmemiş; ses telifli → yalnızca yerel) beat F (±70 ms) ve ölçü başı F; (2) köy işi
  kütüphanesinin 86 "iki biçimli" şarkısında tutarlılık; (3) sahibinin İşaretle panelinde işaretlediği 20 şarkı;
  (4) aksak sentetik set + CompMusic Türk usul seti (bkz. H). **Kapı:** gerçek sette beat F ≥ 0,80 ve hiçbir türde
  mevcut yöntemin altına düşmemek (BILGI §5 kuralı); aksakta mevcut `meter.rs` isabeti korunmalı.

## 2. Ölçü başı ve aksak ölçü (Türk müziği dahil)

- **Literatür:** Holzapfel, Krebs, Srinivasamurthy, "Tracking the 'odd': meter inference in a culturally diverse
  music corpus" (ISMIR 2014): Türk makamı (aksak 9/8, curcuna 10/8, düyek 8/8), Karnatik ve Girit müziği; "bar
  pointer" (ölçü içi konum, tempo ve ritim kalıbı gizli değişkenli) Bayesçi model, kalıplar usul başına 1–3 kalıpla
  öğreniliyor. Sonuçlar yukarıda §0.3 [birincil]. **Ders:** usul bilinince ölçü başı aksakta bile ~%89; usul
  bilinmeyince ~%65. Yani asıl zor iş "hangi usul" kararı — Lyraska'nın yanlış aksak sorunu da tam bu. Devamı:
  Srinivasamurthy ve ark., parçacık süzgeçli ölçü izleme (ISMIR 2015) ve uzun çevrimler için genelleştirilmiş model
  (ICASSP 2016) [özet]. Bozkurt, Ayangil, Holzapfel'in derlemesi (JNMR 43(1), 2014) usul tanımayı da kapsıyor [özet].
- **Veri:** CompMusic: 82 adet 1 dakikalık Türk makam kaydı (32 aksak, 20 curcuna, 30 düyek), beat ve ölçü başı
  işaretli [birincil: Holzapfel ve ark. 2014]; ayrıca "OTMM vocal onsets" seti [özet]. Lisansları bu ortamdan okunamadı (compmusic.upf.edu kapalı);
  CompMusic verilerinin çoğu araştırma amaçlı → yeni kararla yerel ölçümde kullanılabilir, belirsiz.
- **Lyraska'nın durumu:** `meter.rs` kalıp ilintisi, literatürdeki "kalıp gizli değişkeni" fikrinin hafif bir
  sürümü. Bilinen sorun: maksum, Türk pop'u, swing'li hip-hop ve breakbeat'te **yanlış aksak** (ACIK-KONULAR).
  Bunun nedeni [tahmin]: aksak kararı tek bir ilinti farkına dayanıyor; düzenli ölçüde de senkoplu darbuka/swing
  3+3+2 gibi gruplanmış vurgu verir (maksum = 2+3+3 ya da "düm-tek-tek-düm-tek" senkopu, 8/8). Yani **maksumun kendisi
  vurgu bakımından aksağa benzer** ama ölçü düzenlidir: vurgu kalıbı ile ölçü süresi ayrı şeylerdir.
- **Öneri A-2:** aksak kararına "ölçü süresi" kanıtı eklenir: aksak ölçü (9/8) ile düzenli ölçünün (8/8) **süreleri
  farklıdır**; ölçü başları arası süre (bar uzunluğu) şarkı boyunca hangi kalıba göre sabit kalıyorsa o seçilir.
  Vurgu kalıbı (3+3+2) düzenli 8'liğe sığıyorsa aksak değil, senkoplu düzenli ölçüdür. Ölçüm: maksum ve Türk pop'u
  sentetik seti + karşı örnek üreteci (`karsi.py`), hedef: yanlış aksak 0, gerçek 9/8–7/8 isabeti korunur. CPU: ihmal.

## 3. Yapı ve bölüm etiketleme

- SongFormer README tablosu [birincil] — SongFormBench-HarmonixSet: All-In-One ACC 0,740 / HR.5F 0,596; LinkSeg
  0,780 / 0,630; SongFormer (HX) 0,795 / 0,703; Gemini 2.5 Pro 0,748 / 0,423. Çince sette SongFormer 0,891 ACC.
  Lisans: depo CC BY 4.0; temel modellerden MuQ ağırlıkları **CC-BY-NC 4.0** [birincil: tencent-ailab/MuQ README],
  MusicFM FMA (Creative Commons ses) ile eğitilmiş ve MIT/Apache [birincil: minzwon/musicfm README]. SongFormer'ın
  HF kartında lisans alanı boş ama kartta "CC BY 4.0" rozeti var [birincil: HF `ASLP-lab/SongFormer`] → yerel pakette
  **kullanılabilir** (MuQ NC ile birlikte; yalnızca yerelde).
- Sonraki iş (SCALE, 2026, söz + ses kanıtı) SongFormer'ı HR.5F'de 3,5 puan geçtiğini söylüyor [özet].
- EDM'ye özel: EDMFormer (2026 ön baskı) SongFormer'ın pop etiketlerinin EDM'ye uymadığını söylüyor [özet].
  Lyraska kütüphanesinin çoğu EDM olduğu için önemli: "verse/chorus" yerine "build-up / drop / breakdown" etiketi
  daha anlamlı.
- **Değerlendirme:** Görsel Yönetmen için gereken (a) sınırın doğru yerde olması (±0,5 sn), (b) aynı bölümün aynı tema
  alması, (c) EDM'de build/drop/breakdown. Etiket adı ("nakarat") bilgi kartında güzel ama koreografide az değerli.
  Önerim: önce Lyraska'nın kendi sınırlarını HR.5F ile ölçmek (Harmonix ek açıklamaları MIT [birincil:
  urinieto/harmonixset LICENSE]; ses YouTube'dan hizalanıyor, telifli → yalnızca yerel). Ağır temel model ancak ölçüm
  kendi yöntemin açıkça geride olduğunu gösterirse.
- **"Önceden bilme" için asıl fırsat:** sözler. Sözler varsa nakarat = tekrar eden söz satırları; bu, sesten çok daha
  güvenilir bir "aynı bölüm" işaretidir (SCALE'in fikri de bu [özet]). Lyraska'da sözler zaten zamanlanıyor
  (`lyrics_job.rs`). Öneri A-3: tekrar eden söz öbeklerinin zamanını bölüm benzerlik matrisine ek kanıt olarak
  vermek; ölçüm: sözlü 20 şarkıda HR.5F ve "aynı nakarat aynı etiket" oranı. CPU: ihmal.

## 4. Drop ve yükseliş

- Yadati, Larson, Liem, Hanjalic, ISMIR 2014 (TU Delft): iki adımlı içerik tabanlı drop sezimi [özet]; MediaEval 2014
  CrowdSorting görevi [özet]. Bir GitHub projesi (felixmeyer6/drop-detector) Yadati'ye F1 0,71, kendi XGBoost'una
  0,95 diyor [özet, doğrulanmadı; kendi verisinde].
- Solberg & Jensenius (2016) yükseliş-drop boyunca beden hareketi; drop'ta deri iletkenliği tepkisi en yüksek
  (önceki araştırmada `gorsel-vay-arastirma.md` B6) — yani drop'un algısal önemi ölçülmüş.
- Vande Veire & De Bie (2018), açık kaynak "Auto-DJ" drum and bass için yapı ve drop sezimi [bilgim; bu oturumda
  doğrulanmadı].
- **Değerlendirme:** Lyraska'nın drop kuralları (bas dönüşü, rulo, sıkıştırılmış kayıt) yayımlanmış yöntemlerden
  daha ayrıntılı; sorun **gerçek müzikte doğrulanmamış** olması (sentetik son sınamada 22/38, ACIK-KONULAR A15).
  Yeni model aramak yerine ölçüm: (a) Beat This ölçü başı ile drop'un ölçü başına oturması, (b) ayrılmış bas ve davul
  kanalından bas dönüşü (B dosyası), (c) sahibinin 20 EDM şarkısında işaret.

## 5. Ton ve akor

- **Klasik:** Krumhansl–Kessler (Lyraska), Temperley, Shaath (libKeyFinder), Faraldo'nun EDM profilleri (edma,
  bgate). libKeyFinder **GPL-3.0-or-later** [birincil: mixxxdj/libkeyfinder README ve LICENSE]. Kullanıcı testleri (DubSpot laboratuvar raporu 2026, 200 parça; dans/elektronik alt kümesi 50
  parça): Mixed In Key %94, KeyFinder %90, Beatport %88, Rekordbox %82 [özet; tek kaynak, satıcı blogu]; 2020 Reddit
  karşılaştırması Mixed In Key ~%76,5, Traktor %73,8, Rekordbox %69,2 [özet]. Sonuç: araçlar arasında fark var, ama
  hepsi %70–94 aralığında; Lyraska'nın hedefi (%80, aynı ya da Camelot komşusu) gerçekçi.
- **Öğrenmeli:** S-KEY makalesi (Deezer, ICASSP 2025, öz-denetimli) MIREX ağırlıklı puanı [birincil: arXiv 2501.12907
  Tablo]: GiantSteps'te madmom 71,0, S-KEY (1 M şarkı) 72,1; GTZAN'da 67,9 / 74,4; FMAKv2'de 73,1 / 73,2; KeyMyna (2026) öz-denetimli ön eğitimle
  "en iyi" iddiası [özet]. **Ders:** öğrenmeli modeller klasik profillerin çok önünde değil; EDM'de klasik + EDM
  profili zaten iyi.
- **Akor:** ChordFormer (2025, konformer) önceki modellere göre çerçeve doğruluğunda ~%2, sınıf doğruluğunda ~%6
  kazanç [özet]; BTC (Park ve ark., ISMIR 2019). Görsel Yönetmen için akor değişimi "armoni ritmi" olarak değerli
  (ölçü başı kanıtı da zaten bu: `structure.rs` tını/armoni değişimi).
- **Öneri A-4:** (1) libKeyFinder ile karşılaştırmalı ölçüm (GiantSteps key: ek açıklamalar açık, ses Beatport önizlemesi
  → yalnızca yerel); (2) EDM için Faraldo profilini **ikinci profil** olarak eklemek (lisans sorunu yok: profil
  sayıları bilimsel veri, makaleden alınır, kaynak gösterilir). Kapı: GiantSteps'te MIREX ağırlıklı puan ≥ 0,70 ve
  sahibinin işaretli şarkılarında ≥ %80. CPU: ihmal.

## 6. Enerji, duygu (atmosfer katmanı) ve tür

- **Literatür özeti:** Müzik duygu tanımada (MER) uyarılma (arousal) değerliliğe (valence) göre çok daha kolay
  tahmin edilir: PMEmo'da Music2Emo (Kang & Herremans 2025) R² değerlik 0,46, uyarılma 0,64; 2026 devamında 0,57 / 0,73
  [özet]. **Ders:** "enerji/uyarılma" klasik özelliklerden güvenle çıkar (Lyraska zaten yapıyor); "mutlu/hüzünlü"
  (değerlik) zor ve kültüre bağlı (Türkçe arabesk minör ama her zaman "hüzünlü" değil). Çince pop'ta bölüm bölüm
  değerlik–uyarılma yörüngesi üzerine 2026 ön baskısı [özet: arXiv 2609.15675] — bölüm bazlı duygu fikrini
  destekliyor.
- **Modeller ve lisans:** MTG/Essentia modelleri (Discogs-EffNet; ruh hâli, tür, 400 Discogs stili) **CC BY-NC-SA 4.0**
  [özet: essentia.upf.edu/models]; ONNX sürümleri MTG'nin kendi sunucusunda (`discogs-effnet-bsdynamic-1.onnx`)
  [özet]. **Essentia kütüphanesi AGPL → kod olarak alınmaz**, ama ONNX ağırlıkları tract ile Lyraska'nın kendi
  kodunda çalıştırılabilir (yalnızca giriş özelliği — mel spektrogram — Essentia'nınkiyle aynı hesaplanmalı).
  Yeni kararla yerel pakette **kullanılabilir**. mStream (açık kaynak müzik sunucusu) aynı modelleri "discovery
  models" olarak dağıtıyor ve NC uyarısı koyuyor [özet] — benzer bir ürün örneği.
  MERT (CC BY-NC 4.0 [bilgim]) ve MuQ (CC-BY-NC 4.0 [birincil]) genel temel modeller: güçlü ama 95–330 M parametre.
- **Lyraska için anlamı [tahmin]:** Atmosfer katmanı bugün bölüm enerjisinden "ruh hâli" çıkarıyor. Tür (ör. "DnB",
  "arabesk", "lo-fi") ve ruh hâli etiketleri (sakin/agresif/mutlu/hüzünlü) paleti ve sahne seçimini besleyebilir;
  ayrıca tempo kuralının tür önsel bilgisi olur (DnB → 170'ler). Discogs-EffNet tek model, ~20 MB [tahmin], 4 dk
  şarkıda CPU'da birkaç saniye [tahmin].
- **Öneri A-5 (orta öncelik):** Discogs-EffNet + ruh hâli başlıkları yerel "Analiz paketi"nde; çıktı yalnızca birkaç
  sayı (tür olasılıkları, uyarılma, değerlik) olarak önbelleğe. Ölçüm: tempo oktav hatalarında tür önselinin
  etkisi (köy işi kütüphanesi: hardstyle/frenchcore/DnB hataları, hedef: bugünkü açık 2× hatalarının yarısını
  kapatmak, hiçbir doğruyu bozmamak). Görsel etki sahibinin önizlemesiyle.

## 7. Hata ya da eksik gördüğüm mevcut kararlar

1. **Kalite hedefi "beat F ≥ 0,80" gerçek müzikte hiç ölçülmedi.** Sentetik setler üreticinin izini öğretiyor
   (BILGI §5 dersi). Beat This ile ölçmek hem yöntem hem ölçü sorunu çözer: Beat This'i "öğretmen" (vekil doğru) olarak
   kullanıp sahibinin 656 şarkısında Lyraska'nın kendi izleyicisini karşılaştırmak, el işareti olmadan ilk gerçek
   ölçek ölçümü olur (Beat This F1 ~0,89 → vekil hatası ±; uyuşmazlıklar elle dinlenir). [tahmin; yöntem önerisi]
2. **ROADMAP "Fikir havuzu: yapay zekâ ile beat/bölüm tespiti — bilinen bazı modellerin ağırlıkları ticari kullanımı
   yasakladığı için seçim dikkatle yapılmalı"** — artık iki açıdan güncel değil: Beat This MIT; yeni kararla NC de
   yerelde serbest.
3. **Ton güveni:** EDM'de modal (Dor, Frig) ve tek akorlu şarkılar çok; KK profili minör/majör dışını bilmez.
   Güven düşük göstermemek doğru karar, korunmalı.

## 8. Çok dilli taramadan gelenler (Almanca, Portekizce, Japonca, Çince, Korece, Türkçe)

- **AudioLabs Erlangen (Almanca kaynak araması):** Meier, Chiu, Müller, "A Real-Time Beat Tracking System with Zero
  Latency and Enhanced Controllability", TISMIR 7(1): 213–227, 2024 — PLP (baskın yerel nabız) tabanlı, **sıfır
  gecikmeli** gerçek zamanlı beat izleme; her karede "beat bağlamı, beat kararlılığı ve ileriye bakış (beat'i önceden
  tahmin)" verir [birincil: audiolabs-erlangen.de kaynak sayfası]. Kodu **MIT** (Fraunhofer IIS) [birincil:
  groupmm/real_time_plp LICENSE]. **Lyraska'ya etkisi:** ROADMAP Faz 5'teki **"Sistem sesi modu"** (bilgisayarda çalan her
  sesi görselleştirme) şarkıyı önceden bilemez; orada tam bu yöntem gerekir. "Beat kararlılığı" sinyali, güvenli
  olmayan anlarda nabzı kısmak için de doğal bir kapı. Aynı gruptan 2024 lisans tezi (Müermann) beat'ten LFO ve güven
  denetim sinyali üretip efekt sürüyor [özet]; 2025 doktora tezi (Meier) gerçek zamanlı beat ve perde [özet].
- **Latin Amerika (Portekizce/İspanyolca kaynak araması):** Morais, McFee, Fuentes (LatinMIR 2024, Rio): beat/ölçü başı
  modelleri çoğunlukla 4/4 veriyle eğitildiği için samba (2/4) gibi repertuvarlarda genellemiyor; 2/4 ve 3/4 ölçüleri
  çoğaltan veri artırımı görülmemiş samba setinde ölçü başını iyileştiriyor [özet]. Maia ve ark.: samba ve candombe'ye
  az ek açıklama ve az hesapla uyarlama [özet]. SAMBASET (ISMIR 2019): 40+ saat samba de enredo, yarı otomatik beat
  ek açıklaması [özet; Zenodo 3527888]. **Lyraska'ya etkisi:** Türk aksak usulleri için aynı ders — hazır sinir ağı
  modeli (Beat This) aksakta zayıf kalırsa, yeni kararla **yerelde ince ayar** (fine-tuning) mümkün: Lyraska'nın sentetik
  aksak üreticisi + CompMusic usul seti (NC, yerel) + sahibinin işaretleri. Ağırlık yalnızca sahibinin bilgisayarında
  kalır. Büyük iş; ancak A-1 ölçümü aksakta açık bir açık gösterirse.
- **Japonca (IPSJ):** Oyama ve ark. (2022) TCN olasılığı + gizli yarı-Markov modeli (HSMM) ve Viterbi ile ölçüsü şarkı
  içinde değişen müziği izliyor [özet]. Lyraska'nın "olasılık + dinamik programlama" önerisi (A-1) bunun aynı ailesi.
- **Korece (KAIST):** All-In-One'ın kaynağı KAIST Kültür Teknolojisi Yüksek Okulu (Nam laboratuvarı); öğrenilmiş
  özelliklerle öz-benzerlik matrisi + Gauss dama çekirdeğiyle sınır bulan 2020 yüksek lisans tezi [özet] — Lyraska'nın
  Foote yöntemine öğrenilmiş özellik eklemenin örneği.
- **Çince ve Türkçe:** bu taramada yeni bir yöntem bulunmadı; Türkçede otomatik usul tanıma üzerine tez bulunamadı
  (YÖK Tez Merkezi doğrudan aranmadı) [özet]. Türk makamında hesaplamalı çalışmaların ana kaynağı hâlâ CompMusic (UPF).
