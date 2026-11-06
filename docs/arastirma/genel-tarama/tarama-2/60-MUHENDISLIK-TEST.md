# 60 — Mühendislik ve test kalitesi (AS13)

## 1. Güçlü olan (A, depo)

- Mutasyonla ölçülen test etkinliği: çekirdekte örneklenen 160 bozmanın %85'i (eşdeğerler çıkınca ~%93), arayüzde
  %79 (~%89) yakalanıyor; beklenen değerlerin %5'ten azı kodun kendi çıktısı (`test-kalitesi/README.md`).
- Gerçek zamanlı ses yolunda bellek ayırma testi, `unsafe` yasağı, ts-rs ile üretilen tipler, komut sözleşmesi
  denetimi, CI'da Windows Edge'de sahne denetimi, parlama kanıtının işlemci eşi (A, MIMARI/ROADMAP).
- Bu, açık kaynak müzik çalarlar arasında nadir bir disiplin (C; iki bağımsız denetim de aynı yargıda, A).

## 2. Zayıf olan: **analiz algoritmalarının değerlendirme yöntemi**

| Sorun                                                                                          | Kanıt                                                            | MIR'de kabul gören pratik                                                                                                   |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Standart, dışarıdan etiketlenmiş setlerde hiçbir ölçüm yok (vuruş, ölçü başı, yapı, ton, drop) | A (`grep`: GTZAN/Ballroom/SALAMI/GiantSteps/Harmonix sonucu yok) | Birden çok set; "eğitimde görülmemiş" test seti (GTZAN, Beat This uyarısı, A)                                               |
| Geliştirme kendi üretecimizin sentetik şarkılarında; tür başına 6 şarkı                        | A (`tempo/README.md`, `drop/README.md`)                          | Sentetik yalnızca birim testi; asıl ölçüm gerçek kayıt                                                                      |
| Son sınama seti de **aynı üreteçten**, farklı tohum                                            | A                                                                | Bağımsız dağılım (başka üreteç, gerçek ses); proje bunu kısmen biliyor: bağımsız incelemenin karşı örnek üreteci (BILGI §5) |
| Ezber riski: ~25 drop, ~10 tempo eşiği elle; doğrulama setine geliştirme sırasında bakıldı     | A (README'lerin kendi notu: "sonuç iyimser olabilir")            | Ayarlama yalnızca geliştirmede; doğrulama bir kez                                                                           |
| Güven aralığı yok: "11/38 → 22/38" gibi oranlar                                                | A                                                                | Önyükleme (bootstrap) ya da binom aralığı; 22/38 için %95 Wilson aralığı ≈ %42–72 (hesap: C)                                |
| Hedef sayı (F ≥ 0,80) set tanımsız                                                             | A (ROADMAP)                                                      | Set + ölçüt + tolerans + bölüm tanımı birlikte                                                                              |
| GTZAN'ın kendi kusurları (yinelenen, yanlış etiketli, bozuk parçalar)                          | B (Sturm 2013, "The GTZAN dataset: its contents, its faults…")   | Tek sete dayanmamak                                                                                                         |

## 3. Öneriler

**Ö-T1: "Analiz kanıt düzeneği" (tek araç, `examples/analiz_olcum.rs`).** Girdi: bir klasör + ek açıklama biçimi
(mir_eval ile uyumlu `.beats`, `.lab`, JAMS'in alt kümesi). Çıktı: görev başına ölçüt, şarkı başına dağılım ve %95
önyükleme aralığı; önceki sürümle şarkı şarkı fark (düzelen / bozulan). Sesler depoya girmez; sonuç tabloları
(yalnızca sayı ve parça kimliği) girer. **Başarı ölçütü:** her ritim/ton/yapı sürüm artışı PR'ında bu tablo var.

**Ö-T2: Veri hijyeni kuralı (BILGI'ye ders olarak).** (1) Ayarlama yalnızca geliştirme setinde; (2) doğrulama seti
bir kez, kod dondurulduktan sonra (söz hizalama çalışması bunu zaten yaptı: `kod-dondurma-md5.txt`, A — en iyi örnek);
(3) son sınama başka kaynaktan (gerçek, dışarıdan etiketli); (4) her sonuç aralığıyla.

**Ö-T3: Sahibinin kütüphanesi "altın set".** Köy işi altyapısı (A) + sahibinin işaretleme aracı: 30 şarkılık,
türlere dengeli, vuruş/ölçü başı/drop/ton işaretli bir set. Sahibinin zamanı kısıtlı: vuruş işaretleme yerine
**düzeltme** (Lyraska'nın önerisini kaydırmak; Songle'ın "kullanıcı düzeltir" yaklaşımı, bkz. 40). Hedef: 30 şarkı
× ~5 dk sahibinin zamanı.

**Ö-T4: CI'da süreksiz kalite hedefleri** (test-kalitesi "Açık işler" 3): vuruş F için CI'ya ses giremez (telif);
ama **yalnızca analiz karelerinden** (60 kare/sn × 32 bant, ses değil) oluşan önceden çıkarılmış özellik dosyaları
CI'ya girebilir mi? Kareler sesin kendisi değil, geri dönüştürülemez özetler (C — telif açısından sahibine
sorulmalı). Olursa ritim ölçümü CI'da yapılır; olmazsa yerelde haftalık.

## 4. Kaynaklar

Depodaki `test-kalitesi/README.md`, `AYIKLAMA.md`, `tempo/README.md`, `drop/README.md`, `soz-hizalama/` (A). Beat This
README (A). Sturm, GTZAN eleştirisi (B, okunmadı). mir_eval (Raffel ve ark., ISMIR 2014; B).
