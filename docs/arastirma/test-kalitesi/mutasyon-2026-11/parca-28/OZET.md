# Mutasyon taraması — parça 28/32 özeti

`cargo mutants` 27.1.0, `src/audio/**` ve `src/analysis/**` (`output/wasapi.rs` hariç),
`--shard 28/32 --sharding round-robin`, `--timeout 300`, yalnızca `--lib` testleri.

| Sonuç                     | Sayı |
| ------------------------- | ---: |
| Toplam bozma              |  287 |
| Yakalanan (caught)        |  219 |
| Kaçan (missed)            |   44 |
| Zaman aşımı (timeout)     |    4 |
| Derlenmeyen (unviable)    |   20 |

Süre: 7 sa 20 dk (6 Kasım 2026, 06:44 – 14:04 UTC).

Kaçanların listesi `missed.txt` dosyasındadır; sınıflaması ana oturumda yapılacak.
