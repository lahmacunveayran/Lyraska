import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  CloseIcon,
  FolderPlusIcon,
  MusicPlusIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  SearchIcon,
} from "./icons";
import type { LibraryFolder, LibraryTrack } from "../lib/backend";
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
}

/** Klasör yolunun son parçası ("D:\Müzik\Rock" → "Rock"). */
export function folderName(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * Kaynakları ayırır: klasörler tek tek gösterilir, tek tek eklenen şarkılar (yolu desteklenen bir
 * ses uzantısıyla biten kaynaklar) tek grupta toplanır; her şarkı ayrı kutucuk olmaz.
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
  return {
    folders: sources.filter((s) => !isFile(s.path)),
    files: sources.filter((s) => isFile(s.path)),
  };
}

/** Kaynakların kısa özeti: "2 klasör · 5 şarkı". */
export function sourcesLabel(folders: number, files: number): string {
  const parts = [];
  if (folders > 0) parts.push(`${NUMBER.format(folders)} klasör`);
  if (files > 0) parts.push(`${NUMBER.format(files)} şarkı`);
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
}: LibraryPanelProps) {
  const { status, query } = library;
  const [sort, setSort] = useState<LibrarySort>(DEFAULT_SORT);
  const [camelot, setCamelot] = useState(loadCamelot);
  const tracks = useMemo(() => sortTracks(library.tracks, sort), [library.tracks, sort]);
  const [selectedIndex, setSelected] = useState(-1);
  // Arama sonucu küçülünce eski seçim listenin dışında kalabilir: o zaman seçim yok sayılır
  // (Enter olmayan şarkıyı çalmaya kalkmaz, `aria-selected` yanlış satıra düşmez) (ARA-03).
  const selected = selectedIndex < tracks.length ? selectedIndex : -1;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(400);
  const listRef = useRef<HTMLDivElement>(null);
  const sourcesRef = useRef<HTMLDetailsElement>(null);

  // Kaynak listesi dışına tıklanınca ya da Esc'e basılınca kapanır.
  useEffect(() => {
    const close = (event: Event) => {
      const details = sourcesRef.current;
      if (!details?.open) return;
      if (event instanceof window.KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.preventDefault();
      } else if (event.target instanceof Node && details.contains(event.target)) {
        return;
      }
      details.open = false;
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

  const sources = splitSources(status.folders, extensions);
  const removeButton = (source: LibraryFolder) => (
    <button
      type="button"
      onClick={() => void library.removeFolder(source.id)}
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
    <section className="library" aria-label="Kütüphane">
      <header className="library__header">
        <h2 className="library__title">
          Şarkılar
          <span className="library__count">{NUMBER.format(status.trackCount)} şarkı</span>
        </h2>
        {status.folders.length > 0 && (
          <details className="library__sources" ref={sourcesRef}>
            <summary title="Kütüphaneye eklenen klasörler ve şarkılar; görmek için tıklayın">
              {sourcesLabel(sources.folders.length, sources.files.length)}
            </summary>
            <div className="library__sources-menu" aria-label="Eklenen klasörler ve şarkılar">
              {sources.folders.length > 0 && (
                <>
                  <p className="library__sources-head">Klasörler</p>
                  <ul>
                    {sources.folders.map((folder) => (
                      <li key={folder.id} title={folder.path}>
                        <span>{folderName(folder.path)}</span>
                        {removeButton(folder)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {sources.files.length > 0 && (
                <>
                  <p className="library__sources-head">Tek tek eklenenler</p>
                  <ul>
                    {sources.files.map((file) => (
                      <li key={file.id} title={file.path}>
                        <span>{folderName(file.path)}</span>
                        {removeButton(file)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </details>
        )}
        <button
          type="button"
          className={`library__toggle${camelot ? " is-on" : ""}`}
          aria-pressed={camelot}
          onClick={toggleCamelot}
          title="DJ görünümü: tonlar Camelot koduyla yazılır (ör. 8A = La minör)"
        >
          DJ görünümü
        </button>
        <label className="library__search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(e) => library.setQuery(e.target.value)}
            placeholder="Ara: şarkı, sanatçı, albüm"
            aria-label="Kütüphanede ara"
            disabled={!usable || noFolders}
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          className="hw-button hw-button--small"
          onClick={() => void library.addFolder()}
          disabled={!usable}
          title="Klasördeki bütün şarkıları ekleyin"
          aria-label="Klasör ekle"
        >
          <FolderPlusIcon />
          <span>Klasör ekle</span>
        </button>
        <button
          type="button"
          className="hw-button hw-button--small"
          onClick={() => void library.addFiles(extensions)}
          disabled={!usable}
          title="Tek tek şarkı seçip ekleyin (birden fazla seçebilirsiniz)"
          aria-label="Şarkı ekle"
        >
          <MusicPlusIcon />
          <span>Şarkı ekle</span>
        </button>
        <button
          type="button"
          className="hw-button hw-button--small hw-button--icon"
          onClick={() => void library.rescan()}
          disabled={!usable || noFolders || scan.scanning}
          title="Kütüphaneyi yeniden tara"
          aria-label="Kütüphaneyi yeniden tara"
        >
          <RefreshIcon />
        </button>
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
        <div className="library__table" role="grid" aria-rowcount={tracks.length}>
          <div className="library__row library__row--head" role="row">
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
                {query ? `“${query}” için sonuç yok.` : scan.scanning ? "Taranıyor…" : "Şarkı yok."}
              </p>
            ) : (
              <div style={{ height: tracks.length * ROW_HEIGHT, position: "relative" }}>
                {tracks.slice(range.start, range.end).map((track, offset) => {
                  const index = range.start + offset;
                  const isCurrent = track.path === currentPath;
                  const hue = keyHue(track.key);
                  return (
                    <div
                      key={track.id}
                      id={rowId(track.id)}
                      role="row"
                      aria-rowindex={index + 1}
                      aria-selected={index === selected}
                      className={`library__row${isCurrent ? " is-current" : ""}${index === selected ? " is-selected" : ""}`}
                      style={{ transform: `translateY(${index * ROW_HEIGHT}px)` }}
                      onClick={() => setSelected(index)}
                      onDoubleClick={() => onPlay(track, tracks)}
                      title={track.path}
                    >
                      <span className="library__no" role="gridcell">
                        {isCurrent ? (
                          playing ? (
                            <PlayIcon />
                          ) : (
                            <PauseIcon />
                          )
                        ) : (
                          (track.trackNumber ?? "")
                        )}
                      </span>
                      <span className="library__cell" role="gridcell">
                        {track.title}
                      </span>
                      <span className="library__cell library__muted" role="gridcell">
                        {track.artist ?? "—"}
                      </span>
                      <span className="library__cell library__muted library__album" role="gridcell">
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
