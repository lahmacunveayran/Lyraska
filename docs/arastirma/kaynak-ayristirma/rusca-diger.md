# Kaynak ayrıştırma: Rusça, Almanca, Fransızca, İspanyolca/Portekizce kaynaklar ve klasik yöntemler

Tarih: 6 Kasım 2026. Önceki rapora (`kaynak-ayristirma-RAPOR.md`) ek. Kural aynı: kod, ağırlık ve eğitim verisi ayrı ayrı
denetlenir; AGPL yok, ticari kullanımı yasaklayan hiçbir şey yok.

Kısaca: **Önceki sonuç değişmiyor.** Bu dillerdeki kaynaklarda ticari kullanılabilir yeni bir hazır model çıkmadı.
Ama klasik yol için çok işe yarayan, **MIT lisanslı** ve doğrudan örnek alınabilecek iki AudioLabs Erlangen kodu bulundu
(HRPS ve KAM/NMF davul ayrıştırma). İlk PR için önerim: **Driedger–Müller–Disch 2014 HRPS** (ezgisel / artık / vurmalı).

## 0. Yöntem ve erişim (önemli)

- Bu oturumun ağında yalnızca GitHub açık (`git clone` ve raw.githubusercontent.com). **Açılamayanlar** (DNS: izinli
  değil): habr.com, mvsep.com, essentia.upf.edu, www.audiolabs-erlangen.de, madmom.readthedocs.io,
  www.idmt.fraunhofer.de, sdx-workshop.github.io. Bunları açmak için oturumun ağ ayarlarında izin gerekir. GitHub API
  (`gh api`) de kapalı; GitHub'da arama yapılamadı.
- Bu yüzden **Rusça kaynakların hiçbiri birincil olarak okunamadı.** Habr ve MVSep için yalnızca arama motoru özetleri
  görüldü; aşağıda bunlar "doğrulanmadı" diye işaretli ve sonuca katılmadı.
- Okunan depolar (`git clone --depth 1`, son commit): groupmm/libnmfd `3831eb7` (2024-08-09), meinardmueller/libfmp
  `ed057ba` (2026-05-26), nussl/nussl `17368d4` (2024-12-09), zafarrafii/REPET-Python `e5eebcc` (2024-02-16),
  polimi-ispl/larsnet `17d631f` (2024-09-10), inagoy/drumsep `c1cea3f` (2025-11-03),
  ZFTurbo/MVSEP-MDX23-music-separation-model `765bd31` (2025-04-05), mir-dataset-loaders/mirdata `96d298b`
  (2026-10-20). Ayrıca raw ile tek dosyalar: MTG/essentia, CPJKU/madmom, sigsep/norbert, librosa, MTG/mtg-jamendo-dataset.
- Kimseyle iletişim kurulmadı, depoda hiçbir şey değiştirilmedi.

## 1. Rusça kaynaklar

- **Habr.** Arama "Взлом музыки для демократизации производного контента" (https://habr.com/ru/post/441090) yazısını
  gösterdi; habr.com açılamadı, **okunmadı**. Arama özetine göre bir şirketin kendi vokal modelini tanıtıyor; lisans
  ve veri bilgisi görülemedi. Davul/bas/vokal ayrıştıran açık lisanslı bir Rus modeli aramalarda çıkmadı.
- **Sber / Yandex / VK.** Aramada yalnızca konuşma tanıma (Sber GigaAM, GigaChat Audio) çıktı; müzik ayrıştırma
  modeli **bulunamadı**. (Arama özeti, birincil değil; GitHub araması kapalı olduğu için örgüt depoları taranamadı.)
- **ZFTurbo / MVSep (Roman Solovyev).** mvsep.com açılmadı. GitHub'daki MDX23 yarışma modeli okundu
  (https://github.com/ZFTurbo/MVSEP-MDX23-music-separation-model):
  - Lisans dosyası **yok** (raw `LICENSE` 404; depoda yalnızca README, kod ve görseller).
  - README: "Model based on Demucs4, MDX neural net architectures and some MDX weights from Ultimate Vocal Remover
    project (thanks Kimberley Jensen for great high quality vocal models)."
  - `inference.py` ağırlıkları şuralardan indiriyor: `https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/04573f0d-f3cf25b2.th`
    (Meta'nın htdemucs ağırlığı) ve `https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/Kim_Vocal_2.onnx`.
  - → Demucs ve Kim/UVR ağırlıklarının bütün sorunlarını taşır (önceki rapor §3, §5) ve kendi lisansı yok → **yasak**.
  - MSST (BS-RoFormer vb.) önceki raporda incelendi: MUSDB18-HQ ya da hakkı olmayan veri → yasak. Değişiklik yok.
- Sonuç: Rusça tarafta yeni aday yok; tek önemli Rus kaynağı (ZFTurbo) zaten dışarıda.

## 2. Almanca konuşulan bölge (AudioLabs Erlangen, Fraunhofer, JKU Linz)

**libfmp — AudioLabs Erlangen (FMP kitabının kodu).** https://github.com/meinardmueller/libfmp

- LICENSE: "MIT License / Copyright (c) 2020 Meinard Müller and Frank Zalkow, International Audio Laboratories Erlangen".
- `libfmp/c8/c8s1_hps.py` başlığı: "License: The MIT license" ve "This file is part of the FMP Notebooks".
  İçinde `hps` (Fitzgerald ortanca süzgeç HPSS) ve `hrps`: "Harmonic-residual-percussive separation (HRPS) algorithm",
  "beta (float): Separation factor (Default value = 2.0)". Maskeler:
  `M_h = np.int8(Y_h >= beta * Y_p)`, `M_p = np.int8(Y_p > beta * Y_h)`, `M_r = 1 - (M_h + M_p)`.
  Yani ne açıkça ezgisel ne açıkça vurmalı olan her şey (vokal, gürültü, geçişler) "artık"a gider.
- FMP defterlerinin kendisi (audiolabs-erlangen.de/FMP) açılamadı; defterlerin metin lisansı okunmadı. Kod MIT; biz
  zaten Rust'ta kendimiz yazacağız, sorun yok.

**libnmfd (NMF Toolbox) — AudioLabs Erlangen.** https://github.com/groupmm/libnmfd

- LICENSE: "MIT License / Copyright (c) 2024 Patricio López-Serrano, Christian Dittmar, Yigitcan Özer and Meinard Müller".
  README: "The code for this toolbox is published under an MIT licence."
- `libnmfd/dsp/algorithms.py` `hpss_kam_fitzgerald`: "This re-implements the KAM-based HPSS-algorithm described in [1].
  This is a generalization of the median-filter based algorithm first presented in [2]." [1] = FitzGerald, Liutkus,
  Rafii, Pardo, Daudet, "Harmonic/Percussive Separation using Kernel Additive Modelling", ISSC 2014.
- Defter `demo_drum_extraction_kam_nmf_perc_threshold.ipynb`: "It applies KAM and NMF as described in [2] … The final
  classification into harmonic and percussive is done according to the percussiveness threshold p_thresh = 0.25"
  ([2] = Dittmar, López-Serrano, Müller, ICASSP 2018). Defter `demo_drum_sound_separation_nmf.ipynb`: NMFD ile
  "Kick Drum", "Snare Drum", "Ride Cymbal" bileşenleri ([1] = Dittmar & Müller, "Reverse Engineering the Amen Break",
  IEEE/ACM TASLP 24(9), 2016). Eğitilmiş model yok; her şey şarkının kendi spektrogramından → lisans sorunu yok.
- Depodaki örnek sesler (`data/*.wav`) kullanılmaz (ses dosyası kuralı).

**madmom — JKU Linz / OFAI (Avusturya).** https://github.com/CPJKU/madmom (README "License"):
"Unless indicated otherwise, all source code files are published under the BSD license." ve "all model and data files
are distributed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 license." → Kod serbest, beat/onset
modelleri **yasak** (NC). Bilgi için: madmom'un sinir ağı tabanlı onset/beat dedektörleri bu yüzden alınamaz.

**Fraunhofer IDMT.** Site açılamadı. mirdata yükleyicisinde (ikincil) IDMT-SMT-Audio-Effects için
"Creative Commons BY-NC-ND 4.0." yazıyor (`mirdata/datasets/idmt_smt_audio_effects.py`). IDMT-SMT-Drums'ın lisansı
**okunamadı**. Fraunhofer'ın açık ağırlıklı bir ayrıştırma modeli bulunamadı (arama).

## 3. Fransızca kaynaklar (INRIA, IRCAM, Télécom Paris, Deezer)

- **INRIA / sigsep norbert** (çok kanallı Wiener süzgeci, eğitimsiz): https://github.com/sigsep/norbert LICENSE
  "MIT License / Copyright (c) 2019 Inria (Fabian-Robert Stöter, Antoine Liutkus)". Klasik maskeleri iyileştirmek için
  kullanılabilecek bir yöntem; ses çıkarmadığımız için büyük olasılıkla gereksiz.
- **Open-Unmix** (INRIA): önceki raporda yasak (MUSDB, NC). Değişiklik yok.
- **IRCAM, Télécom Paris:** açık ağırlıklı bir ayrıştırma modeli aramalarda çıkmadı (yalnızca arama; IRCAM'ın
  sitesi denenmedi, ağ kapalı). ENST-Drums'ın lisansı **okunamadı**.
- **Deezer (Paris) — Spleeter:** önceki raporun tek adayı. Yeni bulgu: Essentia da Spleeter'ı kendi biçiminde
  dağıtıyor (bkz. §4); oradan **alınmamalı**, ağırlık doğrudan deezer/spleeter sürümlerinden alınmalı.

## 4. İspanyolca / Portekizce kaynaklar (UPF MTG, Freesound, Moises, Arjantin)

**Essentia — UPF MTG (Barselona).** https://github.com/MTG/essentia

- COPYING: "GNU AFFERO GENERAL PUBLIC LICENSE / Version 3". README: "released under the Affero GPLv3 license."
  → Kütüphane **yasak** (AGPL).
- `doc/sphinxdoc/models.rst`: "All the models created by the MTG are licensed under CC BY-NC-SA 4.0 and are also
  available under proprietary license upon request." → MTG modelleri (ör. "voice_instrumental" vokal var/yok
  sınıflandırıcıları, aynı dosya satır 1845–1898) **yasak** (NC).
- Aynı dosya "Source separation → Spleeter" altında `spleeter-4s-3.pb` dosyalarını essentia.upf.edu'dan veriyor. Bunlar
  MTG'nin değil Deezer'ın modelleri ama MTG'nin dönüştürüp kendi sunucusunda dağıttığı dosyalar; o sunucudaki
  `models/LICENSE` **okunamadı**. → Spleeter, Essentia'nın kopyasından değil Deezer'dan alınır.

**MTG-Jamendo veri seti** (https://github.com/MTG/mtg-jamendo-dataset, README "License"): "The metadata is licensed under
a CC BY-NC-SA 4.0" ve "Please note that the MTG-Jamendo Dataset is made available solely for non-commercial research and
academic use." → Eğitim verisi olarak **yasak**.

**Freesound tabanlı veri setleri.** "Freesound One-Shot Percussive Sounds" için mirdata (ikincil): "The dataset is
licensed under The Creative Commons Attribution Non Commercial Share Alike 4.0 International." → **yasak**. Freesound'da
tek tek CC0 / CC-BY sesler var, ama bunlardan derlenmiş, ayrıştırma için hazır bir veri seti ya da model bulunamadı.

**drumsep — Universidad Nacional de Quilmes (Arjantin).** https://github.com/inagoy/drumsep

- README: "Separación de fuentes en grabaciones de batería mediante aprendizaje automático" (2022) (Türkçesi: "Makine
  öğrenmesiyle davul kayıtlarında kaynak ayrıştırma"). "Drum separation based on a Hybrid Demucs model."
- LICENSE: "MIT License / Copyright (c) 2024 Iñaki Goyeneche" — yalnızca kod. Ağırlık Google Drive'dan
  (`gdown 1-Dm666ScPkg8Gt2-lK3Ua0xOudWHZBGC`) iniyor; ağırlık lisansı ve eğitim verisi **yazmıyor**. Ayrıca girdi
  ayrılmış davul kaydı (önce bir Demucs gerekir). → **önerilmez**.

**Moises (Brezilya).** MoisesDB: önceki raporda CC BY-NC-SA 4.0 → yasak. Değişiklik yok.

**(Ek, İtalya) LarsNet / StemGMD — Politecnico di Milano.** https://github.com/polimi-ispl/larsnet README:
"Pretrained LarsNet model checkpoints … licensed under CC BY-NC 4.0." → **yasak**. Ama veri: "StemGMD is freely
available on Zenodo under the CC-BY 4.0 license." StemGMD, Groove MIDI Dataset'ten (mirdata: "Creative Commons
Attribution 4.0 International (CC BY 4.0) License.") "Apple's Drum Kit Designer in Logic Pro X" ile sentezlenmiş.
Yalnızca davul içi ayrıştırma (kick/snare/…) için kendi model eğitiminde kullanılabilir; Apple'ın ses örneği şartları
ayrıca doğrulanmalı (okunmadı). Şimdilik ilgisiz.

## 5. Klasik (modelsiz) yöntemler ve görsellere katkısı

Hepsi şarkının kendi spektrogramından çalışır; eğitim verisi yok; kendi Rust kodumuzla yazılır (referans kodlar MIT/ISC).

| Yöntem                                                                            | Kaynak (kod)                                                                                                                                                                                                                                                                                                                   | Görsellere ne verir                                                                                                                                                                                                   | Maliyet / not                                                                                                                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **HPSS** (Fitzgerald 2010)                                                        | librosa `decompose.hpss` (ISC; "Fitzgerald, Derry. Harmonic/percussive separation using median filtering", DAFX10), libfmp `hps` (MIT)                                                                                                                                                                                         | Vurmalı kısmın spektral akışı → davul başlangıçları; ezgisel kısım < 250 Hz → bas zarfı                                                                                                                               | Çok ucuz: iki ortanca süzgeç. Vokal ezgisel tarafa düşer                                                                                    |
| **HRPS** (Driedger–Müller–Disch, ISMIR 2014)                                      | libfmp `hrps` (MIT), librosa `margin` ("margin size(s) for the masks (as described in [2])", [2] = Driedger, Müller, Disch)                                                                                                                                                                                                    | HPSS'in aynısı ama belirsiz kısım "artık"a gider: vurmalı başlangıçlar daha temiz (az yanlış alarm), bas zarfına kick kuyruğu ve vokal daha az karışır; artık + ezgisel orta bant vokal işareti olarak kullanılabilir | HPSS kadar ucuz; tek ek parametre β (varsayılan 2)                                                                                          |
| **Bant bölmeli vurmalı akış**                                                     | (HRPS'in üstüne bizim)                                                                                                                                                                                                                                                                                                         | Kick (vurmalı < 150 Hz), trampet (≈ 200 Hz–2 kHz), hi-hat (> 5 kHz) ayrı başlangıç dizileri: üç ayrı ritim katmanı                                                                                                    | Bedava; eşikler işaretlenmiş şarkılarda ölçülür                                                                                             |
| **REPET / REPET-SIM** (Rafii & Pardo 2012)                                        | nussl `Repet`, `RepetSim` (MIT; "Repeating pattern extraction technique (REPET): A simple method for music/voice separation", IEEE TASLP 21(1)); librosa `nn_filter` ("Music/Voice Separation Using the Similarity Matrix", ISMIR 2012). zafarrafii/REPET-Python'da **lisans dosyası yok** (raw 404) → yalnızca makale izlenir | Tekrar eden eşlik ile tekrar etmeyen ön plan (çoğunlukla vokal, solo): "vokal var/yok" ve vokal zarfı için klasik yolun en iyi adayı                                                                                  | REPET-SIM benzerlik için kare × kare karşılaştırma ister (4 dk ≈ 10 bin kare); en yakın komşu sınırıyla Rust'ta kabul edilebilir. İkinci PR |
| **KAM** (FitzGerald, Liutkus, Rafii, Pardo, Daudet 2014)                          | libnmfd `hpss_kam_fitzgerald` (MIT)                                                                                                                                                                                                                                                                                            | HPSS'i yinelemeli yapar; biraz daha temiz ayrım                                                                                                                                                                       | Birkaç tur HPSS; ilk PR için gereksiz                                                                                                       |
| **NMF / NMFD davul** (Dittmar & Müller 2016; Dittmar, López-Serrano, Müller 2018) | libnmfd defterleri (MIT)                                                                                                                                                                                                                                                                                                       | Kick / trampet / zil etkinlikleri ayrı ayrı (bant bölmekten daha doğru)                                                                                                                                               | Yinelemeli, daha pahalı; başlangıç şablonları gerekir. Ölçümle gerekirse sonra                                                              |
| **Wiener süzgeci**                                                                | sigsep/norbert (MIT)                                                                                                                                                                                                                                                                                                           | Maskeleri yumuşatır; ses çıkarmadığımız için katkısı küçük                                                                                                                                                            | Gereksiz                                                                                                                                    |

Vokal için not: aranan dillerde, eğitimsiz ve güvenilir bir "vokal etkinliği" yöntemi bulunamadı. Bulunan eğitimli
sezicilerin (Essentia `voice_instrumental`, madmom) modelleri NC. Klasik yolda en makul bileşim: HRPS artığı + ezgisel
300 Hz–4 kHz enerji + orta/yan (sol+sağ / sol−sağ) oranı, ikinci adımda REPET-SIM ön planı. Kalitesi ölçülmeli
(önceki deneyim: soz-hizalama'da klasik yol satır başını bile güvenle bulamadı).

## 6. Özet tablo

| Model / yöntem                                  | Kod                                | Ağırlık                      | Eğitim verisi                             | Ticari?                      | Kaynak                                    |
| ----------------------------------------------- | ---------------------------------- | ---------------------------- | ----------------------------------------- | ---------------------------- | ----------------------------------------- |
| Spleeter (Deezer, FR)                           | MIT                                | MIT (JOSS)                   | Deezer iç ("Bean")                        | **Evet** (önceki rapor)      | deezer/spleeter                           |
| Spleeter, Essentia kopyası                      | AGPL (Essentia)                    | sunucudaki LICENSE okunamadı | aynı                                      | Hayır: Deezer'dan alınır     | MTG/essentia `models.rst`                 |
| Essentia MTG modelleri (ör. voice_instrumental) | AGPL-3.0                           | CC BY-NC-SA 4.0              | çeşitli                                   | **Hayır**                    | MTG/essentia COPYING, `models.rst`        |
| MVSEP-MDX23 (ZFTurbo, RU)                       | lisans dosyası yok                 | Demucs + UVR/Kim             | MUSDB vb.                                 | **Hayır**                    | ZFTurbo/MVSEP-MDX23… README, inference.py |
| MSST / BS-RoFormer (ZFTurbo, RU)                | MIT                                | MIT                          | MUSDB18-HQ / hakkı olmayan                | **Hayır**                    | önceki rapor                              |
| Rus kurumları (Sber, Yandex, VK)                | —                                  | —                            | —                                         | ayrıştırma modeli bulunamadı | arama (doğrulanmadı)                      |
| madmom (JKU, AT)                                | BSD                                | CC BY-NC-SA 4.0              | —                                         | **Hayır** (model)            | CPJKU/madmom README                       |
| LarsNet (PoliMi, IT)                            | —                                  | CC BY-NC 4.0                 | StemGMD CC BY 4.0                         | **Hayır** (ağırlık)          | polimi-ispl/larsnet README                |
| drumsep (UNQ, AR)                               | MIT                                | yazmıyor                     | yazmıyor                                  | Önerilmez                    | inagoy/drumsep                            |
| MTG-Jamendo, Freesound One-Shot                 | Apache-2.0 (kod)                   | —                            | CC BY-NC-SA / "solely for non-commercial" | **Hayır** (veri)             | MTG/mtg-jamendo-dataset, mirdata          |
| HPSS (Fitzgerald 2010)                          | librosa ISC, libfmp MIT            | —                            | yok                                       | **Evet**                     | librosa, libfmp                           |
| **HRPS (Driedger–Müller–Disch 2014)**           | libfmp MIT                         | —                            | yok                                       | **Evet**                     | libfmp `c8s1_hps.py`                      |
| KAM-HPSS, NMF/NMFD davul                        | libnmfd MIT                        | —                            | yok                                       | **Evet**                     | groupmm/libnmfd                           |
| REPET / REPET-SIM                               | nussl MIT (REPET-Python lisanssız) | —                            | yok                                       | **Evet** (kendi kodumuz)     | nussl/nussl, librosa `nn_filter`          |
| Wiener (norbert)                                | MIT                                | —                            | yok                                       | Evet                         | sigsep/norbert                            |

## Sonuç

1. **Önceki sonuç değişmiyor.** Rusça, Almanca, Fransızca, İspanyolca/Portekizce kaynaklarda ticari kullanılabilir
   yeni bir hazır ayrıştırma modeli bulunamadı. Bulunan her model ya NC (Essentia/MTG, madmom, LarsNet), ya AGPL
   kütüphanede (Essentia), ya da lisanssız/MUSDB'li (ZFTurbo MDX23, drumsep). Tek aday hâlâ **Spleeter**; ağırlık
   **yalnızca deezer/spleeter sürümlerinden** alınmalı (Essentia'nın kopyasından değil). Uyarı: Rusça kaynaklar ve
   bazı Avrupa siteleri bu ortamdan açılamadı; sonuç onların arama özetlerine değil, GitHub'daki birincil dosyalara dayanıyor.
2. **İlk PR için klasik yöntem: HRPS** (Driedger–Müller–Disch 2014; libfmp `hrps` MIT örnek alınır, Rust'ta yeniden
   yazılır). Düz HPSS'e göre tek fark β eşiği ve üçüncü "artık" maske; maliyeti aynı, ama davul başlangıçları ve bas
   zarfı daha temiz olur, artık da vokal işareti için ilk ham madde olur. Ölçülecek çıktılar: bant bölmeli vurmalı
   başlangıçlar (kick / trampet / hi-hat), ezgisel < 250 Hz bas zarfı, artık + orta bant "vokal olabilir" zarfı.
   Projenin 32 bantlı spektrumu yetmez; HRPS kendi ince STFT'sini (ör. 2048 örnek) arka plan analizinde hesaplar ve
   yalnızca zarflar saklanır (yeni analiz parçası, kendi sürümüyle).
3. Sonraki adımlar (ölçüme bağlı): REPET-SIM ile vokal ön planı; gerekirse NMFD ile davul parçaları; ardından Spleeter
   paketiyle karşılaştırma (önceki raporun önerisi).
