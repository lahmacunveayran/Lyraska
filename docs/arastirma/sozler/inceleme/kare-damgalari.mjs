// Gerçek Chromium'da rAF damgası ile performance.now() ilişkisi: önce koşan ağır bir geri çağrı
// (sahne) olduğunda `frameTime` (src/lib/clock.ts) dizisi geri gidiyor mu?
import { chromium } from "playwright-core";
// Çalıştırma: node docs/arastirma/sozler/inceleme/kare-damgalari.mjs [tarayıcı argümanları]

const args = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.SCENE_BROWSER_PATH ?? "/opt/pw-browsers/chromium",
  args,
});
const page = await browser.newPage();
await page.setContent("<div id=x style='width:100px;height:100px;background:red'></div>");
const result = await page.evaluate(
  () =>
    new Promise((done) => {
      const WINDOW = 50;
      const frameTime = (s, n) => (s <= n && n - s <= WINDOW ? s : n);
      const rows = [];
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      // Sahne: her karede 0–90 ms arası ağır iş (bazı karelerde 50 ms penceresini aşar).
      const scene = () => {
        const until = performance.now() + rnd() * 90;
        while (performance.now() < until);
        document.getElementById("x").style.width = 100 + (rows.length % 2) + "px";
        requestAnimationFrame(scene);
      };
      const lyrics = (stamp) => {
        const now = performance.now();
        rows.push({ stamp, now, at: frameTime(stamp, now) });
        if (rows.length < 300) requestAnimationFrame(lyrics);
        else done(rows);
      };
      requestAnimationFrame(scene);
      requestAnimationFrame(lyrics);
    }),
);
await browser.close();
let back = 0;
let worst = 0;
let fallbacks = 0;
for (let i = 1; i < result.length; i++) {
  if (result[i].at === result[i].now && result[i].stamp !== result[i].now) fallbacks++;
  const d = result[i].at - result[i - 1].at;
  if (d < 0) {
    back++;
    worst = Math.min(worst, d);
  }
}
const stampBehindPrevNow = result.filter((r, i) => i > 0 && r.stamp < result[i - 1].now).length;
console.log(
  `kare: ${result.length}, pencere dışı (şimdiki an): ${fallbacks}, ` +
    `damga < önceki karenin now'u: ${stampBehindPrevNow}, ` +
    `frameTime geri gitti: ${back} kez, en kötü ${worst.toFixed(1)} ms`,
);
const i = result.findIndex((r, k) => k > 0 && r.at < result[k - 1].at - 10);
if (i > 0)
  console.log(
    JSON.stringify(result.slice(i - 2, i + 2).map((r) => [+r.stamp.toFixed(1), +r.now.toFixed(1)])),
  );
