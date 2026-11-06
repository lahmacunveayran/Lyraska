# Mutasyon taraması — parça 30/32

- Araç: `cargo-mutants` 27.1.0, `--shard 30/32 --sharding round-robin`, `--in-place --no-shuffle`
- Kapsam: `src/audio/**/*.rs`, `src/analysis/**/*.rs` (`src/audio/output/wasapi.rs` hariç), yalnızca `--lib` testleri
- Taban: `main` @ `55956ba`
- Süre: yaklaşık 7 sa 12 dk (432 dk)

| Sonuç                    | Sayı |
| ------------------------ | ---: |
| Toplam                   |  287 |
| Yakalanan (caught)       |  229 |
| Kaçan (missed)           |   45 |
| Zaman aşımı (timeout)    |    2 |
| Derlenmeyen (unviable)   |   11 |

Kaçanların listesi `missed.txt` dosyasındadır; sınıflandırma ana oturumda yapılacak.
