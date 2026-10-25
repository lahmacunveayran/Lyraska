/**
 * "Kendi resmin" hareketli arka planı: arka plan parlaklık freninden (kırmızı kanalıyla, işlemci
 * kaynak uygulaması `guardStep`) geçer, çubuklar bütün karelerin zarfıyla ölçülmüş sınırla
 * (`animatedBudgets`) üstüne eklenir. Tarayıcı gibi çizilen birleşik görüntüde en kötü WCAG
 * penceresinin parlaklık ve kırmızı değer eğrileri sayılır: bilerek parlayan bir resimde ve en
 * kötü çubuk ritmiyle (arka planla aynı anda yanıp sönen) saniyede ≤ 3 parlama (güvenli ≤ 1).
 */
import { describe, expect, it } from "vitest";
import { countFlashes, flashWindow, windowMeans } from "./flash";
import {
  blockCounts,
  frameSlew,
  guardGrid,
  guardRates,
  guardStep,
  linearToSrgb,
  pixelBlocks,
  quantizeState,
  redSlew,
  srgbToLinear,
} from "./flashGuardMath";
import {
  FrameEnvelope,
  PHOTO_BARS,
  animatedBudgets,
  presentMotion,
  barColors,
  barGeometry,
  blurredBox,
  coreRects,
  dominantColor,
  glowRects,
  limitExtents,
  measureLine,
  redSplit,
  redValue,
  targetExtents,
  type BarColors,
  type Rgb,
} from "./photoScene";

const W = 256;
const H = 144;
const DT = 1 / 60;

/** Çubukların tuvali (sRGB, 0..1; `photoScene.test.ts`'tekiyle aynı model). */
function renderLayer(extents: number[], colors: BarColors): Float64Array {
  const g = barGeometry(W, H);
  const layer = new Float64Array(W * H * 3);
  const reach = g.glowWidth / 2 + 4 * g.sigma;
  const unit = colors.glow.map((c) => (c / 255) * colors.glowAlpha);
  for (const r of glowRects(extents, g)) {
    const y0 = Math.max(0, Math.floor(r.y - 4 * g.sigma));
    const y1 = Math.min(H, Math.ceil(r.y + r.height + 4 * g.sigma));
    const cx = r.x + r.width / 2;
    for (let y = y0; y < y1; y++) {
      const gy = blurredBox(y + 0.5, r.y, r.y + r.height, g.sigma);
      for (
        let x = Math.max(0, Math.floor(cx - reach));
        x < Math.min(W, Math.ceil(cx + reach));
        x++
      ) {
        const v = gy * blurredBox(x + 0.5, r.x, r.x + r.width, g.sigma);
        for (let k = 0; k < 3; k++) layer[(y * W + x) * 3 + k]! += v * unit[k]!;
      }
    }
  }
  for (let i = 0; i < layer.length; i++) layer[i] = Math.min(1, layer[i]!);
  for (const r of coreRects(extents, g)) {
    for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(H, Math.ceil(r.y + r.height)); y++) {
      const cy = Math.min(y + 1, r.y + r.height) - Math.max(y, r.y);
      for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(W, Math.ceil(r.x + r.width)); x++) {
        const cx = Math.min(x + 1, r.x + r.width) - Math.max(x, r.x);
        const c = Math.max(0, cx) * Math.max(0, cy);
        for (let k = 0; k < 3; k++) {
          const i = (y * W + x) * 3 + k;
          layer[i] = Math.min(1, layer[i]! + (c * colors.core[k]!) / 255);
        }
      }
    }
  }
  return layer;
}

/**
 * Bilerek parlayan hareketli resim (8 bit sRGB kareler, 10 Hz): sol yarı siyah ↔ beyaz, sağda
 * doymuş kırmızı ↔ aynı parlaklıkta gri, altta koyu kırmızı ↔ parlak kırmızı; ortadan bir ışık
 * çubuğu kayar (olağan hareket).
 */
function flashingFrames(count: number): Uint8ClampedArray[] {
  const grey = Math.round(255 * linearToSrgb(0.2126));
  return Array.from({ length: count }, (_, f) => {
    const on = Math.floor(f / 3) % 2 === 0;
    const rgba = new Uint8ClampedArray(W * H * 4);
    const bar = (f * 4) % W;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let c: Rgb;
        if (y > H * 0.8) c = on ? [60, 0, 0] : [255, 0, 0];
        else if (x < W / 2) c = on ? [255, 255, 255] : [0, 0, 0];
        else c = on ? [255, 0, 0] : [grey, grey, grey];
        if (Math.abs(x - bar) < 6 && y < H * 0.3) c = [200, 200, 255];
        rgba.set([...c, 255], (y * W + x) * 4);
      }
    }
    return rgba;
  });
}

/** En kötü pencerenin parlama sayısı (eşik 0,1; kırmızıda 20 → 200'e bölünür). */
function worstFlashes(frames: Float64Array[], scale: number): number {
  const win = flashWindow(W, H);
  const means = frames.map((f) => windowMeans(f, W, H, win, 4));
  let worst = 0;
  for (let w = 0; w < means[0]!.length; w++) {
    worst = Math.max(worst, countFlashes(means.map((m) => m[w]! / scale)));
  }
  return worst;
}

/**
 * Freni ve çubukları birlikte çalıştırır: `guarded` değilse kareler olduğu gibi (denetim).
 * Çubuklar arka planla aynı ritimde dolup boşalır (en kötü durum).
 */
function simulate(safe: boolean, guarded: boolean, seconds: number) {
  const frames = flashingFrames(Math.round(seconds / DT));
  const envelope = new FrameEnvelope(W, H);
  const sample: number[] = [];
  for (const f of frames.slice(0, 12)) {
    envelope.add(f.subarray(envelope.from * W * 4, envelope.to * W * 4));
    for (let i = 0; i < f.length; i += 4 * 97) sample.push(f[i]!, f[i + 1]!, f[i + 2]!, 255);
  }
  const colors = barColors(dominantColor(sample));
  const map = measureLine(envelope.background(), W, H, colors);
  const budgets = animatedBudgets(safe, redSplit(map), W, H);
  const g = barGeometry(W, H);
  const grid = guardGrid(W, H);
  const blocks = pixelBlocks(grid);
  const counts = blockCounts(grid);
  const rates = guardRates(safe, true);
  const linear = (f: Uint8ClampedArray) => {
    const out = new Float64Array(W * H * 3);
    for (let p = 0; p < W * H; p++) {
      for (let k = 0; k < 3; k++) out[p * 3 + k] = srgbToLinear(f[p * 4 + k]! / 255);
    }
    return out;
  };
  // Fren ilk kareyle başlar (`primeSource`).
  let state: Float64Array = linear(frames[0]!).map(quantizeState);
  const luminance: Float64Array[] = [];
  const gated: Float64Array[] = [];
  const continuous: Float64Array[] = [];
  frames.forEach((frame, f) => {
    const input = linear(frame);
    if (guarded) {
      state = guardStep(
        grid,
        blocks,
        counts,
        state,
        input,
        frameSlew(rates.mean, DT),
        frameSlew(rates.pattern, DT),
        true,
        redSlew(rates.red, DT),
      ).output;
    } else {
      state = input;
    }
    const level = Math.floor(f / 3) % 2 === 0 ? 1 : 0;
    const extents = limitExtents(
      map,
      targetExtents(new Array<number>(PHOTO_BARS).fill(level), g, safe),
      budgets,
    );
    const layer = renderLayer(extents, colors);
    const lum = new Float64Array(W * H);
    const rg = new Float64Array(W * H);
    const rc = new Float64Array(W * H);
    for (let p = 0; p < W * H; p++) {
      const c = [0, 1, 2].map((k) =>
        Math.min(
          255,
          Math.round(255 * linearToSrgb(state[p * 3 + k]!)) + Math.round(255 * layer[p * 3 + k]!),
        ),
      ) as Rgb;
      lum[p] =
        0.2126 * srgbToLinear(c[0] / 255) +
        0.7152 * srgbToLinear(c[1] / 255) +
        0.0722 * srgbToLinear(c[2] / 255);
      rg[p] = redValue(c, true);
      rc[p] = redValue(c, false);
    }
    luminance.push(lum);
    gated.push(rg);
    continuous.push(rc);
  });
  return {
    luminance: worstFlashes(luminance, 1) / seconds,
    red: Math.max(worstFlashes(gated, 200), worstFlashes(continuous, 200)) / seconds,
  };
}

describe("kendi resmin sahnesi: hareketli arka plan + çubuklar, parlama yok", () => {
  it("frensiz denetim: resim gerçekten parlıyor (ölçüm görüyor)", { timeout: 120_000 }, () => {
    const r = simulate(false, false, 2);
    expect(r.luminance).toBeGreaterThan(6);
    expect(r.red).toBeGreaterThan(6);
  });

  it.each([
    { safe: false, limit: 3 },
    { safe: true, limit: 1 },
  ])(
    "frenli (güvenli $safe): saniyede ≤ $limit parlama, parlaklık ve kırmızı",
    { timeout: 300_000 },
    ({ safe, limit }) => {
      const r = simulate(safe, true, 2.5);
      expect(r.luminance).toBeLessThanOrEqual(limit);
      expect(r.red).toBeLessThanOrEqual(limit);
    },
  );
});

describe("kendi resmin sahnesi: hareketli arka planın ekrana yüklenmesi", () => {
  const fakeGuard = () => {
    const calls = { prime: 0, process: 0, reused: 0 };
    return {
      calls,
      guard: {
        primeSource: () => {
          calls.prime++;
          return true;
        },
        processSource: (_source: unknown, _dt: number, _target?: null, reuse = false) => {
          calls.process++;
          if (reuse) calls.reused++;
          return true;
        },
      },
    };
  };
  const frame = {} as OffscreenCanvas;

  it("varsayılan modda kare değişmedikçe yeniden yüklenmez (tuval son kareyi gösterir)", () => {
    const { calls, guard } = fakeGuard();
    const state = { primed: false, raw: false };
    for (let tick = 0; tick < 10; tick++) {
      expect(presentMotion(guard, frame, state, tick === 0, false, 1 / 60)).toBe(true);
    }
    expect(calls.prime).toBe(1);
    expect(calls.process).toBe(0);
    expect(presentMotion(guard, frame, state, true, false, 1 / 60)).toBe(true);
    expect(calls.prime).toBe(2);
  });

  it("güvenli modda fren her karede ilerler, doku yalnızca kare değişince yüklenir", () => {
    const { calls, guard } = fakeGuard();
    const state = { primed: false, raw: false };
    for (let tick = 0; tick < 10; tick++) {
      presentMotion(guard, frame, state, tick === 0 || tick === 5, true, 1 / 60);
    }
    // İlk kare frensiz belirir; sonraki 9 karede fren, 8'inde doku aynı.
    expect(calls.prime).toBe(1);
    expect(calls.process).toBe(9);
    expect(calls.reused).toBe(8);
  });

  it("güvenli mod kapanınca sabit karede de frensiz görüntüye bir kez döner", () => {
    const { calls, guard } = fakeGuard();
    const state = { primed: false, raw: false };
    presentMotion(guard, frame, state, true, true, 1 / 60);
    presentMotion(guard, frame, state, false, true, 1 / 60);
    for (let tick = 0; tick < 5; tick++) presentMotion(guard, frame, state, false, false, 1 / 60);
    expect(calls.prime).toBe(2);
    expect(calls.process).toBe(1);
  });
});
