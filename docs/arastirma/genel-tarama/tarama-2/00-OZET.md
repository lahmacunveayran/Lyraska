# Tarama 2 — Özet (6 Kasım 2026)

Bağımsız ikinci tarama: sistematik inceleme + kırmızı takım. Tarama 1'e bakılmadı. Yöntem `01-PROTOKOL.md`'de
(sorular, on dilde arama dizgileri, dahil etme ölçütleri, kaynak dereceleri, sapmalar). Her bulgunun kanıt düzeyi
(A birincil okundu, B ikincil, C çıkarım) dosyalarda ve `90-KANIT-TABLOSU.md`'de (51 satır).

## Proje sahibi için tek paragraf

Lyraska'nın ses tarafı (EQ, ses yüksekliği ölçümü, yeniden örnekleme, sınırlayıcı) ve mühendislik disiplini dünya
standardında, hatta birçok yerde üstünde. Asıl zayıflık **şarkı analizinin doğruluğunun dünyanın ortak test
setlerinde hiç ölçülmemiş olması**: vuruş, ölçü başı, aksak, bölüm, drop ve ton sayılarının hepsi kendi ürettiğimiz
deneme şarkılarından ya da sizin kütüphanenizin tutarlılığından geliyor. Literatüre göre Lyraska'nın kullandığı klasik
yöntemler bugünün en iyilerinden belirgin biçimde geride (örnek: Türk usullerinde klasik takipçi vuruşları ~%70
doğru bulurken usulü bilen model ~%90). İyi haber: en iyi vuruş/ölçü başı modeli (**Beat This**, Avusturya JKU
Linz, 2024) **kodu ve ağırlığıyla MIT lisanslı**, küçük sürümü 8 MB ve işlemcide çalışıyor; yani eski kuralla bile
programa girebilir. 6 Kasım kararınız (kişisel kullanım) ayrıca ton, duygu ve yapı için birkaç güçlü modelin yolunu
açıyor (yalnızca bilgisayarınızda, yerel paket olarak).

## En önemli 7 bulgu

1. **Ölçüm boşluğu (Z1).** Vuruş, ölçü başı, yapı, ton, drop için standart set sonucu yok; ROADMAP'in "F ≥ 0,80"
   hedefi sete bağlanmamış. Dünyanın en iyisi GTZAN'da vuruş F1 **0,891**, ölçü başı **0,783** (A).
2. **Beat This lisansı temiz (A):** "The code and the published model weights are released under the MIT license";
   küçük model ~2 M parametre, GTZAN'da 0,888 / 0,772; işlemcide çalışıyor. Lyraska'nın kütüphanenin yarısında
   kapattığı ölçü vurgusunu (339/656 şarkıda ölçü güveni < 0,5, A) geri getirebilecek en ucuz yol.
3. **Söz hizalama dünya düzeyinde ama kırılgan (A):** ±0,3 sn içindeki kelime oranı Lyraska'da %94,1, dünyanın en
   iyisinde %94; ortalama hata ise 0,89 sn ↔ 0,18 sn — fark beş "kayan" şarkıdan. Çözüm sağlamlıkta: yapı bilgisiyle
   kayan nakaratı yakalamak.
4. **Ton EDM'de zayıf yöntemle (A):** Lyraska'nın sınıfındaki ton profilli yöntemler GiantSteps'te 0,45–0,59; CNN
   0,746; ticari 0,75–0,80. Kütüphaneniz çoğunlukla EDM ve Faz 6–7 (ton uyumu, Otomatik DJ) bu bilgiye dayanacak.
5. **Güvenli modda bir boşluk (A):** MilkDrop'ta kırmızı parlama freni kapalı ("bilinen boşluk" diye kodda yazıyor);
   ITU-R BT.1702-3 "parlaklıktan bağımsız olarak doygun kırmızıya geçiş zararlı olabilir" diyor. Kırmızı ölçüsü de
   WCAG 2.2'de değişti (u′v′ > 0,2; ISO 9241-391). Bunun dışında güvenli mod standarttan **3 kat sıkı**.
6. **Ses yüksekliği yalnızca parça başına (A kod, B standart):** albüm modu ve ReplayGain etiketi yok; AES TD1008
   albüm eşitlemeyi öneriyor (dinleyicilerin %80'i tercih etmiş).
7. **"Önceden bilme"nin kullanılmayan en büyük getirisi:** güvenli modda parlaklık yörüngesini **önceden planlamak**
   (nabız tepesi tam vuruşa düşsün, hız sınırları aynen kalsın), yoğunluk bütçesini şarkının doruğuna saklamak ve
   EDM'de 8 ölçülük cümle önseli (bu önsel bir otomatik DJ sisteminde şarkıların %91'ini tamamen doğru çözümlemiş, A).

## En zayıf 10 nokta (ayrıntı ve kanıt: `80-ELESTIREL-DENETIM.md`)

Z1 standart sette ölçüm yok · Z2 ölçü başı kütüphanenin yarısında kapalı · Z3 sentetik set + elle eşikler (ezber) ·
Z4 aksak kararı önselsiz (maksum → aksak) · Z5 ton EDM'de zayıf, ölçülmedi · Z6 söz hizalamada felaket hataları ·
Z7 albüm eşitlemesi yok · Z8 güvenli modda MilkDrop kırmızısı · Z9 koreografi kural tabanlı ve ölçütsüz ·
Z10 yapı analizi kromasız, işlev etiketi yok. Ek: Rubber Band GPL-3.0 ile **uyumlu** (ROADMAP yanlış varsayıyor);
Demucs artık sizin kararınıza açık.

## Öncelikli yol haritası önerisi (her adım küçük PR; ölçülebilir ölçütle)

| Sıra  | İş                                                                                                                                                                 | Modül                                       | Başarı ölçütü                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1     | **Analiz ölçüm aracı** (tek araç; GTZAN, Ballroom, SMC, Harmonix, GiantSteps; sesler yalnızca sizin bilgisayarınızda)                                              | `examples/`, `analysis/evaluate.rs`         | Dört görevde taban çizgisi tablosu, %95 aralıklarla; her ritim/ton/yapı sürüm PR'ında tablo       |
| 2     | Güvenli modda MilkDrop kırmızı freni (kod hazır) — sizin onayınızla                                                                                                | `MilkDropScene.tsx`                         | Kırmızı↔gri deneme presetinde güvenli modda ≤ 1 kırmızı parlama/sn; mevcut parlama testleri aynen |
| 3     | Albüm modu (ses yüksekliği)                                                                                                                                        | `audio/normalize.rs`                        | Sentetik albümde albüm içi farklar ±0,1 LU korunur; karışık sırada parça modu                     |
| 4     | Aksak kararına önsel + düm/tek ayrımı                                                                                                                              | `analysis/meter.rs`                         | Maksum/Türk pop'u karşı örneklerinde yanlış aksak 0; gerçek aksak isabeti düşmez                  |
| 5     | **Ritim paketi** (Beat This küçük model, tract, SHA-256 denetimli yerel dosya)                                                                                     | yeni `analysis/rhythm_model.rs`             | GTZAN vuruş F1 ≥ 0,85, ölçü başı ≥ 0,70; kütüphanede ölçü güveni < 0,5 oranı %52 → ≤ %25          |
| 6     | Söz hizalamada bölüm kaydı algılama + yeniden hizalama                                                                                                             | `analysis/lyrics_align.rs`, `lyrics_job.rs` | Jamendo son sınamada şarkı başına ortalama 1,33 → ≤ 0,40 sn; PCO düşmez                           |
| 7     | Yapıya kroma + tını SSM                                                                                                                                            | `analysis/structure.rs`                     | Harmonix HR3F taban çizgisinden ≥ +0,10                                                           |
| 8     | Ton: ölçüm + profil seçimi; isteğe bağlı ton CNN paketi (NC, yerel)                                                                                                | `analysis/key.rs`                           | GiantSteps w ≥ 0,65 (klasik), ≥ 0,72 (paketle); sizin işaretlerinizde aynı/komşu ≥ %80            |
| 9     | Güvenli modda planlanmış parlaklık yörüngesi                                                                                                                       | `director/`, sahneler                       | Nabız tepesi–vuruş farkı ortanca ≤ 20 ms; parlama testleri aynen                                  |
| 10    | Görsel tercih ölçümü (iki eksenli A/B, kısa klipler)                                                                                                               | önizleme betikleri                          | Yeni sahnenin kazanma oranı ≥ %70 (≥ 10 eşleşme)                                                  |
| Sonra | Yapı paketi (SongFormer NC ya da All-In-One + Demucs: sizin kararınız), değerlik ekseni (Essentia NC), benzerlik gömmesi (Otomatik DJ), WebGPU'ya şimdilik geçmeme | —                                           | `12`, `13`, `50`, `40` dosyalarında                                                               |

Size sorulacak kararlar: (1) Demucs ağırlıklarını "araştırma lisansı" sayıp yerel paket olarak kabul ediyor musunuz?
(öneri: yalnızca gerekirse; önce Beat This ve SongFormer); (2) MilkDrop kırmızı freni güvenli moda girsin mi? (öneri:
evet — güvenli modu yalnızca sıkılaştırır); (3) ölçüm için GTZAN/Ballroom/Harmonix seslerini bilgisayarınıza edinmek
(araştırma amaçlı; depoya girmez).

## Erişilemeyen kaynaklar (dürüstlük notu)

- Oturumun ilk yarısında yalnızca github/pypi/youtube açıktı; sonra koordinatör ağı genişletti (`01-PROTOKOL.md`
  S3–S4). Genişlemeden sonra önemli sayılar birincil kaynaktan yeniden okundu.
- Hâlâ kapalı ya da başarısız: **cdn-lfs.huggingface.co, web.archive.org, elibrary.ru, music-ir.org (MIREX sonuç
  sayfaları), essentia.upf.edu, staff.aist.go.jp (Songle/TextAlive PDF'leri), wiki.hydrogenaud.io (ReplayGain 2.0;
  403), aes.org belge indirme (TD1008; 403), dl.acm.org (BT.1702 boşluk analizi)**. Bunlardaki bilgiler B düzeyinde.
- Okunmayanlar: Beat Transformer ve SCNet makale gövdeleri, Foote/MSAF'ın SALAMI sonuçları, Sturm'ün GTZAN eleştirisi,
  Skip-BART'ın model boyutu, Omnilingual 1B'nin ayrı lisans satırı, Rocket'in lisansı.
- Dil kapsamı eşit değil: Japonca (Songle, TextAlive), Türkçe (usul/makam), İspanyolca (Faraldo tezi), Fransızca
  (Télécom Paris/IRCAM tezleri) verimliydi; Çince, Korece, Rusça ve İtalyanca aramalar yalnızca birer ikişer ilgili
  kaynak verdi (CNKI, Bilibili, Zhihu'da derinlemesine arama yapılmadı). Bu bir sınırlılıktır.
- Yerel ölçüm yapılmadı (görev sınırı: `cargo` yok); "Lyraska'nın yeri" tahminleri C düzeyinde ve her biri bir ölçüm
  planıyla bitiyor.

## Dosyalar

`01-PROTOKOL` · `10-RITIM-OLCU-TEMPO` · `11-AKSAK-MAKAM-USUL` · `12-YAPI-DROP` · `13-TON-DUYGU-TUR` ·
`20-KAYNAK-AYRISTIRMA` · `21-SOZ-HIZALAMA-VOKAL` · `30-SES-DSP` · `40-GORSELLER-KOREOGRAFI` · `41-ISIGA-DUYARLILIK` ·
`50-KUTUPHANE-UX` · `60-MUHENDISLIK-TEST` · `80-ELESTIREL-DENETIM` · `85-FIRSATLAR` · `90-KANIT-TABLOSU`.
