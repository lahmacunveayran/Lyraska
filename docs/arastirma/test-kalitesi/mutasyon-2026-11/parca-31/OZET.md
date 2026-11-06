# Mutasyon taraması — parça 31/32 özeti

Komut: `cargo mutants` 27.1.0, `--shard 31/32 --sharding round-robin`, `src/audio/**` ve `src/analysis/**`
(`audio/output/wasapi.rs` hariç), `--in-place --timeout 300 --cargo-arg=--lib`. Tarih: 6 Kasım 2026.

| Sonuç       | Sayı |
| ----------- | ---: |
| Toplam      |  287 |
| Yakalanan   |  229 |
| Kaçan       |   46 |
| Zaman aşımı |    2 |
| Derlenmeyen |   10 |

Süre: yaklaşık 7 sa 26 dk (4 çekirdekli bulut makinesi).

Kaçanlar `missed.txt` içinde; sınıflandırma ana oturumda yapılacak.
