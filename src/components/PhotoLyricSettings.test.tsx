import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { usePhotoLyricLook } from "../hooks/usePhotoLyricLook";
import { DEFAULT_LOOK, loadLook } from "../lib/photoLyricLook";
import { PhotoLyricSettings } from "./PhotoLyricSettings";

/** Gerçek hook'la çizer: her değişiklik hem ekranda hem kayıtta görülür. */
function Harness() {
  const controls = usePhotoLyricLook();
  return <PhotoLyricSettings controls={controls} />;
}

describe("PhotoLyricSettings", () => {
  afterEach(() => window.localStorage.clear());

  it("boyut, yer, yükseklik, renk ve zemin değişir ve hatırlanır", () => {
    render(<Harness />);
    const size = screen.getByRole("slider", { name: "Sözlerin boyutu" });
    expect(size).toHaveValue(String(DEFAULT_LOOK.scale));
    fireEvent.change(size, { target: { value: "2" } });
    expect(loadLook().scale).toBe(2);
    expect(size).toHaveAttribute("aria-valuetext", "2×");

    // Yükseklik yalnızca "Üstte" seçiliyken.
    expect(screen.queryByRole("slider", { name: /yüksekliği/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Üstte" }));
    expect(screen.getByRole("button", { name: "Üstte" })).toHaveAttribute("aria-pressed", "true");
    const top = screen.getByRole("slider", { name: /yüksekliği/ });
    fireEvent.change(top, { target: { value: "0.3" } });
    expect(loadLook()).toMatchObject({ place: "top", top: 0.3 });

    fireEvent.click(screen.getByRole("button", { name: "Sıcak" }));
    expect(loadLook().color).toBe("#ffe2a8");
    expect(screen.getByRole("button", { name: "Sıcak" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Özel renk"), { target: { value: "#123456" } });
    expect(loadLook().color).toBe("#123456");
    // Özel renkte hazır renklerin hiçbiri seçili görünmez.
    expect(screen.getByRole("button", { name: "Sıcak" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Kapalı" }));
    expect(loadLook().backdrop).toBe("off");
  });

  it("varsayılana dön: hepsi geri gelir; varsayılandayken düğme kapalı", () => {
    render(<Harness />);
    const reset = screen.getByRole("button", { name: "Varsayılana dön" });
    expect(reset).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Gül" }));
    expect(reset).toBeEnabled();
    fireEvent.click(reset);
    expect(loadLook()).toEqual(DEFAULT_LOOK);
    expect(reset).toBeDisabled();
  });

  it("hook geçersiz değeri aralığa oturtur", () => {
    const { result } = renderHook(() => usePhotoLyricLook());
    act(() => result.current.update({ scale: 99, top: -1, color: "kırmızı" }));
    expect(result.current.look).toMatchObject({ scale: 2.4, top: 0.06, color: "#ffffff" });
  });
});
