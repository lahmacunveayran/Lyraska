import { SCENE_CLOCK_PERIOD } from "./sceneClock";
import { SHADER_SCENES, type ShaderSceneId } from "./shaderScene";
import { mixColors } from "./sky";

/**
 * Galeri sahnelerinin görünümü (saf hesap): hız ve renk paleti. İkisi de yalnızca görüntünün
 * biçimini ve rengini değiştirir; parlaklık her zaman ortak çarpandan (`sceneLevel`) gelir.
 *
 * - **Hız** (0,5–2×) yalnızca hareketi ölçekler. Sahnenin kendi saati, gece göğünün akış
 *   saatinin (`SkyState.flowTime`) her karedeki artışının hız katı kadar ilerler. Parlaklığın hız
 *   sınırına giren süre (`stepSky`'a giden `dt`) ölçeklenmez. Yıldız ve ateşböceklerinin kırpışma
 *   saati (`uTwinkle`) bilerek ölçeklenmez: kırpışma küçük ışıkların parlaklığını değiştirir,
 *   hız ayarı ise hiçbir parlaklığın değişim hızına dokunmaz.
 * - **Palet**: "Bölüm teması" (Görsel Yönetmen'in bölüm temalarını izler) ya da sabit, özgün
 *   renkler (`--scene-palette-<id>-low/high`). Palet değişince renkler `PALETTE_FADE_SECONDS`
 *   içinde karışarak geçer; hiçbir zaman bir karede sıçramaz. Sabit paletlerin parlaklığı gece
 *   göğü temalarınınkini aşmaz (testte denetlenir; tasarım), parlaklık tavanı onlarda da geçerlidir.
 */

/** Renk paletleri: bölüm teması ya da sabit paletlerden biri. */
export type ScenePalette = "theme" | "ice" | "ember" | "forest" | "rose";

/** Sabit paletler (`--scene-palette-<id>-low/high` değişkenleri). */
export type FixedPalette = Exclude<ScenePalette, "theme">;

/** Galerideki sırayla. */
export const SCENE_PALETTES: { id: ScenePalette; name: string }[] = [
  { id: "theme", name: "Bölüm teması" },
  { id: "ice", name: "Buz" },
  { id: "ember", name: "Kor" },
  { id: "forest", name: "Orman" },
  { id: "rose", name: "Gül" },
];

export const FIXED_PALETTES: FixedPalette[] = ["ice", "ember", "forest", "rose"];

export function isScenePalette(id: unknown): id is ScenePalette {
  return SCENE_PALETTES.some((p) => p.id === id);
}

export function paletteName(id: ScenePalette): string {
  return SCENE_PALETTES.find((p) => p.id === id)?.name ?? id;
}

export interface SceneLook {
  /** Hareketin hız katı (`SPEED_MIN`–`SPEED_MAX`). */
  speed: number;
  palette: ScenePalette;
}

export const DEFAULT_SCENE_LOOK: SceneLook = { speed: 1, palette: "theme" };

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;
/** Hız kaydırıcısının adımı. */
export const SPEED_STEP = 0.1;

/** Hızı sınırlar ve iki basamağa yuvarlar; sayı değilse olağan hız (1). */
export function clampSpeed(speed: unknown): number {
  if (typeof speed !== "number" || !Number.isFinite(speed)) return DEFAULT_SCENE_LOOK.speed;
  return Math.round(Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed)) * 100) / 100;
}

/** "1,25×" biçiminde hız. */
export function formatSpeed(speed: number): string {
  return `${clampSpeed(speed).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}×`;
}

/** Kayıttan okunan görünümü doğrular; okunamazsa `null`. */
export function sanitizeLook(raw: unknown): SceneLook | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { speed, palette } = raw as Record<string, unknown>;
  if (!isScenePalette(palette)) return null;
  return { speed: clampSpeed(speed), palette };
}

export function sameLook(a: SceneLook, b: SceneLook): boolean {
  return clampSpeed(a.speed) === clampSpeed(b.speed) && a.palette === b.palette;
}

/** Her galeri sahnesinin son görünümü. */
export type SceneLooks = Record<ShaderSceneId, SceneLook>;

export function defaultLooks(): SceneLooks {
  return Object.fromEntries(SHADER_SCENES.map(({ id }) => [id, DEFAULT_SCENE_LOOK])) as SceneLooks;
}

/** Kayıttaki görünümleri doğrular: bilinmeyen sahne ve bozuk görünüm atlanır (olağan görünüm). */
export function sanitizeLooks(raw: unknown): SceneLooks {
  const looks = defaultLooks();
  const entries =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).looks : null;
  if (typeof entries !== "object" || entries === null) return looks;
  for (const { id } of SHADER_SCENES) {
    const look = sanitizeLook((entries as Record<string, unknown>)[id]);
    if (look) looks[id] = look;
  }
  return looks;
}

/** Kayıt biçimi: `{ version: 1, looks: { sea: { speed, palette }, … } }`. */
const LOOKS_STORAGE_KEY = "lyraska.sceneLooks";
const STORAGE_VERSION = 1;

export function loadSceneLooks(): SceneLooks {
  try {
    const saved = window.localStorage.getItem(LOOKS_STORAGE_KEY);
    return sanitizeLooks(saved === null ? null : JSON.parse(saved));
  } catch {
    return defaultLooks();
  }
}

export function saveSceneLooks(looks: SceneLooks): void {
  try {
    window.localStorage.setItem(
      LOOKS_STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, looks }),
    );
  } catch {
    /* Kaydedilemezse bir sonraki açılışta olağan görünümle başlar. */
  }
}

// --- Sahnenin kendi saati ve palet geçişi (her karede, çizici kullanır) ---

type Rgb = [number, number, number];

export interface ColorPair {
  low: Rgb;
  high: Rgb;
}

/** Palet geçişi: geçişin başladığı anda görünen renkler, hedef palet ve karışım (0 → 1). */
export interface PaletteFade {
  palette: ScenePalette;
  from: ColorPair;
  mix: number;
  /** Şu an görünen renkler. */
  shown: ColorPair;
}

/** Palet değişince renklerin karışarak geçtiği süre (saniye). */
export const PALETTE_FADE_SECONDS = 1;

/**
 * Palet geçişini `dt` saniye ilerletir. `target` seçili paletin şu anki renkleridir (bölüm
 * temasında bunlar da yavaşça değişir). Palet değişince görünen renklerden yeni palete doğrusal
 * geçilir: her renk kanalı saniyede en fazla `1 / PALETTE_FADE_SECONDS` kadar değişir. Geçiş
 * yarıdayken palet yine değişirse o an görünenden devam edilir (sıçrama yok).
 */
export function stepPaletteFade(
  prev: PaletteFade | null,
  palette: ScenePalette,
  target: ColorPair,
  dt: number,
): PaletteFade {
  if (!prev) return { palette, from: target, mix: 1, shown: target };
  const fade =
    palette === prev.palette ? prev : { palette, from: prev.shown, mix: 0, shown: prev.shown };
  const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.25)) : 0;
  const mix = Math.min(1, fade.mix + step / PALETTE_FADE_SECONDS);
  return {
    palette,
    from: fade.from,
    mix,
    shown: {
      low: mixColors(fade.from.low, target.low, mix),
      high: mixColors(fade.from.high, target.high, mix),
    },
  };
}

/**
 * Sahnenin kendi saatini ilerletir: akış saatinin son kareden beri artışının `speed` katı.
 * Akış saati `SCENE_CLOCK_PERIOD`'da sarılır; artış da o modüloyla alınır, sarılma anında
 * saat sıçramaz. Kendi saat de aynı periyotta sarılır (`foldTime` orada süreklidir).
 */
export function advanceSceneClock(
  clock: number,
  lastFlow: number | null,
  flowTime: number,
  speed: number,
): number {
  if (!Number.isFinite(flowTime)) return Number.isFinite(clock) ? clock : 0;
  if (lastFlow === null || !Number.isFinite(lastFlow) || !Number.isFinite(clock)) return flowTime;
  let delta = (flowTime - lastFlow) % SCENE_CLOCK_PERIOD;
  if (delta < 0) delta += SCENE_CLOCK_PERIOD;
  // Akış saati geri gitmez; yarım periyottan büyük artış ancak bozuk değerden gelir.
  if (delta > SCENE_CLOCK_PERIOD / 2) delta = 0;
  return (clock + clampSpeed(speed) * delta) % SCENE_CLOCK_PERIOD;
}

/** Sahnenin görünüm durumu: kendi saati, son okunan akış saati, palet geçişi. */
export interface LookState {
  clock: number;
  lastFlow: number | null;
  fade: PaletteFade | null;
}

export const LOOK_AT_REST: LookState = { clock: 0, lastFlow: null, fade: null };

/** Görünüm durumunu bir kare ilerletir (`target`: seçili paletin şu anki renkleri). */
export function stepLook(
  prev: LookState,
  flowTime: number,
  look: SceneLook,
  target: ColorPair,
  dt: number,
): LookState {
  return {
    clock: advanceSceneClock(prev.clock, prev.lastFlow, flowTime, look.speed),
    lastFlow: Number.isFinite(flowTime) ? flowTime : prev.lastFlow,
    fade: stepPaletteFade(prev.fade, look.palette, target, dt),
  };
}
