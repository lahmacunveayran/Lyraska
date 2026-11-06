# Mutasyon taraması — parça 23/32 (özet)

Tarih: 6 Kasım 2026. Araç: cargo-mutants 27.1.0, `--shard 23/32 --sharding round-robin`, kapsam
`src/audio/**` ve `src/analysis/**` (`src/audio/output/wasapi.rs` hariç), `--timeout 300`, yalnızca `--lib` testleri.

| Sonuç                  | Sayı |
| ---------------------- | ---- |
| Toplam bozma           | 287  |
| Yakalanan (caught)     | 233  |
| Kaçan (missed)         | 41   |
| Zaman aşımı (timeout)  | 3    |
| Derlenmeyen (unviable) | 10   |

Süre: yaklaşık 7 saat (417 dk; ısınma derlemesi hariç).

Kaçanlar `missed.txt` dosyasında; sınıflandırma ana oturumda yapılacak.
