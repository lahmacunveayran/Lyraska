// E4b: bağlam kaybı/geri geliş, pencere boyutu, kare aralığı (50 geçiş ölçümü sizinti.txt'de).
import { writeFileSync } from "node:fs";
import { APP_URL, fakeCore, startServer, launch, collectErrors } from "./harness.mjs";
const server = await startServer(); const browser = await launch(); const errors = []; const out = [];
const log = (s) => { console.log(s); out.push(s); };
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 0.5 });
collectErrors(page, errors);
await page.addInitScript(fakeCore({ profile: "music", tracks: 20 }));
await page.goto(APP_URL); await page.waitForSelector(".library__row[aria-rowindex]");
await page.locator(".library__list").focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__fake.session.state === "playing"); await page.waitForTimeout(1500);
const pixelStats = async () => { const box = await page.locator("canvas:not([hidden])").first().boundingBox(); const png = (await page.screenshot({ clip: box })).toString("base64"); return page.evaluate(async (d) => { const img = new Image(); img.src = "data:image/png;base64," + d; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); const px = g.getImageData(0, 0, c.width, c.height).data; let s = 0, sq = 0; for (let i = 0; i < px.length; i += 4) { const l = (px[i] + px[i + 1] + px[i + 2]) / 765; s += l; sq += l * l; } const n = px.length / 4; const m = s / n; return { mean: +m.toFixed(4), spread: +Math.sqrt(Math.max(0, sq / n - m * m)).toFixed(4) }; }, png); };
log("bağlam kaybından önce: " + JSON.stringify(await pixelStats()));
const lostInfo = await page.evaluate(() => { const c = document.querySelector("canvas:not([hidden])"); const gl = c.getContext("webgl2"); const ext = gl.getExtension("WEBGL_lose_context"); if (!ext) return "WEBGL_lose_context yok"; window.__ext = ext; ext.loseContext(); return "kaybedildi"; });
await page.waitForTimeout(2000);
log(`loseContext(): ${lostInfo} · ${JSON.stringify(await pixelStats())} · isContextLost=${await page.evaluate(() => document.querySelector("canvas:not([hidden])").getContext("webgl2").isContextLost())} · hata ${errors.length}`);
await page.evaluate(() => window.__ext.restoreContext()); await page.waitForTimeout(3000);
const a1 = await pixelStats(); await page.waitForTimeout(1500); const a2 = await pixelStats();
log(`restoreContext(): ${JSON.stringify(a1)} → ${JSON.stringify(a2)} · dataset ${JSON.stringify(await page.evaluate(() => ({ ...document.querySelector("canvas:not([hidden])").dataset })))} · günlük: ${JSON.stringify(await page.evaluate(() => window.__logged ?? []))}`);
await page.evaluate(() => { document.querySelector("canvas:not([hidden])").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext(); });
await page.waitForTimeout(300); await page.keyboard.press("3"); await page.waitForTimeout(800); await page.keyboard.press("1"); await page.waitForTimeout(2500);
log(`kayıpken sahne değiştirip dönünce: ${JSON.stringify(await pixelStats())} · webgl=${await page.evaluate(() => document.querySelector("canvas:not([hidden])").dataset.webgl)} · hata ${errors.length}`);
for (const [w, h] of [[720, 560], [2560, 1440], [1280, 860]]) {
  await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(2500);
  log(`pencere ${w}×${h}: ` + JSON.stringify(await page.evaluate(() => { const c = document.querySelector("canvas:not([hidden])"); return { canvas: c.width + "×" + c.height, css: Math.round(c.clientWidth) + "×" + Math.round(c.clientHeight), scroll: document.documentElement.scrollWidth + "×" + document.documentElement.scrollHeight, dpr: devicePixelRatio }; })));
}
for (const [k, name] of [["1", "gök"], ["3", "VU"], ["4", "spektrum"]]) {
  await page.keyboard.press(k); await page.waitForTimeout(800);
  const r = await page.evaluate(() => new Promise((res) => { const t = []; let last = performance.now(); const start = last; const tick = (now) => { t.push(now - last); last = now; if (now - start < 2000) requestAnimationFrame(tick); else res(t); }; requestAnimationFrame(tick); }));
  const sorted = [...r].sort((a, b) => a - b);
  log(`kare aralığı ${name} (yazılımsal GL, yalnızca göreli): n=${r.length} ortanca ${sorted[Math.floor(r.length / 2)].toFixed(0)} ms · en kötü ${sorted[r.length - 1].toFixed(0)} ms`);
}
log(`konsol/sayfa hataları (${errors.length}): ${errors.join(" | ") || "yok"}`);
writeFileSync(new URL("../../kanit/sizinti2.txt", import.meta.url), out.join("\n"));
await browser.close(); await new Promise((r) => server.httpServer.close(r));
