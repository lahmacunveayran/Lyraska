import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { LyricLine } from "../lib/backend";
import {
  linkProgress,
  starBrightness,
  starHeight,
  stringShape,
  type Pluck,
} from "../lib/lyricMotion";
import type { WordFrame } from "../lib/lyrics";

/** Söz satırının kelime kutuları (satıra göre, CSS pikseli). */
interface WordBox {
  x: number;
  width: number;
  top: number;
}

interface Measured {
  line: LyricLine;
  width: number;
  height: number;
  font: number;
  words: WordBox[];
  /** Tuvalin CSS boyu ve satırın tuvaldeki üst kenarı. */
  cssWidth: number;
  cssHeight: number;
  top: number;
}

/** Telin örnek noktası sayısı. */
const SAMPLES = 96;
/** Vega'nın mavimsi beyazı (A0 yıldızı). */
const VEGA = [202, 215, 255] as const;
const vega = (alpha: number) => `rgba(${VEGA[0]}, ${VEGA[1]}, ${VEGA[2]}, ${alpha})`;

/**
 * Yıldızın görüntüsü: Moffat profili I(r) = (1 + (r/α)²)^(−β), β = 3 (gerçek yıldız görüntülerinin
 * kanatlı biçimi; Gauss'tan yumuşak). Bir kez çizilir, her karede yalnızca kopyalanır.
 */
function starSprite(radius: number): HTMLCanvasElement | null {
  const size = Math.max(2, Math.ceil(radius * 2));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const image = g.createImageData(size, size);
  const alpha = radius / 1.9;
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c);
      const edge = Math.max(0, 1 - r / radius); // görüntünün sınırında sıfıra iner
      const value = (1 + (r / alpha) ** 2) ** -3 * edge;
      const k = (y * size + x) * 4;
      image.data[k] = 235;
      image.data[k + 1] = 240;
      image.data[k + 2] = 255;
      image.data[k + 3] = Math.round(255 * value);
    }
  }
  g.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Söz satırının gökyüzü: altında Orpheus'un lirinin teli (her kelimenin başı teli kelimenin
 * altından çeker; `stringShape`), üstünde kelimeler söylendikçe tutuşan yıldızlar ve onları bağlayan
 * takımyıldız çizgileri (`stars`). Satırın kutusunu üstten ve alttan taşan bir tuvale her karede
 * çizilir; kelimelerin yeri satır değişince (ya da boyut değişince) bir kez ölçülür.
 */
export function LyricSky({
  lineRef,
  line,
  words,
  t,
  opacity,
  stars,
  dim,
}: {
  lineRef: RefObject<HTMLParagraphElement | null>;
  line: LyricLine;
  words: WordFrame[];
  t: number;
  opacity: number;
  stars: boolean;
  /** Emin olunamayan satır: gökyüzü de soluk. */
  dim: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const measured = useRef<Measured | null>(null);
  const sprite = useRef<{ radius: number; image: HTMLCanvasElement | null } | null>(null);
  // Yerleşim yalnızca satır değişince, tuvalin boyu değişince ya da yazı tipi yüklenince yeniden
  // ölçülür: her karede okumak tarayıcıyı her karede yerleşim hesabına zorlardı.
  const stale = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const mark = () => {
      stale.current = true;
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(mark);
    if (canvas) observer?.observe(canvas);
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    fonts?.addEventListener?.("loadingdone", mark);
    return () => {
      observer?.disconnect();
      fonts?.removeEventListener?.("loadingdone", mark);
    };
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const element = lineRef.current;
    if (!canvas || !element) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    // Kelimelerin yeri: satır değişince ya da yerleşim değişince bir kez.
    let m = measured.current;
    if (!m || m.line !== line || stale.current) {
      stale.current = false;
      const font = parseFloat(getComputedStyle(element).fontSize) || 40;
      const spans = element.querySelectorAll<HTMLElement>(".lyrics__word");
      m = {
        line,
        width: element.clientWidth,
        height: element.clientHeight,
        font,
        words: Array.from(spans, (s) => ({
          x: s.offsetLeft,
          width: s.offsetWidth,
          top: s.offsetTop,
        })),
        cssWidth: canvas.clientWidth,
        cssHeight: canvas.clientHeight,
        top: canvas.offsetTop < 0 ? -canvas.offsetTop : 0,
      };
      measured.current = m;
    }
    const dpr = window.devicePixelRatio || 1;
    const { cssWidth, cssHeight } = m;
    if (cssWidth === 0 || cssHeight === 0) return;
    if (
      canvas.width !== Math.round(cssWidth * dpr) ||
      canvas.height !== Math.round(cssHeight * dpr)
    ) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssWidth, cssHeight);
    const fade = opacity * (dim ? 0.5 : 1);
    if (fade <= 0) return;
    // Tuval satırı her yandan taşar: satırın sol üstü tuvalde (ox, oy).
    const ox = (cssWidth - m.width) / 2;
    const oy = m.top;

    // ---- Lir teli ----
    // Tel yazının iki ucunu biraz aşar (lirin iki kolu arasında gergin).
    const textLeft = Math.min(...m.words.map((w) => w.x), m.width);
    const textRight = Math.max(...m.words.map((w) => w.x + w.width), 0);
    const left = ox + Math.min(textLeft, textRight) - 0.6 * m.font;
    const right = ox + Math.max(textLeft, textRight) + 0.6 * m.font;
    const length = Math.max(1, right - left);
    const baseY = oy + m.height + 0.22 * m.font;
    const plucks: Pluck[] = [];
    let edge = left; // ışığın teldeki ucu: söylenen yere kadar
    line.words.forEach((w, i) => {
      const box = m.words[i];
      if (!box) return;
      const center = ox + box.x + box.width / 2;
      const duration = w.end - w.start;
      plucks.push({
        at: (center - left) / length,
        time: w.start,
        height: 0.22 * m.font * (0.7 + 0.3 * Math.min(1, duration / 0.6)),
      });
      const state = words[i];
      if (state?.state === "sung") edge = Math.max(edge, ox + box.x + box.width);
      else if (state?.state === "current")
        edge = Math.max(edge, ox + box.x + box.width * state.progress);
    });
    const xs = Array.from({ length: SAMPLES }, (_, k) => k / (SAMPLES - 1));
    const ys = stringShape(plucks, t, xs);
    const path = new Path2D();
    xs.forEach((x, k) => {
      const px = left + x * length;
      const py = baseY + ys[k]!;
      if (k === 0) path.moveTo(px, py);
      else path.lineTo(px, py);
    });
    g.lineWidth = 1.8;
    g.lineCap = "round";
    g.strokeStyle = vega(0.42 * fade);
    g.stroke(path);
    // Söylenen kısmı yanan tel: parlak, Vega'nın ışığıyla haleli.
    g.save();
    g.beginPath();
    g.rect(0, 0, edge, cssHeight);
    g.clip();
    g.shadowColor = vega(0.9 * fade);
    g.shadowBlur = 12;
    g.lineWidth = 2.4;
    g.strokeStyle = vega(0.95 * fade);
    g.stroke(path);
    g.restore();
    // Telin iki ucu: lirin kollarındaki tutturma yerleri.
    g.fillStyle = vega(0.75 * fade);
    for (const x of [left, right]) {
      g.beginPath();
      g.arc(x, baseY, 2.6, 0, 2 * Math.PI);
      g.fill();
    }

    if (!stars) return;
    // ---- Takımyıldız ----
    const radius = 0.45 * m.font;
    if (!sprite.current || sprite.current.radius !== radius)
      sprite.current = { radius, image: starSprite(radius) };
    const image = sprite.current.image;
    const points: { x: number; y: number; start: number }[] = [];
    line.words.forEach((w, i) => {
      const box = m.words[i];
      if (!box || t < w.start || !w.text.trim()) return;
      points.push({
        x: ox + box.x + box.width / 2,
        y: oy + box.top - starHeight(w.text, i) * m.font,
        start: w.start,
      });
    });
    g.lineWidth = 1;
    g.strokeStyle = vega(0.42 * fade);
    for (let k = 1; k < points.length; k++) {
      const a = points[k - 1]!;
      const b = points[k]!;
      const u = linkProgress(t - b.start, b.start - a.start);
      if (u <= 0) continue;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
      g.stroke();
    }
    if (!image) return;
    g.globalCompositeOperation = "lighter";
    points.forEach((p, k) => {
      g.globalAlpha = Math.min(1, starBrightness(t - p.start, t, k * 1.7 + 0.3) * fade);
      g.drawImage(image, p.x - radius, p.y - radius, radius * 2, radius * 2);
      // Yıldızın keskin çekirdeği.
      g.beginPath();
      g.arc(p.x, p.y, 1.8, 0, 2 * Math.PI);
      g.fillStyle = `rgba(255, 255, 255, ${Math.min(1, 0.95 * fade)})`;
      g.fill();
      // Tutuşma: kısa ömürlü çapraz ışınlar (teleskop kırınımı gibi), e^(−τ/0,18) ile söner.
      const flare = Math.exp(-(t - p.start) / 0.18) * fade;
      if (flare > 0.02) {
        const reach = radius * 1.6;
        g.lineWidth = 1;
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
        ] as const) {
          const ray = g.createLinearGradient(
            p.x - dx * reach,
            p.y - dy * reach,
            p.x + dx * reach,
            p.y + dy * reach,
          );
          ray.addColorStop(0, vega(0));
          ray.addColorStop(0.5, vega(0.8 * flare));
          ray.addColorStop(1, vega(0));
          g.strokeStyle = ray;
          g.beginPath();
          g.moveTo(p.x - dx * reach, p.y - dy * reach);
          g.lineTo(p.x + dx * reach, p.y + dy * reach);
          g.stroke();
        }
      }
    });
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  });

  return <canvas ref={canvasRef} className="lyrics__sky" aria-hidden />;
}
