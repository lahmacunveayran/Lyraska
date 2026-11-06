# Mutasyon taraması — parça 25/32

`cargo mutants` 27.1.0, `src/audio/**` ve `src/analysis/**` (`output/wasapi.rs` hariç), `--shard 25/32 --sharding round-robin`,
`--timeout 300 --build-timeout 900`, `--lib`. Tarih: 6 Kasım 2026.

| Sonuç                  | Sayı |
| ---------------------- | ---- |
| Toplam                 | 287  |
| Yakalanan (caught)     | 230  |
| Kaçan (missed)         | 44   |
| Zaman aşımı (timeout)  | 2    |
| Derlenmeyen (unviable) | 11   |

Süre: yaklaşık 8 saat (06:45 – 14:34 UTC). Kaçanların listesi `missed.txt`'te; sınıflama ana oturumda yapılacak.
