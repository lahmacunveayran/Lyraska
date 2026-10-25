import { useEffect, useState } from "react";
import { getAlbumCover, getSongCover, getTrackCover } from "../lib/backend";

/** Kapağı aranacak albüm (albüm sanatçısı, yoksa sanatçı + albüm adı). */
export interface CoverAlbum {
  album: string;
  artist: string | null;
}

/** Son kapaklar akılda tutulur: aynı şarkı (ör. sıradaki → çalan) için dosya yeniden okunmaz. */
const CACHE_LIMIT = 24;
/** Şarkı ve albümüne göre (`cacheKey`). */
const cache = new Map<string, string | null>();
/** Kapağı değişen şarkı ya da albüm için haber bekleyenler (açık ekranlar kapağı yeniden ister). */
const listeners = new Set<() => void>();

function albumId(album: CoverAlbum | null): string {
  return album ? `${album.artist ?? "\u0001"}\u0000${album.album}` : "";
}

function cacheKey(path: string, album: CoverAlbum | null): string {
  return `${path}\u0002${albumId(album)}`;
}

function remember(key: string, url: string | null) {
  cache.delete(key);
  cache.set(key, url);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** Kimliği uyan kapakları unutur, açık ekranlara haber verir. */
function forget(matches: (key: string) => boolean) {
  for (const key of [...cache.keys()]) if (matches(key)) cache.delete(key);
  for (const listener of listeners) listener();
}

/** Testler arasında önbelleği temizler. */
export function clearCoverCache() {
  cache.clear();
}

/** Kullanıcı şarkının kapağını seçti ya da kaldırdı: kapak yeniden okunur. */
export function invalidateCover(path: string) {
  forget((key) => key.startsWith(`${path}\u0002`));
}

/** Kullanıcı albümün kapağını seçti ya da kaldırdı: o albümün şarkılarının kapağı yeniden okunur. */
export function invalidateAlbumArt(album: string, artist: string | null) {
  const id = albumId({ album, artist });
  forget((key) => key.endsWith(`\u0002${id}`));
}

/** Şarkıya seçilen kapak, yoksa albüme seçilen, o da yoksa şarkının içindeki. */
async function readCover(path: string, album: CoverAlbum | null): Promise<string | null> {
  const chosen = await getSongCover(path).catch(() => null);
  if (chosen) return chosen;
  if (album) {
    const forAlbum = await getAlbumCover(album.album, album.artist).catch(() => null);
    if (forAlbum) return forAlbum;
  }
  return getTrackCover(path).catch(() => null);
}

/**
 * Şarkının kapağı (`data:` adresi): kullanıcının şarkıya seçtiği, yoksa albümüne seçtiği (albüm
 * ızgarasındaki gibi), o da yoksa şarkının içindeki resim. Kapak yoksa, okunamazsa ya da şarkı
 * yoksa `null` (o zaman özgün renk kapağı gösterilir). Şarkı değişince önceki şarkının kapağı
 * hemen bırakılır.
 */
export function useCover(trackPath: string | null, album: CoverAlbum | null = null): string | null {
  const [loaded, setLoaded] = useState<{ key: string; url: string | null } | null>(null);
  const [revision, setRevision] = useState(0);
  const key = trackPath ? cacheKey(trackPath, album) : null;
  const albumName = album?.album;
  const albumArtist = album?.artist ?? null;

  useEffect(() => {
    const onChange = () => setRevision((r) => r + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  useEffect(() => {
    if (!trackPath || !key || cache.has(key)) return;
    let cancelled = false;
    const forAlbum = albumName === undefined ? null : { album: albumName, artist: albumArtist };
    void readCover(trackPath, forAlbum).then((url) => {
      remember(key, url);
      if (!cancelled) setLoaded({ key, url });
    });
    return () => {
      cancelled = true;
    };
  }, [trackPath, key, albumName, albumArtist, revision]);

  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  return loaded && loaded.key === key ? loaded.url : null;
}
