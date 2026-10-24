import { useEffect, useRef, useState } from "react";
import { errorMessage, isDesktop, libraryArtists, type LibraryArtist } from "../lib/backend";

/**
 * Sanatçı listesi (yalnızca sanatçılar görünümü açıkken sorulur). Arama ya da şarkı listesi
 * değişince tazelenir; yalnızca en son sorgunun sonucu uygulanır. Sonuç gelene kadar `null`.
 */
export function useArtists(
  enabled: boolean,
  query: string,
  refreshKey: unknown,
): { artists: LibraryArtist[] | null; error: string | null } {
  const [loaded, setLoaded] = useState<{ query: string; artists: LibraryArtist[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled || !isDesktop()) return;
    const mine = ++seq.current;
    libraryArtists(query)
      .then((result) => {
        if (mine !== seq.current) return;
        setLoaded({ query, artists: result });
        setError(null);
      })
      .catch((e) => {
        if (mine === seq.current) setError(errorMessage(e));
      });
  }, [enabled, query, refreshKey]);

  return { artists: loaded && loaded.query === query ? loaded.artists : null, error };
}
