import { APP_URL, fakeCore, startServer, launch, collectErrors } from "./harness.mjs";
const server = await startServer(); const browser = await launch(); const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } }); collectErrors(page, errors);
await page.addInitScript(fakeCore({ profile: "music", tracks: 30 }));
await page.goto(APP_URL); await page.waitForSelector(".library__row[aria-rowindex]");
await page.locator(".library__list").focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__fake.session.state === "playing"); await page.waitForTimeout(800);
const b = await page.locator("button[aria-label='Ekolayzer']").boundingBox(); await page.mouse.move(b.x + 5, b.y + 5); await page.mouse.click(b.x + 5, b.y + 5); await page.waitForTimeout(500);
const sw = page.locator(".eq__header .switch");
const box = await sw.boundingBox();
console.log("switch box", box, "elementFromPoint:", await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + "." + e.className + " <- " + e.parentElement.className : null; }, [box.x + box.width / 2, box.y + box.height / 2]));
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(400);
console.log("mouse.click sonrası aria-checked:", await sw.getAttribute("aria-checked"), "eq set sayısı", await page.evaluate(() => window.__calls.filter((c) => c === "equalizer_set").length));
await sw.click(); await page.waitForTimeout(400);
console.log("locator.click sonrası aria-checked:", await sw.getAttribute("aria-checked"), "eq set sayısı", await page.evaluate(() => window.__calls.filter((c) => c === "equalizer_set").length));
await sw.focus(); await page.keyboard.press("Space"); await page.waitForTimeout(400);
console.log("odakta Boşluk sonrası aria-checked:", await sw.getAttribute("aria-checked"), "çekirdek:", await page.evaluate(() => window.__fake.session.state), "eq set sayısı", await page.evaluate(() => window.__calls.filter((c) => c === "equalizer_set").length));
// Bas sürgüsü (range) klavye: → sarma yapmamalı
await page.locator("#eq-bass").focus(); const p0 = await page.evaluate(() => window.__fake.status().positionSecs); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300);
console.log("bas sürgüsünde →: bas=", await page.locator("#eq-bass").inputValue(), "konum farkı", (await page.evaluate(() => window.__fake.status().positionSecs)) - p0);
// Çift tıklama ile sıfırlama
const sl = page.locator(".eq-slider__track").nth(2); await sl.focus(); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp");
console.log("125 Hz 3×↑:", await sl.getAttribute("aria-valuenow")); await sl.dblclick(); await page.waitForTimeout(300); console.log("çift tık:", await sl.getAttribute("aria-valuenow"));
// Hızlı sürgü hareketi: son değer çekirdeğe ulaşıyor mu?
for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowUp");
await page.waitForTimeout(600);
console.log("12×↑ sonra arayüz:", await sl.getAttribute("aria-valuenow"), "çekirdek gainsDb[2]:", await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke("equalizer_get")).gainsDb[2]), "set sayısı", await page.evaluate(() => window.__calls.filter((c) => c === "equalizer_set").length));
console.log(errors);
await browser.close(); await new Promise((r) => server.httpServer.close(r));
