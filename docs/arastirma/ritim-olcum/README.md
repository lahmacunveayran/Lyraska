# Ritim analizinin standart setlerde ölçümü

Genel taramanın ([`../genel-tarama/SENTEZ.md`](../genel-tarama/SENTEZ.md)) iki taramasının da birinci sıraya koyduğu açık:
Lyraska'nın vuruş, ölçü başı ve tempo analizi bugüne kadar alanın ortak test setlerinde ölçülmemişti. Bu klasör o
ölçümün sonuçlarını tutar. Ses dosyaları depoya girmez (yalnızca ölçümü yapan makinede, geçici klasörde durur);
burada yalnızca araç, parça adları ve sayılar var.

## Araç

`src-tauri/examples/ritim_olcum.rs`:

```
cargo run --release --example ritim_olcum -- <ses klasörü> <işaret klasörü> <sonuç klasörü>
```

İşaretler satır başına "zaman vuruş_no" biçiminde `.beats` dosyalarıdır (`1` ölçü başı). Ölçütler:

- **Vuruş F-ölçüsü:** ±70 ms pencere, en büyük eşleştirme (mir_eval `beat.f_measure` ile aynı; `evaluate.rs`).
  Ayrıca ilk 5 sn'si atılmış hâli (mir_eval `trim_beats`, MIREX kuralı).
- **Ölçü başı F-ölçüsü:** ±70 ms.
- **Tempo:** ACC1 (±%4) ve ACC2 (±%4; ×2, ×½, ×3, ×⅓ oktav hataları dahil). Gerçek tempo işaretli vuruş
  aralıklarının ortancası.

## Ballroom (6 Kasım 2026)

- **Set:** Gouyon ve ark. 2006, 698 parça, 30 sn, sekiz dans türü. Sesler MTG-UPF'den
  (`mtg.upf.edu/ismir2004/contest/tempoContest/data1.tar.gz`). Vuruş ve ölçü başı işaretleri Krebs ve ark. 2013
  (GitHub `CPJKU/BallroomAnnotations`; depoda lisans dosyası yok, yalnızca yerel ölçüm).
- **Lyraska'nın analizi hiçbir veriyle eğitilmedi:** bu set onun için tümüyle görülmemiş.
- **Hız:** parça başına ortalama 0,18 sn (bulut makinesi, 4 çekirdek).
- **Ham sonuçlar:** [`ballroom-2026-11-06.jsonl`](ballroom-2026-11-06.jsonl) (parça başına).

| Tür                 | Parça   | Vuruş F   | Vuruş F (5 sn kırpık) | Ölçü başı F | ACC1      | ACC2      |
| ------------------- | ------- | --------- | --------------------- | ----------- | --------- | --------- |
| ChaChaCha           | 111     | 0,908     | 0,915                 | 0,422       | 0,982     | 0,982     |
| Jive                | 60      | 0,797     | 0,814                 | 0,443       | 0,583     | 1,000     |
| Quickstep           | 82      | 0,624     | 0,629                 | 0,258       | 0,110     | 0,951     |
| Rumba-American      | 7       | 0,895     | 0,898                 | 0,857       | 1,000     | 1,000     |
| Rumba-International | 51      | 0,830     | 0,828                 | 0,729       | 0,843     | 1,000     |
| Rumba-Misc          | 40      | 0,743     | 0,751                 | 0,610       | 0,718     | 1,000     |
| Samba               | 86      | 0,792     | 0,795                 | 0,551       | 0,837     | 0,965     |
| Tango               | 86      | 0,902     | 0,916                 | 0,460       | 0,977     | 0,977     |
| VienneseWaltz       | 65      | 0,704     | 0,703                 | 0,698       | 0,475     | 0,836     |
| Waltz               | 110     | 0,678     | 0,684                 | 0,587       | 0,585     | 1,000     |
| **Hepsi**           | **698** | **0,780** | **0,786**             | **0,514**   | **0,696** | **0,969** |

### Okuma

- **Tipik parçada vuruş çok iyi:** ortanca vuruş F 0,941. Ortalamayı düşüren tempo oktavı hataları.
- **Tempo oranı** (bulunan / gerçek), 698 parça:
  - doğru 471;
  - yarı 115, iki kat 68;
  - 2/3 ya da 3/2: 10;
  - üçte bir ya da üç kat: 2;
  - diğer 11;
  - tempo bulunamadı 21.

  Yani hataların büyük çoğunluğu oktav seçiminde (ACC2 0,969). En kötüsü Quickstep: ~200 BPM yarıya iniyor.

- **Ölçü başı en zayıf yer:** ortalama 0,514, ortanca 0,621. Üç zamanlı danslarda (Vals, Viyana valsi) ölçü 3
  bulunsa da tempo yarıya ya da iki katına kaçınca ölçü başı da kayıyor.
- **Yol haritası hedefi** "beat F ≥ 0,80" bu sette az farkla tutmuyor (0,780).

### Karşılaştırma (dikkatle)

Bu sette **eğitilmiş** yapay sinir ağı takipçilerinin yayımlanmış sonuçları (sekiz katlı çapraz doğrulama) vuruşta
0,938, ölçü başında 0,863. Kaynak: Böck, Krebs, Widmer 2016, ISMIR, "Joint beat and downbeat tracking with recurrent
neural networks", Tablo 3 (13 kopyası çıkarılmış Ballroom, 685 parça; birincil kaynaktan okundu, iki denetim:
[`iddia-denetimi/LISTE.md`](../iddia-denetimi/LISTE.md) 3). Beat This bu seti eğitimde kullandığı
için burada adil karşılaştırılamaz; onun için GTZAN (Beat This'in görmediği test seti) ölçülecek.

## GTZAN: Lyraska ve Beat This yan yana (6 Kasım 2026)

- **Set:** Tzanetakis ve Cook 2002, 1000 parça, 30 sn, on tür. Sesler Hugging Face `marsyas/gtzan`; vuruş ve ölçü başı
  işaretleri GitHub `TempoBeatDownbeat/gtzan_tempo_beat` (Marchand ve Peeters). Yalnızca yerel ölçüm.
  `jazz_00054` bilinen bozuk dosya (açılamıyor), 998 parça ölçüldü (bir parça işaretsiz).
- **Beat This GTZAN'ı eğitimde kullanmadı** (makalenin test seti); karşılaştırma adil. Beat This `minimal` son
  işlemle (DBN yok), pip `beat-this` 1.1.0, CPU. Ölçütler `ritim_olcum.rs` ile aynı (mir_eval); betik
  [`beatthis_olc.py`](beatthis_olc.py), tablo [`gtzan_tablo.py`](gtzan_tablo.py).
- **Ham sonuçlar:** [`gtzan-lyraska-2026-11-06.jsonl`](gtzan-lyraska-2026-11-06.jsonl),
  [`gtzan-beatthis-small0-2026-11-06.jsonl`](gtzan-beatthis-small0-2026-11-06.jsonl),
  [`gtzan-beatthis-final0-2026-11-06.jsonl`](gtzan-beatthis-final0-2026-11-06.jsonl).

| Sistem           | Vuruş F   | 5 sn kırpık | Ortanca F | Ölçü başı F | ACC1  | ACC2  | Parça başına sn |
| ---------------- | --------- | ----------- | --------- | ----------- | ----- | ----- | --------------- |
| Lyraska          | 0,748     | 0,758       | 0,936     | 0,445       | 0,670 | 0,865 | 0,12            |
| Beat This small0 | 0,883     | 0,885       | 0,991     | 0,767       | 0,811 | 0,935 | 2,90            |
| Beat This final0 | **0,888** | **0,891**   | 0,991     | **0,783**   | 0,821 | 0,941 | 4,51            |

ACC'de tempo bulunamayan parça yanlış sayılır. Süreler yüklü bulut makinesinde (4 çekirdek, başka ölçümlerle
paylaşılan), karşılaştırma içindir.

| Tür       | Lyraska F | small0 F | final0 F | Lyraska ölçü başı | small0 ölçü başı | final0 ölçü başı |
| --------- | --------- | -------- | -------- | ----------------- | ---------------- | ---------------- |
| blues     | 0,739     | 0,811    | 0,830    | 0,313             | 0,627            | 0,640            |
| classical | 0,415     | 0,642    | 0,652    | 0,226             | 0,462            | 0,508            |
| country   | 0,814     | 0,916    | 0,940    | 0,599             | 0,895            | 0,905            |
| disco     | 0,934     | 0,968    | 0,964    | 0,406             | 0,935            | 0,934            |
| hiphop    | 0,811     | 0,972    | 0,972    | 0,591             | 0,875            | 0,896            |
| jazz      | 0,565     | 0,856    | 0,866    | 0,243             | 0,698            | 0,741            |
| metal     | 0,754     | 0,888    | 0,875    | 0,427             | 0,780            | 0,766            |
| pop       | 0,825     | 0,945    | 0,952    | 0,631             | 0,912            | 0,938            |
| reggae    | 0,873     | 0,905    | 0,905    | 0,490             | 0,670            | 0,681            |
| rock      | 0,753     | 0,923    | 0,921    | 0,507             | 0,806            | 0,814            |

Tempo oranı (bulunan / gerçek, ±%4):

| Sistem           | doğru | yarı | iki kat | 3/2 | 2/3 | üç kat | üçte bir | diğer | yok |
| ---------------- | ----- | ---- | ------- | --- | --- | ------ | -------- | ----- | --- |
| Lyraska          | 669   | 88   | 98      | 5   | 11  | 8      | 0        | 55    | 64  |
| Beat This small0 | 809   | 58   | 52      | 5   | 2   | 13     | 1        | 58    | 0   |
| Beat This final0 | 819   | 54   | 55      | 3   | 4   | 11     | 0        | 52    | 0   |

### Okuma

- **Beat This her türde önde; en büyük fark ölçü başında** (0,445 → 0,78). Görsellerin ölçü başına bağlı her şeyi
  (bölüm dalgası, drop hizası) bundan yararlanır.
- **Lyraska'nın kaybı çoğunlukla tempo seçiminde:** tempo ikisinde de doğruyken vuruş F Lyraska 0,918, Beat This
  0,970. Lyraska'nın oktav hataları dengeli (88 yarı, 98 iki kat): hızlı şarkıda yarıya, yavaşta iki katına kayıyor;
  tek yönlü bir kaydırma çözmez.
- **"Yok" 64 parça Lyraska'da bilinçli:** ritim belirsizse (`MIN_RHYTHM_STRENGTH`) ızgara verilmez, görseller rastgele
  atmasın diye; bunun 37'si klasik. Ölçüde 0 sayılır.
- **small0 ≈ final0:** küçük model (8 MB) büyükten yalnızca vuruşta 0,005, ölçü başında 0,016 geride ve ~1,6 kat hızlı.
  Ritim paketi için önerilen başlangıç small0 (tract ile çalıştığı doğrulandı: ONNX çıktısı onnxruntime'la en çok
  5·10⁻⁶ farklı).
- Makaledeki GTZAN sayılarıyla karşılaştırma birincil kaynaktan yapılacak.

## Ritim modeli Lyraska'da: analize bağlı karne (7 Kasım 2026)

Beat This small0 artık Lyraska'nın içinde (`analysis/rhythm_net.rs`, tract) ve kurulum dosyasıyla geliyor. Ölçülen,
programın kendisi: `ritim_olcum` modelle tam analizi çalıştırır (`LYRASKA_RITIM_MODELI`; vuruşlar ve tempo modelden,
ölçü modelin ölçü başlarıyla en çok uyuşan düzenli ölçü, aksak ölçü yalnızca modelin vuruşunu yarıya indirmiyorsa).

- **Rust + tract = Python:** modelin kendisi (`ritim_olcum`'un ilk sürümü, analizden önce) GTZAN'ın 998 parçasının
  hepsinde Python'daki Beat This small0 ile vuruş ve ölçü başı F'si birebir aynı verdi.
- **Ham sonuçlar:** [`gtzan-lyraska-modelli-2026-11-07.jsonl`](gtzan-lyraska-modelli-2026-11-07.jsonl),
  [`ballroom-lyraska-modelli-2026-11-07.jsonl`](ballroom-lyraska-modelli-2026-11-07.jsonl). `olcu_basi_f_model`:
  modelin kendi ölçü başları (düzenli ölçüye oturtulmadan).

### GTZAN (Beat This'in görmediği set)

| Sistem                        | Vuruş F   | 5 sn kırpık | Ölçü başı F | ACC1      | ACC2      | Parça başına sn |
| ----------------------------- | --------- | ----------- | ----------- | --------- | --------- | --------------- |
| Lyraska eski (6 Kasım)        | 0,748     | 0,758       | 0,445       | 0,670     | 0,865     | 0,12            |
| Beat This small0 (Python)     | 0,883     | 0,885       | 0,767       | 0,811     | 0,935     | 2,90            |
| **Lyraska modelli (7 Kasım)** | **0,883** | **0,885**   | **0,755**   | **0,826** | **0,944** | 3,35            |

| Tür       | Eski F | Modelli F | Eski ölçü başı | Modelli ölçü başı |
| --------- | ------ | --------- | -------------- | ----------------- |
| blues     | 0,739  | 0,816     | 0,313          | 0,630             |
| classical | 0,415  | 0,644     | 0,226          | 0,419             |
| country   | 0,814  | 0,916     | 0,599          | 0,874             |
| disco     | 0,934  | 0,968     | 0,406          | 0,936             |
| hiphop    | 0,811  | 0,972     | 0,591          | 0,864             |
| jazz      | 0,565  | 0,853     | 0,243          | 0,687             |
| metal     | 0,754  | 0,888     | 0,427          | 0,756             |
| pop       | 0,825  | 0,945     | 0,631          | 0,908             |
| reggae    | 0,873  | 0,905     | 0,490          | 0,661             |
| rock      | 0,753  | 0,923     | 0,507          | 0,808             |

- Tempo oranı (bulunan / gerçek): doğru 824 (eski 669), yarı 58 (88), iki kat 48 (98), yok 1 (64).
- **Ölçü başı 0,767 → 0,755:** program şarkı haritasında düzenli ölçü kullanır (vuruşun ölçüdeki yeri tek bir
  başlangıçtan sayılır); modelin ölçü başları şarkı ortasında kayınca düzenli ölçü birini kaçırır. 2/4 seçilen
  215 parça bunun izi (dörtlükte iki başlangıcı da yakalar). Modelin kendi ölçü başları saklanıyor; şarkı haritasının
  parça parça ölçüye geçmesi ayrı iş.
- **Aksak ölçü:** model varken de aranır (model düzenli ölçülerle eğitildi). İlk denemede GTZAN'da (aksak şarkı
  yok) 28 şarkıda yanlış aksak bulundu: grup başları modelin vuruşunun 0,40–0,54 katı hızındaydı (iki vuruş bir
  "grup"); sentetik 9/8, 7/8, 5/8 davullarda oran 0,80–0,88. Aksak artık yalnızca oran ≥ 0,6 ise kabul ediliyor;
  28'in 27'si elendi (vuruş F 0,874 → 0,883, ölçü başı 0,744 → 0,755). Gerçek Türk aksak şarkıları bu sette yok:
  sahibinin kütüphanesinde denenecek.
- Hız: parça başına 3,35 sn (bulut, 4 çekirdek, model 2 iş parçacığı; çözme ve kareler dahil). 4 dakikalık şarkıda
  ~15 sn; arka planda tek çekirdekle çalışır.

### Ballroom (Beat This bu seti eğitimde gördü: adil karşılaştırma değil)

| Tür                 | Parça   | Vuruş F (eski → modelli) | Ölçü başı F       | ACC1              | ACC2              |
| ------------------- | ------- | ------------------------ | ----------------- | ----------------- | ----------------- |
| ChaChaCha           | 111     | 0,908 → 0,977            | 0,422 → 0,982     | 0,982 → 1,000     | 0,982 → 1,000     |
| Jive                | 60      | 0,797 → 0,985            | 0,443 → 0,989     | 0,583 → 1,000     | 1,000 → 1,000     |
| Quickstep           | 82      | 0,624 → 0,986            | 0,258 → 0,988     | 0,110 → 1,000     | 0,951 → 1,000     |
| Rumba-American      | 7       | 0,895 → 0,970            | 0,857 → 0,959     | 1,000 → 1,000     | 1,000 → 1,000     |
| Rumba-International | 51      | 0,830 → 0,980            | 0,729 → 0,976     | 0,843 → 1,000     | 1,000 → 1,000     |
| Rumba-Misc          | 40      | 0,743 → 0,955            | 0,610 → 0,961     | 0,700 → 1,000     | 0,975 → 1,000     |
| Samba               | 86      | 0,792 → 0,977            | 0,551 → 0,975     | 0,837 → 1,000     | 0,965 → 1,000     |
| Tango               | 86      | 0,902 → 0,991            | 0,460 → 0,986     | 0,977 → 1,000     | 0,977 → 1,000     |
| VienneseWaltz       | 65      | 0,704 → 0,988            | 0,698 → 0,986     | 0,446 → 1,000     | 0,785 → 1,000     |
| Waltz               | 110     | 0,678 → 0,951            | 0,587 → 0,946     | 0,500 → 0,991     | 0,855 → 0,991     |
| **Hepsi**           | **698** | **0,780 → 0,976**        | **0,514 → 0,976** | **0,675 → 0,999** | **0,940 → 0,999** |

ACC'de tempo bulunamayan parça yanlış sayılır (bu yüzden eski ACC1 yukarıdaki ilk tablodan biraz düşük).

## Sırada

1. Sahibinin bilgisayarında: kütüphanenin yeniden analizi (model ilk açılışta arka planda bütün şarkılarda bir kez
   çalışır) ve Türk aksak / maksum şarkılarında ölçünün denetimi.
2. Şarkı haritasında parça parça ölçü (modelin ölçü başlarını düzenli ölçüye oturtmadan); tempo oktavı (`tempo.rs`)
   modelsiz yolda kalır.
