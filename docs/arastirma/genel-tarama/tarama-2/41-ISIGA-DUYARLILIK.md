# 41 — Işığa duyarlılık standartları (AS11)

## 1. Standartların birincil metni (okundu)

**ITU-R BT.1702-3 (11/2023, yürürlükte; PDF okundu, A).** Kılavuz 1 — zararlı parlama:

- Karanlık görüntünün ekran parlaklığı **160 cd/m²'nin altındaysa** aradaki fark **≥ 20 cd/m²** ise; üstündeyse
  Michelson karşıtlığı **> 1/17** ise (yalnızca HDR) bir parlama çifti zararlı olabilir.
- "Parlaklıktan bağımsız olarak, **doygun kırmızıya** ya da kırmızıdan geçiş de zararlı olabilir."
- Tek, çift, üçlü parlama kabul; dizi şu ikisi birlikteyse kabul edilmez: eşzamanlı parlamaların toplam alanı
  **ekranın %25'inden** fazla ve herhangi bir saniyede **üçten fazla** parlama. 60 Hz'te ön kenarları **≥ 334 ms**
  aralıklı parlamalar parlaklık ve alandan bağımsız kabul.
- Uzun süre: kurallara uysa bile **5 saniyeden uzun** parlama dizisi risk olabilir (tıbbi görüş).
- Kılavuz 2 — desen: belirgin açık–koyu şerit çiftleri (paralel, ışınsal, nokta sıraları); yön değiştiren, salınan,
  parlayan ya da karşıtlığı tersine dönen şeritler daha zararlı. Ek: **beşten fazla** şerit çifti ve durağan desen
  ekranın **%40**'ından fazlaysa.
- SDR referansı: tepe beyaz 200 cd/m² (HDR HLG 1000 cd/m²).

**WCAG 2.2, 2.3.1 "Üç parlama ya da eşik altı" — Understanding sayfası (okundu, A).**

- Eşik alanı: 1024×768 başvuru ekranında **341×256 piksel** = tipik uzaklıkta 10° görüş alanı (merkezî görme).
- **WCAG 2.2'de yeni çalışma tanımı (kırmızı):** bir geçiş R/(R+G+B) ≥ 0,8 olan duruma ya da durumdan ve iki durum
  arasındaki fark **CIE 1976 UCS (u′v′) kromatiklik diyagramında > 0,2** (ISO 9241-391'den). Eski PEAT/Harding
  ölçüsü olan `320·max(0, R−G−B)` farkının 20'yi aşması bunun yerini aldı.

Ofcom (Birleşik Krallık) Kılavuz Notu ve Harding FPA testi BT.1702'nin kaynağı (B); ISO 9241-391:2016 WCAG 2.2'nin
kırmızı tanımının kaynağı (A, WCAG metninden). ACM TACCESS 2024 "International guidelines for photosensitive
epilepsy: gap analysis": zararlılık için büyüklük ya da renk + sayı + alan eşiklerinin üçü birlikte aşılmalı (B).

## 2. Lyraska'nın uyumu (kod okundu, A)

| Kural               | Lyraska (güvenli mod)                                                                                               | Değerlendirme                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sayı                | Saniyede ≤ 1 nabız (Yönetmen); MilkDrop freni ≤ 1 parlama/sn, desen ≤ ~1 ters dönme/sn                              | BT.1702'nin 3/sn'sinden 3 kat sıkı; **güçlü**                                                                                                                                                                                                    |
| Alan                | 32×18 hücre, 256×144 blok; WCAG 341×256 penceresiyle sayım (`flash.ts`)                                             | %25 ekran alanından küçük pencereyle — daha sıkı; **güçlü**                                                                                                                                                                                      |
| Parlaklık ölçüsü    | Bağıl parlaklık Y (doğrusal sRGB), oran                                                                             | BT.1702 **mutlak cd/m²** kullanır. 1000 nit'lik HDR ekran ya da yüksek parlaklıkta monitörde aynı Y farkı daha fazla cd/m² eder. SDR'de 200 cd/m² varsayımıyla 20 cd/m² ≈ Y farkı 0,10 — WCAG'nin %10'uyla aynı; **uyumlu**, HDR'de belirsiz (C) |
| Kırmızı             | Yalnızca "Kendi resmin"de açık; **MilkDrop'ta kapalı** ("bilinen boşluk", `flashGuardMath.ts` 9. adım ve MIMARI.md) | **Açık**: güvenli modda kullanıcı presetinin aynı parlaklıkta kırmızı↔gri titremesi frenlenmez                                                                                                                                                   |
| Kırmızı ölçüsü      | `320·max(0, R−G−B)` (eski PEAT tanımı)                                                                              | WCAG 2.2 / ISO 9241-391 **u′v′ > 0,2** tanımına geçti; Lyraska eskisini uyguluyor                                                                                                                                                                |
| Uzun süreli parlama | Sınır yok (kural ≤ 1/sn)                                                                                            | 1/sn'de 5 sn'den uzun dizi olabilir; BT.1702'nin uyarısı "kurallara uysa bile". Güvenli modda nabız genliği zaten hız sınırlı (C: düşük risk)                                                                                                    |
| Desen               | Blok başına ortalama mutlak değişim sınırı (ters dönme)                                                             | Hareketli/tersine dönen desen için iyi; **durağan** yüksek karşıtlıklı şerit (> 5 çift, > %40 alan) için ayrı denetim yok (C)                                                                                                                    |
| Varsayılan mod      | Sınır yok, ilk açılışta uyarı (sahibinin kararı, 24 Ekim)                                                           | Kişisel kullanım kararıyla tutarlı; değiştirilmez (CLAUDE.md)                                                                                                                                                                                    |

## 3. Öneriler (yalnızca güvenli mod; davranışı gevşetmez, sıkılaştırır — sahibine sorulur, CLAUDE.md "güvenli modun

davranışı değiştirilmez" kuralı nedeniyle)

**Ö-F1: MilkDrop'ta kırmızı frenini güvenli modda aç** (zaten yazılmış kod: `red: true`). Ölçüm: `check:scenes`'in
kırmızı↔gri titreyen deneme preseti; güvenli modda kırmızı parlama sayısı ≤ 1/sn. Bu açığı kapatır; maliyet bir
ek ölçüm geçişi (fren zaten 5 geçiş).

**Ö-F2: Kırmızı ölçüsünü WCAG 2.2'ye yükselt** (u′v′ kromatiklik farkı > 0,2, R/(R+G+B) ≥ 0,8). Kanıt
(`flashGuardMath.ts`) yeniden kurulur: u′v′ doğrusal değil, Lipschitz sınırı türetilmeli. Belge kendisi "kapılı ölçü
süreksiz" diyor (A); yeni tanımın da kapısı var (0,8). Öneri: sürekli bir üst sınır (ör. kırmızı payı ağırlıklı u′v′
yolu) + kapıyı muhafazakâr tarafta tutmak.

**Ö-F3: Durağan desen denetimi** `check:scenes`'e: her sahnenin güvenli mod karesinde > 5 çift şerit ve > %40 alan
için basit FFT tepe sınaması (yalnızca test, programa girmez).

**Ö-F4: Harding/PEAT ile dış doğrulama.** PEAT (Trace Center'ın ücretsiz aracı, Harding algoritması; lisansı ve
erişilebilirliği doğrulanmadı, C) ile her sahnenin güvenli modda 60 sn'lik kaydı bir kez çözümlenir; sonuç
`DOGRULAMA.md`'ye yazılır. Kendi kanıtının bağımsız bir araçla örtüşmesi en güçlü güvencedir.

## 4. Kaynaklar

ITU-R BT.1702-3 (11/2023), https://www.itu.int/rec/R-REC-BT.1702/ (PDF okundu, A). W3C, Understanding SC 2.3.1,
https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html (okundu, A). ACM TACCESS 2024
(dl.acm.org/doi/10.1145/3694790; arama özeti, B). Lyraska `src/lib/flash.ts`, `flashGuard.ts`, `flashGuardMath.ts`,
`components/MilkDropScene.tsx`, `PhotoScene.tsx` (A).
