import { APP_URL, fakeCore, startServer, launch, collectErrors } from "./harness.mjs";
const server = await startServer(); const browser = await launch(); const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } }); collectErrors(page, errors);
await page.addInitScript(fakeCore({ profile: "music", tracks: 30 }));
await page.goto(APP_URL); await page.waitForSelector(".library__row[aria-rowindex]");
await page.locator(".library__list").focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__fake.session.state === "playing"); await page.waitForTimeout(800);
const b = await page.locator("button[aria-label='Kütüphane']").boundingBox(); await page.mouse.move(b.x + 5, b.y + 5); await page.mouse.click(b.x + 5, b.y + 5); await page.waitForTimeout(400);
await page.locator(".library__list").focus();
const pos = () => page.evaluate(() => window.__fake.status().positionSecs);
let p0 = await pos(); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300); let p1 = await pos();
console.log(`kütüphane listesinde → : konum ${p0.toFixed(1)} → ${p1.toFixed(1)} (seek_playback çağrısı: ${await page.evaluate(() => window.__calls.filter((c) => c === "seek_playback").length)})`);
await page.keyboard.press("ArrowDown"); console.log("liste ↓ sonrası seçili:", await page.locator(".library__list").getAttribute("aria-activedescendant"));
// Sekme (role=tab) odaklıyken → : sarma olmamalı
await page.locator("#drawer-tab-library").focus(); p0 = await pos(); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300); p1 = await pos();
console.log(`sekmede →: seek sayısı ${await page.evaluate(() => window.__calls.filter((c) => c === "seek_playback").length)} · seçili sekme ${await page.locator(".drawer__tabs [aria-selected=true]").innerText()}`);
// Seekbar odaklı: Home/End/PageUp
await page.keyboard.press("Escape"); await page.waitForTimeout(300); await page.locator(".seekbar").focus();
for (const k of ["Home", "End", "PageUp", "ArrowRight"]) { p0 = await pos(); await page.keyboard.press(k); await page.waitForTimeout(300); p1 = await pos(); console.log(`seekbar ${k}: ${p0.toFixed(1)} → ${p1.toFixed(1)}`); }
// Sahne düğmesi odaklıyken Boşluk: düğmeye basmalı, çal/duraklat değil
await page.locator(".pill").nth(2).focus(); const s0 = await page.evaluate(() => window.__fake.session.state); await page.keyboard.press("Space"); await page.waitForTimeout(300);
console.log(`pill odaklı Boşluk: çekirdek ${s0} → ${await page.evaluate(() => window.__fake.session.state)} · sahne ${await page.locator(".stage").getAttribute("data-scene")}`);
// Ctrl+O tarayıcıda: dialog çağrısı (plugin yok) hata üretir mi?
await page.keyboard.press("Control+o"); await page.waitForTimeout(500);
console.log("Ctrl+O sonrası hata metni:", await page.locator(".now__error").innerText().catch(() => "yok"));
console.log(errors);
await browser.close(); await new Promise((r) => server.httpServer.close(r));
