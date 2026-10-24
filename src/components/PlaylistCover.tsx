import { useEffect, useMemo, useState } from "react";
import { AlbumArt } from "./AlbumGrid";
import { getPlaylistCover, type LibraryTrack, type Playlist } from "../lib/backend";
import { trackCoverRequest, type AlbumCoverRequest } from "../lib/albumCovers";

/**
 * Kolajın kapakları: listedeki ilk farklı albümlerin (en çok dört) kapak istekleri. Şarkı
 * kütüphanede yoksa ya da albüm etiketi yoksa atlanır.
 */
export function collageRequests(
  collagePaths: readonly string[],
  tracks: ReadonlyMap<string, LibraryTrack>,
  index: ReadonlyMap<string, AlbumCoverRequest>,
): AlbumCoverRequest[] {
  const requests: AlbumCoverRequest[] = [];
  for (const path of collagePaths) {
    const track = tracks.get(path);
    const request = track ? trackCoverRequest(track, index) : null;
    if (request) requests.push(request);
  }
  return requests.slice(0, 4);
}

/**
 * Çalma listesinin kapağı: kullanıcının seçtiği resim; yoksa ilk albümlerin kapaklarından kolaj
 * (tek albümse o kapak, birden çoksa dört kare); hiç kapak yoksa düz yer tutucu.
 */
export function PlaylistCover({
  playlist,
  tracks,
  index,
  revision,
  className = "album__cover",
}: {
  playlist: Playlist;
  tracks: ReadonlyMap<string, LibraryTrack>;
  index: ReadonlyMap<string, AlbumCoverRequest>;
  /** Kapak değişince artar. */
  revision: number;
  className?: string;
}) {
  const [custom, setCustom] = useState<{ key: string; url: string | null } | null>(null);
  const key = `${playlist.id}\u0000${revision}`;

  useEffect(() => {
    let live = true;
    getPlaylistCover(playlist.id)
      .then((url) => {
        if (live) setCustom({ key, url });
      })
      .catch(() => {
        if (live) setCustom({ key, url: null });
      });
    return () => {
      live = false;
    };
  }, [playlist.id, key]);

  const requests = useMemo(
    () => collageRequests(playlist.collagePaths, tracks, index),
    [playlist.collagePaths, tracks, index],
  );
  const url = custom?.key === key ? custom.url : null;
  if (url) {
    return (
      <div className={className}>
        <img src={url} alt="" draggable={false} />
      </div>
    );
  }
  if (requests.length <= 1) return <AlbumArt request={requests[0] ?? null} className={className} />;
  // Dört kare dolsun: iki kapak çapraz tekrarlanır, üç kapakta ilki dördüncü karede de durur.
  const order = requests.length === 2 ? [0, 1, 1, 0] : [0, 1, 2, requests.length === 4 ? 3 : 0];
  const tiles = order.map((i) => requests[i]!);
  return (
    <div className={`${className} playlist__collage`}>
      {tiles.map((request, i) => (
        <AlbumArt key={i} request={request} className="playlist__tile" />
      ))}
    </div>
  );
}
