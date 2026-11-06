# C. Şarkı sözü hizalama ve vokal

Tarama 1, 6 Kasım 2026. İşaretler: **[birincil]** kaynak (makale PDF'i, depo, model kartı) bu oturumda okundu;
**[özet]** yalnızca arama özeti; **[tahmin]** benim hesabım. Mevcut çalışma: `docs/arastirma/soz-hizalama/RAPOR.md`
(Omnilingual ASR CTC 300M + Viterbi; Jamendo son sınamada kelimelerin %94,1'i ≤ 0,3 sn, ortalama 1,09 sn — 5 kayan
şarkı yüzünden) ve köy işi (167 şarkıda program ↔ YouTube altyazısı; "oturmadı" hükmü 43 şarkının 9'unda fazla temkinli).

## 0. Kısa sonuç

1. **Lyraska'nın kelime isabeti yayımlanmış en iyi sonuçla aynı düzeyde.** Durand, Stoller, Ewert (Spotify, ICASSP 2023) JamendoLyrics Multi-Lang'te dil koşullu modelle **AAE 0,18 sn, PCO %94** (kelime başı ≤ 0,3 sn) [birincil:
   arXiv 2306.07744 Tablo 3]; İngilizce Jamendo'da AAE 0,15 sn ("literatürdeki en düşük") [birincil]. Lyraska'nın son
   sınaması: PCO %94,1 (aynı ölçü), ama ortalama hata 1,09 sn. **Fark ortalamada değil, felakette:** birkaç şarkının
   bölümleri kayınca AAE büyüyor. Yani bundan sonraki iş "daha iyi model" değil, **kaymayı bulma ve düzeltme**.
   (Uyarı: alt kümeler aynı değil — Lyraska 39 şarkılık son sınama; Durand 79 şarkının tamamı — ve Durand'ın modeli
   DALI ile eğitilmiş, Lyraska'nınki genel konuşma ASR'si.)
2. **"Vokali ayırmak hizalamaya yardım etmiyor" ölçümü literatürle uyumlu.** Gupta, Yılmaz, Li (ICASSP 2020): ayrılmış
   vokalle eğitilen modelde kelime hatası Mauch setinde **3,62 sn**, karışımla eğitilende **0,25 sn**; Hansen 0,67 →
   0,16; Jamendo 0,39 → 0,34 [birincil: arXiv 1909.10200 Tablo 3]. Neden: ayrıştırma yapıtları ve uzun enstrümantal
   aralarda "düzensiz bastırma". Önceki raporun kararı (ayrıştırmasız) doğru.
3. **Güven ölçüsü için hazır fikir:** Waseda + Daiichikosho (IEICE 2023): karaoke sesinde doğru sözle zorlanmış hizalamanın
   "çökme" ölçüsünden (düzenleme uzaklığına dayalı) değiştirilmiş söz tespiti, **AUC 0,963** [özet; Japonca bildiri
   özeti, birincil okunmadı]. Lyraska'nın açık sorunu tam bu: hangi satır oturmadı? Öneri C-1.
4. **Türkçe pop/arabesk/rap için doğru zamanlı açık set yok** (HF'de "turkish lyrics/singing" araması yalnızca metin
   seti döndürdü [birincil: HF API]). Türk makamı için Dzhambazov'un çalışmaları (UPF tezi 2017; ISMIR 2016: nota
   başlangıçlarıyla hizalama, 12 a cappella kayıt) var [özet]. **Köy işinin YouTube altyazı yöntemi** (167 şarkı) bu
   açıdan dünyada az örneği olan bir ölçek; doğru ama gürültülü (±0,5 sn) bir vekil.
5. **Yeni kararla açılan seçenekler:** MMS hizalayıcı (Meta; **CC-BY-NC-4.0** [birincil: HF kartları `facebook/mms-300m`,
   `MahmoudAshraf/mms-300m-1130-forced-aligner`]) artık yerelde kullanılabilir; ama Omnilingual zaten Apache-2.0 ve
   aynı aileden (wav2vec2 + CTC). Daha değerli olan: Omnilingual'ın **CTC 1B/3B/7B** sürümleri (Apache-2.0 [birincil:
   HF API, `facebook/omniASR-CTC-1B` vb.]) — şarkı sesinde daha dayanıklı olabilir, ama 1B f32 ~4 GB bellek, CPU'da
   ~3,3× yavaş [tahmin]. Yalnızca "kayan şarkılarda ikinci geçiş" için düşünülmeli.

## 1. Literatür ve sonuçlar (karşılaştırma tablosu)

| Çalışma                                  | Yöntem                                                             | Set                              | Sonuç                                                                  | Kanıt                   |
| ---------------------------------------- | ------------------------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------- | ----------------------- |
| Durand, Stoller, Ewert 2023 (Spotify)    | Karşıtsal öğrenme (ses ↔ harf benzerliği), satır sınırlı kod çözme | Jamendo Multi-Lang (EN/ES/DE/FR) | AAE 0,18 sn, PCO %94 (dil koşullu); EN 0,21, ES 0,13, DE 0,16, FR 0,19 | [birincil] Tablo 3      |
| Aynı, yalnız İngilizce eğitim            | —                                                                  | Jamendo EN                       | AAE 0,15, PCO %92 (M6); CTC fonem M2: 0,20 / %89                       | [birincil] Tablo 1      |
| Gupta, Yılmaz, Li 2020                   | Karışımla eğitilmiş akustik model + tür bilgili sessizlik          | Mauch / Hansen / Jamendo         | AE 0,21 / 0,18 / 0,22 sn                                               | [birincil] Tablo 3      |
| Stoller ve ark. 2019                     | Uçtan uca harf tanıyıcı                                            | Jamendo                          | ~0,82 sn                                                               | önceki rapor [özet]     |
| Lyraska (Omnilingual CTC 300M + Viterbi) | Genel ASR CTC, ayrıştırmasız, 30 sn pencere                        | Jamendo son sınama (39)          | kelime ≤ 0,3 sn %94,1, ortanca 0,032 sn, ortalama 1,09 sn              | `soz-hizalama/RAPOR.md` |
| Lyraska, makam (4 kayıt)                 | aynı                                                               | Dzhambazov makam seti            | öbek ≤ 0,3 sn %97,9                                                    | aynı                    |
| Park ve ark. 2024                        | Gerçek zamanlı; kroma + fonem olasılığı (PPG) birlikte             | Schubert Winterreise             | —                                                                      | [özet] arXiv 2401.09200 |

**Ders (Park 2024):** uzun heceli şarkıda (klasik, makam, arabesk) yalnızca fonem bilgisi zayıf kalır; ezgi (kroma)
eklemek yardım ediyor [özet]. Lyraska'nın Viterbi'sine, satırın ezgisi bilinmediği için kroma doğrudan girmez; ama
**tekrar eden nakaratın** ezgisi aynıdır: aynı söz satırının iki geçişi kroma benzerliğiyle birbirine bağlanabilir
(bkz. C-2).

## 2. Veri setleri ve lisansları

| Set                            | İçerik                                                                                             | Lisans                                                                           | Yerel ölçümde                     | Kaynak                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------ |
| JamendoLyrics Multi-Lang       | 79 şarkı, kelime zamanlı; artık yalnızca Hugging Face'te (GitHub deposu 30 Nis 2025'te arşivlendi) | ses CC (çoğu NC) [önceki rapor]; HF kartında lisans alanı boş [birincil: HF API] | Evet                              | [özet] f90/jamendolyrics             |
| Jam-ALT                        | Aynı seslerde biçim duyarlı **söz yazıya dökme** seti                                              | HF kartı lisans alanı boş                                                        | Evet                              | [özet] arXiv 2311.13987              |
| DALI (Meseguer-Brocal ve ark.) | 5 358 şarkı, nota+söz hizası, ses YouTube'dan                                                      | ek açıklamalar araştırma; ses telifli                                            | Evet (yalnızca yerelde, eğitimde) | Gupta 2020'de kullanılmış [birincil] |
| Dzhambazov makam seti          | Türk sanat müziği, öbek zamanlı                                                                    | GitHub'da (önceki rapor)                                                         | Evet                              | önceki rapor                         |
| Köy işi altyazıları            | 167 şarkı, satır zamanı (YouTube altyazısı)                                                        | sahibinin yerel verisi; depoya yalnızca zamanlar                                 | Evet                              | `docs/arastirma/koy-isi/`            |

## 3. Vokal etkinliği (VAD) ve "vokalin girişi"

- Klasik set: Jamendo VAD korpusu (93 şarkı, CC; 61/16/16 bölme) [özet]; 2022 derlemesi (Monir ve ark., Entropy) CNN ve
  LRCN'lerin başta olduğunu söylüyor [özet]. Damıtılmış küçük modeller Jamendo'da en iyiyi geçiyor (2020) [özet].
- **Lyraska için en ucuz VAD zaten elde:** CTC modelinin "boş" (blank) olasılığı kare kare vokalin olmadığını söyler.
  Söz paketi kurulu ve şarkı çözümlendiyse bu bilgi bedava; söz yoksa bile modeli serbest çalıştırıp blank olasılığından
  vokal zarfı çıkarılabilir [tahmin; Omnilingual konuşmada eğitildiği için şarkıda ölçülmeli].
- Görsel Yönetmen'e etkisi: "vokal girişi" olayı (söz satırı başı) doku/atmosfer katmanına; söz zamanı varsa ondan,
  yoksa blank-VAD'den, o da yoksa klasik "vokal olası" zarfından (B dosyası §5).

## 4. Öneriler (her biri ölçülebilir)

- **C-1. Satır güveni: serbest kod çözümle düzenleme uzaklığı.** Her satır için CTC açgözlü (greedy) çıktısını o satırın
  aralığında al, verilen söze harf düzeyinde düzenleme uzaklığını hesapla; Viterbi yol olasılığıyla birleştir. Modül:
  `analysis/lyrics_align.rs` (güven), `lyrics_job.rs` (hüküm). CPU: ihmal (emisyonlar önbellekte). Ölçüm: köy işinin
  167 şarkısında satır başına "altyazıya ±0,5 sn" etiketine karşı ROC-AUC; hedef ≥ 0,90 (bugünkü hükmün yanlış "oturmadı"
  oranı 43'te 9 → ≤ 3).
- **C-2. Kayma düzeltme: tekrar eden satırlar.** Aynı metinli satırlar (nakarat) aynı ezgiyle söylenir; kroma
  benzerliği yüksek iki aralık bulunca tekrarlar birbirine bağlanır, kayan bölüm diğer tekrarın göreli zamanlamasıyla
  yeniden oturtulur. Ölçüm: Jamendo'nun 5 kayan şarkısı ve köy işinde ortalama hata; hedef: son sınama ortalaması 1,09 →
  < 0,4 sn, ortanca bozulmadan.
- **C-3. İkinci geçişte büyük model (isteğe bağlı).** Yalnızca güveni düşük şarkılarda Omnilingual CTC 1B (Apache-2.0).
  Önce sahibinin Ryzen'inde 60 sn ses için süre ve bellek ölçülür; GPU yolu (B dosyası §3) varsa orada. Kapı: kayan
  şarkıların en az yarısını düzeltmek.
- **C-4. Türkçe ölçek seti.** Köy işi altyazı yöntemini 167'den Türkçe şarkılarla 50'ye genişletmek (yalnızca `tr-orig`
  elle yazılmış altyazılar; otomatik altyazı gürültülü). Ölçü: satır başı ≤ 0,5 sn oranı, tür tür (pop, arabesk, rap).

## 5. Mevcut kararlarda gördüğüm sorunlar

1. "Hatalı satırları güvenle işaretleyen bir ölçü yok" (RAPOR açık riski) hâlâ açık ve kullanıcıya en çok görünen şey:
   C-1 bu yüzden ilk sırada.
2. MMS'nin "CC-BY-NC → yasak" diye elenmesi yeni kararla geçersiz; ama MMS'yi eklemeye gerek görmüyorum (Omnilingual aynı
   iş, Apache-2.0). Yine de "ikinci görüş" olarak kayan şarkılarda farklı eğitim verili bir model yardımcı olabilir
   [tahmin].
