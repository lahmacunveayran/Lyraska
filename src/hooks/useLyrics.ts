import { useCallback, useEffect, useState } from "react";
import {
  clearTrackLyrics,
  getTrackLyrics,
  errorMessage,
  getTrackLyricsText,
  logFrontendError,
  onLyricsAligned,
  saveTrackLyrics,
  type Lyrics,
  type LyricsText,
} from "../lib/backend";
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
  /** Düzenlemek için çalan şarkının sözlerinin ham metni (LRC ya da düz metin); yoksa `null`. */
  loadText: () => Promise<LyricsText | null>;
  /** Düzenlenen sözleri saklar (Lyraska'nın klasöründe) ve yeniden okur; boş metin kaydı siler. */
  saveText: (text: string) => Promise<void>;
  /** Düzenlenmiş sözleri siler (şarkının kendi sözlerine dönülür) ve yeniden okur. */
  clearText: () => Promise<void>;
  /** Sözleri yeniden okur (ör. söz paketi eklendi: zamansız söz oturtulmak üzere istenir). */
  refresh?: () => void;
}

/**
 * Çalan şarkının sözleri (Lyraska'da düzenlenmiş, yanındaki `.lrc` ya da gömülü). Şarkı değişince,
 * sözler düzenlenince ve çekirdek zamansız sözü arka planda sese oturtunca okunur; önceki şarkının sözleri hemen bırakılır. Kullanıcının düzenlediği metin
 * Lyraska'nın klasöründe saklanır (müzik dosyasına dokunulmaz); kaydırma şarkının yoluna göre bu
 * bilgisayarda hatırlanır. Zamanlı sözler gösterilirken Alt+← sözleri 50 ms erken, Alt+→ 50 ms geç getirir.
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

  // Sözler düzenlenince yeniden okunur.
  const [revision, setRevision] = useState(0);
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
  }, [trackPath, revision]);

  // Zamansız söz arka planda zamanlandı: otomatik zamanlısı okunur.
  useEffect(() => {
    if (!trackPath) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    onLyricsAligned((path) => {
      if (path === trackPath) setRevision((r) => r + 1);
    })
      .then((fn) => (cancelled ? fn() : (unlisten = fn)))
      .catch((e) => {
        logFrontendError(`Söz zamanlama haberi dinlenemedi: ${errorMessage(e)}`).catch(() => {
          /* Günlüğe yazılamazsa yapılacak bir şey yok. */
        });
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [trackPath]);

  const loadText = useCallback(
    () => (trackPath ? getTrackLyricsText(trackPath) : Promise.resolve(null)),
    [trackPath],
  );
  const saveText = useCallback(
    async (text: string) => {
      if (!trackPath) return;
      await saveTrackLyrics(trackPath, text);
      setRevision((r) => r + 1);
    },
    [trackPath],
  );
  const clearText = useCallback(async () => {
    if (!trackPath) return;
    await clearTrackLyrics(trackPath);
    setRevision((r) => r + 1);
  }, [trackPath]);

  const refresh = useCallback(() => setRevision((r) => r + 1), []);

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
    loadText,
    saveText,
    clearText,
    refresh,
  };
}
