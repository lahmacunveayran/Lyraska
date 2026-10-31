// Belgelerin kodla uyumunu denetler. CLAUDE.md her yapay zekâ oturumunun talimatıdır; içindeki
// yanlış bir bilgi gelecek oturumlarda yanlış kod ya da yanlış bir link olarak geri döner.
//
// - CLAUDE.md'nin mimari ağacı: src-tauri/src altındaki her modül, src/hooks altındaki her hook,
//   src/lib altındaki her yardımcı ve src/components altındaki her bileşen kendi klasörünün altında
//   adıyla geçer.
// - Belgelerdeki veri klasörü adları (%APPDATA%\…, %LOCALAPPDATA%\…) tauri.conf.json'daki program
//   kimliğiyle aynıdır (Windows'ta klasörün adı odur).
// - Linkler deponun bugünkü adını kullanır: eski hesap adına giden link, ad başkasına geçerse başka
//   birinin dosyasına gider.
// - package.json'daki her `check:*` betiği CI'da çalışır.
// - Programın içinde gösterilen GPL metni LICENSE'ın kendisidir.
// - Her oturumda okunan "ikinci beyin" belgeleri sınırlı kalır: büyüdükçe her oturum daha çok
//   kullanım payı harcar. Sınır aşılınca eski maddeler kısaltılır ya da devir notlarına taşınır.
// Kullanım: npm run check:docs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
// Depo içi yollar "/" ile (Windows'ta da ağaçtaki adlarla eşleşsin).
import { basename, dirname, join } from "node:path/posix";

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
  "docs/BILGI-BIRIKIMI.md",
  "docs/ACIK-KONULAR.md",
];
/** Her oturumun başında okunan belgeler ve satır sınırları. */
// İkinci beynin sınırı 640 satır (proje sahibinin kararı, 24 Ekim 2026).
const SESSION_DOCS = { "docs/BILGI-BIRIKIMI.md": 640, "docs/ACIK-KONULAR.md": 60 };

function* walk(dir) {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const path = join(dir, entry);
    if (statSync(join(ROOT, path)).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const problems = [];
const claude = read("CLAUDE.md");

// 1. Mimari ağacı. Her dosya kendi klasörünün altında anılmalı (başka klasördeki aynı adlı dosya
// yerine geçmez): ağaçta klasörün satırından, aynı ya da daha üst düzeydeki bir sonraki satıra kadar.
const treeBlock = /## Mimari\s+```([\s\S]*?)```/.exec(claude)?.[1] ?? "";
const treeLines = treeBlock.split("\n").map((line) => {
  const m = /^([│ ]*)[├└]── ([^\s#]+)/.exec(line);
  return { line, indent: m ? m[1].length : null, name: m?.[2] ?? null };
});
/** Klasörün ağaçtaki bölümü (`src-tauri/src/library` → o satırdan alt öğelerinin sonuna). */
function treeRegion(dir) {
  let from = 0;
  let to = treeLines.length;
  let indent = -1;
  for (const segment of dir.split("/")) {
    const at = treeLines.findIndex(
      (l, i) =>
        i >= from && i < to && l.indent !== null && l.indent > indent && l.name === `${segment}/`,
    );
    if (at < 0) return "";
    indent = treeLines[at].indent;
    from = at;
    const next = treeLines.findIndex((l, i) => i > at && l.indent !== null && l.indent <= indent);
    to = next < 0 ? treeLines.length : next;
  }
  return treeLines
    .slice(from, to)
    .map((l) => l.line)
    .join("\n");
}
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
  ...[...walk("src/components")]
    .filter((p) => /\.tsx?$/.test(p) && !/\.test\./.test(p))
    .map((p) => ({ path: p, name: basename(p).replace(/\.tsx?$/, "") })),
];
for (const { path, name } of expected) {
  // Ağaçta kendi satırı olmayan alt klasör (ör. audio/output) üst klasörünün bölümünde anılır.
  let dir = dirname(path);
  let region = treeRegion(dir);
  while (region === "" && dir.includes("/")) {
    dir = dirname(dir);
    region = treeRegion(dir);
  }
  if (!new RegExp(`\\b${name.replace(".", "\\.")}\\b`).test(region)) {
    problems.push(`CLAUDE.md: mimari ağacında ${path} yok (${dir}/ altında anılmalı)`);
  }
}

// 1b. Ters yön: ağaçta adı geçen her dosya gerçekten var (silinen ya da adı değişen dosya ağaçta kalmaz).
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
  for (const m of text.matchAll(
    /(?:%(?:LOCAL)?APPDATA%|AppData\\(?:Roaming|Local))\\([\w.-]+)/gi,
  )) {
    if (m[1] !== identifier && !/^(Roaming|Local|LocalLow)$/i.test(m[1])) {
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
  ...[...walk("src-tauri/src")],
  ...[...walk("src-tauri/examples")],
  "index.html",
  "package.json",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
];
for (const file of linkScan) {
  const text = read(file);
  const m = OLD_OWNER.exec(text);
  if (m && file !== "scripts/check-docs.mjs") {
    problems.push(`${file}: eski hesap adına link (${m[0]}…); depo artık lahmacunveayran/Lyraska`);
  }
}

// 4. Her `check:*` betiği CI'da çalışır (yerelde yazılıp CI'ya eklenmeyen bir kapı hiçbir şeyi korumaz).
const ci = read(".github/workflows/ci.yml");
for (const name of Object.keys(JSON.parse(read("package.json")).scripts)) {
  if (name.startsWith("check:") && !new RegExp(`npm run ${name}\\b`).test(ci)) {
    problems.push(`package.json: "${name}" CI'da (.github/workflows/ci.yml) çalışmıyor`);
  }
}

// 5. Programın içindeki GPL metni deponun LICENSE dosyasıyla aynı (Ayarlar > Lisanslar).
if (read("public/lisanslar/GPL-3.0.txt") !== read("LICENSE")) {
  problems.push(
    "public/lisanslar/GPL-3.0.txt, LICENSE ile aynı değil (cp LICENSE public/lisanslar/GPL-3.0.txt)",
  );
}

// 6. Her oturumda okunan belgeler sınırı aşmaz.
for (const [doc, limit] of Object.entries(SESSION_DOCS)) {
  const lines = read(doc).split("\n").length;
  if (lines > limit) {
    problems.push(
      `${doc}: ${lines} satır (sınır ${limit}); eski maddeleri kısaltın ya da devir notlarına taşıyın`,
    );
  }
}

if (problems.length > 0) {
  console.error(`Belgeler kodla uyuşmuyor:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `Belge denetimi tamam: ${expected.length} dosya CLAUDE.md'de, veri klasörü adları ve linkler doğru.`,
);
