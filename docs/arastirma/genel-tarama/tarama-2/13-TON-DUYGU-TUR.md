# 13 — Ton, duygu, tür (AS5, AS6)

## 1. Ton: ölçüt, setler, sonuçlar

| Ne                                                                                                | Durum                                                                                                                                                                                                                               | Kanıt                                                |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Ölçüt                                                                                             | MIREX ağırlıklı skor `w = doğru + 0,5·beşli + 0,3·göreli + 0,2·paralel`                                                                                                                                                             | A (Korzeniowski–Widmer 2018 ve Knees 2015 metinleri) |
| Set                                                                                               | **GiantSteps Key**: 604 Beatport önizlemesi (2 dk), %84,8 minör; yalnızca Beatport'un yanlış etiketlediği parçalardan derlendi (zor ve yanlı); eğitim eşi GiantSteps MTG Key (1486)                                                 | A                                                    |
| Ton profilli klasik yöntemler (GiantSteps, Knees ve ark. 2015, Tablo 5)                           | Essentia **44,85**, QM-Key 52,90, KeyFinder 59,30; ticari: Mixed-In-Key 74,60, bir DJ yazılımı 79,55                                                                                                                                | A                                                    |
| CNN (Korzeniowski & Widmer, "Genre-agnostic key classification", ISMIR 2018, Tablo 2)             | GiantSteps **74,6** (doğru %67,9), Billboard 85,1, klasik 96,6, KeyFinder seti 76,1 (EDM'e özel bgate profili 72,4)                                                                                                                 | A                                                    |
| Faraldo'nun doktora tezi (UPF–MTG 2017, "Tonality estimation in EDM"; İspanyolca aramada bulundu) | 2000+ EDM parçasında ton pratiği; ikili majör/minör modeli EDM'e dar geliyor; **modal ve belirsiz** ton etiketleri öneriyor; EDM'e özgü ton dağılımları                                                                             | B (Zenodo kaydı özeti)                               |
| EDM'e özel profiller                                                                              | Faraldo, Jordà, Herrera, "A multi-profile method for key estimation in EDM", AES Semantic Audio 2017; kod `angelfaraldo/edmkey` (Essentia'ya bağlı; lisans dosyası yok → kod alınmaz, yöntem yayımlandığı için yeniden yazılabilir) | A (README)                                           |

**Lyraska'nın yeri** (`analysis/key.rs`, A): uzun pencereli tepe tabanlı kroma + akort düzeltmesi + Krumhansl–Kessler
(1982) profilleriyle ilinti + 15 sn'lik pencere oylaması + güven eşiği. Bu, tablodaki "ton profilli klasik" sınıf.
GiantSteps'te tahminim (C) **w ≈ 0,45–0,60**: KK profili baskın notayı (beşli) aşırı tartar ve EDM'deki minör,
modal, bas ağırlıklı riff'lerde zayıflar (Faraldo'nun EDM profillerini yazma gerekçesi; B). Güven eşiği bunu bir
ölçüde gizler ("emin değilim" deyip göstermemek), ama Akıllı Geçiş ve Otomatik DJ (Faz 6–7) tam bu bilgiye dayanacak.
Köy işinde aynı kaydın iki biçiminde ton 86'nın 83'ünde aynı (A) — bu **tutarlılık**, doğruluk değil.

Türk müziği: makam Batı'nın 24 tonuna sığmaz (koma aralıklar; Bozkurt'un perde histogramı yöntemleri; B). Lyraska
makam şarkısında "La minör" gibi bir ad gösterirse yanlış bilgi verir; güven eşiği koruyor mu, ölçülmedi.

## 2. Duygu ve tür

| Model / veri                                                                            | Lisans (kod / ağırlık / veri)                                                                                                                   | Not                                                                                                                                             | Kanıt |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Essentia kütüphanesi                                                                    | **AGPL-3.0** (COPYING.txt)                                                                                                                      | Proje kuralı: AGPL alınmaz. Yalnızca ağırlıklar ayrı çalıştırıcıyla (tract/ONNX) kullanılabilir                                                 | A     |
| Essentia modelleri (Discogs-EffNet tür 400, MAEST, duygu, dans edilebilirlik, ruh hâli) | ağırlık **CC BY-NC-SA 4.0** ("All the models created by the MTG are licensed under CC BY-NC-SA 4.0 … also available under proprietary license") | 6 Kasım kararıyla **yerel paket olarak artık mümkün**; çoğu TensorFlow `.pb` (models.rst'te yalnızca 2 `.onnx` bağlantısı) → dönüştürme gerekir | A     |
| MuQ-MuLan (Tencent)                                                                     | kod MIT / ağırlık CC BY-NC 4.0                                                                                                                  | Metin–müzik ortak uzayı: "sakin", "karanlık" gibi sözcükle arama; büyük                                                                         | A     |
| DEAM, MTG-Jamendo moodtheme                                                             | veri: ses Jamendo CC lisansları (çoğu NC)                                                                                                       | Ölçüm için yeterli; programa girmez                                                                                                             | B     |

**Neden önemli:** Görsel Yönetmen'in "ruh hâli" bugün bölüm enerjisinden türetiliyor (A, `director/mod.rs`): enerji
≈ uyarılma (arousal) eksenidir; **değerlik (valence: hüzünlü ↔ neşeli) hiç yok**. Aynı enerjide hüzünlü bir arabesk
ile neşeli bir pop aynı renkte. Otomatik DJ'nin "ruh hâli" seçeneği (ROADMAP Faz 7) de değerliksiz eksik kalır.

## 3. Öneriler

**Ö-T1: Ton taban çizgisi ve iki profil daha.** GiantSteps Key (ek açıklamalar açık; sesler araştırma amaçlı Beatport
önizlemeleri, sahibinin bilgisayarında) + sahibinin işaretleri üzerinde ölçüm aracı (MIREX ağırlıklı skor; ton
ilişkisi adlandırmasının MIREX'le aynı olduğunu `claude/ton-iliskisi-mirex` dalı zaten ele alıyor, A). Sonra
Temperley ve EDM profillerini (yayımlanmış sayılar, kod alınmadan) karşılaştır; tür etiketine göre profil seçimi.
**Hedef:** GiantSteps w ≥ 0,65 (klasik yolla), sahibinin işaretli şarkılarında ROADMAP hedefi (aynı ya da komşu ≥ %80).

**Ö-T2: İsteğe bağlı "Ton paketi" — madmom'un ton CNN'i** (Korzeniowski; ağırlık CC BY-NC-SA, A). GiantSteps 74,6
(A). Küçük bir tamamen evrişimli ağ; işlemcide şarkı başına < 1 sn (C). Rust'a taşınması: ağırlıklar `.pkl` →
ONNX/dizi; tract ile çalışır. Kişisel kullanım kararına uyar.

**Ö-T3: Değerlik ekseni (duygu paketi).** Essentia'nın Discogs-EffNet gömmesi + duygu başlıkları (NC, yerel paket).
Görsel Yönetmen'in atmosfer katmanına "değerlik" (renk sıcaklığı/doygunluğu) eklenir; güvenli modu etkilemez (yalnızca
renk). Ölçüm: DEAM'in test bölümü (Pearson r, uyarılma ve değerlik ayrı) + sahibine 10 şarkılık kör karşılaştırma.
CPU (C): EffNet ~20 MFLOP/kare sınıfı; 4 dk şarkıda birkaç saniye.

**Ö-T4: Makam farkındalığı.** Kısa vadede: perde histogramında koma aralıkları güçlüyse "Batı tonu" gösterme (güveni
sıfırla). Uzun vadede makam tanıma (perde histogramı + şablon; TÜBİTAK 107E024 ve Bozkurt'un Makam Toolbox'ı yöntemi;
B). Ölçüm: CompMusic makam seti (araştırma).

## 4. Kaynaklar

Korzeniowski & Widmer, ISMIR 2018, https://arxiv.org/abs/1808.05340 (PDF okundu, A). Knees ve ark., ISMIR 2015
(A). angelfaraldo/edmkey README (A). MTG/essentia `doc/sphinxdoc/models.rst` ve `COPYING.txt` (A).
tencent-ailab/MuQ README (A). Replicate "mtg/music-arousal-valence" sayfası (B). Bozkurt ve ark., makam araç seti;
DergiPark makaleleri (Türkçe arama, B).
