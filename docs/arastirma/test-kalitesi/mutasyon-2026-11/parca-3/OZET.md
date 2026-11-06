# Mutasyon taraması — parça 3/32 özeti

`cargo mutants` 27.1.0, `--shard 3/32 --sharding round-robin`, kapsam `src/audio/**` ve `src/analysis/**`
(`src/audio/output/wasapi.rs` hariç), `--in-place`, `--lib`, zaman aşımı 300 sn. Taranan kod: `main` @ `55956ba`.

| Sonuç                     | Sayı |
| ------------------------- | ---: |
| Toplam bozma              |  288 |
| Yakalanan (caught)        |  211 |
| Kaçan (missed)            |   64 |
| Zaman aşımı (timeout)     |    1 |
| Derlenmeyen (unviable)    |   12 |

Süre: yaklaşık 6 saat (cargo-mutants'ın bildirdiği; temel test turu dahil duvar saati 6 sa 22 dk), 4 çekirdek.

Kaçanlar `missed.txt` içinde; sınıflaması ana oturumda yapılacak.
