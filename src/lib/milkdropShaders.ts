/**
 * MilkDrop gölgelendiricilerinin ekran kartında derlenip derlenmediği. Çekirdek HLSL'i GLSL'e
 * çevirir (`src-tauri/src/milkdrop/shader.rs`), ama çeviri her zaman derlenmeyebilir (ör. presetin
 * kullandığı bir ad Butterchurn'de başka bir şeydir). Butterchurn derleme hatasını denetlemez:
 * bağlanamayan programla çizim yapılmaz, görüntü kararır. Bu yüzden `loadPreset`'ten sonra iki
 * programın bağlanma durumu okunur; bozuk olan Butterchurn'ün varsayılanıyla yeniden kurulur ve görsel
 * "sade hâliyle" çalar (çevrilemeyen gölgelendiricideki gibi).
 *
 * Butterchurn 3.0.0-beta.5'in iç yapısına (`renderer.warpShader.shaderProgram`) bakar; yapı
 * beklendiği gibi değilse hiçbir şey yapmaz (`unknown`).
 */

export type ShaderStage = "warp" | "comp";

interface StageShader {
  gl: WebGL2RenderingContext;
  shaderProgram: WebGLProgram | null;
  updateShader: (text: string) => void;
}

function stageShader(visualizer: unknown, stage: ShaderStage): StageShader | null {
  const renderer = (visualizer as { renderer?: unknown } | null)?.renderer;
  const shader = (renderer as Record<string, unknown> | undefined)?.[`${stage}Shader`];
  if (!shader || typeof shader !== "object") return null;
  const candidate = shader as Partial<StageShader>;
  if (
    typeof candidate.updateShader !== "function" ||
    !candidate.gl ||
    typeof candidate.gl.getProgramParameter !== "function"
  ) {
    return null;
  }
  return candidate as StageShader;
}

/**
 * Bağlanamayan (derlenemeyen) gölgelendiriciler; yapı okunamazsa `"unknown"`. Bağlam kayıpsa
 * (`isContextLost`) her program bozuk görünür: o zaman da `"unknown"` (suçlu gölgelendirici değil).
 */
export function brokenShaders(visualizer: unknown): ShaderStage[] | "unknown" {
  const broken: ShaderStage[] = [];
  for (const stage of ["warp", "comp"] as const) {
    const shader = stageShader(visualizer, stage);
    if (!shader) return "unknown";
    const { gl, shaderProgram } = shader;
    if (gl.isContextLost()) return "unknown";
    const linked = shaderProgram !== null && gl.getProgramParameter(shaderProgram, gl.LINK_STATUS);
    if (!linked) broken.push(stage);
  }
  return broken;
}

/** Bozuk gölgelendiricileri Butterchurn'ün varsayılanıyla yeniden kurar (boş metin = varsayılan). */
export function resetShaders(visualizer: unknown, stages: readonly ShaderStage[]): void {
  for (const stage of stages) stageShader(visualizer, stage)?.updateShader("");
}
