# Mutasyon taraması — parça 17/32 özeti

`cargo mutants` 27.1.0, `--shard 17/32 --sharding round-robin`, kapsam `src/audio/**` ve `src/analysis/**`
(`src/audio/output/wasapi.rs` hariç), `--in-place`, `--timeout 300`, yalnızca `--lib` testleri.

| Sonuç                  | Sayı |
| ---------------------- | ---: |
| Toplam bozma           |  287 |
| Yakalanan (caught)     |  204 |
| Kaçan (missed)         |   65 |
| Zaman aşımı (timeout)  |    3 |
| Derlenmeyen (unviable) |   15 |

Süre: yaklaşık 6 sa 30 dk (6 Kasım 2026).

Kaçanlar `missed.txt` içindedir; sınıflandırılmaları ana oturumda yapılacak.
