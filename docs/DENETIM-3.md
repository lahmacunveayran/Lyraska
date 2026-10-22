# Faz 3 kalite ve hata denetimi — 22 Ekim 2026

Proje sahibinin isteği: "Faz 3 bitti. Faz 3'e kalite ve hata denetimi yap. İki kere denetle. İkinci denetim bağımsız
ve daha üstün, daha profesyonel, daha nitelikli olsun."

Bu belge iki denetimi bir arada sunar:

- **Denetim 1 (ilk denetim):** geliştirme oturumunun kendisi, Faz 3 kodunu satır satır okudu; her bulguyu kırmızı
  yanan bir testle kanıtladı. Tam rapor: [denetim-3/denetim-1.md](denetim-3/denetim-1.md).
- **Denetim 2 (bağımsız denetim):** dört uzman denetçi, birbirinden ve Denetim 1'den habersiz, kendi kod kopyalarında
  çalıştı; ardından **iki ayrı doğrulayıcı** onların bulgularını yeniden üretip çürütmeye çalıştı. Tam raporlar:
  `docs/denetim-3/` altında, kelimesi kelimesine.

Denetlenen kod: `main` @ `5805853` (0.0.55; Faz 3'ün son PR'ları #83 ve #93 ile Faz 4'ün ilk maddesi #94 birleşmiş).

## 0. Yönetici özeti (proje sahibi için)

- **Faz 3'ün temeli sağlam.** Kritik (hemen durdur) ya da Yüksek önemli bulgu **yok**. Beş denetçinin puanları
  6,5–7/10. Süzgeç matematiği (RBJ formülleri, "analog eğriye sadık" tasarım, crossfeed) bağımsız hesapla makine
  hassasiyetinde doğrulandı. Ses iş parçacığı en ağır ayarlarla, ayarlar her blokta değişirken bile bellek ayırmıyor.
  Bütün kalite kapıları yeşil.
- **Asıl zayıflık, parçaların birbirine bağlandığı yerler.** Üç tema öne çıkıyor:
  1. **Ekranda görülen ile kulağa gelen arasındaki farklar:** parametrik ekolayzerin eğrisi 96 kHz'te çiziliyor ama
     ses aygıtın hızında (çoğunlukla 44,1/48 kHz) çalıyor; 12 kHz üstünde, özellikle "Equalizer APO ile aynı"
     seçiliyken 3–4,7 dB fark var. Nyquist'e yakın bir bant ekranda var, seste yok.
  2. **Taşma korumasının hesabı:** koruma ile sonundaki sınırlayıcı farklı tavanlara göre çalışıyor (0 dBTP / −1 dBTP);
     korumaya bildirilen yükseltme 20 Hz altını görmüyor. Ses taşmıyor (sınırlayıcı yakalıyor) ama "ekolayzer sesi
     kısmadan yükseltir" vaadi bu durumlarda sınırlayıcının sürekli çalışmasına (hafif pompalama) dönüşüyor.
  3. **Kullanım ayrıntıları:** sürüklerken grafik ölçeği değişince kazanç tek pikselde ~6 dB sıçrıyor; çekmeceyi fare
     tekerleğiyle kaydırırken imleç grafiğin üstünden geçerse görmediğiniz bir bandın Q'su değişiyor; Equalizer
     APO'nun sol/sağ kanal bölümleri iki kanala toplanarak uygulanıyor.
- **İki denetim birbirini doğruluyor:** Denetim 1'in 14 bulgusundan 9'unu bağımsız denetçiler habersizce yeniden buldu
  (Bölüm 4). Bağımsız denetim ayrıca Denetim 1'in görmediği önemli konular buldu: bit-perfect çalarken sıradaki
  şarkının bit derinliği denetlenmiyor (ekran "bit-perfect" derken bitler yuvarlanıyor), hızlı "Önceki"
  basışlarında tık, 20 Hz altındaki süzgeçlerin korumaya hiç bildirilmemesi, kapalı ekolayzerin kaydedilen dosyasının
  geri yüklenememesi.
- **Doğrulama katmanı:** bağımsız denetimin 27 Orta ve üstü/şüpheli bulgusundan **hiçbiri çürütülmedi**; 12'si olduğu
  gibi, 11'i kısmen doğrulandı (büyüklük ya da ulaşma yolu abartılı), 7'sinin önemi Düşük'e indirildi.
- **Kararınızı bekleyen konu yok.** Öncelik sırası Bölüm 5'te; hepsi küçük, testle kilitlenebilir düzeltmeler.

## 1. Kapsam ve yöntem

### 1.1 Kapsam

Faz 3'ün kodu ve onu ses yoluna, ayarlara, komutlara ve ekrana bağlayan her şey: süzgeç çekirdeği (`biquad.rs`),
kulaklık düzeltmesi ve elle parametrik ekolayzer (`peq.rs`), crossfeed (`crossfeed.rs`), gerçek tepe sınırlayıcı
(`limiter.rs`), eşitleme ve taşma koruması (`normalize.rs`, `loudness.rs`), ses yolu (`render.rs`), oynatıcı
(`player.rs`: oturumlar, geçişler, aygıt değişimi, bit-perfect), çıkış (`output.rs`, `output/wasapi.rs`), kör test
(`abx.rs`), yeniden örnekleme (`resample.rs`), bas motoru ve ekolayzerin Faz 3'le ilgili kısımları; `commands.rs`,
`settings.rs`; arayüzde `ParametricEq.tsx`, `CrossfeedStrip.tsx`, `EqualizerPanel.tsx`, ilgili hook'lar ve
`lib/parametric.ts`, `lib/crossfeed.ts`; belgelerde MIMARI, ROADMAP Faz 3, DOGRULAMA C5–C6. Toplam ~20 000 satır
kod.

Kapsam dışı: Faz 4'ün açık şarkı haritası (`fingerprint.rs`, `map_file.rs`; #94), görseller, kütüphane.

### 1.2 Denetim 2'yi Denetim 1'den "üstün" kılan şey

| Özellik          | Denetim 1                      | Denetim 2                                                                                    |
| ---------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| Denetçi          | geliştirme oturumu (tek göz)   | 4 uzman: DSP/matematik, gerçek zamanlı ses, arayüz/sözleşme, test etkinliği                  |
| Bağımsızlık      | kodu yazanlarla aynı bağlam    | ayrı bağlam, ayrı kod kopyası; Denetim 1, önceki denetimler ve devir notları okuma yasağında |
| Kanıt şartı      | kırmızı test (Orta bulgularda) | her Orta ve üstü bulgu için çalıştırılabilir kanıt zorunlu; kanıtsız iddia "şüphe"           |
| Ölçek            | hedefli kanıt testleri         | 96 760 süzgeç ayarı taraması, 20 000 rastgele dosya, eşzamanlılık stres testleri             |
| Test kalitesi    | —                              | mutasyon testi (testler gerçekten hata yakalıyor mu?) ve iddia–kanıt matrisi                 |
| Karşıt doğrulama | —                              | 2 ayrı doğrulayıcı her bulguyu yeniden üretip çürütmeye çalıştı, önemi yeniden tarttı        |
| Standartlar      | RBJ, BS.1770                   | RBJ, Vicanek 2016, BS.1770-4 Ek 2, EBU R128, bs2b, Equalizer APO anlamları, WASAPI, WCAG 2.2 |

Ortak kural metni: [denetim-3/BRIEF.md](denetim-3/BRIEF.md).

### 1.3 Sınırlar

Bütün denetçiler aynı model ailesinden (Claude), ayrı bağlamlarda çalıştı: bir insan ekibi kadar bağımsız sayılmamalı.
Denetim Linux'ta yapıldı; WASAPI ve gerçek aygıt davranışı kod okuması ve sanal çıkışla denetlendi. Equalizer APO'nun
kaynak koduna ağdan erişilemedi; APO anlamları kodun kendi açıklamalarına ve RBJ'ye göre sınandı.

## 2. Denetim 1 — özet

Puan **7/10**. 14 bulgu: 7 Orta, 7 Düşük; ayrıca bir bilgi notu. Tam rapor ve kanıt testleri:
[denetim-3/denetim-1.md](denetim-3/denetim-1.md), `denetim-3/denetim-1-kanit/`.

| Kod   | Önem  | Bulgu                                                                                    | Kanıt (sonuç)                                      |
| ----- | ----- | ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| D1-01 | Orta  | Taşma koruması 0 dBTP'ye, sınırlayıcı −1 dBTP'ye göre: koruma varken sınırlayıcı çalışır | +6 dB parametrikte sınırlayıcı her tepede −1,00 dB |
| D1-02 | Orta  | Sürüklerken grafik ölçeği değişince kazanç sıçrar                                        | 1 pikselde 17,1 → 23,0 dB                          |
| D1-03 | Orta  | Fare tekerleği grafiğin üstünden geçerken Q değişir, sayfa kaymaz                        | Q 0,707 → 0,667, kaydırma engellendi               |
| D1-04 | Orta  | Ekran eğrisi 96 kHz'te; "çizilen = duyulan" testi ekran eğrisini ölçmüyor                | 44,1 kHz'te eşlenmiş 1,49 dB, RBJ 4,71 dB fark     |
| D1-05 | Orta  | APO `Channel:` bölümleri iki kanala toplanır, `Preamp:` satırları toplanmaz              | L +6 / R +6 → her kanal +12 dB                     |
| D1-06 | Orta  | Nyquist yakını bant: ekranda var, 44,1 kHz'te yok, ama ses kısılıyor                     | ekranda +20,2 dB, seste 0, korumaya 23,5 dB        |
| D1-07 | Orta  | `apply_parametric` oynatıcı kilidini fsync ve eğri hesabı boyunca tutar                  | kod; hesap 4 ms + fsync her sürükleme adımında     |
| D1-08 | Düşük | Frekans kutusunda "1.000" → 10 Hz                                                        | kod                                                |
| D1-09 | Düşük | Kapalı ekolayzer dışa aktarılınca da `Preamp` düşük yazılır                              | kod                                                |
| D1-10 | Düşük | Kilitsiz kanalda yırtık okuma (≤ 30 ms)                                                  | kod                                                |
| D1-11 | Düşük | Yeni süzgeç takımı sıfır durumdan başlar (alçak frekansta yüksek Q'da kuyruk)            | kod                                                |
| D1-12 | Düşük | Crossfeed'in uygulanmadığı durumlar (bit-perfect, mono, çok kanal) yazılı söylenmez      | kod                                                |
| D1-13 | Düşük | İçe aktarma yalnızca UTF-8; hata İngilizce; boyut sınırı yok                             | kod                                                |
| D1-14 | Düşük | Belge "kulaklık profilinde eşlenmiş tasarım istenirse" diyor; seçilemiyor                | kod                                                |

Kalite kapıları (Denetim 1, bu oturum): `cargo test` 409 + 4 kodek geçti (3 ignored); Clippy Linux ve Windows
hedefinde temiz; `cargo fmt`, Vitest 309/309, ESLint, `tsc`, Prettier, `check:commands` (53/53), `check:audio`,
`check:licenses`, `check:notices` temiz; üretilen bağlamalarda fark yok.

## 3. Denetim 2 — bağımsız denetim özeti

| Alan                              | Puan   | Bulgu (Y/O/D) | Denetçinin en önemli üç bulgusu                                                                                                                                                                |
| --------------------------------- | ------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DSP ve matematik (DSP)            | 6,5/10 | 12 (0/8/4)    | DSP-01 koruma taraması 20 Hz altını ve çok dar tepeleri görmüyor; DSP-02 ekran eğrisi ve A/B telafisi 96 kHz'te; DSP-06 sınırlayıcı geniş bantlı tizde −1 dBTP'yi aşıyor                       |
| Gerçek zamanlı ses (RTS)          | 7/10   | 7 (0/3/4)     | RTS-01 sarma ile şarkı açma üst üste gelince eski oturum kısılmadan kesilir; RTS-02 durdurma/aygıt değişimi kilit altında; RTS-03 bit-perfect'te sıradaki şarkının bit derinliği denetlenmiyor |
| Arayüz, sözleşme, kalıcılık (ARY) | 6,5/10 | 18 (0/8/10)   | ARY-01 tek bozuk bant bütün parametrik ayarı siler; ARY-04 kapalı ekolayzerin dosyası geri yüklenemez; ARY-05 APO `Channel:` bölümleri toplanır                                                |
| Test etkinliği (TST)              | TST    | TST           | TST                                                                                                                                                                                            |

Y/O/D = Yüksek/Orta/Düşük. Kritik bulgu hiçbir alanda yok. Tam raporlar: `docs/denetim-3/DSP.md`, `RTS.md`,
`ARY.md`, `TST.md`; kanıtlar `docs/denetim-3/hesap/<önek>/`.

### 3.1 Doğrulama katmanı

İki doğrulayıcı (`DOGRULAMA-1.md`: DSP + ARY; `DOGRULAMA-2.md`: RTS + TST) her bulgunun kanıtını kendi kopyasında
yeniden çalıştırdı, iddiayı ikinci bir yoldan göstermeye çalıştı ve çürütmeyi denedi.

| Kod                               | Denetçinin önemi | Hüküm               | Son önem | Doğrulayıcının gerekçesi (kısa)                                                                                               |
| --------------------------------- | ---------------- | ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| DSP-01                            | Orta             | DOĞRULANDI          | Orta     | `LS 30 Hz +6` bile 1,03 dB eksik bildiriliyor; profilde `PK 12 Hz +10` sinüsü +6,74 dBFS'e çıkarıyor                          |
| DSP-02                            | Orta             | KISMEN              | Orta     | kök neden doğru; RBJ'de 12 kHz üstü 2–3 dB; gerçekçi AutoEq profilinde ve varsayılanda ≤ 0,4 dB                               |
| DSP-03                            | Orta             | DOĞRULANDI          | Orta     | `PK 22 kHz +12` ekranda +10,4 dB, duyulan 0; sınıra çekilen `HP 22 kHz` 16 kHz'te −46,6 dB                                    |
| DSP-04                            | Orta             | KISMEN              | Düşük    | hazır ayarlarda eksik yalnız 0,06–0,22 dB; 3 dB yalnız ±12 zikzakta                                                           |
| DSP-05                            | Orta             | KISMEN              | Düşük    | gerçekçi ayarlarda en kötü 0,89 dB; yalnız Windows 96/192 kHz'e ayarlıysa                                                     |
| DSP-06                            | Orta             | KISMEN              | Orta     | "0,1 dB tolerans" geniş bantta tutmuyor (+0,64 dB); müzikte 0,03–0,2 dB                                                       |
| DSP-07                            | Orta             | DOĞRULANDI          | Orta     | `HS 8,7 kHz +12 Q8`'de eşlenmiş 14,4 dB, RBJ 7,1 dB sapıyor; "RBJ'den uzak olamaz" yanlış                                     |
| DSP-08                            | Orta             | DOĞRULANDI          | Düşük    | sayılar birebir; ama `BW Oct`'u AutoEq ve REW yazmıyor                                                                        |
| ARY-01                            | Orta             | KISMEN              | Düşük    | düzenek doğru; program bozuk bant yazamıyor, ulaşma yolları varsayımsal                                                       |
| ARY-02                            | Orta             | KISMEN              | Düşük    | kilit kaydetme boyunca tutuluyor (3,5–5,3 ms); görsel döngü cevabı beklemiyor                                                 |
| ARY-03                            | Orta             | KISMEN              | Orta     | DSP-02 ile aynı kök (birleşti)                                                                                                |
| ARY-04                            | Orta             | DOĞRULANDI          | Orta     | kapalıyken kaydedilen dosya `Err(Empty)`; kapalı bant ve tasarım gidiş-dönüşte kayboluyor                                     |
| ARY-05                            | Orta             | DOĞRULANDI          | Orta     | sol/sağ düzeltme iki kanala birden; hata verilmiyor                                                                           |
| ARY-06                            | Orta             | KISMEN              | Düşük    | doğru, ama değer ekranda anında değişiyor ("sessizce" abartılı)                                                               |
| ARY-07                            | Orta             | DOĞRULANDI          | Orta     | üç hata paragrafında ekran okuyucu duyurusu yok (WCAG 4.1.3)                                                                  |
| ARY-08                            | Orta             | KISMEN              | Orta     | dB ölçeği 2,44–2,68:1 (gereken 4,5:1) kesin; öteki iki çizgi tartışmalı                                                       |
| RTS-01                            | Orta             | KISMEN              | Orta     | yarış gerçek ve "Önceki"ye iki hızlı basışla ulaşılıyor; sonuç iki şarkının birlikte çalması değil, ~10–20 ms'lik kesik (tık) |
| RTS-02                            | Orta             | KISMEN              | Düşük    | doğru, ama `restart` belgesi bunu söylüyor; görseller sesin zaten durduğu anda 0,1–0,3 sn durur                               |
| RTS-03                            | Orta             | DOĞRULANDI          | Orta     | ikinci yoldan da gösterildi; "bit-perfect" etiketi yanlış, duyulan kalite değil; tek satırlık düzeltme                        |
| RTS-04…07, DSP-09, DSP-11, ARY-18 | Düşük            | DOĞRULANDI / KISMEN | Düşük    | ayrıntı doğrulama raporlarında                                                                                                |

TST doğrulaması: TST

## 4. Çapraz karşılaştırma

### 4.1 Bağımsız denetimin habersizce yeniden bulduğu Denetim 1 bulguları

| Denetim 1 | Denetim 2          | Not                                                                                          |
| --------- | ------------------ | -------------------------------------------------------------------------------------------- |
| D1-02     | ARY-11             | aynı sayılar (17 → 23 dB); ARY Düşük dedi, Denetim 1 Orta: ses anında ~6 dB yükseliyor       |
| D1-04     | DSP-02 = ARY-03    | üç ayrı yoldan aynı kök: `ANALYSIS_RATE = 96 kHz`                                            |
| D1-05     | ARY-05             | ikisi de `Preamp:` toplamasını da gördü                                                      |
| D1-06     | DSP-03 (ve DSP-05) | DSP daha geniş: alçak geçiren, çentik, tüm geçiren de; HP sınırda −46,6 dB                   |
| D1-07     | ARY-02 = RTS-05    | üç bağımsız ölçüm: 4 ms (D1), 3,5–5,3 ms (doğrulayıcı), ortalama 11 ms, en kötü 236 ms (RTS) |
| D1-08     | ARY-06             | aynı                                                                                         |
| D1-09     | ARY-04             | ARY daha ağırını buldu: kapalı ekolayzerin dosyası hiç geri yüklenemiyor                     |
| D1-10     | RTS-04             | RTS stres testiyle gösterdi; seqlock önerisi ikisinde de                                     |
| D1-12     | RTS-06             | RTS: çok kanallı şarkıda ışık yanmayı sürdürüyor                                             |
| D1-13     | ARY-15             | aynı                                                                                         |
| Bilgi     | RTS-07             | tasarım süresi: 397 µs (D1, hata ayıklama derlemesi), 168–337 µs (RTS, sürüm)                |

### 4.2 Yalnızca Denetim 1'in bulduğu

- **D1-01** (koruma 0 dBTP, sınırlayıcı −1 dBTP). DSP denetçisi korumanın beslenmesindeki eksikleri (DSP-01/04/05/12)
  ve sınırlayıcının kendi aşımını (DSP-06) buldu ama iki tavan arasındaki 1 dB'lik farkı görmedi. Kırmızı testle
  kanıtlı; bu belgedeki en yaygın etkili bulgu (her ekolayzer yükseltmesinde).
- **D1-03** (tekerlek): ARY sürükleme ve klavyeyi denetledi, tekerleği görmedi.
- D1-11, D1-14 (Düşük).

### 4.3 Yalnızca Denetim 2'nin bulduğu (önemlileri)

- **RTS-03** bit-perfect'te sıradaki şarkının bit derinliği: ürünün "bit-perfect" vaadine doğrudan dokunuyor.
- **RTS-01** hızlı "Önceki" basışlarında yarış ve tık.
- **DSP-01** 20 Hz altındaki süzgeçlerin korumaya bildirilmemesi.
- **DSP-06** sınırlayıcının ara değerleyicisi tizde zayıf: belgedeki "0,1 dB tolerans" geniş bantta tutmuyor.
- **DSP-07** "eşlenmiş tasarım hiçbir ayarda RBJ'den kötü olamaz" iddiası yüksek Q'lu raflarda yanlış.
- **ARY-04** kapalı ekolayzerin kaydedilen dosyası geri yüklenemiyor.
- **ARY-07, ARY-08** erişilebilirlik: hata duyurusu ve kontrast.
- TST

### 4.4 Ayrışmalar

- **D1-02 / ARY-11 önemi:** ARY Düşük dedi; bu belge Orta'da tutuyor (bir pikselde ~6 dB'lik ani ses yükselmesi,
  işitme konforu).
- **D1-07 / ARY-02 / RTS-05 önemi:** doğrulayıcı görsel döngünün cevabı beklemediğini gösterdi (kare atlamıyor);
  bu belge önemi **Düşük**'e indiriyor. Denetim 1'in "görseller takılır" yorumu bu ölçüde abartılıydı.
- **D1-10 / RTS-04:** ikisi de Düşük; doğrulayıcı RTS'nin stres testinin gerçekçi olmadığını, `EqControl` belgesinin
  aynı ödünleşimi zaten kabul ettiğini not etti.

## 5. Birleşik öncelik sırası

Her madde önce hatayı yakalayan testle (kanıt testleri hazır: `docs/denetim-3/`).

### 5.1 Önce (küçük, sesin doğruluğuna dokunan)

1. **RTS-03** bit-perfect'te sıradaki şarkının bit derinliğini de denetlemek (tek satır; uymuyorsa boşluksuz geçiş
   yerine oturumu yeniden açmak).
2. **D1-01** korumanın boşluğunu sınırlayıcıyla aynı tavana (−1 dBTP) göre hesaplamak.
3. **DSP-01** tepe taramasını 20 Hz'in altından (1–10 Hz) başlatmak ve her süzgecin tepe frekansını taramaya eklemek.
4. **D1-04 / DSP-02 / ARY-03 + D1-06 / DSP-03** parametrik eğriyi, A/B telafisini ve korumayı çalan aygıtın hızında
   hesaplamak; 0,49·fs üstündeki bantları silmek yerine sınırlamak ya da frekansı 20 kHz'le sınırlamak; "çizilen =
   duyulan" testini ekran eğrisiyle yazmak.
5. **RTS-01** sarma ve şarkı açmayı tek kuyrukta sıralamak (ya da çekirdekte eski hazırlığı iptal etmek).

### 5.2 Sonra (kullanım ve dosya biçimi)

6. **D1-02** sürükleme başında grafik ölçeğini dondurmak. **D1-03** tekerleği yalnız düğüm üstünde/odakta yakalamak.
7. **D1-05 / ARY-05** `Channel:` görülünce anlaşılır hata; `Preamp:` satırlarını toplamak. **ARY-04** kapalı
   ekolayzeri geri yüklenebilir biçimde kaydetmek (ya da kaydetmeyi kapalıyken engellemek).
8. **ARY-07, ARY-08** hata duyurusu (`role="alert"`) ve dB ölçeğinin kontrastı; **ARY-18** tanımsız `--glass`.
9. **DSP-06** sınırlayıcının ara değerleyicisine geçiş bandı payı; **DSP-07** eşlenmiş tasarımın ızgarasına kutup
   bölgesini eklemek; belgedeki iki iddiayı ölçülene göre düzeltmek.
10. Geri kalan Düşük bulgular (D1-08…14, DSP-04/05/08/09/10/11/12, ARY-01/02/06/09–17, RTS-02/04–07).

### 5.3 Proje sahibinin kararı

Yok. Bütün düzeltmeler mevcut kararların (−1 dBTP tavanı, varsayılan tasarım, bit-perfect davranışı) içinde kalıyor.

## 6. Ekler

- `denetim-3/denetim-1.md`, `denetim-3/denetim-1-kanit/`: Denetim 1.
- `denetim-3/BRIEF.md`: bağımsız denetçilerin ortak kuralları.
- `denetim-3/DSP.md`, `RTS.md`, `ARY.md`, `TST.md`: bağımsız raporlar; `denetim-3/DOGRULAMA-1.md`, `DOGRULAMA-2.md`:
  doğrulayıcıların raporları.
- `denetim-3/hesap/<önek>/`: betikler (`python3 -I betik.py`), Rust/Vitest kanıt testleri ve çıktıları. 96 760
  ayarlık katsayı dökümü (`rust_katsayilar.csv`, 28 MB) depoya alınmadı; `hesap/DSP/` altındaki test ile yeniden
  üretilir.
