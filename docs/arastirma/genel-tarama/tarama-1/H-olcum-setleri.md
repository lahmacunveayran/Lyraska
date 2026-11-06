# H. Ölçüm setleri ve ölçütler: Lyraska kendini dünya ölçeğinde nasıl ölçer

Tarama 1, 6 Kasım 2026. İşaretler: **[birincil]** kaynak (depo README/LICENSE, Zenodo/HF API'si, makale) bu oturumda
okundu; **[özet]** arama özeti; **[bilgim]** genel alan bilgisi, bu oturumda doğrulanmadı; **[tahmin]** çıkarımım.

**Yeni karara göre kural:** NC ya da araştırma lisanslı **veri seti ve ağırlık**, yalnızca sahibinin bilgisayarında yerel
ölçüm/paket olarak kullanılabilir; depoya ve herkese açık sürüme girmez. Ses asla depoya girmez (CLAUDE.md). Depoya
yalnızca sonuç sayıları, ölçüm betikleri ve (telifsiz) zaman listeleri girer.

## 0. Kısa sonuç

1. **Lyraska'nın kalite hedefleri bugün yalnızca sentetik setlerde ölçülüyor.** Dünyada her alanın standart bir seti ve
   ölçütü var; yeni kararla çoğu yerelde kullanılabilir hâle geldi. Bir "Yerel ölçüm paketi" (sahibinin `D:\LyraskaVeri`
   klasöründe; BILGI §4) ve tek komutluk bir ölçüm aracı (`examples/` altında, köy işinin kalıbında), Lyraska'nın
   sayılarını yayımlanmış sonuçlarla **aynı ölçütle** karşılaştırılabilir kılar.
2. **Ses erişimi asıl engel, lisans değil.** GTZAN, Ballroom, Harmonix, SALAMI, Beatles, GiantSteps gibi setlerin ek
   açıklamaları açık, ama sesi ya telifli ya da YouTube/Beatport'tan toplanıyor. Kişisel ölçüm için sahibinin kendi
   kütüphanesi + açık lisanslı sesler (Jamendo, Slakh, AAM, MTG-Jamendo) yeterli bir çekirdek olur.
3. **Doğrusu bilinmeyen yerde iki yol:** (a) **vekil doğru** — en iyi açık model (Beat This, MIT) "öğretmen" olur,
   uyuşmazlıklar elle dinlenir; (b) **metamorfik ilişkiler** (G dosyası G-1). İkisi birlikte sahibinin 656 şarkısını
   ölçek seti yapar.

## 1. Alan alan setler (lisans: ek açıklama / ses / kod ayrı)

### 1.1 Beat, ölçü başı, tempo

| Set                                           | Boyut                             | Ek açıklama lisansı          | Ses                             | Yerelde                     | Kaynak                                                  |
| --------------------------------------------- | --------------------------------- | ---------------------------- | ------------------------------- | --------------------------- | ------------------------------------------------------- |
| GTZAN (beat: Marchand; Böck'ün ISMIR2019 eki) | 999 × 30 sn                       | ek açıklamalar araştırma eki | telifli, yaygın dağıtılmış      | Evet (ses kişisel kopyadan) | Beat This'in **test** seti (eğitime girmedi) [birincil] |
| Ballroom, Hainsworth, SMC, HJDB, SIMAC        | yüzlerce                          | Böck ISMIR2019 eki           | çeşitli                         | Evet                        | [birincil: beat_this_annotations]                       |
| Harmonix Set                                  | 912 şarkı; beat, ölçü başı, bölüm | **MIT**                      | YouTube'dan DTW hizalı          | Evet                        | [birincil: urinieto/harmonixset LICENSE]                |
| RWC Popular/Classical                         | 100 / 50                          | —                            | **CC BY-NC 4.0** (önceki rapor) | Evet (yerelde)              | önceki rapor                                            |
| Türk makamı usul seti (Holzapfel ve ark.)     | 82 × 1 dk (aksak, curcuna, düyek) | okunmadı                     | araştırma                       | Belirsiz                    | [birincil: ISMIR 2014 makalesi]                         |
| Lyraska sentetik (tempo, drop, aksak)         | 66 + 48 + …                       | bizim (GPL)                  | bizim                           | Evet                        | `docs/arastirma/tempo/`, `drop/`                        |

**Ölçüt:** beat F-ölçüsü (±70 ms), CMLt/AMLt (süreklilik), ölçü başı F; `mir_eval` (MIT [birincil: craffel/mir_eval
LICENSE]) ile aynı tanım (Lyraska'da `test-kalitesi/betikler/mir_eval/f_olcusu.py` zaten var). **Karşılaştırma çizgisi:**
GTZAN'da Beat This 89,1 / 78,3 [birincil]. **Lyraska hedefi:** GTZAN beat F ≥ 0,80 (ROADMAP), ölçü başı F ≥ 0,65; aksak
sette usul isabeti ve ölçü başı F ≥ Holzapfel'in usul bilinmeden değeri (aksak 65,1) [birincil].

### 1.2 Yapı ve bölüm

| Set                       | Ek açıklama    | Ses                                    | Yerelde | Kaynak                                      |
| ------------------------- | -------------- | -------------------------------------- | ------- | ------------------------------------------- |
| SALAMI                    | **CC0**        | paylaşılmıyor; YouTube eşleşme listesi | Evet    | [birincil: DDMAL/salami-data-public readme] |
| Harmonix                  | MIT            | YouTube                                | Evet    | [birincil]                                  |
| SongFormBench (300 şarkı) | depo CC BY 4.0 | —                                      | Evet    | [birincil: ASLP-lab/SongFormer]             |

**Ölçüt:** sınır isabeti HR.5F (±0,5 sn) ve HR3F (±3 sn), etiket doğruluğu ACC. Çizgi: SongFormer (HX) 0,703 / 0,784 /
0,795; All-In-One 0,596 / 0,730 / 0,740 (SongFormBench-Harmonix) [birincil]. **Lyraska hedefi [tahmin]:** HR3F ≥ 0,70
(görseller için ±3 sn sınır bile bölüm temasını doğru değiştirir), HR.5F ≥ 0,50.

### 1.3 Ton ve akor

| Set                                     | Ek açıklama               | Ses                                    | Yerelde                                  | Kaynak                        |
| --------------------------------------- | ------------------------- | -------------------------------------- | ---------------------------------------- | ----------------------------- |
| GiantSteps Key (604 EDM, 2 dk önizleme) | README'de lisans yazmıyor | Beatport önizlemeleri (indirme betiği) | Belirsiz-olumlu (yalnızca kişisel ölçüm) | [birincil: GiantSteps README] |
| GiantSteps Tempo                        | aynı                      | aynı                                   | aynı                                     | [birincil]                    |
| Isophonics Beatles (ton, akor)          | araştırma                 | ticari CD                              | Evet (kişisel kopya)                     | [bilgim]                      |
| McGill Billboard (akor)                 | açık [bilgim]             | yok                                    | Evet                                     | [bilgim]                      |

**Ölçüt:** MIREX ağırlıklı ton puanı (aynı 1, beşli 0,5, paralel 0,3, göreli 0,2) — `mir_eval.key`. Çizgi: GiantSteps'te
madmom 71,0, S-KEY 72,1 [birincil: S-KEY makalesi]. **Lyraska hedefi:** ≥ 0,70 (ROADMAP'in "aynı ya da komşu ≥ %80" hedefi
farklı bir ölçü; ikisi de raporlanır).

### 1.4 Kaynak ayrıştırma

| Set                                   | Lisans                                      | Yerelde           | Kaynak                          |
| ------------------------------------- | ------------------------------------------- | ----------------- | ------------------------------- |
| MUSDB18-HQ                            | akademik; parçalar Restricted / CC BY-NC-SA | Evet              | önceki rapor                    |
| MoisesDB                              | CC BY-NC-SA 4.0                             | Evet              | önceki rapor                    |
| Slakh2100                             | **CC BY 4.0** (vokal yok)                   | Evet (dağıtım da) | [birincil: ethman/slakh README] |
| **AAM: Artificial Audio Multitracks** | **CC BY 4.0** (Zenodo 5794629, 2022)        | Evet (dağıtım da) | [birincil: Zenodo API]          |

**Ölçüt:** SDR (museval/BSSEval; `sigsep-mus-eval` MIT [birincil]) — ama Lyraska için asıl ölçüt zarf/onset (B dosyası
§6): kick ve trampet onset F1, bas zarfı ilintisi, vokal etkinliği doğruluğu.

### 1.5 Şarkı sözü

| Set                           | Lisans                                     | Yerelde | Kaynak                             |
| ----------------------------- | ------------------------------------------ | ------- | ---------------------------------- |
| JamendoLyrics Multi-Lang (79) | ses CC (çoğu NC); şimdi HF'de              | Evet    | [özet] + önceki rapor              |
| DALI                          | **CC BY-NC-SA 4.0**                        | Evet    | [birincil: gabolsgabs/DALI README] |
| Dzhambazov makam seti         | önceki rapor                               | Evet    | önceki rapor                       |
| Köy işi altyazıları (167)     | sahibinin verisi; yalnızca zamanlar depoda | Evet    | `koy-isi/`                         |

**Ölçüt:** AAE (şarkı başına ortalama mutlak hata), PCO (≤ 0,3 sn), satır ve kelime ayrı. Çizgi: Durand ve ark. 2023 AAE
0,18 / PCO %94 [birincil]. Lyraska: PCO %94,1, ortalama 1,09 sn (son sınama). **Hedef:** AAE ≤ 0,40 sn, PCO ≥ %94 korunur.

### 1.6 Duygu, tür, etiket

| Set                                               | Lisans                                                                                                          | Yerelde        | Kaynak                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------- |
| MTG-Jamendo (55 000+ parça; tür, çalgı, ruh hâli) | kod Apache-2.0; üst veri CC BY-NC-SA 4.0; ses çeşitli CC; "solely for non-commercial research and academic use" | Evet (yerelde) | [birincil: MTG/mtg-jamendo-dataset README]     |
| OTMM makam tanıma                                 | CC BY-NC-SA 4.0                                                                                                 | Evet           | [birincil: MTG/otmm_makam_recognition_dataset] |
| DEAM, PMEmo (değerlik/uyarılma)                   | okunmadı                                                                                                        | Belirsiz       | [özet]                                         |

### 1.7 Ses yolu (standart sinyaller — lisans sorunu yok)

- EBU Tech 3341 / 3342 uyum sinyalleri (zaten kullanılıyor), ITU-R BS.1770-5 (kanal ağırlıkları) [ROADMAP/BILGI].
- Gerçek tepe: BS.1770 Ek 2; Lyraska testleri var.
- Yeniden örnekleme: süpürme (sweep) ve Nyquist üstü bastırma (−195 dB ölçülmüş) [ROADMAP].
- Dither ve bit-perfect: −90 dBFS sinüs, bit bit karşılaştırma (D dosyası D-2).

### 1.8 Görsel güvenlik

- WCAG 2.2 / BT.1702-3 / ISO 9241-391 tanımları (E dosyası). Ücretsiz bağımsız araç: PEAT (Trace Center) [bilgim];
  ticari: Harding FPA. Öneri: Lyraska'nın `check:scenes` ölçümünü yılda bir kez PEAT ile çapraz denetlemek (kaydedilen
  60 sn'lik sahne videosu; güvenli mod). Ölçüt: PEAT "pass".

## 2. Önerilen ölçüm düzeni (adım adım)

1. **H-1 Yerel ölçüm paketi klasörü** (sahibinin bilgisayarı): `D:\LyraskaVeri\olcum\{gtzan,harmonix,giantsteps,jamendo,
aam,slakh,...}`. Hiçbiri depoya girmez; depoya `docs/arastirma/olcum/KAYNAKLAR.md` (nereden, hangi lisans) ve sonuç
   tabloları girer. LISANSLAR.md'nin "Programa girmeyen araştırma dosyaları" bölümüne not.
2. **H-2 Tek ölçüm aracı** `examples/dunya_olcumu.rs` (köy işi kalıbı: şarkı başına ayrı süreç, kaldığı yerden sürer):
   beat/ölçü başı/tempo/ton/bölüm çıktısını JSON'a yazar; ölçütler Python `mir_eval` ile (MIT; yalnızca ölçüm
   betiklerinde). İlk hedef: GTZAN + GiantSteps + Harmonix'in YouTube'dan hizalanabilen kısmı.
3. **H-3 Geliştirme / doğrulama / son sınama ayrımı** (Lyraska zaten yapıyor): dünya setlerinde **son sınama** bir kez,
   kod dondurulduktan sonra (soz-hizalama RAPOR'unun yöntemi).
4. **H-4 Vekil doğruyla kütüphane ölçümü:** Beat This (MIT) sahibinin 656 şarkısında; Lyraska ile uyuşma F-ölçüsü ve
   uyuşmayan şarkıların listesi (sahibi 10'unu dinler: hangisi doğru?).
5. **H-5 Sonuç tablosu biçimi:** her alan için "Lyraska / yayımlanmış en iyi / fark / set / tarih"; ROADMAP'in kalite
   hedefleri tablosuna sütun olarak eklenir.

## 3. Uyarılar

- **Eğitim–sınama sızıntısı:** Beat This'in `final*` modelleri GTZAN dışındaki 15 setle eğitildi; o setlerde ölçmek onu
  haksız iyi gösterir (README uyarısı [birincil]). Karşılaştırmada GTZAN kullanılır.
- **Setlerin kültürel sapması:** hiçbir büyük beat setinde Türk pop'u, arabesk, Türkçe rap yok; makam seti küçük. Lyraska'nın
  kendi Türkçe setini (yalnızca zamanlar, ses yok) oluşturması dünyada boşluk dolduran bir katkı olur; şarkı haritası biçimi
  (`SARKI-HARITASI.md`) zaten bunu taşıyabilir.
