# Doğrulama listesi (gerçek cihazda)

Bu liste, **proje sahibinin bilgisayarında henüz denenmemiş** her özelliği içerir. Otomatik testler bunları
sanal ses aygıtıyla ve ekran kartsız tarayıcıyla sınıyor; gerçek kulaklık, hoparlör, ekran kartı ve gerçek
şarkılarla nasıl davrandığını yalnızca siz görebilirsiniz.

**Doğrulama haftası:** bu listedeki sonuçlar bildirilene kadar yeni özellik eklenmez; yalnızca bulunan hatalar
düzeltilir.

## Nasıl kullanılır

1. Test sürümünü kurun: https://github.com/lahmacunveayran/Lyraska/releases/download/test-surumu/Lyraska-Kurulum.exe
   Windows "bilinmeyen yayımcı" derse **Ek bilgi → Yine de çalıştır**.
2. **Ayarlar** (sağ üstteki dişli) → **Program** bölümünde sürüm **0.0.46 ya da sonrası** yazmalı.
3. Maddeleri sırayla deneyin. Her madde için bana yalnızca şunu yazmanız yeterli:
   - madde numarası ve **✅ oldu** ya da **❌ olmadı**,
   - olmadıysa ne gördüğünüzü bir cümleyle (ekran görüntüsü varsa çok iyi).
4. Bir şey ters giderse **Ayarlar → Hata günlüğü** düğmesine basın; açılan klasördeki `lyraska.log` dosyasını
   gönderin. Şarkıların kendisini içermez; ama program olaylarının yanında şarkı dosyalarının adı ve klasör yolu
   (Windows kullanıcı adınız dahil) geçebilir. İsterseniz göndermeden önce Not Defteri ile açıp bakın.

Hepsini bir günde yapmanız gerekmez. En önemlileri **kalın** yazılı: önce onları deneyin.

---

## A. Kütüphane

**A0. Eski kütüphane yedeğiniz açılıyor (#49, 0.0.35)**

- Nasıl:
  1. Lyraska'yı kapatın.
  2. Dosya Gezgini'nin adres çubuğuna `%LOCALAPPDATA%\io.github.gozlemesevdalisi.lyraska` yazıp Enter'a basın
     (0.0.51'den beri kütüphane bu "yerel" klasörde durur).
  3. Şimdiki `library.sqlite3` dosyasının adını `library.sqlite3.yeni` yapın. Yanında `library.sqlite3-wal` ya da
     `library.sqlite3-shm` varsa onların da sonuna `.yeni` ekleyin (bunlar şimdiki kütüphanenin parçalarıdır; eski
     dosyayla karışmamalı).
  4. Yedeğiniz `library.sqlite3.bak` dosyasını bu klasöre taşıyın ve adını `library.sqlite3` yapın. Yedek eski
     sürümlerde `%APPDATA%\io.github.gozlemesevdalisi.lyraska` klasöründe durur (adres çubuğuna yazıp açabilirsiniz).
  5. Lyraska'yı açın.
- Neye bakılır:
  - "Kütüphane açılamadı" uyarısı çıkmaz.
  - **Kütüphane** panelinde eski klasörleriniz ve şarkılarınız görünür.
  - Şarkılar arka planda analiz edilir: BPM sütunu yavaş yavaş dolar.
- Bilmeniz gereken: yedeği aldıktan sonra yeni kütüphaneye eklediğiniz klasörler yedekte yok; onları yeniden
  eklersiniz.
- Olmadıysa: ekrandaki uyarının "Neden:" satırını ve hata günlüğünü gönderin. Geri dönmek için Lyraska'yı kapatıp
  `.yeni` dosyalarının adını eski haline getirin.

**A1. Eski kütüphane yeniden analiz edilmiyor (0.0.34–0.0.36)**

- Nasıl: Yeni sürümü kurduktan sonra programı açın, **Kütüphane** panelinin altındaki "Şarkı haritası: X / Y şarkı
  analiz edildi" satırına bakın. 10 dakika sonra bir daha bakın.
- Neye bakılır:
  - Sayı bir süre düşebilir (drop güveni için şarkı haritaları yenileniyor), ama **dakikalar içinde** yeniden
    dolmalı. Şarkı başına milisaniyeler sürüyor; büyük kütüphanede en fazla 1–2 saat.
  - Bu sırada bilgisayar yavaşlamamalı, müzik takılmamalı.
  - BPM sütunu dolu kalmalı ya da kısa sürede yeniden dolmalı.
- Olmadıysa: kaç şarkınız olduğunu ve sayının ne kadar sürede dolduğunu yazın.

**A2. Pencereye sürükle-bırak (#29)**

- Nasıl: Dosya Gezgini'nden bir MP3, bir FLAC ve bir M4A şarkıyı Lyraska penceresine sürükleyin.
- Neye bakılır: sürüklerken pencerenin kenarında turuncu kesikli çerçeve ve "Bırakın: …" yazısı; bırakınca şarkılar
  kütüphaneye eklenir ve ilki çalar; altta kısa bir bildirim çıkar.
- Ayrıca: bir klasörü bırakın (kütüphaneye eklenir, taranır); bir `.txt` ya da `.wma` bırakın (anlaşılır bir "bu tür
  desteklenmiyor" mesajı).
- Olmadıysa: hata günlüğünü gönderin; içinde "Pencereye … öğe bırakıldı" satırı olup olmadığı nedeni gösterir.
- 0.0.62'de arayüzün izinleri daraltıldı (yalnızca olay dinleme ve dosya seçme penceresi): bu deneme 0.0.62 ile
  yeniden yapılmalı. Ekolayzer ve şarkı haritasını "Dosyaya kaydet" de denensin (kaydetme penceresini artık çekirdek
  açıyor).

**A3. Tek şarkı eklemek hızlı (0.0.33)**

- Nasıl: **Kütüphane → Şarkı ekle** ile kütüphanede olmayan bir şarkı seçin.
- Neye bakılır: şarkı birkaç saniye içinde listede görünür. Bütün kütüphanenin yeniden taranmasını beklemezsiniz
  ("Taranıyor…" yazısı kısa sürer).

**A4. Eski tip etiketli MP3'lerde Türkçe adlar (#27, 0.0.33)**

- Nasıl: Eskiden listede **dosya adıyla** ya da **bozuk harflerle** (Þ, Ý, Ð, ý, þ) görünen MP3'leriniz varsa
  programı açın. Açılıştaki taramada bu şarkıların etiketleri kendiliğinden bir kez yeniden okunur. Gerekirse
  **Kütüphane** panelinde "Şarkı ekle"nin yanındaki **dönen oklar** düğmesine (Kütüphaneyi yeniden tara) basın.
- Neye bakılır: tarama bitince şarkı adı, sanatçı ve albüm doğru Türkçe harflerle (Ş, İ, Ğ, ı, ş, ğ) görünür.

**A5. Üst klasör eklemek analizleri silmiyor (0.0.33)**

- Nasıl: Kütüphanede alt klasör varken (ör. `D:\Müzik\Pop`) üst klasörü (`D:\Müzik`) ekleyin.
- Neye bakılır: Pop'taki şarkıların BPM'leri kaybolmaz; "analiz edildi" sayısı düşmez.

**A6. Türkçe arama**

- Nasıl: Arama kutusuna Türkçe harfsiz yazın (ör. "gulumse", "sarki").
- Neye bakılır: "Gülümse", "Şarkı" gibi adlar bulunur.

**A7. Açılamayan dosya sürüklenince dürüst mesaj (0.0.64)**

- Hazırlık (açılamayan bir dosya): Masaüstünde sağ tık → Yeni → Metin Belgesi; içine birkaç kelime yazıp kaydedin
  ve adını `bozuk.mp3` yapın (Windows "uzantı değişsin mi" diye sorarsa **Evet**). Dosya uzantıları
  görünmüyorsa: Dosya Gezgini → Görünüm → Göster → **Dosya adı uzantıları**.
- Nasıl: `bozuk.mp3`'ü ve gerçek bir MP3'ü birlikte seçip Lyraska penceresine sürükleyin.
- Neye bakılır:
  - Gerçek MP3 kütüphaneye eklenir ve çalar.
  - `bozuk.mp3` için "Bu dosya biçimi desteklenmiyor ya da dosya bozuk ..." gibi, nedenini söyleyen bir uyarı çıkar;
    **"eklendi" denmez** ve Kütüphane panelinde o dosya için boş bir kutucuk oluşmaz.
  - (0.0.64'te `.webm` ve `.opus` da açılamıyordu; 0.0.65'ten beri açılır, bkz. A12.)
- Olmadıysa: ekrandaki mesajı ve hata günlüğünü gönderin.

**A8. Açılamayan dosya, çalan müziği susturmuyor (0.0.64)**

- Nasıl: Bir şarkı çalarken **Dosya aç** ile A7'deki `bozuk.mp3`'ü açmayı deneyin.
- Neye bakılır: hata mesajı görünür ama çalan şarkı **kesilmeden** çalmaya devam eder.

**A9. Klasördeki şarkılar bir anda kaybolursa kütüphane silinmiyor (KUT-01, 0.0.64)**

- Nasıl:
  1. Bir deneme klasörüne en az 5 şarkı koyup Lyraska'ya ekleyin; analizlerin bitmesini bekleyin.
  2. Lyraska'yı kapatın. Klasörün içindeki **bütün şarkıları** başka bir yere (ör. Masaüstü) taşıyın; klasör boş kalsın.
  3. Lyraska'yı açın.
- Neye bakılır: şarkılar **kütüphaneden silinmez**; panelde "kütüphanedeki X şarkı bulunamadı (disk takılı
  değil, ağ paylaşımı bağlı değil ya da klasör taşınmış olabilir); şarkılar kütüphaneden çıkarılmadı." uyarısı görünür.
- Sonra: şarkıları klasöre geri koyup **Yeniden tara**'ya basın; uyarı kaybolur ve analizler yerindedir.

**A10. Çok sayıda kutucuk listeyi ekrandan itmiyor (0.0.64)**

- Nasıl: **Şarkı ekle** ile bir seferde 30'dan fazla şarkı seçin (ya da 30'dan fazla şarkıyı pencereye sürükleyin).
- Neye bakılır: Kütüphane panelindeki kutucuk alanı belli bir yüksekliği aşınca kendi içinde kayar; şarkı listesi
  ekrandan kaybolmaz.

**A11. Bozuk kütüphane dosyası kenara alınıyor (KUT-02, 0.0.64; isteğe bağlı)**

- Nasıl:
  1. Lyraska'yı kapatın.
  2. Dosya Gezgini'nin adres çubuğuna `%LOCALAPPDATA%\io.github.gozlemesevdalisi.lyraska` yazıp Enter'a basın.
  3. **Önce yedek alın:** `library.sqlite3` dosyasını başka bir klasöre kopyalayın.
  4. Orijinal `library.sqlite3` dosyasını Not Defteri ile açıp içeriğini silin, "deneme" yazıp kaydedin.
  5. Lyraska'yı açın.
- Neye bakılır: program açılır, kütüphane boştur; aynı klasörde `library.sqlite3.bozuk-...` adlı bir dosya
  oluşmuştur (bozuk dosya silinmeden saklanmıştır).
- Geri dönmek için: Lyraska'yı kapatın, yeni `library.sqlite3` dosyasını silin, kopyaladığınız yedeği yerine koyun.

**A12. `.opus` ve `.webm` şarkılar çalıyor (0.0.65)**

- Nasıl: YouTube'dan indirdiğiniz (ör. yt-dlp ile) bir `.webm` ya da `.opus` dosyasını pencereye sürükleyin; bir
  tane de **Dosya aç** ile açın. Şarkının ortasına tıklayıp sarın.
- Neye bakılır: şarkı çalar, süresi görünür, sarınca tıkladığınız yerden devam eder; birkaç saniye içinde BPM ve
  şarkı haritası gelir. `.webm`'de şarkı adı yerine dosya adı görünebilir (bilinen sınır); sanatçı ve albüm
  etiketleri varsa görünür.
- Olmadıysa: dosyanın adını, ekrandaki mesajı ve hata günlüğünü gönderin.

**A13. Klasöre sonradan eklenen şarkı kendiliğinden görünüyor (0.0.72)**

- Nasıl: Lyraska açıkken, kütüphanedeki bir klasöre (ör. `D:\DLP`) yt-dlp ile bir şarkı indirin ya da Dosya
  Gezgini'nden bir şarkı kopyalayın. Sonra o klasörden bir şarkıyı silin (Geri Dönüşüm Kutusu'na atmak yeter).
- Neye bakılır: **Yeniden tara**'ya basmadan ve programı kapatıp açmadan, yeni şarkı birkaç saniye içinde listede
  görünür; silinen şarkı birkaç saniye içinde listeden kalkar.
- Olmadıysa: klasörün yerini (yerel disk mi, USB mi, ağ sürücüsü mü) ve hata günlüğünü gönderin.

## B. Çalma ve ses

**B1. Ses kalitesi (#25)**

- Nasıl: İyi bildiğiniz birkaç şarkıyı (MP3 ve FLAC) kulaklıkla dinleyin. **Ayarlar → Sesin yolu** satırına bakın.
- Neye bakılır: ses doğal; cızırtı, boğukluk, hız/ton farkı, kesilme yok. Gariplik varsa türünü ve "Sesin yolu"
  satırında yazanı bildirin.

**B2. Ses yüksekliği eşitleme (0.0.28; geçiş #55, 0.0.38)**

- Nasıl: Çok yüksek kaydedilmiş bir şarkı (yeni bir pop) ile sessiz kaydedilmiş bir şarkıyı (eski bir kayıt)
  kütüphaneden **sırayla** çalın: önce sessiz olan, sonra yüksek olan. **Ayarlar → Ses yüksekliği eşitleme**'yi
  kapatıp açarak karşılaştırın.
- Neye bakılır: açıkken iki şarkı yaklaşık aynı yükseklikte çalar. Yüksek şarkının ilk anı patlamaz ya da ezik
  çalmaz; geçişte ani sıçrama olmaz.

**B3. Duraklatma, sarma ve şarkı değiştirirken "tık" yok (0.0.23)**

- Nasıl: Çalarken **Boşluk** ile duraklatıp devam edin; ← → ile sarın; şeride tıklayın; sonraki şarkıya geçin.
- Neye bakılır: hiçbirinde "tık" ya da "pat" sesi yok; ses yumuşakça kısılıp açılıyor.

**B4. Boşluksuz geçiş (tık düzeltmesi #54, 0.0.38)**

- Nasıl: Şarkıların birbirine bağlı olduğu bir albüm (canlı kayıt ya da kesintisiz bir albüm) çalın. CD'den
  alınmış (44,1 kHz) bir albüm en iyisi: Windows'taki çoğu aygıt 48 kHz'te çalışır, o zaman şarkı dönüştürülür.
- Neye bakılır: şarkılar arasında boşluk ya da tık yok; ses sınırda kesintisiz sürer.

**B5. Kulaklık çıkarılınca (0.0.23)**

- Nasıl: Çalarken kulaklığı çıkarın, sonra **Çal**'a basın; kulaklığı geri takıp yine deneyin.
- Neye bakılır: program çökmez; Çal'a basınca o anki aygıtta kalınan yerden sürer.

**B6. Bit-perfect (özel mod, 0.0.28)**

- Önce: kulaklığı çıkarın ya da sesi kısın (özel modda Windows ses düzeyi çalışmayabilir).
- Nasıl: **Ayarlar → Bit-perfect** açın, bir FLAC çalın.
- Neye bakılır: "Sesin yolu" satırında "bit-perfect (özel mod, … bit)" yazar; diğer programların sesi duyulmaz. Açılamazsa
  nedeni yazar ve ses normal yoldan çalar. Denedikten sonra kapatın.

**B7. Uzun çalma, takılma yok**

- Nasıl: Bir saat boyunca kütüphaneden çalın (başka işler yaparken de olur).
- Neye bakılır: ses hiç takılmaz; **Ayarlar → Sesin yolu** altında "Kesinti: 0".

**B8. "Önceki" ve çalma sırası (#51, #52, 0.0.37)**

- Nasıl: Kütüphanede bir albümün ikinci şarkısına çift tıklayın; ilk 3 saniye içinde **Önceki**'ye basın. Sonra bir
  şarkı açılırken (hemen) başka bir şarkıya çift tıklayın.
- Neye bakılır: "Önceki"de ilk şarkı çalar, altta "1 / …" yazar ve şarkı bitince ikinciye geçer. İkinci denemede son
  çift tıkladığınız şarkı çalar ve sıra yazısı ona göredir.

**B9. Kör test (ABX, 0.0.40)**

- Önce: aynı şarkının iki sürümü gerekir, ör. bir FLAC ve ondan yapılmış bir MP3 (ya da iki farklı MP3: 128 ve
  320 kbps). İkisi aynı kayıttan olmalı.
- Nasıl: çekmecede **Kör test** sekmesini açın. **A** ve **B** satırlarındaki **Seç** ile iki dosyayı seçin;
  **Testi başlat**. Kulaklıkla **A**, **B** ve **X**'i istediğiniz kadar dinleyin, **X = A** ya da **X = B** deyin.
  16 deneme sürer; istediğiniz an **Testi bitir** ile çıkabilirsiniz.
- Neye bakılır:
  - A, B ve X arasında geçerken ses **aynı yerden** sürer; tık ya da boşluk yok, ses yüksekliği sıçramaz.
  - Bölümün sonunda ses yumuşakça başa döner.
  - Üstte "seviye farkı … dB eşitlendi · kayma … ms düzeltildi" yazabilir; bu normaldir.
  - Sonunda kaç doğru yaptığınız ve bunun şansla çıkma olasılığı yazar.
  - Test bitince ya da **Testi bitir**'e basınca önceden çalan şarkı kaldığı yerde (duraklatılmış) geri gelir.
  - İki farklı şarkı seçerseniz "aynı kayda benzemiyor" der, test başlamaz; çalan şarkı kesilmez.
- Bildirin: hangi iki dosyayla denediniz ve sonuç (ör. "FLAC – MP3 320: 16'da 9, ayırt edilemedi").

**B10. Bozuk dosya sırayı durdurmuyor (#74, 0.0.46)**

- Önce: kütüphanedeki bir klasöre uzantısı `.mp3` olan ama ses olmayan bir dosya koyun (ör. bir metin dosyasını
  `bozuk.mp3` diye kopyalayın) ve kütüphaneyi yeniletin.
- Nasıl: o klasörde `bozuk.mp3`'ten önceki şarkıyı çalın, sonuna kadar bekleyin (ya da **Sonraki**'ye basın).
- Neye bakılır: bozuk dosya atlanır, bir sonraki şarkı çalar; **Önceki/Sonraki** düğmeleri açık kalır. Bozuk
  dosyaya elle tıklarsanız hata mesajı çıkar ama sıra yine çalışır.

**B11. Özel modda şarkı sonu (#79, 0.0.46)**

- Nasıl: **Ayarlar → Bit-perfect** açıkken bir şarkıyı sonuna kadar dinleyin; **Sesin yolu** satırında "özel mod"
  yazmalı.
- Neye bakılır: şarkının son saniyesi bir kez çalar, tekrar etmez, sonda tık ya da hırıltı yok; sonraki şarkı
  başlar.

**B12. 24 bit şarkı, 16 bit aygıt (#79, 0.0.46)**

- Önce: 24 bit bir FLAC gerekir (çoğu yüksek çözünürlüklü indirme). Ses aygıtı Windows'ta 16 bit'e ayarlı olsun
  (Ses ayarları → aygıt özellikleri → Gelişmiş → "16 bit, 44100 Hz").
- Nasıl: Bit-perfect açıkken şarkıyı çalın; **Ayarlar → Sesin yolu**'na bakın.
- Neye bakılır: program özel modu açmaz; "şarkı 24 bit, aygıt özel modda en çok 16 bit kabul ediyor; bit-perfect
  yerine paylaşımlı yol kullanıldı" benzeri bir açıklama yazar. Ses normal çalar.

**B13. Kulaklık takınca ses kulaklığa geçer (SES-01, 0.0.52)**

- Nasıl: hoparlörden şarkı çalarken 3,5 mm kulaklık takın (ya da Bluetooth kulaklık bağlayın). Sonra kulaklığı
  çıkarın.
- Neye bakılır: 1 saniye içinde ses kulaklıktan sürer; şarkı kaldığı yerden devam eder, durmaz, baştan başlamaz.
  Kulaklığı çıkarınca ses hoparlöre döner; **Çal**'a basmak gerekmez. **Sesin yolu** satırında yeni aygıtın adı
  yazar. Hiç aygıt kalmazsa (tek aygıt çıkarıldı) hata yazısı çıkar; aygıt gelince **Çal** ile sürer.

**B14. Şarkı değiştirirken görseller donmuyor (SES-02, 0.0.52)**

- Nasıl: görseller açıkken şarkı çalarken başka şarkıya tıklayın ve ilerleme çubuğunda ileri geri sarın; mümkünse
  yavaş bir diskteki (USB bellek, ağ paylaşımı) şarkıyla da deneyin.
- Neye bakılır: tıkladığınız anda görsel sahne akmaya devam eder (donup atlamaz); yeni şarkı birkaç yüz ms'de
  başlar. Çok kısa aralıklarla iki şarkıya art arda tıklarsanız son tıkladığınız çalar.

**B15. İlk ses gecikmesi (SES-04, 0.0.52)**

- Nasıl: **Ayarlar → Ses yüksekliği eşitleme** açıkken daha önce hiç çalmadığınız (analizi yapılmamış) uzun bir
  şarkıyı açın.
- Neye bakılır: ses en geç ~0,2 sn'de başlar (önceki sürümde 0,6 sn'ye kadar sessizlik vardı); ilk saniyelerde
  seviye duyulur biçimde sıçramaz (yavaş, hafif bir düzelme olabilir).

**B16. Ağır yükte takılma yok (SES-03, 0.0.52)**

- Nasıl: büyük bir klasör yeni eklenmişken (arka plan analizi sürerken; Ayarlar'da "analiz ediliyor" sayısı
  düşerken) şarkı çalın, bu arada tarayıcıda video açın.
- Neye bakılır: ses takılmaz; **Ayarlar → Program** altındaki takılma sayacı 0 kalır. (Ses iş parçacığı artık
  Windows'un "Pro Audio" önceliğinde.)

## C. Ekolayzer ve bas

**C1. Bas ve Derinlik (0.0.29)**

- Nasıl: Kulaklıkla **Ekolayzer**'ı açın; büyük **Bas** sürgüsünü 0'dan 18'e getirin; **Derinlik**'i %0'dan %100'e.
- Neye bakılır: bas belirgin artar, ses bozulmaz ve kısılmaz; Derinlik'le bas notalarının altında gümbürtü eklenir.

**C2. Vuruş (0.0.31)**

- Nasıl: Davullu bir şarkıda **Ekolayzer → Vuruş** sürgüsünü %0'dan %100'e getirin. **Kulüp** hazır ayarını deneyin
  (vuruş %70).
- Neye bakılır: davul vuruşunun ilk anı "göğse çarpar"; bas gitar ve uzun bas notaları şişmez.

**C3. Küçük hoparlör bası (0.0.29)**

- Nasıl: Dizüstü bilgisayarın kendi hoparlöründe **Küçük hoparlör** hazır ayarını seçin; **Küçük hoparlör bası**
  anahtarını açıp kapatın.
- Neye bakılır: açıkken bas hissi belirgin artar (hoparlör çalamadığı derin bas yerine harmoniklerini çalar).

**C4. Kulaklık düzeltmesi (AutoEq)**

- Nasıl: autoeq.app'ten kulaklığınızın "Equalizer APO" (ParametricEQ.txt) dosyasını indirin; **Ekolayzer →
  Kulaklık profili** ile yükleyin; açıp kapatın.
- Neye bakılır: profil adı görünür; açıkken ses dengesi değişir; kapalıyken eski hâline döner.
- 0.0.53'ten beri Equalizer APO'nun bütün süzgeç türleri okunur (REW gibi programların dosyaları da): LS/HS, eğimli
  raflar ("LSC 6 dB"), "BW Oct", LP, HP, BP, NO, AP. Elinizde böyle bir dosya varsa yükleyin; Equalizer APO'da
  nasıl duyuluyorsa Lyraska'da da öyle duyulmalı. Okunamayan satır olursa hangi satır olduğu yazar.

**C5. Parametrik ekolayzer (0.0.53)**

- Nasıl: **Ekolayzer** panelinin üstünde **Parametrik**'i seçin. Grafikteki numaralı yuvarlakları sürükleyin
  (sağa-sola frekans, yukarı-aşağı kazanç; Shift basılıyken ince ayar). Fare tekerleği seçili bandın Q'sunu
  (genişliğini) değiştirir; boş bir yere çift tıklamak bant ekler. Alttaki kutulara değer de yazabilirsiniz ("2,5k",
  "−3,5").
- Neye bakılır:
  - Ses sürüklerken tıksız değişir; eğri duyduğunuzu gösterir.
  - **A/B karşılaştır** ekolayzersiz dinletir ama ses yüksekliği aynı kalır (yüksek olan daha iyi gelir yanılgısı
    olmasın).
  - **Dosyaya kaydet** ile kaydedilen dosya Equalizer APO'da aynı duyulur (tasarım "Equalizer APO ile aynı"
    seçiliyken bire bir).
  - Programı kapatıp açınca ayarlar yerinde.
- Bildirin: kullanması rahat mı, eksik bir şey var mı?

**C6. Crossfeed (0.0.54)**

- Nasıl: kulaklıkla dinleyin. **Ekolayzer** panelinde kulaklık düzeltmesinin altındaki **Crossfeed**'i açın; dört
  hazır ayarı (Hafif, Orta, Güçlü, Hoparlör gibi) sırayla deneyin. Sesleri sola-sağa sert ayrılmış eski bir kayıt
  (ör. 60'ların stereo kayıtları) farkı en iyi gösterir.
- Neye bakılır:
  - Ses "kafanın içinden" önünüze, hoparlörden dinler gibi çıkmalı; yalnız bir kulakta çalan çalgılar artık
    öbür kulakta da hafifçe duyulmalı.
  - **Vokal ve bas aynı kalmalı** (ne inceltmeli ne şişirmeli); açıp kapatınca ortadaki ses değişmemeli.
  - Açıp kapatırken ve hazır ayar değiştirirken tık olmamalı.
  - Hoparlörle dinlerken kapalı tutun (hoparlör zaten bunu yapar).
- Bildirin: hangi hazır ayar size en doğal geldi, varsayılan o olsun mu?

## D. Görseller

**D1. Kuzey ışıklarının manzaraları (#30, 0.0.30)**

- Nasıl: **Gece göğü** sahnesinde (1 tuşu) bir şarkı çalın; **Ayarlar → Gece göğü**'nde **Göl**, **Korona** ve
  **Karlı vadi**'yi sırayla deneyin.
- Neye bakılır ve bildirin: hangisini en çok beğendiniz, hangisi varsayılan olsun, kalmasını istemediğiniz var mı?
  Işıklar göz kamaştırıcı ama rahatsız edici olmamalı.

**D2. Akıcılık (0.0.33)**

- Nasıl: Büyük kütüphaneyle bir şarkı çalarken **Kütüphane** panelini açık bırakın; sahneleri 1–5 tuşlarıyla
  değiştirin.
- Neye bakılır: görüntü takılmadan akar (saniyede 60 kare); panel açıkken de kapalıyken de aynı.

**D3. Drop sayacı, şeritteki DROP ve gökyüzünün gerilmesi (0.0.36, 0.0.39)**

- Nasıl: Belirgin drop'u olan bir elektronik şarkı çalın; drop'tan 30 saniye önce sağ altta "Drop yaklaşıyor"
  sayacı çıkmalı. Sonra drop'u olmayan sakin bir şarkı çalın.
- Neye bakılır: sayaç gerçek drop'ta sıfıra iner; alttaki şeritte o noktada "DROP" yazar; gökyüzü drop'a doğru
  gerilir ve drop'ta açılır. Sakin şarkıda ve "drop olmayan" yerlerde üçü de olmaz (hepsi aynı droplara bakar).
  Yanlış yerde çıkan ya da gerçek drop'ta çıkmayan drop'u şarkı adı ve saniyesiyle bildirin.

**D4. Albüm kapakları (0.0.32)**

- Nasıl: İçinde kapak resmi olan şarkılar çalın (çoğu MP3, FLAC, M4A'da vardır).
- Neye bakılır: kapak büyük başlığın solunda ve "Sıradaki" kartında görünür. Kapağı olmayan şarkıda albüm adından
  özgün renkli bir kapak.

**D5. Arayüzün renkleri bölüme uyuyor (0.0.32)**

- Nasıl: Nakaratı belirgin bir şarkıyı **Gece göğü**'nde çalın.
- Neye bakılır: nakarata geçince gökyüzüyle birlikte sürgülerin ve ışıkların rengi 2–3 saniyede yumuşakça değişir;
  ani parlama yok.

**D6. Diğer sahneler ve Görsel Yönetmen (VU ve spektrum 0.0.41)**

- Nasıl: **Gece otoyolu** (2), **VU ibreleri** (3), **Spektrum** (4) sahnelerinde drop'lu bir şarkı çalın.
- Neye bakılır: otoyolda çizgiler vuruşla, lambalar ölçü başıyla akar; drop'tan önce ufka çekilip drop'ta açılır.
  VU ibreleri ve spektrum sesle birlikte oynar.
- VU ve spektrumda ölçerlerin arkasında hafif bir ışık halesi var: rengi alttaki şeritte o bölümün rengi; sakin
  bölümde kısık, yoğun bölümde canlı. Drop'tan önce hale daralır (spektrumda tepe noktaları havada asılı kalır),
  drop'ta açılır. Değişimler yumuşak olmalı; ani parlama yok.

**D7. Epilepsi güvenli modu ve "animasyonları azalt"**

- Nasıl: **Ayarlar → Epilepsi güvenli modu**'nu açın. Ayrıca Windows'ta **Ayarlar → Erişilebilirlik → Görsel
  efektler → Animasyon efektleri**'ni kapatıp programı yeniden açın.
- Neye bakılır: güvenli modda görüntü belirgin biçimde sakinleşir, ekranda "Güvenli mod" yazar; animasyonlar
  kapalıyken hareket azalır. Hiçbir durumda ani tam ekran parlama yok.

**D8. Sinema görünümü**

- Nasıl: Çalarken fareye ve klavyeye birkaç saniye dokunmayın.
- Neye bakılır: düğmeler ve yazılar çekilir, yalnızca sahne kalır; fare kıpırdayınca geri gelir.

**D9. Gece sürüşü (0.0.44)**

- Nasıl: Üstteki **Gece sürüşü** düğmesine (ya da 5 tuşuna) basın, bir şarkı çalın; fareye birkaç saniye dokunmayın
  (sinema görünümü).
- Neye bakılır: ön camdan gece otoyolu (çizgiler vuruşla, lambalar ölçü başıyla); torpidoda teyp: kasetin
  makaraları çalarken döner, nokta matris ekranda sanatçı ve şarkı adı kayar, altında spektrum; iki VU ibresi sesle
  oynar; çal düğmesinin halkası yanar. Teyp, düğmeler ve başlık görünürken kısık durur, sinema görünümünde yavaşça
  belirir. Hiçbir yerde marka adı ya da logosu yok. Ani parlama yok.
- Bildirin: beğendiniz mi, değişmesini istediğiniz bir şey var mı (renk, teybin boyutu, kaset)?

**D10. Hızlı tempoda nabız düzenli (#80, 0.0.47)**

- Nasıl: 170–180 BPM bir şarkı (drum and bass ya da hızlı bir rock) çalın; **Gece göğü** ya da **Gece otoyolu**
  sahnesinde bir dakika izleyin. Sonra **Ayarlar → Epilepsi güvenli modu**'nu açıp aynı şarkıyı izleyin.
- Neye bakılır: nabız düzenli; "bir hızlı bir yavaş" diye gidip gelmiyor (iki vuruşta bir atar). Güvenli modda
  saniyede en çok bir kez, yine düzenli.

**D11. Bluetooth'ta şarkı geçişi (#80, 0.0.47)**

- Nasıl: Bluetooth kulaklıkla **Ayarlar → Ses gecikmesi**'ni ölçün ya da 200 ms yapın. Kütüphaneden art arda iki
  şarkı çalın, ilkinin bitişini izleyin.
- Neye bakılır: ilk şarkının son vuruşları görsellerde görünür; ikinci şarkı başlarken görseller donup
  beklemez, kulağınıza gelenle birlikte geçer.

## E. Senkron ve işaretleme

**E1. Kablolu kulaklıkta senkron (0.0.21)**

- Nasıl: Kablolu kulaklıkla bir şarkı çalın; **Senkron** panelindeki vuruş göstergesine bakın.
- Neye bakılır: nokta her vuruşta, vuruşu duyduğunuz anda kenara değer. Önde ya da geride kalıyorsa bildirin.

**E2. Bluetooth kulaklıkta ölçüm (0.0.21)**

- Nasıl: Bluetooth kulaklıkla **Senkron → Ölçümü başlat**; her tıklamada **Boşluk**'a basın.
- Neye bakılır: sonunda "ses yaklaşık … ms geç duyuluyor" yazar (genelde 150–250 ms); sonra şarkıda nokta vuruşla
  birlikte olur.

**E3. İşaretleme ve doğruluk (0.0.33 düzeltmesiyle)**

- Nasıl: Bir şarkıda **İşaretle → İşaretlemeye başla**; 30–60 saniye her vuruşta **Boşluk**, drop'ta **D**; sonra
  **Doğruluğu ölç**. Bluetooth kullanıyorsanız önce E2'yi yapın. Ayrıntılar: [ISARETLEME.md](ISARETLEME.md).
- Neye bakılır: "Gecikme düzeltilince" doğruluğu %80 ve üstü hedef. Sonucu ve şarkının türünü bildirin.

**E4. Ton (Camelot, 0.0.42)**

- Nasıl: Kütüphanede birkaç dakika bekleyin (yeni sürümde şarkılar bir kez daha arka planda çözülür; bu sırada
  müzik takılmamalı). **Ton** sütununa bakın. Tonunu bildiğiniz birkaç şarkı çalın; sağ alttaki bilgi kartında
  "8A · La minör" gibi bir yazı çıkar. **İşaretle** sekmesinde **Ton** listesinden doğru tonu seçip (birkaç beat de
  işaretleyip) **Doğruluğu ölç**'e basın.
- Neye bakılır: tonu bildiğiniz şarkılarda "aynı ton", "komşu ton" ya da "paralel ton" (✓) çıkmalı. Ton değiştiren
  bir şarkıda o bölüme gelince bilgi kartı vurgulu olarak bölümün tonunu gösterir. Yalnızca davul ya da konuşma
  olan kayıtlarda ton boş kalır ("—").
- Bildirin: şarkı adı, sizin bildiğiniz ton ve programın yazdığı ton (✓ olmayanlar en değerlisi).

**E5. Aksak ölçü (0.0.43)**

- Nasıl: Aksak usullü birkaç şarkı çalın (ör. 9/8 roman havası, 7/8 ya da 5/8 bir halk şarkısı). Kütüphanedeki
  şarkıların ritmi arka planda saniyeler içinde yenilenir (şarkılar yeniden çözülmez).
- Neye bakılır: sağ alttaki bilgi kartında "9/8 (2+2+2+3)" gibi ölçü yazar. **Gece otoyolu**'nda sokak lambaları
  ölçü başlarında geçer; **Senkron** panelindeki vuruş noktası uzun ve kısa vuruşlara uyar. Düz 4/4 şarkılar
  "4/4" kalmalı. Ölçüsü belirsiz bir şarkıda ölçü hiç yazmaz; bu bilerek yapıldı.
- Bildirin: aksak olduğunu bildiğiniz şarkıda programın yazdığı ölçü (ya da hiç yazmaması) ve şarkının adı.

**E6. Şarkı haritası dosyası (0.0.55)**

- Nasıl: Analizi bitmiş bir şarkıda **İşaretle** panelinin altındaki **Şarkı haritası dosyası → Haritayı dışa
  aktar**. Aynı şarkının başka bir dosyasını (ör. FLAC'ının yanında MP3'ünü) açın ve **Harita içe aktar** ile o
  dosyayı seçin. Sonra başka bir şarkıya aynı haritayı içe aktarmayı deneyin.
- Neye bakılır: aynı şarkının öteki dosyasında "İçe aktarılan harita kullanılıyor · benzerlik %…" yazar; başka
  şarkıda "Bu harita bu şarkıya ait değil" der ve hiçbir şey değişmez. Bir şarkıyı işaretleyip (vuruş, drop, ton)
  dışa aktarırsanız dosyada sizin işaretleriniz olur. **Kaldır** programın kendi analizine döner.
- Bildirin: benzerlik yüzdeleri (aynı şarkının MP3/FLAC'ında ve başka şarkıda) ve yanlış eşleşme olursa iki şarkının
  adı.

**E7. Kinetik şarkı sözleri (0.0.56)**

- Nasıl: Sözlerini bildiğiniz bir şarkının yanına aynı adla bir `.lrc` dosyası koyun (ör. `Gülümse.mp3` →
  `Gülümse.lrc`; LRC dosyaları birçok söz programında ve sitede bulunur) ya da içine sözleri gömülü bir şarkı çalın.
- Neye bakılır: söylenen satır sahnenin üstünde kelime kelime belirir; söylenen kelime renkli, sıradakiler soluk;
  Türkçe harfler (ş, ğ, ı, İ) bozuk değil; sözler sesle aynı anda (Bluetooth kulaklıkta da, **Senkron** ayarı
  yapıldıysa). **Ayarlar → Şarkı sözleri** ile kapanır ve kapalı kalır.
- Bildirin: sözler erken ya da geç kalıyorsa ne kadar; bozuk görünen harf varsa dosyanın nereden geldiği.

**E8. Galerideki yeni sahneler (0.0.57)**

- Nasıl: üst çubukta **Galeri**'ye tıklayın; on sahne: **Gece denizi**, **Bulutsu**, **Işık tüneli**,
  **Ateşböcekleri**, **Kaleydoskop**, **İpek şeritler**, **Sarmal gökada**, **Kum tepeleri**, **Yağmurlu cam**,
  **Kristal ağ**. Klavyeden 6–9 ve 0; **PageDown/PageUp** bütün sahneleri sırayla gezer.
- Neye bakılır: her sahne müzikle akar (vuruşta hızlanır), bölüm değişince renkler yavaşça değişir, droptan önce
  toplanıp drop'ta açılır; hiçbirinde ani parlama yok. Tam ekranda akıcı mı (takılma, ısınma)?
- Bildirin: beğendiğiniz ve beğenmediğiniz sahneler; takılan sahne varsa bilgisayarın ekran kartı.

**E9. Galeride görünüm ve hazır ayarlar (0.0.58)**

- Nasıl: bir şarkı çalarken **Galeri**'den bir sahne seçin (ör. **Gece denizi**) ve **Galeri**'yi yeniden açın.
  Listenin altında **Görünüm** var: **Hız** kaydırıcısını sağa sola çekin, renk düğmelerinden birini seçin
  (**Bölüm teması**, **Buz**, **Kor**, **Orman**, **Gül**). Sonra **Hazır ayarlar**'dan birine tıklayın (ör.
  **Sakin deniz**, **Kor ateşi**). Beğendiğiniz bir görünümde **Kaydet**'e basın, bir ad yazıp yine **Kaydet**;
  kendi ayarınız listede belirir, yanındaki **×** ile silinir. Programı kapatıp açın.
- Neye bakılır: hız yalnızca hareketi hızlandırır ya da yavaşlatır, ışık parlamaz ve sönmez; renk değişince renkler
  bir saniyede yumuşakça geçer (ani renk değişimi yok). Hazır ayar sahneyi ve görünümü birlikte değiştirir. Kapatıp
  açınca her sahnenin son görünümü ve kaydettiğiniz ayarlar yerinde.
- Bildirin: beğenmediğiniz paletler ya da hız aralığı (çok yavaş/çok hızlı); kaydettiğiniz ayar kaybolduysa.

**E10. MilkDrop sahnesi: kendi .milk görselleriniz (0.0.60; gölgelendiriciler 0.0.63)**

- Önce: Lyraska hazır MilkDrop görseli içermez (yazarları lisans vermediği için dağıtamıyoruz). Bilgisayarınızda
  `.milk` dosyaları olan bir klasör gerekir; örneğin eski bir Winamp kurulumundaki
  `Plugins\Milkdrop2\presets` klasörü ya da kendi indirdiğiniz bir preset paketi. Dosyalar kopyalanmaz, program
  yalnızca klasörün yerini hatırlar.
- Nasıl: **Galeri**'den en alttaki **MilkDrop**'u seçin (ya da **PageUp**). Ekranın ortasındaki **Klasör seç**'e
  basın ve `.milk` dosyalarının olduğu klasörü seçin (bir alt klasördekiler de listelenir). Bir şarkı çalın. Sonra
  **Galeri**'yi yeniden açın: altta **MilkDrop** bölümü var; **Önceki** / **Sonraki** ile görseller arasında gezin,
  **Müzikle kendiliğinden değiştir** kutusunu açıp kapatın. **Ayarlar**'da epilepsi güvenli modunu açıp kapatın.
- Neye bakılır:
  - Görsel siyahtan birkaç saniyede yavaşça belirir; müziğe (bas, vuruşlar) tepki verir.
  - **Hiçbir görselde ani parlama ya da hızlı yanıp sönme yok**: parlaklık freni her karede devrede. Çok sert yanıp
    sönmesi bilinen bir görselde bile ekran ancak yumuşakça aydınlanıp kararmalı (hareket izli, biraz bulanık
    görünebilir; bu frenin işidir). Güvenli modda bu daha da yavaş.
  - Görsel değişimi her zaman birkaç saniyelik yumuşak bir geçişle olur; kendiliğinden değişim yalnızca şarkıda yeni
    bir bölüm başlayınca ya da drop'ta, en sık 15 saniyede bir.
  - 0.0.63'den beri gölgelendiriciler (görselin renklerini, bulanıklığını, dokusunu veren küçük programlar) de
    çalışır: çoğu görsel MilkDrop'taki hâline çok daha yakın görünmeli (renkli, dokulu, katmanlı). Gölgelendiricili
    bir görsel ilk açılışta yarım saniyeye kadar geç gelebilir (çeviri), ikinci açılışta hemen gelir.
  - Az sayıda görselin altında "Gölgelendiricisi çevrilemedi, sade hâliyle çalıyor" yazar: bunlar sade görünür.
    Hiçbir görselde ekran kararıp öyle kalmamalı. Açılamayan bir görselde neden yazılır ve sonrakine geçilir;
    iç içe ya da piksel başına döngü içeren görseller "programı dondurabileceği için açılmıyor" diye atlanır.
  - Program hiçbir görselde donmamalı. Donarsa (görev yöneticisinden kapatmanız gerekirse) bir sonraki açılışta
    galeride "… önceki açılışta çalarken program kapandı; atlananlara eklendi" yazmalı ve o görsel bir daha
    kendiliğinden gelmemeli; **Atlananları yeniden dene** ile geri gelir. Programı normal kapatınca hiçbir görsel
    atlanmamalı.
  - Programı kapatıp açınca seçtiğiniz klasör hatırlanır.
  - Akıcı mı (tam ekranda takılma, ısınma)? Görev yöneticisinde ekran kartı kullanımı ne kadar?
- Bildirin: kullandığınız preset paketinin adı; açılmayan, "çevrilemedi" yazan, kararan ya da MilkDrop'takinden çok
  farklı görünen görsellerin adları (hata günlüğünde "MilkDrop görseli sade çalıyor" satırları nedenini yazar); parlama ya da
  yanıp sönme gördüyseniz (görselin adıyla, hemen); takılma ya da donma varsa görselin adı ve bilgisayarın ekran
  kartı.

## F. Hata günlüğü

**F1. Hata günlüğü açılıyor**

- Nasıl: **Ayarlar → Hata günlüğü**.
- Neye bakılır: Dosya Gezgini açılır ve `lyraska.log` seçili görünür (kullanıcı adınızda boşluk olsa da).

**F2. Lisanslar (#76)**

- Nasıl: **Ayarlar → Lisanslar → Üçüncü taraf lisans bildirimleri**.
- Neye bakılır: panelin içinde uzun bir metin açılır (kütüphane adları, telif satırları, lisans metinleri);
  kaydırılabilir. Windows **Uygulamalar** listesinde Lyraska'nın yayımcısı "Lyraska" yazar (0.0.48 ve sonrası).

---

## Bildirdikleriniz

Sonuçları bana yazdıkça buraya işlenir.

**Doğrulama haftası 22 Ekim 2026'da proje sahibinin kararıyla kapandı** (0.0.52 "iyiydi"). Liste gerçek cihaz
denemeleri için kılavuz olarak kalır; yeni sürümlerde yeni maddeler eklenir.

| Madde                | Sonuç                                                   | Not                                                                                                                                     |
| -------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| — (0.0.33'te)        | ❌ Kütüphane hiç açılmıyordu: `no such table: analyses` | #49. 0.0.5–0.0.19'un kütüphane dosyası 0.0.28'den beri açılmıyordu. 0.0.35'te düzeltildi (testli); A0 ile sizin yedeğinizle denenecek.  |
| A0 (0.0.35)          | ✅ Oldu: eski yedek geri konunca kütüphane açıldı       | #49 kapandı (14 Ekim).                                                                                                                  |
| — (0.0.39)           | ✅ Denendi, sorun çıkmadı                               | 15 Ekim. Hangi maddelerin denendiği yazılmadı; madde madde sonuçlar gelince tabloya ayrı ayrı işlenecek.                                |
| Faz 1 (A2, D1 dahil) | ✅ "Faz 1 tamam"                                        | 16 Ekim. Sürükle-bırak (#29) ve kuzey ışıkları (#30) kapandı. Gece göğünün varsayılan manzarası aynı kaldı; değişsin isterseniz yazın.  |
| — (0.0.52)           | ✅ "Denedim iyiydi"                                     | 22 Ekim. DENETIM-2 düzeltmelerinin sürümü (#89, #90). Hangi maddelerin denendiği yazılmadı; B13–B16 madde madde gelince ayrı işlenecek. |
| — (0.0.59)           | ✅ "Test ettim. İyi."                                   | 22 Ekim. Şarkı haritası dosyası, kinetik sözler, galeri ve hazır ayarların sürümü (E6–E9). Hangi maddelerin denendiği yazılmadı.        |
