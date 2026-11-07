# MUSDB18-HQ ölçümü

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

## HTDemucs, 50 şarkı (7 Kasım 2026)

| Kaynak | SDR ortanca (dB) | SDR ortalama (dB) |
| ------ | ---------------- | ----------------- |
| Vokal  | 8,89             | 7,99              |
| Davul  | 10,07            | 10,07             |
| Bas    | 9,76             | 8,90              |
| Diğer  | 6,46             | 6,01              |

- Şarkı başına değer: pencerelerin ortancası (SiSEC 2018); tablo şarkılar arasında ortanca ve ortalama.
- Ham sonuçlar: [`htdemucs-2026-11-07.jsonl`](htdemucs-2026-11-07.jsonl) (50 şarkı; ilk 21'i sıralı akışla, son 29'u
  boru hattıyla, `es_zamanli: true`). İlk 16'nın ara dosyası [`htdemucs-ara-2026-11-06.jsonl`](htdemucs-ara-2026-11-06.jsonl).
- Demucs tohumsuz rastgele kaydırma kullanır (aşağıda): aynı şarkıyı yeniden ayırmak değerleri biraz oynatabilir.
- **Yayımlanmış sonuçla aynı:** makalede (Rouard, Massa, Défossez, arXiv 2211.08553, Tablo 1) ince ayarsız HT Demucs
  davul 10,05, bas 9,78, diğer 6,42, vokal 8,93, ortalama **8,80**; bizimki 10,07 / 9,76 / 6,46 / 8,89, ortalama 8,80.
  Dördü de 0,04 dB içinde: ölçü aleti yayımlanmış sonucu tekrarlıyor. README'nin "9.00 dB"si ince ayarlı modelin
  (`htdemucs_ft`), 9,20 seyrek + ince ayarlının (iki denetim: [`iddia-denetimi/LISTE.md`](../../iddia-denetimi/LISTE.md) 6).
- Boru hattıyla son 29 şarkı 102 dk sürdü (şarkı başına ~3,5 dk; sıralı akışta ~6 dk).

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

1. SCNet XL IHF ve BS-RoFormer (ağırlıkları yeni oturumda yeniden indirilir; ZFTurbo'nun MIT kodunu çalıştırmak
   sahibinin onayını bekliyor), harman. Boru hattı (`ayir_hat.sh`) model komutu değiştirilerek kullanılır.
2. Lyraska'nın ölçütleri (başlangıç F1, zarf ilintisi) ve kazananın Lyraska'ya yolu.
