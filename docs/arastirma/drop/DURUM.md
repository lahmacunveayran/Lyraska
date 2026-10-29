# Drop 2. sürüm — durum ve karar bekleyen sonuçlar (29 Ekim 2026)

Proje sahibinin kararı: sonuçlar ileride kullanılmak üzere saklanır, iş en sona bırakılır ("Buna en son bakarız").
Kod bu dalda (`drop-v2`, GitHub yedeği `claude/clever-euler-pmhee7-yedek-drop`), `main`'e girmedi.

## Ne yapıldı

- `src-tauri/src/analysis/drop.rs`: her vuruş aday; dB cinsinden kanıtlar (bas dönüşü, yeni bantlar, boşluk, ilk
  ölçünün vurgusu, sonrasının tamlığı/düzeyi, sürme, ölçü başı + "ölçü bilinmiyor", ilk ölçünün sonrakilere
  benzememesi, değişimin bu vuruşta olması); iki aşamalı lojistik (sıralama + kalibre güven), ağırlıklar fiziksel
  yönle sınırlı, tür dışarıda bırakılarak seçildi. Matematik: `MODEL.md`. Eski yöntem `legacy_drops` olarak duruyor
  (ölçüm aracının "eski" sütunu).
- İşaretle paneli: her işaretli drop için program − siz farkı (ms) ve en yakın adayın güveni ("güven 0,45,
  gösterilmiyor"); parmak gecikmesi düşümü beat F ≥ 0,80 iken.
- Üreteç `uret2.py` (28 tür), bağımsız incelemecinin üreteci ve analiz betikleri `inceleme/`.

## Sonuç (±1 vuruş isabet, eski → yeni; parantezde yanlış drop)

| Set                                                        | Toplam            | Dropsuz şarkıda yanlış |
| ---------------------------------------------------------- | ----------------- | ---------------------- |
| Geliştirme 1–3 (135 drop)                                  | 78 → 92 (42 → 6)  | 12 → 1                 |
| Doğrulama 11–13                                            | 75 → 85 (47 → 8)  | 12 → 1                 |
| Son sınama 21–23                                           | 77 → 82 (36 → 7)  | 12 → 1                 |
| Yeni son sınama 51–53 (kod bittikten sonra)                | 75 → 77 (41 → 13) | 12 → 0                 |
| Crash'siz karşı set (62 drop)                              | 41 → 32 (22 → 6)  | 6 → 0                  |
| Bağımsız incelemecinin seti (44 drop; ayarda kullanılmadı) | 36 → 28 (6 → 2)   | 3 → 1                  |

Tür dışarıda çapraz doğrulama: 88/135 isabet, 21 yanlış (eşik 0,6). Brier: tür dışarıda 0,160 (sabit 0,203), yeni
son sınamada 0,129 (sabit 0,184); 0,8–1 güven aralığı gerçekte %91–96 drop. Tam tablolar `sonuclar/`.

- **İyileşen:** yanlış drop 3–7 kat az; Türk remix, bas dönüşü, ritimsiz giriş, kısa şarkı, sahte ve ikinci drop,
  dubstep; rock artık bozulmuyor (ilk sürümde 6 → 2 idi; `hi_jump`/`gain` sızıntısı giderildi).
- **Eskinin altında:** hip-hop drop'u (6/6 → 0–3/6; yer doğru, güven 0,2–0,5), trap (6/6 → 2–5/6), drum and bass
  (tempo yarım: `tempo.rs`, sürekli sub bas kick kanıtını örtüyor — ayrı iş), crash'siz yükselişte kick rulosu
  (drop bir ölçü erkene kayıyor). İki yöntemin de bulamadığı: filtre açılması, future bass, sub baslı dnb, melodik.

## Bekleyen karar (proje sahibinde)

- A) yeni yöntem varsayılan; B) (öneri) ikisi programda, varsayılan eski, İşaretle paneli ikisini yan yana gösterir,
  sahibinin 5–10 şarkılık işaretiyle karar; C) hip-hop/trap düzelene dek beklet.
- Önce: DnB tempo kökü (`tempo.rs`), hip-hop drop'u (piyano girişi → davul + 808).
