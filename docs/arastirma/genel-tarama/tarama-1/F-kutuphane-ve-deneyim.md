# F. Müzik çalarlar ve kullanıcı toplulukları: neyi övüyorlar, neye kızıyorlar

Tarama 1, 6 Kasım 2026. İşaretler: **[birincil]** kaynak bu oturumda okundu; **[özet]** arama özeti; **[kod]** Lyraska'nın
kodunda bakıldı; **[tahmin]** çıkarımım. Önceki çalışma `kutuphane-arastirma.md` (23 Ekim) kütüphane arayüzünü (gezinme,
sıralama, kapak, derleme sanatçıları, hız) ayrıntılı taradı; burada tekrar edilmez. Bu dosya **çalma ve ses**
deneyimine, rakiplerin 2025–2026'daki hamlelerine ve topluluk şikâyetlerine odaklanıyor.

**Erişim notu:** Reddit'in JSON arama arayüzü bu ortamdan otomatik istemciyi reddetti; tarayıcı kimliği taklit etmek
uygun olmadığı için denenmedi. Reddit, Hydrogenaudio, Roon ve Plex forumlarındaki bilgiler arama motoru özetlerinden
alındı ([özet]); forum yazıları mutsuz kullanıcıya doğru eğilimlidir.

## 0. Kısa sonuç

1. **Apple ve Spotify 2025'te "DJ gibi geçiş"i ana akıma taşıdı.** Apple Music **AutoMix** (iOS 26): zaman esnetme ve
   beat eşleştirmeyle bütün kütüphanede otomatik geçiş; Spotify **Mix** (Ağustos 2025, Premium, beta): çalma listesinde
   ses düzeyi/EQ/efektli geçişler, iki dalga biçimiyle elle ince ayar, "house, techno gibi elektronik türlerde en iyi"
   [özet: TechCrunch, MacRumors, 9to5Mac, 19–20 Ağustos 2025]. Lyraska'nın Faz 6 (Akıllı Geçiş) ve Faz 7 (Otomatik DJ)
   planları doğru yönde ve artık "olmazsa olmaz"a yaklaşıyor; Lyraska'nın farkı: çevrimdışı, kendi kütüphanen, ölçü/bölüm
   bilgili hizalama ve **geçişin görsel koreografisi**.
2. **Plexamp'ın dersi: geçişin iyi olması %80 yetmez.** "Sweet Fades" kare başına ses yüksekliği (saniyede 10 örnek)
   kullanıyor; kullanıcılar "zamanın ~%80'inde çalışıyor, çalışmayınca önceki şarkı birden kesiliyor" diyor [özet: Plex
   forumu]. Lyraska'nın "şüphede düz geçiş" kuralı (ROADMAP Faz 6) tam bunu önlüyor — korunmalı ve ölçülmeli.
3. **Ses yüksekliğinde albüm bağlamı isteniyor.** Plexamp'ın eşitlemesi "şarkıları tek tek en yükseğe çıkarmaz, albüm
   bağlamındaki göreli yüksekliği korur" [özet: Plex forumu]; ReplayGain/foobar2000 albüm kazancı. Lyraska'da albüm modu
   yok [kod] → D-3.
4. **En çok önerilen Windows çalar hâlâ foobar2000**, sonra MusicBee [özet: Reddit/Lemmy derlemeleri]. foobar2000 2.0
   kütüphaneyi SQLite'a taşıdı: "büyük kütüphanede çok daha hızlı açılış/kapanış, çok daha az bellek" [özet: değişiklik
   günlüğü]. Lyraska da SQLite kullanıyor — doğru seçim. Şikâyetler: 64 bit sürümde eski eklentilerin çalışmaması, eski
   arayüz bileşenlerinin yavaşlığı, bozulan yapılandırma dosyası [özet: Hydrogenaudio]. **Ders:** bozuk veritabanında
   programın açılması (Lyraska 0.0.35'te yaptı) ve göçlerin sıralı olması (`storage.rs`) kullanıcı için kritik.
5. **Ses meraklılarının istediği "doğrudan yol" (bit-perfect, Poweramp'ın DVC'si) bazen beklenmedik etki yapar.**
   Poweramp DVC Android'in EQ, efekt ve ses düzeyini atlayıp DAC'a doğrudan yazar; kullanıcılar "daha yüksek" ya da
   "bazı telefonlarda ses düzeyi uygulanmıyor" diyor [özet: Poweramp forumu]. Lyraska'nın bit-perfect modunda da Windows
   ses düzeyi devre dışı (`output.rs` belge yorumu [kod]); sahibinin "sesi kısık" bildirimi (ACIK-KONULAR, B6/B11) bu
   ailenin bir sorunu olabilir.

## 1. Rakip özellik tablosu (ses ve çalma odaklı)

| Program              | Övülen                                                                                                                                               | Şikâyet edilen                                                                                                      | Lyraska'da                                              | Kanıt                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| foobar2000 (Windows) | Hafif, modüler, ReplayGain, boşluksuz, WASAPI özel/ASIO eklentisi, SQLite kütüphane (2.0)                                                            | Öğrenmesi zor; 64 bit'te eski eklentiler; eski UI bileşenleri yavaş                                                 | Boşluksuz, R128, bit-perfect var; eklenti yok (bilerek) | [özet]                                         |
| MusicBee (Windows)   | Kütüphane düzeni, etiketleme, CD kopyalama, otomatik DJ, temalar                                                                                     | Yalnız Windows; geliştirici tek kişi [bilgim]                                                                       | Kütüphane sayfaları var; etiket düzenleme yok           | [özet]                                         |
| Roon                 | DSP ("amazing", çok kanallı), dergi gibi sanatçı/albüm sayfaları                                                                                     | Roon Radio'ya geri bildirim verilemiyor, küçük kütüphanede zayıf öneri; abonelik; çok kanallı ayrımda DSP sınırları | DSP (PEQ, crossfeed, R128) var; "radyo" Faz 7           | [özet: Roon forumu, StereoNet, archimago 2025] |
| Plexamp              | Sonic Analysis ile sanatçı/albüm/şarkı radyosu ("müzik kullanımımı dönüştürdü"), Sweet Fades, dalga biçimli ilerleme çubuğu, albüm bağlamlı eşitleme | Sweet Fades ~%80 çalışıyor; TIDAL ile tutarsız yükseklik                                                            | Şarkı haritası şeridi var; geçiş Faz 6                  | [özet: Plex forumu]                            |
| Apple Music          | AutoMix (iOS 26), Sing (vokali kısma), zaman eşlemeli sözler                                                                                         | (Windows uygulaması bu taramada incelenmedi)                                                                        | Sözler hizalanıyor; vokal kısma yok                     | [özet]                                         |
| Spotify              | Mix (2025), Canvas, DJ                                                                                                                               | çevrimiçi, yerel dosya desteği zayıf [bilgim]                                                                       | —                                                       | [özet]                                         |
| Poweramp (Android)   | DVC, 32 bantlı + parametrik EQ, sınırlayıcı                                                                                                          | arayüz düzeni; DVC bazı aygıtlarda hatalı                                                                           | PEQ + 10 bant var                                       | [özet]                                         |
| Strawberry           | Clementine çatalı, koleksiyoncular için                                                                                                              | Windows ikilisi artık ücretli [özet; doğrulanmadı]                                                                  | —                                                       | [özet]                                         |
| fooyin               | foobar2000 benzeri, tamamen açık kaynak                                                                                                              | "oldukça hatalı"                                                                                                    | —                                                       | [özet]                                         |

## 2. Lyraska için çıkarımlar

- **Geçiş (Faz 6) için hedef ölçüt Plexamp'tan öğrenilmeli:** "kötü geçiş oranı" (ani kesme, ritim çakışması) ayrı ölçülür;
  hedef: sentetik kütüphanede %0 ani kesme, sahibinin dinleme denemesinde "kötü" ≤ %5. "Elle seçmiş gibi" oranı (ROADMAP Faz
  7 hedefi) ikinci ölçüt.
- **Apple AutoMix'in zaman esnetmesi:** Lyraska'nın planındaki Signalsmith Stretch (MIT) bunun karşılığı. Kalite ölçümü
  için: perde sapması (sent), geçici seslerin yayılması (transient smearing) — esnetilmiş ve özgün davul başlangıçları
  arasındaki F1 [tahmin].
- **"Vokali kıs" (Apple Music Sing benzeri):** ayrıştırma (B dosyası) gelirse küçük bir ek; ama ayrılmış sesi **çalmak**
  ROADMAP'in "ayrılmış ses asla saklanmaz" kuralıyla çelişmez (gerçek zamanlı, saklanmadan) mi — sahibine sorulacak bir
  ürün kararı. CPU'da gerçek zamanlı RoFormer olmaz; Spleeter 2 kanal belki [tahmin].
- **Kişisel kullanım kararıyla "istatistik" serbest:** çalma sayısı, son çalınma, atlama sayısı yerel ve telemetrisiz
  tutulabilir; Otomatik DJ'in (Faz 7) en güçlü sinyali "bu şarkıyı hep atlıyorum" olur (Roon Radio'ya yöneltilen "geri
  bildirim veremiyorum" şikâyetinin cevabı). Öneri F-1: kütüphanede çalma/atlama sayacı (yeni göç), ölçüt: Faz 7'de
  atlanan şarkının sıradakine seçilme oranı.
- **Etiket düzenleme:** foobar2000/MusicBee kullanıcılarının temel beklentisi; Lyraska müzik dosyasına dokunmama ilkesiyle
  (kapak ve sözlerde olduğu gibi) "Lyraska'nın kendi etiket katmanı" yapabilir. Düşük öncelik.

## 3. Çok dilli not

Japonca karşılaştırma yazıları foobar2000'i "yüksek işlevli ama karmaşık", MusicBee'yi "kütüphane yönetiminde iyi" diye
özetliyor ve **"yazılım seçiminden çok dahili DAC'ın kalitesi ve kulaklık çıkışının gürültü tabanı belirleyici"** uyarısını
tekrarlıyor [özet: Japonca derleme sayfaları]. Bu, Lyraska'nın "profesyonel ses" iddiasını ölçülebilir kılmak için iyi bir
hatırlatma: yazılımın katkısı (EQ, kulaklık düzeltmesi, eşitleme) ölçülür; "bit-perfect daha güzel ses" iddiası ABX ile
sınanır, varsayılmaz.
