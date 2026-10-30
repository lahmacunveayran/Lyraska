# Söz hizalama: bağımsız denetim (30 Ekim 2026)

Denetlenen: birinci ekibin `soz-hizalama/RAPOR.md` önerisi (Omnilingual ASR CTC 300M v2, sherpa-onnx int8, düz CTC
Viterbi, karışımın kendisi, 30 sn pencere). Denetim planı rapor okunmadan önce yazıldı (`00-PLAN.md`). Birinci ekibin
dosyalarına dokunulmadı. Bütün betikler `betikler/`, ham sonuçlar `sonuc/`, günlükler `*.log` altında. Depoda hiçbir
dosya değişmedi, hiçbir ses ya da model depoya girmedi.

## 0. Kısa hüküm

**Ana öneri doğru: CTC zorlanmış hizalama + Omnilingual CTC 300M v2 seçilmeli.** Sayılar bağımsız kodla birebir
yeniden üretildi, model ile lisans birincil kaynaktan doğrulandı. Ama rapor ürüne olduğundan **daha hazır**
görünüyor. Ayrıca bir iddia **çürütüldü**: hatalı satırlar güvenle yakalanabiliyor.

1. **Türkçe sonuç iyimser.** "%97,9" sayısı, makam kayıtlarının yalnızca işaretli bölümleri art arda eklenerek
   bulundu: enstrümantal ve işaretsiz kısımlar sesten çıkarılmıştı. Tam kayıtta (7 kayıt) satırların %94,5'i
   0,3 sn içinde kalıyor. Bir kayıtta (Münir Nurettin, eski kayıt) satırların %24'ü 28–62 sn kayıyor. Vekil set
   (%99,8) gerçeği temsil etmiyor: benim zorlaştırmalarımın hiçbirinde bozulmadı.
2. **Asıl risk ses değil, yapıştırılan metin.** Web'den gelen sözlerde nakaratın bir kez yazılıp "[Nakarat]"
   ile geçilmesi gerçek makam şarkılarında doğruluğu **%97,9'dan %43,5'e** düşürüyor. Yarım yapıştırılan söz,
   Jamendo'da %93'ten %81'e, Türkçe vekilde %73'e iniyor. Birinci ekip yalnızca "ortadan 3 satır silme"yi
   denemişti.
3. **Çözüm, ölçümle:** (a) Metin ön işleme: başlıkları atma, `(x2)`'yi açma, "[Nakarat]"ı ilk nakaratla
   doldurma, rakamları yazıya çevirme. Makamda nakarat durumu %43,5'ten %83,9'a, vekilde %92,9'dan %100'e
   çıktı. (b) Satır atlamalı Viterbi: eklenen çeviri satırlarında Jamendo %87,7'den %92,1'e, makam %88,3'ten
   %97,9'a çıktı.
4. **Güven ölçüsü (çürütüldü):** ileri-geri (forward-backward) hesabından satır başının sonsal dağılımı
   kullanıldı. Büyük hatayı (> 1 sn) son sınamada AUROC **0,97** ile ayırıyor; birinci ekibin ölçüsü 0,80. Eşik
   yalnızca geliştirme ve doğrulamada seçildi. Son sınamada satırların %6'sını işaretliyor ve büyük hataların
   83/101'ini yakalıyor. İşaretsiz satırların yalnızca %0,9'u 1 sn'den fazla hatalı. Birinci ekibin ölçüsü
   %17,5 işaretleyip 60/100 yakalıyordu. Yanlış şarkının sözü de şarkı düzeyinde ayırt ediliyor (20 denemede 19).
5. **Ürün:** bellek sorunu sanıldığı kadar büyük değil. ONNX Runtime'ın bellek havuzu (arena) kapatılınca tek iş
   parçacığında tepe 961 MB (30 sn pencere), 10 sn pencerede 698 MB. Bu ölçümlere Python dahil; birinci ekip
   ~1,8 GB demişti. tract'ın hızı doğrulandı: 30 sn pencere 16,4 sn sürüyor (ORT tek iş parçacığında 9,7–11,2 sn).
   `ort` crate'inin kararlı 2.x sürümü yok (yalnızca 2.0.0-rc.15), varsayılan derlemesi de ikili dosyayı
   üçüncü taraf bir CDN'den indiriyor.

**Nihai öneri:** birinci ekibin yolu, şu değişikliklerle:

- metin ön işleme;
- satır atlamalı Viterbi;
- ileri-geri güven ölçüsü: düşük güvenli satır ekranda soluk ya da "tahmini" görünür, kötü şarkı kullanıcıya
  söylenir;
- model çıktısını (harf olasılıkları, şarkı başına ~1 MB) saklamak: sözler düzeltilince yeniden hizalama
  saniyenin altında biter, model yeniden çalışmaz;
- çalıştırıcı önce tract, düşük öncelikte.

Kararlar ve PR planı 10–11. bölümde.

## 1. İddia iddia hüküm

| #   | Birinci ekibin iddiası                                          | Hüküm                                             | Kanıt (bu denetim)                                                                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Omnilingual kod ve ağırlık Apache-2.0                           | **Doğrulandı**                                    | GitHub `facebookresearch/omnilingual-asr` (commit 81f51e2, 30 Ara 2025): `LICENSE` Apache-2.0; README: "Omnilingual ASR code and models are released under the Apache 2.0". Not: bazı kaynak dosya başlıkları "BSD-style"/"MIT" diyor (kopyala-yapıştır başlıklar); dağıtılan ağırlık için belirleyici olan LICENSE + README.                                              |
| 2   | Türkçe: 1126 saat, CER 2,1                                      | **Kısmen**                                        | Sayılar `per_language_results_table_7B_llm_asr.csv`'de var ama **7B LLM-ASR** modeline ait; önerilen 300M CTC'nin Türkçe CER'i yayımlanmış değil (bilinmiyor).                                                                                                                                                                                                             |
| 3   | Eğitim verisi: kendi derlemleri CC-BY-4.0 + açıklanmamış kısım  | **Doğrulanamadı**                                 | README yalnızca CC-BY-4.0 derlemini anıyor; tam veri listesi makalede (arxiv kapalı). Depoda veri kartı yok.                                                                                                                                                                                                                                                               |
| 4   | sherpa-onnx int8 dönüşümü                                       | **Doğrulandı**                                    | `scripts/omnilingual-asr/export-onnx.py` (sherpa-onnx 935e5de, Apache-2.0): `torch.onnx.export` + `quantize_dynamic` (yalnızca MatMul, QUInt8, **kalibrasyon verisi yok**). Paketteki LICENSE Meta'nınkiyle bayt bayt aynı (md5 e46a4dcc…). SHA-256 e3042b2f… birinci ekibin kaydıyla aynı. Apache-2.0 §4(b): değiştirilmiş dosya bildirimi gerekir ("int8'e nicemlendi"). |
| 5   | Harf düzeyinde çıktı                                            | **Doğrulandı**                                    | `tokens.txt` 10 288 belirteç, neredeyse hepsi tek karakter.                                                                                                                                                                                                                                                                                                                |
| 6   | Jamendo son sınama: kelime %94,1, ortanca 0,032 sn, satır %93,0 | **Doğrulandı (birebir)**                          | Kendi Viterbi'm (`hiza.py`, ayrı yazıldı) + JamendoLyrics'in **resmî** `annotations/lines` dosyaları: satır 1704, %93,02, kelime 10 493, %94,13, ortanca 0,0323; 39 şarkının hepsinde şarkı ortalaması 3. ondalığa kadar aynı.                                                                                                                                             |
| 7   | Önbellekteki emisyonlar modelin çıktısı                         | **Doğrulandı**                                    | HILA'nın ilk penceresini modelde yeniden çalıştırdım: en olası sınıf karelerin %100'ünde aynı (ortalama fark 0,004, fp16 yuvarlaması).                                                                                                                                                                                                                                     |
| 8   | Son sınama bir kez, kod dondurulduktan sonra                    | **Kısmen**                                        | Zaman damgaları tutarlı: dondurma 15:38, son sınama emisyonları 16:25–17:24 arasında üretilmiş, `ctc.py`/`ortak.py` md5'i dondurmayla aynı. `olc.py` sonradan değişmiş (açıkça yazılmış). "Bir kez" kanıtlanamaz, ama aksine bir iz de yok.                                                                                                                                |
| 9   | Gerçek Türkçe şarkı (makam) %97,9                               | **Kısmen (iyimser)**                              | Ses = işaretli bölümlerin **art arda eklenmesi** (`ortak.makam_songs`, `segments`): kaydın %25–48'i (enstrümantal giriş/ara ve işaretsiz sözlü kısımlar) atılmış. Tam kayıtta 7 kayıt: %94,5 (art arda: %98,7); Gel Güzelim %76,3, ortalama 10,4 sn (2. bölüm).                                                                                                            |
| 10  | Türkçe vekil %99,8                                              | **Kısmen (temsil etmiyor)**                       | Her kelime ayrı sentezlenip araya boşlukla konuyor (kelime sınırı keskin), eşlik MIDI; 50 satırlık aynı havuz ve aynı iki ses bütün bölümlerde. Karşı örneklerimde (60 sn giriş, 40 sn ara, 1,6× hız, 0,6× yavaş) %98,7–100: zorlanmıyor. Ürün kararına dayanak olmamalı.                                                                                                  |
| 11  | Vokal ayrıştırma gerekmez                                       | **Doğrulandı**                                    | Vokali eşliğin altına −12 dB gömünce bile 4 şarkıda satır %97,9 (orijinal %99,3). Ama "5,3 GB" bellek Spleeter'ın yöntemi değil, sherpa-onnx'in bütün şarkıyı tek parçada işlemesi; parça parça çalıştırılabilir (küçük not).                                                                                                                                              |
| 12  | Hız: 4 dk 31 sn (4 iş p.), 117 sn (1 iş p.)                     | **Doğrulandı**                                    | 30 sn pencere: 2,46 sn (4 iş p.) / 9,69 sn (1 iş p.); 4 dk = 12 pencere → ~30 / ~116 sn.                                                                                                                                                                                                                                                                                   |
| 13  | Tepe bellek ~1,8 GB                                             | **Kısmen**                                        | Python süreci + ORT bellek havuzu dahil. Havuz kapalı, 1 iş p.: 30 sn pencere 961 MB, 15 sn 838 MB, 10 sn 698 MB, 5 sn 614 MB (Python ~44 MB dahil); model yüklenince ~530 MB.                                                                                                                                                                                             |
| 14  | tract ~1,7× yavaş, 4 dk ~3,4 dk                                 | **Doğrulandı**                                    | 30 sn pencere tract 16,4 sn (tek çekirdek), yükleme 4,7 sn, tepe 1075 MB. 4 dk ≈ 12×16,4 = 3,3 dk. ORT'a oran 1,5× (havuz kapalı) – 1,7× (açık).                                                                                                                                                                                                                           |
| 15  | Güven ölçüsü hatalı satırı güvenle yakalayamıyor                | **Çürütüldü**                                     | Bölüm 5. İleri-geri sonsalı: AUROC 0,97 (birincinin ölçüsü 0,80); eşik geliştirmede seçildi, son sınamada işaretli %6,0, yakalanan 83/101, işaretsizde > 1 sn %0,9.                                                                                                                                                                                                        |
| 16  | Eksik söz: ortalama ikiye katlanır, ortanca aynı                | **Doğrulandı, ama eksik**                         | Gerçekçi bozmalar çok daha zararlı (bölüm 4.2): "[Nakarat]" makamda %43,5; yarım söz %73–82.                                                                                                                                                                                                                                                                               |
| 17  | Joker (satır arası) etkisiz                                     | **Yeniden ölçülmedi; farklı tasarım işe yarıyor** | Benim "satır atlama"m (söylenmeyen satırı atlar; ceza = 6 nat/harf + 40, yalnızca geliştirmede seçildi) eklenen çeviri satırlarında büyük kazanç veriyor; birebir sözde ≤0,3 sn oranı aynı (%93,0) ama Jamendo ortalaması 1,09 → 1,33 sn (kayan şarkılarda biraz daha kayıyor).                                                                                            |
| 18  | JamendoLyrics yalnızca ölçüm için                               | **Doğrulandı**                                    | Kod/işaretler MIT; ses ve sözler şarkı başına CC (BY-NC-ND, BY-NC-SA, BY-ND …; CSV `LicenseType`). Yerel, dağıtılmayan ölçüm NC/ND ile uyumlu. Not: GitHub sürümü "DEPRECATED"; düzeltilmiş işaretler yalnızca Hugging Face'te (erişilemedi).                                                                                                                              |
| 19  | Makam seti "CC BY-NC-ND (CompMusic)"                            | **Çürütüldü / doğrulanamadı**                     | `georgid/turkish-makam-lyrics-2-audio-test-data`'da **lisans dosyası yok** (readme.txt'te de yok): varsayılan "tüm hakları saklı". Sesler ticari kayıtlar (Münir Nurettin Selçuk, Hamiyet Yüceses…). Yerel, dağıtılmayan ölçüm savunulabilir; ama `docs/LISANSLAR.md`'ye "CC BY-NC-ND" diye yazılmamalı.                                                                   |
| 20  | Vekil seti üretmek için Piper sesleri                           | **Eksik bilgi**                                   | `tr_TR-dfki` veri seti **CC BY-NC-SA 4.0** (MODEL_CARD); `fahrettin` CC0; ikisi de lessac sesinden ince ayarlı. Yalnızca ölçüm için sorun değil; LISANSLAR'da NC olarak yazılmalı.                                                                                                                                                                                         |
| 21  | ORT Windows DLL ~10–20 MB                                       | **Doğrulandı**                                    | onnxruntime 1.31.1 win_amd64: `onnxruntime.dll` 18,4 MB + `ThirdPartyNotices.txt` 336 KB (taradım: GPL/AGPL/NC bileşeni yok; "non-commercial" geçen 3 yer kamu malı bildirimleri). Lisans MIT.                                                                                                                                                                             |
| 22  | `ort` crate MIT/Apache; derlemede ikili indirir                 | **Doğrulandı + risk**                             | crates.io: `ort` ve `ort-sys` yalnızca **2.0.0-rc.15** (kararlı yok). `download-binaries` `cdn.pyke.io`'dan (Microsoft değil, pyke'nin derlemesi; SHA-256 ile) indiriyor; bu ortamda o adres kapalı. `cargo deny sources` bunu görmez.                                                                                                                                     |
| 23  | Rakamlar harfe çevrilmezse kelime atlanır                       | **Doğrulandı**                                    | Türkçe vekilde "bir/iki/üç…" rakamla yazılınca %99,5 → %95,7; ön işlemeyle %99,5. İngilizce Jamendo'da etkisiz.                                                                                                                                                                                                                                                            |
| 24  | Türkçe küçük harf kuralı yeterli                                | **Doğrulandı (ve dil seçimi gereksiz)**           | İngilizce/Almanca… şarkılar Türkçe kuralıyla (I→ı) hizalanınca sonuç aynı (%93,0); Türkçe sözler BÜYÜK HARF + İngilizce kuralla aynı (%99,5). Programın şarkının dilini bilmesi gerekmiyor.                                                                                                                                                                                |
| 25  | Kelime başı = ilk harfin ilk karesi                             | **Doğrulandı**                                    | İlk harf kelimenin geri kalanından > 0,4 sn kopuk olan kelime %1,1; "düzeltmek" sonucu kötüleştiriyor (%94,17 → %93,72): kopukluk gerçek (uzayan ünsüz/nota).                                                                                                                                                                                                              |

## 2. Lisans özeti (birincil kaynak)

| Bileşen                               | Lisans                  | Ürüne girer mi                                  | Not                                                                                                                                               |
| ------------------------------------- | ----------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Omnilingual CTC 300M v2 ağırlıkları   | Apache-2.0 (Meta)       | Evet (model)                                    | Eğitim verisinin tam listesi doğrulanamadı (makale). Ağırlık lisansını hak sahibi veriyor; proje kuralı açısından karar sahibinin (bölüm 11, K3). |
| sherpa-onnx dönüşüm betiği            | Apache-2.0              | Hayır (kendimiz dönüştürürsek betik kullanılır) | Dönüşüm mekanik, veri yok.                                                                                                                        |
| tract-onnx 0.23.9                     | MIT OR Apache-2.0       | Evet (seçilirse)                                | Saf Rust, DLL yok, deny.toml'da izinli.                                                                                                           |
| ort 2.0.0-rc.15 / ONNX Runtime 1.31   | MIT OR Apache-2.0 / MIT | Evet (seçilirse)                                | Sürüm adayı; DLL 18,4 MB + üçüncü taraf bildirimi.                                                                                                |
| JamendoLyrics, makam seti, Piper dfki | NC/ND, lisanssız, NC    | **Hayır**                                       | Yalnızca geçici klasörde ölçüm; depoya ve LISANSLAR'a "programa girmeyen araştırma dosyası" olarak, gerçek lisanslarıyla.                         |
| FluidR3_GM                            | MIT                     | Hayır                                           | —                                                                                                                                                 |

Veri sızıntısı: Omnilingual'ın CTC modelleri etiketli **konuşma** ile eğitildi. JamendoLyrics ya da makam
kayıtlarının eğitimde olduğuna dair bir iz bulamadım. Depoda müzik ya da şarkı verisi geçmiyor
(`grep jamendo|musdb|singing|lyrics`: yalnızca kod). Ama veri listesi açıklanmadığından **doğrulanamadı**. Öz
denetim kendi karşı örnekleriyle sızıntıdan etkilenmeyen ek kanıt üretti (bölüm 4).

## 3. Ölçümün geçerliliği

- **Ölçüt hesabı doğru:** 39 şarkı bağımsız kodla birebir. JamendoLyrics'in satır başı tanımı (bir sonraki
  satırın ilk kelimesi) resmî `lines` dosyasıyla aynı.
- **Bölme temiz:** Jamendo dil başına ad özetiyle 5/5/kalan, makam 3/3/4. Yöntem seçimi az değişkeli (kaynak,
  pencere), aşırı uyum riski küçük.
- **Temsil sorunu (önemli):** gerçek Türkçe sözlü kanıt 10 makam kaydı. Bunlar yavaş, sazlı, tek sesli; pop,
  arabesk ve rap yok. Jamendo'da Hip-Hop 9 şarkıda satır %97,1 (rap sorun değil). Rock 16 şarkıda %89,4 ve
  4 şarkı kayıyor: yoğun miks zayıf nokta. Bütün Jamendo'da (79) 10 şarkının (%13) bir bölümü 1 sn'den fazla
  kayıyor. **Ürün dilinde: kabaca her 8 şarkıdan birinde bir bölüm yanlış**; güven ölçüsü bunların çoğunu
  işaretliyor.
- Makam ve Jamendo'nun sözleri **söylenen sırayla, tekrarları dahil** veriliyor. Kullanıcının yapıştırdığı söz
  böyle olmaz (bölüm 4.2). Raporun ana sayıları bu yüzden "sözler kusursuz" durumunun sayıları.

## 4. Karşı örnekler

### 4.1 Ses tarafı (model yeniden çalıştırıldı; `deney_ses.py`, `deney_ses2.py`)

| Durum                                                | Set     | Satır ≤0,3 sn | Satır ort. (sn) | Not                                                                                                                                                      |
| ---------------------------------------------------- | ------- | ------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Makam, bölümler art arda (birincinin koşulu)         | 7 kayıt | 98,7          | 0,08            |                                                                                                                                                          |
| **Makam, tam kayıt**                                 | 7 kayıt | **94,5**      | **1,79**        | Gel Güzelim %76,3 / 10,4 sn: 101–173 sn modelin duymadığı bölüm + eski kayıt; son 9 öbek 28–62 sn kaydı. Güven ölçüsü 10 büyük hatanın 8'ini işaretledi. |
| Vekil + 60 sn enstrümantal giriş                     | 4       | 100           | 0,05            | Vekil zorlanmıyor                                                                                                                                        |
| Vekil + 40 sn enstrümantal ara                       | 4       | 100           | 0,05            |                                                                                                                                                          |
| Vekil 1,6× hızlı (rap benzeri)                       | 4       | 100           | 0,03            |                                                                                                                                                          |
| Vekil 0,6× yavaş (uzayan hece)                       | 4       | 98,7          | 0,09            |                                                                                                                                                          |
| Jamendo orijinal                                     | 4       | 99,3          | 0,04            | HILA, Keine Lust, Esencia, Drei Nüsse                                                                                                                    |
| Vokal eşliğin altına −6 dB                           | 4       | 98,6          | 0,04            | Gömülü vokale dayanıklı                                                                                                                                  |
| Vokal −12 dB                                         | 4       | 97,9          | 0,05            |                                                                                                                                                          |
| Geri vokal (aynı vokal 1 sn gecikmeli, −3 dB)        | 4       | 91,6          | 0,38            | Düet/yankı: −8 puan                                                                                                                                      |
| Geri vokal 2,5 sn gecikmeli                          | 4       | 92,0          | 0,26            | HILA %75,9                                                                                                                                               |
| Başka şarkının vokalli 30 sn'si başa (skeç, konuşma) | 4       | 95,8          | 1,25            | İlk satırlar yabancı vokale çekiliyor                                                                                                                    |
| Şarkının kendi eşliğinden 40 sn ara (solo)           | 4       | 98,3          | 0,14            |                                                                                                                                                          |

Sonuç: model müziğe ve gömülü vokale çok dayanıklı, hız ve uzayan hece sorun değil. Zayıflık şu: **modelin
duymadığı uzun bölüm + ayrı vokal kaynakları (geri vokal, yabancı vokal)**. Bunlar bölüm bölüm kaymaya yol açıyor.

### 4.2 Metin tarafı (önbellekteki emisyonlar; son sınama; `deney_metin.py`)

Satır ≤0,3 sn %. "Tam" sütunu aynı şarkıların bozulmamış sonucu. Ön işleme ve satır atlama ayarları yalnızca
geliştirmede seçildi (`secim.txt`).

| Bozma                                       | Set (şarkı)             | Tam                | Taban (birinci ekip)   | + ön işleme | + satır atlama | ikisi    |
| ------------------------------------------- | ----------------------- | ------------------ | ---------------------- | ----------- | -------------- | -------- |
| Nakarat bir kez yazılmış, sonra "[Nakarat]" | Jamendo (33)            | 93,4               | 88,5                   | 90,8        | —              | **92,9** |
|                                             | **Makam (4)**           | 97,9               | **43,5**               | **83,9**    | 43,5           | 83,9     |
|                                             | Vekil (12)              | 99,5               | 92,9                   | 100         | —              | 100      |
| Ardışık tekrar "(x2)"                       | Jamendo (17)            | 93,8               | 92,4                   | **95,3**    | 91,9           | 94,9     |
| Bölüm başlıkları ([Kıta], Chorus:)          | Jamendo (39)            | 93,0               | 91,8                   | 93,0        | 91,4           | 93,0     |
|                                             | Makam (4)               | 97,9               | 93,8                   | 97,9        | 93,8           | 97,9     |
| Sona 6 satır çeviri/başka söz               | Jamendo (39)            | 93,0               | 87,7                   | 87,7        | **92,1**       | 92,1     |
|                                             | Makam (4)               | 97,9               | 88,3                   | 88,3        | **97,9**       | 97,9     |
|                                             | Vekil (12)              | 99,5               | 82,4                   | 82,4        | **95,0**       | 95,0     |
| Rakam ("bir" → "1")                         | Vekil (10)              | 99,5               | 95,7                   | **99,5**    | 95,7           | 99,5     |
| İki satırın yeri değişmiş                   | Jamendo / makam / vekil | 93,0 / 97,9 / 99,5 | 88,9 / 94,5 / 89,2     | aynı        | ~aynı          | ~aynı    |
| %10 satır rastgele eksik                    | Jamendo / makam / vekil | 93,0 / 97,9 / 99,5 | 87,9 / 86,0 / 87,2     | aynı        | aynı           | aynı     |
| Yalnızca ilk yarı yapıştırılmış             | Jamendo / makam / vekil | 93,0 / 97,9 / 99,5 | **81,2 / 77,8 / 73,0** | aynı        | aynı           | aynı     |
| Yanlış dil kuralı (I→ı) / BÜYÜK HARF        | Jamendo / vekil         | 93,0 / 99,5        | 93,0 / 99,5            | —           | —              | —        |

Dürüstlük notu: ön işlemenin ilk sürümünde hata vardı ("[Nakarat]" başlığını her zaman yer tutucu sanıp nakaratı
kopyalıyordu). Hata son sınamada görüldü (başlık durumunda Jamendo %68). Düzeltildi: yalnızca arkasından boş satır
ya da başlık gelirse yer tutucu sayılıyor. Nakarat bozması da web'deki gibi yer tutucudan sonra boş satırla
yeniden üretildi. Düzeltilmiş sürüm geliştirmede yeniden ölçüldü (Jamendo nakarat %88,7 → %93,9, makam %48,9 →
%86,7), sonra son sınamada. Yani ön işlemenin son sınaması temiz tek koşu **değil**: sayılar yön göstericidir.
Satır atlama cezası ise temiz (geliştirmede seçildi, son sınama bir kez).

Eksik, yer değişmiş ve yarım sözü hiçbir yöntem düzeltmiyor (eksik metin bilgisi yok). Bunlar güven ölçüsü ve
kullanıcı düzeltmesiyle ele alınmalı.

## 5. Güven ölçüsü (çözüldü)

Birinci ekibin ölçüsü "yolun harfinin log-olasılığı − karenin en iyisi" ortalamasıydı. Viterbi'nin bulduğu tek
yola bakıyor: model hiçbir şey duymadığında da blank her yerde ucuz olduğundan küçük kalıyor.

Benim ölçüm **ileri-geri (forward-backward)** hesabı, sıcaklık τ = 0,5 (`guven2.py`). Satırın her harfi için
"bu harfe Viterbi anının ±0,3 sn içinde girilme olasılığı" hesaplanıyor; satır güveni bu değerlerin ortancası.
Kendi yorumu açık: "sözün bu satırı başka bir yere de oturabilir mi?" Model satırı duymuyorsa olasılık geniş bir
alana yayılır ve güven sıfıra iner.

| Özellik                      | AUROC gel+dog | AUROC son sınama (Jamendo+makam+vekil) | Makam tam kayıt |
| ---------------------------- | ------------- | -------------------------------------- | --------------- |
| Birincinin `gap` ölçüsü      | 0,764         | 0,814                                  | 0,857           |
| **Sonsal (bu denetim)**      | **0,960**     | **0,971**                              | 0,911           |
| Satırın ilk harfinin sonsalı | 0,936         | 0,968                                  | **0,974**       |
| Duyulan harf oranı           | 0,884         | 0,918                                  | 0,894           |
| Hız sapması (harf/sn)        | 0,857         | 0,800                                  | 0,811           |

Eşik 0,225, geliştirme ve doğrulamada "büyük hataların %80'ini yakala" kuralıyla seçildi:

| Bölüm                                       | İşaretlenen satır | Yakalanan büyük hata | İşaretlilerde > 1 sn | İşaretsizlerde > 1 sn | İşaretsizlerde ≤0,3 sn |
| ------------------------------------------- | ----------------- | -------------------- | -------------------- | --------------------- | ---------------------- |
| Son sınama (bu ölçü)                        | **%6,0**          | **83/101**           | %66,9                | **%0,9**              | %98,3                  |
| Son sınama (birincinin ölçüsü, kendi eşiği) | %17,5             | 60/100               | %20,1                | %2,8                  | —                      |
| Makam tam kayıt                             | %5,0              | 8/10                 | %66,7                | %0,9                  | %97,8                  |

- **Şarkı düzeyi:** Embers'te satırların %93'ü, The Leader'da %65'i, Gel Güzelim'de %24'ü düşük güvenli.
  Düzgün şarkıların çoğunda %0–9.
- **Yanlış şarkının sözü:** 20 denemenin 19'unda satırların %50'den fazlası düşük güvenli. Doğru sözle 20
  denemenin 18'inde %20'nin altında; tek aykırı değer kayan şarkı Embers. Yani "bu sözler bu şarkıya ait
  görünmüyor" uyarısı mümkün.
- **Sınır:** metin bozuksa ölçü zayıflıyor (eksik %10: yakalanan 94/206, yarım söz 129/196, nakarat 65/149). Bu
  durumda yanlış yer de "kendinden emin" olabiliyor, çünkü tekrar eden nakaratın sözü başka bir nakarata oturuyor.
- **Maliyet:** 4 dk şarkıda numba ile ~2 sn. Üründe aynı numba dışı saf Rust'ta birkaç sn, bellek T×S float32
  (~200 MB). Bu, satır bazında ileri değerleri saklayan bir hesapla düşürülebilir.

## 6. Ürün uygunluğu

- **Hız, bu makine (4 çekirdek Xeon, sanal, Linux).** Çıkış her karede birden çok sınıf için hesaplandığından
  pencereler bindirmeli; etkin maliyet sesin 1,5 katı. 4 dk şarkı: ORT 4 iş parçacığında ~30 sn, ORT 1 iş
  parçacığında ~2 dk, tract ~3,3 dk. tract'ın gerçek zaman oranı ~0,55: **şarkı çalarken baştan başlarsa çalan
  yerin önünde gider.** Bu, "Otomatik zamanla" düğmesinden sonra sözlerin aynı dinleyişte çıkmaya başlamasına
  olanak verir; ucu serbest Viterbi ile aşamalı bir hizalama gerekir (isteğe bağlı iyileştirme). Düşük
  donanımlı Windows dizüstünde 2–3 kat yavaş beklenir: **Windows'ta doğrulanamadı**.
- **Bellek:** havuz kapalı ve 1 iş parçacığında 0,7–1 GB. 10–15 sn pencere ~700–840 MB. Birinci ekibin
  geliştirme ölçümüne göre doğruluk 15 sn'de biraz düşüyor; 15 sn pencerede 20 sn bağlam için bindirme
  artırılabilir (ölçülmedi). 8 GB'lık dizüstünde kabul edilebilir.
- **Ses takılması:** Lyraska'nın WASAPI iş parçacığı MMCSS "Pro Audio" önceliğinde (`output/wasapi.rs`). Halka
  tampon 2 sn (`RING_SECONDS`). Linux'ta benzetim (`cekisme.py`, 10 ms ses döngüsü, 60 kare/sn görüntü
  döngüsü):

  | Yük                                       | Görüntü p99 gecikme | Ses p99 gecikme | Ses > 5 ms gecikme |
  | ----------------------------------------- | ------------------- | --------------- | ------------------ |
  | Yük yok                                   | 0,3 ms              | 0,3 ms          | %0                 |
  | ORT 4 iş p., normal öncelik               | 4,1 ms              | 3,4 ms          | %0,15              |
  | ORT 1–2 iş p. ya da nice 19               | 0,1–0,3 ms          | 0,2–0,5 ms      | %0,05              |
  | ORT 4 iş p., ses gerçek zaman önceliğinde | 3,4 ms              | 0,06 ms         | %0                 |

  Gerçek zaman kuralı ihlal edilmez (iş ses yolunun dışında). Yine de **1 iş parçacığı + düşük öncelik**
  (Windows'ta `THREAD_MODE_BACKGROUND_BEGIN`) seçilmeli; görsellerin kare süresi dört çekirdeği dolduran işte
  etkileniyor.

- **`background.rs` deseniyle uyumsuzluk:** `Pacer` 20 ms'lik dilimlerle duraklıyor, ama bir model çağrısı
  10–16 sn sürüyor ve bölünemiyor. Çağrı süresi pencere boyuyla sınırlanmalı: 5–10 sn pencere ~1–3 sn sürüyor.
  Ayrıca "ön planda iş varken bekle" sinyaline her pencereden sonra bakılmalı.
- **tract mı ort mu:** tract saf Rust, DLL yok, `cargo deny` kapsamında, derlemede ağ yok; 1,5–1,7 kat yavaş.
  `ort` kararlı sürümsüz (rc.15), varsayılan derlemesi üçüncü taraf CDN'den ikili indiriyor, 18,4 MB DLL ve C++
  bağımlılığı getiriyor. Öneri birincinin önerisiyle aynı: **önce tract**. `ort` yalnızca Windows ölçümü 4 dk
  şarkıda 5 dk'yı aşarsa, `load-dynamic` + Microsoft'un resmî DLL'iyle.
- **Model dosyası:** 366 MB (xz ~280 MB). Seçenekler bölüm 11'de (K1).
- **Önemli tasarım eksiği:** sözler her değiştiğinde model yeniden çalıştırılmamalı. Emisyonlar ("bu karede hangi
  harf", ~60 sütun, fp16 ya da u8, şarkı başına ~0,7–1,4 MB) veri klasöründe saklanırsa kullanıcının her
  düzeltmesi (eksik nakaratı ekleme vb.) <1 sn'de yeniden hizalanır. Bu, sahibinin "elle zamanlama yapamıyorum"
  durumunda düzeltme döngüsünü mümkün kılan şey.

## 7. Gözden kaçmış seçenekler

- **Daha iyi bir hizalama modeli bulamadım** (izinli, Türkçe, müziğe dayanıklı, küçük):
  - MMS hizalayıcıları CC-BY-NC, yasak.
  - Türkçe ince ayarlı wav2vec2/XLS-R modelleri Hugging Face'te; erişilemedi, lisansları tek tek doğrulanamadı.
    Aynı boyutta (300M) olur ve yalnızca okuma sesiyle eğitilmiştir; müzik dayanıklılığı beklenmez.
  - Omnilingual 1B v2 üç kat büyük.
  - Whisper ailesi DTW yüzünden kelime içinde bulanık (birincinin ölçümü).
- **Modeli küçültme:** ağırlığı 4 bite indirme (ORT `MatMulNBits`) dosyayı ~200 MB'ye düşürebilir. Fp32 kaynak ve
  disk gerektiği için ölçülmedi; gelecekte denenecek iş.
- **Asıl gözden kaçan şeyler model değil:** (1) metin ön işleme, (2) satır atlama, (3) ileri-geri güven ölçüsü,
  (4) emisyon önbelleği. Dördü de modelden bağımsız, saf, birim testlenebilir Rust.
- Satır başlarını vokal başlangıcıyla düzeltmek gereksiz: ortanca hata 30–60 ms, ilk harf kopukluğu düzeltmesi
  sonucu kötüleştirdi.

## 8. Bulgular

**Kritik**

1. **Gerçek Türkçe başarı abartılı.** Makam sonucu enstrümantal ve işaretsiz bölümler sesten çıkarılarak
   ölçüldü; tam kayıtta %94,5, bir kayıtta %76. Vekil set ürün kararına dayanak olamaz. Sahibine "Türkçede
   %98" denmemeli. Doğru cümle: "çoğu şarkıda neredeyse kusursuz; kabaca her 8 şarkıdan birinde bir bölüm
   kayıyor; program o bölümü işaretler."
2. **Yapıştırılan sözün biçimi sonucu belirliyor ve plan bunu ele almıyor.** "[Nakarat]" ile kısaltılmış söz
   gerçek Türkçe şarkıda %43,5. Ön işleme (ve tercihen satır atlama) PR 2'nin parçası olmalı, "isteğe bağlı
   sonra" değil.

**Önemli**

3. Güven ölçüsü çözülebilir: ileri-geri sonsalı (AUROC 0,97). Planın "ürüne yalnızca şarkı düzeyinde bilgi;
   satır işareti yok" kararı gereksiz derecede zayıf. Düşük güvenli satır "tahmini" görünmeli, kötü şarkı ve
   yanlış söz uyarılmalı.
4. Emisyon önbelleği planda yok. Olmazsa her düzeltmede 0,5–3,3 dk bekleme olur.
5. Makam setinin lisansı yanlış yazılmış (depoda lisans yok, ticari kayıtlar). Piper dfki'nin NC verisi
   yazılmamış. LISANSLAR notu buna göre düzeltilmeli.
6. `ort` kararlı değil (rc) ve ikiliyi üçüncü taraf CDN'den alıyor. Seçilirse resmî DLL + `load-dynamic`.
7. Model çağrısı bölünemez (10–16 sn). `background.rs`'in 20 ms'lik temposuna uymuyor; pencere 5–10 sn'ye
   inmeli ya da iş ayrı bir kuyrukta "iptal edilebilir" olmalı.
8. 7B modelin Türkçe CER'i 300M CTC'ye aitmiş gibi sunulmuş.

**Küçük**

9. "1,8 GB" Python + bellek havuzu: üründe ~0,7–1 GB.
10. Spleeter'ın 5,3 GB'ı sherpa-onnx'in bütün şarkıyı tek seferde işlemesinden; ayrıştırma işi (açık konu 5)
    için yanlış bir caydırıcı.
11. JamendoLyrics'in GitHub sürümü "deprecated"; düzeltilmiş işaretler HF'te.
12. Apache-2.0 §4(b): int8 dönüşümü "değiştirilmiş" sayılır; LISANSLAR ve `public/lisanslar/`'da belirtilmeli.
13. Satır atlama birebir sözde ortalamayı biraz artırıyor (1,09 → 1,33 sn; ≤0,3 sn oranı aynı). Ancak güven
    ölçüsüyle birlikte kullanılmalı.
14. Karakter kümesi Latin'e sabit (`CHARSET`). Kiril/Yunan sözlerde sessizce harf atlanır; sözdeki karakterler
    modelin sözlüğünden alınmalı.
15. Kaynak önceliği planı ("yan .lrc > otomatik") sahibinin "kullanıcının sözü her zaman önce" kararıyla
    çelişebilir. Kullanıcının yapıştırdığı metnin otomatik zamanlaması yine kullanıcının sözüdür.

## 9. Birincinin sayıları ile benimkiler yan yana

| Ölçüm                                    | Birinci ekip                       | Bu denetim                                     |
| ---------------------------------------- | ---------------------------------- | ---------------------------------------------- |
| Jamendo son sınama, kelime ≤0,3 sn       | %94,1                              | %94,13 (birebir)                               |
| Jamendo son sınama, satır ≤0,3 sn        | %93,0                              | %93,02 (birebir)                               |
| Makam, satır (öbek) ≤0,3 sn              | %97,9 (4 kayıt, bölümler art arda) | %98,7 art arda / **%94,5 tam kayıt** (7 kayıt) |
| Türkçe vekil                             | %99,8                              | ses bozmalarında hâlâ %98,7–100: ayırt etmiyor |
| Eksik söz                                | ortanca aynı, ortalama ×2          | "[Nakarat]" makamda %43,5, yarım söz %73–82    |
| Güven: büyük hata yakalama               | 60/100, %17,5 işaretli             | **83/101, %6,0 işaretli**                      |
| Tepe bellek                              | ~1,8 GB                            | 0,96 GB (30 sn, havuz kapalı), 0,70 GB (10 sn) |
| 30 sn pencere, 1 iş p. / 4 iş p. / tract | 10,1 / 2,6 / 17,0 sn               | 9,7–11,2 / 2,5 / 16,4 sn                       |

## 10. Nihai öneri ve ürüne giriş planı (düzeltilmiş)

**Yöntem:** Omnilingual CTC 300M v2 int8 + CTC Viterbi, karışım üzerinde, şu eklerle:

- metin ön işleme;
- satır atlama (ceza 6 nat/harf + 40);
- ileri-geri güven ölçüsü;
- emisyon önbelleği.

Vokal ayrıştırma yok. Çalıştırıcı tract, tek iş parçacığı, düşük öncelik, 10 sn pencere. Pencere boyu doğrulukla
birlikte bir kez ölçülmeli: pencere boyunu ve bindirmesini geliştirme setinde seçen küçük bir deneme.

PR'lar (her biri yeşil, bağımsız incelemeli):

1. **Araştırma belgesi:** birincinin raporu + bu denetim. LISANSLAR'a araştırma dosyaları gerçek lisanslarıyla
   (Jamendo şarkı başına CC; makam "lisanssız, ticari kayıt, yalnızca yerel ölçüm"; Piper dfki NC). Kod yok.
2. **Saf metin işleme** (`audio/lyrics_text.rs` ya da `analysis/lyrics_align/text.rs`): başlık atma,
   `(x2)`/`x2`/`2x` açma, "[Nakarat]" yer tutucusunu doldurma, Türkçe sayı okuma (0–9999), Türkçe küçük harf.
   Bu denetimin bozmaları birim testleri olur.
3. **Saf hizalayıcı:**
   - Viterbi, satır atlamalı;
   - ileri-geri satır güveni;
   - şarkı düzeyi özet (düşük güvenli oran, "yanlış söz olabilir").
     Girdi emisyon matrisi. Testler: yapay matrisler, satır atlama, yanlış söz.
4. **Model çalıştırıcı (tract) + emisyon önbelleği:** SHA-256 denetimi, giriş/çıkış adı ve boyutu denetimi
   (güvenilmez dosya). Emisyonlar `analysis/cache.rs`'e yeni bir parça olarak ("lyrics_emissions"; söz
   metninden bağımsız, yalnızca sese bağlı). Hizalamanın kendisi söz metninin özetiyle ayrı tutulur. CI'da kısa
   bir sentetik sesle (ffmpeg) çalışma denemesi; model CI önbelleğinde karmayla.
5. **Arka plan işi:** istek üzerine (kullanıcı söz kaydedince ya da "Otomatik zamanla"), çalan şarkı önce, tek iş
   parçacığı, düşük öncelik, pencere sonrası iptal/ön plan denetimi, `CrashGuard`. `LyricsSource::Auto`.
6. **Arayüz:**
   - "Otomatik zamanlandı";
   - düşük güvenli satırlar soluk;
   - kötü şarkıda "Bazı bölümler tahmini" uyarısı, yanlış sözde "Bu sözler bu şarkıya uymuyor olabilir";
   - satır satır −/+ düzeltme (açık konu 1) → düzeltme anında yeniden hizalama.
     Önizleme videosuyla sahibine gösterilir.
7. (Sonra) aşamalı hizalama (çalarken sözler çıksın); 4 bitlik model; Windows hız ölçümüne göre `ort`.

Gereksiz bulduğum adım: birincinin "PR 3'te CI'da model sherpa-onnx sürümünden indirilir" adımı. Kurulum modeli
nasıl alacaksa CI da aynı karmalı dosyayı kullanmalı. İkinci bir indirme yolu gerekmez.

## 11. Sahibine sorulacak kararlar (seçenek + öneri)

- **K1. Model nasıl gelsin? (280 MB)**
  - (a) Kurulumun içinde.
  - (b) Aynı GitHub sürümünde ayrı "Söz paketi" dosyası, Lyraska'da "Dosyadan ekle".
  - (c) Programın içinden isteğe bağlı indirme düğmesi.

  **Öneri: (b).** İnternet ilkesi aynen kalır, kurulum küçük kalır. Sahibine (b)'nin bir adım fazla olduğu
  (dosyayı indirip seçmek) açıkça söylenmeli. Sahibi yazılımcı değil ve ileride (c)'yi isteyebilir: (c),
  "yalnızca kullanıcı basınca, telemetri yok" şartıyla ayrı bir karar olarak sorulmalı.

- **K2. Güvenli olmayan satırlar nasıl görünsün?**
  - (a) Normal görünsün.
  - (b) Soluk + "tahmini" işareti.
  - (c) Gizlensin.

  **Öneri: (b).** Ölçü artık güvenilir: işaretlilerin %67'si gerçekten yanlış, işaretsizlerin %99'u doğru.

- **K3. Eğitim verisi tam açıklanmamış Apache-2.0 model kabul mü?** **Öneri: kabul.** Şartlar: (1) Meta'nın
  makalesindeki veri listesi açık bir ağdan okunup LISANSLAR'a yazılacak; (2) NC bir derlem bulunursa sahibine
  yeniden sorulacak. Bu, birincinin önerisiyle aynı. Ağırlık lisansını hak sahibi verdiği için Demucs
  durumundan farklı.
- **K4. Çalıştırıcı.**
  - (a) tract: saf Rust, ~3 dk / şarkı (bu makinede).
  - (b) ONNX Runtime: ~30 sn–2 dk, 18 MB DLL, sürüm adayı crate.

  **Öneri: (a).** Sahibinin bilgisayarında 5 dk'yı geçerse (b).

- **K5. Zamanlama ne zaman çalışsın?**
  - (a) Yalnızca "Otomatik zamanla"ya basınca.
  - (b) Söz yapıştırılınca kendiliğinden.

  **Öneri: (b).** İstek "kendiliğinden" diyor. İş düşük öncelikte çalışır, ilerleme yüzdesi gösterilir.

- **K6. Sahibinin 5–10 Türkçe şarkıda denemesi** (pop, arabesk, rap; birkaçında web'den kopyalanmış, nakaratı
  kısaltılmış söz). "Doğru / yanlış satır" işareti DOGRULAMA'ya madde olarak eklenir. **Öneri: evet**, PR 6'dan
  önce. Gerçek Türk pop'u ve arabesk hâlâ ölçülmedi.

## 12. Yeniden çalıştırma

`betikler/` (Python: birinci ekibin `venv`'i, salt okunur; veri ve emisyonlar birinci ekibin `cache/` ve `dl/`
klasörlerinden okunur):

- `yeniden_olc.py son_sinama sep`: bağımsız yeniden ölçüm.
- `emcheck.py`: emisyon doğrulaması.
- `deney_ses.py` / `deney_ses2.py`: ses karşı örnekleri; emisyonlar `em/`.
- `deney_metin.py ayar | son 6 40 son_sinama`, `ikinci()`: metin karşı örnekleri.
- `deney_guven.py 0.5`, `guven_esik.py`, `yanlis.py`, `guven_bozuk.py`: güven ölçüsü.
- `bellek2.py`, `cekisme.py`, `yuk.py`: bellek ve çekişme.
- `tabaka.py`: tür ve bayrak dağılımı.
- `kopma.py`: ilk harf kopukluğu.

tract ölçümü birincinin `tract/tract-deneme` ikilisiyle yapıldı; sabit şekilli model yeniden üretilip silindi.
Büyük ara dosyalar silindi; `em/` 52 MB, yalnızca emisyon.
