import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LyricsControls } from "../hooks/useLyrics";
import type { LyricLine, Lyrics } from "../lib/backend";
import { LyricsOverlay } from "./LyricsOverlay";
import { LyricsPanel } from "./LyricsPanel";
import { PhotoLyrics } from "./PhotoLyrics";

const pkg = vi.hoisted(() => ({
  installed: false,
  picked: null as string | null,
  pick: vi.fn<() => Promise<string | null>>(),
  install: vi.fn<(path: string) => Promise<void>>(async () => undefined),
}));

vi.mock("../lib/backend", async (original) => ({
  ...(await original<typeof import("../lib/backend")>()),
  isLyricsPackageInstalled: async () => pkg.installed,
  pickLyricsPackageFile: () => pkg.pick(),
  installLyricsPackage: (path: string) => pkg.install(path),
}));

function line(start: number, end: number, text: string, uncertain: boolean): LyricLine {
  return {
    start,
    end,
    text,
    translation: null,
    estimated: true,
    uncertain,
    words: [{ start, end, text }],
  };
}

const auto: Lyrics = {
  source: "user",
  synced: true,
  lines: [line(10, 12, "Gece yolunda", false), line(12, 14, "Işıklar akıyor", true)],
  auto: "partlyEstimated",
};

const untimed: Lyrics = {
  source: "user",
  synced: false,
  lines: [line(0, 0, "Gece", false)],
  auto: null,
};

function controls(shown: Lyrics | null) {
  return {
    lyrics: shown,
    visible: true,
    setVisible: () => undefined,
    shiftMs: 0,
    setShift: () => undefined,
    shiftNotice: null,
    loadText: vi.fn(async () => ({ source: "user" as const, text: "Gece" })),
    saveText: vi.fn(async () => undefined),
    clearText: vi.fn(async () => undefined),
    refresh: vi.fn(),
  } satisfies LyricsControls;
}

beforeEach(() => {
  pkg.installed = false;
  pkg.picked = null;
  pkg.pick.mockReset();
  pkg.pick.mockImplementation(async () => pkg.picked);
  pkg.install.mockClear();
});

describe("otomatik zamanlanan sözler sahnede", () => {
  it('emin olunamayan satır soluk ve yanında "tahmini"; güvenli satırda yazmaz', () => {
    const { container, rerender } = render(<LyricsOverlay lyrics={auto} positionSecs={11} />);
    expect(container.querySelector(".lyrics__line")).not.toHaveClass("is-uncertain");
    expect(container.querySelector(".lyrics__tag")).toBeNull();
    rerender(<LyricsOverlay lyrics={auto} positionSecs={13} />);
    expect(container.querySelector(".lyrics__line")).toHaveClass("is-uncertain");
    expect(container.querySelector(".lyrics__tag")).toHaveTextContent("tahmini");
    // Etiket satırın dışında: satırın metni sözün metnidir (zamanlama denetimi buna bakar).
    expect(container.querySelector(".lyrics__line")).toHaveTextContent(/^Işıklar akıyor$/);
  });

  it('"Kendi resmin" söz satırında da tahmini satır işaretli', () => {
    const { container, rerender } = render(
      <PhotoLyrics lyrics={auto} positionSecs={11} safe={false} />,
    );
    expect(container.querySelector(".photo-lyrics__tag")).toBeNull();
    rerender(<PhotoLyrics lyrics={auto} positionSecs={13} safe={false} />);
    expect(container.querySelector(".photo-lyrics__line")).toHaveClass("is-uncertain");
    expect(container.querySelector(".photo-lyrics__tag")).toHaveTextContent("tahmini");
    expect(container.querySelector(".photo-lyrics__line")).toHaveTextContent(/^Işıklar akıyor$/);
  });
});

describe("Sözler panelinde otomatik zamanlama", () => {
  it("paket yoksa zamansız sözde not ve düğme; seçilen dosya kurulur, sözler yeniden okunur", async () => {
    const lyrics = controls(untimed);
    render(<LyricsPanel lyrics={lyrics} trackPath="C:/a.flac" trackTitle="A" visible />);
    const add = await screen.findByRole("button", { name: "Söz paketini ekle…" });
    expect(screen.getByText(/bir kez söz paketini eklemeniz gerekir/)).toBeInTheDocument();
    // Seçim penceresi kapatıldı: hiçbir şey olmaz.
    await act(async () => fireEvent.click(add));
    expect(pkg.install).not.toHaveBeenCalled();
    pkg.picked = "C:/İndirilenler/model.int8.onnx";
    await act(async () => fireEvent.click(add));
    expect(pkg.install).toHaveBeenCalledWith("C:/İndirilenler/model.int8.onnx");
    expect(lyrics.refresh).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Söz paketi eklendi");
    expect(screen.queryByRole("button", { name: "Söz paketini ekle…" })).toBeNull();
    expect(screen.getByText(/oturtuluyor/)).toBeInTheDocument();
  });

  it("paket değilse hata yazar, düğme kalır", async () => {
    pkg.install.mockRejectedValueOnce("Bu dosya Lyraska söz paketi değil.");
    pkg.picked = "C:/baska.onnx";
    const lyrics = controls(untimed);
    render(<LyricsPanel lyrics={lyrics} trackPath="C:/a.flac" trackTitle="A" visible />);
    const add = await screen.findByRole("button", { name: "Söz paketini ekle…" });
    await act(async () => fireEvent.click(add));
    expect(screen.getByRole("status")).toHaveTextContent("söz paketi değil");
    expect(lyrics.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Söz paketini ekle…" })).toBeEnabled();
  });

  it("çift tıklama ikinci seçim penceresini ve ikinci kurulumu açmaz", async () => {
    let choose: (path: string | null) => void = () => undefined;
    pkg.pick.mockImplementation(
      () =>
        new Promise<string | null>((done) => {
          choose = done;
        }),
    );
    render(<LyricsPanel lyrics={controls(untimed)} trackPath="C:/a.flac" trackTitle="A" visible />);
    const add = await screen.findByRole("button", { name: "Söz paketini ekle…" });
    await act(async () => {
      fireEvent.click(add);
      fireEvent.click(add);
    });
    expect(add).toBeDisabled();
    await act(async () => choose("C:/model.onnx"));
    expect(pkg.pick).toHaveBeenCalledTimes(1);
    expect(pkg.install).toHaveBeenCalledTimes(1);
  });

  it("seçim penceresi açılamazsa nedeni yazar, düğme yeniden basılabilir", async () => {
    pkg.pick.mockRejectedValueOnce("Pencere açılamadı.");
    render(<LyricsPanel lyrics={controls(untimed)} trackPath="C:/a.flac" trackTitle="A" visible />);
    const add = await screen.findByRole("button", { name: "Söz paketini ekle…" });
    await act(async () => fireEvent.click(add));
    expect(screen.getByRole("status")).toHaveTextContent("Pencere açılamadı.");
    expect(add).toBeEnabled();
  });

  it("oturtulmuş sözün hükmü yazar; çoğu oturmadıysa uyarı", async () => {
    pkg.installed = true;
    const view = render(
      <LyricsPanel lyrics={controls(auto)} trackPath="C:/a.flac" trackTitle="A" visible />,
    );
    await waitFor(() => expect(screen.getByText(/soluk satırlar tahmini/)).toBeInTheDocument());
    view.rerender(
      <LyricsPanel
        lyrics={controls({ ...auto, auto: "unaligned" })}
        trackPath="C:/a.flac"
        trackTitle="A"
        visible
      />,
    );
    expect(screen.getByText(/Sözlerin çoğu bu şarkıya oturmadı/).parentElement).toHaveClass(
      "is-unaligned",
    );
    // Dosyadan zamanlı söz: not yok.
    view.rerender(
      <LyricsPanel
        lyrics={controls({ ...auto, source: "file", auto: null })}
        trackPath="C:/a.flac"
        trackTitle="A"
        visible
      />,
    );
    expect(document.querySelector(".lyricsedit__auto")).toBeNull();
  });
});
