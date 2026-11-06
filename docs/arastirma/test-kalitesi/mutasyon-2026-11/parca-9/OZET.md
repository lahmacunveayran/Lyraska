# Mutasyon taraması — parça 9/32 özeti

`cargo mutants` 27.1.0; `src/audio/**` ve `src/analysis/**` (`output/wasapi.rs` hariç), `--shard 9/32 --sharding round-robin`,
`--in-place`, `--timeout 300`, yalnızca `--lib` testleri.

| Sonuç                  | Sayı |
| ---------------------- | ---: |
| Toplam                 |  287 |
| Yakalanan (caught)     |  221 |
| Kaçan (missed)         |   50 |
| Zaman aşımı (timeout)  |    1 |
| Derlenmeyen (unviable) |   15 |

Süre: 7 sa 0 dk (6 Kasım 2026, 06:40 – 13:40 UTC).

Kaçanların listesi `missed.txt` dosyasındadır; sınıflama ana oturumda yapılacak.
