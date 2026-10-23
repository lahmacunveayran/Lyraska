// SpectrumDemo'nun (src/components/SpectrumDemo.tsx) benzetiminin kopyası; WCAG 2.3.1 parlama sayımı
// (src/lib/flash.ts countFlashes ile aynı mantık) 760 px genişlikteki matrisin tamamı ve 341 px'lik pencereler için.
const bands = 16,
  rows = 10,
  FRAME_MS = 40,
  PEAK_HOLD = 12,
  PEAK_FALL = 0.035;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
function rnd(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const stat = (n) =>
  Array.from({ length: n }, (_, i) => 0.25 + 0.5 * Math.exp(-((i - n * 0.3) ** 2) / (n * 2)));
function cols(levels, peaks) {
  const c = [];
  levels.forEach((l, b) => {
    const lit = Math.round(clamp01(l) * rows),
      pk = Math.round(clamp01(peaks[b] ?? 0) * rows);
    const col = [];
    for (let y = 0; y < rows; y++) {
      const f = rows - y;
      col.push(f <= lit || (pk > 0 && f === pk));
    }
    c.push(col, col);
    if (b < levels.length - 1) c.push(new Array(rows).fill(false));
  });
  return c;
}
function countFlashes(lum) {
  let min = lum[0] ?? 0,
    max = min,
    dir = 0,
    ch = 0;
  for (const l of lum) {
    min = dir > 0 ? min : Math.min(min, l);
    max = dir < 0 ? max : Math.max(max, l);
    if (dir >= 0 && max - l >= 0.1) {
      dir = -1;
      ch++;
      min = l;
    } else if (dir <= 0 && l - min >= 0.1) {
      dir = 1;
      ch++;
      max = l;
    }
  }
  return Math.floor(ch / 2);
}
const lin = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const mix = (a, al, b) => a.map((v, i) => v * al + b[i] * (1 - al));
const bg = [2, 6, 5],
  vfd = [108, 246, 223];
const litL = L(mix(vfd, 0.62, bg)),
  ghostL = L(mix(vfd, 0.075, bg)),
  bgL = L(bg);
const dotFrac = (Math.PI * 3.8 * 3.8) / 100;
const s = {
  levels: stat(bands),
  targets: stat(bands),
  peaks: stat(bands),
  holds: new Array(bands).fill(0),
  frame: 0,
  random: rnd(2026),
};
const frames = [];
for (let f = 0; f < 25 * 60; f++) {
  s.frame++;
  const beat = s.frame % 12 === 0;
  for (let i = 0; i < bands; i++) {
    const tilt = 1 - (i / bands) * 0.55;
    if (beat || s.random() < 0.18) {
      const kick = beat && i < bands / 3 ? 0.35 : 0;
      s.targets[i] = clamp01((0.2 + s.random() * 0.65) * tilt + kick);
    }
    const cur = s.levels[i],
      t = s.targets[i];
    s.levels[i] = cur + (t - cur) * (t > cur ? 0.55 : 0.12);
    s.targets[i] = t * 0.94;
    if (s.levels[i] >= s.peaks[i]) {
      s.peaks[i] = s.levels[i];
      s.holds[i] = PEAK_HOLD;
    } else if (s.holds[i] > 0) s.holds[i]--;
    else s.peaks[i] = Math.max(s.levels[i], s.peaks[i] - PEAK_FALL);
  }
  frames.push(cols(s.levels, s.peaks));
}
const ncol = frames[0].length;
const pxPerCol = 760 / ncol;
function regionLum(c0, c1, cs) {
  let lit = 0,
    tot = 0;
  for (let x = c0; x < c1; x++)
    for (let y = 0; y < rows; y++) {
      tot++;
      if (cs[x][y]) lit++;
    }
  const fl = lit / tot;
  return dotFrac * (fl * litL + (1 - fl) * ghostL) + (1 - dotFrac) * bgL;
}
const win = Math.round(341 / pxPerCol);
let worst = 0,
  worstAt = 0,
  maxLum = 0,
  maxSwing = 0;
for (let c0 = 0; c0 + win <= ncol; c0++) {
  const lum = frames.map((cs) => regionLum(c0, c0 + win, cs));
  maxLum = Math.max(maxLum, ...lum);
  for (let t = 0; t + 25 <= lum.length; t += 5) {
    const n = countFlashes(lum.slice(t, t + 25));
    if (n > worst) {
      worst = n;
      worstAt = c0;
    }
  }
  for (let t = 1; t < lum.length; t++) maxSwing = Math.max(maxSwing, Math.abs(lum[t] - lum[t - 1]));
}
const whole = frames.map((cs) => regionLum(0, ncol, cs));
let wworst = 0;
for (let t = 0; t + 25 <= whole.length; t += 5)
  wworst = Math.max(wworst, countFlashes(whole.slice(t, t + 25)));
// Ayrı ayrı dot düzeyinde: tek bir bas sütununun yanan payı (göreli, 0..1) için de say
const bassFrac = frames.map((cs) => {
  let l = 0;
  for (let y = 0; y < rows; y++) if (cs[0][y]) l++;
  return l / rows;
});
let bworst = 0;
for (let t = 0; t + 25 <= bassFrac.length; t += 5)
  bworst = Math.max(bworst, countFlashes(bassFrac.slice(t, t + 25)));
console.log({
  ncol,
  pxPerCol: pxPerCol.toFixed(1),
  win,
  litL: litL.toFixed(3),
  ghostL: ghostL.toFixed(4),
  maxRegionLum: maxLum.toFixed(3),
  maxFrameSwing: maxSwing.toFixed(4),
  worstFlashesPerSec_341pxWindow: worst,
  wholeMatrixWorst: wworst,
  bassColumnLitFractionChangesPerSec_notWCAG: bworst,
});
