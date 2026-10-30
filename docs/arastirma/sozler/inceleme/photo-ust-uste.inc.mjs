/**
 * İnceleme 3: "Kendi resmin"de denetimler görünürken (fare kıpırdadı) söz satırı başka bir öğeyle
 * üst üste biniyor mu? check-scenes.mjs'in yardımcılarını (openPage, initScript, startPlaying,
 * fakeLyrics) kullanır; `photo-ust-uste.py` bu dosyayı check-scenes.mjs'in geçici bir kopyasına ekler
 * ve SCENE_ONLY=photooverlap ile çalıştırır. Söz satırının görünen kısmı (yerinin kırptığı) ile
 * sahnenin dışındaki görünür her öğenin (yazısı, kenarı ya da arka planı olan) kesişimi ölçülür.
 */
async function checkPhotoLyricsOverlap(browser) {
  const problems = [];
  const cases = [
    { width: 1280, height: 720, long: false, drawer: false },
    { width: 1280, height: 720, long: true, drawer: false },
    { width: 1024, height: 600, long: true, drawer: false },
    { width: 800, height: 600, long: true, drawer: false },
    { width: 1920, height: 1080, long: false, drawer: true },
    { width: 1280, height: 720, long: true, drawer: true },
  ];
  for (const { width, height, long, drawer } of cases) {
    const label = `Söz üst üste · ${width}×${height}${long ? " uzun" : ""}${drawer ? " çekmece açık" : ""}`;
    const page = await openPage(browser, { viewport: { width, height }, scale: 1 });
    page.on("pageerror", (e) => problems.push(`${label}: sayfa hatası: ${e}`));
    await page.addInitScript(initScript("photo", { lyrics: fakeLyrics(long) }));
    await startPlaying(page, 1500);
    const open = (await page.locator("#drawer.is-open").count()) > 0;
    if (open !== drawer) await page.keyboard.press(drawer ? "Control+," : "Escape").catch(() => {});
    if (drawer && !(await page.locator("#drawer.is-open").count())) {
      // Çekmeceyi açan düğme (ayarlar) yoksa kütüphane kısayolu.
      await page.keyboard.press("l").catch(() => {});
    }
    await page.mouse.move(width / 3, height / 3);
    await page.mouse.move(width / 3 + 20, height / 3 + 10);
    await page.waitForTimeout(1200);
    const result = await page.evaluate(() => {
      const visible = (el) => {
        let v = 1;
        for (let e = el; e; e = e.parentElement) {
          const s = getComputedStyle(e);
          if (s.display === "none" || s.visibility === "hidden") return 0;
          v *= parseFloat(s.opacity);
        }
        return v;
      };
      const line = document.querySelector(".photo-lyrics__line");
      const slot = document.querySelector(".photo-scene__lyrics");
      if (!line || !slot) return { error: "söz satırı yok" };
      const a = line.getBoundingClientRect();
      const b = slot.getBoundingClientRect();
      const box = {
        left: Math.max(a.left, b.left),
        right: Math.min(a.right, b.right),
        top: Math.max(a.top, b.top),
        bottom: Math.min(a.bottom, b.bottom),
      };
      const hits = [];
      const stage = document.querySelector(".stage");
      for (const el of document.body.querySelectorAll("*")) {
        if (stage?.contains(el) || el.contains(line)) continue;
        // Çekmece/kütüphane sözleri bilerek örter (üstte, kendi arka planıyla): üst üste binme değil.
        if (el.closest("#drawer, .library-backdrop")) continue;
        const v = visible(el);
        if (v < 0.05) continue;
        const s = getComputedStyle(el);
        const hasText = [...el.childNodes].some(
          (n) => n.nodeType === 3 && n.textContent.trim() !== "",
        );
        const painted =
          hasText ||
          ["BUTTON", "svg", "CANVAS", "IMG", "INPUT"].includes(el.tagName) ||
          (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent") ||
          s.backdropFilter !== "none";
        if (!painted) continue;
        const r = el.getBoundingClientRect();
        const w = Math.min(r.right, box.right) - Math.max(r.left, box.left);
        const h = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
        if (w > 1 && h > 1) {
          const name = `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`;
          hits.push(`${name} (${Math.round(w)}×${Math.round(h)} px, saydamlık ${v.toFixed(2)})`);
        }
      }
      return {
        cinema: !!document.querySelector(".app.is-cinema"),
        drawer: !!document.querySelector("#drawer.is-open"),
        box: Object.fromEntries(Object.entries(box).map(([k, x]) => [k, Math.round(x)])),
        lyricsOpacity: visible(line),
        hits: [...new Set(hits)].slice(0, 8),
      };
    });
    if (process.env.OVERLAP_SHOTS) {
      await page.screenshot({
        path: `${process.env.OVERLAP_SHOTS}/${width}x${height}${long ? "-uzun" : ""}${drawer ? "-cekmece" : ""}.png`,
      });
    }
    await page.close();
    console.log(`${label}: ${JSON.stringify(result)}`);
    if (result.error) problems.push(`${label}: ${result.error}`);
    else if (!result.cinema && result.lyricsOpacity > 0.5 && result.hits.length > 0)
      problems.push(`${label}: söz satırı üstünde: ${result.hits.join(", ")}`);
  }
  return problems;
}
