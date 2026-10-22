import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  errorMessage,
  getCrossfeed,
  setCrossfeed,
  type CrossfeedSettings,
  type CrossfeedState,
} from "../lib/backend";
import { CROSSFEED_PRESETS, DEFAULT_CROSSFEED, previewCrossfeedState } from "../lib/crossfeed";

export interface CrossfeedControls {
  /** Ekranda gösterilen ayar (dokunulduğu anda güncellenir). */
  settings: CrossfeedSettings;
  /** Eğriler ve zaman farkı: çekirdeğin hesabı; sürüklerken anında analog önizleme. */
  state: CrossfeedState;
  /** Crossfeed sesi şu an değiştiriyor mu? */
  active: boolean;
  error: string | null;
  /** Ayarı değiştirir; çekirdeğe aynı anda tek istek gider, araya gelenlerden en sonuncusu. */
  update: (change: (current: CrossfeedSettings) => CrossfeedSettings) => void;
}

const same = (a: CrossfeedSettings, b: CrossfeedSettings) =>
  a.enabled === b.enabled && a.cutoffHz === b.cutoffHz && a.levelDb === b.levelDb;

/**
 * Crossfeed. Sürgü sürüklenirken her değişiklik beklemeden ekrana yansır; çekirdeğe aynı anda
 * tek istek gider, araya gelen değişikliklerden yalnızca en sonuncusu gönderilir (ses ~30 ms'lik
 * çapraz geçişle değişir).
 */
export function useCrossfeed(): CrossfeedControls {
  const [settings, setSettings] = useState<CrossfeedSettings>(DEFAULT_CROSSFEED);
  const [core, setCore] = useState<CrossfeedState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  const inFlight = useRef(false);
  const pending = useRef<CrossfeedSettings | null>(null);
  /** Kullanıcı açılıştaki yükleme bitmeden dokunduysa yüklenen ayar onu ezmesin. */
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getCrossfeed()
      .then((loaded) => {
        if (cancelled || !loaded) return;
        setCore(loaded);
        if (touched.current) return;
        settingsRef.current = loaded.settings;
        setSettings(loaded.settings);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const send = useCallback(async (next: CrossfeedSettings) => {
    if (inFlight.current) {
      pending.current = next;
      return;
    }
    inFlight.current = true;
    let target: CrossfeedSettings | null = next;
    while (target) {
      try {
        const result = await setCrossfeed(target);
        // Bu sırada yeni bir değişiklik geldiyse eski sonucu gösterme.
        if (result && !pending.current) {
          setCore(result);
          settingsRef.current = result.settings;
          setSettings(result.settings);
        }
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      }
      target = pending.current;
      pending.current = null;
    }
    inFlight.current = false;
  }, []);

  const update = useCallback(
    (change: (current: CrossfeedSettings) => CrossfeedSettings) => {
      touched.current = true;
      const next = change(settingsRef.current);
      settingsRef.current = next;
      setSettings(next);
      void send(next);
    },
    [send],
  );

  const state = useMemo(
    () =>
      core && same(core.settings, settings)
        ? core
        : previewCrossfeedState(settings, core?.presets ?? CROSSFEED_PRESETS),
    [core, settings],
  );

  return { settings, state, active: settings.enabled, error, update };
}
