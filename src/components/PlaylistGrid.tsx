import { useId, useState, type FormEvent } from "react";
import { PlayIcon } from "./icons";
import { albumLength } from "./AlbumGrid";
import { PlaylistCover } from "./PlaylistCover";
import type { LibraryTrack, Playlist, PlaylistImport } from "../lib/backend";
import type { AlbumCoverRequest } from "../lib/albumCovers";

const NUMBER = new Intl.NumberFormat("tr-TR");

/**
 * İçe aktarmanın özeti: "“Yolculuk” içe aktarıldı: 12 şarkının 10 tanesi bulundu. 3 şarkı bu
 * bilgisayarda başka bir yerde, adından ve sanatçısından bulundu. 2 şarkı bu bilgisayarda yok …".
 */
export function importSummary(result: PlaylistImport): string {
  const found = result.samePath + result.byTags + result.byFileName;
  const total = found + result.missing;
  const head =
    total === 0
      ? `“${result.playlist.name}” içe aktarıldı; dosyada şarkı yok`
      : found === total
        ? `“${result.playlist.name}” içe aktarıldı: ${total} şarkının hepsi bulundu`
        : `“${result.playlist.name}” içe aktarıldı: ${total} şarkının ${found} tanesi bulundu`;
  const parts = [head];
  const moved = result.byTags + result.byFileName;
  if (moved > 0) {
    parts.push(`${moved} şarkı bu bilgisayarda başka bir yerde, adından ve sanatçısından bulundu`);
  }
  if (result.missing > 0) {
    parts.push(`${result.missing} şarkı bu bilgisayarda yok; listede kalır, eklenince çalar`);
  }
  return `${parts.join(". ")}.`;
}

export interface PlaylistGridProps {
  playlists: Playlist[];
  byPath: ReadonlyMap<string, LibraryTrack>;
  coverIndex: ReadonlyMap<string, AlbumCoverRequest>;
  coverRevision: number;
  onOpen: (playlist: Playlist) => void;
  onPlay: (playlist: Playlist) => void;
  onCreate: (name: string) => Promise<Playlist | null>;
  /** Başka bilgisayardan getirilen `.m3u8` listesini içe aktarır. */
  onImport?: () => void;
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
  onImport,
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
      {onImport && (
        <li className="album playlist__new">
          <button
            type="button"
            className="album__button"
            onClick={onImport}
            title="Başka bilgisayardan ya da başka bir çalardan getirilen listeyi aç"
          >
            <span className="album__cover playlist__new-cover" aria-hidden>
              ⤓
            </span>
            <span className="album__name">İçe aktar</span>
            <span className="album__meta">.m3u8 / .m3u dosyası</span>
          </button>
        </li>
      )}
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
