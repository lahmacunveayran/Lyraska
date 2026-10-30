# Rust hizalayıcının doğrulaması (30 Ekim 2026)

`src-tauri/src/analysis/lyrics_align.rs` denetimin Python yöntemiyle (`denetim/betikler/hiza2.py`, `guven2.py`)
aynı veride karşılaştırıldı: denetimin önbelleğe aldığı gerçek model çıktıları (Omnilingual CTC 300M, 113 şarkı:
JamendoLyrics, Türk sanat müziği, Türkçe vekil set; ses ve model depoda yok).

- `disa_aktar.py`: her şarkının emisyonunu, sözünü, doğru satır başlarını ve Python'un sonuçlarını dışa verir
  (denetimin `betikler/` klasöründen, onun Python ortamıyla çalıştırılır).
- `karsilastir.rs`: Rust hizalayıcıyı `#[path]` ile içeri alıp aynı şarkılarda çalıştırır (`Cargo.toml.ornek` →
  `Cargo.toml`, `src/main.rs`; `cargo run --release`).

## Sonuç

| set     | bölüm      | satır | ≤0,3 sn Rust | ≤0,3 sn Python | Rust≠Python (>1 kare, atlanmayan satır) | AUROC Rust | AUROC Python | işaretli | yakalanan büyük hata | işaretsizde >1 sn |
| ------- | ---------- | ----- | ------------ | -------------- | --------------------------------------- | ---------- | ------------ | -------- | -------------------- | ----------------- |
| jamendo | dogrulama  | 838   | %97.7        | %97.6          | 0                                       | 0.984      | 0.976        | %5.8     | 13/14                | %0.1              |
| jamendo | gelistirme | 841   | %94.1        | %94.1          | 0                                       | 0.981      | 0.961        | %9.5     | 36/40                | %0.5              |
| jamendo | son_sinama | 1704  | %93.0        | %93.0          | 0                                       | 0.969      | 0.945        | %8.2     | 83/95                | %0.8              |
| makam   | dogrulama  | 93    | %100.0       | %100.0         | 0                                       | NaN        | NaN          | %1.1     | 0/0                  | %0.0              |
| makam   | gelistirme | 82    | %92.7        | %92.7          | 0                                       | 0.206      | 0.206        | %0.0     | 0/2                  | %2.4              |
| makam   | son_sinama | 145   | %97.9        | %97.9          | 0                                       | NaN        | NaN          | %0.0     | 0/0                  | %0.0              |
| vekil   | dogrulama  | 120   | %99.2        | %99.2          | 0                                       | 0.588      | 0.588        | %0.8     | 0/1                  | %0.8              |
| vekil   | gelistirme | 120   | %95.8        | %95.8          | 0                                       | 1.000      | 0.962        | %11.7    | 5/5                  | %0.0              |
| vekil   | son_sinama | 222   | %99.5        | %99.5          | 0                                       | 0.932      | 0.932        | %1.4     | 0/1                  | %0.5              |

- **Yerleşim birebir aynı:** atlanmayan satırların hiçbirinde Rust ile Python arasında bir kareden (20 ms) büyük
  fark yok; 0,3 sn içinde kalan oranlar denetimin tablosuyla aynı (Jamendo son sınama %93,0). Atlanan satırın yeri
  bilerek farklı: Python onu bir sonraki satırın başına koyar, Rust sıfır uzunlukla önceki satırın sonuna (bağımsız
  incelemenin bulgusu: satırların sırası geri gitmesin).
- **Güven:** AUROC Python'unkiyle aynı ya da daha iyi (Jamendo son sınama 0,969 / 0,945). Fark: Python güveni düz
  CTC yerleşimine göre ölçüyordu, Rust son (satır atlamalı) yerleşime göre.
- **Hız ve bellek** (bu makine, tek iş parçacığı): 21 132 sn ses 158,8 sn'de, gerçek zamanın 0,008 katı (4 dk şarkı
  ~2 sn; model çalıştırmanın süresi bunun dışında). Tepe bellek 120 MB (en büyük şarkı: 5,6 dk, 2472 etiket).
- Makam satırları denetimdeki gibi işaretli bölümler art arda (tam kayıt değil). **Şarkı hükmü** (sözler doğru): 60 iyi, 49 "bazı satırlar tahmini", 4 "oturmadı". Dördünde de hizalama gerçekten
  bozuk (ortalama hata 1,5–42 sn); uyarı yerinde.
