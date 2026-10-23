# LYRASKA GÖREV KİTABI: BÖLÜM I (sertleştirme)

Önce `00-CEKIRDEK.md` dosyasını oku. Bu dosya §4 (bulgu kaydı) ve §5 (fazlar) bölümlerini içerir.

<kayit>

## 4. Bulgu kaydı (Bölüm I'in omurgası)

Proje, önceki denetimlerde bulguları zaten kaydetmiş ve sıralamış (`docs/DENETIM-2.md` §5). Bu kitap o sıralamayı
yerine koymaz, ona uyar; eski kodları kullan, yeni maddelere `N` öneki ver. Durumlar 16 Ekim'e (`main` @ `25f83f8`)
aittir; 0.0.50 için **Faz 0 bunları yeniden doğrular**. Eski bir bulgunun ayrıntısı için ilgili
`docs/denetim-2/<alan>.md` dosyasındaki kodu oku; bu tabloyu çoğaltma.

### 4.1 Önceki denetimde kayıtlı (ayrıntı oradadır)

| Kod                                                                    | Sınıf          | Konu                                                                                                                                       | 16 Ekim durumu  | Bu kitabın eki                                                                                                                                             |
| ---------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KUT-01 (+KUT-05, KUT-07)                                               | hata           | Var olan ama boş görünen kaynak bütün şarkıları ve analizleri siler; sürücü kökünde `$RECYCLE.BIN` taranır                                 | açık            | ◐ `removal_candidates` 0.0.50 kodunda da aynı görünüyor. DENETIM-2 §5.1 madde 1.                                                                           |
| SES-02 (+KUT-08, ANL-06, A9)                                           | hata           | Oynatıcı kilidi altında bloklayan işler (`open_track`, `seek_playback`)                                                                    | açık            | Önerilen çözüm: `restart`'ı kilit dışı `prepare` + kilit içi takas olarak böl (kör testte yapılan `abx_install` deseni). Bu, N1'i de çözer.                |
| SES-01                                                                 | hata           | Varsayılan aygıt değişince akış eski aygıtta kalır; kopunca kurtarma yok                                                                   | açık            | `IMMNotificationClient` `unsafe` gerektirebilir: önce `wasapi` crate'inin API'sine bak; gerekirse yoklama ya da sahibine bildirim (§2.6).                  |
| MAT-01 (+MAT-08, SES-10, MAT-03)                                       | hata           | Sınırlayıcı örnek tepesine bakıyor; örnekler arası tepe 0 dBTP'yi aşar. MAT-03: kulaklık ön kazancı gerçek örnekleme hızıyla hesaplanmıyor | açık            | DENETIM-2 §5.1 madde 6 zaten "4× ara değerleme ve −1 dBTP tavanı" öneriyor; ölçüm sinyalleri §4.4'te.                                                      |
| ARA-01 (U10), ARA-03, ARA-04                                           | hata           | Boşta ve duraklatmada çizim sürüyor; Enter hatası; üst çubukta hata sınırı yok                                                             | açık            | DENETIM-2 §5.1 madde 4. Bu kitabın fazlarında yok ama sahibin öncelik listesinde: Faz 4 ile birlikte mi, sonra mı yapılacağını Faz 0 sonunda sahibine sor. |
| YAY-09                                                                 | hata           | CI'daki gerçek aygıt denemesi runner'da aygıt olmadığı için hep "ATLANDI" ile yeşil                                                        | açık            | Atlanma görünür olsun.                                                                                                                                     |
| SES-05                                                                 | hata / özellik | Uzantı listesi çözücü yeteneğinden geniş: Opus çözücü yok, HE-AAC yok                                                                      | açık            | Faz 3.                                                                                                                                                     |
| SES-03 (S4)                                                            | karar          | Ses iş parçacığı önceliği (MMCSS, `unsafe`)                                                                                                | sahibi bekliyor | `DENETIM-2 §5.3` önerisi "yapılsın (Faz 3)", `ROADMAP` "Bekleyen kararlar" önerisi "şimdilik yapılmasın": iki belge farklı, sahibine sor.                  |
| KUT-02 (K7)                                                            | karar          | Bozuk veritabanı: kenara alıp yeniden kur                                                                                                  | sahibi bekliyor | Öneri: `library.sqlite3.bozuk-<tarih>` ile kenara al.                                                                                                      |
| YAY-07                                                                 | karar          | WebView2 kurulumu internet isteyebilir                                                                                                     | sahibi bekliyor | Öneri: şimdilik belgele.                                                                                                                                   |
| ANL-07                                                                 | karar          | Gerçek müzikle doğruluk ölçümü (işaretleme aracı)                                                                                          | sahibi bekliyor | Bölüm II Aşama D'nin girdisi.                                                                                                                              |
| SES-04, 06, 09; KUT-03, 04, 06, 13–16; MAT-02..04; ANL-_; ARA-_; YAY-* | hata           | DENETIM-2 §5.2 "Sonra" listesi                                                                                                             | çoğu açık       | Bu kitabın kapsamı dışında; yalnızca dokunduğun kodla çakışırsa çöz.                                                                                       |

### 4.2 Bu kitapta ilk kez kaydedilenler (N maddeleri)

Aşağıdakiler 16 Ekim denetim raporlarında yok (`docs/` içinde `addFiles`, `add_dropped`, `library__folders`,
`drop.ts`, `queueFrom` aranıp bulunamadı). Hepsi `hata`. Kaynak: proje sahibinin gerçek log dosyaları ve kod okuması.

| Kod | Konu                                                                                                                                                                                                                                                                                        | Kanıt                                                                                    | İşaret        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------- |
| N1  | **Açılamayan dosya, çalan şarkıyı da susturuyor.** `Player::restart` önce `close_session()` ile eski oturumu kapatıyor, sonra `Session::start` içinde `Decoder::open` ile yeni dosyayı açıyor; açılış başarısız olursa çalan müzik zaten gitmiş.                                            | `src-tauri/src/audio/player.rs` `restart`                                                | ◐             |
| N2  | **Taramada çözülemeyen dosyalar gösterilmiyor.** `ScanSummary.failed` sayılıyor ama `run_scan` yalnızca `unreadable` bildiriyor. Opus'lu `.webm` klasörde sessizce yok olur.                                                                                                                | `library/scan.rs`, `library/service.rs`                                                  | ◐             |
| N3  | **"Eklendi" mesajı kaynağı sayıyor, okunabilir şarkıyı değil.** Gerçek log: `1 şarkı eklendi` satırından hemen sonra `unsupported audio codec`.                                                                                                                                             | `drop.ts` Node'da çalıştırıldı: `{"text":"1 şarkı kütüphaneye eklendi","problem":false}` | ✔             |
| N4  | **Her dosya ayrı kaynak oluyor** ("Şarkı ekle" döngüsü ve sürükle-bırak). 73 dosya → 72 tek dosyalık kaynak. Üst klasör eklenince `replace_folders` bunları tek kaynağa indirir; SQLite kopyasında 73 kaynak → 1, şarkı ve analiz kaybı yok.                                                | `useLibrary.addFiles`, `service.add_dropped`                                             | ◐ / ✔ (kopya) |
| N5  | **Çip listesinin yükseklik sınırı ve kaydırması yok.** `.library__folders` `flex-wrap`, `max-height`/`overflow` yok; yüzlerce çip listeyi ekran dışına iter.                                                                                                                                | `src/styles/global.css`                                                                  | ◐             |
| N6  | **Bırakılan sıranın ilk şarkısı açılamazsa sıra takılır.** Otomatik atlama yalnızca `automatic` true iken çalışır (U1 yalnızca otomatik geçişi çözdü); bırakma `automatic=false` ile başlar.                                                                                                | `usePlayback.play`, `PlayerScreen.tsx`                                                   | ◐             |
| N7  | **Çözülemeyen dosya hiç satır almaz, her taramada yeniden denenir;** kaybolan tek dosya kaynağı "bulunamadı" sorununu sonsuza kadar verir, şarkısı kalır.                                                                                                                                   | `known_files`, `scan_folder`                                                             | ◐             |
| N8  | **Ölçek:** `add_dropped` her dosya için tüm kaynakları okuyup `path_covers` ile karşılaştırır (O(N²), her karşılaştırmada `String` ayırır); `addLibraryFolder` her çağrıda tüm kaynak listesini döndürür. 5000 dosya ≈ 12,5 milyon karşılaştırma (aritmetik ✔; süre ölçülmedi).             | `service.rs`, `useLibrary.ts`                                                            | ◐             |
| N9  | **Tutarsızlıklar:** "Dosya aç" kütüphaneye dokunmaz, sürükleme dokunur; klasör bırakınca hiçbir şey çalmaz; `addFiles` yalnızca son hatayı gösterir; `queueFrom` aynı yol tekrar ederse ilk kopyayı seçer.                                                                                  | `commands.rs`, `useLibrary.ts`, `queue.ts` (Node'da ✔)                                   | ◐ / ✔         |
| N10 | **Sarma, oturumu baştan kurar** (`Player::seek` → `restart`: söndür ≤300 ms, dosyayı yeniden aç, yeni tampon, yeni WASAPI akışı, ön doldurma ≤3 sn). SES-02'nin "prepare/takas" çözümü bile akışı yeniden açar. Gerçek oturum-içi sarma bir tasarım işi ve Bölüm II "iki deck"in ön koşulu. | `player.rs` `seek`                                                                       | ◐             |
| N11 | **"Bit-perfect" ifadesi tam doğru değil:** her oturumun, duraklat/devamın ve sarmanın ilk 10 ms'si yumuşak başlıyor (kazanç 0→1). Tık önleyici bilinçli bir tasarım; sorun belge dürüstlüğü. SES-10 ile komşu.                                                                              | `render.rs`                                                                              | ◐             |
| N12 | **Bozuk paket atlama görünmez:** `DecodeError → continue` dayanıklı (doğru), ama sayaç, günlük ya da şarkı başına özet yok. SES-09 ile komşu.                                                                                                                                               | `decode.rs` `next_chunk`                                                                 | ◐             |

### 4.3 Çürütülenler (yeniden açma)

- **"Dither ekle" gerekmez.** Özel mod işlemeyi tamamen atlıyor (`bit_perfect`), paylaşımlı mod 32-bit kayan nokta
  çıkarıyor (◐ `render.rs`). Özel modda DSP'ye ileride izin verilirse yeniden değerlendirilir (bkz. Bölüm II kararı).
- **Sınırlayıcının koşan toplam kayması zararsız** ✔ (Python kopyası, 10 denemede kazanç 1,0'a oturdu, sapma
  yalnızca pozitif yönde +3…+6×10⁻¹²). Koruma tek yönlüdür ama bu yönde yeterli. Dokunma.
- **Sınırlayıcının örnek-tepe garantisi doğru** ✔ (6 zorlayıcı giriş: 10× darbe, sessizlikten 8× atlama, sürekli taşan
  gürültü, DC kayması, Nyquist; çıkış tepesi tam 1,000000). Dokunma; yalnızca true-peak katmanı eklenir.

### 4.4 MAT-01 için ölçüm sinyalleri (✔ Python kopyası, 8× aşırı örnekleme)

- fs/4 sinüs, 45° faz, örnek tepesi 0 dBFS: gerçek tepe **+3,13 dBTP**. Sınırlayıcı dokunmuyor.
- Kırpılmış bant sınırlı gürültü (60 Hz–12 kHz, yüksek basılmış): örnek tepesi 0 dBFS, gerçek tepe **+1,81 dBTP**;
  mevcut sınırlayıcıdan sonra **+1,42 dBTP**.
- MAT-08: mevcut gerçek tepe ara değerleyicisi 18–20 kHz'te 0,17 dB düşük okuyor; test ölçümünde bunu hesaba kat.
- Kopya benim yeniden yazımım; senin görevin gerçek Rust kodunda aynı sinyallerle ölçmek.

</kayit>

<fazlar>

# BÖLÜM I: SERTLEŞTİRME

## 5. Fazlar

**Her madde için bitti sayılma ölçütü:** (1) hatayı yakalayan test önce kırmızı, sonra yeşil (komut çıktısının
özetiyle); (2) hedef kapılar yeşil, faz sonunda tam kapı; (3) `BULGULAR.json` güncel; (4) gerçek cihaz ya da gerçek
sürükleme gerektiriyorsa `docs/DOGRULAMA.md`'ye sahibinin adım adım yapacağı madde; (5) devir notu ve PR; (6) kalan
risk bir cümleyle yazılı. Bir fazın sonunda dur ve özet ver (biçim için §10'daki örneklere bak).

### Faz 0: Doğrulama ve kurulum (kod ve test değişmez)

Yalnızca `docs/gorev/` altındaki dosyalar ve devir notu değişir. Bitiş çizgisi: aşağıdaki yedi adımın hepsi.

1. **Oku:** `CLAUDE.md`, `docs/ROADMAP.md`, `docs/MIMARI.md`, `docs/DENETIM-2.md` (özellikle §5), `docs/DOGRULAMA.md`
   (yapı ve "Bildirdikleriniz" tablosu), son iki devir notu. Bağımsız dosyaları tek turda paralel oku.
2. **Ortamı keşfet:** işletim sistemi, Node ve Rust araç zinciri, hedefler (`rustup target list --installed`), ağ
   erişimi. Hangi kapı komutlarının bu ortamda çalıştığını belirle ve `docs/gorev/KAPILAR.md` dosyasına yaz:
   komut, süre, sonuç, sonraki oturumların çalıştıracağı en kısa tam kapı sırası.
3. **Tabanı ölç:** kapıları bir kez çalıştır (bağımsız olanları paralel, ağır olanları arka planda; çıktıyı süz,
   §2.7). Kırmızı kapıları nedenleriyle `KAPILAR.md`'ye yaz. Düzeltmeye çalışma.
4. **Kaydı doğrula:** §4.1 ve §4.2'deki her maddeyi `HEAD` (0.0.50) kodunda aç, oku ve durumunu belirle: `acik`,
   `duzeltildi`, `curutuldu`. Her madde için dosya:satır kanıtı ve güven derecesi yaz. 16 Ekim'den 0.0.50'ye
   birleşen PR'ların hangi maddeleri kapattığını `git log` ve devir notlarından çıkar. Çalıştırabildiğin ucuz
   deneyleri yap (Node'da `drop.ts` ve `queue.ts`; sürüm farkları). §4.3'teki çürütmeleri de kontrol et; bir
   iddiayı yanlış bulursan kanıtla yaz.
5. **`docs/gorev/BULGULAR.json`'u oluştur** (§3 biçimi, her madde, sınıf ve önemle, `devam_noktasi` dahil). Bu
   kitaptaki ◐ işaretli her iddianın sonucunu `kanit` alanına yaz.
6. **Devir notu** (CLAUDE.md şablonu) yaz, yalnızca belge dosyalarını commit'le, atanan dala push et, PR aç.
7. **Sahibine tek, sade Türkçe özet ver:** (a) kaç madde doğrulandı, kaçı zaten düzelmiş, kaçı yanlış çıktı;
   (b) tabanda kırmızı kapı var mı; (c) aşağıdaki kararlar, her biri seçenekler ve önerinle (biçim için §10'daki
   karar örneğine bak); (d) sıradaki adım: Faz 1.

**Sahibine soracağın kararlar** (en çok bu kadar; her biri kısa ve seçenekli):

1. Opus çözme: (a) yalnızca dürüst "desteklenmiyor" mesajı, (b) gerçek Opus desteği. Öneri: (a) hemen, (b) onayla.
2. Ses iş parçacığı önceliği (MMCSS, `unsafe`): iki belge farklı öneri veriyor (§4.1 SES-03). Öneri: şimdilik yapma,
   takılma görülürse aç; ama sahibi karar versin.
3. Bozuk veritabanı (KUT-02): kenara alıp yeniden kur mu? Öneri: evet.
4. "Dosya aç" ve sürükleme farkı (N9): ikisi de kütüphaneye eklesin mi? Öneri: mevcut davranışı koru, mesajı netleştir.
5. Arayüz çizim performansı (ARA-01/U10): Faz 4 ile birlikte mi, sonra mı? Öneri: Faz 4'ten sonra.
6. Bölüm II (Otomatik DJ) ne zaman başlasın? Öneri: Faz 3 bittikten sonra, ayrı oturumda.

Cevap gelmeden Faz 1'e başlama: onay kapısı olmayan `hata` maddeleri (Faz 1 ve Faz 2) sahibinin "devam" demesiyle başlar.

### Faz 1: Veri ve çalma güvenliği

- **KUT-01 (+KUT-05, KUT-07).** Boş ya da şüpheli görünen kaynakta toplu silme yapılmaz: şarkılar "bulunamadı"
  işaretlenir, kullanıcıya açık mesaj gösterilir ("X şarkı bulunamadı; klasör taşınmış ya da disk değişmiş olabilir,
  kütüphaneden çıkarılmadı"). `$RECYCLE.BIN`, gizli ve sistem klasörleri atlanır. Ayrıntı ve önerilen eşik:
  `docs/denetim-2/kutuphane.md`. Testler: sürücü yok, kök boş, yarı erişilebilir, gerçekten silinmiş dosya, tarama
  sırasında çıkarılan kaynak.
- **N1 (küçük düzeltme).** Yeni dosya önce yoklanır (çözücü açılır, biçim ve kanal bilgisi alınır). Başarısızsa eski
  oturum çalmaya devam eder ve hata döner; yalnızca başarılı yoklamadan sonra eski oturum kapanır. Sarma aynı dosyayı
  yeniden açtığı için orada davranış değişmemeli. Testler (sanal çıkış ve mevcut test yardımcılarıyla): çalan şarkı
  varken olmayan dosya, bozuk dosya ve desteklenmeyen kodek aç; her birinde eski şarkının durumu ve konumu korunur
  ve hata mesajı döner. Bu testler Faz 4'teki SES-02 yeniden yapılandırmasında yeşil kalmalı.

### Faz 2: Kütüphane ve dosya ekleme akışı (sahibinin asıl derdi)

Gerçek senaryo: yt-dlp ile inen Opus'lu `.webm` dosyaları, mp3'ler, `D:\Müzik` ve `D:\DLP` klasörleri, çok dosya
sürükleme. Gerçek log: "1 şarkı eklendi" deniyor, ardından "unsupported audio codec"; 73 dosya bırakınca panelde
yüzlerce çip birikiyor.

- **N2.** Çözülemeyen dosya başına sade Türkçe neden (kodek desteklenmiyor / bozuk / okunamadı); panelde sınırlı ve
  katlanabilir bir "Açılamayanlar" bölümü.
- **N3.** Mesaj gerçeği söylesin; okunabilenler ve çözülemeyenler ayrı sayılır. `drop.ts` testlerini güncelle.
- **N4 + N5.** En düşük riskli tasarımı seç ve gerekçele: (a) "Tek tek eklenenler" sanal grubu (şema göçü gerekir) ya
  da (b) mevcut modeli koruyup arayüzde gruplama ve çip listesine yükseklik sınırı + kaydırma. Korunacaklar: üst
  klasör eklenince tek dosya kaynaklarının yerini alması (`replace_folders`), analizlerin kaybolmaması, mevcut
  kütüphanelerin göçü, klavye ve ekran okuyucu erişimi. 100 ve 1000 kaynakla dene.
- **N6.** Bırakılan sırada ilk şarkı açılamazsa sıradaki çalınabilir şarkıya atla (sınırlı döngü); hiçbiri
  çalınamazsa tek açık mesaj. N1 ile birlikte düşün: açılamayan şarkı önceki müziği de susturmamalı.
- **N7.** Çözülemeyen dosyaları (yol, boyut, değişim zamanı, neden, çözücü yetenek sürümü) kaydet ve değişmedikçe
  yeniden deneme; çözücü yeteneği artınca (Faz 3) yeniden dene. Kaybolan tek dosya kaynağında durum net gösterilir,
  otomatik silme yok (KUT-01 ile uyumlu).
- **N8.** Toplu komut (tek kilit, tek durum yanıtı). Önce/sonra ölçüm: 1000, 5000, 20000 dosyada süre ve arayüzün
  donmaması.
- **N9.** Sahibine soru olarak sun, cevap gelene kadar mevcut davranışı koru ve mesajları netleştir: "Dosya aç"
  ile sürükleme farkı, klasör bırakınca çalma. `hata` olanlar: `addFiles` tüm hataları toplasın; `queueFrom` aynı
  yolu doğru seçsin (indeks tabanlı ya da tekilleştirme).

Kabul senaryoları (otomatik testle; mümkün olmayanlar `DOGRULAMA.md` A bölümüne elle madde):

- A. 73 mp3 bırak: tek grup ya da özet, panel kullanılabilir, hepsi çalma sırasında.
- B. 15 dosya bırak, ilki Opus'lu webm: sıra otomatik atlar, mesaj dürüst, çalan müzik kesilmez.
- C. Karışık mp3/webm/flac klasörü ekle: çözülenler listelenir, çözülemeyenler nedenleriyle "Açılamayanlar"da.
- D. Daha önce tek tek eklenmiş 72 dosyanın üst klasörünü ekle: tek kaynak, şarkı ve analiz kaybı yok.
- E. Sürücü çıkarılmış halde uygulamayı aç: hiçbir şey silinmez.

### Faz 3: Opus ve uzantı dürüstlüğü

Sahibi Opus'u kullanmayı planladığını söyledi; yine de doğrulama haftası kuralı gereği Opus çözme bir `özellik`tir:
önce sahibine seçenekleri sun (örnek soru: §10).

- **3a (hata, serbest): SES-05'in dürüst yarısı.** Kabul edilen uzantılar çözülebilen kodekle uyumlu olsun: çözücü
  yoklaması; Opus içeren `webm`/`mka`/`caf` için net "kodek desteklenmiyor" mesajı (N2 ve N3 ile aynı altyapı).
- **3b (özellik, onay gerekir): Opus çözme.** Doğrulananlar ✔ (docs.rs, 18 Ekim 2026): `symphonia-adapter-libopus`
  0.3.0 (26 Eylül 2026); bağımlılıkları `symphonia-core ^0.6`, `opusic-sys ^0.7.3`, `log ^0.4.28`; lisansı MIT OR
  Apache-2.0; 0.3 serisi Symphonia 0.6 ile uyumlu; libopus varsayılan olarak programa gömülerek derlenir; libopus ve
  `opusic-sys` "Opus lisansı" altındadır; kullanım `CodecRegistry::new()` + `register_audio_decoder::<OpusDecoder>()`
  ve varsayılan `get_codecs()` yerine bu kayıt defteri. Kodda `symphonia::default::get_codecs()` yalnızca
  `src-tauri/src/audio/decode.rs:89`'da kullanılıyor ✔: etkilenen yer küçük (projenin kendi kayıt defteri: varsayılan
  kodekler + `OpusDecoder`).
  Doğrulamaların ? (sen yap): `opusic-sys` lisans ifadesinin `deny.toml` ile uyumu (BSD-3-Clause listede; ifade
  farklıysa sahibine sor); yalnızca crates.io sürümü (`unknown-git = "deny"`); derleme gereksinimi (C derleyici;
  Windows MSVC; CI hedefleri); ikili boyutuna etkisi; `npm run notices` yeniden üretimi.
  Teknik gereksinimler: Opus 48 kHz çözer, mevcut yeniden örnekleme yolu devreye girer; `OpusHead` başlangıç boşluğu
  ve çıkış kazancı (RFC 7845) boşluksuz çalma ve doğru süre için uygulanır; sarmada çözücü ısınması (RFC 7845
  §4.6'daki ön-yuvarlama süresini ? doğrula); `OpusTags` etiketleri (başlık, sanatçı, albüm; varsa kapak); Ogg
  (`.opus`) ve WebM kapları; analiz hattı (BPM, ton, yapı, loudness) Opus üzerinde çalışsın ve testlensin; bozuk Opus
  çökmeden hata versin; test sesleri kısa ve sentetik (projenin mevcut üretim yöntemine bak; ffmpeg ve libopus yoksa
  nedenini yaz); kayıplı kaynakta bit-perfect anlamsız, davranışı açıkça belirt; yetenek sürümü anahtarını artır ki
  N7'deki eski başarısızlar yeniden denensin; README ve ROADMAP'e yalnızca doğrulanmış olanı yaz ("Opus daha iyi DJ
  yapar" gibi kanıtsız iddia yok).

<onay_kapisi>
**ONAY KAPISI: Faz 4 ve sonrası için sahibinin onayını al.** Bunlar ses davranışı, mimari ya da yol haritası
değiştirir. Faz 4B ayrıca onay ister.
</onay_kapisi>

### Faz 4: Ses motoru ve çalma mimarisi

- **SES-02 (+KUT-08, ANL-06, A9).** `restart`'ı kilit dışı `prepare` (çözücü aç, ön dolum, aygıt aç) ve kilit içi
  takas olarak böl; `visual_frame` için `try_lock` ile son kareyi döndürmeyi değerlendir (`docs/denetim-2/ses.md`
  SES-02). N1'in testleri yeşil kalmalı. Önce/sonra ölç: `restart` süresi ve oynatıcı kilidinin tutulma süresi.
  Zehirli kilit davranışı ("programı yeniden başlatın") bilinçli bir tasarım, değiştirme.
- **SES-01.** Varsayılan aygıt değişimini izleme ve kayıpta yeniden açma. Önce `wasapi` crate'inin bildirim
  desteğine bak; `unsafe` gerekirse §2.6'ya göre dur. Sanal aygıtla durum makinesini test et; gerçek aygıt
  maddelerini `DOGRULAMA.md` B bölümüne yaz (kulaklık tak/çıkar, Bluetooth bağla/kes, özel mod aygıt meşgul).
- **MAT-01 (+MAT-08, SES-10, MAT-03).** 4× aşırı örneklemeli true-peak sınırlama (MAT-03: kulaklık ön kazancı gerçek örnekleme hızıyla); tavanı sahibine sor (öneri −1 dBTP;
  ROADMAP'teki loudness uygulaması zaten gerçek tepeyi −1 dBTP'de tutuyor). §4.4'teki iki sinyalle ölçüm testi;
  ses yolunda bellek ayırma yok ve `ses_yolu_bellek_ayirmaz` testi yeni katmanı kapsıyor; ses karakteri ve gecikme
  etkisini raporla. Dokunma listesindeki örnek-tepe garantisi (§4.3) bozulmasın.
- **YAY-09.** Gerçek aygıt denemesinin atlanması CI'da görünür olsun (iş özeti ya da uyarı notası); sanal ses
  aygıtıyla CI'da gerçek deneme yapmanın maliyet/yarar notunu yaz.
- **N11.** README ve arayüz metninde "ilk 10 ms yumuşak başlangıç hariç" de. Başlangıç eşiğini atlamak ses davranışını
  değiştirir; yalnızca sahibine seçenek olarak sun.
- **N12.** Atlanan bozuk paket sayısını say, günlüğe yaz, şarkı başına özet çıkar. Sesi değiştirme.
- **SES-03 (MMCSS).** Karar sahibinde. "Evet" derse yalnızca `wasapi.rs`'te gerekçeli `unsafe` (CLAUDE.md kuralı).

### Faz 4B: Oturum-içi sarma (N10), ayrı onay, büyük iş

Önce tasarım belgesi: mevcut `restart` tabanlı sarma yerine oturum açıkken sarma (çözücüyü konuma al, halka tamponu
boşalt, işleme durumlarını yeniden ısıt, aygıt akışını açık tut); boşluksuz geçiş ve konum hesabı bozulmamalı;
sarmada kısa yumuşak geçiş korunmalı. Tasarım, Bölüm II'nin ikinci çözücü, ikinci halka tampon ve örnek-hassas başlatma
ihtiyacını engellememeli. Önce/sonra gecikmeyi ölç. Sahibinden onay al, sonra uygula. Opus ön-yuvarlamasını (Faz 3) bu
tasarıma dahil et.

### Faz 5: Özellik seçimi (hepsi `özellik`; sahibi sırayı belirler)

Kuyruğun ve son konumun yeniden açılışta korunması; M3U/M3U8 içe/dışa aktarma; "Birlikte aç", dosya ilişkilendirmesi
ve komut satırı argümanı; medya tuşları ve Windows ses denetimi (SMTC); ReplayGain etiketlerini okuma; elle
parametrik EQ arayüzü (motor hazır, ROADMAP #26). Her biri için önce sahibine kısa seçenek ve öneri sun.

### Faz 6: Yayın ve düşük öncelik

`docs/DENETIM-2.md` §5.1 madde 5 (YAY-03/C6 commit kimliği ve SHA-256, YAY-11 ayrı sembol dosyası) ve §5.2 listesi;
README'ye ekran görüntüleri ve kısa GIF; İngilizce arayüz için çeviri katmanı; kod imzalama planı;
`player.rs`'in testle korunan bölünmesi (davranış değişmeden). Yalnızca ucuz ve güvenliyse, değilse "yapılmadı,
gerekçe" yaz: SES-06 çok kanallı yol (doğrulanamadı), analizde çok uzun dosya koruması, `analysis/cache.rs`
`inflate` çıkış sınırı ve annotation/AutoEq okuma boyutu sınırı.

</fazlar>
