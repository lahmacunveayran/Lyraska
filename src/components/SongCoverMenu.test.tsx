import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LibraryTrack } from "../lib/backend";
import { SongCoverContext } from "./songCoverContext";
import { TrackTable } from "./TrackTable";

const song = (path: string, title: string, customCover?: boolean): LibraryTrack => ({
  id: path.length,
  path,
  title,
  artist: null,
  album: null,
  albumArtist: null,
  trackNumber: null,
  durationSecs: 100,
  codec: "flac",
  bpm: null,
  analyzed: false,
  key: null,
  customCover,
});

function setup(actions: { choose: (p: string) => void; clear: (p: string) => void } | null) {
  const onPlay = vi.fn();
  render(
    <SongCoverContext.Provider value={actions}>
      <TrackTable
        rows={[song("D:/a.flac", "Ay"), song("D:/b.flac", "Bulut", true)]}
        currentPath={null}
        playing={false}
        camelot={false}
        label="Şarkılar"
        onPlay={onPlay}
      />
    </SongCoverContext.Provider>,
  );
  return onPlay;
}

/** Menüyü açar. */
function open(title: string) {
  fireEvent.click(screen.getByRole("button", { name: `Şarkının kapağı: ${title}` }));
}

describe("şarkının kapağı", () => {
  it("kapağı seçilmemiş şarkıya kapak seçilir; kaldırma seçeneği yoktur", async () => {
    const choose = vi.fn();
    const clear = vi.fn();
    const onPlay = setup({ choose, clear });
    // Kapalı menünün seçenekleri sayfada yok (satırın metnine karışmaz).
    expect(screen.queryByRole("button", { name: "Kapak seç…" })).toBeNull();
    open("Ay");
    expect(screen.getByRole("button", { name: "Şarkının kapağı: Ay" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.queryByRole("button", { name: "Seçtiğim kapağı kaldır" })).toBeNull();
    const button = await screen.findByRole("button", { name: "Kapak seç…" });
    fireEvent.doubleClick(button);
    fireEvent.click(button);
    expect(choose).toHaveBeenCalledWith("D:/a.flac");
    expect(clear).not.toHaveBeenCalled();
    expect(onPlay).not.toHaveBeenCalled();
    // Seçince menü kapanır.
    expect(screen.queryByRole("button", { name: "Kapak seç…" })).toBeNull();
    expect(screen.getByRole("row", { name: /Ay/ })).toHaveAttribute("aria-selected", "false");
  });

  it("kapağı seçilmiş şarkının kapağı değiştirilir ya da kaldırılır", async () => {
    const choose = vi.fn();
    const clear = vi.fn();
    setup({ choose, clear });
    open("Bulut");
    fireEvent.click(await screen.findByRole("button", { name: "Seçtiğim kapağı kaldır" }));
    expect(clear).toHaveBeenCalledWith("D:/b.flac");
    expect(choose).not.toHaveBeenCalled();
  });

  it("Esc ve dışarı tıklama menüyü kapatır; Esc odağı düğmeye döndürür", () => {
    setup({ choose: vi.fn(), clear: vi.fn() });
    open("Ay");
    const choose = screen.getByRole("button", { name: "Kapak seç…" });
    expect(choose).toHaveFocus();
    fireEvent.keyDown(choose, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Kapak seç…" })).toBeNull();
    expect(screen.getByRole("button", { name: "Şarkının kapağı: Ay" })).toHaveFocus();
    open("Ay");
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("button", { name: "Kapak seç…" })).toBeNull();
  });

  it("seçenek seçilince odak düğmeye döner (klavyeyle gezen yerini kaybetmez)", () => {
    setup({ choose: vi.fn(), clear: vi.fn() });
    open("Bulut");
    fireEvent.click(screen.getByRole("button", { name: "Seçtiğim kapağı kaldır" }));
    expect(screen.getByRole("button", { name: "Şarkının kapağı: Bulut" })).toHaveFocus();
  });

  it("kütüphane paneli işlemleri vermediyse satırda kapak menüsü yok", () => {
    setup(null);
    expect(screen.queryByLabelText("Şarkının kapağı: Ay")).toBeNull();
  });
});
