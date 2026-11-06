# Mutasyon taraması — parça 5/32 özeti

`cargo mutants` 27.1.0, `src/audio/**` ve `src/analysis/**` (`audio/output/wasapi.rs` hariç),
`--shard 5/32 --sharding round-robin --in-place --no-shuffle`, `--timeout 300 --build-timeout 900`, `--lib`.

| Sonuç                  | Sayı |
| ---------------------- | ---- |
| Toplam bozma           | 287  |
| Yakalanan (caught)     | 218  |
| Kaçan (missed)         | 58   |
| Zaman aşımı (timeout)  | 1    |
| Derlenmeyen (unviable) | 10   |

Süre: 6 sa 59 dk (06 Kasım 2026, 06:39 – 13:39 UTC). Yakalama oranı (derlenenler içinde, zaman aşımı yakalanmış
sayılarak): 219 / 277 ≈ %79.

Kaçanların listesi `missed.txt`'te; sınıflandırma ana oturumda yapılacak.
