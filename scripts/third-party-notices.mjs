// Programla dağıtılan üçüncü taraf kodun lisans bildirimlerini üretir:
// public/lisanslar/UCUNCU-TARAF.txt (programın içine paketlenir, Ayarlar > Lisanslar'dan açılır).
//
// Kaynaklar:
// - Rust: Windows hedefinde çalıştırılabilir dosyaya giren crate'ler (`cargo tree`, yalnızca normal
//   bağımlılıklar; derleme betikleri ve proc-macro'lar hariç). Lisans metinleri crate'in kendi
//   paketinden (~/.cargo/registry/cache/*/<ad>-<sürüm>.crate) okunur; önce `cargo fetch` gerekir.
// - npm: pakete giren (dev olmayan) bağımlılıklar (`npm ls --omit=dev`); lisans metinleri node_modules'tan.
// - Gömülü C/C++: MilkDrop gölgelendirici çeviricisi (src-tauri/hlsl/hlslparser.wasm) projectM'in
//   hlslparser'ını ve wasi-sdk'nın C/C++ kitaplıklarını içerir; metinler depoda
//   (src-tauri/vendor/hlslparser/LICENSE, src-tauri/hlsl/lisanslar/).
//
// MIT/BSD/ISC gibi lisanslar ikili dağıtımda telif ve izin metninin verilmesini şart koşar
// (DENETIM.md C3). Çıktı belirlenimcidir (sıralı, tarih yok); CI yeniden üretip depodakiyle karşılaştırır.
// Kullanım: node scripts/third-party-notices.mjs [--check]

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUTPUT = join(ROOT, "public", "lisanslar", "UCUNCU-TARAF.txt");
const TARGET = "x86_64-pc-windows-msvc";
const LICENSE_FILE = /^(LICEN[CS]E|COPYING|NOTICE)(\.|-|_|$)/i;

/** Yerel ayardan bağımsız sıralama (kod noktası): çıktı her makinede aynı olsun. */
function byCodePoint(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Rust crate'leri: ad, sürüm, lisans ifadesi, depo. */
function rustPackages() {
  const out = execFileSync(
    "cargo",
    [
      "tree",
      "--locked",
      "--color",
      "never",
      "--target",
      TARGET,
      "-e",
      "normal,no-proc-macro",
      "--prefix",
      "none",
      "--format",
      "{p}|{l}|{r}",
    ],
    { cwd: join(ROOT, "src-tauri"), encoding: "utf8", maxBuffer: 64 << 20 },
  );
  const authors = rustAuthors();
  const seen = new Map();
  for (const raw of out.split("\n")) {
    // CI `CARGO_TERM_COLOR=always` verse bile renk kodları ve "(*)" tekrar işareti temizlenir.
    const line = raw
      // eslint-disable-next-line no-control-regex -- ANSI renk kodu (ESC) bilerek temizlenir
      .replace(/\u001b\[[0-9;]*m/g, "")
      .replace(/ \(\*\)$/, "")
      .trim();
    if (!line) continue;
    const [pkg, license, repository] = line.split("|");
    const match = /^(\S+) v(\S+)(?: \((.*)\))?$/.exec(pkg);
    if (!match) throw new Error(`cargo tree satırı anlaşılamadı: ${line}`);
    const [, name, version, path] = match;
    if (name === "lyraska" || path) continue; // kendi kodumuz (yol bağımlılığı)
    seen.set(`${name} ${version}`, {
      name,
      version,
      license: license || "BİLİNMİYOR",
      repository,
      authors: authors.get(`${name} ${version}`) ?? [],
    });
  }
  return [...seen.values()].sort(
    (a, b) => byCodePoint(a.name, b.name) || byCodePoint(a.version, b.version),
  );
}

/** Crate'lerin `authors` alanı (ad + sürüm → yazarlar): lisans metninde telif satırı yoksa yazılır. */
function rustAuthors() {
  const metadata = JSON.parse(
    execFileSync("cargo", ["metadata", "--locked", "--format-version", "1"], {
      cwd: join(ROOT, "src-tauri"),
      encoding: "utf8",
      maxBuffer: 256 << 20,
    }),
  );
  return new Map(metadata.packages.map((p) => [`${p.name} ${p.version}`, p.authors ?? []]));
}

/**
 * "Ad <e-posta> (adres)" → "Ad": bildirimde yalnızca ad yazılır. Silme bir şey kalmayana dek
 * tekrarlanır ("<<a>b>" bir geçişte "<b>" bırakırdı); eşi olmayan "<" ve ">" de atılır.
 */
function authorName(author) {
  let text = typeof author === "string" ? author : (author?.name ?? "");
  for (let previous = ""; previous !== text;) {
    previous = text;
    text = text.replace(/<[^<>]*>/g, "").replace(/\([^()]*\)/g, "");
  }
  return text.replace(/[<>]/g, "").trim();
}

/**
 * Paketinde lisans dosyası olmayan crate'ler için depoda tutulan metinler (scripts/notices/README.md).
 * Crate adı → dosya.
 */
const MANUAL_TEXTS = {
  realfft: "realfft.LICENSE.txt",
  "webview2-com": "webview2-com.LICENSE.txt",
  "webview2-com-sys": "webview2-com.LICENSE.txt",
};

/** Crate paketindeki lisans dosyaları (ad → metin); yoksa elle eklenen metin. */
function rustLicenseTexts(name, version) {
  const texts = packagedLicenseTexts(name, version);
  if (texts.size === 0 && MANUAL_TEXTS[name]) {
    const file = MANUAL_TEXTS[name];
    texts.set(
      `scripts/notices/${file}`,
      readFileSync(join(ROOT, "scripts", "notices", file), "utf8"),
    );
  }
  return texts;
}

function packagedLicenseTexts(name, version) {
  const cargoHome = process.env.CARGO_HOME ?? join(homedir(), ".cargo");
  const cacheRoot = join(cargoHome, "registry", "cache");
  const file = `${name}-${version}.crate`;
  const archive = readdirSync(cacheRoot)
    .map((dir) => join(cacheRoot, dir, file))
    .find((p) => existsSync(p));
  if (!archive)
    throw new Error(
      `${file} bulunamadı; önce 'cd src-tauri && cargo fetch --locked --target ${TARGET}'`,
    );
  const listing = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
    .split("\n")
    .filter((entry) => {
      const parts = entry.split("/");
      return parts.length === 2 && LICENSE_FILE.test(parts[1]);
    });
  if (listing.length === 0) return new Map();
  const dir = mkdtempSync(join(tmpdir(), "lyraska-lisans-"));
  try {
    execFileSync("tar", ["-xzf", archive, "-C", dir, ...listing]);
    return new Map(
      listing.map((entry) => [entry.split("/")[1], readFileSync(join(dir, entry), "utf8")]),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** npm paketleri (pakete girenler): paket kilidinde `dev` olmayanlar; lisans dosyaları node_modules'tan. */
function npmPackages() {
  const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));
  const found = [];
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key.startsWith("node_modules/") || entry.dev || entry.link) continue;
    const dir = join(ROOT, key);
    if (!existsSync(dir)) {
      if (entry.optional) continue; // bu platformda kurulmayan isteğe bağlı paket
      throw new Error(`${key} kurulu değil; önce 'npm ci'`);
    }
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const license =
      typeof pkg.license === "string" ? pkg.license : (pkg.license?.type ?? "BİLİNMİYOR");
    const texts = new Map();
    for (const file of readdirSync(dir)) {
      if (LICENSE_FILE.test(file)) texts.set(file, readFileSync(join(dir, file), "utf8"));
    }
    const repository = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
    found.push({
      name: pkg.name ?? key.slice("node_modules/".length),
      version: pkg.version,
      license,
      repository,
      texts,
      authors: [pkg.author, ...(pkg.contributors ?? [])].filter(Boolean),
    });
  }
  return found.sort((a, b) => byCodePoint(a.name, b.name) || byCodePoint(a.version, b.version));
}

/** WebAssembly çeviriciye derlenmiş C/C++ kodu (sürümler `src-tauri/hlsl/build.sh` ile aynı). */
function embeddedPackages() {
  const read = (path) => readFileSync(join(ROOT, path), "utf8");
  const licenses = "src-tauri/hlsl/lisanslar";
  return [
    {
      name: "hlslparser (projectM çatalı)",
      version: "349b7cc2db31",
      license: "MIT (projectM değişiklikleri: projectM ekibi, LGPL-2.1-or-later olabilir)",
      repository: "https://github.com/projectM-visualizer/projectm/tree/master/vendor/hlslparser",
      texts: new Map([["LICENSE", read("src-tauri/vendor/hlslparser/LICENSE")]]),
    },
    {
      name: "libc++ ve libc++abi (LLVM, wasi-sdk)",
      version: "30.0",
      license: "Apache-2.0 WITH LLVM-exception",
      repository: "https://github.com/llvm/llvm-project",
      texts: new Map([["LICENSE.TXT", read(`${licenses}/libcxx-LICENSE.TXT`)]]),
    },
    {
      name: "wasi-libc (wasi-sdk)",
      version: "30.0",
      license:
        "Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT; içindeki musl MIT, cloudlibc BSD-2-Clause, dlmalloc CC0",
      repository: "https://github.com/WebAssembly/wasi-libc",
      texts: new Map([
        ["LICENSE", read(`${licenses}/wasi-libc-LICENSE`)],
        ["LICENSE-MIT", read(`${licenses}/wasi-libc-LICENSE-MIT`)],
        ["libc-top-half/musl/COPYRIGHT", read(`${licenses}/musl-COPYRIGHT`)],
        ["libc-bottom-half/cloudlibc/LICENSE", read(`${licenses}/cloudlibc-LICENSE`)],
      ]),
    },
  ];
}

/** Programa gömülü veri (kod değil): sanatçı levhalarının yıldız atlası (`src/lib/starAtlas.json`). */
function embeddedData() {
  const ccBySa = readFileSync(join(ROOT, "public", "lisanslar", "CC-BY-SA-4.0.txt"), "utf8");
  const change =
    "Değişiklik: Lyraska yalnızca çıplak göze görünen yıldızları (V ≤ 6,5; konum, kadir, HIP) ve takımyıldız çizgilerini alır, biçimini değiştirir (scripts/build-star-atlas.mjs); türetilen veri de CC BY-SA 4.0";
  return [
    {
      name: "HYG yıldız kataloğu (David Nash, astronexus)",
      version: "v4.0",
      license: `CC-BY-SA-4.0 (https://creativecommons.org/licenses/by-sa/4.0/). ${change}`,
      repository: "https://github.com/astronexus/HYG-Database",
      credit: ["Atıf: HYG Database, David Nash (astronexus), https://www.astronexus.com/hyg"],
      texts: new Map([["CC-BY-SA-4.0.txt", ccBySa]]),
    },
    {
      name: "Stellarium modern gök kültürü çizgileri (Stellarium geliştiricileri)",
      version: "ad4960210acc",
      license: `CC-BY-SA-4.0 (https://creativecommons.org/licenses/by-sa/4.0/). ${change}`,
      repository: "https://github.com/Stellarium/stellarium",
      credit: ['Atıf: Stellarium, "modern" sky culture, Stellarium geliştiricileri'],
      texts: new Map([["CC-BY-SA-4.0.txt", ccBySa]]),
    },
  ];
}

function normalize(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Telif satırı: "Copyright (c) 2015 Ad", "Copyright 2016 The ...", "© 2020 ...", SPDX PackageCopyrightText. */
const COPYRIGHT =
  /\b[Cc]opyright\b\s*(?:\([Cc]\)|©)?\s*(?:\d{4}|[A-Z][\w.-]|<)|(?:\([Cc]\)|©)\s*\d{4}|PackageCopyrightText/;
/** Lisans metinlerinin kendi cümleleri (telif sahibi değil). */
const NOT_COPYRIGHT = /copyright (notice|holder|law|owner|statement|licen[cs]e|interest)/i;

/** Metnin telif satırları (lisans metninden ayrı listelenir). */
function copyrightLines(text) {
  const lines = new Set();
  for (const line of normalize(text).split("\n")) {
    if (COPYRIGHT.test(line) && !NOT_COPYRIGHT.test(line)) lines.add(line.trim());
  }
  return [...lines];
}

function build() {
  const texts = new Map(); // hash → { text, users: [] }
  const addText = (text, user) => {
    const clean = normalize(text);
    const hash = createHash("sha256").update(clean).digest("hex").slice(0, 12);
    if (!texts.has(hash)) texts.set(hash, { text: clean, users: [] });
    texts.get(hash).users.push(user);
    return hash;
  };

  const rust = rustPackages().map((p) => ({ ...p, texts: rustLicenseTexts(p.name, p.version) }));
  const npm = npmPackages();

  const lines = [];
  lines.push("LYRASKA — ÜÇÜNCÜ TARAF LİSANS BİLDİRİMLERİ");
  lines.push("");
  lines.push(
    "Lyraska GPL-3.0-only lisansıyla dağıtılır (kaynak kodu: https://github.com/lahmacunveayran/Lyraska).",
  );
  lines.push(
    "Program aşağıdaki açık kaynak kütüphaneleri içerir. Her kütüphanenin lisansı ve telif sahipleri",
  );
  lines.push("burada; lisans metinlerinin tamamı sonda (aynı metni kullananlar tek kez verilir).");
  lines.push(
    "Bu dosya scripts/third-party-notices.mjs ile üretilir ve CI'da depodakiyle karşılaştırılır.",
  );
  lines.push("");

  const section = (title, packages) => {
    lines.push("=".repeat(78));
    lines.push(title);
    lines.push("=".repeat(78));
    lines.push("");
    for (const p of packages) {
      lines.push(`${p.name} ${p.version}`);
      lines.push(`  Lisans: ${p.license}`);
      if (p.repository)
        lines.push(`  Kaynak: ${p.repository.replace(/^git\+/, "").replace(/\.git$/, "")}`);
      // Atıf satırı elle verilmişse (veri; lisans metni telif satırı taşımaz) o yazılır.
      const copyrights = new Set(p.credit ?? []);
      const refs = [];
      for (const [file, text] of [...p.texts.entries()].sort()) {
        if (!p.credit) for (const c of copyrightLines(text)) copyrights.add(c);
        refs.push(`${file} → metin ${addText(text, `${p.name} ${p.version}`)}`);
      }
      for (const c of copyrights) lines.push(`  ${c}`);
      // Lisans metninde telif satırı yoksa (ör. "Apache-2.0" metninin kendisi) paketin yazarları:
      // MIT/BSD bildiriminin "copyright notice" kısmı boş kalmasın.
      const authors = [...new Set((p.authors ?? []).map(authorName).filter(Boolean))];
      if (copyrights.size === 0) {
        lines.push(
          authors.length > 0
            ? `  Yazarlar: ${authors.join(", ")}`
            : "  Telif: paketin yazarları (yazar bilgisi yok; kaynak deposundaki katkıcılar)",
        );
      }
      if (refs.length === 0) {
        // Paket lisans dosyası taşımıyor (çoğu zaman aynı deponun başka paketinde): oraya yollanır.
        const sibling = packages.find(
          (o) => o !== p && o.repository && o.repository === p.repository && o.texts.size > 0,
        );
        lines.push(
          sibling
            ? `  (pakette lisans dosyası yok; aynı deponun ${sibling.name} ${sibling.version} paketindeki metin geçerli)`
            : "  (pakette lisans dosyası yok; lisans ifadesi yukarıda, metin için kaynak deposuna bakın)",
        );
      }
      for (const r of refs) lines.push(`  ${r}`);
      lines.push("");
    }
  };
  section(`RUST KÜTÜPHANELERİ (${rust.length}; ses motoru, analiz, kütüphane)`, rust);
  section(`JAVASCRIPT KÜTÜPHANELERİ (${npm.length}; arayüz)`, npm);
  const embedded = embeddedPackages();
  section(
    `GÖMÜLÜ C/C++ KÜTÜPHANELERİ (${embedded.length}; MilkDrop gölgelendirici çeviricisi, WebAssembly)`,
    embedded,
  );
  const data = embeddedData();
  section(`GÖMÜLÜ VERİ (${data.length}; sanatçı levhalarının yıldız atlası)`, data);

  lines.push("=".repeat(78));
  lines.push(`LİSANS METİNLERİ (${texts.size} farklı metin)`);
  lines.push("=".repeat(78));
  lines.push("");
  for (const [hash, { text, users }] of [...texts.entries()].sort()) {
    lines.push("-".repeat(78));
    lines.push(`metin ${hash} — kullananlar: ${[...new Set(users)].join(", ")}`);
    lines.push("-".repeat(78));
    lines.push(text);
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

const content = build();
if (process.argv.includes("--check")) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : "";
  if (current !== content) {
    console.error(
      `${OUTPUT} güncel değil. 'node scripts/third-party-notices.mjs' ile üretip commit edin.`,
    );
    // İlk farkı göster: CI günlüğünden neden anlaşılsın (makineye bağlı bir fark varsa yeri belli olsun).
    const have = current.split("\n");
    const want = content.split("\n");
    const limit = Math.min(have.length, want.length);
    let i = 0;
    while (i < limit && have[i] === want[i]) i += 1;
    console.error(
      `Satır sayısı: depoda ${have.length}, üretilen ${want.length}; ilk fark ${i + 1}. satırda:`,
    );
    for (let k = Math.max(0, i - 2); k < Math.min(limit, i + 6); k += 1) {
      console.error(`  depoda   ${k + 1}: ${have[k] ?? ""}`);
      console.error(`  üretilen ${k + 1}: ${want[k] ?? ""}`);
    }
    process.exit(1);
  }
  console.log("Üçüncü taraf lisans bildirimleri güncel.");
} else {
  writeFileSync(OUTPUT, content);
  const size = (Buffer.byteLength(content) / 1024).toFixed(0);
  console.log(`Yazıldı: ${OUTPUT} (${size} KB)`);
}
