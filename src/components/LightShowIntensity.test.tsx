import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLightShowIntensity } from "../hooks/useLightShowIntensity";
import type { ScenePresetControls } from "../hooks/useScenePresets";
import { defaultLooks } from "../lib/sceneLook";
import { SceneGallery } from "./SceneGallery";

const presets: ScenePresetControls = {
  looks: defaultLooks(),
  setLook: () => undefined,
  presets: [],
  savePreset: () => null,
  deletePreset: () => undefined,
};

describe("Işık Ustası'nın yoğunluğu", () => {
  afterEach(() => window.localStorage.clear());

  it("varsayılan Normal; seçim kaydedilir ve yeniden açılınca hatırlanır", () => {
    const { result, unmount } = renderHook(() => useLightShowIntensity());
    expect(result.current[0]).toBe("normal");
    act(() => result.current[1]("wild"));
    expect(result.current[0]).toBe("wild");
    unmount();
    const again = renderHook(() => useLightShowIntensity());
    expect(again.result.current[0]).toBe("wild");
  });

  it("galeride Işık Ustası seçiliyken Sakin / Normal / Çılgın düğmeleri görünür", () => {
    const onIntensity = vi.fn();
    const { rerender } = render(
      <SceneGallery
        scene="lightshow"
        onChoose={() => undefined}
        presets={presets}
        intensity="normal"
        onIntensity={onIntensity}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Galeri/ }));
    // Yeni sahneler galerinin en üstünde, eski galeri listesi değişmeden.
    const fresh = screen.getByRole("group", { name: "Yeni sahneler" });
    expect(within(fresh).getByRole("button", { name: /Işık Ustası/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(screen.getByRole("group", { name: "Galeri" })).getAllByRole("button"),
    ).toHaveLength(10);
    const chips = within(screen.getByRole("group", { name: "Yoğunluk" })).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(["Sakin", "Normal", "Çılgın"]);
    expect(chips[1]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chips[2]!);
    expect(onIntensity).toHaveBeenCalledWith("wild");
    // Başka sahnede yoğunluk görünmez.
    rerender(
      <SceneGallery
        scene="sea"
        onChoose={() => undefined}
        presets={presets}
        intensity="normal"
        onIntensity={onIntensity}
      />,
    );
    expect(screen.queryByRole("group", { name: "Yoğunluk" })).not.toBeInTheDocument();
  });
});
