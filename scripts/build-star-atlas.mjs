// Sanatçı levhalarının yıldız atlası verisini üretir: src/lib/starAtlas.json.
//
// Kaynaklar (ikisi de CC BY-SA 4.0; atıf ve lisans: docs/LISANSLAR.md, public/lisanslar/):
//   - HYG yıldız kataloğu v4.0 (astronexus/HYG-Database, hyg/CURRENT/hygdata_v40.csv.gz)
//   - Stellarium "modern" gök kültürü çizgileri (Stellarium/stellarium, skycultures/modern/index.json)
// Ham dosyalar depoya girmez; yalnızca bu betiğin çıktısı girer (çıplak göze görünen yıldızlar, V ≤ 6,5).
//
// Kullanım: node scripts/build-star-atlas.mjs <hygdata_v40.csv> <modern-index.json>
// Çıktı belirlenimcidir; aynı girdiler aynı dosyayı verir.

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "src", "lib", "starAtlas.json");
/** Çıplak gözle görülebilen sınır kadir. */
const MAG_LIMIT = 6.5;

const [hygPath, modernPath] = process.argv.slice(2);
if (!hygPath || !modernPath) {
  console.error(
    "Kullanım: node scripts/build-star-atlas.mjs <hygdata_v40.csv> <modern-index.json>",
  );
  process.exit(1);
}

/** Basit CSV satırı ayrıştırıcı (tırnaklı alanlar, içlerinde virgül olabilir). */
function parseCsvLine(line) {
  const out = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out;
}

const lines = readFileSync(hygPath, "utf8").split(/\r?\n/);
const header = parseCsvLine(lines[0]);
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`HYG sütunu yok: ${name}`);
  return i;
};
const [iHip, iRa, iDec, iMag, iProper] = ["hip", "ra", "dec", "mag", "proper"].map(col);

// Yıldızlar: [sağ açıklık (saat × 1000), dik açıklık (derece × 100), kadir × 100, HIP (yoksa 0)].
const stars = [];
for (const line of lines.slice(1)) {
  if (!line) continue;
  const f = parseCsvLine(line);
  if (f[iProper] === "Sol") continue;
  const mag = Number(f[iMag]);
  if (!Number.isFinite(mag) || mag > MAG_LIMIT) continue;
  stars.push([
    Math.round(Number(f[iRa]) * 1000),
    Math.round(Number(f[iDec]) * 100),
    Math.round(mag * 100),
    Number(f[iHip]) || 0,
  ]);
}
stars.sort((a, b) => a[2] - b[2] || a[3] - b[3] || a[0] - b[0]);
const known = new Set(stars.map((s) => s[3]).filter(Boolean));

// Takımyıldız çizgileri: IAU kısaltması → HIP numarası dizileri (yalnızca atlastaki yıldızlar).
const modern = JSON.parse(readFileSync(modernPath, "utf8"));
const constellations = {};
for (const c of modern.constellations ?? []) {
  const id = String(c.id).split(" ").pop();
  const polylines = [];
  for (const polyline of c.lines ?? []) {
    let run = [];
    for (const hip of polyline) {
      if (typeof hip === "number" && known.has(hip)) run.push(hip);
      else {
        if (run.length > 1) polylines.push(run);
        run = [];
      }
    }
    if (run.length > 1) polylines.push(run);
  }
  if (polylines.length > 0) constellations[id] = polylines;
}

const atlas = {
  source:
    "HYG v4.0 (astronexus, CC BY-SA 4.0) + Stellarium modern sky culture lines (CC BY-SA 4.0); V ≤ 6.5",
  stars,
  constellations,
};
writeFileSync(OUT, JSON.stringify(atlas) + "\n");
console.log(
  `Yıldız atlası yazıldı: ${stars.length} yıldız, ${Object.keys(constellations).length} takımyıldız → ${OUT}`,
);
