# Mutasyon taraması — parça 1/32 özeti

- Araç: cargo-mutants 27.1.0, `--shard 1/32 --sharding round-robin`, kapsam `src/audio/**`, `src/analysis/**`
  (`src/audio/output/wasapi.rs` hariç), `--in-place`, `--lib`, zaman aşımı 300 sn.
- Başlangıç: 6 Kasım 2026 06:38 (UTC), bitiş: 13:28 (UTC); süre yaklaşık 6 sa 50 dk.

| Sonuç                  | Sayı |
| ---------------------- | ---: |
| Toplam                 |  288 |
| Yakalanan (caught)     |  213 |
| Kaçan (missed)         |   65 |
| Zaman aşımı (timeout)  |    1 |
| Derlenmeyen (unviable) |    9 |

Kaçanların listesi `missed.txt` içindedir; sınıflama ana oturumda yapılacak.
