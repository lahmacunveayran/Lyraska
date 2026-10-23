import { useCallback, useEffect, useState } from "react";
import {
  errorMessage,
  exportSongMap,
  getImportedSongMap,
  importSongMap,
  pickSongMapFile,
  removeSongMap,
  type ImportedMapStatus,
} from "../lib/backend";
import { mapFileName } from "../lib/mapFile";

export interface MapFileControls {
  /** Çalan şarkıya içe aktarılmış ve uygulanan harita (yoksa `null`). */
  imported: ImportedMapStatus | null;
  busy: boolean;
  /** Son işlemin sonucu (ör. "Kaydedildi: …"). */
  message: string | null;
  error: string | null;
  /**
   * Harita değiştikçe artar (içe aktarma, kaldırma): şarkı haritasını ve tonu gösterenler
   * yeniden sorar.
   */
  revision: number;
  exportMap: () => Promise<void>;
  importMap: () => Promise<void>;
  removeMap: () => Promise<void>;
}

/** Çalan şarkının haritasını dosyaya yazma, dosyadan uygulama ve kaldırma. */
export function useMapFile(trackPath: string | null, trackTitle: string | null): MapFileControls {
  const [loaded, setLoaded] = useState<{
    path: string;
    imported: ImportedMapStatus | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  /** Son işlemin sonucu ya da hatası, hangi şarkıda olduğuyla: şarkı değişince gösterilmez. */
  const [outcome, setOutcome] = useState<{
    path: string;
    message: string | null;
    error: string | null;
  } | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!trackPath) return;
    let cancelled = false;
    getImportedSongMap(trackPath)
      .then((imported) => !cancelled && setLoaded({ path: trackPath, imported }))
      .catch(() => {
        /* Bilgi alınamazsa haritası yok sayılır. */
      });
    return () => {
      cancelled = true;
    };
  }, [trackPath]);

  const run = useCallback(
    async (action: () => Promise<string | null>) => {
      if (!trackPath) return;
      setBusy(true);
      try {
        const done = await action();
        setOutcome({ path: trackPath, message: done, error: null });
      } catch (e) {
        setOutcome({ path: trackPath, message: null, error: errorMessage(e) });
      } finally {
        setBusy(false);
      }
    },
    [trackPath],
  );

  const exportMap = useCallback(
    () =>
      run(async () => {
        if (!trackPath) return null;
        const target = await exportSongMap(trackPath, mapFileName(trackTitle ?? "sarki"));
        return target ? `Kaydedildi: ${target}` : null;
      }),
    [run, trackPath, trackTitle],
  );

  const importMap = useCallback(
    () =>
      run(async () => {
        if (!trackPath) return null;
        const file = await pickSongMapFile();
        if (!file) return null;
        const imported = await importSongMap(trackPath, file);
        setLoaded({ path: trackPath, imported });
        setRevision((r) => r + 1);
        return "Harita uygulandı: görseller ve şarkı haritası şeridi artık onu kullanıyor.";
      }),
    [run, trackPath],
  );

  const removeMap = useCallback(
    () =>
      run(async () => {
        if (!trackPath) return null;
        await removeSongMap(trackPath);
        setLoaded({ path: trackPath, imported: null });
        setRevision((r) => r + 1);
        return "Harita kaldırıldı: programın kendi analizi kullanılıyor.";
      }),
    [run, trackPath],
  );

  const current = outcome && outcome.path === trackPath ? outcome : null;
  return {
    imported: loaded && loaded.path === trackPath ? loaded.imported : null,
    busy,
    message: current?.message ?? null,
    error: current?.error ?? null,
    revision,
    exportMap,
    importMap,
    removeMap,
  };
}
