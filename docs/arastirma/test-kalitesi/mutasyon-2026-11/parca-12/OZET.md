# Mutasyon taraması — parça 12/32 özeti

- Araç: cargo-mutants 27.1.0, `--shard 12/32 --sharding round-robin`, `--in-place`, `--timeout 300`
- Kapsam: `src/audio/**/*.rs`, `src/analysis/**/*.rs` (`src/audio/output/wasapi.rs` hariç), yalnızca `--lib` testleri
- Süre: 7 sa 1 dk (6 Kasım 2026, 06:40–13:42 UTC)

| Sonuç                  | Sayı |
| ---------------------- | ---: |
| Toplam bozma           |  287 |
| Yakalanan (caught)     |  211 |
| Kaçan (missed)         |   56 |
| Zaman aşımı (timeout)  |    4 |
| Derlenmeyen (unviable) |   16 |

Kaçanlar `missed.txt` içindedir; sınıflandırma ana oturumda yapılacak.
