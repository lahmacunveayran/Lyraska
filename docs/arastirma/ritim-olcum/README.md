# Ritim analizinin standart setlerde ölçümü

Genel taramanın ([`../genel-tarama/SENTEZ.md`](../genel-tarama/SENTEZ.md)) iki taramasının da birinci sıraya koyduğu açık:
Lyraska'nın vuruş, ölçü başı ve tempo analizi bugüne kadar alanın ortak test setlerinde ölçülmemişti. Bu klasör o
ölçümün sonuçlarını tutar. Ses dosyaları depoya girmez (yalnızca ölçümü yapan makinede, geçici klasörde durur);
burada yalnızca araç, parça adları ve sayılar var.

## Araç

`src-tauri/examples/ritim_olcum.rs`:

```
cargo run --release --example ritim_olcum -- <ses klasörü> <işaret klasörü> <sonuç klasörü>
```

İşaretler satır başına "zaman vuruş_no" biçiminde `.beats` dosyalarıdır (`1` ölçü başı). Ölçütler:

- **Vuruş F-ölçüsü:** ±70 ms pencere, en büyük eşleştirme (mir_eval `beat.f_measure` ile aynı; `evaluate.rs`).
  Ayrıca ilk 5 sn'si atılmış hâli (mir_eval `trim_beats`, MIREX kuralı).
- **Ölçü başı F-ölçüsü:** ±70 ms.
- **Tempo:** ACC1 (±%4) ve ACC2 (±%4; ×2, ×½, ×3, ×⅓ oktav hataları dahil). Gerçek tempo işaretli vuruş
  aralıklarının ortancası.

## Ballroom (6 Kasım 2026)

- **Set:** Gouyon ve ark. 2006, 698 parça, 30 sn, sekiz dans türü. Sesler MTG-UPF'den
  (`mtg.upf.edu/ismir2004/contest/tempoContest/data1.tar.gz`). Vuruş ve ölçü başı işaretleri Krebs ve ark. 2013
  (GitHub `CPJKU/BallroomAnnotations`; depoda lisans dosyası yok, yalnızca yerel ölçüm).
- **Lyraska'nın analizi hiçbir veriyle eğitilmedi:** bu set onun için tümüyle görülmemiş.
- **Hız:** parça başına ortalama 0,18 sn (bulut makinesi, 4 çekirdek).
- **Ham sonuçlar:** [`ballroom-2026-11-06.jsonl`](ballroom-2026-11-06.jsonl) (parça başına).

| Tür                 | Parça   | Vuruş F   | Vuruş F (5 sn kırpık) | Ölçü başı F | ACC1      | ACC2      |
| ------------------- | ------- | --------- | --------------------- | ----------- | --------- | --------- |
| ChaChaCha           | 111     | 0,908     | 0,915                 | 0,422       | 0,982     | 0,982     |
| Jive                | 60      | 0,797     | 0,814                 | 0,443       | 0,583     | 1,000     |
| Quickstep           | 82      | 0,624     | 0,629                 | 0,258       | 0,110     | 0,951     |
| Rumba-American      | 7       | 0,895     | 0,898                 | 0,857       | 1,000     | 1,000     |
| Rumba-International | 51      | 0,830     | 0,828                 | 0,729       | 0,843     | 1,000     |
| Rumba-Misc          | 40      | 0,743     | 0,751                 | 0,610       | 0,718     | 1,000     |
| Samba               | 86      | 0,792     | 0,795                 | 0,551       | 0,837     | 0,965     |
| Tango               | 86      | 0,902     | 0,916                 | 0,460       | 0,977     | 0,977     |
| VienneseWaltz       | 65      | 0,704     | 0,703                 | 0,698       | 0,475     | 0,836     |
| Waltz               | 110     | 0,678     | 0,684                 | 0,587       | 0,585     | 1,000     |
| **Hepsi**           | **698** | **0,780** | **0,786**             | **0,514**   | **0,696** | **0,969** |

### Okuma

- **Tipik parçada vuruş çok iyi:** ortanca vuruş F 0,941. Ortalamayı düşüren tempo oktavı hataları.
- **Tempo oranı** (bulunan / gerçek), 698 parça:
  - doğru 471;
  - yarı 115, iki kat 68;
  - 2/3 ya da 3/2: 10;
  - üçte bir ya da üç kat: 2;
  - diğer 11;
  - tempo bulunamadı 21.

  Yani hataların büyük çoğunluğu oktav seçiminde (ACC2 0,969). En kötüsü Quickstep: ~200 BPM yarıya iniyor.

- **Ölçü başı en zayıf yer:** ortalama 0,514, ortanca 0,621. Üç zamanlı danslarda (Vals, Viyana valsi) ölçü 3
  bulunsa da tempo yarıya ya da iki katına kaçınca ölçü başı da kayıyor.
- **Yol haritası hedefi** "beat F ≥ 0,80" bu sette az farkla tutmuyor (0,780).

### Karşılaştırma (dikkatle)

Bu sette **eğitilmiş** yapay sinir ağı takipçilerinin yayımlanmış sonuçları (sekiz katlı çapraz doğrulama) vuruşta
yaklaşık 0,94, ölçü başında yaklaşık 0,86. Kaynak: Böck, Krebs, Widmer 2016, ISMIR, "Joint beat and downbeat tracking
with recurrent neural networks"; sayılar birincil kaynaktan yeniden okunacak. Beat This bu seti eğitimde kullandığı
için burada adil karşılaştırılamaz; onun için GTZAN (Beat This'in görmediği test seti) ölçülecek.

## Sırada

1. GTZAN (Beat This'in test seti; Hugging Face `marsyas/gtzan`, işaretler GitHub'da) aynı araçla.
2. Ritim paketi (Beat This, MIT): aynı tabloda Lyraska ile yan yana; hedef oktav hatalarını ve ölçü başını düzeltmek.
3. Tempo oktavı seçimi (`tempo.rs`): Quickstep ve Viyana valsi gibi hızlı türlerde yarıya inme; sonuç bu tabloyla.
