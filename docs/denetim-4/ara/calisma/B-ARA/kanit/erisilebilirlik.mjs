// E3: axe-core taraması (her panel ve çalma durumu), klavye ulaşılabilirliği (Tab sırası, odak görünürlüğü),
// hedef boyutu (WCAG 2.5.8: 24×24), kontrast (axe + elle örnekleme).
import { readFileSync, writeFileSync } from "node:fs";
import { APP_URL, fakeCore, startServer, launch, collectErrors } from "./harness.mjs";

const AXE = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const server = await startServer();
const browser = await launch();
const errors = [];
const out = [];
const log = (s) => { console.log(s); out.push(s); };
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
collectErrors(page, errors);
await page.addInitScript(fakeCore({ profile: "music", tracks: 300 }));
await page.goto(APP_URL);
await page.waitForSelector(".library__row[aria-rowindex]");
await page.addScriptTag({ content: AXE });

const axeRun = async (label, context = "main") => {
  const result = await page.evaluate(async (ctx) => {
    const r = await window.axe.run(ctx, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations", "incomplete"] });
    const pick = (list) => list.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 6).map((n) => ({ target: n.target.join(" "), summary: (n.failureSummary ?? "").split("\n").slice(0, 3).join(" | ").slice(0, 300), html: n.html.slice(0, 160) })), count: v.nodes.length }));
    return { violations: pick(r.violations), incomplete: pick(r.incomplete) };
  }, context).catch((e) => ({ violations: [], incomplete: [], failed: String(e) }));
  if (result.failed) log(`\n### axe — ${label}: ÇALIŞMADI: ${result.failed} · main var mı: ${await page.locator("main").count()} · app-error: ${await page.locator(".app-error").count()}`);
  log(`\n### axe — ${label}: ${result.violations.length} ihlal, ${result.incomplete.length} belirsiz`);
  for (const v of result.violations) {
    log(`- [${v.impact}] ${v.id}: ${v.help} (${v.count} öğe)`);
    for (const n of v.nodes) log(`    · ${n.target} — ${n.html}\n      ${n.summary}`);
  }
  for (const v of result.incomplete) log(`  ? ${v.id} (${v.count} öğe): ${v.nodes.map((n) => n.target).slice(0, 4).join(" ; ")}`);
  return result;
};

const click = async (sel) => { const b = await page.locator(sel).first().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };

// Açılış: kütüphane açık, şarkı yok.
await axeRun("açılış (kütüphane, şarkı yok)");
// Çal, sonra her panel.
await page.locator(".library__list").focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__fake.session.state === "playing"); await page.waitForTimeout(1200);
await page.mouse.move(10, 10);
await axeRun("çalarken, çekmece kapalı (sahne + cam katmanlar)");
await click("button[aria-label='Kütüphane']"); await page.waitForTimeout(300);
await axeRun("kütüphane paneli (çalarken)");
for (const [id, label] of [["eq", "ekolayzer"], ["marker", "işaretleme"], ["sync", "senkron"], ["abx", "kör test"], ["settings", "ayarlar"]]) {
  await click(`#drawer-tab-${id}`); await page.waitForTimeout(300);
  await axeRun(`${label} paneli`);
}
await click("#drawer-tab-library"); await page.waitForTimeout(200);

// Klavye: Tab ile ulaşılabilen öğeler (çekmece açıkken) ve odak görünürlüğü.
const describe = () => page.evaluate(() => {
  const a = document.activeElement; if (!a || a === document.body) return "BODY";
  const cs = getComputedStyle(a); const r = a.getBoundingClientRect();
  const visibleRing = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow !== "none");
  return `${a.tagName.toLowerCase()}${a.id ? "#" + a.id : ""}${a.className ? "." + String(a.className).split(" ").slice(0, 2).join(".") : ""} [${a.getAttribute("role") ?? ""}] "${(a.getAttribute("aria-label") ?? a.textContent ?? "").trim().slice(0, 28)}" ${Math.round(r.width)}×${Math.round(r.height)} halka=${visibleRing ? "var" : "YOK"} (outline=${cs.outlineStyle} ${cs.outlineWidth}, shadow=${cs.boxShadow === "none" ? "yok" : "var"})`;
});
await page.mouse.move(5, 5); await page.mouse.click(5, 5);
await page.evaluate(() => document.body.focus());
const seen = []; let repeats = 0;
log("\n### Tab sırası (çekmece açık, çalarken)");
for (let i = 0; i < 80; i++) {
  await page.keyboard.press("Tab"); await page.waitForTimeout(30);
  const d = await describe();
  if (seen.includes(d)) { if (++repeats > 2) break; } else repeats = 0;
  seen.push(d); log(`${i + 1}. ${d}`);
}
// Çekmece kapalıyken: çekmece içi odaklanabilir mi (inert)?
await page.keyboard.press("Escape"); await page.waitForTimeout(400);
await page.evaluate(() => document.body.focus());
const closedSeen = [];
for (let i = 0; i < 40; i++) { await page.keyboard.press("Tab"); await page.waitForTimeout(20); const d = await describe(); if (closedSeen.includes(d)) break; closedSeen.push(d); }
log(`\n### Tab sırası (çekmece kapalı): ${closedSeen.length} öğe\n${closedSeen.map((d, i) => `${i + 1}. ${d}`).join("\n")}`);
log(`çekmece içine odak gitti mi: ${closedSeen.some((d) => d.includes("drawer") || d.includes("library"))}`);

// Hedef boyutu (2.5.8): bütün görünür etkileşimli öğeler; 24×24 altındakiler.
await click("button[aria-label='Kütüphane']"); await page.waitForTimeout(300);
const small = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll("button, [role=button], [role=slider], input, a, [tabindex='0'], [role=tab], summary"));
  const out = [];
  for (const e of els) {
    const r = e.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (r.width < 24 || r.height < 24) out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} "${(e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  return out;
});
log(`\n### 24×24 altındaki hedefler (kütüphane paneli açık): ${small.length}\n${small.map((s) => "  - " + s).join("\n")}`);
await click("#drawer-tab-eq"); await page.waitForTimeout(300);
const smallEq = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll(".drawer button, .drawer [role=slider], .drawer input"));
  const out = [];
  for (const e of els) { const r = e.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue; if (r.width < 24 || r.height < 24) out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} "${(e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`); }
  return out;
});
log(`### 24×24 altındaki hedefler (ekolayzer): ${smallEq.length}\n${smallEq.map((s) => "  - " + s).join("\n")}`);

// Kontrast: belirli metinlerin hesaplanmış rengi ve arka planı (ekran görüntüsünden örnekleme: metnin kutusunda
// en açık ve en koyu pikseller) — cam katman + sahne üstünde gerçek sonuç.
await click("#drawer-tab-library"); await page.waitForTimeout(300);
const contrastTargets = [".library__row--head span", ".drawer__tab:not(.is-selected)", ".library__muted", ".now__over", ".settings__hint", ".info-chip", ".pill:not(.is-on)", ".library__count", ".chip", ".dock__time", ".library__notice", ".eq__preamp"];
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [h, l] = [Math.max(a, b), Math.min(a, b)]; return (h + 0.05) / (l + 0.05); };
log("\n### Kontrast (ekran görüntüsü örneklemesi: metin rengi = CSS color; arka plan = kutudaki en sık piksel)");
for (const sel of contrastTargets) {
  const loc = page.locator(sel).first();
  if (!(await loc.count())) { log(`- ${sel}: yok`); continue; }
  const box = await loc.boundingBox(); if (!box || box.width < 2) { log(`- ${sel}: görünmüyor`); continue; }
  const info = await loc.evaluate((e) => { const cs = getComputedStyle(e); return { color: cs.color, size: cs.fontSize, weight: cs.fontWeight, text: (e.textContent ?? "").trim().slice(0, 24) }; });
  const shot = (await page.screenshot({ clip: box })).toString("base64");
  const bg = await page.evaluate(async (data) => {
    const img = new Image(); img.src = "data:image/png;base64," + data; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; const hist = new Map();
    for (let i = 0; i < d.length; i += 4) { const k = (d[i] >> 3) + "," + (d[i + 1] >> 3) + "," + (d[i + 2] >> 3); hist.set(k, (hist.get(k) ?? 0) + 1); }
    const top = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map((v) => v * 8 + 4);
    return top;
  }, shot);
  const fg = info.color.match(/[\d.]+/g).map(Number);
  // rgba metin: arka planla karıştır
  const alpha = fg.length > 3 ? fg[3] : 1;
  const mixed = [0, 1, 2].map((i) => Math.round(fg[i] * alpha + bg[i] * (1 - alpha)));
  const r = ratio(lum(mixed), lum(bg));
  const px = parseFloat(info.size); const bold = parseInt(info.weight) >= 700;
  const large = px >= 24 || (px >= 18.66 && bold);
  log(`- ${sel} "${info.text}" ${info.size}/${info.weight} renk=${info.color} → arka plan rgb(${bg}) · oran ${r.toFixed(2)}:1 ${r >= (large ? 3 : 4.5) ? "GEÇTİ" : "KALDI"} (eşik ${large ? 3 : 4.5})`);
}
log(`\nkonsol/sayfa hataları: ${errors.length}\n${errors.join("\n")}`);
writeFileSync(new URL("../../kanit/erisilebilirlik.txt", import.meta.url), out.join("\n"));
await browser.close();
await new Promise((r) => server.httpServer.close(r));
