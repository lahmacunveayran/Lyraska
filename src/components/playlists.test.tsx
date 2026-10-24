import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryTrack, Playlist } from "../lib/backend";
import { albumCoverIndex } from "../lib/albumCovers";
import { usePlaylists } from "../hooks/usePlaylists";
import { AddToPlaylist } from "./AddToPlaylist";
import { PlaylistGrid } from "./PlaylistGrid";
import { PlaylistPage } from "./PlaylistPage";
import { collageRequests } from "./PlaylistCover";

// Sahte çekirdek: listeler bellekte.
const backend = vi.hoisted(() => ({
  lists: [] as { id: number; name: string; paths: string[] }[],
  nextId: 1,
  calls: [] as string[],
}));

const row = (list: { id: number; name: string; paths: string[] }): Playlist => ({
  id: list.id,
  name: list.name,
  trackCount: list.paths.length,
  durationSecs: 0,
  collagePaths: [],
});

vi.mock("../lib/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/backend")>();
  const find = (id: number) => {
    const list = backend.lists.find((l) => l.id === id);
    if (!list) throw new Error("Çalma listesi bulunamadı (silinmiş olabilir).");
    return list;
  };
  return {
    ...actual,
    isDesktop: () => true,
    listPlaylists: async () => backend.lists.map(row),
    createPlaylist: async (name: string) => {
      const list = { id: backend.nextId++, name: name.trim(), paths: [] };
      backend.lists.unshift(list);
      return row(list);
    },
    renamePlaylist: async (id: number, name: string) => {
      find(id).name = name.trim();
    },
    deletePlaylist: async (id: number) => {
      backend.lists = backend.lists.filter((l) => l.id !== id);
    },
    playlistTracks: async (id: number) => [...find(id).paths],
    addToPlaylist: async (id: number, paths: string[]) => {
      find(id).paths.push(...paths);
      return paths.length;
    },
    removeFromPlaylist: async (id: number, positions: number[]) => {
      backend.calls.push(`remove ${positions.join(",")}`);
      const list = find(id);
      list.paths = list.paths.filter((_, i) => !positions.includes(i));
    },
    moveInPlaylist: async (id: number, from: number, to: number) => {
      backend.calls.push(`move ${from}→${to}`);
      const list = find(id);
      const [moved] = list.paths.splice(from, 1);
      list.paths.splice(to, 0, moved!);
    },
    getPlaylistCover: async () => null,
    albumCoverUrl: async () => null,
  };
});

const song = (path: string, title: string, album: string | null = null): LibraryTrack => ({
  id: path.length,
  path,
  title,
  artist: "Sanatçı",
  album,
  albumArtist: null,
  trackNumber: null,
  durationSecs: 180,
  codec: "flac",
  bpm: null,
  analyzed: false,
  key: null,
});

beforeEach(() => {
  backend.lists = [];
  backend.nextId = 1;
  backend.calls = [];
});

describe("çalma listeleri", () => {
  it("yeni liste hemen listeye girer (sayfası tazelemeyi beklemeden açılır)", async () => {
    const { result } = renderHook(() => usePlaylists("k"));
    await waitFor(() => expect(result.current.playlists).toEqual([]));
    let created: Playlist | null = null;
    await act(async () => {
      created = await result.current.create("  Yolculuk  ");
    });
    expect(created).toMatchObject({ name: "Yolculuk" });
    expect(result.current.playlists?.map((p) => p.name)).toEqual(["Yolculuk"]);
  });

  it("ızgaradaki 'Yeni liste' adı alır, listeyi kurar ve sayfasını açar; Esc vazgeçer", async () => {
    const onCreate = vi.fn(async (name: string) => ({ ...row({ id: 7, name, paths: [] }) }));
    const onOpen = vi.fn();
    render(
      <PlaylistGrid
        playlists={[]}
        byPath={new Map()}
        coverIndex={new Map()}
        coverRevision={0}
        onOpen={onOpen}
        onPlay={vi.fn()}
        onCreate={onCreate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Yeni liste/ }));
    const input = screen.getByRole("textbox", { name: "Yeni listenin adı" });
    expect(screen.getByRole("button", { name: "Oluştur" })).toBeDisabled();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Yeni liste/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Gece" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Oluştur" })));
    expect(onCreate).toHaveBeenCalledWith("Gece");
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 7, name: "Gece" }));
  });

  it("boş listede çal düğmesi yok, dolu listede baştan çalar", () => {
    const onPlay = vi.fn();
    render(
      <PlaylistGrid
        playlists={[
          row({ id: 1, name: "Boş", paths: [] }),
          row({ id: 2, name: "Dolu", paths: ["a"] }),
        ]}
        byPath={new Map()}
        coverIndex={new Map()}
        coverRevision={0}
        onOpen={vi.fn()}
        onPlay={onPlay}
        onCreate={vi.fn()}
      />,
    );
    const play = screen.getAllByRole("button", { name: "Baştan çal" });
    expect(play).toHaveLength(1);
    fireEvent.click(play[0]!);
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ name: "Dolu" }));
  });

  it("'Listeye ekle': var olan listeye ve yeni listeye şarkıları ekler, bildirir", async () => {
    const lists = [row({ id: 3, name: "Spor", paths: [] })];
    const onAdd = vi.fn(async (_id: number, paths: string[]) => paths.length);
    const onCreate = vi.fn(async (name: string) => row({ id: 4, name, paths: [] }));
    const { rerender } = render(
      <AddToPlaylist
        playlists={lists}
        paths={[]}
        label="Albümü listeye ekle"
        onAdd={onAdd}
        onCreate={onCreate}
      />,
    );
    // Şarkı yokken menü açılmaz.
    const summary = screen.getByLabelText("Albümü listeye ekle");
    expect(summary).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(summary);
    expect(summary.closest("details")).not.toHaveAttribute("open");

    rerender(
      <AddToPlaylist
        playlists={lists}
        paths={["a.flac", "b.flac"]}
        label="Albümü listeye ekle"
        onAdd={onAdd}
        onCreate={onCreate}
      />,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Spor" })));
    expect(onAdd).toHaveBeenLastCalledWith(3, ["a.flac", "b.flac"]);
    expect(screen.getByRole("status")).toHaveTextContent("2 şarkı “Spor” listesine eklendi.");

    fireEvent.click(screen.getByRole("button", { name: "Yeni liste…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Yeni listenin adı" }), {
      target: { value: "Yaz" },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Oluştur" })));
    expect(onCreate).toHaveBeenCalledWith("Yaz");
    expect(onAdd).toHaveBeenLastCalledWith(4, ["a.flac", "b.flac"]);
    expect(screen.getByRole("status")).toHaveTextContent("“Yaz”");
  });

  it("liste sayfası: aynı şarkı iki kez olabilir, doğru satır çıkar ve taşınır, çalar", async () => {
    backend.lists = [{ id: 1, name: "Karışık", paths: ["a.flac", "b.flac", "a.flac"] }];
    const tracks = [song("a.flac", "Ay"), song("b.flac", "Bulut")];
    const onPlay = vi.fn();
    const onChanged = vi.fn();
    render(
      <PlaylistPage
        playlist={row(backend.lists[0]!)}
        tracks={tracks}
        byPath={new Map(tracks.map((t) => [t.path, t]))}
        coverIndex={albumCoverIndex(tracks)}
        coverRevision={0}
        refreshKey="k"
        currentPath={null}
        playing={false}
        camelot={false}
        onBack={vi.fn()}
        onPlay={onPlay}
        onRename={vi.fn(async () => true)}
        onDelete={vi.fn()}
        onChooseCover={vi.fn()}
        onClearCover={vi.fn()}
        onChanged={onChanged}
      />,
    );
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4));
    expect(screen.getByRole("heading", { name: "Karışık" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Listeyi çal" }));
    expect(onPlay).toHaveBeenCalledWith(["a.flac", "b.flac", "a.flac"], undefined, "ordered");

    // Üçüncü satırdaki (ikinci "Ay") çıkar; ilki yerinde kalır.
    const removes = screen.getAllByRole("button", { name: "Listeden çıkar: Ay" });
    await act(async () => fireEvent.click(removes[1]!));
    expect(backend.calls).toEqual(["remove 2"]);
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    expect(onChanged).toHaveBeenCalled();

    // Alt+↓ seçili satırı aşağı taşır.
    const list = screen.getByRole("grid").querySelector(".album-page__list") as HTMLElement;
    fireEvent.click(screen.getAllByRole("row")[1]!);
    await act(async () => fireEvent.keyDown(list, { key: "ArrowDown", altKey: true }));
    expect(backend.calls).toEqual(["remove 2", "move 0→1"]);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("row")
          .slice(1)
          .map((r) => r.textContent),
      ).toEqual([expect.stringContaining("Bulut"), expect.stringContaining("Ay")]),
    );

    // Delete seçili satırı çıkarır.
    await act(async () => fireEvent.keyDown(list, { key: "Delete" }));
    expect(backend.calls.at(-1)).toBe("remove 1");
  });

  it("liste sayfası: ad değişir, silme onay ister", async () => {
    backend.lists = [{ id: 1, name: "Eski", paths: [] }];
    const onRename = vi.fn(async () => true);
    const onDelete = vi.fn();
    render(
      <PlaylistPage
        playlist={row(backend.lists[0]!)}
        tracks={[]}
        byPath={new Map()}
        coverIndex={new Map()}
        coverRevision={0}
        refreshKey="k"
        currentPath={null}
        playing={false}
        camelot={false}
        onBack={vi.fn()}
        onPlay={vi.fn()}
        onRename={onRename}
        onDelete={onDelete}
        onChooseCover={vi.fn()}
        onClearCover={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Liste boş/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Listeyi çal" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Adını değiştir…" }));
    const input = screen.getByRole("textbox", { name: "Listenin yeni adı" });
    expect(input).toHaveValue("Eski");
    fireEvent.change(input, { target: { value: "Yeni" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Kaydet" })));
    expect(onRename).toHaveBeenCalledWith("Yeni");
    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Listeyi sil…" }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Evet" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("kolaj: kütüphanede olmayan ve albümsüz şarkı atlanır, en çok dört kapak", () => {
    const tracks = [
      song("1", "a", "A"),
      song("2", "b", "B"),
      song("3", "c", null),
      song("4", "d", "D"),
      song("5", "e", "E"),
      song("6", "f", "F"),
    ];
    const byPath = new Map(tracks.map((t) => [t.path, t]));
    const requests = collageRequests(
      ["1", "yok", "2", "3", "4", "5", "6"],
      byPath,
      albumCoverIndex(tracks),
    );
    expect(requests.map((r) => r.album)).toEqual(["A", "B", "D", "E"]);
  });
});
