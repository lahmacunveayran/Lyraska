# Mutasyon taraması — parça 22/32

- Araç: cargo-mutants 27.1.0, `--shard 22/32 --sharding round-robin`, `--in-place`, `--lib`
- Kapsam: `src/audio/**`, `src/analysis/**` (`src/audio/output/wasapi.rs` hariç)
- Tarih: 6 Kasım 2026, süre: 6 sa 57 dk

| Sonuç                   | Sayı |
| ----------------------- | ---: |
| Toplam                  |  287 |
| Yakalanan (caught)      |  229 |
| Kaçan (missed)          |   43 |
| Zaman aşımı (timeout)   |    7 |
| Derlenmeyen (unviable)  |    8 |

Kaçanlar `missed.txt` içinde; sınıflaması ana oturumda yapılacak.
