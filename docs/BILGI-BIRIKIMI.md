# Bilgi birikimi ("ikinci beyin")

Lyraska'da çalışan her Claude oturumu bu dosyayı oturumun başında, `CLAUDE.md`'den hemen sonra okur. Burada
kurallar değil, **deneyimle öğrenilenler** durur: nasıl çalışınca iş hızlı ve sağlam ilerliyor, hangi tuzaklara
düşüldü, proje sahibi neye karar verdi. Yeni bir ders öğrenildiğinde ilgili bölüme kısa bir madde eklenir (tarihiyle).
Kalıcı bir kural hâline gelmesi gereken şey proje sahibine sorulup `CLAUDE.md`'ye taşınır.

## 1. Proje sahibiyle çalışma

- Proje sahibi yazılımcı değil; Türkçe, sade, kısa yazılır. Uzun teknik ayrıntı yerine "ne oldu, ne kaldı, sizden
  ne bekleniyor" yazılır.
- **"Dur" / "şimdilik dur" denince** çalışan bütün ajanlar durdurulur (`TaskStop`), PR izleme kapatılır, nerede
  kalındığı tek paragrafta yazılır. "Devam et" denince kalınan yerden sürülür (ajanlar `SendMessage` ile).
- Karar gerekiyorsa seçenekler ve öneri birlikte sunulur; **sahibi "sorma" dediyse o konu bir daha sorulmaz**
  (örnek: kod imzalama, 22 Ekim 2026).
- Sahibi bir öneri getirdiğinde (ör. bir GitHub reposu, bir özellik) önce lisans, telif ve "çevrimdışı" ilkesine
  uygunluğu denetlenir; uygun değilse nedeni sade dille anlatılıp yasal bir alternatif önerilir.

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
- **Bağımsız inceleme atlanmaz:** her büyük değişiklik ayrı bir ajana (kodu verip, sonucu vermeden) okutulur. Bu
  oturumlarda gerçek hatalar buldu: galeri listesi çekmecenin arkasında kalıyordu; sınırsız EEL `loop` arayüzü
  donduruyordu; çevrilen gölgelendiricilerde sınırsız GPU döngüsü vardı; parlaklık freni ince desen titremesini
  geçiriyordu. Bulgular önce testle yakalanıp düzeltilir.
- Kullanım limiti dolunca ajanlar yarıda kalır; limit yenilenince `SendMessage` ile kaldıkları yerden sürdürülür.

## 3. Ana dal başka oturumlarla ilerleyebilir

- Aynı anda başka oturumlar (ör. Faz 0 denetimi) `main`'e PR birleştirebilir. **PR açmadan ve birleştirmeden önce**
  `git fetch origin main` ile bakılır.
- Taşıma: dal `origin/main`'den yeniden kurulur, iş `git cherry-pick` ile alınır. Sürüm çakışmasında `main`'in
  sürümü alınıp bir sonrakine yükseltilir (`package.json`, `package-lock.json` iki kök alan, `Cargo.toml`,
  `Cargo.lock`'taki `lyraska`). `Cargo.lock` cargo ile yeniden üretilir; `UCUNCU-TARAF.txt` `npm run notices` ile.
- **Dışarıda (derleyicisiz) yazılan yamalar eski `main`'e göre yazılmış olabilir** (23 Ekim 2026, yama 0001):
  `git apply --reject` ile uyan parçalar alınır, reddedilenler `main`'deki hâliyle karşılaştırılıp yalnızca eksik
  kalan elle taşınır. `files/` kopyasını üstüne yazmak yeni işleri siler. Yamanın testleri `main`'deki testlerle
  aynı adı taşıyabilir: silinmez, yeniden adlandırılır.
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
- GLSL kaynakları TypeScript şablon metni içindeyse yorumlarda ters tırnak işareti kullanılmaz; şablon metnini kapatır.

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
- **Kaynak ayrıştırma** (davul/bas/vokal) seçildi, Faz 5'te. Karar bekleniyor: Spleeter (ağırlıklar MIT,
  kurulum +40–80 MB) ya da yapay zekâsız klasik yöntem.
- **Geri bildirim (23 Ekim 2026):** drop gösterimi tam olmamış; kütüphane paneli "aşırı kötü", beğenilmedi
  (yeniden tasarım gerekli). `.opus` ve `.webm` açılmalı (Faz 3b).
- Sahibi "çok yıldızlı GitHub repolarını kullan" dedi (23 Ekim 2026): yıldız sayısı ölçüt değildir; her repo
  lisans (AGPL/NC yok), çevrimdışı ilkesi ve gerçek bir ihtiyaca uygunlukla seçilir.
- MilkDrop: programla hazır görsel dağıtılmaz; kullanıcı kendi `.milk` dosyalarını açar.
