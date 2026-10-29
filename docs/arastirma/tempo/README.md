# Tempo oktavı ölçümü (29 Ekim 2026)

Proje sahibi: "yarım tempolu dubstep 128 bulunuyor, drum and bass çoğu zaman 87". İkincisi bir **oktav hatası**:
bulunan tempo doğrunun yarısı. Vuruş takipçisi (`analysis/beats.rs`) tempoyu başlangıç gücünün öz-ilintisinden bulur.
Öz-ilinti yalnızca "hangi aralıkta tekrar var" sorusunu cevaplar. Snare'i iki vuruşta bir gelen drum and bass'ta
87 de 174 de tekrar eder. Kick ve clap'ı ölçüde bir gelen yarım tempolu trap'te 70 de 140 da tekrar eder. 120 BPM'i
yeğleyen ağırlık bu ikisini ayıramaz. Gerçek şarkılar oturumda yok (ses dosyası depoya girmez). Bu yüzden tempo,
**temposu bilinen** sentetik şarkılarla ölçüldü.

## "Doğru" tempo

DJ yazılımlarının ve müzisyenlerin kabulüne göre doğru tempolar şunlardır: dubstep ve trap 140 (70 değil), drum and
bass 170–176 (87 değil), hip-hop 85–95 (170–190 değil), house 120–128, balad 60–72. Yani oktav belirsizliği **türün
ritim kalıbına göre** çözülür:

- **Tempo algısı:** dinleyiciler vuruşu en çok 120 BPM (~2 Hz) çevresinde duyar. Dağılım logaritmik eksende çan
  biçimlidir ve bir oktav kadar geniştir (Moelants 2002, "Preferred tempo reconsidered"; McKinney ve Moelants 2006,
  "Ambiguity in tempo perception"). Aynı parçada dinleyicilerin bir kısmı yarısını ya da iki katını vurur. Yalnızca bu
  öncelikle karar verilemez: 87 ile 174, 120'ye neredeyse eşit uzaklıktadır.
- **Ölçü düzeyi (metrical level):** popüler müzikte kick vuruşa (1 ve 3), snare ya da clap backbeat'e (2 ve 4) düşer.
  Snare'ler vuruş **aralarına** düşüyorsa sayılan tempo yarısıdır. Drum and bass'ta 87'ye göre durum böyledir.
- **Yarım tempo hissi:** dubstep ve trap'te snare ölçüde bir kez (3'te) çalar, hi-hat 140'ın sekizliklerini sürdürür.
  Yavaş sayım (70) "his", tempo 140'tır. Yavaş baladda (66) sekizlik piyano vardır ama aralarında bir şey yoktur. Orada
  vuruş 66'dır.

Bu ilkeler `analysis/tempo.rs`'in üç kuralına dönüştü.

## Araçlar

- `uret.py`: on bir türde temposu ve vuruşları bilinen 48 saniyelik deneme şarkıları üretir (numpy; 44,1 kHz mono
  WAV ve JSON). Türler: dubstep (138–142; kick 1'de, snare 3'te, wobble, kimi şarkıda hi-hat kısık ve dörtlük), trap
  (135–150; 808, clap 3'te, hi-hat roll'ları), drum and bass (170–176; iki adım, snare çoğu zaman kick'ten güçlü), house
  (120–128), hip-hop (84–96; swing'li hi-hat), pop (100–118), balad (60–72; sekizlik piyano), aksak 9/8 (2+2+2+3) ve 7/8
  (2+2+3; darbuka düm/tek; doğru tempo grup başlarınınki, `meter.rs` gibi), maksum ve Türk pop'u (88–100;
  düm/tek, saz sekizlikleri; Türk pop'unda kick, snare ve hi-hat da var). Tohum şunları değiştirir: tempo, tını (kick
  perdesi ve sönümü, snare tonu, hi-hat parlaklığı), kalıp çeşitlemesi, kick/snare dengesi, gürültü, swing ve akor
  vuruşları (klavye/gitar: yok, her vuruşta, sekizlikte ya da senkoplu).
- `karsi.py`: bağımsız incelemenin karşı örnek üreteci (`python3 karsi.py docs/arastirma/tempo <çıkış> <tohum>`).
- `src-tauri/examples/tempo_olcum.rs`: klasördeki şarkıları programın analiziyle çözümler. Tür × sonuç tablosunu
  (doğru ±%4, ½, 2×, ⅔, 3⁄2, başka, yok) ve davulun çaldığı bölümde ortalama beat F-ölçüsünü (±70 ms) yazar.

```
python3 docs/arastirma/tempo/uret.py /tmp/tempo 1      # tohum 1; geliştirme 1–6, doğrulama 11–16, son sınama 21–26
cd src-tauri && cargo run --release --example tempo_olcum -- /tmp/tempo
```

## Sonuç

Üç ayrı set kullanıldı. Hepsi aynı üreticiden, farklı tohumlarla üretildi; her biri türü başına 6 şarkı:

- **geliştirme** (tohum 1–6): eşikler bu setin değerlerinden seçildi;
- **doğrulama** (tohum 11–16): geliştirme sırasında sonuçlarına bakıldı;
- **son sınama** (tohum 21–26): ilk sürüm bittikten sonra üretildi. İnceleme düzeltmelerinde (snare kapsamı)
  doğrulama ve son sınamanın değerlerine de bakıldı. Eşik (0,9) iki küme arasındaki boşluğa konduğundan sonuç
  iyimser olabilir; asıl sınama sahibinin şarkılarıdır.

"Eski": bu değişiklikten önceki program. "İlk sürüm": bağımsız incelemeden önceki `tempo.rs`. "Yeni": incelemeden
sonraki hâli. Setlerde türü başına 6 şarkı vardır; incelemeden sonra maksum ve Türk pop'u eklendi (11 tür, 66 şarkı).
Karşı örnek seti (`karsi.py`, 12 tür × 4 tohum) bağımsız incelemenin ürettiği zor durumlardır: maksum, Türk pop'u,
Motown, reggae one drop, caz, davulsuz on altılık piyano, yavaş R&B, lo-fi, sessiz giriş, kısa şarkı. Parantezde beat
F-ölçüsü.

| Set              | Eski                                | İlk sürüm                          | Yeni                        |
| ---------------- | ----------------------------------- | ---------------------------------- | --------------------------- |
| Geliştirme (66)  | 41 doğru · 21 ½ · 4 2× (F 0,85)     | 55 · 4 ½ · 7 2× (F 0,91)           | 61 · 4 ½ · 1 2× (F 0,94)    |
| Doğrulama (66)   | 49 · 12 ½ · 3 2× · 2 başka (F 0,89) | 53 · 3 ½ · 9 2× · 1 başka (F 0,92) | 62 · 3 ½ · 1 başka (F 0,96) |
| Son sınama (66)  | 41 · 18 ½ · 6 2× · 1 başka (F 0,85) | 56 · 3 ½ · 7 2× (F 0,93)           | 60 · 5 ½ · 1 2× (F 0,95)    |
| Karşı örnek (48) | 37 · 2 ½ · 9 2× (F 0,89)            | 30 · 18 2× (F 0,84)                | 40 · 8 2× (F 0,91)          |

Hiçbir sette, eski programın doğru bulduğu bir şarkıyı yeni sürüm yanlış bulmuyor. Karşı örnek setinde kalan 8 hata
(davulsuz piyano 2, reggae 3, yavaş R&B 2, lo-fi 1) eski programda da aynı şarkılarda vardı.

Son sınama, tür tür:

| Tür        | Eski                        | Yeni                |
| ---------- | --------------------------- | ------------------- |
| dubstep    | 5 doğru, 1 ½                | 6 doğru             |
| trap       | 1 doğru, 5 ½                | 6 doğru             |
| dnb        | 0 doğru, 5 ½ (87), 1 başka  | 6 doğru             |
| house      | 4 doğru, 2 ½                | 6 doğru             |
| hip-hop    | 6 doğru                     | 6 doğru             |
| pop        | 5 doğru, 1 ½ (yanlış aksak) | 5 doğru, 1 ½ (aynı) |
| balad      | 1 doğru, 5 2×               | 5 doğru, 1 2×       |
| maksum     | 4 doğru, 2 ½ (yanlış aksak) | 4 doğru, 2 ½ (aynı) |
| Türk pop'u | 5 doğru, 1 2×               | 6 doğru             |
| aksak 9/8  | 6 doğru                     | 6 doğru             |
| aksak 7/8  | 4 doğru, 2 ½                | 4 doğru, 2 ½ (aynı) |

Sahibinin bildirdiği "drum and bass 87" hatası eski programla sette yeniden üretildi: bütün drum and bass şarkıları
86–88 bulundu. Drop setinde de (`docs/arastirma/drop/`, tohum 1–3, 33 şarkı) tempo 29/33'ten 31/33'e çıktı, oktav
hatası 2'den 0'a indi. Drop isabeti 45/57'den 46/57'ye çıktı, yanlış alarm 6'dan 5'e indi.

## Yöntem (`analysis/tempo.rs`)

Takipçinin bulduğu ızgara (T) analiz karelerindeki bant seviyelerinden sınanır. Şarkı yeniden çözülmez.

1. **Vuruş arasında davul:** kick (bas ve orta bantta dB artışı) ya da snare (500 Hz–5 kHz'te **doğrusal** güç
   artışı) vuruş aralarında vuruşlardakinden belirgin güçlüyse (×1,1) sonuç 2T'dir. Kalıp her vuruş arasını
   doldurmayabilir: drum and bass'ta kick iki aradan birine düşer. Bu yüzden iki tarafın **güçlü yarılarının**
   ortalaması karşılaştırılır. Snare için iki şart daha vardır. Birincisi, dört aralıklık (bir ölçü) pencerelerin en
   az %90'ında **dört** aranın hepsinde snare olmalıdır. Yarı tempoda sayılan backbeat her araya düşer. Maksumun
   tek'leri ise yalnızca bazı aralara düşer ve 4'te vuruşta da çalar (oran drum and bass'ta 1,0; maksum ve Türk
   pop'unda ≤ 0,67). İkincisi, aradaki ses gürültü olmalıdır: 2,2–16 kHz bantlarının hepsinde birden yükselmelidir.
   Arpejin tonal notaları bu şartı karşılamaz.
2. **Yarım tempo hissi:** T < 80 ise ve 2T'de yeniden izlenen ızgarada vuruş araları doluysa (başlangıç gücü,
   ≥ 0,2), üstelik orada hi-hat varsa (geniş bantlı tiz gürültü, ≥ ~0,5 dB) sonuç 2T'dir. Geliştirme setinde baladda
   2T'nin araları boş (≤ 0,11), trap ve dubstep'te dolu (≥ 0,25). Davulsuz on altılık piyano araları doldurur ama
   gürültü yoktur.
3. **Boş vuruş araları:** T/2 ≥ 60 ise, vuruş araları neredeyse boşsa (< 0,12) ve T/2'nin bir yarısında aralar
   vurgusuzsa (≤ 0,5; snare ve kick vuruşta) sonuç T/2'dir.

İki katına çıkılınca vuruşlar 2T'de yeniden izlenir (dinamik programlama), yani başlangıçlara oturur. Yeniden
izleme ancak beklenen vuruş sayısının en az %90'ını kapsıyorsa, tempo istenenin ±%3'ü içindeyse ve 200'ü
geçmiyorsa kullanılır. Yoksa vuruş ortaları eklenir. Yarıya inilince
vuruşların araları vurgusuz olan yarısı alınır. Değişken tempolu ızgaraya dokunulmaz. Sonuç 60–200 BPM içinde kalır.
Aksak ölçü düzeltilmiş tempoya göre aranır.

Ritim parçasının önbellek sürümü 7'ye çıktı. Kütüphane yalnızca ritmi saklanan karelerden yeniden hesaplar; şarkılar
çözülmez.

### Denenip bırakılan

- **"Snare her vuruşta mı" öz-ilintisi** (snare bandında bir vuruş gecikmesi / iki vuruş gecikmesi): yalnız davul ve
  pad'li ilk sette drum and bass'ı kusursuz ayırdı. Sete akor vuruşları eklenince hip-hop'u iki katına çıkardı:
  sekizlik klavye de "her vuruşta" tekrar eder. Bu yüzden bırakıldı.
- **Snare kuralı tek başına (ilk sürüm):** maksumun tek'leri 500 Hz–5 kHz'tedir ve vuruş aralarına düşer, bu yüzden
  Türk pop'u ve maksum iki katına çıkıyordu (karşı örnek setinde 8/8). İlk sürümde aynı kural iki aksak 7/8
  şarkısını da düzeltmişti. Sıkılaşan kuralla o ikisi eski hâline döndü.
- **Snare'i vuruşta da çalıyor mu (vuruşların en güçlü çeyreği):** maksumu düzeltti ama dev setinde bazı maksumlar
  yine 2× çıktı. Bu yüzden bırakıldı.
- **Ortalama oranı:** drum and bass'ta kick yalnızca iki vuruş arasından birindedir, ortalama onu yarıya böler. Güçlü
  yarılar bu hatayı gidermek için kullanıldı.
- **Tepe değeri:** 60 kare/sn'de 144 BPM'in sekizliği 12,5 karedir. Hi-hat iki kareye bölünür, tepe yarıya iner.
  Üç karelik toplam bu etkiyi giderir.

## Kalanlar ve dürüstlük notu

- **Setler tek üreticiden:** gerçek kayıtlar daha karışıktır (gitar ve klavye, kompresyon, canlı davul). Kural 1'in
  hip-hop'taki payı en dardır: en yüksek değer 0,8, eşik 1,1. Bol senkoplu kick'i ve vuruş aralarında yüksek klavyesi
  olan bir hip-hop parçası iki katına çıkabilir. Snare'i her vuruşta çalan 85–100 BPM'lik bir şarkı da (Motown) aynı
  riski taşır. Sahibinin şarkılarıyla doğrulanacak.
- **Balad, kural 3:** son sınamada bir balad (64) 128 kaldı, çünkü araların doluluğu 0,12 eşiğinin hemen üstündeydi.
  On altılık hi-hat'li bir balad yapı olarak yarım tempolu trap'le aynıdır ve 128 ya da 132 bulunur. Bu, tanımın kendi
  belirsizliğidir.
- **Yanlış aksak (ayrı iş, `meter.rs`; Türk müziği için öncelikli):** kalan hataların çoğu oktav değildir. Maksumda
  ve Türk pop'unda, swing'li hip-hop'ta ve drum and bass breakbeat'inde 2+3, 3+2 ya da 2+3+2 gruplaması bulunur ve tempo grup başlarına göre yarıya ya da başka bir
  orana düşer. Bu, değişiklikten önce de vardı ve setlerin hepsinde aynıdır. Aksak kararına "kalıp ölçüye sığıyor mu"
  denetimi eklenmeli.
- **"Dubstep 128" yeniden üretilemedi:** sentetik dubstep'te eski program ya 140 ya da 70 buldu, 128 hiç çıkmadı.
  128/140 basit bir oran değildir. Olası nedenler: şarkının kendisi 128'dir (dubstep'e yakın bir house ya da electro
  parçası); tempo değişen bir parçadır ve "değişken" sanılıp ortanca alınmıştır; ya da wobble'ın LFO'su (üçleme,
  noktalı) takipçiyi başka bir periyoda çekmiştir. Sahibinden şarkı adı ve programın yazdığı tempo istenmeli.
- Ses dosyaları depoya girmez; üretilenler geçici klasörde kalır.
