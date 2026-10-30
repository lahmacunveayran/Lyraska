// Lyraska'nın GERÇEK arayüzünü (vite preview ile dist/) başsız Chromium'da açar, "Kendi resmin" sahnesini
// sahte çekirdekle çalar; visual_spectrum her karede verilen (gerçek Rust spectrum.rs + stepBars) seviyeleri
// döndürür. Kare kare dondurup ekran görüntüsü alır.
// Kullanım: node ciz.mjs <url> <seviyeler.json> <resim.txt> <çıktı klasörü> [W H]
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
const require = createRequire("/home/user/Lyraska/package.json");
const { chromium } = require("playwright-core");
const [, , url, lvPath, imgPath, outDir, w = "1280", h = "720"] = process.argv;
const L = JSON.parse(readFileSync(lvPath, "utf8"));
const img = readFileSync(imgPath, "utf8");
mkdirSync(outDir, { recursive: true });
const W = +w,
  H = +h;
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome",
});
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
await p.addInitScript(
  ([img, levels, times]) => {
    try {
      localStorage.setItem("lyraska.scene", "photo");
      localStorage.setItem("lyraska.flashWarning.seen", "1");
      localStorage.setItem("lyraska.photoParticles", "off");
    } catch {}
    window.isTauri = true;
    window.__freeze = 0;
    const pos = () => times[window.__freeze] ?? 20;
    const track = {
      path: "C:/Müzik/flying.flac",
      fileName: "flying",
      title: "Flying High",
      artist: "DJ Splash Remix",
      codec: "flac",
      sampleRate: 44100,
      channels: 2,
      durationSecs: 173,
    };
    window.__TAURI_INTERNALS__ = {
      transformCallback: () => 0,
      invoke: async (cmd) => {
        const status = {
          state: "playing",
          track,
          positionSecs: pos(),
          underruns: 0,
          error: null,
          bpm: 128,
          output: null,
        };
        switch (cmd) {
          case "app_info":
            return {
              name: "Lyraska",
              version: "teshis",
              phase: "",
              audioEngine: "",
              analysis: "",
              visualBridge: "",
              supportedExtensions: ["flac"],
            };
          case "library_status":
            return {
              folders: [],
              trackCount: 0,
              analyzed: 0,
              scan: { scanning: false, found: 0, processed: 0, current: null },
              problems: [],
            };
          case "library_search":
            return [];
          case "equalizer_get":
            return {
              enabled: true,
              gainsDb: Array(10).fill(0),
              bassDb: 0,
              smallSpeaker: false,
              bassDepth: 0,
              bassPunch: 0,
              maxBassDb: 18,
              bandsHz: [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
              maxGainDb: 12,
              preampDb: 0,
              curveHz: [20, 20000],
              curveDb: [0, 0],
            };
          case "headphone_get":
            return { enabled: false, profile: null, curveHz: [], curveDb: [] };
          case "parametric_get":
            return {
              settings: { enabled: true, bands: [], design: "matched" },
              comparing: false,
              curveHz: [],
              curveDb: [],
              bandCurvesDb: [],
              boostDb: 0,
              loudnessDb: 0,
              maxBands: 20,
              maxGainDb: 24,
              minQ: 0.1,
              maxQ: 30,
            };
          case "crossfeed_get":
            return {
              settings: { enabled: false, cutoffHz: 700, levelDb: 6 },
              presets: [],
              delayUs: 227,
              curveHz: [],
              nearDb: [],
              farDb: [],
            };
          case "visual_safe_get":
            return false;
          case "milkdrop_list":
            return { folder: null, truncated: false, error: null, presets: [] };
          case "audio_delay_get":
            return 0;
          case "song_map":
            return {
              meter: 4,
              downbeatPhase: 0,
              grouping: [],
              meterConfidence: 1,
              downbeats: [],
              drops: [],
              dropConfidence: [],
              energy: [],
              sections: [{ start: 0, end: 240, energy: 0.8, label: 1 }],
            };
          case "annotation_get":
          case "song_key":
          case "song_map_imported":
          case "track_lyrics":
          case "track_lyrics_text":
          case "song_cover_get":
            return null;
          case "background_image_get":
            return img;
          case "playlists_list":
            return [];
          case "visual_waveform":
            return new Uint8Array(3072).fill(128).buffer;
          case "visual_spectrum":
            return levels[window.__freeze];
          case "visual_frame":
            return {
              positionSecs: pos(),
              bands: Array(32).fill(0.3),
              rmsDb: [-12, -12],
              peakDb: [-3, -3],
              vuReferenceDb: -14,
              energy: 0.8,
              section: 1,
              beat: null,
              director: null,
            };
          default:
            return status;
        }
      },
    };
  },
  [img, L.levels, L.t],
);
await p.goto(url);
await p.waitForTimeout(1500);
await p.mouse.click(5, 5);
await p.keyboard.press("Space");
await p.waitForSelector(".photo-scene__bars");
await p.waitForFunction(
  () => document.querySelector(".photo-scene__bars")?.dataset.measured === "on",
  null,
  { timeout: 60000 },
);
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
await p.keyboard.press("Escape");
await p.waitForTimeout(6000); // sinema görünümü (denetimler gizlenir)
for (let i = 0; i < L.levels.length; i++) {
  await p.evaluate((f) => {
    window.__freeze = f;
  }, i);
  // istek sürüyorsa bir öncekiyle çizilir: değerin ekranda olduğunu tuvalin değişmesiyle değil süreyle bekle
  await p.waitForTimeout(150);
  await p.screenshot({ path: `${outDir}/${String(i).padStart(4, "0")}.png` });
}
console.log("kare", L.levels.length, "hata", errs.join(" | ") || "yok");
await b.close();
