# Mutasyon taraması — parça 14/32 özeti

`cargo mutants` 27.1.0, `src/audio/**` ve `src/analysis/**` (`output/wasapi.rs` hariç), round-robin parça 14/32,
`--in-place --no-shuffle --timeout 300 --build-timeout 900 --lib`.

| Sonuç                  | Sayı |
| ---------------------- | ---: |
| Toplam                 |  287 |
| Yakalanan (caught)     |  220 |
| Kaçan (missed)         |   58 |
| Zaman aşımı (timeout)  |    1 |
| Derlenmeyen (unviable) |    8 |

Süre: yaklaşık 6 sa 49 dk (6 Kasım 2026, bozma başına ~1,4 dk).

Kaçanların sınıflaması ana oturumda yapılacak (`missed.txt`).
