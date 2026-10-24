import { useCallback, useEffect, useState } from "react";
import {
  clearBackgroundImage,
  errorMessage,
  getBackgroundImage,
  pickImage,
  setBackgroundImage,
} from "../lib/backend";

export interface BackgroundImageControls {
  /** Seçilen resim (`data:` adresi); seçilmemişse `null`, yüklenirken `undefined`. */
  url: string | null | undefined;
  error: string | null;
  choose: () => Promise<void>;
  clear: () => Promise<void>;
}

/**
 * "Kendi resmin" sahnesinin arka plan resmi: kopyası Lyraska'nın veri klasöründe saklanır.
 * Resim (birkaç MB) yalnızca sahne seçiliyken (`enabled`) yüklenir ve bellekte tutulur.
 */
export function useBackgroundImage(enabled: boolean): BackgroundImageControls {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    getBackgroundImage()
      .then((result) => {
        if (live) setUrl(result);
      })
      .catch((e) => {
        if (!live) return;
        setUrl(null);
        setError(errorMessage(e));
      });
    return () => {
      live = false;
      // Sahneden çıkınca resim bellekten bırakılır.
      setUrl(undefined);
    };
  }, [enabled, revision]);

  const choose = useCallback(async () => {
    try {
      const path = await pickImage();
      if (path === null) return;
      await setBackgroundImage(path);
      setError(null);
      setRevision((r) => r + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  const clear = useCallback(async () => {
    try {
      await clearBackgroundImage();
      setError(null);
      setRevision((r) => r + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  return { url: enabled ? url : undefined, error, choose, clear };
}
