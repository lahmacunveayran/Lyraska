import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { LyricLine, Lyrics, SongMap } from "../lib/backend";
import { getWebGl2, isSoftwareGl, reportSceneProblem } from "../lib/gl";
import {
  DROP_COLOR,
  DYE_CELL,
  DYE_MAX,
  JUMP_SECS,
  PEN_TAIL,
  SIM_CELL,
  SIM_MAX,
  buoyancyFor,
  energyAt,
  heldBloom,
  inkEvents,
  inkTheme,
  lineColors,
  penRate,
  plume,
  stepPlan,
  vortexStreet,
  vorticityFor,
  type Vortex,
} from "../lib/inkFluid";
import { InkRenderer, type InkSize, type MaskRect } from "../lib/inkRenderer";
import { heldStrength } from "../lib/lyricMotion";
import type { WordFrame } from "../lib/lyrics";

/** Satırın ölçülmüş yeri (tuvalde, CSS pikseli; yay hareketi olmadan). */
interface Measured {
  line: LyricLine;
  /** Kelimelerin kutuları (kelime zamanı yoksa bütün satır tek kutu). */
  words: Box[];
  /** Satırın kutusu. */
  box: Box;
  font: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Stage {
  renderer: InkRenderer;
  gl: WebGL2RenderingContext;
  css: [number, number];
  pixel: [number, number];
  maskCanvas: HTMLCanvasElement;
  stale: boolean;
}

/** Tuvalin en fazla piksel sayısı (ekran kartı yoksa dörtte biri). */
const MAX_PIXELS = 1600 * 640;

/**
 * "Mürekkep" söz görünümü: sözlerin arkasında gerçek akışkan (`lib/inkFluid`, `lib/inkRenderer`).
 * Söylenen kelimenin ışık cephesinden mürekkep akar, uzun hecede kelimenin çevresinde açılır; ölçü
 * başında akış nefes alır, drop'ta patlar; satır bitince harfleri dumana dönüşüp girdaplarla dağılır.
 *
 * Tuval söz bloğundan geniş ve yüksektir (duman yükselir), yeri sabittir: satır yokken de duman
 * dağılmayı sürdürür. Satırın yeri satır değişince (ya da boyut, yazı tipi değişince) bir kez ölçülür;
 * yay hareketi her karede hesapla eklenir (her karede yerleşim okunmaz). Akışkan söz saatiyle ilerler:
 * duraklatınca duman olduğu yerde durur, sarınca temizlenir. Ekran kartı kayan noktalı dokuya
 * çizemiyorsa hiçbir şey çizilmez (sözler yine görünür) ve neden hata günlüğüne yazılır.
 */
export function LyricInk({
  lyrics,
  boxRef,
  lineRef,
  line,
  words,
  t,
  lift,
  map,
  musicShift,
}: {
  lyrics: Lyrics;
  boxRef: RefObject<HTMLDivElement | null>;
  lineRef: RefObject<HTMLParagraphElement | null>;
  /** Gösterilen satır (yoksa `null`: duman yalnızca dağılır). */
  line: LyricLine | null;
  words: WordFrame[];
  t: number;
  /** Satırın yay hareketiyle aşağı kayması (em). */
  lift: number;
  map: SongMap | null;
  /** Harita saati − söz saati (söz kaydırması). */
  musicShift: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stage = useRef<Stage | null>(null);
  const measured = useRef<Measured | null>(null);
  const last = useRef<number | null>(null);
  // Son drop'un anı: huzmeler satırın ortasından saçılır, e^(−τ/0,6) ile söner.
  const dropAt = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const open = () => {
      const gl = getWebGl2Alpha(canvas);
      if (!gl) return;
      try {
        stage.current = {
          renderer: new InkRenderer(gl),
          gl,
          css: [0, 0],
          pixel: [0, 0],
          maskCanvas: document.createElement("canvas"),
          stale: true,
        };
        delete canvas.dataset.webglError;
      } catch (error) {
        stage.current = null;
        reportSceneProblem(
          canvas,
          "Mürekkep",
          error instanceof Error ? error.message : String(error),
        );
      }
    };
    open();
    const mark = () => {
      if (stage.current) stage.current.stale = true;
      measured.current = null;
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(mark);
    observer?.observe(canvas);
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    fonts?.addEventListener?.("loadingdone", mark);
    const lost = (event: Event) => {
      event.preventDefault();
      stage.current = null;
      measured.current = null;
      last.current = null;
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", open);
    return () => {
      observer?.disconnect();
      fonts?.removeEventListener?.("loadingdone", mark);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", open);
      stage.current?.renderer.dispose();
      stage.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const s = stage.current;
    const canvas = canvasRef.current;
    if (!s || !canvas) return;
    const r = s.renderer;
    if (s.stale) {
      const css: [number, number] = [canvas.clientWidth, canvas.clientHeight];
      if (css[0] === 0 || css[1] === 0) return;
      s.stale = false;
      s.css = css;
      s.pixel = pixelSize(css, window.devicePixelRatio || 1, isSoftwareGl(canvas));
      canvas.width = s.pixel[0];
      canvas.height = s.pixel[1];
      const size = inkSize(css, isSoftwareGl(canvas));
      r.resize(size);
      s.maskCanvas.width = size.dye[0];
      s.maskCanvas.height = size.dye[1];
      measured.current = null;
      last.current = null;
    }
    const [cw, ch] = s.css;
    if (cw === 0 || ch === 0) return;

    // Zaman: sarma ya da büyük atlama akışkanı temizler.
    const previous = last.current;
    last.current = t;
    const jumped = previous === null || t < previous - 1e-3 || t - previous > JUMP_SECS;
    if (jumped) {
      r.clear();
      dropAt.current = null;
    }
    const t0 = jumped ? t : previous;
    const dt = Math.max(0, t - t0);
    const lines = lyrics.lines;
    const energy = energyAt(map, t + musicShift);
    const theme = inkTheme(map, t + musicShift);
    const events = inkEvents(lines, { map }, t0, t, musicShift);
    const uvRect = (b: Box): MaskRect => ({
      x0: b.x / cw,
      x1: (b.x + b.width) / cw,
      y0: 1 - (b.y + b.height) / ch,
      y1: 1 - b.y / ch,
    });
    const center = (b: Box, dy = 0): [number, number] => [
      (b.x + b.width / 2) / cw,
      1 - (b.y + b.height / 2 + dy) / ch,
    ];
    /** Kutuya göre yerleştirilmiş girdaplar (`speed`: çekirdeğin kenarındaki hız, hücre/sn). */
    const swirl = (vortices: Vortex[], b: Box, speed: number, dy = 0) => {
      for (const v of vortices) {
        const point: [number, number] = [
          (b.x + v.x * b.width) / cw,
          1 - (b.y + b.height * (0.5 + v.y) + dy) / ch,
        ];
        const radius = (v.size * b.height) / ch;
        r.impulse("swirl", point, [radius, radius], [v.gamma * speed, 0]);
      }
    };

    // 1) Biten satır dumana döner (maskesi henüz o satırın).
    const m0 = measured.current;
    for (const event of events) {
      if (event.kind !== "dissolve" || !m0 || lines[event.line] !== m0.line) continue;
      const colors = lineColors(theme, event.line);
      r.inject({
        rect: uvRect(m0.box),
        span: [m0.box.x / cw, (m0.box.x + m0.box.width) / cw],
        front: 1,
        tail: 0,
        colors,
        amount: 1.5,
        offset: [0, 0],
        hot: 0.45,
      });
      // Yazı önce bütün halinde havalanır (yeni satıra yer açar), girdaplar onu yolda koparır.
      swirl(vortexStreet(m0.line.text, m0.box.width, m0.font), m0.box, 14 + 20 * energy);
      // Geniş itiş: yazının her yeri aynı hızla kalkar (dikeyde değişen hız harfleri uzatırdı).
      r.impulse("push", center(m0.box), [m0.box.width / ch, (3.5 * m0.box.height) / ch], [0, 110]);
    }

    // 2) Yeni satırın maskesi.
    if (line && measured.current?.line !== line) {
      const box = boxRef.current;
      const element = lineRef.current;
      if (box && element) {
        measured.current = measure(line, element, box, canvas);
        drawMask(s.maskCanvas, measured.current, element, cw);
        r.setMask(s.maskCanvas);
      }
    }
    const m = measured.current?.line === line ? measured.current : null;
    const index = line ? lines.indexOf(line) : -1;
    const liftPx = m ? lift * m.font : 0;
    const offset: [number, number] = [0, -liftPx / ch];
    const colors = lineColors(theme, Math.max(0, index));

    // 3) Damlalar, nefes, drop.
    for (const event of events) {
      if (!m) break;
      if (event.kind === "onset" && event.line === index) {
        const b = m.words[event.word];
        if (!b) continue;
        r.inject({
          rect: uvRect(b),
          span: [m.box.x / cw, (m.box.x + m.box.width) / cw],
          front: 1,
          tail: 0,
          colors,
          amount: 0.65 * event.strength,
          offset,
        });
        swirl(plume(0.7), b, 55 * event.strength, liftPx);
      } else if (event.kind === "breath") {
        r.impulse(
          "push",
          center(m.box, liftPx),
          [(0.6 * m.box.width) / ch, (1.3 * m.box.height) / ch],
          [event.side * 30 * event.strength, 80 * event.strength],
        );
      } else if (event.kind === "drop") {
        r.inject({
          rect: uvRect(m.box),
          span: [m.box.x / cw, (m.box.x + m.box.width) / cw],
          front: 1,
          tail: 0,
          colors: [DROP_COLOR, DROP_COLOR],
          amount: 1.5,
          offset,
          hot: 1,
        });
        // Satır boyunca üç mantar: drop'un patlaması.
        for (const part of [0, 1, 2]) {
          const third = { ...m.box, x: m.box.x + (part * m.box.width) / 3, width: m.box.width / 3 };
          swirl(plume(0.8), { ...third, height: m.box.height * 2.2 }, 110, liftPx);
          // Her mantarın kökünde satırın renginde mürekkep: patlamanın renkli dumanı.
          r.inject({
            rect: uvRect(third),
            span: [m.box.x / cw, (m.box.x + m.box.width) / cw],
            front: 1,
            tail: 0,
            colors,
            amount: 0.9,
            offset,
          });
        }
        dropAt.current = event.at;
      }
    }

    // 4) Kalem: söylenen kelimenin ışık cephesinden akan mürekkep; uzun hecede açılan akış.
    if (m && line && dt > 0) {
      words.forEach((w, k) => {
        if (w.state !== "current") return;
        const b = m.words[k];
        const timing = line.words[k];
        if (!b || !timing) return;
        const rect = uvRect(b);
        r.inject({
          rect,
          span: [m.box.x / cw, (m.box.x + m.box.width) / cw],
          front: rect.x0 + (rect.x1 - rect.x0) * w.progress,
          tail: PEN_TAIL * (rect.x1 - rect.x0),
          colors,
          amount: penRate(energy) * Math.min(dt, 0.05),
          offset,
          hot: 0.7,
        });
        const held = heldStrength(timing.end - timing.start);
        if (held > 0) swirl(plume(0.8), b, heldBloom(held, energy) * Math.min(dt, 0.05), liftPx);
      });
    }

    // 5) Akışkan ilerler, çizilir.
    const plan = stepPlan(dt);
    for (let i = 0; i < plan.steps; i++) r.step(plan.h, vorticityFor(energy), buoyancyFor(energy));
    // Işık kaynağı: söylenen kelimenin ucu; kelime bitince e^(−τ/0,35) ile söner.
    const pen = lightSource(m, line, words, t, cw, ch, liftPx);
    const burst = dropAt.current === null ? 0 : 2 * Math.exp(-(t - dropAt.current) / 0.5);
    r.render(
      s.pixel[0],
      s.pixel[1],
      0.55,
      m && burst > pen.strength
        ? { point: center(m.box, liftPx), strength: burst, reach: (0.6 * m.box.width) / ch }
        : pen,
    );
    // Denetim (check:scenes) isteyince: mürekkep sonlu mu, basınç çözümü ıraksaklığı ne kadar siliyor.
    // Okuma ekran kartını bekletir; yalnızca istenince.
    if (canvas.dataset.inkMeasure) {
      delete canvas.dataset.inkMeasure;
      const dye = r.dyeStats();
      const before = r.divergenceRms();
      r.project();
      canvas.dataset.inkResult = JSON.stringify({ ...dye, before, after: r.divergenceRms() });
    }
  });

  return <canvas ref={canvasRef} className="lyrics-ink" aria-hidden />;
}

/** Saydam tuvalli WebGL2 (duman sahnenin üstüne ön çarpılmış saydamlıkla biner). */
function getWebGl2Alpha(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  const gl = getWebGl2(canvas, { alpha: true, premultipliedAlpha: true });
  if (!gl) reportSceneProblem(canvas, "Mürekkep", "WebGL2 açılamadı");
  return gl;
}

/** Tuvalin piksel boyutu: ekran yoğunluğu en çok 1,5×, toplam `MAX_PIXELS` (yazılımsalda ¼). */
export function pixelSize(css: [number, number], dpr: number, software: boolean): [number, number] {
  const max = software ? MAX_PIXELS / 4 : MAX_PIXELS;
  const k = Math.min(Math.min(dpr, 1.5), Math.sqrt(max / Math.max(1, css[0] * css[1])));
  return [Math.max(1, Math.round(css[0] * k)), Math.max(1, Math.round(css[1] * k))];
}

/** Benzetimin ve mürekkebin ızgarası: hücreler kare, en fazla sınırlarda (yazılımsalda yarısı). */
export function inkSize(css: [number, number], software: boolean): InkSize {
  const fit = (cell: number, max: readonly [number, number]): [number, number] => {
    const c = software ? cell * 2 : cell;
    const k = Math.min(1, max[0] / (css[0] / c), max[1] / (css[1] / c));
    return [Math.max(8, Math.round((css[0] / c) * k)), Math.max(8, Math.round((css[1] / c) * k))];
  };
  return { sim: fit(SIM_CELL, SIM_MAX), dye: fit(DYE_CELL, DYE_MAX) };
}

/** Öğenin `ancestor`'a göre yeri (offset zinciri: dönüşümler dışarıda). */
function offsetWithin(element: HTMLElement, ancestor: HTMLElement): [number, number] {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  while (node && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return [x, y];
}

function measure(
  line: LyricLine,
  element: HTMLParagraphElement,
  box: HTMLDivElement,
  canvas: HTMLCanvasElement,
): Measured {
  const style = getComputedStyle(element);
  const font = parseFloat(style.fontSize) || 40;
  const lineHeight = parseFloat(style.lineHeight) || font * 1.18;
  const boxRect = box.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const dx = boxRect.left - canvasRect.left;
  const dy = boxRect.top - canvasRect.top;
  const spans = Array.from(element.querySelectorAll<HTMLElement>(".lyrics__word"));
  const at = (el: HTMLElement, width: number, height: number): Box => {
    const [x, y] = offsetWithin(el, box);
    return { x: x + dx, y: y + dy, width, height };
  };
  const words = spans.map((s) => at(s, s.offsetWidth, lineHeight));
  const whole = at(element, element.offsetWidth, element.offsetHeight);
  // Satırın kutusu: yazının kapladığı yer (blok tüm genişliktir).
  const box2 =
    words.length > 0
      ? {
          x: Math.min(...words.map((w) => w.x)),
          y: Math.min(...words.map((w) => w.y)),
          width: Math.max(...words.map((w) => w.x + w.width)) - Math.min(...words.map((w) => w.x)),
          height:
            Math.max(...words.map((w) => w.y + w.height)) - Math.min(...words.map((w) => w.y)),
        }
      : whole;
  return { line, words: words.length > 0 ? words : [whole], box: box2, font };
}

/** Satırın harflerini maske tuvaline çizer (aynı yazı tipi, ölçülen yerlerde). */
function drawMask(
  mask: HTMLCanvasElement,
  m: Measured,
  element: HTMLParagraphElement,
  cssWidth: number,
): void {
  const g = mask.getContext("2d");
  if (!g) return;
  const k = mask.width / cssWidth;
  const style = getComputedStyle(element);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, mask.width, mask.height);
  g.setTransform(k, 0, 0, k, 0, 0);
  g.font = `${style.fontWeight} ${m.font}px ${style.fontFamily}`;
  if ("letterSpacing" in g) (g as { letterSpacing: string }).letterSpacing = style.letterSpacing;
  g.fillStyle = "#fff";
  g.textBaseline = "alphabetic";
  const sample = g.measureText("Hg");
  const ascent = sample.fontBoundingBoxAscent || m.font * 0.8;
  const descent = sample.fontBoundingBoxDescent || m.font * 0.2;
  const spans = element.querySelectorAll<HTMLElement>(".lyrics__word");
  const texts = spans.length > 0 ? Array.from(spans, (s) => s.textContent ?? "") : [m.line.text];
  texts.forEach((text, i) => {
    const b = m.words[i];
    if (!b) return;
    const baseline = b.y + (b.height - (ascent + descent)) / 2 + ascent;
    const align = spans.length > 0 ? "left" : "center";
    g.textAlign = align;
    g.fillText(text, align === "left" ? b.x : b.x + b.width / 2, baseline);
  });
}

/**
 * Işık huzmelerinin kaynağı: söylenen kelimenin ışık cephesi (kelimenin ortası yüksekliğinde). Kelime
 * yoksa son söylenen kelimenin sonu, bitişinden beri geçen sürenin e^(−τ/0,35)'iyle sönerek.
 */
export function lightSource(
  m: { words: Box[] } | null,
  line: LyricLine | null,
  words: WordFrame[],
  t: number,
  cw: number,
  ch: number,
  liftPx: number,
): { point: [number, number]; strength: number; reach: number } {
  const none = { point: [0.5, 0.5] as [number, number], strength: 0, reach: 0.1 };
  if (!m || !line) return none;
  let k = words.findIndex((w) => w.state === "current");
  let strength = 1;
  if (k < 0) {
    k = words.map((w) => w.state).lastIndexOf("sung");
    const timing = line.words[k];
    if (!timing) return none;
    strength = Math.exp(-(t - timing.end) / 0.35);
  }
  const b = m.words[k];
  const w = words[k];
  if (!b || !w || strength < 0.01) return none;
  return {
    point: [(b.x + b.width * w.progress) / cw, 1 - (b.y + b.height / 2 + liftPx) / ch],
    strength,
    reach: (2.2 * b.height) / ch,
  };
}
