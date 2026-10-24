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
- **CI'da Linux işi `apt-get update`'te takılabiliyor:** test başlamadan 40 dakikada iptal olur. Bu altyapı
  hatasıdır; bir kez yeniden çalıştırılır (`rerun_failed_jobs`). Süreler: Windows sahne denetimi ~17–20 dk,
  kurulum dosyası ~10–25 dk, Rust ~3–4 dk.
- `check:scenes` yerelde: `SCENE_BROWSER_PATH=/opt/pw-browsers/chromium SCENE_BROWSER_ARGS="--use-gl=angle
--use-angle=swiftshader --enable-unsafe-swiftshader"`; `SCENE_ONLY=sahne1,sahne2` ile tek sahne. Port 4179'u
  aynı anda yalnızca bir denetim kullanabilir.

## 5. Teknik dersler

- **Epilepsi güvenliği yapının içinde olmalı:** kendi sahnelerimizde parlaklık tek bir hız sınırlı çarpandan gelir
  (`sceneLevel`); güvenilmeyen içerik (MilkDrop) her karede parlaklık freninden geçer (`flashGuard.ts`, kanıtı
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
- Betikle metin değiştirirken eşleşme sayısı denetlenir (`count == 1`): bir CSS değişikliği Ayarlar başlıklarının
  büyük harfini de sildi.

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
  resmin baskın rengi "birebir" (tek renkliyse o ton tam canlı, karışıksa beyaz), yazı Michroma. Sahibi kararları
  iki kez (biri tamamen bağımsız) denetlenerek verilsin istiyor.
- Görsel tasarımda sahibi zor beğenir: seçenekleri gerçek boyutta, yan yana görsel olarak sun; bağımsız sanat
  yönetmeni denetimi işe yarıyor (puan 6 → hedef 8+).
