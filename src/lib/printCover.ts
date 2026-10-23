/**
 * Kapağı olmayan albümlere "baskı atölyesi" kapağı: kâğıt, iki mürekkep, yarım ton, üst üste
 * basma ve kayık baskı. Sanat yönü `docs/arastirma/kutuphane-arastirma.md`; proje sahibi onayladı.
 *
 * Kapak albümün adından ve sanatçısından (tohum), tonundan (mürekkepler) ve temposundan (aile)
 * türetilir: aynı albüm her seferinde aynı kapağı alır. Dört aile:
 * - A "sırt": spektrum satırları, bölüm gruplarıyla;
 * - B "bölüm şeritleri": bölümler bant, yarım ton yoğunluğu enerji, drop kayık basılır;
 * - C "vuruş haritası": vuruşlar kutupsal sarmal, açı ölçüdeki yeri;
 * - D "enerji güneşi": enerji eğrisi yarım tonlu bir güneşe yazılır.
 * Kapak durağandır (hareket, parlama yok); tanecik de sabittir.
 */

/** Hızlı, tohumlu sözde rastgele sayı (xorshift32): 0 ≤ r < 1. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** FNV-1a; Türkçe küçük harf ve NFC ile ("İSTANBUL" ile "istanbul" aynı). */
export function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text.toLocaleLowerCase("tr").normalize("NFC")) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Family = "A" | "B" | "C" | "D";

/** Baskının renkleri (CSS değişkenlerinden okunur, bkz. `readPrintColors`). */
export interface PrintColors {
  /** Camelot zinciri: 12 mürekkep; n numaralı ton (n, n+1) çiftini alır. */
  inks: string[];
  papers: { cream: string; bone: string; coal: string; navy: string };
  /** Koyu kartta açık mürekkep. */
  white: string;
  /** Tek vurgu (drop işaretleri). */
  accent: string;
}

export interface Palette {
  paper: string;
  dark: boolean;
  ink1: string;
  ink2: string;
}

/**
 * Tonun paleti: minör koyu kart, majör açık kâğıt; mürekkepler Camelot zincirinde komşu iki
 * renk (uyumlu tonların kapakları da akrabadır). Tonu bilinmeyen albüm tohumundan bir yer alır.
 */
export function palette(key: string | null, seed: number, colors: PrintColors): Palette {
  const match = key ? /^(\d{1,2})([AB])$/.exec(key) : null;
  const n = match ? Number(match[1]) : (seed % 12) + 1;
  const minor = match ? match[2] === "A" : seed % 3 === 0;
  const a = colors.inks[(n - 1) % 12] ?? "#1e1c1b";
  const b = colors.inks[n % 12] ?? "#2b3f78";
  const p = colors.papers;
  return minor
    ? { paper: n % 2 ? p.coal : p.navy, dark: true, ink1: colors.white, ink2: b }
    : { paper: n % 2 ? p.cream : p.bone, dark: false, ink1: a, ink2: b };
}

interface Section {
  label: string;
  start: number;
  end: number;
  energy: number;
}

/** Kapağın çizildiği veri: albümün tohumundan üretilen bir "şarkı haritası". */
export interface CoverData {
  dur: number;
  bpm: number;
  secs: Section[];
  curve: number[];
  beats: { t: number; s: number }[];
  spec: number[][];
  drops: Section[];
  dyn: number;
}

const LONG_PLAN = ["Giriş", "Kıta", "Nakarat", "Drop", "Köprü", "Nakarat", "Drop", "Kapanış"];
const CALM_PLAN = ["Giriş", "Kıta", "Kıta", "Nakarat", "Kıta", "Kapanış"];
const BASE: Record<string, number> = {
  Giriş: 0.25,
  Kıta: 0.5,
  Nakarat: 0.75,
  Drop: 0.95,
  Köprü: 0.4,
  Kapanış: 0.2,
};

/** Tohumdan belirlenimci kapak verisi; tempo bilinmiyorsa tohumdan seçilir. */
export function coverData(seed: number, bpm: number | null): CoverData {
  const r = rng(seed * 131 + 7);
  const energy = 0.45 + r() * 0.5;
  const dyn = r();
  const tonal = r();
  const tempo = bpm && Number.isFinite(bpm) ? bpm : 80 + Math.floor(r() * 80);
  const dur = 180 + r() * 150;
  const plan = dyn > 0.5 ? LONG_PLAN : CALM_PLAN;
  let t = 0;
  const secs: Section[] = [];
  for (const label of plan) {
    const bars = label === "Drop" ? 16 : label === "Giriş" || label === "Kapanış" ? 12 : 24;
    const len = ((bars * 60) / tempo) * (0.7 + r() * 0.6);
    secs.push({ label, start: t, end: t + len, energy: 0 });
    t += len;
  }
  const scale = dur / t;
  for (const s of secs) {
    s.start *= scale;
    s.end *= scale;
    const base = BASE[s.label] ?? 0.5;
    s.energy = clamp(energy * (base * dyn + (1 - dyn) * 0.6) + (r() - 0.5) * 0.1, 0.05, 1);
  }
  const at = (time: number) =>
    secs.find((q) => time >= q.start && time < q.end) ?? secs[secs.length - 1]!;
  const curve: number[] = [];
  for (let i = 0; i < 240; i++) {
    const s = at((i / 240) * dur);
    const prev = curve[curve.length - 1] ?? s.energy;
    curve.push(prev + (s.energy + (r() - 0.5) * 0.08 - prev) * 0.25);
  }
  const beats: { t: number; s: number }[] = [];
  const step = 60 / tempo;
  for (let time = 0, k = 0; time < dur; time += step, k++) {
    const s = at(time);
    beats.push({
      t: time,
      s: Math.max(0.02, s.energy * (0.4 + r() * 0.8) * (k % 4 === 0 ? 1.4 : 1)),
    });
  }
  const peaks = Array.from({ length: 5 }, () => [0.1 + r() * 0.6, 0.02 + r() * 0.05] as const);
  const spec: number[][] = [];
  for (let i = 0; i < 48; i++) {
    const s = at(((i + 0.5) / 48) * dur);
    const row: number[] = [];
    for (let f = 0; f < 128; f++) {
      const x = f / 128;
      let v =
        (1 - x) * 0.35 * s.energy * (1 - tonal) +
        r() * 0.1 * (1 - tonal) +
        r() * 0.06 * s.energy +
        (Math.sin(f * 0.9 + i * 0.3) * 0.5 + 0.5) * 0.05 * s.energy;
      for (const [c, w] of peaks) {
        const shift = s.label === "Drop" ? 0.05 : 0;
        v += tonal * 0.9 * Math.exp(-((x - c - shift) ** 2) / (2 * w * w)) * (0.4 + s.energy * 0.6);
      }
      row.push(Math.min(1, v));
    }
    spec.push(row);
  }
  return {
    dur,
    bpm: tempo,
    secs,
    curve,
    beats,
    spec,
    drops: secs.filter((s) => s.label === "Drop"),
    dyn,
  };
}

/** Aile: hızlı albüm vuruş haritası (C); ötekiler tohumdan, komşu kapaklar çeşitlensin diye. */
export function familyFor(seed: number, bpm: number | null): Family {
  if (bpm !== null && bpm >= 125) return "C";
  return (["A", "B", "D"] as const)[seed % 3]!;
}

/** Kapaktaki katalog numarası: tohumdan dört hane ("0427"). */
export function catalogNumber(seed: number): string {
  return String(seed % 10000).padStart(4, "0");
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function hexRgb(color: string): [number, number, number] {
  const v = Number.parseInt(color.replace("#", "").slice(0, 6), 16);
  return Number.isFinite(v) ? [(v >> 16) & 255, (v >> 8) & 255, v & 255] : [0, 0, 0];
}

/** Değer gürültüsü (yumuşak, 64'lük döşeme). */
function noise2(seed: number): (x: number, y: number) => number {
  const r = rng(seed);
  const g = Array.from({ length: 64 * 64 }, () => r());
  const at = (x: number, y: number) => g[(y & 63) * 64 + (x & 63)] ?? 0;
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

interface Layer {
  canvas: HTMLCanvasElement;
  offset: [number, number];
}

type Ctx = CanvasRenderingContext2D;

function layerCanvas(size: number): [HTMLCanvasElement, Ctx] | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  return ctx ? [canvas, ctx] : null;
}

function paper(ctx: Ctx, W: number, color: string, seed: number, dark: boolean) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, W);
  const img = ctx.getImageData(0, 0, W, W);
  const p = img.data;
  const r = rng(seed);
  const n = noise2(seed + 5);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const fiber = (n(x / 5, y / 5) - 0.5) * 0.035 + (n(x / 90, y / 90) - 0.5) * 0.05;
      const k = 1 + fiber + (r() - 0.5) * (dark ? 0.05 : 0.07);
      p[i] = p[i]! * k;
      p[i + 1] = p[i + 1]! * k;
      p[i + 2] = p[i + 2]! * k;
    }
  }
  ctx.putImageData(img, 0, 0);
}

interface InkOptions {
  color: string;
  angle: number;
  cell: number;
  halftone: boolean;
  seed: number;
  offset: [number, number];
  coverMax?: number;
}

/** Mürekkep katmanı: `mask` (x, y) → kaplama 0–1; yarım tonda açılı AM noktalar. */
function inkLayer(W: number, mask: (x: number, y: number) => number, o: InkOptions): Layer | null {
  const made = layerCanvas(W);
  if (!made) return null;
  const [canvas, ctx] = made;
  const coverMax = o.coverMax ?? 0.93;
  const n = noise2(o.seed);
  const r = rng(o.seed + 3);
  if (!o.halftone) {
    const img = ctx.createImageData(W, W);
    const p = img.data;
    const [R, G, B] = hexRgb(o.color);
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        let v = mask(x, y);
        if (v <= 0) continue;
        v = Math.min(v, coverMax) * (0.9 + 0.1 * n(x / 30, y / 30));
        const i = (y * W + x) * 4;
        p[i] = R;
        p[i + 1] = G;
        p[i + 2] = B;
        p[i + 3] = 255 * Math.min(1, v);
      }
    }
    ctx.putImageData(img, 0, 0);
    return { canvas, offset: o.offset };
  }
  ctx.fillStyle = o.color;
  const a = (o.angle * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const R = W * 1.5;
  for (let u = -R; u < R; u += o.cell) {
    for (let v = -R; v < R; v += o.cell) {
      const x = W / 2 + u * ca - v * sa;
      const y = W / 2 + u * sa + v * ca;
      if (x < -o.cell || y < -o.cell || x > W + o.cell || y > W + o.cell) continue;
      let m = mask(clamp(x, 0, W - 1), clamp(y, 0, W - 1));
      if (m <= 0.01) continue;
      m = Math.min(m, coverMax);
      const rad = Math.sqrt(m) * o.cell * 0.62 * (1 + (n(x / 18, y / 18) - 0.5) * 0.3);
      if (rad < 0.35) continue;
      ctx.beginPath();
      ctx.ellipse(
        x + (r() - 0.5) * 0.25,
        y + (r() - 0.5) * 0.25,
        rad,
        rad * (0.95 + r() * 0.1),
        r() * 3,
        0,
        7,
      );
      ctx.fill();
    }
  }
  // Maskenin dışına taşan noktalar kırpılır; mürekkep açlığı lekeleri.
  const img = ctx.getImageData(0, 0, W, W);
  const q = img.data;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4 + 3;
      if (mask(x, y) <= 0.005) q[i] = 0;
      else {
        const h = n(x / 60 + 9, y / 60 + 3);
        if (h < 0.28) q[i] = q[i]! * (0.75 + h);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, offset: o.offset };
}

function strokeLayer(
  W: number,
  draw: (ctx: Ctx, r: () => number) => void,
  o: { color: string; width?: number; seed: number; offset?: [number, number] },
): Layer | null {
  const made = layerCanvas(W);
  if (!made) return null;
  const [canvas, ctx] = made;
  ctx.strokeStyle = o.color;
  ctx.fillStyle = o.color;
  ctx.lineWidth = o.width ?? 1.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  draw(ctx, rng(o.seed));
  return { canvas, offset: o.offset ?? [0, 0] };
}

function grain(ctx: Ctx, W: number, seed: number, dark: boolean) {
  const img = ctx.getImageData(0, 0, W, W);
  const p = img.data;
  const r = rng(seed + 99);
  for (let i = 0; i < p.length; i += 4) {
    const g = (r() + r() - 1) * (dark ? 7 : 9);
    p[i] = p[i]! + g;
    p[i + 1] = p[i + 1]! + g;
    p[i + 2] = p[i + 2]! + g;
  }
  ctx.putImageData(img, 0, 0);
}

export interface CoverInput {
  album: string;
  artist: string | null;
  key: string | null;
  bpm: number | null;
}

/**
 * Kapağı `canvas`'a çizer (kare). `small`: yarım ton yok, künye yok (küçük resimde desen
 * hareli görünür). Çizilen aileyi döndürür; tuval çizilemiyorsa (`getContext` yok) `null`.
 */
export function drawPrintCover(
  canvas: HTMLCanvasElement,
  input: CoverInput,
  colors: PrintColors,
  options: { small?: boolean; mono?: string } = {},
): Family | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const W = canvas.width;
  const seed = hash(`${input.artist ?? ""}\u0000${input.album}`);
  const d = coverData(seed, input.bpm);
  const P = palette(input.key, seed, colors);
  const family = familyFor(seed, input.bpm);
  const rr = rng(seed);
  const mis: [number, number] = [
    (rr() < 0.5 ? -1 : 1) * (1 + rr() * 2) * (W / 512),
    (rr() < 0.5 ? -1 : 1) * (0.5 + rr() * 1.5) * (W / 512),
  ];
  const ht = !options.small;
  const cell = W * 0.0125;
  paper(ctx, W, P.paper, seed, P.dark);
  const L: (Layer | null)[] = [];
  const energyAt = (fraction: number) =>
    d.curve[Math.min(d.curve.length - 1, Math.max(0, Math.floor(fraction * d.curve.length)))] ??
    0.5;

  if (family === "B") {
    const top = W * 0.07;
    const H = W * 0.86;
    const seen: Record<string, number> = {};
    d.secs.forEach((s, i) => {
      const y0 = top + (s.start / d.dur) * H - (i ? W * 0.018 : 0);
      const y1 = top + (s.end / d.dur) * H + W * 0.012;
      const which = (seen[s.label] ??= Object.keys(seen).length % 2);
      const drop = s.label === "Drop";
      const dx = drop ? W * 0.03 : 0;
      const n = noise2(seed + i);
      const mask = (x: number, y: number) => {
        if (y < y0 || y > y1 || x < W * 0.14 + dx || x > W * 0.93 + dx) return 0;
        if (drop) {
          const edge = y1 - y;
          if (edge < W * 0.02 && n(x / 6, y / 3) > edge / (W * 0.02)) return 0;
        }
        const tt = (s.start + ((x - W * 0.14) / (W * 0.79)) * (s.end - s.start)) / d.dur;
        return clamp(0.08 + 1.1 * energyAt(tt) * s.energy, 0.05, 0.95);
      };
      const inks = [P.ink1, P.ink2];
      L.push(
        inkLayer(W, mask, {
          color: (drop ? inks[1 - which] : inks[which]) ?? P.ink1,
          angle: which ? 75 : 15,
          cell,
          halftone: ht,
          seed: seed + i * 7,
          offset: drop ? [mis[0] * 2.2, mis[1] * 2.2] : which ? mis : [0, 0],
        }),
      );
      if (drop) {
        // Drop: baskıcıların kesim işaretleri, tek vurgu renginde.
        L.push(
          strokeLayer(
            W,
            (c) => {
              c.lineWidth = W / 420;
              for (const yy of [y0 + W * 0.012, y1 - W * 0.004]) {
                c.beginPath();
                c.moveTo(W * 0.945 + dx, yy);
                c.lineTo(W * 0.985, yy);
                c.stroke();
              }
              c.beginPath();
              c.moveTo(W * 0.965 + dx, y0 - W * 0.006);
              c.lineTo(W * 0.965 + dx, y1 + W * 0.006);
              c.stroke();
            },
            { color: colors.accent, seed: seed + i },
          ),
        );
      }
    });
    L.push(
      strokeLayer(
        W,
        (c) => {
          const bars = Math.round(d.dur / (240 / d.bpm));
          for (let b = 0; b <= bars; b++) {
            const y = top + (b / bars) * H;
            const long = b % 8 === 0 ? W * 0.045 : b % 4 === 0 ? W * 0.03 : W * 0.015;
            c.beginPath();
            c.moveTo(W * 0.07, y);
            c.lineTo(W * 0.07 + long, y);
            c.stroke();
          }
        },
        { color: P.ink1, width: W / 512, seed },
      ),
    );
  } else if (family === "C") {
    const cx = W * (rr() < 0.5 ? 0.36 : 0.64);
    const cy = W * (0.5 + (rr() - 0.5) * 0.2);
    const R = W * 0.52;
    const t0 = (rd: number) => ((rd - 0.08) / 0.9) * d.dur;
    L.push(
      inkLayer(W, (x, y) => ((x - cx) ** 2 + (y - cy) ** 2 < (R * 1.04) ** 2 ? 0.9 : 0), {
        color: P.dark ? P.ink2 : P.ink1,
        angle: 15,
        cell,
        halftone: false,
        seed: seed + 9,
        offset: [0, 0],
        coverMax: P.dark ? 0.35 : 0.16,
      }),
    );
    L.push(
      inkLayer(
        W,
        (x, y) => {
          const rd = Math.hypot(x - cx, y - cy) / R;
          if (rd > 0.98) return 0;
          const t = t0(rd);
          const s = d.secs.find((q) => t >= q.start && t < q.end);
          return s ? Math.max(0, (s.energy - 0.3) * 0.75) : 0;
        },
        { color: P.ink1, angle: 75, cell, halftone: ht, seed: seed + 5, offset: mis },
      ),
    );
    L.push(
      strokeLayer(
        W,
        (c) => {
          c.globalAlpha = 0.22;
          for (let k = 1; k <= 4; k++) {
            c.beginPath();
            c.arc(cx, cy, (R * k) / 4, 0, 7);
            c.stroke();
          }
          c.globalAlpha = 0.55;
          for (const s of d.secs) {
            c.beginPath();
            c.arc(cx, cy, R * (0.08 + (0.9 * s.start) / d.dur), 0, 7);
            c.stroke();
          }
        },
        { color: P.ink2, width: W / 600, seed },
      ),
    );
    const strengths = d.beats.map((b) => b.s).sort((a, b) => a - b);
    const med = strengths[strengths.length >> 1] ?? 0.5;
    L.push(
      strokeLayer(
        W,
        (c, r) => {
          d.beats.forEach((b, k) => {
            const pos = k % 4;
            const a = ((-90 + pos * 90 + (b.t / d.dur) * 80) * Math.PI) / 180 + (r() - 0.5) * 0.02;
            const rad = R * (0.08 + (0.9 * b.t) / d.dur);
            const m = 6 - 2.5 * Math.log10(b.s / med);
            const size = Math.max(0.8, W * 0.011 * Math.pow(10, -0.2 * (m - 4))) * (pos ? 1 : 1.5);
            c.globalAlpha = pos ? 0.75 : 1;
            c.beginPath();
            c.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, size, 0, 7);
            c.fill();
          });
        },
        { color: P.dark ? colors.white : P.ink1, seed: seed + 1 },
      ),
    );
  } else if (family === "D") {
    const n = input.key ? Number.parseInt(input.key, 10) || 1 : (seed % 12) + 1;
    const ang = ((n * 30 - 90) * Math.PI) / 180;
    const R = W * (0.4 + 0.15 * rr());
    const cx = W * 0.5 + Math.cos(ang) * W * 0.28;
    const cy = W * 0.5 + Math.sin(ang) * W * 0.28;
    const rows = 40;
    L.push(
      inkLayer(
        W,
        (x, y) => {
          if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) return 0;
          const row = Math.floor(((y - (cy - R)) / (2 * R)) * rows);
          return clamp(energyAt(row / rows) * 1.05, 0.04, 0.95);
        },
        { color: P.ink1, angle: 45, cell: cell * 1.05, halftone: ht, seed, offset: [0, 0] },
      ),
    );
    L.push(
      strokeLayer(
        W,
        (c) => {
          for (const s of d.secs.slice(1)) {
            const y = cy - R + (s.start / d.dur) * 2 * R;
            const half = Math.sqrt(Math.max(0, R * R - (y - cy) ** 2));
            c.beginPath();
            c.moveTo(cx - half, y);
            c.lineTo(cx + half, y);
            c.stroke();
          }
          c.globalAlpha = 0.4;
          c.beginPath();
          c.arc(cx, cy, R * 1.05, 0, 7);
          c.stroke();
        },
        { color: P.ink2, width: W / 480, seed: seed + 1, offset: mis },
      ),
    );
  } else {
    const rowsN = Math.min(40, 24 + Math.floor(d.dur / 20));
    const groups: [number, number, boolean][] = [];
    let k = 0;
    for (const s of d.secs) {
      const count = Math.max(2, Math.round(((s.end - s.start) / d.dur) * rowsN));
      groups.push([k, k + count, s.label === "Drop"]);
      k += count + 1.5;
    }
    const top = W * 0.12;
    const step = (W * 0.9 - top) / k;
    const draw = (dropOnly: boolean) => (c: Ctx, r: () => number) => {
      for (const [g0, g1, drop] of groups) {
        if (drop !== dropOnly) continue;
        for (let i = Math.ceil(g0); i < g1; i++) {
          const base = top + i * step;
          const row = d.spec[Math.min(47, Math.floor((i / k) * 48))] ?? [];
          c.beginPath();
          for (let x = -4; x <= W + 4; x += 2) {
            const f = Math.min(
              127,
              Math.floor(Math.pow(Math.max(0, (x + W * 0.1) / (W * 1.2)), 1.6) * 127),
            );
            const y = base - W * 0.16 * Math.pow(row[f] ?? 0, 0.7) + (r() - 0.5) * 0.3;
            if (x <= -4) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          c.lineTo(W + 4, base + W * 0.03);
          c.lineTo(-4, base + W * 0.03);
          c.closePath();
          c.save();
          c.globalCompositeOperation = "destination-out";
          c.fill();
          c.restore();
          c.stroke();
        }
      }
    };
    L.push(
      strokeLayer(W, draw(false), { color: P.dark ? colors.white : P.ink1, width: W / 400, seed }),
    );
    L.push(
      strokeLayer(W, draw(true), { color: P.ink2, width: W / 400, seed: seed + 1, offset: mis }),
    );
  }

  for (const layer of L) {
    if (!layer) continue;
    ctx.save();
    ctx.globalCompositeOperation = P.dark ? "source-over" : "multiply";
    ctx.globalAlpha = P.dark ? 0.94 : 1;
    ctx.translate(layer.offset[0], layer.offset[1]);
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.restore();
  }
  grain(ctx, W, seed, P.dark);
  if (!options.small) {
    const ink = P.dark ? "rgba(236, 230, 214, 0.9)" : "rgba(30, 28, 27, 0.88)";
    const mono = options.mono ?? "monospace";
    ctx.font = `500 ${Math.round(W * 0.085)}px ${mono}`;
    ctx.fillStyle = ink;
    ctx.textBaseline = "bottom";
    ctx.textAlign = "right";
    ctx.fillText(catalogNumber(seed), W * 0.94, W * 0.965);
    ctx.font = `500 ${Math.round(W * 0.024)}px ${mono}`;
    ctx.globalAlpha = 0.75;
    ctx.fillText(
      ["LYRASKA", input.key, input.bpm ? Math.round(input.bpm) : null].filter(Boolean).join(" · "),
      W * 0.94,
      W * 0.875,
    );
    ctx.globalAlpha = 1;
  }
  return family;
}

/** Baskı renklerini `:root` değişkenlerinden okur (`--print-*`, `--library-accent`). */
export function readPrintColors(element: Element = document.documentElement): PrintColors {
  const style = getComputedStyle(element);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    inks: Array.from({ length: 12 }, (_, i) => v(`--print-ink-${i + 1}`, "#1e1c1b")),
    papers: {
      cream: v("--print-paper-cream", "#f0eadc"),
      bone: v("--print-paper-bone", "#e6dfce"),
      coal: v("--print-paper-coal", "#1c1d22"),
      navy: v("--print-paper-navy", "#172033"),
    },
    white: v("--print-white", "#ece6d6"),
    accent: v("--library-accent", "#ff5a88"),
  };
}
