import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { PauseIcon, PlayIcon } from "./icons";
import { AlbumArt, albumLength } from "./AlbumGrid";
import {
  errorMessage,
  libraryAlbumTracks,
  type LibraryAlbum,
  type LibraryTrack,
} from "../lib/backend";
import { albumCoverRequest } from "../lib/albumCovers";
import { bpmLabel } from "../lib/analysis";
import { keyHue, keyText } from "../lib/librarySort";
import { formatTime } from "../lib/format";

const NUMBER = new Intl.NumberFormat("tr-TR");

export interface AlbumPageProps {
  album: LibraryAlbum;
  /** Kütüphanenin şarkıları: albümün yollarını satırlara çevirmek için. */
  tracks: LibraryTrack[];
  /** Değişince (tarama, analiz) albümün şarkıları yeniden sorulur. */
  refreshKey: unknown;
  currentPath: string | null;
  playing: boolean;
  /** DJ görünümü: ton Camelot koduyla. */
  camelot: boolean;
  onBack: () => void;
  /** Albümü albüm sırasıyla çalar; `start` verilirse o şarkıdan başlar. */
  onPlay: (paths: string[], start?: string) => void;
  onChooseCover: () => void;
  onClearCover: () => void;
}

/** Yolun dosya adı, uzantısız ("D:\Müzik\01 Gece.flac" → "01 Gece"). */
function fileTitle(path: string): string {
  const name =
    path
      .split(/[\\/]+/)
      .filter(Boolean)
      .pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Albümün şarkı yollarını (albüm sırasıyla) listedeki şarkılara çevirir. Arama listeyi süzdüyse
 * listede olmayan şarkı dosya adıyla gösterilir: albüm sayfası albümün tamamıdır.
 */
export function albumRows(paths: string[], tracks: LibraryTrack[]): LibraryTrack[] {
  const byPath = new Map(tracks.map((track) => [track.path, track]));
  return paths.map(
    (path, index) =>
      byPath.get(path) ?? {
        id: -(index + 1),
        path,
        title: fileTitle(path),
        artist: null,
        album: null,
        albumArtist: null,
        trackNumber: null,
        durationSecs: null,
        codec: "",
        bpm: null,
        analyzed: false,
        key: null,
      },
  );
}

/** Albümün ton ve tempo özeti (ilk şarkıdan, kapakla aynı): "La minör · 124 BPM". */
export function albumSummary(album: LibraryAlbum, camelot: boolean): string | null {
  const parts = [];
  if (album.key) parts.push(keyText({ key: album.key, analyzed: true }, camelot));
  if (album.bpm !== null && Number.isFinite(album.bpm)) {
    parts.push(`${bpmLabel({ bpm: album.bpm, analyzed: true })} BPM`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Albüm sayfası (kütüphane sayfasının içinde): büyük kapak, ad, sanatçı, özet, "Çal" ve kapak
 * menüsü, albüm sırasıyla şarkılar. Açılınca odak başlığa gelir; Esc ve "← Albümler" ızgaraya
 * döndürür (Esc'i kütüphane paneli yönetir: önce arama, sonra bu sayfa, sonra kütüphane).
 */
export function AlbumPage({
  album,
  tracks,
  refreshKey,
  currentPath,
  playing,
  camelot,
  onBack,
  onPlay,
  onChooseCover,
  onClearCover,
}: AlbumPageProps) {
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [loaded, setLoaded] = useState<{ key: string; paths: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(-1);
  const seq = useRef(0);
  const albumId = `${album.artist ?? ""}\u0000${album.name}`;

  // Açılınca odak başlığa: ekran okuyucu sayfanın adını okur, Tab sayfanın düğmelerine gider.
  useEffect(() => {
    headingRef.current?.focus();
  }, [albumId]);

  useEffect(() => {
    const mine = ++seq.current;
    libraryAlbumTracks(album.name, album.artist)
      .then((paths) => {
        if (mine !== seq.current) return;
        setLoaded({ key: albumId, paths });
        setError(paths.length > 0 ? null : `“${album.name}” için şarkı bulunamadı.`);
      })
      .catch((e) => {
        if (mine === seq.current) setError(errorMessage(e));
      });
  }, [album.name, album.artist, albumId, refreshKey]);

  const paths = loaded?.key === albumId ? loaded.paths : null;
  const rows = paths ? albumRows(paths, tracks) : [];
  const summary = albumSummary(album, camelot);

  const play = (start?: string) => {
    if (paths && paths.length > 0) onPlay(paths, start);
  };

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || rows.length === 0) return;
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    if (event.key in moves) {
      event.preventDefault();
      const from = selected < 0 ? -1 : selected;
      setSelected(Math.max(0, Math.min(rows.length - 1, from + moves[event.key]!)));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setSelected(event.key === "Home" ? 0 : rows.length - 1);
    } else if (event.key === "Enter") {
      const track = rows[selected];
      if (!track) return;
      event.preventDefault();
      play(track.path);
    }
  };

  const choose = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    const menu = event.currentTarget.closest("details");
    if (menu) menu.open = false;
    action();
  };

  const rowId = (index: number) => `${id}-row-${index}`;

  return (
    <div className="album-page" aria-labelledby={`${id}-title`} role="region">
      <button
        type="button"
        className="album-page__back"
        onClick={onBack}
        aria-label="Albümlere dön"
        title="Albümlere dön (Esc)"
      >
        ← Albümler
      </button>
      <div className="album-page__hero">
        <AlbumArt request={albumCoverRequest(album)} className="album__cover album-page__cover" />
        <div className="album-page__info">
          <span className="album-page__eyebrow">Albüm</span>
          <h3 className="album-page__title" id={`${id}-title`} ref={headingRef} tabIndex={-1}>
            {album.name}
          </h3>
          {album.artist && <p className="album-page__artist">{album.artist}</p>}
          <p className="album-page__meta">
            {[
              `${NUMBER.format(album.trackCount)} şarkı`,
              album.durationSecs > 0 ? albumLength(album.durationSecs) : null,
              summary,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="album-page__actions">
            <button
              type="button"
              className="hw-button hw-button--primary album-page__play"
              onClick={() => play()}
              disabled={!paths || paths.length === 0}
              aria-label="Albümü çal"
              title="Albümü baştan çal"
            >
              <PlayIcon />
              <span>Çal</span>
            </button>
            <details
              className="album-page__menu"
              ref={menuRef}
              onKeyDown={(event) => {
                // Esc önce açık menüyü kapatır (sayfayı değil).
                if (event.key === "Escape" && menuRef.current?.open) {
                  event.preventDefault();
                  menuRef.current.open = false;
                }
              }}
            >
              <summary className="hw-button hw-button--small">Kapağı değiştir</summary>
              <div className="album__menu-list">
                <button type="button" onClick={(e) => choose(e, onChooseCover)}>
                  Kapak seç…
                </button>
                <button type="button" onClick={(e) => choose(e, onClearCover)}>
                  Seçtiğim kapağı kaldır
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>
      {error && (
        <p className="library__problem" role="alert">
          {error}
        </p>
      )}
      {rows.length > 0 && (
        <div className="album-page__table" role="grid" aria-rowcount={rows.length}>
          <div className="album-page__row library__row--head" role="row">
            <span role="columnheader" className="library__no">
              #
            </span>
            <span role="columnheader">Başlık</span>
            <span role="columnheader" className="library__time library__bpm">
              BPM
            </span>
            <span role="columnheader" className="library__key">
              Ton
            </span>
            <span role="columnheader" className="library__time">
              Süre
            </span>
          </div>
          <div
            className="album-page__list"
            tabIndex={0}
            onKeyDown={onListKey}
            aria-label="Albümün şarkıları"
            aria-activedescendant={selected >= 0 && rows[selected] ? rowId(selected) : undefined}
          >
            {rows.map((track, index) => {
              const isCurrent = track.path === currentPath;
              const hue = keyHue(track.key);
              return (
                <div
                  key={track.path}
                  id={rowId(index)}
                  role="row"
                  aria-rowindex={index + 1}
                  aria-selected={index === selected}
                  className={`album-page__row${isCurrent ? " is-current" : ""}${index === selected ? " is-selected" : ""}`}
                  onClick={() => setSelected(index)}
                  onDoubleClick={() => play(track.path)}
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
                      (track.trackNumber ?? index + 1)
                    )}
                  </span>
                  <span className="library__cell library__title-cell" role="gridcell">
                    {track.title}
                  </span>
                  <span className="library__time library__bpm" role="gridcell">
                    {bpmLabel(track)}
                  </span>
                  <span className="library__key" role="gridcell">
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
        </div>
      )}
    </div>
  );
}
