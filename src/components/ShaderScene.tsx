import { useCallback, useEffect, useRef } from "react";
import type { VisualFrame } from "../lib/backend";
import { SHADER_SCENES, type ShaderSceneId } from "../lib/shaderScene";
import { createShaderRenderer, type ShaderRenderer } from "../lib/shaderRenderer";
import { SKY_AT_REST, bandEnergies, stepSky, type SkyState } from "../lib/sky";
import { usePrefersReducedMotion } from "../lib/usePrefersReducedMotion";
import { useVisualFeed } from "../hooks/useVisualFeed";
import { directorInput } from "./SkyScene";

export interface ShaderSceneProps {
  id: ShaderSceneId;
  playing: boolean;
  /** Epilepsi güvenli modu: parlaklık yarı hızla değişir. */
  safe?: boolean;
}

/**
 * Galerideki gölgelendirici sahneleri (gece denizi, bulutsu, ışık tüneli, ateşböcekleri,
 * kaleydoskop). Müzik ve Görsel Yönetmen gece göğündeki gibi işlenir: bas, orta ve tiz biçimi,
 * vuruşlar akışı, bölüm teması renkleri, drop beklentisi ve açılımı sahnenin toplanıp açılmasını
 * sürer. Ekran kartında (WebGL2) çizilir; açılamazsa (neden hata günlüğüne yazılır) durgun gece
 * arka planı kalır.
 */
export function ShaderScene({ id, playing, safe = false }: ShaderSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ShaderRenderer | null>(null);
  const state = useRef<SkyState>(SKY_AT_REST);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const created = createShaderRenderer(canvas, id);
    canvas.dataset.webgl = created ? "on" : "off";
    renderer.current = created;
    created?.draw(state.current); // duraklatılmışken de görünsün
    return () => {
      created?.dispose();
      renderer.current = null;
    };
  }, [id]);

  // Her ekran karesinde durum ilerletilip doğrudan çizilir; React yeniden çizim yapmaz.
  const onTick = useCallback(
    (frame: VisualFrame | null, dt: number) => {
      state.current = stepSky(
        state.current,
        frame ? bandEnergies(frame.bands) : null,
        dt,
        reducedMotion,
        frame ? directorInput(frame) : null,
        safe,
      );
      renderer.current?.draw(state.current);
    },
    [reducedMotion, safe],
  );
  useVisualFeed(playing, onTick);

  const label = SHADER_SCENES.find((s) => s.id === id)?.label ?? id;
  return (
    <div className="sky-scene">
      <canvas
        ref={canvasRef}
        className="sky-scene__canvas shader-scene__canvas"
        data-shader={id}
        role="img"
        aria-label={label}
      />
    </div>
  );
}
