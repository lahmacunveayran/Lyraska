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
  for (const m of text.matchAll(/\b(?:allow|expect|warn)\s*\([^)\]]*\bunsafe_code\b/g)) {
    if (!UNSAFE_ALLOWED.has(name)) {
      problems.push(
        `${name}:${lineOf(text, m.index)}: unsafe yalnızca WASAPI çıkışında açılabilir`,
      );
    }
  }
  for (const m of text.matchAll(/#\[(?:ignore\s*\]|cfg_attr\([^\]]*\bignore\b(?!\s*=)[^\]]*\])/g)) {
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
      for (const m of text.matchAll(
        /\b(describe|it|test|bench)(?:\.\w+)*\.(skip|only|todo|skipIf|runIf)\b/g,
      )) {
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

// Çevrimdışı: arayüzde uzak adres yok (yorumlar ve testler hariç): http(s), ws(s), ftp ve
// protokolsüz `//alan.adi/...` (CSS `url(//…)`, `src="//…"`).
const REMOTE =
  /\b(?:https?|wss?|ftp):\/\/|(?:url\(\s*["']?|(?:src|href)\s*=\s*["'])\/\/[\w.-]+\.[a-z]{2,}/i;
for (const file of [...walk(join(ROOT, "src")), join(ROOT, "index.html")]) {
  if (!/\.(ts|tsx|css|html)$/.test(file) || /\.test\./.test(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    // Yorumlar atlanır; `https://` içindeki `//` yorum değildir (önünde `:` olan `//` kalır).
    const code = line.replace(/(^|[^:("'=])\/\/.*$/, "$1").replace(/^\s*\*.*$/, "");
    if (REMOTE.test(code)) {
      problems.push(`${relative(ROOT, file)}:${i + 1}: uzak adres (program internete bağlanmaz)`);
    }
  });
}
// Çekirdekte ağ kodu yok: soket, HTTP istemcisi.
for (const file of walk(join(ROOT, "src-tauri/src"))) {
  if (!file.endsWith(".rs")) continue;
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(
    /\b(std::net|TcpStream|TcpListener|UdpSocket|reqwest|ureq|hyper::)/g,
  )) {
    problems.push(
      `${relative(ROOT, file)}:${lineOf(text, m.index)}: ağ kodu (${m[1]}); program internete bağlanmaz`,
    );
  }
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
// Arayüz programın kendi dosyalarını `fetch` ile okuyorsa (ör. Ayarlar > Lisanslar) CSP buna izin
// vermeli: `connect-src` `default-src`'ye geri düşmez; 'self' yoksa sürümde metin açılmaz.
const usesFetch = [...walk(join(ROOT, "src"))].some(
  (file) =>
    /\.(ts|tsx)$/.test(file) &&
    !/\.test\./.test(file) &&
    /\bfetch\(/.test(readFileSync(file, "utf8")),
);
const connectSrc = /connect-src([^;]*)/.exec(csp)?.[1] ?? "";
if (usesFetch && !connectSrc.split(/\s+/).includes("'self'")) {
  problems.push("tauri.conf.json CSP: arayüz fetch kullanıyor ama connect-src'de 'self' yok");
}

// İzinler en dar hâlinde: yeni bir Tauri izni (ör. dosya sistemi, kabuk, http) bilinçli eklenir.
// Arayüzün kullandıkları: olay dinleme (pencereye sürükle-bırak) ve dosya seçme penceresi.
// Kaydetme penceresini arayüz açamaz: yazılacak yolu çekirdek sorar (commands.rs ask_save_path).
const ALLOWED_PERMISSIONS = [
  "core:event:allow-listen",
  "core:event:allow-unlisten",
  "dialog:allow-open",
];
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
