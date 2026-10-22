// Depoda ses dosyası olmadığını denetler (telif): yalnızca projenin kendi ürettiği sentetik test
// sesleri (src-tauri/tests/data/) izinlidir. CI'da çalışır.
//
// - Uzantıya ve içeriğe (dosya imzası) bakar: adı değiştirilmiş ses de yakalanır.
// - İzinli klasördeki her dosyanın tarifi klasörün README.md'sinde yazılı olmalı ve dosya küçük
//   olmalı (sentetik sinyaller birkaç KB; gerçek bir şarkı MB'larca).
// - `--history`: bütün git geçmişindeki her dosya içeriği taranır. Bir kez commit edilip sonra
//   silinen ses de geçmişte (ve GitHub'da) kalır; CI bunu `fetch-depth: 0` ile denetler.
// Kullanım: npm run check:audio [-- --history]

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { documentedNames, hasAudioExtension, sniffAudio } from "./lib/audio.mjs";

const ALLOWED_DIR = "src-tauri/tests/data/";
const MAX_TEST_AUDIO_BYTES = 256 * 1024;
const history = process.argv.includes("--history");

const git = (args, input) =>
  execFileSync("git", args, { input, maxBuffer: 1 << 30, encoding: input ? undefined : "utf8" });

const problems = [];

// Şu anki ağaç: ad, içerik, izinli klasörün kuralları.
const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const readme = readFileSync(`${ALLOWED_DIR}README.md`, "utf8");
const documented = documentedNames(readme);
for (const file of files) {
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    continue; // çalışma ağacında silinmiş, henüz commit edilmemiş
  }
  const format = sniffAudio(bytes);
  if (!hasAudioExtension(file) && !format) continue;
  if (!file.startsWith(ALLOWED_DIR)) {
    problems.push(`${file}: ses dosyası${format ? ` (${format})` : ""}`);
    continue;
  }
  const name = file.slice(ALLOWED_DIR.length);
  if (name.includes("/") || !documented.has(name)) {
    problems.push(
      `${file}: tarifi ${ALLOWED_DIR}README.md'de yok (yalnızca üretim komutu yazılı sentetik ses)`,
    );
  }
  if (bytes.length > MAX_TEST_AUDIO_BYTES) {
    problems.push(
      `${file}: ${bytes.length} bayt; test sesi en fazla ${MAX_TEST_AUDIO_BYTES} bayt olabilir`,
    );
  }
}

// Bütün geçmiş: her blob'un içeriği ve geçmişteki bütün yollar.
let blobCount = 0;
if (history) {
  // Aynı içerik geçmişte birden çok yolda durmuş olabilir: hepsi tutulur.
  const paths = new Map();
  for (const line of git(["rev-list", "--objects", "--all"]).split("\n")) {
    if (!line) continue;
    const space = line.indexOf(" ");
    const sha = space > 0 ? line.slice(0, space) : line;
    if (!paths.has(sha)) paths.set(sha, []);
    if (space > 0) paths.get(sha).push(line.slice(space + 1));
  }
  // Yalnızca bir dala ya da etikete ulaşılabilen nesneler (yerelde artakalan sahipsiz nesneler değil).
  const blobs = git(
    ["cat-file", "--batch-check=%(objectname) %(objecttype)"],
    `${[...paths.keys()].join("\n")}\n`,
  )
    .toString("utf8")
    .split("\n")
    .map((line) => line.split(" "))
    .filter(([, type]) => type === "blob")
    .map(([sha]) => sha);
  blobCount = blobs.length;
  const output = git(["cat-file", "--batch"], `${blobs.join("\n")}\n`);
  let at = 0;
  while (at < output.length) {
    const headerEnd = output.indexOf(0x0a, at);
    const [sha, , size] = output.subarray(at, headerEnd).toString("utf8").split(" ");
    const start = headerEnd + 1;
    const content = output.subarray(start, start + Number(size));
    at = start + Number(size) + 1;
    const format = sniffAudio(content);
    const known = paths.get(sha) ?? [];
    for (const path of known.length > 0 ? known : ["(yolu bilinmeyen blob)"]) {
      if (!format && !hasAudioExtension(path)) continue;
      if (!path.startsWith(ALLOWED_DIR)) {
        problems.push(
          `geçmişte ${path} (${sha.slice(0, 7)}): ses dosyası${format ? ` (${format})` : ""}`,
        );
      } else if (content.length > MAX_TEST_AUDIO_BYTES) {
        // İzinli klasöre konup sonra silinen gerçek bir şarkı da geçmişte kalır.
        problems.push(
          `geçmişte ${path} (${sha.slice(0, 7)}): ${content.length} bayt; test sesi en fazla ${MAX_TEST_AUDIO_BYTES} bayt olabilir`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error("Depoda ses dosyası var (telif nedeniyle yasak):");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    `Yalnızca projenin ürettiği, tarifi README'de yazılı küçük sentetik sesler ${ALLOWED_DIR} altında durabilir.` +
      (history
        ? " Geçmişteki bir dosya için geçmişin yeniden yazılması gerekir: proje sahibine sorun."
        : ""),
  );
  process.exit(1);
}
console.log(
  `Ses dosyası denetimi tamam: ${files.length} dosya` +
    (history ? `, geçmişte ${blobCount} dosya içeriği` : "") +
    " incelendi.",
);
