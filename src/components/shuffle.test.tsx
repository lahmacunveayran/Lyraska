import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryAlbum, PlaybackStatus, TrackInfo } from "../lib/backend";
import { queueFrom, seededRandom, shuffledQueueFrom, withShuffle } from "../lib/queue";
import { usePlayback, useShuffleShortcut } from "../hooks/usePlayback";
import { AlbumPage } from "./AlbumPage";
import { Dock } from "./Dock";

// Sahte çekirdek: şarkı hemen açılır ve çalar.
const backend = vi.hoisted(() => ({
  current: null as string | null,
  opened: [] as string[],
  next: [] as (string | null)[],
  albumPaths: [] as string[],
}));

const trackInfo = (path: string): TrackInfo => ({
  path,
  fileName: path,
  title: path,
  artist: null,
  album: null,
  albumArtist: null,
  trackNumber: null,
  discNumber: null,
  codec: "flac",
  sampleRate: 44100,
  channels: 2,
  durationSecs: 200,
});

const status = (): PlaybackStatus => ({
  state: backend.current ? "playing" : "idle",
  track: backend.current ? trackInfo(backend.current) : null,
  positionSecs: 0,
  underruns: 0,
  error: null,
  bpm: null,
  output: null,
});

vi.mock("../lib/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/backend")>();
  return {
    ...actual,
    isDesktop: () => true,
    openTrack: async (path: string) => {
      backend.opened.push(path);
      backend.current = path;
      return trackInfo(path);
    },
    getPlaybackStatus: async () => status(),
    setNextTrack: async (path: string | null) => {
      backend.next.push(path);
    },
    libraryAlbumTracks: async () => backend.albumPaths,
    albumCoverUrl: async () => null,
  };
});

const ALBUM_PATHS = Array.from({ length: 8 }, (_, i) => `C:\\Müzik\\Albüm\\${i + 1}.flac`);
const album: LibraryAlbum = {
  name: "Albüm",
  artist: "Sanatçı",
  trackCount: ALBUM_PATHS.length,
  durationSecs: 1600,
  coverPath: ALBUM_PATHS[0]!,
  bpm: null,
  key: null,
};
const SEED = 4;

/** Albüm sayfası ve alt çubuk gerçek çalma sırasına bağlı (tohumlu karıştırma). */
function Harness({ recording = false }: { recording?: boolean }) {
  const playback = usePlayback(["flac"], { random: seededRandom(SEED) });
  useShuffleShortcut(playback.toggleShuffle, playback.player.available && !recording);
  const { player } = playback;
  return (
    <>
      <AlbumPage
        album={album}
        tracks={[]}
        refreshKey={0}
        currentPath={player.status.track?.path ?? null}
        playing={player.status.state === "playing"}
        camelot={false}
        onBack={() => {}}
        onPlay={playback.playList}
        onChooseCover={() => {}}
        onClearCover={() => {}}
      />
      <output data-testid="label">{playback.queueLabel}</output>
      <Dock
        player={player}
        position={0}
        layout={null}
        canNext={playback.canNext}
        onPrevious={playback.previous}
        onNext={playback.next}
        shuffle={playback.shuffle}
        onToggleShuffle={playback.toggleShuffle}
      />
    </>
  );
}

beforeEach(() => {
  backend.current = null;
  backend.opened = [];
  backend.next = [];
  backend.albumPaths = ALBUM_PATHS;
  window.localStorage.clear();
});
afterEach(() => window.localStorage.clear());

describe("karışık çal", () => {
  it("albüm sayfasındaki 'Karışık çal' albümü karışık sırayla başlatır; Sonraki o sırayı izler", async () => {
    render(<Harness />);
    const albumShuffle = await screen.findByRole("button", { name: "Albümü karışık çal" });
    expect(albumShuffle).toHaveTextContent("Karışık çal");
    await waitFor(() => expect(albumShuffle).toBeEnabled());
    const toggle = screen.getByRole("button", { name: "Karışık çal", pressed: false });

    await act(async () => fireEvent.click(albumShuffle));
    const expected = shuffledQueueFrom(ALBUM_PATHS, null, seededRandom(SEED)).paths;
    await waitFor(() => expect(backend.opened).toEqual([expected[0]]));
    expect(ALBUM_PATHS).toContain(backend.opened[0]);
    expect(expected).not.toEqual(ALBUM_PATHS);
    // Alt çubuktaki düğme de açık görünür; sıradaki karışık sıradan bildirilir.
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(backend.next.at(-1)).toBe(expected[1]));
    expect(screen.getByTestId("label")).toHaveTextContent(`1 / ${ALBUM_PATHS.length}`);

    const nextButton = screen.getByRole("button", { name: "Sonraki" });
    await waitFor(() => expect(nextButton).toBeEnabled());
    await act(async () => fireEvent.click(nextButton));
    await waitFor(() => expect(backend.opened.at(-1)).toBe(expected[1]));
    await waitFor(() =>
      expect(screen.getByTestId("label")).toHaveTextContent(`2 / ${ALBUM_PATHS.length}`),
    );
    expect(window.localStorage.getItem("lyraska.playback.shuffle")).toBe("1");
  });

  it("'Çal' albüm sırasıyla çalar ve karışık çalı kapatır", async () => {
    window.localStorage.setItem("lyraska.playback.shuffle", "1");
    render(<Harness />);
    const play = await screen.findByRole("button", { name: "Albümü çal" });
    await waitFor(() => expect(play).toBeEnabled());
    expect(screen.getByRole("button", { name: "Karışık çal", pressed: true })).toBeInTheDocument();
    await act(async () => fireEvent.click(play));
    await waitFor(() => expect(backend.opened).toEqual([ALBUM_PATHS[0]]));
    await waitFor(() => expect(backend.next.at(-1)).toBe(ALBUM_PATHS[1]));
    expect(screen.getByRole("button", { name: "Karışık çal", pressed: false })).toBeInTheDocument();
  });

  it("alt çubuktaki düğme çalan sırayı karıştırır, kapatınca asıl sıraya döner", async () => {
    render(<Harness />);
    const play = await screen.findByRole("button", { name: "Albümü çal" });
    await waitFor(() => expect(play).toBeEnabled());
    await act(async () => fireEvent.click(play));
    await waitFor(() => expect(backend.next.at(-1)).toBe(ALBUM_PATHS[1]));

    const toggle = screen.getByRole("button", { name: "Karışık çal", pressed: false });
    expect(toggle).toHaveAttribute("title", "Karışık çal: kapalı (S)");
    await act(async () => fireEvent.click(toggle));
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    // Çalan şarkı yerinde kalır (yeniden açılmaz). Çekirdeğe bildirilmiş sıradaki (2) de
    // yerinde kalır; ondan sonrakiler karışır.
    const expected = withShuffle(
      queueFrom(ALBUM_PATHS, ALBUM_PATHS[0]!),
      true,
      seededRandom(SEED),
      true,
    ).paths;
    expect(expected.slice(2)).not.toEqual(ALBUM_PATHS.slice(2));
    expect(backend.opened).toEqual([ALBUM_PATHS[0]]);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sonraki" })));
    await waitFor(() => expect(backend.opened.at(-1)).toBe(ALBUM_PATHS[1]));
    await waitFor(() => expect(backend.next.at(-1)).toBe(expected[2]));
    expect(screen.getByTestId("label")).toHaveTextContent(`2 / ${ALBUM_PATHS.length}`);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sonraki" })));
    await waitFor(() => expect(backend.opened.at(-1)).toBe(expected[2]));

    // Kapatınca asıl sıraya dönülür; bildirilmiş sıradaki şarkı yerinde kalır.
    const announced = expected[3]!;
    await act(async () => fireEvent.click(toggle));
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(backend.next.at(-1)).toBe(announced));
    const restored = ALBUM_PATHS.filter((path) => path !== announced);
    const index = restored.indexOf(expected[2]!);
    expect(screen.getByTestId("label")).toHaveTextContent(`${index + 1} / ${ALBUM_PATHS.length}`);
  });

  it("S tuşu karışık çalı açıp kapatır; yazı yazılırken ve Ctrl ile değil", async () => {
    render(
      <>
        <Harness />
        <input aria-label="Arama" />
      </>,
    );
    const toggle = await screen.findByRole("button", { name: "Karışık çal", pressed: false });
    fireEvent.keyDown(window, { key: "s" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    fireEvent.keyDown(screen.getByLabelText("Arama"), { key: "s" });
    fireEvent.keyDown(window, { key: "s", repeat: true });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "S" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("işaretleme sürerken S karışık çalı değiştirmez", async () => {
    render(<Harness recording />);
    const toggle = await screen.findByRole("button", { name: "Karışık çal", pressed: false });
    fireEvent.keyDown(window, { key: "s" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("tarayıcı deposu okunamaz ve yazılamazsa çökmez: karışık çal kapalı başlar, düğme çalışır", async () => {
    const fail = () => {
      throw new Error("depo kapalı");
    };
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(fail);
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(fail);
    try {
      render(<Harness />);
      const toggle = await screen.findByRole("button", { name: "Karışık çal", pressed: false });
      await act(async () => fireEvent.click(toggle));
      expect(toggle).toHaveAttribute("aria-pressed", "true");
      expect(get).toHaveBeenCalled();
      expect(set).toHaveBeenCalled();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});
