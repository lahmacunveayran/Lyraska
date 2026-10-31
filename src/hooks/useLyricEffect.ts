import { useCallback, useState } from "react";
import { loadLyricEffect, saveLyricEffect, type LyricEffect } from "../lib/lyricMotion";

/** Sözlerin görünümü (takımyıldız, lir, sade); seçim hatırlanır. */
export function useLyricEffect(): {
  effect: LyricEffect;
  setEffect: (effect: LyricEffect) => void;
} {
  const [effect, setState] = useState<LyricEffect>(loadLyricEffect);
  const setEffect = useCallback((next: LyricEffect) => {
    setState(next);
    saveLyricEffect(next);
  }, []);
  return { effect, setEffect };
}
