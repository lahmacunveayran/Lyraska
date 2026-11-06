# 80 — Eleştirel denetim ("kırmızı takım"): Lyraska'nın en zayıf 10 noktası

Yöntem: depodaki kararlar ve raporlar, dünyanın ölçütleri ve birincil kaynaklarla karşılaştırıldı. Sıra **etki ×
olasılık** (ürünün vaadine — "şarkıyı önceden bilen görseller" — ne kadar dokunduğu) sırasıdır. Her maddede: iddia,
kanıt, neden önemli, ne yapılmalı. Kanıt düzeyleri: A birincil okundu, B ikincil, C çıkarım.

---

## Z1. Analizin doğruluğu dünyanın hiçbir standart setinde ölçülmedi

- **Kanıt (A):** depoda GTZAN, Ballroom, SMC, Harmonix, SALAMI, GiantSteps, JamendoLyrics dışında bir set sonucu yok
  (yalnızca söz hizalama standart sette ölçüldü). Vuruş, ölçü başı, aksak, bölüm, drop ve tonun bütün sayıları
  kendi sentetik üreteçlerimizden ya da sahibinin kütüphanesinin **tutarlılığından** (iki biçim aynı mı) geliyor.
  ROADMAP'in "F ≥ 0,80" hedefi set, tolerans ve bölüm tanımı olmadan yazılmış.
- **Neden önemli:** Lyraska'nın asıl iddiası analiz kalitesi. Dünyanın en iyisi GTZAN'da vuruş F1 0,891, ölçü başı
  0,783 (Beat This, A); Lyraska'nın sınıfındaki klasik takipçiler Türk usullerinde 0,53–0,70 (Klapuri, A), EDM
  temposunda %29 (Davies–Plumbley, A). Lyraska'nın nerede olduğunu kimse bilmiyor — kendisi de.
- **Yapılacak:** Ö-R1 / Ö-T1 (tek ölçüm aracı, dört set, aralıklarla). Bu, diğer bütün maddelerin ön koşulu.

## Z2. Ölçü başı (downbeat) kütüphanenin yarısında yok sayılıyor

- **Kanıt (A):** köy işi: 656 şarkının **339'unda ölçü güveni < 0,5, 203'ünde tam 0**; Görsel Yönetmen bu şarkılarda
  ölçü vurgusunu kapatıyor (`director/mod.rs`). Yöntem yalnızca 4/4 ve 3/4 için el yapımı iki işaret (kick + tını
  değişimi).
- **Neden önemli:** koreografinin ölçü düzeyi (lamba, dalga, cümle başı) ve Faz 6'nın "8/16/32 ölçü hizalama"sı
  ölçü başına dayanıyor. Bugünkü hâliyle Akıllı Geçiş kütüphanenin yarısında cümle hizalaması yapamaz.
- **Yapılacak:** Beat This küçük modeli (kod + ağırlık MIT, A; ~2 M parametre; GTZAN ölçü başı F1 0,772, A) isteğe
  bağlı "Ritim paketi" olarak (Ö-R2). Hedef: ölçü güveni < 0,5 oranı %52 → ≤ %25.

## Z3. Sentetik set ve elle ayarlanmış eşikler: ezber riski kurumsallaşmış

- **Kanıt (A):** drop'ta ~25 sabit (`structure.rs` `DROP_*`), tempoda dört kural ve eşikleri; ayar ve sınama aynı
  üreteçten (tohum farklı); tür başına 6 şarkı; README'lerin kendisi "sonuç iyimser olabilir" diyor. BILGI §5 aynı
  dersi iki kez yazmış ("sentetik sette model üretecin izini öğrenir"; "sentetik set fazla temizse yöntem
  yanıltır"). Sahibinin gerçek kütüphanesi sentetik setlerin göremediği hardstyle yarım tempo hatasını gösterdi.
- **Neden önemli:** her yeni kural bir önceki kuralın karşı örneğini doğuruyor (reggaeton, polka, maksum — A, köy işi
  bağımsız incelemesi). Kural yığını büyüdükçe bakımı ve doğrulanması zorlaşıyor; bu, öğrenilmiş modellerin MIR'de
  kural tabanlı sistemleri geçme nedeninin ta kendisi.
- **Yapılacak:** Ö-T2 veri hijyeni + Ö-T3 sahibinin "altın seti" + Z1. Yeni el kuralı ancak dışarıdan etiketli sette
  kazanç gösterirse.

## Z4. Aksak kararı önselsiz; maksum ve Türk pop'unda yanlış aksak

- **Kanıt (A):** ACIK-KONULAR (öncelikli açık); `meter.rs` tek kanıtla (sekizlik vurgu ilintisi) ve "açıkça iyiyse"
  eşiğiyle karar veriyor. Literatür (A, Holzapfel 2014): usul bilindiğinde Aksak ölçü başı F 0,886, bilinmediğinde
  0,651; usul tanıma isabeti ~%70. Yani en iyi sistemler bile usulü kör kestirmede %30 yanılıyor.
- **Neden önemli:** projenin kendi ilkesi "yanlış ölçü vurgusu hiç vurgudan kötüdür". Sahibinin kütüphanesinde aksak
  nadir; yanlış pozitif doğru pozitiften çok daha pahalı.
- **Yapılacak:** Ö-M1 (Bayesçi karar, küçük önsel, etiket/işaretle "bilgilendirilmiş" mod), Ö-M2 (düm/tek ayrı).

## Z5. Ton tespiti EDM için zayıf bilinen yöntemle; ölçülmedi

- **Kanıt (A):** `key.rs` Krumhansl–Kessler profilleri. GiantSteps Key'de ton profilli akademik yöntemler w = 0,45–0,59,
  CNN 0,746, ticari DJ yazılımları 0,75–0,80 (Knees 2015; Korzeniowski 2018). Sahibinin kütüphanesi çoğunlukla EDM
  (A, köy işi). Köy işindeki "86'nın 83'ü aynı" tutarlılıktır, doğruluk değil.
- **Neden önemli:** Faz 6 (ton uyumu uyarısı) ve Faz 7 (Camelot'a göre seçim) bu bilgiye dayanacak. w ≈ 0,5'lik bir
  tonla "8A → 9A" açıklaması kullanıcıyı yanıltır.
- **Yapılacak:** Ö-T1 (GiantSteps'te ölç), Ö-T2 (madmom ton CNN'i, CC BY-NC-SA, yeni kararla yerel paket).

## Z6. Söz hizalamada felaket hataları: PCO dünya düzeyinde, ortalama hata 5 kat kötü

- **Kanıt (A):** Lyraska Jamendo son sınama kelime ≤ 0,3 sn %94,1 (Spotify 2023: %94) ama ortalama hata 0,89 sn
  (Spotify AAE 0,18 sn); fark beş "kayan" şarkıdan. Köy işinde "oturmadı" hükmü 43'ün 9'unda yanlış alarm. Gerçek
  Türk pop/arabesk/rap'te doğrusu bilinen ölçüm yok (yalnızca 4 makam kaydı + 12 yapay şarkı).
- **Neden önemli:** sahibinin ilk isteği Türkçe şarkılar; kayan bir nakarat bütün şarkının sözlerini bozar.
- **Yapılacak:** Ö-S1 (yapı bilgisiyle bölüm kaydı algılama ve bölgesel yeniden hizalama), Ö-S3 (Türkçe gerçek set).

## Z7. Ses yüksekliği yalnızca parça başına; albüm modu ve etiketler yok

- **Kanıt (A kod, B standart):** `normalize.rs` yalnızca parça −14 LUFS; ReplayGain/R128 etiketi okunmuyor. AES
  TD1008 (2021) albüm eşitlemesini tercih ediyor, parça eşitlemede −16 LUFS'ü aşmamayı öneriyor; dinleme testinde %80
  albüm eşitlemesini seçmiş (B).
- **Neden önemli:** "Profesyonel ses" vaadi. Albümün iç dinamiği (sessiz giriş, yavaş parça) her şarkıda düzleşiyor;
  foobar2000/Roon kullanıcıları için bu temel bir beklenti (C).
- **Yapılacak:** Ö-A1 (albüm modu, karışık sırada parça modu). Küçük iş, büyük etki.

## Z8. Güvenli modda MilkDrop'un kırmızı parlaması frenlenmiyor; kırmızı ölçüsü eskimiş

- **Kanıt (A):** `MilkDropScene.tsx` freni `red` seçeneği olmadan kuruyor; `flashGuardMath.ts` 9. adım "Kapalıyken
  kırmızı aynen geçer (MilkDrop; bilinen boşluk)". BT.1702-3: "parlaklıktan bağımsız olarak doygun kırmızıya geçiş
  zararlı olabilir" (A). Ayrıca Lyraska `320·max(0, R−G−B)` ölçüsünü kullanıyor; WCAG 2.2 bunu ISO 9241-391'in u′v′
  > 0,2 tanımıyla değiştirdi (A).
- **Neden önemli:** güvenli mod ışığa duyarlı kullanıcının **tek** koruması ve MilkDrop'un içeriği güvenilmez
  (kullanıcının presetleri). Varsayılan modda sınır olmaması sahibinin bilinçli kararı; güvenli moddaki boşluk değil.
- **Yapılacak:** Ö-F1 (güvenli modda kırmızı freni aç — kod hazır), Ö-F2 (u′v′ tanımı). Güvenli modu yalnızca
  sıkılaştırır; yine de CLAUDE.md gereği sahibine sorulur.

## Z9. Görsel koreografi kural tabanlı ve ölçütsüz; reddedilen sahnelerin nedeni ayrıştırılamıyor

- **Kanıt (A):** Görsel Yönetmen el yapımı eşlemeler; sahibi altı sahneyi ve Işık Ustası'nı kaldırdı ("sıkıcı").
  Skip-BART (ICLR 2026, A özet): "kategoriye ayırıp hazır kalıplara eşleyen" sistemler "kalıplaşmış ve tekdüze".
  Atmosferde değerlik (hüzün/neşe) ve bölüm işlevi (nakarat/drop/kıta) yok; enerjiden türüyor.
- **Neden önemli:** ürünün "vay be" vaadi. Her reddedilen sahne haftalar.
- **Yapılacak:** Ö-G1 (iki eksenli A/B tercih ölçümü: koreografi ↔ çizim ayrı), Ö-Y3 (bölüm işlevi), Ö-T3 (değerlik),
  Ö-G2 (öğrenilmiş atmosfer eğrisi, Apache-2.0).

## Z10. Yapı analizi yalnızca enerji/tınıdan; kroma yok, işlev etiketi yok

- **Kanıt (A):** `structure.rs` özellik vektörü 32 bant + ses yüksekliği + bas; ton parçasının kroması bölümlemede
  kullanılmıyor. En iyi yöntemler Harmonix'te HR.5F 0,70 (SongFormer, A), klasik yöntemlerin sonucu bu taramada
  ölçülmedi.
- **Neden önemli:** "aynı nakarat aynı tema", Faz 6'nın cümle sınırları ve söz hizalamanın sağlamlığı (Z6) bölümlere
  dayanıyor.
- **Yapılacak:** Ö-Y2 (kroma + MFCC benzeri SSM; ucuz, lisans sorunsuz), Ö-Y1 (Harmonix'te ölç), sonra Ö-Y3.

---

## Ek: küçük ama düzeltilmesi gereken yanlış varsayımlar

1. **Rubber Band "GPL olduğu için ikinci seçenek" (ROADMAP Faz 6)** — Rubber Band GPL-2.0-or-later (A, README):
   GPL-3.0-only ile uyumlu. Lisans engel değil; seçim kaliteyle yapılmalı.
2. **"Demucs ağırlıkları kullanılamaz"** — eski kuralla doğruydu. Yazar "lisansı belli değil, MusDB araştırma amaçlı,
   6 kaynaklı sürüm muhtemelen CC-NC-BY" diyor (A). 6 Kasım kararı NC/araştırma ağırlıklarını yerel pakette kabul
   ediyor: Demucs artık **sahibinin kararına** açık (lisansı "yazılmamış" değil, "belirsiz ve araştırma"). Bu, All-In-One
   (MIT ağırlık, Demucs girdili) yolunu da açar.
3. **Kaynak ayrıştırma SDR'la seçiliyor** (Spleeter ↔ Demucs karşılaştırması) — Lyraska ses üretmiyor; seçim görev
   ölçütüyle (vuruş F, vokal girişi) yapılmalı (Ö-K1). Söz hizalamada ayrıştırmanın fark getirmediği zaten ölçüldü (A).
4. **"Ölçü güveni düşükse vurgu yok" bir çözüm değil, bir sigorta** — doğru ve korunmalı, ama kütüphanenin yarısında
   tetikleniyorsa (Z2) sigortanın kendisi bir kalite göstergesi olarak raporlanmalı.

## Güçlü yanlar (adil olmak için)

Ses yolu matematiği ve ölçümü (−152 dB, −195 dB, EBU 3341 uyumu), gerçek zamanlı güvenceler, mutasyonla ölçülen test
etkinliği (%85–93), parlama freninin kanıtlı tasarımı ve BT.1702'den 3 kat sıkı güvenli mod, söz hizalamanın son
sınama disiplini (kod dondurma MD5'i) ve PCO'da dünya düzeyi, senkron hedefinin algı eşiklerine göre doğru seçimi.
Bunlar bu büyüklükte açık kaynak projelerde nadirdir.
