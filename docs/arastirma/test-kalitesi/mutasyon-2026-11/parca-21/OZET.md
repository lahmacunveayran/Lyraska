# Mutasyon taraması — parça 21/32 özeti

- Kapsam: `src/audio/**/*.rs`, `src/analysis/**/*.rs` (`src/audio/output/wasapi.rs` hariç), `--shard 21/32 --sharding round-robin`
- Araç: cargo-mutants 27.1.0, `--in-place --no-shuffle --timeout 300 --build-timeout 900`, yalnızca `--lib` testleri
- Tarih: 6 Kasım 2026

| Sonuç                   | Sayı |
| ----------------------- | ---: |
| Toplam                  |  287 |
| Yakalanan (caught)      |  222 |
| Kaçan (missed)          |   51 |
| Zaman aşımı (timeout)   |    7 |
| Derlenmeyen (unviable)  |    7 |

- Süre: yaklaşık 7 sa 32 dk (cargo-mutants'ın bildirdiği: 8 sa; ısınma derlemesi hariç)
- Kaçanlar `missed.txt` içinde; sınıflandırma ana oturumda yapılacak.
