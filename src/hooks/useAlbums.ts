import { useEffect, useRef, useState } from "react";
import { errorMessage, isDesktop, libraryAlbums, type LibraryAlbum } from "../lib/backend";

/**
 * Albüm listesi (yalnızca albümler görünümü açıkken sorulur). Arama ya da şarkı listesi
 * değişince (tarama, analiz ilerledi) tazelenir; yalnızca en son sorgunun sonucu uygulanır.
 */
export function useAlbums(
  enabled: boolean,
  query: string,
  refreshKey: unknown,
): { albums: LibraryAlbum[] | null; error: string | null } {
  // Bu aramanın sonucu gelene kadar `null` (yükleniyor): boş liste yanlışlıkla "albüm yok" demesin.
  const [loaded, setLoaded] = useState<{ query: string; albums: LibraryAlbum[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled || !isDesktop()) return;
    const mine = ++seq.current;
    libraryAlbums(query)
      .then((result) => {
        if (mine !== seq.current) return;
        setLoaded({ query, albums: result });
        setError(null);
      })
      .catch((e) => {
        if (mine === seq.current) setError(errorMessage(e));
      });
  }, [enabled, query, refreshKey]);

  return { albums: loaded && loaded.query === query ? loaded.albums : null, error };
}
