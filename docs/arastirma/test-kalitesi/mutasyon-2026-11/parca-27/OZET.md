# Mutasyon taraması — parça 27/32 özeti

- Araç: cargo-mutants 27.1.0, `--in-place --no-shuffle --shard 27/32 --sharding round-robin`
- Kapsam: `src/audio/**/*.rs`, `src/analysis/**/*.rs` (`src/audio/output/wasapi.rs` hariç), `--lib` testleri
- Zaman sınırları: test 300 sn, derleme 900 sn
- Başlangıç: 6 Kasım 2026 06:44 UTC; bitiş: 14:22 UTC; süre: 7 sa 38 dk

| Sonuç                 | Sayı |
| --------------------- | ---: |
| Toplam                |  287 |
| Yakalanan (caught)    |  224 |
| Kaçan (missed)        |   52 |
| Zaman aşımı (timeout) |    4 |
| Derlenmeyen (unviable)|    7 |

Kaçanlar `missed.txt` içinde; sınıflandırması ana oturumda yapılacak.
