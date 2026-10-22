# Doğrulama 1: DSP ve ARY raporlarının Orta ve üstü bulguları (Faz 3, Denetim 2)

Doğrulayıcı: bağımsız (çürütme amaçlı). Kaynak: main @ `5805853`. Tarih: 22 Ekim 2026.

Kanıt klasörü: `docs/denetim-3/hesap/DOG1/`
(aşağıda kısaca `DOG1/`).

## Özet tablo

| Kod            | Denetçinin önemi | Hüküm          | Önerilen önem                     | Gerekçe (tek cümle)                                                                                                                                                                                                                                                                                                                    |
| -------------- | ---------------- | -------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DSP-01         | Orta             | **DOĞRULANDI** | Orta                              | Tarama 20 Hz'te başlıyor. Sıradan bir `LS 30 Hz +6` bile 1,03 dB eksik bildiriliyor, `PK 10 Hz +24` için 22,4 dB eksik; kulaklık profilinde `PK 12 Hz +10` tam ölçekli sinüsü +6,74 dBFS'e çıkarıyor. Taşmayı yine de son sınırlayıcı yakalıyor.                                                                                       |
| DSP-02         | Orta             | **KISMEN**     | Orta                              | Kök neden (eğri ve A/B 96 kHz'te hesaplanıyor) doğru, RBJ'de 12 kHz üstü bantlarda fark 2–3 dB. Ama gerçekçi AutoEq profilinde ve varsayılan eşlenmiş tasarımda fark ≤ 0,4 dB; A/B'deki 5,85 dB yalnız anlamsız `LS 24 kHz` ayarında çıkıyor, gerçekçi "hava" rafında 0,3–0,7 dB.                                                      |
| DSP-03         | Orta             | **DOĞRULANDI** | Orta                              | `PK 22 kHz Q0,5 +12` ekranda 16 kHz'te +10,4 dB gösteriyor, duyulan 0 dB. Ek bulgu: kırpılan `HP 22 kHz` 16 kHz'te analogdaki −6,6 dB yerine −46,6 dB kesiyor. Ulaşma yolu dar: frekansın elle 21,6/23,5 kHz üstüne yazılması gerekiyor.                                                                                               |
| DSP-04         | Orta             | **KISMEN**     | Düşük                             | Hazır ayarların hepsinde eksik bildirim yalnızca 0,06–0,22 dB (belgedeki ≤ 1,2 dB sürgü doğruluğunun içinde). 2,9–3 dB'lik eksik yalnızca ±12 zikzakta çıkıyor, en kötü nokta da 5 Hz'te ya da 20 kHz'te. Rastgele ±12 ayarlardan alınan "339/1228" oranı gerçek kullanımı yansıtmıyor.                                                |
| DSP-05         | Orta             | **KISMEN**     | Düşük                             | Eksik var, ama Q ≤ 2 olan gerçekçi ayarların yalnızca 3/800'ünde 0,5 dB'yi aşıyor (en kötü 0,89 dB). Durum yalnızca paylaşımlı modda aygıt 96/192 kHz'e ayarlıysa oluşuyor (bit-perfect'te işlem yok).                                                                                                                                 |
| DSP-06         | Orta             | **KISMEN**     | Orta                              | Belgedeki "0,1 dB tolerans" geniş bantlı içerikte tutmuyor; 44,1 kHz'te beyaz gürültüde aşım +0,64 dB. "1 dB'e kadar" yalnızca 14–20 kHz'lik tam ölçekli gürültüde çıkıyor. Müziğe benzer pembe gürültüde ve zilde aşım 0,03–0,2 dB.                                                                                                   |
| DSP-07         | Orta             | **DOĞRULANDI** | Orta                              | `HS 8,7 kHz +12 Q8 @48k`'da eşlenmiş tasarımın sapması 14,4 dB, RBJ'ninki 7,1 dB, yani eşlenmiş 7,3 dB daha kötü. Bu yalnızca Q ≥ ~8'lik rezonanslı raflarda oluyor; Q ≤ 4'te eşlenmiş RBJ'den iyi. "Hiçbir ayarda" iddiası yanlış.                                                                                                    |
| DSP-08         | Orta             | **DOĞRULANDI** | Düşük                             | Sayılar birebir yeniden üretildi (44,1 kHz'te 8 kHz 0,68 / 12 kHz 1,65 / 16 kHz 3,25 dB). Ama `BW Oct` sözdizimini AutoEq de REW de kullanmıyor, girdi elle yazılmış APO dosyalarıyla sınırlı. ARY-14 ile aynı bulgu (orada Düşük).                                                                                                    |
| ARY-01         | Orta             | **KISMEN**     | Düşük                             | Düzenek doğru: bilinmeyen tek bir tür bütün parametrik ayarı varsayılana döndürüyor. Ama program kendisi bozuk bant yazamıyor: NaN/∞ `sanitized`'de temizleniyor, bilinmeyen ek alan zararsız. Alan düzeyinde geri dönüş `settings.rs:46-48`'de belgelenmiş bir tasarım. Gerçek yollar varsayımsal: sürüm düşürme ve elle düzenleme.   |
| ARY-02         | Orta             | **KISMEN**     | Düşük                             | Kilidin kaydetme boyunca tutulduğu doğru; görsel karenin beklemesi en kötü 3,5–5,3 ms, düzeltilmiş düzende 0,17–0,27 ms. Ama görsel döngü cevabı beklemiyor (`useVisualFeed.ts:111-133`: tek istek uçuşta, son kare dışdeğerlemeyle her rAF'te çiziliyor), yani "kare atlar" iddiası doğru değil. Etki yalnızca zaman damgası kayması. |
| ARY-03         | Orta             | **KISMEN**     | Orta (DSP-02 ile birleştirilmeli) | DSP-02 ile aynı kök. RBJ'de 3,00 dB yeniden üretildi. Ancak `peq.rs:32`'deki "48 kHz'e göredir" cümlesi kulaklık eğrisi içindir ve doğrudur (`DISPLAY_RATE`); belge uyumsuzluğu iddiasının o kısmı yanlış.                                                                                                                             |
| ARY-04         | Orta             | **DOĞRULANDI** | Orta                              | Ana anahtar kapalıyken "Dosyaya kaydet" etkin (`ParametricEq.tsx:558-563` yalnızca `busy` ile kapanıyor). Kaydedilen dosya `Err(Empty)` veriyor. Kapalı bant kayboluyor (5 → 4) ve tasarım Matched → Rbj oluyor.                                                                                                                       |
| ARY-05         | Orta             | **DOĞRULANDI** | Orta                              | Gerçekçi bir L/R dosyasında (L: 3 kHz +4, R: 6 kHz +5) iki filtre de iki kanala uygulanıyor. `Preamp` satırlarından yalnızca sonuncusu alınıyor. Ses sessizce yanlış çıkıyor, hata verilmiyor.                                                                                                                                         |
| ARY-06         | Orta             | **KISMEN**     | Düşük                             | "2.500" → 10 Hz, "12.000" → 12 Hz doğrulandı. Ama "sessizce" abartılı: kutu hemen "10 Hz" gösteriyor, düğüm grafiğin kenarına atlıyor. Program frekansı "2,5 kHz" diye gösteriyor, binlik noktası hiç kullanmıyor.                                                                                                                     |
| ARY-07         | Orta             | **DOĞRULANDI** | Orta                              | Parametrik, crossfeed ve kulaklık hata paragraflarında canlı bölge yok. Projenin başka 8 yerinde var (`NowPlaying`, `LibraryPanel`, `PlayerScreen`, `AbxPanel`…), yani tutarsızlık da açık.                                                                                                                                            |
| ARY-08         | Orta             | **KISMEN**     | Orta                              | dB ölçeği #4d575e 2,44–2,68:1 (gereken 4,5:1), bu açık bir ihlal; sayılar birebir yeniden üretildi. Seçili olmayan bant çizgisi ve A/B'deki gri eğri için 1.4.11'in "içeriği anlamak için gerekli" ölçütü tartışmalı. Hesap ARY-18'deki saydam pano varsayımına dayanıyor; bu varsayım doğru.                                          |
| ARY-18 (Düşük) | Düşük            | **DOĞRULANDI** | Düşük                             | `--glass` hiçbir yerde tanımlı değil (`src/` ve `index.html`'de arandı). `background` kısaltması hesaplama anında geçersiz, pano saydam kalıyor ve radyal parıltı da kayboluyor.                                                                                                                                                       |
| DSP-09 (Düşük) | Düşük            | **DOĞRULANDI** | Düşük                             | Eğri farkı 0,491 dB @ 1,6 kHz (1 kHz'e göre normalize edilince 0,234 dB). Telafiye etkisi −0,147 ile +0,02 dB arasında.                                                                                                                                                                                                                |
| DSP-11 (Düşük) | Düşük            | **KISMEN**     | Düşük                             | Az ölçüm var, ama benim örneklerimde 0,14–0,47 dB (denetçininkilerde 0,56–1,43 dB). Gürültünün tepesi örneğe bağlı, "1 dB'e kadar" tek örnekten genellenmiş.                                                                                                                                                                           |

Sonuç: 16 Orta bulgudan 7'si DOĞRULANDI, 9'u KISMEN, hiçbiri ÇÜRÜTÜLMEDİ. Önerilen önemler: Orta 10 (DSP-01, 02,
03, 06, 07; ARY-03, 04, 05, 07, 08), Düşük 6 (DSP-04, 05, 08; ARY-01, 02, 06). Yüksek ya da Kritik'e çıkan yok.

**Aynı bulgu iki raporda:**

- **DSP-02 = ARY-03.** Kök neden: `peq.rs:65` `ANALYSIS_RATE = 96_000`. Ekran eğrisi ve A/B telafisi 96 kHz'te, ses
  aygıt hızında hesaplanıyor. DSP-03 de aynı kökün Nyquist ucundaki hâli. Rapora tek bulgu olarak girmeli.
- **DSP-08 = ARY-14.** `BW Oct` analog tanımla çevriliyor. İki rapor önemde ayrışıyor; benim önerim Düşük.
- **ARY-08 ↔ ARY-18.** Kontrast hesabı saydam pano zeminine dayanıyor; ARY-18 bu zeminin gerçekten saydam olduğunu
  doğruluyor.
- **DSP-01 ↔ ARY-06 (zincir).** "12.000" ya da "1.000" yazan kullanıcı 20 Hz altında bir bant kurar. Bu bandın
  yükseltmesi korumaya bildirilmez (DSP-01). Böylece iki ayrı bulgu gerçek bir kullanıcı yolunda birleşiyor.
- **DSP-01, 04, 05 ve 12.** Hepsi aynı mekanizmanın (Leveler'a bildirilen `boost_db`) eksik ya da fazla
  beslenmesi. Hiçbiri taşmaya yol açmıyor; son sınırlayıcı (`render.rs:249`) hepsini yakalıyor. Etki, sınırlayıcının
  bu durumlarda sert çalışması.

## Yöntem ve ortam

- Çalışma ağacının içeriği `git checkout 5805853 -- .` ile `5805853`'e getirildi (dal değiştirilmedi, commit
  atılmadı). `node_modules` bağlandı, `dist/` kopyalandı.
- **Disk sınırı:** Diskte boş yer yalnızca 0,2–0,7 GB idi, sıfırdan Rust derlemesi sığmazdı. Bu yüzden test ikilisi
  DSP denetçisinin çalışma ağacındaki hazır derleme önbelleği kullanılarak derlendi
  (`CARGO_TARGET_DIR=.../agent-a955d4da88340075e/src-tauri/target`, `CARGO_INCREMENTAL=0`, 1 dk 22 sn). Kaynak
  benim çalışma ağacımdandı. Ölçümlerden sonra kendi oluşturduğum ikili (~300 MB) silindi.
- Kendi ağacıma şunlar kondu:
  - DSP'nin `denetim_dsp_*.rs` dosyaları (`#[path]` ile bağlandı),
  - ARY'nin `rust-kanit-testleri.diff`'i (`git apply` ile),
  - ARY'nin `ary-denetim.test.tsx.txt`'i,
  - benim bağımsız testlerim: `dog1_*.rs` (peq, eq, biquad, limiter, commands, settings) ve `dog1.test.ts.txt`.

  Kaynakların kopyası `DOG1/rust/` altında.

- Çalıştırılanlar ve çıktıları:
  - DSP testleri: `rust_denetim_dsp_yeniden.txt` (**8 kırmızı, 4 yeşil**: raporla birebir aynı).
  - ARY Rust testleri: `rust_ary_yeniden.txt` (9 kırmızı, 4 yeşil).
  - ARY Vitest: `vitest_yeniden.txt` (9 testten 8'i kırmızı; ARY-sıra yeşil).
  - Benim testlerim: `rust_dog1.txt` (12 test, ölçüm yazdırıyor) ve `vitest_dog1.txt`.
  - Python: `dog1_hesap.py` (BW, K ağırlığı, ara değerleyici), `dog1_dsp06_sinyal.py` (sınırlayıcı uçtan uca),
    `dog1_dsp11_tepe_olcer.py`, `dog1_kontrast.py`. Çıktılar aynı adlı `.txt` dosyalarında.
- DSP-06'nın ara sinyal dosyaları (`g_*.f64`, `c_*.f64`, toplam 34 MB) disk dolduğu için ölçümden sonra silindi.
  `uret` → Rust testi → `olc` sırasıyla yeniden üretilebilirler.

---

## Bulgu bulgu ayrıntı

### DSP-01: Taşma koruması ve kulaklık ön kazancı 20 Hz altını ve dar tepeleri görmüyor

- **Yeniden çalıştırma:** `denetim_dsp_kulaklik_on_kazanci_tepeyi_karsilar` kırmızı. Değerler raporla aynı: LSC 15 Hz
  +12 Q2 → +16,58 dBFS; PK 14 Hz → +7,90 dBFS; Q30 → +1,73 dBFS.
- **Bağımsız yol:** `dog1_dsp01_*`. Oynatıcının kurduğu biçimde (`set_filters(..., s.boost_db(), ...)`) işlemci
  kuruldu. Tepe 1 Hz'ten 200 000 noktalık taramayla bulundu ve o frekansta sinüs geçirildi.

  | Durum                                              | Bildirilen      | Gerçek            | Eksik                                       |
  | -------------------------------------------------- | --------------- | ----------------- | ------------------------------------------- |
  | Parametrik `PK 10 Hz +24 Q4`                       | 1,58 dB         | ölçülen +23,96 dB | 22,4 dB                                     |
  | Parametrik `LS 15 Hz +6`                           | —               | —                 | 4,51 dB                                     |
  | Parametrik `LS 30 Hz +6` (sıradan alt bas rafı)    | —               | —                 | **1,03 dB**                                 |
  | Parametrik `PK 40 Hz +6` (kontrol)                 | —               | —                 | 0,00 dB                                     |
  | Kulaklık `PK 12 Hz +10 Q1,4` (Preamp yok ya da −3) | ön kazanç −3,26 | —                 | çıkış **+6,74 dBFS**, korumaya bildirilen 0 |
  | Kulaklık AutoEq tipik `LSC 105 +6` (kontrol)       | —               | —                 | çıkış +0,01 dBFS                            |

- **Çürütme denemesi:**
  - Yapılmayan ayarlar mı? Hayır: arayüz 10 Hz'e izin veriyor (`parametric.ts:10`), ayrıca ARY-06 yanlışlıkla
    12 Hz'lik bir bant kurduruyor.
  - Taşma olur mu? `render.rs:249`'daki son sınırlayıcı yakalıyor, yani kırpılma yok. Etki: 20 Hz altı içerik
    tam ölçeğe yakınsa sınırlayıcı bütün karışımı kısar.
  - Müzikte tam ölçekli 20 Hz altı içerik seyrektir, bu yüzden Yüksek değil.
  - Belgedeki iddia (`peq.rs:28-30` "hiçbir hızda taşırmaz") kulaklık için açıkça yanlış.
- **Hüküm:** DOĞRULANDI, **Orta**.

### DSP-02 / ARY-03: Ekran eğrisi ve A/B telafisi 96 kHz'te hesaplanıyor

- **Yeniden çalıştırma:**
  - DSP testleri raporla aynı: RBJ 3,01 / 2,41 dB, HS 22 kHz 5,26 dB, A/B 5,85 dB.
  - ARY testi aynı: RBJ PK 16k 3,00 dB; eşlenmişte ≤ 0,51 dB.
- **Bağımsız yol:** `dog1_dsp02_*`. Ekrandaki `ParametricState::curve_db` ile işlemciden sinüsle ölçülen kazanç
  karşılaştırıldı (2 kHz üstü, 241 nokta). İçe aktarma gerçek yoldan yapıldı (`parse` + `from_profile`).

  | Ayar                                                                    | Hız      | Ekranda | Duyulan | Fark          |
  | ----------------------------------------------------------------------- | -------- | ------- | ------- | ------------- |
  | İçe aktarılmış RBJ `PK 15 kHz +6 Q2`, 17,3 kHz'te                       | 44,1 kHz | +3,99   | +1,39   | 2,60 dB       |
  | aynı                                                                    | 48 kHz   | —       | —       | 2,06 dB       |
  | Aynı bant, varsayılan eşlenmiş tasarım                                  | —        | —       | —       | ≤ 0,41 dB     |
  | **İçe aktarılmış gerçekçi AutoEq benzeri profil** (PK 6k/8,4k, HSC 10k) | —        | —       | —       | **≤ 0,40 dB** |

  A/B telafisi, logaritmik ton kümesiyle ölçülen güç farkı:

  | Ayar                   | Fark     |
  | ---------------------- | -------- |
  | `HS 22 kHz +12` @44,1k | +0,67 dB |
  | `HS 20 kHz +12`        | +0,31 dB |
  | `LS 24 kHz +6` @48k    | +5,85 dB |
  | `PK 1 kHz` (kontrol)   | −0,10 dB |

- **Çürütme denemesi:**
  - Kök neden kesin (`peq.rs:65`, `response_curve` ve `loudness_gain_db` 96 kHz kullanıyor).
  - Büyük farklar yalnızca 12 kHz üstü RBJ bantlarında ve 17 kHz üstü bölgede çıkıyor. 24 kHz'lik alçak raf
    anlamsız bir ayar; 5,85 dB'lik A/B örneği gerçek kullanımı temsil etmiyor.
  - ARY-03'ün "`peq.rs:32` '48 kHz'e göredir' yanlış" iddiası **yanlış**. O cümle modülün kulaklık bölümünde,
    kulaklık eğrisi `DISPLAY_RATE = 48_000` ile çiziliyor (`peq.rs:241`), yani doğru.
  - Asıl uyumsuzluk iki yerde:
    - `MIMARI.md:58` "(çizilen eğri duyulan eğridir)": eşlenmişte ~0,4 dB içinde doğru, RBJ'de ve Nyquist yakınında
      değil.
    - `ParametricEq.tsx:192` "gerçek sayısal eğri": bu 96 kHz'in sayısal eğrisi.
- **Hüküm:** KISMEN, **Orta**. Tek bulgu olarak birleştirilmeli, kapsamı "RBJ tasarımı (içe aktarma varsayılanı) ve
  12 kHz üstü bantlar" diye daraltılmalı.

### DSP-03: Nyquist'e yakın raf/tepe sessizce siliniyor

- **Yeniden çalıştırma:** `denetim_dsp_nyquist_…` kırmızı ("raf kayboldu: 0.00 dB").
- **Bağımsız yol:** `dog1_dsp03_nyquist`, 44,1 kHz, işlemciden sinüs.

  | Ayar                                   | Prob   | Duyulan     | Analog | Ekranda    |
  | -------------------------------------- | ------ | ----------- | ------ | ---------- |
  | `HS 22 kHz +12`                        | 16 kHz | 0,00 dB     | +2,96  | +2,99      |
  | `PK 22 kHz +12 Q0,5`                   | 16 kHz | **0,00 dB** | +10,60 | **+10,42** |
  | `HS 21,5 kHz` (sınırın altı, eşlenmiş) | —      | +4,50       | +3,14  | —          |

  Yeni gözlem: kırpılan `HP 22 kHz`, 16 kHz'te **−46,6 dB** kesiyor (analog −6,6 dB, ekranda −6,7). Yani "0,49·fs'e
  çekme" de ekran–ses farkını 40 dB'e çıkarıyor. DSP'nin "HP/BP çekiliyor, tutarsız" gözlemi doğru, ama etkisi
  raporda yazılandan büyük.

- **Çürütme denemesi:** Arayüz 24 kHz'e izin veriyor (`PEQ_FREQ_MAX`). Sürükleme grafikte 20 kHz'te bitiyor, bu
  frekanslara yalnızca kutuya yazarak ulaşılıyor. Yaygın 48 kHz aygıtta sınır 23,52 kHz, ulaşma yolu dar.
- **Hüküm:** DOĞRULANDI, **Orta**. Ayar dar, ama ekran–ses farkı 10–40 dB.

### DSP-04: Grafik ekolayzerin bildirdiği yükseltme gerçek tepeyi karşılamıyor

- **Yeniden çalıştırma:** Kırmızı. Değerler raporla aynı: 3,01 dB, 339/1228, 20 Hz altında 3,02 dB.
- **Bağımsız yol:** `dog1_dsp04_…`. Programın 11 hazır ayarı (`src/lib/eq.ts`) ve 4 elle ayar denendi. Tepe 5 Hz –
  20 kHz arasında 20 000 noktayla bulundu, o frekansta işlemciden sinüs geçirildi.

  | Ayar              | Eksik bildirim             |
  | ----------------- | -------------------------- |
  | Hazır ayarlar     | **0,06–0,22 dB**           |
  | Elle V (+8/−6/+8) | 0,42 dB                    |
  | Tek bant +12      | 0,43 dB                    |
  | Komşu zıt ±12     | 0,35 dB                    |
  | Zikzak ±12        | 2,89 dB (tepe **5 Hz**'te) |

- **Çürütme denemesi:**
  - Belge, sürgülerin gerçek eğriden ≤ 1,2 dB sapabileceğini zaten söylüyor. Gerçekçi ayarlardaki eksik bu payın
    içinde.
  - DSP'nin "339/1228" oranı her bandı bağımsız ±12 arasında rastgele seçen ayarlardan geliyor. Bunlar fiilen
    zikzaktır ve gerçek kullanımı yansıtmıyor.
  - 3 dB'lik en kötü durumlar ya 20 kHz'te ya 5 Hz'te. Oralarda müzik enerjisi düşük.
- **Hüküm:** KISMEN, **Düşük**. Bulgu doğru, ama önem yalnız uç durumdan türetilmiş.

### DSP-05: Parametrik yükseltme 96/192 kHz'te eksik

- **Yeniden çalıştırma:** Kırmızı, 1,85 dB (aynı ayar).
- **Bağımsız yol:** `dog1_dsp05_yuksek_hiz`, 400 rastgele ayar × 2 tasarım × 2 hız.

  | Ayar aralığı     | >0,5 dB eksik (96k / 192k) | En kötü |
  | ---------------- | -------------------------- | ------- |
  | Q ≤ 2 (gerçekçi) | 3/800 / 3/800              | 0,89 dB |
  | Q ≤ 30           | 32/800 / 34/800            | 2,60 dB |

- **Çürütme denemesi:**
  - Paylaşımlı modda ses aygıtın karışım hızına çevriliyor (`resample.rs`), o hız Windows'ta genellikle 48 kHz.
  - 96/192 kHz ancak kullanıcı Windows'ta aygıt biçimini değiştirirse oluyor.
  - Bit-perfect modda ses hiç işlenmiyor (`render.rs:203`).
- **Hüküm:** KISMEN, **Düşük**.

### DSP-06: Sınırlayıcı −1 dBTP tavanını yüksek frekanslı içerikte aşıyor

- **Yeniden çalıştırma:** Sinüs testi kırmızı: −0,884 dBTP @ 48 kHz / 20 kHz, aşım 0,116 dB.
- **Bağımsız yol 1, uçtan uca:** Kendi ürettiğim 12 sinyal (`dog1_dsp06_sinyal.py`, örnek tepesi +2,9 dBFS) gerçek
  `Limiter`'dan geçirildi (`dog1_dsp06_sinirlayici_dosyalar`). Çıkışın gerçek tepesi bütün sinyalin FFT ile 16×
  ara değerlenmesiyle ölçüldü:

  | Sinyal    | 44,1 kHz aşım                       | 48 kHz aşım |
  | --------- | ----------------------------------- | ----------- |
  | pembe     | +0,20                               | +0,08       |
  | beyaz     | **+0,64**                           | +0,18       |
  | 8–16 kHz  | +0,06                               | +0,05       |
  | 14–20 kHz | **+1,02 (0 dBTP'yi +0,017 aşıyor)** | +0,33       |
  | 1–4 kHz   | +0,005                              | +0,004      |
  | zil       | +0,06                               | +0,03       |

  Bütün çıkışların örnek tepesi tam −1,000.

- **Bağımsız yol 2, Python'a aktarılmış ara değerleyici:** Fazların genliği 44,1 kHz / 20 kHz'te −0,11 ile −4,59 dB
  arasında. DSP'nin "20 kHz'te −4,59" sözü en kötü faz içindir, bütün fazlar için değil. Sabit sinüste kaçırma bu
  yüzden küçük; geniş bantlı gürültüde büyük.
- **Çürütme denemesi:**
  - Müziğe benzer tayfta aşım 0,03–0,2 dB, sinyal 0 dBTP'ye yaklaşmıyor.
  - "1 dB'e kadar" ancak yalnızca 14–20 kHz'lik tam ölçekli gürültüde çıkıyor.
  - Tiz yükseltilmiş bir ekolayzer ayarı tayfı beyaza yaklaştırır; o durumda 0,3–0,6 dB gerçekçi.
  - Belgedeki "testler 0,1 dB tolerans" ve "kaçırma 0,04–0,06 dB" sayıları yalnızca dar bantlı sinyaller için doğru.
    Bu sayısal bir belge–kod uyumsuzluğu.
- **Hüküm:** KISMEN, **Orta**. Sayısal iddia yanlış, ama etkinin büyüklüğü raporda abartılmış.

### DSP-07: Eşlenmiş tasarım rezonanslı raflarda RBJ'den kötü

- **Yeniden çalıştırma:** Kırmızı. LS 6,3 kHz +18 Q8: eşlenmiş RBJ'den 0,739 dB kötü.
- **Bağımsız yol:** `dog1_dsp07_…`. Ağırlıksız en büyük mutlak sapma, 20 000 nokta:

  | Ayar                     | Eşlenmiş              | RBJ     | Fark (eşlenmiş − RBJ)                      |
  | ------------------------ | --------------------- | ------- | ------------------------------------------ |
  | `HS 8,7 kHz +12 Q8 @48k` | 14,43 dB (6,6 kHz'te) | 7,12 dB | **+7,31 dB**                               |
  | `LS 6,3 kHz +18 Q8`      | —                     | —       | +0,87 dB                                   |
  | Q4, Q2, Q0,707           | —                     | —       | −1,52, −0,98, −0,86 dB (eşlenmiş daha iyi) |
  | `PK 12 kHz Q8`           | —                     | —       | −2,80 dB                                   |

- **Çürütme denemesi:**
  - Seçim seyrek ızgarada yapılıyor (`biquad.rs:438-443`). İddia ("RBJ de aday, hiçbir ayarda RBJ'den uzak olamaz",
    `biquad.rs:34`, `MIMARI.md:54,248`) yalnızca o ızgara için geçerli, sık ölçüde tutmuyor.
  - Ayar egzotik (Q 8 raf), ama arayüz Q 30'a izin veriyor. Bu ayarda duyulan eğri analogdan 14 dB sapıyor.
- **Hüküm:** DOĞRULANDI, **Orta**. Kategorik bir belge iddiası yanlış ve sapma büyük. Ayar seyrek olduğu için
  Düşük'e de inebilir.

### DSP-08 (= ARY-14): BW Oct → Q analog tanımla

- **Bağımsız yol:** `dog1_hesap.py`. Cookbook'un sayısal BW tanımı (α = sin w0 · sinh(ln2/2 · BW · w0/sin w0)) ile
  koddaki analog tanım karşılaştırıldı. PK +6, BW 1, 44,1 kHz'te fark: 1k 0,01 · 4k 0,16 · 8k 0,68 · 12k 1,65 ·
  16k 3,25 dB. DSP'nin tablosu ve ARY'nin `bw_oct.txt`'i birebir aynı çıktı.
- **Çürütme denemesi:**
  - Kodun kendi yorumu (`peq.rs:451-452`) APO'nun sayısal tanımı kullandığını kabul ediyor, yani fark bilinen bir
    ödünleşim. "Yalnızca çok yüksek frekanslarda" ifadesi ise 8 kHz'te 0,7 dB olduğu için hafife alıyor.
  - AutoEq ve REW dışa aktarımları `Q` kullanıyor. `BW Oct` yalnızca elle yazılmış APO dosyalarında bulunuyor.
- **Hüküm:** DOĞRULANDI, **Düşük**. ARY-14'ün önemiyle aynı; DSP'nin Orta'sı ulaşma yolunu hesaba katmıyor.

### ARY-01: Tek bozuk bant bütün parametrik ayarı siliyor

- **Yeniden çalıştırma:** İki test kırmızı (5 varsayılan bant; profil=None).
- **Bağımsız yol:** `dog1_ary01_…`. Program kendi dosyasını yazdı, sonra tek bir türün adı "notch" → "tilt" yapıldı.
  Okunan: 5 bant (yazılan 6), bant 2 kazancı 0 (yazılan −3,5).
- **Çürütme denemesi:**
  - Bilinmeyen ek alan zararsız (6 bant okundu).
  - NaN/∞ `sanitized`'den geçince 1000 Hz / 0 dB / Q 1 oluyor. Yani programın kendisi `null` ya da bozuk bant
    yazamıyor (serde_json NaN'ı `null` yazardı, ama oraya ulaşmıyor).
  - Alan düzeyinde geri dönüş `settings.rs:44-48`'de bilerek belgelenmiş.
  - Ulaşma yolları (gelecek sürümden geri dönmek, elle düzenleme) bugün yok: test bağlantısı her zaman en yeni
    sürümü veriyor.
- **Hüküm:** KISMEN, **Düşük**. Bakım riski olarak yazılmalı.

### ARY-02: `parametric_set` kilidi kaydetme sırasında tutuyor

- **Yeniden çalıştırma:** ARY'nin testi kırmızı (kilit 5,6 ms tutuldu, bekleme 125 ms). ARY'nin de kabul ettiği gibi
  bu bekleme, adil olmayan mutex ve arka arkaya istekler yüzünden şişiyor.
- **Bağımsız yol:** `dog1_ary02_kilit_kapsami`. Aynı iş iki düzenle yapıldı, istekler arasında 3 ms IPC benzeri ara
  bırakıldı. Görsel kare iş parçacığının beklemesi:

  | Düzen                  | En kötü      | p95        |
  | ---------------------- | ------------ | ---------- |
  | `apply_parametric`     | 3,5–5,3 ms   | 1,2–2,2 ms |
  | `equalizer_set` düzeni | 0,17–0,27 ms | ≈ 0        |

  Kilit kapsamı farkı kesin (`commands.rs:529-540`, `310-318` ile karşılaştırıldı).

- **Çürütme denemesi:**
  - `useVisualFeed.ts:111-133`: görsel döngü `visual_frame` cevabını beklemiyor. Aynı anda tek istek uçuşta, her rAF
    karesi son veriden dışdeğerlemeyle (en çok 250 ms) çiziliyor. Gecikmiş bir cevap kare atlatmıyor, yalnızca
    `latestAt` (gidiş ile dönüşün ortası) tahminini yarım bekleme kadar kaydırıyor.
  - Ses iş parçacığı etkilenmiyor.
  - Windows'taki fsync süresi bilinmiyor, büyüklük ortama bağlı.
- **Hüküm:** KISMEN, **Düşük**. Düzeltme birkaç satır.

### ARY-04: Kapalı ekolayzerin dosyası geri yüklenemiyor

- **Yeniden çalıştırma ve bağımsız yol:**
  - `dog1_ary04_ary05_dosya`: ana anahtar kapalıyken dışa aktarılan dosya `Err(Empty)` veriyor. Bir bant kapalıyken
    5 bant 4'e düşüyor ve tasarım Matched → Rbj oluyor.
  - ARY'nin iki testi de aynı sonucu verdi.
- **Ulaşma yolu:** `ParametricEq.tsx:558-563`'te "Dosyaya kaydet" yalnızca `busy` iken kapalı, ekolayzer kapalıyken
  etkin. Kullanıcının gördüğü hata metni "kulaklık düzeltmesi bulunamadı" ve yanıltıcı.
- **Hüküm:** DOĞRULANDI, **Orta**.

### ARY-05: `Channel:` bölümleri birleştiriliyor, birden çok `Preamp:` toplanmıyor

- **Bağımsız yol:** Gerçekçi bir L/R dosyası denendi (L: PK 3 kHz +4, R: PK 6 kHz +5). İki filtre de iki kanala
  uygulanıyor (`filters.len() = 2`, kanal ayrımı yok). APO'da her kanal yalnızca kendi düzeltmesini alırdı.
  `peq.rs:299-302` `Channel:` satırını `Device:` gibi yok sayıyor.
- **Çürütme denemesi:** AutoEq dosyalarında `Channel:` yok. Ama ürün "Equalizer APO biçimi"ni okuduğunu söylüyor
  (`DOGRULAMA.md` C4). Sonuç sessizce yanlış, hata verilmiyor.
- **Hüküm:** DOĞRULANDI, **Orta**. Yalnızca APO yapılandırması kullananlara ulaşıyor, bu yüzden Düşük'e yakın.

### ARY-06: "2.500" frekansı 10 Hz'e çekiliyor

- **Yeniden çalıştırma:** Vitest `ARY-yerel` kırmızı (10 ≠ 2500).
- **Bağımsız yol:** `dog1.test.ts.txt`, `parseFrequency` + `roundHz`:

  | Yazılan                | Sonuç                  |
  | ---------------------- | ---------------------- |
  | "2.500"                | 10 Hz                  |
  | "1.000"                | 10 Hz                  |
  | **"12.000"**           | **12 Hz**              |
  | "2,5k", "2.5k", "2500" | 2500 Hz                |
  | "1.000,5"              | `null` (yok sayılıyor) |

- **Çürütme denemesi:**
  - Frekans kutusu ≥ 1000 Hz'te "2,5k" biçiminde görünüyor (`ParametricEq.tsx:136-140`), program binlik noktası hiç
    kullanmıyor.
  - Sonuç anında görünür: kutu "10 Hz" yazıyor, düğüm grafiğin sol kenarına gidiyor. "Uyarısız" doğru, "sessizce"
    abartılı.
  - Yan etki: DSP-01'deki eksik bildirilen 20 Hz altı bandı üretiyor.
- **Hüküm:** KISMEN, **Düşük**.

### ARY-07: Hata mesajları ekran okuyucuya duyurulmuyor

- **Yeniden çalıştırma:** Vitest `ARY-duyuru` kırmızı (`closest('[role=alert],…')` → null).
- **Kod:** `ParametricEq.tsx:414`, `CrossfeedStrip.tsx:192` ve `EqualizerPanel.tsx:217-219`'da canlı bölge yok.
  Aynı projede 8 yerde `role="alert"`, `role="status"` ya da `aria-live` kullanılıyor.
- **Hüküm:** DOĞRULANDI, **Orta** (WCAG 4.1.3).

### ARY-08: Kontrast

- **Bağımsız yol:** `dog1_kontrast.py`, dört sahne zemini üzerinde `--glass-strong` (rgba(9,12,20,0,8),
  `global.css:949`).

  | Öğe               | Kontrast                          | Gereken |
  | ----------------- | --------------------------------- | ------- |
  | dB ölçeği #4d575e | 2,44–2,68:1 (kuzey ışığında 1,70) | 4,5:1   |
  | Bant çizgisi      | 1,54–1,79:1                       | 3:1     |
  | A/B'de gri eğri   | 1,22–1,94:1                       | 3:1     |
  | `--text-muted`    | 4,98–5,03:1 (kuzey ışığında 4,15) | 4,5:1   |
  | `.xf.is-off`      | 1,88–2,00:1                       | 4,5:1   |

  ARY'nin sayıları birebir aynı çıktı.

- **Çürütme denemesi:**
  - `.eq__scale` `aria-hidden`, ama 1.4.3 görünen metne uygulanır; muafiyet yok.
  - Seçili olmayan bant çizgileri yardımcı grafik (toplam eğri ve seçili bant yüksek kontrastlı). A/B'deki gri
    eğri bilerek söndürülmüş bir durum göstergesi. İkisi için de 1.4.11 ihlali tartışmalı.
  - `.xf.is-off`'ta denetimler `disabled` değil (`CrossfeedStrip.tsx`), yani "etkin olmayan bileşen" muafiyeti
    uygulanmıyor ve ihlal geçerli.
- **Hüküm:** KISMEN, **Orta**. Ana kalem (dB ölçeği) kesin; dört kalemden ikisi tartışmalı.

---

## Sınanan Düşük bulgular

### ARY-18: `var(--glass)` tanımsız

- `src/`, `index.html` ve `public/` içinde `--glass:` tanımı yok. Yalnızca `--glass-fill`, `-strong`, `-edge` ve
  `-blur` var (`global.css:29-32`). `global.css:2671` ve `:3458`'teki `background` kısaltması hesaplama anında
  geçersiz oluyor, `unset`'e dönüyor. Pano saydam kalıyor ve radyal parıltı da gitmiş oluyor.
- **Hüküm:** DOĞRULANDI, Düşük (ARY-08'in hesap zemini de buna dayanıyor).

### DSP-09: A/B'nin K ağırlığı BS.1770 değil

- `dog1_hesap.py`: BS.1770-4'ün 48 kHz katsayılarına göre en büyük fark 0,491 dB @ 1,59 kHz (DSP: 0,491 @ 1,6 kHz).
  Sabit kayma çıkarılınca (1 kHz'e göre normalize) 0,234 dB.
- Telafiye etkisi: PK 1,5k +12 Q0,7 için −0,147 dB; tipik ayarlarda |Δ| ≤ 0,03 dB.
- **Hüküm:** DOĞRULANDI, Düşük.

### DSP-11: Analizdeki gerçek tepe ölçer az ölçüyor

- `dog1_dsp11_tepe_olcer.py`: `loudness.rs` `TruePeak` (4×, 12 katsayı, örnekler dahil) Python'a satır satır
  aktarıldı ve FFT referansıyla karşılaştırıldı.

  | Sinyal        | 44,1 kHz | 48 kHz   |
  | ------------- | -------- | -------- |
  | Pembe gürültü | −0,21 dB | −0,01 dB |
  | Beyaz gürültü | −0,47 dB | −0,26 dB |
  | 12–20 kHz     | −0,14 dB | −0,26 dB |
  | 1–4 kHz       | 0        | 0        |

- Yön doğru; büyüklük gürültü örneğine bağlı. DSP'nin −1,02 / −1,43 dB'i tek bir örnekten.
- **Hüküm:** KISMEN, Düşük.

## Sınırlar

- Equalizer APO'nun kaynak kodu ağdan doğrulanmadı. BW ve `Channel:` anlamları Cookbook'a, kodun kendi yorumuna ve
  APO belgesine dayanıyor; bu iki raporla aynı sınır.
- fsync süreleri Linux'ta ölçüldü, Windows'taki büyüklük bilinmiyor.
- Gerçek ekran okuyucu ve gerçek WebView2 kullanılmadı.
- DSP-06'da gürültü tepeleri örneğe bağlı. Tek bir rastgele tohumla (20261022) ölçüldü; sınırlayıcı ölçümleri iki
  hızda tutarlı çıktı.
- Disk dolduğu için derleme DSP denetçisinin hedef klasörüyle yapıldı. Kaynak, testler ve sonuçlar bu çalışma
  ağacına aitti.
