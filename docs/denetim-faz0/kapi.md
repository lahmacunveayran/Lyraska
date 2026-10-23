# KAPI (kalite kapılarının gerçekliği) — bağımsız denetim raporu (Faz 0)

Denetlenen: `/home/user/Lyraska`, commit `94bc3d6` (`main`, sürüm 0.0.56). Bütün deneyler kopyada
(`kapi/repo`) yapıldı; ana depoya yazılmadı, orada derleme yapılmadı.

## 1. Özet

- **Puan: 6/10** — kapıların çoğu gerçekten kapanıyor (84 mutasyonun ana sınıflarında kırmızı), ama yayın
  kapısı CI'yi atlayabiliyor, iki kapı (npm lisans, ses dosyası) yazılı politikadan dar, ESLint uyarıları
  CLAUDE.md'nin sözüne rağmen CI'yi kırmıyor.
- **Yüksek — KAP-01:** "Test sürümü" yayını yalnızca `workflow_run.conclusion == 'success'` ve `branches: [main]`
  süzgecine dayanıyor. Süzgeç tetikleyen çalıştırmanın **dal adına** bakar, deponun kendisine ya da olayın türüne
  bakmaz. Fork'taki `main` adlı bir daldan açılan PR'ın CI'si yeşil biterse o PR'ın kodu sabit indirme linkine
  yayımlanabilir. Ayrıca `workflow_dispatch` istenen herhangi bir dalda CI'siz yayın yapar (KAP-02).
- **Orta — KAP-03:** npm lisans kapısı bir **yasak listesi**. `GPL-2.0-only`, `(MIT OR Apache-2.0) AND BUSL-1.1`,
  `Proprietary`, `Elastic License 2.0`, boş lisans yeşil geçiyor. Rust tarafı (`deny.toml`) **izin listesi** ve
  aynı girdilerin hepsini reddediyor (mutasyonla gösterildi). İki taraf aynı politikayı uygulamıyor.
- **Orta — KAP-04:** `check:audio` yalnızca son commit'in dosya adlarına bakıyor. Geçmişe girip sonra silinen ses,
  izinli klasöre (`src-tauri/tests/data/`) konan gerçek şarkı ve 14 yaygın ses/kap uzantısı yeşil geçiyor.
- **Orta — KAP-05:** `npm run lint` uyarıda 0 ile çıkıyor (`--max-warnings 0` yok). `react-hooks/exhaustive-deps`
  "warn" düzeyinde. Eksik useEffect bağımlılığı CI'yi kırmıyor; CLAUDE.md ise "CI'da lint uyarıları hata sayılır"
  diyor.
- **Orta — KAP-06:** "Panik yok" kuralını Clippy yalnızca `panic!`/`unwrap`/`expect` için koruyor. İndeksleme,
  `unreachable!`, sıfıra bölme ve başka bir modüldeki `#[allow(unsafe_code)]` `-D warnings` altında yeşil
  geçiyor (küçük bir crate'te gösterildi).
- Sağlam bulunanlar: ts-rs bağlamalarının CI denetimi, `check:notices` (bağımlılık ekleme ve çıkarma kırmızı,
  dev bağımlılığı doğru biçimde yeşil), `cargo deny` izin listesi, `no-explicit-any`, `ban-ts-comment`,
  `rules-of-hooks`, `strict` tsc, CI'da `it.only` yasağı, "hiç test yok = kırmızı", Prettier kapsamı, SHA ile
  sabitlenmiş eylemler.

## 2. Kapsam ve yöntem

**Okunan dosyalar:** `.github/workflows/ci.yml`, `.github/workflows/test-surumu.yml`, `scripts/check-commands.mjs`,
`scripts/check-licenses.mjs`, `scripts/check-no-audio.mjs`, `scripts/third-party-notices.mjs`, `.gitignore`,
`.prettierignore`, `.prettierrc.json`, `eslint.config.js`, `tsconfig.json`, `vite.config.ts`, `package.json`,
`src-tauri/Cargo.toml`, `src-tauri/clippy.toml`, `src-tauri/deny.toml`, `src-tauri/.cargo/config.toml`,
`src/lib/backend.ts`, `src-tauri/src/commands.rs` (imzalar), `src-tauri/src/lib.rs` (`generate_handler!`),
`src-tauri/src/audio/output/wasapi.rs` (unsafe istisnası), `README.md` (denetim listesi), `docs/MIMARI.md`
(kural → kapı tablosu), `CLAUDE.md`. Yasaklı kaynaklar (DENETIM*.md, denetim-2/, devlog/) okunmadı.

**Yöntem:** kopya depo (`git clone` + `node_modules`). Mutasyonları `kapi/mut.sh` uyguladı: her mutasyondan önce ve
sonra `git checkout -- . && git clean`, sonra kapı komutu. Ham sonuçlar `kapi/mut-results.txt` dosyasında
(`kimlik|komut|çıkış kodu`). Ek deneyler:

- `kapi/lintdemo`: Cargo.toml'daki `[lints]` ve `clippy.toml`'un aynısıyla küçük bir crate; Clippy 1.97.0 ile.
- `cargo deny --offline check licenses` kopyada (cargo-deny 0.20.2).
- Tür bilgili ESLint ile geçici sayım: `no-floating-promises`, `no-misused-promises`.
- `lockmiss.cjs`: kilit dosyasında olup Linux'ta kurulmayan paketler.

**Sınırlar:**

- GitHub depo ayarları (dal koruması, zorunlu kontroller, fork PR onay politikası) okunamadı: API bu oturuma
  kapalı. KAP-01'in sömürülebilirliği bu ayarlara bağlı.
- GitHub Security Lab sayfaları vekil sunucuda 403 verdi. `workflow_run` belgesi `github/docs` deposundan okundu.
- `check:scenes` (Windows/Edge gerektirir) ve Rust tam derlemesi çalıştırılmadı; ts-rs adımı kod okumasıyla
  değerlendirildi.

## 3. Bulgular

### KAP-01 — Yayın kapısı fork'taki `main` dalına ve PR olayına karşı açık

- Önem: Yüksek · Güven: Yüksek (GitHub davranışına ve depo ayarına bağlı) · Standart: GitHub Security Lab
  `workflow_run` yazıları; GitHub Actions güvenlik sertleştirme belgesi; OpenSSF Scorecard
  "Dangerous-Workflow"; SLSA v1.0 Build L2/L3 (yayımlanan ikili, doğrulanmış kaynaktan gelmeli).
- Yer: `.github/workflows/test-surumu.yml:12-16`, `:35`, `:48`, `:52`; `.github/workflows/ci.yml:12`.
- Kanıt:

  ```yaml
  on:
    workflow_run:
      workflows: [CI]
      types: [completed]
      branches: [main]
  ...
  if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'
  ...
  HEAD_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}
  ```

  CI `pull_request` olayında da çalışıyor (`ci.yml:12`). Yayın işi
  `github.event.workflow_run.event == 'push'` ya da `github.event.workflow_run.head_repository.full_name ==
github.repository` koşulunu **hiç** denetlemiyor. GitHub belgesi (`events-that-trigger-workflows.md:1201`)
  `branches` süzgecini şöyle tanımlıyor: "what branches the triggering workflow must run on". PR'dan tetiklenen
  çalıştırmada bu dal, PR'ın **baş dalının adıdır** (fork'ta da). `derle` işi o SHA'yı checkout edip derliyor;
  `yayinla` işi `contents: write` ile sabit linke yüklüyor.

- Senaryo ve etki: depo herkese açık. Dışarıdan biri fork'unda `main` adlı bir dal açar, `ci.yml`'yi de kendi
  PR'ında değiştirip her işi yeşil yapar (`pull_request` olayında iş akışı dosyası PR'ın kodundan okunur).
  İlk katkıda GitHub "Approve and run" onayı ister; yazılımcı olmayan sahip ya da bir yapay zekâ oturumu bu
  düğmeye basarsa CI "success" biter. "Test sürümü" bu PR'ın kodunu derleyip sahibin ve kullanıcıların indirdiği
  `Lyraska-Kurulum.exe` linkine koyar. Sürüm notu da "main'de CI yeşil bittiğinde" yazar. Sonuç: imzasız,
  yabancı kodlu bir kurulum dosyası resmî linkte durur.
- Çürütme denemesi:
  - GitHub belgesinde `workflow_run`'ın yalnızca varsayılan daldaki iş akışı dosyasını kullandığı yazıyor
    (`events-that-trigger-workflows.md:1145`). Bu, yayın iş akışının **kendisinin** değiştirilemeyeceğini
    gösterir, tetikleyen PR'ın kodunun derlenmeyeceğini göstermez: derlenen SHA olay yükünden geliyor.
  - "Fork PR'larında CI hiç çalışmaz" ayarı (Actions → fork PR onayı "all outside collaborators") açık olabilir;
    API kapalı olduğu için doğrulanamadı. Varsayılan ayar yalnızca **ilk kez** katkı verenler için onay ister.
  - Security Lab sayfası vekil sunucuda 403 verdi; davranış oradan teyit edilemedi.

  Bu yüzden güven "Kesin" değil, "Yüksek". Depo ayarı izin veriyorsa önem Kritik'e çıkar (zararlı ikili).

- Öneri: `test-surumu.yml:35` koşulunu şöyle daralt:

  ```yaml
  github.event.workflow_run.event == 'push' &&
  github.event.workflow_run.head_branch == 'main' &&
  github.event.workflow_run.head_repository.full_name == github.repository &&
  github.event.workflow_run.conclusion == 'success'
  ```

  Ayrıca `derle` işinde `HEAD_SHA`'nın `origin/main`'in ucuna eşit olduğunu doğrula.

### KAP-02 — `workflow_dispatch` CI'siz ve dalı sınırlanmadan sabit linke yayımlar

- Önem: Orta · Güven: Kesin · Standart: SLSA v1.0 (kaynak doğrulaması), GitHub Actions sertleştirme.
- Yer: `.github/workflows/test-surumu.yml:17`, `:35`, `:48`.
- Kanıt: `if: github.event_name == 'workflow_dispatch' || …` bu dalda hiçbir CI sonucuna bakmaz.
  `HEAD_SHA` `github.sha`'ya düşer. "Use workflow from" ile seçilen dal (iş akışı dosyası o dalda da olduğu
  sürece) derlenip `test-surumu`'na konur. Dalın `main` olduğunu denetleyen bir koşul yok.
- Senaryo ve etki: yazma izni olan biri (sahip ya da GitHub aracıyla çalışan bir yapay zekâ oturumu) "sahip şu
  dalı denesin" diye iş akışını PR dalında elle başlatır. Sınanmamış, kırmızı CI'lı kod sahibin her zaman
  kullandığı linke düşer. Sürüm notu ise "main'de CI yeşil" der.
- Öneri: `derle` işine `github.event_name != 'workflow_dispatch' || github.ref == 'refs/heads/main'` ekle.
  Dispatch'te de o SHA için CI'nin başarılı bittiğini `gh run list --commit $SHA --workflow CI` ile doğrula.

### KAP-03 — npm lisans kapısı yasak listesi; Rust izin listesiyle aynı politika değil

- Önem: Orta · Güven: Kanıtlandı · Standart: GPL-3.0 §5/§6 (uyumlu lisans), SPDX ifade sözdizimi (AND/OR/WITH).
- Yer: `scripts/check-licenses.mjs:11-23`, `:58-59`; `src-tauri/deny.toml:17-40`;
  CLAUDE.md "İzin verilen lisanslar `src-tauri/deny.toml` içinde listelidir".
- Kanıt: `node_modules/zz-fake/package.json`'a farklı `license` değerleri yazılıp
  `node scripts/check-licenses.mjs` çalıştırıldı.

  | `license`                                                                                  | npm kapısı    | `cargo deny` (aynı değer `Cargo.toml`'da) |
  | ------------------------------------------------------------------------------------------ | ------------- | ----------------------------------------- |
  | `GPL-2.0-only`                                                                             | **0 (yeşil)** | 4 (rejected)                              |
  | `(MIT OR Apache-2.0) AND BUSL-1.1`                                                         | **0 (yeşil)** | 4 (rejected)                              |
  | `Elastic License 2.0`                                                                      | **0**         | —                                         |
  | `PolyForm-Small-Business-1.0.0`                                                            | **0**         | —                                         |
  | `Proprietary`, `LicenseRef-Commercial`, `JSON`                                             | **0**         | —                                         |
  | `""` (boş), `"licenses": []`                                                               | **0**         | —                                         |
  | `MIT AND BUSL-1.1`, `busl-1.1`, `AGPL-3.0-or-later`, `CC-BY-NC-SA-4.0`, `SEE LICENSE IN …` | 1             | —                                         |

  İki hata birlikte çalışıyor. Birincisi, `license.replace(/[()]/g, "").split(/\s+OR\s+/i)` parantezleri silip OR'a
  göre bölüyor; `X AND BUSL` bir seçeneğin içine gömülünce `MIT` seçeneği "temiz" sayılıyor. İkincisi, boş
  dize `"BİLİNMİYOR"` dalına düşmüyor. Bugünkü `node_modules`'ta `deny.toml` listesinde olmayan iki lisans da
  var: `CC-BY-4.0` (caniuse-lite) ve `BlueOak-1.0.0` (lru-cache, minimatch). İkisi de dev araçları; bir "izin
  listesi" olsaydı sahibe sorulması gerekirdi.

- Senaryo ve etki: bir oturum arayüze GPL-2.0-only bir npm kütüphanesi ekler (örneğin bir görselleştirme ya da
  ses meta veri paketi). CI yeşil kalır, `UCUNCU-TARAF.txt` onu dürüstçe listeler, ama GPL-2.0-only kod
  GPL-3.0-only bir ikiliyle birlikte dağıtılamaz. Rust tarafında aynı ekleme kırmızı olurdu. Pakete giren npm
  bağımlılığı bugün 5 tane; risk gerçek ama sık değil.
- Öneri: `check-licenses.mjs`'i izin listesine çevir. Listeyi `deny.toml`'un `allow` dizisinden oku (tek
  kaynak). Yalnızca `npm ls --omit=dev` ile pakete girenlere uygula; dev araçlarını ayrı ve gevşek bir listeyle
  denetle. SPDX ifadesini gerçekten ayrıştır (`spdx-expression-parse` ya da AND/OR ağacı). Boş dizeyi
  bilinmeyen say.

### KAP-04 — Ses dosyası kapısı geçmişe, izinli klasöre ve 14 uzantıya kör

- Önem: Orta · Güven: Kanıtlandı · Standart: telif (CLAUDE.md "ses dosyaları depoya asla girmez"); OpenSSF
  Scorecard "Binary-Artifacts" ile aynı ruh.
- Yer: `scripts/check-no-audio.mjs:5-12`; `.gitignore:22-45`; `ci.yml:32-34` (checkout derinliği 1).
- Kanıt:
  - Geçmiş: kopyada `sarki.mp3` eklenip commit edildi, sonraki commit'te silindi, ardından
    `node scripts/check-no-audio.mjs` çalıştırıldı. Çıktı "Ses dosyası denetimi tamam: 340 dosya incelendi",
    çıkış 0. Depo PR'ları **merge commit** ile birleştiriyor (`git log`: "Merge pull request #95 …"), yani
    PR'ın ara commit'i `main` geçmişinde kalır.
  - İzinli klasör: `src-tauri/tests/data/gercek-sarki.mp3` → çıkış 0. Klasördeki dosyaların sentetik olduğu
    hiçbir biçimde denetlenmiyor (ad listesi, boyut sınırı, üretim betiği karşılaştırması yok).
  - Uzantılar: `.mp2 .ac3 .dts .mkv .mov .3gp .amr .au .w64 .tta .mpc .weba` ve uzantısı değiştirilmiş ses
    (`.bin`) ile `.zip` içindeki ses → hepsi çıkış 0. `.gitignore` bunların hiçbirini de yok saymıyor.
  - Tutarsızlık: betik `mid|midi`'yi ve büyük harfi (`/i`) yakalıyor; `.gitignore` ikisini de yakalamıyor
    (`SARKI.MP3` ve `sarki.mid` `git add` ile sessizce eklenebiliyor, ancak betik ikisinde de kırmızı).
- Senaryo ve etki: bir oturum işaretleme ya da analiz denemesi için gerçek bir şarkıyı "geçici" olarak commit
  edip sonraki commit'te siler. PR yeşil birleşir, telifli dosya herkese açık deponun geçmişinde kalıcı olur
  (temizlemek için geçmişi yeniden yazmak gerekir). Ya da bir test "gerçek kayıtla" yazılır ve şarkı
  `tests/data/`'ya konur.
- Öneri:
  - CI'da `fetch-depth: 0` ile PR'ın commit aralığını tara:
    `git log --diff-filter=A --name-only origin/main..HEAD`.
  - `tests/data/` için izinli dosya adlarını `README.md`'deki listeyle eşleştir ve bir boyut sınırı koy
    (ör. 200 KB).
  - Uzantı listesini tek dosyadan hem `.gitignore`'a hem betiğe ver ve yukarıdaki uzantıları ekle.
  - İsteğe bağlı: sihirli bayt denetimi (`ID3`, `fLaC`, `OggS`, `RIFF…WAVE`, `ftyp`).

### KAP-05 — ESLint uyarıları CI'yi kırmıyor; CLAUDE.md'nin sözü tutmuyor

- Önem: Orta · Güven: Kanıtlandı · Standart: ISO/IEC 25010 bakım kolaylığı (analiz edilebilirlik).
- Yer: `package.json` `"lint": "eslint ."`; `eslint.config.js:16-18`; CLAUDE.md "Uyarısız derleme zorunludur:
  CI'da lint uyarıları hata sayılır."
- Kanıt: mutasyon E03. `src/hooks/useCover.ts` içinde `}, [trackPath]);` → `}, []);` yapıldı:

  ```
  42:6  warning  React Hook useEffect has a missing dependency: 'trackPath' ...  react-hooks/exhaustive-deps
  ✖ 1 problem (0 errors, 1 warning)
  exit=0
  ```

  `react-hooks` önerilen kümesinde `exhaustive-deps`, `incompatible-library` ve `unsupported-syntax` "warn"
  düzeyinde.

- Senaryo ve etki: bir oturum yeni bir hook yazarken bağımlılığı unutur. Uyarı CI günlüğünde kalır, iş yeşil
  biter, şarkı değişince eski şarkının verisini gösteren bir "bayat kapanış" hatası test sürümüne gider. Bugün
  depoda hiç uyarı yok; kapı yalnızca geleceği korumuyor.
- Öneri: `"lint": "eslint . --max-warnings 0"`. İstenirse `linterOptions: { reportUnusedDisableDirectives:
"error" }`.

### KAP-06 — "Panik yok" ve "`unsafe` yalnızca WASAPI'de" kuralları lint ile tam korunmuyor

- Önem: Orta · Güven: Kanıtlandı · Standart: ISO/IEC 25010 güvenilirlik; CLAUDE.md "Ses çıkış geri çağrısında
  … panic yoktur".
- Yer: `src-tauri/Cargo.toml` `[lints.rust] unsafe_code = "deny"`, `[lints.clippy] unwrap_used/expect_used/panic
= "warn"`; `src-tauri/clippy.toml` `allow-indexing-slicing-in-tests = true` (lint açık olmadığı için ölü ayar).
- Kanıt: `kapi/lintdemo` crate'i aynı `[lints]` ve `clippy.toml` ile kuruldu, içine şu kod kondu. Sonuç
  `cargo clippy --all-targets -- -D warnings` → **exit 0**:

  ```rust
  pub fn first(v: &[f64]) -> f64 { v[0] }                                     // indeksleme paniği
  pub fn pick(x: u8) -> u8 { match x { 0 => 1, _ => unreachable!("yok") } }
  #[allow(unsafe_code)]
  pub fn raw(b: &[u8]) -> &str { unsafe { std::str::from_utf8_unchecked(b) } } // başka modülde unsafe
  #[allow(clippy::unwrap_used)]
  pub fn parse(s: &str) -> u32 { s.parse().unwrap() }                         // gerekçesiz susturma
  pub fn div(a: u32, b: u32) -> u32 { a / b }                                 // sıfıra bölme
  ```

  `deny`, `#[allow]` ile her yerde aşılabilir (`forbid` aşılamaz ama WASAPI istisnası `forbid` ile mümkün
  değil). Ses yolunun test dışı kısmında indeksleme satırları var: `limiter.rs` 10, `eq.rs` 26, `biquad.rs` 23
  satır.

- Senaryo ve etki: bir oturum gerçek zamanlı süzgece sınır dışına çıkabilen bir indeks ekler. Clippy ve CI
  yeşil kalır, sürüm derlemesi `panic = "abort"` olduğu için bu hata programı anında kapatır. Ya da başka bir
  modüle `#[allow(unsafe_code)]` eklenir ve kural yalnızca gözden geçirmeye kalır.
- Öneri:
  - CI'ya bir satırlık denetim ekle:
    `test "$(grep -rln 'allow(unsafe_code)' src-tauri/src)" = "src-tauri/src/audio/output/wasapi.rs"`.
  - `[lints.clippy]`'ye `allow_attributes_without_reason = "warn"` ekle.
  - Ses yolu modüllerine modül düzeyinde `#![warn(clippy::indexing_slicing, clippy::unreachable,
clippy::arithmetic_side_effects)]` aç ya da kuralın kapsamını CLAUDE.md'de daralt.

### KAP-07 — Komut sözleşmesi denetimi: kaçırdıkları ve yanlış alarmları

- Önem: Düşük · Güven: Kanıtlandı · Standart: Tauri 2 komut modeli (argüman adları camelCase).
- Yer: `scripts/check-commands.mjs:28`, `:31-42`, `:59`, `:75`.
- Kanıt (`node scripts/check-commands.mjs`; tablo bölüm 7'de):
  - **Kaçırdıkları (exit 0):**
    - C07: `window: Option<(f64, f64)>` parametresinden sonraki zorunlu `path` hiç görülmüyor. `[^)]*` ilk
      `)`'de kesiyor; virgül `<…>` içinde sayılıyor.
    - C12: ``invoke(`library_wipe_all`, …)`` (şablon dizesi).
    - C13: `import { invoke as call }` ile var olmayan komut.
    - C14: gerçek çağrı silinip yerine yorumda `invoke("song_map_remove", …)` bırakılınca ölü kod
      yakalanmıyor.
    - C15: `{ seconds: String(seconds) }` (tür yanlış; tsc de yeşil).
  - **Yanlış alarmlar (doğru kod, exit 1):**
    - C04b: `#[tauri::command(rename_all = "snake_case")]` ile snake_case gönderen arayüz.
    - C05: `#[tauri::command]` ile `fn` arasına `#[allow(clippy::too_many_arguments)]`. Clippy 8 argümanda
      bunu ister; `abx_start` bugün 6 parametreli.
    - C08: tuple parametre.
    - C09: `mut seconds: f64`.
    - C10: iç içe nesne argümanı.
    - C16: argümanın değişkenle verilmesi.
  - Mesajlar da yanıltıcı olabiliyor: parametre listesindeki bir yorum "zorunlu `// şarkının yolu (çalan
şark` gönderilmiyor" iletisine yol açtı (C06).
  - Doğru yakalananlar: yanlış ad, snake_case ad, eksik zorunlu argüman, `generate_handler!`'dan çıkarma
    (C01–C03, C17).
- Senaryo ve etki: bugün 54 komutun hepsi standart biçimde ve kapı yeşil (doğru). Kaçırma senaryoları
  (takma ad, şablon dizesi, tuple) seyrek; yanlış alarmlar meşru kodu engelleyip oturumu kodu çarpıtmaya
  zorlayabilir. Kapı, MIMARI.md'nin sözünü ("Arayüzün çağırdığı komut ve argümanlar çekirdekte var") bugünkü
  kod için tutuyor.
- Öneri:
  - Rust tarafında `syn` tabanlı küçük bir test ya da `#[tauri::command(...)]` / ara öznitelik / `mut` kabul
    eden düzenli ifade kullan.
  - Arayüzde `invoke`'u yalnızca `backend.ts`'te izin veren bir ESLint `no-restricted-imports` kuralı koy,
    komut adını yalnızca dize sabiti olarak kabul et.
  - Taramadan önce yorumları ayıkla.
  - Uzun vadede argüman ve dönüş tiplerini de ts-rs ile üret: bugün `invoke<T>`'deki `T` elle seçiliyor.

### KAP-08 — Atlanan testler ve yanlış adlı test dosyası sessizce geçiyor; kapsam ölçülmüyor

- Önem: Düşük · Güven: Kanıtlandı · Standart: CLAUDE.md "Testler atlanmaz, devre dışı bırakılmaz".
- Yer: `vite.config.ts:29-33` (`test` bloğu), `package.json` `"test": "vitest run"`.
- Kanıt:
  - V06: `describe.skip` ile bütün dosya atlanınca `CI=true npm test` → "Test Files 1 skipped … Tests 18
    skipped", exit 0.
  - V03b: `it.skip` → exit 0.
  - V02: kırık bir test `format-test.ts` adıyla yazılınca hiç koşmuyor; typecheck ve lint de yeşil.
  - Rust'ta bugün üç `#[ignore]` var (`biquad.rs:955`, `eq.rs:1222`, `fingerprint.rs:705`). Hepsi belgeli
    araç testleri, kötüye kullanım yok.
  - Kapsam aracı (`@vitest/coverage-*`, `cargo llvm-cov`) yok.
- Senaryo ve etki: bir oturum kırmızı bir testi "geçici" `.skip` ile susturur ve CI yeşil kalır. Bugün
  `src`'de `.skip`/`.only` yok.
- Öneri: CI'ya `! grep -rnE '\.(skip|only|todo)\(' src --include='*.test.ts*'` ve Rust için gerekçesiz
  `#[ignore]` denetimi ekle. `test.include`'u açık yaz. İsteğe bağlı olarak `--coverage` ile eşiksiz bir kapsam
  raporu üret.

### KAP-09 — Kapıların kendisi (scripts/*.mjs) lint ve tür denetiminin dışında

- Önem: Düşük · Güven: Kanıtlandı.
- Yer: `eslint.config.js:9` `files: ["**/*.{ts,tsx,js}"]` (`.mjs` yok); `tsconfig.json` `include` scripts'i
  kapsamıyor ve `allowJs` kapalı.
- Kanıt: E06'da `scripts/check-licenses.mjs`'e tanımsız `undefinedFn()` ve kullanılmayan değişken eklendi,
  `npm run lint` exit 0. T02'de `count = "metin"; count.toFixed(2)` eklendi, `npm run typecheck` exit 0.
  Prettier `.mjs`'i kapsıyor (P01 kırmızı).
- Senaryo ve etki: hata dallarında (yalnızca kapı kırmızıyken koşan yol) bir yazım hatası, kapının kırmızıyı
  raporlayamadan çökmesine ya da yanlış yeşile dönmesine yol açar. Kapıların kendisi sınanmıyor (betiklerin
  testi de yok).
- Öneri: `files`'a `mjs` ekle, `globals.node` ver. Her betiğe en az bir "bozuk girdi → exit 1" Vitest testi
  yaz (bu rapordaki mutasyonların birkaçı hazır test vakasıdır).

### KAP-10 — "CI'nın çalıştırdığı denetimler" listeleri CI ile birebir değil

- Önem: Düşük · Güven: Kesin · Standart: ISO/IEC 25010 bakım kolaylığı.
- Yer: `README.md:76-83`; CLAUDE.md "Push'tan önce yerelde şunlar temiz olmalı: biçim, lint, tür denetimi,
  testler, lisans denetimi"; `ci.yml`.
- Kanıt:

  | Denetim                                   | ci.yml | README "same ones CI runs" | CLAUDE.md push listesi |
  | ----------------------------------------- | ------ | -------------------------- | ---------------------- |
  | format/lint/typecheck/test (TS)           | var    | var                        | var                    |
  | check:licenses / cargo deny licenses      | var    | var                        | var                    |
  | check:commands                            | var    | var                        | **yok**                |
  | check:audio                               | var    | var                        | **yok**                |
  | check:notices                             | var    | var                        | **yok**                |
  | `npm run build`                           | var    | **yok**                    | yok                    |
  | ts-rs bağlamaları güncel mi (git status)  | var    | **yok**                    | **yok**                |
  | `npm audit --omit=dev --audit-level=high` | var    | **yok**                    | yok                    |
  | cargo deny advisories                     | var    | var                        | yok                    |
  | check:scenes (Windows/Edge)               | var    | **yok**                    | yok                    |
  | Windows clippy/test, `--locked`           | var    | **yok** (`--locked` yok)   | yok                    |

- Senaryo ve etki: bir oturum CLAUDE.md'deki listeyi temiz bulup push eder. `check:commands` ya da bağlamalar
  CI'da kırmızı olur; bir tur boşa gider (zarar küçük, zaman kaybı).
- Öneri: `package.json`'a CI'nın arayüz adımlarını sırasıyla koşan tek bir `"check": "…"` betiği ekle.
  README ve CLAUDE.md o betiği göstersin, Rust tarafı için de tek satır olsun.

### KAP-11 — "Gerçek ses aygıtıyla deneme" CI adımı barındırılan makinede kırmızı olamaz

- Önem: Bilgi · Güven: Kesin.
- Yer: `ci.yml:203-207`; `src-tauri/examples/ses_denemesi.rs:34-39`.
- Kanıt: aygıt yoksa "ATLANDI" yazıp uyarı ile 0 dönüyor. Bu durum hem yorumda hem MIMARI.md'de dürüstçe
  belirtilmiş.
- Öneri: yok. Adımın adına "(aygıt yoksa atlanır)" eklenebilir.

## 4. Olası riskler (kanıtı yetmeyenler)

- **Dal koruması ve zorunlu kontroller:** CLAUDE.md "PR'da CI yeşil olmadan birleştirme yapılmaz" diyor. Bunun
  GitHub ayarıyla zorunlu kılınıp kılınmadığı (required status checks; özellikle `sahneler`, `guvenlik`
  işleri) API kapalı olduğu için doğrulanamadı. Zorunlu değilse bütün kapılar tavsiye düzeyindedir.
- **Yüzen promise'ler:** tür bilgili kurallar (`no-floating-promises`, `no-misused-promises`) yok. Geçici bir
  yapılandırmayla 1 üretim (`src/hooks/useCover.ts:33`), 5 test (`useIdle.test.ts`) ve 1 misused
  (`PlayerScreen.tsx:137`, `player.refresh` void geri çağrıya veriliyor) bulundu. Bugün zararsız görünüyorlar;
  CLAUDE.md bu konuda söz vermiyor.
- **Platforma özel npm paketleri:** Windows'ta kurulan 32 platform paketi (`@tauri-apps/cli-win32-*`,
  `lightningcss-win32-*`, `@rolldown/binding-win32-*` …) Linux CI'daki lisans taramasına hiç girmiyor. Hepsi
  dev ve kilitte MIT/Apache/MPL; bugün risk yok.
- **`invoke<T>` dönüş tipi elle seçiliyor:** Rust bir komutun dönüş tipini başka bir yapıya çevirirse ts-rs
  bağlamaları güncellenir, ama `backend.ts`'teki `T` eski kalabilir ve hiçbir kapı fark etmez.
- **ts-rs adımı yalnızca `src/lib/bindings/*.ts`'i siler:** `export_to` ile alt klasöre üretilen eski bir
  dosya kalırsa fark edilmez. Bugün alt klasör yok.

## 5. Temiz bulunanlar

- **ts-rs bağlamaları (ci.yml:93-106):**
  - Önce `rm -f`, sonra `cargo test --locked`, sonra `git status --porcelain`. Silinen tip (D), yeni tip (??)
    ve değişen tip (M) üçü de yakalanır.
  - `TS_RS_EXPORT_DIR` `.cargo/config.toml`'da sabit.
  - Komut dönüş tiplerinin ve argüman yapılarının hepsinin bağlaması var (`backend.ts`'te elle yazılan tek
    veri tipi `AbxRequest`; o da argüman sarmalayıcısı).
  - Prettier bağlamaları doğru biçimde yok sayıyor (P03).
- **check:notices:** üretim bağımlılığı ekleme (N01), çıkarma (N02) ve Rust dev → normal geçişi (N03) kırmızı.
  Yeni dev bağımlılığı (N04) doğru biçimde yeşil. Çıktı belirlenimci (kopyada ilk koşuda "güncel").
  Lisans dosyası olmayan üç paket (realfft, webview2-com, webview2-com-sys) dosyada açıkça işaretli.
- **cargo deny (Rust lisans):** izin listesi doğru çalışıyor. `GPL-2.0-only` ve `(MIT OR Apache-2.0) AND
BUSL-1.1` reddedildi; `MIT OR GPL-2.0-only` doğru biçimde kabul edildi. `deny.toml` her üç hedefi tarıyor.
- **TypeScript:** `strict` ve `noUncheckedIndexedAccess`; örtük `any` kırmızı (T01). `no-explicit-any` hata
  düzeyinde (E01); `@ts-ignore` yasak (E07); `rules-of-hooks` hata (E05). `src`'de hiç `eslint-disable`,
  `@ts-ignore` ya da `any` yok. CLAUDE.md'nin "`any` kullanılmaz" sözü kapıyla korunuyor, ancak
  `eslint-disable` yorumuyla aşılabiliyor (E02).
- **Vitest:** hiç test dosyası yoksa exit 1 (V01). CI'da (`CI=true`) `it.only` exit 1 (V04b). 40 dosya, 317
  test koşuyor.
- **Prettier:** `.mjs`, `.yml` ve `.md` dahil bütün depo (P01, P02 kırmızı). Yok sayma listesi makul.
- **check:audio:** listelenen uzantılar büyük/küçük harf bağımsız yakalanıyor (`SARKI.MP3`, `Sarki.Flac`,
  `.mid`).
- **check:licenses:** AGPL, BUSL (küçük harf dahil), CC-BY-NC ve "SEE LICENSE IN" kırmızı; `MIT OR SSPL-1.0`
  doğru biçimde kabul.
- **check:commands:** yanlış argüman adı, snake_case ad, eksik zorunlu argüman, kayıtsız komut ve ölü komut
  kırmızı.
- **Clippy ve unsafe:**
  - CI'da `--all-targets --locked -- -D warnings` hem Linux hem Windows işinde koşuyor.
  - Test dışı kodda `unreachable!`/`todo!`/`unimplemented!`/`assert!` yok.
  - `#[allow(unsafe_code)]` yalnızca `wasapi.rs:151` ve `:175`'te, `// GÜVENLİK:` gerekçesiyle.
  - Kalan `allow`'lar dar ve gerekçeli (`eq.rs:38` needless_range_loop, `tests/formats.rs`,
    `examples/ses_denemesi.rs`).
  - `ses_yolu_bellek_ayirmaz` testi var (`render.rs:410`).
- **CI hijyeni:**
  - Eylemler commit SHA'sıyla sabitli; `persist-credentials: false`.
  - Üst düzey `permissions: contents: read`; Rust araç zinciri sabit (1.97.0).
  - `cargo` ve `tauri build` `--locked` ile koşuyor.
  - Yayın iş akışında yazma izni kod çalıştırmayan ayrı işte (KAP-01'deki SHA seçimi hariç, ayrım doğru).
- **MIMARI.md'nin kural → kapı tablosu:** gösterdiği test dosyaları (`usePlayer.test.ts`, `useMarker.test.ts`,
  `lyrics.test.ts`, `sceneCheck.test.ts` …) gerçekten var.

## 6. Öncelikli düzeltme sırası

1. **KAP-01:** `test-surumu.yml:35` koşuluna `workflow_run.event == 'push'` ve
   `head_repository.full_name == github.repository` ekle.
2. **KAP-02:** dispatch'i `refs/heads/main` ile sınırla, SHA için CI sonucunu doğrula.
3. **KAP-05:** `"lint": "eslint . --max-warnings 0"`. Tek satır; CLAUDE.md'nin sözünü gerçeğe çevirir.
4. **KAP-03:** npm lisans kapısını `deny.toml`'dan okunan izin listesine çevir, yalnızca pakete girenlere
   uygula, SPDX'i ayrıştır.
5. **KAP-04:** PR commit aralığında eklenen ses dosyalarını tara; `tests/data/` için ad listesi ve boyut
   sınırı koy; uzantı listesini tek kaynaktan ver.
6. **KAP-06:** CI'da `allow(unsafe_code)` yalnızca `wasapi.rs`'te olsun; `allow_attributes_without_reason`;
   ses yolu modüllerinde `indexing_slicing`.
7. **KAP-08:** `.skip`/`.only`/gerekçesiz `#[ignore]` için CI denetimi.
8. **KAP-09:** ESLint'e `.mjs`; kapı betiklerine "bozuk girdi → kırmızı" testleri (bu rapordaki mutasyonlar).
9. **KAP-07:** `check-commands.mjs`'i öznitelik varyantlarına, `mut`'a ve parantezli türlere dayanıklı yap;
   `invoke`'u `backend.ts` dışında yasakla.
10. **KAP-10:** tek `npm run check` betiği; README ve CLAUDE.md onu göstersin.

## 7. Mutasyon tablosu

Kapı komutu kopyada koşuldu; "Beklenen" kapının sözüne göre, "Gerçek" çıkış koduyla. ✗ = kapı yanlış davrandı.
Ham kayıt: `kapi/mut-results.txt`.

| #      | Kapı                            | Yapılan değişiklik                                                                                      | Beklenen                                                  | Gerçek                                                  |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| C01    | check:commands                  | `open_track` argümanı `{ filePath: path }`                                                              | kırmızı                                                   | kırmızı (1)                                             |
| C02    | check:commands                  | `startSecs` → `start_secs`                                                                              | kırmızı                                                   | kırmızı (1)                                             |
| C03    | check:commands                  | `song_map_import`'tan `file` çıkarıldı                                                                  | kırmızı                                                   | kırmızı (1)                                             |
| C04a   | check:commands                  | `#[tauri::command(rename_all="snake_case")]`, arayüz camelCase (gerçek arıza)                           | kırmızı                                                   | kırmızı (1), ama ileti yanlış: "commands.rs içinde yok" |
| C04b   | check:commands                  | aynı öznitelik + arayüz snake_case (doğru kod)                                                          | yeşil                                                     | **kırmızı (1) ✗ yanlış alarm**                          |
| C05    | check:commands                  | `#[tauri::command]` ile `fn` arasında `#[allow(clippy::too_many_arguments)]`                            | yeşil                                                     | **kırmızı (1) ✗**                                       |
| C06    | check:commands                  | parametre satırına `// … (çalan şarkı)` yorumu + arayüz `file`'ı unutuyor                               | kırmızı (file eksik)                                      | kırmızı (1), ileti anlamsız (yorum parametre sanıldı)   |
| C07    | check:commands                  | `window: Option<(f64, f64)>` eklendi, arayüz `path`/`file`'ı göndermiyor                                | kırmızı                                                   | **yeşil (0) ✗ kaçırdı**                                 |
| C08    | check:commands                  | `range: (f64, f64)` parametresi, arayüz doğru gönderiyor                                                | yeşil                                                     | **kırmızı (1) ✗**                                       |
| C09    | check:commands                  | `mut seconds: f64`                                                                                      | yeşil                                                     | **kırmızı (1) ✗**                                       |
| C10    | check:commands                  | `{ settings: { ...settings, preamp: 0 } }` (doğru)                                                      | yeşil                                                     | **kırmızı (1) ✗**                                       |
| C11    | check:commands                  | iç içe nesne + dış düzeyde yanlış ad `fiel`                                                             | kırmızı                                                   | kırmızı (1) (yanlış nedenle)                            |
| C12    | check:commands (+tsc+lint)      | ``invoke(`library_wipe_all`, …)`` (olmayan komut)                                                       | kırmızı                                                   | **yeşil (0) ✗**                                         |
| C13    | check:commands (+tsc+lint)      | `invoke as call` ile olmayan komut                                                                      | kırmızı                                                   | **yeşil (0) ✗**                                         |
| C14    | check:commands                  | gerçek `song_map_remove` çağrısı silindi, yorumda kaldı                                                 | kırmızı (ölü komut)                                       | **yeşil (0) ✗**                                         |
| C15    | check:commands + tsc            | `{ seconds: String(seconds) }` (f64 yerine dize)                                                        | kırmızı (ideal)                                           | **yeşil (0)** (kapı tür vaat etmiyor)                   |
| C16    | check:commands                  | `const args = { path }; invoke("open_track", args)` (doğru)                                             | yeşil                                                     | kırmızı (1) (temkinli yanlış alarm)                     |
| C17    | check:commands                  | `generate_handler!`'dan `open_track` çıkarıldı                                                          | kırmızı                                                   | kırmızı (1)                                             |
| L1     | check:licenses                  | sahte paket `GPL-2.0-only`                                                                              | kırmızı                                                   | **yeşil (0) ✗**                                         |
| L2     | check:licenses                  | `(MIT OR Apache-2.0) AND BUSL-1.1`                                                                      | kırmızı                                                   | **yeşil (0) ✗**                                         |
| L3     | check:licenses                  | `MIT AND BUSL-1.1`                                                                                      | kırmızı                                                   | kırmızı (1)                                             |
| L4     | check:licenses                  | `busl-1.1` (küçük harf)                                                                                 | kırmızı                                                   | kırmızı (1)                                             |
| L5     | check:licenses                  | `AGPL-3.0-or-later`                                                                                     | kırmızı                                                   | kırmızı (1)                                             |
| L6     | check:licenses                  | `Elastic License 2.0` (boşluklu yazım)                                                                  | kırmızı                                                   | **yeşil (0) ✗**                                         |
| L7     | check:licenses                  | `PolyForm-Small-Business-1.0.0`                                                                         | kırmızı                                                   | **yeşil (0) ✗**                                         |
| L8     | check:licenses                  | `Proprietary`                                                                                           | kırmızı                                                   | **yeşil (0) ✗**                                         |
| L9     | check:licenses                  | `CC-BY-NC-SA-4.0`                                                                                       | kırmızı                                                   | kırmızı (1)                                             |
| L10    | check:licenses                  | `SEE LICENSE IN EULA.txt`                                                                               | kırmızı                                                   | kırmızı (1)                                             |
| L11    | check:licenses                  | `""` (boş)                                                                                              | kırmızı (bilinmeyen)                                      | **yeşil (0) ✗**                                         |
| L12    | check:licenses                  | `MIT OR SSPL-1.0`                                                                                       | yeşil (MIT seçilir)                                       | yeşil (0)                                               |
| L13    | check:licenses                  | `LicenseRef-Commercial`                                                                                 | kırmızı                                                   | **yeşil (0) ✗**                                         |
| L14    | check:licenses                  | `JSON` ("Good, not Evil")                                                                               | kırmızı (izin listesinde değil)                           | **yeşil (0) ✗**                                         |
| L15    | check:licenses                  | `"licenses": []`                                                                                        | kırmızı (bilinmeyen)                                      | **yeşil (0) ✗**                                         |
| R1     | cargo deny licenses             | `Cargo.toml` `license = "GPL-2.0-only"`                                                                 | kırmızı                                                   | kırmızı (4)                                             |
| R2     | cargo deny licenses             | `(MIT OR Apache-2.0) AND BUSL-1.1`                                                                      | kırmızı                                                   | kırmızı (4)                                             |
| R3     | cargo deny licenses             | `MIT OR GPL-2.0-only`                                                                                   | yeşil                                                     | yeşil (0)                                               |
| A1     | check:audio                     | `sarki.mp3` (`git add -f`)                                                                              | kırmızı                                                   | kırmızı (1)                                             |
| A2     | check:audio                     | `SARKI.MP3` (`.gitignore` yok saymıyor)                                                                 | kırmızı                                                   | kırmızı (1)                                             |
| A3     | check:audio                     | `Sarki.Flac`                                                                                            | kırmızı                                                   | kırmızı (1)                                             |
| A4     | check:audio                     | `sarki.mid` (`.gitignore`'da yok)                                                                       | kırmızı                                                   | kırmızı (1)                                             |
| A5–A16 | check:audio                     | `.mp2 .ac3 .mkv .mov .3gp .amr .au .w64 .tta .mpc .dts .weba` (mp3 içeriği)                             | kırmızı                                                   | **yeşil (0) ✗** (12 uzantı)                             |
| A17    | check:audio                     | `sarki.bin` (uzantısı değişmiş mp3)                                                                     | kırmızı                                                   | **yeşil (0) ✗**                                         |
| A18    | check:audio                     | `docs/ornek.zip` (içerik mp3)                                                                           | kırmızı                                                   | **yeşil (0) ✗**                                         |
| A19    | check:audio                     | `src-tauri/tests/data/gercek-sarki.mp3`                                                                 | kırmızı                                                   | **yeşil (0) ✗**                                         |
| A20    | check:audio                     | mp3 commit edilip sonraki commit'te silindi (geçmişte kaldı)                                            | kırmızı                                                   | **yeşil (0) ✗**                                         |
| N1     | check:notices                   | kilitte `globals`'ın `dev` işareti kalktı (üretime geçti)                                               | kırmızı                                                   | kırmızı (1)                                             |
| N2     | check:notices                   | `@fontsource-variable/inter` kilitten çıkarıldı                                                         | kırmızı                                                   | kırmızı (1)                                             |
| N3     | check:notices                   | `allocation-counter` normal bağımlılık yapıldı                                                          | kırmızı                                                   | kırmızı (1)                                             |
| N4     | check:notices                   | yeni dev bağımlılığı `itoa`                                                                             | yeşil                                                     | yeşil (0)                                               |
| E1     | lint                            | `path: any`                                                                                             | kırmızı                                                   | kırmızı (1)                                             |
| E2     | lint                            | `eslint-disable-next-line` + `any`                                                                      | (politika yok)                                            | yeşil (0)                                               |
| E3     | lint                            | useEffect bağımlılığı `[]` (eksik `trackPath`)                                                          | kırmızı (CLAUDE.md: uyarı = hata)                         | **yeşil (0) ✗** (yalnızca uyarı)                        |
| E4     | lint                            | `.catch` kaldırıldı (yüzen promise)                                                                     | kırmızı (ideal)                                           | **yeşil (0)** (kural yok)                               |
| E5     | lint                            | koşullu hook                                                                                            | kırmızı                                                   | kırmızı (1)                                             |
| E6     | lint                            | `scripts/check-licenses.mjs`'e tanımsız fonksiyon + kullanılmayan değişken                              | kırmızı                                                   | **yeşil (0) ✗** (`.mjs` kapsam dışı)                    |
| E7     | lint                            | `// @ts-ignore`                                                                                         | kırmızı                                                   | kırmızı (1)                                             |
| T1     | typecheck                       | örtük `any` parametre                                                                                   | kırmızı                                                   | kırmızı (2)                                             |
| T2     | typecheck                       | `.mjs` betikte tür hatası                                                                               | kırmızı (ideal)                                           | **yeşil (0)** (kapsam dışı)                             |
| P1     | format:check                    | `.mjs` bozuk biçim                                                                                      | kırmızı                                                   | kırmızı (1)                                             |
| P2     | format:check                    | `ci.yml` bozuk biçim                                                                                    | kırmızı                                                   | kırmızı (1)                                             |
| P3     | format:check                    | `src/lib/bindings/*.ts` bozuk biçim                                                                     | yeşil (bilerek yok sayılır; ts-rs adımı yakalar)          | yeşil (0)                                               |
| V1     | npm test                        | bütün `*.test.ts(x)` silindi                                                                            | kırmızı                                                   | kırmızı (1)                                             |
| V2     | npm test                        | kırık test `format-test.ts` adıyla                                                                      | kırmızı                                                   | **yeşil (0) ✗** (dosya hiç koşmuyor)                    |
| V3     | npm test (`CI=true`)            | `it.skip`                                                                                               | kırmızı (CLAUDE.md: test atlanmaz)                        | **yeşil (0) ✗**                                         |
| V4     | npm test (yerel)                | `it.only`                                                                                               | —                                                         | yeşil (0)                                               |
| V4b    | npm test (`CI=true`)            | `it.only`                                                                                               | kırmızı                                                   | kırmızı (1)                                             |
| V6     | npm test (`CI=true`)            | `describe.skip` (bütün dosya, 18 test)                                                                  | kırmızı                                                   | **yeşil (0) ✗**                                         |
| K1     | clippy `-D warnings` (lintdemo) | `v[0]`, `unreachable!`, başka modülde `#[allow(unsafe_code)]`, `#[allow(clippy::unwrap_used)]`, `a / b` | kırmızı (CLAUDE.md "panic yok", "unsafe yalnızca WASAPI") | **yeşil (0) ✗**                                         |
