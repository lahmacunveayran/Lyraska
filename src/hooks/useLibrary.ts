import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAppInfo,
  EMPTY_LIBRARY,
  addDroppedPaths,
  addLibraryFolder,
  errorMessage,
  getLibraryStatus,
  isDesktop,
  logFrontendError,
  onLibraryChanged,
  pickAudioFiles,
  pickFolder,
  removeLibraryFolder,
  removeMissingTracks,
  rescanLibrary,
  searchLibrary,
  type DropOutcome,
  type LibraryStatus,
  type LibraryTrack,
} from "../lib/backend";
import { analysisPending, analysisRefreshKey } from "../lib/analysis";

/** Tarama sürerken durum sorgulama aralığı. */
const SCAN_POLL_MS = 600;
/** Arka plan analizi sürerken durum sorgulama aralığı (BPM sütunu dolsun). */
const ANALYSIS_POLL_MS = 3000;
/** Yazmayı bitirmeyi beklemeden aramaya başlamak için kısa gecikme. */
const SEARCH_DELAY_MS = 120;

export interface LibraryControls {
  status: LibraryStatus;
  tracks: LibraryTrack[];
  /**
   * Aramadan bağımsız bütün şarkılar (albüm sayfası, küçük kapaklar). Arama boşken `tracks` ile
   * aynı liste; arama sürerken yalnızca kütüphane değişince (`refreshKey`) yeniden sorulur.
   */
  allTracks: LibraryTrack[];
  /** Kütüphane değişince (tarama, analiz ilerledi, çekirdek haber verdi) değişir; aramayla değil. */
  refreshKey: string;
  query: string;
  setQuery: (query: string) => void;
  /** İlk yükleme sürüyor. */
  loading: boolean;
  error: string | null;
  /** Kütüphane açılamadı (nedeni); program yeniden açılana kadar şarkı eklenemez. */
  unavailable: string | null;
  addFolder: () => Promise<void>;
  /** Şarkı seçme penceresini açar; seçilen şarkıları tek tek kütüphaneye ekler. */
  addFiles: (extensions: string[]) => Promise<void>;
  /** Pencereye bırakılan şarkıları ve klasörleri ekler; sonucu döndürür (hata fırlatabilir). */
  addDropped: (paths: string[]) => Promise<DropOutcome>;
  removeFolder: (id: number) => Promise<void>;
  rescan: () => Promise<void>;
  /** Kaynağın bulunamayan şarkılarını kütüphaneden çıkarır ("Yine de çıkar"). */
  removeMissing: (folderId: number) => Promise<void>;
  /** Listeyi yeniden sorar (ör. şarkıya kapak seçildi: satırların bilgisi değişti). */
  refresh: () => void;
}

/**
 * Kütüphane durumu ve arama. Tarama sürerken durumu düzenli sorar ve şarkı
 * sayısı değiştikçe listeyi tazeler.
 */
export function useLibrary(): LibraryControls {
  const available = isDesktop();
  const [status, setStatus] = useState<LibraryStatus>(EMPTY_LIBRARY);
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(available);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const searchSeq = useRef(0);
  // Çekirdek kütüphanenin kendiliğinden değiştiğini bildirdikçe artar: şarkı sayısı aynı kalsa da
  // (ör. bir şarkının etiketi düzenlendi) liste tazelenir.
  const [revision, setRevision] = useState(0);
  // Bütün şarkılar ve hangi kütüphane durumunda alındıkları.
  const [all, setAll] = useState<{ key: string; tracks: LibraryTrack[] }>({ key: "", tracks: [] });
  const allSeq = useRef(0);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getLibraryStatus());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  // Açılışta durumu al. Alınamıyorsa kütüphane açılamamıştır (çekirdek yeniden denemez):
  // kullanıcıya görünür biçimde söylenir.
  useEffect(() => {
    if (!available) return;
    getLibraryStatus()
      .then(setStatus)
      .catch((e) => setUnavailable(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [available]);

  // Analiz ilerledikçe BPM sütunu dolsun diye liste ara ara tazelenir.
  const analysisKey = analysisRefreshKey(status.analyzed, status.trackCount);
  const refreshKey = `${status.trackCount}:${analysisKey}:${revision}`;

  // Arama: yazı ya da şarkı sayısı değişince (tarama ilerledikçe) listeyi tazele.
  // Yalnızca en son aramanın sonucu uygulanır.
  useEffect(() => {
    if (!available || unavailable) return;
    const seq = ++searchSeq.current;
    const timer = window.setTimeout(() => {
      searchLibrary(query)
        .then((result) => {
          if (seq !== searchSeq.current) return;
          setTracks(result);
          // Boş arama bütün kütüphanedir: ayrıca sorulmaz.
          if (query === "") {
            allSeq.current++;
            setAll({ key: refreshKey, tracks: result });
          }
        })
        .catch((e) => setError(errorMessage(e)));
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [available, unavailable, query, refreshKey]);

  // Arama sürerken bütün şarkılar yalnızca kütüphane değişince (ya da hiç alınmadıysa) sorulur;
  // her tuşta değil.
  const searching = query !== "";
  const allKey = all.key;
  useEffect(() => {
    if (!available || unavailable || !searching || allKey === refreshKey) return;
    const seq = ++allSeq.current;
    searchLibrary("")
      .then((result) => {
        if (seq === allSeq.current) setAll({ key: refreshKey, tracks: result });
      })
      .catch((e) => setError(errorMessage(e)));
  }, [available, unavailable, searching, allKey, refreshKey]);

  // İzlenen klasörlere eklenen, silinen şarkılar: çekirdek taradıktan sonra haber verir; durum
  // ve liste kullanıcı bir şey yapmadan tazelenir.
  useEffect(() => {
    if (!available || unavailable) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    onLibraryChanged(() => {
      setRevision((r) => r + 1);
      void refreshStatus();
    })
      .then((fn) => (cancelled ? fn() : (unlisten = fn)))
      .catch((e) => {
        logFrontendError(`Kütüphane değişiklikleri dinlenemedi: ${errorMessage(e)}`).catch(() => {
          /* Günlüğe yazılamazsa yapılacak bir şey yok. */
        });
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [available, unavailable, refreshStatus]);

  // Tarama sürerken ilerlemeyi izle.
  const scanning = status.scan.scanning;
  useEffect(() => {
    if (!available || !scanning) return;
    const timer = window.setInterval(() => void refreshStatus(), SCAN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [available, scanning, refreshStatus]);

  // Arka plan analizi sürerken ilerlemeyi izle (tarama yokken, daha seyrek).
  const analyzing = analysisPending(status.analyzed, status.trackCount);
  useEffect(() => {
    if (!available || scanning || !analyzing) return;
    const timer = window.setInterval(() => void refreshStatus(), ANALYSIS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [available, scanning, analyzing, refreshStatus]);

  const apply = useCallback(async (action: () => Promise<LibraryStatus>) => {
    try {
      setStatus(await action());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  const addFolder = useCallback(async () => {
    if (!available) return;
    try {
      const path = await pickFolder();
      if (path) await apply(() => addLibraryFolder(path));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [available, apply]);

  const addDropped = useCallback(
    async (paths: string[]) => {
      const outcome = await addDroppedPaths(paths);
      await refreshStatus();
      return outcome;
    },
    [refreshStatus],
  );

  const addFiles = useCallback(
    async (extensions: string[]) => {
      if (!available) return;
      let paths: string[];
      try {
        // Uzantı listesi henüz gelmediyse önce program bilgisini al (süzgeçsiz pencere açılmasın).
        const filters =
          extensions.length > 0 ? extensions : (await getAppInfo()).supportedExtensions;
        paths = await pickAudioFiles(filters);
      } catch (e) {
        setError(errorMessage(e));
        return;
      }
      // Biri eklenemese de (ör. zaten kütüphanede) diğerleri eklenir; son sorun gösterilir.
      let problem: string | null = null;
      for (const path of paths) {
        try {
          setStatus(await addLibraryFolder(path));
        } catch (e) {
          problem = errorMessage(e);
        }
      }
      if (paths.length > 0) setError(problem);
    },
    [available],
  );

  const removeFolder = useCallback((id: number) => apply(() => removeLibraryFolder(id)), [apply]);
  const rescan = useCallback(() => apply(rescanLibrary), [apply]);
  const removeMissing = useCallback(
    (folderId: number) => apply(() => removeMissingTracks(folderId)),
    [apply],
  );
  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  return {
    status,
    tracks,
    allTracks: all.tracks,
    refreshKey,
    query,
    setQuery,
    loading,
    error,
    unavailable,
    addFolder,
    addFiles,
    addDropped,
    removeFolder,
    rescan,
    removeMissing,
    refresh,
  };
}
