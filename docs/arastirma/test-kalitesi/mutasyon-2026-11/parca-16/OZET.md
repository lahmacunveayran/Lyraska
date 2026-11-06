# Mutasyon taraması — parça 16/32 özeti

- Araç: `cargo mutants` 27.1.0, `--shard 16/32 --sharding round-robin`, `--in-place`, `--timeout 300`
- Kapsam: `src/audio/**/*.rs` ve `src/analysis/**/*.rs` (`src/audio/output/wasapi.rs` hariç), yalnızca `--lib` testleri
- Başlangıç: 6 Kasım 2026 06:51 UTC; bitiş: 13:24 UTC; süre: yaklaşık 6 sa 34 dk (4 çekirdek)

| Sonuç                   | Sayı |
| ----------------------- | ---: |
| Toplam bozma            |  287 |
| Yakalanan (caught)      |  221 |
| Kaçan (missed)          |   53 |
| Zaman aşımı (timeout)   |    2 |
| Derlenmeyen (unviable)  |   10 |
| Sınıflanmamış başarısız |    1 |

Notlar:

- Sınıflanmamış başarısızlık: `src/audio/abx.rs:315:22: replace + with * in find_offset`. Test süreci normal
  test hatasından başka biçimde sona erdi; `outcomes.json`'da `Failure` olarak geçer, hiçbir `.txt` listesinde yoktur.
  Bozma fark edilmiş sayılabilir.
- İlk denemede temel çalıştırma (bozulmamış ağaç) bir kez başarısız oldu:
  `audio::player::tests::durum_konumun_olculdugu_ani_bildirir`, `tests.rs:2213` (`stop` sonrası `position_at_ms`
  `None` beklenirken bir değer döndü). Tek başına 20/20 geçti; tam takımın yükü altında kararsız. İkinci denemede
  temel çalıştırma geçti. Ana oturumda bakılmalı: tarama sırasında bu test bazı bozmaları yanlışlıkla "yakalanmış"
  gösterebilir.
- Kaçanlar burada sınıflanmadı (ana oturumun işi): `missed.txt`.
