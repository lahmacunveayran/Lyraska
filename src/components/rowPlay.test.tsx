import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LibraryAlbum, LibraryArtist, LibraryTrack } from "../lib/backend";
import { AlbumPage } from "./AlbumPage";
import { ArtistPage } from "./ArtistPage";

// Albüm ve sanatçı sayfasının şarkıları çekirdekten sonradan gelir. Satırlar ekrana yazıldığı an
// çift tıklama da çalmalı: React `useEffect`'i çizimden sonra ayrı bir görevde çalıştırır, satırlar
// o arada da tıklanabilir. Tıklama satır DOM'a yazılınca (MutationObserver, aynı görevin içinde)
// gönderilir; çalma fonksiyonu o anda da yeni listeyi bilmeli. Çalma listesi sayfasının eşi
// `playlists.test.tsx`'te.

const PATHS = ["C:\\Müzik\\Albüm\\1.flac", "C:\\Müzik\\Albüm\\2.flac"];

vi.mock("../lib/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/backend")>();
  return {
    ...actual,
    isDesktop: () => true,
    libraryAlbumTracks: async () => [...PATHS],
    libraryArtistTracks: async () => [...PATHS],
    albumCoverUrl: async () => null,
  };
});

const song = (path: string, title: string): LibraryTrack => ({
  id: path.length,
  path,
  title,
  artist: "Sanatçı",
  album: "Albüm",
  albumArtist: null,
  trackNumber: null,
  durationSecs: 180,
  codec: "flac",
  bpm: null,
  analyzed: false,
  key: null,
});
const TRACKS = [song(PATHS[0]!, "Ay"), song(PATHS[1]!, "Bulut")];

const album: LibraryAlbum = {
  name: "Albüm",
  artist: "Sanatçı",
  trackCount: 2,
  durationSecs: 360,
  coverPath: PATHS[0]!,
  bpm: null,
  key: null,
};
const artist: LibraryArtist = {
  name: "Sanatçı",
  albumCount: 1,
  trackCount: 2,
  coverPath: PATHS[0]!,
};

/** `title` yazılı satır DOM'a girer girmez ona çift tıklar; tıklandıysa `true` döner. */
function doubleClickWhenShown(title: string): { clicked: () => boolean; stop: () => void } {
  let clicked = false;
  const observer = new MutationObserver(() => {
    if (clicked) return;
    const row = [...document.querySelectorAll('[role="row"]')].find((r) =>
      r.textContent?.includes(title),
    );
    if (!row) return;
    clicked = true;
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return { clicked: () => clicked, stop: () => observer.disconnect() };
}

describe("şarkı satırı göründüğü an çift tıklama", () => {
  it("albüm sayfası", async () => {
    const onPlay = vi.fn();
    const watch = doubleClickWhenShown("Bulut");
    try {
      render(
        <AlbumPage
          album={album}
          tracks={TRACKS}
          refreshKey={0}
          currentPath={null}
          playing={false}
          camelot={false}
          onBack={() => {}}
          onPlay={onPlay}
          onChooseCover={() => {}}
          onClearCover={() => {}}
        />,
      );
      await waitFor(() => expect(watch.clicked()).toBe(true));
    } finally {
      watch.stop();
    }
    expect(onPlay).toHaveBeenCalledWith(PATHS, PATHS[1], undefined);
  });

  it("sanatçı sayfası", async () => {
    const onPlay = vi.fn();
    const watch = doubleClickWhenShown("Bulut");
    try {
      render(
        <ArtistPage
          artist={artist}
          albums={[album]}
          tracks={TRACKS}
          refreshKey={0}
          current={null}
          currentPath={null}
          playing={false}
          camelot={false}
          onBack={() => {}}
          onOpenAlbum={() => {}}
          onPlay={onPlay}
        />,
      );
      await waitFor(() => expect(watch.clicked()).toBe(true));
    } finally {
      watch.stop();
    }
    expect(onPlay).toHaveBeenCalledWith(PATHS, PATHS[1], undefined);
  });
});
