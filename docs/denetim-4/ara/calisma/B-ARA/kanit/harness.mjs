// B-ARA denetim harness'ı: check-scenes.mjs'in düzeni yeniden kullanılır (sahte çekirdek +
// Playwright/Chromium), ama çekirdek DURUMLUdur (aç/çal/duraklat/sar/kütüphane) ve görsel veri
// profilleri seçilebilir (müzik, en kötü kare dalgası, drop). Zaman gerçek ya da sanal.
import { chromium } from "playwright-core";
import { preview } from "vite";

export const PORT = Number(process.env.PORT ?? 4190);
export const APP_URL = `http://localhost:${PORT}`;
export const CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/**
 * Sahte çekirdek (tarayıcıda çalışır). opts: { profile: "music"|"square"|"drop"|"silent"|"level0"|"level1",
 * hz: kare dalgası frekansı, safe: güvenli mod, tracks: kütüphanedeki şarkı sayısı, virtual: sanal saat }.
 */
export const fakeCore = (opts = {}) => `
(() => {
  const OPTS = ${JSON.stringify({ profile: "music", hz: 4, safe: false, tracks: 300, virtual: false, autoplay: false, ...opts })};
  window.isTauri = true;
  window.__calls = [];
  const clock = () => (OPTS.virtual && window.__sceneTime ? window.__sceneTime.now : performance.now());
  const started = clock();
  const mk = (i) => ({ id: i + 1, path: "C:/Müzik/" + (i + 1) + ".flac", fileName: (i + 1) + ".flac",
    title: "Şarkı " + (i + 1) + (i % 7 === 0 ? " Çığlık" : ""), artist: i % 3 === 0 ? "İlhan İrem" : "Sezen Aksu",
    album: "Albüm " + (1 + Math.floor(i / 10)), trackNumber: (i % 12) + 1, durationSecs: 180 + (i % 60),
    bpm: 120 + (i % 20), analyzed: true, key: null, camelot: null, codec: "flac", sampleRate: 44100, channels: 2,
    folderId: 1, modified: 0, size: 1000 });
  const TRACKS = Array.from({ length: OPTS.tracks }, (_, i) => mk(i));
  const lower = (s) => (s ?? "").toLocaleLowerCase("tr");
  const session = { state: "idle", track: null, startedAt: 0, pausedAt: 0, underruns: 0, error: null, next: null };
  const trackFor = (path) => {
    const t = TRACKS.find((x) => x.path === path);
    return { path, fileName: path.split("/").pop(), title: t ? t.title : "Deneme", artist: t ? t.artist : "Lyraska",
      album: t ? t.album : null, codec: "flac", sampleRate: 44100, channels: 2, bitsPerSample: 16, durationSecs: t ? t.durationSecs : 240 };
  };
  const position = () => {
    if (!session.track) return 0;
    const base = session.state === "playing" ? (clock() - session.startedAt) / 1000 : session.pausedAt;
    return Math.min(session.track.durationSecs, Math.max(0, base));
  };
  const status = () => ({ state: session.state, track: session.track, positionSecs: position(), underruns: session.underruns,
    error: session.error, bpm: session.track ? 128 : null, output: session.track ? { device: "Sanal", sampleRate: 44100, bitPerfect: false, notice: null, path: "Sanal" } : null });
  const eq = { enabled: true, gainsDb: Array(10).fill(0), bassDb: 0, smallSpeaker: false, bassDepth: 0, bassPunch: 0 };
  const eqState = () => ({ ...eq, maxBassDb: 18, bandsHz: [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000], maxGainDb: 12,
    preampDb: -Math.max(0, ...eq.gainsDb, eq.bassDb), curveHz: [20, 20000], curveDb: [0, 0] });
  let safe = OPTS.safe;
  // Görsel veri profilleri.
  const frame = () => {
    const t = (clock() - started) / 1000;
    const beats = t * 128 / 60;
    const sq = (Math.floor(t * OPTS.hz) % 2) === 0 ? 1 : 0; // kare dalgası
    const dropPhase = (t % 4) / 4; // her 4 sn'de bir drop: 3 sn gerilim, sonra açılım
    let bands, rms, mood = 0.9, release = 0.4, anticipation = 0, accent = 0.2, pulse = 0.5, theme = 1;
    switch (OPTS.profile) {
      case "square":
        bands = Array(32).fill(sq); rms = sq ? [0, 0] : [-60, -60]; mood = sq; release = sq; anticipation = 1 - sq; accent = sq; pulse = sq; theme = sq ? 2 : 0;
        break;
      case "drop":
        anticipation = dropPhase < 0.75 ? dropPhase / 0.75 : 0;
        release = dropPhase >= 0.75 ? 1 - (dropPhase - 0.75) / 0.25 : 0;
        accent = (beats % 4) < 0.1 ? 1 : 0;
        pulse = Math.max(0, 1 - (beats % 1) * 3);
        bands = Array.from({ length: 32 }, (_, i) => Math.max(0, Math.min(1, (dropPhase >= 0.75 ? 1 : 0.4) * (0.9 - i * 0.012) * (0.6 + 0.4 * pulse))));
        rms = dropPhase >= 0.75 ? [-2, -2] : [-14, -14];
        mood = dropPhase >= 0.75 ? 1 : 0.5; theme = dropPhase >= 0.75 ? 2 : 1;
        break;
      case "silent": bands = Array(32).fill(0); rms = [-60, -60]; mood = 0; release = 0; pulse = 0; break;
      case "level0": bands = Array(32).fill(0); rms = [-60, -60]; break;
      case "level1": bands = Array(32).fill(1); rms = [0, 0]; break;
      default: // music (check-scenes ile aynı)
        bands = Array.from({ length: 32 }, (_, i) => Math.max(0, 0.85 - i * 0.015 + 0.12 * Math.sin(i + t * 4)));
        rms = [-12 + 6 * Math.sin(beats * Math.PI), -12 + 6 * Math.sin(beats * Math.PI)];
        pulse = Math.max(0, 1 - (beats % 1) * 3); accent = (beats % 4) < 0.1 ? 1 : 0;
    }
    return { positionSecs: position(), bands, rmsDb: rms, peakDb: rms.map((d) => d + 3), vuReferenceDb: -14, energy: 0.8, section: 1,
      beat: { bpm: 128, index: Math.floor(beats), phase: beats % 1, barBeat: 1 + (Math.floor(beats) % 4), meter: 4 },
      director: { atmosphere: { section: 1, theme, mood, warmth: 0.6 },
        rhythm: { pulse, accent, beatPhase: beats % 1, barPhase: (beats / 4) % 1, anticipation, release, barsConfident: true },
        texture: { detail: 0.6, motion: 0.6 } } };
  };
  window.__TAURI_INTERNALS__ = { transformCallback: () => 0, invoke: async (cmd, args) => {
    window.__calls.push(cmd);
    switch (cmd) {
      case "app_info": return { name: "Lyraska", version: "denetim", commit: "deadbeef", phase: "Faz 1", audioEngine: "sanal", analysis: "sanal",
        visualBridge: "sanal", supportedExtensions: ["flac", "mp3"] };
      case "library_status": return { folders: [{ id: 1, path: "C:/Müzik" }], trackCount: TRACKS.length, analyzed: TRACKS.length,
        scan: { scanning: false, found: TRACKS.length, processed: TRACKS.length, current: null }, problems: [] };
      case "library_search": { const q = lower(args && args.query); return TRACKS.filter((t) => !q || lower(t.title).includes(q) || lower(t.artist).includes(q) || lower(t.album).includes(q)); }
      case "library_add_folder": case "library_rescan": case "library_remove_folder": return await window.__TAURI_INTERNALS__.invoke("library_status");
      case "library_add_dropped": return { tracks: args.paths, folders: [], problems: [] };
      case "equalizer_get": return eqState();
      case "equalizer_set": Object.assign(eq, args.settings); return eqState();
      case "headphone_get": return { enabled: false, profile: null, curveHz: [], curveDb: [] };
      case "parametric_get": return { settings: { enabled: true, bands: [], design: "matched" }, comparing: false, curveHz: [], curveDb: [], bandCurvesDb: [], boostDb: 0, loudnessDb: 0, maxBands: 20, maxGainDb: 24, minQ: 0.1, maxQ: 30 };
      case "crossfeed_get": return { settings: { enabled: false, cutoffHz: 700, levelDb: 6 }, presets: [], delayUs: 227, curveHz: [], nearDb: [], farDb: [] };
      case "visual_safe_get": return safe;
      case "visual_safe_set": safe = !!args.enabled; return safe;
      case "playback_options_get": return { normalize: true, bitPerfect: false };
      case "playback_options_set": return args.options;
      case "audio_delay_get": return 0;
      case "audio_delay_set": return args.ms;
      case "song_map": return session.track ? { meter: 4, downbeatPhase: 0, grouping: [], meterConfidence: 1, downbeats: [], drops: [60, 120], dropConfidence: [1, 1],
        energy: [], sections: [{ start: 0, end: 60, energy: 0.5, label: 0 }, { start: 60, end: 120, energy: 0.9, label: 2 }, { start: 120, end: 240, energy: 0.7, label: 1 }] } : null;
      case "annotation_get": case "song_key": case "track_lyrics": case "song_map_imported": case "track_cover": return null;
      case "abx_status": return { active: false, aName: "", bName: "", startSecs: 0, clipSecs: 0, positionSecs: 0, playing: null, answered: 0, total: 0, result: null, levelDiffDb: 0, offsetMs: 0, similarity: 0, sampleRate: 0, error: null };
      case "visual_frame": return session.track && session.state === "playing" ? frame() : null;
      case "open_track": { session.track = trackFor(args.path); session.state = "playing"; session.startedAt = clock(); session.error = null; return session.track; }
      case "toggle_playback": {
        if (!session.track) return status();
        if (session.state === "playing") { session.pausedAt = position(); session.state = "paused"; }
        else { session.startedAt = clock() - session.pausedAt * 1000; session.state = "playing"; }
        return status(); }
      case "stop_playback": { if (session.track) { session.state = "paused"; session.pausedAt = 0; } return status(); }
      case "seek_playback": { if (session.track) { session.pausedAt = args.seconds; session.startedAt = clock() - args.seconds * 1000; } return status(); }
      case "set_next_track": session.next = args.path; return null;
      case "playback_status": return status();
      case "log_frontend_error": (window.__logged = window.__logged || []).push(args.message); return null;
      case "open_log": return null;
      default: return status();
    }
  }};
  window.__fake = { session, status, TRACKS };
})();
`;

/** Sanal zaman (check-scenes.mjs ile aynı düzen): her rAF karesi en fazla STEP_MS ilerler, izin verildiği kadar. */
export const virtualTime = (stepMs) => `
  (() => {
    const realFrame = window.requestAnimationFrame.bind(window);
    const time = { allowed: 0, done: 0, now: 0, lastFrame: -1, step: ${stepMs} };
    window.__sceneTime = time;
    window.requestAnimationFrame = (callback) =>
      realFrame((frame) => {
        if (frame !== time.lastFrame) {
          time.lastFrame = frame;
          if (time.done < time.allowed) { time.done += 1; time.now += time.step; }
        }
        callback(time.now);
      });
  })();
`;

export async function advance(page, frames) {
  await page.evaluate((n) => { window.__sceneTime.allowed += n; }, frames);
  await page.waitForFunction(() => window.__sceneTime.done >= window.__sceneTime.allowed, null, { polling: 10, timeout: 120000 });
}

export async function startServer() {
  return preview({ preview: { port: PORT, strictPort: true }, logLevel: "warn" });
}

export async function launch(extraArgs = []) {
  return chromium.launch({ executablePath: CHROMIUM, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-precise-memory-info", "--js-flags=--expose-gc", ...extraArgs] });
}

/** Konsol hatalarını ve sayfa hatalarını toplar. */
export function collectErrors(page, sink) {
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") sink.push(`konsol[${m.type()}]: ${m.text()}`); });
  page.on("pageerror", (e) => sink.push(`sayfa hatası: ${e}`));
}

/** Ekran görüntüsünü (base64 PNG) tarayıcıda çözüp `block` piksellik bloklarda ortalama bağıl parlaklık ve sRGB ortalaması döndürür. */
export async function blockLuminance(page, png, block) {
  return page.evaluate(async ([data, B]) => {
    const img = new Image(); img.src = "data:image/png;base64," + data; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const W = c.width, H = c.height, bw = Math.floor(W / B), bh = Math.floor(H / B);
    const lum = new Float32Array(bw * bh), r = new Float32Array(bw * bh), gg = new Float32Array(bw * bh), b = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      let s = 0, sr = 0, sg = 0, sb = 0;
      for (let y = by * B; y < (by + 1) * B; y++) for (let x = bx * B; x < (bx + 1) * B; x++) {
        const i = (y * W + x) * 4; const R = lin(d[i]), G = lin(d[i + 1]), Bl = lin(d[i + 2]);
        s += 0.2126 * R + 0.7152 * G + 0.0722 * Bl; sr += R; sg += G; sb += Bl;
      }
      const n = B * B; lum[by * bw + bx] = s / n; r[by * bw + bx] = sr / n; gg[by * bw + bx] = sg / n; b[by * bw + bx] = sb / n;
    }
    return { bw, bh, W, H, lum: Array.from(lum), r: Array.from(r), g: Array.from(gg), b: Array.from(b) };
  }, [png, block]);
}
