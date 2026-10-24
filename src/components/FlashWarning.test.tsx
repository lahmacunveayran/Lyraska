import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FLASH_WARNING_KEY, FlashWarning } from "./FlashWarning";

afterEach(() => window.localStorage.clear());

describe("ışığa duyarlılık uyarısı", () => {
  it('ilk açılışta görünür; "Anladım" bir daha göstermez', () => {
    const onEnableSafe = vi.fn();
    const { unmount } = render(<FlashWarning safe={false} onEnableSafe={onEnableSafe} />);
    expect(
      screen.getByRole("alertdialog", { name: "Işığa duyarlılık uyarısı" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Anladım" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onEnableSafe).not.toHaveBeenCalled();
    unmount();
    render(<FlashWarning safe={false} onEnableSafe={onEnableSafe} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("güvenli modu tek tıkla açtırır ve bir daha görünmez", () => {
    const onEnableSafe = vi.fn();
    render(<FlashWarning safe={false} onEnableSafe={onEnableSafe} />);
    fireEvent.click(screen.getByRole("button", { name: "Epilepsi güvenli modunu aç" }));
    expect(onEnableSafe).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(FLASH_WARNING_KEY)).toBe("1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("güvenli mod zaten açıksa gösterilmez", () => {
    render(<FlashWarning safe onEnableSafe={vi.fn()} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
