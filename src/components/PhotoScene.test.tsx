import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhotoScene } from "./PhotoScene";

describe("Kendi resmin sahnesi", () => {
  it("resim seçilmemişse ortada 'Resim seç…' düğmesi var", () => {
    const choose = vi.fn();
    render(<PhotoScene playing={false} image={null} onChooseImage={choose} />);
    fireEvent.click(screen.getByRole("button", { name: "Resim seç…" }));
    expect(choose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("img", { name: "Şarkıyla oynayan ışık çizgisi" })).toBeInTheDocument();
  });

  it("resim yüklenirken boş düğme görünmez; resim varsa arka planda", () => {
    const { container, rerender } = render(<PhotoScene playing={false} image={undefined} />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<PhotoScene playing={false} image="data:image/png;base64,AA==" />);
    expect(container.querySelector(".photo-scene__image")).toHaveAttribute(
      "src",
      "data:image/png;base64,AA==",
    );
  });

  it("şarkının adı ve sanatçısı büyük harfle (İngilizce adda I)", () => {
    const { container } = render(
      <PhotoScene playing={false} image={null} title="Flying High" artist="DJ Splash Remix" />,
    );
    expect(container.querySelector(".photo-scene__title")).toHaveTextContent("FLYING HIGH");
    expect(container.querySelector(".photo-scene__artist")).toHaveTextContent("DJ SPLASH REMIX");
    expect(container.querySelector(".photo-scene__clock")).toHaveTextContent("00:00");
  });

  it("sanatçısı Türkçe harfliyse addaki i de İ olur", () => {
    const { container } = render(
      <PhotoScene playing={false} image={null} title="Kelimeler" artist="Şebnem Ferah" />,
    );
    expect(container.querySelector(".photo-scene__title")).toHaveTextContent("KELİMELER");
    expect(container.querySelector(".photo-scene__artist")).toHaveTextContent("ŞEBNEM FERAH");
  });
});
