import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { PlayIcon, ShuffleIcon } from "./icons";
import { AlbumArt, albumLength } from "./AlbumGrid";
import { TrackTable } from "./TrackTable";
import {
  errorMessage,
  libraryAlbumTracks,
  type LibraryAlbum,
  type LibraryTrack,
} from "../lib/backend";
import { albumCoverRequest } from "../lib/albumCovers";
import { bpmLabel } from "../lib/analysis";
import { keyText } from "../lib/librarySort";
import type { PlayOrder } from "../hooks/usePlayback";

const NUMBER = new Intl.NumberFormat("tr-TR");

/** Bu süre içinde ikinci çalma isteği (çift tık, tık + Enter) yok sayılır: şarkı iki kez açılmaz. */
export const REPEAT_PLAY_MS = 600;

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
  /** Geri düğmesinin yazısı ve adı (sanatçı sayfasından açılınca o sayfaya döner). */
  backText?: string;
  backLabel?: string;
  /**
   * Albümü çalar; `start` verilirse o şarkıdan başlar. `order`: "Çal" albüm sırasıyla, "Karışık
   * çal" karışık; şarkıya çift tıklayınca (verilmez) Karışık çal düğmesinin durumu geçerlidir.
   */
  onPlay: (paths: string[], start?: string, order?: PlayOrder) => void;
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
  backText = "← Albümler",
  backLabel = "Albümlere dön",
  onPlay,
  onChooseCover,
  onClearCover,
}: AlbumPageProps) {
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [loaded, setLoaded] = useState<{ key: string; paths: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  // Satırlar yalnızca yollar ya da kütüphane değişince kurulur (her durum sorgusunda değil).
  const rows = useMemo(() => (paths ? albumRows(paths, tracks) : []), [paths, tracks]);
  const summary = albumSummary(album, camelot);

  // Son çalma isteğinin zamanı: üst üste gelen istek albümü ikinci kez başlatmaz.
  const lastPlay = useRef(-Infinity);
  const play = (time: number, start?: string, order?: PlayOrder) => {
    if (!paths || paths.length === 0) return;
    if (time - lastPlay.current < REPEAT_PLAY_MS) return;
    lastPlay.current = time;
    onPlay(paths, start, order);
  };
  // Satırların çalma işlevi kimliğini korur (liste `memo` ile yeniden çizilmez); en son `play`.
  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  });
  const playRow = useCallback((time: number, path: string) => playRef.current(time, path), []);

  const choose = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    const menu = event.currentTarget.closest("details");
    if (menu) menu.open = false;
    action();
  };

  return (
    <div className="album-page" aria-labelledby={`${id}-title`} role="region">
      <button
        type="button"
        className="album-page__back"
        onClick={onBack}
        aria-label={backLabel}
        title={`${backLabel} (Esc)`}
      >
        {backText}
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
              onClick={(event) => play(event.timeStamp, undefined, "ordered")}
              disabled={!paths || paths.length === 0}
              aria-label="Albümü çal"
              title="Albümü baştan çal"
            >
              <PlayIcon />
              <span>Çal</span>
            </button>
            <button
              type="button"
              className="hw-button hw-button--small album-page__shuffle"
              onClick={(event) => play(event.timeStamp, undefined, "shuffled")}
              disabled={!paths || paths.length === 0}
              aria-label="Albümü karışık çal"
              title="Albümü karışık sırayla çal"
            >
              <ShuffleIcon />
              <span>Karışık çal</span>
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
      <TrackTable
        rows={rows}
        currentPath={currentPath}
        playing={playing}
        camelot={camelot}
        label="Albümün şarkıları"
        onPlay={playRow}
      />
    </div>
  );
}
