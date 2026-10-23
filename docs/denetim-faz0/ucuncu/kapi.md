# Kalite kapıları — bağımsız denetim raporu (Faz 0)

Denetlenen: commit `4d09cb9` (`main`, sürüm 0.0.62). Önek: KAP. Tarih: 23 Ekim 2026.

## 1. Özet

- **Puan (a) depodaki kod ve yapılandırma: 7/10.** İçerik kurallarının kapıları (lint, tür, komut sözleşmesi, lisans,
  ses dosyası, sahne listesi, bildirimler) gerçek ve çoğu bozulunca kırmızı yanıyor. Ama kapıların **kendi
  yapılandırması** hiçbir kapıyla korunmuyor: CI adımını kapatmak, `|| true`, `continue-on-error`, `-D warnings`'i
  silmek, lint/tsc/Cargo lint ayarını gevşetmek, testlerin yarısını dışarıda bırakmak bütün kapılarda yeşil kalıyor.
- **Puan (b) GitHub ayarları dahil: 6/10.** `main` kural kümesi etkin ve beş CI işinin hepsini zorunlu tutuyor
  (iyi). Ama onay sayısı 0, CODEOWNERS yok, "dal güncel olsun" kapalı. Bu yüzden kapıları gevşeten bir PR'ı
  durduracak insan ya da makine denetimi yok. Kodu yapay zekânın yazdığı, sahibinin kod okumadığı bu projede
  tek denetçi kapılar.
- **Mutasyon sınaması: 74 mutasyon.** 36'sı en az bir kapıda kırmızı yandı, 38'i bütün ilgili kapılardan yeşil
  geçti. Kaçanların 16'sı "kapının kendisini gevşetme" türünde. 22'si kuralın kapının görmediği bir
  yoldan çiğnenmesi: Tauri yetenekleri, CSP, test atlama, göç adımı, marka, elle yazılmış tip.
- En önemli bulgu **KAP-01 (Yüksek)**: kapı yapılandırması korumasız. CI iş akışı, `package.json`
  betikleri, `eslint.config.js`, `tsconfig.json`, `vite.config.ts` (test kapsamı), `Cargo.toml [lints]` ve
  `deny.toml` yasak listesi değişse de bütün kapılar yeşil kalıyor.
- **KAP-03 (Orta)**: Tauri izin kapısı yalnızca `capabilities/*.json` dosyalarındaki izin adlarına bakıyor.
  `tauri.conf.json` içine satır içi yazılan yetenek, `remote` alanı ve güvenlik bayrakları görülmüyor.
- **KAP-04 (Orta)**: "Yayımlanmış göç adımları asla değiştirilmez" kuralını hiçbir test zorlamıyor. Göç testi
  "eski dosyaları" bugünkü adımlardan ürettiği için değiştirilmiş eski adım yeşil geçiyor.
- Temiz bulunanlar arasında şunlar var: satır içi `eslint-disable` engeli, Tauri API tek kapı kuralı, sahne
  listesi eşitlemesi, ses dosyası geçmiş taraması, SPDX ayrıştırması, cargo-deny ağ crate yasağı, komut sözleşmesi,
  bildirim dosyası güncelliği, eylemlerin SHA'yla sabitlenmesi, zizmor temiz.

## 2. Kapsam ve yöntem

**Okunanlar.** `package.json`, `scripts/*.mjs`, `scripts/lib/*` (ve testleri), `eslint.config.js`,
`tsconfig.json`, `tsconfig.scripts.json`, `.prettierrc.json`, `.prettierignore`, `vite.config.ts` (test
ayarı), `src-tauri/Cargo.toml` `[lints]`, `src-tauri/clippy.toml`, `src-tauri/deny.toml`, `.gitignore`,
`.github/workflows/ci.yml`, `test-surumu.yml` (yalnızca CI'ya bağlanışı), `src-tauri/tauri.conf.json`,
`src-tauri/capabilities/default.json`, `src-tauri/src/storage.rs` (göç testleri), `src/lib/sceneCheck.test.ts`,
`src/lib/scene.ts`, `src-tauri/src/commands.rs` (sürüm testi). Kurallar CLAUDE.md'den alındı.

**Deney.** Kod kopyası `is-kapi/repo` klasörüne klonlandı, `node_modules` sembolik bağlandı. Bir koşucu betik
her mutasyonu uyguladı ve ilgili kapıları çalıştırdı: `format:check`, `lint`, `typecheck`, `vitest`,
`check:commands/licenses/rules/docs/audio -- --history/notices`, `cargo deny --offline check licenses bans sources`,
`zizmor --offline`. Her mutasyondan sonra kopya `git reset --hard 4d09cb9` ile geri alındı. Arayüz kodu
mutasyonları önce Prettier'den geçirildi; böylece yalnızca biçim kapısı yakalamış görünmesi önlendi. Taban
ölçüm: bütün kapılar yeşil, 440 Vitest testi geçti.

**GitHub.** Herkese açık API'den okundu (`GET /repos/…/rules/branches/main`, `/rulesets`). Hiçbir şey yazılmadı.

**Sınırlar.** Kurala göre Rust derlemesi yapılmadı (`cargo clippy/test` yok). Rust mutasyonlarında (R02, R04,
R05, R08, R09, R10) yalnızca Node kapıları çalıştırıldı. Clippy'nin ve `cargo test`'in bu mutasyonlardaki davranışı
lint ve test anlamından çıkarıldı; güven derecesi buna göre yazıldı. `check:scenes` (Windows Edge)
çalıştırılmadı; onun yerine sahne listesini denetleyen birim testi mutasyonla sınandı. P02 mutasyonu
geçersiz sayıldı (kilit dosyasındaki sürüm `npm ci` olmadan `node_modules`'a yansımaz) ve sayıma girmedi.

### Mutasyon tablosu (74)

K = kırmızı (yakaladı), Y = yeşil (kaçtı). "Rust (çıkarım)" sütunu derlenmeden, anlamdan yazıldı.

| #    | Mutasyon (kural)                                                         | Sonuç                                   | Yakalayan                       |
| ---- | ------------------------------------------------------------------------ | --------------------------------------- | ------------------------------- |
| M01  | `src`'de `: any` ("any kullanılmaz")                                     | lint K                                  | lint                            |
| M02  | `src`'de `// eslint-disable-next-line` + `any`                           | lint K (noInlineConfig)                 | lint                            |
| M03  | `src`'de `// @ts-ignore`                                                 | lint K                                  | lint                            |
| M04  | `src`'de `// @ts-expect-error -- açıklama` ile tür hatası                | fmt/lint/tsc Y                          | —                               |
| M05  | 100 karakteri aşan satır (Prettier)                                      | fmt K                                   | format:check                    |
| M06  | Sahipsiz Promise                                                         | lint K                                  | lint                            |
| M07  | Bileşende `@tauri-apps/api/core` içe aktarma                             | lint K                                  | lint                            |
| M08  | `vite.config.ts`'te satır içi disable + `any`                            | hepsi Y                                 | —                               |
| M09  | `tsconfig` `strict: false` + örtük any                                   | lint K, tsc K (tesadüfen: başka kodlar) | lint, tsc                       |
| M09b | `tsconfig` `noImplicitAny: false` + örtük any                            | fmt/lint/tsc Y                          | —                               |
| M10  | `eslint.config.js`'te `no-floating-promises: off` + sahipsiz Promise     | hepsi Y                                 | —                               |
| M11  | `describe.skip`                                                          | rules K                                 | check:rules                     |
| M12  | Test içinde `ctx.skip()`                                                 | rules Y, vitest Y (1 skipped)           | —                               |
| M13  | Gövdesiz `it("ad")` (todo)                                               | rules Y, vitest Y (1 todo)              | —                               |
| M14  | `.test` adı taşımayan dosyada test                                       | rules K, docs K                         | check:rules                     |
| M15  | `vite.config.ts` `test.exclude: ["src/lib/**"]`                          | hepsi Y; 440 → 165 test                 | —                               |
| M16  | `fetch("https://ornek.com")`                                             | rules K                                 | check:rules                     |
| M17  | Parçalı adres: `` `https:/` + `/${HOST}` ``                              | rules Y                                 | —                               |
| M18  | `public/kacak.html` içinde uzak betik                                    | rules Y, docs Y                         | — (CSP çalışma anında engeller) |
| R01  | `file_manager.rs`'te `#[allow(unsafe_code, reason)]`                     | rules K                                 | check:rules                     |
| R02  | `Cargo.toml` `unsafe_code = "allow"` + `unsafe {}` bloğu                 | rules/docs Y; Rust (çıkarım) Y          | —                               |
| R03  | `#[ignore]` (gerekçesiz)                                                 | rules K                                 | check:rules                     |
| R04  | `#[ignore = ""]` (boş gerekçe)                                           | rules Y                                 | —                               |
| R05  | `#[cfg(any())]` ile testi derlemeden çıkarma                             | rules Y; Rust (çıkarım) Y               | —                               |
| R06  | `std::net::TcpStream::connect`                                           | rules K                                 | check:rules                     |
| R07  | `Command::new("curl").arg("https://…")`                                  | rules Y                                 | —                               |
| R08  | `Cargo.toml` `unwrap_used = "allow"`                                     | rules/docs/deny Y; Clippy (çıkarım) Y   | —                               |
| R09  | Kütüphanede `#[allow(clippy::unwrap_used, reason = "…")]` + `unwrap()`   | rules Y; Clippy (çıkarım) Y             | —                               |
| R10  | Yayımlanmış göç adımı V3'e `ALTER TABLE tracks ADD COLUMN`               | rules/docs Y; `cargo test` (çıkarım) Y  | — (KAP-04)                      |
| N01  | CSP `connect-src … wss://ornek.com`                                      | rules Y                                 | —                               |
| N02  | CSP `img-src … ornek.com` (şemasız)                                      | rules Y                                 | —                               |
| N03  | CSP `connect-src … https://ornek.com`                                    | rules K                                 | check:rules                     |
| N04  | CSP `'unsafe-inline'`                                                    | rules K                                 | check:rules                     |
| N05  | `tauri.conf.json` `app.security.capabilities` içinde satır içi yetenek   | rules Y                                 | —                               |
| N06  | `default.json`'a `"remote": {"urls": ["https://*.ornek.com"]}`           | rules Y                                 | —                               |
| N07  | `default.json`'a `fs:default`                                            | rules K                                 | check:rules                     |
| N08  | `withGlobalTauri: true`, `dangerousDisableAssetCspModification: true`    | rules Y                                 | —                               |
| N09  | `capabilities/ek/ek.json` (alt klasör)                                   | rules K (EISDIR çökmesiyle)             | check:rules (tesadüfen)         |
| L01  | `deny.toml` izin listesine `AGPL-3.0-only`                               | lic K, deny Y                           | check:licenses                  |
| L02  | İzin listesine `CC-BY-NC-4.0`                                            | lic K                                   | check:licenses                  |
| L03  | İzin listesine `LicenseRef-Proprietary`                                  | lic Y, deny Y                           | —                               |
| L04  | Pakete giren npm paketi `AGPL-3.0-only`                                  | lic K                                   | check:licenses                  |
| L05  | `(MIT OR SSPL-1.0) AND BUSL-1.1`                                         | lic K                                   | check:licenses                  |
| L06  | İzin listesinden `MIT`'i silme                                           | lic K, deny K                           | ikisi                           |
| L07  | Kullanılan bir crate'i (`serde_json`) yasak listesine ekleme             | deny K                                  | cargo-deny                      |
| L08  | Yasak listesinden `reqwest`, `hyper`'ı silme                             | hepsi Y                                 | —                               |
| L09  | `unknown-git = "allow"`                                                  | hepsi Y                                 | —                               |
| A01  | `sarki.mp3` (`git add -f`)                                               | audio K                                 | check:audio                     |
| A02  | ID3 başlıklı `veri.bin`                                                  | audio K                                 | check:audio                     |
| A03  | mp3 commit edilip sonra silinmiş (geçmiş)                                | audio K                                 | check:audio --history           |
| A04  | `arsiv.tgz` içinde mp3                                                   | audio Y                                 | —                               |
| A05  | TS dosyasında `data:audio/mpeg;base64,…`                                 | audio Y, rules Y                        | —                               |
| A06  | `.gitignore`'dan `*.ogg` kalıbını silme                                  | vitest K (`audio.test.mjs`)             | npm test                        |
| A07  | İzinli klasörde README'de anılan 1 KB "mp3"                              | audio Y                                 | — (tasarım gereği)              |
| C01  | CI'da `check:rules` adımını yorum satırına alma                          | docs Y, zizmor Y                        | —                               |
| C02  | CI `check:rules` adımına `continue-on-error: true`                       | docs Y, zizmor Y                        | —                               |
| C03  | CI Clippy'den `-D warnings`'i silme                                      | docs Y, zizmor Y                        | —                               |
| C04  | CI `check:audio`'dan `--history`'yi silme                                | docs Y, zizmor Y                        | —                               |
| C05  | CI'dan cargo-deny lisans adımını silme                                   | docs Y, zizmor Y                        | —                               |
| C06  | CI `npm test \|\| true`                                                  | docs Y, zizmor Y                        | —                               |
| C07  | CI ts-rs adımına `if: false`                                             | docs Y, zizmor Y                        | —                               |
| C08  | `package.json` `check:rules` → `… \|\| true`                             | docs Y, rules Y                         | —                               |
| C09  | `package.json` `lint`'ten `--max-warnings 0`'ı silme                     | docs Y, lint Y                          | —                               |
| D01  | CLAUDE.md'de anılmayan yeni hook                                         | docs K                                  | check:docs                      |
| D02  | CI'da çalışmayan yeni `check:*` betiği                                   | docs K                                  | check:docs                      |
| K01  | `invoke` ile olmayan komut                                               | cmd K                                   | check:commands                  |
| K02  | `invoke<T>` dönüş türü yanlış                                            | cmd K, tsc K                            | check:commands                  |
| K03  | Kaydedilmemiş ve çağrılmayan Rust komutu                                 | cmd K                                   | check:commands                  |
| K04  | Sahne denetimine eklenmeyen yeni galeri sahnesi                          | vitest K (`sceneCheck.test.ts`)         | npm test                        |
| K05  | Bileşende "Pioneer" adı                                                  | hepsi Y                                 | —                               |
| B01  | `backend.ts`'te elle yazılmış `AppInfo` (yeniden dışa aktarma çakışıyor) | tsc K (tesadüfen)                       | tsc                             |
| B01b | Aynısı, çakışma giderilmiş                                               | fmt/lint/tsc/cmd/docs/rules/vitest Y    | —                               |
| B02  | `bindings/AppInfo.ts`'i elle düzenleme                                   | tsc K; CI'da ts-rs adımı da yakalar     | tsc, CI ts-rs                   |
| P01  | `UCUNCU-TARAF.txt`'ten 30 satır silme                                    | notices K                               | check:notices                   |

Sayım: 36 K, 38 Y. Kaçan 38'in 16'sı kapı yapılandırmasını gevşetiyor: M09b, M10, M15, R02, R08, L08, L09,
C01–C09. Kalan 22'si kuralı başka bir yoldan çiğniyor.

## 3. Bulgular

### KAP-01 — Kapıların kendi yapılandırması hiçbir kapıyla korunmuyor

- Önem: **Yüksek** · Güven: Kanıtlandı (Node kapıları ve zizmor için). Rust kapıları için güven Kesin
  (lint anlamından çıkarım). · Standart: OpenSSF Scorecard "Branch-Protection" ve "Code-Review"; SLSA v1.0
  kaynak gereksinimleri (iki kişi incelemesi); ISO/IEC 25010 bakım kolaylığı (test edilebilirlik).
- Yer: `.github/workflows/ci.yml:42-61, 92-126`; `package.json:12-27`; `eslint.config.js:30-49`;
  `tsconfig.json:7-13`; `vite.config.ts:27-31`; `src-tauri/Cargo.toml:47-61`; `src-tauri/deny.toml:48-68`;
  `scripts/check-docs.mjs:152-158`.
- Kanıt: 16 mutasyonun her biri, çalıştırılabilen bütün kapılarda yeşil kaldı. Mutasyonlar: C01–C09,
  M09b, M10, M15, R02, R08, L08, L09 (tablo).
  - M15 sonrası `npx vitest run`: `Tests 165 passed (165)`. Taban: `440 passed`. `src/lib`'in bütün testleri
    sessizce dışarıda kaldı, çıkış kodu 0.
  - C02/C06 (`continue-on-error: true`, `npm test || true`) sonrası `zizmor --offline --min-severity=low` çıktısı:
    `No findings to report. Good job!`. `check:docs` çıktısı: `Belge denetimi tamam`.
  - `check:docs`'un "her `check:*` CI'da çalışır" denetimi yalnızca metin araması yapıyor:
    `!new RegExp(\`npm run ${name}\\b\`).test(ci)` (`scripts/check-docs.mjs:155`). Yorum satırındaki
`# run: npm run check:rules` da eşleşiyor (C01).
  - Hiçbir betik `Cargo.toml [lints]`'i, `eslint.config.js` kurallarını, `tsconfig` bayraklarını ya da
    `vite.config.ts` test kapsamını okumuyor (`grep -l "lints\|noImplicitAny\|max-warnings" scripts/` boş).
- Senaryo ve etki: Bir yapay zekâ oturumu kırmızı bir kapıyla karşılaşıyor ve kodu düzeltmek yerine kapıyı
  gevşetiyor. Örneğin parlama testini dışarıda bırakıyor, `-D warnings`'i siliyor ya da lisans adımını
  kapatıyor. CI yeşil kalıyor. Kural kümesi onay istemediği için (bkz. "Proje sahibinin ayarına bağlı") PR
  birleşiyor ve test sürümü kullanıcıya gidiyor. Proje sahibi kod okumadığından fark etmiyor. Bu yoldan
  epilepsi, lisans ya da telif kuralının kapısı kapanmış bir sürüm yayımlanabilir. Ajanların kırmızı testi
  "yeşile çevirmek" için denetimi gevşetmesi bilinen bir başarısızlık biçimi.
- Çürütme denemesi:
  - zizmor ve actionlint `continue-on-error`'ı ve `|| true`'yu kural ihlali saymıyor; zizmor'da denendi, yeşil.
    actionlint yalnızca sözdizimine bakıyor.
  - GitHub kural kümesi iş adlarını zorunlu tutuyor, adımların içeriğini tutmuyor. İş adı değişmedikçe
    gevşetilmiş iş de "success" döndürüyor.
  - CLAUDE.md "Testler atlanmaz, devre dışı bırakılmaz" diyor, ama bunu yalnızca talimat söylüyor; hiçbir
    mekanizma zorlamıyor.
  - Başka bir koruma bulunamadı: CODEOWNERS yok, onay sayısı 0.
- Öneri: `scripts/check-gates.mjs` adında küçük bir "kapı bütünlüğü" denetimi eklenmeli, `check` betiğine ve
  CI'ya girmeli. Şunları sabitlemeli:
  - `ci.yml`'de yorum dışı satırlarda beklenen `run:` komutları birebir bulunmalı; `continue-on-error`,
    `|| true` ve adım düzeyinde `if: false` olmamalı; Clippy satırlarında `-D warnings` bulunmalı.
  - `package.json`'daki `lint`, `check` ve `check:*` betikleri beklenen metne eşit olmalı.
  - `Cargo.toml [lints]` değerleri beklenen tabloya, `deny.toml` `[bans].deny` ve `[sources]` beklenen kümeye eşit
    olmalı.
  - `tsconfig.json` bayrakları (`strict`, `noImplicitAny` yok ya da true, `noUncheckedIndexedAccess`) ve
    `eslint.config.js`'teki kilit kurallar tutmalı.
  - `vite.config.ts`'te `exclude` ve `include` bulunmamalı; Vitest test sayısı bir taban değerin altına
    düşmemeli. Bunun için `--reporter=json` çıktısında `numTotalTests ≥ N` ve `numPendingTests + numTodoTests == 0`
    aranabilir.

  Ayrıca `.github/CODEOWNERS` dosyası eklenmeli; ayrıntı için bkz. "Proje sahibinin ayarına bağlı".

### KAP-02 — `check:docs` CI denetimi yorum satırını ve devre dışı adımı "çalışıyor" sayıyor

- Önem: Düşük · Güven: Kanıtlandı · Standart: ISO/IEC 25010 (doğruluk)
- Yer: `scripts/check-docs.mjs:152-158`
- Kanıt: C01'de `check:rules` adımı yorum satırına alındı. `npm run check:docs` sonucu
  `Belge denetimi tamam: … linkler doğru.` (çıkış 0).
- Senaryo ve etki: Betiğin başlığı "yerelde yazılıp CI'ya eklenmeyen bir kapı hiçbir şeyi korumaz" diyor;
  tam bu durum fark edilmiyor. Proje sahibine "CI her kapıyı çalıştırıyor" güvencesi yanlış veriliyor.
- Öneri: Aramadan önce `ci.yml`'nin `#` ile başlayan satırları atılmalı. Eşleşen satır `run:` ile başlamalı.
  KAP-01'deki bütünlük denetimi bu maddeyi de kapsar.

### KAP-03 — Tauri izin kapısı satır içi yeteneği, `remote` alanını ve güvenlik bayraklarını görmüyor

- Önem: **Orta** · Güven: Kanıtlandı · Standart: Tauri 2 güvenlik modeli (capabilities, `remote`); OWASP ASVS
  V14 (yapılandırma)
- Yer: `scripts/check-rules.mjs:128-143`
- Kanıt: Kapı yalnızca şu döngüyle okuyor: `for (const file of readdirSync(join(ROOT, "src-tauri/capabilities")))`.
  Her dosyada yalnızca `capability.permissions` alanına bakılıyor.
  - N05: `tauri.conf.json`'a `app.security.capabilities: [{identifier:"gizli", windows:["main"],
permissions:["core:default","fs:default","shell:allow-open"]}]` yazıldı. Çıktı `Kural denetimi tamam`.
    Tauri 2 bu listeyi satır içi yetenek olarak kabul ediyor. Yalnızca var olan eklentilerin izinleri
    yazılırsa (ör. `core:default`) derleme de geçer.
  - N06: `"remote": {"urls": ["https://*.ornek.com"]}` eklendi, sonuç yeşil.
  - N08: `withGlobalTauri: true` ve `dangerousDisableAssetCspModification: true` eklendi, sonuç yeşil.
  - N09: alt klasördeki yetenek kırmızı yandı, ama yalnızca `readFileSync` dizinde çöktüğü için
    (`EISDIR`). Bu bilinçli bir denetim değil. TOML yetenek dosyası da aynı yoldan, `JSON.parse` hatasıyla
    düşer.
- Senaryo ve etki: Bir oturum yeni bir eklentinin iznini `default.json` yerine `tauri.conf.json`'a yazıyor.
  "İzinler en dar listede" kapısı yeşil kalıyor ve arayüze dosya sistemi ya da kabuk erişimi açılıyor.
  `remote` alanı ise uzak bir sayfaya çekirdek komutlarını çağırma yolu açar. Bugünkü yapılandırma temiz;
  risk ileriye dönük.
- Öneri: `check-rules.mjs` şunları da yapmalı:
  - `tauri.conf.json`'da `app.security.capabilities` varsa yalnızca `["default"]` gibi bir kimlik listesine
    izin vermeli.
  - Her yetenekte `remote` alanını reddetmeli ve `windows` değerini `["main"]` olarak beklemeli.
  - `capabilities/` klasörünü özyinelemeli taramalı; `.toml` dosyalarını da okumalı ya da açık bir hata
    vermeli.
  - `withGlobalTauri`, `dangerousDisableAssetCspModification`, `freezePrototype: false` ve `devCsp`
    değerlerini yasaklı listeye almalı.

### KAP-04 — "Yayımlanmış göç adımı değiştirilmez" kuralını hiçbir kapı zorlamıyor

- Önem: **Orta** · Güven: Kesin (kod okuması; Rust derlenmedi) · Standart: ISO/IEC 25010 güvenilirlik (veri
  bütünlüğü)
- Yer: `src-tauri/src/storage.rs:136` (`MIGRATIONS`), `storage.rs:575-598` (`every_past_file`),
  `storage.rs:262-266` (`cache_complete` yalnızca `analyses`'e bakıyor)
- Kanıt: Test, "eski" dosyaları bugünkü adımlardan kuruyor:
  `for n in 1..=MIGRATIONS.len() { … apply(&mut conn, &MIGRATIONS[..n]) … files.push((format!("şema {n}"), conn)); }`.
  - V3 değiştirilirse hem "şema 3–7" dosyaları hem yeni kurulum aynı değişikliği alır, yani
    `assert_eq!(shape(&conn), expected)` geçer.
  - Değişmeden saklanan şemalar yalnızca 0.0.5–0.0.25 için var.
  - Adımların içeriğini sabitleyen (özet ya da sabit metin) bir test yok: `grep -n "hash\|sha" storage.rs` boş.
  - R10 (V3'e `ALTER TABLE tracks ADD COLUMN rating`): `check:rules` ve `check:docs` yeşil kaldı.
    `cargo test` de geçer; bu, yukarıdaki akıştan çıkarım.
- Senaryo ve etki: Bir oturum yeni sütunu V8 yerine V3'e ekliyor. Yeni kurulumda her şey çalışıyor; proje
  sahibinin temiz kurulumla yaptığı deneme de geçiyor. Şeması zaten 7 olan kullanıcılarda ise sütun hiç
  oluşmuyor ve kütüphane sorguları "no such column" hatası veriyor. `analyses` tablosu kendini onarıyor
  (önbellek yeniden kuruluyor), `tracks` ve `folders` tabloları onarmıyor.
- Öneri: `storage.rs` testlerine `MIGRATIONS`'ın ilk 7 adımının yayımlanmış metnini (ya da metnin özetini)
  sabitleyen bir test eklenmeli, örneğin `yayimlanmis_adimlar_degismez`. Yeni adım eklenince bu listeye
  yalnızca ekleme yapılır; eski satırı değiştiren PR kırmızı yanar.

### KAP-05 — Test atlama kapısı dar: `ctx.skip()`, gövdesiz `it`, boş gerekçeli ve derlemeden çıkarılan Rust testi geçiyor

- Önem: Düşük · Güven: Kanıtlandı (M12, M13, R04). R05 için güven Kesin. · Standart: ISO/IEC 25010
  (test edilebilirlik)
- Yer: `scripts/check-rules.mjs:42-46, 56-64`
- Kanıt:
  - M12'de Vitest çıktısı `Tests 17 passed | 1 skipped (18)`, çıkış 0. M13'te `17 passed | 1 todo`, çıkış 0.
    `check:rules` iki durumda da yeşil.
  - R04'te `#[ignore = ""]` kabul edildi; düzenli ifade gerekçenin varlığına bakıyor, içeriğine bakmıyor.
  - R05'te `#[cfg(any())]` testi sessizce yok etti; düzenli ifade bunu aramıyor.
- Senaryo ve etki: Kırmızı bir test sessizce koşmaz hâle geliyor. Bugün depoda gerekçeli 3 `#[ignore]` var ve
  üçü de gerçekten elle çalıştırılan ölçümler; temiz.
- Öneri: CI'da `vitest run --reporter=json` çıktısında `numPendingTests` ve `numTodoTests` sıfır olmalı.
  Rust tarafında `#[ignore = "\s*"]`, `cfg(any())` ve `cfg(FALSE)` reddedilmeli.

### KAP-06 — CSP kapısı yalnızca `http(s)://` adresleri arıyor; `wss://` ve şemasız alan adı geçiyor

- Önem: Düşük · Güven: Kanıtlandı · Standart: OWASP ASVS V14.4 (CSP); Tauri 2 CSP
- Yer: `scripts/check-rules.mjs:100-108`
- Kanıt: `csp.match(/https?:\/\/[^\s;]+/g)` ifadesi kullanılıyor. N01 (`wss://ornek.com`) ve N02 (`img-src … ornek.com`)
  için çıktı `Kural denetimi tamam: … CSP sıkı.` N03 (`https://`) ise kırmızı yandı. Kod tarafında da parçalı
  adres (M17) ve `public/` altındaki HTML (M18) geçti. Rust'ta `Command::new("curl")` (R07) geçti.
- Senaryo ve etki: Programın internete bağlanmadığını çalışma anında asıl CSP garanti ediyor. CSP'ye uzak bir
  WebSocket ya da alan adı eklenir ve adres koddan kurulursa "çevrimdışı" sözü sessizce bozulur. Bunun için
  iki ayrı adımın birlikte atılması gerekiyor; bu yüzden önem Düşük.
- Öneri: CSP'deki her kaynak belirteci izinli bir kümeyle karşılaştırılmalı: `'self'`, `'none'`,
  `'wasm-unsafe-eval'`, `data:`, `blob:`, `ipc:`, `http://ipc.localhost`. Kümede olmayan her belirteç
  reddedilmeli. Uzak adres taraması `public/` klasörünü de kapsamalı.

### KAP-07 — Marka yasağının (Pioneer vb.) kapısı yok

- Önem: Düşük · Güven: Kanıtlandı · Standart: — (CLAUDE.md "asla kullanılmaz")
- Yer: `scripts/check-rules.mjs` (böyle bir denetim yok)
- Kanıt: K05'te bileşene `"Pioneer"` metni ve yorumu eklendi; fmt, lint, tsc, rules ve docs hepsi yeşil kaldı.
  Bugünkü kodda `grep -rniE pioneer src src-tauri/src scripts .github` boş, yani temiz.
- Senaryo ve etki: Nostalji sahnesi geliştiren bir oturum marka adını arayüz metnine yazabilir. Bu marka
  hakkı riski doğurur ve CLAUDE.md'nin açık yasağıdır.
- Öneri: `check-rules.mjs`'e `src/`, `public/`, `index.html` ve `src-tauri/src` için `/\bpioneer\b/i` araması
  eklenmeli; gerekirse başka marka adları da eklenebilir.

### KAP-08 — "Veri tipleri Rust'tan üretilir, elle yazılmaz" kuralı zorlanmıyor

- Önem: Düşük · Güven: Kanıtlandı · Standart: ISO/IEC 25010 (bakım kolaylığı)
- Yer: `scripts/lib/commands.mjs` (`rustToTs` ve `contractProblems` yalnızca tür adlarını karşılaştırıyor)
- Kanıt: B01b'de `backend.ts`'teki `import type { AppInfo } from "./bindings/AppInfo"` silindi ve yerine fazladan
  alanı olan elle yazılmış `interface AppInfo` kondu. Fmt, lint, tsc, `check:commands`, docs, rules ve Vitest
  (440) hepsi yeşil kaldı. CI'nın ts-rs adımı da yakalamaz: `bindings/AppInfo.ts` hâlâ üretiliyor ve
  değişmiyor, yalnızca artık kullanılmıyor.
- Senaryo ve etki: Rust'ta bir alanın adı değişince elle yazılmış tip eski kalıyor. Hata ancak o ekran
  açıldığında `undefined` olarak görülüyor. Bu tam da ts-rs'in önlemek için kurulduğu sorun.
- Öneri: `check-commands.mjs`'e bir kural eklenmeli: `invoke<T>`'deki ve parametrelerdeki her tür adı
  `src/lib/bindings/` altında bir dosyaya karşılık geliyorsa, `backend.ts` o adı `./bindings/…`'ten içe
  aktarmalı ve aynı adla `interface` ya da `type` tanımı bulunmamalı.

### KAP-09 — Clippy'nin `unwrap`/`panic` yasağı gerekçe yazılarak yerel olarak susturulabiliyor

- Önem: Düşük · Güven: Kesin (lint anlamı; R09'da Node kapıları yeşil) · Standart: ISO/IEC 25010 güvenilirlik
- Yer: `src-tauri/Cargo.toml:50-61`, `scripts/check-rules.mjs:35-41` (yalnızca `unsafe_code`'a bakıyor)
- Kanıt: `allow_attributes_without_reason = "warn"` yalnızca gerekçe istiyor. R09'da
  `#[allow(clippy::unwrap_used, reason = "kısa yol")]` + `v.unwrap()` eklendi, `check:rules` yeşil kaldı.
  Bugün kütüphane kodunda böyle bir susturma yok. Var olan iki `allow` `examples/` ve `tests/` altında, ikisi de
  gerekçeli. Test dışı kodda `unwrap`, `expect` ve `panic!` yok (taramayla doğrulandı).
- Senaryo ve etki: Ses yolunda `panic` sürüm derlemesinde programı kapatır (`panic = "abort"`).
- Öneri: `check-rules.mjs`, `src-tauri/src` altında `allow` ya da `expect` ile `unwrap_used`, `expect_used`,
  `panic`, `todo`, `unimplemented` lint'lerinin susturulmasını reddetmeli. `unsafe_code` için yapılanın
  aynısı yeterli.

### KAP-10 — Ses dosyası kapısı sıkıştırılmış arşivi ve gömülü base64 sesi görmüyor

- Önem: Düşük · Güven: Kanıtlandı · Standart: — (telif kuralı)
- Yer: `scripts/lib/audio.mjs:188-259` (yalnızca zip ve ham imzalara bakıyor)
- Kanıt: A04 (`arsiv.tgz` içinde mp3) ve A05 (`data:audio/mpeg;base64,…` içeren `.ts` dosyası) için
  `check:audio --history` yeşil kaldı. Buna karşılık uzantı, imza, adı değiştirilmiş dosya ve geçmiş taraması
  (A01–A03) kırmızı yandı.
- Senaryo ve etki: Bir test fikstürü sesi koda gömebilir. Bunun kaza eseri olması düşük olasılık.
- Öneri: `.tgz`, `.gz`, `.7z`, `.tar` dosyalarını içerik bakmadan reddetmek yeterli. Metin dosyalarında
  `data:audio/` araması yapılmalı.

### KAP-11 — Tür kapısında iz bırakmayan kaçış yolları: `@ts-expect-error`, `src` dışında satır içi disable, betiklerde `strict: false`

- Önem: Düşük · Güven: Kanıtlandı (M04, M08) · Standart: —
- Yer: `eslint.config.js:30-34` (`noInlineConfig` yalnızca `src/**`), `tsconfig.scripts.json:13` (`"strict": false`)
- Kanıt:
  - M04'te `// @ts-expect-error -- geçici` + `const x: number = "metin"` yazıldı; lint ve tsc yeşil kaldı.
    typescript-eslint'in önerilen ayarı açıklamalı `@ts-expect-error`'a izin veriyor.
  - M08'de `vite.config.ts`'e `eslint-disable-next-line` + `any` yazıldı; yeşil kaldı.
  - Kalite kapılarının kendi betikleri `strict: false` ile tür denetimine giriyor.
- Öneri: `@typescript-eslint/ban-ts-comment`'te `ts-expect-error` için `true` verilmeli, ya da
  `src/**` dışındaki dosyalarda yalnızca testlere izin verilmeli. `noInlineConfig` bütün dosyalara
  uygulanmalı; tek istisna `third-party-notices.mjs:54`'teki gerekçeli satır, o yerine `no-control-regex`
  dosya düzeyinde kapatılarak taşınabilir.

### KAP-12 — "Push öncesi tek komut" (`npm run check`) bütün `check:*` betiklerini çalıştırmıyor

- Önem: Bilgi · Güven: Kesin · Standart: —
- Yer: `package.json:27`; CLAUDE.md "Komutlar" tablosu ("`check:*`; push öncesi tek komut")
- Kanıt: `check` betiğinde `check:notices`, `check:scenes` ve `build` yok. İlk ikisi Rust ya da Edge gerektiriyor,
  bu yüzden bilinçli olabilir; ama belge "check:*" diyor.
- Öneri: CLAUDE.md'deki satır "(check:notices ve check:scenes yalnızca CI'da)" diye düzeltilmeli.

## 4. Olası riskler

- **Kural kümesinde atlama yetkisi (bypass).** Herkese açık API `bypass_actors: []` döndürüyor, ama bu alan
  yetkisiz okumada boş görünebilir. Gerçek değer doğrulanamadı.
- **`strict_required_status_checks_policy: false`.** İki PR ayrı ayrı yeşil olup birlikte bozuk birleşebilir.
  `main` push'unda CI yeniden koşuyor ve `test-surumu.yml` yalnızca `conclusion == 'success'` olursa yayın
  yapıyor. Bu yüzden kullanıcıya bozuk dosya gitmez; yalnızca `main` kırmızı kalabilir.
- **Ses yolu bellek testi.** `audio::render::ses_yolu_bellek_ayirmaz`, ses yoluna eklenen yeni işlemi
  kendiliğinden kapsamıyor; CLAUDE.md "kapsamına alınır" diyerek bunu sürece bırakıyor. Rust derlenmediği
  için mutasyonla sınanamadı.
- **N05 türü satır içi yetenek.** Var olmayan bir eklentinin iznini yazmak tauri-build'i kırar (ör.
  `fs:default`). Gerçekçi senaryoda eklenti de eklenir; o durumda yalnızca `deny.toml` yasak listesindeki
  eklentiler (http, updater, shell…) yakalanır. `tauri-plugin-fs` ve `tauri-plugin-opener` listede yok.

## 5. Temiz bulunanlar

- **ESLint.** `noInlineConfig` + `reportUnusedDisableDirectives` gerçekten çalışıyor: M02'de satır içi
  susturma etkisiz kaldı ve lint kırmızı yandı. `no-explicit-any`, `ban-ts-comment` (`@ts-ignore`),
  `no-floating-promises` ve Tauri API tek kapı kuralı (M01, M03, M06, M07) kırmızı yandı.
- **Prettier** (M05) ve **tsc strict** kırmızı yandı. `strict: false` bile var olan kodda hata verdiği için
  tesadüfen yakalandı (M09).
- **check:commands.** Olmayan komut, yanlış dönüş türü, kaydedilmemiş ve kullanılmayan komut (K01–K03)
  yakalandı.
- **check:rules.** Başka dosyada `allow(unsafe_code)`, gerekçesiz `#[ignore]`, `.skip`, yanlış adlı test
  dosyası, `https://` ile `fetch`, `std::net`, CSP'de `'unsafe-inline'` ya da `https://`, listede olmayan izin
  (R01, R03, M11, M14, M16, R06, N03, N04, N07) yakalandı. `unsafe_code` susturması bugün yalnızca
  `wasapi.rs`'te var, iki yerde ve ikisi de gerekçeli.
- **check:licenses.** SPDX ifadesi doğru ayrıştırılıyor; `AND` içinde gizlenmiş BUSL bile yakalanıyor (L05).
  AGPL ve NC izin listesine eklenemiyor (L01, L02). Pakete giren AGPL bağımlılık reddediliyor (L04).
- **cargo-deny.** Lisans ve yasaklı crate denetimi çalışıyor (L06, L07). Ağ crate'leri ve Tauri ağ
  eklentileri yasak listesinde. Taban: `bans ok, licenses ok, sources ok`.
- **check:audio.** Uzantı, içerik imzası, adı değiştirilmiş dosya ve bütün geçmiş taraması çalışıyor (A01–A03).
  `.gitignore` ile uzantı listesi bir testle eşit tutuluyor (A06).
- **check:docs.** CLAUDE.md ağacı ve CI'da çalışmayan yeni `check:*` betiği yakalanıyor (D01, D02).
- **Sahne listesi.** Yeni galeri sahnesi parlama ölçümüne eklenmezse `sceneCheck.test.ts` kırmızı yanıyor
  (K04): "her sahne kendi parlama testini taşır" kuralının iyi bir kapısı.
- **check:notices.** Bildirim dosyası elle bozulunca kırmızı yanıyor (P01).
- **CI yapısı.**
  - Bütün eylemler commit SHA'sıyla sabitlenmiş, `persist-credentials: false`, en üst düzeyde
    `permissions: contents: read`.
  - Rust araç zinciri sabit; `--locked` kullanılıyor.
  - ts-rs çıktısı önce silinip yeniden üretiliyor ve depodakiyle karşılaştırılıyor.
  - `zizmor --offline --min-severity=low` çıktısı: bulgu yok.
  - Test sürümü yalnızca bu deponun `main` push'unun CI'si başarılı bitince derleniyor.
- **Sürüm eşitliği.** `commands.rs` testi `package.json` ile `Cargo.toml`'u karşılaştırıyor;
  `tauri.conf.json` sürümü `../package.json`'dan okuyor.
- **Panik kuralı.** Test dışı Rust kütüphane kodunda `unwrap()`, `expect(`, `panic!`, `unreachable!` ve çalışma
  anı `assert!` yok; tek istisna derleme anı `const` denetimi (`bass.rs:115`).
- **GitHub kural kümesi** ("main koruması", etkin). Silme ve zorla push engelli, PR zorunlu. Beş CI işinin
  hepsi zorunlu ve yalnızca GitHub Actions uygulamasından (`integration_id 15368`) kabul ediliyor; başka bir
  uygulamanın sahte durum bildirimi sayılmıyor.

## Proje sahibinin ayarına bağlı

Kaynak: `GET https://api.github.com/repos/lahmacunveayran/Lyraska/rules/branches/main`

- `required_approving_review_count: 0`, `require_code_owner_review: false` ve depoda `.github/CODEOWNERS` yok.
  KAP-01'deki gevşetmeleri durduracak tek mekanizma bir onay olurdu. PR'ları proje sahibinin hesabından yapay
  zekâ açtığı için sahibinin kendi PR'ını onaylaması da mümkün değil. Bu yüzden önerilen çözüm ayar
  değil, KAP-01'deki kod düzeyindeki bütünlük denetimi.

  Ayar tarafında yapılabilecek olan şu: kapı dosyaları (`.github/workflows/**`, `scripts/**`,
  `eslint.config.js`, `tsconfig*.json`, `vite.config.ts`, `src-tauri/Cargo.toml`, `src-tauri/deny.toml`,
  `package.json`) için kural kümesine bir "dosya yolu" kuralı eklenebilir: GitHub → Settings → Rules →
  Rulesets → "main koruması" → "Restrict file paths". Bu kural o dosyalara dokunan PR'ı engeller; sahibi
  gerektiğinde kuralı bilinçli olarak kısa süre kapatır. Böylece "kapıyı gevşetme" görünür bir karara dönüşür.

- `strict_required_status_checks_policy: false`. Açılırsa ("Require branches to be up to date") birlikte
  bozulma riski kalkar, ama her PR'ın yeniden koşması gerekir. Öneri: şimdilik kapalı kalsın, çünkü yayın
  zaten `main` CI'sine bağlı.

## 6. Öncelikli düzeltme sırası

1. **KAP-01.** `scripts/check-gates.mjs` eklenmeli ve `check` betiğine ve CI'ya girmeli. Sabitlemesi gerekenler:
   - `ci.yml`'deki adımlar: yorum dışı olmalı; `continue-on-error`, `|| true` ve `if: false` olmamalı;
     Clippy'de `-D warnings` bulunmalı.
   - `package.json` betikleri, `Cargo.toml [lints]`, `deny.toml` yasak listesi ve kaynak ayarı.
   - `tsconfig` bayrakları ve `eslint.config.js`'teki kilit kurallar.
   - Vitest tarafı: `exclude` olmamalı, test sayısı tabanın altına düşmemeli, skipped ve todo sıfır olmalı.
2. **KAP-04.** `storage.rs`'e yayımlanmış V1–V7 metinlerini sabitleyen bir test.
3. **KAP-03.** `check-rules.mjs` `tauri.conf.json`'daki `app.security.capabilities`'i, `remote`'u,
   `windows: ["main"]` değerini ve tehlikeli güvenlik bayraklarını denetlemeli; `capabilities/` klasörünü
   özyinelemeli taramalı.
4. **KAP-05.** Vitest JSON raporunda skipped ve todo sıfır olmalı; Rust'ta boş `#[ignore = ""]` ve
   `cfg(any())`/`cfg(FALSE)` reddedilmeli.
5. **KAP-02.** `check-docs.mjs` yorum satırlarını atmalı (1. madde yapılırsa gereksiz kalır).
6. **KAP-09.** `check-rules.mjs` kütüphane kodunda `allow(clippy::unwrap_used|expect_used|panic|…)`'ı
   reddetmeli.
7. **KAP-06.** CSP kaynak belirteçleri izinli bir kümeyle karşılaştırılmalı; `public/` taranmalı.
8. **KAP-08.** `check-commands.mjs` bindings'te karşılığı olan türlerin `./bindings/`'ten gelmesini zorlamalı.
9. **KAP-07.** Marka adı araması eklenmeli.
10. **KAP-10, KAP-11, KAP-12.** Arşiv ve `data:audio` taraması, `@ts-expect-error`, `noInlineConfig`'in
    kapsamı, CLAUDE.md satırı.
