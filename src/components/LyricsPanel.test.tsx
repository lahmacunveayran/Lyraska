import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LyricsControls } from "../hooks/useLyrics";
import type { LyricsText } from "../lib/backend";
import { LyricsPanel } from "./LyricsPanel";

function controls(initial: LyricsText | null) {
  let stored = initial;
  const saveText = vi.fn(async (text: string) => {
    stored = text.trim() ? { source: "user", text } : null;
  });
  const clearText = vi.fn(async () => {
    stored = initial;
  });
  const lyrics = {
    lyrics: null,
    visible: true,
    setVisible: () => undefined,
    shiftMs: 0,
    setShift: () => undefined,
    shiftNotice: null,
    loadText: vi.fn(async () => stored),
    saveText,
    clearText,
  } satisfies LyricsControls;
  return lyrics;
}

const box = () => screen.getByRole("textbox", { name: "Sözler" }) as HTMLTextAreaElement;

describe("Sözler paneli", () => {
  it("şarkının sözleri düzenlenir, kaydedilir; kaynak ve satır sayısı yazar", async () => {
    const lyrics = controls({ source: "file", text: "Gece yolunda yalnız\nIşıklar akıyor" });
    render(<LyricsPanel lyrics={lyrics} trackPath="C:/a.flac" trackTitle="Gece" visible />);
    await waitFor(() => expect(box().value).toBe("Gece yolunda yalnız\nIşıklar akıyor"));
    expect(screen.getByText(/Şu an gösterilen: \.lrc dosyasından/)).toBeInTheDocument();
    expect(screen.getByText(/2 satır · zamansız/)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Kaydet" });
    expect(save).toBeDisabled(); // değişiklik yok
    fireEvent.change(box(), { target: { value: "[00:01.00]Gece yolunda yalnız\nIşıklar akıyor" } });
    expect(screen.getByText(/2 satır · 1 zamanlı, 1 zamansız/)).toBeInTheDocument();
    await act(async () => fireEvent.click(save));
    expect(lyrics.saveText).toHaveBeenCalledWith("[00:01.00]Gece yolunda yalnız\nIşıklar akıyor");
    expect(screen.getByRole("status")).toHaveTextContent("Kaydedildi");
    expect(save).toBeDisabled(); // kaydedilen artık asıl metin
    // Kendi düzenlemesi: şarkının kendi sözlerine dönülebilir (onayla).
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Şarkının kendi sözlerine dön" })),
    );
    expect(confirm).toHaveBeenCalled();
    expect(lyrics.clearText).toHaveBeenCalled();
    await waitFor(() => expect(box().value).toBe("Gece yolunda yalnız\nIşıklar akıyor"));
    confirm.mockRestore();
  });

  it("Vazgeç taslağı asıl metne döndürür; sözsüz şarkıda boş başlar", async () => {
    const lyrics = controls(null);
    render(<LyricsPanel lyrics={lyrics} trackPath="C:/b.flac" trackTitle="B" visible />);
    await waitFor(() => expect(lyrics.loadText).toHaveBeenCalled());
    expect(screen.getByText(/Bu şarkının sözü yok/)).toBeInTheDocument();
    fireEvent.change(box(), { target: { value: "Yeni söz" } });
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(box().value).toBe("");
  });

  it("panel kapalıyken metin okunmaz; şarkı yokken düzenlenemez", () => {
    const lyrics = controls({ source: "file", text: "x" });
    const view = render(
      <LyricsPanel lyrics={lyrics} trackPath="C:/a.flac" trackTitle="A" visible={false} />,
    );
    expect(lyrics.loadText).not.toHaveBeenCalled();
    view.rerender(<LyricsPanel lyrics={lyrics} trackPath={null} trackTitle={null} visible />);
    expect(box()).toBeDisabled();
    expect(screen.getByText("Önce bir şarkı açın.")).toBeInTheDocument();
  });
});
