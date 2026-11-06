# 10 — Vuruş, ölçü başı ve tempo (AS1)

Kanıt düzeyi: **A** birincil kaynak okundu, **B** ikincil kaynak / arama özeti, **C** tahminim. Kaynak dereceleri
(K1–K5) `01-PROTOKOL.md` §5'te.

## 1. Ölçüt önce: dünyanın bu işi nasıl ölçtüğü

| Ne                   | Standart                                                                                                                      | Kanıt                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Ölçüt                | F-ölçüsü ±70 ms (MIREX, `mir_eval.beat.f_measure`); ayrıca CMLt / AMLt (sürekli doğru ölçü düzeyi, oktav hatasına izin veren) | B (WaveBeat ve Beat This özetleri) |
| Setler               | Ballroom, Hainsworth, SMC (zor, klasik/film), GTZAN (993 parça, yalnızca test), Harmonix, RWC; sekiz katlı çapraz doğrulama   | B                                  |
| Değerlendirme kuralı | GTZAN eğitimde **kullanılmaz**; eğitim setlerinden parça ile ölçmek "haksız iyi" sonuç verir (Beat This README uyarısı)       | A                                  |
| Ölçü başı (downbeat) | Aynı F-ölçüsü ölçü başlarında                                                                                                 | B                                  |

**Yayımlanmış en iyi sonuçlar (GTZAN, test):**

Beat This! makalesi (Foscarin, Schlüter, Widmer; JKU Linz; ISMIR 2024; arxiv 2407.21658, PDF okundu, **A**),
Tablo 2 — GTZAN (eğitimde hiç kullanılmamış test seti; MIREX geleneğiyle ilk 5 sn atılır):

| Sistem                      | Vuruş F1   | CMLt       | AMLt       | Ölçü başı F1 | CMLt       | AMLt       |
| --------------------------- | ---------- | ---------- | ---------- | ------------ | ---------- | ---------- |
| Hung ve ark. 2022 (DBN'li)  | 88,7       | 81,2       | 92,0       | 75,6         | 71,5       | 88,1       |
| Beat This (~20 M parametre) | 89,1 ± 0,3 | 79,8 ± 0,6 | 89,8 ± 0,4 | 78,3 ± 0,4   | 67,3 ± 0,8 | 79,1 ± 0,6 |
| Beat This küçük (~2 M)      | 88,8 ± 0,2 | 79,4 ± 0,4 | 89,0 ± 0,4 | 77,2 ± 0,2   | 65,3 ± 0,3 | 78,0 ± 0,3 |
| Beat This + DBN             | 88,1 ± 0,3 | 80,5 ± 0,4 | 91,1 ± 0,2 | 77,4 ± 0,2   | 73,3 ± 0,2 | 87,8 ± 0,5 |

Tablo 1 (8 katlı çapraz doğrulama, vuruş F1 / ölçü başı F1, A): Ballroom 97,5 / 95,3; Beatles 94,5 / 88,8;
Hainsworth 91,9 / 80,0; Harmonix 95,8 / 90,7; RWC Pop 96,1 / 93,7; RWC Classical 77,1 / 66,3; ASAP 76,3 / 61,2;
**SMC 62,7** (yalnızca vuruş). Girdi: 22,05 kHz, 128 mel, 50 kare/sn; eğitim 18 sette.

Makalenin kendi uyarısı (A): "karmaşık ya da az temsil edilen parçalarda ağ periyodik olmayan vuruşlar üretiyor,
süreklilik ölçütlerini düşürüyor". DBN eklemek CMLt'yi ve ölçü başı sürekliliğini geri getiriyor (tablodaki son
satır). Lyraska için anlamı: görseller için süreklilik (CMLt) F1'den daha önemli; ağın çıktısı Lyraska'nın kendi
DP/DBN benzeri ızgarasından geçirilmeli.

**Klasik yöntemlerin elektronik müzikteki yeri** (GiantSteps Tempo, 664 EDM parçası; Knees ve ark., ISMIR 2015,
Tablo 4, PDF okundu, A): ±%4 içinde doğru tempo — Davies–Plumbley (klasik öz-ilinti/DP sınıfı) **%29,4** (oktav
serbest %48,0); Böck ve ark. (RNN) %56,3–76,5; Percival–Tzanetakis %51,4; ticari DJ yazılımları %57,7–77,0. Not:
set yalnızca Beatport'un yanlış bulduğu parçalardan derlendiği için zor bir settir (makalenin kendi açıklaması).

## 2. Lyraska'da gerçekte ne var (kod okundu, A)

- `analysis/beats.rs`: Ellis 2007 (dinamik programlama) — 48 logaritmik bantta sıkıştırılmış spektral akı, **60
  kare/sn**, öz-ilinti + 120 BPM önceli, `TIGHTNESS = 100`, 20 sn'lik parçalarda değişken tempo, parabolle kare altı.
- `analysis/tempo.rs`: dört el yapımı oktav kuralı (vuruş arasında davul, yarım tempo hissi, üç vuruşta iki, eşit
  nabız); eşikler sentetik setlerde ve sahibinin 656 şarkısının SongBPM değerlerinde seçildi.
- `analysis/structure.rs`: ölçü başı = kick gücü + tını değişimi, yalnızca 4/4 ve 3/4; 8 ölçülük pencerede güven.
- `analysis/evaluate.rs`: F-ölçüsü ±70 ms, 6 Kasım'da `mir_eval`'in en büyük eşleştirmesiyle aynı yapıldı (A).

## 3. Lyraska'nın yeri (tahmin)

- **Hiçbir standart sette ölçülmedi** (A: depoda GTZAN/Ballroom/SMC/Harmonix sonucu yok; `grep` ile denetlendi).
  Ölçülenler: sentetik setler (yalnızca davulun çaldığı bölümde F-ölçüsü), sahibinin kütüphanesinde tempo tutarlılığı
  (iki biçim: 86 çiftin 85'i aynı) ve yayımlanan BPM'le karşılaştırma.
- Yöntem sınıfı: Ellis DP takipçisi. Derin öğrenmeli takipçilerin (≥ 0,88) gerisinde olduğu kesin; ne kadar geride
  olduğu ölçülmedi. Tahminim (C): GTZAN'da F ≈ 0,65–0,78 (oktav kuralları CMLt'yi iyileştirir, F'yi pek değil);
  SMC'de ≈ 0,35–0,45. Gerekçe: DP takipçisinin tek bir küresel tempo ve sabit "sıkılık" varsayması; aynı sınıftaki
  Klapuri takipçisi Türk usullerinde F 52,8–70,3 (bkz. 11, A) ve Davies–Plumbley EDM'de tempo isabeti %29 (A).
  Lyraska'nın oktav kuralları tam bu açığı kapatmak için yazıldı; yayımlanan BPM'le kütüphane ölçümü bunu kısmen
  doğruluyor (köy işi), ama vuruş konumunun doğruluğu (F) hiç ölçülmedi.
- Ölçü başı: 4/4–3/4 iki kalıplı el yapımı kural; köy işinde **339/656 şarkıda ölçü güveni < 0,5, 203'ünde 0** (A,
  `koy-isi/README.md`). Görsel Yönetmen bu şarkılarda ölçü vurgusunu kapatıyor — doğru güvenlik, ama kütüphanenin
  yarısında ölçü düzeyi koreografi yok demek.
- Kalite hedefi "F ≥ 0,80" **set tanımsız**: hangi sette, hangi bölümde (yalnızca davullu kısım mı?), ±70 ms mı —
  yazılı değil. Bu hâliyle ölçülebilir bir hedef değil (kırmızı takım, `80-ELESTIREL-DENETIM.md` Z1).

## 4. Lisansın yeniden değerlendirilmesi (6 Kasım kararıyla)

| Model                               | Kod       | Ağırlık                                                                                                                                       | Eğitim verisi                                        | Karar (yeni kuralla)                                                                                                                                                                                                 | Kanıt                       |
| ----------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Beat This!** (CPJKU)              | MIT       | **MIT** ("The code and the published model weights are released under the MIT license")                                                       | 16 set, kısmen telifli / sınırlı CC (README uyarısı) | **Eski kuralla bile alınabilir** (Spleeter ve Omnilingual ile aynı durum: ağırlık açık lisanslı, veri karışık). Yeni kuralla kesin.                                                                                  | A (GitHub README + LICENSE) |
| Beat This küçük model               | MIT       | MIT                                                                                                                                           | aynı                                                 | `small0` ~8,1 MB; işlemcide çalışır (`--gpu=-1`)                                                                                                                                                                     | A                           |
| madmom (RNN/DBN, ton CNN, akor CNN) | BSD       | **CC BY-NC-SA 4.0** (LICENSE: "All model and data files are distributed under ... Creative Commons Attribution-NonCommercial-ShareAlike 4.0") | Ballroom, Hainsworth vb.                             | Önceden elenirdi; **şimdi yerel pakette kullanılabilir**, ama Beat This daha iyi ve MIT — gerek yok. Ton CNN'i için bkz. 13.                                                                                         | A                           |
| All-In-One (Kim, Nam; WASPAA 2023)  | MIT       | **MIT** (Hugging Face `taejunkim/allinone` model kartı ve API: `license: mit`, 8 katlı `.pth`)                                                | Harmonix (ses telifli)                               | Ağırlık açık lisanslı; ama **girdisi Demucs ile ayrılmış dört ses** (Demucs ağırlığı "lisansı belli değil", bkz. 20). Demucs yerine Spleeter ile çalışmaz (eğitim dağılımı farklı). Sahibinin Demucs kararına bağlı. | A                           |
| Beat Transformer (Zhao)             | MIT       | README'de ağırlık lisansı ayrıca yazılı değil (okunmadı)                                                                                      | —                                                    | Doğrulanmadı                                                                                                                                                                                                         | C                           |
| BeatNet (Heydari)                   | CC BY 4.0 | aynı depo                                                                                                                                     | —                                                    | Gerçek zamanlı; Lyraska'ya gerekmez                                                                                                                                                                                  | A (LICENSE)                 |

## 5. Öneriler

**Ö-R1 (öncelik 1): Standart ölçüm düzeneği.** `examples/` altına GTZAN / Ballroom / SMC / Harmonix ek açıklamalarını
(`beat_this_annotations` deposu, GitHub, A) okuyup `evaluate.rs` ile F, CMLt, AMLt yazan bir araç. Ses dosyaları
yalnızca sahibinin bilgisayarında (depoya girmez; GTZAN sesi araştırma amaçlı dağıtılıyor, B). Bu, her ritim
değişikliğinin "dünyanın setinde" ölçülmesini sağlar. Süre: ses başına ~0,1 sn analiz (ritim parçası karelerden,
4 dk'da ~50 ms; A, ROADMAP). Başarı ölçütü: dört sette sonuç tablosu, `ritim` sürümü başına yeniden üretilebilir.

**Ö-R2 (öncelik 2): Beat This küçük modeli, isteğe bağlı "Ritim paketi".** Söz paketiyle aynı kalıp (SHA-256
denetimli yerel dosya; `tract` ile ONNX; ağ kodu yok). Çıktısı kare başına vuruş/ölçü başı etkinliği; Lyraska'nın DP
takipçisi ya da basit tepe seçimi bunun üstünde çalışır (Beat This DBN'siz tepe seçimi kullanıyor, A). Mevcut el
kuralları (oktav) yedek ve karşılaştırma olarak kalır.

- Modül: `analysis/beats.rs` + yeni `analysis/rhythm_model.rs`; sonuç ritim parçasının sürümüyle önbelleğe.
- CPU tahmini (C): küçük model ~2 M parametre; 4 dk şarkıda spektrogram (128 mel, 50 kare/sn) ~12 000 kare;
  dönüştürücü katmanlarla birkaç GFLOP → Ryzen'de 1–5 sn, bellek < 300 MB. Söz modelindeki tuzak geçerli: tract'ın
  VNNI'siz işlemcide int8 yavaşlığı → f32 kullan (BILGI §5).
- Ölçüm planı: Ö-R1 düzeneğinde GTZAN (Beat This'in eğitimine girmemiş tek set) F1, CMLt; sahibinin 656 şarkısında
  yayımlanan BPM'le oktav isabeti; aksak ve maksumda (bkz. 11) gerileme olmaması. **Hedef:** GTZAN vuruş F1 ≥ 0,85,
  ölçü başı F1 ≥ 0,70; kütüphanede ölçü güveni < 0,5 olan şarkı oranı %52'den ≤ %25'e.
- Risk: Beat This "az temsil edilen türlerde" yanılabilir (Türk müziği). Bu yüzden karar şarkı şarkı: model ile
  klasik yolun anlaşmazlığı güveni düşürür.

**Ö-R3: Hedefi yeniden yaz.** "Beat F ≥ 0,80" yerine: "GTZAN'da (eğitim dışı) F ≥ 0,80, Ballroom'da ≥ 0,90, sahibinin
işaretli 20 şarkısında ≥ 0,85; ölçü başı F ≥ 0,65". Ölçüt `mir_eval` ile birebir (zaten öyle).

**Ö-R4: Yerel tempo eğrisi.** Canlı kayıt, rubato ve DJ setleri için tek küresel tempo yerine (şimdi 20 sn'lik
parçalar) sürekli tempo eğrisi; Görsel Yönetmen için vuruş güveni kare başına. Beat This'in etkinlik eğrisinden çıkar.

## 6. Kaynaklar

- CPJKU/beat_this README ve LICENSE (GitHub, okundu, A): ağırlık lisansı, modeller, GTZAN uyarısı.
- CPJKU/madmom LICENSE (GitHub, okundu, A): kod BSD, model CC BY-NC-SA 4.0.
- mir-aidj/all-in-one README ve LICENSE (A: kod MIT, Harmonix'te 8 katlı eğitim; RTX 4090'da 10 şarkı 73 sn).
- Foscarin, Schlüter, Widmer, "Beat this!", ISMIR 2024 — https://arxiv.org/abs/2407.21658 (PDF okundu, A).
- Knees ve ark., "Two data sets for tempo estimation and key detection in EDM annotated from user corrections",
  ISMIR 2015 — https://archives.ismir.net/ismir2015/paper/000246.pdf (PDF okundu, A).
- Heydari ve ark., BeatNet+, TISMIR (arama özeti B). Zhao ve ark., Beat Transformer, ISMIR 2022 (B).
- Ellis, "Beat Tracking by Dynamic Programming", JNMR 2007 (Lyraska'nın temeli; okunmadı, kodda atıf A).
- Jia, Lv, Liu, "Deep learning-based automatic downbeat tracking: a brief review", Multimedia Systems 2019 (Çince
  aramada bulundu; B).
- Gagneré, Essid, Peeters (Télécom Paris), karşıtsal öz-denetimli vuruş takibi (Fransızca aramada; B).
