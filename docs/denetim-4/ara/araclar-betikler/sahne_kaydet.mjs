// Sayfayı sahte saatle (page.clock) kare kare ilerletip PNG kareleri kaydeder; ardından
// ffmpeg ile MP4 yapılır ve IRIS (Python portu) ile parlama analizi yapılabilir.
// Kullanım: node sahne_kaydet.mjs <url-ya-da-html> <cikti-klasoru> [saniye=6] [fps=30] [genislik=1280] [yukseklik=720]
// Sonra:   ffmpeg -framerate 30 -i <cikti>/kare_%05d.png -pix_fmt yuv420p <cikti>.mp4
//          ../venv/bin/iris <cikti>.mp4 -o <rapor-klasoru>
// Not: requestAnimationFrame, setTimeout ve performance.now sahte saate bağlıdır; WebGL
// headless Chromium'da yazılımsal (SwiftShader) çizilir. Gerçek GPU ölçümü yerine geçmez.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
const require = createRequire(import.meta.url.replace("/betikler/", "/axe/"));
const { chromium } = require("playwright-core");

const [hedefArg, cikti, sn = "6", fpsArg = "30", w = "1280", h = "720"] = process.argv.slice(2);
if (!hedefArg || !cikti) { console.error("Kullanım: node sahne_kaydet.mjs <url|html> <klasor> [sn] [fps]"); process.exit(2); }
const hedef = /^[a-z]+:\/\//.test(hedefArg) ? hedefArg : pathToFileURL(fs.realpathSync(hedefArg)).href;
const fps = Number(fpsArg), kareSayisi = Math.round(Number(sn) * fps);
fs.mkdirSync(cikti, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_YOLU ?? "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await (await browser.newContext({ viewport: { width: Number(w), height: Number(h) } })).newPage();
  await page.clock.install({ time: 0 });
  await page.goto(hedef, { waitUntil: "load" });
  for (let i = 0; i < kareSayisi; i++) {
    await page.clock.runFor(1000 / fps);
    await page.screenshot({ path: `${cikti}/kare_${String(i).padStart(5, "0")}.png` });
  }
  console.log(`${kareSayisi} kare yazıldı (${fps} fps) -> ${cikti}`);
} finally { await browser.close(); }
