import { APP_URL, fakeCore, startServer, launch, collectErrors } from "./harness.mjs";
const server = await startServer(); const browser = await launch(); const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } }); collectErrors(page, errors);
await page.addInitScript(fakeCore({ profile: "music", tracks: 300 }));
await page.goto(APP_URL); await page.waitForSelector(".library__row");
await page.locator(".library__list").focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
// Spektrum: yanan nokta sayısı zamanla
await page.keyboard.press("4");
for (let i = 0; i < 8; i++) { await page.waitForTimeout(250); console.log("spektrum +" + (i + 1) * 250 + "ms lit=", await page.evaluate(() => document.querySelector(".dot-matrix__lit")?.getAttribute("data-lit-count")), "frame bands[0]=", await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke("visual_frame"))?.bands[0])); }
await page.keyboard.press("3"); await page.waitForTimeout(1500);
console.log("VU ibre açıları:", await page.evaluate(() => Array.from(document.querySelectorAll(".vu-meter__needle")).map((n) => n.getAttribute("d"))));
// Sürükleme teşhisi
const bar = await page.locator(".seekbar").boundingBox(); console.log("seekbar box", bar, "track box", await page.locator(".seekbar__track").boundingBox());
await page.evaluate(() => { window.__ptr = []; const el = document.querySelector(".seekbar"); for (const t of ["pointerdown", "pointermove", "pointerup", "lostpointercapture"]) el.addEventListener(t, (e) => window.__ptr.push([t, e.clientX, el.getBoundingClientRect().left, el.getBoundingClientRect().width, e.target.className])); });
await page.mouse.move(bar.x + bar.width * 0.5, bar.y + bar.height / 2); await page.mouse.down();
for (const r of [0.45, 0.4, 0.35, 0.3, 0.25]) { await page.mouse.move(bar.x + bar.width * r, bar.y + bar.height / 2); await page.waitForTimeout(60); console.log("r=" + r, "tip=", await page.locator(".seekbar__tip").innerText().catch(() => "yok"), "thumb left=", await page.evaluate(() => document.querySelector(".seekbar__thumb")?.style.left)); }
await page.mouse.up(); await page.waitForTimeout(400);
console.log("konum", await page.evaluate(() => window.__fake.status().positionSecs), "olaylar", JSON.stringify(await page.evaluate(() => window.__ptr)));
console.log(errors);
await browser.close(); await new Promise((r) => server.httpServer.close(r));
