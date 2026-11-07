import { useCallback, useState } from "react";

import { loadLook, sanitizeLook, saveLook, type PhotoLyricLook } from "../lib/photoLyricLook";

export interface PhotoLyricLookControls {
  look: PhotoLyricLook;
  /** Görünümün bir ya da birkaç alanını değiştirir (geçersiz değer aralığa oturur); hatırlanır. */
  update: (change: Partial<PhotoLyricLook>) => void;
  /** Varsayılan görünüme döner. */
  reset: () => void;
}

/** "Kendi resmin" sözlerinin boyutu, yeri, rengi ve zemini; seçim bu bilgisayarda hatırlanır. */
export function usePhotoLyricLook(): PhotoLyricLookControls {
  const [look, setLook] = useState<PhotoLyricLook>(loadLook);
  const update = useCallback((change: Partial<PhotoLyricLook>) => {
    setLook((old) => {
      const next = sanitizeLook({ ...old, ...change });
      saveLook(next);
      return next;
    });
  }, []);
  const reset = useCallback(() => {
    const next = sanitizeLook(null);
    saveLook(next);
    setLook(next);
  }, []);
  return { look, update, reset };
}
