# Köy işi: kütüphanenin gözetimsiz ölçümü (1 Kasım 2026)

Proje sahibi evde değilken, bilgisayarı kendi kütüphanesini saatlerce ölçtü. Burada o ölçümün ham verileri, doğru
tempo listesi, tempo kararının iç değerleri ve bağımsız incelemenin bulguları durur. Amaç, ileride aynı sorulara
yeniden ölçmeden dönebilmek: tempo, ölçü, drop, ton ve söz hizalaması işlerinde **gerçek şarkı** kanıtı.

**Depoya girmeyenler:** ses dosyaları; şarkı sözü metinleri (telif: programın zamanladığı `.lrc`'ler ve YouTube
altyazıları); YouTube listesinin adresi ve video kimlikleri. Dosya adları sahibinin kütüphanesindeki adlardır.

## Nasıl ölçüldü

- Araç: `src-tauri/examples/koy_isi.rs`. Her şarkı ayrı alt süreçte ölçülür; iş kaldığı yerden sürer. Başlatıcı
  [`betikler/koy-isi.ps1`](betikler/koy-isi.ps1): önce sahibinin yt-dlp'siyle listenin altyazıları (yalnızca yazı),
  sonra ölçüm.
- Kütüphane: 656 dosya, 37,3 saat; aac (m4a) ve opus (mka); çoğu EDM, ayrıca pop, rock, Türkçe pop, anime, film
  müziği. 86 şarkı iki biçimde birden var (aynı kayıt): doğrusu bilinmeden tutarlılık ölçer.
- Ses yolu denemesi: eşitleme açık, parametrik EQ 80 Hz'te +6 dB (Q 0,7); bütün şarkı oluşturucudan geçer.
- Sözler: söz paketiyle (`soz_hizalama` aracı); kaynak önce `.lrc`, yoksa YouTube altyazısı (`en-orig`, `tr-orig`).
- Makine: Ryzen 7 7435HS; derleme ve testler en çok 4 çekirdek.

## Dosyalar

| Dosya                                                    | İçerik                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`sonuclar-ilk.jsonl`](sonuclar-ilk.jsonl)               | İlk ölçüm (ritim sürümü 7): şarkı başına bir satır. Alanlar aşağıda.                              |
| [`sonuclar-esit-nabiz.jsonl`](sonuclar-esit-nabiz.jsonl) | Eşit nabız kuralından sonra (ritim sürümü 8, bas şartıyla); sözler yeniden ölçülmedi.             |
| [`rapor-ilk.md`](rapor-ilk.md)                           | Aracın ilk ölçümde yazdığı özet rapor (iki biçim karşılaştırması dahil).                          |
| [`tempo-dogrular.csv`](tempo-dogrular.csv)               | Yayımlanan tempolar (SongBPM vb.), programın ilk ve yeni değeriyle.                               |
| [`tempo-ic-degerler.json`](tempo-ic-degerler.json)       | 60–110 BPM bulunan 130 şarkıda oktav kararının iç değerleri ve sınıf etiketi.                     |
| [`soz-satirlari.csv`](soz-satirlari.csv)                 | 167 şarkının satır satır söz zamanları (metin yok): program ↔ altyazı.                            |
| [`betikler/`](betikler/)                                 | Başlatıcı, çözümleme ve karşılaştırma betikleri, geçici ölçüm testi, incelemenin karşı örnekleri. |

**`sonuclar-*.jsonl` alanları:** `yol` (dosya adı), `kodek`, `hiz` (Hz), `kanal`, `sure` (sn), `analiz_sn`,
`bpm`, `degisken_tempo`, `vurus` (sayı), `olcu` (vuruş/ölçü), `olcu_guveni`, `bolum` (sayı), `drop` (sn),
`drop_guveni`, `ton` (Camelot), `ton_guveni`, `lufs`, `tepe_dbtp`, `kesik`, `ses_yolu` (`tepe_dbfs`,
`tavani_asan`, `nan`, `eksik_kare`, `gercek_zaman_kati`), `soz` (yalnızca ilkte: `kaynak`, `satir`, `tahmini`,
`karsilastirilan`, `yarim_sn_icinde`, `bir_sn_icinde`, `ortanca_hata_sn`, `ozet` içinde hüküm ve model süreleri).

**`tempo-ic-degerler.json` alanları** (her biri bulunan ızgarada; oranlar vuruş arası / vuruş): `bpm` takipçinin
temposu; `fill` başlangıç gücü oranı (eşit nabız eşiği 0,85); `fill2` iki katın oranı (eşik 0,35); `low` bas
bantları artışının ortalama oranı (eşik 0,75); `lowmed` aynısı ortancayla; `lon`/`loff` bas vuruşu olan
vuruş/ara payı; `son`/`soff` başlangıç gücünde aynısı; `strmed` başlangıç gücü ortanca oranı; `acc` vurgu güçlü
yarı oranı; `sn` snare güçlü yarı oranı; `cov` snare'in her araya düşme payı; `noise` aralarda hi-hat gürültüsü;
`noise2` iki katta aynısı; `lab` sınıf (`2x` yarım bulunmuş, `ok` doğru, `3:2` gerçek tempo 1,5 katı, `?`
bilinmiyor).

**`soz-satirlari.csv`:** `isaret` = programın satır işareti (`guvenli`, `tahmini`, `yok`); `altyazi_sn` boşsa satır
altyazıda bulunamadı; `fark_sn` artıysa program geç. Altyazı zamanları YouTube'un otomatik ya da elle yazılmış
altyazısıdır: kendileri de ±0,5 sn kadar şaşabilir.

## Sonuçlar (ilk ölçüm)

- 656/656 analiz edildi, çökme ya da zaman aşımı yok; analiz gerçek zamanın ~195 katı (11,5 dk).
- **Ses yolu:** en yüksek çıkış −1,00 dBFS; tavanı aşan, NaN'lı ya da eksik kareli şarkı yok; oluşturucu en yavaş
  96×, ortanca 217× gerçek zaman.
- **Aynı kaydın iki biçimi (86 çift):** tempo 85'inde aynı (bir oktav farkı: DJ Sakin 68/136); ton 83'ünde aynı
  (farklılar düşük güvenli); drop anlarının %84'ü ±1 sn içinde eşleşti (eşleşmeyenlerin çoğu güveni < 0,5 olanlar).
- **Tempo:** hızlı türlerde yarım tempo (aşağıda); 81 şarkı "değişken tempo"; 2 şarkıda tempo yok.
- **Ölçü güveni** 339/656 şarkıda 0,5'in altında, 203'ünde tam 0: açık iş.
- **Sözler** (169 şarkı, 2'si hata: söz çok kısa / çok uzun; altyazıyla 3669 satır karşılaştırıldı): güvenli satırlarda ortanca hata 0,10 sn. "İyi" ve
  "kısmen tahmini" hükümleri 71 şarkının 68'inde doğruydu. "Oturmadı" hükmü 43 şarkının 27'sinde doğruydu; 9'u
  aslında iyiydi (hüküm fazla temkinli). Hız ortanca 0,44× gerçek zaman (model, 4 iş parçacığı).

## Tempo: eşit nabız

Hardstyle, hands up, frenchcore ve nightcore şarkıları 160–200 yerine 80–100 bulunuyordu. Doğrular iki turda
toplandı ([`tempo-dogrular.csv`](tempo-dogrular.csv); çoğu SongBPM, yani Spotify verisi; Beatport, Tunebat ve
GetSongBPM sayfaları açılmadı). Kural ve sınıflar [`../tempo/README.md`](../tempo/README.md)'de. Yeniden ölçümde
30 dosya değişti. 17 dosya düzeldi; doğrusu bilinen hiçbiri bozulmadı. 10 dosya 3:2 sınıfında yanlıştan yanlışa
geçti. 3 dosyanın doğrusu bilinmiyor. Bas şartından sonraki ölçüm birebir aynı çıktı.

Doğru listesinden çıkan, henüz çözülmemiş sınıflar:

- **3:2:** Rammor 122 → 81, KUTE 130 → 87, Armin van Buuren 135 → 87, "L no Theme" 135 → 89, Discobitch 129 → 83,
  Houshou Marine 145 → 96. Takipçi gerçek temponun 2/3'ünü buluyor (üç vuruşta iki).
- **2× kalanlar:** Feint ve Maduk (drum and bass, 175–176 → 88), Skillet (160 → 80, rock), Narvent (172 → 86),
  overrated (185 → 93; vuruş arası oranı 0,848, eşiğin hemen altı).
- **Başka:** "SCHEINE ZÄHLEN" yayımlanan 80, program 90 (şimdi 180).

## Bağımsız inceleme (eşit nabız kuralı)

İnceleyen ajan kendi karşı örneklerini, modülün ses üreteciyle (`Drums`) ve gerçek analiz zinciriyle üretti
(analiz → takipçi → oktav kararı). Her örneği kuralla ve kural kapalıyken çalıştırdı. Düzenek:
[`betikler/inceleme_karsi_ornekler.rs`](betikler/inceleme_karsi_ornekler.rs).

**Bulgu 1 (gerileme, düzeltildi):** reggaeton (dembow: her vuruşta kick, snare 0,75 / 1,5 / 2,75 / 3,5'ta, sekizlik
hi-hat) 94–100 BPM'de iki katına çıkıyordu. Aradaki snare başlangıç gücünde vuruş kadar güçlü, 0,75'teki snare de
iki katın aralarını dolduruyor. Snare 1,2, hi-hat 1,5 kazançla:

| Gerçek | Kuralsız | İlk kural | `fill` | `fill2` | Bas oranı | Bas şartıyla |
| ------ | -------- | --------- | ------ | ------- | --------- | ------------ |
| 94     | 94       | 188       | 0,87   | 0,40    | 0,17      | 94           |
| 97     | 97       | 194       | 0,90   | 0,39    | 0,20      | 97           |
| 98     | 98       | 196       | 0,92   | 0,39    | 0,21      | 98           |
| 99     | 99       | 198       | 0,94   | 0,40    | 0,18      | 99           |
| 100    | 100      | 200       | 1,05   | 0,40    | 0,20      | 100          |

Snare 0,9 / hi-hat 0,8 ile yalnızca 100 çıkıyordu; snare 0,6 ile hiç. Düzeltme: aradaki bas artışı vuruşlardakinin
≥ 0,75'i olmalı. 18 dembow varyantının hepsinde bas oranı ≤ 0,33, düzelen gerçek şarkılarda ≥ 0,87. Test:
`reggaeton_iki_katina_cikmaz`.

**Bulgu 2 (değişmeyenler):** house/techno 120–128 (`fill` ≤ 0,04; iki katı zaten 200'ü aşar); disco ve dans-pop 90–100,
kısık ve yüksek offbeat/onaltılık hi-hat (`fill` 0,14–0,38, `fill2` ≤ 0,12); nu-disco offbeat bas 90–100 (`fill`
0,44–0,64); Motown (her vuruşta snare) 85–100; düz sekizlikli balad 70–92; reggae 76–100. Hiçbiri değişmedi. Uyarı:
üretecin hi-hat'leri gerçek açık hi-hat'ten kısık olabilir; eşik doğru sınıfın en yükseğinin (0,81) yalnızca 0,04
üstünde.

**Bulgu 3 (eskiden beri):** polka/country "boom-chick" (basta vuruş, her arada snare) 84/96/100'de iki katına
çıkıyor. Bu kural 1'den (vuruş arasında davul) geliyor ve değişiklikten önce de vardı.

**Bulgu 4 (kod):** ciddi bir şey yok. Tek geçiş, salınım yok. Kural 4 (boş aralar, oran < 0,12) ile eşit nabız
(≥ 0,85) aynı anda tutmaz. Yeniden izleme başarısızsa yedek yol 200 sınırını denetliyor. 100,0 → 200 çıkıyor; 100,2
engelleniyor.

**Bulgu 5 (testler):** `esit_nabizda_yarim_tempo_iki_katina_cikar` kural kapatılınca düşüyor. Öte yandan
`esit_sekizlikli_yavas_sarki_iki_katina_cikmaz` kural kapalıyken de geçiyor: eşikleri pek sınırlamıyor, bir koruma
testi. İkisi de ideal başlangıç gücüyle çalışıyor; gerçek sesli olumlu test yok.

**Bulgu 6 (yorumlar, düzeltildi):** modül başı yalnızca üç kural sayıyordu; sabitin yorumu DnB'yi hedef sayıyordu
(DnB düzelmedi); "her vuruşta kick" ölçülenden fazlasını söylüyordu (geniş bantlı başlangıç gücü, snare de sayılır).

## Betikler

- [`cozumle.py`](betikler/cozumle.py): ilk ölçümün çözümlemesi (iki biçim, ölçü güveni, sözler ↔ altyazı).
- [`karsilastir.py`](betikler/karsilastir.py): iki ölçümün tempolarını karşılaştırır, değişenleri sınıflar.
- [`tempo_ic_degerler.rs`](betikler/tempo_ic_degerler.rs): `tempo-ic-degerler.json`'u üreten geçici test
  (`tempo.rs`'in `mod tests`'ine eklenip `LYRASKA_TEMPO_LISTE` ile çalıştırıldı; commit edilmez).
- [`inceleme_karsi_ornekler.rs`](betikler/inceleme_karsi_ornekler.rs): incelemenin karşı örnekleri.
- [`koy-isi.ps1`](betikler/koy-isi.ps1): başlatıcı (liste adresi `LISTE_ADRESI` ile değiştirildi).

Betiklerdeki yollar sahibinin bilgisayarına göredir (`D:\DLP`, `D:\LyraskaVeri`).
