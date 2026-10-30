# Bilgi birikimi ("ikinci beyin")

Lyraska'da çalışan her Claude oturumu bu dosyayı oturumun başında, `CLAUDE.md`'den hemen sonra okur. Burada
kurallar değil, **deneyimle öğrenilenler** durur: nasıl çalışınca iş hızlı ve sağlam ilerliyor, hangi tuzaklara
düşüldü, proje sahibi neye karar verdi. Yeni bir ders öğrenildiğinde ilgili bölüme kısa bir madde eklenir (tarihiyle).
Kalıcı bir kural hâline gelmesi gereken şey proje sahibine sorulup `CLAUDE.md`'ye taşınır.
Sıradaki işler ve cevap bekleyen sorular burada değil, `docs/ACIK-KONULAR.md`'de durur. İki dosyanın da satır sınırı
vardır (`check:docs`; bu dosya 640, açık konular 60; sahibinin kararı, 24 Ekim 2026): sınır aşılınca eski maddeler
kısaltılır.

## 1. Proje sahibiyle çalışma

- Proje sahibi yazılımcı değil; Türkçe, sade, kısa yazılır. Uzun teknik ayrıntı yerine "ne oldu, ne kaldı, sizden
  ne bekleniyor" yazılır.
- **"Dur" / "şimdilik dur" denince** çalışan bütün ajanlar durdurulur (`TaskStop`), PR izleme kapatılır, nerede
  kalındığı tek paragrafta yazılır. "Devam et" denince kalınan yerden sürülür (ajanlar `SendMessage` ile).
- Karar gerekiyorsa seçenekler ve öneri birlikte sunulur; **sahibi "sorma" dediyse o konu bir daha sorulmaz**
  (örnek: kod imzalama, 22 Ekim 2026).
- Sahibinin önerisi (repo, özellik) önce lisans, telif ve "çevrimdışı" ilkesiyle denetlenir; uymuyorsa yasal seçenek.

## 2. İş akışı: küçük PR, paralel ajan, bağımsız inceleme

- **Küçük PR (proje sahibinin isteği, 23 Ekim 2026):** bir PR = bir iş. Büyük iş en başta parçalara bölünür, ilk
  parça hızla birleştirilip test sürümüne girer. Büyük, çok parçalı PR'lar (ör. #104: çevirici + parlaklık freni
  birlikte) uzun sürdü; her parça ayrı olsaydı daha erken birleşirdi.
- **Birbirine bağlı parçalar tek PR (sahibinin kararı, 30 Ekim):** her biri öncekinin üstüne kurulu PR zinciri
  (#144–#148, söz işleri) tek tek CI'dan geçemedi: ilk parçanın eksiğini dördüncüsü kapatıyordu. Parçalar kendi
  başına yeşil olamıyorsa tek PR açılır; ayrı commit'ler yeter. Zincir değil, bağımsız küçük PR.
- **Paralel ajanlar ("swarm") işe yarıyor:** birbirinden bağımsız işler `isolation: "worktree"` ile ayrı ajanlara
  verilir (ör. kod, lisans araştırması, inceleme aynı anda). Ana oturum birleştirir, denetler, PR açar; ajanlar
  **push etmez, PR açmaz**, yalnızca kendi çalışma kopyasında commit eder.
- **Ajan talimatında mutlaka:** CLAUDE.md'yi okusun; hangi commit'ten başlayacağı (`git checkout --detach <sha>`);
  yalnızca kendi çalışma kopyasında çalışsın; `CARGO_TARGET_DIR=/home/user/Lyraska/src-tauri/target` (disk);
  her hata için önce test; küçük commit'ler (duraklamada iş kaybolmasın); devir notuna dokunmasın; rapor biçimi.
- **Bağımsız inceleme atlanmaz:** her büyük değişiklik ayrı bir ajana (kodu verip, sonucu vermeden) okutulur; her
  seferinde gerçek hata buldu (sınırsız döngüler, frenden kaçan desen, parlama kanıtındaki açık, yanlış satırı
  silen hızlı düzenleme). Bulgular önce testle yakalanıp düzeltilir.
- Kullanım limiti dolunca ajanlar yarıda kalır; limit yenilenince `SendMessage` ile kaldıkları yerden sürdürülür.

## 3. Ana dal başka oturumlarla ilerleyebilir

- Aynı anda başka oturumlar (ör. Faz 0 denetimi) `main`'e PR birleştirebilir. **PR açmadan ve birleştirmeden önce**
  `git fetch origin main` ile bakılır.
- Taşıma: dal `origin/main`'den yeniden kurulur, iş `git cherry-pick` ile alınır. Sürüm çakışmasında `main`'in
  sürümü alınıp bir sonrakine yükseltilir (`package.json`, `package-lock.json` iki kök alan, `Cargo.toml`,
  `Cargo.lock`'taki `lyraska`). `Cargo.lock` cargo ile yeniden üretilir; `UCUNCU-TARAF.txt` `npm run notices` ile.
- **Dışarıda yazılan yamalar eski `main`'e göre olabilir** (23 Ekim 2026): `git apply --reject`, reddedilenler elle;
  `files/` kopyasını üstüne yazmak yeni işleri siler; aynı adlı testler silinmez, yeniden adlandırılır.
- Başka oturumun devir notu (`docs/devlog/` aynı gün) okunur: sahibinin yeni kararları orada olabilir (ör. depo adı
  `lahmacunveayran/Lyraska` oldu, "kod imzası olmayacak").

## 4. Ortam tuzakları

- **Disk küçük** (~250 GB görünür ama izin verilen alan dolar). Dolunca denetimler sessizce yarıda kalır.
  Kurtarma: `src-tauri/target/debug/incremental` ve `examples` silinir; geçici klasördeki indirmeler ve bitmiş ajan
  çalışma kopyaları (`git worktree remove --force`) temizlenir. Uzun işten önce `df -h /` bakılır.
- **Çalışma kopyaları depo içinde** (`.claude/worktrees/`): Prettier, ESLint ve Vitest onları da görür. Ana kopyada
  `npx eslint . --ignore-pattern ".claude/**"`, `npx vitest run --exclude ".claude/**"` kullanılır ya da çalışma
  kopyaları silinir. `.git/info/exclude`'a `.claude/worktrees/` yazılır (depoya girmez).
- **Sahne denetimi üç paralel parçada** (`SCENE_SHARD`, 29 Ekim 2026): bütün CI ~16 dk (en uzunu kurulum dosyası);
  yeni denetim eklerken `check-scenes.mjs`'teki görev listesine `add(...)` ile eklenir.
- **CI'da Linux işi `apt-get update`'te takılabiliyor:** test başlamadan 40 dakikada iptal olur. Bu altyapı
  hatasıdır; bir kez yeniden çalıştırılır (`rerun_failed_jobs`). Süreler: Windows sahne denetimi ~17–20 dk,
  kurulum dosyası ~10–25 dk, Rust ~3–4 dk.
- `check:scenes` yerelde: `SCENE_BROWSER_PATH=/opt/pw-browsers/chromium SCENE_BROWSER_ARGS="--use-gl=angle
--use-angle=swiftshader --enable-unsafe-swiftshader"`; `SCENE_ONLY=sahne1,sahne2` ile tek sahne. Port 4179'u
  aynı anda yalnızca bir denetim kullanabilir.

## 5. Teknik dersler

- **Oynatıcı düzeltmesi arayüzün yolunda sınanır:** arayüz şarkıyı `Player::load` ile değil `open_track`'in üç
  adımıyla (`begin_transition` → `prepare` → `install`) açar. Yalnızca `load`'a konan bir koruma programda
  çalışmaz (#105'te öyle oldu); test komut gövdesini (`commands::open_on`) çağırır.
- **Arayüz işi sahte çekirdekle tarayıcıda görülür:** testler geçse de şarkıya özel kapakta iki hata yalnızca
  önizlemede çıktı (hücrenin `overflow: hidden`'ı menüyü kırptı; `AlbumArt` isteği yeniden kurarken yeni alanı
  düşürdü). Satır içindeki açılır menü `createPortal` ile `body`'ye konur. Önizleme betiği `check-scenes.mjs`'in sahte
  çekirdeğini örnek alır: bilinmeyen komuta `null` yerine durum nesnesi döner, yoksa arayüz çöker.

- **Tam ekran katman tıklamayı yutar:** "Kendi resmin"in çubuk tuvali "Resim seç…" düğmesini örttü; Testing Library'nin
  `fireEvent.click`'i bunu göremez (sahibi programda fark etti). Sahnelerin tam ekran tuvallerine
  `pointer-events: none`; düğmeli her sahne katmanı `check:scenes`'te gerçek fareyle tıklanır (Playwright önce
  düğmenin en üstte olduğunu denetler).
- **Güvenli modun koruması yapının içinde olmalı:** kendi sahnelerimizde parlaklık tek çarpandan gelir (`sceneLevel`;
  güvenli modda hız sınırlı); güvenilmeyen içerik (MilkDrop) güvenli modda parlaklık freninden geçer (`flashGuard.ts`, kanıtı
  `flashGuardMath.ts`). Her yeni sahne gerçek tarayıcıda ölçülür (`check:scenes`): durağan iki görüntü yetmez,
  zamana bağlı ölçüm gerekir.
- **Dışarıdan gelen dosya güvenilmezdir** (`.milk`, `.lrc`, şarkı haritası): boyut/satır sınırı, döngü sınırı,
  yol doğrulaması (yalnızca seçilen klasör, kısayol bağlantısı yok, ağ paylaşımı yok), `eval` yok. Dışarıdan
  derlenmiş kod yalnızca kum havuzunda (`wasmi`: yakıt + bellek sınırı).
- **Önce ölç, sonra değiştir:** kum tepelerindeki "basamak" hatası gürültü fonksiyonunda sanıldı; ekran kartındaki
  değerler okununca sorunun ışıklandırmada olduğu görüldü. Varsayımla kod değiştirmeden önce sayıya bakılır.
- **Opus (23 Ekim 2026):** Symphonia'nın Matroska/WebM okuyucusu süreyi, sarmayı ve başlığı bilmiyor; çözüm
  `decode.rs`'te (sarma baştan okuyarak, zaman TOC baytından). Kısa tek kümeli test dosyası sarma hatasını gizledi:
  sarma uzun, tekrarsız sinyalle ve baştan çözülen sesle örnek örnek karşılaştırılır.
- GLSL kaynakları TypeScript şablon metni içindeyse yorumlarda ters tırnak işareti kullanılmaz; şablon metnini kapatır.
- **Dosya türü içinden tanınır, uzantısından değil** (23 Ekim 2026): sahibi yt-dlp'nin `.webm`'lerini elle `.opus`
  yaptı; içi Matroska kaldı, uzantıya bakan kod ön boşluğu iki kez attı (6 ms) ve sarma kaydı. EBML imzası
  (`1A 45 DF A3`) okunur; uzantı yalnızca dosya okunamazsa yedek.
- **Kapak yalnızca dosyanın içinde değildir:** gömülü kapak yoksa yandaki resim (`Şarkı.jpg`, `Şarkı.opus.webp`) okunur.
- **Sahibine dosya silen betik verilmez** (ya da önce işin başarısı denetlenir): başka bir sohbetin verdiği kapak
  gömme betiği ffmpeg hata verince yarım çıktıyı başarı sanıp sahibinin orijinal şarkılarını sildi.
- **Windows'ta klasör izleme sessizce ölebilir** (24 Ekim 2026): `notify` klasör kaybolunca ya da G/Ç hatasında
  izlemeyi haber vermeden bırakır, olay tamponu (16 KB) taşınca da haber vermez. Bu yüzden izleme kendini onarır
  (2 dk), 30 dk'da bir güvenlik taraması vardır; bütün sürücü kaynakta yeni klasör ancak içinde şarkı varsa tarama
  başlatır, yalnızca değişen alt klasör taranır.
- **Analiz, doğrusu bilinen seste ölçülmeden değiştirilmez** (24 Ekim 2026): oturumda gerçek şarkı yok (ağ yalnızca
  GitHub). Drop için `docs/arastirma/drop/uret.py` yeri tam bilinen deneme şarkıları üretir; geliştirme ve
  görülmemiş doğrulama seti (ayrı tohumlar) ayrı tutulur, eski algoritma da aynı sette ölçülür (ezber olmasın).
- **Sentetik set fazla temizse yöntem yanıltır** (29 Ekim 2026, tempo oktavı): yalnız davul + pad'li sette "snare her
  vuruşta mı" öz-ilintisi kusursuz ayırdı; sete akor vuruşları (klavye/gitar) eklenince hip-hop'u iki katına çıkardı
  ve bırakıldı. Üreticiye orta bantta tonal ritim eklenir. Bant seviyeleri desibeldir: artışları sessizlikten çıkan
  kısık sesi de sayar; "hangi davul yüksek" sorusu doğrusal güçle sorulur. 60 kare/sn'de kare sınırına düşen vuruş
  (144 BPM sekizliği = 12,5 kare) iki kareye bölünür; tepe yerine üç karelik toplam alınır.
- **Commit'ten önce `cargo clippy --all-targets`:** yalnızca kütüphaneyi derlemek örneklerdeki (`examples/`)
  uyarıyı göstermez; CI hepsini derler.
- **Drop ölçü başına yapıştırılmaz:** vuruş ızgarası kayabilir (yarım tempo, sessizlik); an basın döndüğü karedir.
- **Push'tan önce filtresiz `cargo test`** (24 Ekim 2026): yalnızca `library::` çalıştırınca göçün kırdığı
  `storage` tablo listesi testi CI'da yakalandı. Yeni komut eklenince `check-scenes.mjs` sahte çekirdeğine de eklenir
  (bilinmeyen komuta durum nesnesi döner, `.map` arayüzü çökertir).
- **Parlama kanıtı çizilenin aynısını modellemeli** (24 Ekim 2026): "Kendi resmin"in ilk kanıtı ortalama arka plan ve
  doğrusal karışım varsaydı; bağımsız denetim sRGB karışımı, en kötü piksel ve gölgeyle gerçek bir aşım buldu.
  Doğrusu: tarayıcının çizdiği gibi çizen test + her karede ışık bütçesi (`limitExtents`).
- **Görsel taklitte tahmin değil ölçüm:** sahibinin ekran kaydında ses de var; çubuklar kare kare ölçülüp sesle
  hizalanınca eksen doğrusal 20–2000 Hz çıktı (tahminle logaritmik yapılmıştı, bas bu yüzden düzdü).
- **React 19'da `requestAnimationFrame` içindeki `setState` o kareye yetişmez** (29 Ekim 2026, söz zamanlaması): güncelleme
  kare boyandıktan sonra işlenir, ekrandaki konum bir kare geride kalır (deneyle 60 karenin 0'ı aynı karede);
  `flushSync` ile 60/60. Her karede yeniden hedeflenen CSS geçişi (ör. `transition: opacity 0.12s`) ~geçiş süresi
  kadar gecikme süzgecidir: zamandan hesaplanan değere geçiş konmaz. Konum karenin damgasıyla okunur (`frameTime`).
- **Başsız Chromium'da kare hızı ekran kartı işinden düşer:** sahne ve cam katmanlar (`backdrop-filter`) yazılımla
  çizilince kareler ~110 ms'ye çıkar, ana iş parçacığı boşta görünür (profil "idle"). Zamanlama denetimi kare
  hızından bağımsız yazılır (olayın göründüğü karenin aralığı); `waitForFunction` yoklaması yerine sayfa içinde beklenir.
- **Mutasyon deneyinde derleme sonucu denetlenir** (30 Ekim 2026): kasıtlı hata kullanılmayan içe aktarma bırakınca
  `npm run build` sessizce düştü, denetim eski `dist/`'i çalıştırıp "geçti" dedi (hata yakalanmıyor sanıldı).
- **Zamanlama modeli denetimde tekrarlanmaz:** ilk söz denetimi programla aynı sabiti (1/60 sn, simetrik IPC,
  düzenli kelime aralığı) kullandı; bağımsız inceleme bunu buldu. Ekrana çıkış anı programdan bağımsız ölçülür
  (bir sonraki karenin damgası), değişkeler ağır sahne ve asimetrik IPC içerir.
- **İnceleyenin testi anlattığı senaryoyu sınamalı:** "duraklat-sürdürde sıfırlanıyor" bulgusunun testi her seferinde
  yeni bileşen kuruyordu (ilk açılışı sınıyordu, orada düzeltme imkânsız). Test senaryoya göre düzeltilir, eski kodda
  düştüğü gösterilir, nedeni yazılır.
- Testler arasında sızan sahte çekirdek durumu (`usePlayer.test.ts`'te `backend.busy`) sonraki testi sessizce
  kilitler (zaman aşımı): yeni `describe` kendi `beforeEach`'iyle sıfırlar.
- Betikle metin değiştirirken eşleşme sayısı denetlenir (`count == 1`): bir CSS değişikliği Ayarlar başlıklarının
  büyük harfini de sildi.

- **Sentetik sette model üretecin izini öğrenir** (29 Ekim 2026): drop v2'de üreteç her yükselişe parlak riser koyduğu
  için model "dropta tiz düşer" diye öğrendi (gerçekte artar) ve rock bozuldu; tempo düzeltmesi maksumu 2× yaptı.
  İkisini de **kendi üretecini sıfırdan yazan** bağımsız inceleme buldu. Kural: inceleyen ajan modelin üretecini değil
  kendi karşı örnek üretecini kullanır; ağırlıklar kanıtın fiziksel yönüyle sınırlanır; ayar türü dışarıda bırakan
  çapraz doğrulamayla yapılır; son sınama seti kod bittikten sonra üretilir; "hiçbir türde eskinin altına düşme" ve
  şarkı şarkı eski/yeni karşılaştırması raporlanır. Türk müziği (maksum, aksak, arabesk) sette mutlaka olur.
- **Aralıklı test hatası çoğu zaman gerçek hatadır** (29 Ekim 2026): klasör izleme testi CI'da iki kez düştü; yerelde
  döngüyle (`for i in $(seq 1 100)`) 1/30–1/44 yeniden üretildi; kök neden Linux inotify'da yeni alt klasöre hemen
  yazılan dosyanın kaçmasıydı (`FreshDirs`). Bir kez yeniden çalıştır; yine düşerse yerelde döngüyle üret, kök nedeni
  bul.
- **Önizleme tuzakları:** başsız Chromium'un hızlandırılmış 2D tuvali bazı karelerde eski kareyi gösterir
  (`--disable-accelerated-2d-canvas`); "Kendi resmin" önizlemesinde sahte çekirdek `getVisualSpectrum` vermezse çubuklar
  32 banttan basamaklı çizilir — çubuklar gerçek sesten `spectrum.rs` modeliyle (Python eşi) üretilir, video sesli olur.
- **CI işi bölünürken eski ad korunur:** koruma kuralı denetimi adıyla bekleyebilir; parçalı işin yanında eski adla bir
  "ortak sonuç" işi kalır (`Sahneler (Windows, Edge)`, `Windows (Clippy, testler, kurulum dosyası)`).
- **Sahte çekirdek ana iş parçacığında çalışır, gerçek çekirdek ayrı süreçte:** sahne denetiminde sahte çekirdeğin
  zamanlayıcısı ağır sahnede ana iş parçacığını bekler, "okuma anı" gecikir; gerçekte gidiş beklemez, yalnızca yanıt
  bekler. Bu fark ortak saatin aşırı yükte 37 ms geç kalmasını gizliyordu (30 Ekim). Zaman ölçen sahte çekirdekte
  okuma anı gönderme anından sabit uzaklıkta yazılır.
- **Güvenli modda ışın ve kamera (Işık Ustası, 30 Ekim):** parlaklığı hız sınırlamak yetmez; hareket de parlama
  sayılır. Kameraya dönük geçen geniş ışın konisi ya da kayan kamera, ince parlak ışınları küçük bölgelerde karede
  0,13 değiştirir. Çözüm: güvenli modda tek, yavaş süzülen çekim (kamera ≤ 0,5 m/sn); hedefinden uzak ışın önce söner,
  karanlıkta döner, hizalanınca yanar; sarma (ok tuşu basılı) hiçbir şeyi bir karede oturtmaz. Ölçüt bölge başına
  (sahne kaldırıldı; kodu ve karşı örnekleri yedek dalda `claude/eloquent-shannon-0eigyf-yedek-isik-ustasi`).
- **Ters mühendislikte kısa ekran kaydı yanıltır (30 Ekim):** 4 sn'lik kayıtlardan çıkan ölçek "Kendi resmin"
  çubuklarını orijinalin 0,72 katı bırakmıştı; sahibinin kaydındaki ses de Windows iyileştirmesiyle bozuktu. Doğrusu:
  orijinal dosyanın tamamı ve kendi sesi, aynı saniyeler, Lyraska'nın çıktısı gerçek kodla üretilip (Rust crate +
  PhotoScene) yan yana videoyla sahibine gösterilir.
- **"Kendi resmin" çubuk rengi (30 Ekim, sahibinin seçimi; 24 Ekim'deki "birebir" kararının yerine):** resmin baskın
  tonu en yakın saf tona oturur (8 ton); riskleri (sınırda ani değişim, gök mavisi → camgöbeği) söylendi. Çubuk
  boyu yumuşak tavanlı (0,7'nin üstü `tanh`).
- **Ölçüm denetiminde uzun kare:** sonraki kare gecikince bu karenin ekrana çıkış anı bilinemez; denetim aralık kabul
  eder (en erken kare başı + bir kare, en geç sonraki kare başı). CI'nın ekran kartsız Windows'unda "Kendi resmin"
  karelerinin %12'si uzun.
- `photoScene.test.ts`'in iki testi 2–5 sn sürüyor (5 sn sınırına yakın); yüklü CI'da bir kez süreyi aştı, yeniden
  çalıştırmada geçti (30 Ekim). Yinelenirse önce sahibine sorulur (mevcut test).
- **CodeQL "eksik çok karakterli temizleme":** tekrar eden `replace` döngüsünü de kabul etmez; metni kesmek (`slice`)
  kabul edilir.
- **Bu oturumun GitHub yetkisi:** yalnızca oturum dalına ve `claude/clever-euler-pmhee7-yedek-*` adlı yedek dallara
  push edilebilir; başka dal silinemez (403) — sahibi `/branches/all` sayfasından siler. Yarım iş oturum kapanmadan
  yedek dala gönderilir (geçici bilgisayar silinir).
- **Disk:** `CARGO_TARGET_DIR` unutulursa her çalışma kopyası kendi `target`'ını kurar ve disk dolar; önizleme ham
  kareleri (GB'larca) iş bitince silinir.

## 6. Lisans dersleri

- "Ticari kullanım yasak" (NC) lisanslar GPL-3.0 ile çelişir (GPL satma hakkı da verir); program ücretsiz olsa da
  alınmaz. Lisansı yazılmamış eser "tüm hakları saklı"dır; ücretsiz dağıtımda da yazarın izni gerekir.
- Yapay zekâ modellerinde **kod, ağırlık ve eğitim verisi** ayrı ayrı denetlenir (ör. Demucs ağırlıkları "yalnızca
  araştırma"; MUSDB18 NC).
- npm paketinin "MIT" alanı içeriğin tamamını kapsamayabilir (ör. `butterchurn-presets`: paketleyicinin MIT'i
  preset yazarlarını kapsamaz). Otomatik lisans denetimi bu durumda yanlış güven verir.

## 7. Proje sahibinin kararları (özet; ayrıntı devir notlarında)

- Lyraska **ücretsiz** kalacak, ticarileştirme yok (22 Ekim 2026).
- **Kod imzası olmayacak** (23 Ekim 2026).
- Görsel tasarım onayı (24 Ekim 2026'da Claude'a verilmişti) genel yetkiyle birlikte sahibine döndü: her görsel iş
  önizlenip sahibine gösterilir, onayı alınır.
- ~~Genel yetki~~ (24 Ekim 2026) **geri alındı** (sahibi: "Sen benim dediğim gibi yap. Genel yetkiyi geri alıyorum."):
  ürün ve görsel kararlar sahibine sorulur (seçenek + öneri); görsel işler önizleme videosuyla gösterilir.
- Sahibinin kullanım limiti az: aynı anda **tek ajan**; küçük işler ajansız; gereksiz bekleme/denetim döngüsü yok.
- **Mevcut testler** silinmez, atlanmaz, gevşetilmez; yeni test yanlışsa düzeltilip nedeni söylenir; mevcut test
  bozulursa hangisi ve neden önce sahibine söylenir (sahibinin kuralı).
- İşe yarayan GitHub repoları kullanılabilir; lisans kuralıyla birlikte.
- YouTube'dan indirme (yt-dlp) önerilmedi (telif, çevrimdışı ilkesi, kalite); yasal "klasör izleme" önerildi;
  karar Faz 4 sonrasına kaldı.
- **Kaynak ayrıştırma** (davul/bas/vokal): **Spleeter** seçildi (23 Ekim 2026; kod ve ağırlıklar MIT, kurulum
  +40–80 MB, önceden arka planda hesaplanır). Uygulamadan önce ağırlık lisansı ve çalışma zamanı (ONNX) lisansı
  birincil kaynaktan yeniden doğrulanır.
- Sahibi Spleeter'ı "geliştirip daha iyi yapmak" istiyor (23 Ekim 2026). Yeniden eğitim yasal veriye bağlı (MUSDB18
  NC, kullanılamaz); önce eğitimsiz iyileştirmeler (Wiener süzgeci, 16 kHz bant, analiz amaçlı kullanım) ölçülür.
- **İş sırası (23 Ekim 2026):** yama 0001 (#105) → `.opus`/`.webm` → kütüphanenin baştan tasarımı (4 PR: çekirdek
  sorguları ve gruplama; tam ekran kütüphane + Şarkılar; Albümler ve Sanatçılar; Klasörler ve uyarılar) → kaynak
  ayrıştırma → Otomatik DJ (Bölüm II). Kütüphane kararı: **tam ekran**, arayüz baştan, çekirdek korunup iyileştirilir (veri ve analiz kaybı yok).
- Görev kitabı `docs/gorev/00-CEKIRDEK.md`, `10-BOLUM-I.md`, `20-BOLUM-II-DJ.md` (dışarıda hazırlandı). Bölüm II
  (Otomatik DJ) için sahibi onay verdi (23 Ekim 2026: "DJ işlerini de yap, gerekli hassasiyetle"); sırada en
  sonda. Aşama A'dan başlar, her aşama ayrı oturumda; A–D ürün koduna dokunmaz, onay kapıları (K0, B0, tez seçimi,
  çıkış modu, Aşama E uygulaması) atlanmaz.
- **Geri bildirim (23 Ekim 2026):** drop gösterimi tam olmamış; kütüphane paneli "aşırı kötü", beğenilmedi
  (yeniden tasarım gerekli). `.opus` ve `.webm` açılmalı (Faz 3b).
- Sahibi "çok yıldızlı GitHub repolarını kullan" dedi (23 Ekim 2026): yıldız sayısı ölçüt değildir; her repo
  lisans (AGPL/NC yok), çevrimdışı ilkesi ve gerçek bir ihtiyaca uygunlukla seçilir.
- MilkDrop: programla hazır görsel dağıtılmaz; kullanıcı kendi `.milk` dosyalarını açar.
- **Varsayılanda epilepsi sınırı yok** (24 Ekim 2026; "o ışık şovunu istiyorum"): koruma yalnızca Epilepsi güvenli
  modunda (aynen korunur ve test edilir); ilk açılışta uyarı. Claude riskleri iki kez açıkladı, karar sahibinin.
- **Kütüphanenin görsel kararları (23 Ekim 2026):** sanat yönü "baskı atölyesi + gerçek gökyüzü"; açılış ekranı
  **Gökyüzü** ve **renkli** (renk tondan; Camelot çarkı renk çemberine oturur: `--key-1…12`). Ton herkesin dilinde
  ("La minör"); Camelot yalnızca "DJ görünümü" seçeneğinde. Yazılar: başlık **Bricolage Grotesque**, şarkı listesi
  **Martian Mono**, sayılar JetBrains Mono (Fraunces, Inter kalın/ince, Unbounded, Instrument Serif reddedildi).
  Tek vurgu rengi pembe `#FF5A88`, az kullanılır. Yıldız verisi: HYG v4 + Stellarium modern (CC BY-SA 4.0, atıfla).
- **Albüm kapağını kullanıcı seçebilir** (23 Ekim 2026): seçilen resmin kopyası Lyraska'nın veri klasöründe
  (`kapaklar/`) tutulur; müzik dosyalarına ve klasörlerine dokunulmaz (sahibinin seçimi). Sıra: seçilen kapak →
  şarkıdaki kapak → yandaki resim → baskı kapağı.
- **Kütüphane düzeni (23 Ekim 2026):** tam ekran beğenilmedi; ortada yüzen cam sayfa (en çok 1240 px, dört yanında
  sahne, alt çubuk kullanılabilir; dışına tıklamak ya da Esc kapatır). Kısayollar araştırmaya dayalı: Ctrl+F/Ctrl+K
  arama, Ctrl+1/2/3 görünüm (tek başına rakamlar sahne değiştirir), ilk Esc aramayı temizler. Ekleme tek "Müzik
  ekle" menüsünde, yeniden tarama kaynak menüsünde. Şarkı adı Martian Mono, sanatçı/albüm orantılı ve soluk.
- **Kutucuk yok:** her klasör ya da tek eklenen şarkı için ayrı "çip" sahibi tarafından reddedildi. Kaynaklar
  başlığın yanında tek düğmede; tek tek eklenenler tek satır, seçilince liste süzülür; kaldırma önce sorar.
- **Çalma listeleri (24 Ekim 2026):** kapak seçilebilir, yoksa ilk dört albümden kolaj; başka bilgisayara `.m3u8`
  ile taşınır (şarkı yoldan, olmazsa sanatçı + ad + süreden bulunur). PR yalnızca bağımsız incelemeden sonra açılır
  (sahibi istese de; "incelensin öyle PR edilsin").
- **"Kendi resmin" sahnesi (24 Ekim 2026):** kullanıcının resmi + Nightcore videolarındaki ince çubuk çizgisi; renk
  resmin baskın rengi (tek renkliyse o ton tam canlı, karışıksa beyaz; 30 Ekim'den beri en yakın saf ton), yazı
  Michroma. Sahibi kararları
  iki kez (biri tamamen bağımsız) denetlenerek verilsin istiyor.
- **29 Ekim 2026 kararları:** Gece denizi, Ateşböcekleri, Kum tepeleri, Kristal ağ kaldırıldı (VU ve Gece sürüşü de
  yeni sahneler gelince kalkacak); ilk yeni sahne Işık Ustası ("Sakin / Normal / Çılgın"). "Kendi resmin": parçacıklar
  Kıvılcım/Kar/Kapalı + yoğunluk kaydırıcısı; önerilen estetik fikirlerden **yalnızca şarkı sözleri** beğenildi (resmin
  basla nefes alması, drop parlaması, süzülme istenmedi); "gerekirse baştan kur, nihai mühendislik ve matematiksel
  çözüm". Tempo tanımı: DnB 170'ler, dubstep/trap 140, hip-hop 85–95. Drop v2 sonuçları saklandı, karar en sona.
- **30 Ekim 2026: sahibi bekleyen dört soruyu Claude'a bıraktı** ("en iyi cevabı sen ver"): "Kendi resmin" sözleri
  beğenildi sayılır, düğmeler görünürken de kalır (üst ortada; başlık bloğunda alttaki başlıkla çakışıyordu), ışıltı şimdilik aynı (önce o dalın CSS gecikmeleri ölçülüp
  düzeltilir); Işık Ustası'nda Normal'de drop flaşı yumuşar (tam flaş Çılgın'da), söz işlerinden hemen sonra bağımsız
  inceleme + PR; drop v2 için **B** (ikisi programda, varsayılan eski, İşaretle'de yan yana; karar sahibinin 5–10
  şarkılık işaretiyle), uygulaması sırada yine en sonda. Sahibinin kendi denemeleri (A16, #25, #27) ona kalır.
- **Söz düzenleme (30 Ekim 2026):** bulunan düz metin Lyraska'da yapıştırılıp düzenlenir; Lyraska'nın klasöründe
  saklanır (kapaklardaki gibi; müzik dosyalarına dokunulmaz). Program söz indirmez, dağıtmaz. Zamanlama **dokunarak
  değil, otomatik** (sahibi: "onu ben yapamam, çözüm bul"; iki kez irdelensin, ikincisi bağımsız ve üst düzey):
  `docs/arastirma/soz-hizalama/`. Sahibinin kararları (30 Ekim): model ayrı "Söz paketi" dosyası (aynı sürüm
  sayfasında; Lyraska'da "Dosyadan ekle"; programa ağ kodu girmez), emin olunmayan satır soluk + "tahmini" (şarkının
  çoğu oturmadıysa uyarı), zamanlama söz kaydedilince kendiliğinden (arka planda, düşük öncelik); ilk sürümde sahibi
  5–10 Türk pop/arabesk/rap şarkısında kayan satırları bildirir (yalnızca doğru/yanlış).
- **Işık Ustası kaldırıldı (30 Ekim 2026, sahibinin kararı: "beğenmedim, sıkıcı"):** programdan tamamen silindi
  (sahne, yoğunluk ayarı, kendi testleri); kodu yedek dalda `claude/eloquent-shannon-0eigyf-yedek-isik-ustasi`.
  Kayıtlı seçim "lightshow" ise program gece göğüyle açılır. Sahneler v2 yeni bir fikirle sahibine sorularak başlar.
- Görsel tasarımda sahibi zor beğenir: seçenekleri gerçek boyutta, yan yana görsel olarak sun; bağımsız sanat
  yönetmeni denetimi işe yarıyor (puan 6 → hedef 8+).
