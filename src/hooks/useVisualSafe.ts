import { useCallback, useEffect, useState } from "react";
import { errorMessage, getVisualSafe, setVisualSafe } from "../lib/backend";

export interface VisualSafeControls {
  /** Epilepsi güvenli modu açık mı. */
  safe: boolean;
  /** Kayıtlı ayar okundu mu (okunamadıysa da `true`): o ana dek `safe` varsayılandır. */
  loaded: boolean;
  error: string | null;
  setSafe: (on: boolean) => Promise<void>;
}

/**
 * Epilepsi güvenli modu: açıkken görseller saniyede en fazla bir nabız atar ve
 * parlaklık yarı hızla değişir. Ayar kaydedilir; program her açılışta hatırlar.
 */
export function useVisualSafe(): VisualSafeControls {
  const [safe, setSafeState] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVisualSafe()
      .then((on) => {
        if (cancelled) return;
        setSafeState(on);
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(errorMessage(e));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSafe = useCallback(async (on: boolean) => {
    setSafeState(on); // düğme hemen tepki versin
    try {
      setSafeState(await setVisualSafe(on));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  return { safe, loaded, error, setSafe };
}
