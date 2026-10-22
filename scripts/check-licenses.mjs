// npm bağımlılıklarının lisanslarını denetler (Rust tarafı: cargo deny check licenses).
//
// Kural (CLAUDE.md "Lisans kuralları"): yalnızca src-tauri/deny.toml'daki izin listesindeki
// lisanslar. Liste tek yerde; npm ve Rust aynı politikayı uygular. Lisans alanı SPDX ifadesi
// olarak ayrıştırılır: "(MIT OR Apache-2.0) AND BUSL-1.1" gibi bir ifadede BUSL izinsizse paket
// reddedilir. Lisansı belirtilmemiş, "UNLICENSED" ya da "SEE LICENSE IN" yazan paket de reddedilir.
//
// Kaynak paket kilidi (package-lock.json): yalnızca bu makinede kurulanlar değil, başka işletim
// sistemlerine özgü isteğe bağlı paketler de denetlenir.
//
// Pakete girmeyen geliştirme araçları için DEV_ONLY'deki lisanslar ayrıca kabul edilir: ikisi de
// izin verici ve GPL-3.0 ile uyumlu, ikisi de programla dağıtılmaz (proje sahibine bildirildi,
// DENETIM-FAZ0.md bölüm 8).
// Kullanım: npm run check:licenses

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { allowedFromDenyToml, checkLicense, forbiddenLicenses } from "./lib/licenses.mjs";

const ROOT = resolve(import.meta.dirname, "..");

/** Yalnızca geliştirme araçlarında (pakete girmez) ek olarak kabul edilen lisanslar. */
const DEV_ONLY = [
  "BlueOak-1.0.0", // izin verici (Blue Oak Council); ör. glob/minimatch çevresi
  "CC-BY-4.0", // veri lisansı; caniuse-lite (tarayıcı destek tablosu)
];

const allowed = allowedFromDenyToml(readFileSync(join(ROOT, "src-tauri", "deny.toml"), "utf8"));
const allowedDev = new Set([...allowed, ...DEV_ONLY]);
const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));

const problems = forbiddenLicenses(allowedDev).map(
  (id) =>
    `izin listesinde yasaklı lisans: ${id} (AGPL ve ticari kullanımı yasaklayan lisanslar giremez)`,
);
let count = 0;
let shipped = 0;
for (const [key, entry] of Object.entries(lock.packages ?? {})) {
  if (!key.startsWith("node_modules/") || entry.link) continue;
  const name = key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
  let field = entry.license;
  const manifest = join(ROOT, key, "package.json");
  if (field === undefined && existsSync(manifest)) {
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    field = pkg.license ?? pkg.licenses;
  }
  count++;
  if (!entry.dev) shipped++;
  const problem = checkLicense(field, entry.dev ? allowedDev : allowed);
  if (problem) {
    problems.push(`${name}@${entry.version}${entry.dev ? "" : " (pakete girer)"}: ${problem}`);
  }
}

if (problems.length > 0) {
  console.error(`İzin verilmeyen ya da belirsiz lisanslı paketler:\n  ${problems.join("\n  ")}`);
  console.error(
    "İzin verilen lisanslar: src-tauri/deny.toml. Yeni lisans önce proje sahibine sorulur.",
  );
  process.exit(1);
}
console.log(
  `Lisans denetimi tamam: ${count} paket (${shipped} pakete giren), hepsi izin listesinde.`,
);
