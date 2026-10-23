import { useEffect, useRef, useState } from "react";
import { PlayIcon } from "./icons";
import type { LibraryAlbum, LibraryTrack } from "../lib/backend";
import { albumCover, albumCoverKey, cachedAlbumCover } from "../lib/albumCovers";

const NUMBER = new Intl.NumberFormat("tr-TR");

export interface AlbumGridProps {
  albums: LibraryAlbum[];
  /** Kapak için ton ve tempo: albümün kapak şarkısı bu listede aranır. */
  tracksByPath: Map<string, LibraryTrack>;
  /** Çalan şarkının yolu (albümü vurgulanır). */
  currentPath: string | null;
  onPlay: (album: LibraryAlbum) => void;
}

/** Albüm süresi: "42 dk", "1 sa 12 dk". */
export function albumLength(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} dk`;
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
}

function AlbumCover({ album, track }: { album: LibraryAlbum; track: LibraryTrack | undefined }) {
  const key = albumCoverKey(album.name, album.artist);
  const [url, setUrl] = useState(() => cachedAlbumCover(key));
  const ref = useRef<HTMLDivElement>(null);
  const bpm = track?.bpm ?? null;
  const musicalKey = track?.key ?? null;

  // Kapak yalnızca ekrana yaklaşınca hazırlanır.
  useEffect(() => {
    if (url) return;
    const element = ref.current;
    if (!element) return;
    let cancelled = false;
    const load = () => {
      void albumCover({
        album: album.name,
        artist: album.artist,
        key: musicalKey,
        bpm,
        coverPath: album.coverPath,
      }).then((ready) => {
        if (!cancelled) setUrl(ready);
      });
    };
    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [url, album.name, album.artist, album.coverPath, musicalKey, bpm]);

  return (
    <div ref={ref} className="album__cover">
      {url && <img src={url} alt="" draggable={false} />}
    </div>
  );
}

/** Albümler: kapak ızgarası. Kapağa tıklamak albümü baştan çalar. */
export function AlbumGrid({ albums, tracksByPath, currentPath, onPlay }: AlbumGridProps) {
  const current = currentPath ? tracksByPath.get(currentPath) : undefined;
  return (
    <ul className="albums" aria-label="Albümler">
      {albums.map((album) => {
        const playing =
          current !== undefined &&
          current.album === album.name &&
          (album.artist === null || current.artist === album.artist);
        return (
          <li key={albumCoverKey(album.name, album.artist)} className="album">
            <button
              type="button"
              className={`album__button${playing ? " is-current" : ""}`}
              onClick={() => onPlay(album)}
              title={`Albümü çal: ${album.name}`}
            >
              <AlbumCover album={album} track={tracksByPath.get(album.coverPath)} />
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
          </li>
        );
      })}
    </ul>
  );
}
