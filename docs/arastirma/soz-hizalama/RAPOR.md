# Düz metin sözleri sese otomatik hizalama — birinci irdeleme (30 Ekim 2026)

Soru: kullanıcı sözü zamansız (düz metin) yapıştırdığında, Lyraska her satırın ve mümkünse her kelimenin başlama
anını **kendisi, çevrimdışı, kullanıcı hiçbir şey yapmadan** bulabilir mi? Türkçe mutlaka, İngilizce de.

## 0. Kısa sonuç

- **Öneri: CTC tabanlı zorlanmış hizalama.** Model: Meta'nın **Omnilingual ASR CTC 300M v2** (kod ve ağırlık
  Apache-2.0; 1600+ dil, Türkçe dahil; harf düzeyinde), sherpa-onnx'in int8 ONNX dönüşümü (366 MB; sıkıştırılmış
  ~280 MB). Ses 30 sn'lik pencerelerle (20 sn adım) modele verilir, sonra bilinen metin harf harf **Viterbi** ile
  yerleştirilir (Rust'ta küçük, saf bir hesap). **Vokal ayrıştırma gerekmez**: karışımın kendisi ayrılmış vokalden
  iyi ya da eşit çıktı.
- **Son sınama (bir kez, yöntem önceden seçilip kod dondurulduktan sonra), `ctc:karisim`:**
  - JamendoLyrics (39 şarkı, İng./Fr./Alm./İsp.): kelimelerin **%94,1**'i 0,3 sn içinde, ortanca hata **0,032 sn**;
    satırların %93,0'ı 0,3 sn içinde. 39 şarkının 29'unda satır ortalaması < 0,3 sn; 5 şarkıda bölümler kayıyor
    (ortalama hatayı 1,09 sn'ye çeken onlar; en kötüsü vokalin gitarlara gömüldüğü bir rock şarkısı).
  - **Gerçek Türkçe şarkı** (Türk sanat müziği kayıtları, 4 kayıt, söz öbeği düzeyinde): öbek başlarının **%97,9**'u
    0,3 sn içinde, %100'ü 1 sn içinde, ortanca 0,057 sn.
  - **Türkçe vekil set** (12 yapay şarkı, kelime düzeyinde): kelimelerin **%99,8**'i 0,3 sn içinde, ortanca 0,04 sn.
- Karşılaştırma (aynı son sınama): Whisper base + çapraz dikkat DTW (openai-whisper'ın yöntemi; uzun ses için kendi
  uygulamam) Jamendo'da kelimelerin %56'sı, makamda öbeklerin %10'u; model gerektirmeyen yol (vokal etkinliği + hece)
  Jamendo'da %5, vekilde %36. Önce Spleeter ile vokal ayırmak (`karışım+vokal` birleşimi) Jamendo'da +0,8 puan,
  Türkçe setlerde fark yok; maliyeti büyük (5,3 GB bellek).
- Hız (bu makine: 4 çekirdek Xeon, ekran kartı yok, Linux): 4 dk şarkı **31 sn** (4 iş parçacığı), **~2 dk** (1 iş
  parçacığı, arka plan için); tepe bellek ~1,8 GB (15 sn pencereyle ~1,3 GB, biraz daha az doğru). Saf Rust `tract`
  ile de çalışıyor (karelerin %98,7'sinde aynı çıktı), tek iş parçacıklı ONNX Runtime'dan ~1,7 kat yavaş (4 dk şarkı
  ~3,4 dk).
- Açık riskler: gerçek **Türk pop'u / arabesk / rap** ile ölçülmedi (doğru zamanlı set bulunamadı); hatalı satırları
  güvenle işaretleyen bir ölçü yok (bölüm 4.5); model 366 MB (kurulum ~+280 MB); eğitim verisinin tamamı açıklanmamış
  (Whisper'da da öyle); yapıştırılan söz eksikse (ör. "Nakarat ×2") ortalama hata ikiye katlanıyor (ortanca aynı).

## 1. Önceki araştırma (depoda bulunanlar)

| Kaynak                                                      | Ne diyor                                                                                          | Bugün geçerli mi                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/BILGI-BIRIKIMI.md` §6                                 | Modelde kod, ağırlık, eğitim verisi ayrı denetlenir; Demucs ağırlıkları kullanılamaz, MUSDB18 NC  | **Geçerli.** Demucs README'si (birincil): `htdemucs` "MusDB + 800 songs" ile eğitilmiş, `mdx_extra` MusDB test setini de içeriyor; MUSDB18'in ticari olmayan kullanım şartı önceki araştırmanın bulgusu (sigsep sayfası bu ortamdan açılmadı) → Demucs'un hazır ağırlıkları bu projeye girmez.                                                                                                                                                                                    |
| `BILGI-BIRIKIMI.md` §7 (23 Ekim)                            | Kaynak ayrıştırma için Spleeter seçildi ("kod ve ağırlıklar MIT")                                 | **Kısmen değişti.** deezer/spleeter README'si bugün yalnızca "The code of Spleeter is MIT-licensed" diyor; ağırlıklar aynı deponun GitHub sürümlerinde dağıtılıyor ama ayrı bir lisans cümlesi yok; eğitim verisi README'de yazmıyor (makale okunamadı: archives.ismir.net bu ortamdan kapalı). README ayrıca "ajanlar lisans için bakımcılara yazmasın" diyor; yazılmadı. Bu iş için **Spleeter gerekmiyor** (bölüm 4), karar yine de ayrıştırma işi (ACIK-KONULAR 5) için açık. |
| `docs/ROADMAP.md` Faz 5                                     | Temiz model yoksa yedek yol klasik sinyal işleme (vokal sezimi vb.)                               | Sözler için ölçüldü: vokal etkinliği + hece yolu kullanışsız (ortanca hata 0,4–4 sn; bölüm 4). Klasik yol satır başını bile güvenle bulamıyor.                                                                                                                                                                                                                                                                                                                                    |
| `docs/arastirma/sozler/README.md`                           | Programın kendi zaman payı ±8 ms; zamansız satırda kelimeler hece sayısıyla "tahmini" dağıtılıyor | **Geçerli ve uyumlu.** Hizalayıcının ortanca hatası (~35–50 ms) programın ekran payından büyük; ekrana çıkış zinciri değişmez. Hece dağıtımı, güveni düşük satırlarda yedek olarak kalır.                                                                                                                                                                                                                                                                                         |
| `docs/VERITAS.md`, `docs/arastirma/veritas/`                | Geliştirme / doğrulama / son sınama ayrımı, kapı, ağırlıklar depoya girmez                        | Aynı yöntem kullanıldı (bölüm 3).                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `docs/LISANSLAR.md` "Programa girmeyen araştırma dosyaları" | Yalnızca araştırmada kullanılan veri böyle not edilir                                             | Bu çalışmanın veri setleri (NC lisanslı şarkılar dahil) yalnızca geçici klasörde, programa ve depoya girmez; depoya geçerken aynı biçimde not edilmeli (bölüm 8).                                                                                                                                                                                                                                                                                                                 |
| `docs/devlog/2026-10-22-2.md` s. 148                        | Ayrıştırma lisans araştırması bir ajanda                                                          | Raporu depoda (hiçbir dalda) bulunamadı.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `docs/ACIK-KONULAR.md` 6                                    | "Sözlerin sese otomatik hizalanması (vokal ayrıştırmadan sonra)"                                  | **Sıra değişebilir:** ölçüme göre hizalama ayrıştırmaya bağlı değil.                                                                                                                                                                                                                                                                                                                                                                                                              |

## 2. Seçenekler (birincil kaynaklar)

Lisans sütunu: kod / ağırlık / eğitim verisi. "Okunamadı" = bu ortamdan erişilemedi (arxiv.org, huggingface.co,
openaipublic, dl.fbaipublicfiles kapalı); yalnızca GitHub ve PyPI açıktı.

| Seçenek                                                 | Ne yapar                                                                                                | Türkçe                                                      | Boyut                                         | Hız (4 dk, bu makine)                                                    | Lisans                                                                                                                                             | Kaynak                                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Omnilingual ASR CTC 300M v2 + Viterbi** (önerilen) | Harf olasılıkları (20 ms kare) → bilinen metnin en olası yerleşimi                                      | Evet (eğitimde 1126 saat Türkçe; 7B modelde Türkçe CER 2,1) | int8 ONNX 366 MB (xz ~280 MB)                 | 31 sn (4 iş p.), 117 sn (1 iş p.); 30 sn pencere                         | Apache-2.0 / Apache-2.0 / kendi derlemleri CC-BY-4.0 + açıklanmamış kısım                                                                          | [omnilingual-asr README](https://github.com/facebookresearch/omnilingual-asr) ("code and models are released under the Apache 2.0"), `per_language_results_table_7B_llm_asr.csv`; ONNX: [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) sürümü `asr-models` |
| B. Whisper (tiny/base/small) + çapraz dikkat DTW        | openai-whisper `timing.py`: bilinen belirteçlerle kod çözücü bir kez, hizalama başlarının dikkati → DTW | Evet (Whisper çok dilli)                                    | base: fp32 290 MB, int8 160 MB; small ~3×     | base: 27 sn                                                              | MIT / MIT / açıklanmamış web verisi                                                                                                                | [openai/whisper README](https://github.com/openai/whisper) ("code and model weights are released under the MIT License"), `whisper/timing.py`                                                                                                                    |
| B'. whisper.cpp / whisper-rs                            | C/C++ Whisper; deneysel DTW belirteç zamanları                                                          | Evet                                                        | ggml dosyaları (Hugging Face'te; erişilemedi) | ölçülmedi                                                                | MIT (whisper.cpp), Unlicense (whisper-rs)                                                                                                          | `whisper.h`: `dtw_token_timestamps` "[EXPERIMENTAL]"; bilinen metni zorla verme API'si yok (yalnızca `prompt_tokens`)                                                                                                                                            |
| B''. candle (saf Rust) Whisper                          | Whisper'ı Rust'ta çalıştırır                                                                            | Evet                                                        | aynı                                          | ölçülmedi                                                                | MIT/Apache-2.0                                                                                                                                     | [candle README](https://github.com/huggingface/candle); DTW yok, elle yazılır                                                                                                                                                                                    |
| C. wav2vec2 / MMS CTC hizalayıcılar                     | A ile aynı yöntem                                                                                       | MMS evet                                                    | —                                             | —                                                                        | **MMS ağırlıkları CC-BY-NC → yasak**; diğer Türkçe ince ayarlı wav2vec2'ler Hugging Face'te (erişilemedi, lisansları tek tek)                      | görev tanımı                                                                                                                                                                                                                                                     |
| D. Önce vokal ayrıştırma (Spleeter / UVR / Demucs)      | A ya da B'den önce vokali ayırır                                                                        | —                                                           | Spleeter vokal 19,7 MB (fp16)                 | Spleeter 10,7 sn, **5,3 GB tepe bellek** (sherpa-onnx); UVR Voc_FT 73 sn | Spleeter: kod MIT, ağırlık belirsiz (yukarıda); UVR: GUI MIT, "modellerimize MIT ile atıf", eğitim verisi açıklanmamış; Demucs: MUSDB (NC) → yasak | deezer/spleeter, Anjok07/ultimatevocalremovergui, facebookresearch/demucs README'leri                                                                                                                                                                            |
| E. Model yok: vokal etkinliği + hece sayısı             | Spleeter vokal enerjisinden "şarkı söyleniyor" kareleri; heceler sırayla eşit dağıtılır                 | dilden bağımsız                                             | 0 (Spleeter hariç)                            | <1 sn                                                                    | —                                                                                                                                                  | bu çalışma                                                                                                                                                                                                                                                       |
| E0. Eşit dağıtım                                        | Heceler ilk–son vokal arasına eşit                                                                      | —                                                           | 0                                             | —                                                                        | —                                                                                                                                                  | bu çalışma                                                                                                                                                                                                                                                       |

Yayınlanmış sonuçlar (JamendoLyrics; **birincil metinler okunamadı**, yalnızca arama özetleri; karşılaştırmada temkin):
Stoller ve ark. 2019 (karakter tanıyıcı + hizalama) ortalama mutlak hata ~0,82 sn; Vaglio ve ark. 2020 (çok dilli)
~0,37 sn; Durand, Stoller, Ewert 2023 (karşıtsal öğrenme; JamendoLyrics MultiLang'i yayımlayan çalışma) İngilizce
Jamendo'da 0,2 sn'nin altında ("ilk kez"). Bu çalışmanın ölçüsü aynı tanım değil (bkz. 3.3: şarkı başına ortalama
ve havuz ortalaması ikisi de verildi); A yöntemi bu literatürle aynı ölçekte: şarkı başına satır ortalaması doğrulamada 0,14 sn, son sınamada 1,33 sn
(kayan 5 şarkı yüzünden; ortanca şarkı 0,06 sn).

## 3. Deneme seti ve yöntem

### 3.1 Setler (ses dosyaları yalnızca geçici klasörde; depoya hiçbir ses girmedi)

| Set         | Ne                                                                                                                                                                                                                                                                                      | Doğru zaman                                                             | Boyut                                                                                  | Lisans (yalnızca yerel ölçüm)                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **jamendo** | [JamendoLyrics MultiLang](https://github.com/f90/jamendolyrics) (GitHub'daki "deprecated" son sürüm): 79 şarkı, İng./Fr./Alm./İsp., pop/rock/hip-hop/reggae…                                                                                                                            | Elle işaretlenmiş kelime başları; satır başı = satırın ilk kelimesi     | 20 / 20 / 39 şarkı                                                                     | Şarkılar CC BY-NC-ND/BY-ND vb. (Jamendo) → yalnızca ölçüm          |
| **makam**   | [georgid/turkish-makam-lyrics-2-audio-test-data](https://github.com/georgid/turkish-makam-lyrics-2-audio-test-data) (Dzhambazov, UPF): gerçek Türk sanat müziği şarkı kayıtları (sazlı, çoğu tek ses)                                                                                   | Elle işaretlenmiş **söz öbeği** (1–2 kelime) başları; kelime zamanı yok | 10 kayıt: 3 / 3 / 4 (ses = kaydın işaretli bölümlerinin art arda eklenmesi, 89–225 sn) | CC BY-NC-ND (CompMusic) → yalnızca ölçüm                           |
| **vekil**   | **Vekil (gerçek şarkı değil):** Türkçe konuşma sentezi (Piper VITS tr_TR, 2 ses) kelime kelime üretilip WORLD vokoderiyle ezgiye oturtuldu (perde, uzatma, titreşim, yankı); eşlik FluidSynth + FluidR3_GM (davul, bas, akor, yaylı, solo); vokal/eşlik −6…+4 dB; nakarat tekrarlı yapı | Tam bilinir (kelimenin yerleştirildiği an)                              | 6 / 6 / 12 şarkı (tohum 0–5 / 100–105 / 200–211)                                       | Söz satırları bu çalışmanın özgün satırları (+2 Yunus Emre dizesi) |

Türkçe pop/arabesk için doğru zamanlı bir set bulunamadı (açık söylemek gerekirse: GitHub'da yok; Hugging Face ve
LRCLIB bu ortamdan kapalı). Makam seti gerçek Türkçe şarkı ama uzun heceli ve yavaş; vekil set yapı olarak gerçekçi,
ses olarak yapay (model vekil sesin sözlerini kötü "duyuyor": serbest tanımada vekil_0002'nin çıktısı Türkçeye zor
benziyor; yani vekil set akustik olarak gerçek şarkıdan **zor**, yapı olarak kolay).

### 3.2 Bölme

Jamendo: dil başına ad özetine (SHA-256) göre sıralanıp ilk 5 geliştirme, sonraki 5 doğrulama, kalan son sınama.
Makam: 3/3/4 aynı kuralla. Vekil: ayrı tohumlar; **son sınama seti kod dondurulduktan sonra üretildi**
(`kod-dondurma-md5.txt`). Geliştirmede yöntem değişkeleri denendi, doğrulamada seçildi, son sınama bir kez çalıştı.

### 3.3 Ölçütler

Satır başı ve kelime başı için mutlak hata (sn): havuz ortalaması, ortanca, ≤0,3 sn ve ≤1 sn yüzdesi; ayrıca şarkı
başına satır ortalamasının ortalaması (literatürdeki AAE'ye en yakın). Makamda "satır" = söz öbeği. Hız ve tepe bellek
ayrı süreçte, önbelleksiz (`hiz.py`, `bellek.py`).

## 4. Ölçümler

### 4.1 Geliştirme (değişkeler)

#### jamendo / gelistirme

| Yöntem                | Şarkı | Satır ort. (sn) | Satır ortanca | Satır ≤0,3 sn % | Satır ≤1 sn % | Kelime ort. | Kelime ortanca | Kelime ≤0,3 % | Kelime ≤1 % | Şarkı başına satır ort. |
| --------------------- | ----- | --------------- | ------------- | --------------- | ------------- | ----------- | -------------- | ------------- | ----------- | ----------------------- |
| ctc:karisim           | 20    | 0,61            | 0,03          | 93,8            | 94,6          | 0,50        | 0,04           | 93,6          | 95,5        | 0,64                    |
| ctc:karisim+spleeter  | 20    | 0,54            | 0,03          | 94,4            | 95,7          | 0,44        | 0,04           | 94,4          | 96,2        | 0,55                    |
| ctc:karisim:p15       | 20    | 0,61            | 0,03          | 94,1            | 95,4          | 0,45        | 0,04           | 94,4          | 96,4        | 0,75                    |
| ctc:spleeter          | 20    | 1,01            | 0,04          | 91,7            | 93,8          | 0,77        | 0,04           | 92,5          | 94,9        | 1,34                    |
| ctc:spleeter:joker    | 20    | 1,02            | 0,04          | 91,7            | 93,8          | 0,77        | 0,04           | 92,5          | 94,9        | 1,34                    |
| esit                  | 20    | 10,29           | 7,65          | 3,1             | 11,5          | 9,89        | 7,33           | 3,0           | 11,3        | 11,76                   |
| vad                   | 20    | 6,44            | 3,18          | 8,3             | 24,4          | 6,32        | 3,36           | 8,3           | 24,6        | 6,91                    |
| whisper:base:karisim  | 20    | 8,35            | 0,53          | 28,7            | 73,4          | 10,00       | 0,19           | 61,2          | 76,5        | 7,83                    |
| whisper:base:spleeter | 20    | 6,30            | 0,53          | 27,2            | 70,0          | 6,64        | 0,19           | 60,7          | 76,3        | 6,62                    |

#### makam / gelistirme

| Yöntem                | Şarkı | Satır ort. (sn) | Satır ortanca | Satır ≤0,3 sn % | Satır ≤1 sn % | Kelime ort. | Kelime ortanca | Kelime ≤0,3 % | Kelime ≤1 % | Şarkı başına satır ort. |
| --------------------- | ----- | --------------- | ------------- | --------------- | ------------- | ----------- | -------------- | ------------- | ----------- | ----------------------- |
| ctc:karisim           | 3     | 0,28            | 0,08          | 92,7            | 97,6          | —           | —              | —             | —           | 0,25                    |
| ctc:karisim+spleeter  | 3     | 0,28            | 0,09          | 92,7            | 97,6          | —           | —              | —             | —           | 0,25                    |
| ctc:karisim:p15       | 3     | 0,33            | 0,08          | 91,5            | 96,3          | —           | —              | —             | —           | 0,29                    |
| ctc:spleeter          | 3     | 0,28            | 0,09          | 92,7            | 97,6          | —           | —              | —             | —           | 0,25                    |
| esit                  | 3     | 2,39            | 2,13          | 7,3             | 29,3          | —           | —              | —             | —           | 2,22                    |
| vad                   | 3     | 2,68            | 1,98          | 17,1            | 31,7          | —           | —              | —             | —           | 2,46                    |
| whisper:base:karisim  | 3     | 15,79           | 0,85          | 24,4            | 51,2          | —           | —              | —             | —           | 13,59                   |
| whisper:base:spleeter | 3     | 18,33           | 1,02          | 25,6            | 48,8          | —           | —              | —             | —           | 15,81                   |

#### vekil / gelistirme

| Yöntem                | Şarkı | Satır ort. (sn) | Satır ortanca | Satır ≤0,3 sn % | Satır ≤1 sn % | Kelime ort. | Kelime ortanca | Kelime ≤0,3 % | Kelime ≤1 % | Şarkı başına satır ort. |
| --------------------- | ----- | --------------- | ------------- | --------------- | ------------- | ----------- | -------------- | ------------- | ----------- | ----------------------- |
| ctc:karisim           | 6     | 0,24            | 0,04          | 96,7            | 96,7          | 0,31        | 0,05           | 95,2          | 96,8        | 0,23                    |
| ctc:karisim+spleeter  | 6     | 0,06            | 0,04          | 100,0           | 100,0         | 0,08        | 0,05           | 98,8          | 99,8        | 0,06                    |
| ctc:karisim:p15       | 6     | 0,40            | 0,04          | 93,3            | 93,3          | 0,41        | 0,05           | 92,5          | 93,8        | 0,36                    |
| ctc:spleeter          | 6     | 0,25            | 0,04          | 97,5            | 98,3          | 0,14        | 0,05           | 96,8          | 99,4        | 0,23                    |
| esit                  | 6     | 10,25           | 9,24          | 0,0             | 0,0           | 9,30        | 8,65           | 0,4           | 2,4         | 9,86                    |
| vad                   | 6     | 2,20            | 1,55          | 21,7            | 39,2          | 1,10        | 0,55           | 35,1          | 66,1        | 2,30                    |
| whisper:base:karisim  | 6     | 0,80            | 0,75          | 15,0            | 76,7          | 0,45        | 0,27           | 54,2          | 92,1        | 0,80                    |
| whisper:base:spleeter | 6     | 0,74            | 0,71          | 20,0            | 70,8          | 0,50        | 0,25           | 57,5          | 88,1        | 0,75                    |

Geliştirmede bulunanlar:

- **Karışım ≥ ayrılmış vokal:** Omnilingual müziğe dayanıklı. Spleeter vokali bazı şarkılarda (Culture & Co, Bitte
  beweg dich nicht, Caralibro) bozuyor: model ayrılmış vokalde sözü hiç duymuyor (serbest tanıma boş).
- **Satır arası "joker"** (MMS hizalayıcısındaki `<star>` gibi; söylenmeyen ya da fazladan sesi yutar) etkisiz: CTC
  karelerinin %96'sında en olası sınıf zaten "boşluk", joker neredeyse hiç seçilmiyor. Bırakıldı.
- **15 sn pencere** Jamendo'da 30 sn kadar iyi, makam ve vekilde biraz geride; bellek daha az (bölüm 5). Doğrulamaya alındı.
- **Sabit gecikme düzeltmesi gerekmiyor:** Jamendo'da işaretli hata ortancası +8 ms (vekilde +45 ms, ama vekilin
  "doğrusu" ünsüzün ilk örneği, model ünlüyü duyuyor; makamda +72 ms, öbek sınırları elle biraz önce konmuş).
- **Whisper base:** pencerenin kaç kelime içerdiği bitiş belirtecinin (EOT) olasılık sıçramasıyla güvenle
  bulunuyor (içeride log p ≈ −5…−13, ilk dışarıdaki kelimede ≈ −0,1), ama DTW kelime başları bulanık (ortanca
  0,19 sn) ve sessizlikten sonraki kelime erken (openai-whisper'ın kendi düzeltmesi de uygulandı: satır başı
  kelimenin süresi 2 × ortanca ile sınırlı). Makamda (uzun heceler) çöküyor.

### 4.2 Doğrulama

#### jamendo / dogrulama

| Yöntem               | Şarkı | Satır ort. (sn) | Satır ortanca | Satır ≤0,3 sn % | Satır ≤1 sn % | Kelime ort. | Kelime ortanca | Kelime ≤0,3 % | Kelime ≤1 % | Şarkı başına satır ort. |
| -------------------- | ----- | --------------- | ------------- | --------------- | ------------- | ----------- | -------------- | ------------- | ----------- | ----------------------- |
| ctc:karisim          | 20    | 0,14            | 0,03          | 98,1            | 98,8          | 0,08        | 0,04           | 98,5          | 99,4        | 0,14                    |
| ctc:karisim+spleeter | 20    | 0,13            | 0,03          | 97,9            | 98,4          | 0,09        | 0,04           | 98,2          | 98,9        | 0,16                    |
| ctc:karisim:p15      | 20    | 0,18            | 0,03          | 97,1            | 98,3          | 0,11        | 0,04           | 98,2          | 99,2        | 0,18                    |
| ctc:spleeter         | 20    | 0,21            | 0,04          | 95,7            | 96,8          | 0,16        | 0,04           | 96,3          | 97,3        | 0,22                    |
| esit                 | 20    | 10,93           | 7,71          | 3,6             | 10,5          | 10,17       | 7,35           | 3,7           | 11,3        | 10,89                   |
| vad                  | 20    | 8,04            | 4,28          | 6,0             | 15,8          | 7,33        | 4,16           | 5,6           | 17,2        | 7,67                    |

#### makam / dogrulama

| Yöntem               | Şarkı | Satır ort. (sn) | Satır ortanca | Satır ≤0,3 sn % | Satır ≤1 sn % | Kelime ort. | Kelime ortanca | Kelime ≤0,3 % | Kelime ≤1 % | Şarkı başına satır ort. |
| -------------------- | ----- | --------------- | ------------- | --------------- | ------------- | ----------- | -------------- | ------------- | ----------- | ----------------------- |
| ctc:karisim          | 3     | 0,08            | 0,05          | 100,0           | 100,0         | —           | —              | —             | —           | 0,08                    |
| ctc:karisim+spleeter | 3     | 0,08            | 0,04          | 98,9            | 100,0         | —           | —              | —             | —           | 0,08                    |
| ctc:karisim:p15      | 3     | 0,08            | 0,06          | 98,9            | 100,0         | —           | —              | —             | —           | 0,08                    |
| ctc:spleeter         | 3     | 0,08            | 0,05          | 98,9            | 100,0         | —           | —              | —             | —           | 0,08                    |
| esit                 | 3     | 2,16            | 2,00          | 10,8            | 28,0          | —           | —              | —             | —           | 2,18                    |
| vad                  | 3     | 1,65            | 1,47          | 15,1            | 39,8          | —           | —              | —             | —           | 1,61                    |

#### vekil / dogrulama

| Yöntem               | Şarkı | Satır ort. (sn) | Satır ortanca | Satır ≤0,3 sn % | Satır ≤1 sn % | Kelime ort. | Kelime ortanca | Kelime ≤0,3 % | Kelime ≤1 % | Şarkı başına satır ort. |
| -------------------- | ----- | --------------- | ------------- | --------------- | ------------- | ----------- | -------------- | ------------- | ----------- | ----------------------- |
| ctc:karisim          | 6     | 0,13            | 0,04          | 99,2            | 99,2          | 0,07        | 0,04           | 99,6          | 99,8        | 0,15                    |
| ctc:karisim+spleeter | 6     | 0,04            | 0,03          | 100,0           | 100,0         | 0,05        | 0,04           | 99,6          | 100,0       | 0,04                    |
| ctc:karisim:p15      | 6     | 0,14            | 0,03          | 98,3            | 98,3          | 0,07        | 0,04           | 99,2          | 99,6        | 0,16                    |
| ctc:spleeter         | 6     | 0,05            | 0,03          | 99,2            | 99,2          | 0,05        | 0,04           | 99,4          | 99,8        | 0,05                    |
| esit                 | 6     | 8,27            | 8,05          | 1,7             | 1,7           | 7,38        | 7,26           | 1,3           | 5,1         | 7,93                    |
| vad                  | 6     | 1,84            | 0,64          | 35,0            | 55,8          | 0,86        | 0,37           | 41,0          | 81,2        | 1,85                    |

15 sn pencere değişkesi (`ctc:karisim:p15`, daha az bellek) doğrulamada da ölçüldü: Jamendo kelime ≤0,3 sn %98,2
(30 sn: %98,5), satır %97,1 (%98,1); makam %98,9 (%100); vekil %99,2 (%99,6); geliştirmede makam ve vekilde de geride.

Seçim (son sınamadan **önce**, `kod-dondurma-md5.txt`'ye yazıldı): ana yöntem **`ctc:karisim`** (karışım, 30 sn
pencere; ayrıştırma yok). İkinci aday `ctc:karisim+spleeter` (iki kaynağın olasılık ortalaması): vekil sette ortalamayı
düşürüyor, Jamendo doğrulamada düşürmüyor; maliyeti Spleeter (5,3 GB bellek, +19,7 MB) ve iki kat model süresi.
Karşılaştırma için Whisper base ve vokal etkinliği yolu da son sınamaya alındı.

### 4.3 Yapıştırılan söz şarkıyla aynı değilse (geliştirme, Jamendo)

Jamendo geliştirme, `ctc:karisim`; ölçüm yalnızca metinde kalan ve gerçekten söylenen satırlarda (`bozuk.py`).

| Durum                               | Joker cezası | Satır ort. (sn) | Ortanca | ≤0,3 sn % | ≤1 sn % | Şarkı başına ort. |
| ----------------------------------- | ------------ | --------------- | ------- | --------- | ------- | ----------------- |
| tam (söz birebir)                   | yok          | 0,61            | 0,034   | 93,8      | 94,6    | 0,64              |
| tam                                 | 1            | 0,61            | 0,034   | 93,8      | 94,6    | 0,64              |
| eksik (ortadan 3 satır silindi)     | yok          | 1,21            | 0,035   | 90,3      | 91,2    | 1,50              |
| eksik                               | 1            | 1,22            | 0,035   | 90,0      | 90,9    | 1,51              |
| fazla (söylenmeyen 2 satır eklendi) | yok          | 0,68            | 0,036   | 90,7      | 92,9    | 0,74              |
| fazla                               | 1            | 0,68            | 0,036   | 90,7      | 92,9    | 0,74              |

Eksik satırlar şarkının bir bölümünü kaydırıyor (ortalama iki katı), fazla satır az zarar veriyor; ikisinde de çoğu
satır yerinde kalıyor (ortanca aynı). Joker cezası 0,5–4 arasında da sonuç aynı (bölüm 4.1).

### 4.4 Son sınama (bir kez)

#### jamendo / son_sinama

| Yöntem                | Şarkı | Satır ort. (sn) | Satır ortanca | Satır ≤0,3 sn % | Satır ≤1 sn % | Kelime ort. | Kelime ortanca | Kelime ≤0,3 % | Kelime ≤1 % | Şarkı başına satır ort. |
| --------------------- | ----- | --------------- | ------------- | --------------- | ------------- | ----------- | -------------- | ------------- | ----------- | ----------------------- |
| ctc:karisim           | 39    | 1,09            | 0,03          | 93,0            | 94,1          | 0,89        | 0,03           | 94,1          | 95,4        | 1,33                    |
| ctc:karisim+spleeter  | 39    | 1,19            | 0,04          | 94,4            | 95,2          | 0,95        | 0,03           | 94,9          | 96,1        | 1,32                    |
| esit                  | 39    | 10,45           | 7,99          | 3,4             | 10,8          | 10,70       | 8,40           | 2,9           | 9,6         | 11,25                   |
| vad                   | 39    | 6,26            | 3,68          | 5,5             | 16,0          | 6,04        | 3,66           | 5,2           | 16,1        | 7,26                    |
| whisper:base:spleeter | 39    | 11,50           | 0,66          | 26,1            | 64,3          | 12,53       | 0,23           | 56,0          | 70,9        | 11,31                   |

#### makam / son_sinama

| Yöntem                | Şarkı | Satır ort. (sn) | Satır ortanca | Satır ≤0,3 sn % | Satır ≤1 sn % | Kelime ort. | Kelime ortanca | Kelime ≤0,3 % | Kelime ≤1 % | Şarkı başına satır ort. |
| --------------------- | ----- | --------------- | ------------- | --------------- | ------------- | ----------- | -------------- | ------------- | ----------- | ----------------------- |
| ctc:karisim           | 4     | 0,08            | 0,06          | 97,9            | 100,0         | —           | —              | —             | —           | 0,08                    |
| ctc:karisim+spleeter  | 4     | 0,08            | 0,06          | 97,9            | 100,0         | —           | —              | —             | —           | 0,08                    |
| esit                  | 4     | 1,75            | 1,50          | 12,4            | 33,1          | —           | —              | —             | —           | 1,82                    |
| vad                   | 4     | 1,82            | 1,69          | 9,7             | 32,4          | —           | —              | —             | —           | 1,81                    |
| whisper:base:spleeter | 4     | 12,46           | 8,00          | 10,3            | 33,1          | —           | —              | —             | —           | 13,05                   |

#### vekil / son_sinama

| Yöntem                | Şarkı | Satır ort. (sn) | Satır ortanca | Satır ≤0,3 sn % | Satır ≤1 sn % | Kelime ort. | Kelime ortanca | Kelime ≤0,3 % | Kelime ≤1 % | Şarkı başına satır ort. |
| --------------------- | ----- | --------------- | ------------- | --------------- | ------------- | ----------- | -------------- | ------------- | ----------- | ----------------------- |
| ctc:karisim           | 12    | 0,06            | 0,04          | 99,5            | 99,5          | 0,06        | 0,04           | 99,8          | 99,9        | 0,06                    |
| ctc:karisim+spleeter  | 12    | 0,06            | 0,04          | 99,1            | 99,1          | 0,06        | 0,04           | 99,6          | 99,8        | 0,06                    |
| esit                  | 12    | 7,89            | 7,18          | 0,5             | 0,5           | 7,04        | 6,49           | 0,7           | 4,2         | 7,95                    |
| vad                   | 12    | 1,83            | 0,66          | 36,0            | 56,8          | 1,00        | 0,43           | 36,3          | 77,0        | 1,81                    |
| whisper:base:spleeter | 12    | 2,98            | 0,81          | 12,2            | 69,4          | 2,62        | 0,28           | 53,5          | 84,0        | 3,05                    |

Jamendo son sınama, dil başına (`dil.py`):

| Yöntem               | Dil | Şarkı | Kelime ≤0,3 sn % | Kelime ortanca | Satır ≤0,3 sn % | Satır ort. | Satır ortalaması > 1 sn olan şarkılar                                                   |
| -------------------- | --- | ----- | ---------------- | -------------- | --------------- | ---------- | --------------------------------------------------------------------------------------- |
| ctc:karisim          | de  | 10    | 98,6             | 0,024          | 97,5            | 0,07       | —                                                                                       |
| ctc:karisim          | en  | 10    | 86,0             | 0,051          | 82,6            | 4,03       | Avercage – Embers (28,9), Pure Mids – The Leader (13,2), Color Out – Falling Star (1,8) |
| ctc:karisim          | es  | 10    | 99,0             | 0,029          | 98,6            | 0,10       | Fantasma – Los Rombos (1,4)                                                             |
| ctc:karisim          | fr  | 9     | 92,3             | 0,036          | 91,8            | 0,41       | Christmas avec toi (1,5)                                                                |
| ctc:karisim+spleeter | en  | 10    | 89,1             | 0,049          | 86,3            | 4,51       | Embers (37,6), The Leader (5,2), Falling Star (1,7)                                     |

Şarkı düzeyinde (Jamendo, `ctc:karisim`): satır ortalaması 0,3 sn'nin altında olan şarkı geliştirmede 15/20,
doğrulamada 18/20, son sınamada **29/39**; 1 sn'nin üstünde 4/20, 1/20, 5/39. Şarkı başına satır ortalamasının
ortancası 0,06 / 0,04 / 0,06 sn. Yani çoğu şarkı neredeyse kusursuz, birkaç şarkı ise bölüm bölüm kayıyor.

En kötü iki şarkının teşhisi (son sınamadan sonra, yöntem değiştirilmeden): **Embers** (rock; vokal gitarların
altında) — model karışımda sözlerin neredeyse hiçbir harfini duymuyor (serbest tanıma 4 dk boyunca birkaç harf),
hizalama körlemesine; Spleeter'lı birleşim de kurtarmıyor. **The Leader** — sözlerin bir kısmı "aw ah aw" gibi sözsüz
heceler, model bunları duymuyor; bölüm 20–40 sn kayıyor. Bu iki tür (vokalin gömüldüğü yoğun miks, sözsüz hece) asıl
zayıflık.

Seçim son sınamadan önce yapılmıştı (`kod-dondurma-md5.txt`); son sınama seçimi doğruluyor: `ctc:karisim` ile
`ctc:karisim+spleeter` aynı düzeyde (birleşim Jamendo'da kelime ≤0,3 sn'de +0,8 puan; makam ve vekilde fark yok),
Whisper base ve model gerektirmeyen yollar çok geride.

### 4.5 Güven ölçüsü

Satır güveni: satırın kareleri boyunca "yolun harfinin log-olasılığı − karenin en iyi log-olasılığı" ortalaması
(0 = model hizalamayla aynı fikirde). Eşik geliştirmede bakıldı (−0,5), doğrulama ve son sınamada denendi
(`guven.py`):

| Bölüm (Jamendo, ctc:karisim) | İşaretlenen satır | İşaretlilerde > 1 sn hata | İşaretsizlerde > 1 sn hata | Büyük hatalardan yakalanan |
| ---------------------------- | ----------------- | ------------------------- | -------------------------- | -------------------------- |
| geliştirme                   | %28,5             | %11,7                     | %2,8                       | 28/45                      |
| doğrulama                    | %13,2             | %2,7                      | %1,0                       | 3/10                       |
| son sınama                   | %17,5             | %20,1                     | %2,8                       | 60/100                     |

Ölçü bir şey söylüyor ama güvenilir değil: işaretlenen satırların çoğu aslında doğru, doğrulamada büyük hataların
çoğu kaçtı. Şarkı düzeyinde "model sözlerin ne kadarını duyuyor" oranı (serbest çözümdeki harf sayısı / sözdeki harf
sayısı; `duyulan.py`) da ayırt etmiyor: oranı 0,08 olan şarkı kusursuz, 0,04 olan (Embers) çöküyor. **Sonuç:**
güvensiz sonucu otomatik gizlemek için henüz dayanak yok; ürün kullanıcı düzeltmesine dayanmalı (bölüm 8, 9).

## 5. Hız, bellek, boyut

Bu makine: 4 çekirdek Intel Xeon (sanal), ekran kartı yok, Linux. Şarkı: 240 sn (Jamendo, "The One"). Her aşama
ayrı süreçte, önbelleksiz (`hiz.py` + `bellek.py`). Tepe bellek Python + kütüphaneleri dahil (yalnızca içe aktarma
~150 MB; model yüklü oturum ~600 MB).

| Aşama                                                            | İş parçacığı      | Süre (sn)          | Süre / ses  | Tepe bellek (MB) |
| ---------------------------------------------------------------- | ----------------- | ------------------ | ----------- | ---------------- |
| Omnilingual CTC, 30 sn pencere (ONNX Runtime 1.31, int8)         | 4                 | 30,9               | 0,129       | 1849             |
| aynı                                                             | 2                 | 58,8               | 0,245       | 1736             |
| aynı                                                             | 1                 | 116,8              | 0,487       | 1756             |
| Omnilingual CTC, 15 sn pencere                                   | 4                 | 27,2               | 0,113       | 1334             |
| CTC Viterbi (sözler, 4 dk ≈ 2000 harf × 12 000 kare; numba)      | 1                 | 0,14               | 0,0006      | —                |
| Spleeter 2 kanal (sherpa-onnx, fp16)                             | 4                 | 10,7               | 0,045       | **5269**         |
| UVR MDX-Net Voc_FT (sherpa-onnx)                                 | 4                 | ~73 (183 sn şarkı) | 0,40        | ölçülmedi        |
| Whisper base (kodlayıcı + bir kod çözücü geçişi / pencere + DTW) | 4                 | 27,4               | 0,114       | 1402             |
| Omnilingual, **tract 0.23.9 (saf Rust)**, tek 30 sn pencere      | tract varsayılanı | 17,0 (30 sn ses)   | 0,57        | 1091             |
| Omnilingual, ONNX Runtime, aynı tek 30 sn pencere                | 1 / 4             | 10,1 / 2,6         | 0,34 / 0,09 | 1234 / 1230      |

`tract` (Sonos; MIT/Apache-2.0) aynı int8 ONNX'i çalıştırdı (girişi sabit 1×480 000 yapıp grafikteki şekil notlarını
silmek gerekti): karelerin %98,7'sinde en olası harf ONNX Runtime ile aynı, serbest tanıma metni neredeyse aynı.
İlk ölçüm başka işler çalışırken yapılmıştı; temiz işlemcide yeniden ölçüldü: aynı 30 sn pencere **tract 17,0 sn**, ONNX Runtime 1 iş parçacığı 10,1 sn, 4 iş parçacığı 2,6 sn. Yani tract tek iş parçacıklı ONNX Runtime'dan ~1,7 kat yavaş; 4 dk şarkı tract ile ~3,4 dk (12 pencere x 17 sn).

Boyut: Omnilingual int8 ONNX 366 MB (xz -6: 280 MB; sherpa-onnx'in bz2 paketi 292 MB). Spleeter yalnızca vokal
modeli 19,7 MB (xz 17,6 MB). ONNX Runtime Windows DLL'i ayrıca (~10–20 MB; ölçülmedi); tract ikili dosyaya gömülür.
Windows'ta ölçülmedi: bu sayılar yalnızca bu makine içindir; tipik dört çekirdekli dizüstünde aynı mertebe beklenir.

## 6. Öneri ve gerekçe

**Önerilen yol: A — Omnilingual ASR CTC 300M v2 (int8) + Viterbi, karışımın kendisi üzerinde, 30 sn pencere.**

1. **Doğruluk:** her üç sette, her bölümde en iyi ya da en iyiye çok yakın (Spleeter'lı birleşim vekil geliştirmede
   ve Jamendo son sınamada biraz daha iyi, Jamendo doğrulamada biraz daha kötü); son sınamada da (4.4). Whisper
   base'den kelime ≤0,3 sn oranında ~38 puan iyi; model gerektirmeyen yoldan kat kat iyi.
2. **Türkçe:** gerçek Türkçe şarkıda (makam) öbek başlarının %93–100'ü 0,3 sn içinde. Model Türkçe harfleri
   (ç, ğ, ı, ö, ş, ü, â, î, û) doğrudan biliyor; Türkçe küçük harf kuralı (I→ı, İ→i) yeterli, sözlük ya da sesbirim
   dönüştürücü gerekmiyor (Whisper'ın alt-sözcük belirteçlerine ve MFA'nın sözlüğüne göre büyük kolaylık).
3. **Basitlik:** tek model, tek geçiş, sonra ~150 satırlık deterministik Viterbi (Rust'ta saf fonksiyon, birim testli).
   Vokal ayrıştırma gerekmiyor (5,3 GB bellek ve bir model daha yok).
4. **Lisans:** kod ve ağırlık Apache-2.0 (deny.toml'da izinli). Eğitim verisinin bir kısmı açıklanmamış (bkz. risk).
5. **Gerçek zaman kurallarına uyum:** iş tamamen arka planda, ses yolundan bağımsız; sonuç küçük (kelime başları).

Neden B (Whisper) değil: aynı hızda ama kelime başları bulanık; uzun ses için pencereye hangi sözün düştüğünü ayrıca
çözmek gerekiyor (burada EOT sıçramasıyla çözüldü ama satır başları ~0,5 sn kayıyor); makamda çöküyor. Daha büyük
Whisper (small/medium) daha iyi olabilir ama 3–10 kat yavaş ve büyük; ölçülmedi. Uzun ses için pencere yönetimi
benim uygulamam: olgun bir uygulama (ör. stable-ts'in `align`'ı) daha iyi sonuç verebilir; PyTorch ağırlıkları bu
ortamdan indirilemediği için denenemedi. Ama DTW'nin kelime içi bulanıklığı (ortanca ~0,19–0,23 sn, CTC'de ~0,03 sn)
yöntemin kendisinden geliyor.
Neden D (önce ayrıştırma) değil: ölçüme göre kazanç yok ya da küçük (Jamendo doğrulamada kayıp, vekil sette kazanç),
maliyet büyük. Ayrıştırma ileride başka işler için programa girerse "karışım + vokal" birleşimi ucuz bir ek iyileştirme
olarak yeniden ölçülebilir.
Neden E değil: satır başını bile bulamıyor (ortanca 0,4–4 sn).

## 7. Riskler

| Risk                                                                  | Etki                                                                                                                                       | Ölçüldü mü                                                                                     | Önlem                                                                                                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Türk pop/arabesk/rap ölçülmedi                                        | Gerçek başarı bilinmiyor                                                                                                                   | Hayır (set yok)                                                                                | Sahibinin 5–10 şarkısında dinleyerek doğrulama (DOGRULAMA'ya madde); sahibinin elinde zamanlı `.lrc`'li şarkı varsa doğru zaman olarak kullanılır            |
| Makam seti öbek düzeyinde, vekil set yapay                            | Türkçe kelime düzeyi ancak vekilde ölçüldü                                                                                                 | Kısmen                                                                                         | Yukarıdaki doğrulama; gerekirse sahibi birkaç şarkıda "doğru / yanlış satır" işaretler                                                                       |
| Eğitim verisinin açıklanmamış kısmı (Omnilingual; Whisper'da da aynı) | Proje kuralı "eğitim verisi NC ise alınmaz"; NC olduğu bilinmiyor, olmadığı da tam bilinmiyor                                              | Birincil kaynak: README "code and models … Apache 2.0", derlemleri CC-BY-4.0; makale okunamadı | Sahibine sorulacak (karar 3); meta'nın makalesi açık bir ağdan okunup not edilmeli                                                                           |
| Ağırlık dosyasının kaynağı                                            | sherpa-onnx'in dönüşümü; Meta'nın resmî `.pt` karmasıyla karşılaştırılamadı (dl.fbaipublicfiles kapalı; dönüşüm zaten baytları değiştirir) | İndirilen dosyanın SHA-256'sı kaydedildi (`model-sha256.txt`)                                  | Ürün için Meta'nın resmî kontrol noktasından sherpa-onnx'in açık betiğiyle (`scripts/omnilingual-asr/export-onnx.py`) kendimiz dönüştürüp karmayı sabitlemek |
| Model büyük (366 MB; kurulum ~+280 MB)                                | İndirme/kurulum boyutu                                                                                                                     | Evet                                                                                           | Karar 1 (ayrı paket / isteğe bağlı)                                                                                                                          |
| Yapıştırılan söz eksik ya da fazla                                    | Eksik 3 satır: ortalama 0,61 → 1,21 sn (ortanca aynı)                                                                                      | Evet (4.3)                                                                                     | Arayüzde "Nakarat ×2" gibi satırlar için uyarı; kullanıcı düzeltmesi                                                                                         |
| Söylenen ama sözlerde olmayan sesler ("oh oh", fon vokal, konuşma)    | Bölüm kayması (Jamendo son sınamada 39 şarkıdan 5'inde satır ortalaması > 1 sn; en kötüsü 28,9 sn: vokalin gömüldüğü rock)                 | Evet                                                                                           | Güven ölçüsü henüz zayıf (4.5); kullanıcı satır satır düzeltebilmeli                                                                                         |
| Güven ölçüsü zayıf                                                    | Hangi satırın yanlış olduğunu güvenle söyleyemiyoruz                                                                                       | Evet: geliştirmede büyük hataların 2/3'ü, doğrulamada 3/10'u yakalandı                         | Ürüne yalnızca şarkı düzeyinde bilgi ("otomatik zamanlandı") ile girer; satır gizleme yok; ayrı araştırma işi                                                |
| Rakamlar ve kısaltmalar ("2 kere", "Dr.")                             | Harfe çevrilmezse o kelime atlanır                                                                                                         | Hayır                                                                                          | Türkçe sayı okuma (küçük iş)                                                                                                                                 |
| Windows hızı ve belleği                                               | 1 iş parçacığında 4 dk şarkı ~2 dk, ~1,8 GB                                                                                                | Yalnızca Linux                                                                                 | Gerçek cihazda deneme (DOGRULAMA); 15 sn pencere ~1,3 GB (biraz daha az doğru)                                                                               |
| Saf Rust yolu yavaş                                                   | tract tek iş parçacıklı ONNX Runtime'dan ~1,7 kat, 4 iş parçacıklıdan ~6,5 kat yavaş (4 dk şarkı ~3,4 dk)                                  | Evet (Linux, tek pencere)                                                                      | ONNX Runtime (`ort` crate, MIT/Apache; ORT MIT) seçeneği; derleme zamanında ikili indirir → CI ve kurulum için yerel kopya                                   |

## 8. Ürüne giriş planı

Model dosyası **depoya girmez** (ses gibi büyük ikili; VERITAS'taki ağırlık kuralı). Küçük PR'lar, her biri kendi
başına yeşil:

1. **PR 1 — Araştırma belgesi** (kod yok): bu raporun özü `docs/arastirma/sozler/hizalama.md`'ye, betikler
   `docs/arastirma/sozler/hizalama/` altına (ses ve model hariç); `docs/LISANSLAR.md` "Programa girmeyen araştırma
   dosyaları"na JamendoLyrics, makam seti, Piper sesleri, FluidR3; ACIK-KONULAR sırası güncellenir.
2. **PR 2 — Saf hizalayıcı** (`src-tauri/src/analysis/lyrics_align.rs`): girdi = kare × harf log-olasılık matrisi +
   satırlar; çıktı = kelime başları + satır güveni. Türkçe küçük harf, harf kümesi, boşluk simgesi, CTC Viterbi (geri
   izleme `u8`, 4 dk ≈ 50 MB; gerekirse kontrol noktalı). Testler: bilinen yollu yapay matrisler, tekrar eden harf,
   boş kelime (yalnızca noktalama), Türkçe İ/ı. Model yok, ağ yok, bağımlılık yok.
3. **PR 3 — Model çalıştırıcı** (`analysis/lyrics_model.rs`): ONNX çalıştırma (`ort` ya da `tract-onnx`; karar 4),
   30 sn pencere / 20 sn adım, pencere başına normalleştirme (ortalama 0, varyans 1), yalnızca ~60 harf sütunu
   saklanır. Ses `audio::decode` + `resample` ile 16 kHz mono; f64 → f32 dönüşümü yalnızca model girişinde. Model
   yolu: veri klasöründe `modeller/omnilingual-ctc-300m-v2-int8.onnx`; SHA-256 denetlenir; yoksa özellik kapalı.
   Apache-2.0 metni ve atıf `public/lisanslar/`'a ve `docs/LISANSLAR.md`'ye; model dışarıdan geldiği için güvenilmez
   dosya kuralları (boyut sınırı, karma, yalnızca bilinen giriş/çıkış adları).
   CI: model sherpa-onnx sürümünden (karmalı) önbellekle indirilir ve bir kısa sentetik deneme sesiyle (ffmpeg) test
   edilir; gerçek şarkı yok.
4. **PR 4 — Arka plan işi ve kayıt:** kullanıcı düz metin sözü kaydedince (ya da şarkının zamansız sözü varsa ve
   kullanıcı isterse) iş kuyruğa girer; `analysis/background.rs` deseni: çalan şarkı önce, düşük öncelik (1 iş
   parçacığı, zamanın yarısı bekleme), çökme koruması (`CrashGuard`). Sonuç, kullanıcının metnine dokunmadan ayrı
   bir LRC olarak `sozler/<özet>.otomatik.lrc` (kelime zamanlı "enhanced LRC") — müzik dosyasına dokunulmaz. Anahtar:
   dosya damgası + söz metninin özeti + hizalayıcı sürümü (metin değişince ya da yöntem değişince yeniden). Önbellek
   `analysis/cache.rs`'e girerse yeni bir parça sürümü (`lyrics_align`) olarak; yalnızca o parça yeniden hesaplanır.
   `LyricsSource` yeni değer: `Auto` ("otomatik zamanlandı"). Kaynak önceliği: kullanıcının zamanlı sözü > yan/gömülü
   zamanlı > otomatik > zamansız.
5. **PR 5 — Arayüz:** Söz panelinde "Sözleri otomatik zamanla" (ilerleme yüzdesi; iptal); bittiğinde sözler
   kayar; kaynak yazısı "otomatik zamanlandı". Düzeltme: mevcut şarkı başına kaydırma (Alt+←/→) + satır satır
   −/+ (açık konu 1'deki planla aynı) + LRC'yi elle düzenleme. "Nakarat ×2", "[Nakarat]" gibi satırlar için uyarı.
   Görünüşü önce sahibine gösterilir (önizleme videosu).
6. (İsteğe bağlı, sonra) Türkçe sayı okuma; ayrıştırma programa girerse "karışım + vokal" birleşimi yeniden ölçülür;
   güven ölçüsü araştırması.

Her PR'dan önce bağımsız inceleme (BILGI-BIRIKIMI §2); PR 2 ve 3 için inceleyen kendi karşı örneklerini üretir.

## 9. Proje sahibine sorulacak kararlar

1. **Model nasıl gelsin?** (366 MB dosya; sıkıştırılmış ~280 MB)
   - (a) Kurulum dosyasının içinde: herkes hemen kullanır, kurulum ~+280 MB büyür, söz kullanmayan da indirir.
   - (b) **Ayrı "Söz paketi" dosyası** (aynı GitHub sürümünde, ayrı indirme): kullanıcı indirir, Lyraska'da
     "Dosyadan ekle…" ile seçer (ya da çift tıklar); program internete hiç bağlanmaz, ağ kodu eklenmez.
   - (c) Programın içinden isteğe bağlı indirme düğmesi ("Söz zamanlama modelini indir, 280 MB"): en kolay, ama
     programa ilk kez ağ kodu girer (telemetri yok, yalnızca kullanıcı basınca). "İnternete bağlanmak zorunda değil"
     ilkesi korunur ama "hiç bağlanmaz" değişir.
   - **Öneri: (b)** — ilke aynen kalır, kurulum küçük kalır; ikinci adım olarak (c) ancak sahibi isterse.
2. **Vokal ayrıştırma bu işe girsin mi?** Öneri: **hayır** (ölçüme göre gerek yok; 5,3 GB bellek).
3. **Eğitim verisi tam açıklanmamış modeller** (Omnilingual; Whisper da öyle): ağırlık lisansı Apache-2.0/MIT ve
   NC olduğu bilinmiyorsa kabul mü? Öneri: **kabul**, şartıyla: Meta'nın makalesindeki veri listesi açık bir ağdan
   okunup `docs/LISANSLAR.md`'ye yazılır; NC bir derlem bulunursa vazgeçilir.
4. **Çalıştırıcı:** (a) ONNX Runtime (`ort`; hızlı, Windows DLL'i ~10–20 MB, C++ bağımlılığı) ya da (b) `tract`
   (saf Rust: C++ kütüphanesi ve ayrı DLL yok, crates.io'dan derlenir; daha yavaş). Öneri: **önce (b) tract ile Windows'ta hız ölçülsün**; 4 dk şarkı
   arka planda 5 dk'nın altındaysa tract, değilse ort.
5. **Güvensiz sonuç nasıl gösterilsin?** Öneri: satır gizlenmez; şarkı "otomatik zamanlandı (yanlış satırı
   kaydırarak düzeltebilirsiniz)" yazar; kullanıcı düzeltince otomatik sonuç kullanıcının sözü olur.

## 10. Yeniden çalıştırma

Her şey geçici klasörde: `KOK = /tmp/claude-0/-home-user-Lyraska/4262c203-a61e-5ac0-b0bb-3cada8e7b304/scratchpad/soz-hizalama`.

- `betikler/hepsini_calistir.sh`: veri setlerini (git clone), modelleri (sherpa-onnx sürüm dosyaları, karma
  denetimiyle), Python ortamlarını kurar; vekil seti üretir; bütün ölçümleri çalıştırır; tabloları yazar.
- Tek tek: `venv/bin/python betikler/olc.py <jamendo|makam|vekil> <gelistirme|dogrulama|son_sinama> <yöntem…>`;
  `bozuk.py`, `guven.py <sonuç.json>`, `hiz.py` (+ `bellek.py`), `tablo.py`.
- Kod: `ortak.py` (veri, bölme, ölçüt), `ctc.py` (Omnilingual + Viterbi), `whisper_hiza.py` (Whisper DTW),
  `ayrim.py` (Spleeter/UVR), `vekil_uret.py` (vekil set; ayrı ortam `venv-tts`: sherpa-onnx 2.x Piper'ın espeak
  önişlemesini içermiyor, 1.12.40 kullanıldı).
- Sonuçlar: `cache/sonuc/*.json` (şarkı başına hatalar, tahminler, güven); günlükler `cache/log_*.txt`;
  hız `cache/hiz.txt`; model karmaları `model-sha256.txt`; kod dondurma `kod-dondurma-md5.txt` (son sınamadan önce;
  `olc.py`'ye sonradan yalnızca 15 sn pencere değişkesi eklendi, varsayılan yol aynı — md5 bu yüzden farklı).
- Saf Rust denemesi: `tract/deneme/` (kaynak; `CARGO_TARGET_DIR=../target cargo build --release`), derlenmiş
  `tract/tract-deneme`, model `tract/omni-sabit30.onnx` (`betikler/tract_hazirla.py` ile yeniden üretilir; disk için silindi).
  Karşılaştırma: `tract/tract-deneme tract/omni-sabit30.onnx cache/t30.f32` (HILA – Give Me the Same, 18–48 sn).
- Küçük sınamalar: `viterbi_sina.py` (doğru yolu bilinen yapay matris: tekrar eden harf, Türkçe ı/İ), `dil.py`
  (dil başına özet), `duyulan.py` (şarkı düzeyinde "duyulan harf" oranı).
- Disk için silinenler (ölçümde kullanılmadı ya da yeniden üretilebilir): makam setinin yeniden sentezlenmiş kopyası,
  Whisper tiny, Whisper base int8 dosyaları, UVR çıktısı, tract derleme klasörü.
- Belirlenimcilik: geliştirmede `ctc:karisim` iki kez çalıştı, sonuç aynı.
- Ölçüm sırasında yapılan ve rapora girmeyen: UVR yalnızca bir şarkıda hız için denendi (lisans belirsiz).
