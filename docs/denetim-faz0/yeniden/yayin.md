# YAYIN (CI, test sürümü yayın hattı, tedarik zinciri): bağımsız denetim raporu (Faz 0)

Denetlenen commit: `9ae1b6d` (PR #100 dalı `ccr-e33a525d-dywq26`, sürüm 0.0.61). Karşılaştırma için
GitHub'daki canlı `main` (`6c95431`, 0.0.60) ve deponun herkese açık API verileri (22 Ekim 2026, ~22:40 UTC).

## 1. Özet

- **Puan (a) depodaki kod ve yapılandırma (dal `9ae1b6d`): 7/10.** Yayın hattı örnek gösterilecek
  kadar özenli kurulmuş: eylemler SHA ile sabit, izinler en dar, `workflow_run` doğru korunuyor, yayın derlemesi
  önbelleksiz, derleme kanıtı var, "hâlâ main'in ucu mu" denetimi var. Kapıların çoğu mutasyonla sınandı ve
  gerçekten kırmızı oluyor. Ama güvenlikle ilgili kuralları denetleyen `check:rules` CI'ya hiç bağlanmamış.
- **Puan (b) GitHub ayarları, canlı durum ve satın alınacaklar dahil: 4/10.** Sertleştirme henüz `main`'de
  değil. Canlı `test-surumu.yml`, fork'taki `main` adlı daldan açılan bir PR'ın kodunu derleyip sabit linke
  koyabilir (YAY-01). `main` korumasız (dal koruması ve ruleset yok), gizli güvenlik bildirimi kapalı,
  kurulum dosyası imzasız.
- Kritik: **YAY-01**. Sertleştirilmiş yayın hattı `main`'de değil. Canlı iş akışı yalnızca dal adına bakıyor;
  PR #100 çakışmalı (`dirty`) olduğu için yeni CI GitHub'da bir kez bile yeşil olmadı.
- Yüksek: **YAY-02**. `check:rules` (CSP, Tauri izinleri, "uzak adres yok", `unsafe` istisnası, atlanan test)
  CI'da çalışmıyor; README "CI'ın çalıştırdıklarıyla aynı" diyor. **YAY-03**. `main` korumasız. Yapay zekâ
  oturumları sahibin kimliğiyle PR açıp birleştiriyor, zorunlu denetim de yok.
- Orta: **YAY-04** gizli güvenlik bildirimi kapalı (SECURITY.md çıkmaz sokağa yolluyor). **YAY-05** imzasız
  kurulum dosyası; kullanıcıya SmartScreen'i geçmesi öğretiliyor. **YAY-06** sabit link sessizce eskiyor
  (sahne işi 30 dk sınırının dibinde). **YAY-07** eski hesap adına giden linkler (canlı programda ve canlı
  CLAUDE.md'de) adın başkasına geçme riskini taşıyor.
- Temiz bulunanlar: SHA sabitlemeleri (hepsi gerçek etiket commit'i), en dar izinler, `persist-credentials:
false`, kilit dosyaları (`--locked`, npm `integrity`), ağ istemcisi crate'i yok, ses, lisans, bildirim ve
  zizmor kapıları mutasyonla kırmızı oluyor, sürüm eşitliği Rust testiyle denetleniyor.

## 2. Kapsam ve yöntem

**Okunan dosyalar (tamamı):** `.github/workflows/{ci,test-surumu,guvenlik-taramasi}.yml`,
`.github/dependabot.yml`, `.github/ISSUE_TEMPLATE/{config,hata-kaydi}.yml`, `rust-toolchain.toml`, `.nvmrc`,
`src-tauri/build.rs`, `src-tauri/Cargo.toml`, `src-tauri/deny.toml`, `src-tauri/tauri.conf.json`, `package.json`,
`scripts/third-party-notices.mjs`, `scripts/check-{rules,docs,licenses,no-audio}.mjs`, `scripts/lib/audio.mjs`,
`SECURITY.md`, `README.md`, `CLAUDE.md`. İlgili bölümleri okunanlar: `scripts/check-scenes.mjs`,
`docs/MIMARI.md` §"Kurallar ve onları denetleyenler", `src-tauri/src/commands.rs` (sürüm testi),
`src-tauri/src/diagnostics.rs` (9ae1b6d farkı). GitHub belgesi kaynak metni: `events.md` (`workflow_run`
bölümü), `secure.md`.

**Çalıştırılan komutlar ve deneyler** (hepsi kendi klasörümdeki kopyada:
`git clone /home/user/Lyraska …/yeniden/repo`, `9ae1b6d`'ye çıkıldı, `node_modules` sembolik bağ):

| Deney                                                                                                    | Sonuç                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zizmor 1.31.1 --offline --min-severity=low .github/workflows`                                           | Bulgu yok (1 bilinçli `ignore`); pedantic/auditor: yalnızca `concurrency-limits` (help)                                                              |
| `actionlint 1.7.12`                                                                                      | çıkış 0                                                                                                                                              |
| zizmor, canlı `main`'in iş akışlarında                                                                   | `error[dangerous-triggers] test-surumu.yml:13 workflow_run`                                                                                          |
| Mutasyon: kopya iş akışına sabitlenmemiş `actions/cache@v4` + `${{ github.event.pull_request.title }}`   | zizmor `unpinned-uses` + `template-injection`, çıkış 14 → **kapı çalışıyor**                                                                         |
| Mutasyon: `src/lib/abx.test.ts:5` `it(` → `it.skip(`                                                     | format, lint, check:docs, check:commands, vitest **yeşil** (`5 passed / 1 skipped`); yalnızca `check:rules` kırmızı → **CI bunu yakalamaz** (YAY-02) |
| Mutasyon: geçmişe `docs/veri.bin` (ID3) ve `docs/cerceve.dat` (etiketsiz MPEG çerçevesi) ekle, sonra sil | `check:audio` (ağaç) yeşil, `check:audio -- --history` **kırmızı**, ikisini de buldu → kapı çalışıyor                                                |
| Mutasyon: `UCUNCU-TARAF.txt`'den bir satır sil                                                           | `check:notices` kırmızı → çalışıyor                                                                                                                  |
| Mutasyon: package-lock'ta `react` → `AGPL-3.0-only`, `vite` → `MIT AND SSPL-1.0`                         | `check:licenses` ikisini de reddetti → çalışıyor                                                                                                     |
| Mutasyon: yalnızca `package.json` sürümünü 0.0.62 yap                                                    | Hiçbir npm kapısı yakalamadı; Rust testi `commands::surum_package_json_ile_ayni` yakalar (kod okuması; derleme yasak)                                |
| `cargo deny check licenses bans sources advisories` (kopyada, derleme yok)                               | `advisories ok, bans ok, licenses ok, sources ok`                                                                                                    |
| `cargo tree --target x86_64-pc-windows-msvc -e normal`                                                   | 257 crate; `reqwest/hyper/ureq/rustls/native-tls/openssl/tungstenite/h2/curl` **yok**                                                                |
| package-lock analizi                                                                                     | `lockfileVersion 3`; kayıt dışı kaynak yok, `integrity`'si eksik paket yok; kurulum betiği yalnızca `fsevents` (macOS, isteğe bağlı)                 |
| `git ls-remote` ile eylem etiketleri                                                                     | 9 sabit SHA'nın hepsi o eylemin deposunda gerçek bir etiketin commit'i (impostor yok)                                                                |
| Tauri CLI 2.12.1 ikilisinde `strings`                                                                    | NSIS eklentisi SHA1 ile doğrulanıyor; WebView2 önyükleyicisi `go.microsoft.com`'dan karmasız iniyor (YAY-08)                                         |
| GitHub API (salt okuma; vekil oturum kimliğiyle)                                                         | aşağıdaki "canlı durum" verileri                                                                                                                     |

**Canlı durum (GitHub API, salt okuma):** depo herkese açık; `branches/main` → `protected: false`,
`required_status_checks.enforcement_level: off`; `rulesets` → `[]`; `rules/branches/main` → `[]`;
`private-vulnerability-reporting` → `{"enabled": false}`; `security_and_analysis`: secret scanning ve push
protection **açık**, Dependabot security updates **kapalı**. `test-surumu` Release: 0.0.58 (`f00ce64`), yalnızca
`Lyraska-Kurulum.exe`. O dosyanın özeti için `attestations/sha256:dec823…` → 404 (canlı iş akışında kanıt adımı
yok). PR #100: `open`, `mergeable_state: dirty`; daldaki son CI `57f3e7b` → failure (Windows testleri, sahne
denetimi). `9ae1b6d` için CI çalıştırması yok.

**Sınırlar:** Rust derlemesi yapılmadı (brief). `cargo test`'e bağlı kapılar (ts-rs bağları, sürüm testi) kod
okumasıyla değerlendirildi. GitHub'ın Actions ayarları (fork PR onayı, varsayılan token izni) API'de 403. Eski
hesap adının (`gozlemesevdalisi`) boşta olup olmadığı vekil engeli yüzünden doğrulanamadı.
`docs.github.com` erişilemedi; GitHub belgesine `events.md`/`secure.md` ve bilinen belge metinleriyle atıf yapıldı.
CSP'yi gevşeten mutasyon ortamın güvenlik denetleyicisince engellendi; o kısım kod okumasıyla gösterildi.
Kopya iş bitince silindi.

## 3. Bulgular

### YAY-01: Sertleştirilmiş yayın hattı `main`'de değil; canlı `test-surumu.yml` fork PR kodunu sabit linke koyabilir

- Önem: **Kritik** (canlı durum; PR #100 birleşince kapanır) · Güven: Yüksek (GitHub ayarlarına bağlı) ·
  Standart: GitHub Security Lab "Keeping your GitHub Actions and workflows secure" (workflow_run bölümü),
  `secure.md:111,123`, OpenSSF Scorecard _Dangerous-Workflow_, SLSA v1.0 Build L2 (yayınlanan ikilinin kaynağı)
- Yer: canlı `main` `.github/workflows/test-surumu.yml:13-16,35,50-52,57-59` (`git show 6c95431:…`).
  Düzeltmesi dalda: `9ae1b6d` `.github/workflows/test-surumu.yml:45-51`
- Kanıt:
  ```yaml
  # canlı main
  workflow_run: { workflows: [CI], types: [completed], branches: [main] }
  ...
  if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'
  ...
  HEAD_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}   # → checkout ref
  - uses: Swatinem/rust-cache@…   # workflow_run bağlamında main kapsamlı önbellek, yazma dahil
  ```
  `events.md:1147` "The workflow started by the `workflow_run` event is able to access secrets and write tokens,
  even if the previous workflow was not". `branches:` süzgeci tetikleyen çalıştırmanın `head_branch`'ine bakar.
  Fork'tan açılan PR'da bu, fork'taki dalın adıdır. Canlı CI `pull_request`'te dal süzgeci olmadan çalışır.
  zizmor canlı dosyada `error[dangerous-triggers]` verdi. Canlı `yayinla` işinde "main'in ucu mu" denetimi de yok
  (`download-artifact` doğrudan çalışıyor).
  Bunlara ek olarak PR #100 `dirty` (çakışmalı). GitHub çakışmalı PR'da `pull_request` CI'sini çalıştırmaz.
  Dalın yeni `ci.yml`'si GitHub'da iki kez koştu: biri `cancelled`, `57f3e7b` ise `failure`. **Bir kez bile yeşil
  olmadı.** `9ae1b6d`'nin düzeltmeleri (Windows testleri, CSP'ye uygun sahne denetimi) GitHub'da sınanmadı.
- Senaryo ve etki: Bir saldırgan depoyu fork'lar, fork'unda `main` adlı dala zararlı kod koyar, PR açar
  (testleri geçecek biçimde). CI yeşil biter. `Test sürümü` `workflow_run` ile tetiklenir, `head_sha`'yı (fork
  kodunu) `contents: write` olan bir iş akışında derler ve `test-surumu` Release'ine koyar. Proje sahibi ve
  test kullanıcıları sabit linkten zararlı kurulum dosyasını indirir. Aynı çalıştırma `rust-cache` ile `main`
  kapsamına önbellek yazabildiği için sonraki `main` derlemeleri de zehirlenebilir.
- Çürütme denemesi: (1) GitHub herkese açık depolarda ilk kez katkı yapanların PR iş akışlarını varsayılan olarak
  onaya bağlar. Bu ayar API'de görülemedi (403). Onay, daha önce kabul edilmiş zararsız bir katkıyla aşılır ve
  sahibi yazılımcı olmadığı için "Approve and run" düğmesine kolayca basabilir. Risk düşer ama kalkmaz.
  (2) `head_branch`'in fork dalının adı olduğunu GitHub'ın `workflow_run` yükü ve Security Lab yazısı söyler;
  aksini söyleyen belge bulamadım. (3) Dal sürümü (`event == 'push'` ve
  `head_repository.full_name == github.repository`) bu yolu gerçekten kapatıyor (kod okuması, Kesin). Yani
  bulgu yalnızca "henüz birleşmedi" kısmında geçerli.
- Öneri: PR #100'ün çakışmasını çözüp CI yeşil olunca hemen birleştirin. Bu uzayacaksa yalnızca
  `test-surumu.yml`'nin `derle.if` satırını (dal sürümündeki beş koşul) içeren tek dosyalık bir acil PR açın,
  ya da birleşene kadar "Test sürümü" iş akışını Actions sekmesinde **Disable workflow** ile kapatın.

### YAY-02: `check:rules` CI'da çalışmıyor; güvenlikle ilgili beş kural yalnızca elle denetleniyor

- Önem: **Yüksek** · Güven: Kanıtlandı · Standart: ISO/IEC 25010 (doğrulanabilirlik), OpenSSF Scorecard
  _CI-Tests_, Tauri 2 güvenlik modeli (capabilities, CSP), OWASP ASVS V14.4 (HTTP güvenlik başlıkları/CSP)
- Yer: `.github/workflows/ci.yml:41-59` (`arayuz` işi: check:rules adımı yok), `package.json:21`,
  `scripts/check-rules.mjs:1-11`, `README.md:89-94`, `docs/MIMARI.md:307`
- Kanıt:
  - `grep -rn "check:rules\|check-rules" .github` → sonuç yok. Kopyadaki geçmiş:
    `git log -G'check:(rules|docs)' -- .github/workflows/ci.yml` yalnızca `check:docs`'un eklendiğini gösteriyor.
    `check:rules` CI'da **hiç** olmadı.
  - Betiğin kendi tanımı (`scripts/check-rules.mjs:3-10`): `unsafe` yalnızca WASAPI'de; `.skip/.only` ve
    gerekçesiz `#[ignore]` yok; test dosyası adları; "Program internete bağlanmaz: arayüzde uzak adres yok, CSP
    uzak kaynağa, `eval`'e ve satır içi betiğe izin vermez"; "Tauri izinleri (capabilities) bilinen en dar listede".
  - README.md:89-94: "Checks (the same ones CI runs …) … `npm run check:rules` …". Bu söz doğru değil.
  - MIMARI.md:307: "Her kural ya bir testle ya da CI'daki bir adımla denetlenir. Elle hatırlanması gereken kural
    yoktur."
  - Mutasyon: `it(` → `it.skip(` (`src/lib/abx.test.ts:5`). `format:check` 0, `lint` 0, `check:docs` 0,
    `check:commands` 0, vitest `Tests 5 passed | 1 skipped`, çıkış 0. Yalnızca
    `check:rules`: `src/lib/abx.test.ts:5: it.skip — testler atlanmaz`, çıkış 1.
- Senaryo ve etki: Bir yapay zekâ oturumu bir hatayı "geçici olarak" atlatmak için testi `.skip` eder, Google
  Fonts için CSP'ye `https:` ekler ya da `capabilities/default.json`'a `shell:allow-open` gibi bir izin koyar.
  CI yeşil kalır, değişiklik birleşir ve sabit linke gider. "Program internete bağlanmaz" ve "en dar izin"
  sözleri sessizce bozulur. Bozuk etiketli bir şarkı dosyasıyla yapılabilecek bir arayüz enjeksiyonunun etkisi
  büyür, çünkü CSP derinlemesine savunmanın son katmanıdır.
- Çürütme denemesi: Kuralları başka bir CI adımının denetleyip denetlemediğine baktım. (1) `check:scenes`
  (`scripts/check-scenes.mjs:644`) CSP'yi Edge'de **uygular**; bu yalnızca CSP'nin engellediği bir şeyi yakalar,
  CSP'nin **gevşetilmesini** yakalamaz. (2) Tauri derlemesi izin adlarının var olduğunu doğrular, listenin en dar
  olduğunu doğrulamaz. (3) `unsafe_code = "deny"` gerekçeli `#[allow(unsafe_code, reason = …)]`'u her dosyada
  kabul eder; dosya kısıtını yalnızca `check:rules` koyar. (4) ESLint'te `.skip` kuralı yok (lint yeşil kaldı).
  (5) Hiçbir vitest ya da Rust testi `check-rules`'u çağırmıyor (`grep` ile arandı). Bulgu ayakta.
- Öneri: `ci.yml` `arayuz` işine, `check:docs` adımının yanına bir adım ekleyin:
  `- name: Proje kuralları (CSP, izinler, unsafe, atlanan test)` / `run: npm run check:rules`.
  MIMARI.md'nin kural tablosuna CSP, capabilities ve "uzak adres yok" satırlarını `check:rules (CI)` diye ekleyin.

### YAY-03: `main` korumasız; zorunlu denetim yok ve yapay zekâ sahibin kimliğiyle birleştiriyor

- Önem: **Yüksek** (proje sahibinin ayarına bağlı) · Güven: Kanıtlandı (API) · Standart: OpenSSF Scorecard
  _Branch-Protection_ (beklenen 0/10), _Code-Review_ (beklenen 0/10); SLSA v1.0 kaynak gereksinimleri (korunan
  dal, gözden geçirme)
- Yer: GitHub ayarı (Settings → Branches / Rules). Kural metni `CLAUDE.md:276-277`
- Kanıt: `GET /repos/lahmacunveayran/Lyraska/branches/main` → `"protected": false`,
  `"required_status_checks": {"enforcement_level": "off"}`; `/rulesets` → `[]`; `/rules/branches/main` → `[]`.
  PR #95–#99'un hepsi `user: lahmacunveayran`, `merged_by: lahmacunveayran`, inceleme yok
  (`/pulls/99/reviews` → `[]`). CLAUDE.md:276-277: "`main`'e doğrudan push yapılmaz … PR'da CI yeşil olmadan
  birleştirme yapılmaz". Bu kural yalnızca talimatta, GitHub'da zorlanmıyor.
- Senaryo ve etki: Yapay zekâ oturumları (bu oturumun da olduğu gibi) sahibin GitHub kimliğiyle push ve merge
  yapabiliyor. Talimatı yanlış anlayan ya da bir istem enjeksiyonuna (ör. bir issue metni) kanan bir oturum
  `main`'e doğrudan push yapabilir, kırmızı bir PR'ı birleştirebilir ya da `main`'i force-push ile yeniden
  yazabilir. Yayın yalnızca "push CI'si yeşilse" yapıldığı için kırmızı kod sabit linke düşmez. Ama testleri
  geçen her değişiklik **hiçbir insan onayı olmadan** kullanıcıya gider, ve geçmişi silen bir force-push'u geri
  almanın kolay yolu yok.
- Çürütme denemesi: Dal korumasının başka bir yolla (ruleset, kuruluş kuralı) sağlanıp sağlanmadığına baktım.
  Depo kullanıcı hesabında, ruleset listesi boş, dalın kuralları boş. "Aynı kimlik kendi PR'ını onaylayamaz"
  olduğu için zorunlu onay bu kurulumda tek başına işe yaramaz. Bulgunun özü onay değil, zorunlu denetim ve
  force-push/silme koruması; bunlar ayarla sağlanabilir.
- Öneri (sahibin düğmeleri): Settings → Rules → Rulesets → **New branch ruleset**: hedef `main`;
  "Restrict deletions", "Block force pushes", "Require a pull request before merging" (onay sayısı 0) ve
  "Require status checks to pass" işaretlenir. Zorunlu denetimler: `Arayüz (TypeScript)`, `Çekirdek (Rust)`,
  `Güvenlik uyarıları`, `Sahneler (Windows, Edge)`, `Windows (Clippy, testler, kurulum dosyası)`. "Bypass list"
  boş bırakılır. İsteğe bağlı: `yayinla` işine `environment: test-surumu` ve bu ortama "Required reviewers:
  sahip" eklenir. Böylece her yayın, sahibin tek bir onay düğmesine bağlanır.

### YAY-04: Gizli güvenlik bildirimi kapalı; SECURITY.md ve hata formu çıkmaz sokağa yolluyor

- Önem: **Orta** (proje sahibinin ayarına bağlı) · Güven: Kanıtlandı (API) · Standart: OpenSSF Scorecard
  _Security-Policy_; ISO/IEC 29147 (açık bildirimi)
- Yer: `SECURITY.md:10,29`, `.github/ISSUE_TEMPLATE/config.yml:2-5`
- Kanıt: `GET /repos/lahmacunveayran/Lyraska/private-vulnerability-reporting` → `{"enabled": false}`.
  SECURITY.md: "deponun **Security** sekmesindeki **Report a vulnerability** düğmesiyle özel bir bildirim açın".
  config.yml: `url: …/security/advisories/new`. Özellik kapalıyken bu düğme ziyaretçilere görünmez.
- Senaryo ve etki: Bozuk bir FLAC'ın programı çökerttiğini bulan bir araştırmacı düğmeyi bulamaz. Ya
  vazgeçer ya da SECURITY.md'nin "herkese açık hata kaydı açmayın" ricasına rağmen açığı herkese açık bir issue'ya
  yazar.
- Öneri: Settings → Code security → **Private vulnerability reporting → Enable**. Alternatif olarak
  SECURITY.md'ye ikinci bir kanal (e-posta) eklenir.

### YAY-05: Kurulum dosyası imzasız; kullanıcıya SmartScreen'i geçmesi öğretiliyor

- Önem: **Orta** (satın almaya veya başvuruya bağlı) · Güven: Kesin · Standart: SLSA v1.0 (dağıtımda
  doğrulama), Microsoft SmartScreen/Authenticode, OpenSSF Scorecard _Signed-Releases_
- Yer: `.github/workflows/test-surumu.yml:175-176`, `README.md:43-45`, `src-tauri/tauri.conf.json`
  (`bundle.windows`'ta `certificateThumbprint`/`signCommand` yok)
- Kanıt: Sürüm notu: "Windows … korudu derse **Ek bilgi** → **Yine de çalıştır**'a basın. (Program henüz
  dijital olarak imzalanmadığı için bu uyarı normaldir; imzalama Faz 4'te.)" Release'te yalnızca `.exe` var; imza
  ya da `.sigstore` dosyası yok.
- Senaryo ve etki: Kullanıcılar bu programda SmartScreen uyarısını geçmeyi alışkanlık edinir. Biri sabit linkin
  benzerini (yazım hatalı alan adı, sahte "yeni sürüm" mesajı) dolaştırırsa kullanıcı uyarıyı yine geçer.
  Derleme kanıtı (attestation) var, ama doğrulama `gh` CLI ve GitHub girişi gerektirdiği için yazılımcı
  olmayan kullanıcı onu kullanamaz.
- Öneri: Açık kaynak projeler için ücretsiz **SignPath Foundation** başvurusu ya da Azure Trusted Signing
  (aylık düşük ücret). İmzalama `yayinla` öncesinde ayrı bir ortam onayıyla yapılır. O zamana kadar sürüm
  notunda SHA-256'nın Windows'ta nasıl karşılaştırılacağı yazılır (`Get-FileHash Lyraska-Kurulum.exe`).

### YAY-06: Sabit link sessizce eskiyor; sahne işi 30 dakika sınırının dibinde

- Önem: **Orta** · Güven: Kanıtlandı (API verisi) · Standart: ISO/IEC 25010 güvenilirlik (olgunluk,
  kullanılabilirlik); Faz 0 sözü "her `main` güncellemesinde test sürümü"
- Yer: `.github/workflows/ci.yml:162-163` (`sahneler`: `timeout-minutes: 30`), `scripts/check-scenes.mjs:196`
  (`SLOW = 180_000`), `.github/workflows/test-surumu.yml:45-51` (başarısızlıkta iş yalnızca `skipped`)
- Kanıt: Son 12 CI çalıştırmasında `Sahneler` işinin süresi: 5,9 / 9,7 / 16,2 / 18,4 / 19,8 / 21,8 / 23,1 /
  27,7 / 28,5 / **31,3 (cancelled)** dk. `main` `da291eb` (0.0.59) CI'si `Sahneler`'in 30 dk sınırına takıldı:
  `conclusion: cancelled`. `Test sürümü` aynı commit için `skipped` oldu ve 0.0.59 hiç yayımlanmadı. PR #98'in
  ilk denemesinde `Çekirdek (Rust)` de 40 dk sınırında `cancelled` oldu. Denetim anında sabit link 0.0.58'i
  gösteriyordu, `main` ise 0.0.60'taydı.
- Senaryo ve etki: Sahibi "main güncellendi, link yenilendi" diye eski sürümü dener. Zaten düzeltilmiş bir
  hatayı yeniden bildirir ya da yeni bir özelliği "çalışmıyor" sanar. `cancelled` ve `skipped`, `failure` gibi
  bildirim e-postası üretmez; kimse uyarılmaz.
- Öneri: (1) `ci.yml` `sahneler` işinde `timeout-minutes: 45` verin ve `check-scenes.mjs`'e toplam süre bütçesi
  koyun (aşılınca `process.exit(1)` ile hızlı kırmızı). (2) `test-surumu.yml`'ye ucuz bir iş ekleyin:
  `if: github.event_name == 'workflow_run' && github.event.workflow_run.event == 'push' &&
github.event.workflow_run.conclusion != 'success'`, `run: echo "::error::main CI'si başarısız; test sürümü
yenilenmedi" && exit 1`. Böylece başarısız bir çalıştırma ve bildirim oluşur.

### YAY-07: Eski hesap adına giden linkler (canlı programda ve canlı CLAUDE.md'de): ad başkasına geçerse link de başkasına gider

- Önem: **Orta** · Güven: Yüksek (linkler kesin; eski adın boşta olup olmadığı doğrulanamadı) · Standart:
  OpenSSF "repojacking"; GPL-3.0 §6 (kaynak teklifinin doğruluğu)
- Yer: canlı `main` `CLAUDE.md:17` (her oturumun sahibine verdiği link), `src/components/SettingsPanel.tsx:210`
  (0.0.60'a kadar her kurulu programda kaynak adresi), `README.md`, `docs/DOGRULAMA.md`. Dalda düzeltilmiş
  ve `scripts/check-docs.mjs:18,72-88` ile korunuyor. `docs/arastirma/veritas/R2_GOREV.md:9` hâlâ
  `gozlemesevdalisi/Lyraska` yazıyor (link değil, denetimin kalıbına girmiyor).
- Kanıt: `curl -I https://github.com/gozlemesevdalisi/Lyraska/releases/download/test-surumu/Lyraska-Kurulum.exe`
  → `301` → `lahmacunveayran/Lyraska/...`. Eski link bugün **yönlendirmeyle** çalışıyor. Canlı `main`:
  `CLAUDE.md:17 https://github.com/gozlemesevdalisi/Lyraska/releases/download/test-surumu/Lyraska-Kurulum.exe`.
- Senaryo ve etki: GitHub'ın kullanıcı adı değiştirme belgesine göre eski ad başkası tarafından alınabilir. Yeni
  sahip aynı adla bir depo açarsa yönlendirme biter. Saldırgan `gozlemesevdalisi` adını alır, `Lyraska` deposunu
  açar ve `test-surumu` Release'ine kendi `.exe`'sini koyar. Eski linki yer imi olarak tutan sahip ya da
  testçiler, eski devir notları ve eski programın "Kaynak kodu" satırı saldırganın dosyasına gider.
- Öneri: PR #100 birleşince linkler düzelir. Ek olarak (sahibin işi) eski adı **boş bir hesapla tutun**: yeni
  ücretsiz hesap `gozlemesevdalisi` açılır ve içinde `Lyraska` adlı depo **açılmaz**. Böylece yönlendirme sürer,
  ad başkasına geçmez. `check-docs.mjs`'teki `OLD_OWNER` kalıbı `gozlemesevdalisi/` biçimini de yakalayacak
  şekilde genişletilir.

### YAY-08: Derleme sırasında sabitlenmemiş indirmeler (WebView2 önyükleyicisi karmasız; NSIS SHA1) ve kayan çalışma ortamı

- Önem: Düşük · Güven: Yüksek · Standart: SLSA v1.0 (L2 için zorunlu değil; "hermetic" ileri düzey),
  OpenSSF Scorecard _Pinned-Dependencies_
- Yer: `src-tauri/tauri.conf.json` `"webviewInstallMode": { "type": "embedBootstrapper" }`; `.nvmrc` = `22`;
  `runs-on: windows-latest/ubuntu-latest`; `ci.yml:151` `pipx run zizmor==1.31.1` (karmasız PyPI)
- Kanıt: `strings node_modules/@tauri-apps/cli-linux-x64-gnu/cli.linux-x64-gnu.node`:
  `https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll75197FEE…`
  (SHA1 ile doğrulanıyor) ve `MicrosoftEdgeWebview2Setup.exe https://go.microsoft.com/fwlink/p/?LinkId=2124703`
  (karmasız; derleme anında inip kurulum dosyasına gömülüyor).
- Senaryo ve etki: Yayımlanan ikiliye depo kilit dosyalarının dışında üç ağ girdisi giriyor (NSIS, eklenti,
  Microsoft önyükleyicisi) ve Node 22.x ile runner imajı zamanla değişiyor. Aynı commit'ten iki derleme bayt bayt
  aynı olmayabilir. Microsoft dosyası kendi Authenticode imzasını taşıdığı için gerçekçi saldırı yolu dar.
- Öneri: `.nvmrc`'ye tam sürüm (ör. `22.20.0`); runner'ları `windows-2025` / `ubuntu-24.04` diye sabitleyin.
  İsteğe bağlı olarak `derle` işinde önyükleyicinin Authenticode imzası
  (`Get-AuthenticodeSignature … | Where Status -eq Valid`) Tauri'nin önbelleğinden okunup denetlenir.

### YAY-09: Derleme kanıtını doğrulama komutu iş akışını ve dalı sabitlemiyor

- Önem: Düşük · Güven: Kesin · Standart: SLSA v1.0 doğrulama ("expected builder/source"), GitHub Artifact
  Attestations
- Yer: `README.md:48-50`, `SECURITY.md:24`, `.github/workflows/test-surumu.yml:168-170`
- Kanıt: `gh attestation verify Lyraska-Kurulum.exe --repo lahmacunveayran/Lyraska`. Yalnızca "bu depodaki
  herhangi bir iş akışı imzaladı" doğrulanıyor.
- Senaryo ve etki: Yazma yetkisi olan biri (YAY-03'e göre her yapay zekâ oturumu) herhangi bir dalda
  `id-token: write` taşıyan bir iş akışıyla rastgele bir dosyaya geçerli kanıt üretebilir. Komut bunu "doğrulandı"
  sayar.
- Öneri: Komutu şöyle değiştirin: `gh attestation verify Lyraska-Kurulum.exe --repo lahmacunveayran/Lyraska
--signer-workflow lahmacunveayran/Lyraska/.github/workflows/test-surumu.yml --source-ref refs/heads/main`.

### YAY-10: Elle başlatılan yayın CI sonucunu beklemiyor

- Önem: Düşük · Güven: Kesin · Standart: SLSA v1.0 (yayın öncesi doğrulama)
- Yer: `.github/workflows/test-surumu.yml:46`
- Kanıt: `(github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main') || …`. Elle başlatmada
  `main`'in ucunun CI'si yeşil mi diye bakılmıyor.
- Senaryo ve etki: Kırmızı bir `main` ucu (YAY-03 yüzünden mümkün) "Run workflow" ile sabit linke konabilir.
- Öneri: `derle`'nin ilk adımında `gh api repos/$GH_REPO/commits/$SHA/check-runs` ile CI işlerinin hepsinin
  `success` olduğunu denetleyin (bunun için `checks: read` izni gerekir).

### YAY-11: "Önbelleksiz yayın derlemesi" sözü `setup-node` v5'in örtük önbelleğine karşı açık değil

- Önem: Düşük · Güven: Yüksek (setup-node v5 davranışına bağlı) · Standart: GitHub Security Lab (önbellek
  zehirlenmesi), zizmor _cache-poisoning_
- Yer: `.github/workflows/test-surumu.yml:70-73`
- Kanıt: `cache:` girdisi yok. setup-node v5, `package.json`'da `packageManager` (ya da
  `devEngines.packageManager`) alanı varsa npm önbelleğini **kendiliğinden** açar. Bugün alan yok, yani bugün
  önbellek yok.
- Senaryo ve etki: Bir oturum `"packageManager": "npm@…"` eklerse yayın derlemesi sessizce `main` kapsamlı npm
  önbelleğini kullanmaya başlar ve dosya başındaki söz (satır 9) bozulur.
- Öneri: `with: package-manager-cache: false` ekleyin (`guvenlik-taramasi.yml:29-31` için de).

### YAY-12: zizmor CI'da `--offline`: impostor commit ve bilinen açıklı eylem denetimleri kapalı

- Önem: Düşük · Güven: Kesin · Standart: OpenSSF Scorecard _Pinned-Dependencies_, zizmor
  `impostor-commit`/`known-vulnerable-actions`
- Yer: `.github/workflows/ci.yml:151`
- Kanıt: `pipx run zizmor==1.31.1 --offline --min-severity=low`. Ağ isteyen denetimler çalışmıyor. Elle
  doğrulamada (`git ls-remote`) bugünkü 9 SHA'nın hepsi gerçek etiket commit'i çıktı. `Swatinem/rust-cache`
  `6323deb` = `v2.9.2` (yorum `# v2` diyor; bilgi).
- Öneri: Adıma `env: GH_TOKEN: ${{ github.token }}` verip `--offline`'ı kaldırın (salt okuma token'ı yeter).

### YAY-13: PR kurulum dosyasının "derleme kodu" içeriği yansıtmıyor

- Önem: Bilgi · Güven: Kesin
- Yer: `.github/workflows/ci.yml:226-231`
- Kanıt: `checkout` `pull_request`'te birleştirme commit'ini çeker, ama
  `LYRASKA_COMMIT: ${{ github.event.pull_request.head.sha || github.sha }}`. İkili birleştirme commit'inin
  içeriğini taşırken PR'ın ucunu gösteriyor.
- Öneri: Ya `actions/checkout`'a `ref: ${{ github.event.pull_request.head.sha }}` verin (derlenen ile etiket
  aynı olur), ya da yorumu "etiket PR ucudur; içerik main ile birleşmiştir" diye düzeltin.

## 4. Olası riskler (kanıtı yetmeyenler)

- **Fork PR onay ayarı bilinmiyor.** Actions → General → "Approval for running fork pull request workflows"
  API'de 403. YAY-01'in canlı ağırlığı buna bağlı.
- **Haftalık güvenlik taraması 60 gün sessizlikte kapanır.** Herkese açık depolarda zamanlanmış iş akışları 60
  gün etkinlik yoksa GitHub'ca devre dışı bırakılır. Proje aktifken sorun değil.
- **Tek sabit Release, arşiv yok.** Eski kurulum dosyaları silindiği için bir gerilemenin hangi sürümde başladığı
  sahibin cihazında ikiye bölünerek aranamaz (`kurulum` artifact'ı 7 gün). GPL kaynak teklifi derleme kodu
  (commit) ile sağlandığı için lisans sorunu değil.
- **`Swatinem/rust-cache` CI'da `push` main'de önbellek yazıyor**, PR'lar `main` kapsamına yazamıyor. Dal
  sürümünde yayın derlemesi önbellek kullanmadığı için risk yok; canlı `main`'de var (YAY-01).
- **PR kurulum dosyaları** (`Lyraska-Kurulum-PR`, 14 gün) fork PR kodundan da üretilir. Sahibine "şu PR'ın
  dosyasını dene" denirse zararlı olabilir. Talimatta yalnızca sabit link geçtiği için düşük.

## 5. Temiz bulunanlar

- **Tetikleyiciler ve koşullar (dal):** `CI`: `push: [main]`, `pull_request`, `workflow_dispatch`; üst düzey
  `permissions: contents: read`. `Test sürümü`: `workflow_run` + `event == 'push'` +
  `head_branch == 'main'` + `head_repository.full_name == github.repository` + `conclusion == 'success'`. Derlenen
  commit `head_sha`, derleme işinin izni `contents: read`. Yazan iş (`yayinla`) depo kodu indirmiyor ve
  çalıştırmıyor; "hâlâ main'in ucu mu" denetimi Re-run ile eski sürümün geri yüklenmesini engelliyor.
  `Güvenlik taraması`: `schedule` + `dispatch`, `permissions: {}`, işlerde en dar izin; Scorecard
  `publish_results: false`.
- **Kim neyi derleyip nereye yayımlıyor:** sabit linke yalnızca bu deponun `main` push'u (dalda). PR derlemesi
  yalnızca artifact. Hiçbir iş akışında sır (secret) kullanılmıyor; `GITHUB_TOKEN` yalnızca `yayinla`'da.
- **Enjeksiyon:** hiçbir `run:` içinde `${{ github.event.* }}` yok; hepsi `env:` üzerinden. Sürüm notu
  heredoc'u değişken değerini yeniden yorumlamıyor.
- **Eylem sabitleme:** 9 eylemin hepsi tam SHA ile sabit ve hepsi o deponun gerçek etiket commit'i
  (`git ls-remote`). Dependabot ayda bir toplu güncelliyor. Her `checkout`'ta `persist-credentials: false`.
  Her işte `timeout-minutes` var.
- **İş akışı denetimi CI'da çalışıyor:** zizmor (mutasyonla kırmızı) ve actionlint; ikisi de GitHub'da `57f3e7b`
  çalıştırmasında koştu (Güvenlik uyarıları işi `success`).
- **Kilit dosyaları:** `cargo … --locked` her yerde; `cargo fetch --locked`; npm `lockfileVersion 3`, hepsi
  `registry.npmjs.org`, hepsinde `integrity`. Kurulum betiği yalnızca `fsevents` (Windows'ta kurulmaz).
- **cargo-deny:** `licenses/bans/sources/advisories ok`; `unknown-registry/unknown-git = deny`,
  `wildcards = deny`, `ignore = []`. İzin listesi CLAUDE.md'deki politika ile uyumlu (AGPL ve ticari kullanımı
  yasaklayan lisans yok). npm kapısı aynı listeyi `deny.toml`'dan okuyor. Yalnızca geliştirme araçlarına iki ek
  lisans (BlueOak, CC-BY-4.0) gerekçeli; README'nin "aynı liste" cümlesi bu istisnayı anmıyor (bilgi).
- **"Program internete bağlanmaz" (bağımlılık düzeyi):** Windows grafiğinde HTTP/TLS istemci crate'i yok.
  `tauri` ek özelliksiz; güncelleyici (updater) eklentisi yok, yani ele geçirilebilecek otomatik güncelleme
  kanalı da yok.
- **Sürüm tutarlılığı:** `tauri.conf.json` `version: "../package.json"`; Rust testi
  `surum_package_json_ile_ayni` Cargo.toml ile package.json'ı karşılaştırıyor. Cargo.lock ve `--locked`, Cargo.toml
  sürümünü kilitliyor.
- **build.rs:** `LYRASKA_COMMIT` > git > "yerel"; değer hex denetiminden geçiyor; `GITHUB_SHA` bilinçli
  kullanılmıyor. Doğru.
- **Lisans bildirimleri:** Windows hedefinin normal bağımlılıkları ve pakete giren npm paketleri; belirlenimci
  çıktı; mutasyonla kırmızı. `rfd`'nin doğrudan bağımlılıktan çıkması (`9ae1b6d`) bildirimi bozmuyor:
  `check:notices` yeşil, çünkü `rfd` dialog eklentisi üzerinden hâlâ pakette.
- **Ses dosyası kapısı:** uzantı ve imza, ağaç ve bütün geçmiş; CI'da `fetch-depth: 0`. Mutasyonla kırmızı.
- **GitHub güvenlik ayarları:** secret scanning ve push protection açık.
- **Hata kaydı formu:** Türkçe, zorunlu alanlar makul, `hata` etiketi depoda var, günlük yolu
  (`%LOCALAPPDATA%\io.github.gozlemesevdalisi.lyraska\logs`) koddaki `data_dirs` ile aynı. Günlükte kullanıcı
  adının geçebileceği açıkça yazıyor.
- **GPL ve SPDX:** `GPL-3.0-only` package.json, Cargo.toml ve tauri.conf.json'da aynı; kurulumda LICENSE
  gösteriliyor; Release etiketi derlenen commit'e taşınıyor, böylece kaynak arşivi ikiliyle eşleşiyor.
- **9ae1b6d'deki PowerShell ileti kutusu:** metin komut satırına değil ortam değişkenine konuyor; tırnakla
  enjeksiyon yok (kapsam dışı, yalnızca Cargo.toml değişikliğinin yan etkisi için bakıldı).

## Proje sahibinin ayarına bağlı

| Madde                 | Nerede                                                                          | Etki                                      |
| --------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| YAY-01 (geçici)       | PR #100'ü birleştirmek ya da "Test sürümü"nü geçici olarak _Disable workflow_   | Kritik açığı kapatır                      |
| YAY-03                | Settings → Rules → Rulesets → New branch ruleset (`main`)                       | Zorunlu CI, force-push ve silme koruması  |
| YAY-03 (isteğe bağlı) | Settings → Environments → `test-surumu` → Required reviewers                    | Her yayın sahibin onayıyla                |
| YAY-04                | Settings → Code security → Private vulnerability reporting → Enable             | SECURITY.md'nin sözü tutar                |
| YAY-05                | SignPath Foundation başvurusu ya da Azure Trusted Signing                       | SmartScreen uyarısı biter                 |
| YAY-07                | Yeni ücretsiz hesap `gozlemesevdalisi` (içinde `Lyraska` deposu açmadan)        | Eski linkler başkasına geçemez            |
| Olası risk            | Settings → Actions → General → "Require approval for all external contributors" | Fork PR'ları her seferinde onaya bağlanır |

## 6. Öncelikli düzeltme sırası

1. **YAY-01:** PR #100'ün çakışmasını çöz, CI'nın `9ae1b6d` üzerinde yeşil olduğunu gör, birleştir. Gecikirse
   "Test sürümü"nü geçici olarak kapat ya da yalnızca `derle.if` satırını taşıyan acil PR aç.
2. **YAY-03:** `main` için ruleset (zorunlu 5 CI işi, force-push ve silme yasağı, bypass yok).
3. **YAY-02:** `ci.yml`'ye `npm run check:rules` adımı; MIMARI.md kural tablosuna CSP, izin ve "uzak adres"
   satırları.
4. **YAY-04:** Private vulnerability reporting'i aç.
5. **YAY-06:** Sahne işi süre bütçesi (+ `timeout-minutes: 45`) ve "main CI başarısız, yayın yok" bildirim işi.
6. **YAY-07:** Eski kullanıcı adını boş bir hesapla tut; `OLD_OWNER` kalıbını genişlet.
7. **YAY-09:** Doğrulama komutuna `--signer-workflow` ve `--source-ref`.
8. **YAY-11 / YAY-12:** `package-manager-cache: false`; zizmor'u çevrimiçi çalıştır.
9. **YAY-05:** Kod imzası başvurusu (Faz 4'ü beklemeden SignPath başvurusu açılabilir).
10. **YAY-08 / YAY-10:** `.nvmrc` ve runner sürümünü sabitle; elle yayında CI sonucunu denetle.
