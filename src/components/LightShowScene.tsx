import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVisualFeed } from "../hooks/useVisualFeed";
import type { KeyMap, SongMap, VisualFrame } from "../lib/backend";
import { cueSheet, type CueSheet } from "../lib/cueSheet";
import { createShowDirector, type ShowDirector } from "../lib/lightRig";
import {
  chooseQuality,
  copyPalette,
  keyPalette,
  liveInput,
  stepPalette,
  type Intensity,
  type Rgb,
  type ShowPalette,
} from "../lib/lightShow";
import { createLightShowRenderer, type LightShowRenderer } from "../lib/lightShowRenderer";
import { KEY_CONFIDENCE_MIN } from "../lib/musicalKey";
import { parseHexColor } from "../lib/sky";
import { usePrefersReducedMotion } from "../lib/usePrefersReducedMotion";

export interface LightShowSceneProps {
  playing: boolean;
  /** Epilepsi güvenli modu: sahnenin sakin yorumu (strob yok, ≤ 1 nabız/sn, yavaş ışık). */
  safe?: boolean;
  /** Çalan şarkının haritası ve tonu (yoksa canlı mod, bölüm teması renkleri). */
  songMap?: SongMap | null;
  songKey?: KeyMap | null;
  intensity?: Intensity;
}

/** Harita gelince kurguya geçişin süresi (sn): ışıklar bu sürede hız sınırlı yerine oturur. */
const EASE_SECONDS = 3;
/** Konum bu kadar sıçrarsa sarma sayılır (sn). */
const JUMP_SECONDS = 0.6;
/** Geliştirici göstergesinin kısayolu: Ctrl+Shift+M (ya da adreste `?debug`). */
const DEBUG_KEY = "m";

const THEME_FALLBACK = { low: [0.27, 0.94, 0.65] as Rgb, high: [0.49, 0.36, 1] as Rgb };

/**
 * Işık Ustası: şarkıyı önceden bilen bir ışık şovu. Kurgu (`lightShow.ts`) şarkı haritasından:
 * kurulumda ışınlar toplanır ve her ölçüde biri söner (8 → 1), droptan hemen önce karanlık, dropta
 * ışınlar birden açılır ve (varsayılan modda) vuruşa kilitli strob; kırılmada tek sıcak spot,
 * son bölümde final. Harita yokken canlı mod (o anki ses). Ekran kartında (WebGL2, son işlem
 * zinciri) çizilir; açılamazsa durgun arka plan kalır.
 */
export function LightShowScene({
  playing,
  safe = false,
  songMap = null,
  songKey = null,
  intensity = "normal",
}: LightShowSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugRef = useRef<HTMLDivElement>(null);
  const renderer = useRef<LightShowRenderer | null>(null);
  const director = useRef<ShowDirector | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [debug, setDebug] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).has("debug");
    } catch {
      return false;
    }
  });

  const sheet = useMemo(() => cueSheet({ map: songMap, keys: songKey }), [songMap, songKey]);
  const state = useRef({
    time: 0,
    lastTime: null as number | null,
    sheet: null as CueSheet | null,
    easeLeft: 0,
    level: { bass: 0, level: 0.4 },
    palette: null as ShowPalette | null,
    colors: null as {
      keys: Rgb[];
      themes: { low: Rgb; high: Rgb }[];
      warm: Rgb;
      white: Rgb;
    } | null,
    phase: "",
    frames: 0,
    frameMs: 0,
    statsAt: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const created = createLightShowRenderer(canvas, chooseQuality);
    canvas.dataset.webgl = created ? "on" : "off";
    renderer.current = created;
    director.current = created ? createShowDirector(created.quality) : null;
    const style = window.getComputedStyle(canvas);
    const color = (name: string, fallback: Rgb): Rgb =>
      parseHexColor(style.getPropertyValue(name), fallback);
    state.current.colors = {
      keys: Array.from({ length: 12 }, (_, i) => color(`--key-${i + 1}`, [0.5, 0.5, 0.9])),
      themes: Array.from({ length: 4 }, (_, i) => ({
        low: color(`--sky-theme-${i}-low`, THEME_FALLBACK.low),
        high: color(`--sky-theme-${i}-high`, THEME_FALLBACK.high),
      })),
      warm: color("--lightshow-warm", [1, 0.79, 0.54]),
      white: color("--lightshow-white", [0.93, 0.96, 1]),
    };
    return () => {
      created?.dispose();
      renderer.current = null;
      director.current = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === DEBUG_KEY) {
        event.preventDefault();
        setDebug((on) => !on);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onTick = useCallback(
    (frame: VisualFrame | null, dt: number) => {
      const s = state.current;
      const r = renderer.current;
      const d = director.current;
      const canvas = canvasRef.current;
      if (!r || !d || !canvas || !s.colors) return;
      // Konum: çalarken şarkının duyulan anı; duraklatılmışken son konumda durur.
      let jump = false;
      if (frame) {
        const t = frame.positionSecs;
        jump = s.lastTime === null || Math.abs(t - (s.lastTime + dt)) > JUMP_SECONDS;
        s.time = t;
        s.lastTime = t;
        const live = liveInput(frame.bands, frame.rmsDb);
        const k = 1 - Math.exp(-Math.max(0, Math.min(dt, 0.25)) / 0.12);
        s.level.bass += (live.bass - s.level.bass) * k;
        s.level.level += (live.level - s.level.level) * k;
      }
      // Boş kare (analiz yetişmedi) saati sıfırlamaz: yoksa sonraki kare sarma sayılırdı.
      if (s.sheet !== sheet) {
        // Harita geldi ya da şarkı değişti: ışıklar birkaç saniyede kurguya otursun.
        if (s.sheet !== null) s.easeLeft = EASE_SECONDS;
        s.sheet = sheet;
      }
      s.easeLeft = Math.max(0, s.easeLeft - dt);

      // Palet: bölümün tonundan (yoksa şarkının tonu, o da yoksa bölüm teması).
      const section = sheet.sections.findIndex((x) => s.time >= x.time && s.time < x.end);
      const key = section >= 0 ? (sheet.sectionKeys[section] ?? null) : (songKey?.key ?? null);
      const usable = key && key.confidence >= KEY_CONFIDENCE_MIN ? key : null;
      const theme = s.colors.themes[(frame?.director?.atmosphere.theme ?? 0) % 4]!;
      const target = keyPalette(
        usable ? usable.camelot : null,
        s.colors.keys,
        theme,
        s.colors.warm,
        s.colors.white,
      );
      if (!s.palette) s.palette = copyPalette(target);
      else stepPalette(s.palette, target, dt, safe);

      const step = d.step({
        sheet,
        time: s.time,
        dt,
        opts: { intensity, safe, reducedMotion },
        live: s.level,
        bpm: frame?.beat?.bpm ?? 120,
        palette: s.palette,
        jump,
        easing: s.easeLeft > 0,
      });
      r.draw({ ...step, active: frame !== null, reducedMotion });
      if (step.cue.phase !== s.phase) {
        s.phase = step.cue.phase;
        canvas.dataset.phase = s.phase;
      }

      const out = debugRef.current;
      if (out) {
        s.frames++;
        s.frameMs += dt * 1000;
        const now = performance.now();
        if (now - s.statsAt > 500) {
          const stats = r.stats();
          const avg = s.frames > 0 ? s.frameMs / s.frames : 0;
          out.textContent =
            `ekran kartı ${stats.gpuMs === null ? "ölçülemiyor" : `${stats.gpuMs.toFixed(2)} ms`}` +
            ` · kare ${avg.toFixed(1)} ms (${avg > 0 ? Math.round(1000 / avg) : 0} fps)` +
            ` · sahne ${stats.width}×${stats.height} (${Math.round(stats.scale * 100)}%)` +
            ` · kalite ${r.quality === "high" ? "Yüksek" : "Düşük"} · ${step.beamCount} ışın` +
            ` · ${step.cue.phase} · ${canvas.dataset.gpu ?? ""}`;
          s.frames = 0;
          s.frameMs = 0;
          s.statsAt = now;
        }
      }
    },
    [sheet, songKey, intensity, safe, reducedMotion],
  );
  useVisualFeed(playing, onTick);

  return (
    <div className="sky-scene lightshow-scene">
      <canvas
        ref={canvasRef}
        className="sky-scene__canvas lightshow-scene__canvas"
        data-intensity={intensity}
        data-safe={safe ? "on" : "off"}
        role="img"
        aria-label="Işık Ustası: puslu salonda şarkıyı önceden bilen ışık şovu"
      />
      {debug && <div ref={debugRef} className="lightshow-scene__debug" aria-hidden />}
    </div>
  );
}
