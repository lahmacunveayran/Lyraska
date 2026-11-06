# Mutasyon taraması — parça 15/32 özeti

- Araç: cargo-mutants 27.1.0, `--shard 15/32 --sharding round-robin`, `--in-place`, `--lib`
- Kapsam: `src/audio/**/*.rs`, `src/analysis/**/*.rs` (`src/audio/output/wasapi.rs` hariç)
- Başlangıç taban: `main` 55956ba
- Süre: yaklaşık 7 saat (6 Kasım 2026, 06:41–13:13 UTC), 4 çekirdek

| Sonuç       | Sayı |
| ----------- | ---: |
| Toplam      |  287 |
| Yakalanan   |  212 |
| Kaçan       |   61 |
| Zaman aşımı |    3 |
| Derlenmeyen |   11 |

Kaçanların listesi `missed.txt` içinde; sınıflandırması ana oturumda yapılacak.
