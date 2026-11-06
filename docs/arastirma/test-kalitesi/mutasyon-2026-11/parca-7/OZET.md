# Mutasyon taraması — parça 7/32

`cargo mutants` 27.1.0; `src/audio/**` ve `src/analysis/**` (`output/wasapi.rs` hariç), `--shard 7/32 --sharding round-robin`,
`--timeout 300 --build-timeout 900`, `--lib`, `--in-place`.

| Sonuç                  | Sayı |
| ---------------------- | ---: |
| Toplam                 |  287 |
| Yakalanan (caught)     |  224 |
| Kaçan (missed)         |   52 |
| Zaman aşımı (timeout)  |    0 |
| Derlenmeyen (unviable) |   11 |

Süre: yaklaşık 7 saat (6 Kasım 2026, 06:39 – 13:40 UTC). Kaçanların listesi `missed.txt` içinde; sınıflama ana
oturumda yapılacak.
