# Mutasyon taraması — parça 6/32 özeti

`cargo mutants` 27.1.0, ses yolu ve analiz modülleri (`src/audio/**`, `src/analysis/**`; `wasapi.rs` hariç),
`--shard 6/32 --sharding round-robin`, `--timeout 300`, `--lib`.

| Sonuç       | Sayı |
| ----------- | ---- |
| Toplam      | 287  |
| Yakalanan   | 220  |
| Kaçan       | 55   |
| Zaman aşımı | 2    |
| Derlenmeyen | 10   |

Süre: 7 sa 3 dk (06:39:54 – 13:42:51 UTC, 6 Kasım 2026).

Kaçanlar `missed.txt` dosyasında; sınıflandırma ana oturumda yapılacak.
