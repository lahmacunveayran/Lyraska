import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { PlayIcon } from "./icons";
import type { LibraryAlbum, LibraryTrack } from "../lib/backend";
import {
  albumCoverKey,
  albumCoverRequest,
  cachedAlbumCover,
  requestAlbumCover,
  type AlbumCoverRequest,
} from "../lib/albumCovers";

const NUMBER = new Intl.NumberFormat("tr-TR");

export interface AlbumGridProps {
  albums: LibraryAlbum[];
  /** Çalan şarkı (albümü vurgulanır); kütüphanede değilse `null`. */
  current: LibraryTrack | null;
  /** Karta tıklayınca albüm sayfası açılır. */
  onOpen: (album: LibraryAlbum) => void;
  /** Kapağın üstündeki çal düğmesi albümü hemen baştan çalar. */
  onPlay: (album: LibraryAlbum) => void;
  /** Kullanıcı albüme kendi kapağını seçer / seçtiğini kaldırır. */
  onChooseCover: (album: LibraryAlbum) => void;
  onClearCover: (album: LibraryAlbum) => void;
}

/** Albüm süresi: "42 dk", "1 sa 12 dk". */
export function albumLength(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} dk`;
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
}

/**
 * Albüm kapağı (ızgara, albüm sayfası, şarkı satırındaki küçük resim): yalnızca ekrana yaklaşınca
 * istenir, ekrandan çıkınca bekleyen istek bırakılır. İstek yoksa (albüm etiketi yok) düz yer
 * tutucu kalır.
 */
export function AlbumArt({
  request,
  className = "album__cover",
}: {
  request: AlbumCoverRequest | null;
  className?: string;
}) {
  const key = request ? albumCoverKey(request) : null;
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const cached = key === null ? null : cachedAlbumCover(key);
  const url = cached ?? (key !== null && loaded?.key === key ? loaded.url : null);
  const album = request?.album;
  const artist = request?.artist ?? null;
  const tone = request?.key ?? null;
  const bpm = request?.bpm ?? null;
  const coverPath = request?.coverPath;

  useEffect(() => {
    if (url !== null || key === null || album === undefined || coverPath === undefined) return;
    const element = ref.current;
    if (!element) return;
    let release: (() => void) | null = null;
    const load = () => {
      release = requestAlbumCover({ album, artist, key: tone, bpm, coverPath }, (ready) =>
        setLoaded({ key, url: ready }),
      );
    };
    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => release?.();
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible && !release) load();
        else if (!visible && release) {
          release();
          release = null;
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      release?.();
    };
  }, [url, key, album, artist, tone, bpm, coverPath]);

  return (
    <div ref={ref} className={className}>
      {url && <img src={url} alt="" draggable={false} />}
    </div>
  );
}

/** Albümün kimliği (kart ile albüm sayfası arasında odağı geri vermek için). */
export function albumKey(album: LibraryAlbum): string {
  return `${album.artist ?? ""}\u0000${album.name}`;
}

/** Şarkı bu albümün mü? Albümler albüm sanatçısıyla (yoksa sanatçıyla) gruplanır. */
export function isAlbumOf(track: LibraryTrack, album: LibraryAlbum): boolean {
  return track.album === album.name && (track.albumArtist ?? track.artist) === album.artist;
}

/**
 * Albümler: kapak ızgarası. Karta tıklamak albüm sayfasını açar; kapağın üstündeki çal düğmesi
 * albümü hemen baştan çalar.
 */
export function AlbumGrid({
  albums,
  current,
  onOpen,
  onPlay,
  onChooseCover,
  onClearCover,
}: AlbumGridProps) {
  const id = useId();
  const choose = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    const menu = event.currentTarget.closest("details");
    if (menu) menu.open = false;
    action();
  };
  return (
    <ul className="albums" aria-label="Albümler">
      {albums.map((album, index) => {
        const playing = current !== null && isAlbumOf(current, album);
        return (
          <li key={albumKey(album)} className="album">
            <button
              type="button"
              className={`album__button${playing ? " is-current" : ""}`}
              onClick={() => onOpen(album)}
              title={`Albümü aç: ${album.name}`}
              data-album={albumKey(album)}
            >
              <AlbumArt request={albumCoverRequest(album)} />
              <span className="album__name" id={`${id}-${index}`}>
                {album.name}
              </span>
              <span className="album__meta">
                {[
                  album.artist,
                  `${NUMBER.format(album.trackCount)} şarkı`,
                  album.durationSecs > 0 ? albumLength(album.durationSecs) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
            {/* Ayrı düğme (düğme içinde düğme olmaz); adı kısa, albüm adı açıklamada. */}
            <button
              type="button"
              className="album__play"
              onClick={() => onPlay(album)}
              aria-label="Baştan çal"
              aria-describedby={`${id}-${index}`}
              title={`Albümü baştan çal: ${album.name}`}
            >
              <PlayIcon />
            </button>
            <details className="album__menu">
              <summary aria-label={`Kapak seçenekleri: ${album.name}`} title="Kapak seçenekleri">
                ⋯
              </summary>
              <div className="album__menu-list">
                <button type="button" onClick={(e) => choose(e, () => onChooseCover(album))}>
                  Kapak seç…
                </button>
                <button type="button" onClick={(e) => choose(e, () => onClearCover(album))}>
                  Seçtiğim kapağı kaldır
                </button>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
