# B. Kaynak ayrıştırma (davul / bas / vokal / diğer)

Tarama 1, 6 Kasım 2026. İşaretler: **[birincil]** kaynak dosyası (depo, makale PDF'i, model kartı) bu oturumda
okundu; **[özet]** yalnızca arama özeti; **[tahmin]** benim hesabım. Mevcut rapor
(`docs/arastirma/kaynak-ayristirma/RAPOR.md` ve üç dil raporu) lisansı ayrıntılı taradı; burada tekrar edilmez,
**yeni karara göre yeniden değerlendirilir**, iki yanlışı düzeltilir ve kalite, hız, "Lyraska'nın asıl ihtiyacı"
analizi eklenir.

## 0. Kısa sonuç

1. **Yeni karar tabloyu tersine çeviriyor.** Eskiden "ticari kullanılabilir tek model Spleeter" sonucu vardı. Artık
   MUSDB18/MoisesDB ile eğitilmiş ama **ağırlık lisansı açıkça yazılmış** modeller yerel pakette kullanılabilir:
   ZFTurbo **BS-RoFormer 4 kanal** (yazar: "I released this checkpoint under the MIT license"; veri MUSDB18-HQ),
   MUSDB18-HQ test ortalaması **9,65 dB** (bas 8,48, davul 11,61, vokal 11,08, diğer 7,44) [birincil: ZFTurbo
   `docs/pretrained_models.md`]. Spleeter 4 kanal ~5,9 dB (önceki rapor). Fark ~3,7 dB.
2. **Önceki raporda iki düzeltme** [birincil: Hugging Face model kartı API'si, bu oturum]:
   - Kimberley Jensen **Mel-Band RoFormer vokal** ağırlığının HF kartı `license: mit` (depoda lisans yoktu; önceki
     rapor HF'yi okuyamamıştı ve "lisanssız → yasak" demişti). ZFTurbo tablosunda vokal SDR 10,98. → **yerel pakette
     kullanılabilir**; veri açıklanmamış.
   - All-In-One (yapı analizi) ağırlıklarının HF kartı `license: mit` (A dosyası).
3. **Ama Lyraska ayrılmış sesi çalmıyor; yalnızca zarf ve başlangıç (onset) saklıyor** (ROADMAP Faz 5). SDR doğru ölçü
   değil. Doğru ölçü: ayrılmış davuldan bulunan kick/trampet başlangıçlarının F-ölçüsü, bas zarfının gerçek bas
   kanalıyla ilintisi, vokal var/yok kararının kare doğruluğu. SDR'nin bu ölçülere ne kadar yansıdığını ölçen bir
   çalışma bulamadım [tahmin: zarf/onset için 6 dB ile 10 dB'lik model arasındaki fark SDR farkından çok daha küçük].
4. **CPU maliyeti belirleyici.** Mini-BS-RoFormer-V2 (46,8 M parametre; MUSDB val 10,03 dB; **CC-BY-NC-4.0**): 30 sn ses
   için **8 343,55 GFLOP** [birincil: model kartı]. Sahibinin Ryzen'inde f32 ~99 G işlem/sn ölçülmüştü (BILGI §5) →
   30 sn için ~85 sn, **4 dk şarkı ~11 dk** [tahmin]; 656 şarkılık kütüphane ~120 saat. Demucs v4'ün el yazımı C++
   sürümü 16 çekirdekte 4 dk şarkıyı 10 dk 23 sn (tek akış) / 4 dk 9 sn (4 × 4 iş parçacığı) ayırıyor [birincil:
   sevagh/demucs.cpp PERFORMANCE.md]. Spleeter (U-Net) bunlardan çok daha hafif.
5. **Sahibinin bilgisayarında RTX 4050 var** (BILGI §4). Kişisel kullanım kararıyla hedef donanım "sahibinin
   bilgisayarı". ONNX Runtime (MIT) CUDA ile aynı işi saniyelere indirir [tahmin: 4 dk şarkıda 10–30 sn].
   python-audio-separator README'si RoFormer'ı DirectML'de "allocator out of memory" yukarı akış sınırıyla
   çalıştıramadığını yazıyor [birincil]. Bu, projedeki "tract (saf Rust, yalnızca CPU)" seçiminin **yeniden
   düşünülmesi gereken tek yer**: ağır ayrıştırma için isteğe bağlı GPU yolu (önce ölçüm).
6. **Davul içi ayrıştırma (DrumSep)** görseller için çok değerli (kick / trampet / tom / hi-hat ayrı): inagoy htdemucs
   DrumSep (depo MIT [birincil]); jarredou MDX23C DrumSep kick 16,66, trampet 11,53, tom 12,33, hi-hat 4,04 dB
   [birincil: ZFTurbo tablosu; jarredou deposunun lisansı okunamadı → belirsiz].
7. **Önerim:** sıra değişmeli: klasik HPSS (#215, sürüyor) → **ölçüm düzeneği** (zarf/onset ölçüleri, doğrusu bilinen
   çok kanallı set) → Spleeter 4 kanal (MIT, hafif) ile BS-RoFormer 4 kanal ya da Mel-RoFormer vokal aynı ölçüde →
   GPU yolu ancak kazanç ölçülürse.

## 1. Yeni karara göre lisans tablosu (geriye dönük)

Kod / ağırlık / eğitim verisi → yerel pakette kullanılabilir mi. "Hayır" yalnızca lisansı hiç yazılmamışsa ya da kod
GPL ile uyumsuzsa.

| Model                                                                               | Kod          | Ağırlık                                                 | Veri                         | Yerel pakette                                                                                 | Kaynak                                       |
| ----------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Spleeter 2/4/5 kanal                                                                | MIT          | MIT (JOSS makalesi)                                     | Deezer iç                    | **Evet** (dağıtım da)                                                                         | önceki rapor                                 |
| **BS-RoFormer 4 kanal (ZFTurbo, ep_17, 9,6568)**                                    | MIT          | **MIT** (yazarın issue #254 cümlesi)                    | MUSDB18-HQ (akademik/NC)     | **Evet**                                                                                      | önceki rapor; ZFTurbo tablosu [birincil]     |
| **Mel-Band RoFormer vokal (K. Jensen)**                                             | yok (depoda) | **MIT** (HF kartı)                                      | açıklanmamış                 | **Evet** (düzeltme)                                                                           | HF `KimberleyJSN/melbandroformer` [birincil] |
| Mini-BS-RoFormer-V2 46,8 M                                                          | —            | CC-BY-NC-4.0                                            | MUSDB18-HQ train **ve test** | Evet (yerelde); MUSDB test'te ölçülemez                                                       | HF kartı [birincil]                          |
| BS-RoFormer vokal uint8 ONNX (diarizeapp)                                           | —            | Apache-2.0 (kart)                                       | açıklanmamış                 | Evet-belirsiz (asıl kaynağı yazılmalı)                                                        | HF API [birincil]                            |
| SCNet XL IHF, SCNet Large, MDX23C, DTTNet, BS Conformer (ZFTurbo, yalnız MUSDB18HQ) | MIT          | depo sürüm dosyası; model başına lisans cümlesi **yok** | MUSDB18-HQ                   | **Belirsiz** (depo MIT; yazar yalnızca BS-RoFormer için açık konuştu)                         | ZFTurbo tablosu [birincil]                   |
| SCNet (starrytong)                                                                  | MIT          | depo dışı bağlantı, cümle yok                           | MUSDB                        | Belirsiz                                                                                      | starrytong/SCNet [birincil]                  |
| HTDemucs / _ft / 6s                                                                 | MIT          | "not clear"; 6s "likely CC-NC-BY"                       | MUSDB + Meta iç              | Belirsiz (6s "muhtemelen NC" → yerelde kabul edilebilir; diğerlerinde yazar lisans veremiyor) | adefossez/demucs (önceki rapor)              |
| Open-Unmix umxl                                                                     | MIT          | CC BY-NC-SA 4.0                                         | özel                         | **Evet** (yeni kararla)                                                                       | önceki rapor                                 |
| Banquet                                                                             | MIT          | Zenodo                                                  | MoisesDB (NC)                | Belirsiz (Zenodo kaydı okunmalı; artık açık)                                                  | önceki rapor                                 |
| UVR'nin "viperx" RoFormer'ları                                                      | —            | UVR README "honor the MIT license by providing credit"  | açıklanmamış                 | Belirsiz-olumlu                                                                               | önceki rapor                                 |
| DrumSep htdemucs (inagoy)                                                           | MIT          | depo MIT                                                | açıklanmamış                 | Evet-belirsiz                                                                                 | inagoy/drumsep [birincil]                    |
| Apollo (sıkıştırılmış sesi onarma)                                                  | CC BY-SA 4.0 | CC BY-SA 4.0 (HF kartı)                                 | MUSDB18-HQ + MoisesDB        | **Evet** (yerelde)                                                                            | JusperLee/Apollo LICENSE, HF API [birincil]  |

## 2. Kalite: yayımlanmış sayılar

**MUSDB18-HQ test, yalnızca MUSDB ile eğitim, ZFTurbo tablosu [birincil]:**

| Model                    | Ortalama  | Bas  | Davul | Vokal | Diğer |
| ------------------------ | --------- | ---- | ----- | ----- | ----- |
| MDX23C                   | 7,15      | 5,77 | 7,93  | 9,23  | 5,68  |
| DTTNet                   | 7,83      | 7,17 | 7,66  | 10,31 | 6,20  |
| SCNet Small              | 9,03      | 8,89 | 10,44 | 9,90  | 6,89  |
| SCNet Large (starrytong) | 9,70      | 9,38 | 11,15 | 10,94 | 7,31  |
| SCNet XL IHF             | **10,08** | 9,23 | 11,81 | 11,42 | 7,88  |
| BS-RoFormer              | 9,65      | 8,48 | 11,61 | 11,08 | 7,44  |
| BS Conformer (Medium)    | 9,18      | 8,11 | 10,96 | 10,63 | 7,03  |

Aynı tabloda MVSep "Multisong" (100 şarkı) ortalamaları: HTDemucs4 9,16; SCNet XL IHF 9,92; BS-RoFormer 9,38. Multisong
bas/davul sayıları MUSDB'den 2–3 dB yüksek (set farkı); setler arası karşılaştırma yapılmaz.

**Mel-Band RoFormer makalesi** (Wang, Lu, Won; ISMIR 2023 LBD), Tablo 1, MUSDB18-HQ test, ek veri yok, 1 sn parçaların
ortancalarının ortancası (museval) [birincil: arXiv 2310.01809 PDF]:

| Model              | Vokal | Bas   | Davul | Diğer | Ort.  | Parametre |
| ------------------ | ----- | ----- | ----- | ----- | ----- | --------- |
| HDemucs            | 8,04  | 8,67  | 8,58  | 5,59  | 7,72  | —         |
| BS-RoFormer (L=6)  | 10,78 | 11,43 | 9,61  | 7,86  | 9,92  | 72,2 M    |
| Mel-RoFormer (L=6) | 11,21 | 9,64  | 9,91  | 7,81  | 9,64  | 84,2 M    |
| BS-RoFormer (L=9)  | 11,02 | 11,58 | 9,66  | 7,80  | 10,02 | 82,8 M    |

Özetinde: BS-RoFormer + 500 ek şarkı ortalama **11,99 dB** [birincil]. **Çelişki notu:** makalede BS-RoFormer basta
11,43, ZFTurbo'nun yeniden eğittiği BS-RoFormer'da 8,48 — fark eğitim süresi/ayar ve ölçü yönteminden (ortanca
ortancası ile ortalama farklı sonuç verir) [tahmin]. Kendi ölçümümüz bu yüzden şart.

MVSep'in kendi BS-RoFormer'ı Multisong vokal 11,89 (2025.07) ve 12,33 (2026.07) [özet]. SDX23 makalesi (TISMIR): en iyi
sistem MDX21 kazananını 1,6 dB'den fazla geçti; "etiket gürültüsü" ve "sızıntı" altında dayanıklı eğitim ayrı kollar
[özet: arXiv 2308.06979].

## 3. Hız ve CPU/GPU

- **Demucs v4 CPU** [birincil, yukarıda]: 4 dk şarkı 4–10 dk (16 çekirdek); v3 mmi 2 dk 35 sn. ONNX'e dönüşüm için STFT/
  iSTFT ağın dışına alınmalı, yoksa dışa aktarma başarısız [birincil: sevagh/demucs.onnx README]. tract için de aynı
  [tahmin].
- **RoFormer**: 30 sn → 8 343 GFLOP (46,8 M), eski Mini 3 069 GFLOP (ama 6,48 dB) [birincil]. CPU'da kütüphane çapında
  uygulanabilir değil [tahmin, §0.4].
- **Daha ucuz yol [tahmin]:** görseller için tam bant gerekmez; 16–22 kHz, mono ve yalnızca "davul + bas" çıkışlı küçük
  model yeterli olabilir. Hazır ağırlıkla olmaz, yeniden eğitim ister (MUSDB18 artık yerel eğitimde serbest).
- **Seçenekler:** tract (mevcut, CPU; Spleeter ve HPSS için yeter) / `ort` crate (ONNX Runtime MIT; CUDA; DirectML
  RoFormer'da sorunlu [birincil]) / önce **ölçüm**: aynı ONNX modeli tract-CPU, ORT-CPU, ORT-CUDA'da 60 sn ses; süre,
  tepe bellek, çıktı farkı.

## 4. Bilgilendirilmiş ayrıştırma ve "önceden bilme"

- Lyraska yapıyı, vuruşları, tonu ve (varsa) sözleri ayrıştırmadan önce biliyor. Literatürde nota bilgili (score-
  informed; Ewert, Pardo, Müller, IEEE Signal Processing Magazine 2014 [bilgim, doğrulanmadı]) ve beat bilgili yaklaşımlar
  var. Lyraska'ya uygun olanı **beat bilgili HPSS**: vurmalı maskeyi ızgaradaki olası vuruş anlarında güçlendirmek
  (yanlış davul başlangıcını azaltır) [tahmin].
- **Söz zamanları biliniyorsa vokal etkinliği zaten bilinir.** Görsel Yönetmen'in "vokalin girişi" tepkisi söz
  zamanından gelebilir; ayrıştırmadan yalnızca **davul ve bas** istenir. Maliyeti büyük ölçüde düşürür.
- **REPET-SIM** (Rafii & Pardo; nussl'de MIT): arka planı tekrar eden yapıdan ayırır; girişi Lyraska'nın benzerlik
  matrisiyle aynı türden. Klasik yolda vokal için en güçlü seçenek [tahmin].

## 5. Klasik yöntemler (önceki raporun sırası doğru; eklemeler)

Sıra: (1) düz HPSS (#215), (2) HRPS (libfmp MIT), (3) iki aşamalı HPSS (Tachibana–Ono–Sagayama) ile "vokal olası"
zarfı, (4) REPET-SIM. Eklemeler: **bant bölünmüş vurmalı başlangıç** (kick < 150 Hz; trampet 150 Hz–2 kHz + gürültü;
hi-hat > 6 kHz; DrumSep'in ucuz yaklaşığı, ölçü kick F1 ve trampet F1 ayrı); **NMFD** (libnmfd, MIT); **bas perdesi**
(pYIN, Mauch & Dixon 2014; makaleden yazılabilir) — bas titreşimi görseline frekans ekler.

## 6. Ölçüm düzeneği (B'nin asıl işi)

- **Doğrusu bilinen çok kanallı set:** (a) Lyraska'nın sentetik üreticileri (tempo/drop `uret.py`) davul, bas, akor
  kanallarını zaten ayrı üretiyor → ayrı kaydetmek yeter; (b) **Slakh2100** (CC BY 4.0, vokalsiz); (c) **AAM**
  (Ostermann ve ark., TISMIR 2023; bkz. H dosyası); (d) yerelde MUSDB18-HQ ve MoisesDB (NC; yeni kararla yerel ölçümde
  serbest).
- **Ölçütler:** kick onset F1 (±30 ms), trampet onset F1, bas zarfı ilintisi (Pearson, 20 ms kare), vokal etkinliği kare
  doğruluğu, süre ve tepe bellek (sahibinin Ryzen'inde).
- **Kapı:** model yolu klasik yoldan kick F1'de ≥ 0,05 ve vokal etkinliğinde ≥ 5 puan iyi değilse eklenmez (Spleeter
  dahil). Sahibinin "Spleeter'ı geliştir" isteği de böylece ölçülebilir olur.

## 7. Mevcut kararlarda gördüğüm sorunlar

1. **"Spleeter seçildi" (23 Ekim) lisans kısıtına göre verilmişti.** Kısıt kalktı; karar yeniden açılmalı (Spleeter =
   hafif, eski; BS-RoFormer/Mel-RoFormer = iyi, ağır, GPU ister). Karar ölçümle verilmeli.
2. **ACIK-KONULAR 3 "Spleeter ve Demucs karşılaştırması":** Demucs ağırlıkları hâlâ belirsiz; karşılaştırmada BS-RoFormer
   (açık MIT ağırlık) daha uygun aday.
3. **Önceki raporda Mel-RoFormer (K. Jensen) "lisanssız" yazıyor:** HF kartı MIT. Rapora düzeltme notu düşülmeli.
4. **Veritas/Retriever:** Apollo (MP3 onarımı, GAN; CC BY-SA) yeni aday, ama VERITAS R2 "bit akışında bilgi yok" diye
   ölçtü; GAN'ın eklediği tiz bilgi değil, inandırıcı uydurmadır. Yerelde ABX ile 128 kbps MP3'te bir akşamlık deney
   olabilir; öncelik düşük (sahibinin kütüphanesi çoğunlukla AAC/Opus).
