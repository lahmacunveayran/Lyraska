import { describe, expect, it } from "vitest";

import { menuSide } from "./menuSide";

const panel = { left: 20, right: 1520 };

describe("menuSide", () => {
  it("düğme sağ köşedeyken menü sola uzanır (panelin içinde kalır)", () => {
    expect(menuSide({ left: 1340, right: 1510 }, 300, panel)).toBe("end");
  });

  it("düğme alt satırda solda kalınca menü sağa uzanır (sola taşmaz)", () => {
    // Ekran görüntüsündeki durum: düğme 24–198 px, menü 300 px; sola açılsa 124 px panelin dışında.
    expect(menuSide({ left: 24, right: 198 }, 300, panel)).toBe("start");
  });

  it("tam sığdığında sola uzanmayı korur", () => {
    expect(menuSide({ left: 200, right: 320 }, 300, panel)).toBe("end");
  });

  it("iki yana da sığmazsa taşmanın az olduğu yan", () => {
    const narrow = { left: 0, right: 250 };
    expect(menuSide({ left: 10, right: 60 }, 300, narrow)).toBe("start");
    expect(menuSide({ left: 190, right: 240 }, 300, narrow)).toBe("end");
  });
});
