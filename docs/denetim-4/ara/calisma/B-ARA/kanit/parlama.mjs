// E2: Işığa duyarlı epilepsi ölçümü. Her sahne sanal zamanda (STEP_MS başına bir kare) sürülür, her karede
// sahnenin ekran görüntüsü alınır ve 8×8 piksellik bloklarda bağıl parlaklık hesaplanır. Sonra WCAG 2.3.1 /
// ITU-R BT.1702 ölçütleri uygulanır:
//   - genel parlama: bir blokta bağıl parlaklıkta ≥ %10 (0,1) zıt değişim çifti, koyu tarafı < 0,80;
//   - alan: aynı anda (±1 kare) geçiş yapan blokların payı, 341×256 CSS px'lik (1024×768'de 10°) her pencerede ≥ %25;
//   - sıklık: herhangi bir 1 sn'de > 3 parlama (6 geçiş) ise ihlal;
//   - kırmızı parlama: doymuş kırmızıya (R/(R+G+B) ≥ 0,8) giren/çıkan geçişler.
// Ayrıca check-scenes.mjs'in ölçütü (pencere ortalama parlaklığında kareden kareye en büyük fark) da hesaplanır.
import { writeFileSync } from "node:fs";
import { APP_URL, fakeCore, virtualTime, advance, startServer, launch, collectErrors, blockLuminance } from "./harness.mjs";

const FPS = Number(process.env.FPS ?? 30);
const STEP_MS = 1000 / FPS;
const SECONDS = Number(process.env.SECONDS ?? 3);
const FRAMES = Math.round(SECONDS * FPS);
const SCALE = 0.5;
const BLOCK = 8; // cihaz pikseli (= 16 CSS px)
const WIN_W = Math.round((341 * SCALE) / BLOCK); // 21 blok
const WIN_H = Math.round((256 * SCALE) / BLOCK); // 16 blok
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;

const scenarios = [];
const LITE = process.env.LITE === "1";
const P1 = [["spectrum", null], ["vu", null], ["sky", "lake"], ["sky", "corona"], ["sky", "snow"]];
const P2 = [["highway", null], ["drive", null]];
for (const [scene, look] of LITE ? P1.slice(0, 3) : [...P1, ...P2]) {
  scenarios.push({ scene, look, profile: "square", hz: 4, safe: false, reduced: false });
  scenarios.push({ scene, look, profile: "drop", hz: 0, safe: false, reduced: false });
}
for (const [scene, look] of [["spectrum", null], ["vu", null], ["sky", "lake"]]) {
  if (!LITE) scenarios.push({ scene, look, profile: "music", hz: 0, safe: false, reduced: false });
  scenarios.push({ scene, look, profile: "square", hz: 4, safe: true, reduced: false });
  scenarios.push({ scene, look, profile: "square", hz: 4, safe: false, reduced: true });
  if (!LITE) scenarios.push({ scene, look, profile: "square", hz: 2, safe: false, reduced: false });
}

const server = await startServer();
const browser = await launch();
const results = [];
const lines = [];
const log = (s) => { console.log(s); lines.push(s); };
log(`Kare hızı ${FPS}/sn · ${SECONDS} sn · blok ${BLOCK}px · pencere ${WIN_W}×${WIN_H} blok · ölçek ${SCALE}`);

/** Bir blok dizisindeki geçişler (WCAG: koyu taraf < 0,80 ve fark ≥ 0,1). */
function transitions(series) {
  let min = series[0], max = series[0], dir = 0; const out = [];
  for (let t = 0; t < series.length; t++) {
    const l = series[t];
    min = dir > 0 ? min : Math.min(min, l); max = dir < 0 ? max : Math.max(max, l);
    if (dir >= 0 && max - l >= 0.1 && l < 0.8) { dir = -1; out.push([t, -1]); min = l; }
    else if (dir <= 0 && l - min >= 0.1 && min < 0.8) { dir = 1; out.push([t, 1]); max = l; }
  }
  return out;
}

function analyse(frames, bw, bh) {
  const T = frames.length; const N = bw * bh;
  // blok → geçiş kareleri
  const trans = new Array(N);
  let blockMaxPerSec = 0;
  for (let i = 0; i < N; i++) {
    const s = new Float32Array(T); for (let t = 0; t < T; t++) s[t] = frames[t].lum[i];
    trans[i] = transitions(s);
    for (let a = 0; a < trans[i].length; a++) { let c = 0; for (let b = a; b < trans[i].length && trans[i][b][0] - trans[i][a][0] < FPS; b++) c++; blockMaxPerSec = Math.max(blockMaxPerSec, c / 2); }
  }
  // kare başına geçiş yapan blok işareti (±1 kare)
  const mark = new Uint8Array(T * N);
  for (let i = 0; i < N; i++) for (const [t] of trans[i]) for (let d = -1; d <= 1; d++) { const tt = t + d; if (tt >= 0 && tt < T) mark[tt * N + i] = 1; }
  let maxArea = 0, maxFlashesPerSec = 0, maxMeanDelta = 0, maxMeanFlashesPerSec = 0, worst = null;
  const blocksTransitioning = new Array(T).fill(0);
  for (let t = 0; t < T; t++) for (let i = 0; i < N; i++) blocksTransitioning[t] += mark[t * N + i];
  for (let y0 = 0; y0 + WIN_H <= bh; y0 += 2) for (let x0 = 0; x0 + WIN_W <= bw; x0 += 2) {
    const area = WIN_W * WIN_H; const screenT = [];
    const mean = new Float32Array(T);
    for (let t = 0; t < T; t++) {
      let m = 0, sum = 0;
      for (let y = y0; y < y0 + WIN_H; y++) for (let x = x0; x < x0 + WIN_W; x++) { const i = y * bw + x; m += mark[t * N + i]; sum += frames[t].lum[i]; }
      const frac = m / area; mean[t] = sum / area;
      if (frac > maxArea) { maxArea = frac; worst = { x: x0 * BLOCK / SCALE, y: y0 * BLOCK / SCALE, t }; }
      if (frac >= 0.25 && (screenT.length === 0 || t - screenT[screenT.length - 1] > 1)) screenT.push(t);
      if (t > 0) maxMeanDelta = Math.max(maxMeanDelta, Math.abs(mean[t] - mean[t - 1]));
    }
    for (let a = 0; a < screenT.length; a++) { let c = 0; for (let b = a; b < screenT.length && screenT[b] - screenT[a] < FPS; b++) c++; maxFlashesPerSec = Math.max(maxFlashesPerSec, c / 2); }
    const mt = transitions(mean);
    for (let a = 0; a < mt.length; a++) { let c = 0; for (let b = a; b < mt.length && mt[b][0] - mt[a][0] < FPS; b++) c++; maxMeanFlashesPerSec = Math.max(maxMeanFlashesPerSec, c / 2); }
  }
  // kırmızı parlama: doymuş kırmızı bloklar
  let redTrans = 0, redArea = 0;
  for (let i = 0; i < N; i++) {
    let prev = false; const times = [];
    for (let t = 0; t < T; t++) { const f = frames[t]; const r = f.r[i], g = f.g[i], b = f.b[i]; const sat = r > 0.2 && r / (r + g + b + 1e-6) >= 0.8; if (sat !== prev) { times.push(t); prev = sat; } }
    redTrans += times.length; if (times.length > 0) redArea++;
  }
  // parlaklık aralığı
  let lo = 1, hi = 0, meanAll = 0;
  for (const f of frames) for (const l of f.lum) { lo = Math.min(lo, l); hi = Math.max(hi, l); meanAll += l; }
  meanAll /= T * N;
  return { blockMaxPerSec, maxArea, worst, maxFlashesPerSec, maxMeanDelta, maxMeanFlashesPerSec, redTrans, redArea: redArea / N, lo, hi, meanAll, maxBlocksTransitioning: Math.max(...blocksTransitioning) / N };
}

for (const sc of scenarios) {
  const name = `${sc.scene}${sc.look ? "·" + sc.look : ""} · ${sc.profile}${sc.hz ? " " + sc.hz + "Hz" : ""}${sc.safe ? " · güvenli mod" : ""}${sc.reduced ? " · animasyonları azalt" : ""}`;
  if (only && !only.some((o) => name.includes(o))) continue;
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: SCALE, reducedMotion: sc.reduced ? "reduce" : "no-preference" });
  const errors = []; collectErrors(page, errors);
  await page.addInitScript(virtualTime(STEP_MS));
  await page.addInitScript(`try { localStorage.setItem("lyraska.scene", "${sc.scene}"); ${sc.look ? `localStorage.setItem("lyraska.skyLook", "${sc.look}");` : ""} } catch {}`);
  await page.addInitScript(fakeCore({ profile: sc.profile, hz: sc.hz, safe: sc.safe, tracks: 5, virtual: true }));
  await page.goto(APP_URL);
  await page.waitForSelector(".library__row[aria-rowindex]", { timeout: 60000 });
  await advance(page, 2);
  await page.locator(".library__list").focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__fake.session.state === "playing");
  await page.addStyleTag({ content: ".chrome, .drawer, .stage__shade, .drop-notice { visibility: hidden !important; } .stage > * { animation: none !important; }" });
  await page.mouse.move(2, 2);
  // Isınma: 2 sn sanal (hız sınırlı değerler otursun; tema geçişi gerçek zamanlı CSS)
  await advance(page, Math.round(2 * FPS));
  await page.waitForTimeout(1500);
  const stage = await page.locator(".stage").boundingBox();
  const frames = []; const t0 = Date.now();
  let bw = 0, bh = 0;
  for (let f = 0; f < FRAMES; f++) {
    await advance(page, 1);
    const png = (await page.screenshot({ clip: stage, animations: "allow" })).toString("base64");
    const b = await blockLuminance(page, png, BLOCK);
    bw = b.bw; bh = b.bh; frames.push(b);
    if (f === 0 || f === Math.floor(FRAMES / 2)) writeFileSync(new URL(`../../kanit/kare-${name.replace(/[^a-z0-9]+/gi, "_")}-${f}.png`, import.meta.url), Buffer.from(png, "base64"));
  }
  const a = analyse(frames, bw, bh);
  const verdict = a.maxFlashesPerSec > 3 ? "İHLAL" : a.blockMaxPerSec > 3 ? "blok düzeyinde >3/sn (alan <%25)" : "geçti";
  log(`${name}: parlama/sn (≥%25 alan) ${a.maxFlashesPerSec} · en büyük geçiş alanı %${(a.maxArea * 100).toFixed(1)} · blok düzeyi en çok ${a.blockMaxPerSec}/sn · pencere-ortalama Δ en çok ${a.maxMeanDelta.toFixed(4)} (parlama/sn ${a.maxMeanFlashesPerSec}) · kırmızı geçiş ${a.redTrans} (alan %${(a.redArea * 100).toFixed(1)}) · parlaklık ${a.lo.toFixed(3)}–${a.hi.toFixed(3)} ort ${a.meanAll.toFixed(3)} · ${((Date.now() - t0) / 1000).toFixed(0)} sn · hata ${errors.length} → ${verdict}`);
  if (errors.length) log("   hatalar: " + errors.slice(0, 3).join(" | "));
  results.push({ name, ...sc, ...a, errors });
  await page.close();
}
writeFileSync(new URL("../../kanit/parlama.json", import.meta.url), JSON.stringify(results, null, 1));
writeFileSync(new URL("../../kanit/parlama.txt", import.meta.url), lines.join("\n"));
await browser.close();
await new Promise((r) => server.httpServer.close(r));
