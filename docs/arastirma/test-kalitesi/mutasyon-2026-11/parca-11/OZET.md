# Mutasyon taraması — parça 11/32

- Araç: cargo-mutants 27.1.0, `--shard 11/32 --sharding round-robin`, `--in-place`, `--timeout 300`
- Kapsam: `src/audio/**`, `src/analysis/**` (`audio/output/wasapi.rs` hariç), yalnızca `--lib` testleri
- Tarih: 6 Kasım 2026, 06:42–13:30 UTC (yaklaşık 7 saat)

| Sonuç                  | Sayı |
| ---------------------- | ---: |
| Toplam bozma           |  287 |
| Yakalanan (caught)     |  228 |
| Kaçan (missed)         |   42 |
| Zaman aşımı (timeout)  |    3 |
| Derlenmeyen (unviable) |   14 |

Kaçanlar `missed.txt` içinde; sınıflaması ana oturumda yapılacak.
