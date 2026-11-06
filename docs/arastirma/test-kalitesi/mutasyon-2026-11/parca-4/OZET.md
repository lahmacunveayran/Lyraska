# Mutasyon taraması — parça 4/32 özeti

cargo-mutants 27.1.0, `--shard 4/32 --sharding round-robin`, kapsam: `src/audio/**` ve `src/analysis/**`
(`src/audio/output/wasapi.rs` hariç), yalnızca `--lib` testleri, zaman aşımı 300 sn.

| Sonuç                   | Sayı |
| ----------------------- | ---: |
| Toplam                  |  288 |
| Yakalanan (caught)      |  212 |
| Kaçan (missed)          |   60 |
| Zaman aşımı (timeout)   |    1 |
| Derlenmeyen (unviable)  |   15 |

Süre: yaklaşık 7 saat (6 Kasım 2026, 06:39 – 13:47 UTC; 4 çekirdek).

Kaçanların listesi `missed.txt` dosyasında; sınıflandırması ana oturumda yapılacak.
