# 20 — Kaynak ayrıştırma (AS7)

Depodaki rapor (`docs/arastirma/kaynak-ayristirma/RAPOR.md`, 6 Kasım) lisansı ayrıntılı inceledi ve Spleeter'ı
seçti; HPSS (Fitzgerald 2010) `analysis/hpss.rs`'te zaten var (A). Bu dosya o raporu **tekrar etmez**; ölçüt, güncel
en iyi sonuç ve 6 Kasım kararının açtığı kapıları ekler.

## 1. Ölçüt ve sonuçlar

| Ne                                   | Durum                                                                                                | Kanıt                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Ölçüt                                | SDR (museval; 1 sn'lik parçaların ortancasının şarkılar üzeri ortancası), MUSDB18-HQ test (50 şarkı) | A (Mel-RoFormer makalesi §4)       |
| Vokal SDR, yalnızca MUSDB ile eğitim | HDemucs 8,04; **BS-RoFormer 11,49** (93,4 M param.); **Mel-RoFormer 12,08** (105 M)                  | A (arXiv 2409.04702, Tablo 2)      |
| Vokal SDR, ek veriyle                | Sparse HT Demucs 9,37; BSRNN 10,01; BS-RoFormer 12,82; Mel-RoFormer 13,29                            | A (aynı tablo)                     |
| Küçük modeller (24 kHz mono)         | BS-RoFormer-small **10,56 (8,0 M)**, Mel-RoFormer-small **11,01 (9,1 M)**                            | A                                  |
| Dört kaynak ortalaması               | HT Demucs f.t. 9,0–9,2 dB (README); SCNet 9,00 (9,69 büyük)                                          | A (Demucs README), B (SCNet özeti) |
| Spleeter (4 kaynak, Wiener)          | vokal 6,86, bas 5,51, davul 6,71, diğer 4,55                                                         | A (deponun kendi raporu, paper.md) |
| Yarışma                              | SDX'23 müzik ayrıştırma birincisi BS-RoFormer (MUSDB-HQ + 500 şarkı)                                 | B (Mel-RoFormer özeti)             |

Yani Spleeter vokalde güncel en iyinin ~5–6 dB gerisinde (iki kuşak). Ama **Lyraska ses üretmiyor**: yalnızca zarf ve
başlangıç anı türetiyor. Doğru soru SDR değil: "ayrıştırma Lyraska'nın görev ölçütünü (vuruş F, drop isabeti, vokal
girişi isabeti) ne kadar iyileştiriyor?" Bu ölçülmedi (A: söz hizalamada ölçüldü ve fark çıkmadı; vuruşta ölçülmedi).

## 2. Ayrıştırmanın analize katkısı: literatür

- Beat Transformer (Zhao ve ark. 2022): "demixed" girdiyle vuruş/ölçü başı (B).
- All-In-One (Kim, Nam 2023): Demucs'un dört kaynağı girdi; vuruş, ölçü başı, bölüm ve etiket (A, README).
- Beat This (2024): **ayrıştırmasız**, yine de GTZAN'da Hung ve Beat Transformer'ı geçiyor (A). Ders: iyi bir ağ için
  ayrıştırma gerekmiyor; klasik takipçi için davul kanalı büyük fark yapabilir (C).
- Söz hizalama: depodaki ölçümde Spleeter + karışım Jamendo'da +0,8 puan, Türkçe setlerde fark yok (A, RAPOR).

## 3. 6 Kasım kararıyla lisansın yeniden değerlendirilmesi

| Model                                                  | Kod          | Ağırlık                                                                                                                      | Veri                | Yeni kural                                                                                                                                                                                            | Kanıt                     |
| ------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Spleeter                                               | MIT          | MIT (paper.md)                                                                                                               | Deezer iç           | Zaten seçili                                                                                                                                                                                          | A                         |
| Demucs v4 (htdemucs, _ft)                              | MIT          | **"lisansı belli değil"**: yazar "MusDB yalnızca araştırma amaçlı veri içeriyor… 6 kaynaklı sürüm muhtemelen CC-NC-BY" diyor | MUSDB + 800 şarkı   | "Lisansı yazılmamış" değil, "belirsiz/araştırma"; yeni karar araştırma lisansını kişisel yerel pakette kabul ediyor → **sahibine sorulmalı**; öneri: kabul (yalnızca yerel, yalnızca türetilmiş zarf) | A (README "License")      |
| SCNet                                                  | MIT          | kontrol noktası Google Drive'da, "MUSDB ile eğitildi", ağırlık lisansı **yazılmamış**                                        | MUSDB               | Alınmaz (kural)                                                                                                                                                                                       | A (README)                |
| BS/Mel-RoFormer topluluk kontrol noktaları (MSST, UVR) | MIT (kodlar) | çoğunda lisans yok                                                                                                           | MUSDB/MoisesDB/özel | Tek tek bakılır; yazılmamışsa alınmaz                                                                                                                                                                 | B (depodaki rapor + MSST) |
| HPSS (Lyraska)                                         | —            | —                                                                                                                            | —                   | Var                                                                                                                                                                                                   | A                         |

## 4. Öneriler

**Ö-K1: Önce görev ölçütü.** Ayrıştırmayı seçmeden önce "davul kanalı vuruş takibini ne kadar iyileştirir?" sorusu
Ö-R1 düzeneğinde (GTZAN/Ballroom) üç kolla ölçülür: karışım, HPSS vurmalı, Spleeter davul. **Karar ölçütü:** davul
kanalı F'yi ≥ 3 puan artırmıyorsa ayrıştırma vuruş için gerekmez; yalnızca görsel tepki (davul/bas/vokal zarfı) için
kalır.

**Ö-K2: Görsel tepki için yeterlilik ölçütü.** Vokal giriş anı (vokal etkinliği) için ölçüt: Jamendo/MIR-1K tarzı
etiketli vokal etkinliği (F, ±100 ms). Spleeter vokal kanalının zarfı + eşik. Hedef: vokal etkinliği F ≥ 0,85.

**Ö-K3: Demucs ya da küçük Mel-RoFormer'ı yalnızca ölçümle gelirse.** 24 kHz mono küçük RoFormer (~9 M) işlemcide
Spleeter'a yakın sürede çalışabilir (C) ve vokalde ~4 dB daha iyi — ama yalnızca lisansı **yazılı** bir kontrol
noktası bulunursa. Şu an bulunamadı.

## 5. Kaynaklar

Wang, Lu, Won (ByteDance), "Mel-RoFormer for vocal separation and vocal melody transcription", arXiv 2409.04702
(PDF okundu, A). adefossez/demucs README (A). starrytong/SCNet README + LICENSE (A). Depodaki
`kaynak-ayristirma/RAPOR.md` ve dil dosyaları (Çince, Japonca–Korece, Rusça; okundu, A).
