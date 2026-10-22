# Yayın (CI, test sürümü yayın hattı, tedarik zinciri) — bağımsız denetim raporu (Faz 0)

Denetçi alanı: YAYIN · Bulgu öneki: `YAY-` · Denetlenen commit: `94bc3d6` (`main`, sürüm 0.0.56) · Tarih: 22 Ekim 2026

## 1. Özet

- **Puan: 5/10.** Hattın temel hijyeni iyi: eylemler SHA ile sabit ve doğrulandı, izinler en az düzeyde,
  `checkout` kimlik bilgisi bırakmıyor, yayın CI'yi bekliyor, kilit dosyaları zorunlu. Ama **yayın kapısının ana
  güvenlik varsayımı yanlış**: `workflow_run` + `branches: [main]` süzgeci, fork'tan `main` adlı daldan açılan bir
  PR'ı da "main" sayıyor. Bu yüzden birleşmemiş, incelenmemiş dış kod resmi sabit linke yayımlanabilir.
- **Kritik (YAY-01):** Fork'un `main` dalından açılan PR'ın CI'si yeşil biterse `Test sürümü` iş akışı o PR'ın
  commit'ini Windows'ta derler, `test-surumu` etiketini o commit'e taşır ve `Lyraska-Kurulum.exe`'yi değiştirir.
  `if:` koşulunda olay türü (`event`) ya da kaynak depo (`head_repository`) denetimi yok.
- **Yüksek (YAY-02):** Resmi kurulum dosyası, önceki çalıştırmalardan geri yüklenen Rust derleme önbelleğiyle
  (`Swatinem/rust-cache`, `target/` dahil) derleniyor. Önek eşleşmesiyle geri yükleme yapıldığı için bir kez zehirlenen
  önbellek sonraki resmi derlemelere de sızar (YAY-01 bunun kapısıdır).
- **Orta:** Programda gösterilen "derleme kodu" `GITHUB_SHA`'dan geliyor. `workflow_run` olayında bu değişken
  derlenen commit'i değil, varsayılan dalın son commit'ini gösterir (GitHub belgesi ve bu deponun kendi
  çalıştırmasıyla kanıtlandı, YAY-03). `main` korumasız. CI'nin Windows işi `main`'de çalışmıyor (YAY-04).
  Provenance ya da imza yok (YAY-05). Sabit link eski hesap adıyla yazılmış ve yönlendirmeye dayanıyor (YAY-06).
- **Temiz:** 7 üçüncü taraf eylemin SHA'sı gerçek etiketlerle eşleşiyor. `cargo deny` (advisories, licenses,
  bans, sources) yeşil. Lisans ve bildirim kapıları mutasyonla kırmızıya döndü. Release notundaki SHA-256 değeri
  GitHub'ın verdiği asset özetiyle aynı. Birleşen 60 PR'ın hepsinde son commit'in CI'si yeşil.
- En hızlı ve en etkili düzeltme tek satırdır: `derle` işinin `if:` koşuluna
  `github.event.workflow_run.event == 'push' && github.event.workflow_run.head_repository.full_name == github.repository`
  eklenir. Yayın derlemesinden önbellek kaldırılır.

## 2. Kapsam ve yöntem

**Okunan dosyalar:** `.github/workflows/ci.yml`, `.github/workflows/test-surumu.yml`, `src-tauri/build.rs`,
`src-tauri/Cargo.toml`, `src-tauri/deny.toml`, `package.json`, `scripts/third-party-notices.mjs` (üretim ve
karşılaştırma kısmı), `README.md`, `CLAUDE.md`, `src-tauri/tauri.conf.json`, `.github/ISSUE_TEMPLATE/*`,
`src-tauri/.cargo/config.toml`, `src-tauri/src/commands.rs:50-66` (derleme kodunun gösterildiği yer).
Yalıtım kurallarına uyuldu: `docs/DENETIM*`, `docs/denetim-2/`, `docs/devlog/` ve issue/PR yorumları okunmadı.
Koddaki yorumlarda geçen "DENETIM.md C1", "YAY-03", "YAY-11" gibi kodlar kanıt sayılmadı.

**Çalıştırılan komutlar ve deneyler** (çıktılar bu klasörde):

| Deney                                                                                   | Sonuç / dosya                                                                                          |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `git remote -v`                                                                         | `origin https://github.com/lahmacunveayran/Lyraska`                                                    |
| `curl -sSI` ile iki sabit link (yalnızca başlık)                                        | `link-basliklari.txt`: eski ad **301** ile yeni ada, yeni ad 302 ile asset'e gidiyor                   |
| `gh api` (yalnızca okuma, herkese açık): repo, release, branch, rules, runs, pulls      | `runs.tsv` (326 çalıştırma), `merged.tsv`                                                              |
| Test sürümü çalıştırmalarını tetikleyen CI çalıştırmalarıyla eşleştirme (`eslestir.py`) | `eslestirme.txt`: bir çalıştırmada `GITHUB_SHA` ≠ tetikleyen commit                                    |
| `git ls-remote` ile 7 eylem SHA'sının upstream etiketleri                               | hepsi eşleşiyor (ayrıntı §5)                                                                           |
| GitHub Docs kaynağı (`github/docs`, raw)                                                | `belgeler/events.md`, `secure-use.md`, `specifying-branches.md`, `workflow-run-permissions-warning.md` |
| `zizmor 1.31.1 --offline --persona=auditor` (ayrı venv'de)                              | `zizmor.txt`: `error[dangerous-triggers]` test-surumu.yml:13                                           |
| Kopyada `cargo deny check advisories` / `licenses bans sources`                         | `advisories ok` · `bans ok, licenses ok, sources ok`                                                   |
| Mutasyon: `deny.toml`'dan `"MIT"` çıkarıldı                                             | `licenses FAILED`, çıkış kodu 4 (kapı gerçek)                                                          |
| Mutasyon: `UCUNCU-TARAF.txt`'de bir paket adı bozuldu                                   | `--check` çıkış kodu 1 (`mutasyon-notices.log`; kapı gerçek)                                           |
| `strings` ile `@tauri-apps/cli` 2.12.1                                                  | NSIS eklentisi URL'si SHA-1 ile birlikte gömülü; WebView2 önyükleyicisi `go.microsoft.com/fwlink`      |

**Sınırlar:**

- Ajan vekil sunucusu `api.github.com/users/*`, `github.com/<kullanıcı>` ve `docs.github.com` adreslerine izin
  vermedi. Eski kullanıcı adının (`gozlemesevdalisi`) bugün kimde olduğu doğrulanamadı.
- Depo ayarları yönetici yetkisi isteyen alanlarda okunamadı: fork PR onay politikası, Actions izinleri, trafik.
- Fork'tan PR açarak gerçek bir saldırı denemesi yapılmadı (yasak ve gereksiz). YAY-01, belge, deponun kendi
  çalıştırma verisi ve kod okumasıyla kanıtlanmıştır.
- Hiçbir Actions iş akışı tetiklenmedi. Depoya yazılmadı.

## 3. Bulgular

### YAY-01 — Fork'tan `main` adlı daldan açılan PR, resmi test sürümünü değiştirebilir

- **Önem:** Kritik · **Güven:** Yüksek (zincirin her halkası belgeyle ya da veriyle doğrulandı; son adım GitHub
  ayarına bağlı) · **Standart:** GitHub "Secure use: Mitigating the risks of untrusted code checkout"; GitHub Security
  Lab "Preventing pwn requests"; OpenSSF Scorecard **Dangerous-Workflow**; SLSA v1.0 Source/Build bütünlüğü
- **Yer:** `.github/workflows/test-surumu.yml:12-16`, `:35`, `:44-53`, `:135-166`
- **Kanıt:**
  ```yaml
  # test-surumu.yml:12-16
  on:
    workflow_run:
      workflows: [CI]
      types: [completed]
      branches: [main]
  # :35
      if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'
  # :48  →  :52
          HEAD_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}
          ref: ${{ steps.kaynak.outputs.sha }}
  # :141 (yayinla, contents: write)
      gh api -X PATCH "repos/$GH_REPO/git/refs/tags/$RELEASE_TAG" -f sha="$SHA" -F force=true
  ```
  - `ci.yml:12` → `pull_request:` için dal süzgeci yok. Fork PR'ları da CI'yi çalıştırır.
  - GitHub belgesi (`belgeler/specifying-branches.md`): _"you can specify what branches the **triggering workflow
    must run on**"_. Süzgeç, tetikleyen çalıştırmanın `head_branch` değerine bakar. Bu değer yalnızca bir dal
    adıdır; hangi depodan geldiğini söylemez.
  - Bu deponun kendi verisi (`pr-head-branch-ornek.txt`): `pull_request` olayıyla çalışan CI'nin `head_branch`
    değeri PR'ın **kaynak dalının adıdır**, örneğin `39776341414 CI pull_request ccr-d3f9d699-drmntz`. Bu,
    `refs/pull/N/merge` değildir. Fork'tan `main` dalıyla açılan bir PR'da `head_branch` değeri `main` olur ve
    süzgeçten geçer.
  - GitHub belgesi (`belgeler/events.md:1152`): _"The workflow started by the `workflow_run` event is able to
    access secrets and write tokens, even if the previous workflow was not."_
  - `belgeler/secure-use.md:123`: _"Workflows that use these triggers must not explicitly check out untrusted code,
    including from pull request forks"_.
  - `zizmor`: `error[dangerous-triggers] … test-surumu.yml:13:3 workflow_run is almost always used insecurely`.
    `ref:` değeri ara bir adım çıktısından geldiği için (`steps.kaynak.outputs.sha`) statik tarayıcılar
    "güvenilmeyen checkout" desenini doğrudan görmüyor.
- **Senaryo ve etki:** Saldırgan depoyu fork'lar ve kendi fork'unun `main` dalına (fork'ların varsayılan dalı
  zaten budur) bir değişiklik koyar. PR'da `ci.yml`'yi de değiştirebilir. `pull_request` olayı iş akışı dosyasını
  PR'ın kendi commit'inden okur, bu yüzden adı "CI" olan ve her zaman yeşil biten bir iş akışı yeterlidir. CI
  `success` biter. `Test sürümü` tetiklenir. `derle` işi saldırganın commit'ini çıkarır ve `npm ci` ile
  `tauri build` çalıştırır; bu sırada saldırganın `build.rs` dosyası ve npm betikleri de çalışır. Ardından
  `yayinla` işi (`contents: write`) `test-surumu` etiketini bu commit'e taşır ve
  `https://github.com/…/releases/download/test-surumu/Lyraska-Kurulum.exe` linkindeki dosyayı saldırganın
  derlediğiyle değiştirir. Release notu kullanıcıya SmartScreen uyarısında "Yine de çalıştır"a basmasını söyler.
  CLAUDE.md her oturumun proje sahibine bu linki vermesini istediği için ilk kurban proje sahibidir. Kötü niyet
  bile gerekmez: fork'unun `main`'inden iyi niyetli bir PR açan herhangi bir katkıcı, incelenmemiş ve
  birleşmemiş kodunu resmi linke yayımlamış olur.
- **Çürütme denemesi:**
  1. _"Fork PR'ları onaysız çalışmaz."_ GitHub belgesi: _"By default, all first-time contributors require
     approval"_. Bu varsayılan, saldırıya bir insan adımı ekler: sahibin "Approve and run" düğmesine basması.
     Ya da saldırganın daha önce birleşmiş bir PR'ı olması gerekir (ilk katkıcı olmaktan çıkmak için tek bir yazım
     düzeltmesi yeter). Aynı belge onay politikasının güvenlik değil kaynak tüketimi amaçlı olduğunu yazar. Proje
     sahibi yazılımcı değildir ve PR'ları yapay zekâ oturumları birleştirir. Önem bu yüzden düşürülmedi. Ama
     saldırı otomatik değildir, bir onay ya da önceki bir katkı gerektirir. Depo ayarı okunamadı.
  2. _"`branches: [main]` belki depo da denetliyordur."_ Belgede depo nitelendirmesi yok. Verideki `head_branch`
     alanı depo bilgisi taşımıyor; depo ayrı bir alan olan `head_repository` içinde.
  3. _"Etiket API'si fork commit'ini reddedebilir."_ Fork PR commit'leri taban depoda `refs/pull/N/head`
     altında tutulur ve nesne depoda vardır. Bunu yazma yetkisi olmadan doğrulayamadım (**Olası**). Reddedilse
     bile `set -euo pipefail` adımı keser ve exe değişmez. Ancak `derle` işindeki kod yürütmesi yine olur ve
     YAY-02'deki önbellek zehirlenmesi yolu açık kalır.
  4. _"`derle` işinin yazma izni yok."_ Doğru (`contents: read`). Ama derlenen exe'nin kendisi saldırganın
     elindedir ve yazma işini yapan `yayinla` o exe'yi körü körüne yayımlar.
- **Öneri:** `test-surumu.yml:35` şöyle olmalı:
  ```yaml
  if: >-
    github.event_name == 'workflow_dispatch' ||
    (github.event.workflow_run.conclusion == 'success' &&
     github.event.workflow_run.event == 'push' &&
     github.event.workflow_run.head_repository.full_name == github.repository &&
     github.event.workflow_run.head_branch == 'main')
  ```
  Ek olarak `yayinla` işinde, yazmadan önce `gh api repos/$GH_REPO/compare/$SHA...main` ile `$SHA` değerinin
  `main` geçmişinde olduğu doğrulanmalı. Daha basit bir seçenek de var: tetikleyici `push: branches: [main]`
  yapılır ve CI aynı iş akışında `needs:` ile beklenir.

### YAY-02 — Resmi kurulum dosyası doğrulanmamış derleme önbelleğiyle derleniyor (önbellek zehirlenmesi kalıcılığı)

- **Önem:** Yüksek · **Güven:** Yüksek (eylem kaynağıyla doğrulandı; sömürü YAY-01 ya da başka bir kod yürütmesi
  gerektirir) · **Standart:** GitHub "Secure use" (_"privileged … share the same cache of the main branch"_);
  SLSA v1.0 Build L3 (yalıtılmış derleme: önceki derlemeler sonrakini etkilememeli); Scorecard Dangerous-Workflow
- **Yer:** `.github/workflows/test-surumu.yml:54-63` (`setup-node cache: npm`, `Swatinem/rust-cache`)
- **Kanıt:** `rust-cache@6323deb…` (v2.9.2) kaynağı:
  - `src/config.ts:133`: `self.restoreKey = key;` (Cargo.lock özeti eklenmeden önceki önek)
  - `src/config.ts:260`: `key += \`-${lockHash}\``
  - `src/restore.ts:41`: `restoreCache(paths, key, [config.restoreKey])`. Tam anahtar bulunamazsa aynı önekle
    kaydedilmiş en yeni girdi geri yüklenir.
  - `action.yml:47-50`: `save-if` varsayılanı `"true"`. `derle` işi her çalıştırmada `target/` ve
    `~/.cargo/registry` klasörlerini varsayılan dal kapsamına kaydeder.
- **Senaryo ve etki:** `derle` işinde bir kez kod çalıştıran biri (YAY-01 yoluyla ya da kötü niyetli bir
  `build.rs`/npm sürümüyle) farklı bir `Cargo.lock` özetiyle önbelleğe değiştirilmiş bağımlılık nesneleri
  (`.rlib`) kaydedebilir. Sonraki meşru `main` derlemesinde `Cargo.lock` değişmişse (her bağımlılık güncellemesinde
  olur) tam anahtar bulunamaz, önekle eşleşen zehirli girdi geri yüklenir ve cargo bu bağımlılıkları parmak izi
  eşleştiği için yeniden derlemez. Sonuçta zehirli kod, sonraki **meşru** resmi kurulum dosyalarına da girer.
  YAY-01 kapatılsa bile kayıtlı zehirli girdi silinene kadar kalır. npm önbelleği daha az risklidir, çünkü `npm ci`
  her paketi `package-lock.json` içindeki `integrity` özetiyle doğrular.
- **Çürütme denemesi:** PR'lardan gelen önbellekler `refs/pull/N/merge` kapsamındadır ve `main` kapsamına
  geçmez. Bu doğru, ama `workflow_run` işleri varsayılan dal kapsamında çalışır (belge, `secure-use.md:111`).
  `cekirdek` işinin önbelleği Linux'ta oluşur ve anahtarında işletim sistemi bulunduğu için Windows'taki `derle`
  işine karışmaz. Yani bugün tek yol `derle` işinin kendisidir. YAY-01 kapatılırsa risk büyük ölçüde düşer.
  Yine de yayın derlemesinin önbelleksiz olması SLSA'nın beklentisidir.
- **Öneri:** `test-surumu.yml` içinde `Swatinem/rust-cache` adımı kaldırılmalı. Bu, yaklaşık 5–10 dakika ek süre
  getirir; hız gerekiyorsa `save-if: false` ile yalnızca okuma yapılabilir. `setup-node` adımındaki
  `cache: npm` satırı da kaldırılabilir. Önbellek yalnızca CI işlerinde kalsın.

### YAY-03 — Programdaki "derleme kodu" derlenen commit'i göstermeyebilir (`GITHUB_SHA`)

- **Önem:** Orta · **Güven:** Kanıtlandı (GitHub davranışı bu deponun çalıştırmasıyla), Kesin (kod) ·
  **Standart:** SLSA v1.0 provenance (kaynak→ikili izlenebilirliği); ISO/IEC 25010 izlenebilirlik
- **Yer:** `src-tauri/build.rs:5-12`; `src-tauri/src/commands.rs:66`; `test-surumu.yml:48-52`
- **Kanıt:**
  ```rust
  let commit = std::env::var("GITHUB_SHA") ... .or_else(git_short_sha)   // build.rs:5-9
  ```
  - GitHub belgesi (`belgeler/events.md:1145`): `workflow_run` için `GITHUB_SHA` = **"Last commit on default
    branch"**. `pull_request` için (`:462`, `:473`) = **"Last merge commit"**, yani dalda bulunmayan ve geçici olan
    `refs/pull/N/merge` commit'i.
  - Bu deponun kendi verisi (`eslestirme.txt`): `Test sürümü` çalıştırması 39760889873'ün `head_sha`
    (`GITHUB_SHA`) değeri `9bfaacc`. Onu tetikleyen CI çalıştırması 39760371079 ise `2192148` commit'i içindi
    (iptal oldu, 2 sn önce bitti). Yani `workflow_run` işinde `GITHUB_SHA`, tetikleyen commit değil, o anki
    `main` ucudur. O CI başarıyla bitmiş olsaydı `derle` `2192148`'i derleyecek, program ise `9bfaacc`
    yazacaktı. Release notu (`HEAD_SHA` değerinden) yine `2192148` diyecekti.
- **Senaryo ve etki:** (a) Hata kaydında kullanıcının yazdığı kod yanlış commit'i gösterir ve hata ayıklama
  boşa gider. `push` sırasında CI'nin `cancel-in-progress` ayarı bu pencereyi daraltır, ama bir CI bittikten
  hemen sonra yeni bir push gelirse açıktır. (b) YAY-01 saldırısında program, kötü niyetli derlemede **meşru**
  `main` commit'ini gösterir ve saldırıyı gizler. (c) PR kurulum dosyalarında görünen kod, sonradan
  bulunamayan bir birleştirme commit'idir.
- **Öneri:** `build.rs` önce `git rev-parse --short=7 HEAD` değerini kullanmalı (her iki iş akışında da
  `checkout` derlenen commit'i çıkarır) ya da özel bir değişken okumalı, örneğin `LYRASKA_COMMIT`. Bu değişken
  `test-surumu.yml` içinde `steps.kaynak.outputs.sha`, `ci.yml` içinde de
  `github.event.pull_request.head.sha || github.sha` ile verilir. `GITHUB_*` adlı değişkenlerin üzerine
  yazılamaz, bu yüzden yeni bir ad gerekir.

### YAY-04 — `main` korumasız. Yayınlanan Windows ikilisinin commit'i Windows'ta denetlenmiyor

- **Önem:** Orta · **Güven:** Kesin (API) / Yüksek (etki) · **Standart:** OpenSSF Scorecard **Branch-Protection**,
  **Code-Review**; SLSA Source L2/L3
- **Yer:** `ci.yml:9-13`, `ci.yml:175`; `test-surumu.yml:64-71`
- **Kanıt:**
  - `gh api repos/lahmacunveayran/Lyraska/branches/main` →
    `{"protected":false,"protection":{"enabled":false,"required_status_checks":{"checks":[],"contexts":[],"enforcement_level":"off"}}}`.
    `rules/branches/main` → `[]`. `rulesets` → `[]`.
  - `ci.yml:175`: `if: github.event_name == 'pull_request' || github.event_name == 'workflow_dispatch'`. Windows
    clippy, Windows testleri ve `ses_denemesi` `main` push'unda **çalışmaz**. `test-surumu.yml` hiç test
    çalıştırmaz, yalnızca `tauri build` yapar.
  - CLAUDE.md'deki "PR'da CI yeşil olmadan birleştirme yapılmaz" kuralına uyulmuş: birleşen 60 PR'ın son
    commit'inde CI `success` (`merged.tsv` ile `runs.tsv` eşleştirmesi). Ama bu kural GitHub tarafından
    zorlanmıyor.
- **Senaryo ve etki:** Yazma yetkisi olan bir yapay zekâ oturumu ya da sahibin kendisi, (a) Windows işi kırmızı
  bir PR'ı birleştirir ya da (b) doğrudan `main`'e push eder. `main` CI'si Linux işleri yeşil olduğu için yeşil
  biter. WASAPI gibi yalnızca Windows'ta derlenen kod hiç denenmeden sabit linke çıkar. Squash birleştirme
  commit'i, PR'da denetlenen birleştirme ağacıyla aynı olmak zorunda da değildir ("up to date" zorunluluğu yok).
  Ele geçirilmiş bir oturum anahtarı da incelemesiz `main`'e yazabilir.
- **Öneri:** GitHub'da _Settings → Rules → Rulesets_ altında `main` için bir kural seti: PR zorunlu, gerekli
  durum denetimleri (CI'nin bütün işleri, "Windows kurulum dosyası" dahil), "Require branches to be up to date",
  force-push yasak. Ya da `ci.yml:175` koşuluna `|| github.event_name == 'push'` eklenip Windows işi `main`'de de
  çalıştırılır; `test-surumu` yalnızca ancak bu işin de yeşil olduğu bir CI'den sonra çalışır.

### YAY-05 — Kaynak→ikili izlenebilirliği yalnızca aynı hattın yazdığı nota dayanıyor (provenance yok, imza yok)

- **Önem:** Orta · **Güven:** Kesin · **Standart:** SLSA v1.0 Build L1–L2 (provenance yok, yani L0); OpenSSF
  Scorecard **Signed-Releases**; GPL-3.0 §6 (kaynak sunumu burada karşılanıyor, bkz. §5)
- **Yer:** `test-surumu.yml:113-134` (not), `:31-94` (attest adımı yok); `tauri.conf.json` (imza ayarı yok)
- **Kanıt:** İş akışında `actions/attest-build-provenance` ya da `id-token: write` yok. Release notundaki
  `SHA-256 … c7bccaf5…` değeri, asset'in GitHub `digest` alanıyla (`sha256:c7bccaf5…`) aynı. Bu tutarlılığı
  gösterir, ama iki değer de aynı yazma yetkisiyle üretiliyor ve not sonradan düzenlenebilir. Not
  `test-surumu.yml:131-132` kullanıcıya SmartScreen'i aşmayı öğretiyor: "Ek bilgi → Yine de çalıştır". Etiket
  her yayında zorla taşınıyor (`:141`); eski ikililer ve onların notları kayboluyor.
- **Senaryo ve etki:** YAY-01 ya da YAY-06 yoluyla gelen sahte bir exe ile resmi exe'yi kullanıcı ayırt edemez.
  "Bilinmeyen yayımcı" uyarısı her sürümde çıktığı için kullanıcı uyarıyı geçmeye alışmıştır. Sahibin "bu exe
  gerçekten şu commit'ten mi?" diye sorabileceği bağımsız bir doğrulama yok.
- **Öneri:** `derle` işine `permissions: { id-token: write, attestations: write }` ve upload adımından önce
  `actions/attest-build-provenance` eklenmeli (SHA ile sabitlenerek). Böylece GitHub'ın imzaladığı SLSA
  provenance oluşur ve `gh attestation verify Lyraska-Kurulum.exe -R lahmacunveayran/Lyraska` ile doğrulanabilir.
  Kod imzalaması (Faz 4) yol haritasında; o zamana kadar notta "SHA-256'yı ve attestation'ı kontrol edin"
  satırı yer almalı.

### YAY-06 — Sabit link ve bütün belgeler eski hesap adını kullanıyor; güvenlik GitHub yönlendirmesine bağlı

- **Önem:** Orta · **Güven:** Kanıtlandı (yönlendirme) / Olası (istismar edilebilirlik) · **Standart:** GitHub
  "Username changes" / "Transferring a repository" (repojacking); OpenSSF yazılım tedarik zinciri
- **Yer:** `CLAUDE.md:17,21`, `README.md:39`, `docs/DOGRULAMA.md:12`, `test-surumu.yml:3`, `src-tauri/Cargo.toml:7`,
  `scripts/third-party-notices.mjs:169` → `public/lisanslar/UCUNCU-TARAF.txt:3`,
  `src/components/SettingsPanel.tsx:210` (programdaki GPL kaynak linki), `docs/ROADMAP.md` (issue linkleri)
- **Kanıt:**
  ```
  $ curl -sSI https://github.com/gozlemesevdalisi/Lyraska/releases/download/test-surumu/Lyraska-Kurulum.exe
  HTTP/1.1 301 Moved Permanently
  Location: https://github.com/lahmacunveayran/Lyraska/releases/download/test-surumu/Lyraska-Kurulum.exe
  ```
  `git remote -v` → `lahmacunveayran/Lyraska`. Commit yazarları aynı e-postayla 14 Ekim'e kadar
  `gozlemesevdalisi`, 16 Ekim'den sonra `lahmacunveayran` adını taşıyor. Bu, aynı kişinin hesap adı değişikliğine
  ya da depoyu taşımasına işaret ediyor. GitHub belgesi: _"After changing your username, your old username becomes
  available for anyone else to claim"_ ve _"If the new owner of your old username creates a repository with the
  same name … your redirect will stop working."_
- **Senaryo ve etki:** Eski adı alan biri `Lyraska` adlı bir depo ve `test-surumu` Release'i açarsa, CLAUDE.md,
  README ve DOGRULAMA'daki link onun exe'sini sunar. Her yapay zekâ oturumu bu linki sahibine "test linki" olarak
  verir. **Önemi düşüren etken:** GitHub, adı değiştirilen ya da taşınan bir depo değişiklikten önceki hafta 100'den
  fazla klon ya da Actions kullanımı aldıysa `ESKİ-AD/DEPO` birleşimini kalıcı olarak emekliye ayırır. `runs.tsv`
  verisine göre 7–14 Ekim haftasında 157 iş akışı çalıştırması (her biri 1–5 checkout) var. Emeklilik büyük
  olasılıkla uygulanmıştır. Bu yüzden önem Yüksek değil Orta. Kullanıcı adının bugün kimde olduğu vekil sunucu
  yüzünden doğrulanamadı.
- **Öneri:** Bütün linkler `lahmacunveayran/Lyraska` olarak güncellenmeli (`git grep -l gozlemesevdalisi`; 10
  dosya). Ardından `npm run notices` yeniden çalıştırılmalı. `tauri.conf.json` içindeki `identifier` **değiştirilmemeli**:
  kullanıcı veri klasörü buna bağlıdır. Sahip, eski kullanıcı adını boş bir hesapla kendi elinde tutmayı
  düşünebilir.

### YAY-07 — Bağımlılık güncelleme otomasyonu, zamanlanmış güvenlik taraması ve güvenlik politikası yok

- **Önem:** Düşük · **Güven:** Kesin · **Standart:** OpenSSF Scorecard **Dependency-Update-Tool**, **Vulnerabilities**,
  **Security-Policy**
- **Yer:** `.github/` (yalnızca `ISSUE_TEMPLATE/` ve `workflows/` var); `ci.yml:9-13` (`schedule:` yok)
- **Kanıt:** `git ls-files | grep -iE "dependabot|renovate|codeowners|security\.md"` → boş. Repo API'si:
  `"dependabot_security_updates":{"status":"disabled"}`.
- **Senaryo ve etki:** Program güvenilmeyen ses dosyalarını ayrıştırır (`symphonia`). Bu crate için bir RustSec
  uyarısı yayımlanırsa, CI ancak bir sonraki push'ta kırmızıya döner. Push olmayan günlerde sabit linkteki açıklı
  sürüm sessizce dağıtılmaya devam eder. Güvenlik açığını bildirmek isteyen biri için özel bir kanal yok; tek yol
  herkese açık issue formu.
- **Öneri:** `.github/dependabot.yml` dosyası (`cargo` `/src-tauri`, `npm` `/`, `github-actions` `/`; haftalık;
  eylemler SHA ile). `ci.yml` dosyasına `schedule: - cron: "17 5 * * *"` eklenip yalnızca `guvenlik` işi
  çalıştırılır. Kısa bir `SECURITY.md` dosyası eklenir ve GitHub'ın "Private vulnerability reporting" özelliği açılır.

### YAY-08 — `workflow_dispatch` ve "Re-run" ile CI kapısı atlanarak herhangi bir dal ya da eski sürüm yayımlanabilir

- **Önem:** Düşük · **Güven:** Kesin · **Standart:** SLSA Source (yalnızca korumalı daldan yayın); GitHub Actions
  sertleştirme
- **Yer:** `test-surumu.yml:17`, `:35`, `:48`
- **Kanıt:** `if: github.event_name == 'workflow_dispatch' || …` koşulu elle başlatmada hiçbir şeyi denetlemiyor.
  `HEAD_SHA: … || github.sha` değeri elle başlatmada seçilen dalın ucu. İş akışı dosyası da o daldan okunur.
  Eski bir `Test sürümü` çalıştırmasının "Re-run" ile yeniden çalıştırılması aynı olay verisiyle eski `head_sha`
  değerini yeniden yayımlar (sürüm geri gider).
- **Senaryo ve etki:** Yazma yetkisi olan biri, örneğin `actions: write` yetkili bir yapay zekâ oturumu ya da
  yanlış düğmeye basan sahip, kırmızı ya da incelenmemiş bir dalı ya da eski bir sürümü sabit linke gönderebilir.
  Yetki zaten yazma düzeyinde olduğu için önem düşük. Ama yorumdaki "kırmızı ya da sınanmamış bir main sabit linke
  düşmez" sözü bu yol için geçerli değil.
- **Öneri:** `derle` koşuluna `github.event_name != 'workflow_dispatch' || github.ref == 'refs/heads/main'`
  eklenmeli. `yayinla` işinde `$SHA` değerinin `main` ucuna eşit ya da onun atası olduğu (`compare` API'si)
  doğrulanmalı. Gerekirse yayın bir `environment` korumasına (onaylayıcı) bağlanmalı.

### YAY-09 — Araç zinciri sabitlemesinde boşluklar (Node, runner imajı, Rust sürümünün iki kopyası, MSRV)

- **Önem:** Düşük · **Güven:** Kesin · **Standart:** SLSA (yeniden üretilebilirlik, tavsiye); Scorecard
  **Pinned-Dependencies**
- **Yer:** `ci.yml:24` (`RUST_TOOLCHAIN: 1.97.0`) ve `test-surumu.yml:60` (`toolchain: 1.97.0`, ayrı ve elle
  yazılmış kopya); `node-version: 22` (7 yerde); `runs-on: windows-latest`/`ubuntu-latest`; depoda
  `rust-toolchain.toml` ve `.nvmrc` yok; `Cargo.toml:10` `rust-version = "1.85"` CI'da denenmiyor; README
  "Rust (stable)" diyor.
- **Senaryo ve etki:** Biri CI'deki Rust sürümünü yükseltip `test-surumu.yml`'yi unutursa, yayın ikilisi CI'de
  sınananla farklı bir derleyiciyle derlenir. Node 22'nin yeni bir ara sürümü ya da `windows-latest` imajının
  değişmesi (MSVC ve NSIS ortamı), kaynak kodu aynı olsa da farklı ikili üretir. Ayrıca yapay zekâ oturumlarının
  yerel derlemesi sürüm dosyasıyla sabitlenmemiş.
- **Öneri:** Depo kökünde `rust-toolchain.toml` dosyası (`channel = "1.97.0"`, `components = ["rustfmt","clippy"]`).
  İki iş akışı bu dosyayı okur, sürüm tek yerde durur. `.nvmrc` içine tam Node sürümü yazılır ve
  `node-version-file: .nvmrc` kullanılır. `windows-2025` gibi adlandırılmış bir imaj seçilir. Ya MSRV için bir
  CI işi eklenir ya da `rust-version` değeri 1.97 yapılır.

### YAY-10 — `npm audit` kurulum dosyasını üreten araçları kapsamıyor

- **Önem:** Düşük · **Güven:** Kesin · **Standart:** Scorecard **Vulnerabilities**; SLSA derleme platformu güvenliği
- **Yer:** `ci.yml:140`: `npm audit --omit=dev --audit-level=high`
- **Kanıt:** `package.json` içinde `@tauri-apps/cli` (NSIS paketini üretir ve WebView2 önyükleyicisini indirip
  gömer), `vite` (paketlenen `dist/` klasörünü üretir) ve `typescript` **devDependencies** altında. `--omit=dev`
  bunları dışarıda bırakıyor. `moderate` düzeyindeki uyarılar hiç kırmızı yapmıyor.
- **Senaryo ve etki:** Derleme aracındaki bir açık (ör. vite eklentisi ya da tauri-cli indirme doğrulaması)
  pakete giren kodu etkileyebilir ama CI'de görünmez. Bu araçlar yalnızca CI makinesinde çalıştığı için önem düşük.
- **Öneri:** Bloklayan adım aynen kalsın; yanına `npm audit --audit-level=high` (dev dahil) bilgi amaçlı ve
  `continue-on-error: true` ile ya da yalnızca zamanlanmış işte eklenebilir.

### YAY-11 — README sözleri kodla uyuşmuyor (veri klasörü, "CI ile aynı denetimler" listesi)

- **Önem:** Düşük · **Güven:** Kesin · **Standart:** ISO/IEC 25010 bakım kolaylığı; Windows uygulama veri klasörü kuralları
- **Yer:** `README.md:48-49`, `README.md:76-83` (aynı hata `docs/MIMARI.md:214-215` içinde de var)
- **Kanıt:** README `%APPDATA%\com.lyraska.app` diyor. `tauri.conf.json:5` ise
  `"identifier": "io.github.gozlemesevdalisi.lyraska"`, ve `lib.rs:37-38` `app_data_dir()`/`app_local_data_dir()`
  kullanıyor, yani klasör `…\io.github.gozlemesevdalisi.lyraska`. `git log -S` çıktısına göre identifier hep böyle
  olmuş. `docs/DOGRULAMA.md:31` doğru yolu yazıyor. "Checks (the same ones CI runs)" listesinde `check:scenes`,
  `npm audit`, ts-rs bağlama denetimi ve Windows clippy yok.
- **Senaryo ve etki:** README'deki yolu izleyen kullanıcı veriyi bulamaz ve "silinebilir" dediği klasör yoktur.
  CI kapsamını README'den öğrenen kişi eksik bilgi alır.
- **Öneri:** README ve MIMARI'deki iki yol düzeltilmeli. Denetim listesine eksik üç satır eklenmeli ya da "CI'nın
  tam listesi: `.github/workflows/ci.yml`" denmeli.

### YAY-12 — Release yenileme adımı bölünmez değil: not ve etiket, dosyadan önce değişiyor

- **Önem:** Düşük · **Güven:** Kesin · **Standart:** ISO/IEC 25010 güvenilirlik
- **Yer:** `test-surumu.yml:140-166`
- **Kanıt:** Sıra şöyle: etiket taşınır (`:141`), not ve yeni SHA-256 yazılır (`:150`), en son dosya yüklenir
  (`:156`). Yükleme ya da yeniden adlandırma (`:166`) başarısız olursa not ve etiket yeni commit'i ve yeni özeti
  gösterir, linkte ise eski exe kalır. Silme döngüsünden sonra yeniden adlandırma başarısız olursa link 404 verir.
- **Senaryo ve etki:** Kullanıcı nottaki SHA-256 ile dosyayı karşılaştırırsa uyuşmazlık görür. Sahibe yanlış
  sürüm bilgisi gider. Ağ hatası nadir olduğu için önem düşük.
- **Öneri:** Sıra değişmeli: önce geçici adla yükleme, sonra eski dosyayı silme ve yeniden adlandırma, en son
  etiket ve not. `yayinla` başarısız olursa bir `if: failure()` adımı durumu iş akışı özetine yazmalı.

### YAY-13 — `cargo-deny-action` Docker imajı sabitlenmemiş indirmeler yapıyor

- **Önem:** Bilgi · **Güven:** Kesin · **Standart:** Scorecard **Pinned-Dependencies**
- **Yer:** `ci.yml:108`, `:131` (`EmbarkStudios/cargo-deny-action@3c63498…`)
- **Kanıt:** Eylemin `Dockerfile` dosyası (aynı SHA): taban imaj özetle sabit
  (`rust:1.85.0-alpine3.20@sha256:f0ce…`), ama `apk update; apk add …` sürümsüz ve
  `curl … cargo-deny-0.20.2-…tar.gz | tar -xz` sağlama özeti doğrulamadan indiriliyor.
- **Senaryo ve etki:** Eylemin SHA'sı sabit olsa da çalışan araç her CI'de yeniden indiriliyor. Bu işler yalnızca
  `contents: read` yetkisiyle çalışıyor ve yayına dokunmuyor. Etki, denetimin yanlış "yeşil" vermesiyle sınırlı.
- **Öneri:** Kabul edilebilir. İstenirse `taiki-e/install-action` (özet doğrulamalı) ile `cargo-deny` kurulup
  doğrudan çalıştırılabilir.

## 4. Olası riskler (kanıtı yetmeyenler)

- **Fork commit'ine etiket taşınması:** YAY-01'in son adımı (`git/refs` PATCH ile fork commit'i). GitHub fork PR
  nesnelerini taban depoda tuttuğu için büyük olasılıkla kabul edilir. Yazma yetkisi olmadan sınanamadı.
- **Derleme sırasında yapılan indirmeler:** `@tauri-apps/cli` 2.12.1, NSIS eklentisini
  (`nsis_tauri_utils-v0.5.3`) SHA-1 özetiyle birlikte indiriyor (ikilide `…nsis_tauri_utils.dll75197FEE…`
  dizgesi var). WebView2 önyükleyicisi (`embedBootstrapper`) ise `go.microsoft.com/fwlink/p/?LinkId=2124703`
  adresinden derleme anında alınıyor; bunun için bir özet sabitlemesi göremedim. Microsoft imzalı bir dosya
  olduğundan risk düşük, ama yeniden üretilebilirliği bozar. Doğrulamak için tauri-bundler kaynağına bakmak gerekir.
- **Yapay zekâ oturumlarının GitHub yetkileri:** PR'ları sahibin hesabı adına yapay zekâ oturumları
  birleştiriyor (`lahmacunveayran` merge commit'leri). Oturum anahtarının `actions: write` ya da
  `administration` yetkisi taşıyıp taşımadığı görülemedi. Taşıyorsa YAY-04 ve YAY-08 riski artar.
- **PR kurulum dosyaları:** Fork PR'ları için de `Lyraska-Kurulum-PR` artifact'ı üretilir. Sosyal mühendislikle
  ("PR'ımın kurulum dosyasını dener misiniz?") sahibe sunulabilir. Bu bir kanal riskidir, kod hatası değildir.
- **"Gerçek ses aygıtıyla deneme" adımı:** `ci.yml:203-207`, barındırılan makinede her zaman "ATLANDI" der ve
  yeşil geçer. Yorum bunu açıkça yazıyor. Kalite kapısı değil, bilgi adımı.

## 5. Temiz bulunanlar

- **Eylem sabitleme gerçek:** `git ls-remote` ile doğrulandı. `actions/checkout fbc6f39…` = `v5`/`v5.1.0`;
  `actions/setup-node a0853c2…` = `v5`/`v5.0.0`; `dtolnay/rust-toolchain 683b588…` = `master`/`v1`;
  `Swatinem/rust-cache 6323deb…` = `v2.9.2` (yorumdaki "v2" etiketi artık daha yeni bir commit'te; bilgi notu);
  `EmbarkStudios/cargo-deny-action 3c63498…` = `v2.1.1`; `actions/upload-artifact ea165f8…` = `v4.6.2`;
  `actions/download-artifact d3f86a1…` = `v4.3.0`. Etiket yerine SHA, Scorecard Pinned-Dependencies'i geçer.
- **İzinler:** `ci.yml` üst düzeyde `contents: read`. `test-surumu.yml` üst düzeyde `permissions: {}`; `derle`
  `contents: read`, `yayinla` `contents: write` ve depo kodunu çalıştırmıyor. Bütün `checkout` adımları
  `persist-credentials: false`. Scorecard Token-Permissions açısından örnek düzeyde.
- **Komut enjeksiyonu yok:** Güvenilmeyen değerler (`head_sha`, `version`) `run:` içine `${{ }}` ile değil
  `env:` ile geçiyor (`test-surumu.yml:47-49`, `:74-75`, `:104-108`).
- **Kilit dosyaları zorunlu:** Her yerde `npm ci`. `cargo clippy/test/run --locked` kullanılıyor ve yayın
  derlemesi `tauri build -- --ci -- --locked` ile yapılıyor. `deny.toml`: `unknown-registry`/`unknown-git = "deny"`,
  `wildcards = "deny"`.
- **cargo-deny (kopyada):** `advisories ok`, `bans ok, licenses ok, sources ok`. Lisans kapısı mutasyonla
  kırmızıya döndü (`MIT` çıkarılınca `licenses FAILED`, çıkış kodu 4).
- **Üçüncü taraf bildirimleri:** `node scripts/third-party-notices.mjs --check` temiz depoda çıkış kodu 0,
  bir satır bozulunca çıkış kodu 1. Çıktı belirlenimci ve Windows hedefinin crate'lerini kapsıyor (323 benzersiz
  satır). GPL ve izin verici lisansların bildirim yükümlülüğü için doğru tasarım.
- **CI ile CLAUDE.md eşleşmesi:** "Push'tan önce temiz olmalı" listesindeki biçim, lint, tür, testler ve lisans
  denetiminin hepsi `ci.yml`'de var. Komut tablosundaki `check:audio`, `check:commands`, `check:notices`,
  `check:scenes`, ts-rs bağlama denetimi ve `cargo deny` de var. Tek fark Windows clippy'nin `main` push'unda
  çalışmaması (YAY-04).
- **CI disiplini pratikte iyi:** Birleşen 60 PR'ın son commit'inde CI `success`. `main` üzerinde PR dışı commit yok.
- **Yayın kapısı (push yolu):** Yayın yalnızca `conclusion == 'success'` olunca çalışıyor. İptal edilen CI'den
  gelen tetikleme `skipped` oldu (39760889873). Yayın sıraya giriyor (`cancel-in-progress: false`), en yenisi kazanıyor.
- **Bütünlük notu tutarlı:** Release notundaki SHA-256 (`c7bccaf5…`), GitHub asset `digest` alanıyla aynı. Yükleyen
  `github-actions[bot]`.
- **GPL-3.0 §6:** Etiket derlenen commit'e taşındığı için GitHub'ın kaynak arşivi o ikiliyle eşleşiyor. Not commit
  linkini veriyor ve program Ayarlar'da kaynak linkini gösteriyor (yönlendirme notu: YAY-06).
- **Sürüm eşitliği:** `package.json` ile `Cargo.toml` aynı (0.0.56). `tauri.conf.json` sürümü `../package.json`
  dosyasından okuyor. `test-surumu` dosya adını sürümle eşleştiriyor ve tam bir eşleşme bekliyor.
- **Hata ayıklama sembolleri:** `.pdb` dosyası pakete girmeden 90 gün saklanıyor ve exe küçük kalıyor.

## 6. Öncelikli düzeltme sırası

1. **YAY-01:** `test-surumu.yml:35` koşuluna `workflow_run.event == 'push'` ve
   `head_repository.full_name == github.repository` eklenmeli. `yayinla` işinde `$SHA` değerinin `main` geçmişinde
   olduğu denetlenmeli. Ardından Actions önbelleğinde `derle` işine ait girdiler bir kez silinmeli (zehirlenmiş
   olma ihtimaline karşı).
2. **YAY-02:** `test-surumu.yml` içindeki `rust-cache` (ve `cache: npm`) kaldırılmalı ya da `save-if: false`
   yapılmalı. Yayın derlemesi temiz başlamalı.
3. **YAY-04:** `main` için bir kural seti: PR zorunlu, CI'nin bütün işleri gerekli, "up to date" zorunlu,
   force-push yasak. Sahibe hangi sayfada hangi düğmeye basacağı yazılarak anlatılmalı.
4. **YAY-03:** `build.rs` derleme kodunu `git rev-parse HEAD` ya da açıkça verilen `LYRASKA_COMMIT`
   değişkeninden almalı, `GITHUB_SHA` kullanılmamalı.
5. **YAY-05:** `actions/attest-build-provenance` eklenmeli ve nota bir doğrulama satırı yazılmalı.
6. **YAY-06:** 10 dosyadaki `gozlemesevdalisi/Lyraska` linkleri güncellenmeli ve bildirimler yeniden üretilmeli
   (`identifier` aynı kalmalı).
7. **YAY-08:** Elle başlatmada yalnızca `refs/heads/main` kabul edilmeli.
8. **YAY-07:** `dependabot.yml`, günlük zamanlanmış `guvenlik` işi ve `SECURITY.md` eklenmeli; özel güvenlik
   bildirimi açılmalı.
9. **YAY-09:** `rust-toolchain.toml` ve `.nvmrc` eklenmeli; iş akışları sürümü buradan okumalı; runner imajı
   adlandırılmış bir imaj olmalı.
10. **YAY-11 / YAY-12:** README veri yolu ve denetim listesi düzeltilmeli; release adımlarının sırası değiştirilmeli.
