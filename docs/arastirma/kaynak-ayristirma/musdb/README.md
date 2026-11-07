# MUSDB18-HQ ölçümü (ara sonuç, 6 Kasım 2026)

Kaynak ayrıştırma modellerinin alanın standart test setinde karşılaştırması (`../RAPOR.md`; proje sahibinin
6 Kasım kararı: bütün modeller yalnızca sahibinin bilgisayarında, gerekirse harmanlanarak). Ses depoya girmez;
burada yalnızca araçlar ve sayılar var.

## Yöntem

- **Set:** MUSDB18-HQ (Rafii ve ark. 2019, Zenodo 3338373; lisansı ticari olmayan, yalnızca yerel ölçüm), test
  bölümü 50 şarkı. Arşivin tamamı (22,66 GB) indirilmez: [`uzak_zip.py`](uzak_zip.py) zip'ten şarkı şarkı HTTP aralık
  isteğiyle okur.
- **Ölçü:** BSS Eval v4 (museval 0.4.1, SiSEC 2018 ayarı: 1 sn pencere; şarkı başına pencerelerin ortancası),
  [`sarki_olc.py`](sarki_olc.py). Lyraska'nın kendi ölçü aleti (`analysis/separation_eval.rs`, #226) aynı hesabı
  museval'le 1e-6'ya kadar tutturuyor.
- **Akış:** [`htdemucs_set.sh`](htdemucs_set.sh): çıkar → ayır → ölç → JSON → sesleri sil; kaldığı yerden sürer.
- **Ham sonuçlar:** [`htdemucs-ara-2026-11-06.jsonl`](htdemucs-ara-2026-11-06.jsonl) (şarkı başına).

## HTDemucs, 16 / 50 şarkı (ara)

| Kaynak | SDR ortanca (dB) | SDR ortalama (dB) |
| ------ | ---------------- | ----------------- |
| Vokal  | 8,64             | 8,10              |
| Davul  | 10,07            | 9,51              |
| Bas    | 8,97             | 8,97              |
| Diğer  | 5,98             | 5,54              |

- Ayırma süresi: sesin süresinin 1,11 katı (yüklü bulut makinesi, CPU, 4 çekirdek; başka ölçümlerle paylaşıldı).
- 16 şarkı küçük bir örnek; karşılaştırma için 50'si tamamlanacak. Bir şarkının süre alanı kabuk tırnak hatasıyla boş
  yazılmıştı; arşivdeki dosya boyutundan ((bayt − 44) / 176 400) yeniden hesaplandı, ölçümleri değişmedi.
- Ölçüm makinenin yükü yüzünden durduruldu (ritim ölçümüne yer açmak için); yeni oturumda kaldığı yerden sürer.

## Hız: sıralı akış neden yavaştı (7 Kasım 2026, iki denetim)

Şarkı başına ~6 dk'nın (~350 sn) dökümü, iki ayrı ölçümle (biri bağımsız denetçi):

| Aşama              | Süre (sn) | Kullanılan çekirdek (4'ten) |
| ------------------ | --------- | --------------------------- |
| İndirme (zip'ten)  | ~90–130   | ~0,1 (ağ bekler)            |
| Demucs             | ~100–150  | ~3,1                        |
| museval (BSS Eval) | ~140      | ~1,1 (tek iş parçacığı)     |

- Zamanın üçte ikisinde makine neredeyse boştaydı: aşamalar sırayla çalışıyordu. Hata değil, akışın biçimi.
- Çözüm: [`ayir_hat.sh`](ayir_hat.sh). Şarkı N ayrılırken N−1 ölçülür ve N+1 indirilir. Komutlar aynı, museval
  sonuçları bit bit aynı. Beklenen süre kalan 29 şarkı için ~3,1 saat yerine ~1,2 saat.
- Bağımsız denetimin eklediği iki önlem:
  - **Çekirdek:** Demucs 3 iş parçacığıyla çalışır. torch'un 4 iş parçacığı makineyi başka işle paylaşınca çok
    yavaşlıyor: iki şarkıda ayırma sesin 3,5–4,5 katı sürmüştü (889 ve 1252 sn). Eski "yavaş" izlenimi buradan.
  - **Bellek:** museval'in FFT boyu şarkının uzunluğuyla 2'nin kuvvetine çıkar. Uzun şarkıda (2^25, > ~330 sn)
    ~11,7 GB ister, Demucs ile üst üste gelirse 16 GB'ı aşabilir; bu yüzden tek başına çalışır. Ölçülen en yüksek
    bellek, üst üste çalışırken 9,4 GB.
- **Demucs tekrarlanabilir değil:** `--shifts 1` varsayılanında kaydırma rastgele seçiliyor, tohum yok
  (`demucs/apply.py`). Aynı şarkıyı yeniden ayırmak SDR'yi biraz değiştirir; museval'in kendisi belirlenimcidir.
- **İndirme daha da hızlanabilir:** tek bağlantı ~1 MB/sn, 4 paralel aralık isteği ~3,5 MB/sn (denetçinin ölçümü).
  Boru hattında indirme zaten başka işin arkasında kaldığı için şimdilik yapılmadı.

## Sırada

1. HTDemucs'u 50 şarkıya tamamla.
2. SCNet XL IHF ve BS-RoFormer (ağırlıklar indirildi; ZFTurbo'nun MIT kodunu çalıştırmak sahibinin onayını bekliyor),
   harman.
3. Lyraska'nın ölçütleri (başlangıç F1, zarf ilintisi) ve kazananın Lyraska'ya yolu.
