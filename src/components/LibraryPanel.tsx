import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  CloseIcon,
  FolderIcon,
  FolderPlusIcon,
  MusicPlusIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  SearchIcon,
} from "./icons";
import {
  clearAlbumCover,
  errorMessage,
  libraryAlbumTracks,
  libraryArtistTracks,
  pickImage,
  setAlbumCover,
  type LibraryAlbum,
  type LibraryArtist,
  type LibraryFolder,
  type LibraryTrack,
} from "../lib/backend";
import { AlbumGrid } from "./AlbumGrid";
import { ArtistGrid } from "./ArtistGrid";
import { useArtists } from "../hooks/useArtists";
import { invalidateAlbumCover } from "../lib/albumCovers";
import { useAlbums } from "../hooks/useAlbums";
import { analysisPending, bpmLabel } from "../lib/analysis";
import {
  DEFAULT_SORT,
  keyHue,
  keyText,
  nextSort,
  sortTracks,
  type LibrarySort,
  type SortKey,
} from "../lib/librarySort";
import { formatTime } from "../lib/format";
import { scrollToRow, visibleRange } from "../lib/virtual";
import type { LibraryControls } from "../hooks/useLibrary";

/** Satır yüksekliği (CSS'teki `--row-height` ile aynı olmalı). */
export const ROW_HEIGHT = 40;

/** DJ görünümü (tonlar Camelot koduyla) tercihinin tarayıcı deposundaki adı. */
const CAMELOT_KEY = "lyraska.library.camelot";

function loadCamelot(): boolean {
  try {
    return window.localStorage.getItem(CAMELOT_KEY) === "1";
  } catch {
    return false;
  }
}

function saveCamelot(value: boolean) {
  try {
    window.localStorage.setItem(CAMELOT_KEY, value ? "1" : "0");
  } catch {
    // Depo kapalıysa tercih yalnızca bu oturumda geçerli olur.
  }
}

const NUMBER = new Intl.NumberFormat("tr-TR");

export interface LibraryPanelProps {
  library: LibraryControls;
  available: boolean;
  /** "Şarkı ekle" penceresinde gösterilecek uzantılar. */
  extensions: string[];
  /** Çalan şarkının yolu (listede vurgulanır). */
  currentPath: string | null;
  playing: boolean;
  onPlay: (track: LibraryTrack, list: LibraryTrack[]) => void;
  /** Albümü baştan çalar (şarkı yolları çalma sırasıyla). */
  onPlayPaths: (paths: string[]) => void;
}

/** Klasör yolunun son parçası ("D:\Müzik\Rock" → "Rock"). */
export function folderName(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * Kaynakları ayırır: klasörler tek tek gösterilir, tek tek eklenen şarkılar tek grupta toplanır;
 * her şarkı ayrı kutucuk olmaz. Hangisinin tek şarkı olduğunu çekirdek bilir (`single`); henüz
 * taranmamış (şarkısı olmayan) kaynakta uzantıya bakılır.
 */
export function splitSources(
  sources: LibraryFolder[],
  extensions: string[],
): { folders: LibraryFolder[]; files: LibraryFolder[] } {
  const known = new Set(extensions.map((e) => e.toLowerCase()));
  const isFile = (path: string) => {
    const name = folderName(path);
    const dot = name.lastIndexOf(".");
    return dot > 0 && known.has(name.slice(dot + 1).toLowerCase());
  };
  const single = (s: LibraryFolder) => s.single || (s.trackCount === 0 && isFile(s.path));
  return {
    folders: sources.filter((s) => !single(s)),
    files: sources.filter(single),
  };
}

/** Bekleme bunu aşmazsa yer tutucu gösterilmez (kısa yüklemede yanıp sönme olmasın). */
const LOADING_DELAY_MS = 1000;

/** Uzayan yüklemede hareketsiz, soluk kart iskeletleri (animasyon yok: parlama ve hareket güvenli). */
function LoadingGrid({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), LOADING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div role="status" aria-label={`${label}…`}>
      <ul className="albums library__skeleton" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <li key={i} className="album">
            <div className="album__cover" />
            <span className="library__skeleton-line" />
          </li>
        ))}
      </ul>
    </div>
  );
}

const VIEW_TITLES = { songs: "Şarkılar", albums: "Albümler", artists: "Sanatçılar" } as const;

/** Kaynakların kısa özeti: "Müzik klasörü · 5 tek şarkı", "3 klasör". */
export function sourcesLabel(folders: LibraryFolder[], files: number): string {
  const parts = [];
  if (folders.length === 1 && folders[0]) parts.push(`${folderName(folders[0].path)} klasörü`);
  else if (folders.length > 1) parts.push(`${NUMBER.format(folders.length)} klasör`);
  if (files > 0) parts.push(`${NUMBER.format(files)} tek şarkı`);
  return parts.join(" · ");
}

/** Kütüphane: arama, klasörler, tarama durumu ve şarkı listesi. */
/** Satırın belge kimliği (`aria-activedescendant` için). */
function rowId(trackId: number): string {
  return `library-row-${trackId}`;
}

export function LibraryPanel({
  library,
  available,
  extensions,
  currentPath,
  playing,
  onPlay,
  onPlayPaths,
}: LibraryPanelProps) {
  const { status, query } = library;
  const [view, setView] = useState<"songs" | "albums" | "artists">("songs");
  const { albums, error: albumsError } = useAlbums(view === "albums", query, library.tracks);
  const { artists, error: artistsError } = useArtists(view === "artists", query, library.tracks);
  const current = useMemo(
    () => library.tracks.find((track) => track.path === currentPath) ?? null,
    [library.tracks, currentPath],
  );
  const [albumError, setAlbumError] = useState<string | null>(null);
  // Albüm açılırken ikinci tık (çift tık) albümü ikinci kez başlatmasın.
  const startingAlbum = useRef(false);
  // Kapak seçilince ızgara yeniden çizilsin (kapağın kimliği değişti).
  const [, setCoverRevision] = useState(0);
  const changeCover = (album: LibraryAlbum, path: string | null) => {
    const action = path
      ? setAlbumCover(album.name, album.artist, path)
      : clearAlbumCover(album.name, album.artist);
    void action
      .then(() => {
        invalidateAlbumCover(album.name, album.artist);
        setCoverRevision((n) => n + 1);
        setAlbumError(null);
      })
      .catch((e) => setAlbumError(errorMessage(e)));
  };
  const chooseCover = (album: LibraryAlbum) => {
    void pickImage()
      .then((path) => {
        if (path) changeCover(album, path);
      })
      .catch((e) => setAlbumError(errorMessage(e)));
  };
  /** Albümü ya da sanatçıyı baştan çalar; ikinci tık (çift tık) ikinci kez başlatmaz. */
  const playGroup = (load: () => Promise<string[]>, name: string) => {
    if (startingAlbum.current) return;
    startingAlbum.current = true;
    void load()
      .then((paths) => {
        setAlbumError(paths.length > 0 ? null : `“${name}” için şarkı bulunamadı.`);
        if (paths.length > 0) onPlayPaths(paths);
      })
      .catch((e) => setAlbumError(errorMessage(e)))
      .finally(() => {
        startingAlbum.current = false;
      });
  };
  const playAlbum = (album: LibraryAlbum) =>
    playGroup(() => libraryAlbumTracks(album.name, album.artist), album.name);
  const playArtist = (artist: LibraryArtist) =>
    playGroup(() => libraryArtistTracks(artist.name), artist.name);
  const [sort, setSort] = useState<LibrarySort>(DEFAULT_SORT);
  const [camelot, setCamelot] = useState(loadCamelot);
  const sources = useMemo(
    () => splitSources(status.folders, extensions),
    [status.folders, extensions],
  );
  // Tek tek eklenen şarkılar kaynak listesinde tek satırdır; seçilince liste yalnızca onları gösterir.
  const singles = useMemo(
    () => new Map(sources.files.map((file) => [file.path, file])),
    [sources.files],
  );
  const [singlesView, setSinglesView] = useState(false);
  const onlySingles = singlesView && singles.size > 0;
  // Tek eklenenlerin hepsi çıkarılınca süzgeç kapanır; sonra eklenen şarkı onu kendiliğinden açmaz.
  // (Çizim sırasında düzeltilir: React'in önerdiği türetilmiş durum kalıbı.)
  if (singlesView && singles.size === 0) setSinglesView(false);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const tracks = useMemo(() => {
    const sorted = sortTracks(library.tracks, sort);
    return onlySingles ? sorted.filter((track) => singles.has(track.path)) : sorted;
  }, [library.tracks, sort, onlySingles, singles]);
  // Seçim şarkının kimliğiyle tutulur: arka plan analizi listeyi yeniden sıralasa da seçili
  // şarkı aynı kalır (Enter başka şarkıyı çalmaz).
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Arama sonucu küçülünce seçili şarkı listede olmayabilir: o zaman seçim yok sayılır
  // (Enter olmayan şarkıyı çalmaya kalkmaz, `aria-selected` yanlış satıra düşmez) (ARA-03).
  const selected = useMemo(
    () => (selectedId === null ? -1 : tracks.findIndex((t) => t.id === selectedId)),
    [tracks, selectedId],
  );
  const setSelected = (index: number) => setSelectedId(tracks[index]?.id ?? null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(400);
  const listRef = useRef<HTMLDivElement>(null);
  const sourcesRef = useRef<HTMLDetailsElement>(null);
  const addMenuRef = useRef<HTMLDetailsElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // Kısayollar (yalnızca kütüphane görünürken): Ctrl+F / Ctrl+K arama, Ctrl+1/2/3 görünüm.
  // Rakam tuşları tek başına sahne değiştirir; burada yalnızca Ctrl ile birlikte kullanılır.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const section = sectionRef.current;
      if (!section || section.closest("[hidden], [inert]")) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "f" || key === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      const views = ["songs", "albums", "artists"] as const;
      const view = views[Number(event.key) - 1];
      if (view) {
        event.preventDefault();
        setView(view);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Açılır listeler (kaynaklar, müzik ekle) dışına tıklanınca ya da Esc'e basılınca kapanır.
  useEffect(() => {
    const close = (event: Event) => {
      for (const details of [sourcesRef.current, addMenuRef.current]) {
        if (!details?.open) continue;
        // Panel gizliyken (başka sekme, çekmece kapalı) açık kalan liste sessizce kapanır; Esc'i
        // yutmaz.
        if (details.closest("[hidden], [inert]")) {
          details.open = false;
          continue;
        }
        if (event instanceof window.KeyboardEvent) {
          if (event.key !== "Escape") continue;
          event.preventDefault();
        } else if (event.target instanceof Node && details.contains(event.target)) {
          continue;
        }
        details.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close, true);
    };
  }, []);

  // Liste yüksekliğini izle (pencere boyutu değişince).
  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const update = () => setViewport(element.clientHeight || 400);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const select = (index: number) => {
    const clamped = Math.max(0, Math.min(tracks.length - 1, index));
    setSelected(clamped);
    const element = listRef.current;
    if (!element) return;
    const target = scrollToRow(clamped, element.scrollTop, element.clientHeight, ROW_HEIGHT);
    if (target !== null) element.scrollTop = target;
  };

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    // Satırdaki bir düğmede (ör. ×) basılan tuş o düğmenindir.
    if (event.target !== event.currentTarget) return;
    if (tracks.length === 0) return;
    const page = Math.max(1, Math.floor(viewport / ROW_HEIGHT) - 1);
    const moves: Record<string, number> = {
      ArrowDown: 1,
      ArrowUp: -1,
      PageDown: page,
      PageUp: -page,
    };
    if (event.key in moves) {
      event.preventDefault();
      select((selected < 0 ? -1 : selected) + moves[event.key]!);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      select(event.key === "Home" ? 0 : tracks.length - 1);
    } else if (event.key === "Enter") {
      const track = tracks[selected];
      if (!track) return;
      event.preventDefault();
      onPlay(track, tracks);
    }
  };

  const changeSort = (key: SortKey) => {
    setSort((current) => nextSort(current, key));
    setSelected(-1);
  };

  const sortHeader = (key: SortKey, label: string, className?: string, title?: string) => {
    const active = sort.key === key;
    return (
      <span
        role="columnheader"
        className={className}
        aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}
      >
        <button
          type="button"
          className={`library__sort${active ? " is-active" : ""}`}
          onClick={() => changeSort(key)}
          title={title ? `${title} · sıralamak için tıklayın` : "Sıralamak için tıklayın"}
        >
          {label}
          {active && <span aria-hidden>{sort.descending ? " ↓" : " ↑"}</span>}
        </button>
      </span>
    );
  };

  /** Menüden seçilen işi yapar ve menüyü kapatır. */
  const runMenu = (menu: { current: HTMLDetailsElement | null }, action: () => void) => {
    if (menu.current) menu.current.open = false;
    action();
  };

  const closeSources = () => {
    if (sourcesRef.current) sourcesRef.current.open = false;
    setConfirmRemove(null);
  };

  const showSingles = (on: boolean) => {
    setSinglesView(on);
    // Tek eklenenler şarkı listesinde süzülür.
    if (on) setView("songs");
    setSelected(-1);
    closeSources();
  };

  const removeButton = (source: LibraryFolder, onRemove?: () => void) => (
    <button
      type="button"
      className="library__remove"
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (onRemove) onRemove();
        else void library.removeFolder(source.id);
      }}
      aria-label={`Kütüphaneden çıkar: ${source.path}`}
      title="Kütüphaneden çıkar (dosyalar silinmez)"
    >
      <CloseIcon />
    </button>
  );

  const toggleCamelot = () => {
    setCamelot((value) => {
      saveCamelot(!value);
      return !value;
    });
  };

  const range = visibleRange(scrollTop, viewport, ROW_HEIGHT, tracks.length);
  const scan = status.scan;
  const noFolders = status.folders.length === 0;
  const analyzing = analysisPending(status.analyzed, status.trackCount);
  // Kütüphane açılamadıysa ekleme düğmeleri kapalıdır (çalışmazlar); nedeni uyarıda yazar.
  const usable = available && !library.unavailable;
  // Açılamamış kütüphanede her işlem aynı hatayı verir: bir kez, uyarının içinde gösterilir.
  const problems = [...status.problems, ...(library.error && usable ? [library.error] : [])];

  return (
    <section className="library" aria-label="Kütüphane" ref={sectionRef}>
      <header className="library__header">
        <h2 className="library__title">
          {VIEW_TITLES[view]}
          <span className="library__count">
            {view === "albums"
              ? albums === null
                ? "…"
                : `${NUMBER.format(albums.length)} albüm`
              : view === "artists"
                ? artists === null
                  ? "…"
                  : `${NUMBER.format(artists.length)} sanatçı`
                : `${NUMBER.format(status.trackCount)} şarkı`}
          </span>
        </h2>
        <div className="library__views" role="group" aria-label="Kütüphane görünümü">
          {(
            [
              ["songs", "Şarkılar"],
              ["albums", "Albümler"],
              ["artists", "Sanatçılar"],
            ] as const
          ).map(([id, label], index) => (
            <button
              key={id}
              type="button"
              title={`${label} (Ctrl+${index + 1})`}
              aria-pressed={view === id}
              className={`library__view${view === id ? " is-on" : ""}`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {status.folders.length > 0 && (
          <details
            className="library__sources"
            ref={sourcesRef}
            onToggle={(event) => {
              if (!event.currentTarget.open) setConfirmRemove(null);
            }}
          >
            <summary title="Kütüphaneye eklenen klasörler ve şarkılar">
              <FolderIcon />
              {sourcesLabel(sources.folders, sources.files.length)}
            </summary>
            <div className="library__sources-menu" aria-label="Eklenen klasörler ve şarkılar">
              {sources.folders.length > 0 && (
                <ul>
                  {sources.folders.map((folder) => (
                    <li key={folder.id} className="library__source">
                      <span className="library__source-text">
                        <span className="library__source-name">{folderName(folder.path)}</span>
                        <span className="library__source-path">{folder.path}</span>
                      </span>
                      <span className="library__source-count">
                        {NUMBER.format(folder.trackCount)}
                      </span>
                      {confirmRemove === folder.id ? (
                        <span className="library__confirm">
                          Kaldırılsın mı?
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmRemove(null);
                              void library.removeFolder(folder.id);
                            }}
                          >
                            Evet
                          </button>
                          <button type="button" onClick={() => setConfirmRemove(null)}>
                            Vazgeç
                          </button>
                        </span>
                      ) : (
                        removeButton(folder, () => setConfirmRemove(folder.id))
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {sources.files.length > 0 && (
                <button
                  type="button"
                  className="library__source library__source--singles"
                  onClick={() => showSingles(true)}
                >
                  <span className="library__source-text">
                    <span className="library__source-name">Tek tek eklenenler</span>
                    <span className="library__source-path">
                      {NUMBER.format(sources.files.length)} şarkı · listede göster
                    </span>
                  </span>
                  <span aria-hidden>→</span>
                </button>
              )}
              <button
                type="button"
                className="library__source library__source--action"
                onClick={() => {
                  closeSources();
                  void library.rescan();
                }}
                disabled={!usable || scan.scanning}
                aria-label="Kütüphaneyi yeniden tara"
              >
                <RefreshIcon />
                <span className="library__source-text">
                  <span className="library__source-name">
                    {scan.scanning ? "Taranıyor…" : "Şimdi yeniden tara"}
                  </span>
                  <span className="library__source-path">
                    Değişen, eklenen ve silinen şarkıları bulur
                  </span>
                </span>
              </button>
            </div>
          </details>
        )}
        {view === "songs" && (
          <button
            type="button"
            className={`hw-button hw-button--small library__toggle${camelot ? " is-on" : ""}`}
            aria-pressed={camelot}
            onClick={toggleCamelot}
            title="DJ görünümü: tonlar Camelot koduyla yazılır (ör. 8A = La minör)"
          >
            DJ görünümü
          </button>
        )}
        <label className="library__search">
          <SearchIcon />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => library.setQuery(e.target.value)}
            onKeyDown={(e) => {
              // İlk Esc aramayı temizler, ikincisi (kutu boşken) kütüphaneyi kapatır.
              if (e.key === "Escape" && query) {
                e.preventDefault();
                library.setQuery("");
              } else if (e.key === "Escape") {
                e.currentTarget.blur();
              }
            }}
            placeholder="Ara: şarkı, sanatçı, albüm (Ctrl+F)"
            aria-label="Kütüphanede ara"
            disabled={!usable || noFolders}
            spellCheck={false}
          />
          {onlySingles && (
            <button
              type="button"
              className="library__filter"
              onClick={() => showSingles(false)}
              title="Bütün şarkıları göster"
            >
              Kaynak: tek eklenenler
              <CloseIcon />
            </button>
          )}
        </label>
        <details className="library__add-menu" ref={addMenuRef}>
          <summary className="hw-button hw-button--small library__add" title="Müzik ekle">
            <FolderPlusIcon />
            <span>Müzik ekle</span>
            <span aria-hidden className="library__caret">
              ▾
            </span>
          </summary>
          <div className="library__menu-list">
            <button
              type="button"
              onClick={() => runMenu(addMenuRef, () => void library.addFolder())}
              disabled={!usable}
              aria-label="Klasör ekle"
            >
              <FolderPlusIcon />
              <span>
                Klasör ekle…
                <small>Önerilen: klasördeki şarkılar ve sonradan eklenenler</small>
              </span>
            </button>
            <button
              type="button"
              onClick={() => runMenu(addMenuRef, () => void library.addFiles(extensions))}
              disabled={!usable}
              aria-label="Şarkı ekle"
            >
              <MusicPlusIcon />
              <span>
                Tek tek şarkı ekle…
                <small>Birden fazla şarkı seçebilirsiniz</small>
              </span>
            </button>
            <p className="library__menu-note">
              Şarkıları ya da klasörleri pencereye sürükleyip de bırakabilirsiniz.
            </p>
          </div>
        </details>
      </header>

      {library.unavailable && (
        <div className="section-error library__unavailable" role="alert">
          <p className="section-error__title">Kütüphane açılamadı</p>
          <p className="section-error__text">
            Müzik dosyalarınıza bir şey olmadı: yalnızca Lyraska'nın şarkı listesini tuttuğu
            kütüphane dosyası okunamadı. Bu yüzden şimdilik şarkı eklenemiyor. Programı kapatıp
            yeniden açın; düzelmezse Ayarlar &gt; Hata günlüğü dosyasını bir hata kaydına ekleyin.
          </p>
          <p className="library__problem library__reason">Neden: {library.unavailable}</p>
        </div>
      )}

      {(scan.scanning || analyzing || problems.length > 0) && (
        <div className="library__notice" role="status">
          {scan.scanning && (
            <span>
              Taranıyor: {NUMBER.format(scan.processed)} / {NUMBER.format(scan.found)} dosya
              {scan.current ? ` · ${folderName(scan.current)}` : ""}
            </span>
          )}
          {!scan.scanning && analyzing && (
            <span title="Şarkılar arka planda, çalan şarkıyı yavaşlatmadan analiz ediliyor (tempo, ölçü, bölümler, drop). Biten şarkı bir daha analiz edilmez.">
              Şarkı haritası: {NUMBER.format(status.analyzed)} / {NUMBER.format(status.trackCount)}{" "}
              şarkı analiz edildi
            </span>
          )}
          {problems.map((problem) => (
            <span key={problem} className="library__problem">
              {problem}
            </span>
          ))}
        </div>
      )}

      {library.unavailable ? null : noFolders ? (
        <div className="library__empty">
          <p className="library__empty-title">Müziğinizi ekleyin</p>
          <p>
            <strong>Klasör ekle:</strong> klasördeki (alt klasörler dahil) bütün şarkılar eklenir.
            Bu pencerede şarkılar görünmez; klasörün içine girip "Klasör seç"e basmanız yeterli.
          </p>
          <p>
            <strong>Şarkı ekle:</strong> şarkıları (ör. mp3) tek tek ya da birkaçını birden seçip
            eklersiniz. Şarkıları ya da klasörleri bu pencereye sürükleyip de bırakabilirsiniz.
            Dosyalarınız yerinden oynamaz, internet gerekmez.
          </p>
          <div className="library__empty-actions">
            <button
              type="button"
              className="hw-button hw-button--primary"
              onClick={() => void library.addFolder()}
              disabled={!available}
            >
              <FolderPlusIcon />
              <span>Klasör ekle</span>
            </button>
            <button
              type="button"
              className="hw-button hw-button--primary"
              onClick={() => void library.addFiles(extensions)}
              disabled={!available}
            >
              <MusicPlusIcon />
              <span>Şarkı ekle</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {view === "artists" && (
            <div className="library__albums">
              {artistsError || albumError ? (
                <p className="library__problem" role="alert">
                  {artistsError ?? albumError}
                </p>
              ) : null}
              {artists === null ? (
                <LoadingGrid label="Sanatçılar yükleniyor" />
              ) : artists.length === 0 ? (
                <p className="library__none">
                  {query ? `“${query}” için sanatçı yok.` : "Sanatçı etiketi olan şarkı yok."}
                </p>
              ) : (
                <ArtistGrid artists={artists} current={current} onPlay={playArtist} />
              )}
            </div>
          )}
          {view === "albums" && (
            <div className="library__albums">
              {albumsError || albumError ? (
                <p className="library__problem" role="alert">
                  {albumsError ?? albumError}
                </p>
              ) : null}
              {albums === null ? (
                <LoadingGrid label="Albümler yükleniyor" />
              ) : albums.length === 0 ? (
                <p className="library__none">
                  {query ? `“${query}” için albüm yok.` : "Albüm etiketi olan şarkı yok."}
                </p>
              ) : (
                <AlbumGrid
                  albums={albums}
                  current={current}
                  onPlay={playAlbum}
                  onChooseCover={chooseCover}
                  onClearCover={(album) => changeCover(album, null)}
                />
              )}
            </div>
          )}
          <div
            className="library__table"
            role="grid"
            aria-rowcount={tracks.length}
            hidden={view !== "songs"}
          >
            <div
              className={`library__row library__row--head${onlySingles ? " library__row--removable" : ""}`}
              role="row"
            >
              <span role="columnheader">#</span>
              {sortHeader("title", "Başlık")}
              {sortHeader("artist", "Sanatçı", undefined, "Sanatçı, albüm ve parça sırasıyla")}
              {sortHeader("album", "Albüm", "library__album")}
              {sortHeader("bpm", "BPM", "library__time library__bpm", "Tempo (vuruş/dakika)")}
              {sortHeader(
                "key",
                "Ton",
                "library__key",
                "Ton; Camelot çarkının sırasıyla dizilir, uyumlu tonlar yan yana gelir",
              )}
              {sortHeader("duration", "Süre", "library__time")}
              {onlySingles && <span role="columnheader" aria-label="Çıkar" />}
            </div>
            <div
              ref={listRef}
              className="library__list"
              tabIndex={0}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              onKeyDown={onListKey}
              aria-label="Şarkılar"
              aria-activedescendant={
                selected >= 0 && tracks[selected] ? rowId(tracks[selected].id) : undefined
              }
            >
              {tracks.length === 0 ? (
                <p className="library__none">
                  {query
                    ? `“${query}” için sonuç yok.`
                    : scan.scanning
                      ? "Taranıyor…"
                      : "Şarkı yok."}
                </p>
              ) : (
                <div style={{ height: tracks.length * ROW_HEIGHT, position: "relative" }}>
                  {tracks.slice(range.start, range.end).map((track, offset) => {
                    const index = range.start + offset;
                    const isCurrent = track.path === currentPath;
                    const hue = keyHue(track.key);
                    const single = onlySingles ? singles.get(track.path) : undefined;
                    return (
                      <div
                        key={track.id}
                        id={rowId(track.id)}
                        role="row"
                        aria-rowindex={index + 1}
                        aria-selected={index === selected}
                        className={`library__row${onlySingles ? " library__row--removable" : ""}${isCurrent ? " is-current" : ""}${index === selected ? " is-selected" : ""}`}
                        style={{ transform: `translateY(${index * ROW_HEIGHT}px)` }}
                        onClick={() => setSelected(index)}
                        onDoubleClick={() => onPlay(track, tracks)}
                        title={track.path}
                      >
                        <span className="library__no" role="gridcell">
                          {isCurrent ? playing ? <PlayIcon /> : <PauseIcon /> : index + 1}
                        </span>
                        <span className="library__cell library__title-cell" role="gridcell">
                          {track.title}
                        </span>
                        <span className="library__cell library__muted" role="gridcell">
                          {track.artist ?? "—"}
                        </span>
                        <span
                          className="library__cell library__muted library__album"
                          role="gridcell"
                        >
                          {track.album ?? "—"}
                        </span>
                        <span
                          className="library__time library__bpm"
                          role="gridcell"
                          title={track.analyzed ? undefined : "Analiz bekliyor"}
                        >
                          {bpmLabel(track)}
                        </span>
                        <span
                          className="library__key"
                          role="gridcell"
                          title={track.analyzed ? undefined : "Analiz bekliyor"}
                        >
                          {hue !== null && (
                            <i
                              className="library__key-dot"
                              style={{ background: `var(--key-${hue})` }}
                              aria-hidden
                            />
                          )}
                          {keyText(track, camelot)}
                        </span>
                        <span className="library__time" role="gridcell">
                          {track.durationSecs ? formatTime(track.durationSecs) : ""}
                        </span>
                        {onlySingles && (
                          <span role="gridcell">{single && removeButton(single)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
