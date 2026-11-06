# 12 — Yapı (bölümler) ve drop (AS3, AS4)

## 1. Ölçüt ve setler

| Ne     | Durum                                                                                                                    | Kanıt                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Ölçüt  | Sınır isabeti HR.5F (±0,5 sn) ve HR3F (±3 sn), F-ölçüsü; etiket için çerçeve doğruluğu (ACC) ve ikili kümeleme (PWF, Sf) | A (SongFormer README tabloları)           |
| Setler | **Harmonix Set**: 912 Batı pop parçası; vuruş, ölçü başı ve işlevsel bölüm etiketleri; ek açıklamalar **MIT** (ses yok)  | A (urinieto/harmonixset README + LICENSE) |
|        | SALAMI (yüzlerce parça, iki ölçekli etiket), RWC-Pop, SongFormBench (HX, CN)                                             | A/B                                       |
| Uyarı  | Makaleler arası karşılaştırma alt kümeler farklı olduğu için kusurlu (CBM makalesinin notu)                              | B                                         |

**En iyi yayımlanmış sonuçlar** (SongFormer README, SongFormBench-HarmonixSet; A):

| Yöntem                     | ACC   | HR.5F | HR3F  |
| -------------------------- | ----- | ----- | ----- |
| All-In-One (2023)          | 0,740 | 0,596 | 0,730 |
| LinkSeg-7Labels            | 0,780 | 0,630 | 0,762 |
| Gemini 2.5 Pro (genel LLM) | 0,748 | 0,423 | 0,813 |
| SongFormer (HX)            | 0,795 | 0,703 | 0,784 |

SALAMI'de sonuçlar daha düşük: bir 2024 PLOS ONE yöntemi HR.5F 0,529, HR3F 0,695 (B); "Barwise CBM" (Marmoret ve ark.)
F0,5 ≈ %41 (B). Klasik Foote yenilik eğrisinin (Lyraska'nın yöntemi) SALAMI/Harmonix sonucu bu taramada **birincil
kaynaktan okunmadı**; MSAF karşılaştırmalarında klasik yöntemler HR3F'de ~0,4–0,5 bandında bilinir (C, doğrulanmadı).

### Drop

| Ne                              | Durum                                                                                                                                                                                                                                                             | Kanıt                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| İlk ve en çok atıf alan çalışma | Yadati, Larson, Liem, Hanjalic, "Detecting drops in EDM", ISMIR 2014: SoundCloud'daki zaman damgalı yorumlar zayıf etiket; MFCC + spektrogram istatistikleri; **tolerans penceresi 3–15 sn**; ortalama F1 **0,61 (3 sn) → 0,71 (15 sn)**; parça bazında 0,20–0,96 | A (PDF okundu, Tablo) |
| Sonrası                         | Ayrı, standart bir drop seti yok; drop genelde yapı analizinin (bölüm etiketi "drop", "build-up") parçası. Bir DJ yazılımının "phrase" analizi (Intro/Up/Down/Chorus/Outro) ticari örnek                                                                          | B                     |
| Algı                            | Solberg & Jensenius (2016–17): 16 dansçı, kulüp ortamı, hareket miktarı breakdown'da düşüyor, drop'ta artıyor; drop ve build-up "en zevkli" kısımlar; Solberg & Dibben (2019): drop'ta deri iletkenliği anlamlı yüksek                                            | B                     |

Yorum: Lyraska'nın drop hedefi (±1 sn, güven ≥ 0,6) literatürün ilk çalışmasından **çok daha sıkı**; yani alanda
Lyraska geride değil, ama **ölçüm** zayıf: yalnızca sentetik set (22/38 son sınamada) ve sahibinin henüz yapmadığı
A15 denemesi (A, `docs/arastirma/drop/README.md`, `ACIK-KONULAR.md`).

## 2. Lyraska'da ne var (kod okundu, A)

- `structure.rs`: ölçü başına özellik vektörü (32 bant seviyesi, ses yüksekliği, bas) → benzerlik matrisi → Foote
  dama tahtası çekirdeği (yarı genişlik 4 ölçü), en kısa bölüm 4 ölçü; benzer bölümlere aynı etiket (ilk örneğe
  yakınlık). **Kroma (armoni) ve tını (MFCC benzeri) özellik yok**; ton analizinin kroması ayrı parça olarak var ama
  bölümlemede kullanılmıyor.
- Drop: ~25 el ayarlı sabit (`DROP_*`: bas sıçraması 0,12/0,30, enerji 0,40, sürme 8 ölçü, ceza/bonuslar…).

## 3. Eleştiri

1. **Yapı yalnızca enerji/tını üzerinden:** pop'ta nakarat ile kıta çoğu zaman aynı enerjide, farkı armoni ve
   melodi taşır. Kromasız bir benzerlik matrisi tekrar eden yapıyı (nakarat = nakarat) iyi bulmaz (C; literatürde
   tekrar tabanlı yöntemler kroma/MFCC SSM kullanır, B).
2. **~25 elle ayarlanmış eşik, sentetik üreteçte** — BILGI §5'in kendi dersi ("sentetik sette model üretecin izini
   öğrenir") burada da geçerli. Yerel sınamalar ezber riskini azaltıyor ama gerçek EDM'de doğrulama yok.
3. **Bölüm işlev etiketi yok** (intro/verse/chorus/drop/outro): Görsel Yönetmen "aynı nakarat aynı tema"yı biliyor
   ama "bu nakarat" olduğunu bilmiyor. Koreografi için en değerli bilgi işlev etiketidir (85-FIRSATLAR).

## 4. Öneriler

**Ö-Y1: Harmonix'te ölçüm.** Harmonix ek açıklamaları MIT; sesler sahibinin bilgisayarında (sahibinin kütüphanesiyle
kesişen parçalar ya da yasal edinim). `examples/` aracı HR.5F/HR3F ve ölçü başı F'yi yazar (mir_eval ile aynı
tanımlar). **Hedef:** önce taban çizgisi ölçülür; HR3F ≥ 0,60 ilk hedef (C).

**Ö-Y2: Kroma + tını eklenmiş SSM (klasik, lisans sorunsuz).** Ölçü düzeyinde kroma (ton parçasından, saniyede 12
değer zaten var) ve 32 bandın DCT'si (MFCC benzeri) ile iki ayrı benzerlik matrisi; Foote yeniliği + tekrar
(ör. "structural features", Serrà ve ark. 2014; B). Modül `structure.rs`; CPU: şarkı başına < 100 ms (C). Yalnızca
ritim parçasının sürümü artar (kroma zaten saklanıyor mu, kontrol: `key.rs` saniye başına kroma saklıyor, A).

**Ö-Y3: İsteğe bağlı "Yapı paketi": All-In-One ya da SongFormer.**

- All-In-One: kod ve ağırlık MIT (A); vuruş, ölçü başı, bölüm sınırı ve **işlev etiketi** tek modelde. Ama girdi
  Demucs ile ayrılmış dört ses (Demucs ağırlık lisansı "belli değil", bkz. 20) ve 8 katlı topluluk; RTX 4090'da
  33 dk müzik 73 sn (A). İşlemcide çok daha yavaş (Demucs işlemcide ~1,5× gerçek süre, A: Demucs README).
- SongFormer: kod CC BY 4.0 (A, LICENSE); **MuQ ağırlıkları CC BY-NC 4.0** (A, tencent-ailab/MuQ README) + MusicFM;
  6 Kasım kararıyla yalnızca yerel paket olarak olur. İki büyük öz-denetimli model (~300 M parametre sınıfı, C) →
  4 dk şarkıda işlemcide dakikalar (C). HR.5F 0,703 — alanın en iyisi.
- Öneri: önce Ö-Y2 (ucuz); sonra sahibine seçenek: (a) All-In-One + Demucs yerel paket (Demucs kararı gerekir),
  (b) SongFormer yerel paket (NC), (c) yok. Benim önerim (a) değil (b): (b) Demucs gerektirmez, ve işlev etiketleri
  Çince pop setinde de iyi (SongFormBench-CN HR.5F 0,675–0,690, A).

**Ö-D1: Drop'u yapı etiketinden de türet.** Yapı paketi varsa "drop/chorus" işlevli bölüm başı + Lyraska'nın bas
dönüşü kanıtı birlikte; ikisi anlaşmazsa güven düşer. Ölçüm: sahibinin A15 işaretleri + Harmonix'teki EDM parçaları.

**Ö-D2: Drop'un gerçek veride ölçümü için zayıf etiket.** Yadati'nin yöntemi (topluluk yorumları) çevrimdışı ilkeye
aykırı değil: araştırma aşamasında bir kez toplanan, zamanı bilinen herkese açık drop işaretleri (ör. sahibinin
kütüphanesindeki şarkılar için) yalnızca ölçüm setidir, programa girmez.

## 5. Kaynaklar

SongFormer (ASLP-lab) README, LICENSE (A). tencent-ailab/MuQ README "License" (A). urinieto/harmonixset README,
LICENSE (A). mir-aidj/all-in-one README (A). Yadati ve ark., ISMIR 2014, https://archives.ismir.net/ismir2014/paper/000297.pdf
(A). Solberg & Jensenius 2016/2017; Solberg & Dibben 2019 (arama özeti, B). PLOS ONE 2024 (pone.0312608, B).
Marmoret ve ark., Barwise CBM, arXiv 2311.18604 (B). Buisson, Télécom Paris tezi (2024; theses.fr, Fransızca arama;
B): az ve belirsiz etiketle derin öğrenmeli yapı analizi.
