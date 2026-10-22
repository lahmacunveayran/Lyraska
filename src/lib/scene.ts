import { SHADER_SCENES, type ShaderSceneId } from "./shaderScene";

/**
 * Ekrandaki görsel sahneler: beş klasik sahne, galerideki gölgelendirici sahneleri ve
 * kullanıcının kendi `.milk` dosyalarını çalan MilkDrop sahnesi.
 */
export type Scene = "sky" | "highway" | "vu" | "spectrum" | "drive" | ShaderSceneId | "milkdrop";

/** Üst çubukta tek tek görünen klasik sahneler. */
export const CLASSIC_SCENES: { id: Scene; name: string }[] = [
  { id: "sky", name: "Gece göğü" },
  { id: "highway", name: "Gece otoyolu" },
  { id: "vu", name: "VU ibreleri" },
  { id: "spectrum", name: "Spektrum" },
  { id: "drive", name: "Gece sürüşü" },
];

/**
 * MilkDrop sahnesi: Lyraska'nın kendi sahnesi değil, kullanıcının seçtiği görselleri çalar. Bu
 * yüzden gölgelendirici sahnelerinin parlaklık modeline girmez; görüntüsü her karede parlaklık
 * freninden geçer (`flashGuard.ts`).
 */
export const MILKDROP_SCENE = {
  id: "milkdrop",
  name: "MilkDrop",
  hint: "Kendi .milk görselleriniz; parlaklık freniyle.",
} as const;

/** Galerideki sahneler (üst çubukta "Galeri" düğmesinin altında). */
export const GALLERY_SCENES: { id: Scene; name: string; hint: string }[] = [
  ...SHADER_SCENES.map(({ id, name, hint }) => ({ id, name, hint })),
  MILKDROP_SCENE,
];

/** Bütün sahneler; 1–9 ve 0 tuşları ilk onu, PageDown/PageUp sırayla hepsini seçer. */
export const SCENES: { id: Scene; name: string }[] = [...CLASSIC_SCENES, ...GALLERY_SCENES];

/** Sahnenin tuşu ("1"–"9", "0"); tuşu olmayan sahnede `null`. */
export function sceneKey(scene: Scene): string | null {
  const index = SCENES.findIndex((s) => s.id === scene);
  return index >= 0 && index < 10 ? String((index + 1) % 10) : null;
}

/** Sıradaki (`step` = 1) ya da önceki (−1) sahne; sonda başa döner. */
export function nextScene(scene: Scene, step: 1 | -1): Scene {
  const index = Math.max(
    0,
    SCENES.findIndex((s) => s.id === scene),
  );
  return SCENES[(index + step + SCENES.length) % SCENES.length]!.id;
}

const STORAGE_KEY = "lyraska.scene";
const DEFAULT_SCENE: Scene = "sky";

/** Klavyede 1–9 ve 0 tuşunun seçtiği sahne; başka tuşta `null`. */
export function sceneForKey(key: string): Scene | null {
  const index = /^[0-9]$/.test(key) ? (Number(key) + 9) % 10 : -1;
  return SCENES[index]?.id ?? null;
}

/** Son seçilen sahne. Kayıt yoksa ya da okunamazsa gece göğü. */
export function loadScene(): Scene {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return SCENES.some((s) => s.id === saved) ? (saved as Scene) : DEFAULT_SCENE;
  } catch {
    return DEFAULT_SCENE;
  }
}

export function saveScene(scene: Scene): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, scene);
  } catch {
    /* Kaydedilemezse bir sonraki açılışta gece göğüyle başlar. */
  }
}
