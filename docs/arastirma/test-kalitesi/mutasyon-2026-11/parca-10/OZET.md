# Mutasyon taraması — parça 10/32 özeti

`cargo mutants` 27.1.0; `src/audio/**` ve `src/analysis/**` (`output/wasapi.rs` hariç),
`--shard 10/32 --sharding round-robin`, `--timeout 300`, `--lib`. Tarih: 6 Kasım 2026.

| Sonuç              | Sayı |
| ------------------ | ---: |
| Toplam             |  287 |
| Yakalanan (caught) |  222 |
| Kaçan (missed)     |   50 |
| Zaman aşımı        |    3 |
| Derlenmeyen        |   12 |

Süre: tarama yaklaşık 8 saat (ilk çalıştırma 2 sa 6 dk + ikinci 5 sa 54 dk); başlangıçtan bitişe 8 sa 51 dk.
Bozma başına ~25 sn derleme + ~65 sn test.

## Not: tarama iki çalıştırmada yapıldı

İlk çalıştırma 76 bozmadan sonra (09:14) yarıda kesildi: onu bekleyen arka plan işi süre sınırında
öldürülürken süreç de gitti. Yarıda kalan bozma kaynağa geri alındı. Kalan 211 bozma, parçanın
`--list` çıktısından tam adlarıyla (`-F '^ad$'`) ayrı bir çalıştırmada denendi. 27.1.0'da `-F`/`-E`
süzgeçleri "delete field" türü bozmalara uygulanmıyor; bu yüzden ikinci çalıştırma parça dışı
15 bozmayı da denedi (226). Buradaki dosyalar ikisinin birleşimidir: yalnızca parça 10 listesindeki
287 ad alındı; temel (bozulmamış) çalıştırma ilk çalıştırmadandır. `outcomes.json` cargo-mutants'ın
kendi dosyası değil, bu birleşimdir (`not` alanı).
