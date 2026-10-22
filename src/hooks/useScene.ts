import { useCallback, useEffect, useRef, useState } from "react";
import { loadScene, nextScene, saveScene, sceneForKey, type Scene } from "../lib/scene";

/**
 * Seçili sahne (hatırlanır). Klavye (yazı yazılırken değil): 1–9 ve 0 sahne seçer, PageDown ve
 * PageUp sıradaki ve önceki sahneye geçer (çekmecenin içinde değil).
 */
export function useScene(): [Scene, (scene: Scene) => void] {
  const [scene, setScene] = useState<Scene>(loadScene);
  const current = useRef(scene);
  const choose = useCallback((next: Scene) => {
    current.current = next;
    setScene(next);
    saveScene(next);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      // Çekmecede PageDown/PageUp paneli kaydırır.
      const paging = event.key === "PageDown" || event.key === "PageUp";
      if (paging && target?.closest(".drawer")) return;
      const picked =
        event.key === "PageDown"
          ? nextScene(current.current, 1)
          : event.key === "PageUp"
            ? nextScene(current.current, -1)
            : sceneForKey(event.key);
      if (!picked) return;
      if (paging) event.preventDefault();
      choose(picked);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose]);

  return [scene, choose];
}
