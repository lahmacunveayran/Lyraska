import { clampSpeed, isScenePalette, type SceneLook, type ScenePalette } from "./sceneLook";
import { SHADER_SCENES, isShaderScene, type ShaderSceneId } from "./shaderScene";

/**
 * Galerinin hazır ayarları (saf hesap): sahne ve görünümü (hız, palet) tek tıkla birlikte seçer.
 * Programla gelenler değişmez; kullanıcının kaydettikleri tarayıcı deposunda (localStorage)
 * saklanır. Depodan okunan her kayıt doğrulanır: hız sınırlanır, bilinmeyen sahne ya da paletteki
 * kayıt atlanır, ad kısaltılır, sayı sınırlanır.
 */

export interface ScenePreset {
  id: string;
  name: string;
  scene: ShaderSceneId;
  speed: number;
  palette: ScenePalette;
  /** Programla gelen (silinemez). */
  builtIn: boolean;
}

/** Programla gelen hazır ayarlar. */
export const BUILT_IN_PRESETS: ScenePreset[] = [
  {
    id: "embers",
    name: "Kor ateşi",
    scene: "nebula",
    speed: 0.8,
    palette: "ember",
    builtIn: true,
  },
  {
    id: "fast-tunnel",
    name: "Hızlı tünel",
    scene: "tunnel",
    speed: 1.6,
    palette: "theme",
    builtIn: true,
  },
  {
    id: "rose-garden",
    name: "Gül bahçesi",
    scene: "kaleido",
    speed: 0.5,
    palette: "rose",
    builtIn: true,
  },
  {
    id: "frozen-galaxy",
    name: "Buzlu gökada",
    scene: "galaxy",
    speed: 0.6,
    palette: "ice",
    builtIn: true,
  },
];

/** Kullanıcının kaydedebileceği en fazla hazır ayar. */
export const MAX_USER_PRESETS = 50;
/** Hazır ayar adının en fazla uzunluğu (karakter). */
export const MAX_PRESET_NAME = 40;

/** Adı temizler: baştaki ve sondaki boşluk atılır, iç boşluklar teke iner, uzunluk sınırlanır. */
export function cleanPresetName(name: string): string {
  return [...name.replace(/\s+/g, " ").trim()].slice(0, MAX_PRESET_NAME).join("").trim();
}

/** Kayıttan okunan hazır ayarı doğrular; okunamazsa `null`. */
export function sanitizePreset(raw: unknown): ScenePreset | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { id, name, scene, speed, palette } = raw as Record<string, unknown>;
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return null;
  if (typeof name !== "string" || typeof scene !== "string" || !isShaderScene(scene)) return null;
  if (!isScenePalette(palette)) return null;
  const cleaned = cleanPresetName(name);
  if (cleaned.length === 0) return null;
  return { id, name: cleaned, scene, speed: clampSpeed(speed), palette, builtIn: false };
}

/**
 * Kayıttaki kullanıcı hazır ayarları: bozuk kayıtlar, yinelenen ve programla gelenlerle çakışan
 * kimlikler atlanır; en fazla `MAX_USER_PRESETS`.
 */
export function sanitizePresets(raw: unknown): ScenePreset[] {
  const list =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).presets : null;
  if (!Array.isArray(list)) return [];
  const seen = new Set(BUILT_IN_PRESETS.map((p) => p.id));
  const presets: ScenePreset[] = [];
  for (const entry of list) {
    const preset = sanitizePreset(entry);
    if (!preset || seen.has(preset.id)) continue;
    seen.add(preset.id);
    presets.push(preset);
    if (presets.length >= MAX_USER_PRESETS) break;
  }
  return presets;
}

/** Kayıt biçimi: `{ version: 1, presets: [{ id, name, scene, speed, palette }, …] }`. */
const PRESETS_STORAGE_KEY = "lyraska.scenePresets";
const STORAGE_VERSION = 1;

export function loadUserPresets(): ScenePreset[] {
  try {
    const saved = window.localStorage.getItem(PRESETS_STORAGE_KEY);
    return sanitizePresets(saved === null ? null : JSON.parse(saved));
  } catch {
    return [];
  }
}

export function saveUserPresets(presets: readonly ScenePreset[]): void {
  try {
    window.localStorage.setItem(
      PRESETS_STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        presets: presets
          .filter((p) => !p.builtIn)
          .slice(0, MAX_USER_PRESETS)
          .map(({ id, name, scene, speed, palette }) => ({ id, name, scene, speed, palette })),
      }),
    );
  } catch {
    /* Kaydedilemezse hazır ayar yalnızca bu oturumda kalır. */
  }
}

/**
 * Sahnenin şu anki görünümünden yeni kullanıcı hazır ayarı. Ad boşsa ya da sınıra ulaşıldıysa
 * `null`. Kimlik mevcut kimliklerle çakışmaz.
 */
export function createUserPreset(
  name: string,
  scene: ShaderSceneId,
  look: SceneLook,
  existing: readonly ScenePreset[],
  now: number = Date.now(),
): ScenePreset | null {
  const cleaned = cleanPresetName(name);
  if (cleaned.length === 0) return null;
  if (existing.filter((p) => !p.builtIn).length >= MAX_USER_PRESETS) return null;
  const taken = new Set([...BUILT_IN_PRESETS, ...existing].map((p) => p.id));
  let n = 0;
  let id = `user-${now.toString(36)}`;
  while (taken.has(id)) id = `user-${now.toString(36)}-${++n}`;
  return {
    id,
    name: cleaned,
    scene,
    speed: clampSpeed(look.speed),
    palette: isScenePalette(look.palette) ? look.palette : "theme",
    builtIn: false,
  };
}

/** Hazır ayarın sahnesinin adı (listede gösterilir). */
export function presetSceneName(preset: ScenePreset): string {
  return SHADER_SCENES.find((s) => s.id === preset.scene)?.name ?? preset.scene;
}
