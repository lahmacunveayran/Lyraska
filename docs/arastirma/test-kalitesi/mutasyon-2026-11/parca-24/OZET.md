# Mutasyon taraması — parça 24/32 özeti

`cargo mutants` 27.1.0; kapsam `src/audio/**`, `src/analysis/**` (`audio/output/wasapi.rs` hariç), round-robin parça 24/32.

| Sonuç             | Sayı |
| ----------------- | ---: |
| Toplam            |  287 |
| Yakalanan         |  226 |
| Kaçan             |   48 |
| Zaman aşımı       |    3 |
| Derlenmeyen       |   10 |

Süre: 6 Kasım 2026, 06:43–16:10 UTC; fiilî tarama yaklaşık 7 sa 15 dk (bozma başına ~1,5 dk).

## Çalıştırma notları

- Makine iki kez yeniden başladı (yaklaşık 08:48 ve 10:50); tarama üç çalıştırmada tamamlandı. İkinci
  çalıştırma parça 24'e ait hiçbir bozmayı bitiremedi.
- Yeniden başlatmada `--iterate` kullanılmadı: öncekileri parçalamadan önce çıkardığı için parça üyeliği kayar.
  Bunun yerine parçanın tam listesi (`--list --shard 24/32`) eksi bitenler, tam ad regex'iyle `-F` ve parçasız
  çalıştırıldı.
- cargo-mutants 27.1.0'da "delete field ... from struct ... expression" bozmaları `-F`/`-E` süzgecine uymuyor;
  15 başka parçanın bozması da çalıştı ve sonuçlardan çıkarıldı. Buradaki dosyalarda yalnızca parça 24 listesi var.
- Sonuçlarda kaynakta kalmış bozma yok (`src-tauri/src` temiz).
