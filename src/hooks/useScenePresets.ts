import { useCallback, useMemo, useState } from "react";
import {
  clampSpeed,
  loadSceneLooks,
  saveSceneLooks,
  type SceneLook,
  type SceneLooks,
} from "../lib/sceneLook";
import {
  BUILT_IN_PRESETS,
  createUserPreset,
  loadUserPresets,
  saveUserPresets,
  type ScenePreset,
} from "../lib/scenePreset";
import type { ShaderSceneId } from "../lib/shaderScene";

export interface ScenePresetControls {
  /** Her galeri sahnesinin görünümü (hatırlanır). */
  looks: SceneLooks;
  setLook: (scene: ShaderSceneId, look: SceneLook) => void;
  /** Önce programla gelenler, sonra kullanıcının kaydettikleri. */
  presets: ScenePreset[];
  /** Sahnenin şu anki görünümünü kullanıcı hazır ayarı olarak kaydeder; olmazsa `null`. */
  savePreset: (name: string, scene: ShaderSceneId) => ScenePreset | null;
  deletePreset: (id: string) => void;
}

/** Galeri sahnelerinin görünümleri ve hazır ayarlar (ikisi de hatırlanır). */
export function useScenePresets(): ScenePresetControls {
  const [looks, setLooks] = useState<SceneLooks>(loadSceneLooks);
  const [userPresets, setUserPresets] = useState<ScenePreset[]>(loadUserPresets);

  const setLook = useCallback((scene: ShaderSceneId, look: SceneLook) => {
    setLooks((prev) => {
      const next = { ...prev, [scene]: { speed: clampSpeed(look.speed), palette: look.palette } };
      saveSceneLooks(next);
      return next;
    });
  }, []);

  const savePreset = useCallback(
    (name: string, scene: ShaderSceneId) => {
      const preset = createUserPreset(name, scene, looks[scene], userPresets);
      if (!preset) return null;
      const next = [...userPresets, preset];
      setUserPresets(next);
      saveUserPresets(next);
      return preset;
    },
    [looks, userPresets],
  );

  const deletePreset = useCallback((id: string) => {
    setUserPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveUserPresets(next);
      return next;
    });
  }, []);

  const presets = useMemo(() => [...BUILT_IN_PRESETS, ...userPresets], [userPresets]);
  return { looks, setLook, presets, savePreset, deletePreset };
}
