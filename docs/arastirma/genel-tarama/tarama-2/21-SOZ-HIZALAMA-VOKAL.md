# 21 — Söz hizalama ve vokal (AS8)

## 1. Ölçüt ve en iyi sonuç

| Ne                                                       | Durum                                                                                                                                                                       | Kanıt                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Ölçütler                                                 | **AAE** (kelime başlangıçlarının ortalama mutlak hatası, sn) ve **PCO** (±0,3 sn içinde doğru başlangıç yüzdesi); "AAE uç hatalara duyarlı, PCO değil — birbirini tamamlar" | A (Durand, Stoller, Ewert, ICASSP 2023 metni)             |
| Setler                                                   | JamendoLyrics (İngilizce, 20 şarkı) ve JamendoLyrics Multi-Lang (80 şarkı: EN/ES/DE/FR); asıl depo arşivlendi, Hugging Face'e taşındı                                       | A (makale), B (taşınma notu)                              |
| En iyi (Spotify, Durand ve ark. 2023, karşıtsal öğrenme) | İngilizce Jamendo: **AAE 0,15 sn, PCO %92** (M6, bağımlılıksız); Multi-Lang dil koşullu: **AAE 0,18 sn, PCO %94** (EN 0,21 / ES 0,13 / DE 0,16 / FR 0,19)                   | A (Tablo 2–3)                                             |
| Eski taban çizgileri                                     | Stoller ve ark. (SDE) AAE 0,82, PCO %85                                                                                                                                     | A                                                         |
| Okunabilirlik / yanlış söz                               | JAM-ALT (2023–24): yayımlanmış sözler sesle her zaman aynı değil                                                                                                            | B                                                         |
| Büyük not-düzeyi set                                     | DALI (5358 şarkı, nota düzeyinde hizalı sözler; ek açıklamalar **CC BY-NC-SA 4.0**; ses YouTube)                                                                            | A (README) — yeni kuralla yerel ölçüm için kullanılabilir |

## 2. Lyraska'nın yeri (depodaki ölçüm, A: `soz-hizalama/RAPOR.md` §4.4)

| Ölçü (son sınama, Jamendo 39 şarkı, 4 dil) | Lyraska `ctc:karisim` | Spotify 2023 (Multi-Lang, 80 şarkı) |
| ------------------------------------------ | --------------------- | ----------------------------------- |
| Kelime ≤ 0,3 sn (≈ PCO)                    | **%94,1**             | %94                                 |
| Kelime ortalama hata (≈ AAE, havuz)        | 0,89 sn               | 0,18 sn                             |
| Kelime ortanca hata                        | 0,03 sn               | —                                   |

**Yorum (C, ama sayılar A):** Lyraska **PCO'da dünyanın en iyisiyle aynı düzeyde**; ortalama hatada ~5 kat kötü.
Fark beş şarkıdan geliyor (bölümler kayıyor; RAPOR). Yani sorun hassasiyet değil, **sağlamlık** (felaket hataları).
Uyarılar: (1) Lyraska'nın setinin 39 şarkısı Multi-Lang'ın alt kümesi, karşılaştırma birebir değil; (2) Lyraska'nın
ortalaması havuz ortalaması, literatürün AAE'si şarkı başına ortalamanın ortalaması — Lyraska'nın "şarkı başına
satır" ortalaması 1,33 sn (A); (3) Türkçe ölçüm çok küçük (4 makam kaydı + 12 yapay şarkı; A) ve **gerçek Türk
pop/arabesk/rap'te doğrusu bilinen set yok** (A, RAPOR "Açık riskler").

Köy işi (sahibinin kütüphanesi, YouTube altyazılarıyla, A): güvenli satırlarda ortanca hata 0,10 sn; "oturmadı"
hükmü 43 şarkının 27'sinde doğru, 9'u aslında iyi (fazla temkinli).

## 3. Eleştiri

1. Sağlamlığın ölçüsü yok: satır güveni (ileri-geri) var, ama "bölüm kaydı" (nakaratın yanlış tekrarına oturma)
   için ayrı bir algılayıcı yok (C — `lyrics_align.rs` başı okunmadı; RAPOR §4.5 "hatalı satırları güvenle
   işaretleyen bir ölçü yok" diyor, A).
2. Yapıştırılan söz eksikse ("Nakarat ×2") hata ikiye katlanıyor (A). Lyraska'nın yapı analizi (tekrar eden bölümler)
   burada kullanılabilir ama kullanılmıyor (85-FIRSATLAR).
3. Model tek boy (300M). Aynı ailenin **1B CTC** modeli var (975 M parametre, ~3 GiB bellek; README, A); lisansı
   300M ile aynı aile (Apache-2.0 olduğu depodaki rapordan; 1B için ayrıca doğrulanmadı, C). Sahibinin RTX 4050'si
   (6 GB) bunu ekran kartında taşıyabilir ama Lyraska'nın çalıştırıcısı (tract) yalnızca işlemci.

## 4. Öneriler

**Ö-S1: Bölüm kaydı algılayıcısı + yapı bilgisi.** Hizalamadan sonra her satırın zamanı, Lyraska'nın bölüm
haritasıyla karşılaştırılır: aynı metinli satırlar (nakarat) aynı etiketli bölümlere düşmeli; düşmüyorsa o blok
yeniden hizalanır (bölüm sınırında yeniden başlatılan Viterbi) ya da "tahmini" işaretlenir. CPU: Viterbi'nin
yeniden çalışması < 1 sn (emisyonlar önbellekte, A: `lyrics_cache.rs`). **Hedef:** Jamendo son sınamada şarkı başına
ortalama 1,33 → ≤ 0,40 sn; PCO düşmeden.

**Ö-S2: Standart ölçüte hizala.** Ölçüm aracı Multi-Lang'ın 80 şarkısında, literatürün AAE ve PCO tanımıyla (şarkı
başına ortalama) yazsın; böylece "dünyanın en iyisine göre nerede" sorusu tek satırla cevaplanır.

**Ö-S3: Türkçe gerçek şarkı seti.** Sahibinin 5–10 şarkılık denemesi (ACIK-KONULAR 1) bir **set**e dönüştürülsün:
sahibi yalnızca doğru/yanlış diyor; doğrusu bilinen zaman için sahibinin kendi elle düzeltilmiş `.lrc`'si ya da
DALI'deki Türkçe parçalar (varsa; yerel ölçüm, NC). Hedef: Türkçe pop'ta PCO ≥ %85.

**Ö-S4: "Oturmadı" eşiğinin yeniden ayarı** köy işinin 43 şarkısıyla (9 yanlış alarm): eşiği, iyi şarkıların en
düşük güveninin altına pay bırakarak; doğru sınıfın en yükseğinden pay (BILGI §5 yöntemi).

## 5. Kaynaklar

Durand, Stoller, Ewert, "Contrastive learning-based audio to lyrics alignment for multiple languages", ICASSP 2023,
https://arxiv.org/abs/2306.07744 (PDF okundu, A). gabolsgabs/DALI README (A). facebookresearch/omnilingual-asr README
(A). f90/jamendolyrics (arşivlendi; B). Cífka ve ark., JAM-ALT, arXiv 2311.13987 (B). Depodaki
`soz-hizalama/RAPOR.md` ve `koy-isi/README.md` (A).
