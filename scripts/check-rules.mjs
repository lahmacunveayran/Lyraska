// CLAUDE.md'deki, derleyicinin ve lint'in tek başına zorlayamadığı kuralları denetler:
//
// - `unsafe` yalnızca WASAPI çıkışında açılır (`#[allow(unsafe_code …)]` başka dosyada olamaz).
// - Testler atlanmaz, devre dışı bırakılmaz: arayüzde `.skip` / `.only` / `.todo`, Rust'ta gerekçesiz
//   `#[ignore]` yok. Gerekçeli `#[ignore = "…"]` yalnızca elle çalıştırılan ölçüm ve tablo üreticileri
//   içindir (ör. ffmpeg gerektiren deney).
// - Test dosyaları `*.test.ts(x)` / `*.test.mjs` adını taşır: başka adla yazılan test hiç koşmaz.
// - Program internete bağlanmaz: arayüz kodunda ve sayfada uzak adres (http/https) yoktur; içerik
//   güvenliği politikası (CSP) uzak kaynağa, `eval`'e ve satır içi betiğe izin vermez.
// - Tauri izinleri (capabilities) bilinen en dar listededir.
// Kullanım: npm run check:rules

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const UNSAFE_ALLOWED = new Set(["src-tauri/src/audio/output/wasapi.rs"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "target" || entry === "bindings") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const problems = [];
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

for (const file of walk(join(ROOT, "src-tauri"))) {
  if (!file.endsWith(".rs")) continue;
  const name = relative(ROOT, file);
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/allow\(\s*unsafe_code/g)) {
    if (!UNSAFE_ALLOWED.has(name)) {
      problems.push(
        `${name}:${lineOf(text, m.index)}: unsafe yalnızca WASAPI çıkışında açılabilir`,
      );
    }
  }
  for (const m of text.matchAll(/#\[ignore\s*\]/g)) {
    problems.push(
      `${name}:${lineOf(text, m.index)}: gerekçesiz #[ignore] (#[ignore = "neden"] yazın)`,
    );
  }
}

for (const dir of ["src", "scripts"]) {
  for (const file of walk(join(ROOT, dir))) {
    if (!/\.(ts|tsx|mjs)$/.test(file)) continue;
    const name = relative(ROOT, file);
    if (name === "scripts/check-rules.mjs") continue; // kendi kalıpları
    const text = readFileSync(file, "utf8");
    const isTest = /\.test\.(ts|tsx|mjs)$/.test(file);
    if (isTest) {
      for (const m of text.matchAll(/\b(describe|it|test)\.(skip|only|todo|skipIf|runIf)\b/g)) {
        problems.push(`${name}:${lineOf(text, m.index)}: ${m[0]} — testler atlanmaz`);
      }
      for (const m of text.matchAll(/\b(xit|xdescribe|fit|fdescribe)\(/g)) {
        problems.push(`${name}:${lineOf(text, m.index)}: ${m[1]} — testler atlanmaz`);
      }
    } else if (/from "vitest"/.test(text) || /^\s*(describe|it|test)\(\s*["'`]/m.test(text)) {
      problems.push(
        `${name}: test içeriyor ama adı *.test.ts(x)/*.test.mjs değil (proje kuralı; başka adlar koşmayabilir)`,
      );
    }
  }
}

// Çevrimdışı: arayüzde uzak adres yok (yorumlar ve testler hariç).
for (const file of [...walk(join(ROOT, "src")), join(ROOT, "index.html")]) {
  if (!/\.(ts|tsx|css|html)$/.test(file) || /\.test\./.test(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
    if (/https?:\/\//.test(code)) {
      problems.push(`${relative(ROOT, file)}:${i + 1}: uzak adres (program internete bağlanmaz)`);
    }
  });
}
const csp = JSON.parse(readFileSync(join(ROOT, "src-tauri/tauri.conf.json"), "utf8")).app.security
  .csp;
const remote =
  csp.match(/https?:\/\/[^\s;]+/g)?.filter((url) => url !== "http://ipc.localhost") ?? [];
if (remote.length > 0) problems.push(`tauri.conf.json CSP: uzak kaynak ${remote.join(", ")}`);
const cspTokens = new Set(csp.split(/[\s;]+/));
for (const unsafe of ["'unsafe-eval'", "'unsafe-inline'", "*", "https:", "http:"]) {
  if (cspTokens.has(unsafe)) problems.push(`tauri.conf.json CSP: ${unsafe} olamaz`);
}
for (const required of ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'"]) {
  if (!csp.includes(required)) problems.push(`tauri.conf.json CSP: "${required}" eksik`);
}

// İzinler en dar hâlinde: yeni bir Tauri izni (ör. dosya sistemi, kabuk, http) bilinçli eklenir.
const ALLOWED_PERMISSIONS = ["core:default", "dialog:allow-open", "dialog:allow-save"];
for (const file of readdirSync(join(ROOT, "src-tauri/capabilities"))) {
  const capability = JSON.parse(readFileSync(join(ROOT, "src-tauri/capabilities", file), "utf8"));
  for (const permission of capability.permissions ?? []) {
    const id = typeof permission === "string" ? permission : permission.identifier;
    if (!ALLOWED_PERMISSIONS.includes(id)) {
      problems.push(
        `src-tauri/capabilities/${file}: "${id}" izni listede yok (scripts/check-rules.mjs ALLOWED_PERMISSIONS; önce gerekçe)`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(`Kural ihlali:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(
  "Kural denetimi tamam: unsafe yalnızca WASAPI'de, atlanan test yok, test adları doğru, " +
    "uzak adres yok, CSP sıkı.",
);
