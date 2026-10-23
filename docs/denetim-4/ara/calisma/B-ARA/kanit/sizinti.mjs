// E4: kaynak sızıntısı ve dayanıklılık — 50 sahne geçişi (WebGL bağlam sayısı, rAF döngüleri, pencere dinleyicileri,
// JS yığını), WEBGL_lose_context ile bağlam kaybı/geri gelişi, pencere boyutu değişimi, kare süresi (yazılımsal GL'de
// yalnızca göreli).
import { writeFileSync } from "node:fs";
import { APP_URL, fakeCore, startServer, launch, collectErrors } from "./harness.mjs";

const INSTRUMENT = `
(() => {
  const S = window.__stats = { contexts: { webgl2: 0, "2d": 0, other: 0 }, lost: 0, restored: 0, canvases: [], rafScheduled: 0, listeners: {} };
  const orig = HTMLCanvasElement.prototype.getContext;
  const seen = new WeakSet();
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = orig.call(this, type, ...rest);
    if (ctx && !seen.has(ctx)) { seen.add(ctx); S.contexts[type === "webgl2" ? "webgl2" : type === "2d" ? "2d" : "other"]++; S.canvases.push(new WeakRef(this));
      this.addEventListener("webglcontextlost", () => S.lost++); this.addEventListener("webglcontextrestored", () => S.restored++); }
    return ctx;
  };
  const add = window.addEventListener.bind(window), rem = window.removeEventListener.bind(window);
  window.addEventListener = (t, f, o) => { S.listeners[t] = (S.listeners[t] ?? 0) + 1; return add(t, f, o); };
  window.removeEventListener = (t, f, o) => { S.listeners[t] = (S.listeners[t] ?? 0) - 1; return rem(t, f, o); };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { S.rafScheduled++; return raf(cb); };
})();`;

const server = await startServer();
const browser = await launch();
const errors = [];
const out = [];
const log = (s) => { console.log(s); out.push(s); };
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 0.5 });
collectErrors(page, errors);
page.on("console", (m) => { if (/WebGL|context/i.test(m.text())) out.push("konsol: " + m.text()); });
await page.addInitScript(INSTRUMENT);
await page.addInitScript(fakeCore({ profile: "music", tracks: 20 }));
await page.goto(APP_URL);
await page.waitForSelector(".library__row[aria-rowindex]");
await page.locator(".library__list").focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__fake.session.state === "playing");
await page.waitForTimeout(1000);

const stats = async () => page.evaluate(async () => {
  if (window.gc) window.gc();
  await new Promise((r) => setTimeout(r, 200));
  const S = window.__stats;
  const alive = S.canvases.filter((w) => w.deref()).length;
  const inDom = document.querySelectorAll("canvas").length;
  // bir karede kaç rAF geri çağrısı planlanıyor: 1 sn boyunca say / kare sayısı
  const before = S.rafScheduled; const t0 = performance.now(); let frames = 0;
  await new Promise((r) => { const tick = () => { frames++; if (performance.now() - t0 < 1500 && frames < 20) requestAnimationFrame(tick); else r(); }; requestAnimationFrame(tick); });
  const perFrame = (S.rafScheduled - before - frames) / frames;
  const listeners = Object.fromEntries(Object.entries(S.listeners).filter(([, v]) => v !== 0));
  const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null;
  return { contexts: S.contexts, lost: S.lost, restored: S.restored, canvasAlive: alive, canvasInDom: inDom, rafPerFrame: Math.round(perFrame * 100) / 100, listeners, heapMB: heap, frames, ms: Math.round(performance.now() - t0) };
});

log("başlangıç (gece göğü, çalarken): " + JSON.stringify(await stats()));
const cycle = async (keys, rounds, label) => {
  for (let i = 0; i < rounds; i++) for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(120); }
  await page.waitForTimeout(500);
  log(`${label}: ` + JSON.stringify(await stats()));
};
await cycle(["3", "4", "1"], 10, "10 tur gök→VU→spektrum→gök");
await cycle(["3", "4", "1"], 40, "+40 tur (toplam 50)");
await cycle(["2", "5", "1"], 25, "25 tur gök→otoyol→sürüş→gök (75 WebGL tuvali)");
await cycle(["2", "5", "1"], 25, "+25 tur (toplam 50; 150 WebGL tuvali)");
// Duraklat / çal döngüsü: rAF döngüsü birikiyor mu?
for (let i = 0; i < 20; i++) { await page.keyboard.press("Space"); await page.waitForTimeout(80); }
await page.keyboard.press("Space"); await page.waitForFunction(() => window.__fake.session.state === "playing");
log("20× duraklat/çal sonrası: " + JSON.stringify(await stats()));
// Çekmece aç/kapat 30×
for (let i = 0; i < 30; i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(40); await page.mouse.move(1200, 40); await page.mouse.click(1200, 40); await page.waitForTimeout(40); }
await page.keyboard.press("Escape");
log("30× çekmece aç/kapat sonrası: " + JSON.stringify(await stats()));

// WEBGL_lose_context: gece göğünde bağlamı kaybet / geri getir.
await page.keyboard.press("1"); await page.waitForTimeout(800);
const pixelStats = async () => { const box = await page.locator("canvas:not([hidden])").first().boundingBox(); const png = (await page.screenshot({ clip: box })).toString("base64"); return page.evaluate(async (d) => { const img = new Image(); img.src = "data:image/png;base64," + d; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); const px = g.getImageData(0, 0, c.width, c.height).data; let s = 0, sq = 0; for (let i = 0; i < px.length; i += 4) { const l = (px[i] + px[i + 1] + px[i + 2]) / 765; s += l; sq += l * l; } const n = px.length / 4; const m = s / n; return { mean: +m.toFixed(4), spread: +Math.sqrt(Math.max(0, sq / n - m * m)).toFixed(4) }; }, png); };
log("bağlam kaybından önce: " + JSON.stringify(await pixelStats()));
const lostInfo = await page.evaluate(() => { const c = document.querySelector("canvas:not([hidden])"); const gl = c.getContext("webgl2"); const ext = gl.getExtension("WEBGL_lose_context"); if (!ext) return "WEBGL_lose_context yok"; window.__ext = ext; ext.loseContext(); return "kaybedildi"; });
await page.waitForTimeout(1500);
log(`loseContext(): ${lostInfo} · ${JSON.stringify(await pixelStats())} · dataset: ${JSON.stringify(await page.evaluate(() => ({ ...document.querySelector("canvas:not([hidden])").dataset })))} · isContextLost=${await page.evaluate(() => document.querySelector("canvas:not([hidden])").getContext("webgl2").isContextLost())}`);
await page.evaluate(() => window.__ext.restoreContext());
await page.waitForTimeout(2500);
const after1 = await pixelStats(); await page.waitForTimeout(1000); const after2 = await pixelStats();
log(`restoreContext(): ${JSON.stringify(after1)} → ${JSON.stringify(after2)} · dataset: ${JSON.stringify(await page.evaluate(() => ({ ...document.querySelector("canvas:not([hidden])").dataset })))} · lost/restored sayaçları: ${JSON.stringify(await page.evaluate(() => [window.__stats.lost, window.__stats.restored]))}`);
log("günlüğe yazılan arayüz hataları: " + JSON.stringify(await page.evaluate(() => window.__logged ?? [])));
// Bağlam kaybı sırasında sahne değiştirme (dispose + isContextLost yolu)
await page.evaluate(() => { const c = document.querySelector("canvas:not([hidden])"); c.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext(); });
await page.waitForTimeout(300); await page.keyboard.press("3"); await page.waitForTimeout(500); await page.keyboard.press("1"); await page.waitForTimeout(1500);
log(`kayıpken sahne değiştirip dönünce: ${JSON.stringify(await pixelStats())} · webgl=${await page.evaluate(() => document.querySelector("canvas:not([hidden])").dataset.webgl)} · hata ${errors.length}`);

// Pencere boyutu
for (const [w, h] of [[720, 560], [2560, 1440], [1280, 860]]) {
  await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(900);
  log(`pencere ${w}×${h}: ` + JSON.stringify(await page.evaluate(() => { const c = document.querySelector("canvas:not([hidden])"); return { canvas: c.width + "×" + c.height, css: Math.round(c.clientWidth) + "×" + Math.round(c.clientHeight), scroll: document.documentElement.scrollWidth + "×" + document.documentElement.scrollHeight, dpr: devicePixelRatio }; })));
}
// Kare süresi (göreli; yazılımsal GL): her sahnede 2 sn boyunca rAF aralıkları
for (const [k, name] of [["1", "gök"], ["3", "VU"], ["4", "spektrum"], ["2", "otoyol"]]) {
  await page.keyboard.press(k); await page.waitForTimeout(600);
  const r = await page.evaluate(() => new Promise((res) => { const t = []; let last = performance.now(); const start = last; const tick = (now) => { t.push(now - last); last = now; if (now - start < 2000) requestAnimationFrame(tick); else res(t); }; requestAnimationFrame(tick); }));
  const sorted = [...r].sort((a, b) => a - b);
  log(`kare aralığı ${name}: n=${r.length} ortanca ${sorted[Math.floor(r.length / 2)].toFixed(0)} ms · en kötü ${sorted[r.length - 1].toFixed(0)} ms`);
}
log(`\nkonsol/sayfa hataları (${errors.length}):\n${errors.map((e) => "  - " + e).join("\n") || "  yok"}`);
writeFileSync(new URL("../../kanit/sizinti.txt", import.meta.url), out.join("\n"));
await browser.close();
await new Promise((r) => server.httpServer.close(r));
