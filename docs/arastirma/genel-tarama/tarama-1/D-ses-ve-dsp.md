# D. Ses ve DSP: EQ, hedef eğri, ses yüksekliği, crossfeed/binaural, sınırlayıcı, WASAPI, dither, ABX

Tarama 1, 6 Kasım 2026. İşaretler: **[birincil]** kaynak bu oturumda okundu; **[özet]** yalnızca arama özeti;
**[kod]** Lyraska'nın kendi kaynak kodunda bu oturumda bakıldı; **[tahmin]** benim çıkarımım. Lyraska'nın ses yolu iki
denetimden geçmiş (`DENETIM.md`, `DENETIM-2.md`, `test-kalitesi/`); burada matematiği tekrar denetlemiyorum, **dünyadaki
uygulamayla karşılaştırıp eksik yerleri** arıyorum.

## 0. Kısa sonuç

1. **Windows'un ses "iyileştirmeleri" paylaşımlı modda Lyraska'nın sesini değiştirebilir; Lyraska bunu kapatmayı
   istemiyor.** Microsoft'un sürücü belgesi: "Raw mode specifies that there should not be any signal processing applied
   to the stream. An application can request a raw stream that is completely untouched"; sürücüler en az Raw ya da
   Default modunu desteklemeli; `SetClientProperties` etkinleştirmeden sonra, `Initialize`'dan önce çağrılır [birincil:
   learn.microsoft.com "Audio signal processing modes"]. Lyraska'nın `output/wasapi.rs`'inde `SetClientProperties`,
   `AUDCLNT_STREAMOPTIONS_RAW` ya da akış kategorisi (`AudioCategory_Media`) yok [kod]. Sahibinin "müzikler garip
   geliyor" bildirimi (#25) ve ekran kaydındaki "Windows iyileştirmesiyle bozuk ses" (BILGI §5) bununla ilgili olabilir.
   Mozilla'nın cubeb'i (Firefox ses katmanı) "mümkünse RAW iste, olmazsa sessizce devam et" yolunu izliyor [özet: cubeb
   commit]. **Öneri D-1, en yüksek öncelik, küçük iş.**
2. **Bit-perfect modda 16 bite indirgemede dither yok.** Özel mod aygıtın en yüksek tamsayı biçimini seçiyor (32 → 24 → 16) ve `encode` yuvarlıyor [kod: `audio/output.rs`]. Şarkı 24 bit, aygıt yalnızca 16 bit ise ya da şarkı kayıplı
   (MP3/AAC çözümü kayan noktadır) ve aygıt 16 bit ise, sonuç **titreşimsiz (dither'sız) yuvarlama**: sessiz kısımlarda
   bozulma tabanı (harmonik bozulma) olur. TPDF dither (üçgen olasılık dağılımlı ±1 LSB gürültü) standart çözüm
   (Lipshitz, Wannamaker, Vanderkooy, JAES 1992 [bilgim]). Paylaşımlı yol 32-bit kayan nokta, orada sorun yok.
3. **Ses yüksekliği eşitlemede "albüm modu" yok** [kod: `normalize.rs`, `normalization.rs`'te albüm geçmiyor]. AES TD1008
   (2021) müzikte parça normalleştirmeyi −16 LUFS, albüm normalleştirmede albümün en yüksek parçasını −14 LUFS önerir;
   albüm modu albümün iç dinamiğini (sakin parça sakin kalır) korur [özet: Production Advice/Ian Shepherd, Telos; AES
   belgesi okunmadı]. Lyraska her parçayı −14'e getiriyor; konsept albümde sessiz ara parçayı yükseltir. Hydrogenaudio
   topluluğunun en eski ReplayGain tartışması da bu (parça/albüm kazancı) [bilgim].
4. **Hazır kulaklık listesi (AutoEq) için lisans engeli hâlâ çözülmedi ama gerek de yok.** AutoEq deposu MIT ("Copyright
   (c) 2018-2022 Jaakko Pasanen") ama ölçümler oratory1990, crinacle, Innerfidelity, Rtings kaynaklı [birincil: AutoEq
   README, LICENSE]; ölçüm sahiplerinin ayrı izni yazılı değil (butterchurn-presets dersi, BILGI §6). Yeni karar veri
   setleri için NC'yi serbest bırakıyor, ama "lisansı yazılmamış" kuralı sürüyor. Çözüm zaten programda: sahibi kendi
   kulaklığının `ParametricEQ.txt`'sini içe aktarır (0.0.13). Liste gömmek gereksiz.
5. **Harman hedefi bilimsel olarak sağlam, ama tek doğru değil.** 2013 çalışması: odada ölçülen hoparlör tepkisinden
   türeyen hedef en çok tercih edilen [özet: AES 2013]; kulak içi (IE) için hedef sapmasının büyüklüğü, standart sapması
   ve eğiminden tercih tahmin eden doğrusal model r = 0,91 [özet: Olive, Welti, Khonsaripour, AES 143, 2017]; 130
   dinleyicili sanal kulaklık testleri [özet]. Lyraska'nın kendi hedef eğrisi yok (AutoEq dosyaları zaten bir hedefe göre
   üretilmiş); bu doğru. Ekleme değeri: "bas eğimi" tercihi kişiden kişiye en çok değişen yer (Harman'ın kendi
   bulgusu [özet]) → Lyraska'nın "Bas" düğmesi bu işi görüyor.

## 1. WASAPI ve Windows ses yolu tuzakları

| Tuzak                                                                                                            | Lyraska'da durum                                      | Öneri                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sistem iyileştirmeleri (APO: ses yüksekliği eşitleme, sanal surround, "bas artırma") paylaşımlı akışı değiştirir | RAW istenmiyor [kod]                                  | **D-1**: `IAudioClient2/3::SetClientProperties` ile `AUDCLNT_STREAMOPTIONS_RAW` + `AudioCategory_Media`; desteklenmezse sessizce eski yol; sinyal yolu göstergesine "Windows işlemesi: kapalı/açık" satırı. Windows 8.1+ [özet]                     |
| Hangi efektlerin uygulandığı bilinmiyor                                                                          | göstergede yok                                        | Microsoft belgesi uygulamanın "hangi efektler uygulanıyor" diye sorabileceğini ve değişince haber alabileceğini yazıyor [birincil] → göstergeye eklenir                                                                                             |
| Özel modda dönem hizası (`AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED`), olay gelmeyen sürücüler                           | "ilk olay" sınaması var (`first_event_arrives`) [kod] | korunur; DOGRULAMA B6/B11 sahibinin denemesi bekliyor                                                                                                                                                                                               |
| 24 bitin 32 bitlik kapta gönderilmesi (`wValidBitsPerSample`)                                                    | `IntFormat::new(32,24)` desteği var [kod]             | korunur                                                                                                                                                                                                                                             |
| 16 bit aygıtta dither'sız yuvarlama                                                                              | dither yok [kod]                                      | **D-2**: yalnızca biçim indirgenirken (kaynak > hedef bit) TPDF; şarkının tamsayıları hedefe sığıyorsa dither yok (bit-perfect bozulmaz). Ölçüm: −90 dBFS 1 kHz sinüste harmonik bozulma; hedef: dither'lı çıkışta harmonik yok, gürültü tabanı düz |
| Bluetooth gecikmesi 100–300 ms                                                                                   | elle ve tıklama kaydıyla ayar var                     | korunur                                                                                                                                                                                                                                             |
| Gerçek zamanlı iş parçacığı önceliği (MMCSS)                                                                     | eklendi (0.0.52) [ROADMAP]                            | korunur                                                                                                                                                                                                                                             |

## 2. Ses yüksekliği (EBU R128 / BS.1770)

- Lyraska: BS.1770-5 kanal ağırlıkları, EBU Tech 3341 uyum sinyalleri, gerçek tepe 8× [kod/denetimler]. Dünyadaki iyi
  uygulamayla aynı ya da önünde (ffmpeg arka kanalları farklı tartıyor, BILGI §5).
- **Eksik: albüm modu** (§0.3). **D-3**: kütüphanede albüm (aynı albüm etiketi + albüm sanatçısı + klasör) biliniyor; albüm
  kazancı = albümün bütünleşik ses yüksekliğine göre tek kazanç, tavan yine −1 dBTP. Ayar: "Parça / Albüm / Otomatik"
  (otomatik: albüm sırasıyla çalarken albüm, karışık sırada parça — foobar2000 ve Roon'un yaptığı gibi [bilgim]).
  Ölçüm: sentetik 3 parçalı albüm (−8, −14, −20 LUFS): albüm modunda farklar ±0,1 LU korunur.
- Hedef değer tartışması: −14 (Spotify/YouTube fiilî), −16 (AES TD1008 müzik), −18 (ReplayGain 2.0 referansı) [özet].
  Lyraska −14'ü seçmiş ve "bas hissedilsin" kararına uygun (daha çok boşluk = daha az kısma). Değiştirmeye gerek yok.

## 3. Crossfeed, binaural, HRTF/BRIR

- Lyraska'nın crossfeed'i (orta/yan biçimi, orta bit bit aynı, |G| ≤ 1) klasik tasarımların (Bauer 1961, Linkwitz, Meier,
  bs2b) bilinen ton rengi kusurunu matematiksel olarak gideriyor [kod]. Literatürde buna benzeyen "M/S crossfeed"
  yaklaşımları var, ama |G| ≤ 1 kanıtlı tasarım görmedim [tahmin].
- **Sonraki adım "sanal hoparlör" (HRTF + oda yansıması).** Lisans durumu [birincil: Zenodo API]: **SADIE II Apache-2.0**
  (KEMAR, Neumann KU100 ve 18 kişi; York Üniversitesi); Hearpiece veritabanı CC BY-SA 4.0; HUTUBS CC BY (96 kişi) [özet];
  CIPIC "public domain" [özet]; ARI belirsiz. Okuyucu kütüphane libmysofa BSD [bilgim]; SOFA dosyası Rust'ta da okunabilir
  (HDF5 → bağımlılık ağır; önceden JSON'a çevirip gömmek daha temiz) [tahmin].
- **Uyarı:** kişiselleştirilmemiş HRTF'de ön–arka karışması ve "kafanın içinde" sorunu kalır; araştırmalar kişisel
  HRTF'nin yerleştirmeyi belirgin iyileştirdiğini söyler [bilgim]. Bu yüzden önerim düşük öncelik: önce sahibinin ABX'te
  "crossfeed Güçlü" ile "KU100 sanal hoparlör"ü tercih testiyle karşılaştırması (ABX aracı zaten var; tercih testi için
  "A/B kör tercih" kipi eklenir).

## 4. Sınırlayıcı, yeniden örnekleme, bas

- **Sınırlayıcı:** 8× ara değerli gerçek tepe, −1 dBTP; bilinen sınır 0,45 fs üstü [kod]. BS.1770'in gerçek tepe ölçeri 48
  kHz'te 4× önerir; Lyraska daha sıkı. Değişiklik önermiyorum.
- **Yeniden örnekleme:** rubato FFT (Blackman-Harris) Nyquist üstünü ≥ 140 dB bastırıyor (ölçülen −195 dB) [ROADMAP]. SoX
  "VHQ" ve r8brain düzeyinde; Infinite Wave karşılaştırmaları bu düzeyde "kusursuz" sınıfı ayırır [bilgim; site bu
  oturumda okunmadı]. Değişiklik önermiyorum.
- **Psikoakustik bas:** Chebyshev harmonikleri (doğrusal olmayan aygıt, NLD) + alt oktav. Literatürde NLD'nin geçici
  (vuruş) seslerde, faz vokoderinin sürekli seslerde daha iyi olduğu ve ikisini birleştiren "karma sanal bas" yöntemi var
  (Hill & Hawksford, AES 2010; Mu & Gan [bilgim; doğrulanmadı]). Lyraska şarkıyı önceden analiz ettiği için hangi anın
  vuruş, hangisinin sürekli bas olduğunu **önceden bilir**: karma yöntemin karar adımı bedava [tahmin]. Düşük öncelik;
  ölçüm sahibinin dizüstü hoparlöründe ABX tercih testi.

## 5. ABX ve dinleme testi yöntemi

- Standartlar: ITU-R BS.1116-3 (küçük bozulmalar, çift kör üçlü uyarıcı gizli referans), ITU-R BS.1534-3 MUSHRA (orta
  bozulmalar) [bilgim; itu.int belgeleri bu oturumda indirilmedi].
- **İstatistik tuzağı (Leventhal, JAES 1986):** az denemeli ABX'te "fark duyulmuyor" sonucu çoğu zaman yalnızca testin
  gücünün düşük olmasıdır (II. tür hata). 16 denemede p < 0,05 için ≥ 12 doğru gerekir; gerçek isabet olasılığı 0,7 olan
  bir dinleyici bunu yalnızca **%45** olasılıkla geçer; 20 denemede (≥ 15 doğru) %42, 32'de (≥ 22) %64, 50'de (≥ 32) %86
  [hesap: binom, bu oturumda Python ile; α ≤ 0,05 tek yönlü].
  **D-4:** ABX sonucunda "fark yok" yerine "bu testle fark kanıtlanamadı; p = 0,7'lik bir fark varsa bu deneme sayısında
  yakalama şansı %…" yazmak; deneme sayısını başta seçtirmek (20, 32, 50). Ara sonuca bakmamak (Lyraska zaten sonucu sonda
  veriyor — doğru).
- Ses yüksekliği eşitleme ≤ 0,1 dB (Lyraska örnek hizalı ve eşitli) — iyi uygulamayla aynı.

## 6. Önerilerin özeti

| #   | İş                                             | Modül                                                      | Ölçüm / başarı ölçütü                                                                                                                                               | Öncelik |
| --- | ---------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| D-1 | WASAPI RAW + Media kategorisi, gösterge satırı | `audio/output/wasapi.rs` (tek `unsafe` kuralı içinde)      | Sahibinin bilgisayarında "Ses iyileştirmeleri açık" iken, Lyraska çıkışının loopback kaydı ile girişin farkı ≤ −100 dB (bugün: ölçülmeli); #25'in yeniden denenmesi | Yüksek  |
| D-2 | Biçim indirgemede TPDF dither                  | `audio/output.rs`                                          | −90 dBFS sinüste harmonikler gürültü tabanının altında; şarkı tamsayısı sığıyorsa bit bit aynılık testi değişmez                                                    | Orta    |
| D-3 | Albüm modu ses yüksekliği                      | `audio/normalize.rs`, `player/normalization.rs`, kütüphane | 3 parçalı sentetik albümde iç farklar ±0,1 LU                                                                                                                       | Orta    |
| D-4 | ABX güç bilgisi ve deneme sayısı seçimi        | `audio/abx.rs`, `AbxPanel`                                 | Binom gücü hesabı birim testli                                                                                                                                      | Düşük   |
| D-5 | Sanal hoparlör (SADIE II KU100) deneyi         | yeni `audio/binaural.rs`                                   | Sahibinin kör tercih testi                                                                                                                                          | Düşük   |
