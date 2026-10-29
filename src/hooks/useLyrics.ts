import { useCallback, useEffect, useState } from "react";
import { getTrackLyrics, type Lyrics } from "../lib/backend";
import {
  clampLyricShift,
  formatLyricShift,
  loadLyricShift,
  loadLyricsVisible,
  lyricShiftKey,
  saveLyricShift,
  saveLyricsVisible,
} from "../lib/lyrics";

/** Kısayolla kaydırınca ekrandaki kısa not bu kadar kalır (ms). */
export const SHIFT_NOTICE_MS = 1500;

export interface LyricsControls {
  /** Çalan şarkının sözleri (yoksa `null`). */
  lyrics: Lyrics | null;
  /** Ekranda gösterilsin mi (ayar)? */
  visible: boolean;
  setVisible: (visible: boolean) => void;
  /** Çalan şarkının söz kaydırması (ms; artı: sözler daha geç). Şarkı başına hatırlanır. */
  shiftMs: number;
  setShift: (ms: number) => void;
  /** Kısayolla kaydırınca kısa süre gösterilen not ("Sözler: +0,05 sn (daha geç)"); yoksa `null`. */
  shiftNotice: string | null;
}

/**
 * Çalan şarkının sözleri (yanındaki `.lrc` ya da gömülü). Şarkı değişince bir kez okunur;
 * önceki şarkının sözleri hemen bırakılır. Sözler hiçbir yere kaydedilmez; yalnızca kullanıcının
 * seçtiği kaydırma (şarkının yoluna göre, bu bilgisayarda) hatırlanır. Zamanlı sözler
 * gösterilirken Alt+← sözleri 50 ms erken, Alt+→ 50 ms geç getirir.
 */
export function useLyrics(trackPath: string | null): LyricsControls {
  const [loaded, setLoaded] = useState<{ path: string; lyrics: Lyrics | null } | null>(null);
  const [visible, setVisibleState] = useState(loadLyricsVisible);
  const [shift, setShiftState] = useState<{ path: string | null; ms: number }>(() => ({
    path: trackPath,
    ms: trackPath ? loadLyricShift(trackPath) : 0,
  }));
  // Her basışta yeni nesne: not süresi baştan sayılır.
  const [notice, setNotice] = useState<{ text: string } | null>(null);
  // Şarkı değişince o şarkının kaydırması okunur.
  if (shift.path !== trackPath) {
    setShiftState({ path: trackPath, ms: trackPath ? loadLyricShift(trackPath) : 0 });
    setNotice(null);
  }

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

  const setShift = useCallback(
    (ms: number) => {
      if (!trackPath) return;
      const value = clampLyricShift(ms);
      setShiftState({ path: trackPath, ms: value });
      saveLyricShift(trackPath, value);
    },
    [trackPath],
  );

  const lyrics = loaded && loaded.path === trackPath ? loaded.lyrics : null;
  const keysOn = visible && lyrics?.synced === true;
  const shiftMs = shift.path === trackPath ? shift.ms : 0;
  useEffect(() => {
    if (!keysOn) return;
    const onKey = (event: KeyboardEvent) => {
      const step = lyricShiftKey(event);
      if (step === null) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, select, textarea, [contenteditable]")) return;
      event.preventDefault();
      const value = clampLyricShift(shiftMs + step);
      setShift(value);
      setNotice({ text: `Sözler: ${formatLyricShift(value)}` });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysOn, shiftMs, setShift]);

  // Not kısa süre sonra kalkar.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), SHIFT_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return {
    lyrics,
    visible,
    setVisible,
    shiftMs,
    setShift,
    shiftNotice: notice?.text ?? null,
  };
}
