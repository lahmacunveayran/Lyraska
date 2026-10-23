# Lyraska mimarisi

Bu belge programın nasıl çalıştığını ve hangi kuralın neyle denetlendiğini anlatır. Amaç: her yeni aşama
sağlam bir zeminde başlasın, hata birikmesin. Kurallar `CLAUDE.md`'dedir; burada **neden** ve **nasıl
denetlendiği** yazar.

## Genel görünüm

Program iki parçadır ve tek bir Windows penceresinde birlikte çalışır:

- **Çekirdek (Rust, `src-tauri/`):** ses, analiz, kütüphane, ayarlar. Ağır işin hepsi burada.
- **Arayüz (React + TypeScript, `src/`):** gösterir ve komut gönderir. Hesap yapmaz, sesi işlemez.

İkisi Tauri komutlarıyla konuşur: arayüz `invoke("komut", { … })` çağırır, çekirdek yanıtı JSON olarak döner.

```
Arayüz (WebView2)                         Çekirdek (Rust)
───────────────────                       ──────────────────────────────────────────────
PlayerScreen ── usePlayback ── invoke ──▶ commands.rs (ince) ──▶ audio::player
     │          useLibrary                                    ──▶ library::service
     │          useSongMap                                    ──▶ analysis (önbellek)
     └─ sahneler ─ useVisualFeed ─ her karede visual_frame ──▶ visual_bridge
                   (MilkDrop) ─ her karede visual_waveform ──▶ audio::player (dalga dokunuşu, ham bayt)
                              └─ görsel açılınca milkdrop_load ──▶ milkdrop (kullanıcının .milk dosyası → JSON)
```

## İş parçacıkları

| İş parçacığı                | Ne yapar                                                   | Kural                                       |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| Tauri komutları             | Arayüzün isteklerini karşılar                              | Kısa sürer; ağır işi arka plana verir       |
| Çözme (`player.rs`)         | Dosyayı çözer, boşluksuz geçiş, hız dönüştürme             | Halka tampona (rtrb) yazar                  |
| ↳ dalga dokunuşu            | Halkaya gidenin 44,1 kHz kopyası (`audio/waveform.rs`)     | Önceden ayrılmış halka; kısa kilit          |
| **Ses çıkışı**              | Halka tampondan okur, EQ, eşitleme, aygıta yazar           | **Gerçek zamanlı:** ayırma/kilit/panik yok  |
| Analiz (şarkı açılınca)     | Spektrum, seviye, vuruş, şarkı haritası, LUFS, ton         | Sonuç önbelleğe yazılır                     |
| Hızlı ölçüm                 | Yalnızca ses yüksekliği (EBU R128), FFT'siz                | İlk sesten önce bitsin diye ayrı ve hızlı   |
| Arka plan analizi           | Kütüphaneyi düşük öncelikle analiz eder                    | Çalan → sıradaki → geri kalan               |
| Kütüphane taraması          | Klasörleri tarar, etiketleri okur                          | Değişmeyeni atlar                           |
| Kör test besleme (`abx.rs`) | Bellekteki iki bölümden A, B ya da X'i halka tampona yazar | Gerçek zamanlı değil; çıkış işlemsiz yoldan |

## Ses yolu

```
dosya ─▶ symphonia (çözme) ─▶ f64 ─▶ boşluksuz kırpma ─▶ rubato (aygıt hızına) ─▶ halka tampon
      ─▶ [ses çıkışı] kulaklık düzeltmesi ─▶ parametrik ekolayzer ─▶ grafik ekolayzer ─▶ bas
      ─▶ crossfeed ─▶ eşitleme × ekolayzer koruması
      ─▶ geçiş (fade) ─▶ taşma koruması (sınırlayıcı) ─▶ f32 ─▶ WASAPI
```

- İç işlem 64-bit kayan noktadır; dönüşüm yalnızca çözme girişinde ve aygıt çıkışında yapılır.
- EQ, kulaklık ve eşitleme ayarları ses iş parçacığına kilitsiz (atomik) iletilir; değişiklik yumuşakça uygulanır.
- **Süzgeç tasarımı** (`audio/biquad.rs`): sekiz tür (tepe, alçak/yüksek raf, alçak/yüksek/bant geçiren, çentik,
  tüm geçiren), iki yöntem:
  - RBJ: Equalizer APO ve AutoEq'in formülleri; kulaklık profillerinin varsayılanı (APO ile bire bir aynı ses).
  - Eşlenmiş: kutuplar analog kutupların tam karşılığı (z = e^{sT}); pay, genliğin karesinin φ-tabanındaki doğrusal
    yazılışıyla DC, merkez ve Nyquist'te ya da en küçük karelerle analog eğriye eşlenir (Vicanek 2016). Birkaç aday
    duyulur bantta analog eğriye göre ölçülür, en yakını seçilir; RBJ de aday olduğu için hiçbir ayarda RBJ'den uzak
    değildir. 44,1 kHz'te ortalama sapma: tepe 0,70 → 0,16 dB, raflar ~0,6 → ~0,2 dB, alçak geçiren
    3,97 → 0,16 dB, bant geçiren 4,06 → 0,33 dB (`biquad::tests::dogruluk_tablosu`).
- **Elle parametrik ekolayzer** (`audio/peq.rs`, arayüz `ParametricEq.tsx`): en çok 20 bant, sekiz tür, varsayılan
  eşlenmiş tasarım (çizilen eğri duyulan eğridir). Kulaklık düzeltmesiyle aynı kilitsiz kanal (`PeqControl`) ve
  30 ms çapraz geçiş. En büyük yükseltme taşma korumasına bildirilir (grafik ekolayzerinkiyle toplanır).
  Karşılaştırma (A/B): filtreler atlanır, ses ekolayzerin pembe gürültüde ve BS.1770 K ağırlığında ölçülen ses
  yüksekliği farkı kadar değiştirilir; iki taraf eşit yükseklikte ve aynı korumayla dinlenir. Equalizer APO
  biçiminde içe/dışa aktarılır. Görseller (spektrum) parametrik ekolayzeri de yansıtır.
- **Crossfeed** (`audio/crossfeed.rs`, 0.0.54; arayüz `CrossfeedStrip.tsx`, Ekolayzer panelinde kulaklık
  düzeltmesinin altında): orta/yan biçimi; orta (mono) bileşen bit bit aynı, yan bileşen
  G(s) = (s + ωc(1 − r0))/(s + ωc(1 + r0)) süzgecinden geçer. Bu, sola kaydırılmış seste kulaklar arası oranı tam
  ρ = r0/(1 + s/ωc) yapar (alçak frekansta seviye farkı −20·log₁₀ r0, zaman farkı 1/ωc) ve |G| ≤ 1'dir: hiçbir
  frekans yükselmez. Hazır ayarlar bs2b'nin değerleri ve küresel baş modeline (Brown–Duda, ±30°) uyum.
  - Ses yolunda bastan sonra, eşitlemeden önce; kilitsiz kanal (`CrossfeedControl`), ayar değişince 30 ms çapraz
    geçiş. Yalnız stereo; bit-perfect'te atlanır. Kapalıyken ses bit bit aynı.
  - Korumaya pay bildirilmez (frekansta yükseltme yok). Örnek tepesinin kesin sınırı ‖g‖₁ = 2·b0 − G(1) < 2:
    yalnız ters fazlı tam ölçekli kare dalga yaklaşır (Orta +4 dB), sola kaydırılmış davulda aşma yok, tam ölçekli
    geniş gürültüde ~1,6 dB. Bu seyrek aşmaları sınırlayıcı yakalar (`crossfeed::tests::ornek_tepesi_siniri_dogru`).
  - Ekrandaki eğri (aynı kulak / karşı kulak) çekirdeğin 96 kHz'teki sayısal süzgecinden; sürgü sürüklenirken arayüz
    aynı analog formülle anında çizer (`lib/crossfeed.ts`: yakın kulak 1/(1 + ρ), karşı kulak ρ/(1 + ρ)).
- **Kulaklık profili okuma** (`audio/peq.rs`): Equalizer APO biçimi, APO'nun kaynak kodundaki anlamlarla: LSC/HSC
  orta frekanslı, LS/HS köşe frekanslı raf; eğim ("6 dB" → S = 0,5) ya da Q'suz rafta S = 0,9; tepe süzgecinde
  "BW Oct"; LP/HP/BP'de Q yoksa 0,707, çentikte 30.
- **Ses yüksekliği eşitlemesi** (`audio/loudness.rs`, `audio/normalize.rs`):
  - Her şarkının EBU R128 yüksekliği (LUFS) ve gerçek tepesi (dBTP) analizde ölçülür, önbellekte saklanır.
    Önbellekte yoksa şarkı açılınca ayrı bir hızlı ölçüm yapılır.
  - Şarkı −14 LUFS'e getirilir; yükseltme gerçek tepeyi −1 dBTP'nin üstüne çıkarmaz.
  - Ekolayzer artık sesi kendisi kısmaz; yalnızca en büyük yükseltmesini bildirir. Eşitlemenin tepeye açtığı
    boşluk yetiyorsa hiç kısılmaz, yetmezse yalnızca eksik kadar kısılır (hızlı iner, yavaş kalkar).
  - Oturumdaki her şarkının akıştaki başlangıç karesi `TrackLevels`'ta tutulur: boşluksuz geçişte kazanç tam
    şarkı sınırında değişir.
  - İlk ses, ölçüm (ya da ilk 5 saniyeden erken tahmin) için en fazla 0,15 sn bekler (sessizlik yazılır, şarkı
    yerinde durur); önbellekteki şarkıda ve sarmada beklenmez. Ölçüm yetişmezse tipik bir kayıt (−10 LUFS)
    varsayılır, ölçüm gelince 1,5 sn'de yavaşça düzelir.
  - Taşma koruması (`audio/limiter.rs`): ileriye bakan sınırlayıcı **örnekler arası** (gerçek) tepeyi 8× ara
    değerleyerek ölçer ve çıkışı −1 dBTP'de tutar (EBU R128 tavanı); gecikme 1,5 ms. Bit-perfect'te yalnızca
    gecikme hattıdır.
- **Bas motoru** (`audio/bass.rs`; ayarları ekolayzerinkinin içinde, aynı kilitsiz kanaldan):
  - Bas düğmesi (0–18 dB; 12'nin üstü kulüp düzeyi): 100 Hz alçak raf.
  - Derinlik (alt oktav): bas bandının (40–160 Hz) periyodu yükselen geçişlerden izlenir ve yarı frekansta bir
    sinüs üretilir (faz izleyici; periyot aralık dışına çıkınca susar) × bandın zarfı, dördüncü dereceden 85 Hz
    süzgeçle yumuşatılır. Seviye notadan bağımsızdır (55 ve 110 Hz arası fark ~1 dB; 3. harmonik −45 dB). Aynı anda
    iki bas notasından yalnız biri izlenir. Bas bandı sesin geri kalanından 40 dB'den kısıksa yumuşakça susar.
  - Vuruş (`audio/punch.rs`, %0–100): davul vuruşunun ilk anı 8 dB'ye kadar güçlenir, sürekli bas aynen kalır.
    Bas bandında (150 Hz altı) bir tepe tutucu (20 ms tutar) vuruşu anında görür; gecikmeli zarf onu ~30 ms
    gecikmeyle izler, inişte birlikte iner. Aradaki fark (1 dB eşiğin üstü) 100 Hz alçak rafı yükseltir; raf
    her 16 örnekte yeniden hesaplanır. Açılınca önce şarkının bas düzeyini öğrenir (150 ms; yanlış vuruş yok).
  - Küçük hoparlör bası: dizüstü hoparlörü 100 Hz altını çalamaz. O bölge dördüncü dereceden süzülür (80 Hz),
    yerine basın 2., 3. ve 4. harmonikleri (Chebyshev polinomları, tepe zarfıyla) eklenir; alt oktav eklenmez.
  - **Akıllı taşma koruması:** her şarkının bas tepeleri tam analizde ölçülür (`BassPeakMeter`: 3–27 dB raflarda
    şarkının tepesi ne kadar yükseliyor, alt oktav bandının tepesi). Koruma bas için en kötü durumu (rafın tamamı)
    değil bu ölçülen artışı kullanır: çoğu şarkıda tepe vokal ve davuldan gelir, bas yükselince ses kısılmaz.
    Vuruşun rafı bas düğmesininkiyle aynı köşede (100 Hz): ikisi tek raf gibi, kazançları toplanarak hesaplanır;
    vuruşun en yüksek anı (en fazla 8 dB) ayrılır. Ölçülen kazançlar bas + vuruşun tavanını kapsar (derlemede denetlenir).
    Ölçüm önbellekte saklanır; yeni şarkının ilk çalınışında birkaç saniye en kötü durum geçerlidir.
  - Ayar değişince raf ~40 ms'de, küçük hoparlör, derinlik ve vuruş geçişleri her örnekte yumuşakça uygulanır
    (tık yok). Sıra: vuruş → bas düğmesi → alt oktav → küçük hoparlör (harmonikler de vuruşlu bastan üretilir).
- **Bit-perfect (özel mod, ayarla açılır):**
  - Aygıt WASAPI özel modda, şarkının kendi hızında açılır; biçim aygıtın kabul ettiği en yüksek tamsayıdır
    (32 → 24 → 16 bit, `output::IntFormat`). Yeniden örnekleme yoktur.
  - Ses çıkışı kulaklık düzeltmesini, ekolayzeri ve eşitlemeyi atlar (`RenderControls.bit_perfect`). Çözücü
    tamsayıları 2'nin kuvvetine böldüğü için çıkışta aynı kuvvetle çarpılan örnekler bit bit aynıdır.
  - Özel mod yoklamalıdır (olay güdümlü özel mod bazı USB aygıtlarda takılır); arabellek ~100 ms.
  - Aygıt biçimi desteklemiyorsa ya da başka program aygıtı tutuyorsa ses paylaşımlı yoldan çalar; neden sinyal
    yolunda (`SignalPath.notice`) yazar.
  - Boşluksuz geçişte hızı farklı şarkı dönüştürülmez: oturum biter, sıradaki şarkı kendi hızında açılır.
- Ses çıkışı 64-bit örnek verir; aygıtın biçimine (32-bit kayan nokta ya da tamsayı) çevirme yalnızca
  `output`'ta yapılır.
- **Kör test (ABX, `audio/abx.rs`):** aynı şarkının iki sürümünü (ör. FLAC ve MP3) hangisinin çaldığını bilmeden
  karşılaştırma.
  - Önce iki dosya hazırlanır; bu sırada şarkı çalmayı sürdürür, test kurulamazsa hiçbir şey değişmez. Sonra çalan
    oturum kapanır (şarkı ve konum saklanır); test bitince şarkı kaldığı yerde duraklatılmış açılır ve arayüz
    oynatıcının durumunu yeniden sorar. Test sürerken bir şarkı açılırsa test kapanır.
  - İki dosyanın seçilen bölümü (2–60 sn) belleğe çözülür ve aygıtın hızına çevrilir. B, 0,5 sn önceden çözülür;
    kayma (MP3 kodlayıcı gecikmesi gibi), A'nın tek kanala indirilmiş ilk 10 saniyesi B içinde FFT çapraz
    ilintisiyle aranarak ±0,5 sn içinde bulunur. Normalleştirilmiş ilinti 0,5'in altındaysa iki dosya aynı kayıt sayılmaz.
  - Ses yükseklikleri (EBU R128) yalnızca kısarak eşitlenir; eşitlemeden sonra iki bölüm aynı oranda kısılarak
    tepe 0,99'un altında tutulur (taşma koruması bu testte yoktur, gerekmez).
  - Besleme iş parçacığı A, B ya da X'i aynı konumdan çalar: değişim 10 ms çapraz geçişle, bölüm sonu 15 ms
    kısma/açmayla. Halka tampon 80 ms: seçim ~100 ms içinde duyulur. Ses çıkışı `RenderControls.bit_perfect` ile
    kulaklık düzeltmesini, ekolayzeri, bas motorunu ve eşitlemeyi atlar.
  - X her denemede rastgele (işletim sisteminin rastgele tohumu) A ya da B'dir. Sonuç yalnızca sonda verilir: tek
    yönlü binom sınaması (16 denemede 12 doğru ≈ %3,8).

## Görsel yolu

- Şarkı açılınca (ya da önceden, arka planda) analiz edilir: spektrum (60 kare/sn), seviyeler, vuruşlar,
  ölçü başları, bölümler, droplar, enerji. Sonuç `analysis::cache`'te saklanır.
- Görsel Yönetmen (`director`) şarkı haritasından her an için bir not çıkarır (atmosfer, ritim, doku).
- Ölçü (`analysis/meter.rs`, `structure.rs`): vuruş takipçisi eşit aralıklı vuruş arar; aksak ölçüde (9/8 = 2+2+2+3)
  iki sekizlikte bir vuruş bulur ve üçlü grupları atlar. Bu yüzden ölçü sekizlik ızgarasında da çözümlenir; aksak
  bulunursa şarkının vuruşları grup başları olur (`BeatGrid`), şarkı haritasında `grouping` ve ölçü başları
  ızgaradan gelir. Her ölçünün bir güveni var (`meter_confidence`); düşükse yönetmen ölçü başını vurgulamaz
  (`Rhythm.bars_confident`), otoyolun lambaları ölçüye kilitlenmez, bilgi kartında ölçü yazmaz.
- Ton (`analysis/key.rs`): tam analizle aynı geçişte uzun pencereli (~0,37 sn) FFT'den kroma; akort kayması
  dairesel ortalamayla bulunur; Krumhansl–Kessler profilleriyle ilinti. Şarkının tonu 15 sn'lik pencerelerin
  oylamasıyla seçilir (ton değiştiren şarkıda iki tonun ortasındaki komşu ton çıkmasın), bölümlerin tonu ayrıca
  hesaplanır. Güveni düşük ton gösterilmez. Arayüz `song_key` ile alır; kütüphane listesi Camelot kodunu
  önbellekteki `camelot` sütunundan okur.
- Açık şarkı haritası (`analysis/map_file.rs`, biçim belgesi `SARKI-HARITASI.md`): harita JSON olarak dışa ve içe
  aktarılır; ses içermez. Eşleşme ses parmak iziyle (`analysis/fingerprint.rs`): analiz karelerinden Haitsma–Kalker
  bant bitleri (15 kare/sn, 24 bit) ve kromadan armoni bitleri (saniyede 12 bit); şarkı yeniden çözülmez. İçe
  aktarılan harita `Spectrogram::set_imported` ile analizin vuruşlarının, yapısının, koreografisinin ve tonunun önüne
  geçer (`beat_grid()`, `song_map()`, `choreography()`); önbelleğe programın analizi yazılır (`saved()`
  `analysis_*` okur). Şarkı açılınca `haritalar/` deposunda dosya damgası tutan harita varsa hemen uygulanır.
- Kinetik şarkı sözleri (`audio/lyrics.rs`, arayüz `LyricsOverlay.tsx`, `lib/lyrics.ts`): sözler şarkı açılınca bir kez
  okunur (yan `.lrc` önce; zamanlı olan seçilir), hiçbir yere yazılmaz. Çekirdek satır ve kelime zamanlarını verir
  (kelime zamanı yoksa hece sayısıyla tahmin); arayüz her karede o anki satırı ve kelimelerin durumunu saf bir
  fonksiyonla hesaplar (`lyricFrame`): satır sıradaki başlayana kadar kalır, arada yumuşakça söner; görünürlük hiçbir
  anda sıçramaz (test). Konum görsellerle aynıdır (ses aygıtının gecikmesi düşülür).
- Arayüz her ekran karesinde `visual_frame` ister; `visual_bridge` çalma konumuna (ekran ve aygıt
  gecikmesi telafi edilerek) karşılık gelen kareyi verir. Görseller ses yolundan veri çekmez.
- **Ham dalga biçimi** (`audio/waveform.rs`, komut `visual_waveform`; MilkDrop/Butterchurn için): analizde dalga
  saklanmaz (4 dakikalık şarkıda kare başına anlık görüntü onlarca MB olurdu), çalarken canlı bir kopya alınır.
  - **Kim yazar:** çözme iş parçacığı. Halka tampona yazdığı her dilimi önce seyreltip dokunuşa yazar. Bu nokta
    aygıt hızına çevrilmiş tek parça akıştır: her örneğin yeri ses çıkışının "duyulan" sayacıyla
    (`output_heard`) aynı karedir; boşluksuz geçişte şarkılar bu akışta art arda gelir. Ses çıkışının gerçek
    zamanlı geri çağrısı dokunuşa hiç dokunmaz (`ses_yolu_bellek_ayirmaz` etkilenmez). Dokunuş ekolayzerden önceki
    sesi görür.
  - **Seyreltme:** aygıt hızı 88,2 kHz ve üstündeyse [1, 2, 1]/4 süzgeçle ikiye bölünür (Nyquist yakını ≥ 30 dB
    bastırılır), sonra doğrusal ara değerle 44,1 kHz'e getirilir. Süzgeçler simetrik: gecikme yok, `j`. örnek
    akışın tam `j · hız / 44100`. karesindedir. 48 kHz'te katlanan bölge yalnız 22,05–24 kHz (görsele etkisi yok).
  - **Halka:** 4 sn (44,1 kHz'te 176 400 kare, sol/sağ `f32`, ~1,4 MB), oturum kurulurken bir kez ayrılır. Gereken:
    halka tampon (2 sn) + aygıt arabelleği (~0,1 sn) ileride, ses gecikmesi (en çok 0,4 sn) + 1024 örnek geride
    → ~2,6 sn; test `dalga_dokunusu_yeterince_uzun` denetler.
  - **Kim okur:** Tauri komut iş parçacığı (`Player::visual_waveform`): `visual_frame` ile aynı an (duyulan +
    ekran gecikmesi − ses aygıtı gecikmesi) ile biten son 1024 örnek; 3 × 1024 bayt (karışım, sol, sağ), WebAudio
    `getByteTimeDomainData` biçimi (128 = sessizlik). Her örneğe ait olduğu şarkının −14 LUFS eşitleme kazancı
    uygulanır (eşitleme kapalı olsa da; sessiz kaydedilmiş şarkıda da dalga görünsün), kırpılır. JSON yerine ham
    yanıt (`tauri::ipc::Response`, arayüzde `ArrayBuffer`).
  - **Eşzamanlama:** kısa bir `Mutex` (iki taraf da gerçek zamanlı değil; yazar bir dilimi, okuyucu 2 × 1024 örneği
    kopyalar, seyreltme kilit dışında). Çözme halka tamponda 2 sn önden gittiği için kısa bekleme sese yansımaz.
  - **Geçersiz kılma:** dokunuş oturuma aittir. Sarma, şarkı açma, aygıt değişimi yeni oturum (yeni akış, boş
    dokunuş) kurar: eski konumun örneği görünmez. Geçiş sürerken ve kör testte boş yanıt; duraklatınca ve şarkı
    bitince sessizlik (hepsi 128). Henüz yazılmamış ya da halkadan çıkmış örnek sessizliktir, eski veri değil.
- Her sahne yönetmen notunun üç katmanını kullanır:
  - Gece göğü (`sky.ts`) ve gece otoyolu (`highway.ts`): bölüm teması, ruh hâli, drop öncesi gerilim ve drop
    açılımı, ölçü başı. Doku: vuruş yoğunluğu akışı (otoyolda kıvrılmayı ve şehri), tizlerin canlılığı yıldızların
    kırpışmasını hızlandırır; yalnızca hız, parlaklık değil.
  - VU ibreleri ve spektrum: ölçerler müziği olduğu gibi gösterir; arkalarındaki ışık "sahne ışığı"dır
    (`stageLight.ts`). Rengi bölüm teması (`--aurora`), gücü ruh hâli; droptan önce hale daralır, drop'ta
    açılır, ölçü başında kabarır (yalnızca boyut). Spektrumda tepe noktaları droptan önce asılı kalır, tizler
    canlıyken çevik düşer.
  - Gece sürüşü (`DriveScene`): ön camda gece otoyolunun aynı çizimi; torpidonun ve teybin ışığı sahne ışığından,
    teybin VU ibreleri ve spektrumu tek görsel veri akışından. Kasetin makaraları çalarken döner ("animasyonları
    azalt"ta durur). Çerçeve açıkken teyp geri planda (kısık), sinema görünümünde yavaşça belirir.
  - Galeri (`shaderScene.ts`, `shaderSources.ts`, `shaderRenderer.ts`, `ShaderScene`): gece denizi, bulutsu, ışık
    tüneli, ateşböcekleri, kaleydoskop, ipek şeritler, sarmal gökada, kum tepeleri, yağmurlu cam, kristal ağ. Her biri tek bir parça gölgelendiricisidir ve gece göğünün saf hesabını
    (`stepSky`) paylaşır: bölüm teması renkleri, gerilim ve açılım biçimi, vuruşlar akışı sürer. Sahnenin kodu
    yalnızca biçimi çizer; parlaklık ortak gövdedeki tek çarpandan gelir (`sceneLevel`: perde parlaklığının hız
    sınırlı, tekdüze dönüşümü; müzik ışığı en fazla %28 güçlendirir). Gölgelendiriciye anlık vuruş seviyesi gitmez.
  - Galeri görünümü ve hazır ayarlar (`sceneLook.ts`, `scenePreset.ts`, `useScenePresets`, galeri panosu
    `SceneGallery`): **hız** (0,5–2×) yalnızca hareketi ölçekler. Gölgelendiriciye akış saati yerine sahnenin kendi
    saati gider: her karede akış saatinin artışının (sarılmada modüloyla) hız katı kadar ilerler ve `foldTime` ile
    katlanır; `stepSky`'a giden süre ölçeklenmez (parlaklığın hız sınırı aynı kalır), kırpışma saati de bilerek
    ölçeklenmez (küçük ışıkların parlaklık değişimi hızlanmasın). **Palet**: bölüm teması ya da sabit özgün palet
    (`--scene-palette-<id>-low/high`); değişince görünen renklerden 1 saniyede doğrusal karışır (renk kanalı
    saniyede en fazla tam ölçek). Sabit paletlerin parlaklığı temalarınkini aşmaz (`sceneLook.test.ts`), sahne
    denetimi iki sahneyi en parlak palette ve 2× hızda da ölçer. Parlaklık parametresi yoktur: parlaklık yalnızca
    `sceneLevel`'dan gelir. Hazır ayarlar ve her sahnenin son görünümü tarayıcı deposunda (`lyraska.scenePresets`,
    `lyraska.sceneLooks`; sürümlü JSON); okunurken doğrulanır (hız sınırlanır, bilinmeyen sahne/palet atlanır,
    en fazla 50 kayıt, ad en fazla 40 karakter).
  - Parlaklığı değiştiren her değer hız sınırlıdır (güvenli modda yarı hız); her sahnenin kendi parlama testi var.

## Epilepsi güvenliği

Kural: hiçbir sahne saniyede 3'ten fazla parlamaz (WCAG 2.3.1: bağıl parlaklıkta ≥ 0,1'lik iki zıt değişim, görüş
alanının ~%25'i büyüklüğünde bir alanda; `lib/flash.ts` sayar). Güvenli modda hedef saniyede ≤ 1.

- **Kendi sahnelerimiz**: parlaklık hız sınırlı tek çarpandan gelir (yukarıda); sessiz → tam ses farkı parlama
  eşiğinin altında kalır (`check:scenes` her temada ölçer).
- **Güvenilmeyen sahneler için parlaklık freni** (`lib/flashGuard.ts`, saf hesap ve kanıt `lib/flashGuardMath.ts`):
  MilkDrop presetleri (butterchurn) gibi parlaklığı müzikten bağımsız sıçrayabilen, CI'da denenemeyen (kullanıcının
  kendi dosyaları) görüntüler için WebGL2 son geçişi. Sahne kendi görünmez tuvaline/dokusuna çizer; görünür tuvale
  yalnızca fren çizer. Görüntü 32×18 hücreye, hücre 8×8 bloğa bölünür; her karede:
  - Ölçüm ekran kartında: girdinin blok ortalamaları (doğrusal RGB), önceki gösterilen görüntünün blok ortalamaları
    (ping-pong durum), hücre başına köşe ağırlıklı parlaklık farkları.
  - Gösterilen piksel `O = H_b + a(b)·(X − H_b)`: önceki gösterilen blok rengiyle yeni görüntünün karışımı. Pay
    `a`, hücre köşelerinde seçilir (köşeye dokunan hücrelerin en küçüğü) ve blok içinde çift doğrusal karışır; fren
    devrede değilken `a = 1`, görüntü bit bit aynı geçer. Parlaklaşmada da ani kararmada da aynı formül.
  - **Sınır (kesin)**: her hücrenin gösterilen ortalama parlaklığı bir karede en çok `r·dt` değişir; hücrelerden
    oluşan her pencerenin ortalaması hücrelerin ağırlıklı ortalaması olduğundan o da. 0,1'lik bir değişim en az
    `0,1/r` sn sürer: saniyede ≤ `r/0,2` parlama; ekranın 8 bit yuvarlaması dahil ≤ `r / (2·(0,1 − 2·0,0045))`.
    Normal mod r = 0,3/sn → ≤ 1,65; güvenli mod r = 0,18/sn → ≤ 0,99. `dt` en çok 0,1 sn sayılır.
  - Saklama: `EXT_color_buffer_float` varsa R32F; yoksa RGBA8'de 24 bit sabit nokta (aynı sınır). Kurulum bir öz
    denetimle biter (beyaz kare siyahtan ancak `r·dt` açılmalı). Kurulamazsa `createFlashGuard` `{ ok: false }`
    döndürür: güvenilmeyen sahne hiç gösterilmez; fren kapatılamaz, sessizce atlanamaz.
  - İlk karede (ya da `reset`) gösterilen siyahtır: sahne en çok `r` hızla belirir (beyaz ekran ~3,3 sn).
  - Bilinen sınırlar: (1) hücre kenarlarına hizasız bir pencerede, kenar hücrelerinin içindeki dağılım bir terim
    ekler; tekdüze ve hücreden büyük ölçekli değişimlerde sıfırdır, köşe ağırlıkları birinci dereceden dağılımı da
    görür; ancak hücre içinde ortalaması ve köşe ağırlıklı toplamları sıfır olan, belirli bir pencerenin kenarına göre
    kurgulanmış ince desenler kesin sınırın dışındadır. (2) Aynı parlaklıkta kırmızı ↔ başka renk titreşimi
    (WCAG "red flash") parlaklık frenine görünmez; doymuş kırmızı ↔ karanlık geçişleri sınırlıdır. Gerekirse bir
    "kırmızılık" kanalı aynı yöntemle sınırlanır. (3) Fren hızlı ve büyük ölçekli hareketi de yavaşlatır (iz
    bırakır): sınır parlamayı değil parlaklık değişim hızını keser.
  - Butterchurn kendi WebGL2 bağlamında çizer; çıktısı her karede `processSource` ile dokuya yüklenir
    (`texImage2D`). Bağlamlar arası kopya sürücüye göre işlemciden geçebilir; gerçek cihazda ölçülmeli.
- **Denetim**: `flashGuardMath` testleri (işlemcideki kaynak uygulamayla kötü niyetli girdiler: 0,5–30 Hz kare
  dalgalar, gürültü, tek bölge, kırmızı, hücre yarılarının titreşimi; yavaş görüntü ve gece göğünün parlaklık eğrisi
  değişmeden geçer) ve `check:scenes`'teki zamana bağlı ölçüm: `flashGuardCheck.ts` (yalnızca denetim paketinde,
  programa girmez) bilerek parlayan deseni gerçek tarayıcıda frenden geçirir, her kare ekranı okur, 4 piksel adımlı
  bütün WCAG pencerelerinde `countFlashes` ile sayar. Frensiz denetim saniyede ~10 parlama görmeli (ölçüm
  çalışıyor), frenli her durum ≤ 3 (güvenli mod ≤ 1).

## MilkDrop sahnesi

Galerinin son sahnesi kullanıcının kendi MilkDrop görsellerini (`.milk`, "preset") Butterchurn 3.0.0-beta.5 ile
çizer. **Lyraska hazır görsel içermez ve dağıtmaz** (lisans durumu: `LISANSLAR.md`).

```
Klasör seç (dialog) ─▶ milkdrop_set_folder ─▶ settings.json'da milkdropFolder (yalnızca yol)
                       milkdrop_list       ─▶ milkdrop::list (klasör + bir alt düzey, en çok 5000, Türkçe sıralı)
görsel seçildi ─────▶ milkdrop_load(path) ─▶ milkdrop::load: bağlantı değil, gerçek yeri klasörün içinde
                                             (en çok bir alt düzey), .milk, dosya ≤ 512 KB;
                                             UTF-8/UTF-16/Windows-1254 → parse.rs (eel.rs döngü kuralı)
                                             → shader.rs: HLSL → GLSL (wasmi kum havuzunda hlslparser.wasm)
                                             → Butterchurn JSON
MilkDropScene ─ loadPreset(json, harmanlama) ─▶ Butterchurn (eel-wasm: EEL → WebAssembly)
   her kare: visual_waveform → render({ audioLevels, elapsedTime: dt }) → görünmeyen tuval
             → flashGuard.processSource(görünmeyen tuval, dt) → görünen tuval
```

- **Çeviri Rust'ta** (`milkdrop/parse.rs`): satırlar anahtarına göre sınıflanır (ayar, `per_frame_N`,
  `per_pixel_N`, `per_frame_init_N`, `wavecode_K_*`/`wave_K_*N`, `shapecode_K_*`/`shape_K_*N`, `warp_N`/`comp_N`);
  MilkDrop 1'in eski ayar adları (`fDecay`, `nWaveMode`, `bAdditiveWaves` …) Butterchurn adlarına eşlenir. Denklemler
  (EEL) metin olarak geçer. Her zaman dört şekil ve dört dalga (Butterchurn bekler). Sınırlar: dosya 512 KB (baytlarda;
  eski kodlamadan çözülen metin üç kata kadar), 20 000 satır, sonlu sayı, ayar tablosu başına 256 ayar; bozuk girdide
  panik yok (rastgele girdi testi). Klasör yolu Windows'ta yalnızca yerel disk (`C:\…`, `\\?\C:\…`; ağ paylaşımı ve
  aygıt yolları değil). Tarama ve okuma arka plandaki iş parçacığında (`spawn_blocking`).
- **Döngü kuralı** (`milkdrop/eel.rs`): denklemler WebView'in ana iş parçacığında çalışır; eel-wasm `while`'ı
  1 048 576 turla sınırlar ama `loop(n, …)`'ı sınırlamaz, iç içe döngüler çarpılır: tek bir görsel programı
  dondurabilirdi. Çeviri bu yüzden:
  - karede ya da açılışta bir kez çalışan denklemlerde (`per_frame_init`, `per_frame`, dalga `init`/`per_frame`,
    şekil `init`) döngüye izin verir ama her `loop(A, B)`'yi `loop(min(1048576, A), B)` yapar (MilkDrop'un kendi
    sınırı) ve iç içe döngüyü reddeder;
  - karede çok kez çalışanlarda (`per_pixel`, dalga `per_point`, şekil `per_frame`: her örnek için) hiç döngüye
    izin vermez; görselde en çok 8 döngü.
  - Metin eel-wasm'ın kendisi gibi okunur (yorumlar `//`, `\\`, `/* */` ve satır sonları atılır; adlar eel-wasm'ın
    sözcük kuralıyla, büyük/küçük harf farksız): yorumdaki ya da `myloop(` gibi başka addaki döngü sayılmaz.
  - Reddedilen görsel Türkçe bir nedenle açılmaz ("…programı dondurabileceği için açılmıyor"); arayüz yazar ve bu
    oturumda bir daha denemez. Kalan risk: 1 048 576 turluk bir döngünün gövdesi çok uzunsa kare yavaşlar (donma
    değil); gerekirse aşağıdaki donma koruması devreye girer. `check:scenes` gerçek tarayıcıda `loop(2000000000, …)`
    içeren deneme presetiyle 60 kare çizer (kırpılmamış hâli zaman aşımına uğrar; elle denendi).
- **Gölgelendiriciler** (`milkdrop/shader.rs`): MilkDrop 2'nin HLSL bükme (`warp_N`) ve birleştirme (`comp_N`)
  gölgelendiricileri görsel açılırken bir kez GLSL ES 3.00'a çevrilir (sonuç bellekte saklanır: en çok 256 kayıt ve 16 MB; 64 KB sınırını aşan metin hiç saklanmaz, anahtar tür + uzunluk + özet, eşleşmede metin ayrıca karşılaştırılır):
  1. **Hazırlık**: MilkDrop'un sarmalaması (örnekleyiciler, `q1`…`q32`, `time`, `texsize` …, `GetBlur1`/`GetPixel`/
     `lum`/`tex2d` makroları; gövde `float4 lyraska_main(float2 uv)` işlevi). `milkdrop-preset-utils`'in
     `prepareShader`'ından (MIT) uyarlandı; `sampler_state` blokları, `sampler sampler_x;` kısa yazımı, takma adlı
     örnekleyiciler ve `lum` adlı değişkenler de düzeltilir.
  2. **Çeviri**: projectM'in hlslparser'ı (`src-tauri/vendor/hlslparser`, MIT; iki küçük `LYRASKA` yaması: hata
     iletisi saklanır, sayılar `strtod`/`snprintf` ile) ve küçük bir C++ köprüsü (`src-tauri/hlsl/shim.cpp`)
     wasi-sdk 30.0 ile WebAssembly'ye derlenmiştir (`src-tauri/hlsl/hlslparser.wasm`, ~150 KB, `build.sh`). Rust'ta
     saf Rust yorumlayıcı `wasmi` 2.0 çalıştırır: her çeviri yeni bir örnekte, en çok 1 milyar adım ("yakıt"; gerçek
     gölgelendiriciler ≤ 85 milyon) ve 64 MB bellek; dosya/saat/ağ yok (WASI işlevleri "desteklenmiyor" döner).
     Çeviricide sonsuz döngü, bellek taşması ya da bozuk girdi yalnızca o gölgelendiricinin çevrilememesi olur;
     program çökmez, donmaz, `unsafe` yok. Girdi en çok 64 KB, çıktı 512 KB.
  3. **Butterchurn biçimi**: çıktının başlığından Butterchurn'ün kendi tanımladıkları atılır; `rad`, `ang`,
     `uv_orig`, `hue_shader` (Butterchurn'de `main()`'in yerel değişkenleri) ve `q1`…`q32` (Butterchurn'de uniform
     makroları; presetler onlara yazabilir) her pikselde `lyraska_inputs(…)` ile genel değişkenlere kopyalanır.
     Çeviriden gelen başlık yalnızca GLSL karakterleri taşıyabilir (tırnak, `#`, `$`, ters bölü yok); arayüze
     yalnızca metin gider, Butterchurn ekran kartına derletir.
  4. **Döngü kuralı** (`milkdrop/shader_loops.rs`): gölgelendirici her pikselde çalışır; piksel başına 10⁸ turluk
     bir `for` ya da `while (true)` ekran kartını saniyelerce meşgul eder, Windows sürücüyü sıfırlar (TDR: ekran
     kararır, bütün WebGL bağlamları kaybolur). Denetim **çevirinin çıktısında** yapılır: önişlemci açılmış
     (`#define N 100000000` sayıya dönüşmüş, makroyla gizlenmiş döngü görünür), yorumlar atılmış, yazım tek
     biçimlidir; ekran kartına giden metin tam olarak denetlenen metindir. İzin: yalnızca
     `for (int|float i = SABİT; i <,<=,>,>= SABİT; i++ / i-- / i += SABİT / i -= SABİT)`; SABİT sayı ya da ilk
     değeri sayı olan, hiç değiştirilmeyen genel değişken (`static const int N = 8;`). Tur sayısı benzetilerek
     bulunur (kayan noktada ekran kartının 32 bitiyle: adım değeri değiştirmiyorsa bitmez sayılır), en çok 256
     (DirectX 9 `ps_3_0`'ın döngü sayacı da en çok 255'tir); sayaç gövdede değiştirilemez (atama, `++`, `inout`);
     iç içe en çok 2 (çağrılan işlevlerinkiler dahil), en çok 8 döngü, piksel başına en çok 1024 tur ve 16 384
     işlev çağrısı. `while`/`do` yok. Etki tahmini: gerçek presetlerdeki döngüler bulanıklaştırma çekirdeği gibi
     küçük ve sabit sınırlıdır (MilkDrop'un `ps_2_x` profilleri döngüyü açar, 512 komut sınırı uzun döngüye
     zaten izin vermez); korpusta değişken sınırlı ya da `while` döngüsü olan az sayıda gölgelendirici sade
     hâline düşer (`korpus_olcumu` nedenleri sayar).
  - Çevrilemeyen gölgelendirici atılır (öteki kalır), görsel "sade hâliyle" çalar, galeride nedeniyle birlikte
    yazılır ("Neden: …") ve günlüğe bilgi olarak düşer (`shaderError`). Çeviri ekran kartında derlenemezse
    arayüz (`milkdropShaders.ts`) Butterchurn'ün programının bağlanma durumuna bakar ve onu varsayılanla değiştirir
    (yoksa görüntü kararırdı; galeride "ekran kartında derlenemedi" yazar).
  - Ölçüm (yerel, preset depoya girmez; `shader::tests::korpus_olcumu`): projectM "Cream of the Crop"
    (9 603 preset, 15 524 gölgelendirici) bkz. ROADMAP. Gölgelendiricinin ürettiği her kare yine parlaklık
    freninden geçer; `check:scenes` bilerek çakan özgün bir gölgelendirici denemesiyle (`lyraska-golge.milk`) bunu
    ölçer.
- **Eval yok**: Butterchurn `onlyUseWASM: true` ile kurulur; JavaScript yolu (`loadJSPreset`, 8 `new Function`) hiç
  çağrılmaz. CSP: `script-src 'self' 'wasm-unsafe-eval'` (`'unsafe-eval'` yok). `check:scenes` programı bu CSP ile
  açar, sayfada dizgi değerlendirmesinin engellendiğini ve Butterchurn'ün yine çizdiğini denetler; CSP'den
  `'wasm-unsafe-eval'` çıkarılınca görsel açılmaz (elle denendi).
- **Görünmeyen tuval**: Butterchurn kendi OffscreenCanvas'ına (DOM'da değil) çizer; her karede bir 2D tuvale kopyalama
  özelliği kapatılır (`outputGl = null`). Görünen tuvale yalnızca parlaklık freni çizer; fren kurulamazsa sahne
  yerine açıklama görünür.
- **Ne zaman değişir** (`lib/milkdrop.ts`, saf ve test edilir): Görsel Yönetmen'in notunda yeni bölüm başlayınca ya
  da drop açılınca; iki kendiliğinden geçiş arası en az 15 sn (çalarken; bu süre dolmadan gelen bölüm başı
  ertelenir, süre dolunca ilk ölçü başında geçilir), bölüm çok uzunsa 90 sn sonra ilk ölçü başında; analiz yoksa
  90 sn'de bir. Harmanlama en az 3 sn (kendiliğinden 5 sn). Önceki/Sonraki geçmişle;
  yeni seçim yakın zamanda gösterilmemiş rastgele bir görsel. Kendiliğinden değiştirme galeriden kapatılabilir.
- **Donma koruması**: çalan görselin yolu tarayıcı deposunda işaretli durur (açılmadan önce yazılır, görsel çaldığı
  sürece kalır); başka görsele temiz geçişte, sahneden çıkınca ve sayfa kapanırken (`pagehide`, `beforeunload`)
  silinir. Program bir görsel çalarken zorla kapatılırsa işaret kalır: bir sonraki açılışta o görsel kalıcı
  **atlananlar** listesine girer (en çok 50) ve kendiliğinden ya da "Sonraki" ile hiç seçilmez. Bu oturumda açılamayan
  ya da çizerken hata veren (ör. WebAssembly tuzağı) görsel de oturum boyunca atlanır; çizim hatasında sonraki görsel
  harmanlamadan gelir. Seçilebilecek görsel kalmadıysa hiçbiri açılmaz, neden yazılır. Galerideki "Atlananları
  yeniden dene" listeyi boşaltır (kullanıcının açık seçimi).
- "Animasyonları azalt" açıksa sahne çalışmaz, açıklama görünür. Güvenli modda fren r = 0,18/sn.
- Bağlam kaybı: görünen ya da görünmeyen tuvalin bağlamı kaybolursa sahne baştan kurulur, görsel yeniden açılır; arada
  temiz bir kare çizilmeden art arda 3 kezden fazla kaybolursa sahne bırakılır (temiz kare sayacı sıfırlar).

## Arayüz yapısı

- `PlayerScreen` yalnızca parçaları birleştirir:
  - `SceneStage`: tam pencere sahne.
  - `LiveChrome`: akıcı konumu gösteren katmanlar (`useLivePosition`); çalarken her karede yalnızca bunlar
    yeniden çizilir:
    - `NowPlaying`: büyük başlık.
    - `InfoStack`: drop sayacı, bilgi kartları, sıradaki.
    - `Dock`: şarkı haritası şeridi ve düğmeler.
  - Çekmece: kütüphane, ekolayzer, işaretleme, senkron, kör test, ayarlar. Yalnızca bir şey değişince (ses motorunun
    saniyede 4 bildirimi, kullanıcı) yeniden çizilir.
- Durum ve davranış hook'lardadır:
  - `usePlayback`: oynatıcı ve çalma sırası.
  - `useDrawer`: çekmece ve Esc.
  - `useScene`: sahne seçimi; 1–9 ve 0 tuşları, PageDown/PageUp sıradaki/önceki sahne (`SceneGallery`: üst
    çubuktaki galeri listesi).
  - `useScenePresets`: galeri sahnelerinin görünümü (hız, palet) ve hazır ayarlar.
  - `useDropToLibrary`: sürükle-bırak.
  - `useIdle`: sinema görünümü.
  - `useSongMap`: çalan şarkının haritası.
  - `useAbx`: kör test (panel kapanınca süren test duraklatılır).
- Hesaplar saf fonksiyonlardadır (`src/lib/`) ve ayrı ayrı test edilir.
- Renkler `src/styles/global.css` içindeki `:root` değişkenlerinden gelir.

## Veri ve kalıcılık

| Ne                                 | Nerede                                  | Sürüm/değişiklik nasıl yönetilir                                                    |
| ---------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| Kütüphane ve analiz önbelleği      | `library.sqlite3` (yerel veri klasörü)  | `storage.rs`: sıralı göç adımları (`user_version`); bozuksa `.bozuk-<zaman>` kenara |
| Analiz sonuçlarının geçerliliği    | aynı dosya, `analyses` tablosu          | Parça başına sürüm (`cache::VERSIONS`); yalnızca değişen parça yeniden hesaplanır   |
| Şarkı etiketlerinin okunuşu        | aynı dosya, `tracks.tags_version`       | `TAGS_VERSION` (okuma kuralı değişince; şu an 1)                                    |
| Ayarlar                            | `settings.json`                         | Eksik alan varsayılanla dolar; bozuk dosyada varsayılanlar                          |
| MilkDrop klasörü                   | `settings.json`, `milkdropFolder`       | Yalnızca yol; göreli ya da `..` içeren yol unutulur. `.milk` dosyaları kopyalanmaz  |
| MilkDrop donma işareti, atlananlar | tarayıcı deposu (`lyraska.milkdrop.*`)  | En çok 50 yol; bozuk kayıt boş sayılır; "Atlananları yeniden dene" boşaltır         |
| İşaretler                          | `isaretler/*.json`                      | Dosyada `format` alanı                                                              |
| İçe aktarılan şarkı haritaları     | `haritalar/*.json`                      | Biçim sürümü (`map_file::VERSION`); şarkı dosyası değişince uygulanmaz              |
| Hata günlüğü                       | `logs/lyraska.log` (yerel veri klasörü) | 1 MB'ta bir yedeklenir                                                              |

Windows'ta iki veri klasörü vardır; adları program kimliğidir (`tauri.conf.json` `identifier`; eski hesap adını
taşır, değişirse kullanıcı verisi kaybolur): gezici `%APPDATA%\io.github.gozlemesevdalisi.lyraska` (ayarlar,
işaretler, haritalar: küçük, kullanıcıya ait, **yeniden üretilemez**) ve makineye özgü
`%LOCALAPPDATA%\io.github.gozlemesevdalisi.lyraska` (kütüphane + analiz önbelleği, günlükler: büyük, yeniden
üretilebilir; silinirse müzik klasörleri yeniden eklenir). `npm run check:docs` belgelerdeki klasör adlarını
kimlikle karşılaştırır. Eski sürümlerin gezici klasöre yazdığı kütüphane ilk açılışta bir kez taşınır (`data_dirs.rs`);
taşınamazsa eski yer kullanılır.

## Kurallar ve onları denetleyenler

Her kural ya bir testle ya da CI'daki bir adımla denetlenir. Elle hatırlanması gereken kural yoktur.

| Kural                                                                              | Denetleyen                                                                                           |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Ses çıkışında bellek ayırma yok                                                    | `audio::render` testi `ses_yolu_bellek_ayirmaz`                                                      |
| Ses yüksekliği ölçümü EBU R128'e uyar                                              | `audio::loudness` testleri (EBU Tech 3341 durumları 1–5)                                             |
| Eşitleme ve ekolayzer kapalıyken ses bit bit aynı                                  | `audio::render` ve `audio::normalize` testleri                                                       |
| Bit-perfect'te dosyadaki tamsayılar aygıta aynen gider                             | `audio::player` testi `bit_perfect_zinciri_…`, `output` testleri                                     |
| Ses yolu ≤ −140 dB bozulma + gürültü ekler                                         | `audio::render` testi `ses_yolu_bozulma_ve_gurultu_eklemez`                                          |
| Bas düğmesi bası yükseltir, ortaya dokunmaz, tık yok                               | `audio::bass` testleri                                                                               |
| Bas motorunun korumaya bildirdiği pay tepeleri karşılar                            | `audio::bass` testi `yukseltme_payi_tepeleri_karsilar`                                               |
| Ölçülen bas tepeleri gerçek artışı karşılar, gereksiz kısmaz                       | `audio::bass` testi `olculen_bas_tepeleri_…`                                                         |
| Vuruş ilk anı güçlendirir; sürekli basa ve ortaya dokunmaz                         | `audio::punch` testleri, `audio::bass` testi `vurus_…`                                               |
| Boşluksuz geçişte yeniden örneklenen dalga sınırda kopmaz                          | `audio::player` testi `bosluksuz_geciste_yeniden_…`                                                  |
| Görsel dalga biçimi duyulan anla biter, sarmada eski veri yok                      | `audio::player` testleri `dalga_bicimi_…`, `audio::waveform` testleri                                |
| Şarkı sınırında yeni şarkı ilk karesinden kendi seviyesinde                        | `audio::normalize` testi `sessizden_yuksege_…`                                                       |
| Ekolayzer koruması kazançtan önce kalkmaz, ilk kare korumalı                       | `audio::normalize` testi `esitleme_acilinca_…`                                                       |
| Sahne denetiminin sahte çekirdeği arayüzün tipleriyle aynı                         | `src/lib/sceneCheck.test.ts` (üretilen tipe bağlı)                                                   |
| Bir panelin ya da sahnenin hatası pencereyi karartmaz                              | `ErrorBoundary` testleri, bileşen testi "hata sınırları"                                             |
| Yeniden örneklemede Nyquist üstü ≥ 140 dB bastırılır                               | `audio::resample` testleri                                                                           |
| Windows'a özel kod (WASAPI) temiz                                                  | Clippy, `--target x86_64-pc-windows-gnu` (yerel) ve Windows CI                                       |
| Gerçek ses aygıtıyla uçtan uca çalma                                               | `examples/ses_denemesi` (CI makinesinde aygıt yok: "ATLANDI" + uyarı; gerçek deneme proje sahibinde) |
| Kütüphane kodunda `unwrap`/`expect`/`panic!` yok                                   | Clippy (`Cargo.toml` `[lints.clippy]`), CI'da `-D warnings`                                          |
| `unsafe` yok (tek istisna: `output/wasapi.rs` MMCSS, `// GÜVENLİK:` gerekçeli)     | `unsafe_code = "deny"`; istisna fonksiyon düzeyinde `#[allow]` ve belgeli                            |
| Rust ↔ arayüz veri tipleri aynı                                                    | ts-rs ile üretilir; CI "Arayüz tipleri güncel mi" adımı                                              |
| Arayüzün çağırdığı komut ve argümanlar çekirdekte var                              | `npm run check:commands` (CI)                                                                        |
| Veritabanı yapısı değişince eski dosyalar güncellenir                              | `storage.rs` testleri (göç, eski dosya, yeni sürüm dosyası)                                          |
| Her eski sürümün dosyası yeni kurulumla aynı şemaya ulaşır                         | `storage.rs` testleri `her_eski_dosya_…`, `surum_0_0_19_…`                                           |
| Analiz önbelleği bozuksa kütüphane açılır, şarkılar kalır                          | `storage.rs` `analiz_tablosu_…`, `kutuphane_tablosunda_…`                                            |
| Kütüphane açılamazsa ekranda uyarı çıkar (günlükte kalmaz)                         | Bileşen testi "kütüphane açılamazsa …"                                                               |
| Kör testte iki bölüm örnek düzeyinde hizalı ve eşit yükseklikte                    | `audio::abx` testi `hazirlik_hizalar_ve_ses_yuksekligini_esitler`                                    |
| Kör testte A/B/X geçişi aynı konumda, tıksız; başa dönüş yumuşak                   | `audio::abx` testleri `gecis_…`, `bolum_basa_donerken_…`                                             |
| Kör test farklı kayıtları karşılaştırmaz                                           | `audio::abx` testi `farkli_kayitlar_reddedilir`                                                      |
| Eşlenmiş süzgeç kararlı, en küçük fazlı, hiçbir ayarda RBJ'den uzak değil          | `audio::biquad` testleri `eslenmis_…`, `tipik_ayarlarda_…`                                           |
| Kulaklık profili Equalizer APO'nun anlamlarıyla okunur                             | `audio::peq` testleri `apo_…`                                                                        |
| Parametrik EQ karşılaştırması filtresiz ve eşit yükseklikte                        | `audio::peq` testleri `karsilastirma_…`, `ses_yuksekligi_telafisi_…`                                 |
| Parametrik EQ Equalizer APO dosyasıyla gidip gelir                                 | `audio::peq` testi `parametrik_apo_ile_gidip_gelir`                                                  |
| Parametrik EQ'nun yükseltmesi korumaya bildirilir, ses yolunda ikinci kez kısılmaz | `audio::peq` testi `bildirilen_yukseltme_…`                                                          |
| Crossfeed'de orta ses bit bit aynı, yan kanal hiçbir frekansta yükselmez           | `audio::crossfeed` testleri                                                                          |
| Crossfeed ses yolunda; ortadaki ses bütün yoldan aynen, bit-perfect'te yok         | `audio::render` testi `crossfeed_ses_yolunda_…`                                                      |
| Sözler LRC'nin bütün biçimleriyle ve Türkçe kodlamalarla okunur; gömülü sözler     | `audio::lyrics` testleri (`kodlamalar_…`, `gomulu_sozler_okunur`)                                    |
| Sözlerin görünürlüğü sıçramaz; satır sıradakine boşluksuz geçer                    | `src/lib/lyrics.test.ts`                                                                             |
| Parmak izi aynı kaydı tanır (kayıplı, kaymış, 22 kHz), başka şarkıyı ayırır        | `analysis::fingerprint` testleri; gerçek kodlayıcılarla `gercek_kodlayicilarla_olcum` (elle, ffmpeg) |
| Şarkı haritası dosyası doğrulanır; kötü niyetli dosya reddedilir; alanlar sabit    | `analysis::map_file` testleri `bozuk_ve_…`, `bicim_alanlari_sabit`                                   |
| İçe aktarılan harita analizin önüne geçer, önbelleğe yazılmaz, kalıcı              | `spectrogram` testi `ice_aktarilan_…`, `player` testi `sarki_haritasi_…`                             |
| Kör test bitince önceki şarkı kaldığı yerde geri gelir, ekranda görünür            | `audio::player` testi `kor_test_sarkiyi_durdurur_…`, bileşen testi "kör test"                        |
| Kör test kurulamazsa çalan şarkı kesilmez                                          | `audio::player` testi `kor_test_kurulamazsa_calan_sarki_durmaz`                                      |
| Analiz hesabı değişince eski sonuçlar kullanılmaz                                  | `cache::VERSIONS` ve önbellek testleri                                                               |
| Ritim yenilenirken şarkı çözülmez, sonuç tam analizle aynı                         | `analysis::spectrogram` testi `eskiyen_ritim_…`                                                      |
| Tonsuz eski kayıtta yalnızca ton hesaplanır, geri kalanı aynı kalır                | `analysis::background` testi `tonsuz_eski_kayitlarda_…`, spektrum testleri                           |
| Ton 24 tonun hepsinde, akort kaymasında ve davul gürültüsünde bulunur              | `analysis::key` testleri (sentetik akor dizileri)                                                    |
| Güveni düşük ton hiçbir yerde gösterilmez (kütüphane, bilgi kartı)                 | `analysis::key` testleri, `library::db` testi `bpm_ve_ton_…`                                         |
| Eski tek sürümlü kayıtlar göçte yeniden analiz ettirmez                            | `storage.rs` testi `eski_analiz_kayitlari_…` (göç 5)                                                 |
| Güveni düşük drop hiçbir yerde drop sayılmaz (tek eşik)                            | `analysis::structure`, `director` testleri, bileşen testleri                                         |
| Aksak ölçüde vuruşlar grup başları, ölçü başları doğru (9/8, 7/8, 5/8)             | `analysis::meter` testleri, `analysis::structure` testi `aksak_…`                                    |
| Düzenli ölçüler aksak sayılmaz                                                     | `analysis::meter` testi `duzenli_olculer_aksak_sayilmaz`                                             |
| Ölçü belirsizse ölçü başı vurgulanmaz (yönetmen, otoyol, bilgi kartı)              | `structure` testi `olcu_basi_tutarsiz_…`, `director`, highway, bileşen testi                         |
| Hiçbir sahne saniyede 3'ten fazla parlamaz                                         | Sahne testleri (`sky`, `highway`, `stageLight`) + `npm run check:scenes` (CI)                        |
| Parlama sınırı her renk temasında ve her gök manzarasında                          | `npm run check:scenes` (temaya göre renklenen sahneler, CI)                                          |
| Parlaklık freni: hücre ortalaması bir karede ≤ r·dt, saniyede ≤ 1,65 (güvenli ≤ 1) | `flashGuardMath` testleri + `check:scenes` zamana bağlı ölçüm (frenli ve frensiz desen, CI)          |
| Parlayan denetim deseni programa girmez                                            | `sceneCheck` testi "programa girmez"                                                                 |
| MilkDrop sahnesi saniyede ≤ 3 (güvenli ≤ 1) parlar, preset ne olursa olsun         | `check:scenes` gerçek sahnede kare kare (frenli ve frensiz deneme preseti, CI); bileşen testleri     |
| MilkDrop denklemleri yalnızca WebAssembly'ye derlenir, CSP'de `'unsafe-eval'` yok  | Bileşen testi (`onlyUseWASM`), `check:scenes` (programın CSP'siyle, eval engelli)                    |
| `.milk` her bölümüyle çevrilir; bozuk dosya panik yaptırmaz; sınırlar              | `milkdrop::parse` ve `milkdrop` testleri; sahne denetimindeki JSON ayrıştırıcının çıktısıyla aynı    |
| Yalnızca seçilen klasördeki `.milk` dosyaları açılır (bağlantı yok, ≤ 1 alt düzey) | `milkdrop` testleri `yalnizca_secilen_…`, `baglanti_ve_derin_dosyalar_acilmaz`, Windows yolu testi   |
| MilkDrop denklemleri programı donduramaz (döngü kırpılır, iç içe/piksel başı yok)  | `milkdrop::eel` ve `parse` testleri; `check:scenes` döngü denemesi (gerçek tarayıcı)                 |
| Gölgelendirici çevirici programı çökertemez/donduramaz (yakıt, bellek, boyut)      | `milkdrop::shader` testleri (sonsuz makro, derin ifade, büyük ve bozuk girdi)                        |
| Çevrilen gölgelendirici ekran kartını donduramaz (sabit, kısa döngüler; while yok) | `milkdrop::shader_loops` testleri, `shader` testi `sinirsiz_ya_da_cok_uzun_dongu_reddedilir`         |
| Çevrilen gölgelendirici gerçek tarayıcıda derlenir ve frenden geçer                | `check:scenes` gölgelendirici denemesi (`data-shaders="ok"`, frenli ve frensiz parlama, CI)          |
| `hlslparser.wasm` depodaki kaynağın ta kendisi                                     | CI "HLSL çevirici": wasi-sdk 30.0 ile yeniden derleyip baytı baytına karşılaştırır                   |
| Çalarken program kapanan görsel bir daha kendiliğinden seçilmez                    | `src/lib/milkdrop.test.ts`, bileşen testleri (işaret, atlananlar, pagehide)                          |
| MilkDrop geçişleri 15 sn'den sık değil, bölüm başında (erken geleni ertelenir)     | `src/lib/milkdrop.test.ts`                                                                           |
| Yasaklı lisans yok                                                                 | `npm run check:licenses`, `cargo deny` (CI)                                                          |
| Üçüncü taraf lisans bildirimleri pakette ve güncel                                 | `npm run check:notices` (CI; `npm run notices` üretir)                                               |
| Depoda ses dosyası yok                                                             | `npm run check:audio` (CI)                                                                           |
| Biçim ve lint temiz, tür hatası yok                                                | Prettier, ESLint, `tsc`, `cargo fmt`, Clippy (CI)                                                    |
| Çalarken paneller her karede yeniden çizilmez                                      | Bileşen testi "çizim yükü" (kütüphane panelinin çizim sayısı)                                        |
| Durum sorguları birikmez (yanıt gelmeden yenisi gitmez)                            | `src/hooks/usePlayer.test.ts`, kör test paneli testleri                                              |
| İşaretler ses aygıtının gecikmesi düşülerek kaydedilir                             | `src/hooks/useMarker.test.ts`                                                                        |
| Sahne saatleri saatlerce çalınca sıçramaz (katlanır)                               | `src/lib/sceneClock.test.ts`, sky ve highway testleri                                                |
| "Önceki" ve açılırken yapılan seçim çalma sırasını bozmaz                          | `src/hooks/usePlayback.test.ts`                                                                      |
| Etiket okuma kuralı değişince eski kayıtlar yeniden okunur                         | `library::db` `TAGS_VERSION`, göç 4 ve tarama testleri                                               |

## Nasıl eklenir?

**Yeni bir Tauri komutu**

1. İşi ilgili modülde yazıp test edin (`commands.rs` ince kalır).
2. `commands.rs`'e `#[tauri::command]` fonksiyonunu, `lib.rs`'teki `generate_handler!` listesine adını ekleyin.
3. Dönen ya da alınan yeni bir yapı varsa: `#[serde(rename_all = "camelCase")]` ve
   `#[cfg_attr(test, derive(ts_rs::TS), ts(export))]` ekleyin; `cd src-tauri && cargo test` TypeScript
   karşılığını `src/lib/bindings/` altına üretir.
4. `src/lib/backend.ts`'e çağıran fonksiyonu ekleyin, yeni tipi oradan dışa verin.
5. `npm run check:commands` adların ve argümanların eşleştiğini doğrular.

**Veritabanında yeni sütun ya da tablo**

- `storage.rs`'teki `MIGRATIONS` listesinin **sonuna** yeni adım ekleyin (`ALTER TABLE …`). Eski adımları
  değiştirmeyin. Veri dönüştüren bir adımsa (ör. göç 5) onun testini yazın.
- `her_eski_dosya_…` testi, Lyraska'nın bugüne kadar bıraktığı her tür dosyanın (0.0.5'ten bu yana) yeni adımla
  birlikte yeni kurulumla aynı şemaya ulaştığını ve hiçbirinde analizlerin silinmediğini kendiliğinden denetler.
- 1. adım baştan sona `IF NOT EXISTS` kalmalıdır: sürümü 1 olan eski dosyalarda yeniden uygulanır.
- Analiz önbelleği yeniden hesaplanabilir: bir adım önbellek tablosunda takılırsa önbellek boşaltılıp yeniden
  kurulur; klasörlere ve şarkılara hiçbir koşulda dokunulmaz.

**Yeni bir sahne**

- Hareket ve parlaklığı Görsel Yönetmen'in notundan türetin; parlaklığı yalnızca nabız olaylarına ve
  yumuşak değerlere bağlayın; kendi parlama testini yazın; `scripts/check-scenes.mjs`'e ekleyin.
  Renkleri bölüm temasından geliyorsa `themed: true` verin (parlama her temada ölçülür).
- Sahnenin yeni bir biçimi (gece göğündeki manzaralar gibi) varsa `looks` listesine ekleyin; denetim her
  biçimi derleyip çizer ve parlama sınırını ölçer.

**Analizde yeni bir hesap**

- Hesap hangi parçayı değiştiriyorsa `analysis::cache::VERSIONS`'ta **yalnızca onun** sürümünü artırın:
  - `rhythm`: vuruş, ölçü, bölüm, drop, enerji (şarkı haritası). Saklanan karelerden yeniden hesaplanır, şarkı
    çözülmez (4 dakikalık şarkıda ~50 ms). Yeni bir şarkı haritası alanı da buraya girer.
  - `loudness`, `bass`: şarkı bir kez çözülür, FFT yapılmaz; yalnızca o ölçüm yapılır.
  - `key`: ton (kroma ve tahmin). Şarkı bir kez çözülür, yalnızca uzun pencereli kroma FFT'si yapılır; bant
    kareleri ve ritim yeniden hesaplanmaz.
  - `spectrum`: yalnızca karelerin kendisi (bantlar, kanal seviyeleri, başlangıç gücü) değişirse. Bütün kütüphane
    baştan analiz edilir; çok büyük kütüphanelerde saatler sürer, kaçınılmalıdır.
- Sonuç yeni bir alansa önbellek kaydına ekleyin (gerekirse göç adımı).
