# Mutasyon taraması — parça 8/32 özeti

`cargo mutants` 27.1.0, `--in-place --no-shuffle --shard 8/32 --sharding round-robin`, kapsam
`src/audio/**` ve `src/analysis/**` (`src/audio/output/wasapi.rs` hariç), `--timeout 300 --build-timeout 900`,
yalnızca `--lib` testleri.

| Sonuç                  | Sayı |
| ---------------------- | ---: |
| Toplam bozma           |  287 |
| Yakalanan (caught)     |  210 |
| Kaçan (missed)         |   59 |
| Zaman aşımı (timeout)  |    4 |
| Derlenmeyen (unviable) |   14 |

Süre: 7 sa 2 dk (6 Kasım 2026, 06:38–13:41 UTC), 4 çekirdekli bulut makinesi.

Kaçanların listesi `missed.txt` içindedir; sınıflandırma ana oturumda yapılacak.
