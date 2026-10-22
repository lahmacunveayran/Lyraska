import { useCallback, useEffect, useState } from "react";
import { getTrackLyrics, type Lyrics } from "../lib/backend";
import { loadLyricsVisible, saveLyricsVisible } from "../lib/lyrics";

export interface LyricsControls {
  /** Çalan şarkının sözleri (yoksa `null`). */
  lyrics: Lyrics | null;
  /** Ekranda gösterilsin mi (ayar)? */
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

/**
 * Çalan şarkının sözleri (yanındaki `.lrc` ya da gömülü). Şarkı değişince bir kez okunur;
 * önceki şarkının sözleri hemen bırakılır. Sözler hiçbir yere kaydedilmez.
 */
export function useLyrics(trackPath: string | null): LyricsControls {
  const [loaded, setLoaded] = useState<{ path: string; lyrics: Lyrics | null } | null>(null);
  const [visible, setVisibleState] = useState(loadLyricsVisible);

  useEffect(() => {
    if (!trackPath) return;
    let cancelled = false;
    getTrackLyrics(trackPath)
      .then((lyrics) => !cancelled && setLoaded({ path: trackPath, lyrics }))
      .catch(() => {
        /* Okunamayan söz dosyası: söz gösterilmez. */
      });
    return () => {
      cancelled = true;
    };
  }, [trackPath]);

  const setVisible = useCallback((next: boolean) => {
    setVisibleState(next);
    saveLyricsVisible(next);
  }, []);

  return {
    lyrics: loaded && loaded.path === trackPath ? loaded.lyrics : null,
    visible,
    setVisible,
  };
}
