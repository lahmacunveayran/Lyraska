# Yayın hattı — bağımsız denetim raporu (Faz 0)

Denetlenen: `kod` kopyası, commit `4d09cb9` (main, sürüm 0.0.62). Canlı durum 23 Ekim 2026'da GitHub API ve
herkese açık sayfalardan okundu. Bulgu öneki: YAY.

## 1. Özet

- **Puan (a) depodaki kod ve yapılandırma: 8/10.** Yayın hattı sağlam ve katmanlı korunuyor: yalnızca bu deponun
  `main` push'unun yeşil CI'si, önbelleksiz derleme, en az yetki, SHA ile sabitlenmiş eylemler, "hâlâ main'in ucu mu"
  denetimi, SLSA v1 derleme kanıtı. Kusurlar: paketlenmiş program CI'da hiç kurulup açılmıyor, yayın hattının
  güvenlik kuralları hiçbir otomatik kapıyla korunmuyor.
- **Puan (b) GitHub ayarları ve satın alınacaklar dahil: 7/10.** `main` ruleset'i etkin (PR zorunlu, 5 zorunlu
  denetim, atlatma izni olan kimse yok, force-push ve silme yasak). Ama kurulum dosyası **kod imzasız** (kanıtlandı)
  ve kullanıcılara SmartScreen uyarısını geçmeleri öğretiliyor. Yayın işi bir GitHub "environment" ile korunmuyor.
- Sabit link canlı ve doğru: indirilen dosyanın SHA-256'sı sürüm notlarındaki değerle ve derleme kanıtının
  konusuyla birebir aynı. Kanıt `test-surumu.yml@refs/heads/main`, `workflow_run` olayı, GitHub'ın kendi
  makinesi ve commit `33ce52a` diyor.
- Kanıtlanan geçitler: iptal edilen bir main CI'si (`da291eb`) yayını "skipped" bıraktı. Sürüm notları, etiket ve
  dosya aynı commit'i gösteriyor.
- En önemli bulgular: **YAY-01** (Orta) paketlenmiş program CI'da hiç çalıştırılmıyor. **YAY-02** (Orta) yayın
  hattının güvenlik kurallarını bozan değişiklikler zizmor, actionlint ve check:docs'tan yeşil geçiyor (mutasyonla
  kanıtlandı). **YAY-10** (Orta, ayara/satın almaya bağlı) kod imzası yok.
- Düşük bulgular: check:docs yalnızca metin arıyor, Release yenilemesi bölünebilir, aynı sürüm numarası birden çok
  kez yayımlanıyor, kurulumdaki üçüncü taraf ikililerin lisans bildirimi yok, denetim araçlarının kendi tedarik
  zinciri kısmen sabitlenmemiş.

## 2. Kapsam ve yöntem

**Okunan dosyalar (tamamı):** `.github/workflows/ci.yml`, `test-surumu.yml`, `guvenlik-taramasi.yml`,
`.github/dependabot.yml`, `rust-toolchain.toml`, `.nvmrc`, `package.json` (sürüm ve betikler), `src-tauri/Cargo.toml`
(sürüm, `[profile.release]`), `src-tauri/tauri.conf.json`, `src-tauri/build.rs`, `src-tauri/windows-app-manifest.xml`,
`scripts/webview2-imzasi.ps1`, `README.md`, `SECURITY.md`, `src-tauri/deny.toml` (graph, sources, advisories),
`scripts/check-docs.mjs` (CI denetimi bölümü), `src-tauri/src/commands.rs` (sürüm testi),
`public/lisanslar/UCUNCU-TARAF.txt` ve `docs/LISANSLAR.md`'de arama. Yasaklı belgelere bakılmadı.

**Dış kaynak kodu (salt okuma):** Tauri CLI 2.12.1'in paketleyicisi (`tauri-cli-v2.12.1` etiketi):
`crates/tauri-bundler/src/bundle/windows/nsis/mod.rs`, `.../windows/util.rs`, `.../nsis/installer.nsi`,
`languages/Turkish.nsh`. Ayrıca `EmbarkStudios/cargo-deny-action@3c63498…` `action.yml` ve `Dockerfile`.

**Canlı durum (GitHub API, yalnızca GET):**

- depo bilgisi ve `branches/main`
- `rules/branches/main` ve `rulesets/25703689`
- `releases/tags/test-surumu` ve `git/refs/tags/test-surumu`
- iş akışı listesi; `ci.yml` ve `test-surumu.yml` çalıştırma geçmişi
- 39930621997 numaralı çalıştırmanın işleri ve dosyaları
- `attestations/sha256:b4a6…` ve `private-vulnerability-reporting`

**Deneyler** (`is-yayin/` altında; kopya `git clone`, `node_modules` sembolik bağ):

1. Sabit linkten kurulum dosyası indirildi: `sha256sum` sonucu `b4a66bc0…af9a`, notlardaki değerle aynı.
2. Kanıt paketi API'den alındı, DSSE yükü ve Fulcio sertifikasının uzantıları `openssl x509` ile okundu.
3. Kurulum dosyasının PE imza tablosu küçük bir Python betiğiyle (`araclar/pe_sig.py`) okundu.
4. Mevcut iş akışları `zizmor 1.31.1 --offline --min-severity=low`, `--persona=auditor` ve `actionlint v1.7.12` ile
   tarandı: temiz.
5. Mutasyonlar: M-A, M-A2, M-B, M-C, M-D (iş akışında güvenlik kuralını bozma) ve M-E1…M-E4 (check:docs).
   Ayrıntıları YAY-02 ve YAY-03'te.

**Sınırlar:**

- `gh attestation verify` çalışmadı: vekil sunucu Sigstore TUF'a erişimi engelliyor
  (`no valid Sigstore verifiers could be initialized`). Kanıtın kriptografik doğrulaması yapılamadı. İçeriği
  (konu karması, kaynak commit, imzalayan iş akışı, olay, makine) sertifikadan okundu.
- `pwsh` yok: `webview2-imzasi.ps1` yalnızca okunarak değerlendirildi.
- `shellcheck` yok: yerel actionlint kabuk denetimini atladı. CI'daki ubuntu makinesinde shellcheck kurulu gelir.
- `actions/permissions` ve `environments` uçları vekilde kapalı: fork PR onay ayarı ve environment'lar görülemedi.
- Rust derlemesi yapılmadı (BRIEF).

## 3. Bulgular

### YAY-01 — Paketlenmiş program CI'da ve yayında hiç kurulup açılmıyor

- Önem: Orta · Güven: Kesin · Standart: ISO/IEC 25010 güvenilirlik (olgunluk), SLSA dışı kalite kapısı
- Yer: `.github/workflows/test-surumu.yml:101-131`, `.github/workflows/ci.yml:239-286`
- Kanıt:
  - Ne iki iş akışında ne de `scripts/` altında kurulum dosyasını kuran ya da programı başlatan bir adım var.
    `grep -i -E 'Start-Process|/S\b|setup\.exe|Lyraska\.exe|tauri-driver|webdriver'` yalnızca yükleme yollarını
    buluyor (`ci.yml:277`, `test-surumu.yml:118`).
  - Sahne denetimi paketlenmiş programı değil, Vite önizleme sunucusunu Edge'de açıyor:
    `scripts/check-scenes.mjs:909` `const server = await preview(...)`, `:913` `chromium.launch(...)`.
  - Rust testleri webview'i açmıyor. Benzer bir sorunun daha önce yaşandığı `build.rs:91-94`'te yazıyor:
    manifestsiz test programı "Windows'ta hiç açılmaz (STATUS_ENTRYPOINT_NOT_FOUND)".
- Senaryo ve etki: Bir PR şunlardan birini değiştirir: `tauri.conf.json` (CSP, `frontendDist`), capabilities,
  bağlayıcı argümanları, manifest ya da gömülen bir DLL. Bütün testler yeşil kalır, kurulum dosyası derlenir ve
  sabit linke çıkar. Ama program açılmaz ya da beyaz ekranda kalır. Bunu ilk proje sahibi ya da kullanıcı fark eder.
  Sabit linkte bir önceki çalışan sürüm yoktur.
- Çürütme denemesi: Başka bir yerde koruma var mı diye bakıldı. `check:rules` CSP'yi metin olarak denetliyor,
  `check:scenes` arayüzü tarayıcıda açıyor. Hiçbiri paketlenmiş exe'yi WebView2 içinde açmıyor. Bulgu geçerli.
  Önemin Orta kalma nedeni: sahibi her sürümü elle deniyor ve kullanıcı sayısı küçük.
- Öneri: `test-surumu.yml` derleme işinde, kopyalama adımından sonra bir duman testi ekle:
  - `Start-Process Lyraska-Kurulum.exe -ArgumentList '/S' -Wait`
  - ardından `%LOCALAPPDATA%\Lyraska\lyraska.exe`'yi başlat
  - 20 saniye sonra süreç hâlâ yaşıyor mu ve `logs/lyraska.log`'da panik var mı diye bak, sonra süreci kapat.

  Aynı adım `ci.yml` `windows-kurulum` işine de eklenebilir.

### YAY-02 — Yayın hattının güvenlik kurallarını bozan değişiklikler hiçbir kapıdan kırmızı dönmüyor

- Önem: Orta · Güven: Kanıtlandı · Standart: OpenSSF Scorecard Dangerous-Workflow; GitHub Security Lab
  "Keeping your GitHub Actions and workflows secure" (workflow_run); SLSA Build L2 (derleme ortamı bütünlüğü)
- Yer: `.github/workflows/test-surumu.yml:22` (`workflow_run: # zizmor: ignore[dangerous-triggers]`), `:46-51`
  (`derle.if`), `:160` (main ucu denetimi), `:91` (`package-manager-cache: false`)
- Kanıt: kopyada (`is-yayin/repo`) her mutasyondan sonra `zizmor --offline --min-severity=low .github/workflows` ve
  `actionlint` çalıştırıldı:

  | Mutasyon    | Ne bozuldu                                                                                                                                                                | zizmor                                   | actionlint |
  | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------- |
  | M-A         | `derle.if`'ten `workflow_run.event == 'push'` ve `head_repository.full_name == github.repository` silindi (fork'taki `main` adlı daldan açılan PR'ın CI'si artık yeterli) | `No findings… (1 ignored, 2 suppressed)` | çıkış 0    |
  | M-A2        | `if [ "$head" = "$SHA" ]` yerine `if true` (eski sürümü sabit linke geri koymaya karşı koruma kalktı)                                                                     | `No findings`                            | çıkış 0    |
  | M-D         | Yayın derlemesinde `package-manager-cache: false` yerine `cache: npm` (önbelleksizlik sözü bozuldu)                                                                       | `No findings`                            | çıkış 0    |
  | Kontrol M-B | Şablon enjeksiyonu (`${{ github.event.workflow_run.head_branch }}` bir `run` içinde)                                                                                      | `error[template-injection]`, çıkış 14    | —          |
  | Kontrol M-C | `persist-credentials: false` silindi                                                                                                                                      | `warning[artipacked]`                    | —          |

  Yani zizmor genel hataları yakalıyor. Ama bu depoya özgü üç koruma (olay ve depo süzgeci, uç denetimi,
  önbelleksizlik) yorumlarda söz olarak duruyor ve hiçbir test bunları denetlemiyor. Tetikleyici uyarısı da bilerek
  susturulmuş.

- Senaryo ve etki: Kodu yapay zekâ oturumları yazıyor, sahibi YAML okumuyor. "Sadeleştirme" amaçlı bir PR M-A'yı
  yapar. Bunun üstüne bir başka PR M-A2'yi yaparsa, fork'tan `main` adlı daldan açılan bir PR'ın kodu derlenir ve
  imzalı kanıtla sabit linke çıkar. Bugün iki ayrı savunma var: M-A tek başına yayın yapamaz, çünkü uç denetimi
  fork SHA'sını reddeder. Bu yüzden önem Yüksek değil Orta.
- Çürütme denemesi: Ruleset `test-surumu.yml` değişikliğini engelleyebilir mi? Hayır. Ruleset yalnızca PR ve 5
  zorunlu denetim istiyor; bu mutasyonlarda beş denetim de yeşil kalır. CODEOWNERS ya da onay zorunluluğu yok
  (`required_approving_review_count: 0`).
- Öneri: `scripts/check-rules.mjs`'e küçük bir "yayın hattı" bölümü ekle. Bölüm `test-surumu.yml`'yi metin olarak
  okur ve şunları ister:
  1. `derle.if` içinde `workflow_run.event == 'push'` ve `head_repository.full_name == github.repository` bulunur.
  2. `"$head" = "$SHA"` karşılaştırması bulunur.
  3. Dosyada `cache:`, `rust-cache` ve `actions/cache` geçmez.
  4. `yayinla` dışındaki işlerde `contents: write` ve `id-token: write` yoktur.

  Aynı bölümün testine bu üç mutasyonu örnek olarak koy.

### YAY-03 — check:docs'un "her check:* CI'da çalışır" denetimi yalnızca metin arıyor

- Önem: Düşük · Güven: Kanıtlandı · Standart: ISO/IEC 25010 bakım kolaylığı (test edilebilirlik)
- Yer: `scripts/check-docs.mjs:153-158`
  ```js
  if (name.startsWith("check:") && !new RegExp(`npm run ${name}\\b`).test(ci)) {
  ```
- Kanıt (kopyada `node scripts/check-docs.mjs; echo $?`):
  - Değişiklik yokken: çıkış 0.
  - M-E1, adımı tamamen silmek: çıkış 1 ("check:rules CI'da çalışmıyor"). Kapı doğru çalışıyor.
  - M-E2, `run: "true" # npm run check:rules (geçici kapalı)`: çıkış **0**.
  - M-E3, adıma `continue-on-error: true` eklemek: çıkış **0** (zizmor de temiz).
  - M-E4, `arayuz` işine `if: github.event_name == 'pull_request'` eklemek: çıkış **0**. Bu durumda push CI'sında iş
    "skipped" olur, iş akışının sonucu yine "success" olur ve test sürümü TypeScript testleri bu commit'te
    koşulmadan yayımlanır.
- Senaryo ve etki: Geçici olarak kapatılan bir kapı unutulur. CLAUDE.md'deki "check:docs CI'nın her check:*
  betiğini çalıştırdığını denetler" sözü yalnızca kaba silmeye karşı tutuyor.
- Öneri: ci.yml'yi `yaml` paketiyle ayrıştır (zaten bağımlılık ağacında olabilir; yoksa basit satır
  ayrıştırması yeter). Sonra şunları ara:
  - `run` değeri tam olarak `npm run <ad>` ile başlayan bir adım var mı;
  - o adımda `continue-on-error` yok mu;
  - o adımın işinde `if:` yok mu (yalnızca `windows-kurulum` için izinli liste).

### YAY-04 — Release yenilemesi bölünebilir; "tutarlı kalır" sözü yalnızca yükleme hatası için doğru

- Önem: Düşük · Güven: Kesin · Standart: ISO/IEC 25010 güvenilirlik (hata toleransı)
- Yer: `.github/workflows/test-surumu.yml:205-232`
- Kanıt: Sıra şöyle:
  1. `.yeni` adıyla yükleme (`:212`)
  2. **eski dosyaları silme** (`:223` `gh api -X DELETE …/releases/assets/$id`)
  3. yeni dosyanın adını değiştirme (`:227`)
  4. etiketi taşıma
  5. notları değiştirme (`:232`)

  Yorum (`:206`) "Yükleme yarıda kalırsa Release eski dosyası… ile tutarlı kalır" diyor. Bu yalnızca 1. adımın
  hatası için doğru.

- Senaryo ve etki:
  - 2 ile 3 arasında: sabit link birkaç saniye 404 verir. 3. adım bir API hatasıyla düşerse link bir sonraki
    main güncellemesine kadar 404 kalır. Sonraki çalıştırma bunu kendiliğinden düzeltir (`--clobber` ve
    silme döngüsü).
  - 3 ile 5 arasında düşerse: yeni dosya eski notlarla durur. Notlardaki SHA-256 ve commit dosyayla uyuşmaz;
    elle doğrulayan biri "dosya değiştirilmiş" sanar.
- Öneri:
  - Yorumu düzelt.
  - Notlardaki SHA-256'yı yeni dosyanın adı değiştirilmeden önce yaz: `gh release edit` çağrısını 2. adımdan önceye
    al ve notlara "dosya yenileniyor" ibaresi koy. Ya da etiketi ve notları `.yeni` yüklendikten hemen sonra
    güncelle.
  - Son adım olarak `curl -fsIL` ile sabit linki ve `sha256sum`'u yeniden doğrula, uyuşmazsa işi kırmızı bitir.

### YAY-05 — Aynı sürüm numarası farklı derlemelerle birden çok kez yayımlanıyor

- Önem: Düşük · Güven: Kanıtlandı · Standart: Semantic Versioning 2.0 (madde 3: yayımlanan sürümün içeriği değişmez)
- Yer: `package.json:4`, `test-surumu.yml` (sürüm artışı denetlenmiyor)
- Kanıt: `git log --first-parent HEAD` üzerinde her commit'teki `package.json` sürümü sayıldı. `0.0.61` 2 commit'te,
  `0.0.54` 2, `0.0.52` 2, `0.0.44` **5** commit'te. Canlı Release şu an `0.0.61 · 33ce52a`. Tauri NSIS kurulumu aynı
  sürüm kuruluyken `SemverCompare` sonucu 0 olduğunda şu bakım ekranını açar (`installer.nsi:236-241`,
  `Turkish.nsh`): "Lyraska 0.0.61 daha önceden yüklenmiş… Bileşen Ekle/Yeniden Yükle / Lyraska'yı kaldır".
- Senaryo ve etki:
  - Sahibi yeni test sürümünü kurarken "zaten yüklü" ekranıyla karşılaşır; yanlış düğmeyle programı kaldırabilir.
  - Hata kayıtlarında "0.0.61" iki ayrı derlemeyi gösterir. Derleme kodu (commit) bunu kısmen çözüyor.
- Öneri: `test-surumu.yml` derleme işine bir adım ekle: bu sürümle önceki yayının etiketi farklı değilse
  (`git show HEAD~1:package.json` ile karşılaştırma ya da önceki notlardaki sürüm) uyarı versin. Daha iyisi: CI'da PR
  için "package.json sürümü main'dekinden büyük mü" denetimi (`check:rules`).

### YAY-06 — Kurulum dosyasına gömülen üçüncü taraf ikililer lisans bildirimlerinde yok

- Önem: Düşük · Güven: Yüksek · Standart: GPL-3.0 §6 (toplu dağıtım), MIT bildirim şartı, SPDX; CLAUDE.md lisans kuralları
- Yer: `src-tauri/tauri.conf.json:45` (`embedBootstrapper`); kurulum şablonu `installer.nsi:234,421`
  (`nsis_tauri_utils::SemverCompare`, `nsis_tauri_utils::RunAsUser`); paketleyici `nsis/mod.rs:38-43`
  (NSIS 3.11 ve `nsis_tauri_utils.dll` v0.5.3 derleme anında indiriliyor)
- Kanıt: `grep -i -E 'nsis|webview2|bootstrap' public/lisanslar/UCUNCU-TARAF.txt docs/LISANSLAR.md` yalnızca
  `webview2-com` crate'ini buluyor. NSIS (zlib/libpng), `nsis_tauri_utils.dll` (MIT OR Apache-2.0) ve Microsoft
  WebView2 önyükleyicisi (Microsoft dağıtım koşulları) ikisinde de geçmiyor.
- Senaryo ve etki: Dağıtılan `.exe`'nin içinde MIT lisanslı bir DLL var, ama telif bildirimi hiçbir yerde yok. Ayrıca
  CLAUDE.md "dışarıdan alınan varlıklar LISANSLAR.md'ye not edilir" diyor. Hukuki risk küçük, kural ihlali kesin.
- Öneri: `docs/LISANSLAR.md`'ye "Kurulum dosyası" bölümü ekle (NSIS 3.11, nsis_tauri_utils 0.5.3, WebView2
  önyükleyicisi; kaynak URL'leri `nsis/mod.rs`'teki gibi). `scripts/notices/` altına `nsis_tauri_utils` MIT metnini
  koy ve `third-party-notices.mjs`'e elle eklenen bir giriş olarak ekle.

### YAY-07 — Denetim araçlarının kendi tedarik zinciri kısmen sabitlenmemiş

- Önem: Düşük · Güven: Kesin · Standart: OpenSSF Scorecard Pinned-Dependencies
- Yer: `.github/workflows/ci.yml:155` (`pipx run zizmor==1.31.1`); `ci.yml:117,140` cargo-deny-action
- Kanıt:
  - `pipx run` yalnızca zizmor'un kendi sürümünü sabitliyor; dolaylı Python bağımlılıkları karma (hash) olmadan
    PyPI'dan çözülüyor.
  - cargo-deny-action@3c63498'in `Dockerfile`'ı:
    `RUN … apk update; apk add bash curl git tar openssh; curl --silent -L https://github.com/EmbarkStudios/cargo-deny/releases/download/$deny_version/cargo-deny-…tar.gz | tar -xzv`
    İndirilen dosyanın karması denetlenmiyor (temel imaj karmayla sabit).
  - `go install …@v1.7.12` ise Go sağlama toplamı veritabanıyla doğrulanıyor (temiz).
- Senaryo ve etki: Bu işler `contents: read` ile çalışıyor ve sır taşımıyor; yayın dosyasına bir şey girmiyor. En kötü
  durumda ele geçirilmiş bir araç kapıyı sahte yeşil gösterir ya da salt okuma token'ını görür. Uzak senaryo, önem
  Düşük.
- Öneri: zizmor için `uvx --from 'zizmor==1.31.1' --with-requirements` karmalı bir `requirements.txt` kullan ya da
  zizmor'un resmî eylemini SHA ile sabitle. cargo-deny için `taiki-e/install-action` (karma denetimli) ya da
  `cargo install --locked cargo-deny@0.x` kullan.

### YAY-08 — "Test sürümü" başarısız olursa sabit link sessizce eski sürümde kalıyor

- Önem: Bilgi · Güven: Yüksek · Standart: ISO/IEC 25010 güvenilirlik
- Yer: `test-surumu.yml` (bildirim adımı yok); `README.md:44` "rebuilt automatically every time `main` changes and
  CI passes"
- Kanıt: `derle` ya da `yayinla` kırmızı biterse yalnızca GitHub'ın varsayılan e-postası gider. Sürüm notları,
  dosya ve etiket eski commit'te kalır. Canlı örnek: `4d09cb9` birleştirildi (09:40 UTC), link o sırada hâlâ
  `0.0.61 · 33ce52a` gösteriyordu. Bu beklenen gecikme (CI yaklaşık 25 dk, derleme yaklaşık 12 dk), ama bir hata
  durumunda da görünüm aynı olur.
- Öneri: README'ye ve sahibine verilen talimata "Ayarlar → Program'daki derleme kodu GitHub'daki main'in son
  commit'iyle aynı mı" kontrolünü ekle. İstenirse `yayinla` başarısız olunca bir issue açan küçük bir adım
  (`issues: write`) eklenebilir.

### YAY-09 — Doğrulama talimatı yalnızca `gh` CLI ile; Windows'ta karma karşılaştırma tarifi yok

- Önem: Bilgi · Güven: Kesin · Standart: SLSA v1.0 "verification" (tüketici tarafı)
- Yer: `README.md:49-53`, `SECURITY.md:152-156`, sürüm notları (`test-surumu.yml:186-191`)
- Kanıt: Tek doğrulama yolu `gh attestation verify …`; GitHub CLI kurulumu ve girişi gerekiyor. Notlardaki SHA-256
  dosyayla aynı sayfada, yani aynı güven alanında; tek başına bir şey kanıtlamaz. Kanıt ise ayrı ve imzalı olduğu
  için asıl doğrulama yolu o.
- Öneri: README'ye tek satırlık bir PowerShell ekle: `Get-FileHash .\Lyraska-Kurulum.exe -Algorithm SHA256`. Yanına
  "bu değer GitHub'daki Attestations sayfasındaki konu karmasıyla aynı olmalı" açıklamasını koy.

### Proje sahibinin ayarına bağlı

### YAY-10 — Kurulum dosyası kod imzasız; kullanıcılara SmartScreen uyarısını geçmeleri öğretiliyor

- Önem: Orta · Güven: Kanıtlandı · Standart: OpenSSF Scorecard Signed-Releases (kısmen), Microsoft Authenticode / SmartScreen
- Yer: `src-tauri/tauri.conf.json:44-51` (`signCommand` ya da `certificateThumbprint` yok); `test-surumu.yml:196-198`
  ("**Ek bilgi** → **Yine de çalıştır**'a basın"); `README.md:44-46`
- Kanıt: `python3 -I araclar/pe_sig.py indir/Lyraska-Kurulum.exe` çıktısı
  `Lyraska-Kurulum.exe PE32 imza tablosu: 0 0`. PE'nin güvenlik dizini boş, yani Authenticode imzası yok. `file`
  çıktısı: `PE32 executable (GUI) … Nullsoft Installer self-extracting archive`.
- Senaryo ve etki: Her kullanıcıya "tanınmayan yayımcı uyarısını geçin" deniyor. Bir saldırgan aynı adla
  (`Lyraska-Kurulum.exe`) bir dosya dağıtırsa (taklit depo, forum linki) Windows ile kullanıcı arasında ayırt edici
  bir işaret kalmaz. Derleme kanıtı bunu çözmüyor, çünkü Windows onu okumuyor ve kullanıcılar `gh` kullanmıyor.
  Proje bunu biliyor ("imzalama Faz 4'te"). Önem Orta: kullanıcı kitlesi şimdilik küçük.
- Çürütme denemesi: Kurulumun içindeki program imzalı olabilir mi? PE tablosu yalnızca dış dosyayı gösteriyor;
  `tauri.conf.json`'da hiçbir imza ayarı olmadığı için içteki `lyraska.exe` de imzasız (Kesin). WebView2
  önyükleyicisi Microsoft imzalı, ama o ayrı bir dosya.
- Öneri: Açık kaynak için ücretsiz SignPath Foundation ya da Azure Trusted Signing (aylık ücretli). Sonra
  `tauri.conf.json` `bundle.windows.signCommand` ile imzala; sertifika ya da kimlik bilgisi `yayinla` benzeri ayrı,
  environment korumalı bir işte kullanılmalı.

### YAY-11 — Yazma yetkili yayın işi bir GitHub environment ile korunmuyor

- Önem: Düşük · Güven: Yüksek · Standart: GitHub Actions security hardening ("Using environments"), OpenSSF Token-Permissions
- Yer: `.github/workflows/test-surumu.yml:137-146` (`yayinla`: `contents: write`, `id-token: write`,
  `attestations: write`; `environment:` yok)
- Kanıt: İş akışında `environment:` anahtarı yok. Bu yüzden "yalnızca main'den yayın" kuralı yalnızca YAML'da
  (`derle.if`, uç denetimi) duruyor; GitHub ayarlarında bunun karşılığı yok. Bu kuralların YAML değişikliğiyle
  sessizce düşebildiği YAY-02'de gösterildi.
- Senaryo ve etki: YAY-02'deki gibi bir YAML gerilemesi ayar düzeyinde ikinci bir engelle karşılaşmaz.
- Öneri:
  - Sahibi: GitHub → Settings → Environments → **New environment** "test-surumu" → **Deployment branches and
    tags**: "Selected branches" → `main`.
  - Claude: `yayinla` işine `environment: test-surumu` ekler. İleride imza kimlik bilgisi de buraya konur.

### YAY-12 — Ruleset ayrıntıları: onay sayısı 0, etiket koruması yok

- Önem: Bilgi · Güven: Kanıtlandı · Standart: OpenSSF Scorecard Branch-Protection ve Code-Review
- Yer: GitHub ruleset 25703689 "main koruması"
- Kanıt: `GET rules/branches/main` şunları gösteriyor:
  - `deletion`, `non_fast_forward` kuralları;
  - `pull_request` kuralı, `required_approving_review_count: 0` ile;
  - `required_status_checks` kuralı, 5 bağlam ve `integration_id: 15368` (GitHub Actions) ile;
    `strict_required_status_checks_policy: false`.

  `bypass_actors: []`, `current_user_can_bypass: never`. Ruleset 2026-10-23 07:03 UTC'de oluşturulmuş; öncesinde
  `main` korumasızdı. `GET rulesets?targets=tag` sonucu `[]`: `test-surumu` etiketi korunmuyor.

- Değerlendirme: Tek kişilik projede 0 onay olağan. Zorunlu denetimlerin uygulama kimliğine bağlanması iyi:
  başka bir uygulama sahte "başarılı" durum bildiremez. Etiketi yalnızca yazma yetkilileri (sahibi ve Actions
  token'ı) taşıyabilir. Öneri yok; YAY-11 yeterli.

## 4. Olası riskler (kanıtı yetmeyenler)

- **Fork PR onay ayarı görülemedi** (`actions/permissions` uçları vekilde kapalı). Varsayılan ayar "ilk kez katkı
  verenler için onay". Fork PR'ları `windows-kurulum` işinde kurulum dosyası derleyip PR'ın Artifacts bölümüne koyuyor
  (salt okuma token'ıyla, sırsız). "Tüm dış katkıcılar için onay" seçilmezse yabancı bir PR Windows makinelerinde
  kod çalıştırır ve depo adına görünen bir `.exe` üretir. Sahibine yalnızca sabit link verildiği için etkisi küçük.
- **Kanıtın kriptografik doğrulaması** bu ortamda yapılamadı (Sigstore TUF engelli). İçerik doğru görünüyor;
  imza zincirinin geçerliliği varsayıldı.
- **`webview2-imzasi.ps1`**: `-notmatch "O=Microsoft Corporation"` sabitlenmemiş bir düzenli ifade. Güvenilir bir
  CA'nın "O=Microsoft Corporation X" adına kod imzası sertifikası vermesi gerekir; pratikte uzak. Betik ayrıca
  gömülen dosyanın kendisini değil, `%LOCALAPPDATA%\tauri`'deki kopyasını denetliyor. Önbelleksiz, temiz makinede
  ikisi aynı dosya (`util.rs:53-58` dosya yoksa indirir). pwsh olmadığından denenemedi.
- **NSIS araç zinciri SHA-1 ile doğrulanıyor** (`nsis/mod.rs:41-43`). İkinci ön görüntü saldırısı bugün pratik
  değil; Tauri'nin seçimi, projenin değil.
- **Güvenlik taraması** (`guvenlik-taramasi.yml`) bugün eklenmiş, henüz hiç çalışmamış (`total_count: 0`). İlk
  çalışması pazartesi 06:17 UTC. Herkese açık depolarda zamanlanmış iş akışları 60 gün hareketsizlikten sonra
  GitHub tarafından kapatılır. `dependabot_security_updates: disabled`; bilinçli bir seçim (dependabot.yml yorumu).

## 5. Temiz bulunanlar

- **Tetikleyici süzgeci** (`test-surumu.yml:44-51`): olay `push`, dal `main`, `head_repository == github.repository`,
  sonuç `success`. Canlı kanıt: CI'si iptal edilen `da291eb` için test sürümü `skipped`. Elle başlatma yalnızca
  `refs/heads/main`'den ve o commit için başarılı bir push CI'si varsa (`:69-79`).
- **Uç denetimi** (`:155-165`): "Re-run" ya da gecikmiş bir çalıştırma eski derlemeyi sabit linke koyamaz.
  Ruleset force-push'u yasakladığı için main yalnızca ileri gider.
- **Kanıtın kaynak commit'i**: `workflow_run`'da kanıt `github.sha`'yı (olay anındaki main ucu) kaydediyor, derlenen
  `head_sha`'yı değil. Uç denetimi ve force-push yasağı birlikte, yayın yapıldığında bu ikisinin aynı olmasını
  sağlıyor. Canlı kanıtta ikisi de `33ce52a`.
- **En az yetki**: üst düzey `permissions: {}` ya da `contents: read`. Derleme işinde yazma yetkisi yok. Yazma ve
  `id-token` yalnızca depo kodunu çalıştırmayan `yayinla` işinde. `secrets.` hiç kullanılmıyor.
  `pull_request_target` yok.
- **Eylem sabitleme**: bütün üçüncü taraf eylemler 40 haneli SHA ile sabit. `persist-credentials: false` her
  checkout'ta var. zizmor (auditor kişiliği dahil) ve actionlint temiz. Dependabot eylemleri ayda bir topluca
  güncelliyor.
- **Önbelleksiz yayın derlemesi**: `package-manager-cache: false`, rust-cache yok. `npm ci` ve `cargo … --locked`
  kullanılıyor. Kopyalama adımı yalnızca bu sürümden tam 1 kurulum dosyası kabul ediyor (`:118-119`).
- **Araç zinciri sabitleri**: `rust-toolchain.toml` 1.97.0, `.nvmrc` 22.22.0; CI, yayın ve yerel derleme aynı
  kaynaktan okuyor. `package.json` ve `Cargo.toml` sürümleri aynı (0.0.62); eşitliği Rust testi
  `surum_package_json_ile_ayni` (`commands.rs:1043-1052`) denetliyor. `tauri.conf.json` sürümü `../package.json`'dan
  alıyor.
- **Derleme kodu**: `LYRASKA_COMMIT` env üzerinden (şablon enjeksiyonu yok) `build.rs`'e geçiyor. Biçimi
  doğrulanıyor (`short_sha`). Canlı notlar ve etiket `33ce52a` ile tutarlı.
- **WebView2 önyükleyicisi**: karmasız indirilen tek ikili. Yayımlanmadan önce Microsoft imzası denetleniyor; arama
  yolu Tauri 2.12.1'in gerçek yoluyla (`dirs::cache_dir()/tauri` = `%LOCALAPPDATA%\tauri`) aynı.
- **cargo-deny** Windows hedefini de kapsıyor (`deny.toml [graph] targets`). `unknown-registry` ve `unknown-git`
  `deny`. npm kilidindeki 278 `resolved` adresinin hepsi `registry.npmjs.org`.
- **Ruleset**: 5 zorunlu denetim CI'daki iş adlarıyla birebir aynı. `windows` toplayıcı işi push'ta atlanan kurulum
  işini doğru yorumluyor. Atlatma izni olan kimse yok.
- **Release ve link**: sabit adres çalışıyor; dosya, notlardaki SHA-256 ve kanıtın konusu aynı. Release `prerelease`
  ve Actions botu tarafından yazılmış. Hata ayıklama sembolleri 90 gün saklanıyor (13,6 MB).
- **GPL kaynak gösterimi**: sürüm notları derlenen commit'e link veriyor. `licenseFile` kurulumda GPL'i gösteriyor.
- **SECURITY.md**: özel güvenlik bildirimi açık (`private-vulnerability-reporting: enabled: true`). Depoda ikili
  dosya yok. Gizli bilgi taraması ve push koruması açık.
- **README "Checks" listesi** CI'nın çalıştırdıklarıyla uyumlu. `npm run check` betiği README'de sayılanlarla aynı.

## 6. Öncelikli düzeltme sırası

1. **YAY-01**: `test-surumu.yml`'ye (ve PR kurulum işine) sessiz kurulum ve programı başlatan bir duman testi ekle.
2. **YAY-02**: `check-rules.mjs`'e yayın hattı kurallarını (olay ve depo süzgeci, uç denetimi, önbelleksizlik,
   yetkiler) metin olarak denetleyen bölüm ve mutasyon testleri ekle.
3. **YAY-11**: "test-surumu" environment'ı (yalnızca `main`) oluştur ve `yayinla` işine bağla. Sahibinin bir
   ayarı, bir satır YAML.
4. **YAY-10**: Kod imzası için SignPath Foundation başvurusu ya da Azure Trusted Signing; `signCommand`.
5. **YAY-03**: check:docs'u adım düzeyinde yap (`run` başlangıcı, `continue-on-error` ve `if` yasağı).
6. **YAY-04**: Release yenileme sırasını düzelt, sonda sabit linkin SHA-256'sını yeniden doğrula, yorumu düzelt.
7. **YAY-06**: NSIS, nsis_tauri_utils ve WebView2 önyükleyicisini `LISANSLAR.md`'ye ve bildirimlere ekle.
8. **YAY-05**: PR'da "sürüm main'dekinden büyük mü" denetimi.
9. **YAY-07**: zizmor ve cargo-deny kurulumunu karma denetimli yap.
10. **YAY-08 ve YAY-09**: README'ye derleme kodu kontrolü ve `Get-FileHash` tarifi ekle.
