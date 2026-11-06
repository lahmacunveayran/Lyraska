# Genel tarama — sentez (6 Kasım 2026)

Proje sahibinin isteği: projenin tamamı için, geriye dönük de, farklı dillerde, forum / video / makale / üniversite
arşivi / dergi taraması; "iki tarama, ikincisi daha profesyonel ve daha bağımsız". İki ayrı araştırmacı birbirinin
çıktısını görmeden çalıştı:

- [Tarama 1](tarama-1/00-OZET.md): alan alan geniş tarama (8 alan, 23 bulgu, 12 adım).
- [Tarama 2](tarama-2/00-OZET.md): sistematik inceleme protokolü ([01-PROTOKOL](tarama-2/01-PROTOKOL.md)), kanıt
  düzeyli ([90-KANIT-TABLOSU](tarama-2/90-KANIT-TABLOSU.md), 51 satır), kırmızı takım
  ([80-ELESTIREL-DENETIM](tarama-2/80-ELESTIREL-DENETIM.md)) ve "önceden bilme" fırsatları
  ([85-FIRSATLAR](tarama-2/85-FIRSATLAR.md)).

Bu sentezi koordinatör yazdı. Raporlardaki önemli iddiaların bir kısmını ayrıca kendisi denetledi; aşağıda
**[denetlendi]** diye işaretli. Ağ, taramaların ortasında genişletildi (arXiv, Zenodo, Hugging Face, ISMIR, DAFx,
J-STAGE, Habr, Zhihu, HAL vb.); iki tarama da önemli sayıları ve lisansları bundan sonra birincil kaynaktan yeniden okudu.

## 1. İki taramanın bağımsız olarak vardığı ortak sonuçlar (en sağlam bulgular)

1. **Analizin doğruluğu dünyanın ortak test setlerinde hiç ölçülmemiş** (söz hizalama hariç). Vuruş, ölçü başı, yapı,
   ton ve drop sayıları sentetik setlerden ya da kütüphane tutarlılığından geliyor; ROADMAP'in "beat F ≥ 0,80" hedefi bir
   sete bağlı değil. İki tarama da bunu birinci sıraya koydu.
2. **Beat This (JKU Linz, ISMIR 2024): kod ve ağırlıklar MIT** [denetlendi: README "The code and the published model
   weights are released under the MIT license", LICENSE dosyası]. GTZAN'da vuruş F1 0,891, ölçü başı 0,783; küçük model
   (~2 M parametre, 8 MB) 0,888 / 0,772. Eski kuralla bile programa girebilir. Kütüphanede ölçü güveni 656 şarkının
   339'unda 0,5'in altında; bunu düzeltmenin en ucuz yolu. Tarama 1'in ek önerisi: ağın olasılığını Lyraska'nın dinamik
   programlamasıyla birleştirmek (ağ zaman zaman periyodik olmayan vuruş üretiyor; yazarlar da söylüyor).
3. **Söz hizalama dünya düzeyinde ama kırılgan:** ±0,3 sn içindeki kelime oranı Lyraska'da %94,1, Spotify'ın ICASSP
   2023 sisteminde %94; ortalama hata ise birkaç "kayan" şarkı yüzünden çok daha büyük. Çözüm daha iyi model değil,
   kaymayı yakalamak (satır güveni) ve tekrar eden nakaratla düzeltmek.
4. **Güvenli modda MilkDrop'un kırmızı parlama freni kapalı** [denetlendi: `MilkDropScene.tsx`'te
   `createFlashGuard(gl, { safe })`, `red: true` yok; "Kendi resmin"de var]. ITU-R BT.1702-3 (2023) doygun kırmızı
   geçişini parlaklıktan bağımsız olarak zararlı sayar. **Sahibi açılmasını onayladı (6 Kasım).**
5. **Albüm modu ses yüksekliği yok** (AES TD1008 albüm eşitlemesini öneriyor; Plexamp albüm bağlamını koruyor).
6. **Ton tespiti EDM için zayıf yöntem sınıfında ve ölçülmemiş.** Sayılarda iki tarama farklı yerden bakıyor (aşağıda §3).
7. **Kaynak ayrıştırmada tablo tersine döndü:** yeni kararla BS-RoFormer, Mel-RoFormer, HTDemucs, SCNet, MDX23C yerelde
   kullanılabilir. Düzeltme: önceki raporun "lisanssız" dediği Kimberley Jensen Mel-RoFormer'ın Hugging Face kartında
   lisans MIT. İki tarama da şunu vurguluyor: Lyraska ayrılmış sesi çalmıyor, zarf ve başlangıç saklıyor; bu yüzden SDR
   tek başına yanlış ölçü. Asıl ölçü kick/trampet başlangıç F1'i, bas zarfı ilintisi, vokal etkinliği.

## 2. Yalnızca bir taramada olan, ama önemli bulgular

**Tarama 1:**

- **WASAPI'de Microsoft'un Raw modu ve "Media" kategorisi istenmiyor** [denetlendi: `wasapi.rs`'te yok]. Windows'un ses
  iyileştirmeleri (ses yüksekliği eşitleme, sanal surround) Lyraska'nın sesini değiştirebilir; sahibinin "müzikler garip
  geliyor" bildirimiyle ilgili olabilir. Küçük iş, doğrudan ses kalitesi.
- ~~Özel modda 16 bite indirgemede dither yok~~ — **gerekmiyor** [denetlendi, 6 Kasım 2026]: özel mod yalnızca aygıtın geçerli bit sayısı kaynağınkine eşit ya da büyükse açılır (`bit_perfect.rs`) ve o oturumda ses işlenmez (`render.rs`); bit sayısı hiç düşürülmez. Paylaşımlı mod 32 bit kayan noktadır, dönüşümü Windows yapar. Dither eklemek bit-perfect'i bozardı.
- **ABX'in istatistiksel gücü düşük:** 16 denemede gerçek isabeti 0,7 olan dinleyici testi %45 olasılıkla geçiyor; "fark
  yok" yerine "kanıtlanamadı" ve güç bilgisi yazılmalı.
- **Metamorfik testler ve bulanık sınama (fuzzing) yok:** "sesi kaydır → vuruşlar kayar", "44,1 ↔ 48 kHz → aynı BPM",
  "+1 yarım ton → ton +1" gibi ilişkiler, doğrusu bilinmeyen analizi sınamanın standart yolu.
- **Senkron eşikleri asimetrik** (ITU-R BT.1359: ses önde/geride farklı tolerans); belirsizlikte görüntü geç değil hafif
  erken olmalı. (Sayılar arama özetinden; doğrulanacak.)
- **Sistem sesi modu için gerçek zamanlı PLP** (AudioLabs Erlangen, TISMIR 2024, kod MIT).
- **Ağır modeller için sahibinin RTX 4050'si** [denetlendi: BILGI-BIRIKIMI]. tract yalnızca işlemcide çalışır; ağır
  ayrıştırma modelleri için GPU yolu (ONNX Runtime + CUDA) düşünülecek tek yer burası.

**Tarama 2:**

- **"Önceden bilme"nin kullanılmayan getirisi:** güvenli modda parlaklık yörüngesini önceden planlamak (hız sınırları
  aynen, nabız tepesi tam vuruşa düşer), yoğunluk bütçesini şarkının doruğuna saklamak, EDM'de 8 ölçülük cümle önseli
  (Vande Veire 2018'in otomatik DJ sistemi bu önselle şarkıların %91'ini tamamen doğru çözümlüyor). Japonca kaynaklar:
  AIST'in Songle / Songle Sync ve TextAlive çalışmaları.
- **Aksak kararı önselsiz:** maksum ve Türk pop'u yanlışlıkla aksak sanılabiliyor; usul bilinince aksak 9/8'de ölçü başı F
  0,886, bilinmeyince 0,651 (Holzapfel ve ark. 2014). İki tarama da aynı makaleye vardı; Tarama 1 bir özet hatasını düzeltti
  ("%69,6" ölçü başı değil, usul tanıma oranı).
- **Yapı analizi kromasız ve işlev etiketi yok** (nakarat/kıta). Harmonix setinde ölçülebilir.
- **Rubber Band GPL-2.0-or-later, yani GPL-3.0-only ile uyumlu;** ROADMAP onu "GPL olduğu için ikinci seçenek" sayıyor.
- **Kırmızı ölçüsü değişti:** WCAG 2.2, ISO 9241-391'in tanımını (u′v′ > 0,2) getirdi; Lyraska eski
  `320·max(0, R − G − B)` ölçüsünü kullanıyor.
- **Sentetik setler ve elle ayarlanmış eşikler:** ezber riski; dünya setleriyle çapraz doğrulama gerekiyor.

## 3. Çelişkiler ve nasıl çözülecekleri

- **Ton:** Tarama 2 Lyraska'nın yöntem sınıfına GiantSteps'te 0,45–0,59, CNN'e 0,746 veriyor; Tarama 1 ise sinir ağlarının
  MIREX ağırlıklı puanında klasiğin "çok önünde olmadığını" söylüyor (madmom 71,0, S-KEY 72,1). İkisi farklı karşılaştırma
  (Krumhansl–Kessler'e karşı EDM'e ayarlı en iyi klasik profiller). **Karar ölçümle:** GiantSteps Key setinde Lyraska'nın
  kendi sonucu çıkınca hangi yolun (profil seçimi mi, model mi) gerektiği belli olur.
- **Yapı:** Tarama 1 tekrar eden söz satırlarını ucuz ve güçlü bir işaret sayıyor; Tarama 2 kroma ve tını SSM'i öneriyor.
  Çelişki değil, birbirini tamamlar; Harmonix'te ikisi ayrı ayrı ölçülür.
- **Demucs:** Tarama 2 "yalnızca gerekirse" diyordu; **sahibi kararını verdi** (6 Kasım): lisansı belirsiz olanlar dahil
  bütün modeller yerelde kullanılabilir ve en iyi sonuç için harmanlanabilir.

## 4. Sahibinin bugünkü kararları

1. Lyraska ticari değil, kişisel; NC/araştırma lisanslı ağırlıklar ve veri setleri yalnızca sahibinin bilgisayarında
   (A seçeneği; depo herkese açık kalır).
2. Lisansı yazılmamış ya da belirsiz modeller de yerelde kullanılabilir; modeller harmanlanabilir.
3. Güvenli modda MilkDrop'ta kırmızı parlama freni açılır.
4. Sonuç olarak dünya setleri (GTZAN, Ballroom, SMC, Harmonix, GiantSteps, MUSDB18-HQ, JamendoLyrics) yerel ölçüm için
   kullanılabilir; depoya girmez.

## 5. Birleşik yol haritası (her adım küçük PR, ölçülebilir başarı ölçütüyle)

| Sıra | İş                                                                    | Neden önce                                                                     | Başarı ölçütü                                                                                                     |
| ---- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1    | Güvenli modda MilkDrop kırmızı freni                                  | Güvenlik; onaylandı; kod hazır                                                 | Kırmızı↔gri deneme presetinde güvenli modda ≤ 1 kırmızı parlama/sn; mevcut parlama testleri aynen                 |
| 2    | WASAPI Raw modu + Media kategorisi (desteklenmezse eski yol)          | Küçük iş, doğrudan ses; "garip ses" bildirimi                                  | Paylaşımlı modda Windows iyileştirmeleri açıkken giriş–çıkış farkı ≤ −100 dB (sahibinin bilgisayarında)           |
| 3    | Kaynak ayrıştırma ölçümü (MUSDB18-HQ; sürüyor)                        | Ölçü aleti hazır ([#226](https://github.com/lahmacunveayran/Lyraska/pull/226)) | HTDemucs, BS-RoFormer, Mel-RoFormer, SCNet, harman ve klasik yol aynı tabloda; SDR + başlangıç F1 + zarf ilintisi |
| 4    | Analiz ölçüm aracı (GTZAN, Ballroom, SMC, Harmonix, GiantSteps)       | Bütün analiz işlerinin ön koşulu                                               | Dört görevde taban çizgisi tablosu, %95 güven aralığıyla; her ritim/ton/yapı PR'ında tablo                        |
| 5    | Ritim paketi: Beat This + Lyraska DP                                  | En büyük tek kazanç                                                            | GTZAN vuruş F1 ≥ 0,85, ölçü başı ≥ 0,70; ölçü güveni < 0,5 oranı %52 → ≤ %25; aksak isabeti düşmez                |
| 6    | Söz kayması algılama + nakaratla yeniden hizalama                     | Ortalamayı bozan birkaç şarkı                                                  | Jamendo'da şarkı başına ortalama hata belirgin düşer; ±0,3 sn isabeti düşmez                                      |
| 7    | Aksak önseli ve ölçü süresi kanıtı                                    | Yanlış aksak                                                                   | Maksum/Türk pop'u karşı örneklerinde yanlış aksak 0                                                               |
| 8    | Albüm modu ses yüksekliği                                             | Dinleme deneyimi                                                               | Sentetik albümde iç farklar ±0,1 LU                                                                               |
| 9    | Ton: ölçüm, profil seçimi, gerekirse model                            | Faz 6–7'nin dayanağı                                                           | GiantSteps'te ölçülen taban çizgisinin üstü; sahibinin işaretlerinde aynı/komşu ≥ %80                             |
| 10   | ABX gücü, metamorfik + fuzz testleri (dither gerekmiyor, bkz. yukarı) | Küçük ama dünya standardı                                                      | Her biri kendi testleriyle                                                                                        |
| 11   | Güvenli modda planlanmış parlaklık yörüngesi                          | "Önceden bilme"nin görsel getirisi                                             | Güvenli modun davranışına dokunur: **önce sahibinin onayı**; nabız tepesi–vuruş farkı ortanca ≤ 20 ms             |
| 12   | GPU yolu (RTX 4050)                                                   | Ağır ayrıştırma modelleri işlemcide yavaş                                      | Ölçümden sonra sahibine seçenek + öneri; mimari karar                                                             |

## 6. Doğrulanması gerekenler (karar vermeden önce birincil kaynaktan okunacak)

BT.1359 ve EBU R37 senkron eşikleri; müzik duygu tanıma R² değerleri; DubSpot ton yüzdeleri; Waseda AUC 0,963; LatinMIR
2024 bulguları; Songle/TextAlive makaleleri (staff.aist.go.jp kapalıydı); AES TD1008 metni (indirme 403); MIREX sonuç
sayfaları (music-ir.org yanıt vermedi). Raporlarda "[özet]" ya da "B" düzeyli her sayı bu gruptadır.

## 7. Sınırlılıklar

- Çince, Korece, Rusça ve İtalyanca aramalar az ilgili kaynak verdi; CNKI, Bilibili ve Zhihu'da derin arama yapılmadı.
  Japonca (Songle, TextAlive, J-STAGE), Türkçe (usul/makam), İspanyolca (Faraldo tezi) ve Fransızca (IRCAM, Télécom
  Paris) verimliydi.
- Reddit otomatik istemciyi reddetti (tarayıcı kimliği taklit edilmedi); forum görüşleri çoğunlukla arama özetinden.
- Taramalarda yerel ölçüm yapılmadı; "Lyraska'nın dünyadaki yeri" tahminleri bu yüzden ölçüm planına bağlandı (§5).
