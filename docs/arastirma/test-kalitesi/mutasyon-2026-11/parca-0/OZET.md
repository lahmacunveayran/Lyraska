# Mutasyon taraması — parça 0/32 (6 Kasım 2026)

Kapsam: `src/audio/**` ve `src/analysis/**` (`output/wasapi.rs` hariç), `cargo-mutants` 27.1.0,
`--shard 0/32 --sharding round-robin`, `--timeout 300`, yalnızca `--lib` testleri.

| Sonuç                  | Sayı |
| ---------------------- | ---: |
| Toplam                 |  288 |
| Yakalanan (caught)     |  231 |
| Kaçan (missed)         |   46 |
| Zaman aşımı (timeout)  |    1 |
| Derlenmeyen (unviable) |   10 |

Süre: yaklaşık 7 saat (6 Kasım 2026, 06:35–13:22 UTC; bozma başına ~22 sn derleme + ~57 sn test).

Yakalanma oranı (derlenenler içinde, zaman aşımı yakalanmış sayılır): 232 / 278 ≈ %83,5.

Kaçanların listesi `missed.txt`'te; sınıflandırma ana oturumda yapılacak.
