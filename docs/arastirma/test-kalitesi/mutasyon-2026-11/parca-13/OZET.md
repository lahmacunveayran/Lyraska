# Mutasyon taraması — parça 13/32 özeti

- Araç: cargo-mutants 27.1.0, `--in-place --no-shuffle --sharding round-robin --shard 13/32`
- Kapsam: `src/audio/**/*.rs`, `src/analysis/**/*.rs` (`src/audio/output/wasapi.rs` hariç), `--lib` testleri
- Zaman aşımı: test 300 sn, derleme 900 sn
- Tarih: 6 Kasım 2026, 06:42–13:07 UTC (yaklaşık 6 saat 25 dk; temel ölçüm 21 sn derleme + 56 sn test)

| Sonuç                | Sayı |
| -------------------- | ---: |
| Toplam               |  287 |
| Yakalanan (caught)   |  217 |
| Kaçan (missed)       |   55 |
| Zaman aşımı          |    3 |
| Derlenmeyen          |   12 |

Kaçanların listesi `missed.txt`'te; sınıflandırma ana oturumda yapılacak.
