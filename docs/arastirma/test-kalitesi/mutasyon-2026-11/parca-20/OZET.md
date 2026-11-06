# Mutasyon taraması — parça 20/32 özeti

`cargo mutants` 27.1.0; kapsam `src/audio/**` ve `src/analysis/**` (`src/audio/output/wasapi.rs` hariç);
`--shard 20/32 --sharding round-robin`, `--in-place`, zaman aşımı 300 sn, yalnızca `--lib` testleri.

| Sonuç        | Sayı |
| ------------ | ---: |
| Toplam       |  287 |
| Yakalanan    |  215 |
| Kaçan        |   53 |
| Zaman aşımı  |    4 |
| Derlenmeyen  |   15 |

Süre: yaklaşık 7 saat 28 dakika (6 Kasım 2026, 06:42–14:10 UTC; ısınma derlemesi hariç). Bozmasız temel
derleme 24 sn, testler 66 sn.

Kaçanlar `missed.txt` içindedir; sınıflandırma ana oturumda yapılacak.
