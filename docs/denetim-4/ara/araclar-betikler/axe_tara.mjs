// Kullanım: node axe_tara.mjs <url-ya-da-html-dosyasi> [--etiket wcag2a,wcag2aa,wcag21aa,wcag22aa] [--json cikti.json]
// Örnek (Lyraska'nın derlenmiş arayüzü için önce ayrı bir klasörde `npx vite preview` açılır):
//   node axe_tara.mjs http://localhost:4173/
// Playwright Chromium'u /opt/pw-browsers altından kullanır (PLAYWRIGHT_BROWSERS_PATH).
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
const require = createRequire(import.meta.url.replace("/betikler/", "/axe/"));
const { chromium } = require("playwright-core");
const { AxeBuilder } = require("@axe-core/playwright");

const args = process.argv.slice(2);
if (!args[0]) { console.error("Hedef URL ya da HTML dosyası verin."); process.exit(2); }
let hedef = args[0];
if (!/^[a-z]+:\/\//.test(hedef)) hedef = pathToFileURL(fs.realpathSync(hedef)).href;
const etiketIdx = args.indexOf("--etiket");
const etiketler = (etiketIdx >= 0 ? args[etiketIdx + 1] : "wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22aa").split(",");
const jsonIdx = args.indexOf("--json");

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/opt/pw-browsers";
// Kurulu Chromium sürümü playwright-core 1.63 beklentisinden eski; yol açıkça verilir (CHROMIUM_YOLU ile değiştirilebilir).
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_YOLU ?? "/opt/pw-browsers/chromium" });
try {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(hedef, { waitUntil: "load" });
  const sonuc = await new AxeBuilder({ page }).withTags(etiketler).analyze();
  for (const v of sonuc.violations) {
    console.log(`[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} öğe) ${v.helpUrl}`);
    for (const n of v.nodes.slice(0, 5)) console.log(`    ${n.target.join(" ")}`);
  }
  console.log(`axe-core ${sonuc.testEngine.version}: ${sonuc.violations.length} ihlal, ${sonuc.incomplete.length} elle bakılacak, ${sonuc.passes.length} geçen kural`);
  if (jsonIdx >= 0) fs.writeFileSync(args[jsonIdx + 1], JSON.stringify(sonuc, null, 2));
} finally {
  await browser.close();
}
