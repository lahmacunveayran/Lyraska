# Mutasyon taraması — parça 2/32 özeti

`cargo mutants` 27.1.0, `--shard 2/32 --sharding round-robin`; kapsam `src/audio/**` ve `src/analysis/**`
(`src/audio/output/wasapi.rs` hariç), `--lib` testleri, zaman aşımı 300 sn.

| Sonuç                  | Sayı |
| ---------------------- | ---: |
| Toplam bozma           |  288 |
| Yakalanan (caught)     |  220 |
| Kaçan (missed)         |   55 |
| Zaman aşımı (timeout)  |    0 |
| Derlenmeyen (unviable) |   13 |

Süre: 6 sa 30 dk (06:39 – 13:09 UTC, 6 Kasım 2026). Kaçanların listesi `missed.txt`; sınıflama ana oturumda
yapılacak.
