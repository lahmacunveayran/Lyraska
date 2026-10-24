import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { PlayIcon, ShuffleIcon } from "./icons";
import { albumLength } from "./AlbumGrid";
import { albumRows, REPEAT_PLAY_MS } from "./AlbumPage";
import { PlaylistCover } from "./PlaylistCover";
import { TrackTable } from "./TrackTable";
import {
  errorMessage,
  moveInPlaylist,
  playlistTracks,
  removeFromPlaylist,
  type LibraryTrack,
  type Playlist,
} from "../lib/backend";
import type { AlbumCoverRequest } from "../lib/albumCovers";
import type { PlayOrder } from "../hooks/usePlayback";

const NUMBER = new Intl.NumberFormat("tr-TR");

export interface PlaylistPageProps {
  playlist: Playlist;
  tracks: LibraryTrack[];
  /** Yol → şarkı ve albüm kapak dizini (kolaj için). */
  byPath: ReadonlyMap<string, LibraryTrack>;
  coverIndex: ReadonlyMap<string, AlbumCoverRequest>;
  coverRevision: number;
  /** Değişince (tarama, analiz, listeye ekleme) listenin şarkıları yeniden sorulur. */
  refreshKey: unknown;
  currentPath: string | null;
  playing: boolean;
  camelot: boolean;
  onBack: () => void;
  /** `startIndex`: başlanan satırın sırası (aynı şarkı listede iki kez olabilir). */
  onPlay: (paths: string[], start?: string, order?: PlayOrder, startIndex?: number) => void;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
  onChooseCover: () => void;
  onClearCover: () => void;
  /** Listeyi başka bilgisayara taşımak için `.m3u8` dosyasına aktarır; kaydedilen yol. */
  onExport?: () => Promise<string | null>;
  /** Liste değişti (çıkarma, taşıma): ızgaradaki sayı ve kolaj tazelenir. */
  onChanged: () => void;
}

/**
 * Çalma listesi sayfası: kapak (seçilen resim ya da albüm kolajı), ad, şarkı sayısı ve süre,
 * "Çal", "Karışık çal", düzenleme menüsü (ad, kapak, silme) ve listenin sırasıyla şarkılar. Şarkı
 * × ya da Delete ile çıkar, Alt+↑/↓ ile taşınır.
 */
export function PlaylistPage({
  playlist,
  tracks,
  byPath,
  coverIndex,
  coverRevision,
  refreshKey,
  currentPath,
  playing,
  camelot,
  onBack,
  onPlay,
  onRename,
  onDelete,
  onChooseCover,
  onClearCover,
  onExport,
  onChanged,
}: PlaylistPageProps) {
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [loaded, setLoaded] = useState<{ id: number; paths: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    headingRef.current?.focus();
  }, [playlist.id]);
  // Ad değiştirme bitince (Kaydet, Vazgeç, Esc) odak başlığa döner; form kaybolunca boşa düşmesin.
  const wasRenaming = useRef(false);
  useEffect(() => {
    if (wasRenaming.current && renaming === null) headingRef.current?.focus();
    wasRenaming.current = renaming !== null;
  }, [renaming]);

  // Süren düzenlemeler (çıkarma, taşıma): çekirdeğe sırayla gider. Satırlar sırayla bilindiği için
  // istekler yer değiştirirse yanlış şarkı çıkar; süren düzenleme varken okuma yapılmaz (yerel sırayı
  // eski sırayla ezmesin), son düzenleme bitince bir kez okunur.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const failed = useRef(false);

  const load = useCallback(() => {
    if (pending.current > 0) return;
    const mine = ++seq.current;
    playlistTracks(playlist.id)
      .then((paths) => {
        if (mine !== seq.current) return;
        setLoaded({ id: playlist.id, paths });
        setError(null);
      })
      .catch((e) => {
        if (mine === seq.current) setError(errorMessage(e));
      });
  }, [playlist.id]);
  useEffect(load, [load, refreshKey]);

  const paths = loaded?.id === playlist.id ? loaded.paths : null;
  const rows = useMemo(() => (paths ? albumRows(paths, tracks) : []), [paths, tracks]);

  const lastPlay = useRef(-Infinity);
  const play = (time: number, start?: string, order?: PlayOrder, startIndex?: number) => {
    if (!paths || paths.length === 0) return;
    if (time - lastPlay.current < REPEAT_PLAY_MS) return;
    lastPlay.current = time;
    if (startIndex === undefined) onPlay(paths, start, order);
    else onPlay(paths, start, order, startIndex);
  };
  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  });
  const playRow = useCallback(
    (time: number, path: string, index: number) => playRef.current(time, path, undefined, index),
    [],
  );

  // Değişiklik hemen görünür (yerel sıra), sonra çekirdekten yeniden okunur.
  const edit = useCallback(
    (local: (paths: string[]) => string[], action: () => Promise<void>) => {
      // Sürmekte olan okuma eski sırayı getirir: sonucu yok sayılır.
      seq.current++;
      setLoaded((current) =>
        current && current.id === playlist.id
          ? { id: current.id, paths: local(current.paths) }
          : current,
      );
      pending.current++;
      queue.current = queue.current
        // Önceki düzenleme başarısızsa yerel sıra çekirdekten ayrılmıştır: sıradakiler gönderilmez.
        .then(() => (failed.current ? undefined : action()))
        .catch((e: unknown) => {
          failed.current = true;
          setError(errorMessage(e));
        })
        .finally(() => {
          pending.current--;
          if (pending.current > 0) return;
          failed.current = false;
          load();
          onChanged();
        });
    },
    [playlist.id, load, onChanged],
  );
  const removeRow = useCallback(
    (index: number) =>
      edit(
        (list) => list.filter((_, i) => i !== index),
        () => removeFromPlaylist(playlist.id, [index]),
      ),
    [edit, playlist.id],
  );
  const moveRow = useCallback(
    (from: number, to: number) =>
      edit(
        (list) => {
          const next = [...list];
          const [moved] = next.splice(from, 1);
          if (moved !== undefined) next.splice(to, 0, moved);
          return next;
        },
        () => moveInPlaylist(playlist.id, from, to),
      ),
    [edit, playlist.id],
  );

  const choose = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    const menu = event.currentTarget.closest("details");
    if (menu) menu.open = false;
    action();
  };
  const submitName = async (event: FormEvent) => {
    event.preventDefault();
    if (renaming === null || renaming.trim() === "") return;
    if (await onRename(renaming)) setRenaming(null);
  };

  const count = paths?.length ?? playlist.trackCount;
  return (
    <div
      className="album-page"
      role="region"
      // Ad değiştirilirken başlık yerine form durur: bölgenin adı o sırada doğrudan verilir.
      aria-labelledby={renaming === null ? `${id}-title` : undefined}
      aria-label={renaming === null ? undefined : playlist.name}
    >
      <button
        type="button"
        className="album-page__back"
        onClick={onBack}
        aria-label="Listelere dön"
        title="Listelere dön (Esc)"
      >
        ← Listeler
      </button>
      <div className="album-page__hero">
        <PlaylistCover
          playlist={playlist}
          tracks={byPath}
          index={coverIndex}
          revision={coverRevision}
          className="album__cover album-page__cover"
        />
        <div className="album-page__info">
          <span className="album-page__eyebrow">Çalma listesi</span>
          {renaming === null ? (
            <h3 className="album-page__title" id={`${id}-title`} ref={headingRef} tabIndex={-1}>
              {playlist.name}
            </h3>
          ) : (
            <form className="playlist__rename" onSubmit={(e) => void submitName(e)}>
              <input
                type="text"
                value={renaming}
                maxLength={100}
                aria-label="Listenin yeni adı"
                autoFocus
                onChange={(e) => setRenaming(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setRenaming(null);
                  }
                }}
              />
              <button type="submit" className="hw-button hw-button--small">
                Kaydet
              </button>
              <button
                type="button"
                className="hw-button hw-button--small"
                onClick={() => setRenaming(null)}
              >
                Vazgeç
              </button>
            </form>
          )}
          <p className="album-page__meta">
            {[
              `${NUMBER.format(count)} şarkı`,
              playlist.durationSecs > 0 ? albumLength(playlist.durationSecs) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="album-page__actions">
            <button
              type="button"
              className="hw-button hw-button--primary album-page__play"
              onClick={(event) => play(event.timeStamp, undefined, "ordered")}
              disabled={!paths || paths.length === 0}
              aria-label="Listeyi çal"
              title="Listeyi baştan çal"
            >
              <PlayIcon />
              <span>Çal</span>
            </button>
            <button
              type="button"
              className="hw-button hw-button--small album-page__shuffle"
              onClick={(event) => play(event.timeStamp, undefined, "shuffled")}
              disabled={!paths || paths.length === 0}
              aria-label="Listeyi karışık çal"
              title="Listeyi karışık sırayla çal"
            >
              <ShuffleIcon />
              <span>Karışık çal</span>
            </button>
            <details
              className="album-page__menu"
              ref={menuRef}
              onToggle={(event) => {
                if (!event.currentTarget.open) setConfirmDelete(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && menuRef.current?.open) {
                  event.preventDefault();
                  menuRef.current.open = false;
                }
              }}
            >
              <summary className="hw-button hw-button--small">Düzenle</summary>
              <div className="album__menu-list">
                <button type="button" onClick={(e) => choose(e, () => setRenaming(playlist.name))}>
                  Adını değiştir…
                </button>
                <button type="button" onClick={(e) => choose(e, onChooseCover)}>
                  Kapak seç…
                </button>
                <button type="button" onClick={(e) => choose(e, onClearCover)}>
                  Seçtiğim kapağı kaldır
                </button>
                {onExport && (
                  <button
                    type="button"
                    onClick={(e) =>
                      choose(e, () => {
                        setExported(null);
                        void onExport().then((path) => {
                          if (path) setExported(path);
                        });
                      })
                    }
                  >
                    Başka bilgisayara aktar (.m3u8)…
                  </button>
                )}
                {confirmDelete ? (
                  <span className="library__confirm">
                    Liste silinsin mi?
                    <button type="button" onClick={(e) => choose(e, onDelete)}>
                      Evet
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)}>
                      Vazgeç
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)}>
                    Listeyi sil…
                  </button>
                )}
              </div>
            </details>
          </div>
        </div>
      </div>
      {exported && (
        <p className="library__note" role="status">
          Kaydedildi: {exported}. Bu dosyayı (kapağı da yanındadır) öbür bilgisayara taşıyıp orada
          Listeler › “İçe aktar” ile açın; şarkılar o bilgisayarın kütüphanesinde bulunur.
        </p>
      )}
      {error && (
        <p className="library__problem" role="alert">
          {error}
        </p>
      )}
      {paths !== null && paths.length === 0 ? (
        <p className="library__none">
          Liste boş. Albüm ya da sanatçı sayfasındaki, ya da şarkılar listesindeki “+ Listeye ekle”
          ile şarkı ekleyin.
        </p>
      ) : (
        <TrackTable
          rows={rows}
          currentPath={currentPath}
          playing={playing}
          camelot={camelot}
          label="Listenin şarkıları"
          showArtist
          numbering="position"
          onPlay={playRow}
          onRemove={removeRow}
          onMove={moveRow}
        />
      )}
    </div>
  );
}
