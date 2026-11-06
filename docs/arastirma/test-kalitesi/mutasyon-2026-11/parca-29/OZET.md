# Mutasyon taraması — parça 29/32 özeti

`cargo mutants` 27.1.0; `src/audio/**` ve `src/analysis/**` (`output/wasapi.rs` hariç), `--shard 29/32 --sharding round-robin`.

| Sonuç       | Sayı |
| ----------- | ---: |
| Toplam      |  287 |
| Yakalanan   |  239 |
| Kaçan       |   40 |
| Zaman aşımı |    1 |
| Derlenmeyen |    7 |

Süre: 8 sa 30 dk tarama (1. çalışma 06:46–08:51, 2. çalışma 10:11–16:31 UTC, 6 Kasım 2026); aradaki kesintilerle
birlikte 9 sa 45 dk.

Not: Konteyner 08:51'de durduğu için tarama iki çalışmada yapıldı. İkinci çalışmada parçanın kalan 213 bozması adlarıyla
(`-F '^ad$'`) seçildi; bu seçime parçada olmayan 15 "delete field" bozması da girdi, onların sonuçları dosyalara
alınmadı. `outcomes.json` iki çalışmanın birleşimidir (ikinci çalışmadan gelenlerde `ikinci_calisma: true`).
Kaçanlar sınıflanmadı; o iş ana oturumda yapılacak.
