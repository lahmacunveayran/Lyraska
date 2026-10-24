import { useCallback, useEffect, useRef } from "react";
import type { VisualFrame } from "../lib/backend";
import { DEFAULT_SCENE_LOOK, clampSpeed, type SceneLook } from "../lib/sceneLook";
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
  /** Görünüm: hareketin hızı ve renk paleti (parlaklığa dokunmaz). */
  look?: SceneLook;
}

/**
 * Galerideki gölgelendirici sahneleri (gece denizi, bulutsu, ışık tüneli, ateşböcekleri,
 * kaleydoskop). Müzik ve Görsel Yönetmen gece göğündeki gibi işlenir: bas, orta ve tiz biçimi,
 * vuruşlar akışı, bölüm teması renkleri, drop beklentisi ve açılımı sahnenin toplanıp açılmasını
 * sürer. Ekran kartında (WebGL2) çizilir; açılamazsa (neden hata günlüğüne yazılır) durgun gece
 * arka planı kalır. Görünüm değişince sahne yeniden kurulmaz: hız bir sonraki karede, palet
 * karışarak geçer.
 */
export function ShaderScene({
  id,
  playing,
  safe = false,
  look = DEFAULT_SCENE_LOOK,
}: ShaderSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ShaderRenderer | null>(null);
  const state = useRef<SkyState>(SKY_AT_REST);
  const currentLook = useRef(look);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    currentLook.current = look;
  }, [look]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const created = createShaderRenderer(canvas, id);
    canvas.dataset.webgl = created ? "on" : "off";
    renderer.current = created;
    created?.draw(state.current, currentLook.current, 0); // duraklatılmışken de görünsün
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
      renderer.current?.draw(state.current, currentLook.current, dt, {
        warmth: frame?.director?.atmosphere.warmth ?? 0.5,
        safe,
        reducedMotion,
        active: frame !== null,
      });
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
        data-speed={clampSpeed(look.speed)}
        data-palette={look.palette}
        role="img"
        aria-label={label}
      />
    </div>
  );
}
