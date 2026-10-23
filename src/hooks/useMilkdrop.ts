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
  addSkipped,
  blendSeconds,
  clearSkipList,
  historyNext,
  historyPrevious,
  loadSkipList,
  readPending,
  writePending,
  type PresetHistory,
} from "../lib/milkdrop";

/** Sahneye "şu görseli şu harmanlamayla aç" isteği; her istek yeni bir `serial` taşır. */
export interface MilkdropRequest {
  serial: number;
  entry: MilkdropEntry;
  /** Harmanlama süresi (saniye); önceki görsel yoksa sahne bunu yok sayar. */
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
  /** Sade hâlin nedeni (ör. çekirdeğin `shaderError`'ı); galeride kısa not. */
  shaderNote: string | null;
  /** Kullanıcıya kısa bilgi (ör. açılamayan ya da atlanan görsel). */
  notice: string | null;
  /** Bu klasörde, önceki açılışlarda program onları çalarken kapandığı için atlanan görseller. */
  skippedCount: number;
  /** Atlananlar listesini boşaltır (kullanıcının açık seçimi); görseller yine seçilebilir. */
  retrySkipped: () => void;
  /** Müzikle kendiliğinden görsel değiştirme (hatırlanır). */
  auto: boolean;
  setAuto: (auto: boolean) => void;
  chooseFolder: () => Promise<void>;
  /** Kullanıcı: sonraki / önceki görsel. */
  next: () => void;
  previous: () => void;
  /** Sahne: müzikte uygun an geldi. */
  advance: () => void;
  /**
   * Sahne: istenen görsel açıldı / açılamadı ya da çizerken hata verdi. `skipPath` verilirse o
   * görsel kalıcı atlananlara da girer (ör. ekran kartını dondurdu); istek eskimiş olsa bile.
   */
  loaded: (serial: number, name: string, simplified: boolean, shaderNote?: string | null) => void;
  failed: (serial: number, message: string, skipPath?: string) => void;
}

const AUTO_KEY = "lyraska.milkdrop.auto";
/** Art arda bu kadar görsel açılamazsa kendiliğinden denemeyi bırakır. */
const MAX_FAILURES = 5;
const ALL_SKIPPED =
  "Bu klasördeki görsellerin hepsi atlandı (açılamadı ya da önceki açılışlarda program onları " +
  "çalarken kapandı). Atlananları yeniden deneyebilir ya da başka bir klasör seçebilirsiniz.";

function readAuto(): boolean {
  try {
    return window.localStorage.getItem(AUTO_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeAuto(value: boolean): void {
  try {
    window.localStorage.setItem(AUTO_KEY, value ? "1" : "0");
  } catch {
    /* Saklanamazsa bir sonraki açılışta varsayılanla (açık) başlar. */
  }
}

/** Dosya yolunun adı (bildirim için; listede yoksa). */
function fileName(path: string): string {
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.milk$/i, "");
}

/**
 * MilkDrop sahnesinin durumu (seçilen klasör, görsel listesi, çalan görsel, geçmiş). Galeri
 * paneli ve sahne aynı denetimleri paylaşır. Liste yalnızca sahne ilk kez açılınca okunur.
 *
 * Atlanan görseller: önceki açılışta program bir görseli çalarken kapandıysa (işareti kalmıştır,
 * bkz. `lib/milkdrop.ts`) o görsel kalıcı atlananlar listesine girer; bu oturumda açılamayan ya da
 * çizerken hata veren görseller de oturum boyunca atlanır. Atlananlar hiçbir zaman kendiliğinden
 * ya da "Sonraki" ile seçilmez; kullanıcı galeride "Atlananları yeniden dene" ile listeyi
 * boşaltabilir (kendi açık seçimi). Seçilebilecek görsel kalmadıysa hiçbiri açılmaz.
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
  const [shaderNote, setShaderNote] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>(loadSkipList);
  const [auto, setAutoState] = useState(readAuto);
  const history = useRef<PresetHistory>(EMPTY_HISTORY);
  const serial = useRef(0);
  const failures = useRef(0);
  const presets = useRef<MilkdropEntry[]>([]);
  /** Bu oturumda açılamayan ya da çizerken hata veren görseller (yolları). */
  const bad = useRef(new Set<string>());
  const skippedRef = useRef(skipped);
  const requested = useRef<MilkdropEntry | null>(null);

  /** Seçilmeyecek görsellerin listedeki sıraları. */
  const avoid = useCallback(() => {
    const paths = new Set([...skippedRef.current, ...bad.current]);
    const out = new Set<number>();
    presets.current.forEach((p, i) => {
      if (paths.has(p.path)) out.add(i);
    });
    return out;
  }, []);

  /** Görseli ister; seçilebilecek görsel yoksa hiçbirini (ve `false` döner). */
  const go = useCallback(
    (step: { history: PresetHistory; index: number } | null, manual: boolean) => {
      const entry = step ? presets.current[step.index] : undefined;
      if (!step || !entry) return false;
      history.current = step.history;
      serial.current += 1;
      requested.current = entry;
      setRequest({ serial: serial.current, entry, blendSeconds: blendSeconds(manual) });
      return true;
    },
    [],
  );

  /** Listeyi değiştirir ve ilk görseli ister. */
  const install = useCallback(
    (next: MilkdropFolder) => {
      setLibrary(next);
      presets.current = next.presets;
      history.current = EMPTY_HISTORY;
      failures.current = 0;
      setCurrentName(null);
      setSimplified(false);
      setShaderNote(null);
      setRequest(null);
      requested.current = null;
      // Önceki açılışta bir görsel çalarken program kapandıysa o görsel atlananlara girer.
      const pending = readPending();
      let message = next.error;
      if (pending !== null) {
        addSkipped(pending);
        writePending(null);
        const name = next.presets.find((p) => p.path === pending)?.name ?? fileName(pending);
        message = `"${name}" önceki açılışta çalarken program kapandı; atlananlara eklendi.`;
      }
      const list = loadSkipList();
      skippedRef.current = list;
      setSkipped(list);
      const chosen = go(
        historyNext(EMPTY_HISTORY, next.presets.length, Math.random, avoid()),
        true,
      );
      if (!chosen && next.presets.length > 0) message = ALL_SKIPPED;
      setNotice(message);
    },
    [avoid, go],
  );

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

  const next = useCallback(() => {
    failures.current = 0;
    setNotice(null);
    if (!go(historyNext(history.current, presets.current.length, Math.random, avoid()), true)) {
      if (presets.current.length > 0) setNotice(ALL_SKIPPED);
    }
  }, [avoid, go]);

  const previous = useCallback(() => {
    failures.current = 0;
    setNotice(null);
    go(historyPrevious(history.current), true);
  }, [go]);

  const advance = useCallback(() => {
    go(historyNext(history.current, presets.current.length, Math.random, avoid()), false);
  }, [avoid, go]);

  const loaded = useCallback(
    (done: number, name: string, isSimplified: boolean, note: string | null = null) => {
      if (done !== serial.current) return;
      failures.current = 0;
      setCurrentName(name);
      setSimplified(isSimplified);
      setShaderNote(isSimplified ? note : null);
      // Bilgi (ör. atlanan görsel) kullanıcı başka bir görsel seçene kadar kalır.
    },
    [],
  );

  const failed = useCallback(
    (done: number, message: string, skipPath?: string) => {
      if (skipPath !== undefined) {
        addSkipped(skipPath);
        bad.current.add(skipPath);
        const list = loadSkipList();
        // Depo yazılamadıysa da bu oturumda atlanır.
        skippedRef.current = list.includes(skipPath) ? list : [...list, skipPath];
        setSkipped(skippedRef.current);
      }
      if (done !== serial.current) {
        if (skipPath !== undefined) setNotice(`Görsel atlandı: ${message}`);
        return;
      }
      // Bu oturumda bir daha denenmez.
      if (requested.current) bad.current.add(requested.current.path);
      failures.current += 1;
      if (failures.current >= MAX_FAILURES) {
        setNotice(`Görsel açılamadı: ${message}`);
        return;
      }
      const moved = go(
        historyNext(history.current, presets.current.length, Math.random, avoid()),
        true,
      );
      setNotice(
        moved ? `Görsel açılamadı, sonrakine geçildi: ${message}` : `Görsel açılamadı: ${message}`,
      );
    },
    [avoid, go],
  );

  const retrySkipped = useCallback(() => {
    clearSkipList();
    skippedRef.current = [];
    setSkipped([]);
    bad.current.clear();
    failures.current = 0;
    setNotice(null);
    // Hiçbir görsel açık değilse (hepsi atlanmıştı) şimdi biri açılır.
    if (!requested.current) {
      go(historyNext(history.current, presets.current.length, Math.random, avoid()), true);
    }
  }, [avoid, go]);

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
    writeAuto(value);
  }, []);

  const skippedCount = useMemo(() => {
    const paths = new Set(skipped);
    return library.presets.filter((p) => paths.has(p.path)).length;
  }, [library, skipped]);

  return useMemo(
    () => ({
      library,
      loading,
      request,
      currentName,
      simplified,
      shaderNote,
      notice,
      skippedCount,
      retrySkipped,
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
      shaderNote,
      notice,
      skippedCount,
      retrySkipped,
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
