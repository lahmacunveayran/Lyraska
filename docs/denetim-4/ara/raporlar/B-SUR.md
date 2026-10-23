# Test kalitesi, yayın hattı ve tedarik zinciri güvenliği, lisans uyumu — Bağımsız Faz 1 denetim raporu

Denetçi: **B-SUR**. Kaynak: `main` @ `94bc3d6` (0.0.56). Tarih: 22 Ekim 2026.

## 1. Kapsam ve yöntem

**İncelenen dosyalar** (yalnızca `/home/user/denetim-bagimsiz/kaynak/` kopyası):

| Alan | Dosyalar | Satır |
| --- | --- | --- |
| CI / yayın hattı | `.github/workflows/ci.yml` (224), `.github/workflows/test-surumu.yml` (167), `.github/ISSUE_TEMPLATE/*` | 391 + şablon |
| Derleme / tedarik zinciri | `src-tauri/Cargo.toml` (66), `src-tauri/Cargo.lock` (479 paket), `src-tauri/deny.toml` (58), `src-tauri/build.rs`, `src-tauri/tauri.conf.json` (53), `src-tauri/capabilities/default.json`, `package.json`, `package-lock.json` (274 paket) | — |
| Denetim betikleri | `scripts/check-licenses.mjs` (75), `check-no-audio.mjs` (20), `check-commands.mjs` (128), `third-party-notices.mjs` (256), `check-scenes.mjs` (513) | 992 |
| Lisans | `LICENSE`, `docs/LISANSLAR.md`, `public/lisanslar/UCUNCU-TARAF.txt` (9 037 satır), `public/lisanslar/Inter-OFL-1.1.txt` | — |
| Test kodu | Rust: 48 kaynak dosyasında 381 `#[test]` (424 birim testi + 4 kodek testi + 3 `#[ignore]`), `src-tauri/tests/formats.rs`, `tests/data/`; TypeScript: 40 `*.test.ts(x)` dosyasında 317 test | — |

Üçüncü taraf kaynak olarak yalnızca `tauri-bundler 2.10.4` crate'i (crates.io'dan indirildi; derleme sırasında ne
indirdiğini görmek için) ve GitHub Actions belgelerinin kaynak deposu (`github/docs`) okundu.

**Standartlar:** CLAUDE.md kuralları; GitHub Actions güvenlik kılavuzu ("secure use", "preventing pwn requests");
OpenSSF Scorecard "Dangerous-Workflow", "Pinned-Dependencies", "Signed-Releases"; SLSA (kaynak→derleme izlenebilirliği);
GPL-3.0 §4–6 (kaynak sunma, bildirimler), MPL-2.0 §3 (ikincil lisans uyumu), MIT/BSD (bildirim şartı); CVSS 3.1.

**Çalıştırılan araçlar ve deneyler** (hepsi kendi kopyamda, `calisma/B-SUR/kopya`; kanıt dosyaları
`/home/user/denetim-bagimsiz/calisma/B-SUR/kanit/`):

| Deney | Komut | Kanıt |
| --- | --- | --- |
| npm kalite kapıları | `npm run build/lint/typecheck/format:check`, `npm test`, `check:commands/licenses/audio/notices`, `npm audit --omit=dev` | `kanit/npm-kapilar.log` |
| Rust kalite kapıları | `cargo fmt --check`, `cargo deny check licenses bans sources`, `cargo deny check advisories`, `cargo clippy --all-targets --locked -- -D warnings`, `cargo test --locked` (+ `src/lib/bindings` yeniden üretilip depodakiyle `diff`) | `kanit/rust-kapilar.log` |
| Kararsız test tekrarı | aynı test dosyası 4 kez (yük altında / tek başına) | `kanit/npm-kapilar.log`, `kanit/vitest-tekrar-1.log`, `kanit/vitest-coverage.log`, `kanit/vitest-coverage-2.log` |
| Arayüz mutasyon testi | 13 elle mutasyon (`src/lib/queue.ts`, `src/lib/format.ts`) + ilgili vitest dosyaları | `calisma/B-SUR/ts-mutasyon/calistir.py`, `sonuc.txt` |
| Rust mutasyon testi | `cargo mutants --in-place -f src/audio/gapless.rs -- --lib --test formats -- gapless decode bosluksuz her_bicim` | `calisma/B-SUR/mutants-gapless/` |
| Arayüz kapsamı | `vitest run --coverage` (v8), `src/lib`, `src/hooks`, `src/components` | `kopya/coverage/coverage-summary.json` |
| Rust kapsamı | `cargo llvm-cov --lib --test formats` | `kanit/llvm-cov.log` |
| Eylem sabitleme doğrulaması | `git ls-remote --tags/--heads` ile 7 eylemin SHA'sı | `kanit/eylem-sha-dogrulama.txt` |
| Tekrarlanabilirlik | Vite derlemesi iki kez, bütün `dist/` dosyalarının SHA-256'sı | `kanit/dist-1.sha`, `dist-2.sha` |
| Lisans uyumu | 17 MPL-2.0 crate'inde "Exhibit B" (ikincil lisanslarla uyumsuz) bildirimi taraması; `UCUNCU-TARAF.txt` lisans dağılımı; Inter lisans metni paketle karşılaştırma | bölüm 4 |
| Derleme zamanı indirmeleri | `tauri-bundler` 2.10.4 kaynağı: `src/bundle/windows/util.rs`, `utils/http_utils.rs` | `calisma/B-SUR/indirilen/bundler/` |

Ağ kısıtı: GitHub API'si bu oturumda yalnızca proje deposuna açık; eylem SHA'ları `git ls-remote` ile doğrulandı,
GitHub belgeleri `github/docs` deposunun ham dosyalarından okundu.

## 2. Genel değerlendirme

**Puan: 6/10.**

En güçlü yan: kalite kapılarının tamamı gerçekten çalışıyor ve temiz (lint, biçim, tür, clippy `-D warnings`,
cargo-deny lisans/kaynak/uyarı, komut sözleşmesi, bindings eşitliği, üçüncü taraf bildirim dosyası); eylemler SHA
ile sabitlenmiş ve 7/7 doğru; `--locked` kullanılıyor; yazma izni yalnızca kod çalıştırmayan işte; Rust
birim testleri yüksek nitelikli (ör. boşluksuz çalma testi dört kodekte örnek örnek hizalama ölçüyor; mutasyon
testinde gapless modülünün hayatta kalan mutantı az) ve lisans uyumu (GPL-3.0 + MPL/Apache/MIT/OFL) doğru kurulmuş.

En zayıf yan: yayın hattının tasarımı. "CI yeşil bitince main'i yayımla" niyetiyle kurulan `workflow_run`
tetikleyicisi, GitHub'ın bilinen davranışı yüzünden **çatal (fork) PR'ının CI'sinde de** tetiklenebiliyor ve
derlediği şeyi, proje sahibine "indirip kur" dediğimiz sabit linke koyuyor. Bunun üstüne kurulum dosyası
imzasız ve kullanıcı SmartScreen uyarısını geçmeye alıştırılıyor.

Bir numaralı risk: **B-SUR-01** — dışarıdan açılan bir PR'ın (birleştirilmeden!) sabit indirme linkine
kötücül bir `Lyraska-Kurulum.exe` yerleştirebilmesi. Tek koşul, o PR'ın CI'sinin bir kez çalışması.

## 3. Bulgular (önem sırasıyla)

### [B-SUR-01] Çatal PR'ının kodu, birleştirilmeden, sabit indirme linkine yayımlanabilir

- Önem: **Kritik** / Güven: **kesin** (kod akışı + GitHub belgeleri; GitHub Actions bu ortamda çalıştırılamaz) /
  CVSS 3.1: **8.0 Yüksek** — `AV:N/AC:H/PR:L/UI:R/S:C/C:H/I:H/A:H`
- Yer: `.github/workflows/test-surumu.yml:13-16` (tetikleyici), `:35` (`if`), `:48-52` (derlenecek commit),
  `:103` (`contents: write`), `:141` (etiketi taşıma); `.github/workflows/ci.yml:12` (`pull_request`).
- Kanıt:

  ```yaml
  # test-surumu.yml
  on:
    workflow_run:
      workflows: [CI]
      types: [completed]
      branches: [main]          # ← tetikleyen CI çalıştırmasının BAŞ (head) dalı süzülür, deposu değil
  ...
      if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'
  ...
        env:
          HEAD_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}   # ← tetikleyen çalıştırmanın commit'i
  ...
      - uses: actions/checkout@...
        with:
          ref: ${{ steps.kaynak.outputs.sha }}                                # ← o commit derleniyor
  ```

  GitHub belgeleri (`github/docs`, `data/reusables/actions/workflows/section-specifying-branches.md`, kanıt:
  `kanit/gh-docs-workflow-run-branches.md`): *"When using the `workflow_run` event, you can specify what branches
  the **triggering workflow must run on** in order to trigger your workflow."* Tetikleyen iş akışı CI'dir ve CI
  `pull_request` olayında **PR'ın baş dalında** çalışır; çataldan açılan bir PR'ın baş dalı çatalın kendi dalıdır.
  Çatalın dalı `main` adını taşıyorsa (`github.event.workflow_run.head_branch == "main"`) süzgeç geçer. Yayın iş
  akışı `head_repository`'nin bu depo olup olmadığına, `workflow_run.event`'in `push` olup olmadığına **bakmaz**.
  GitHub'ın güvenlik kılavuzu (`kanit/gh-docs-hardening.md:111,123`): *"The `pull_request_target` and
  `workflow_run` workflow triggers, when used with the checkout of an untrusted pull request, expose the
  repository to security compromises... Workflows that use these triggers must not explicitly check out untrusted
  code, including from pull request forks."* Burada tam olarak bu yapılıyor: `ref: head_sha` ile tetikleyen
  çalıştırmanın commit'i indiriliyor (PR'ın baş commit'i `refs/pull/N/head` üzerinden ana depodan çekilebilir;
  `actions/checkout` bunu SHA ile yapar). Olay yükünde düzeltme için gereken alanlar var: `workflow_run.event`,
  `head_branch`, `head_repository`, `head_sha` (octokit webhook şeması, `kanit/workflow_run-common.json`).

  Saldırı senaryosu (adım adım):
  1. Saldırgan depoyu çatallar, çatalında `main` dalına bir "yazım hatası düzeltmesi" ile birlikte kötücül bir
     derleme adımı koyar (ör. `package.json` → `scripts.build`; `tauri build` bunu `beforeBuildCommand` olarak
     çalıştırır; ya da `build.rs`). PR açar.
  2. CI'nin PR'da çalışması gerekir: daha önce bir PR'ı birleşmiş katkıcı için otomatik; ilk kez katkıda bulunan
     için proje sahibinin "Approve and run" düğmesine basması yeterli (PR'ı **birleştirmesi gerekmez**). CI'nin
     `pull_request` çalıştırması PR'daki `ci.yml`'i kullanır; saldırgan testleri de yeşile boyayabilir.
  3. CI "success" ile biter → `Test sürümü` iş akışı `main`'deki (güvenilir) dosyasıyla tetiklenir, ama
     `head_sha` = saldırganın commit'i; `derle` işi onu Windows'ta derler.
  4. `yayinla` işi (`contents: write`) `test-surumu` etiketini saldırganın commit'ine taşır
     (`force=true`), Release notlarına saldırganın commit'ini ve SHA-256'sını yazar ve
     `Lyraska-Kurulum.exe`'yi **değiştirir**.
  5. Proje sahibi (CLAUDE.md: "test için sahibine her zaman sabit indirme linki verilir") dosyayı indirir;
     Release notu "SmartScreen uyarısı normaldir, Yine de çalıştır" der (`test-surumu.yml:131`). Kötücül kod
     sahibinin bilgisayarında, kullanıcı haklarıyla çalışır.

  Kendini çürütme denemesi: (a) `permissions: {}` ve `contents: read` derleme işini sınırlar ama yayınlama
  işinin yazma izni ve artefakt zinciri tam da bu senaryoya hizmet eder; (b) `branches: [main]` dalı değil
  "baş dal adını" süzer — belgede bu açıktır; (c) `--locked` ve SHA sabitleme saldırganın kendi commit'ine
  karşı hiçbir şey yapmaz; (d) CI'de `persist-credentials: false` yazma yetkisini değil, derlenen kodun
  içeriğini ilgilendirmez; (e) `cancel-in-progress: false` ve kuyruk saldırganın yayınını engellemez, yalnızca
  sıraya koyar. Çürütülemedi.
- Etki: Depoya hiç yazma hakkı olmayan biri, proje sahibinin düzenli indirdiği kurulum dosyasını değiştirir;
  etiketin taşınmasıyla "resmî" görünen commit linki de saldırganın commit'ini gösterir (GitHub'da ana depo
  altında `…/commit/<sha>` olarak açılır). Tedarik zinciri saldırısı; sahibinin bilgisayarının ele geçirilmesi.
- Önerilen düzeltme (en küçük doğru):
  ```yaml
  derle:
    if: >-
      github.event_name == 'workflow_dispatch' ||
      (github.event.workflow_run.conclusion == 'success' &&
       github.event.workflow_run.event == 'push' &&
       github.event.workflow_run.head_branch == 'main' &&
       github.event.workflow_run.head_repository.full_name == github.repository)
  ```
  Ek sertleştirme: `workflow_dispatch` için de yalnızca `main` referansına izin ver (bkz. B-SUR-12); yayın
  öncesi `head_sha`'nın `main`'in atası olduğunu `gh api repos/.../compare/main...$SHA` ile doğrula; artefakt
  için `actions/attest-build-provenance` (B-SUR-02).
- Hatayı yakalayacak test: iş akışı için birim test yazılamaz; **düzenli denetim** olarak depoya OpenSSF
  Scorecard eylemi (`ossf/scorecard-action`, "Dangerous-Workflow" denetimi) ve `zizmor` (GitHub Actions statik
  analizi; `workflow_run` + `checkout ref` kalıbını "dangerous-triggers/artipacked" olarak bildirir) eklenmeli;
  kabul ölçütü: bu iki aracın `test-surumu.yml` için sıfır yüksek bulgu vermesi.

### [B-SUR-02] Kurulum dosyası imzasız, kaynağı doğrulanamıyor; kullanıcı SmartScreen'i geçmeye alıştırılıyor

- Önem: **Yüksek** / Güven: **kesin** / CVSS 3.1: **7.5** (ikincil; B-SUR-01 ya da hesap ele geçirme ile
  birleşince etkiyi büyütür) — `AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:H`
- Yer: `.github/workflows/test-surumu.yml:109-133` (Release notları), `:119` (SHA-256), `src-tauri/tauri.conf.json`
  (`bundle.windows` altında imza ayarı yok), `README.md:42`.
- Kanıt: Release notu kullanıcıya şunu söylüyor: *"Windows 'Windows kişisel bilgisayarınızı korudu' derse Ek
  bilgi → Yine de çalıştır'a basın. (Program henüz dijital olarak imzalanmadığı için bu uyarı normaldir; imzalama
  Faz 4'te.)"* SHA-256 (`:119`) dosyayı yükleyen aynı iş tarafından hesaplanıp aynı Release notuna yazılıyor:
  dosyayı değiştiren, notu da değiştirir. Derleme kanıtı (provenance/attestation) üretilmiyor; `gh attestation
  verify` ile "bu exe gerçekten bu deponun bu commit'inden, bu iş akışıyla derlendi" denetimi yapılamıyor.
- Etki: Sahibi, programın her yeni sürümünde Windows'un tek koruma katmanını el alışkanlığıyla kapatıyor.
  Sabit link ya da GitHub hesabı ele geçirilirse (B-SUR-01) bunu fark etme olanağı yok. Faz 1 "güvenlik"
  altyapısı vaadi bu haliyle kullanıcıyı korumuyor.
- Önerilen düzeltme: (1) Hemen: `yayinla` işine `actions/attest-build-provenance@<sha>` ekle (`id-token: write`,
  `attestations: write`) ve Release notuna `gh attestation verify Lyraska-Kurulum.exe --repo
  gozlemesevdalisi/Lyraska` komutunu yaz; (2) Faz 4'ü beklemeden ücretsiz/ucuz seçenek: SignPath Foundation
  (açık kaynak projelere ücretsiz kod imzası) ya da Azure Trusted Signing; Tauri `bundle.windows.signCommand`
  ile entegre. (3) Release notundaki "Yine de çalıştır" talimatını, doğrulama adımı yazılmadan vermemek.
- Hatayı yakalayacak test: CI'de yayın sonrası `gh attestation verify` adımı (başarısızsa yayın geri alınır);
  Scorecard "Signed-Releases".

### [B-SUR-03] Arayüz test takımı yük altında kararsız: aynı kodla 4 çalıştırmada 4 farklı sonuç

- Önem: **Yüksek** / Güven: **kanıtlandı**
- Yer: `src/components/components.test.tsx:412-431` (çizim yükü), `:633` (kütüphane), `:1090` (ekolayzer),
  `:1470-1471` (kör test); `vite.config.ts:27-31` (`retry`/`testTimeout` yok); `.github/workflows/ci.yml:46-47`.
- Kanıt (aynı kaynak, aynı makine; yük: paralel Rust derlemesi):

  | Çalıştırma | Koşul | Sonuç | Kanıt |
  | --- | --- | --- | --- |
  | 1 | `npm test`, Rust derlemesi arka planda | **2 başarısız** (çizim yükü: `expected 16 to be greater than 20`; kör test: `Test timed out in 5000ms`) | `kanit/npm-kapilar.log:525-552` |
  | 2 | aynı iki test tek başına (`-t "çizim yükü\|kör test"`) | 2 geçti | `kanit/vitest-tekrar-1.log` |
  | 3 | `vitest --coverage`, yük altında | **4 başarısız** (çizim yükü, ekolayzer ×2, kör test) | `kanit/vitest-coverage.log:468-511` |
  | 4 | `vitest --coverage`, yük altında | **1 başarısız** (kütüphane: "çift tıklayınca çalar…") | `kanit/vitest-coverage-2.log:247` |

  Kök neden: testler gerçek duvar saatine bağlı. `components.test.tsx:426-429`:
  ```ts
  await new Promise((resolve) => setTimeout(resolve, 600));
  window.cancelAnimationFrame(raf);
  expect(frames).toBeGreaterThan(20);   // 0,6 s'de ≥ 21 jsdom "karesi" bekleniyor
  ```
  jsdom'un `requestAnimationFrame`'i 16 ms'lik `setTimeout`'tur; makine yavaşsa 20 kareye ulaşmaz. Diğer
  başarısızlıklar varsayılan 5 s zaman aşımı; dosyada 77 `setTimeout/waitFor/requestAnimationFrame` kullanımı
  var, yalnızca iki testte `vi.useFakeTimers`. Dosyanın tamamı yük altında 92 s sürüyor.
- Etki: CI (`ubuntu-latest`, 2 çekirdek, paylaşımlı) rastgele kırmızıya döner; "testler atlanmaz" kuralı olan
  bir projede ekip ya tekrar tekrar "yeniden çalıştır"a basar (gerçek hataları görmezden gelme alışkanlığı) ya da
  B-SUR-01'deki yayın zinciri gereksiz yere gecikir. Kalite göstergesi olarak CI'ye güven düşer.
- Önerilen düzeltme: "çizim yükü" testinde kare sayısı yerine **oran** ölçülmeli (zaten `libraryPanelRenders <
  frames/3` ölçülüyor; `frames > 20` koşulu kaldırılır ya da sahte zamanlayıcıyla `vi.advanceTimersByTime(600)`
  ile deterministik 37 kare üretilir); kör test/kütüphane/ekolayzer testlerinde `findBy*`/`waitFor` için
  `testTimeout: 15000` ve `vi.useFakeTimers`; CI'de `--reporter=verbose` ile süre izleme.
- Hatayı yakalayacak test: CI'de `vitest run --repeat=3` (ya da `--retry=0` kalır, ama `taskset -c 0` ile tek
  çekirdekte bir "yavaş makine" işi) — kararsız test orada düşer.

### [B-SUR-04] Güvenlik uyarıları yalnızca kod değişince taranıyor; zamanlanmış tarama ve bağımlılık güncelleme otomasyonu yok

- Önem: **Orta** / Güven: **kesin**
- Yer: `.github/workflows/ci.yml:9-13` (yalnızca `push`, `pull_request`, `workflow_dispatch`; `schedule` yok),
  `:117-140` (`guvenlik` işi); `.github/` altında `dependabot.yml` / `renovate.json` / `SECURITY.md` yok
  (`find .github -type f` → yalnızca 2 iş akışı + 2 issue şablonu).
- Kanıt: `on:` bloğunda `schedule:` yok. `cargo deny check advisories` ve `npm audit` yalnızca bir commit
  geldiğinde çalışır. Depo bir ay dokunulmadan dursa, o ay yayımlanan bir `symphonia`/`rusqlite`/`tauri` açığı
  (program **güvenilmeyen ses dosyası** açıyor; CI yorumu bunu kendisi söylüyor, `ci.yml:121-122`) sabit
  linkteki sürümde fark edilmeden kalır. Bugün: `npm audit --omit=dev` 0, `cargo deny advisories` temiz
  (`kanit/rust-kapilar.log`), yalnızca dev bağımlılığı `launch-editor` (GHSA-587h-7wmj-h5pm, yüksek) var; pakete
  girmiyor.
- Etki: "Güvenlik uyarıları kırmızıysa test sürümü yayımlanmaz" güvencesi yalnızca değişiklik anında geçerli;
  yayımlanmış sürüm için erken uyarı sistemi yok.
- Önerilen düzeltme: `ci.yml`'e `schedule: - cron: '17 6 * * 1'` (haftalık) ekleyip `guvenlik` işini bu olayda
  da çalıştırmak (diğer işler `if: github.event_name != 'schedule'`); `.github/dependabot.yml` ile `cargo`,
  `npm`, `github-actions` ekosistemleri için haftalık PR (SHA sabitlemeyi Dependabot kendisi günceller);
  `SECURITY.md` ile hata bildirim kanalı.
- Hatayı yakalayacak test: Scorecard "Maintained/Vulnerabilities/Dependency-Update-Tool" denetimleri.

### [B-SUR-05] WebView2 önyükleyicisi derleme sırasında doğrulamasız indirilip kurulum dosyasına gömülüyor

- Önem: **Orta** / Güven: **kesin** (tauri-bundler kaynağı) / CVSS 3.1: **7.6 teorik** —
  `AV:N/AC:H/PR:H/UI:R/S:C/C:H/I:H/A:H` (pratikte Microsoft'un dağıtım altyapısını ya da derleme makinesinin
  TLS yolunu kırmak gerekir; önem bu yüzden Orta)
- Yer: `src-tauri/tauri.conf.json:45` (`"webviewInstallMode": { "type": "embedBootstrapper" }`);
  `tauri-bundler 2.10.4/src/bundle/windows/util.rs:18,53-56` ve `utils/http_utils.rs:86-95` (indirilen kopya:
  `calisma/B-SUR/indirilen/bundler/`).
- Kanıt:
  ```rust
  pub const WEBVIEW2_BOOTSTRAPPER_URL: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
  pub fn download_webview2_bootstrapper(base_path: &Path) -> crate::Result<PathBuf> {
    let file_path = base_path.join("MicrosoftEdgeWebview2Setup.exe");
    if !file_path.exists() {
      std::fs::write(&file_path, download(WEBVIEW2_BOOTSTRAPPER_URL)?)?;   // ← download(), download_and_verify() değil
    }
  ```
  Aynı dosyada NSIS aracı `download_and_verify(NSIS_URL, NSIS_SHA1, …)` ile sağlanırken (`nsis/mod.rs:143`)
  WebView2 önyükleyicisi için **hiçbir sağlama** yok; indirilen exe NSIS betiğine gömülür ve kurulumda
  WebView2 yoksa çalıştırılır (`installer.nsi:618-626`). Ayrıca Microsoft bu linkin arkasındaki dosyayı
  düzenli güncellediği için aynı commit'ten iki derleme **farklı** kurulum dosyası üretir (bkz. bölüm 6).
- Etki: Derleme makinesine `go.microsoft.com` adına yanıt verebilen bir saldırgan (kurumsal vekil, DNS
  zehirlenmesi, CDN olayı) kurulum dosyasına imzasız çalıştırılabilir gömer; imzasız olduğumuz için (B-SUR-02)
  bunun ayırt edilme olasılığı yok. Tekrarlanabilirlik: aynı commit'in SHA-256'sı zamana bağlı.
- Önerilen düzeltme: `"webviewInstallMode": { "type": "downloadBootstrapper" }` (önyükleyici gömülmez; kurulumda
  kullanıcı makinesinde Microsoft'tan indirilir — Windows 10/11'de WebView2 zaten vardır) **ya da** önyükleyiciyi
  depoya sabit sürümle koyup `"type": "fixedRuntime"` / `"offlineInstaller"` ile sağlamasını
  `docs/LISANSLAR.md`'ye yazmak. Tauri'ye yukarı akış hata kaydı: önyükleyici için sağlama ya da Authenticode
  imza denetimi.
- Hatayı yakalayacak test: CI'de derlenen NSIS dosyasının `7z l` listesinden `MicrosoftEdgeWebview2Setup.exe`'nin
  çıkarılıp `signtool verify /pa` ile Microsoft imzasının denetlenmesi (sonraki adım: bilinen SHA-256'ya
  sabitleme).

### [B-SUR-06] Programdaki "derleme kodu" ile Release notundaki commit farklı olabilir

- Önem: **Orta** / Güven: **kesin** (GitHub belgesi + kod akışı)
- Yer: `src-tauri/build.rs:5-9`; `.github/workflows/test-surumu.yml:48-52`, `:110-114`.
- Kanıt: `build.rs` commit'i **`GITHUB_SHA`** ortam değişkeninden alır:
  ```rust
  let commit = std::env::var("GITHUB_SHA").ok().filter(|s| s.len() >= 7).map(|s| s[..7].to_owned())
  ```
  GitHub belgesine göre `workflow_run` olayında `GITHUB_SHA` = **"Last commit on default branch"**
  (`kanit/gh-docs-events.md:1143-1145`), derlenen kod ise `workflow_run.head_sha` (`test-surumu.yml:48-52`).
  İki commit, CI'nin bitişiyle yayın işinin başlaması arasında `main`'e yeni bir push gelirse farklıdır — bu
  proje küçük, sık commit'lerle çalışır ("her iş birimi bitince commit + push") ve yayınlar kuyruğa girer
  (`cancel-in-progress: false`), yani pencere dakikalar sürer. Sonuç: Ayarlar → Program "Sürüm 0.0.56 · bbbbbbb"
  yazarken Release notu ve etiket "aaaaaaa" der; hata günlüğündeki yığın izi için saklanan semboller
  (`semboller-<sürüm>-<head_sha>`) başka adla aranır.
- Etki: Çökme günlüğü ↔ sembol ↔ kaynak eşlemesi (YAY-03/YAY-11 niyetleri) tam bu durumda bozulur; hata
  kaydındaki derleme kodu yanlış commit'i işaret eder.
- Önerilen düzeltme: `derle` işinde `env: GITHUB_SHA: ${{ steps.kaynak.outputs.sha }}` vermek yerine
  `build.rs`'nin okuduğu adı `LYRASKA_COMMIT_SHA` gibi özel bir değişkene çevirip iş akışında
  `LYRASKA_COMMIT_SHA: ${{ steps.kaynak.outputs.sha }}` geçmek (CI'deki `pull_request` çalıştırmalarında da
  `GITHUB_SHA` birleştirme commit'idir, `head.sha` değil — aynı düzeltme oradaki PR artefaktını da düzeltir).
- Hatayı yakalayacak test: `yayinla` işinde `notlar.md`'deki `short_sha` ile exe'nin içindeki (`strings` / Tauri
  `AppInfo`) commit'in eşitliğini denetleyen bir adım; eşit değilse yayın durdurulur.

### [B-SUR-07] Windows'a özel ses çıkışı (WASAPI, 495 satır) hiçbir otomatik testle sınanmıyor

- Önem: **Orta** / Güven: **kesin**
- Yer: `src-tauri/src/audio/output/wasapi.rs` (0 `#[test]`); `src-tauri/examples/ses_denemesi.rs:36-50`;
  `.github/workflows/ci.yml:175` (`windows` işi yalnızca PR/dispatch'te), `:203-207`.
- Kanıt: Test envanteri (bölüm 1): `wasapi.rs` 0 test, `output.rs` 5 test (tamsayı dönüşümü, sessizlik
  izleme — platformdan bağımsız kısımlar). Gerçek aygıt denemesi barındırılan Windows'ta ses aygıtı olmadığı
  için `ATLANDI` yazıp `ExitCode::SUCCESS` döner (`ses_denemesi.rs:36-50`); yani CI'nin "Gerçek ses aygıtıyla
  deneme" adımı **her zaman yeşildir**. `windows` işi `push`'ta çalışmaz: `main`'de Windows derlemesi/testi
  yoktur; yayın işi derler ama test koşmaz (`test-surumu.yml` içinde `cargo test` yok). `wasapi.rs`'deki
  sınanmamış mantık: özel mod arabellek hizalama (`open_exclusive`, 128 bayt katı), `draining` kuyruğunda
  `padding <= silence_written` bitiş koşulu, `EVENT_TIMEOUT_MS` ile aygıt kopması, `watch_default_device`
  yarışı (`stop`/`ended` bayrakları), `exclusive_reason` HRESULT eşlemesi.
- Etki: Faz 1'in temel vaadi "WASAPI çıkışı, takılma sayacı, bit-perfect mod" için tek kanıt proje sahibinin elle
  denemesi (`docs/DOGRULAMA.md`). Sanal çıkışla 38 oynatıcı testi var, ama Windows'ta kopan şey (örneğin
  `get_current_padding` dönüşünde `u64` taşması, özel modda `period*periods` hesabı) hiçbir yerde yakalanmaz.
- Önerilen düzeltme: (1) `wasapi.rs`'in saf parçalarını (`exclusive_reason`, `khz`, periyot/arabellek
  hesabı, bitiş koşulu) `#[cfg(any(windows, test))]` ile ayırıp Linux'ta da koşan birim testleri yazmak;
  (2) CI'de Windows işine `VB-CABLE`/`Virtual Audio Cable` yerine ücretsiz "Scream" sanal ses sürücüsünü
  kurup (`choco`/`msiexec`) `ses_denemesi`'nin gerçekten çalmasını sağlamak; (3) `windows` işini `push:
  main`'de de çalıştırmak (en azından `cargo test`).
- Hatayı yakalayacak test: `ses_denemesi`'nin CI'da `ATLANDI` dönmesi **hata** sayılmalı (`GITHUB_ACTIONS`
  altında aygıt yoksa `ExitCode::FAILURE`), böylece sanal sürücü eksikliği görünür olur.

### [B-SUR-08] Rust mutasyon testi: `gapless.rs`'de hayatta kalan mutantlar

<<MUTANT>>

### [B-SUR-09] npm lisans denetimi yasak listesi (deny-list) ile çalışıyor; GPL ile uyumsuz ama listede olmayan lisanslar geçer

- Önem: **Düşük** / Güven: **kesin**
- Yer: `scripts/check-licenses.mjs:11-23`, `:55-57`.
- Kanıt:
  ```js
  const FORBIDDEN = [/AGPL/i, /SSPL/i, /BUSL/i, /Business Source/i, /Commons Clause/i, /Elastic-2\.0/i,
    /CC-BY-NC/i, /NonCommercial/i, /PolyForm-Noncommercial/i, /Prosperity/i, /^UNLICENSED$/i];
  ...
  if (options.every((option) => FORBIDDEN.some((re) => re.test(option)))) problems.push(...)
  ```
  Yani `license: "CC-BY-SA-4.0"`, `"EUPL-1.2"`, `"LicenseRef-Proprietary"`, `"Custom"`, `"Sleepycat"`, `"OSL-3.0"`,
  `"CPAL-1.0"`, `"RPL-1.5"` (hepsi GPL-3.0 ile uyumsuz ya da ticari kısıtlı) sessizce geçer. Rust tarafı
  (`deny.toml`) doğru yaklaşımı, **izin listesini** kullanıyor; npm tarafı tutarsız. Bugün pakete giren 6 npm
  paketinin lisansları (MIT, Apache-2.0 OR MIT, OFL-1.1) sorunsuz; bulgu gelecekteki eklemeleri ilgilendirir.
- Etki: CLAUDE.md "listede olmayan bir lisans gerekirse önce proje sahibine sorulur" kuralı npm için
  uygulanamıyor; GPL ile uyumsuz bir paket fark edilmeden kuruluma girebilir.
- Önerilen düzeltme: `FORBIDDEN` yerine `deny.toml` ile aynı `ALLOWED` listesi (SPDX ifadesi `OR`/`AND` ayrıştırılarak;
  `AND` için her parça izinli olmalı); izin dışı her lisans hata. Dev bağımlılıkları için ayrı, daha gevşek liste.
- Hatayı yakalayacak test: `scripts/check-licenses.test.mjs` — `license: "CC-BY-SA-4.0"` olan sahte paket için
  çıkış kodu 1.

### [B-SUR-10] `check:audio` depo boşken (ya da `git ls-files` çalışmayınca) sessizce geçer

- Önem: **Düşük** / Güven: **kanıtlandı**
- Yer: `scripts/check-no-audio.mjs:9-12,19`.
- Kanıt: Kendi kopyamda (git geçmişi olmayan, dolayısıyla `git ls-files` boş dönen) `npm run check:audio` →
  `Ses dosyası denetimi tamam: 0 dosya incelendi.` ve çıkış kodu 0 (`kanit/npm-kapilar.log`). Betik hiç
  dosya listelenmemesini hata saymıyor; `git` olmayan ya da izlenmeyen dosyaları (`git add` öncesi) da görmüyor.
- Etki: CI'da `actions/checkout` tam klon yaptığı için bugün çalışır; ama `fetch-depth`/sparse ayarı
  değişirse ya da betik başka bağlamda (yerel ön-commit kancası, derleme makinesi) çalıştırılırsa yanlış güven verir.
- Önerilen düzeltme: `if (files.length === 0) { console.error("git ls-files boş: denetim yapılamadı"); process.exit(1); }`;
  ek olarak `git ls-files --others --exclude-standard` ile izlenmeyen dosyaları da taramak.
- Hatayı yakalayacak test: boş bir git deposunda betik çıkış kodu ≠ 0.

### [B-SUR-11] `rust-version = "1.85"` iddiası hiç denetlenmiyor

- Önem: **Düşük** / Güven: **olası**
- Yer: `src-tauri/Cargo.toml:9`; `.github/workflows/ci.yml:24` (`RUST_TOOLCHAIN: 1.97.0`).
- Kanıt: CI yalnızca 1.97.0 ile derler; `cargo deny` MSRV denetimi yapmaz; `rust-toolchain.toml` yok. 1.85 ile
  1.97 arasında 12 kararlı sürüm var; bu projede `is_none_or`, `let` zincirleri gibi yeni kararlılaşan
  özelliklerin kullanılıp kullanılmadığını derlemeden bilmek olanaksız. (Bu oturumda 1.85 araç zinciri
  kurulmadı; o yüzden "olası".)
- Etki: `Cargo.toml`'daki alan bir vaat; yanlışsa paketleyen ya da katkıcı için yanıltıcı. Program 1.97'yle
  derlendiği için kullanıcıya etkisi yok.
- Önerilen düzeltme: ya `rust-version`'ı CI'nin kullandığı sürümle eşitlemek ya da CI'ye `cargo +1.85 check
  --locked` işi eklemek.
- Hatayı yakalayacak test: CI'de MSRV işi.

### [B-SUR-12] `workflow_dispatch` ile her daldan, CI beklemeden yayın yapılabilir

- Önem: **Düşük** (yazma yetkisi gerektirir) / Güven: **kesin** / CVSS 3.1: `AV:N/AC:L/PR:H/UI:R/S:C/C:H/I:H/A:H`
  (8.3; ancak yazma yetkisi zaten güvenilen kişilere verildiği için pratik önem Düşük)
- Yer: `.github/workflows/test-surumu.yml:17`, `:35`, `:48`.
- Kanıt: `if: github.event_name == 'workflow_dispatch' || …` — elle başlatmada CI sonucu aranmaz;
  `HEAD_SHA: … || github.sha` seçilen dalın commit'i olur. Yazma yetkili bir hesap (ya da ele geçirilmiş
  PAT/oturum) `claude/deneme` dalını sabit linke yayımlayabilir; iş akışı dosyası `main`'den okunsa da derlenen
  kod seçilen daldır.
- Etki: "sınanmamış bir main sabit linke düşmez" güvencesi (`test-surumu.yml:6`) elle başlatmada geçersiz.
- Önerilen düzeltme: `if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'` koşulu;
  `main` için dal koruması + "Require status checks" ile CI'siz commit'in `main`'e gelemeyeceğini güvenceye almak.
- Hatayı yakalayacak test: iş akışı statik denetimi (zizmor) + dal koruma ayarı.

### [B-SUR-13] Eylem sabitleme: `Swatinem/rust-cache` yorumu "v2" ama sabitlenen SHA v2.9.2

- Önem: **Düşük** / Güven: **kanıtlandı**
- Yer: `.github/workflows/ci.yml:84,188`, `test-surumu.yml:62`.
- Kanıt (`kanit/eylem-sha-dogrulama.txt`, `git ls-remote --tags`):

  | Eylem | Sabitlenen SHA | Gerçek etiket |
  | --- | --- | --- |
  | actions/checkout | `fbc6f399…` | `v5` ✓ |
  | actions/setup-node | `a0853c24…` | `v5` ✓ |
  | dtolnay/rust-toolchain | `683b588c…` | `master` başı ✓ (SHA sabit; "master" yorumu bilgi) |
  | Swatinem/rust-cache | `6323deb1…` | **`v2.9.2`** (`v2` → `d1527c8f…` = v2.9.3) |
  | EmbarkStudios/cargo-deny-action | `3c634983…` | `v2` ✓ |
  | actions/upload-artifact | `ea165f8d…` | `v4` ✓ |
  | actions/download-artifact | `d3f86a10…` | `v4` ✓ |

  Sabitleme kendisi doğru (SHA, etiket değil); yalnızca yorum bir sürüm geride. Dependabot olmadığı için
  (B-SUR-04) sürümler elle takip ediliyor.
- Etki: Yok (güvenlik açısından olumlu). Bakım: yorum yanıltıcı.
- Önerilen düzeltme: yorumu `# v2.9.2` yapmak; Dependabot `github-actions` ekosistemi ile otomatik güncelleme.
- Hatayı yakalayacak test: `pinact`/`zizmor` "unpinned/stale pin" denetimi.

### [B-SUR-14] `npm ci` paket kurulum betiklerini kısıtlamadan çalıştırıyor

- Önem: **Düşük** / Güven: **kesin**
- Yer: `.github/workflows/ci.yml:36,67,153,191`; `test-surumu.yml:65`; `.npmrc` yok.
- Kanıt: Hiçbir `npm ci` çağrısında `--ignore-scripts` yok, `.npmrc` yok. Bugün `node_modules` altındaki 242 paketin
  hiçbirinde `preinstall/install/postinstall/prepare` betiği yok (taradım; `@tauri-apps/cli` yerel ikiliyi
  `optionalDependencies` ile getirir, betikle değil). Yani şu an sömürülebilir değil; ama bağımlılık güncellemesiyle
  gelen bir kurulum betiği, **yayın derlemesinde** (`test-surumu.yml:65`) kodu çalıştırır.
- Etki: npm tedarik zinciri saldırılarının (ör. 2025 `chalk`/`debug` olayları) birincil vektörü kurulum
  betikleridir; yayın işinde çalışması kurulum dosyasını etkiler.
- Önerilen düzeltme: depoya `.npmrc` → `ignore-scripts=true` (doğruladım: kendi kopyamda `npm ci --ignore-scripts` → `npm run build` → `npx tauri --version` üçü de
  başarılı, `kanit/npm-ci-ignore-scripts.log`; hiçbir paket kurulum betiğine dayanmıyor).
- Hatayı yakalayacak test: CI'de `npm ci --ignore-scripts` sonrası `npm run build`.

### [B-SUR-15] Üç crate için MIT/Apache telif bildirimi eksik (lisans metni paketlerde yok)

- Önem: **Düşük** / Güven: **kesin**
- Yer: `public/lisanslar/UCUNCU-TARAF.txt` (`realfft 3.5.0`, `webview2-com 0.39.1`, `webview2-com-sys 0.39.1`
  kayıtları: "pakette lisans dosyası yok; lisans ifadesi yukarıda, metin için kaynak deposuna bakın");
  `docs/LISANSLAR.md` "Sınır" maddesi.
- Kanıt: MIT lisansı ikili dağıtımda "the above copyright notice and this permission notice shall be included"
  der; bu üç crate için ne telif satırı ne metin var (`grep -c 'lisans dosyası yok; lisans ifadesi' → 3`).
  Proje bunu belgelemiş (`LISANSLAR.md`), ama yükümlülük yine de karşılanmamış.
- Etki: Biçimsel lisans uyumsuzluğu (düşük risk; sahipler MIT'i seçmiş).
- Önerilen düzeltme: `third-party-notices.mjs`'e elle bakılan bir "ek bildirimler" haritası: crate → (telif
  sahibi, metin) — `realfft`: "Copyright (c) 2020 Henrik Enquist" (deposundaki LICENSE), `webview2-com(-sys)`:
  "Copyright (c) 2021 Microsoft Corporation / wravery" — bu satırlar dosyaya üretim sırasında eklenir.
- Hatayı yakalayacak test: üretim betiğinde "lisans dosyası yok ve ek bildirim de yok" → hata.

### [B-SUR-16] Arayüz mutasyon testi: `titleScale` sınır değerleri test edilmiyor

- Önem: **Düşük** / Güven: **kanıtlandı**
- Yer: `src/lib/format.ts:81-86`; `src/lib/format.test.ts:171-175`.
- Kanıt: 13 elle mutasyondan 12'si yakalandı (bölüm 4), biri hayatta kaldı:
  `if (length <= 14) return "xl";` → `<= 15` ile bütün testler geçti (`ts-mutasyon/sonuc.txt`). Test yalnızca
  7, 22 ve 47 karakterlik adlarla çalışıyor; 14/15 ve 28/29 sınırları yok.
- Etki: Büyük başlığın boyu bir karakter sınırında yanlış seçilirse (iki satıra taşma) test fark etmez. Küçük.
- Önerilen düzeltme: `expect(titleScale("a".repeat(14))).toBe("xl"); expect(titleScale("a".repeat(15))).toBe("l");
  … (28/29)`.
- Hatayı yakalayacak test: yukarıdaki.

## 4. Doğrulanan güvenceler

Kalite kapıları (kendi kopyamda, `kanit/npm-kapilar.log`, `kanit/rust-kapilar.log`):

| Kapı | Sonuç | Not |
| --- | --- | --- |
| `npm run build` | ✅ 14 s | 110 modül |
| `npm run lint` | ✅ | ESLint 10 + typescript-eslint, react-hooks |
| `npm run typecheck` | ✅ | `strict`, `noUncheckedIndexedAccess` |
| `npm run format:check` | ✅ | |
| `npm test` | ⚠️ 315/317 (yük altında 2 kararsız; tek başına geçer) | B-SUR-03 |
| `npm run check:commands` | ✅ | 54 komut ↔ 54 çağrı |
| `npm run check:licenses` | ✅ | 242 paket |
| `npm run check:audio` | ✅ (0 dosya; bkz. B-SUR-10) | |
| `npm run check:notices` | ✅ | üretilen dosya depodakiyle bayt bayt aynı |
| `npm audit --omit=dev` | ✅ 0 açık | tüm bağımlılıklar: 1 yüksek (`launch-editor`, yalnızca dev) |
| `cargo fmt --check` | ✅ | |
| `cargo deny check licenses bans sources` | ✅ "bans ok, licenses ok, sources ok" | |
| `cargo deny check advisories` | ✅ "advisories ok" | |
| `cargo clippy --all-targets --locked -- -D warnings` | ✅ (745 s) | |
| `cargo test --locked` | ✅ 424 + 0 + 4 geçti, 3 `#[ignore]` | 233 s |
| `src/lib/bindings` yeniden üretim | ✅ `diff -r` fark yok | |

Yayın hattı ve tedarik zinciri (geçenler):

- Yedi üçüncü taraf eylemin hepsi commit SHA'sıyla sabitlenmiş; SHA'lar `git ls-remote` ile doğrulandı (6/7 yorumla
  birebir; B-SUR-13).
- `Cargo.lock`: 478 paketin tamamı `registry+https://github.com/rust-lang/crates.io-index`, hepsinde `checksum`;
  git/yol bağımlılığı yok. `deny.toml`: `unknown-registry = "deny"`, `unknown-git = "deny"`, `wildcards = "deny"`.
- `package-lock.json` (lockfileVersion 3): 274 paketin tamamında `integrity` ve `registry.npmjs.org` `resolved`.
- CI: `permissions: contents: read` (üst düzey), yayın: `permissions: {}` + iş düzeyinde en az yetki;
  `persist-credentials: false`; yayın işinde kod indirilmiyor ve çalıştırılmıyor; etiket `--verify-tag` ile
  Release'e bağlanıyor; yeni dosya önce geçici adla yüklenip sonra yeniden adlandırılıyor (link boş kalmıyor).
- Tüm `cargo` çağrıları `--locked`; `tauri build -- --locked`.
- Önbellek zehirlenmesi: `Swatinem/rust-cache` PR çalıştırmalarında PR kapsamına yazar; `main`/`workflow_run`
  bağlamı yalnızca varsayılan dal önbelleğini okur. Çatal PR'ından `main` önbelleğine yazılamaz. ✓
- Betik enjeksiyonu: iş akışlarında `${{ }}` ifadeleri doğrudan `run:` içine gömülmemiş; `HEAD_SHA`, `VERSION`,
  `SHA` `env:` üzerinden geçiyor. ✓
- `tauri.conf.json`: CSP `default-src 'self'` (script-src miras alır), `connect-src ipc: http://ipc.localhost`;
  yetenekler yalnızca `core:default`, `dialog:allow-open`, `dialog:allow-save`; NSIS `installMode: currentUser`
  (yönetici izni istenmez). ✓
- `.gitignore` 24 ses uzantısını engelliyor; `check:audio` CI'da çalışıyor; `tests/data/` yalnızca ffmpeg ile
  üretilmiş sentetik ses ve üretim komutları `README.md`'de. ✓
- Sürüm eşitliği: `package.json` = `Cargo.toml` = `Cargo.lock` = 0.0.56; `tauri.conf.json` sürümü
  `../package.json`'dan okur; **test var**: `commands.rs:866-880` `surum_package_json_ile_ayni` (`include_str!`
  ile derleme anında karşılaştırır). ✓
- Vite derlemesi tekrarlanabilir: `dist/` iki kez üretildi, 13 dosyanın SHA-256'sı aynı (`kanit/dist-1.sha`,
  `dist-2.sha`). ✓

Lisans uyumu (geçenler):

- `LICENSE` = GPL-3.0 kanonik metni (35 149 bayt, sha256 `3972dc97…`); `package.json`, `Cargo.toml`,
  `tauri.conf.json` (`license`, `licenseFile`, telif satırı) tutarlı: `GPL-3.0-only`. NSIS kurulumu lisans
  sayfasını `../LICENSE`'tan gösterir.
- Pakete giren 179 Rust crate'inin lisans dağılımı: MIT/Apache-2.0 ikilisi 106, MIT 22, **MPL-2.0 17**,
  Unicode-3.0 15, BSD-3-Clause 3, Zlib/0BSD/CC0/Unlicense seçenekli 10, Apache-2.0 AND MIT 1, BSD-3-Clause AND
  MIT 1. Hepsi GPL-3.0 uyumlu (Apache-2.0 GPLv3 ile uyumludur; GPLv2 sorunu burada yok çünkü proje
  `GPL-3.0-only`).
- MPL-2.0 ikincil lisans uyumu: 17 MPL crate'inin (symphonia ailesi + `option-ext`) Cargo.toml `license` alanı
  `MPL-2.0` (`-no-copyleft-exception` değil) ve **hiçbir kaynak dosyasında "Incompatible With Secondary
  Licenses" (Exhibit B) bildirimi yok** (`grep -rl` 17/17 → 0). Dolayısıyla MPL §3.3 ile GPL-3.0 altında
  dağıtım serbest. ✓ (`UCUNCU-TARAF.txt` MPL §3.2'nin istediği kaynak erişimi için depo linklerini veriyor.)
- Unicode-3.0 (ICU verileri, 15 crate) FSF'ye göre GPL uyumlu; `deny.toml` izin listesinde. ✓
- `deny.toml` izin listesinde GPL ile **uyumsuz** hiçbir lisans yok (AGPL, SSPL, BUSL, CC-BY-NC, EUPL, OSL yok;
  LGPL/MPL/Apache/MIT/BSD/ISC/Zlib/0BSD/CC0/Unlicense/BSL-1.0/Unicode/CDLA-Permissive-2.0/OFL-1.1 var). ✓
- Yazı tipi: `@fontsource-variable/inter` 5.3.0 OFL-1.1; `public/lisanslar/Inter-OFL-1.1.txt` paketin
  `LICENSE` dosyasıyla **birebir aynı** (`diff` temiz); OFL "Reserved Font Name" koşulu için yazı tipi
  değiştirilmeden kullanılıyor. ✓ Depoda başka dış görsel/shader/veri seti yok (`public/` yalnızca lisanslar;
  ikonlar projenin kendi çizimi).
- GPL kaynak sunma: Release notu commit linkini, uygulama Ayarlar → Lisanslar depo adresini
  (`SettingsPanel.tsx:210`) ve `UCUNCU-TARAF.txt` başlığı kaynak adresini veriyor; derlenen commit'ler `main`
  geçmişinde kaldığı için ulaşılabilir (GPLv3 §6(d) "ağ sunucusu" yolu). ✓ (B-SUR-06'daki commit karışıklığı
  dışında.)
- `UCUNCU-TARAF.txt` üretimi belirlenimci ve CI'da denetleniyor; Windows hedefinin crate'leri `cargo tree
  --target x86_64-pc-windows-msvc` ile seçiliyor (Linux'tan üretilse de Windows paketi doğru). ✓ Dosya
  `dist/lisanslar/` altında pakete giriyor (derlemede doğrulandı) ve Ayarlar'da `<iframe>` ile açılıyor.

Test kalitesi (geçenler):

- Arayüz mutasyon: 13 elle mutasyonun 12'si yakalandı (`queue.ts` 6/6: sıra ilerleme/geri/çalan şarkı denetimi,
  `RESTART_THRESHOLD`; `format.ts` 6/7). Çalma sırası mantığı için test takımı **gerçekten hata yakalıyor**.
- Rust test takımı 424 birim testi, 17 s'de koşuyor; `#[ignore]` olan 3 test ölçüm/keşif amaçlı (ayar taraması,
  doğruluk tablosu, ffmpeg gerektiren parmak izi ölçümü) — gizlenmiş başarısız test yok.
- `tests/formats.rs::bosluksuz_calma_icin_dolgu_atilir` dört kodekte (MP3, AAC, Vorbis, FLAC) tam 66 150 örnek
  ve kaynak sinüsle ≥ 0,98 ilinti ister: toleranssız, gerçek davranış ölçen test. ✓
- `render.rs::ses_yolu_bellek_ayirmaz` (`allocation-counter` ile) ekolayzer + kulaklık + parametrik +
  crossfeed + duraklatma geçişi altında ses yolunda sıfır ayırma ölçüyor. ✓
- Test yardımcısı `temp_path` süreç kimliği + atomik sayaçla benzersiz yol üretiyor; paralel testlerde çakışma yok. ✓
- Arayüz kapsamı (v8; `kopya/coverage/coverage-summary.json`): toplam satır **%85,2**, dal **%80,9**;
  `src/hooks` %94,4, `src/components` %91,3, `src/lib` %73,3. Düşük olanlar WebGL çizicileri (`skyRenderer.ts`
  %22, `highwayRenderer.ts` %16, `gl.ts` %60) ve `backend.ts` (%13, Tauri köprüsü) — jsdom'da WebGL yok;
  bunlar CI'da gerçek Edge ile `check:scenes` (WebGL ve 2D yedek) tarafından kapsanıyor. `skyFallback.ts` %15:
  2D yedek yalnızca `check:scenes` ile sınanıyor (birim testi 2).

Rust kapsamı (`cargo llvm-cov`): araç kuruldu (`cargo-llvm-cov`, `llvm-tools-preview`) ve ölçüm başlatıldı, ancak
enstrümanlı tam derleme (`target/llvm-cov-target`, ≥ 6 GB) paylaşılan makinede kalan 4,9 GB diske sığmadı ve
oturum arasında durduruldu; sayısal Rust kapsamı **ölçülemedi** (bölüm 6). Test envanterinden türetilen nitel
tablo: ses yolu (`render`, `eq`, `bass`, `peq`, `limiter`, `normalize`, `resample`, `decode`, `player`) ve analiz
modülleri yoğun test edilmiş (modül başına 8–38 test); `output/wasapi.rs` (495 satır) ve `lib.rs` (Tauri kurulumu,
189 satır) sıfır test; `main.rs`/`simulated.rs` yardımcı. Hata yolları için gözlenen boşluklar: `wasapi.rs`'de
aygıt kopması ve özel mod hataları (B-SUR-07); `diagnostics.rs` 2 test (günlük dosyası yazılamazsa ne olur,
test edilmemiş).

## 5. Şüpheler (kanıtlanamayanlar, güven "olası")

- **MSVC derlemesinin tekrarlanabilirliği.** Linux'ta Windows (MSVC) hedefi derlenemediği için kurulum dosyasının
  iki derlemede aynı çıkıp çıkmadığı ölçülemedi. Bilinenler: Rust tarafı `--locked`, sabit araç zinciri (1.97.0),
  `codegen-units = 1`, `lto = true`, sabit yol (`D:\a\Lyraska\Lyraska`) ile belirlenimci olmaya yakın; ancak
  (a) WebView2 önyükleyicisi her derlemede Microsoft'tan indiriliyor ve sürümü değişiyor (B-SUR-05), (b) NSIS
  çıktısı ve PE başlığı zaman damgası taşıyabilir, (c) `build.rs` `GITHUB_SHA`'yı gömüyor (aynı commit için
  aynı; B-SUR-06'daki durumda farklı). Sonuç: **aynı commit'ten iki derleme bugün büyük olasılıkla bayt bayt
  aynı değildir**; Release notundaki SHA-256 bu yüzden "bu derleme" için anlamlı, "bu commit" için değil.
- `rust-version = "1.85"` ile derlenebilirlik (B-SUR-11).
- GitHub tarafındaki depo ayarları (dal koruması, "Require approval for all outside collaborators", Actions
  izinleri) bu denetimde görülemedi (BRIEF gereği GitHub arayüzüne bakılmadı). "Require approval for **all**
  outside collaborators" açıksa B-SUR-01'in ilk adımı her seferinde sahibinin onayına bağlı kalır — risk azalır,
  kalkmaz (onay "PR'ı birleştir" değildir ve CLAUDE.md'ye göre sahibi yazılımcı değildir).
- `check-scenes.mjs` (513 satır) yalnızca okundu; Windows Edge gerektirdiği için çalıştırılamadı.

## 6. Denetlenemeyenler ve sınırlar

- GitHub Actions iş akışları gerçek ortamda çalıştırılamaz; B-SUR-01/06/12 kod akışı ve GitHub'ın resmî
  belgeleriyle (`github/docs` ham dosyaları, `kanit/gh-docs-*.md`) kanıtlandı, canlı sömürü denenmedi.
- Windows'a özel kod (`wasapi.rs`), NSIS paketleme ve SmartScreen davranışı Linux'ta sınanamadı.
- `cargo mutants` yalnızca `gapless.rs` için tam koşturuldu (143 mutant); `limiter.rs` (142), `scan.rs` (74),
  `db.rs` (47) mutant listesi çıkarıldı ama makine 4 çekirdekli ve paylaşımlı olduğu için (yük ortalaması 10–12)
  süre yetmedi. Her mutant için derleme + test ~1–2 dk sürüyor.
- Rust kapsamı (`cargo llvm-cov`) Linux'ta ölçüldü; Windows'a özel satırlar (`#[cfg(windows)]`) doğal olarak
  0 görünür ve tabloya alınmadı.
- `@tauri-apps/cli` (npm) önceden derlenmiş ikili olarak gelir; içindeki `tauri-bundler` sürümü doğrudan
  görülemedi; crates.io'daki en güncel 2.x (2.10.4) kaynağı incelendi. B-SUR-05'teki `download()` davranışı
  2.x serisinde değişmemiştir (`download_webview2_bootstrapper` 2.0'dan beri aynı).

## 7. Önerilen öncelik sırası

1. **B-SUR-01** — `test-surumu.yml` `derle.if` koşuluna `workflow_run.event == 'push'` +
   `head_repository.full_name == github.repository` + `head_branch == 'main'` ekle (3 satır; bugün).
2. **B-SUR-02** — `actions/attest-build-provenance` ekle, Release notuna `gh attestation verify` yaz; kod imzası
   (SignPath/Azure Trusted Signing) için başvur; "Yine de çalıştır" talimatını doğrulama adımıyla değiştir.
3. **B-SUR-03** — Kararsız arayüz testlerini sahte zamanlayıcıya ve oran ölçümüne çevir; `testTimeout` artır.
4. **B-SUR-05** — `webviewInstallMode` → `downloadBootstrapper` ya da sabitlenmiş çevrimdışı kurucu.
5. **B-SUR-04 / B-SUR-13 / B-SUR-14** — Haftalık `schedule` güvenlik taraması, Dependabot (cargo/npm/actions),
   `.npmrc` `ignore-scripts=true`, `SECURITY.md`.
6. **B-SUR-06 / B-SUR-12** — `LYRASKA_COMMIT_SHA` ile derlenen commit'i doğru göm; `workflow_dispatch`'i
   `main`'e kısıtla; dal koruması.
7. **B-SUR-07 / B-SUR-08** — WASAPI'nin saf parçalarına birim testi, CI'da sanal ses sürücüsü, `ATLANDI` → hata;
   gapless'ta hayatta kalan mutantlar için testler.
8. **B-SUR-09 / B-SUR-10 / B-SUR-11 / B-SUR-15 / B-SUR-16** — betik ve test iyileştirmeleri (her biri < 1 saat).
