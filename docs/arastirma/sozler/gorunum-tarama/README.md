# Şarkı sözü görünümü: geniş tarama (tasarım ve yapım)

Tarih: 7 Kasım 2026. Hazırlayan: Claude (araştırma ajanı). Sahibinin isteği: "internette detaylıca, tasarım ve yapım anlamında, popüler dillerde tarama". Yalnızca bir rapor; programda bir şey değiştirmez.

**İşaretler:**

- **[A]** Birincil kaynağı kendim okudum: sayfanın kendisi, deponun kodu ya da makalenin metni.
- **[B]** İkincil kaynak ya da yalnızca arama özeti.
- **[C]** Benim çıkarımım.

Kodu okunan depolar yalnızca okunmak için geçici bir klasöre indirildi. AGPL lisanslı koddan (AMLL) **fikir** alınabilir, **kod alınamaz** (§6).

---

## 0. Özet: en etkili 10 fikir

Sıralama, "vay be" etkisi ile okunabilirliğe katkının toplamına göre yapıldı.

1. **Resme göre kendini ayarlayan okunabilirlik katmanı ("Kendi resmin").** Sözün altına düşen bölgenin parlaklığı ve
   karmaşıklığı ölçülür; sonuca göre üç davranıştan biri seçilir:
   - Sade koyu bölge: beyaz yazı ve gölge.
   - Sade açık bölge: koyu yazı, gölge yok.
   - Karmaşık bölge: beyaz yazı, gölge ve yerel, yumuşak bir karartma (scrim).

   Bu sınıflandırma Apple'ın terk edilmiş patent başvurusunda ayrıntılı anlatılıyor [A]
   (https://patents.google.com/patent/US20160358592A1/en). Araştırma da, karmaşık zemin üstünde **bulanıklaştırma ile
   yarı saydam karartmanın birlikte** en iyi sonucu verdiğini; harfe yapışık yöntemler arasında ise **gölgenin**
   kazandığını gösteriyor [A] (Sawyer vd. 2020, https://pubmed.ncbi.nlm.nih.gov/32425139/).

2. **Kelime dolumu yumuşak kenarlı bir "silme" (wipe) maskesiyle yapılır.** Renk kelimeye birden geçmez; kelimenin
   zamanı boyunca soldan sağa kayan, kenarı yumuşak bir maskeyle dolar. AMLL'de kenar genişliği satır yüksekliğinin
   0,5'idir (`wordFadeWidth = 0.5`) [A]. Spicetify lyrics-plus aynı işi `background-clip: text` ve %45–55 arası bir
   geçişle yapar [A].
3. **Uzun hecede "vurgulama".** Uzun süren bir kelimenin harfleri sırayla hafifçe büyür, yukarı kalkar ve parlar. Etkinin
   gücü hecenin süresiyle artar ama bir tavanı vardır; satırın son kelimesi biraz daha güçlü vurgulanır. AMLL'de güç
   şöyle hesaplanır: önce `süre/2000` ve `süre/3000` alınır, 1'den büyükse karekökü, küçükse küpü kullanılır; ölçek en
   çok +%12'dir; son kelimede güç 1,6 kat, süre 1,2 kat olur [A]. Lyraska'daki "held glyph" bunun tohumu sayılır [C].
4. **Satırlara yay (spring) hareketi; yayın sertliği satırlar arasındaki süreye göre değişir.** Sıkışık satırlarda yay
   daha sert ve hızlı, seyrek satırlarda daha yumuşaktır. Satırlar 50 ms arayla, merdiven gibi sırayla kayar.
   - AMLL: sertlik 170–220 arası, sönüm `2,2·√sertlik`; satırlar arası gecikme her satırda 1/1,05 oranında kısalır [A].
   - YouLy+ (MIT): sönüm oranı ζ sıkışık satırlarda 0,85, seyrek satırlarda 0,73 [A].
5. **Derinlik.** Geçmiş ve gelecek satırlar, şimdiki satıra uzaklıklarıyla orantılı olarak bulanıklaşır.
   - AMLL: bulanıklık 1 + mesafe piksel, en çok 5 px [A].
   - YouLy+: yakın satır 0,035 em, uzak satır 0,07 em [A].
   - lyrics-plus: satır başına 1,5 px [A].

   Etkin satır hafifçe büyür (lyrics-plus'ta ölçek 1,1) [A].

6. **Müzik arasında vuruşa göre nefes alan noktalar.** Satırlar arasında 5 saniyeden uzun boşluk olunca üç nokta
   belirir. Lyricify bunu "呼吸点" (nefes noktası) diye anlatır [A]; AMLL'de de üç noktalı ara gösterisi vardır [A];
   karaoke yazılımlarında satır başından önce 3–4 vuruşluk bir geri sayım kullanılır [A].
   **Lyraska'ya özgü fark** [C]: başka hiçbir oynatıcı noktaları şarkının **gerçek vuruş ızgarasına** bağlamıyor.
   Lyraska'nın beat ve ölçü analizi bunu mümkün kılar: bir sonraki satır gelmeden önceki son ölçüde 4-3-2-1 geri sayım
   yapılabilir.
7. **Yerleşimi resme göre seçmek.** Söz, resmin dikkat çeken bölgesinin yakınına konur ama onu örtmez. Yer, kontrastın
   en yüksek olduğu bölgeden seçilir ve şarkı boyunca sabit kalır. UIST 2023 makalesinin DG4, DG6 ve DG7 kuralları bunu
   anlatır [A] (https://arxiv.org/abs/2308.14922).
8. **Okunur satır kırma.** Satır başına en çok yaklaşık 42 karakter; uzun satırlar dengeli uzunlukta ikiye bölünür.
   Kaynaklar:
   - Netflix: 42 karakter, en çok 2 satır [A].
   - Netflix'in Türkçe kılavuzu "gibi, diye, benzeri" gibi kelimelerin önceki sözcükten ayrılmamasını ister [A].
   - CSS'teki `text-wrap: balance` Chromium'da 6 satıra kadar çalışır [A].
9. **Ayar paneli: boyut, konum, stil ve canlı önizleme.**
   - Boyut %50–200 arası (ABD'nin FCC kuralı) [A].
   - Kenar stilleri: yok, kabartma, çukur, düz kontur, gölge (FCC; Netflix ve YouTube'da da var) [A/B].
   - Değişiklikler canlı önizlemeyle görülür ve kalıcı olarak saklanır (FCC 79.103(c)(10)) [A].
   - "Tüm metni oku" diye düz bir okuma görünümü eklenir: Roon kullanıcıları karaoke tarzının şiir gibi sözlerde
     okunmadığından şikâyet ediyor [A].
10. **Resim olmayan sahnelerde kapaktan türeyen, yavaş akan arka plan.** İki lisansı temiz yol var:
    - Lyricify-Backgrounds (Apache-2.0): üç dönen kapak katmanı, sigma değeri 42,5 olan büyük Gauss bulanıklığı,
      doygunluk önce 1,4 kat artırılıp sonra 0,7 kata indirilir [A].
    - YesPlayMusic (MIT): kapağın iki büyük kopyası 150 saniyede bir tam döner, üzerine 50 px bulanıklık uygulanır [A].

    AMLL'nin mesh-gradient arka planı en gösterişlisi, ama kodu AGPL [A].

---

## 1. Ürünler ve projeler

### 1.1 Apple Music (zamanlı sözler, Apple Music Sing)

- **Sing (Aralık 2022), Apple'ın basın PDF'inden** [A]
  (https://www.apple.com/newsroom/pdfs/Apple-Music-Sing.pdf):
  - Sözler vuruşa göre zamanlanır: "every syllable is synced in time with the music".
  - Arka vokaller ve düetler için iyileştirmeler yapıldı.
  - Sözler ekranında, vokallerin sesini ayarlayan bir sürgü bulunur.
- **Düet ve arka vokal görünümü** [B]:
  - Düette şarkıcılar ekranın iki ayrı yanında gösterilir.
  - Arka vokal ana satırdan ayrılır, ayrı canlandırılır ve daha küçük yazıyla gösterilir.
  - Kaynaklar: TechCrunch https://techcrunch.com/2022/12/06/apple-music-is-getting-a-new-karaoke-like-feature-apple-sing ,
    Engadget https://www.engadget.com/apple-music-sing-karaoke-160939731.html .
- **iOS 26: çeviri ve okunuş satırı** [B].
  - Dil çiftleri: İngilizce → Çince, İngilizce → Japonca, Korece → Çince, Korece → İngilizce.
  - Yalnızca zamanlı sözlerde çalışır.
  - Kaynaklar: https://www.idownloadblog.com/?p=1044731 , https://appleinsider.com/inside/ios-26/tips/how-to-view-translated-lyrics-in-apple-music
- **Nasıl yapıldığı.** Apple bunu belgelemiyor. Üçüncü taraf yazılar kelimenin ilerleyen bir maske ya da `clip-path`
  ile dolduğunu söylüyor; yay hareketi ise tahmin [B] (https://dev.to/vimu_kale_4b5058f002ff8b1/how-apple-music-maps-audio-to-lyrics-the-engineering-behind-real-time-lyric-sync-4fin).
  Apple'ın söz biçimi TTML'dir. Kelime zamanlaması `itunes:timing`, şarkıcı `ttm:agent` ile verilir; arka vokal
  `ttm:role="x-bg"`, çeviri `x-translation`, okunuş `x-roman` rolüyle işaretlenir. Bunlar AMLL'nin TTML ayrıştırıcısında
  ve testlerinde geçiyor [A].
- **Arka plan.** Apple tarzı arka planın "mesh gradient" olduğu AMLL'nin kaynak yorumunda yazıyor [A]: "此渲染应该是
  Apple Music 使用的背景渲染方式了" (Apple Music'in kullandığı arka plan yöntemi bu olmalı). Bu yöntemin anlatımı:
  https://movingparts.io/gradient-meshes [A]. Yöntemde ızgara kontrol noktaları kullanılır, her yama bikübik Hermite
  ile çizilir; renk teğetleri sıfırlanır ki ara geçişlerde siyah-beyaz bozulmaları olmasın; ileride Oklab renk uzayı
  öneriliyor.

### 1.2 Spotify

- Sözler Musixmatch'ten gelir; gerçek zamanlı sözler 2021'de bütün dünyaya açıldı [B]
  (https://techcrunch.com/2021/11/18/spotify-finally-rolls-out-real-time-lyrics-to-global-users).
- **Şubat 2026** [A] (https://techcrunch.com/2026/02/04/spotify-upgrades-its-lyrics-feature-with-offline-access-more-translations):
  - Premium kullanıcılar sözleri çevrimdışı görebilir.
  - Sözler çalan şarkı ekranında, kapağın hemen altına taşındı.
  - Çeviri bütün dünyaya açıldı; çeviri satırı asıl satırın altında durur ve varsayılan dili cihazın dilidir.
- **Arka plan rengi** kapağın baskın ya da ortalama renginden seçilir; çok açık çıkarsa griye düşer [B] (Spotify
  topluluk forumu).
- **Kullanıcı şikâyetleri** [B] (https://community.spotify.com/t5/Live-Ideas/Other-Toggle-on-off-the-dynamic-background-color-of-the-lyrics/idi-p/5256331/page/3 ,
  https://community.spotify.com/t5/Live-Ideas/Lyric-Font-and-Background-Color-Accessibility-Settings/idi-p/6583224):
  - Parlak arka plan "göz yakıyor"; renkli arka planı kapatıp sabit renk seçme isteniyor.
  - Yazı boyu bazılarına göre küçük, bazılarına göre büyük; yazı boyunu ayarlama isteniyor.
  - Bu ikinci başlığın içeriğini WebFetch ile okuyamadım (sayfa boş geldi).

### 1.3 Musixmatch, YouTube Music, Amazon Music, Tidal

- **YouTube Music** (2023) [B]:
  - Şu anki satır beyaz, diğerleri soluk gri.
  - Arka plan bulanıklaştırılmış kapak.
  - Sözler başlamadan önce bir nota işareti gösterilir.
  - Kaynaklar: https://9to5google.com/2023/08/24/youtube-music-live-lyrics/ ; 2024'te birçok şarkıda zamanlı sözler
    kayboldu: https://9to5google.com/2024/09/04/youtube-music-live-lyrics-missing
- **Musixmatch**: Spotify, YouTube, Amazon ve Tidal'ın söz sağlayıcısı olduğunu kendisi söylüyor (satıcı kaynağı) [B].
  Musixmatch 7 "renkli söz deneyimi" getirdi [B] (https://www.idownloadblog.com/?p=557861).
- **Amazon Music X-Ray**: kayan sözlerin yanında şarkıyla ilgili ilginç bilgiler gösterir [B]
  (https://www.engadget.com/amazon-music-x-ray-164539864.html).
- **Tidal**: sözler mobil, masaüstü ve web uygulamasında var; zamanlı olup olmadığı yazmıyor [B]
  (https://support.tidal.com/hc/en-us/articles/4404289436433-View-lyrics).

### 1.4 Japon, Kore ve Çin uygulamaları

- **LINE MUSIC**:
  - Karaoke modunda vokal kapatılır, kullanıcının sesi parçaya karıştırılır, sözler ekranda görünür (LY Corp. basın
    duyurusu) [B] (https://www.lycorp.co.jp/news/archive/L/ja/ja20220301_B.pdf).
  - 2022'den beri yapay zekâyla puanlama var [B] (https://appllio.com/news/2022-03-01-24096-line-music-update).
  - Harf harf renk değişimine dair kaynak bulamadım.
- **Melon / Genie**:
  - Melon'un kendi zamanlı söz biçimi `.slf`'dir; Genie `.irc` kullanır (Samsung topluluğu) [B].
  - TJ노래방 uygulamasında söz ve arka plan rengi kullanıcı tarafından seçilebiliyor (App Store açıklaması) [B]
    (https://apps.apple.com/kr/app/id385262125).
  - Melon ve Genie'nin yazı boyu ayarına dair kaynak bulamadım.
- **NetEase (YRC), QQ Music (QRC), KuGou (KRC)**: üçü de kelime ya da hece başına başlangıç ve süre tutar.
  - Lyricify'ın belgesi QRC ve YRC sözdizimini örnekleriyle veriyor [A] (https://docs-gh.lyricify.app/lyrics/guide):
    QRC `[satırBaşı,süre]Kelime (başlangıç,süre)`, YRC `[satırBaşı,süre](başlangıç,süre,0)Kelime`, ikisinde de birim ms.
  - QRC'de zaman aralıkları çakışabilir; bu, iki satırın aynı anda vurgulanmasını sağlar [A].
  - **Lyricify Syllable** biçiminde satırın başındaki 0–8 arası bir sayı iki bilgiyi birlikte kodlar: arka vokal mi
    (evet/hayır/belirsiz) ve düette hangi yanda (sol/sağ/belirsiz) [A].
  - QQ Music'in web sürümünde resmî çevirisi olan şarkılarda sözlerin yanında "译" (çeviri) düğmesi var [B]
    (https://sj.qq.com/blog/1774609306136).

### 1.5 Karaoke uygulamaları (Smule, StarMaker, KaraFun) ve karaoke gelenekleri

- **Smule**: gerçek zamanlı kayan sözler ve perde rehberi var; düette bölümler seçilebiliyor [B] (App Store sayfaları).
  A ve B bölümlerinin renk kuralına dair kaynak bulamadım.
- **StarMaker, KaraFun**: kendi söz ekranı ayarlarına dair birincil kaynak bulamadım.
- **Satır başı geri sayımı** (Youka belgesi) [A] (https://docs.youka.io/en/web/add-lead-in):
  - Varsayılan 3–4 vuruş; hızlı şarkılarda daha az.
  - "En kısa boşluk" eşiğinin altındaki aralarda geri sayım gösterilmez.
  - İki stil var: "Classic" ve iz bırakan "Fade Tail".
  - Düette geri sayım, sıradaki şarkıcının rengini alır.
- **Erken başlama**: Bir kullanıcının özellik isteğine göre karaoke silmesi, tepki süresi yüzünden genelde 50–100 ms
  erken başlar [B] (https://mykaraokevideo.featurebase.app).
- **Japon karaoke patentleri**: JP3423137B2 sözlerin çalınan yere kadar sırayla renk değiştirmesini anlatır [B]
  (https://patents.google.com/patent/JP3423137B2/ja). US5997308 renk değişimini bir fonksiyonla anlatıp az veriyle
  yumuşak bir silme elde eder [B] (https://patents.google.com/patent/US5997308).

### 1.6 Açık kaynak ve topluluk projeleri

**AMLL – Apple Music-like Lyrics** (`Steve-xmh/applemusic-like-lyrics`, artık `amll-dev` organizasyonunda;
**AGPL-3.0-only**, bütün paketler) [A]. Kodu okudum; aşağıdakiler kaynak koddan.

- **Görüntü yöntemi:**
  - Sözler DOM ile çizilir: CSS `transform`, `filter: blur()` ve `mask-image` kullanılır.
  - Arka plan WebGL ile çizilir: bikübik Hermite mesh, kapak dokusu, FBO.
- **Kelime dolumu, iki yol:**
  - Web Animations API ile `mask-position` canlandırılır.
  - Yedek yol: her karede `--amll-player-time` CSS değişkeni yazılır, maske konumu `calc()` ile hesaplanır.
  - Kenar yumuşaklığı satır yüksekliğinin 0,5'i.
- **Vurgulama (emphasize):** harf başına 32 kare kullanılır. Harfler sırayla ölçeklenir, yukarı kalkar (en çok
  −0,025 em) ve `text-shadow` ile beyaz parlar. Ortadaki harften uzaklaştıkça yana itilme etkisi vardır; zamanlaması
  bezier eğrisiyle "yükselip inme" biçimindedir.
- **Yaylar:**
  - Varsayılanlar: dikey konum kütle 0,9 / sönüm 15 / sertlik 90; ölçek 2 / 25 / 100; arka vokal ölçeği 1 / 20 / 50.
  - Normal çalarken dikey yay satırlar arası süreye bağlıdır: süre 100–800 ms aralığına sıkıştırılır, beşinci kökü
    alınarak sertlik 170–220 arasında seçilir, sönüm = 2,2·√sertlik.
  - Sarma (seek) ve müzik arası sırasında daha yumuşak bir yay (90 / 15), şarkı sonunda orta hızlı bir yay
    (140 / 22) kullanılır.
  - Yayı çözen kodun yorumunda "MIT License github.com/pushkine/" yazar; kaynağı pushkine'ın MIT lisanslı kodu.
- **Bulanıklık ve saydamlık:**
  - Bulanıklık 1 + mesafe px, en çok 5 px; ekran darsa 0,8 kat.
  - Vurgulanan satırın saydamlığı 0,85.
  - Dokunarak kaydırma sırasında bulanıklık kapanır.
  - Seçenek olarak "geçmiş satırları gizle" var.
- **Merdiven gecikmesi:** satırlar 50 ms arayla hareket eder; şimdiki satırdan sonrakilerde aralık her satırda
  1/1,05 kat kısalır.
- **Arka plan işleme:**
  - Kapak önce şu sırayla işlenir: kontrast 0,4 → doygunluk 3,0 → kontrast 1,7 → parlaklık 0,75; ardından bulanıklaştırılır.
  - Gölgelendiricide döndürme, düşük frekanslı sese göre yakınlaşma (`u_volume`), bantlaşmayı önleyen bir gürültü
    (dither) ve kenar kararması (vinyet 0,6–1,0) uygulanır.
  - Kapak değişince yeni mesh saydamlıkla belirir.
- **Diğer:** Satır kırmaları dengelenir (`line-balancer`); CJK yazıları ayrıca ele alınır; ruby (furigana) desteği ve
  müstehcen kelime maskeleme seçeneği var.
- **Veri modeli:** `words[]`, `translatedLyric`, `romanLyric`, `isBG`, `isDuet` [A].
- AMLL'yi kullanan uygulamalar: SPlayer (AGPL) ve Spicy Lyrics (AGPL) [A].

**YouLy+** (`ibratabian17/YouLyPlus`, **MIT**) [A]. YouTube Music, Tidal ve Apple Music web için bir uzantı.

- Ayarlar CSS değişkenleriyle tutulur:
  - Soluk yazının saydamlığı 0x55 (yaklaşık %33).
  - Bulanıklık uzak satırda 0,07 em, yakın satırda 0,035 em.
  - Söylenen kelime −0,05 em yukarı kalkar.
  - Kaydırma 400 ms, eğri `cubic-bezier(.41,0,.12,.99)`.
  - Alt yazı (çeviri ve okunuş) 0,6 em.
- **Yay → CSS easing:** sönümlü yayın kapalı formülü (ωd = π/tepe süresi) bir kez örneklenir ve CSS'in `linear()` easing
  fonksiyonuna çevrilir. Yayı her karede JavaScript ile hesaplamaya gerek kalmaz, tarayıcı canlandırır.
- ζ değeri satırlar arasındaki süreye göre 0,85 ile 0,73 arasında seçilir.

**Spicetify lyrics-plus** (`spicetify/cli`, **LGPL-2.1**) [A]:

- Ayarlar: genel gecikme, yazı boyu, hizalama, öncesinde ve sonrasında kaç satır gösterileceği, bulanık sönme,
  "colorful" arka plan, gürültü dokusu, etkin ve soluk yazı rengi, vurgu arka planı.
- Karaoke kelimesi `linear-gradient(to right, etkin %45, soluk %55)` geçişiyle, `background-size: 225%` ve
  `transition: background-position <kelime süresi + 0,05 sn> linear` ile dolar.
- Sağdan sola yazılan diller için ayrı ve ters yönlü bir geçiş var.
- Satır bulanıklığı `blur(index × 1,5 px)`, etkin satır `scale(1.1)`.

**YesPlayMusic** (`qier222/YesPlayMusic`, **MIT**) [A]:

- Kapağın 140 vw boyutunda iki kopyası `blur(50px)` ile bulanıklaştırılır; koyu temada kontrast %125, parlaklık %50.
- Bir kopya `mix-blend-mode: luminosity` ile karışır.
- İki kopya 150 saniyede bir ters yönlerde döner.
- Renk: kapaktan Vibrant ile seçilen "DarkMuted" ton, ondan iki renkli bir geçiş üretilir.

**Lyricify** (Windows, kapalı kaynak; tanıtım deposunda lisans dosyası yok) [A]. Kendi açıkladığı açık kaynak
parçalar (https://github.com/WXRIW/Lyricify-App):

- `Lyricify-Lyrics-Helper`: söz işleme, Apache-2.0.
- `Lyricify-Backgrounds`: dinamik arka plan, Apache-2.0 [A]. Bu depoyu inceledim:
  - Apple Music'ten esinlenen iki arka plan var: iOS ve iOS 13 "Classic".
  - Üç kapak katmanı farklı periyotlarla döner.
  - Bulanıklık: normalleştirilmiş sigma 42,5 çekirdek, eşli doğrusal örnekleme ile.
  - Doygunluk matrisi: önce 1,4, sonra 0,7.
  - İsteğe bağlı olarak basa göre nabız atar.
  - Mesh ızgara Catmull-Clark ile inceltilir.
  - Belgelerde yatay ve dikey düzen ile "sözlerin arkasında" modu anlatılıyor.
  - Yazıldığı ortam: HLSL ve C# (WPF/WinUI). Lyraska'ya fikir ve matematik olarak taşınır; GLSL'e yeniden yazılması
    gerekir [C].

**BetterLyrics** (`jayfunc/BetterLyrics`, **GPL-3.0**, WinUI 3 + Win2D) [A]. README'ye göre özellikleri:

- Hece başına karaoke vurgusu, uzun notalarda iz bırakan parlama, uzak sözlerde "uzamsal perspektif" sönmesi.
- Bulanık, sisli ve kar taneli arka planlar.
- Kapaktan ya da ekran kenarlarından renk örnekleme.
- Masaüstü, görev çubuğu ve duvar kâğıdı modları.
- 10'dan fazla şablonla "söz kartı" paylaşma.

**Better Lyrics** (`better-lyrics/better-lyrics`, YouTube Music uzantısı, **GPL-3.0**) [A]: temalar CSS ile yazılır ve
bir tema pazarı var. Bir kullanıcı bunu "spicetify'daki beautiful lyrics / spicy lyrics gibi, ama YouTube Music'te"
diye övüyor [B] (Firefox eklenti yorumları).

**am-lyrics** (`binimum/am-lyrics`, **MPL-2.0**) [A]: Apple Music tarzı kelime kelime söz gösteren hafif bir web
bileşeni. Esinlendiği projeler: YouLy+, AMLL ve LyricsBlossom. TTML metnini doğrudan alabilir.

**LyricsX** (macOS, **MPL-2.0**) [A]: masaüstü ve menü çubuğunda söz gösterir; yazı tipi, renk ve konum ayarlanır;
söz gecikmesi ayarlanır; satıra çift tıklayınca şarkı o yere atlar.

**Kanade / Lyrics extensions**: Bu adla belirli bir proje bulamadım, araştırılmadı.

**TextAlive (AIST)** [A]: Kato, Nakano ve Goto, "TextAlive: Integrated Design Environment for Kinetic Typography",
CHI 2015 [B] (https://researchr.org/publication/KatoNG15/bibtex).

- **App API** (npm'de `textalive-app-api` 0.5.3): şarkının "haritasını" (nakarat, vuruş) ve sözlerin zamanlarını
  verir [A] (https://developer.textalive.jp/).
- **Lisansı özel** [A]: TextAlive kullanım koşullarını kabul etmek ve Songle API'si (çevrimiçi) gerekiyor; ticari
  kullanım için önce AIST'e danışılmalı. **Lyraska'da kullanılamaz** (çevrimdışı ve GPL ile uyumsuz) [C].
- **Fikirleri değerli.** Örnek olarak Zenn'deki "Rhyme Traveler" uygulaması [A]
  (https://zenn.dev/moomindani/articles/d173059bac2751):
  - Tekrarlanan kalıplar dikey yazılır.
  - Şarkının ana anlamını taşıyan anahtar sözler büyük, yavaş ve bulanık gösterilir.
  - Nakaratta ışınlar 100 kat güçlenir; nakarattan önce lens parlamaları yağar.
  - Bütün nesneler izleyiciye doğru gelir; ekranın derinliğine ilerleniyormuş hissi verir.

**Söz videosu ve kinetik tipografi pratiği.** En sağlam kaynak Ma vd., "Automated Conversion of Music Videos into Lyric
Videos", UIST 2023 [A] (https://arxiv.org/abs/2308.14922). Bu makale ilk 100 söz videosunu inceleyip şu kuralları
çıkarıyor:

- **DG1:** Bir ifade, birlikte söylenen kelimelerden oluşur (müzikal cümle).
- **DG2:** Uzun ifade, eşit uzunlukta satırlara bölünür; sonda tek kelime ("runt") kalmaz.
- **DG3:** Söylenen kelime canlandırılarak vurgulanır.
- **DG4:** Yeterli kontrast olur, ya da yazıya kontur, gölge veya yarı saydam kutu eklenir.
- **DG5:** Sözler şarkıyla tam zamanında görünür.
- **DG6:** Söz, dikkatin toplandığı yerin yakınına konur ama onu örtmez.
- **DG7:** Ardışık ifadeler birbirine yakın durur.

Yerleşim, dikkat haritası (saliency), renk farkı ve önceki konuma yakınlık terimlerinden oluşan bir enerji fonksiyonu
en aza indirilerek bulunur.

Sektör blogları da benzer şeyler söylüyor [B]:

- Güçlü hareketi yalnızca nakarat, ritim değişimi ya da anahtar sözler için saklayın; her satıra aynı efekti
  uygulamayın (https://shortgenius.com/blog/make-a-lyric-video).
- Satırları, sözlerin yazılışına göre değil, söylenişine göre bölün (https://www.renderforest.com/blog/how-to-make-lyric-video-with-ai).

Codrops'un "Kinetic Typography with Three.js" yazısı (2020) WebGL'de yazı canlandırmanın temel bir anlatımı [B]
(https://tympanus.net/codrops/2020/06/02/kinetic-typography-with-three-js/).

### 1.7 Kullanıcıların övdükleri ve şikâyet ettikleri (forumlar, HN, tasarım siteleri)

- **Roon topluluğu** [A] (https://community.roonlabs.com/t/now-playing-screen-realtime-lyrics/63741):
  - "karaoke style lyrics are difficult to read, in particular for more complex lyrics" (Haziran 2023).
  - "Live lyrics are huge and hard to read if you just want to read without following music" (Kasım 2026).
  - Kullanıcılar karaoke görünümünü kalıcı olarak kapatma ayarı ve düz metin bloğu istiyor.
- **Spotify forumu** [B]: parlak dinamik arka planın göz yorduğu, yazı boyunun ayarlanamadığı, tam ekranda sözlerin
  olmadığı konuşuluyor (§1.2).
- **Apple Music için övgü** [B]:
  - Akıcılığı "transkript okumak değil, karaoke" hissi veriyor.
  - Bulanıklık ve yavaş renkli arka plan beğeniliyor (https://desirabilitylab.com/backfill/backfill-2023-40-apple-music-vs-spotify-lyrics).
  - Bazı kullanıcılar sürekli hareketi dikkat dağıtıcı buluyor [B].
- **Poweramp forumu** [B; sayfa 403 verdi, yalnızca arama özeti]: kullanıcılar, küçük ekranda zamanlı sözlerin ancak
  kapağın üstüne büyük harflerle bindirilirse işe yarayacağını söylüyor.
- **Stingray karaoke API'si tasarım kuralları** [A] (https://karaoke-api-doc.stingray.com/docs/introduction/design-guidelines):
  - Sözler güvenli alan içinde kalır.
  - Güvenli alanın içinde arka plan hareketi en az olur.
  - Sıradaki satır geçmiş satırlardan daha belirgin ve yüksek kontrastlı olur.
  - Süslü yazı tiplerinden kaçınılır.
- **Hacker News** (Algolia API ile arandı) [A]: söz tasarımı üzerine derin bir tartışma bulamadım. İlgili "Show HN"
  gönderileri:
  - lrclib (MIT): https://news.ycombinator.com/item?id=39480390
  - Better Lyrics: https://news.ycombinator.com/item?id=40832771
  - TextAlive: https://news.ycombinator.com/item?id=9136268
- **V2EX** [B]:
  - Apple Music'in sözlerindeki hatalar ve çeviri eksikliğinden şikâyet ediliyor; LyricsX öneriliyor
    (https://v2ex.com/t/762227 ve ilgili başlıklar).
  - Bir yanıtta resmî sözlerin genelde yalnızca metin olduğu, zamanlamanın ayrıca yapılması gerektiği anlatılıyor.
- **Reddit:** Erişemedim. WebSearch aracı reddit.com'u "user agent erişemez" diye reddetti; doğrudan istek de oturum
  kuralına takıldı. Üçüncü taraf bir Reddit arşivinden açtığım tek başlık sözle ilgili değildi. **Reddit bulgusu yok.**
- **Dribbble, Behance, Awwwards:** Arama sonuçlarında doğrudan bu sitelerin sayfaları çıkmadı; bu yüzden somut bir
  tasarım örneği veremiyorum. Codrops'un yukarıdaki yazısı en yakın kaynak.
- **GitHub `syllable-lyric` konusu** [A] (https://github.com/topics/syllable-lyric): amll-ttml-tool (hece hece TTML
  düzenleyicisi, GPL-3.0) ve amll-editor.

---

## 2. Rastgele resim üstünde okunabilirlik

### 2.1 Standartlar ve sayılar

| Kaynak                       | Kural                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | İşaret                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| WCAG 2.2, 1.4.3              | Normal metinde kontrast ≥ 4,5:1; büyük metinde ≥ 3:1. Büyük metin: 18 pt ya da 14 pt kalın, yani yaklaşık 24 px ya da 18,5 px kalın. Arka plan resmiyse kontrast "normal kullanımda yazının üstüne geldiği zemine" göre ölçülür. Harfin içini dolduran kalın kontur "hale" sayılır ve zemin yerine geçer.                                                                                                                                                                                                                                                                   | [A] https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html                                     |
| WCAG 1.4.6 (AAA)             | Kontrast 7:1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | [B] (sayfayı açmadım)                                                                                     |
| APCA (WCAG 3 taslağı)        | Gövde metni için en az Lc 75, tercihen Lc 90                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | [B] https://www.github.com/Myndex/SAPC-APCA/blob/master/documentation/WhyAPCA.md                          |
| WCAG 2.2.2                   | Kendiliğinden başlayan, 5 saniyeden uzun süren ve başka içerikle birlikte gösterilen hareket durdurulabilmeli ya da gizlenebilmeli                                                                                                                                                                                                                                                                                                                                                                                                                                          | [A] https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html                                      |
| BBC altyazı kılavuzu         | Okuma hızı 160–180 kelime/dakika, kelime başına ≈ 0,3 sn. Satır yüksekliği 16:9'da ekran yüksekliğinin %7–8'i, 9:16'da %3,9–4,5'i. Satır genişliği 16:9'da en çok %68. Yatay görüntüde en çok 2 satır, dikeyde 3. Yazı beyaz, zemin siyah; konuşmacı renkleri sırasıyla beyaz, sarı (#FFFF00), camgöbeği (#00FFFF), yeşil (#00FF00). Siyah kutu her satır için ayrı çizilir, satırlar arasında boşluk kalmaz, iki yanda 0,5 em taşar. **Şarkı sözü:** kelimesi kelimesine yazılır, ortalanır, sesle tam zamanlı gösterilir, gerekirse konuşma altyazısından hızlı olabilir. | [A] https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/ (WebFetch açamadı, curl ile okundu) |
| BBC, cihaza göre boyut       | Telefonda ×1; 16:9 dizüstü ve masaüstünde ×0,6 (aralık ×0,5–1); 32–42" televizyonda ×0,67. Ekran boyu bilinmiyorsa ×1. Varsayılan boy: gözde 0,5° açı.                                                                                                                                                                                                                                                                                                                                                                                                                      | [A] aynı sayfa                                                                                            |
| Netflix, genel kurallar      | En çok 2 satır. Altyazı en az 5/6 sn, en çok 7 sn ekranda kalır. Yazı ortalanır, ekranın altına ya da üstüne konur.                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [A] https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617                                    |
| Netflix, İngilizce (ABD)     | Satırda 42 karakter. Yetişkin içerikte en çok 20 karakter/sn, çocuk içeriğinde 17. Satır kırmada alt satırı uzun "piramit" biçim tercih edilir.                                                                                                                                                                                                                                                                                                                                                                                                                             | [A] https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977                                    |
| **Netflix, Türkçe**          | Yetişkin içerikte **17 karakter/sn**, çocuk içeriğinde 13; işitme engelliler için altyazıda (SDH) 20 / 17. Ekrana 42 karakter sığacak yazı boyu. Satır kırma kuralları: belirteçlerden (gibi, diye, benzeri) önce kırılmaz; isim ile sıfatı ya da tanımlığı ayrılmaz; tek kısa kelimelik satır bırakılmaz. Şapka işaretleri (kâğıt, rüzgâr) zorunlu.                                                                                                                                                                                                                        | [A] https://partnerhelp.netflixstudios.com/hc/en-us/articles/215342858-Turkish-Timed-Text-Style-Guide     |
| UNE 153010 (İspanya)         | 37 karakter/satır (2023 sürümünde 35–42 deniyor); başvuru değeri 15 karakter/sn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [B]                                                                                                       |
| Material Design (eski sürüm) | Koyu karartma %20–40, açık karartma %40–60 saydamlıkta. Geçişin orta noktası koyu uca 3/10 uzaklıkta. Bantlaşmayı önlemek için geçiş uzun tutulur (uygulama çubuğu yüksekliğinin 3 katı). Bütün resmi değil, yalnızca yazının altını karartın.                                                                                                                                                                                                                                                                                                                              | [B] https://m1.material.io/style/imagery.html (aynası)                                                    |
| Apple HIG – Materials        | "Clear" cam parlak içeriğin üstündeyse arkasına %35 saydamlıkta koyu bir karartma katmanı konur. "Regular" materyal arka planı bulanıklaştırıp parlaklığını ayarlar. Kalın materyal ince ayrıntılı metin için daha iyi kontrast verir. Materyal üstünde "vibrant" renkler kullanılır.                                                                                                                                                                                                                                                                                       | [A] https://developer.apple.com/design/human-interface-guidelines/materials                               |

### 2.2 Araştırmalar

- **Sawyer, Wolfe, Dobres, Chahine, Mehler, Reimer, Ergonomics 2020**, "Glanceable, legible typography over complex
  backgrounds" [A, özeti okudum] (Europe PMC üzerinden; PubMed çerez istedi):
  - Ara katman yöntemlerinden **Gauss bulanıklığı ve yarı saydam karartma** okunabilirliği en çok artırıyor.
  - İkisinin en iyi bir karışımı var.
  - Harfe yapışık yöntemlerde **gölge** önde.
  - Makalenin tam metnini okumadım; kesin oranları bilmiyorum.
- **Apple'ın terk edilmiş patent başvurusu US20160358592A1** [A]:
  - Karmaşıklık ölçüsü: Sobel türeviyle bölgenin ortalama parlaklık değişimi.
  - Ek ölçüler: ortalama açıklık, koyu yazıyla açıklık farkı, renk tonu gürültüsü.
  - Sınıflar ve davranış:
    - **Karmaşık** bölge: beyaz yazı, gölge ve geçişli yarı saydam katman.
    - **Sade koyu** bölge: beyaz yazı ve gölge.
    - **Sade açık** bölge: koyu yazı; renk tonu resmin en yaygın tonundan alınır.
  - Gölgenin saydamlığı bölgenin parlaklığına göre ayarlanabilir.
  - Başvuru terk edildiği için patent engeli yok [A/C].
- **TU Delft, 2025** göz izleme çalışması [B; depo 503 verdi]: yazı boyu, stil ve zeminin karmaşıklığı birlikte etki
  ediyor; düz metinde gölge okunabilirliği artırıyor; arkalık kutusunun saydamlığı ölçülebilir bir fark yaratmıyor
  (https://repository.tudelft.nl/record/uuid:b9e5e25d-08a2-4fae-ba1d-ec97f0da3601).
- **Scharff ve ark.** (NASA bağlantılı) [B]: yazının kontrastı ile zeminin RMS kontrastını birleştiren bir "maskeleme
  indeksi", arama süresini ikisinden ayrı ayrı çok daha iyi tahmin ediyor. Dolayısıyla tek bir kontrast oranı yetmez;
  zeminin dokusu da ölçülmeli [C].

### 2.3 Teknikler (nasıl yapılır)

- **Karartma (scrim)**: yazının altına yerel bir geçiş konur. Bütün resmi karartmak hem Material'e göre yanlış [B] hem
  de Lyraska sahibinin "resim" deneyimini bozar [C].
- **Arkayı bulanıklaştırma** (`backdrop-filter: blur()`): CSS'te kolay. WebView2'de büyük alanda kare hızına mal
  olabilir; ölçülmeli [C].
- **Kontur**: `-webkit-text-stroke` ile `paint-order: stroke fill` birlikte kullanılınca kontur dolgunun arkasına geçer
  ve harfin içini yemez. `paint-order` Mart 2024'ten beri bütün tarayıcılarda var [A]
  (https://developer.mozilla.org/en-US/docs/Web/CSS/paint-order).
- **Gölge**: `text-shadow`. Araştırmaya göre harfe yapışık yöntemlerin en iyisi [A].
- **Resme göre yazı rengi**: patent yöntemi (§2.2) ya da Lyraska'daki `photoMeasure` işçisine bir "yazı bölgesi
  ölçümü" eklenmesi [C].
- **WebGL'de yazı**: Valve'ın SDF (işaretli uzaklık alanı) yöntemi (Green, SIGGRAPH 2007) ile kontur, gölge ve ışıma
  gölgelendiricide ucuzca yapılır [B] (https://cdn.akamai.steamstatic.com/apps/valve/2007/SIGGRAPH2007_AlphaTestedMagnification.pdf).
- **Kullanıcı tercihleri**: `prefers-reduced-transparency`, Windows'taki "Saydamlık efektleri" ayarına bağlıdır; MDN
  bunu henüz deneysel ve kısıtlı destekli sayıyor [A]
  (https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency). WebView2'de denenmeli [C].

---

## 3. Kullanıcı ayarları (UX)

- **FCC 47 CFR 79.103(c)**, en kapsamlı yasal liste [A] (https://www.law.cornell.edu/cfr/text/47/79.103):
  - Yazı rengi: en az 8 renk (beyaz, siyah, kırmızı, yeşil, mavi, sarı, macenta, camgöbeği).
  - Yazı saydamlığı: opak ya da yarı saydam.
  - **Boyut %50–200.**
  - Yazı tipleri.
  - Arka plan rengi ve saydamlığı: opak, yarı saydam ya da saydam.
  - **Kenar stilleri:** yok, kabartma, çukur, düz kontur, gölge.
  - Pencere rengi ve saydamlığı.
  - **Önizleme ve ayarın değiştirilene kadar saklanması.**
- **YouTube** [A/B] (https://support.google.com/youtube/answer/100078):
  - Yazı tipi, renk, saydamlık ve boyut.
  - Arka plan rengi ve saydamlığı; pencere rengi ve saydamlığı.
  - Kenar stili: gölge, kabartma, çukur, kontur.
  - "Sıfırla" düğmesi.
- **Netflix** [B] (https://help.netflix.com/en/node/100267):
  - Ayarlar profil başına: yazı tipi, boyut (küçük / orta / büyük), gölge, arka plan.
  - Televizyonda hazır stiller: gölge, koyu, kontrast (siyah üstüne sarı), açık (beyaz üstüne siyah).
- **Windows** [B] (https://www.makeuseof.com/change-caption-settings-windows/): Ayarlar > Erişilebilirlik > Altyazılar.
  Yazı, Arka plan ve Pencere sekmeleri var; renk, saydamlık, boyut, yazı tipi ve efekt ayarlanır; değişiklik hemen
  uygulanıp kaydedilir.
- **Apple** [B]:
  - Hazır stiller: Classic, Large Text, Outline Text, Transparent Background.
  - Kendi stilini oluşturabilirsin: yazı tipi, boyut, renk, arka plan, saydamlık, kenar stili, vurgu.
  - Apple'ın Mac yardımına göre "Outline Text" Japonca altyazıda özellikle işe yarıyor [B]
    (https://support.apple.com/guide/mac-help/change-captions-preferences-for-accessibility-mh43180/12.0/mac).
- **Söz oynatıcılarının ayarları:**
  - Spicetify lyrics-plus [A]: gecikme, boyut, hizalama, öncesi ve sonrası kaç satır, bulanıklık, renkler, arka plan.
  - LyricsX [A]: yazı tipi, renk, konum, gecikme.
  - TJ노래방 [B]: söz ve arka plan rengi.
  - Youka [A]: aynı anda kaç satır gösterileceği, dikey konum, televizyon taşması için kenar payı, düette her şarkıcının
    kendi konumu ve rengi.
- **Önemli ayarlar ve iyi varsayılanlar** [C, kaynaklara dayanarak]:
  1. **Boyut**: %50–200 arası sürgü. Varsayılan, 16:9 ekranda yüksekliğin yaklaşık %7–8'i (BBC'nin yazım boyu).
     Masaüstünde BBC bunu ×0,6 küçültüyor; yani 1080p'de satır yüksekliği yaklaşık 45–50 px, yazı yaklaşık 36–40 px.
  2. **Konum**: alt, orta, üst; resim sahnesinde "otomatik" (§0 madde 7).
  3. **Okunabilirlik stili**: Otomatik (varsayılan) / Gölge / Kontur / Şerit (siyah kutu) / Cam (bulanık arka).
  4. **Satır sayısı**: 1 / 3 / tam liste.
  5. **Karaoke dolumu**: açık / kapalı. Kapalıyken yalnızca satır vurgulanır. Ayrıca "tüm metni oku" görünümü.
  6. **Gecikme ayarı**: Lyraska'da var (Alt+←/→).
  7. Ayarlar canlı önizlemeyle değişir ve kalıcıdır.

---

## 4. Dillere göre notlar

Kullanılan sorgular ve öne çıkan bulgular aşağıda.

**İngilizce.** Sorgular: "Apple Music lyrics design word-by-word highlight spring animation blur how it works",
"Netflix Timed Text Style Guide…", "Material Design text protection scrim…", "study legibility of text overlaid on
images…", "Apple Human Interface Guidelines materials vibrancy…", "YouTube caption settings…", "FCC closed captioning
display standards…", "Windows 11 captions style settings…", "YouTube Music lyrics time-synced…", "Amazon Music X-Ray
lyrics Tidal…", "Spotify lyrics redesign background color…", "TextAlive App API kinetic typography…", "KaraFun lyrics
display settings…", "Smule lyrics display duet…", "karaoke lyric wipe design convention countdown…", "Codrops tympanus
kinetic typography…", "Dribbble OR Behance lyrics player UI concept…", "lyric video design best practices…", "APCA Lc
contrast…", "Valve Green 2007 … signed distance field…", ayrıca Reddit, Spotify forumu ve Hacker News (Algolia)
aramaları.

**Japonca.** Sorgular: "LINE MUSIC 歌詞 カラオケ 表示 1文字ずつ 色が変わる 機能", "Apple Music風 歌詞 アニメーション 実装 Qiita
OR Zenn", "カラオケ 歌詞テロップ 色変わり ワイプ 先行 表示 タイミング 仕組み", "Zenn 歌詞 同期 表示 Web カラオケ 実装 LRC".
Bulgular:

- TextAlive ve Magical Mirai programlama yarışması dünyanın en ciddi "söz uygulaması" laboratuvarı. Rhyme Traveler'ın
  fikirleri §1.6'da [A].
- Japon karaoke patentleri, renk değişiminin zamanlanmasını anlatıyor [B].
- LINE MUSIC'te karaoke ve puanlama var [B].
- Apple, Japonca için kontur stilini öneriyor [B].
- Qiita'da konuya özel bir yazı bulamadım.

**Korece.** Sorgular: "멜론 실시간 가사 하이라이트 글자 크기 설정 지니 가사 보기", "노래방 가사 자막 색 바뀜 타이밍 TJ 금영 가사 표시
방식", "velog 가사 싱크 애니메이션 구현 애플뮤직 가사 스타일", "멜론 지니 가사 글자 크기 키우기 가사 화면 설정 노래방 모드 싱크".
Bulgular:

- Melon'un zamanlı söz biçimi `.slf`, Genie'ninki `.irc` [B].
- TJ uygulamasında söz ve arka plan rengi seçilebiliyor [B].
- velog'da uygulama yazısı bulamadım.
- Kore kaynakları bu konuda zayıf çıktı.

**Çince.** Sorgular: "网易云音乐 逐字歌词 yrc 格式 QQ音乐 qrc 酷狗 krc 逐字 解析", "仿 Apple Music 歌词 效果 实现 弹簧 模糊 逐字 知乎 OR
bilibili", "zhihu.com Apple Music 歌词 动效 实现 原理 逐字 渐变 遮罩", "V2EX 歌词 Apple Music 风格 AMLL 体验", "QQ音乐 网易云音乐 歌词页
沉浸式 动态歌词 逐字歌词 上线 功能 新版". **En önemli dil budur.**

- En iyi açık kaynak "Apple Music gibi" söz işleri Çin topluluğundan çıkıyor: AMLL, Lyricify, SPlayer, YesPlayMusic,
  BetterLyrics, amll-ttml-tool.
- Hece hece söz biçimleri (QRC, YRC, KRC, Lyricify Syllable) arka vokal ve düet bilgisini de taşıyor [A].
- Lyricify'ın "nefes noktası" kuralı: 5 saniyeden uzun boşlukta boş satır eklenir [A].
- Flutter'daki `flutter_lyric` 4.1.0 sürümüne Apple Music tarzı hareket eklendi [B] (https://pub.dev/documentation/flutter_lyric/4.1.0/).
- Zhihu ve Bilibili arama sonuçlarında çıkmadı; buralardan bulgu yok.

**İspanyolca.** Sorgular: "letras sincronizadas diseño animación karaoke reproductor código abierto estilo Apple
Music", "subtitulado legibilidad norma UNE 153010 caracteres por línea velocidad de lectura". Bulgular:

- UNE 153010: 37 karakter/satır (yeni sürümde 35–42), 15 karakter/sn [B].
- Electron tabanlı, CSS ile biçimlenen bir söz aracı [B] (https://www.genbeta.com/herramientas/este-sencillo-widget-permite-tener-letras-tus-canciones-favoritas-escritorio-asi-funciona).

**Türkçe.** Sorgular: "senkronize şarkı sözleri görünümü müzik çalar Apple Music tarzı sözler kelime kelime", "Türkçe
altyazı standartları satır başına karakter sayısı okuma hızı saniyede karakter". Bulgular:

- Resmî bir Türk altyazı standardı (RTÜK, TSE) bulamadım.
- En iyi Türkçe kaynak Netflix'in Türkçe kılavuzu [A]: 17 karakter/sn ve Türkçeye özgü satır kırma kuralları (§2.1).
- Türk basınında yalnızca Apple Music, YouTube Music ve Spotify'ın söz özelliklerine dair haberler var [B]
  (https://www.webtekno.com/youtube-music-sarki-sozleri-goruntuleme-android-ios-h88697.html).

---

## 5. Lisanslar

| Proje                                                             | Lisans                                                                 | Lyraska için durum                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| AMLL (`@applemusic-like-lyrics/*`, core, react, vue, lyric, ttml) | **AGPL-3.0-only** [A]                                                  | **Kod kullanılamaz.** Yalnızca fikir ve matematik, kendi kodumuzla yazılır.             |
| SPlayer                                                           | **AGPL-3.0** [A]                                                       | Kullanılamaz                                                                            |
| Spicy Lyrics                                                      | **AGPL-3.0** [A]                                                       | Kullanılamaz                                                                            |
| TextAlive App API                                                 | Özel koşullar, çevrimiçi Songle API'si, ticari kullanım danışmayla [A] | Kullanılamaz                                                                            |
| amll-ttml-tool                                                    | GPL-3.0 [A]                                                            | Uyumlu (düzenleyici; ilham kaynağı)                                                     |
| BetterLyrics                                                      | GPL-3.0 [A]                                                            | Uyumlu; ama C# ve Win2D, yalnızca fikir                                                 |
| Better Lyrics (YouTube Music uzantısı)                            | GPL-3.0 [A]                                                            | Uyumlu (JS ve CSS)                                                                      |
| Spicetify (`spicetify/cli`, lyrics-plus)                          | LGPL-2.1 [A]                                                           | GPL-3 ile birleştirilebilir [C]; kaynak gösterilir                                      |
| YouLy+                                                            | **MIT** [A]                                                            | Uyumlu; telif satırı korunur                                                            |
| YesPlayMusic                                                      | **MIT** [A]                                                            | Uyumlu                                                                                  |
| Lyricify-Backgrounds, Lyricify-Lyrics-Helper                      | **Apache-2.0** [A]                                                     | Uyumlu (GPL-3 ile); NOTICE dosyası gerekebilir                                          |
| am-lyrics                                                         | MPL-2.0 [A]                                                            | Uyumlu, dosya düzeyinde copyleft                                                        |
| LyricsX                                                           | MPL-2.0 [A]                                                            | Uyumlu (Swift; fikir)                                                                   |
| Unilyric                                                          | MIT [A]                                                                | Uyumlu                                                                                  |
| lrclib                                                            | MIT [A]                                                                | Çevrimiçi bir hizmet; sahibinin kararı "program söz indirmez"                           |
| AMLL içindeki yay çözücü                                          | Dosyasında "MIT License github.com/pushkine/" yazıyor [A]              | Sönümlü yayın kapalı formülü ders kitabı bilgisi; Lyraska'da zaten var (`springOffset`) |
| Apple'ın patent başvurusu US20160358592A1                         | Terk edilmiş [A]                                                       | Engel yok                                                                               |

---

## 6. Lyraska için somut öneriler

Bağlam: Lyraska'da şu anda söz görünümleri Takımyıldız, Lir ve Sade. Yay hareketi zaten var (ζ = 0,86); uzun hece
vurgusu, meteor ve takımyıldız efektleri de var. "Kendi resmin" sahnesinde söz tek satır, Michroma yazı tipiyle.
Sahibi "Mürekkep" görünümünü reddetti; görsel seçenekler ona gerçek boyutta, yan yana gösterilmeli (BILGI-BIRIKIMI).

Her öneride efor ve risk var. Efor: S = küçük, M = orta, L = büyük.

1. **Kendiliğinden ayarlanan okunabilirlik ("Kendi resmin")** — Efor **M**.
   - Yapılacak: `photoMeasure` işçisine yazı bandının parlaklık, Sobel karmaşıklığı ve renk tonu ölçümü eklenir.
     Sonuca göre üç sınıftan biri seçilir: sade koyu (beyaz + gölge), sade açık (koyu yazı), karmaşık (beyaz + gölge +
     yerel karartma ve isteğe bağlı bulanıklık).
   - Test: WCAG 4,5:1 ya da APCA Lc ≥ 75 hedefi, tek tonlu, beyaz, gürültülü ve yarı açık yarı koyu resimlerle sınanır.
   - Hareketli arka planda sınıf her karede değil, zarfa göre seçilir; titreşmemesi için histerezis (gecikmeli
     geçiş) kullanılır.
   - Risk: Sınırdaki resimde sınıf gidip gelebilir; histerezis gerekli. Güvenli modda karartma yavaş değişmeli.
2. **Yumuşak kenarlı kelime dolumu** — Efor **S–M**.
   - Yapılacak: Kelimeler şimdi saydamlıkla ayrılıyor. Bunun yerine, kenarı satır yüksekliğinin yaklaşık 0,5'i kadar
     yumuşak, kelime süresince soldan sağa kayan bir `mask-image` geçişi kullanılır.
   - Zaman tek bir CSS değişkeniyle sürülür (`--t`); her karede DOM'a dokunulmaz.
   - Risk: WebView2'de maske canlandırmanın maliyeti ölçülmeli. React 19'da kareye yetişme dersi
     (BILGI-BIRIKIMI) burada da geçerli.
3. **Satırlar arası süreye bağlı yay ve merdiven gecikmesi** — Efor **S**.
   - Yapılacak: Şu anki sabit ζ = 0,86, satırlar arası süreye göre yaklaşık 0,73–0,85 arasında değişir. Satırlar
     ~50 ms arayla sırayla kayar.
   - Yay `linear()` easing'e çevrilerek tarayıcıya bırakılabilir (YouLy+ yöntemi, MIT).
   - Risk: "Animasyonları azalt" açıkken yay kapalı kalmalı.
4. **Derinlik bulanıklığı ve ölçek** — Efor **S**.
   - Yapılacak: Uzak satırlara satır başına yaklaşık 1 px, en çok 4–5 px bulanıklık; etkin satır ×1,03–1,1 büyür.
   - Risk: Çok satırlı görünümlerde `filter: blur` pahalı olabilir; yalnızca görünen satırlara uygulanır (AMLL de
     görünmeyenleri atlıyor).
5. **Vuruşa bağlı nefes noktaları ve geri sayım** (Lyraska'ya özgü) — Efor **M**.
   - Yapılacak: 5 saniyeden uzun söz boşluğunda üç nokta belirir. Noktalar şarkının vuruş ızgarasıyla nefes alır;
     satırdan önceki son ölçüde 4-3-2-1 diye dolar.
   - Risk: Ritim analizinde 2 katı / yarısı tempo hatası olursa (ACIK-KONULAR) geri sayım yanlış hızda akar; ölçü
     güveni düşükse sade nefes görünümüne düşülmeli. Güvenli modda en çok 1 nabız/sn.
6. **Uzun hece vurgusunu güçlendirme** — Efor **S**.
   - Yapılacak: Vurgunun gücü süreye göre ölçeklenir (kısada küp, uzunda karekök eğrisi), bir tavanı olur, satırın son
     kelimesi 1,5 kat güçlü vurgulanır. Harfler ortadan dışa doğru hafifçe itilir.
   - Risk: Güvenli modda ışıma yok; yalnızca yükselme olur.
7. **Okunur satır kırma (Türkçe kurallarla)** — Efor **S**.
   - Yapılacak: Satır başına en çok ~42 karakter. `text-wrap: balance` ya da kendi kırma kuralımız kullanılır: "gibi,
     diye, için, kadar" gibi kelimelerden önce kırılmaz, tek kelimelik satır bırakılmaz.
   - "Kendi resmin" sahnesindeki küçültme ve kaydırma (`lyricFit` / `lyricPan`) yerine iki dengeli satır seçeneği sunulur.
   - Risk: Sahibi tek satırı beğenmişti; bu bir seçenek olarak sunulur, varsayılan değiştirilmez.
8. **Resme göre yerleşim** — Efor **M–L**.
   - Yapılacak: Resmin dikkat haritası (yüz ve kenar yoğunluğu gibi basit ölçülerle, modelsiz) ile kontrast haritası
     birleştirilir; söz bandı, öznenin yakınında ama onu örtmeyen ve kontrastı en yüksek yere konur. Yer şarkı boyunca
     sabit kalır (UIST 2023, DG4/6/7).
   - Risk: Beklenmeyen yerleşim sahibinin hoşuna gitmeyebilir; elle "alt/orta/üst" seçimi her zaman kalmalı.
9. **Söz ayarları paneli** — Efor **M**.
   - İçerik: boyut (%50–200), konum, stil (Otomatik / Gölge / Kontur / Şerit / Cam), saydamlık, satır sayısı, karaoke
     dolumu açık/kapalı, "tüm metni oku" görünümü, canlı önizleme; ayarlar `settings.json`'da saklanır.
   - Risk: Çok ayar karmaşa yaratır; hazır stiller önde, ayrıntılar "Gelişmiş" altında olmalı.
10. **Kapaktan türeyen arka plan (resim yokken)** — Efor **M**.
    - Yapılacak: Lyricify-Backgrounds (Apache-2.0) ya da YesPlayMusic (MIT) yolu WebGL2'ye taşınır: üç dönen katman,
      büyük bulanıklık, doygunluk ayarı ve bantlaşmayı önleyen gürültü (dither).
    - Risk: 60 fps hedefi ölçülmeli; bulanıklık düşük çözünürlükte yapılmalı. Sahibi galeri sahnelerini ayrı
      değerlendiriyor; önce ona sorulmalı.
11. **Arka vokal ve düet düzeni** — Efor **M–L**.
    - Yapılacak: Kullanıcının düzenlediği sözlerde parantez içi satırlar (örneğin "(Hey!)") arka vokal sayılır, daha
      küçük ve soluk yazılır. Düet için satır başına "[A]/[B]" etiketiyle sol ve sağ hizalama yapılır.
    - Veri modeline `isBg` ve `singer` alanları eklenir (AMLL'deki `isBG/isDuet` fikri).
    - Risk: Otomatik hizalama (CTC) paralel satırları desteklemiyor; arka vokalin ayrı zamanlaması zor.
12. **Çeviri ve okunuş satırı** — Efor **S–M**.
    - Yapılacak: Kullanıcı bir çeviri de yapıştırabilir; çeviri satırı, asıl satırın altında 0,6 em boyunda ve soluk
      gösterilir (Spotify ve Apple örneği).
    - Risk: Satır eşleme kullanıcının elinde. İnternet kullanılmaz, çeviri hizmeti yok.
13. **WebGL'de SDF yazı efektleri** (ışıyan, kırılan, parçacığa dönen harfler) — Efor **L**.
    - Risk: Türkçe harf ve yazı tipi atlası ile kerning sorunları; yüksek. Sahibi "Mürekkep"i reddetti, bu yüzden
      soyut efektlerde temkinli olunmalı.
14. **Güvenlik ve erişilebilirlik uyumu** (her maddeye eklenmeli) — Efor **S**.
    - Güvenli modda ışıma ve vurgu nabzı en çok 1/sn, karartma yavaş değişir.
    - `prefers-reduced-motion` açıkken yay, merdiven gecikmesi ve kayma kapanır.
    - `prefers-reduced-transparency` açıkken daha kalın karartma kullanılır.
    - WCAG 2.2.2 gereği söz katmanı tek tuşla gizlenebilmeli (zaten var olabilir; denetlenmeli).

---

## 7. Açamadığım sayfalar ve sınırlar

- **Reddit:** Hiçbir yoldan erişilemedi (araç engeli). Reddit bulgusu yok.
- **uxplanet.org** (Spotify renk seçimi yazısı): 403.
- **TU Delft deposu:** 503.
- **Poweramp forumu:** 403.
- **AIST CHI 2023 PDF'i:** bağlantı koptu.
- **BBC:** WebFetch açamadı; curl ile indirip okudum.
- **eCFR:** yönlendirme yüzünden açılmadı; aynı metni Cornell LII'den okudum.
- **PubMed:** çerez istedi; özeti Europe PMC'den okudum.
- **Apple newsroom HTML sayfası:** 404; PDF'ini okudum.
- **help.netflix.com/node/32930:** 404; Netflix ayarları yalnızca arama özetinden [B].
- **Spotify forum başlığı:** içeriği boş geldi.
- **StarMaker, KaraFun, Melon/Genie ayarları, Kanade:** birincil kaynak bulunamadı.
- **Apple'ın söz canlandırması:** Apple bunu hiçbir yerde belgelemiyor; bu konudaki her iddia [B] ya da AMLL üzerinden
  yapılmış bir tahmindir.
