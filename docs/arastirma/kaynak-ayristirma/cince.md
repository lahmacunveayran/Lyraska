# Kaynak ayrıştırma: Çince kaynaklar taraması

Tarih: 6 Kasım 2026. Önceki rapora (kaynak-ayristirma-RAPOR.md) ek. Soru aynı: davul / bas / vokal / diğer ayrıştıran,
**kodu, ağırlığı ve eğitim verisi** ayrı ayrı AGPL'siz ve ticari kullanıma açık hazır bir model Çince kaynaklarda var mı?
Kısaca: **Yok.** Çin kaynaklı bütün müzik ayrıştırma modelleri MUSDB18 / MoisesDB ile eğitilmiş ya da verisi
açıklanmamış. Çin topluluğunun kullandığı tek temiz araç yine Spleeter; sherpa-onnx (k2-fsa, Next-gen Kaldi ekibi)
onun ONNX dönüşümünü hazır veriyor. Önceki sonuç değişmiyor.

## 0. Yöntem ve erişim

- Çince WebSearch sorguları: 音乐源分离 开源 模型 商用 许可; 人声分离 模型 训练数据 授权 商用; 伴奏分离; 鼓 贝斯 分离
  模型 商用 授权; 魔搭 伴奏分离; PaddleHub 人声伴奏分离; 腾讯/字节/快手/网易/阿里 音源分离; 民族乐器 音源分离 数据集;
  谐波 打击乐 分离 HPSS 中值滤波 改进; 歌声检测; 鼓点检测 低频 包络. GitHub'da Çince depo araması (`gh api search`).
- Birincil kaynak olarak yalnızca **GitHub** okunabildi (git ile klonlandı, commit kısaltması yazıldı).
- **Bu ortamdan açılamayanlar** (DNS çözülmüyor, ağ izni yok): modelscope.cn, gitee.com, huggingface.co, hf-mirror.com,
  arxiv.org, zenodo.org, cnki.net, mirlab.org (MIR-1K), cnb.cool, search.napstic.cn. Bunlarda yazanlar **okunmadı**;
  yalnızca arama özeti görüldüyse "ikincil" diye işaretlendi. Hiçbir şey tahmin edilmedi. Kimseye yazılmadı.

## 1. ByteDance (字节跳动)

**1a. bytedance/music_source_separation ("bytesep")** — https://github.com/bytedance/music_source_separation
(`e64b858`, 25 Ara 2021; Gitee'de ByteDance aynası var, açılamadı).

- Kod: LICENSE "Copyright 2021 ByteDance / Licensed under the Apache License, Version 2.0" → kod temiz.
- Eğitim verisi (README): "The separation models are trained ONLY on the [Musdb18 dataset] (100 songs). Trained
  checkpoints can be downloaded at: https://zenodo.org/record/5804160" — "Ayrıştırma modelleri YALNIZCA Musdb18
  (100 şarkı) ile eğitildi." Zenodo'daki ağırlık lisansı okunamadı; veri yüzünden sonuç değişmez → **yasak**.
- Modeller yalnızca vokal/eşlik (tablo "SDR metrics of vocals and accompaniment"), 4 kanal yok.
- Not edilmeye değer: "MobileNet Subband … 0.306 million" parametre, "process 1-min time (CPU Core i7) … 9.84"
  ("CPU'da 1 dakikalık sesi 9,84 sn'de işler"). Mimari (Apache-2.0) ileride **temiz veriyle kendimiz eğitirsek**
  hafif bir aday; hazır ağırlığı kullanılamaz.

**1b. bytedance/uss (Universal Source Separation)** — https://github.com/bytedance/uss (`c19e2c5`, 28 Ağu 2023).

- Kod Apache-2.0 ("Copyright 2023 ByteDance"). README: "The USS system is trained on the weakly labelled AudioSet
  dataset only." — "Yalnızca zayıf etiketli AudioSet ile eğitildi." AudioSet sesleri YouTube'dan indiriliyor (README:
  "Notice there can be missing files on YouTube") — ses dosyalarının telif izni yok. Ağırlıklar Hugging Face'te
  (`RSNuts/Universal_Source_Separation`, açılamadı). Ses sınıfı ayırır, müzik kanalı için değil → **önerilmez**.

**1c. BS-RoFormer / Mel-RoFormer (ByteDance AI Lab / SAMI makaleleri).** Çince ve İngilizce aramada ByteDance'in resmî
kod ya da ağırlık yayımladığına dair birincil kaynak **bulunamadı**. Arama özeti (ikincil): lucidrains/BS-RoFormer
"Implementation of Band Split Roformer … out of ByteDance AI Labs" diye kendini üçüncü taraf uygulama olarak tanıtıyor.
Dolaşımdaki ağırlıklar ZFTurbo / Kimberley Jensen'in (önceki rapor: MUSDB18-HQ ya da açıklanmamış veri) → **yasak**.
"SAMI" adıyla açık bir model bulunamadı.

## 2. Tencent (腾讯), Alibaba (阿里/魔搭), Baidu (PaddlePaddle), Kuaishou, NetEase

- **Tencent:** BSRNN (Yi Luo, Jianwei Yu) için resmî kod yok. Arama özeti (ikincil, arXiv 2603.09187): "its full code is
  not available" — "tam kodu yayımlanmadı". (Yazarların Tencent AI Lab bağlantısı birincil kaynaktan doğrulanamadı.)
  Bağımsız yeniden üretim magronp/bsrnn (`9ee41aa`, Fransız grup): LICENSE "GNU AFFERO GENERAL PUBLIC LICENSE" ve README
  "uses the HQ version of the … MUSDB18 dataset" → **iki kez yasak** (AGPL + MUSDB). tencent-ailab/SongGeneration
  (LeVo) şarkı üretir, ayrıştırma modeli yayımlamaz; depo bu ortamdan klonlanamadı.
- **Alibaba / ModelScope:** modelscope/modelscope kütüphanesi (`6ac899e`, 2 Kas 2026) içindeki bütün ayrıştırma
  modelleri konuşma için: `Tasks.speech_separation`, ör. "speech_flatflocoformer_separation_timefrequency_8k_…_libri2mix360"
  (8 kHz, iki konuşmacı). Müzik ayrıştırma hattı yok. ClearerVoice-Studio (Apache-2.0) README: "speech enhancement,
  speech separation, speech super-resolution, target speaker extraction" — müzik yok. modelscope.cn'deki topluluk
  yüklemeleri (ör. arama özetinde görünen "hdemucs_high_musdbhq" aynası) açılamadı; adı zaten MUSDB-HQ diyor → yasak.
- **Baidu:** PaddleHub (`dd10768`) `modules/audio` altında yalnızca asr, audio_classification, keyword_spotting,
  language_identification, speaker_recognition, svs, tts, voice_cloning var; ayrıştırma (spleeter/demucs/separation)
  dosyası yok. PaddleSpeech README'sinde müzik ayrıştırma görevi geçmiyor.
- **Kuaishou, NetEase (网易云音乐):** Çince ve İngilizce aramada açık kaynak ayrıştırma modeli ya da kodu **bulunamadı**.
  GitHub'da `org:kuaishou`, `org:netease-youdao`, `org:Tencent`, `org:tencent-ailab` aramaları ayrıştırma deposu vermedi.

## 3. Çin topluluğu araçları (hangi ağırlıkları dağıtıyorlar?)

- **k2-fsa/sherpa-onnx** (Apache-2.0, `3e437b3`, 6 Kas 2026): iki tür hazır ONNX. (a) Spleeter: `scripts/spleeter/run.sh`
  ağırlığı doğrudan Deezer'dan çekiyor ("https://github.com/deezer/spleeter/releases/download/v1.4.0/2stems.tar.gz") ve
  fp32/int8/fp16 ONNX üretiyor (`export_onnx.py`: "opset_version=13", "convert_float_to_float16"). Sürüm sayfası
  (https://github.com/k2-fsa/sherpa-onnx/releases/tag/source-separation-models): `sherpa-onnx-spleeter-2stems-fp16.tar.bz2`
  **33,6 MB**, int8 46,4 MB, fp32 71,2 MB. **Yalnızca 2 kanal** hazır; betik `"stems": 2` sabit. 4 kanal için aynı U-Net
  dört kez dönüştürülür (tahmin: fp16 ≈ 65–70 MB; ölçülmedi). (b) UVR MDX-Net: `scripts/uvr_mdx/README.md` "converting
  models from https://github.com/TRvlvr/model_repo/releases/tag/all_public_uvr_models" — UVR modelleri, verisi açıklanmamış
  (önceki rapor) → **önerilmez**. Sürüm sayfasında lisans metni yok.
- **jianchang512/vocal-separate** (GPL-3.0, `52df271`): Spleeter'ı paketliyor ("1. https://github.com/deezer/spleeter").
  Pratik notlar: "中文音乐或中式乐器，建议选择使用`2stems`模型" — "Çince müzik ya da Çin çalgıları için 2stems modeli
  önerilir"; "如果电脑没有NVIDIA显卡…不要选择 4stems和5stems模型…否则很可能耗尽内存" — "NVIDIA kartı yoksa 4/5 kanal
  seçmeyin… büyük olasılıkla bellek tükenir". (Önceki ölçümdeki 5,3 GB tepe bellekle uyumlu; pencereleme şart.)
- **KangChou/spleeter_dynamic_library** (MIT): "基于spleeter C++…实现音乐人声伴奏分离" — jinay1991'in Spleeter C++
  (TensorFlow C API) derlemesi. Yeni ağırlık yok.
- **SUC-DriverOld/MSST-WebUI** (`39287d4`): LICENSE "GNU AFFERO GENERAL PUBLIC LICENSE Version 3" → **kod yasak**;
  ağırlıklar ZFTurbo listesi (veri yasak). **pymss-project/pymss** (MIT, `b043d2d`; RVC'nin yeni arka ucu): yalnızca
  çalıştırıcı; kataloğunda "scnet_checkpoint_musdb18" gibi MSST/UVR/Demucs ağırlıkları; README'de ağırlık lisansı yok.
- **RVC-Project/Retrieval-based-Voice-Conversion-WebUI** (MIT, `81eed5e`): Changelog_CN "人声与伴奏分离后端由 UVR5
  更换为 PyMSS" — "vokal/eşlik arka ucu UVR5'ten PyMSS'e geçti"; ağırlıklar `lj1995/VoiceConversionWebUI` (Hugging Face,
  açılamadı) `pymss_weights/`. **RVC-Boss/GPT-SoVITS** (MIT, `04a44eb`): "从 [UVR5 Weights](https://huggingface.co/lj1995/
  VoiceConversionWebUI/tree/main/uvr5_weights) 下载模型" ve isteğe bağlı "bs_roformer"/"kim_mel_band_roformer". Hepsi
  önceki rapordaki UVR/RoFormer ağırlıkları → **önerilmez/yasak**.
- **Cohenjikan/MusicMaster** (Apache-2.0, `05e42a4`) NOTICE'i Çin topluluğunun kendi değerlendirmesini yazıyor (ikincil
  ama yayıncı beyanı): "Demucs (htdemucs) … 许可证: MIT(代码);权重训练于 MUSDB18(CC-BY-NC-SA)" — "kod MIT; ağırlıklar
  MUSDB18 ile eğitildi"; "Mel-Band RoFormer "Karaoke" … 权重经第三方分发,视作非商用" — "ağırlıklar üçüncü taraflarca
  dağıtılıyor, ticari olmayan sayılır"; README: "商用须替换这些权重或单独取得授权" — "ticari kullanımda bu ağırlıklar
  değiştirilmeli ya da ayrıca izin alınmalı". Bizim sonucumuzla aynı.
- **ygqdan/vocal-separator** (lisans dosyası yok): HTDemucs / MDX-Net / UMX-L ONNX'i tarayıcıda çalıştırıyor; README
  "htdemucs（300MB、约 2.5 万节点）有个绕不开的硬限制" — "htdemucs (300 MB, ~25 bin düğüm) aşılamaz bir sınıra
  takılıyor". Ağırlıklar yasak listesinde; yalnızca HTDemucs ONNX'inin ağırlığı hakkında bir gözlem.

## 4. Çin akademisinden modeller

- **DTTNet** (junyuchen-cjy/DTTNet-Pytorch, Apache-2.0, `890a25e`): "1. Download MUSDB18HQ from
  https://sigsep.github.io/datasets/musdb.html" ve "python train.py experiment=vocals_dis datamodule=musdb_dev14" →
  ağırlıklar (mega.nz / pan.baidu.com, açılamadı) MUSDB18-HQ → **yasak**.
- **TS-BSmamba2** (baijinglin/TS-BSmamba2, Apache-2.0, `0e5edcc`): "TS-BSMAMBA2 is licensed under the Apache License
  2.0." Ağırlık yayımlanmamış; örnek parça "Arise - Run Run Run", sigsep tracklist.csv'de "Arise - Run Run Run,Reggae,DSD,
  Restricted" (MUSDB18 parçası). Eğitim verisi README'de yazmıyor (makale arXiv'de, okunamadı) → hazır model **yok**.
- **SCNet** (starrytong, Çinli yazarlar): önceki rapor, MUSDB → yasak. **Apollo** (JusperLee/Apollo, `e84bcac`):
  ayrıştırma değil, onarma; LICENSE "Attribution-ShareAlike 4.0", README "Apollo is trained on the MUSDB18-HQ and
  MoisesDB datasets" → yasak.
- **UMXZ** (Laura-Luo/UMXZ, `5ee969e`, lisans dosyası yok): "dedicated to Chinese Dizi source separation" — Çin flütü
  (dizi) ayrıştırma; yalnızca kod, veri yolu `data\train` (açıklanmamış), ağırlık yok → **kullanılamaz**.

## 5. Çince veri setleri (ileride kendi modelimiz için)

- **M4Singer** (`45ec525`) dataset_license.md: "We agree to the dataset license: CC BY-NC-SA 4.0 (NonCommercial!)."
  → yasak. **GTSinger** (`0aebbed`): "### CC BY-NC-SA 4.0 License … NonCommercial — You may not use the material for
  commercial purposes." → yasak.
- **Opencpop** (wenet-e2e/opencpop, gh-pages `f470bea`, "liscense" sayfası): "The Opencpop dataset is available to
  download for non-commercial purposes under a CC BY-NC-ND 4.0 License." ve "If want to use it commercially, you are
  welcome to contact us by email" → yasak (izin istemek kurala göre bizim işimiz değil).
- **MIR-1K, iKala** (Tayvan, karaoke): mirlab.org açılamadı; şartlar okunmadı. Arama özetleri yalnızca akademik kullanımı
  anlatıyor (ikincil) → kanıtsız kullanılmaz.
- **CCMusic / CTIS** (Çin geleneksel çalgıları, Hugging Face): arama özetine göre "CC BY-NC-ND 4.0" (ikincil, açılamadı);
  zaten ayrıştırma verisi değil.
- Sonuç: Çince tarafta ticari kullanıma açık, belgeli bir **çok kanallı** (stem) veri seti bulunamadı.

## 6. Modelsiz yöntemler (HPSS, bas, vokal sezimi) üzerine Çince çalışmalar

- Çince birincil bir HPSS iyileştirmesi okunamadı (CNKI kapalı). Arama özetinde (ikincil) tek Çince makale: 吴礼福, 孙芯年
  (南京信息工程大学), 《基于倒谱分析的弦乐和打击乐的源分离》, 计算机与数字工程, 2024 — "Kepstrum analiziyle yaylı ve
  vurmalı çalgı ayrıştırma": önce kepstrum alanında süzgeç, sonra vurmalı kısımda kalan yaylı sesin temizlenmesi; "无需
  数据驱动类分离方法中大量训练样本" ("veri güdümlü yöntemlerin çok sayıda eğitim örneğine gerek yok"), PEAQ ile ölçülmüş.
  Tam metin (search.napstic.cn) açılamadı; ayrıntı ve sayı yok. İleride HPSS'e alternatif ya da ikinci aşama olarak
  denenebilir, ama önce makale okunmalı.
- GitHub'daki Çince "yedek" örneği kaçınılacak şey: YHalo-wyh/Demucs-vocal-separation-studio (MIT, `3cd9166`) model yoksa
  "按频率范围简单分离" ("frekans aralığına göre basit ayırma") yapıyor: `"bass": get_filter(200, 'low')`, `"drums": …2000
… - …200`, `"vocals": get_filter(2000, 'high')`. Davulu 200 Hz–2 kHz bandı saymak kick ve hi-hat'i kaçırır; bizim HPSS
  planı bundan açıkça iyi.
- Çince "歌声检测" (vokal var/yok) için modelsiz, birincil bir kaynak bulunamadı; arama yalnızca İngilizce MFCC+HMM ve
  Lehner/Schlüter atıflarını getirdi.

## 7. Özet tablo

| Model                                      | Kod                      | Ağırlık                   | Eğitim verisi                     | Ticari?                          | Kaynak                                              |
| ------------------------------------------ | ------------------------ | ------------------------- | --------------------------------- | -------------------------------- | --------------------------------------------------- |
| bytesep ResUNet143 / MobileNet (ByteDance) | Apache-2.0               | Zenodo (okunamadı)        | yalnızca MUSDB18                  | Hayır (veri)                     | github.com/bytedance/music_source_separation README |
| USS (ByteDance)                            | Apache-2.0               | HF (okunamadı)            | AudioSet (YouTube sesi)           | Önerilmez                        | github.com/bytedance/uss README                     |
| BS-/Mel-RoFormer (ByteDance makaleleri)    | resmî kod yok            | resmî ağırlık yok         | — (dolaşımdaki: MUSDB-HQ)         | Hayır                            | önceki rapor; lucidrains README (ikincil)           |
| BSRNN (Tencent makalesi) / magronp         | resmî yok / **AGPL-3.0** | Zenodo                    | MUSDB18-HQ                        | Hayır                            | github.com/magronp/bsrnn                            |
| ModelScope MossFormer vb.                  | Apache-2.0               | Apache-2.0                | Libri2Mix (konuşma)               | Müzik ayırmaz                    | github.com/modelscope/modelscope                    |
| PaddleHub / PaddleSpeech                   | Apache-2.0               | —                         | —                                 | Müzik ayrıştırma yok             | github.com/PaddlePaddle/PaddleHub                   |
| sherpa-onnx Spleeter ONNX                  | Apache-2.0               | Deezer MIT (aynı ağırlık) | Deezer iç verisi                  | **Evet** (önceki rapordaki risk) | k2-fsa/sherpa-onnx scripts/spleeter, sürüm sayfası  |
| sherpa-onnx UVR MDX-Net ONNX               | Apache-2.0               | UVR ("credit")            | açıklanmamış                      | Önerilmez                        | k2-fsa/sherpa-onnx scripts/uvr_mdx                  |
| MSST-WebUI                                 | **AGPL-3.0**             | ZFTurbo/UVR               | MUSDB-HQ / açıklanmamış           | Hayır                            | SUC-DriverOld/MSST-WebUI LICENSE                    |
| pymss, RVC, GPT-SoVITS                     | MIT                      | UVR/MSST/RoFormer         | MUSDB / açıklanmamış              | Hayır                            | ilgili README'ler                                   |
| DTTNet                                     | Apache-2.0               | mega/Baidu (okunamadı)    | MUSDB18-HQ                        | Hayır                            | junyuchen-cjy/DTTNet-Pytorch README                 |
| TS-BSmamba2                                | Apache-2.0               | yayımlanmamış             | yazılmamış (örnek MUSDB)          | Model yok                        | baijinglin/TS-BSmamba2 README                       |
| Apollo (onarma)                            | CC BY-SA 4.0             | HF                        | MUSDB18-HQ + MoisesDB             | Hayır                            | JusperLee/Apollo README                             |
| UMXZ (dizi)                                | lisans yok               | yok                       | açıklanmamış                      | Hayır                            | Laura-Luo/UMXZ                                      |
| Veri: M4Singer / GTSinger / Opencpop       | —                        | —                         | CC BY-NC-SA / BY-NC-SA / BY-NC-ND | Hayır                            | ilgili depolar                                      |

## Sonuç

Çince kaynaklar önceki sonucu **değiştirmiyor**. Çin şirketlerinden (ByteDance, Tencent, Alibaba, Baidu, Kuaishou,
NetEase) ve Çin akademisinden ticari kullanıma açık veriyle eğitilmiş, ağırlığı yayımlanmış bir müzik ayrıştırma modeli
bulunamadı. ByteDance'in açık ağırlıkları MUSDB18 ya da AudioSet ile eğitilmiş. Alibaba ve Baidu'nun açık araçları
yalnızca konuşma ayırıyor. Çin topluluğu da pratikte Spleeter'ı ya da yasaklı UVR/MSST ağırlıklarını kullanıyor.
Topluluktan bir proje (MusicMaster NOTICE) MUSDB ve RoFormer ağırlıkları için bizimle aynı hükmü kendisi yazıyor.

İki küçük katkı var:

1. **sherpa-onnx'in hazır Spleeter ONNX'i**: 2 kanal fp16 **33,6 MB**; dönüştürme betiği Apache-2.0. Ağırlık Deezer'ın
   kendi MIT sürümü, yani lisans durumu değişmiyor. 4 kanal hazır değil, betik tek parametreyle uyarlanır. Bellek uyarısı
   Çin topluluğunda da var ("耗尽内存"), pencereleme gerekli.
2. **Kendi modelimiz ileride gerekirse**: bytesep'in MobileNet Subband mimarisi (Apache-2.0, 0,3 M parametre, CPU'da
   hızlı) temiz veriyle eğitmek için hafif bir başlangıç. Ama Çince tarafta ticari kullanılabilir çok kanallı veri yok.

Öneri değişmiyor: önce klasik HPSS yedeği yapılır. Sonra, ölçümde fark getirirse, isteğe bağlı Spleeter 4 kanal paketi
eklenir. Yasaklı listeye eklenenler: MSST-WebUI ve magronp/bsrnn (AGPL), DTTNet, Apollo, bytesep, USS. Açılamayan
kaynaklar (ModelScope, Gitee, Hugging Face, arXiv, Zenodo, CNKI) için ağ izni verilirse ayrıca bakılabilir; sonucu
değiştirmeleri beklenmez, ama bu bir doğrulama değil.
