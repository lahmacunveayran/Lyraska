import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LibraryTrack } from "../lib/backend";
import { TrackTable } from "./TrackTable";

const song = (path: string, title: string): LibraryTrack => ({
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
});

describe("dosya konumunu aç", () => {
  it("satırdaki klasör düğmesi o şarkının yolunu açar; satırı seçmez, çift tık çalmaz", () => {
    const onReveal = vi.fn();
    const onPlay = vi.fn();
    render(
      <TrackTable
        rows={[song("D:/Müzik/a.flac", "Ay"), song("D:/Müzik/b.flac", "Bulut")]}
        currentPath={null}
        playing={false}
        camelot={false}
        label="Şarkılar"
        onPlay={onPlay}
        onReveal={onReveal}
      />,
    );
    const button = screen.getByRole("button", { name: "Dosya konumunu aç: Bulut" });
    fireEvent.click(button);
    fireEvent.doubleClick(button);
    expect(onReveal).toHaveBeenCalledWith("D:/Müzik/b.flac");
    expect(onPlay).not.toHaveBeenCalled();
    expect(screen.getAllByRole("row").some((r) => r.getAttribute("aria-selected") === "true")).toBe(
      false,
    );
  });

  it("verilmezse düğme yok", () => {
    render(
      <TrackTable
        rows={[song("a", "Ay")]}
        currentPath={null}
        playing={false}
        camelot={false}
        label="Şarkılar"
        onPlay={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Dosya konumunu aç/ })).toBeNull();
  });
});
