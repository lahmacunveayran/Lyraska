// E1: Faz 1 akışları gerçek tarayıcıda (sahte çekirdek): sahneler, çekmece, kütüphane, ekolayzer,
// sarma, klavye kısayolları. Konsol/sayfa hataları toplanır; durumlar doğrulanır.
import { writeFileSync } from "node:fs";
import { APP_URL, fakeCore, startServer, launch, collectErrors } from "./harness.mjs";

const server = await startServer();
const browser = await launch();
const errors = [];
const findings = [];
const log = (s) => { console.log(s); findings.push(s); };
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
collectErrors(page, errors);
await page.addInitScript(fakeCore({ profile: "music", tracks: 300 }));
await page.goto(APP_URL);
await page.waitForSelector(".library__row[aria-rowindex]", { timeout: 20000 });

const click = async (sel) => { const b = await page.locator(sel).first().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(50); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
const scene = () => page.locator(".stage").getAttribute("data-scene");
const stateText = () => page.locator(".now__over").innerText();
const fakeState = () => page.evaluate(() => window.__fake.session.state);

// 1) Çekmece açık başlar, kütüphane dolu.
log(`açılış: çekmece ${await page.locator(".drawer").getAttribute("class")} · çizilen satır ${await page.locator(".library__row[aria-rowindex]").count()} · aria-rowcount=${await page.locator("[role=grid]").getAttribute("aria-rowcount")}`);
// 2) Arama (Türkçe duyarlı): "çığlık" → "Çığlık" içeren şarkılar.
await page.fill("input[type=search]", "çığlık");
await page.waitForTimeout(400);
log(`arama "çığlık": aria-rowcount=${await page.locator("[role=grid]").getAttribute("aria-rowcount")} (beklenen 43) · çizilen ${await page.locator(".library__row[aria-rowindex]").count()} · "SEZEN" → ${await (async () => { await page.fill("input[type=search]", "SEZEN"); await page.waitForTimeout(400); return page.locator("[role=grid]").getAttribute("aria-rowcount"); })()} (beklenen 200)`);
await page.fill("input[type=search]", "");
await page.waitForTimeout(400);
// 3) Klavyeyle listede gezinme ve Enter ile çalma.
await page.locator(".library__list").focus();
await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
const activeId = await page.locator(".library__list").getAttribute("aria-activedescendant");
log(`liste: 3×↓ sonrası aria-activedescendant=${activeId}`);
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__fake.session.state === "playing");
await page.waitForTimeout(600);
log(`Enter: çekirdek ${await fakeState()} · şarkı ${await page.evaluate(() => window.__fake.session.track.title)} · çekmece kapandı mı: ${!(await page.locator(".drawer").getAttribute("class")).includes("is-open")} · durum yazısı "${await stateText()}"`);
// odak çekmece kapanınca nereye gitti?
log(`odak (çekmece kapanınca): ${await page.evaluate(() => { const a = document.activeElement; return a ? a.tagName + "." + a.className + " aria-label=" + a.getAttribute("aria-label") : "yok"; })}`);
// 4) Boşluk: duraklat / çal.
await page.keyboard.press("Space"); await page.waitForTimeout(400);
log(`Boşluk: çekirdek ${await fakeState()} · yazı "${await stateText()}"`);
await page.keyboard.press("Space"); await page.waitForTimeout(400);
log(`Boşluk: çekirdek ${await fakeState()}`);
// 5) Sarma: → ×3 (5 sn adım) ve ←.
const p0 = await page.evaluate(() => window.__fake.status().positionSecs);
await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
await page.waitForTimeout(500);
const p1 = await page.evaluate(() => window.__fake.status().positionSecs);
await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(500);
const p2 = await page.evaluate(() => window.__fake.status().positionSecs);
log(`sarma: ${p0.toFixed(1)} → 3×→ ${p1.toFixed(1)} (beklenen ≈+15) → ← ${p2.toFixed(1)} (≈−5)`);
// 6) Çubuğa tıklayarak sarma (ortasına).
const bar = await page.locator(".seekbar").boundingBox();
await page.mouse.click(bar.x + bar.width * 0.5, bar.y + bar.height / 2);
await page.waitForTimeout(500);
const p3 = await page.evaluate(() => window.__fake.status().positionSecs);
const dur = await page.evaluate(() => window.__fake.session.track.durationSecs);
log(`çubuk ortasına tıklama: konum ${p3.toFixed(1)} / ${dur} (beklenen ≈${(dur / 2).toFixed(1)}) · aria-valuenow=${await page.locator(".seekbar").getAttribute("aria-valuenow")}`);
// Sürükleme
await page.evaluate(() => { window.__ptr = []; const el = document.querySelector(".seekbar"); for (const t of ["pointerdown", "pointermove", "pointerup", "lostpointercapture"]) el.addEventListener(t, (e) => window.__ptr.push([t, Math.round(e.clientX), Math.round(el.getBoundingClientRect().left), Math.round(el.getBoundingClientRect().width)])); });
await page.mouse.move(bar.x + bar.width * 0.5, bar.y + bar.height / 2); await page.mouse.down();
await page.mouse.move(bar.x + bar.width * 0.25, bar.y + bar.height / 2, { steps: 5 });
log(`sürüklerken ipucu: ${await page.locator(".seekbar__tip").count() ? await page.locator(".seekbar__tip").innerText() : "yok"}`);
await page.mouse.up(); await page.waitForTimeout(400);
log(`sürükle-bırak %25: konum ${(await page.evaluate(() => window.__fake.status().positionSecs)).toFixed(1)} (beklenen ≈${(dur / 4).toFixed(1)}) · olaylar ${JSON.stringify(await page.evaluate(() => window.__ptr))}`);
// 7) Sahne değiştirme 1–5 ve düğmelerle; her sahnede tuval/svg var mı.
for (const [key, id] of [["1", "sky"], ["2", "highway"], ["3", "vu"], ["4", "spectrum"], ["5", "drive"], ["1", "sky"]]) {
  await page.keyboard.press(key); await page.waitForTimeout(700);
  const s = await scene();
  const webgl = await page.evaluate(() => Array.from(document.querySelectorAll("canvas:not([hidden])")).map((c) => c.dataset.webgl ?? "-").join(","));
  const lit = await page.evaluate(() => document.querySelector(".dot-matrix__lit")?.getAttribute("data-lit-count") ?? "-");
  log(`tuş ${key}: sahne ${s} (beklenen ${id}) · canvas webgl=[${webgl}] · yanan nokta=${lit} · aria-pressed: ${await page.locator(`.pill[aria-pressed=true]`).innerText()}`);
}
log(`düğme tıklamadan önce app class: ${await page.locator(".app").getAttribute("class")}`);
await click(".pill:has-text('VU ibreleri')"); await page.waitForTimeout(300);
log(`düğmeyle VU: ${await scene()}`);
// 8) Çekmece: üst çubuk düğmeleri, sekmelerde ok tuşları, Esc.
await click("button[aria-label='Ekolayzer']"); await page.waitForTimeout(300);
log(`Ekolayzer düğmesi: açık=${(await page.locator(".drawer").getAttribute("class")).includes("is-open")} · seçili sekme=${await page.locator(".drawer__tabs [role=tab][aria-selected=true]").innerText()} · odak=${await page.evaluate(() => document.activeElement?.id)}`);
await page.keyboard.press("ArrowRight"); await page.waitForTimeout(100);
log(`sekmede →: ${await page.locator(".drawer__tabs [role=tab][aria-selected=true]").innerText()} · odak=${await page.evaluate(() => document.activeElement?.id)}`);
await page.keyboard.press("End"); await page.waitForTimeout(100);
log(`sekmede End: ${await page.locator(".drawer__tabs [role=tab][aria-selected=true]").innerText()}`);
await page.keyboard.press("Home"); await page.waitForTimeout(100);
log(`sekmede Home: ${await page.locator(".drawer__tabs [role=tab][aria-selected=true]").innerText()}`);
// Sekmedeyken Boşluk sekmeye mi basar (çal/duraklat değil)?
const before = await fakeState();
await page.keyboard.press("Space"); await page.waitForTimeout(300);
log(`sekmede Boşluk: çekirdek ${before} → ${await fakeState()} (değişmemeli)`);
// Ekolayzer sekmesi: sürgüde klavye.
await click("#drawer-tab-eq"); await page.waitForTimeout(200);
const slider = page.locator(".eq-slider__track").first();
await slider.focus();
await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp"); await page.waitForTimeout(300);
log(`EQ 31 Hz sürgü 2×↑: aria-valuenow=${await slider.getAttribute("aria-valuenow")} · çekirdek gainsDb[0]=${await page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke("equalizer_get")).gainsDb[0])} · ön kazanç yazısı: ${await page.locator(".eq__preamp").innerText()}`);
const posBefore = await page.evaluate(() => window.__fake.status().positionSecs);
await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300);
log(`EQ sürgüde →: odak ${await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))} · konum değişti mi: ${Math.abs((await page.evaluate(() => window.__fake.status().positionSecs)) - posBefore - 0.3) > 1}`);
await page.keyboard.press("1"); await page.waitForTimeout(300);
log(`EQ sürgüde "1" tuşu: sahne ${await scene()} (sürgü odaklıyken sahne değişti mi?)`);
// Hazır ayar uygula, sonra kapat.
await click(".eq__presets .chip--button >> nth=1"); await page.waitForTimeout(300);
log(`hazır ayar: ${await page.locator(".eq__preset").innerText()} · aria-pressed: ${await page.locator(".eq__presets [aria-pressed=true]").innerText()} · EQ ışığı: ${await page.locator("#drawer-tab-eq .led").getAttribute("class")}`);
await click(".eq__header .switch"); await page.waitForTimeout(300);
log(`EQ kapat: switch aria-checked=${await page.locator(".eq__header .switch").getAttribute("aria-checked")} · ışık: ${await page.locator("#drawer-tab-eq .led").getAttribute("class")}`);
// Ayarlar: güvenli mod.
await click("#drawer-tab-settings"); await page.waitForTimeout(200);
await click("button:has-text('Epilepsi güvenli modu')"); await page.waitForTimeout(300);
log(`güvenli mod: ${await page.locator("button:has-text('Epilepsi güvenli modu')").getAttribute("aria-pressed")} · bilgi kartı: ${await page.locator(".info-chip:has-text('Güvenli mod')").count()}`);
await click("button:has-text('Epilepsi güvenli modu')"); await page.waitForTimeout(200);
// Esc kapatır; odak açan düğmeye döner mi?
await page.keyboard.press("Escape"); await page.waitForTimeout(400);
log(`Esc: çekmece açık=${(await page.locator(".drawer").getAttribute("class")).includes("is-open")} · aria-hidden=${await page.locator(".drawer").getAttribute("aria-hidden")} · inert=${await page.evaluate(() => document.querySelector(".drawer").hasAttribute("inert"))} · odak=${await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName)}`);
// Esc arama kutusundayken kapatmaz
await click("button[aria-label='Kütüphane']"); await page.waitForTimeout(300);
await page.locator("input[type=search]").focus(); await page.keyboard.press("Escape"); await page.waitForTimeout(200);
log(`arama kutusunda Esc: çekmece açık=${(await page.locator(".drawer").getAttribute("class")).includes("is-open")} (beklenen true)`);
// Arama kutusunda Boşluk ve 1-5 sahne değiştirmemeli
await page.keyboard.type("1 2"); await page.waitForTimeout(300);
log(`arama kutusuna "1 2": sahne ${await scene()} (değişmemeli) · çekirdek ${await fakeState()} (playing kalmalı) · kutu="${await page.inputValue("input[type=search]")}"`);
await page.fill("input[type=search]", "");
// 9) Transport düğmeleri: Önceki (başa sarar), Sonraki, Durdur.
await page.keyboard.press("Escape");
await click("button[aria-label='Sonraki']"); await page.waitForTimeout(600);
log(`Sonraki: ${await page.evaluate(() => window.__fake.session.track.title)} · sıra yazısı "${await stateText()}" · sıradaki kartı: ${await page.locator(".up-next__text").innerText().catch(() => "yok")}`);
await click("button[aria-label='Önceki']"); await page.waitForTimeout(600);
log(`Önceki (başta): ${await page.evaluate(() => window.__fake.session.track.title)} · konum ${(await page.evaluate(() => window.__fake.status().positionSecs)).toFixed(1)}`);
await click("button[aria-label='Durdur']"); await page.waitForTimeout(500);
log(`Durdur: çekirdek ${await fakeState()} · yazı "${await stateText()}" · çal düğmesi aria-label=${await page.locator(".play-button").getAttribute("aria-label")}`);
// 10) Sinema görünümü: 4 sn hareketsiz → chrome çekilir; fare → geri gelir.
await click(".play-button"); await page.waitForTimeout(4600);
log(`4,6 sn sonra sinema: ${(await page.locator(".app").getAttribute("class")).includes("is-cinema")} · topbar opacity=${await page.evaluate(() => getComputedStyle(document.querySelector(".topbar")).opacity)}`);
await page.keyboard.press("Tab"); await page.waitForTimeout(800);
log(`Tab: sinema=${(await page.locator(".app").getAttribute("class")).includes("is-cinema")} · odak=${await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent)}`);
// 11) Şarkı sonu → otomatik geçiş (sahte çekirdek: pozisyonu sona sar ve "ended" bildir).
await page.evaluate(() => { const s = window.__fake.session; s.pausedAt = s.track.durationSecs; s.state = "ended"; });
await page.waitForTimeout(1200);
log(`şarkı sonu: çekirdek ${await fakeState()} · şarkı ${await page.evaluate(() => window.__fake.session.track?.title)} (sıradakine geçmeli)`);
// 12) Pencere boyutu değişimi.
for (const [w, h] of [[720, 560], [1920, 1080], [1280, 860]]) {
  await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(500);
  const info = await page.evaluate(() => { const c = document.querySelector("canvas:not([hidden])"); const sx = document.documentElement.scrollWidth, sy = document.documentElement.scrollHeight; return { canvas: c ? c.width + "x" + c.height : "-", scroll: sx + "x" + sy, inner: innerWidth + "x" + innerHeight }; });
  log(`pencere ${w}×${h}: ${JSON.stringify(info)}`);
}
await page.waitForTimeout(500);
log(`\nkonsol/sayfa hataları (${errors.length}):\n${errors.map((e) => "  - " + e).join("\n") || "  yok"}`);
log(`çekirdeğe yazılan arayüz hataları: ${JSON.stringify(await page.evaluate(() => window.__logged ?? []))}`);
log(`komut sayıları: ${JSON.stringify(await page.evaluate(() => { const m = {}; for (const c of window.__calls) m[c] = (m[c] ?? 0) + 1; return m; }))}`);
writeFileSync(new URL("../../kanit/akis.txt", import.meta.url), findings.join("\n"));
await browser.close();
await new Promise((r) => server.httpServer.close(r));
