import { useEffect, useRef, useState, type MouseEvent } from "react";
import { PlayIcon } from "./icons";
import type { LibraryAlbum, LibraryTrack } from "../lib/backend";
import { albumCoverKey, cachedAlbumCover, requestAlbumCover } from "../lib/albumCovers";

const NUMBER = new Intl.NumberFormat("tr-TR");

export interface AlbumGridProps {
  albums: LibraryAlbum[];
  /** Çalan şarkı (albümü vurgulanır); kütüphanede değilse `null`. */
  current: LibraryTrack | null;
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

function AlbumCover({ album }: { album: LibraryAlbum }) {
  const request = {
    album: album.name,
    artist: album.artist,
    key: album.key,
    bpm: album.bpm,
    coverPath: album.coverPath,
  };
  const key = albumCoverKey(request);
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const cached = cachedAlbumCover(key);
  const url = cached ?? (loaded?.key === key ? loaded.url : null);

  // Kapak yalnızca ekrana yaklaşınca istenir; ekrandan çıkınca bekleyen istek bırakılır.
  useEffect(() => {
    if (url !== null) return;
    const element = ref.current;
    if (!element) return;
    let release: (() => void) | null = null;
    const load = () => {
      release = requestAlbumCover(
        {
          album: album.name,
          artist: album.artist,
          key: album.key,
          bpm: album.bpm,
          coverPath: album.coverPath,
        },
        (ready) => setLoaded({ key, url: ready }),
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
  }, [url, key, album.name, album.artist, album.key, album.bpm, album.coverPath]);

  return (
    <div ref={ref} className="album__cover">
      {url && <img src={url} alt="" draggable={false} />}
    </div>
  );
}

/** Albümler: kapak ızgarası. Kapağa tıklamak albümü baştan çalar. */
/** Şarkı bu albümün mü? Albümler albüm sanatçısıyla (yoksa sanatçıyla) gruplanır. */
export function isAlbumOf(track: LibraryTrack, album: LibraryAlbum): boolean {
  return track.album === album.name && (track.albumArtist ?? track.artist) === album.artist;
}

export function AlbumGrid({
  albums,
  current,
  onPlay,
  onChooseCover,
  onClearCover,
}: AlbumGridProps) {
  const choose = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    const menu = event.currentTarget.closest("details");
    if (menu) menu.open = false;
    action();
  };
  return (
    <ul className="albums" aria-label="Albümler">
      {albums.map((album) => {
        const playing = current !== null && isAlbumOf(current, album);
        return (
          <li key={`${album.artist ?? ""}\u0000${album.name}`} className="album">
            <button
              type="button"
              className={`album__button${playing ? " is-current" : ""}`}
              onClick={() => onPlay(album)}
              title={`Albümü çal: ${album.name}`}
            >
              <AlbumCover album={album} />
              <span className="album__play" aria-hidden>
                <PlayIcon />
              </span>
              <span className="album__name">{album.name}</span>
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
