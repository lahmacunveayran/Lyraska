import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NO_MILKDROP_FOLDER,
  getMilkdropFolder,
  pickMilkdropFolder,
  setMilkdropFolder,
  type MilkdropEntry,
  type MilkdropFolder,
} from "../lib/backend";
import { describeError } from "../lib/errorReporting";
import {
  EMPTY_HISTORY,
  blendSeconds,
  historyNext,
  historyPrevious,
  type PresetHistory,
} from "../lib/milkdrop";

/** Sahneye "şu görseli şu harmanlamayla aç" isteği; her istek yeni bir `serial` taşır. */
export interface MilkdropRequest {
  serial: number;
  entry: MilkdropEntry;
  /** Harmanlama süresi (saniye); ilk görselde sahne bunu yok sayar (önceki görsel yok). */
  blendSeconds: number;
}

export interface MilkdropControls {
  /** Seçilen klasör ve görselleri (seçilmediyse boş). */
  library: MilkdropFolder;
  /** Liste okunuyor mu (ilk açılışta, klasör seçerken). */
  loading: boolean;
  request: MilkdropRequest | null;
  /** Çalan görselin adı (açıldıktan sonra). */
  currentName: string | null;
  /** Çalan görselin gölgelendiricileri desteklenmediği için sade hâliyle çalıyor. */
  simplified: boolean;
  /** Kullanıcıya kısa bilgi (ör. açılamayan görsel). */
  notice: string | null;
  /** Müzikle kendiliğinden görsel değiştirme (hatırlanır). */
  auto: boolean;
  setAuto: (auto: boolean) => void;
  chooseFolder: () => Promise<void>;
  /** Kullanıcı: sonraki / önceki görsel. */
  next: () => void;
  previous: () => void;
  /** Sahne: müzikte uygun an geldi. */
  advance: () => void;
  /** Sahne: istenen görsel açıldı / açılamadı. */
  loaded: (serial: number, name: string, simplified: boolean) => void;
  failed: (serial: number, message: string) => void;
}

const AUTO_KEY = "lyraska.milkdrop.auto";
/**
 * Açılırken programı kapatmış (ör. sonsuz döngülü denklem) olabilecek görsel: sahne açmadan önce
 * yazar, görsel birkaç saniye sorunsuz çizilince siler. Program bir sonraki açılışta bu görselle
 * başlamaz (yine bu görselde donmasın).
 */
export const PENDING_KEY = "lyraska.milkdrop.pending";
/** Art arda bu kadar görsel açılamazsa kendiliğinden denemeyi bırakır. */
const MAX_FAILURES = 5;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* Saklanamazsa bir sonraki açılışta varsayılanla başlar. */
  }
}

/** Görsel açılmadan önce işaretlenir (bkz. [`PENDING_KEY`]). */
export function markPending(path: string | null): void {
  writeStorage(PENDING_KEY, path);
}

/**
 * MilkDrop sahnesinin durumu (seçilen klasör, görsel listesi, çalan görsel, geçmiş). Galeri
 * paneli ve sahne aynı denetimleri paylaşır. Liste yalnızca sahne ilk kez açılınca okunur.
 */
export function useMilkdrop(active: boolean): MilkdropControls {
  const [library, setLibrary] = useState<MilkdropFolder>(NO_MILKDROP_FOLDER);
  /** İlk liste okundu mu; klasör seçilirken liste yeniden okunuyor mu. */
  const [fetched, setFetched] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const listed = useRef(false);
  const [request, setRequest] = useState<MilkdropRequest | null>(null);
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [simplified, setSimplified] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [auto, setAutoState] = useState(() => readStorage(AUTO_KEY) !== "0");
  const history = useRef<PresetHistory>(EMPTY_HISTORY);
  const serial = useRef(0);
  const failures = useRef(0);
  const presets = useRef<MilkdropEntry[]>([]);

  /** Listeyi değiştirir ve ilk görseli ister (önceki açılışta programı kapatan atlanır). */
  const install = useCallback((next: MilkdropFolder) => {
    setLibrary(next);
    presets.current = next.presets;
    history.current = EMPTY_HISTORY;
    failures.current = 0;
    setCurrentName(null);
    setSimplified(false);
    const pending = readStorage(PENDING_KEY);
    const avoid = pending === null ? -1 : next.presets.findIndex((p) => p.path === pending);
    if (avoid >= 0) {
      setNotice(
        `"${next.presets[avoid]!.name}" önceki açılışta yüklenirken program kapandı; atlandı.`,
      );
      markPending(null);
    } else {
      setNotice(next.error);
    }
    const step = historyNext(EMPTY_HISTORY, next.presets.length, Math.random, avoid);
    if (!step) {
      setRequest(null);
      return;
    }
    history.current = step.history;
    serial.current += 1;
    setRequest({
      serial: serial.current,
      entry: next.presets[step.index]!,
      blendSeconds: blendSeconds(true),
    });
  }, []);

  // Liste bir kez, sahne ilk kez açılınca okunur (sonra klasör seçilince yenilenir).
  useEffect(() => {
    if (!active || listed.current) return;
    listed.current = true;
    getMilkdropFolder()
      .then(install)
      .catch((error: unknown) => setNotice(`Görsel klasörü okunamadı: ${describeError(error)}`))
      .finally(() => setFetched(true));
  }, [active, install]);
  const loading = choosing || (active && !fetched);

  const go = useCallback(
    (step: { history: PresetHistory; index: number } | null, manual: boolean) => {
      const entry = step ? presets.current[step.index] : undefined;
      if (!step || !entry) return;
      history.current = step.history;
      serial.current += 1;
      setRequest({ serial: serial.current, entry, blendSeconds: blendSeconds(manual) });
    },
    [],
  );

  const next = useCallback(() => {
    failures.current = 0;
    setNotice(null);
    go(historyNext(history.current, presets.current.length), true);
  }, [go]);

  const previous = useCallback(() => {
    failures.current = 0;
    setNotice(null);
    go(historyPrevious(history.current), true);
  }, [go]);

  const advance = useCallback(() => {
    go(historyNext(history.current, presets.current.length), false);
  }, [go]);

  const loaded = useCallback((done: number, name: string, isSimplified: boolean) => {
    if (done !== serial.current) return;
    failures.current = 0;
    setCurrentName(name);
    setSimplified(isSimplified);
    // Bilgi (ör. atlanan görsel) kullanıcı başka bir görsel seçene kadar kalır.
  }, []);

  const failed = useCallback(
    (done: number, message: string) => {
      if (done !== serial.current) return;
      failures.current += 1;
      if (failures.current >= MAX_FAILURES || presets.current.length < 2) {
        setNotice(`Görsel açılamadı: ${message}`);
        return;
      }
      setNotice(`Görsel açılamadı, sonrakine geçildi: ${message}`);
      go(historyNext(history.current, presets.current.length), true);
    },
    [go],
  );

  const chooseFolder = useCallback(async () => {
    try {
      const path = await pickMilkdropFolder();
      if (!path) return;
      setChoosing(true);
      listed.current = true;
      install(await setMilkdropFolder(path));
      setFetched(true);
    } catch (error) {
      setNotice(`Klasör açılamadı: ${describeError(error)}`);
    } finally {
      setChoosing(false);
    }
  }, [install]);

  const setAuto = useCallback((value: boolean) => {
    setAutoState(value);
    writeStorage(AUTO_KEY, value ? "1" : "0");
  }, []);

  return useMemo(
    () => ({
      library,
      loading,
      request,
      currentName,
      simplified,
      notice,
      auto,
      setAuto,
      chooseFolder,
      next,
      previous,
      advance,
      loaded,
      failed,
    }),
    [
      library,
      loading,
      request,
      currentName,
      simplified,
      notice,
      auto,
      setAuto,
      chooseFolder,
      next,
      previous,
      advance,
      loaded,
      failed,
    ],
  );
}
