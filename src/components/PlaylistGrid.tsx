import { useId, useState, type FormEvent } from "react";
import { PlayIcon } from "./icons";
import { albumLength } from "./AlbumGrid";
import { PlaylistCover } from "./PlaylistCover";
import type { LibraryTrack, Playlist } from "../lib/backend";
import type { AlbumCoverRequest } from "../lib/albumCovers";

const NUMBER = new Intl.NumberFormat("tr-TR");

export interface PlaylistGridProps {
  playlists: Playlist[];
  byPath: ReadonlyMap<string, LibraryTrack>;
  coverIndex: ReadonlyMap<string, AlbumCoverRequest>;
  coverRevision: number;
  onOpen: (playlist: Playlist) => void;
  onPlay: (playlist: Playlist) => void;
  onCreate: (name: string) => Promise<Playlist | null>;
}

/**
 * Çalma listeleri: kapak ızgarası, ilk kart "Yeni liste". Karta tıklamak liste sayfasını açar;
 * kapağın üstündeki çal düğmesi listeyi hemen baştan çalar.
 */
export function PlaylistGrid({
  playlists,
  byPath,
  coverIndex,
  coverRevision,
  onOpen,
  onPlay,
  onCreate,
}: PlaylistGridProps) {
  const id = useId();
  const [name, setName] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name === null || name.trim() === "") return;
    const created = await onCreate(name);
    if (created) {
      setName(null);
      onOpen(created);
    }
  };

  return (
    <ul className="albums" aria-label="Çalma listeleri">
      <li className="album playlist__new">
        {name === null ? (
          <button
            type="button"
            className="album__button"
            onClick={() => setName("")}
            title="Yeni çalma listesi"
          >
            <span className="album__cover playlist__new-cover" aria-hidden>
              +
            </span>
            <span className="album__name">Yeni liste</span>
            <span className="album__meta">Ad ve kapak sizden</span>
          </button>
        ) : (
          <form className="playlist__new-form" onSubmit={(e) => void submit(e)}>
            <span className="album__cover playlist__new-cover" aria-hidden>
              +
            </span>
            <input
              type="text"
              value={name}
              maxLength={100}
              placeholder="Liste adı"
              aria-label="Yeni listenin adı"
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setName(null);
                }
              }}
            />
            <span className="playlist__new-actions">
              <button
                type="submit"
                className="hw-button hw-button--small"
                disabled={name.trim() === ""}
              >
                Oluştur
              </button>
              <button
                type="button"
                className="hw-button hw-button--small"
                onClick={() => setName(null)}
              >
                Vazgeç
              </button>
            </span>
          </form>
        )}
      </li>
      {playlists.map((playlist, index) => (
        <li key={playlist.id} className="album">
          <button
            type="button"
            className="album__button"
            onClick={() => onOpen(playlist)}
            title={`Listeyi aç: ${playlist.name}`}
            data-playlist={playlist.id}
          >
            <PlaylistCover
              playlist={playlist}
              tracks={byPath}
              index={coverIndex}
              revision={coverRevision}
            />
            <span className="album__name" id={`${id}-${index}`}>
              {playlist.name}
            </span>
            <span className="album__meta">
              {[
                `${NUMBER.format(playlist.trackCount)} şarkı`,
                playlist.durationSecs > 0 ? albumLength(playlist.durationSecs) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </button>
          {playlist.trackCount > 0 && (
            <button
              type="button"
              className="album__play"
              onClick={() => onPlay(playlist)}
              aria-label="Baştan çal"
              aria-describedby={`${id}-${index}`}
              title={`Listeyi baştan çal: ${playlist.name}`}
            >
              <PlayIcon />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
