# Mutasyon taraması — parça 19/32

`cargo mutants` 27.1.0, `src/audio/**` ve `src/analysis/**` (`output/wasapi.rs` hariç), `--shard 19/32 --sharding round-robin`,
`--timeout 300 --build-timeout 900`, `--lib`, `--in-place`.

| Sonuç       | Sayı |
| ----------- | ---: |
| Toplam      |  287 |
| Yakalanan   |  232 |
| Kaçan       |   37 |
| Zaman aşımı |    5 |
| Derlenmeyen |   13 |

Süre: yaklaşık 7 saat 30 dakika (6 Kasım 2026, 06:44 – 14:13 UTC; 4 çekirdek).

Kaçanlar `missed.txt` içinde; sınıflaması ana oturumda yapılacak.
