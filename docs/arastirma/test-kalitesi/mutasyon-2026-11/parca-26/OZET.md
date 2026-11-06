# Mutasyon taraması — parça 26/32 özeti

- Araç: cargo-mutants 27.1.0, `--shard 26/32 --sharding round-robin`, `--in-place`, `--timeout 300`
- Kapsam: `src/audio/**/*.rs`, `src/analysis/**/*.rs` (`src/audio/output/wasapi.rs` hariç), yalnızca `--lib` testleri
- Başlangıç: 6 Kasım 2026 06:44 UTC; bitiş: 14:16 UTC (süre ≈ 7 sa 32 dk)
- Bozulmamış kod: 23 sn derleme + 61 sn test

| Sonuç | Sayı |
| --- | --- |
| Toplam | 287 |
| Yakalanan (caught) | 212 |
| Kaçan (missed) | 58 |
| Zaman aşımı (timeout) | 4 |
| Derlenmeyen (unviable) | 13 |

Kaçanların listesi `missed.txt`'te; sınıflama ana oturumda yapılacak.
