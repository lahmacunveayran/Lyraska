// Sahne denetimi: derlenmiş arayüzü gerçek bir tarayıcıda açar, "Gece göğü" ve
// "Gece otoyolu" sahnelerini sahte müzik verisiyle çalıştırır ve ölçer:
//
// - Ekran kartı çizimi (WebGL2) açıldı mı, gölgelendiriciler derlendi mi?
// - Konsolda hata var mı? (Programın CSP'si de uygulanır: CSP ihlali konsol hatasıdır.)
// - Görüntü gerçekten çiziliyor mu (düz/karanlık değil) ve zamanla değişiyor mu?
// - Gece göğünde sağ üstteki Lyra takımyıldızının yıldızları görünüyor mu?
// - Parlama sınırı: sessizden tam sese geçişte ekrandaki en büyük parlaklık farkı. Gece göğünün
//   her manzarası (göl, korona, karlı vadi) ölçülür; renkleri bölüm temasına göre değişen
//   sahneler her temada (göğün varsayılan dışındaki manzaraları en parlak iki temada). Galerinin
//   iki sahnesi ayrıca en parlak sabit palette ve en yüksek hızda (hazır ayarlar).
//
// CI'da Windows'ta Microsoft Edge ile çalışır: programın kullandığı WebView2 de Edge
// motorudur ve gölgelendiriciler Windows'ta (ANGLE → Direct3D) Linux'takinden farklı
// derlenir. Yerelde: SCENE_BROWSER_PATH=/yol/chromium npm run check:scenes
//
// Ortam değişkenleri:
//   SCENE_BROWSER_CHANNEL  ör. "msedge" (kurulu tarayıcı)
//   SCENE_BROWSER_PATH     tarayıcı dosyası (kanal verilmediyse)
//   SCENE_BROWSER_ARGS     ek tarayıcı argümanları (boşlukla ayrılmış)
//   SCENE_EXPECT           "webgl" (varsayılan) ya da "fallback": WebGL kapalı bir
//                          tarayıcıda gece göğünün 2D yedek çizimle (Lyra dahil) göründüğü denetlenir
//
// Ayrıca parlaklık freni (src/lib/flashGuard.ts) zamana bağlı ölçülür (`SCENE_ONLY=flash-guard`):
// bilerek parlayan bir desen frenden geçirilir, ekrandaki parlamalar kare kare sayılır.
//
// MilkDrop sahnesi (`SCENE_ONLY=milkdrop`) programın özgün deneme presetiyle
// (src-tauri/tests/data/milkdrop/lyraska-parlama.*: saniyede dört kez tersine dönen, bilerek parlayan
// bir görsel) gerçek sahnede çalışır: WebGL, hareket ve kare kare parlama ölçümü (görünen tuval
// frenli, Butterchurn'ün görünmeyen tuvali frensiz denetim olarak), normal ve güvenli modda.
// Gölgelendirici denemesi (lyraska-golge.*: HLSL bükme ve birleştirme gölgelendiricisi; birleştirme
// saniyede dört kez beyaza çakar) çekirdeğin GLSL çevirisinin gerçek tarayıcıda derlendiğini
// (`data-shaders="ok"`) ve çakan gölgelendiricide de frenin tuttuğunu gösterir.
//
// Program sayfaları programın gerçek içerik güvenlik politikasıyla (CSP, tauri.conf.json) açılır:
// `eval`/`new Function` engellidir; Butterchurn'ün yalnızca WebAssembly yolunu kullandığı böylece
// gerçek tarayıcıda denetlenir (engellenen her şey konsola hata yazar, denetim kırmızı olur).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { build, preview } from "vite";

const PORT = 4179;
/** Programın içerik güvenlik politikası (Tauri penceresindekiyle aynı). */
const APP_CSP = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
).app.security.csp;
/**
 * MilkDrop sahnesinin deneme presetleri: Rust ayrıştırıcısının özgün `.milk` dosyalarından ürettiği
 * JSON (`milkdrop::tests::ornek_gorsel_beklenen_jsona_cevrilir` aynı olduklarını denetler).
 * `parlama`: bilerek parlar; `dongu`: denkleminde çok büyük bir `loop` (programın sınırıyla kırpılmış);
 * `golge`: HLSL gölgelendiricileri GLSL'e çevrilmiş (`milkdrop/shader.rs`), birleştirmesi bilerek çakar.
 */
const milkdropFixture = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../src-tauri/tests/data/milkdrop/lyraska-${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const MILKDROP_PRESETS = {
  parlama: { name: "Lyraska parlama denemesi", preset: milkdropFixture("parlama") },
  dongu: { name: "Lyraska döngü denemesi", preset: milkdropFixture("dongu") },
  golge: { name: "Lyraska gölgelendirici denemesi", preset: milkdropFixture("golge") },
};
const EXPECT_FALLBACK = process.env.SCENE_EXPECT === "fallback";
const APP_URL = `http://localhost:${PORT}`;

/**
 * Tarayıcıda Tauri yerine geçen sahte çekirdek: 128 BPM'lik bir şarkı çalıyor. `level` verilirse bütün bantlar ve
 * VU seviyeleri sabit o düzeyde (parlama sınırı ölçümü için: 0 = sessiz, 1 = tam). `theme`: bölümün renk teması.
 */
const fakeCore = (level = null, theme = 1, safe = false, milk = "parlama") => `
  const LEVEL = ${level === null ? "null" : level};
  window.isTauri = true;
  const started = performance.now();
  const track = { path: "C:/Müzik/deneme.flac", fileName: "deneme", title: "Deneme", artist: "Lyraska",
    codec: "flac", sampleRate: 44100, channels: 2, durationSecs: 240 };
  const status = { state: "playing", track, positionSecs: 60, underruns: 0, error: null, bpm: 128, output: null };
  window.__TAURI_INTERNALS__ = { transformCallback: () => 0, invoke: async (cmd) => {
    const t = (performance.now() - started) / 1000;
    const beats = t * 128 / 60;
    switch (cmd) {
      case "app_info": return { name: "Lyraska", version: "denetim", phase: "", audioEngine: "", analysis: "",
        visualBridge: "", supportedExtensions: ["flac"] };
      case "library_status": return { folders: [], trackCount: 0, analyzed: 0,
        scan: { scanning: false, found: 0, processed: 0, current: null }, problems: [] };
      case "library_search": return [];
      // EqState'in bütün alanları (src/lib/bindings/EqState.ts): eksik alan arayüzü çökertir.
      case "equalizer_get": return { enabled: true, gainsDb: Array(10).fill(0), bassDb: 0,
        smallSpeaker: false, bassDepth: 0, bassPunch: 0, maxBassDb: 18,
        bandsHz: [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000], maxGainDb: 12, preampDb: 0,
        curveHz: [20, 20000], curveDb: [0, 0] };
      case "headphone_get": return { enabled: false, profile: null, curveHz: [], curveDb: [] };
      case "parametric_get": return { settings: { enabled: true, bands: [], design: "matched" },
        comparing: false, curveHz: [], curveDb: [], bandCurvesDb: [], boostDb: 0, loudnessDb: 0,
        maxBands: 20, maxGainDb: 24, minQ: 0.1, maxQ: 30 };
      case "crossfeed_get": return { settings: { enabled: false, cutoffHz: 700, levelDb: 6 }, presets: [],
        delayUs: 227, curveHz: [], nearDb: [], farDb: [] };
      case "visual_safe_get": return ${safe};
      // MilkDrop: tek görsellik klasör ve programın özgün deneme preseti.
      case "milkdrop_list": return { folder: "C:/MilkDrop", truncated: false, error: null,
        presets: [{ name: ${JSON.stringify(MILKDROP_PRESETS[milk].name)},
          path: "C:/MilkDrop/lyraska-${milk}.milk" }] };
      case "milkdrop_load": return { name: ${JSON.stringify(MILKDROP_PRESETS[milk].name)},
        simplified: false, shaderError: null,
        preset: ${JSON.stringify(MILKDROP_PRESETS[milk].preset)} };
      case "audio_delay_get": return 0;
      // Tek bölümlük harita: arayüzün vurgu rengi (VU ve spektrum sahnelerinin halesi) de temada.
      case "song_map": return { meter: 4, downbeatPhase: 0, grouping: [], meterConfidence: 1, downbeats: [],
        drops: [], dropConfidence: [],
        energy: [], sections: [{ start: 0, end: 240, energy: 0.8, label: ${theme} }] };
      case "annotation_get": case "song_key": case "track_lyrics": case "song_map_imported": return null;
      // "Kendi resmin": resim seçilmemiş (koyu zemin, vurgu yeşili çizgi: en yüksek karşıtlık).
      case "background_image_get": return null;
      // Şarkıya seçilmiş kapak yok (çalan şarkının kapağı şarkının kendisinden).
      case "song_cover_get": return null;
      // Çalma listeleri: denetimde liste yok (kütüphane panelindeki "Listeye ekle" menüsü boş).
      case "playlists_list": return [];
      // Ham dalga biçimi (karışım, sol, sağ; 128 = sessizlik): 441 Hz sinüs, LEVEL verilirse o genlikte.
      case "visual_waveform": {
        const bytes = new Uint8Array(3 * 1024);
        for (let i = 0; i < 1024; i++) {
          const v = Math.floor(128 * (1 + (LEVEL ?? 0.5) * Math.sin(2 * Math.PI * 441 * (t + i / 44100))));
          bytes[i] = bytes[1024 + i] = bytes[2048 + i] = Math.max(0, Math.min(255, v));
        }
        return bytes.buffer;
      }
      case "visual_frame": return {
        positionSecs: 60 + t,
        bands: Array.from({ length: 32 }, (_, i) =>
          LEVEL ?? Math.max(0, 0.85 - i * 0.015 + 0.12 * Math.sin(i + t * 4))),
        rmsDb: LEVEL === null ? [-12, -12] : LEVEL ? [0, 0] : [-60, -60],
        peakDb: LEVEL === null ? [-3, -3] : LEVEL ? [0, 0] : [-60, -60],
        vuReferenceDb: -14, energy: 0.8, section: 1,
        beat: { bpm: 128, index: Math.floor(beats), phase: beats % 1, barBeat: 1 + (Math.floor(beats) % 4), meter: 4 },
        director: {
          atmosphere: { section: 1, theme: ${theme}, mood: 0.9, warmth: 0.6 },
          rhythm: { pulse: 0.5, accent: 0.2, beatPhase: beats % 1, barPhase: (beats / 4) % 1,
            anticipation: 0, release: 0.4, barsConfident: true },
          texture: { detail: 0.6, motion: 0.6 },
        },
      };
      default: return status;
    }
  }};
`;

/**
 * Sayfa açılmadan çalışan betik: sahne ve gök manzarası seçili, sahte çekirdek kurulu.
 * `sceneLook`: galeri sahnesinin görünümü (`{ speed, palette }`, src/lib/sceneLook.ts).
 */
const initScript = (
  sceneId,
  { look = null, sceneLook = null, level = null, theme = 1, safe = false, milk = "parlama" } = {},
) =>
  `try { localStorage.setItem("lyraska.scene", "${sceneId}");` +
  (look ? ` localStorage.setItem("lyraska.skyLook", "${look}");` : "") +
  (sceneLook
    ? ` localStorage.setItem("lyraska.sceneLooks", ${JSON.stringify(
        JSON.stringify({ version: 1, looks: { [sceneId]: sceneLook } }),
      )});`
    : "") +
  ` } catch {}\n${fakeCore(level, theme, safe, milk)}`;

/** Tuvalin görüntüsünü çözüp parlaklık ölçer (bağıl parlaklık, 0..1). */
function measure(png) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const lin = (v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      const W = c.width;
      const H = c.height;
      const lum = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) {
        lum[i] = 0.2126 * lin(d[i * 4]) + 0.7152 * lin(d[i * 4 + 1]) + 0.0722 * lin(d[i * 4 + 2]);
      }
      const region = (x0, y0, x1, y1) => {
        let sum = 0;
        let max = 0;
        let n = 0;
        for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y++) {
          for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x++) {
            const l = lum[y * W + x];
            sum += l;
            max = Math.max(max, l);
            n++;
          }
        }
        return { mean: n ? sum / n : 0, max };
      };
      let sum = 0;
      let sq = 0;
      for (const l of lum) {
        sum += l;
        sq += l * l;
      }
      const mean = sum / lum.length;
      resolve({
        width: W,
        height: H,
        mean,
        spread: Math.sqrt(Math.max(0, sq / lum.length - mean * mean)),
        // Ekranın üstü sağ çeyreği (Lyra) ve ortası (kuzey ışıkları / ufuk).
        topRight: region(0.7, 0, 1, 0.45),
        middle: region(0.1, 0.25, 0.9, 0.6),
        pixels: Array.from(lum.filter((_, i) => i % 97 === 0)),
      });
    };
    img.src = "data:image/png;base64," + png;
  });
}

/**
 * Sahnenin üstündeki cam katmanlar (başlık, düğmeler, çekmece) ölçüme girmesin: yalnızca
 * sahne ölçülür. Beyaz düğmeler Lyra'nın parlaklığı sanılmaz; katmanların karartması da
 * parlama ölçümünü yumuşatmaz.
 */
async function hideChrome(page) {
  // Satır içi <style> programın CSP'sine takılır (style-src 'self'); CSSOM ile kurulan stil sayfası
  // CSP'nin dışındadır ve sayfanın kendi stillerine dokunmaz.
  await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      ".chrome, .drawer, .stage__shade, .drop-notice { visibility: hidden !important; }",
    );
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
}

/**
 * Ekran kartsız CI makinesinde (Windows, "Microsoft Basic Render Driver") tam pencere sahne
 * yazılımsal çizilir: tek bir ekran görüntüsü 10–60 sn sürebiliyor. İşlemlerin süresi buna
 * göre uzun tutulur; denetlenen şey hız değil, çizimin doğruluğudur.
 */
const SLOW = 180_000;

/**
 * Sahneler pencere düzeni aynı kalarak yarı çözünürlükte çizilir (cihaz piksel oranı 0,5):
 * dört kat az piksel, yazılımsal çizimde dört kat hızlı. Gölgelendiriciler aynı derlenir;
 * parlama penceresi de aynı oranda küçülür (ekranın aynı payı), ölçümün anlamı değişmez.
 */
const SCALE = 0.5;

/**
 * Sahnelerin sanal zamanı: ekran kareleri gerçek zamanda döner (ekran görüntüleri bekletmez),
 * ama sahnelere verilen zaman damgası sanaldır. Her kare en fazla `STEP_MS` ilerler ve yalnızca
 * denetimin izin verdiği kadar kare ilerler; sonra sahne aynı anda durur. Böylece her sayfa,
 * makinenin hızından bağımsız olarak tam aynı sanal süreyi yaşar. Gerçek zamanla, ekran kartsız
 * makinede iki sayfa farklı sayıda kare çiziyor, perdeler farklı yerde yakalanıyordu: parlama
 * ölçümü müziğin etkisi yerine iki ayrı anı karşılaştırıyordu.
 */
const STEP_MS = 250;
/**
 * Sanal zaman (`stepMs` adımla). Yeni her sanal karenin başında, kare çizilmeden önce,
 * `window.__frameProbe` varsa çağrılır: bir önceki karenin bitmiş görüntüsünü okur (zamana bağlı
 * parlama ölçümü).
 */
const virtualTime = (stepMs) => `
  (() => {
    const realFrame = window.requestAnimationFrame.bind(window);
    const time = { allowed: 0, done: 0, now: 0, lastFrame: -1 };
    window.__sceneTime = time;
    window.requestAnimationFrame = (callback) =>
      realFrame((frame) => {
        if (frame !== time.lastFrame) {
          time.lastFrame = frame;
          if (time.done < time.allowed) {
            time.done += 1;
            time.now += ${stepMs};
            // Ölçüm hatası sahnenin döngüsünü durdurmasın: hata saklanır, denetim bildirir.
            try {
              if (window.__frameProbe) window.__frameProbe();
            } catch (error) {
              window.__frameProbe = null;
              window.__probeError = String(error);
            }
          }
        }
        callback(time.now);
      });
  })();
`;

/** Sahneyi `ms` kadar (sanal) ilerletir ve sahnenin o kareleri işlemesini bekler. */
async function advance(page, ms, stepMs = STEP_MS) {
  await page.evaluate(
    (frames) => {
      window.__sceneTime.allowed += frames;
    },
    Math.round(ms / stepMs),
  );
  await page.waitForFunction(() => window.__sceneTime.done >= window.__sceneTime.allowed, null, {
    polling: 50,
  });
  // Son karenin de çizilip ekrana gelmesi için bir kare daha (sanal saat ilerlemez).
  await page.waitForTimeout(50);
}

/**
 * Sahne denetimi için yeni sayfa: sanal zamanlı; bütün işlemler yavaş çizime göre beklenir.
 * Program sayfası programın gerçek CSP'siyle gelir (Tauri penceresindeki gibi).
 */
async function openPage(
  browser,
  { stepMs = STEP_MS, viewport = { width: 1280, height: 860 }, scale = SCALE } = {},
) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  page.setDefaultTimeout(SLOW);
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": APP_CSP },
    });
  });
  await page.addInitScript(virtualTime(stepMs));
  return page;
}

/** Programı açar ve çalmaya başlatır; sahne `ms` kadar (sanal) ilerler. */
async function startPlaying(page, ms, stepMs = STEP_MS) {
  await page.goto(APP_URL);
  await advance(page, stepMs, stepMs);
  await page.mouse.click(5, 5);
  await page.keyboard.press("Space"); // çal
  await page.waitForTimeout(100);
  await advance(page, ms, stepMs);
}

/**
 * Arayüz çöktüyse (ör. sahte çekirdeğin verisinde yeni bir alan eksik) sahne hiç çizilmez:
 * zaman aşımını beklemeden nedeni bildirilir.
 */
async function renderProblem(page, locator, errors) {
  if ((await locator.count()) > 0) return null;
  return `sahne çizilmedi${errors.length > 0 ? ` (${errors.join("; ")})` : ""}`;
}

/**
 * Öğenin ekran görüntüsü (base64 PNG). Playwright'ın öğe görüntüsü öğenin "durgun"
 * olmasını bekler; yazılımsal çizimde bu bekleme bitmeyebiliyor. Konum bir kez okunur,
 * o alan çekilir.
 */
async function capture(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("öğe görünmüyor");
  const shot = await page.screenshot({ clip: box, animations: "allow" });
  return shot.toString("base64");
}

/**
 * İki görüntü arasındaki en büyük ortalama parlaklık farkı, WCAG'nin parlama alanı
 * büyüklüğündeki (1024×768 ekranda 341×256 piksel; görüntünün ölçeğiyle) en kötü pencerede.
 */
async function worstWindowDifference([before, after, scale]) {
  const load = async (data) => {
    const img = new Image();
    img.src = "data:image/png;base64," + data;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, c.width, c.height);
  };
  const a = await load(before);
  const b = await load(after);
  const lin = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
  const W = a.width;
  const H = a.height;
  const sum = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      sum[(y + 1) * (W + 1) + x + 1] =
        lum(b.data, i) -
        lum(a.data, i) +
        sum[y * (W + 1) + x + 1] +
        sum[(y + 1) * (W + 1) + x] -
        sum[y * (W + 1) + x];
    }
  }
  const bw = Math.min(Math.round(341 * scale), W);
  const bh = Math.min(Math.round(256 * scale), H);
  let worst = 0;
  for (let y = 0; y + bh <= H; y += 4) {
    for (let x = 0; x + bw <= W; x += 4) {
      const s =
        sum[(y + bh) * (W + 1) + x + bw] -
        sum[y * (W + 1) + x + bw] -
        sum[(y + bh) * (W + 1) + x] +
        sum[y * (W + 1) + x];
      worst = Math.max(worst, Math.abs(s) / (bw * bh));
    }
  }
  return worst;
}

/** WCAG 2.3.1: bağıl parlaklıkta %10'dan küçük değişim parlama sayılmaz. */
const FLASH_DELTA = 0.1;

/**
 * Parlama sınırı: sahne müziğin en sessiz hâlinden en yüksek hâline geçerken bile
 * ekrandaki parlaklık farkı parlama eşiğinin altındaysa, hangi ritimde olursa olsun
 * parlama üretemez. (Gece göğü ve otoyolda ayrıca değişim hızı da sınırlıdır.)
 */
async function checkFlashBound(browser, scene, variant, theme) {
  const name = theme === null ? variant.label : `${variant.label} (tema ${theme})`;
  const shots = [];
  for (const level of [0, 1]) {
    const page = await openPage(browser);
    const errors = [];
    page.on("pageerror", (e) => errors.push(`sayfa hatası: ${e}`));
    await page.addInitScript(
      initScript(scene.id, {
        look: variant.look,
        sceneLook: variant.sceneLook,
        level,
        theme: theme ?? 1,
      }),
    );
    // Hız sınırlı değerler yerine otursun: enerjiler ~1,2 sn'de, renk teması 2 sn'de.
    await startPlaying(page, 2500);
    await hideChrome(page);
    const stage = page.locator(".stage");
    const problem = await renderProblem(page, stage, errors);
    if (problem) {
      await page.close();
      return [`${name}: ${problem}`];
    }
    shots.push(await capture(page, stage));
    await page.close();
  }
  const page = await browser.newPage();
  const worst = await page.evaluate(worstWindowDifference, [...shots, SCALE]);
  await page.close();
  console.log(`${name}: sessiz → tam ses en büyük parlaklık farkı ${worst.toFixed(4)}`);
  return worst < FLASH_DELTA
    ? []
    : [`${name}: parlaklık farkı ${worst.toFixed(3)} ≥ ${FLASH_DELTA} (parlama riski)`];
}

/** Gece göğünün manzaraları (`SKY_LOOKS`, src/lib/sky.ts); ilki varsayılan. */
const SKY_LOOKS = [
  { id: "lake", name: "Göl" },
  { id: "corona", name: "Korona" },
  { id: "snow", name: "Karlı vadi" },
];

const SCENES = [
  {
    id: "sky",
    name: "Gece göğü",
    looks: SKY_LOOKS,
    // Lyra'nın yıldızları: sağ üstte parlak noktalar (Vega en parlak).
    extra: (m) =>
      m.topRight.max > 0.35
        ? null
        : `Lyra yıldızları görünmüyor (en parlak ${m.topRight.max.toFixed(3)})`,
    themed: true,
  },
  { id: "highway", name: "Gece otoyolu", extra: () => null, themed: true },
  // Ön camdan aynı yol; torpidonun ışığı ve teyp de temada.
  { id: "drive", name: "Gece sürüşü", extra: () => null, themed: true },
  // Galerinin gölgelendirici sahneleri (src/lib/shaderScene.ts). Renkleri gece göğünün temaları;
  // parlama sınırı en parlak iki temada ölçülür (denetim süresi). Renk alanı geniş iki sahne
  // ayrıca en parlak sabit palette ve en yüksek hızda (hazır ayarlar, src/lib/sceneLook.ts).
  ...[
    ["sea", "Gece denizi"],
    ["nebula", "Bulutsu", true],
    ["tunnel", "Işık tüneli"],
    ["fireflies", "Ateşböcekleri"],
    ["kaleido", "Kaleydoskop", true],
    ["ribbons", "İpek şeritler"],
    ["galaxy", "Sarmal gökada"],
    ["dunes", "Kum tepeleri"],
    ["rain", "Yağmurlu cam"],
    ["crystal", "Kristal ağ"],
  ].map(([id, name, palette = false]) => ({
    id,
    name,
    extra: () => null,
    themed: true,
    brightOnly: true,
    palette,
  })),
  // Kullanıcının .milk görselleri (burada programın özgün deneme preseti). Parlaklığı müzikten
  // değil presetten gelir: sessiz/tam ses sınırı yerine zamana bağlı ölçülür
  // (`checkMilkdropFlashes`). Fren siyahtan saniyede 0,3 açılır: görüntü belirsin diye uzun
  // ısınma. Görsel açılmış ve fren kurulmuş olmalı.
  {
    id: "milkdrop",
    name: "MilkDrop",
    extra: () => null,
    warmup: 6000,
    timeBased: true,
    // Gölgelendiricisiz deneme ve çevrilen HLSL gölgelendiricili deneme (WebGL, hareket).
    milks: [null, "golge"],
    requires: (state) =>
      !state.preset
        ? "MilkDrop görseli açılmadı"
        : !state.guard
          ? "parlaklık freni kurulmadı"
          : null,
  },
];

/** Galeri sahnelerinin sabit paletlerinin adları (`SCENE_PALETTES`, src/lib/sceneLook.ts). */
const PALETTE_NAMES = { ice: "Buz", ember: "Kor", forest: "Orman", rose: "Gül" };

/** Alt rengi (`--scene-palette-<id>-low`) en parlak sabit palet, src/styles/global.css'ten. */
function brightestPalette() {
  const css = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
  const found = [...css.matchAll(/--scene-palette-(\w+)-low:\s*#([0-9a-f]{6})/gi)].map(
    ([, id, hex]) => ({ id, luminance: hexLuminance(hex) }),
  );
  if (found.length === 0) throw new Error("--scene-palette-*-low okunamadı");
  return found.sort((a, b) => b.luminance - a.luminance)[0].id;
}

function hexLuminance(hex) {
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Bölüm renk temaları (`SKY_THEMES`, src/lib/sky.ts). Temaya göre renklenen sahnelerin parlama
 * sınırı her temada ölçülür: renklerin parlaklığı temadan temaya %25'e kadar değişiyor.
 */
const THEMES = [0, 1, 2, 3];

/**
 * Perde rengi (`--sky-theme-N-low`) en parlak olan temalar, src/styles/global.css'ten. Varsayılan
 * manzara her temada, diğerleri yalnızca bunlarda ölçülür (denetim süresi).
 */
function brightestThemes(count) {
  const css = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
  const luminance = (theme) => {
    const hex = css.match(new RegExp(`--sky-theme-${theme}-low:\\s*#([0-9a-f]{6})`, "i"))?.[1];
    if (!hex) throw new Error(`--sky-theme-${theme}-low okunamadı`);
    return hexLuminance(hex);
  };
  return [...THEMES].sort((a, b) => luminance(b) - luminance(a)).slice(0, count);
}

/**
 * Sahnenin denetlenen biçimleri: gece göğünde her manzara, diğerlerinde tek; `palette` işaretli
 * galeri sahnelerinde ayrıca en parlak sabit palet ve en yüksek hız (temadan bağımsız).
 */
function variants(scene) {
  if (scene.milks) {
    return scene.milks.map((milk) => ({
      label: milk ? `${scene.name} · ${MILKDROP_PRESETS[milk].name}` : scene.name,
      look: null,
      milk: milk ?? undefined,
    }));
  }
  if (scene.looks) {
    return scene.looks.map((look) => ({ label: `${scene.name} · ${look.name}`, look: look.id }));
  }
  const plain = [{ label: scene.name, look: null }];
  if (!scene.palette) return plain;
  const palette = brightestPalette();
  return [
    ...plain,
    {
      label: `${scene.name} · ${PALETTE_NAMES[palette] ?? palette} paleti, 2×`,
      look: null,
      sceneLook: { speed: 2, palette },
      fixedPalette: true,
    },
  ];
}

/** Parlama sınırı ölçülen sahneler (hepsi). */
const ALL_SCENES = [
  // Halesi bölüm temasının renginde (`--aurora`).
  { id: "spectrum", name: "Nokta matris spektrum", themed: true },
  { id: "vu", name: "VU ibreleri", themed: true },
  // Kullanıcının resmi ve ortada ışık çizgisi (2D tuval): çubukların boyu parlama sınırından
  // hesaplanır (src/lib/photoScene.ts); resim yokken koyu zeminde en parlak çizgiyle ölçülür.
  { id: "photo", name: "Kendi resmin" },
  ...SCENES.filter((s) => !s.timeBased),
];

/** Yalnızca bazı sahneleri denetlemek için (geliştirirken): `SCENE_ONLY=sea,nebula`. */
const ONLY = process.env.SCENE_ONLY?.split(",").filter(Boolean) ?? null;
const selected = (scene) => !ONLY || ONLY.includes(scene.id);

async function checkScene(browser, scene, variant) {
  const page = await openPage(browser);
  const problems = [];
  page.on("console", (m) => {
    // Yedek çizim denetiminde WebGL'in açılamadığı bildirimi beklenen bir şeydir.
    const expected = EXPECT_FALLBACK && m.text().includes("ekran kartında çizilemedi");
    if (m.type() === "error" && !expected) problems.push(`konsol: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`sayfa hatası: ${e}`));
  await page.addInitScript(
    initScript(scene.id, { look: variant.look, sceneLook: variant.sceneLook, milk: variant.milk }),
  );
  await startPlaying(page, scene.warmup ?? 1500);
  await hideChrome(page);

  const canvas = page.locator("canvas:not([hidden])").first();
  const problem = await renderProblem(page, canvas, problems);
  if (problem) {
    await page.close();
    return [`${variant.label}: ${problem}`];
  }
  const state = await canvas.evaluate((c) => ({
    webgl: c.dataset.webgl,
    fallback: c.dataset.fallback ?? null,
    error: c.dataset.webglError ?? null,
    gpu: c.dataset.gpu ?? null,
    preset: c.dataset.preset ?? null,
    guard: c.dataset.guard ?? null,
  }));
  const first = await page.evaluate(measure, await capture(page, canvas));
  await advance(page, 750);
  const second = await page.evaluate(measure, await capture(page, canvas));
  // Hareket: örneklenen noktaların ne kadarı belirgin biçimde değişti (şerit çizgileri,
  // ışık perdeleri; gökyüzünün büyük kısmı durgundur).
  let moved = 0;
  for (let i = 0; i < first.pixels.length; i++) {
    if (Math.abs(first.pixels[i] - second.pixels[i]) > 0.005) moved++;
  }
  const change = moved / first.pixels.length;

  if (EXPECT_FALLBACK) {
    if (state.fallback !== "2d") problems.push("2D yedek çizim devreye girmedi");
  } else if (state.webgl !== "on") {
    problems.push(`WebGL2 çizimi açılmadı: ${state.error ?? "neden bilinmiyor"}`);
  }
  if (first.spread < 0.01) problems.push(`görüntü düz/boş (sapma ${first.spread.toFixed(4)})`);
  if (change < 0.003) {
    problems.push(`görüntü hareket etmiyor (değişen nokta %${(change * 100).toFixed(2)})`);
  }
  const extra = scene.extra(first);
  if (extra) problems.push(extra);
  const missing = scene.requires?.(state);
  if (missing) problems.push(missing);

  console.log(
    `${variant.label}: WebGL ${state.webgl}${state.fallback ? ` (yedek: ${state.fallback})` : ""} · ekran kartı: ${state.gpu ?? "-"} · ${first.width}×${first.height} · ` +
      `ortalama ${first.mean.toFixed(4)} · sapma ${first.spread.toFixed(4)} · ` +
      `sağ üst en parlak ${first.topRight.max.toFixed(3)} · orta ${first.middle.mean.toFixed(4)} · ` +
      `değişen nokta %${(change * 100).toFixed(1)}`,
  );
  await page.close();
  return problems.map((p) => `${variant.label}: ${p}`);
}

/**
 * Parlaklık freninin denetim paketi: `src/lib/flashGuardCheck.ts` (parlayan desen ve ölçüm)
 * ayrı derlenir, programın paketine (`dist/`) girmez. Sayfada `LyraskaFlashGuardCheck` olarak
 * açılır.
 */
async function flashGuardBundle() {
  const result = await build({
    logLevel: "warn",
    build: {
      write: false,
      emptyOutDir: false,
      copyPublicDir: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL("../src/lib/flashGuardCheck.ts", import.meta.url)),
        formats: ["iife"],
        name: "LyraskaFlashGuardCheck",
        fileName: () => "flash-guard-check.js",
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunk = outputs.flatMap((o) => o.output ?? []).find((c) => c.type === "chunk");
  if (!chunk) throw new Error("parlaklık freni denetim paketi derlenemedi");
  return chunk.code;
}

/**
 * Zamana bağlı parlama ölçümü: bilerek parlayan desen (saniyede 10 ve 1 kez siyah ↔ beyaz, tam
 * ekran ve tek bölge) frenden geçirilir; her karede ekran okunur, en kötü WCAG penceresinin
 * parlaklık dizisi `countFlashes` ile sayılır. Frenli her durum saniyede ≤ 3 (güvenli modda ≤ 1)
 * parlamalı; frensiz denetim parlamayı görmeli (ölçümün çalıştığının kanıtı). İnce desen (1
 * piksellik şerit ve dama, blok ortalaması sabit) piksel başına `countChanges` ile sayılır: en
 * kötü blokta saniyede ≤ 3 (güvenli modda ≤ 1,05) tersine dönme; frensiz denetim görmeli.
 */
async function checkFlashGuard(browser, code) {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  page.setDefaultTimeout(SLOW);
  const problems = [];
  page.on("pageerror", (e) => problems.push(`parlaklık freni: sayfa hatası: ${e}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`parlaklık freni: konsol: ${m.text()}`);
  });
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ content: code });
  const started = Date.now();
  const results = await page.evaluate(() => window.LyraskaFlashGuardCheck.runFlashGuardCheck());
  const cases = await page.evaluate(() => window.LyraskaFlashGuardCheck.FLASH_CHECK_CASES);
  await page.close();
  for (const r of results) {
    const c = cases.find((x) => x.id === r.id);
    const name = `Parlaklık freni · ${r.label}`;
    if (r.error) {
      problems.push(`${name}: ${r.error}`);
      continue;
    }
    console.log(
      `${name}: saniyede ${r.flashesPerSecond.toFixed(2)} parlama · ` +
        `${r.reversalsPerSecond.toFixed(2)} desen dönüşü · karede en büyük değişim ` +
        `${r.maxStep.toFixed(4)} · ${r.storage ? `saklama ${r.storage} · ` : ""}` +
        `kare ${r.frameMs.toFixed(1)} ms`,
    );
    if (c.maxPerSecond !== undefined && r.flashesPerSecond > c.maxPerSecond) {
      problems.push(
        `${name}: saniyede ${r.flashesPerSecond.toFixed(2)} parlama > ${c.maxPerSecond}`,
      );
    }
    if (c.minPerSecond !== undefined && r.flashesPerSecond < c.minPerSecond) {
      problems.push(
        `${name}: frensiz desen parlama olarak ölçülmedi (${r.flashesPerSecond.toFixed(2)} < ` +
          `${c.minPerSecond}): ölçüm çalışmıyor`,
      );
    }
    if (c.maxReversals !== undefined && r.reversalsPerSecond > c.maxReversals) {
      problems.push(
        `${name}: saniyede ${r.reversalsPerSecond.toFixed(2)} desen dönüşü > ${c.maxReversals}`,
      );
    }
    if (c.minReversals !== undefined && r.reversalsPerSecond < c.minReversals) {
      problems.push(
        `${name}: frensiz desen dönüşü ölçülmedi (${r.reversalsPerSecond.toFixed(2)} < ` +
          `${c.minReversals}): ölçüm çalışmıyor`,
      );
    }
  }
  console.log(`Parlaklık freni denetimi ${((Date.now() - started) / 1000).toFixed(1)} sn sürdü.`);
  return problems;
}

/**
 * Sayfa açılmadan: WebGL2 bağlamları `preserveDrawingBuffer` ile açılır (görüntü kare bittikten
 * sonra da okunabilsin) ve OffscreenCanvas'ta açılan (Butterchurn'ün görünmeyen tuvali) bağlam
 * `window.__offscreenGl` olarak saklanır. Yalnızca denetimde; program bunu yapmaz.
 */
const PRESERVE_DRAWING_BUFFER = `
  (() => {
    const patch = (proto, record) => {
      const original = proto.getContext;
      proto.getContext = function (type, attributes) {
        if (type !== "webgl2") return original.call(this, type, attributes);
        const gl = original.call(this, type, { ...(attributes ?? {}), preserveDrawingBuffer: true });
        if (record && gl) window.__offscreenGl = gl;
        return gl;
      };
    };
    patch(HTMLCanvasElement.prototype, false);
    if (window.OffscreenCanvas) patch(OffscreenCanvas.prototype, true);
  })();
`;

/** MilkDrop'un kare kare ölçümü: süre (sn) ve pencere (küçük: yazılımsal çizimde de hızlı). */
const MILKDROP_SECONDS = { normal: 4, safe: 3 };
const MILKDROP_VIEWPORT = { width: 384, height: 216 };

/**
 * Gerçek MilkDrop sahnesinde zamana bağlı parlama ölçümü (60 kare/sn sanal zaman): her karede
 * görünen tuval (frenli) ve Butterchurn'ün görünmeyen tuvali (frensiz) okunur, en kötü WCAG
 * penceresinin parlamaları sayılır. Frenli saniyede ≤ 3 (güvenli modda ≤ 1) olmalı; frensiz
 * denetim deneme presetinin gerçekten parladığını göstermeli (ölçümün çalıştığının kanıtı).
 * Ayrıca sayfanın CSP'sinin `eval`'i gerçekten engellediği denetlenir: Butterchurn bu koşulda
 * çalışıyorsa JavaScript (`new Function`) yolunu kullanmıyordur.
 */
async function checkMilkdropFlashes(browser, bundle, safe, milk = "parlama") {
  const label =
    `MilkDrop · zamana bağlı parlama${safe ? " (güvenli mod)" : ""}` +
    (milk === "parlama" ? "" : ` · ${MILKDROP_PRESETS[milk].name}`);
  const seconds = safe ? MILKDROP_SECONDS.safe : MILKDROP_SECONDS.normal;
  const step = 1000 / 60;
  const page = await openPage(browser, { stepMs: step, viewport: MILKDROP_VIEWPORT, scale: 1 });
  const problems = [];
  // CSP denetiminin bilerek engellettiği dizgi `setTimeout`'unun konsol hatası beklenir.
  let expectEvalRefusal = false;
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (expectEvalRefusal && /unsafe-eval/.test(m.text())) return;
    problems.push(`${label}: konsol: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`${label}: sayfa hatası: ${e}`));
  await page.addInitScript(PRESERVE_DRAWING_BUFFER);
  // Başlangıç betikleri bir işlevin içinde çalışır: paketin `var`'ı pencereye ayrıca konur.
  await page.addInitScript(`${bundle}\n;window.LyraskaFlashGuardCheck = LyraskaFlashGuardCheck;`);
  await page.addInitScript(initScript("milkdrop", { safe, milk }));
  const started = Date.now();
  // Görsel açılsın, fren siyahtan biraz açılsın.
  await startPlaying(page, 2000, step);
  const canvas = page.locator(".milkdrop-scene__canvas");
  const problem = await renderProblem(page, canvas, problems);
  if (problem) {
    await page.close();
    return [`${label}: ${problem}`];
  }
  const state = await canvas.evaluate((c) => ({
    webgl: c.dataset.webgl ?? null,
    preset: c.dataset.preset ?? null,
    guard: c.dataset.guard ?? null,
    shaders: c.dataset.shaders ?? null,
    error: c.dataset.webglError ?? null,
  }));
  // Gölgelendiricili görselde çeviri ekran kartında derlenmiş olmalı (varsayılana dönülmemiş).
  if (milk === "golge" && state.shaders !== "ok") {
    problems.push(
      `${label}: çevrilen gölgelendirici derlenmedi (${state.shaders ?? "bilinmiyor"})`,
    );
  }
  // CSP gerçekten uygulanıyor mu: sayfanın kendi kodundaki dizgi değerlendirmesi engellenmeli.
  // (`page.evaluate`'in kendisi CSP'den muaf olduğu için dizgi bir zamanlayıcıyla, sayfanın
  // kendi görevinde değerlendirilir.) Butterchurn bu sayfada açıldıysa `new Function`'a gerek
  // duymamıştır; engellenen her deneme konsola hata yazardı.
  expectEvalRefusal = true;
  await page.evaluate(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      window.__cspViolations.push(e.violatedDirective),
    );
    setTimeout("window.__evalRan = true", 0);
  });
  await page.waitForTimeout(300);
  const csp = await page.evaluate(() => ({
    ran: window.__evalRan === true,
    violations: window.__cspViolations,
  }));
  expectEvalRefusal = false;
  if (csp.ran || !csp.violations.some((d) => d.startsWith("script-src"))) {
    problems.push(`${label}: sayfada eval engellenmiyor (CSP uygulanmadı)`);
  }
  if (state.webgl !== "on" || !state.preset || !state.guard) {
    problems.push(
      `${label}: sahne çizilmiyor (WebGL ${state.webgl}, görsel ${state.preset ?? "yok"}, fren ` +
        `${state.guard ?? "yok"}${state.error ? `, ${state.error}` : ""})`,
    );
    await page.close();
    return problems;
  }
  await page.evaluate(() => {
    const visible = document.querySelector(".milkdrop-scene__canvas").getContext("webgl2");
    const internal = window.__offscreenGl ?? null;
    const frames = { guarded: [], raw: [] };
    window.__flashFrames = frames;
    window.__frameProbe = () => {
      frames.guarded.push(window.LyraskaFlashGuardCheck.screenWindows(visible));
      if (internal) frames.raw.push(window.LyraskaFlashGuardCheck.screenWindows(internal));
    };
  });
  await advance(page, seconds * 1000, step);
  const result = await page.evaluate((s) => {
    window.__frameProbe = null;
    const { guarded, raw } = window.__flashFrames;
    const check = window.LyraskaFlashGuardCheck;
    return {
      error: window.__probeError ?? null,
      frames: guarded.length,
      guarded: check.flashRate(guarded, s),
      raw: raw.length === guarded.length ? check.flashRate(raw, s) : null,
    };
  }, seconds);
  await page.close();
  const limit = safe ? 1 : 3;
  console.log(
    `${label}: frenli saniyede ${result.guarded.flashesPerSecond.toFixed(2)} parlama (karede en ` +
      `büyük değişim ${result.guarded.maxStep.toFixed(4)}) · frensiz ` +
      `${result.raw ? result.raw.flashesPerSecond.toFixed(2) : "-"} · ${result.frames} kare · ` +
      `fren ${state.guard} · gölgelendirici ${state.shaders ?? "-"} · eval engelli · ` +
      `${((Date.now() - started) / 1000).toFixed(1)} sn`,
  );
  if (result.error) problems.push(`${label}: ölçüm hatası: ${result.error}`);
  if (result.frames < seconds * 60 * 0.9) {
    problems.push(`${label}: yalnızca ${result.frames} kare ölçüldü`);
  }
  if (result.guarded.flashesPerSecond > limit) {
    problems.push(
      `${label}: saniyede ${result.guarded.flashesPerSecond.toFixed(2)} parlama > ${limit}`,
    );
  }
  if (!result.raw || result.raw.flashesPerSecond < 2) {
    problems.push(
      `${label}: frensiz deneme preseti parlama olarak ölçülmedi ` +
        `(${result.raw ? result.raw.flashesPerSecond.toFixed(2) : "okunamadı"}): ölçüm çalışmıyor`,
    );
  }
  return problems;
}

/** Döngü denemesi: bu kadar kare (60 kare/sn) en çok bu kadar sürede çizilmeli. */
const LOOP_FRAMES = 60;
const LOOP_BUDGET_MS = 60_000;

/**
 * Programı dondurabilecek döngü: deneme presetinin denkleminde `loop(2000000000, …)` var; program
 * onu MilkDrop'un sınırına (1 048 576 tur) kırpar (`milkdrop/eel.rs`). Kırpılmasaydı her kare
 * saniyelerce sürerdi. Gerçek sahnede 60 kare çizilir, süresi ölçülür.
 */
async function checkMilkdropLoop(browser) {
  const label = "MilkDrop · döngü sınırı";
  const step = 1000 / 60;
  const page = await openPage(browser, { stepMs: step, viewport: MILKDROP_VIEWPORT, scale: 1 });
  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`${label}: konsol: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`${label}: sayfa hatası: ${e}`));
  await page.addInitScript(initScript("milkdrop", { milk: "dongu" }));
  await startPlaying(page, 500, step);
  const canvas = page.locator(".milkdrop-scene__canvas");
  const problem = await renderProblem(page, canvas, problems);
  if (problem) {
    await page.close();
    return [`${label}: ${problem}`];
  }
  const preset = await canvas.evaluate((c) => c.dataset.preset ?? null);
  const started = Date.now();
  await advance(page, (LOOP_FRAMES * 1000) / 60, step);
  const ms = Date.now() - started;
  await page.close();
  console.log(
    `${label}: görsel ${preset ?? "yok"} · ${LOOP_FRAMES} kare ${(ms / 1000).toFixed(1)} sn`,
  );
  if (preset !== MILKDROP_PRESETS.dongu.name) problems.push(`${label}: döngülü görsel açılmadı`);
  if (ms > LOOP_BUDGET_MS) {
    problems.push(
      `${label}: ${LOOP_FRAMES} kare ${(ms / 1000).toFixed(1)} sn sürdü (döngü kırpılmadı?)`,
    );
  }
  return problems;
}

const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: "warn" });
const channel = process.env.SCENE_BROWSER_CHANNEL;
const executablePath = channel ? undefined : process.env.SCENE_BROWSER_PATH;
const args = (process.env.SCENE_BROWSER_ARGS ?? "").split(/\s+/).filter(Boolean);
const browser = await chromium.launch({ channel, executablePath, args });
console.log(`Tarayıcı: ${browser.version()} ${args.length ? `(${args.join(" ")})` : ""}`);
let problems = [];
try {
  if (EXPECT_FALLBACK) {
    // Yedek çizim yalnızca gece göğünde var (Lyra orada); manzarası tek.
    const sky = SCENES.find((s) => s.id === "sky");
    problems = await checkScene(browser, sky, variants(sky)[0]);
  } else {
    for (const scene of SCENES.filter(selected)) {
      for (const variant of variants(scene)) {
        problems = problems.concat(await checkScene(browser, scene, variant));
      }
    }
    const bundle =
      !ONLY || ONLY.includes("flash-guard") || ONLY.includes("milkdrop")
        ? await flashGuardBundle()
        : null;
    if (!ONLY || ONLY.includes("flash-guard")) {
      problems = problems.concat(await checkFlashGuard(browser, bundle));
    }
    if (!ONLY || ONLY.includes("milkdrop")) {
      for (const safe of [false, true]) {
        problems = problems.concat(await checkMilkdropFlashes(browser, bundle, safe));
      }
      problems = problems.concat(await checkMilkdropFlashes(browser, bundle, false, "golge"));
      problems = problems.concat(await checkMilkdropLoop(browser));
    }
    const bright = brightestThemes(2);
    for (const scene of ALL_SCENES.filter(selected)) {
      for (const [i, variant] of variants(scene).entries()) {
        const themes =
          !scene.themed || variant.fixedPalette
            ? [null]
            : i === 0 && !scene.brightOnly
              ? THEMES
              : bright;
        for (const theme of themes) {
          problems = problems.concat(await checkFlashBound(browser, scene, variant, theme));
        }
      }
    }
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
if (problems.length > 0) {
  console.error("\nSahne denetimi BAŞARISIZ:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(
  EXPECT_FALLBACK
    ? "\nSahne denetimi tamam: WebGL olmadan da gece göğü ve Lyra görünüyor."
    : "\nSahne denetimi tamam: sahneler ekran kartında çiziliyor.",
);
