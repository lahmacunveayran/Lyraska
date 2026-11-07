# 11 — Aksak ölçü, makam ve usul (AS2)

## 1. Ölçüt ve setler

| Ne                                                         | Durum                                                                                                                                                                                                                                                                                                        | Kanıt              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| Türk makam müziği usul seti (CompMusic; Holzapfel ve ark.) | ISMIR 2014 "Tracking the odd" çalışmasının Türk derlemi: **32 parça 9/8 Aksak, 20 parça 10/8 Curcuna, 30 parça 8/8 Düyek** (ölçü başı ve vuruş işaretli)                                                                                                                                                     | A (JKU PDF okundu) |
| Karnatik tala seti (Srinivasamurthy)                       | Aynı çalışmada; uzun ölçü döngüleri                                                                                                                                                                                                                                                                          | B                  |
| Yöntem                                                     | **Çubuk işaretçisi (bar pointer) modeli**: gizli durum = ölçünün içindeki konum + tempo; gözlem = başlangıç gücü kalıbı; usule özgü kalıplar öğrenilir (Krebs, Böck, Widmer; Holzapfel, Krebs, Srinivasamurthy 2014; parçacık süzgeci ISMIR 2015; genelleştirilmiş model ICASSP 2016)                        | B                  |
| Kod                                                        | `flokadillo/bayesbeat` (MATLAB, "araştırma amaçlı", lisans okunmadı)                                                                                                                                                                                                                                         | B                  |
| "Bilgilendirilmiş" ölçü analizi                            | CompMusic "Informed automatic meter analysis": usul/tala biliniyorsa takip çok daha iyi (usul meta verisi verilir)                                                                                                                                                                                           | B                  |
| Zorluk                                                     | Holzapfel (ISMIR 2009): 9/8 gibi bileşik ölçüler için güvenilir otomatik yöntem "bilinmiyor"; NYU ritim çalıştayı (2013): Türk müziği kayıtlarında ritim analizi "açık sorun"                                                                                                                                | B                  |
| Derin öğrenme                                              | 2025 arXiv "Revisiting meter tracking in Carnatic music using deep learning" — Srinivasamurthy'nin 2016 tezini "bugüne kadarki en kapsamlı çalışma" sayıyor                                                                                                                                                  | B                  |
| Türkçe kaynak                                              | Bozkurt, Ayangil, Holzapfel (JNMR 2014): Türk makam müziğinin hesaplamalı analizi derlemesi; TÜBİTAK 107E024 (makam tanıma, şablon eşleme / k-NN, 16 makam); SymbTr üzerinde makine öğrenmesi %82–88 (sembolik, sesle karşılaştırılamaz). YÖK'te ses kaydından derin öğrenmeyle makam tanıyan tez bulunamadı | B                  |

### 1.1 Sayılar (Holzapfel, Krebs, Srinivasamurthy, ISMIR 2014, Tablo 1; PDF okundu, A)

| Usul         | Usul biliniyor (Ex-1, 2 kalıp): vuruş F / ölçü başı F | Usul bilinmiyor (Ex-2, tek büyük model) | Klasik Klapuri takipçisi: vuruş F |
| ------------ | ----------------------------------------------------- | --------------------------------------- | --------------------------------- |
| Aksak 9/8    | 91,0 / 88,6                                           | 85,7 / 65,1                             | 69,4                              |
| Curcuna 10/8 | 89,1 / 48,6                                           | 89,3 / 41,1                             | 52,8                              |
| Düyek 8/8    | 85,2 / 75,4                                           | 86,6 / 72,6                             | 70,3                              |

Yazarlar sonuçları sonradan düzeltti ([düzeltme sayfası](https://www.cp.jku.at/people/krebs/ismir2014/)): Aksak usul
biliniyor 89,8 / 88,3, bilinmiyor 85,1 / 64,8; fark aynen duruyor (`iddia-denetimi/LISTE.md` 4).

Usulü (ritim sınıfını) tanıma: Türk müziğinde ortalama geri çağırma **%69,6** (A; üç usulün ortalaması, Aksak %66). Yorum: **usul bilinirse ölçü başı
çok daha iyi** (Aksak'ta 88,6 ↔ 65,1). Klasik, tek kalıplı takipçiler (Lyraska'nın sınıfı) vuruşta ~15–35 puan geride.

## 2. Lyraska'nın yeri

- `analysis/meter.rs` (A): sekizlik ızgarasında kalıp ilintisi (2+2+3, 2+2+2+3 …) + "aksak açıkça iyiyse" kararı.
  Literatürdeki çubuk işaretçisi modelinin **sezgisel, tek geçişli** bir eşi: ölçü içindeki konum ve tempo birlikte
  çözülmüyor, kalıp ağırlıkları öğrenilmemiş, kalıp şarkı boyunca sabit.
- Ölçüm yalnızca sentetik darbuka düm/tek setinde (A, `tempo/README.md`). **Bilinen hata** (A, `ACIK-KONULAR.md`):
  maksumda, Türk pop'unda, swing'li hip-hop'ta ve breakbeat'te yanlış aksak (2+3, 3+2) ve yarıya düşen tempo. Bu,
  literatürün öngördüğü durum: başlangıç gücü kalıbı tek başına usulü ayırmaz; maksum (8/8) ile 2+3+3 benzeri
  vurgular arasında karışma çubuk işaretçisi modellerinde de en sık hata (C, genel MIR bilgisi).
- Standart sette (CompMusic Türk usul derlemi) **ölçülmedi**.

## 3. Eleştiri

1. "Yanlış ölçü vurgusu hiç vurgudan kötüdür" ilkesi doğru (ROADMAP), ama aksak kararı şarkı geneli için veriliyor ve
   yanlış pozitifler (maksum → aksak) tam bu ilkeyi çiğniyor. Önsel olasılık eksik: Lyraska'nın kullanıcı kitlesinde
   (sahibinin kütüphanesi: çoğu EDM) aksak **nadir**; Bayesçi bir kararda önsel P(aksak) ≈ 0,02–0,05 olmalı (C).
2. Tek bir kanıt (sekizlik vurgu ilintisi) var. Literatür (B) usulü vurmalı **tını** ile ayırıyor: düm (pes, bas
   bandı) ve tek (tiz) ayrı gözlemler. Lyraska'da HPSS var (`analysis/hpss.rs`), ama aksak kararında pes/tiz ayrı
   kalıp olarak kullanılmıyor (C — kod okunarak: `meter.rs` "başlangıç gücü + bas vuruşu" kullanıyor; bas vuruşu
   kısmen düm'ü temsil ediyor).

## 4. Öneriler

**Ö-M1: Bayesçi karar + önsel.** Aksak puanını bir olabilirlik oranına çevir; önsel P(aksak) küçük; şarkının tür
etiketi (dosya etiketinde "Türk Halk", "Fasıl" vb.) ya da kullanıcının işareti önseli değiştirir ("bilgilendirilmiş
ölçü analizi", CompMusic). Modül `meter.rs`. CPU: ihmal edilebilir. Ölçüm: sentetik set + karşı örnek seti
(`tempo/karsi.py` maksum, Türk pop'u) + sahibinin aksak işaretli şarkıları. **Hedef:** maksum/Türk pop'unda yanlış
aksak 0; gerçek aksak (9/8 Roman havası, 7/8) isabeti sentetik sette eskisinden düşük değil.

**Ö-M2: İki kanallı kalıp (düm/tek).** HPSS'in vurmalı enerjisini bas (< 200 Hz) ve tiz bantlara ayırıp her kalıp
için iki ayrı vurgu şablonu. Literatürdeki usul şablonlarının (Holzapfel–Bozkurt 2012, metrik ağırlıklar) ses
karşılığı.

**Ö-M3: Standart sette ölçüm.** CompMusic Türk usul ek açıklamaları (sesler CompMusic'ten araştırma için istenir;
depoya girmez). Ölçüt: ölçü başı F, ölçü türü isabeti. Ön koşul: Ö-R1 düzeneği (`10-…md`).

**Ö-M4 (araştırma, sonra): Çubuk işaretçisi modeli Rust'ta.** Durum uzayı (konum × tempo) Viterbi'si; usul başına
kalıp. 4 dk şarkıda 60 kare/sn × ~1000 durum → ~1,5·10⁷ işlem/şarkı (C): milisaniyeler. Beat This (bkz. 10) gibi
bir modelin etkinliği gözlem olarak kullanılabilir; Türk müziğinde modelin kendisi zayıf olabilir, bar pointer ise
kalıbı bilir.

## 5. Kaynaklar

Holzapfel, Krebs, Srinivasamurthy, "Tracking the 'odd': meter inference in a culturally diverse music corpus",
ISMIR 2014 — https://www.cp.jku.at/research/papers/Holzapfel_etal_ISMIR_2014.pdf (okundu, A). Srinivasamurthy, Holzapfel, Cemgil, Serra, ICASSP 2016 (B).
Krebs ve ark., parçacık süzgeci, ISMIR 2015 (B). CompMusic "Informed automatic meter analysis" (B). Bozkurt, Ayangil,
Holzapfel, JNMR 2014 (B). Holzapfel, Bozkurt 2012, "Metrical strength and contradiction in Turkish makam music" (B).
NYU Rhythm Workshop 2013 özeti (B). TÜBİTAK 107E024 raporu, DergiPark makaleleri (Türkçe arama; B). arXiv 2509.11241
(B).
