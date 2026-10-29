import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoScene } from "./PhotoScene";
import { SceneGallery } from "./SceneGallery";
import { usePhotoParticles } from "../hooks/usePhotoParticles";
import type { BackgroundImageControls } from "../hooks/useBackgroundImage";
import type { ScenePresetControls } from "../hooks/useScenePresets";

const particleCanvas = (container: HTMLElement) =>
  container.querySelector<HTMLCanvasElement>(".photo-scene__particles");

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("Kendi resmin · parçacıklar", () => {
  it("varsayılan Kıvılcım: parçacık tuvali çubukların üstünde, tıklamayı yutmaz", () => {
    const { container } = render(<PhotoScene playing image={null} />);
    const canvas = particleCanvas(container);
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveAttribute("data-style", "sparks");
    expect(canvas).toHaveAttribute("aria-hidden");
  });

  it("Kar seçilince Kar, Kapalı'da tuval yok", () => {
    const { container, rerender } = render(<PhotoScene playing image={null} particles="snow" />);
    expect(particleCanvas(container)).toHaveAttribute("data-style", "snow");
    rerender(<PhotoScene playing image={null} particles="off" />);
    expect(particleCanvas(container)).toBeNull();
  });

  it("Epilepsi güvenli modunda parçacık çizilmez", () => {
    for (const particles of ["sparks", "snow"] as const) {
      const { container, unmount } = render(
        <PhotoScene playing safe image={null} particles={particles} />,
      );
      expect(particleCanvas(container)).toBeNull();
      unmount();
    }
  });

  it("'Animasyonları azalt' açıkken parçacık çizilmez", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { container } = render(<PhotoScene playing image={null} particles="sparks" />);
    expect(particleCanvas(container)).toBeNull();
  });
});

describe("Galeri · parçacık seçimi", () => {
  const background: BackgroundImageControls = {
    url: null,
    error: null,
    choose: vi.fn(),
    clear: vi.fn(),
  };

  function Harness() {
    const particles = usePhotoParticles();
    return (
      <>
        <SceneGallery
          scene="photo"
          onChoose={() => undefined}
          presets={{ looks: {}, presets: [] } as unknown as ScenePresetControls}
          background={background}
          particles={particles}
        />
        <PhotoScene playing image={null} particles={particles.style} />
      </>
    );
  }

  it("çipler Kıvılcım/Kar/Kapalı; seçim sahneye geçer ve hatırlanır", () => {
    const { container, unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Kendi resmin/ }));
    const group = screen.getByRole("group", { name: "Parçacıklar" });
    const chip = (name: string) =>
      Array.from(group.querySelectorAll("button")).find((b) => b.textContent === name)!;
    expect(chip("Kıvılcım")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip("Kar"));
    expect(chip("Kar")).toHaveAttribute("aria-pressed", "true");
    expect(particleCanvas(container)).toHaveAttribute("data-style", "snow");
    fireEvent.click(chip("Kapalı"));
    expect(particleCanvas(container)).toBeNull();
    unmount();
    // Yeniden açılınca son seçim (Kapalı).
    const again = render(<Harness />);
    expect(particleCanvas(again.container)).toBeNull();
  });
});
