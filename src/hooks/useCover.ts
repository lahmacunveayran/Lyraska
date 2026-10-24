import { useEffect, useState } from "react";
import { getSongCover, getTrackCover } from "../lib/backend";

/** Son kapaklar akılda tutulur: aynı şarkı (ör. sıradaki → çalan) için dosya yeniden okunmaz. */
const CACHE_LIMIT = 24;
const cache = new Map<string, string | null>();
/** Kapağı değişen şarkı için haber bekleyenler (açık ekranlar kapağı yeniden ister). */
const listeners = new Set<(path: string) => void>();

function remember(path: string, url: string | null) {
  cache.delete(path);
  cache.set(path, url);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** Testler arasında önbelleği temizler. */
export function clearCoverCache() {
  cache.clear();
}

/** Kullanıcı şarkının kapağını seçti ya da kaldırdı: kapak yeniden okunur. */
export function invalidateCover(path: string) {
  cache.delete(path);
  for (const listener of listeners) listener(path);
}

/** Kullanıcının şarkıya seçtiği kapak, yoksa şarkının içindeki. */
async function readCover(path: string): Promise<string | null> {
  const chosen = await getSongCover(path).catch(() => null);
  return chosen ?? (await getTrackCover(path).catch(() => null));
}

/**
 * Şarkının kapağı (`data:` adresi): kullanıcının seçtiği, yoksa şarkının içindeki resim. Kapak
 * yoksa, okunamazsa ya da şarkı yoksa `null` (o zaman özgün renk kapağı gösterilir). Şarkı
 * değişince önceki şarkının kapağı hemen bırakılır.
 */
export function useCover(trackPath: string | null): string | null {
  const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!trackPath) return;
    const onChange = (path: string) => {
      if (path === trackPath) setRevision((r) => r + 1);
    };
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, [trackPath]);

  useEffect(() => {
    if (!trackPath || cache.has(trackPath)) return;
    let cancelled = false;
    void readCover(trackPath).then((url) => {
      remember(trackPath, url);
      if (!cancelled) setLoaded({ path: trackPath, url });
    });
    return () => {
      cancelled = true;
    };
  }, [trackPath, revision]);

  if (!trackPath) return null;
  if (cache.has(trackPath)) return cache.get(trackPath) ?? null;
  return loaded && loaded.path === trackPath ? loaded.url : null;
}
