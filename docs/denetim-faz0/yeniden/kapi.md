# KAPI (kalite kapılarının gerçekliği) — bağımsız denetim raporu (Faz 0)

Denetlenen commit: `9ae1b6d` (koordinatörün bildirdiği son commit; `57f3e7b`'den bu yana kapılarda değişen tek
dosya `scripts/check-scenes.mjs`, 10 satır, CSP'ye uygun stil). Bütün deneyler kopyada
(`git clone` + `node_modules` sembolik bağı) yapıldı; `/home/user/Lyraska`'ya yazılmadı, Rust derlenmedi.

## 1. Özet

- **Puan (a) depodaki kod ve yapılandırma: 6/10.** Tablodaki 60 mutasyonun 6'sı tasarım gereği serbest. Kalan
  54'ün 32'sinde ilgili kapı kırmızı yandı, ama CI bunlardan yalnızca 26'sını yakalıyor. Ama `check:rules` kapısı **hiçbir iş akışında çalışmıyor**. "Testler atlanmaz", "unsafe yalnızca
  WASAPI'de", "CSP sıkı" ve "izinler dar" kurallarının CI'da hiçbir bekçisi yok. README ise bu betiğin "CI'nın
  çalıştırdığı" denetimlerden biri olduğunu yazıyor.
- **Puan (b) GitHub ayarları dahil: 5/10.** `main` dalı korumasız (`protected:false`, kural seti yok). Bu yüzden
  "PR'da CI yeşil olmadan birleştirme yapılmaz" kuralını GitHub zorlamıyor. Test sürümü `workflow_dispatch` ile
  CI'nın sonucuna bakmadan elle de yayımlanabiliyor.
- **Yüksek — KAP-01:** `check:rules` CI'da yok. `it.skip` ile susturulan bozuk bir test, CSP'ye uzak adres eklemek
  ve yeni bir Tauri izni CI'ya karşılık gelen adımların hepsinden yeşil geçiyor (Kanıtlandı).
- **Orta:** "uzak adres" denetimi ölü kod (KAP-03): `//` yorum temizliği her `https://` adresini siliyor. Rust
  tarafında ağ erişimine bakan bir kapı da yok. Geçmişte izinli test klasörüne girip sonra silinen büyük ses
  dosyası `--history` taramasından kaçıyor (KAP-04). Sahne denetiminin sahne listesi elle yazılmış; yeni bir sahne
  parlama ölçümüne girmiyor (KAP-05). Lisans politikası kendi kendine düzenlenebiliyor (KAP-06). Elle başlatılan
  yayın CI'yı atlıyor (KAP-07).
- **Düşük:** check:rules / check:commands / check:docs / check:audio ayrıştırıcılarında atlatma yolları var (hepsi
  kanıtlı). ESLint türe duyarlı değil. Clippy'de `indexing_slicing` kapalı.
- **Doğru yapılanlar:** Prettier, ESLint (`any`, `@ts-ignore`, hook bağımlılıkları), `tsc --strict`, CI'da
  `.only`, SPDX ayrıştırmalı lisans denetimi, imzaya bakan ses denetimi, tür karşılaştırmalı komut sözleşmesi,
  üçüncü taraf bildirimleri ve ts-rs adımı mutasyonlarda kırmızı yandı. Bugün depoda hiçbir kapının ihlali yok.

## 2. Kapsam ve yöntem

**Okunan dosyalar:** `package.json`, `scripts/*.mjs` (check-rules, check-docs, check-commands, check-licenses,
check-no-audio, check-scenes, third-party-notices), `scripts/lib/*.mjs` ve testleri, `eslint.config.js`,
`tsconfig.json`, `.prettierrc.json`, `.prettierignore`, `vite.config.ts` (Vitest ayarı), `.gitignore`,
`src-tauri/Cargo.toml` (`[lints]`, profiller), `src-tauri/clippy.toml`, `src-tauri/.cargo/config.toml` (ts-rs),
`src-tauri/deny.toml`, `src-tauri/tauri.conf.json` (CSP), `src-tauri/capabilities/default.json`,
`.github/workflows/{ci,test-surumu,guvenlik-taramasi}.yml`, `README.md` (denetim listesi), `CLAUDE.md`,
`docs/MIMARI.md` ("Kurallar ve onları denetleyenler"), `src/lib/sceneCheck.test.ts`, `src/lib/scene.ts`.

**Taban çizgisi (kopyada, mutasyonsuz):** `format:check`, `lint`, `typecheck`, `check:licenses`,
`check:audio -- --history` (416 dosya, geçmişte 1678 içerik), `check:docs` (112 dosya), `check:commands`
(55 komut, 55 çağrı, 51 dönüş türü), `check:rules`, `check:notices` (yerel crate önbelleğiyle; `cargo tree`) ve
`vitest run` (51 dosya, 398 test) hepsi **yeşil**.

**Mutasyon sınaması:** her mutasyon kopyada yapıldı, ilgili kapılar çalıştırıldı, ardından
`git reset --hard 9ae1b6d && git clean -fd` ile geri alındı. Sentetik sesler ffmpeg ile üretildi (sinüs; telif
yok) ve yalnızca kopyada commit edildi.

**Ek okuma:** `gh api repos/lahmacunveayran/Lyraska/branches/main` ve `.../rules/branches/main` (herkese açık,
yalnızca okuma).

**Sınırlar:** Rust derlenmedi (brief). Clippy, ts-rs ve `cargo fmt` mutasyonları bu yüzden kod ve yapılandırma
okunarak değerlendirildi (Güven: Kesin). Makinede tarayıcı olmadığı için `check:scenes` çalıştırılmadı; yalnızca
okundu.

### Mutasyon tablosu

"CI" sütunu: o mutasyonun CI'daki adımlarla (ci.yml) yakalanıp yakalanmadığı.

| #    | Kapı                     | Değişiklik                                                                      | Beklenen        | Gerçek                                                                         | CI                    |
| ---- | ------------------------ | ------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------ | --------------------- |
| M1   | Vitest / check:rules     | `it.skip("bozuk", () => expect(1).toBe(2))`                                     | kırmızı         | vitest `CI=true` 0, lint 0; check:rules 1                                      | **YEŞİL**             |
| M2   | Vitest                   | var olan bir testte `it.only`                                                   | kırmızı         | yerelde 0; `CI=true` 1                                                         | kırmızı               |
| M3   | Vitest / check:rules     | bozuk test `src/lib/formatTests.ts` adlı dosyada                                | kırmızı         | vitest 0 (dosya koşmaz), tsc 0, lint 0; check:rules 1                          | **YEŞİL**             |
| M3b  | check:rules              | `it.concurrent.skip(...)`                                                       | kırmızı         | check:rules 0                                                                  | YEŞİL                 |
| M4   | ESLint                   | `export const m: any = 1`                                                       | kırmızı         | lint 1 (`no-explicit-any`)                                                     | kırmızı               |
| M5   | ESLint                   | aynısı + `// eslint-disable-next-line …no-explicit-any`                         | (tasarım)       | lint 0                                                                         | YEŞİL                 |
| M5b  | ESLint                   | dosya başına `/* eslint-disable */` + `any`                                     | kırmızı         | lint 0                                                                         | **YEŞİL**             |
| M6   | ESLint                   | `stopPlayback();` (bekletilmeyen Promise)                                       | kırmızı         | lint 0, tsc 0                                                                  | YEŞİL                 |
| M7   | ESLint (react-hooks)     | `useIdle`'da `[delayMs]` → `[]`                                                 | kırmızı         | lint 1 (uyarı, `--max-warnings 0`)                                             | kırmızı               |
| M8   | tsc                      | `function m(x) {…}` (örtük any)                                                 | kırmızı         | tsc 2 (TS7006)                                                                 | kırmızı               |
| M9   | ESLint                   | `// @ts-ignore` + tür hatası                                                    | kırmızı         | lint 1 (`ban-ts-comment`)                                                      | kırmızı               |
| M9b  | ESLint / tsc             | `// @ts-expect-error: deneme amaçlı` + tür hatası                               | (tasarım)       | lint 0, tsc 0                                                                  | YEŞİL                 |
| M9c  | ESLint / tsc             | `"a" as unknown as number`                                                      | (tasarım)       | lint 0, tsc 0                                                                  | YEŞİL                 |
| M10  | Prettier                 | `.ts`, `ci.yml`, `docs/*.md`, `scripts/*.mjs` biçim bozma                       | kırmızı         | dördü de 1                                                                     | kırmızı               |
| M10b | ESLint (scripts)         | `.mjs`'te tanımsız değişken                                                     | kırmızı         | lint 1 (`no-undef`)                                                            | kırmızı               |
| M10c | tsc / ESLint (scripts)   | `.mjs`'te `"a".toFixed(2)` (tür hatası)                                         | kırmızı         | lint 0, tsc 0 (scripts tür denetimi dışında)                                   | YEŞİL                 |
| M11a | check:licenses           | geliştirme paketi (vitest) `AGPL-3.0-only`                                      | kırmızı         | 1                                                                              | kırmızı               |
| M11b | check:licenses           | pakete giren `react` `BlueOak-1.0.0` (yalnızca geliştirmede izinli)             | kırmızı         | 1 "(pakete girer)"                                                             | kırmızı               |
| M11c | check:licenses           | `(MIT OR Apache-2.0) AND BUSL-1.1`                                              | kırmızı         | 1                                                                              | kırmızı               |
| M11d | check:licenses + hepsi   | `deny.toml` allow'a `AGPL-3.0-only` (+SSPL, BUSL) ekle, `react` AGPL yap        | kırmızı         | check:licenses 0, format 0, docs 0, rules 0, `vitest scripts/lib` 0            | **YEŞİL**             |
| M11e | check:licenses           | küçük harfle `mit`                                                              | (yanlış alarm?) | 1 (katı; kabul edilebilir)                                                     | kırmızı               |
| M12a | check:audio              | ID3'lü MP3, adı `docs/kapak.bin`                                                | kırmızı         | 1 "MP3 (ID3)"                                                                  | kırmızı               |
| M12b | check:audio              | etiketsiz MP3, adı `docs/veri.bin`                                              | kırmızı         | 1 "MPEG ses"                                                                   | kırmızı               |
| M12c | check:audio              | ADTS AAC (gerçek, ffprobe: aac 19,8 sn), adı `docs/veri.dat`; geçmişte de       | kırmızı         | 0 / `--history` 0                                                              | **YEŞİL**             |
| M12d | check:audio              | MP3 bir `.zip` içinde                                                           | (sınır)         | 0                                                                              | YEŞİL                 |
| M12e | check:audio              | başında 512 bayt sıfır dolgu olan MP3                                           | kırmızı         | 0                                                                              | **YEŞİL**             |
| M12f | check:audio --history    | 728 KB FLAC `src-tauri/tests/data/sarki.flac` commit, sonra sil                 | kırmızı         | eklenmiş hali 1; silindikten sonra `--history` **0**                           | **YEŞİL**             |
| M12g | check:audio --history    | aynısı `docs/sarki.flac` ile                                                    | kırmızı         | 1                                                                              | kırmızı               |
| M13a | check:docs               | yeni `src-tauri/src/library/tagger.rs`                                          | kırmızı         | 1                                                                              | kırmızı               |
| M13b | check:docs               | yeni `src-tauri/src/library/cache.rs` (ad başka klasörde var)                   | kırmızı         | 0                                                                              | YEŞİL                 |
| M13c | check:docs               | yeni `src/components/YeniPanel.tsx`                                             | (kapsam?)       | 0 (bileşenler denetlenmiyor)                                                   | YEŞİL                 |
| M13d | check:docs               | eski hesap linki `src-tauri/src/lib.rs`'te                                      | kırmızı         | 0                                                                              | YEŞİL                 |
| M13e | check:docs               | eski hesap linki `index.html`'de                                                | kırmızı         | 0                                                                              | YEŞİL                 |
| M13f | check:docs               | eski hesap linki `src/lib/format.ts`'te                                         | kırmızı         | 1                                                                              | kırmızı               |
| M13g | check:docs               | README'de `%APPDATA%\io.github.yanlis.lyraska`                                  | kırmızı         | 1                                                                              | kırmızı               |
| M13i | check:docs               | README'de `…\AppData\Roaming\io.github.yanlis.lyraska`                          | kırmızı         | 0                                                                              | YEŞİL                 |
| M13h | check:docs               | `public/lisanslar/GPL-3.0.txt` ≠ LICENSE                                        | kırmızı         | 1                                                                              | kırmızı               |
| M14a | check:commands           | Rust'ta `track_cover` → `track_cover_v2`                                        | kırmızı         | 1 (iki yönlü)                                                                  | kırmızı               |
| M14b | check:commands           | Rust parametresi `PathBuf` → `f64`                                              | kırmızı         | 1                                                                              | kırmızı               |
| M14c | check:commands           | `export const coverByIndex = (path: number) => invoke("track_cover", { path })` | kırmızı         | 0 (önceki `function`'ın `path: string`'i okunur), tsc 0                        | **YEŞİL**             |
| M14d | check:commands           | `import { invoke as call }` ile olmayan komut                                   | kırmızı         | 0, tsc 0, lint 0                                                               | **YEŞİL**             |
| M14e | check:commands           | Rust dönüşü `Option<String>` → `Option<u32>`                                    | kırmızı         | 1                                                                              | kırmızı               |
| M14f | check:commands           | Rust'a yeni zorunlu parametre                                                   | kırmızı         | 1                                                                              | kırmızı               |
| M15a | check:rules              | başka dosyada `#[allow(unsafe_code, reason=…)]`                                 | kırmızı         | 1                                                                              | **YEŞİL** (CI'da yok) |
| M15b | check:rules              | `#[expect(unsafe_code, reason=…)]`                                              | kırmızı         | 0                                                                              | YEŞİL                 |
| M15c | check:rules              | `#[allow(clippy::all, unsafe_code, reason=…)]`                                  | kırmızı         | 0                                                                              | YEŞİL                 |
| M15d | check:rules              | `#[cfg_attr(not(windows), ignore)]`                                             | kırmızı         | 0                                                                              | YEŞİL                 |
| M15e | check:rules              | gerekçesiz `#[ignore]`                                                          | kırmızı         | 1                                                                              | **YEŞİL** (CI'da yok) |
| M15f | check:rules              | CSP `connect-src`'e `https://api.ornek.com`                                     | kırmızı         | 1                                                                              | **YEŞİL** (CI'da yok) |
| M15g | check:rules              | izinlere `shell:allow-open`                                                     | kırmızı         | 1                                                                              | **YEŞİL** (CI'da yok) |
| M15h | check:rules              | `fetch("https://api.ornek.com/x")` arayüzde                                     | kırmızı         | **0** (regex hatası)                                                           | YEŞİL                 |
| M15i | check:rules              | `fetch("//api.ornek.com/x")`                                                    | kırmızı         | 0                                                                              | YEŞİL                 |
| M15j | check:rules / check:docs | Rust'ta `std::net::TcpStream::connect(...)`                                     | kırmızı         | 0 / 0                                                                          | YEŞİL                 |
| M16a | check:notices            | `UCUNCU-TARAF.txt`'te bir lisans satırını elle değiştir                         | kırmızı         | 1                                                                              | kırmızı               |
| M18  | .gitignore / check:audio | `docs/SARKI.MP3` (büyük harf)                                                   | yok sayılmalı   | git onu yok saymıyor (`??`); check:audio 1                                     | kırmızı               |
| R1   | Clippy (okuma)           | kütüphane kodunda `.unwrap()`                                                   | kırmızı         | `unwrap_used = "warn"` + CI `-D warnings` → kırmızı (Kesin)                    | kırmızı               |
| R2   | Clippy (okuma)           | `#[allow(clippy::unwrap_used, reason = "…")]`                                   | (tasarım)       | yeşil; bugün yalnızca `examples/` ve `tests/` kullanıyor                       | YEŞİL                 |
| R3   | Clippy (okuma)           | ses yolunda dizi indeksleme `a[i]`                                              | kırmızı?        | yeşil: `indexing_slicing` açık değil                                           | YEŞİL                 |
| R4   | ts-rs adımı (okuma)      | elle düzenlenmiş ya da artakalan `src/lib/bindings/*.ts`                        | kırmızı         | `rm -f` + yeniden üretme + `git status --porcelain` → kırmızı (Kesin)          | kırmızı               |
| R5   | rustc (okuma)            | başka modülde `#[allow(unsafe_code, reason=…)] unsafe {…}`                      | kırmızı         | yeşil: `deny` (forbid değil) yerelde `allow` ile açılır; tek bekçi check:rules | **YEŞİL**             |

## 3. Bulgular

### KAP-01 — `check:rules` hiçbir iş akışında çalışmıyor; dört proje kuralının CI bekçisi yok

- Önem: **Yüksek** · Güven: Kanıtlandı · Standart: OpenSSF Scorecard "CI-Tests"; ISO/IEC 25010 bakım kolaylığı (test
  edilebilirlik); SLSA v1.0 Build L1 (yapı süreci belgelendiği gibi değil)
- Yer: `.github/workflows/ci.yml:41-59` (arayüz işinin adımları), `package.json:21`, `README.md:89-94`,
  `docs/MIMARI.md:307`, `CLAUDE.md:277`
- Kanıt:
  ```
  $ grep -c "check:rules" .github/workflows/*.yml
  ci.yml:0  guvenlik-taramasi.yml:0  test-surumu.yml:0
  $ git log --oneline -S "check:rules" -- .github/workflows/ci.yml     # (boş: CI'ya hiç eklenmemiş)
  ```
  README.md:89 "Checks (the same ones CI runs …)" başlığının altında
  `npm run check:commands && npm run check:licenses && npm run check:rules && npm run check:docs` yazıyor. Betik
  6904ead'de package.json'a eklendi, ci.yml'e eklenmedi. Mutasyonlar:
  - M1: bozuk bir test `it.skip` ile susturuldu. `CI=true vitest run` → exit 0, `lint` → 0, `check:rules` → 1.
  - M3: bozuk test `formatTests.ts` adlı dosyada. Vitest dosyayı hiç koşmuyor (exit 0); yalnızca check:rules
    kırmızı.
  - M15a, M15e, M15f, M15g: başka modülde `#[allow(unsafe_code)]`, gerekçesiz `#[ignore]`, CSP'ye uzak adres, yeni
    Tauri izni. Dördünü de yalnızca check:rules yakalıyor.
  - Başka bir yerde yedek bekçi aradım: Rust testlerinde de `src/**/*.test.*` içinde de CSP, izin ya da
    `unsafe_code` geçen bir test yok (`grep -rn "csp\|capabilit\|unsafe_code"`). Yalnızca wasapi.rs'teki iki
    `#[allow]` çıkıyor.
- Senaryo ve etki: Bir yapay zekâ oturumu kırmızı bir testi geçici olarak `it.skip`'ler ya da bir özellik için
  CSP'ye bir adres ekler. CLAUDE.md'nin "push'tan önce" listesinde ve "Komutlar" tablosunda `check:rules` olmadığı
  için oturum betiği yerelde çalıştırmaz. CI yeşil kalır, PR birleşir ve test sürümü yayımlanır. CLAUDE.md'deki
  "Testler atlanmaz, devre dışı bırakılmaz" kuralı, "unsafe yalnızca ilgili modülde" kuralı ve sıkı CSP sözü
  (çevrimdışı) CI tarafından zorlanmıyor. MIMARI.md ise "Elle hatırlanması gereken kural yoktur" diyor.
- Çürütme denemesi:
  - Kısmi korumalar var. Vitest, CI'da (`CI=true`) `.only`'yi reddediyor (M2 kırmızı). `allow_attributes_without_reason`
    her `#[allow]`'a gerekçe zorunlu kılıyor, ama yasaklamıyor. tauri-build bilinmeyen bir izni derlemede
    reddediyor, ama eklentiyi de ekleyen bir PR'ı reddetmiyor. `check:scenes` CSP'yi uyguluyor, ama yalnızca CSP
    sahneleri bozacak kadar sıkılaşırsa kırmızı oluyor; gevşerse yeşil kalıyor.
  - Hiçbiri `.skip`'i, CSP'nin gevşemesini ya da `unsafe` istisnasının yayılmasını yakalamıyor. Bulgu geçerli.
  - Bugün kuralların hiçbiri çiğnenmiş değil (taban çizgisinde check:rules yeşil); hasar henüz gerçekleşmedi.
- Öneri: `ci.yml` arayüz işinde, `check:docs`'tan sonra şu adımı ekle:
  `- name: Proje kuralları (unsafe, atlanan test, CSP, izinler)` / `run: npm run check:rules`. Ayrıca CLAUDE.md'de
  "push'tan önce" maddesine ve "Komutlar" tablosuna `check:rules` ve `check:docs` eklensin.

### KAP-02 — `main` korumasız: "CI yeşil olmadan birleştirme yapılmaz" kuralını GitHub zorlamıyor _(proje sahibinin ayarına bağlı)_

- Önem: Orta · Güven: Kanıtlandı · Standart: OpenSSF Scorecard "Branch-Protection"; SLSA v1.0 Source (iki kişi
  incelemesi/korunan dal); GitHub Docs "About protected branches"
- Yer: GitHub depo ayarları; `CLAUDE.md:277`
- Kanıt:
  ```
  $ gh api repos/lahmacunveayran/Lyraska/branches/main --jq '{protected, protection}'
  {"protected":false,"protection":{"enabled":false,"required_status_checks":{"checks":[],"contexts":[],"enforcement_level":"off"}}}
  $ gh api repos/lahmacunveayran/Lyraska/rules/branches/main
  []
  ```
- Senaryo ve etki: Birleştirme araçları olan bir oturum, CI kırmızıyken (ya da CI bitmeden) PR'ı birleştirebilir.
  Doğrudan `main`'e push da mümkün. Yayın yine `main` push'unun CI'sı başarılıysa çalıştığı için kırmızı kod
  otomatik yayımlanmaz. Ama `main` bozulur ve sonraki PR'lar bozuk bir tabana kurulur. KAP-07 ile birleşince
  kırmızı `main` elle yayımlanabilir.
- Öneri: GitHub → Settings → Rules → Rulesets → New branch ruleset. Hedef: `main`. Şunlar açılsın: "Require a pull
  request before merging", "Require status checks to pass" (CI'nın beş işi: Arayüz, Çekirdek, Güvenlik
  uyarıları, Sahneler, Windows) ve "Block force pushes".

### KAP-03 — "Program internete bağlanmaz" kapısı ölü kod; Rust tarafına hiç bakmıyor

- Önem: Orta · Güven: Kanıtlandı · Standart: OWASP ASVS v4 14.2 (bağımlılık) / V1.14 (yapılandırma); Tauri 2
  güvenlik modeli (CSP)
- Yer: `scripts/check-rules.mjs:76-77`
- Kanıt:

  ```js
  const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
  if (/https?:\/\//.test(code)) {
  ```

  "Yorum temizliği" satırdaki ilk `//`'dan sonrasını siliyor. `"https://x"` → `"https:` kalıyor, eşleşme olmuyor.
  Bu yüzden kural hiçbir adresi yakalayamıyor:
  - M15h: `fetch("https://api.ornek.com/x")` → check:rules 0.
  - M15i: `fetch("//api.ornek.com/x")` → 0.
  - M15j: Rust'ta `std::net::TcpStream::connect(...)` → check:rules 0, check:docs 0.

  `deny.toml`'da ağ crate'lerini (reqwest, ureq, hyper vb.) yasaklayan bir `[bans] deny` listesi de yok.

- Senaryo ve etki: Bir oturum "sözleri internetten indir" ya da "güncelleme denetle" özelliğini Rust'ta yazar. Rust
  ağ trafiği CSP'ye tabi değil; hiçbir kapı kırmızı olmaz. Arayüz tarafında asıl koruma CSP (`connect-src ipc:
http://ipc.localhost`). Onun denetimi de KAP-01 yüzünden CI'da değil.
  Bugünkü durum temiz: arayüzde ve Rust'ta yorum dışı uzak adres yok, Cargo.toml'da ağ crate'i yok.
- Öneri:
  - check-rules.mjs:76'da yorum ayıklamayı `//`'ın önünde `:` olmayan durumla sınırla:
    `line.replace(/(^|[^:])\/\/.*$/, "$1")`. Bunun için M15h'i yakalayan bir `scripts/lib` testi ekle.
  - `deny.toml`'a `[bans] deny = [{ crate = "reqwest" }, { crate = "ureq" }, { crate = "hyper" }, { crate = "tauri-plugin-http" }, { crate = "tauri-plugin-updater" }]`
    ekle.
  - check:rules'a `src-tauri/src` için `std::net` / `TcpStream` / `UdpSocket` taraması ekle.

### KAP-04 — Geçmiş taraması izinli klasöre giren gerçek bir şarkıyı kaçırıyor

- Önem: Orta · Güven: Kanıtlandı · Standart: GPL-3.0 dağıtım yükümlülükleri ve telif (dağıtılan depo geçmişi)
- Yer: `scripts/check-no-audio.mjs:84`
- Kanıt:
  ```js
  if ((format || hasAudioExtension(path)) && !path.startsWith(ALLOWED_DIR)) {
  ```
  Geçmiş taramasında izinli klasördeki bloblar için boyut ve "tarifi README'de mi" denetimleri yok. M12f:
  728 KB FLAC `src-tauri/tests/data/sarki.flac` olarak eklendiğinde ağaç denetimi kırmızı (262144 bayt sınırı).
  Ama "ses ekle" + "ses sil" iki commit olarak gelince `check:audio -- --history` → exit 0. Aynı dosya
  `docs/` altında olunca (M12g) kırmızı.
- Senaryo ve etki: Bir oturum kodek testi için gerçek bir şarkıdan kesit koyar, sonra fark edip aynı PR'da siler.
  CI yalnızca PR'ın ucunu denetlediği için yeşil kalır. Birleştirme commit'le ya da rebase ile yapılırsa telifli
  ses `main` geçmişinde kalıcı olur. Squash birleştirmede bile GitHub'daki `refs/pull/N/head`'de kalır. Betiğin
  kendi yorumu tam olarak bu durumu yakalamayı vaat ediyor (satır 7-8).
- Öneri: `check-no-audio.mjs:84`'ten önce izinli klasördeki geçmiş blobları için `size > MAX_TEST_AUDIO_BYTES`
  ise sorun yaz. Ayrıca `paths` eşlemi her blob için bütün yolları tutsun (bugün ilk görülen yol tutuluyor).

### KAP-05 — Sahne denetiminin sahne listesi elle yazılmış; yeni bir sahne parlama ölçümüne girmiyor

- Önem: Orta · Güven: Kesin · Standart: WCAG 2.2 SC 2.3.1 (üç parlama)
- Yer: `scripts/check-scenes.mjs:394-432` (`SCENES`), `:495-500` (`ALL_SCENES`); karşılığı `src/lib/scene.ts:7-21`,
  `src/lib/shaderScene.ts:33`
- Kanıt: Listede `"sky","highway","drive"`, on galeri sahnesi, `"spectrum","vu"` elle yazılı. Programın listesi ise
  `SCENES = [...CLASSIC_SCENES, ...GALLERY_SCENES]` ve `SHADER_SCENES`'ten türüyor. İkisini karşılaştıran bir test
  yok: `src/lib/sceneCheck.test.ts` yalnızca sahte çekirdeğin alanlarını denetliyor. Bugün iki liste eşit (15
  sahne).
- Senaryo ve etki: `SHADER_SCENES`'e on birinci bir sahne eklenir, check-scenes.mjs'e eklenmez. "Hiçbir sahne
  saniyede 3'ten fazla parlamaz — `check:scenes` (CI)" sözü (MIMARI.md) yeni sahne için ölçülmeden yeşil kalır.
  Sahnenin kendi Vitest testi varsa kısmen korunur; tarayıcıdaki parlaklık ölçümü yapılmaz.
- Öneri: `sceneCheck.test.ts`'e bir test ekle: check-scenes.mjs'teki `id: "…"` ve `["…", "…"]` kimlikleri
  `SCENES.map(s => s.id)` ile aynı küme olsun.

### KAP-06 — Lisans politikası kendi kendine düzenlenebiliyor: `deny.toml`'a AGPL eklemek bütün kapıları yeşil bırakıyor

- Önem: Orta · Güven: Kanıtlandı · Standart: SPDX; GPL-3.0 uyumluluğu; OpenSSF "License"
- Yer: `src-tauri/deny.toml:16-38`, `scripts/lib/licenses.mjs:9` (`allowedFromDenyToml`)
- Kanıt: M11d. `deny.toml`'un allow listesine `"AGPL-3.0-only"`, `"SSPL-1.0"`, `"BUSL-1.1"` eklendi ve `react`'in
  lisansı AGPL yapıldı. Sonuç: `check:licenses` → "hepsi izin listesinde" (0); `format:check`, `check:docs`,
  `check:rules` ve `vitest run scripts/lib` → 0. CLAUDE.md'deki kesin yasaklı lisans listesinin (AGPL, SSPL, BUSL,
  NonCommercial vb.) kodda bir karşılığı yok.
- Senaryo ve etki: Bir oturum, ihtiyaç duyduğu bir bağımlılık için "listeye eklemek yeter" der ve deny.toml'u
  değiştirir. Yazılımcı olmayan proje sahibi diff'i okumaz. Yasaklı lisanslı kod pakete girer.
- Öneri: `scripts/lib/licenses.test.mjs`'e bir test ekle: depodaki deny.toml'u okusun ve hiçbir girdi
  `/AGPL|SSPL|BUSL|NC|Commons-Clause|Elastic|PolyForm-Noncommercial/i` ile eşleşmesin.

### KAP-07 — Elle başlatılan "Test sürümü" CI sonucuna bakmadan yayımlıyor _(proje sahibinin ayarına bağlı)_

- Önem: Orta · Güven: Kesin · Standart: SLSA v1.0 Build L2/L3 (yayımlanan yapı doğrulanmış kaynaktan); OpenSSF
  "Dangerous-Workflow" ruhu
- Yer: `.github/workflows/test-surumu.yml:26`, `:46`
- Kanıt:
  ```yaml
  (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main') ||
  ```
  Bu dalda `workflow_run.conclusion == 'success'` ya da commit'in CI durumu sorgulanmıyor; iş dosyasında
  `check-runs` / `commits/…/status` çağrısı yok.
- Senaryo ve etki: `main`'in CI'sı kırmızı (ör. ci.yml'deki "Güvenlik uyarıları" işi yeni bir RustSec açığı
  yüzünden; iş yorumu "Bu iş kırmızıysa test sürümü yayımlanmaz" diyor). Sahip "test sürümünü yenile" der, oturum
  elle başlatır. Açıklı ya da testleri kırık kurulum dosyası sabit linke gider. Yazma yetkisi gerektirdiği için
  dışarıdan tetiklenemez.
- Öneri: `derle` işinin başına bir adım ekle:
  `gh api "repos/$GH_REPO/commits/$SHA/check-runs" --jq '[.check_runs[] | select(.app.slug=="github-actions") | .conclusion] | all(. == "success")'`
  sonucu `true` değilse `exit 1`. Ya da `workflow_dispatch`'i kaldır.

### KAP-08 — check:rules'un kalıpları kolayca atlatılıyor (KAP-01 düzeltildikten sonra önem kazanır)

- Önem: Düşük · Güven: Kanıtlandı
- Yer: `scripts/check-rules.mjs:35`, `:42`, `:57`
- Kanıt: Kural yalnızca `allow(` ardından hemen `unsafe_code` geldiğinde, `#[ignore]`'un tam yazımında ve
  `(describe|it|test)\.(skip|…)` biçiminde tetikleniyor. Şu biçimlerin hepsi check:rules 0 verdi:
  - M15b: `#[expect(unsafe_code, reason = "…")]`
  - M15c: `#[allow(clippy::all, unsafe_code, reason = "…")]`
  - M15d: `#[cfg_attr(not(windows), ignore)]`
  - M3b: `it.concurrent.skip(…)`

  `unsafe_code` `forbid` değil `deny` olduğu için yerel bir `allow`/`expect` onu gerçekten açar (R5); bu durumda
  tek bekçi bu betik.

- Öneri:
  - unsafe kalıbını `/\b(allow|expect)\s*\([^)]*\bunsafe_code\b/` yap.
  - ignore kalıbını `/\bignore\b(?!\s*=)/` yap (öznitelik içinde).
  - JS kalıbını `/\b(describe|it|test)(\.\w+)*\.(skip|only|todo|skipIf|runIf)\b/` yap.
  - Her biri için `scripts/lib`'e test ekle.

### KAP-09 — check:commands'ın tür çıkarımı en yakın `function`'a bakıyor; takma adlı `invoke` görülmüyor

- Önem: Düşük · Güven: Kanıtlandı
- Yer: `scripts/lib/commands.mjs:217`, `:234`
- Kanıt:
  - M14c: `getTrackCover(path: string)`'in hemen altına
    `export const coverByIndex = (path: number) => invoke<string | null>("track_cover", { path })` eklendi.
    check:commands "56 çağrı … eşleşiyor" dedi; değeri yukarıdaki fonksiyonun `string` parametresinden okudu.
  - M14d: `import { invoke as call }` + `call("olmayan_komut")` → check:commands, tsc ve lint üçü de 0.

  `invoke`'un argümanı `InvokeArgs` (gevşek tür) olduğu için tsc de yakalamıyor.

- Senaryo ve etki: backend.ts'in bugünkü üslubu (her çağrı kendi `function`'ında) korunduğu sürece sorun yok.
  Başka bir üslup gelirse, bir düğmeye basılınca ortaya çıkan çalışma anı hatası kapıdan geçer.
- Öneri: `enclosing` hesabında fonksiyonun kapanış indeksini de tut (`f.at < m.index && m.index < f.close`). Ok
  fonksiyonu parametrelerini de ayrıştır. ESLint'e `no-restricted-imports` ile `@tauri-apps/api/core`'dan
  `invoke`'u yalnızca `src/lib/backend.ts`'te izin ver.

### KAP-10 — Denetim listeleri birbirini tutmuyor (CLAUDE.md ≠ README ≠ ci.yml ≠ MIMARI.md)

- Önem: Düşük · Güven: Kesin · Standart: ISO/IEC 25010 bakım kolaylığı
- Yer: `CLAUDE.md:252` ve "Komutlar" tablosu; `README.md:89-100`; `ci.yml`; `docs/MIMARI.md:307-378`
- Kanıt:

  | Denetim                           | CLAUDE.md "push'tan önce" | CLAUDE.md Komutlar | README "same ones CI runs" | ci.yml  |
  | --------------------------------- | ------------------------- | ------------------ | -------------------------- | ------- |
  | biçim, lint, tür, test, lisans    | var                       | var                | var                        | var     |
  | check:commands                    | yok                       | var                | var                        | var     |
  | check:docs                        | yok                       | **yok**            | var                        | var     |
  | check:rules                       | yok                       | **yok**            | var                        | **yok** |
  | check:audio --history             | yok                       | var (geçmişsiz)    | var                        | var     |
  | check:notices                     | yok                       | var                | var                        | var     |
  | ts-rs bağları güncel              | yok                       | (açıklamada)       | var                        | var     |
  | npm audit / cargo deny advisories | yok                       | yok                | var                        | var     |

  MIMARI.md'nin kural tablosunda CSP, izinler, atlanan test ve test dosyası adı kuralları hiç yok. "unsafe" satırı
  denetleyen olarak check:rules'u değil "belgeli" olmayı yazıyor.

- Senaryo ve etki: CLAUDE.md'ye uyan bir oturum yerelde `check:docs`, `check:commands` ve `check:audio`'yu
  çalıştırmaz. Bunlar CI'da yakalanır (yalnızca vakit kaybı). `check:rules` ise hiçbir yerde yakalanmaz (KAP-01).
- Öneri: Tek kaynak: `package.json`'a `"check": "npm run format:check && npm run lint && … && npm run check:rules"`
  ekle. CLAUDE.md, README ve ci.yml bu tek komutu çağırsın ya da ona atıf yapsın.

### KAP-11 — ESLint türe duyarlı değil; satır içi susturma sınırsız

- Önem: Düşük · Güven: Kanıtlandı
- Yer: `eslint.config.js:17-27`
- Kanıt:
  - M6: bekletilmeyen `stopPlayback();` → lint 0.
  - M5b: dosya başına `/* eslint-disable */` + `any` → lint 0.
  - M9b: açıklamalı `@ts-expect-error` ve M9c `as unknown as` → 0.

  Bugün `src/`'de hiç `eslint-disable` / `@ts-…` yorumu yok. Susturmaya ihtiyaç olmadığı için sınırlamak ucuz.
  Bekletilmeyen Promise'in reddi `errorReporting.ts:59`'daki `unhandledrejection` dinleyicisiyle günlüğe
  düşüyor; etki bu yüzden sınırlı.

- Öneri: `tseslint.configs.recommendedTypeChecked` (ya da yalnızca `@typescript-eslint/no-floating-promises`) ve
  `parserOptions.projectService: true`. `linterOptions: { noInlineConfig: true }` ya da
  `eslint-plugin-eslint-comments`'in `no-unlimited-disable` kuralı.

### KAP-12 — Clippy: "panic yok" yalnızca makrolar için; `indexing_slicing` kapalıyken ayarı yazılmış

- Önem: Düşük · Güven: Kesin
- Yer: `src-tauri/Cargo.toml` `[lints.clippy]`, `src-tauri/clippy.toml:4`
- Kanıt: `clippy.toml:4` `allow-indexing-slicing-in-tests = true` diyor, ama `[lints.clippy]`'de `indexing_slicing`
  yok, yani bu ayar hiçbir şey yapmıyor. `unreachable` bilinçli olarak kapalı (gerekçe yorumu var). Ses yolundaki
  `eq.rs:345` `self.gains[i]` gibi indeksler sınır dışına çıkarsa sürüm derlemesinde `panic = "abort"` ile program
  kapanır. CLAUDE.md "Ses çıkış geri çağrısında … panic yoktur" diyor, MIMARI.md bunu Clippy'ye bağlıyor.
  `unwrap`/`expect`/`panic!` tarafı gerçek: kütüphane kodunda `#[cfg(test)]` dışında hiç yok (tarandı).
- Öneri: Ya `indexing_slicing = "warn"`'ı yalnızca `audio/render.rs`, `limiter.rs`, `eq.rs` gibi ses yolu
  modüllerinde aç (`#![warn(clippy::indexing_slicing)]`), ya da clippy.toml'daki ölü satırı silip MIMARI'ye
  "indeksleme panikleri kapsam dışı" yaz.

### KAP-13 — check:docs'un kör noktaları

- Önem: Düşük · Güven: Kanıtlandı
- Yer: `scripts/check-docs.mjs:56`, `:63`, `:76-82`
- Kanıt: Şu mutasyonların hepsi check:docs 0 verdi:
  - M13b: başka klasörde aynı adlı dosya (`library/cache.rs`); ad aramasında klasöre bakılmıyor.
  - M13c: `src/components` denetlenmiyor.
  - M13d/M13e: eski hesap linki Rust kodunda ya da `index.html`'de; ikisi de tarama listesi dışında.
  - M13i: `AppData\Roaming\…` yazımı; regex yalnızca `%APPDATA%\` biçimini tanıyor.
- Öneri: Ad aramasını `\b<klasör>/` ile ya da ağaç bloğunda klasör başlığının altında yap. `linkScan`'e
  `src-tauri/src/**`, `index.html`, `src-tauri/examples` ekle. Klasör regex'ine
  `AppData\\(Roaming|Local)\\([\w.-]+)` seçeneğini ekle.

### KAP-14 — Ses imzası tanıması: ADTS AAC, dolgulu MP3 ve arşiv içi ses kaçıyor

- Önem: Düşük · Güven: Kanıtlandı
- Yer: `scripts/lib/audio.mjs:96-103`
- Kanıt: Dosyalar 0 verdi:
  - M12c: gerçek ADTS AAC (`ff f1 50 40`; ffprobe `format_name=aac`, 19,8 sn), `.dat` adıyla; geçmişte de.
    Neden: ADTS'te katman bitleri `00`, kod `layer !== 0` istiyor.
  - M12e: başında 512 bayt sıfır olan MP3.
  - M12d: `.zip` içinde MP3.

  Uzantısı değişmemiş `.aac` dosyası `.gitignore`'a da, uzantı denetimine de takılıyor; risk yalnızca adı
  değiştirilmiş dosyada.

- Öneri: `bytes[0]===0xff && (bytes[1]&0xf6)===0xf0` → "AAC (ADTS)". MPEG çerçevesini ilk 4 KB'ta ara.
  `PK\x03\x04` arşivlerinde ses uzantılı girdileri listeleyip reddet (ya da arşivi depoda yasakla).

### KAP-15 — `scripts/*.mjs` tür denetimi dışında; tsconfig'deki `eslint.config.js` etkisiz

- Önem: Bilgi · Güven: Kanıtlandı
- Yer: `tsconfig.json` (`include: ["src", "vite.config.ts", "eslint.config.js"]`, `allowJs` yok)
- Kanıt: M10c: `scripts/lib/audio.mjs`'e `"a".toFixed(2)` → lint 0, tsc 0. `allowJs` olmadan `eslint.config.js`'i
  `include`'a koymak bir şey denetletmiyor. Kapı betiklerinin mantığı `scripts/lib/*.test.mjs` ile sınanıyor, bu
  yüzden etki küçük.
- Öneri: Ayrı bir `tsconfig.scripts.json` (`allowJs`, `checkJs`, `include: ["scripts", "eslint.config.js"]`).
  `typecheck` betiğine `&& tsc -p tsconfig.scripts.json` ekle.

### KAP-16 — `.gitignore` büyük harfli uzantıları Linux'ta yok saymıyor

- Önem: Bilgi · Güven: Kanıtlandı
- Yer: `.gitignore:21-71`
- Kanıt: M18: `docs/SARKI.MP3` için `git status` → `?? docs/SARKI.MP3` (yok sayılmadı). `check:audio` ise
  büyük-küçük harf ayırmadan yakaladı (1). Windows'ta `core.ignorecase=true` varsayılan olduğu için sahibinin
  makinesinde sorun yok.
- Öneri: Gerek yok; istenirse `*.[mM][pP]3` biçimi ya da yalnızca check:audio'ya güvenildiğine dair bir yorum.

## 4. Olası riskler (kanıtı yetmeyenler)

- **Vitest yerelde ara sıra çöküyor:** İlk yerel `vitest run` "Worker exited unexpectedly … during starting state"
  ile 48 hata verdi. Aynı komut iki kez daha temiz geçti (51/398). Makinede başka bir derleme yük bindiriyordu.
  Kaynak yarışı mı, kararsız test mi, belirlenemedi. CI'da gözlenmedi.
- **ts-rs adımı yalnızca `TS` türeten tipleri kapsıyor:** Bir komutun dönüş tipi `#[derive(TS)]` almazsa bağ
  dosyası üretilmez. Arayüzde elle yazılan aynı adlı bir tip, check:commands'tan (yalnızca adları karşılaştırıyor)
  geçer. Bugün komutlarda kullanılan bütün tiplerin bağ dosyası var (25 tip tek tek denetlendi; `TrackRow`
  `LibraryTrack` adıyla). Bunu zorlayan bir kapı yok.
- **zizmor `--offline` çalışıyor:** Çevrim içi denetimler (bilinen açıklı eylem sürümleri, sahte commit) kapalı.
  Dependabot bunu kısmen karşılıyor. İş akışı denetiminin alanı.
- **Şarkı sözü (`.lrc`) ve kapak resimleri:** Telifli olabilirler, ama ne `.gitignore` ne check:audio bunları
  kapsıyor. Kural yalnızca "ses dosyası" diyor; işaretleme sırasında yanlışlıkla commit edilebilirler.
- **`windows` işindeki "Gerçek ses aygıtıyla deneme" adımı CI'da her zaman yeşil ("ATLANDI").** Belgelenmiş bir
  durum; kapı sayılmamalı.

## 5. Temiz bulunanlar

- **Prettier:** `.ts`, `.yml`, `.md` ve `.mjs` bozulmalarının dördü de kırmızı (M10). `.prettierignore` yalnızca
  üretilen ve dışarıdan gelen dosyaları dışarıda tutuyor.
- **ESLint:** `no-explicit-any` (M4), `ban-ts-comment` (M9), react-hooks `exhaustive-deps` (`--max-warnings 0`
  sayesinde, M7) ve betiklerde `no-undef` (M10b) gerçek. `src/`'de hiç susturma yorumu yok.
- **tsc:** `strict`, `noUncheckedIndexedAccess`, `noUnused*` açık; örtük `any` kırmızı (M8). Test dosyaları da
  tür denetiminde.
- **Vitest:** `scripts/lib/*.test.mjs` de koşuyor (vitest list'te var). CI'da `.only` kırmızı (M2; GitHub `CI=true`
  verir).
- **check:licenses:** SPDX `AND/OR/WITH` doğru ayrıştırılıyor. Geliştirme ile pakete giren ayrımı doğru (M11a-c).
  `SEE LICENSE IN` ve boş alan reddediliyor. Lisansı eksik isteğe bağlı paket yok.
- **check:audio:** ID3'lü ve etiketsiz MP3 adı değişse de yakalanıyor (M12a-b). İzinli klasör dışındaki geçmiş
  yakalanıyor (M12g). Büyük harfli uzantı yakalanıyor (M18). `.gitignore` ile uzantı listesinin aynı olduğu
  testle denetleniyor.
- **check:commands:** Komut adı, parametre türü, yeni zorunlu parametre ve dönüş türü değişikliklerinin hepsi
  kırmızı (M14a, b, e, f).
- **check:docs:** Yeni modül, `src/`'de eski link, yanlış `%APPDATA%` adı ve GPL metni farkı kırmızı (M13a, f, g, h).
- **check:notices:** Elle değişiklik kırmızı (M16a). Çıktı belirlenimci; yerelde de CI'daki gibi "güncel" çıktı.
- **ts-rs adımı:** `rm -f src/lib/bindings/*.ts` sonra `cargo test` sonra `git status --porcelain` zinciri hem elle
  düzenlemeyi hem artakalan dosyayı hem eksik dosyayı (`??`) yakalar. Bağ klasöründe alt klasör yok; 45/50 tip
  `backend.ts` üzerinden geliyor.
- **Clippy yapılandırması:** `unwrap_used`, `expect_used`, `panic`, `todo`, `unimplemented`, `dbg_macro` ve
  `allow_attributes_without_reason` açık; CI'da `-D warnings` ile hem Linux'ta hem Windows'ta çalışıyor. Kütüphane
  kodunda `#[cfg(test)]` dışında `unwrap`/`expect`/`panic!` yok. Tek `#[allow(unsafe_code)]` wasapi.rs'te,
  gerekçeli. Araç zinciri `rust-toolchain.toml`'da sabit (1.97.0); eylemler SHA ile sabit.
- **Çevrimdışı durum bugün:** Arayüz kodunda ve Rust'ta yorum dışı uzak adres yok. CSP sıkı
  (`default-src 'self'`, `connect-src ipc:`). İzinler 3 tane.
- **Yayın kapısı:** `test-surumu.yml` otomatik yolda `conclusion == 'success'`, `event == 'push'`, aynı depo ve
  `main` koşullarını birlikte arıyor. Bu yüzden CI'nın bütün işleri (sahneler ve Windows dahil) yayın için zorunlu.

## 6. Öncelikli düzeltme sırası

1. **KAP-01:** `ci.yml` arayüz işine `npm run check:rules` adımını ekle (tek satır). Aynı PR'da KAP-03'ün regex
   düzeltmesini ve testini de yap, yoksa eklenen adım uzak adresi yine yakalamaz.
2. **KAP-02 (proje sahibi):** `main` için kural seti: PR zorunlu, CI'nın beş işi zorunlu durum denetimi, zorla push
   yok. Claude, GitHub'da hangi sayfada hangi düğmeye basılacağını adım adım yazmalı.
3. **KAP-07:** `test-surumu.yml`'de elle başlatmada commit'in CI sonucunu doğrula ya da `workflow_dispatch`'i kaldır.
4. **KAP-03 (devamı):** `deny.toml` `[bans] deny` listesine ağ crate'lerini ekle; check:rules'a Rust `std::net`
   taramasını ekle.
5. **KAP-04:** Geçmiş taramasında izinli klasör için boyut sınırı; blob başına bütün yollar.
6. **KAP-06:** `licenses.test.mjs`'e "deny.toml'da yasaklı lisans yok" testi.
7. **KAP-05:** `sceneCheck.test.ts`'e "check-scenes'in sahne listesi = `SCENES`" testi.
8. **KAP-08 / KAP-09:** check:rules ve check:commands kalıplarını genişlet; her kaçak için `scripts/lib` testi.
9. **KAP-10:** Tek bir `npm run check` betiği; CLAUDE.md, README ve ci.yml ona bağlansın.
10. **KAP-11 / KAP-12:** `no-floating-promises` ve `noInlineConfig`; Clippy'de ya ses yolu için `indexing_slicing`
    açılsın ya da ölü ayar silinsin.

### Proje sahibinin ayarına bağlı

- **KAP-02:** `main` dal koruması ya da kural seti yok (`protected:false`, `rules/branches/main` → `[]`). Bu
  olmadan "CI yeşil olmadan birleştirme yok" yalnızca bir talimat. Puan (b)'yi (a)'dan bir puan aşağı çeken
  başlıca neden bu.
- **KAP-07:** Elle yayın yolunu yazma yetkisi olan herkes kullanabilir. Dal korumasıyla birleşince kırmızı `main`
  yayımlanabilir.
- Kod imzası sertifikası bu alanın konusu değil (yayın denetiminin alanı); puanı etkilemedi.
