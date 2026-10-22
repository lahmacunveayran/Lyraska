# Doğrulama 2: RTS raporunun bağımsız sınanması (Faz 3, Denetim 2, son katman)

Doğrulayıcı: DOG2. Kaynak: `main` @ `5805853` (çalışma ağacı `git checkout 5805853 -- .` ile getirildi; commit yok).
Tarih: 22 Ekim 2026. Sınanan rapor: `bagimsiz/RTS.md` (RTS-01 … RTS-07).

## Özet tablo

| Kod    | Denetçinin önemi | Hüküm          | Önerilen önem       | Gerekçe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ---------------- | -------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RTS-01 | Orta             | **KISMEN**     | Orta                | Yarış gerçek. Arayüz yolu denetçinin yazdığından da yaygın: "Önceki"ye iki kez hızlı basmak yetiyor (vitest ile gösterildi). Ama "iki şarkı aynı anda çalar" büyük ölçüde testin `install`'dan önce koyduğu 20 ms beklemenin ürünü. Komutların gerçek sırasıyla iki çıkışın birlikte ilerlediği süre ölçülebilir değil (0,00 ms). Duyulan sonuç: eskimiş oturumun kısa (~10–20 ms) bir parçası kısılmadan kesilir, tık duyulur. Özel modda yeni şarkının açılamaması olası ama kanıtsız. "Veya tersi" yanlış: açma sürerken sarma yarış üretmez. |
| RTS-02 | Orta             | **KISMEN**     | Düşük               | Kilidin bütün geçiş boyunca tutulduğu doğru; iki yeni yolda da (bit-perfect değişimi, şarkı bitince "çal") yeniden üretildi. Ancak `restart`'ın kendi belgesi bunu açıkça söylüyor; SES-02 ve B14 de yalnızca şarkı değiştirme ve sarma için söz veriyor. Yani belge ile kod arasında sayısal bir çelişki yok. Görsel duraklama (~0,1–0,3 sn) sesin de zaten durduğu ya da yeniden başladığı anlarda oluyor.                                                                                                                                     |
| RTS-03 | Orta             | **DOĞRULANDI** | Orta                | Kod ve iki ayrı test bunu kesin olarak gösteriyor: 16 bit aygıtta 24 bit şarkı, ayrıca 24 bit aygıtta 32 bit şarkı. Ekranda "bit-perfect" yazarken örneklerin %99,6'sı değişiyor. Yine de Yüksek ya da Kritik değil: bit-perfect isteğe bağlı bir ayar, koşul dar (dar biçimli aygıt + aynı hızda daha geniş bit derinlikli sıradaki şarkı) ve hata −96 dBFS'te, duyulmaz. Bozulan şey vaadin doğruluğu; ses kalitesi bozulmuyor.                                                                                                                |
| RTS-04 | Düşük            | **DOĞRULANDI** | Düşük               | Yırtık okuma yeniden üretildi. Stres testi gerçekçi değil (yazıcı boş döngüde sürekli yazıyor) ve ±48 dB örneği yapay olarak kurulmuş. Hata kendiliğinden düzeliyor; `EqControl` belgesi aynı ödünleşimi zaten kabul ediyor.                                                                                                                                                                                                                                                                                                                     |
| RTS-05 | Düşük            | **DOĞRULANDI** | Düşük               | `apply_parametric` kilidi `store.update` (`sync_all`) boyunca tutuyor. `equalizer_set` ve `crossfeed_set` ise tutmuyor. Ölçüm: kilit ort. 11,2 ms, bunun 9,8 ms'si `sync_all`.                                                                                                                                                                                                                                                                                                                                                                   |
| RTS-06 | Düşük            | **DOĞRULANDI** | Düşük               | 6 kanalda crossfeed atlanıyor (sağ ön tepe 0) ama ışık yanmaya devam ediyor. MIMARI.md "Yalnız stereo" diyerek bunu belgeliyor; sorun yalnızca arayüzdeki tutarsızlık.                                                                                                                                                                                                                                                                                                                                                                           |
| RTS-07 | Düşük            | **DOĞRULANDI** | Düşük (iyileştirme) | Tasarım ses iş parçacığında, ayırma yapmıyor; ortalaması 168–337 µs. Kural ihlali yok. En kötü değerler bu ortamda eşzamanlı derlemelerin zamanlayıcı gürültüsü.                                                                                                                                                                                                                                                                                                                                                                                 |

Sonuç: 7 bulgunun 5'i olduğu gibi doğrulandı, 2'si kısmen doğrulandı, hiçbiri çürütülmedi. Önem değişikliği tek bulguda: RTS-02 Orta'dan Düşük'e iniyor. RTS-01 Orta'da kalıyor ama tanımı düzeltilmeli. Kritik ya da Yüksek bulgu yok.

## Yöntem ve ortam

- Diskte yer yoktu (başta 647 MB boş vardı, bir ara %100 doldu). Bu yüzden sıfırdan derlemek yerine RTS
  denetçisinin derleme önbelleği kullanıldı:
  `CARGO_TARGET_DIR=…/agent-a93bff2795655c113/src-tauri/target`. Kaynak benim ağacımdan alındı;
  `cargo test --release --offline --lib`. Benim ağacım ile RTS ağacının `src-tauri/src` içeriği, kanıt dosyaları
  dışında birebir aynı (`diff -rq`). Kanıt dosyaları `baglama.diff` ile bağlandıktan sonra iki ağaç tümüyle aynı.
  Test ikilisi aynı adla (`lyraska_lib-64533dee089ff214`) yeniden yazıldı; yeni büyük ikili oluşmadı.
- Disk dolunca derleme bir kez "No space left" hatasıyla durdu. `/tmp/lyraska-test-*` altında, süreci artık
  yaşamayan testlerden kalmış 59 geçici klasör silindi. Bunlar üretim verisi değil, test artığı.
- Kanıt dosyaları `bagimsiz/hesap/DOG2/` altında:
  - `rts_kanit_release_1.txt`: denetçinin 9 testinin benim koşumum.
  - `denetim_dog2_player.rs` + `baglama_dog2.txt` ve çıktısı `dog2_player_release.txt`: benim 4 Rust testim.
  - `denetimDog2.test.tsx.txt` ve çıktısı `rts01_arayuz_vitest.txt`: arayüz yolu.

Denetçinin 9 kanıt testinin hepsi benim ağacımda da geçti (release). Değerler denetçininkine yakın:
`rts_kanit_release_1.txt`.

---

## RTS-01: Sarma ve açma üst üste gelince

**1. Yeniden üretim.** Denetçinin testi geçti:

```
RTS üst üste: sarma oturumu 7200 kare, açma oturumu 7200 kare aynı 20 ms'de çaldı; duraklatılmış mı: false / false
RTS eski hazırlık: stop=true faded_out=false (kısılma beklenmeden kesildi)
```

**Arayüz yolu, farklı bir yoldan sınandı** (`denetimDog2.test.tsx.txt`, vitest, arka uç taklit edildi, komutlar
yanıt vermeden bekletildi). `usePlayer.seek` yalnızca `seekInFlight`'a bakıyor, `openPath` ise yalnızca `busy`'ye.
`usePlayback.previous` şarkı 3 sn'yi geçmişse `seek(0)` çağırıyor, ekrandaki konumu hemen 0 yapıyor. Bu yüzden
ikinci basışta konum 0 görünüyor ve önceki şarkı açılıyor:

```
DOG2 seek_playback(0) gönderildi; süren: seek(0)
DOG2 open_track(A) gönderildi; süren: seek(0) open(A)
```

Kullanıcıya ulaşma yolu denetçinin yazdığından (sürükle-bırak, sonra "Sonraki") daha yaygın: **"Önceki"ye çift
basış**, yani "önceki şarkıya dön" alışkanlığı. Pencere sarmanın hazırlık süresi kadar: eski oturumun kısılması
(~110 ms) + dosya açma + ön dolum + WASAPI açılışı, yani ~150–300 ms. Bu, tipik bir çift tıklama aralığı.

**Çürütme denemesi 1: süre yapay mı?** Denetçinin testi iki `prepare`'in sonucunu elinde tutuyor ve `install`'dan
önce **20 ms uyuyor**. Gördüğü "aynı 20 ms'de 7200'er kare" ölçümü bu beklemeden geliyor. Komutlardaki gerçek sırayı
(`commands::seek_playback` / `open_track`: kilit → begin → kilitsiz prepare → kilit → install) iki iş
parçacığında, aradaki 0/1/3 ms gecikmeyle tekrarladım. Bir gözlemci her iki oturumun çıkış sayacını 100 µs'de bir
okudu (`dog2_rts01_komut_sirasiyla_iki_oturum`):

```
gecikme 1 ms: oturum sayısı 2, iki çıkışın birlikte ilerlediği süre 0.00 ms; sarma: stop=true faded_out=false | açma: stop=false …; sonunda çalan B mi: true
gecikme 3 ms: oturum sayısı 2, iki çıkışın birlikte ilerlediği süre 0.00 ms; …
```

Yani eskimiş oturum gerçekten açılıyor, aygıtı açıyor ve **kısılmadan kesiliyor** (`faded_out=false`). Ama
yaşadığı süre, `prepare`'in dönmesinden `install`'ın kilidi almasına kadar geçen süre. Sanal aygıtta bu 1 ms'lik
adımın altında kalıyor.

Gerçek WASAPI'de durum `wasapi.rs:374-433` ve `:378-380`'den çıkıyor. Çıkış iş parçacığı önce `ready` gönderiyor,
sonra 100 ms'lik arabelleği dolduruyor ve `start_stream` çağırıyor. `stop` bayrağına ise ancak bir sonraki olaydan
sonra (paylaşımlı modda ~10 ms) bakıyor ve `stop_stream` ile kesiyor. Oturum `Renderer`'da kazanç 0'dan 10 ms'de
açılarak başlıyor (`render.rs:105`, `FADE_SECONDS`). Duyulan sonuç şu: yeni şarkının üstünde, eski şarkının başa
sarılmış ilk **~10–20 ms'si** tam seviyeye çıkıp kesiliyor, **tık** duyuluyor. "İki şarkının bir süre üst üste
çalması" ise yalnızca asıl eski oturumun normal kısılma kuyruğu (~110 ms). O da zaten tasarımın parçası.

**Çürütme denemesi 2: "veya tersi".** Önce açma, sonra sarma sırasında `begin_seek` `self.session.as_ref()?` ile
`None` dönüyor, çünkü açma oturumu zaten almış. Bu sırada yarış yok (`dog2_rts01_ters_sira_yaris_yok`:
`begin_seek = false`). Arayüz bu sırada da iki komutu aynı anda gönderiyor (vitest 2. test), ama çekirdek sarmayı
yok sayıyor. Rapordaki "(veya tersi)" ifadesi sarma için geçersiz.

**Özel mod (Ş-1).** Açma geçişinde `old` boş, bu yüzden asıl eski oturum kısılma beklemesinde aygıtı **özel modda
tutarken** yeni şarkının `Session::start`'ı aygıtı açmaya çalışıyor. Bu sırada iki adım başarısız olur:

- `open_exclusive` → `AUDCLNT_E_DEVICE_IN_USE` → `AudioError::Exclusive` → `start(false)`.
- Paylaşımlı `Initialize` da Microsoft belgesine göre aygıt özel modda kullanılırken `AUDCLNT_E_DEVICE_IN_USE`
  döner → `AudioError::Output`.

Sonuçta istenen şarkı açılmaz, hata gösterilir, ses kesilir. Kod yolu bunu açıkça gösteriyor
(`player.rs:877-886`, `wasapi.rs:262-281`). Sanal aygıt aygıt sahipliğini modellemediği için bu adım **kanıtsız**
kalıyor. Gerçek aygıtta denenmeli.

**Hüküm: KISMEN.** Mekanizma, eskimiş oturumun kısılmadan kesilmesi ve arayüz yolu doğrulandı. "İki oturum aynı
anda çalar" ifadesinin süresi testin kendi beklemesinden geliyor. Gerçek etki kısa bir tık; özel modda olası açılış
hatası ise kanıtsız. **Önerilen önem: Orta.** Etki küçük ama tetikleyici olan çift "Önceki" basışı sık yapılan bir
hareket. Bit-perfect'te olası sonuç da (şarkı açılmaz) bunun üstüne ekleniyor. Önerilen düzeltme (geçiş kapısı /
`latest_seq`) yerinde. Ek öneri: arayüzde `seek` ile `openPath` aynı kuyruğu paylaşsın. Bu, çekirdek düzeltmesinden
bağımsız ve daha ucuz bir savunma.

## RTS-02: Durdurma, bitince çal, bit-perfect değişimi, aygıt değişimi ve kör test kilit altında

**Yeniden üretim.** Denetçinin testi:
`durdur 12.7 ms (sorgu 12.7 ms bekledi); aygıt değişimi 8.3 ms (sorgu 8.3 ms bekledi)`, açmada ise sorgu
0,00 ms bekledi.

**Farklı yol.** Denetçinin ölçmediği iki yolu ölçtüm (`dog2_rts02_…`):

```
DOG2 RTS-02: bit-perfect değişimi 9.2 ms (sorgu 9.4 ms bekledi); bitince çal 4.3 ms (sorgu 4.5 ms bekledi)
```

Kod da aynı şeyi gösteriyor: `stop` → `load` → `restart`, `play` (Ended/Error), `set_playback_options`,
`recover_device` (`status()`/`visual_now()` içinden), `abx_install` (`close_session` = ≤300 ms kısılma beklemesi

- `prepared.start()`), `abx_stop` → `restart`. Bunların hepsi çağıranın kilidiyle çalışıyor.

**Çürütme denemesi.**

- **Belge ile kod çelişkisi zayıf.** `restart`'ın belgesi (`player.rs:752-753`) "geçişin üç adımı art arda, aynı
  iş parçacığında" diyor, yani tasarım bunu kabul ediyor. SES-02 (`commands.rs:159-161`) ve DOGRULAMA B14 yalnızca
  "şarkı değiştirirken" ve sarmada görsellerin donmayacağını söylüyor; durdurma ya da aygıt değişimi için bir söz
  yok. `Transition` belgesindeki genel ifade ("oynatıcı yalnızca begin/install sırasında kilitlenir") yalnızca bu
  üç adımlı yolu anlatıyor. Sayısal bir belge–kod uyumsuzluğu bulunmadı.
- **Etki anı.** Gerçek aygıtta süre ~0,1–0,3 sn (kısılma ≤110 ms + açılış). Duraklama, ses de durduğu ya da
  yeniden başladığı anlarda oluyor: Durdur, bitmiş şarkıyı yeniden çal, ayar değişimi, kulaklık tak/çıkar, kör
  test. Yavaş diskte ön dolum en çok 3 sn sürebiliyor, bu en kötü durum.

**Hüküm: KISMEN.** Mekanizma doğru, ama belge uyumsuzluğu iddiası ve önem fazla. **Önerilen önem: Düşük.** Görsel
ve durum sorgusu kısa süre bekliyor, ses etkilenmiyor. RTS-01'in altyapısıyla birlikte düzeltilmesi uygun.

## RTS-03: Bit-perfect'te boşluksuz geçiş bit derinliğine bakmıyor

**Yeniden üretim.** Denetçinin testi:

```
RTS boşluksuz: çalan "rts-bp-24", ekranda bit_perfect=true bit_depth=Some(16)
RTS 24 bit örnek 0x12d65a aygıta 0x12d600 olarak gider
```

Kod: `open_next` (`player.rs:1817-1830`) yalnızca kanal sayısını ve hızı denetliyor. #79 denetimi
(`player.rs:318-334`) yalnızca `Session::start`'ta var. Çıkış biçimi oturum boyunca sabit: `wasapi.rs:410-413`
`int.encode` ile oturumun biçimini kullanıyor. Ekrandaki `SignalPath` da oturumdan geliyor ve güncellenmiyor.

**Farklı yol** (`dog2_rts03_24_bit_aygitta_32_bit_sarki_ve_hata_buyuklugu`). Senaryo: aygıt özel modda en çok
24 bit kabul ediyor (en yaygın USB DAC durumu), ilk şarkı 24 bit, sıradaki 32 bit tamsayı:

```
32 bit şarkı doğrudan: bit_perfect=false notice=Some("şarkı 32 bit, aygıt özel modda en çok 24 bit kabul ediyor; …")
boşluksuz geçişten sonra çalan 32 bit şarkı, ekranda bit_perfect=true bit_depth=Some(24)
24 bit sinyal 16 bit akışta: 43920/44100 örnek değişti (%99.59); en büyük hata -96.3 dBFS (titreşimsiz yuvarlama)
```

Denetçinin elle yaptığı kodlama hesabını, çözücünün gerçek çıktısı üzerinden ve bütün bir sinyal için
genelleştirdim. Bir yol daha var: ilk şarkı MP3/AAC ise `source_bits` `None` döner ve #79 denetimi atlanır;
ardından gelen 24 bit FLAC 16 bit aygıtta yine yuvarlanır.

**Çürütme denemesi.** Belgeler (MIMARI "Bit-perfect", ROADMAP, B12) bu durumu kabul edilmiş bir ödünleşim olarak
anmıyor. MIMARI yalnızca hızı farklı şarkının oturumu bitireceğini söylüyor. Test yapay değil: gerçek oynatıcı
akışıyla (`set_next` → boşluksuz geçiş) üretildi.

**Önem tartımı.** Ekranda "bit-perfect" yazarken bitler yuvarlanıyor. Vaat sessizce yanlışlanıyor ve #79'da
düzeltilen hatanın ikinci kapısı açık kalıyor; bu ciddi. Ama Kritik ya da Yüksek değil:

- Bit-perfect varsayılan olarak kapalı.
- Üç koşulun birlikte olması gerekiyor: aygıtın özel mod biçimi şarkıdan dar olmalı (16 bit yalnızca bazı
  HDMI ve ucuz USB aygıtlarında; 24 bit aygıt + 32 bit dosya nadir), çalma sırasında karışık bit derinliği
  olmalı ve hız aynı olmalı.
- Hata −96 dBFS'te (24/32 bitte −144 dBFS), dinlemede duyulmaz. Kalite düzenli olarak bozulmuyor; bozulan
  etiketin doğruluğu.

Ölçekteki "belirli koşullarda görülen hata, ölçülebilir kalite kaybı" tanımı Orta'ya uyuyor.

**Hüküm: DOĞRULANDI. Önerilen önem: Orta.** Düzeltme tek satır ve önceliği yüksek tutulmalı. Önerilen düzeltme
doğru.

## RTS-04: Kilitsiz ayar kanallarında yırtık okuma

**Yeniden üretim:**

```
RTS yırtık okuma: 200000 tasarım; A 19028, B 34496, karışık 146476 (karışıkken sürüm önce = sonra: 77380)
RTS en kötü: A tepe 0.00 dB, B tepe 0.00 dB; …, karışık 12887, karışığın 1 kHz kazancı en çok ±48.0 dB
```

Kod: `set_filters` alanları `Relaxed` yazıyor, sürümü sonra `Release` ile artırıyor. `design` alanları tasarım
boyunca, yani ~200 µs içinde, `Relaxed` okuyor. `begin_block` sürümü okumadan önce bir kez alıyor (`peq.rs:918-944`,
`:967-1016`, `:1107-1118`). Bulgu doğru.

**Çürütme denemesi.**

- **Stres testi gerçekçi değil.** Yazıcı boş döngüde saniyede milyonlarca kez yazıyor. Gerçekte yazma bir arayüz
  komutu: `useParametric` aynı anda tek istek gönderiyor, sürüklemede en çok ~60/sn. Bu durumda olasılık, bir
  yazmanın ~200 µs'lik tasarım penceresine düşme olasılığı: sürükleme adımı başına ~%1. Karışan iki ayar da ardışık
  sürükleme adımları olduğu için birbirine çok yakın.
- **±48 dB örneği yapay.** Birbirini tam götüren iki süzgecin yer değiştirmesi gerekiyor; gerçek kullanımda bu
  anda ikinci bir yazma olası değil.
- **Hata kendiliğinden düzeliyor.** Sürüm yazmanın sonunda arttığı için bir sonraki blokta yeniden tasarlanıyor.
- **Ödünleşim belgeli.** `EqControl` belgesi (`eq.rs:284-286`) yarım okumayı kabul ediyor. `PeqControl` ve
  `CrossfeedControl` için not yok.
- **Kötü durumda bile tavan var.** Taşma koruması karışımı görmese de −1 dBTP sınırlayıcı tavanı tutuyor.

**Hüküm: DOĞRULANDI. Önerilen önem: Düşük.** Denetçi de bu gerekçeyle Düşük vermiş. Seqlock ya da yazıcı
tarafında tasarım önerisi yerinde.

## RTS-05: `parametric_set` kilidi diske yazma boyunca tutuyor

**Yeniden üretim:**

```
RTS parametric_set: kilit ortalama 11.21 ms, en kötü 16.89 ms; parçalar: ses kanalı 0.780 ms, disk (sync_all) 9.832 ms, eğriler 1.404 ms
```

Kod doğrulandı. `apply_parametric` (`commands.rs:529-540`) `let mut player = player.lock()?` ile kilidi alıp
fonksiyon sonuna kadar tutuyor. Karşılaştırma için `equalizer_set` (`:310-320`) ve `crossfeed_set` (`:550-560`)
kilidi `store.update`'ten önce bırakıyor. `settings::save` `sync_all` + `rename` yapıyor (`settings.rs:150-166`).

**Çürütme denemesi.** Arayüz istekleri sıraya koyuyor (`useParametric.ts:86-104`, aynı anda tek istek). Yine de her
adımda `visual_frame` bir `sync_all` süresi bekliyor. Ses etkilenmiyor.

**Hüküm: DOĞRULANDI. Önem: Düşük.** Düzeltme iki satır.

## RTS-06: Çok kanallı şarkıda crossfeed atlanıyor, ışık yanıyor

**Yeniden üretim:** `RTS 5.1: crossfeed açık, sağ ön kanalın tepesi 0`.

Kod:

- `crossfeed.rs:330` → `stereo: channels == 2`; `:366-368` stereo değilse işlem yapmadan dönüyor.
- `PlayerScreen.tsx:97-103` `soundShaped` hesabında yalnızca `bitPerfect`'e bakıyor.
- `CrossfeedStrip`'in `bypassed` değeri yalnızca bit-perfect'ten geliyor (`EqualizerPanel.tsx:394`).

**Çürütme denemesi.** MIMARI.md:69 "Yalnız stereo" diyor, yani davranış belgelenmiş. Sorun yalnızca ekrandaki
gösterim. Çok kanallı müzik dosyası nadir.

**Hüküm: DOĞRULANDI. Önem: Düşük.**

## RTS-07: Süzgeç tasarımı ses iş parçacığında

**Yeniden üretim (release):**

- Parametrik takım ortalama 168–337 µs.
- Kulaklık takımı (tepe taraması dahil) 232–292 µs.
- Bellek ayırma 0.
- Uçtan uca blok süresi: medyan 499 µs, %99 1979 µs, en kötü 8675 µs.

En kötü değerler denetçininkinden de yüksek. Bu ortamda aynı anda başka ajanların derlemeleri koşuyordu, yani en
kötü değerler zamanlayıcı gürültüsü; medyan denetçininkiyle uyumlu.

**Çürütme denemesi.** CLAUDE.md'nin gerçek zamanlı kuralı ayırma, kilit, dosya ve paniği yasaklıyor; hesaplamayı
yasaklamıyor. Ölçülen tasarım süresi 10 ms'lik periyodun ~%2–3'ü ve yalnızca ayar değişiminden sonraki ilk blokta
oluyor. Gerçek bir takılma kanıtı yok; denetçi de "iyileştirme" diyor.

**Hüküm: DOĞRULANDI** (ölçüm doğru, nitelemesi doğru). **Önem: Düşük.**

## Şüpheler hakkında kısa not

- **Ş-1 (özel modda açılış hatası):** Kod yolu bu doğrulamada daha somut hale geldi (yukarıda, RTS-01). Gerçek
  aygıtta denenmesi öneriliyor. Deneme: bit-perfect açık, bir şarkının ortasında "Önceki"ye çift basmak.
  Beklenen hata: "Ses akışı başlatılamadı".
- **Ş-2, Ş-3, Ş-4** bu doğrulamanın kapsamı dışında kaldı ve sınanmadı.

## Sınırlar

- Gerçek WASAPI aygıtı yok. RTS-01'in gerçek aygıttaki süresi (~10–20 ms'lik parça) ve Ş-1, `wasapi.rs` kodundan
  ve WASAPI belgelerinden çıkarıldı, ölçülmedi.
- Zaman ölçümleri, eşzamanlı derlemelerin koştuğu paylaşımlı bir kapsayıcıda yapıldı.
