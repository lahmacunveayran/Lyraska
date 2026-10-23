import { APP_URL, fakeCore, startServer, launch, collectErrors } from "./harness.mjs";
const server = await startServer(); const browser = await launch(); const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } }); collectErrors(page, errors);
await page.addInitScript(fakeCore({ profile: "music", tracks: 300 }));
await page.goto(APP_URL); await page.waitForSelector(".library__row");
await page.locator(".library__list").focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
await page.keyboard.press("4"); await page.waitForTimeout(1500);
const n0 = await page.evaluate(() => window.__calls.filter((c) => c === "visual_frame").length);
await page.waitForTimeout(1000);
const n1 = await page.evaluate(() => window.__calls.filter((c) => c === "visual_frame").length);
console.log("visual_frame/sn:", n1 - n0);
console.log(await page.evaluate(() => {
  const dm = document.querySelectorAll(".dot-matrix");
  const frame = document.querySelector(".vfd-frame");
  return { matrices: dm.length, parents: Array.from(dm).map((d) => d.parentElement.className + "|" + d.getAttribute("aria-label")), glow: frame?.style.getPropertyValue("--stage-glow"), litD: document.querySelector(".dot-matrix__lit")?.getAttribute("d")?.length, ghostD: document.querySelector(".dot-matrix__ghost")?.getAttribute("d")?.length, hasTrack: !!window.__fake.session.track, state: window.__fake.session.state, viewBox: dm[0]?.getAttribute("viewBox") };
}));
// gerçek zamanlı: 1 sn boyunca lit sayısı örnekle
const samples = [];
for (let i = 0; i < 10; i++) { await page.waitForTimeout(100); samples.push(await page.evaluate(() => document.querySelector(".dot-matrix__lit")?.getAttribute("data-lit-count"))); }
console.log("lit örnekleri:", samples.join(","));
// Çalmayı durdurup tekrar başlat
await page.keyboard.press("Space"); await page.waitForTimeout(500); await page.keyboard.press("Space"); await page.waitForTimeout(1500);
console.log("duraklat/çal sonrası lit:", await page.evaluate(() => document.querySelector(".dot-matrix__lit")?.getAttribute("data-lit-count")));
// Sahne değiştirip geri gel
await page.keyboard.press("3"); await page.waitForTimeout(800); await page.keyboard.press("4"); await page.waitForTimeout(1500);
console.log("3→4 sonrası lit:", await page.evaluate(() => document.querySelector(".dot-matrix__lit")?.getAttribute("data-lit-count")));
// Sayfayı spektrumla açıp sonra çal
await page.evaluate(() => localStorage.setItem("lyraska.scene", "spectrum"));
await page.reload(); await page.waitForSelector(".library__row"); await page.waitForTimeout(500);
console.log("yeniden açılış (şarkı yok): matris", await page.evaluate(() => document.querySelector(".dot-matrix__lit")?.getAttribute("data-lit-count")));
await page.locator(".library__list").focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); await page.waitForTimeout(2000);
console.log("spektrumda açılıp çalınca lit:", await page.evaluate(() => document.querySelector(".dot-matrix__lit")?.getAttribute("data-lit-count")), "glow", await page.evaluate(() => document.querySelector(".vfd-frame")?.style.getPropertyValue("--stage-glow")));
console.log(errors);
await browser.close(); await new Promise((r) => server.httpServer.close(r));
