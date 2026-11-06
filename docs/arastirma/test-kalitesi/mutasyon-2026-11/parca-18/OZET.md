# Mutasyon taraması — parça 18/32 özeti

- Araç: cargo-mutants 27.1.0, `--in-place --no-shuffle --shard 18/32 --sharding round-robin`
- Kapsam: `src/audio/**/*.rs`, `src/analysis/**/*.rs` (`src/audio/output/wasapi.rs` hariç), yalnızca `--lib` testleri
- Zaman aşımı: test 300 sn, derleme 900 sn
- Başlangıç: 6 Kasım 2026, 06:42 UTC; süre: yaklaşık 6 sa 42 dk (cargo-mutants "7h" bildirdi)

| Sonuç            | Sayı |
| ---------------- | ---- |
| Toplam           | 287  |
| Yakalanan        | 226  |
| Kaçan            | 50   |
| Zaman aşımı      | 3    |
| Derlenmeyen      | 8    |

Yakalanma oranı (derlenenler içinde, zaman aşımı yakalanmış sayılarak): 229 / 279 ≈ %82,1.

Kaçanların listesi `missed.txt`'de; sınıflandırma ana oturumda yapılacak.
