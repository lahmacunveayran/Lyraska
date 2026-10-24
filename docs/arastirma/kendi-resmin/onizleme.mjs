// Önizleme: "Kendi resmin" sahnesi gerçek tarayıcıda, sahte çekirdekle. visual_spectrum, çekirdeğin
// (src-tauri/src/audio/spectrum.rs) bir sesten hesapladığı seviyeleri çalar (60 kare/sn; README).
// Önce depo kökünde `npx vite --port 5181`. Resim `data:` adresi olarak bir metin dosyasında.
// Kullanım: node onizleme.mjs <çıktı-öneki> <video|seq|frame:N> <resim.txt|none> [W] [H] [ilk kare]
//           [kare sayısı] [adım] [seviyeler.json]
// `seq`: seviyeler kare kare dondurulur, her kare ekran görüntüsü (REST=1: önce çubuksuz kare).
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
const [
  ,
  ,
  out,
  mode,
  imgArg,
  w = "1920",
  h = "1080",
  startArg = "0",
  countArg = "8",
  stepArg = "2.5",
  lv = "a.f32.levels.json",
] = process.argv;
const img = imgArg === "none" ? null : readFileSync(imgArg, "utf8");
const levels = JSON.parse(readFileSync(lv, "utf8"));
const W = +w,
  H = +h;
const b = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);
const ctxOpts = { viewport: { width: W, height: H } };
if (mode === "video") {
  mkdirSync("vid", { recursive: true });
  ctxOpts.recordVideo = { dir: "vid", size: { width: W, height: H } };
}
const ctx = await b.newContext(ctxOpts);
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("ERR", e.message));
p.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE", m.text());
});
await p.addInitScript(
  ([img, levels, freeze]) => {
    localStorage.setItem("lyraska.scene", "photo");
    const t0 = performance.now();
    window.isTauri = true;
    window.__freeze = freeze;
    const track = {
      path: "/m/a.flac",
      fileName: "a.flac",
      title: "Flying High",
      artist: "DJ Splash Remix",
      album: null,
      albumArtist: null,
      trackNumber: null,
      discNumber: null,
      durationSecs: 240,
      sampleRate: 44100,
      channels: 2,
      codec: "flac",
    };
    window.__TAURI_INTERNALS__ = {
      transformCallback: () => 0,
      invoke: async (cmd) => {
        const el = (performance.now() - t0) / 1000;
        const pos = 25 + el;
        if (cmd === "background_image_get") return img;
        if (cmd === "app_info") return { version: "0.0.79", supportedExtensions: ["mp3", "flac"] };
        if (cmd === "open_track") return track;
        if (cmd === "library_status")
          return {
            folders: [{ id: 1, path: "/m", trackCount: 1, single: false }],
            trackCount: 1,
            analyzed: 0,
            scan: { scanning: false, found: 0, processed: 0, current: null },
            problems: [],
          };
        if (cmd === "library_search")
          return [
            {
              id: 1,
              path: "/m/a.flac",
              title: "Flying High",
              artist: "DJ Splash Remix",
              album: null,
              albumArtist: null,
              trackNumber: null,
              durationSecs: 240,
              codec: "flac",
              bpm: 128,
              analyzed: true,
              key: "8A",
            },
          ];
        if (["playlists_list"].includes(cmd)) return [];
        if (["set_next_track", "plugin:event|listen", "log_frontend_error"].includes(cmd))
          return null;
        if (cmd === "playback_status")
          return {
            state: "playing",
            track,
            error: null,
            bpm: 128,
            output: null,
            positionSecs: pos,
            underruns: 0,
          };
        if (cmd === "visual_spectrum") {
          const f = window.__freeze;
          if (f === -2) return new Array(200).fill(0);
          return levels[(f >= 0 ? Math.round(f) : Math.floor(el * 60)) % levels.length];
        }
        if (cmd === "visual_waveform") return new Uint8Array(3072).fill(128).buffer;
        if (cmd === "visual_frame") {
          const bands = Array.from({ length: 32 }, (_, i) => Math.max(0, 0.9 - i * 0.022));
          return {
            positionSecs: pos,
            bands,
            rmsDb: [-12, -12],
            peakDb: [-3, -3],
            vuReferenceDb: -14,
            director: null,
          };
        }
        (window.__miss ||= new Set()).add(cmd);
        throw "mock: " + cmd;
      },
    };
  },
  [img, levels, mode.startsWith("frame:") ? +mode.slice(6) : mode === "seq" ? +startArg : -1],
);
await p.goto("http://localhost:5181/");
await p.waitForTimeout(1500);
await p.click("text=Kütüphane").catch(() => {});
await p.waitForTimeout(800);
await p.dblclick(".library__row:not(.library__row--head)");
await p.waitForTimeout(500);
await p.keyboard.press("Escape");
await p.mouse.move(W / 2, H / 2);
if (mode === "video") {
  await p.waitForTimeout(12000);
} else {
  await p.waitForTimeout(6000);
}
console.log(
  await p.evaluate(() => [
    document.querySelector(".app")?.className,
    [...(window.__miss || [])].join(","),
    getComputedStyle(document.querySelector(".photo-scene__bars")).mixBlendMode,
  ]),
);
if (mode.startsWith("frame:")) await p.screenshot({ path: out + ".png" });
if (mode === "seq") {
  const count = +countArg,
    step = +stepArg,
    start = +startArg;
  if (process.env.REST) {
    await p.evaluate(() => {
      window.__freeze = -2;
    });
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}-rest.png` });
  }
  for (let i = 0; i < count; i++) {
    await p.evaluate(
      (f) => {
        window.__freeze = f;
      },
      start + i * step,
    );
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${out}-${String(i).padStart(3, "0")}.png` });
  }
}
await ctx.close();
await b.close();
