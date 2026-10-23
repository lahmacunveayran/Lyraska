import { afterEach, describe, expect, it } from "vitest";
import { installBrowserGuard, isBrowserShortcut } from "./browserGuard";

const key = (
  k: string,
  mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {},
) => ({
  key: k,
  code: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("tarayıcı kısayolları", () => {
  it("yenileme, yazdırma, arama, geri/ileri engellenir", () => {
    for (const event of [
      key("F5"),
      key("r", { ctrlKey: true }),
      key("R", { ctrlKey: true, shiftKey: true }),
      key("p", { ctrlKey: true }),
      key("f", { ctrlKey: true }),
      key("ArrowLeft", { altKey: true }),
      key("BrowserBack"),
    ]) {
      expect(isBrowserShortcut(event), JSON.stringify(event)).toBe(true);
    }
  });

  it("programın kendi kısayolları ve yakınlaştırma serbest", () => {
    for (const event of [
      key(" "),
      key("ArrowLeft"),
      key("o", { ctrlKey: true }), // Dosya aç
      key("1"),
      key("Escape"),
      key("+", { ctrlKey: true }), // yakınlaştır
      key("-", { ctrlKey: true }),
      key("0", { ctrlKey: true }),
    ]) {
      expect(isBrowserShortcut(event), JSON.stringify(event)).toBe(false);
    }
  });
});

describe("koruma", () => {
  let remove: () => void = () => {};
  afterEach(() => remove());

  it("sağ tık menüsü kapalı, metin kutusunda açık; F5 engellenir", () => {
    remove = installBrowserGuard(window);
    const input = document.createElement("input");
    document.body.append(input);
    const onPage = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(onPage);
    expect(onPage.defaultPrevented).toBe(true);
    const onInput = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    input.dispatchEvent(onInput);
    expect(onInput.defaultPrevented).toBe(false);
    const f5 = new KeyboardEvent("keydown", { key: "F5", bubbles: true, cancelable: true });
    document.body.dispatchEvent(f5);
    expect(f5.defaultPrevented).toBe(true);
    input.remove();
  });
});
