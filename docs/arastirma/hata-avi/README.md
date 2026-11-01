# Hata avı (1 Kasım 2026): doğrulama ve düzeltme takibi

Proje sahibi `fd13851` üzerinde dışarıdan (Claude API) toplu bir hata avı yaptırdı. Rapor 29 bulgu verdi ve her biri
için kodun bir kopyasıyla çalışan tek başına bir test yazdı. Rapor ve testler depoda değil (sahibinin indirdiği
`lyraska-denetim.zip`). Burada her bulgunun **bizim kodumuzda** doğrulanıp doğrulanmadığı ve hangi PR'da düzeltildiği
tutulur.

Doğrulama iki yolla yapıldı:

- **Ölçüm:** gerçek kodu çağıran geçici bir testle (depoya girmedi). Raporun verdiği sayıların hepsi aynen çıktı.
- **Okuma:** kod okunarak.

## Sonuç

Raporda 28 madde var (rapor A5 ile A6'yı aynı dosyada iki hata saydığı için 29 diyor). Sonuç:

- 23 madde gerçek.
- 1 madde gerçek ama nadir (A4).
- 1 maddenin etkisi yok (B2).
- 1 madde yanlış (B4).
- 2 maddeye derin bakılmadı (B12, B14).

| No  | Bulgu                                                                    | Hüküm                                                                                                                                                                                               | Yol   | PR               |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------- |
| A1  | EQ ön kazancı eğrinin tepesini eksik bildiriyor                          | Gerçek: zikzakta 12 yerine 14,44 dB, hepsi +12'de 12,78 dB. Kırpılma yok (taşma koruması yakalıyor), ama koruma gereğinden çok çalışıyor                                                            | ölçüm | `claude/eq-tepe` |
| A2  | ID3v2 + ID3v1'li MP3'te kapak kayboluyor                                 | Gerçek: `embedded_cover` yalnızca son revizyona bakıyor, `read_tags` hepsine                                                                                                                        | okuma |                  |
| A3  | REW'in "Filter Settings file" başlığı içe aktarmayı bozuyor              | Gerçek: `BadLine { line: 1 }`                                                                                                                                                                       | ölçüm |                  |
| A4  | Tekrarda boşluksuz geçiş kayboluyor                                      | Nadir: programda "tek şarkıyı tekrarla" yok. Yalnızca aynı şarkı listede art arda 3+ kez geçerse olur                                                                                               | okuma |                  |
| A5  | Boş `.lrc` gömülü sözleri gizliyor                                       | Gerçek                                                                                                                                                                                              | okuma |                  |
| A6  | İlk kelime damgasından önceki kelime düşüyor                             | Gerçek: `[(1.5, "ğüzel")]`                                                                                                                                                                          | ölçüm |                  |
| A7  | İleri kaydırılan haritanın enerjisi doğrulamadan geçmiyor                | Gerçek: sınır `ceil(d) + 2`. Düzeltme `+ 1`'e değil, doğrulamanın sınırına kırpmalı; yoksa mevcut test `kaydirma_atilan_vuruslari_ve_olcu_basini_dogru_tasir` bozulur                               | okuma |                  |
| A8  | "4x4" metni "dörtx" oluyor                                               | Gerçek                                                                                                                                                                                              | ölçüm |                  |
| A9  | Boş taslak kaydedilince şarkının kendi sözü gizleniyor                   | Gerçek: `revert` gibi `setLoaded(null)` eksik                                                                                                                                                       | okuma |                  |
| A10 | İşaretlemede eski şarkının değerlendirmesi yeni şarkıda görünüyor        | Gerçek (yarış)                                                                                                                                                                                      | okuma |                  |
| A11 | Kapaksız liste içe aktarılınca eski kapak görünüyor                      | Gerçek                                                                                                                                                                                              | okuma |                  |
| A12 | `flashGuardCheck` deseninde faz bazı karelerde dönmüyor                  | Gerçek (yalnızca denetim deseni, programa girmez)                                                                                                                                                   | okuma |                  |
| A13 | Araştırma betiğinde eşit skorlarda AUROC                                 | Gerçek (araştırma betiği)                                                                                                                                                                           | —     |                  |
| B1  | MilkDrop: klasör seçilince çalan sağlam görsel atlanıyor                 | Gerçek: çalarken yazılan "şu an açık" işareti `install`'da çökme kaydı sanılıyor                                                                                                                    | okuma |                  |
| B2  | MilkDrop: `fShader` yanlış adla                                          | Etkisi yok: Butterchurn bu ayarı hiç okumuyor. Ad düzeltilebilir                                                                                                                                    | okuma |                  |
| B3  | MilkDrop: şekillerin `bTextured` ayarı kayboluyor                        | Gerçek: Butterchurn `textured` okuyor, biz `btextured` gönderiyoruz                                                                                                                                 | ölçüm |                  |
| B4  | MilkDrop: blok yorumundaki `//` döngü sınırını atlatıyor                 | **Yanlış.** `effective_code`, eel-wasm'ın ön işlemesinin harfi harfine aynısı (`node_modules/eel-wasm/dist/index.js`). Eel-wasm da `*/`'dan sonrasını satır sonuna kadar atıyor, kod hiç çalışmıyor | okuma | —                |
| B5  | Gölgelendirici döngüsü: `uint(-5)` −5 sayılıyor                          | Gerçek, ama kuramsal: çeviricinin bunu ürettiği gösterilmedi                                                                                                                                        | okuma |                  |
| B6  | Türkçe sözde `[REFRAIN]`, `[Nakarat II]` tanınmıyor                      | Gerçek. Köşeli ayraçlı satır her zaman başlık sayıldığı için İngilizce ikinci deneme hiç çalışmıyor                                                                                                 | ölçüm |                  |
| B7  | Nakarattan sonraki "Söz-Müzik:" satırı nakaratı boşaltıyor               | Gerçek: `["la ışık", "yo"]`                                                                                                                                                                         | ölçüm |                  |
| B8  | LRC `[offset:]` sonrası satır "çeviri" olarak yutuluyor                  | Gerçek: B, A'nın çevirisi oluyor                                                                                                                                                                    | ölçüm |                  |
| B9  | MilkDrop: yükleme sırasında çizimde çöken görsel "kötü" işaretlenmiyor   | Gerçek                                                                                                                                                                                              | okuma |                  |
| B10 | Gece göğü: açılım varsayılan modda tek karede sıçrıyor                   | Gerçek (belgeyle çelişiyor)                                                                                                                                                                         | okuma |                  |
| B11 | Parçacık yoğunluğu 0,25 iken "0,5×" yazıyor                              | Gerçek: `formatSpeed` hız aralığına kırpıyor                                                                                                                                                        | okuma |                  |
| B12 | `check:commands` zorunlu parametreye `undefined` gönderilmesini görmüyor | Derin bakılmadı                                                                                                                                                                                     | —     |                  |
| B13 | `check:audio` başında 1–15 sıfır bayt olanı görmüyor                     | Gerçek: eşik `zeros >= 16`                                                                                                                                                                          | okuma |                  |
| B14 | `check:scenes` parlama testinde konsol hataları dinlenmiyor              | Derin bakılmadı                                                                                                                                                                                     | —     |                  |
| B15 | `check:scenes` söz zamanlaması testinde konsol/CSP hataları dinlenmiyor  | Gerçek: yalnızca `pageerror` dinleniyor                                                                                                                                                             | okuma |                  |

Raporun "denetlenmeyen şüpheler" listesinden `structure.rs`'teki `step_by(0)` riskine bakıldı. Ölçü sayısı 3 ya da 4
seçildiği için (aksakta grup sayısı) 0 olamıyor.

## A1'in düzeltmesi (`claude/eq-tepe`)

- Ön kazanç artık en yüksek sürgü değil, eğrinin taranan gerçek tepesi. Tarama 10 Hz'ten 0,49 · fs'e kadar, oktavda
  48 noktayla (parametrik EQ'daki gibi). Noktalar `Layout`'ta bir kez hesaplanıyor. Tasarım ses iş parçacığında, ayar
  değişirken her 2 ms'de bir yapılıyor; tarama bellek ayırmıyor.
- 10 Hz'in altı taranmıyor: müzikte orada kayda değer enerji yok, kalanı taşma koruması yakalıyor.
- Tepki hesabı φ biçimine geçti (`biquad::phi`). Eski cos(w) biçimi yüksek hızda alçak frekansta birbirine çok yakın
  sayıları çıkarıyor, 192 kHz'te 10 Hz'te ~%0,5 gürültü veriyordu. Yeni test bu gürültüyü "tepe kaçırma" olarak
  yakaladı.
- Izgaranın kaçırdığı en büyük değer 0,0132 dB (48 kHz zikzak, ~21,7 kHz). Testin sınırı 0,02 dB.
- Ön kazanca kesin ya da yaklaşık değer bekleyen 6 mevcut test, sahibinin onayıyla, gerçek tepeye göre güncellendi.
  Testler gevşetilmedi.
  - `eq.rs`'teki 5 test: beklenen değer sık bir taramayla bağımsız olarak hesaplanıyor (0,02 dB içinde). Eğrinin
    sürgüye ulaştığı da ayrıca sınanıyor.
  - `player/tests.rs` `gorseller_ekolayzer_yukseltmesini_duyuldugu_gibi_gosterir`: "~6 dB kısma (±1)" bekliyordu.
    Gerçek kısma, eski kodda bile 7 dB'di: 12 dB yükseltme eksi 5 dB boşluk, çünkü taşma korumasının tavanı −1 dBTP.
    Şimdi 12,71 eksi 5 = 7,7 dB. Beklenen değer bu hesaptan çıkıyor; sınır aynı (±1).
