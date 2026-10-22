// Belgelerin kodla uyumunu denetler. CLAUDE.md her yapay zekâ oturumunun talimatıdır; içindeki
// yanlış bir bilgi gelecek oturumlarda yanlış kod ya da yanlış bir link olarak geri döner.
//
// - CLAUDE.md'nin mimari ağacı: src-tauri/src altındaki her modül, src/hooks altındaki her hook ve
//   src/lib altındaki her yardımcı dosya adıyla geçer.
// - Belgelerdeki veri klasörü adları (%APPDATA%\…, %LOCALAPPDATA%\…) tauri.conf.json'daki program
//   kimliğiyle aynıdır (Windows'ta klasörün adı odur).
// - Linkler deponun bugünkü adını kullanır: eski hesap adına giden link, ad başkasına geçerse başka
//   birinin dosyasına gider.
// - Programın içinde gösterilen GPL metni LICENSE'ın kendisidir.
// Kullanım: npm run check:docs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const OLD_OWNER = /github\.com\/gozlemesevdalisi\//i;
/** Kullanıcıya ve oturumlara giden, bugünü anlatan belgeler (tarihsel kayıtlar hariç). */
const LIVE_DOCS = [
  "CLAUDE.md",
  "README.md",
  "SECURITY.md",
  "docs/ROADMAP.md",
  "docs/MIMARI.md",
  "docs/DOGRULAMA.md",
  "docs/ISARETLEME.md",
  "docs/LISANSLAR.md",
  "docs/SARKI-HARITASI.md",
];

function* walk(dir) {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const path = join(dir, entry);
    if (statSync(join(ROOT, path)).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const problems = [];
const claude = read("CLAUDE.md");

// 1. Mimari ağacı
const expected = [
  ...[...walk("src-tauri/src")]
    .filter((p) => p.endsWith(".rs") && !/(^|\/)(mod|main|test_util)\.rs$/.test(p))
    .map((p) => ({ path: p, name: basename(p) })),
  ...[...walk("src/hooks")]
    .filter((p) => /\.tsx?$/.test(p) && !/\.test\./.test(p))
    .map((p) => ({ path: p, name: basename(p).replace(/\.tsx?$/, "") })),
  ...[...walk("src/lib")]
    .filter((p) => !p.includes("bindings") && /\.tsx?$/.test(p) && !/\.test\./.test(p))
    .map((p) => ({ path: p, name: basename(p).replace(/\.tsx?$/, "") })),
];
for (const { path, name } of expected) {
  if (!new RegExp(`\\b${name.replace(".", "\\.")}\\b`).test(claude)) {
    problems.push(`CLAUDE.md: mimari ağacında ${path} yok`);
  }
}

// 1b. Ters yön: ağaçta adı geçen her dosya gerçekten var (silinen ya da adı değişen dosya ağaçta kalmaz).
const treeBlock = /## Mimari\s+```([\s\S]*?)```/.exec(claude)?.[1] ?? "";
const allFiles = new Set(
  ["src", "src-tauri/src", "src-tauri/examples", "src-tauri/tests", "scripts", "docs", ".github"]
    .flatMap((dir) => [...walk(dir)])
    .map((p) => basename(p)),
);
/** Programın çalışırken yazdığı dosyalar (depoda olmaz). */
const RUNTIME_FILES = new Set(["settings.json", "lyraska.log", "library.sqlite3"]);
const ROOT_FILES = new Set(["Cargo.toml", "tauri.conf.json", "deny.toml"]);
for (const m of treeBlock.matchAll(
  /(?<![\w.-])([\w-][\w.-]*\.(?:rs|ts|tsx|mjs|md|toml|json))\b/g,
)) {
  if (!allFiles.has(m[1]) && !ROOT_FILES.has(m[1]) && !RUNTIME_FILES.has(m[1])) {
    problems.push(`CLAUDE.md: mimari ağacında "${m[1]}" geçiyor ama böyle bir dosya yok`);
  }
}

// 2. Veri klasörü adları
const identifier = JSON.parse(read("src-tauri/tauri.conf.json")).identifier;
for (const doc of [...LIVE_DOCS, "src-tauri/src/library/mod.rs"]) {
  const text = read(doc);
  for (const m of text.matchAll(/%(?:LOCAL)?APPDATA%\\([\w.-]+)/g)) {
    if (m[1] !== identifier) {
      problems.push(`${doc}: veri klasörü "${m[0]}" yazıyor; gerçek ad ${identifier}`);
    }
  }
}

// 3. Eski hesap adına giden linkler (belgeler, kod, betikler, iş akışları, paketlenen dosyalar)
const linkScan = [
  ...LIVE_DOCS,
  ...[...walk("src")].filter((p) => !p.includes("bindings")),
  ...[...walk("scripts")],
  ...[...walk(".github")],
  ...[...walk("public")],
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
];
for (const file of linkScan) {
  const text = read(file);
  const m = OLD_OWNER.exec(text);
  if (m && relative(ROOT, join(ROOT, file)) !== "scripts/check-docs.mjs") {
    problems.push(`${file}: eski hesap adına link (${m[0]}…); depo artık lahmacunveayran/Lyraska`);
  }
}

// 4. Programın içindeki GPL metni deponun LICENSE dosyasıyla aynı (Ayarlar > Lisanslar).
if (read("public/lisanslar/GPL-3.0.txt") !== read("LICENSE")) {
  problems.push(
    "public/lisanslar/GPL-3.0.txt, LICENSE ile aynı değil (cp LICENSE public/lisanslar/GPL-3.0.txt)",
  );
}

if (problems.length > 0) {
  console.error(`Belgeler kodla uyuşmuyor:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `Belge denetimi tamam: ${expected.length} dosya CLAUDE.md'de, veri klasörü adları ve linkler doğru.`,
);
