# Kaynak ayrıştırma: Japonca ve Korece kaynak taraması

Tarih: 6 Kasım 2026. Önceki rapor: `kaynak-ayristirma-RAPOR.md` (yalnızca Spleeter uygun). Bu rapor Japon ve Kore
kaynaklarında **kod, ağırlık ve eğitim verisi** ayrı ayrı temiz olan bir model ya da işe yarar klasik yöntem arar.

## 0. Erişim

- **Açılabilen:** github.com (git clone ve WebFetch), pypi.org, WebSearch (yalnızca arama özeti verir, birincil değil).
- **Açılamayan** (alan adı bu oturumda izinli değil): zenodo.org, arxiv.org, huggingface.co, staff.aist.go.jp,
  tachi-hi.github.io, discourse.aicrowd.com, jstage.jst.go.jp, ieeexplore.ieee.org, archives.ismir.net, isca-archive.org,
  zunko.jp, sites.google.com, sony.com. Bunların söylediği hiçbir şey "doğrulandı" diye yazılmadı; yalnızca arama
  özetinden gelen bilgi açıkça **(arama özeti)** diye işaretlendi.
- `api.github.com` ve `gh` bu depolar için kapalı (403); sürüm notları ve issue'lar WebFetch ile okundu. **WebFetch
  alıntıları aracın özetidir**, kelimesi kelimesine olduğu garanti değil.
- Kimseye yazılmadı, depoya dokunulmadı.

## 1. Sony (Japonya): X-UMX, D3Net, UMX-L, X-UMXL

Depo: https://github.com/sony/ai-research-code (`cfe96df`, 12 Eyl 2023). LICENSE: "Apache License Version 2.0" → kod
uygun.

- **X-UMX** (`x-umx/x-umx.md`):
  > "The model was trained on the [MUSDB18](https://sigsep.github.io/datasets/musdb.html) dataset."
  > (Model MUSDB18 veri setiyle eğitildi.) → MUSDB = yalnızca akademik → **yasak.** PyPI kopyaları (`xumx-unofficial`,
  > `xumx-spleeterweb`, https://pypi.org/project/xumx-unofficial) aynı cümleyi taşıyor.
- **Open-Unmix NNabla** (`x-umx/umx.md`): "The models were pre-trained on the MUSDB18 dataset." (Modeller MUSDB18
  ile önceden eğitildi.) → **yasak.**
- **D3Net** (`d3net/music-source-separation/README.md`): ağırlık `nnabla.org/.../d3net-mss.zip` ve OpenVINO sürümü
  (README: "It speeds up the D3Net inference about 5 times on single CPU" = tek CPU'da yaklaşık 5 kat hız). Eğitim
  verisini tek cümleyle söylemiyor, ama: "Published pre-trained models yield SDR values as mentioned in the above table"
  (yayımlanan modeller yukarıdaki tablodaki SDR'yi verir; tablo MUSDB18 test sonucu: ort. 6,03 dB) ve eğitim bölümü
  yalnızca MUSDB18'i anlatıyor ("python train.py --root [Path of MUSDB18 dataset]"). Başka veri anılmıyor →
  **yasak** (MUSDB18 ile eğitildiği belgelerden açıkça çıkıyor; ağırlığın ayrı lisans cümlesi yok).
- **UMX-L (umxl)**: Sony ile Inria'nın ortak Open-Unmix'inin varsayılan modeli. https://github.com/sigsep/open-unmix-pytorch
  README: "trained on private stems dataset of compressed stems. **Note, that the weights are only licensed for
  non-commercial use (CC BY-NC-SA 4.0).**" (Özel, sıkıştırılmış stem veri setiyle eğitildi. Ağırlıklar yalnızca ticari
  olmayan kullanım için lisanslıdır.) → **yasak.**
- **X-UMXL**: https://github.com/asteroid-team/asteroid `egs/musdb18/X-UMX/README.md`: "the extended version trained
  on large-scale data, named X-UMX Large (X-UMXL)" (büyük ölçekli veriyle eğitilmiş genişletilmiş sürüm). Ağırlık
  Zenodo 7128659'da (`asteroid/utils/hub_utils.py`: `"r-sawata/XUMXL_MUSDB18_music_separation"`). Zenodo açılmadı;
  arama özetine göre sayfa "trained on the internal 100h dataset which is larger than MUSDB18" diyor **(arama özeti)**.
  Lisans etiketi okunamadı. Sony'nin iç verisi, kardeşi UMX-L CC BY-NC-SA → **önerilmez / doğrulanamadı.**
- **MMDenseNet / MMDenseLSTM** (Takahashi, Sony): resmî kod ya da ağırlık bulunamadı (arama).
- `SonyResearch/DataCleaning4MSS` depo boş (clone: "empty repository"). Sony org'unda "separation" araması: 0 depo.

## 2. Japon bireysel geliştirici: tsurumeso/vocal-remover

https://github.com/tsurumeso/vocal-remover (`ebcfbbb`, 10 Eyl 2026). LICENSE: "MIT License / Copyright (c) 2019
tsurumeso". UVR'nin "VR Architecture"ı bu koda dayanıyor. Eğitim verisi, issue #101 (sahibinin yanıtı, 17 ve 20 Mar
2022; WebFetch):

> "My dataset consists of 175 songs imported from my own CDs and 50 songs from DSD100. No synthetic songs are
> included." (Veri setim kendi CD'lerimden aktardığım 175 şarkı ve DSD100'den 50 şarkıdan oluşuyor.)
> "I cannot share my dataset as it would be an infringement of copyright." (Paylaşamam, telif ihlali olur.)

Ticari CD kopyaları + DSD100 (MUSDB'nin "Restricted", yalnızca araştırma parçaları; önceki rapor §4) → **yasak.**
Ayrıca yalnızca vokal/eşlik ayırıyor, davul ve bas yok.

## 3. Japon veri setleri

- **RWC Müzik Veritabanı (AIST)**: https://github.com/rwc-music/rwc-annotations README: "RWC 2.0 is a re-release of the
  original RWC dataset under a Creative Commons license" (RWC 2.0, özgün RWC'nin Creative Commons lisansıyla yeniden
  yayımıdır) ve "This project is licensed under the **CC BY-NC 4.0**". mirdata yükleyicisi
  (https://github.com/mir-dataset-loaders/mirdata `mirdata/datasets/rwc_popular.py`, ses Zenodo 18656623):
  `LICENSE_INFO = "Creative Commons Attribution Non Commercial 4.0 International"` → **ticari değil, yasak.** Zaten
  stem içermiyor; yalnızca değerlendirme için (beat, bölüm işaretleri) bile NC.
- **IdolSongsJp** (AIST, ISMIR 2025; stem'li 15 şarkı): Hugging Face'te, açılmadı. Arama özetine göre lisans AIST'te,
  ücretsiz yalnızca ticari olmayan akademik araştırma, ticari kullanım izne bağlı **(arama özeti)** → **yasak sayılmalı.**
- **Şarkı sesi veritabanları** (Tohoku Kiritan, Ofuton P, Natsume, Namine Ritsu, Oniku Kurumi; JVS, PJS): yalnızca
  vokal, karışım ya da stem yok. Şartları Japonca kendi sitelerinde; NNSVS tarifleri (https://github.com/nnsvs/nnsvs
  `recipes/*/README.md`) yalnızca "Due to the licensing issue, this recipe does not include data" (lisans sorunu
  yüzünden veri eklenmedi) diyor; Kiritan için "requires a Facebook account due to licensing issues". Siteler açılmadı
  → **doğrulanamadı.** Kendi modelimizi eğitmek (önceki rapor seçenek C) için bile ancak her birinin şartı tek tek
  okunursa düşünülebilir.

## 4. Kore kaynakları

- **LaSAFT** (Kore Üniv. KUIELab, Woosung Choi): https://github.com/kuielab/LaSAFT-v1 ve
  ws-choi/Conditioned-Source-Separation-LaSAFT; LICENSE "MIT License / Copyright (c) 2020 ws-choi". README: "LaSAFT was
  trained/evaluated on the [Musdb18] dataset." (LaSAFT Musdb18 ile eğitildi/değerlendirildi.) → **yasak.**
- **KUIELab-MDX-Net** (https://github.com/kuielab/mdx-net-submission, MIT): A dalı "Uses only MUSDB18-HQ dataset", B dalı
  "Uses extra datasets" (açıklanmamış) → **yasak / belirsiz.** (Önceki raporla aynı.)
- **KUIELab SDX23 / TFC-TDF-U-Net v3** (https://github.com/kuielab/sdx23, "MIT License / Copyright (c) 2023 IELab@
  Korea University"): "All 203 tracks of the Moises dataset was used for training" (Moises veri setinin 203 parçasının
  hepsi eğitimde kullanıldı). MoisesDB CC BY-NC-SA 4.0 → **yasak.**
- **Gaudio Lab (GSEP), Supertone**: kapalı ticari ürün. `github.com/orgs/gaudiolab` 404; `supertone-inc` org'unda 4
  depo var, hiçbiri ayrıştırma değil (onnxruntime-rs vb.). Açık ağırlık yok.
- **SNU MARG, KAIST MAC Lab, NAVER, Kakao**: aramada açık ağırlıklı bir müzik ayrıştırma modeli bulunamadı.
- **CSD (KAIST, Children's Song Dataset)**: Zenodo açılmadı; arama özetine göre CC BY-NC-SA 4.0 ve "it is prohibited
  to be used for commercial purposes" **(arama özeti)**. Yalnızca vokal → **yasak.**
- **AI Hub (NIA)**: ayrıştırma (stem) veri seti bulunamadı. Arama özetine göre AI Hub verisiyle eğitilen modeller
  ticari kullanılabilir ama kaynağı belirtilmeli **(arama özeti, bir konuşma veri seti sayfasından; doğrulanmadı)**.

## 5. Klasik (modelsiz) iyileştirmeler: asıl kazanç burada

HPSS'nin kökü Tokyo Üniversitesi Sagayama laboratuvarı. Makalelerin kendisi açılamadı (IEEE, J-STAGE, tachi-hi.github.io
kapalı); ama yazarın kendi kodu GitHub'da ve parametreler oradan okundu.

**5.1 Özgün HPSS.** https://github.com/tachi-hi/slidingHPSS README, kaynak: "N. Ono, K. Miyamoto, H. Kameoka,
S. Sagayama 'A real-time equalizer of harmonic and percussive components in music signals' in Proc. ISMIR 2008."
Yöntem: spektrogramın zamanda düzgün (ezgisel) ve frekansta düzgün (vurmalı) iki parçaya bölünmesi, yinelemeli
güncelleme ve Wiener benzeri maske (`src/HPSS.hpp`: `maskH = H² / (H² + P²)`). Ayrıntılı dergi sürümü: Tachibana, Ono,
Kameoka, Sagayama, "Harmonic/Percussive Sound Separation Based on Anisotropic Smoothness of Spectrograms", IEEE/ACM
TASLP 22(12), 2014 (DOI 10.1109/TASLP.2014.2351131). Kodu https://github.com/tachi-hi/HPSS, "MIT License / Copyright
(c) 2014 Hideyuki Tachibana". Fitzgerald'ın ortanca süzgeçli HPSS'si (önceki rapor) aynı fikrin yinelemesiz hâli.
Bizim için ikisi de olur; kendi Rust kodumuzu yazarız, MIT kod gerekirse GPL ile uyumlu.

**5.2 İki aşamalı HPSS ile vokal (önemli).** Tachibana, Ono, Sagayama, "Singing Voice Enhancement in Monaural Music
Signals Based on Two-stage Harmonic/Percussive Sound Separation on Multiple Resolution Spectrograms", IEEE/ACM TASLP
22(1), 2014, 228–237. slidingHPSS README: "This program is coded for following paper ... in which it is applied twice
with different parameter sets." (Program bu makale için yazıldı; HPSS iki kez, farklı parametrelerle uygulanır.)
Fikir: vokalin vibratosu ve kayan perdesi, kısa pencerede "ezgisel", uzun pencerede "vurmalı" gibi görünür. Kodda
iki somut sıra var (ikisi de 16 kHz mono):

- `twostageHPSS_scripts/twostageHPSS.sh`: önce `--frame 128` (8 ms) → `_P.wav` (vurmalı = davul) ve `_H1`; sonra `_H1`
  üzerinde `--frame 8192` (512 ms) → `_H.wav` (sabit ezgisel) ve `_V.wav` (vokal). README: "separated into three files
  named `_H.wav`, `_P.wav`, and `_V.wav`".
- euterpe (https://github.com/tachi-hi/euterpe, "BSD 3-Clause License", gerçek zamanlı karaoke; Tachibana ve ark.,
  IPSJ JIP 24(3), 2016): `euterpe_imgui.cpp`: `freq = 16000`; önce `HPSS_long(7, 2048, 1024, ...)` (128 ms), sonra
  onun vurmalı çıkışında `HPSS_short(7, 512, 256, ...)` (32 ms); karaokede `Buffer_H_short` (vokal) çarpanı `0.0`,
  `Buffer_P_short` (davul) ve `Buffer_H_long` (eşlik) `1.0`. README: "It converts an ordinary music signal into a
  karaoke (vocal-off) in real time." (Sıradan müziği gerçek zamanlı vokalsiz karaokeye çevirir.)

Lyraska için anlamı: önceki raporda "vokal girişi için zayıf" denen klasik yolun **vokal zarfı** için literatürde
denenmiş, modelsiz bir yöntemi var. Davul, bas ve vokal tek boru hattından çıkar:
**davul** = kısa pencerenin vurmalı kısmı (başlangıçlar), **bas** = uzun pencerenin ezgisel kısmı + alçak geçiren
(40–250 Hz), **vokal** = ara bileşen (V), 200 Hz–4 kHz bant enerjisi. Kalite ölçülmedi; makalenin sayıları açılamadı.
Arama özetine göre makale bu iyileştirmenin basit bir perde kestiricisini "considerably improved" (belirgin iyileştirdi)
diyor **(arama özeti)**. Sınır: gitar/keman vibratosu ve kayan synth de V'ye düşer; "vokal var/yok" eşiği şarkıya göre
ayarlanmalı ve sahibinin işaretlediği şarkılarda ölçülmeli.

**5.3 Davul ve bas için diğer Japon klasik yöntemler** (makaleler açılamadı, yalnızca arama özeti):

- Yoshii, Goto, Okuno (Kyoto Üniv./AIST), şablon uyarlama ve eşleme ile bas davul / trampet / hi-hat başlangıcı (ISMIR
  2004; IEEE TASLP 2007; MIREX 2005 "AdaMast"). Özet: tohum şablon şarkıya uyarlanıyor, ezgisel yapı bastırılıyor; 70
  pop şarkıda %83 / %58 / %46 doğruluk **(arama özeti)**. HPSS'nin vurmalı çıkışında kick / trampet / hi-hat'ı bantlara
  göre ayırmak için uygun bir fikir.
- Goto, PreFEst (AIST, ICASSP 2000/2001): düşük frekans bölgesindeki baskın F0'ı bas çizgisi sayar, EM ile **(arama
  özeti)**. Bas zarfından öte bas perdesi gerekirse.
- Tsunoo, Ono, Sagayama, ISMIR 2009 ve IEEE TASL 2011: HPSS ile ölçü uzunluğunda vurmalı ve bas çizgisi örüntüleri
  **(arama özeti)**.
- Uygun değil: ILRMA / FastMNMF gibi Japon kör ayrıştırma yöntemleri ve Togami'nin kitap kodu
  (https://github.com/masahitotogami/python_source_separation, MIT; içindekiler: ışın biçimlendirme, yön tahmini,
  çok kanallı istatistik modeller). Bunlar mikrofon sayısı ≥ kaynak sayısı ister; stereo bir şarkıda 4 kaynak var.

## 6. Özet tablo

| Model                          | Kod                                   | Ağırlık            | Eğitim verisi                    | Ticari?                  | Kaynak                                          |
| ------------------------------ | ------------------------------------- | ------------------ | -------------------------------- | ------------------------ | ----------------------------------------------- |
| Sony X-UMX                     | Apache-2.0                            | lisans cümlesi yok | MUSDB18                          | Hayır                    | sony/ai-research-code x-umx.md                  |
| Sony D3Net (MSS)               | Apache-2.0                            | lisans cümlesi yok | MUSDB18 (belgelere göre)         | Hayır                    | aynı depo, d3net README                         |
| Sony UMX (NNabla)              | Apache-2.0                            | —                  | MUSDB18 / -HQ                    | Hayır                    | aynı depo, umx.md                               |
| UMX-L (Sony/Inria)             | MIT                                   | CC BY-NC-SA 4.0    | Sony özel stem'ler               | Hayır                    | sigsep/open-unmix-pytorch                       |
| X-UMXL (Sony)                  | MIT (Asteroid)                        | Zenodo, okunamadı  | Sony iç ~100 sa (arama özeti)    | Doğrulanamadı, önerilmez | asteroid X-UMX README                           |
| tsurumeso vocal-remover        | MIT                                   | lisans cümlesi yok | 175 kendi CD'si + 50 DSD100      | Hayır                    | vocal-remover issue #101                        |
| LaSAFT (Kore Üniv.)            | MIT                                   | —                  | MUSDB18                          | Hayır                    | kuielab/LaSAFT-v1                               |
| KUIELab MDX-Net                | MIT                                   | —                  | MUSDB18-HQ / açıklanmamış        | Hayır                    | kuielab/mdx-net-submission                      |
| KUIELab SDX23                  | MIT                                   | —                  | MoisesDB (NC)                    | Hayır                    | kuielab/sdx23                                   |
| Gaudio GSEP, Supertone         | kapalı                                | kapalı             | —                                | Yok                      | açık depo bulunamadı                            |
| RWC / IdolSongsJp / CSD (veri) | —                                     | —                  | CC BY-NC / AIST NC / CC BY-NC-SA | Hayır                    | rwc-annotations, mirdata; diğerleri arama özeti |
| İki aşamalı HPSS (Tachibana)   | kendi Rust kodumuz (referans MIT/BSD) | —                  | —                                | **Evet**                 | tachi-hi/slidingHPSS, HPSS, euterpe             |

## Sonuç

Önceki sonuç **değişmiyor**: Japon ve Kore kaynaklarında da ağırlığı ve eğitim verisi ticari kullanıma açık bir
ayrıştırma modeli yok. Sony'nin açık modelleri MUSDB18 ya da NC lisanslı iç veriyle, Kore Üniversitesi'nin modelleri
MUSDB18 / MoisesDB ile, tsurumeso'nun modeli ticari CD'ler ve DSD100 ile eğitilmiş. Gaudio ve Supertone kapalı. Japon ve
Kore veri setlerinin hepsi ticari olmayan lisanslı ya da doğrulanamadı. Hazır model olarak tek aday yine Spleeter.

Değişen tek şey klasik yedek yolun kapsamı: Tachibana–Ono–Sagayama'nın **iki aşamalı, iki çözünürlüklü HPSS**'si
modelsiz bir **vokal zarfı** veriyor. Öneri: ilk PR'daki HPSS işine ikinci bir aşama eklenir (≈ 8–32 ms ve ≈ 128–512 ms
pencere; 44,1 kHz'e ölçeklenir). Böylece davul, bas ve vokal zarfı tek klasik boru hattından çıkar. Spleeter paketi bu
yola göre ölçülür ve ancak vokal ve davulda açık fark getirirse eklenir. Makale sayıları açılamadığı için beklenen
kalite **tahmindir**; sahibinin işaretlediği şarkılarda ölçülmeden karar verilmez.
