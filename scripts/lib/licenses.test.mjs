import { describe, expect, it } from "vitest";
import { allowedFromDenyToml, checkLicense, parseSpdx } from "./licenses.mjs";

const allowed = new Set([
  "MIT",
  "Apache-2.0",
  "Zlib",
  "Apache-2.0 WITH LLVM-exception",
  "GPL-3.0-or-later",
]);

describe("SPDX ayrıştırma", () => {
  it("öncelik: AND, OR'dan önce bağlar", () => {
    expect(parseSpdx("MIT OR Apache-2.0 AND Zlib")).toEqual({
      op: "or",
      items: [{ id: "MIT" }, { op: "and", items: [{ id: "Apache-2.0" }, { id: "Zlib" }] }],
    });
  });

  it("WITH istisnası tek lisans sayılır", () => {
    expect(parseSpdx("Apache-2.0 WITH LLVM-exception")).toEqual({
      id: "Apache-2.0 WITH LLVM-exception",
    });
  });

  it("bozuk ifadeler hata verir", () => {
    for (const bad of ["", "(MIT", "MIT OR", "AND MIT", "MIT WITH", "SEE LICENSE IN LICENSE.md"]) {
      expect(() => parseSpdx(bad), bad).toThrow();
    }
  });
});

describe("lisans denetimi (izin listesi)", () => {
  it("izinli lisanslar geçer", () => {
    for (const ok of [
      "MIT",
      "(MIT OR Apache-2.0)",
      "MIT AND Zlib",
      "MIT OR GPL-2.0-only",
      "Apache-2.0 WITH LLVM-exception",
      "GPL-3.0+",
      ["MIT", "BSD-3-Clause"],
      { type: "MIT" },
    ]) {
      expect(checkLicense(ok, allowed), JSON.stringify(ok)).toBeNull();
    }
  });

  it("izinsiz ya da belirsiz lisanslar reddedilir (denetimde bulunan kaçaklar)", () => {
    for (const bad of [
      "GPL-2.0-only", // GPL-3.0-only ile uyumsuz
      "(MIT OR Apache-2.0) AND BUSL-1.1", // AND ile gelen ticari kısıt
      "AGPL-3.0-only",
      "CC-BY-NC-4.0",
      "Proprietary",
      "UNLICENSED",
      "SEE LICENSE IN LICENSE.md",
      "",
      undefined,
      "Apache-2.0 WITH Commons-Clause",
    ]) {
      expect(checkLicense(bad, allowed), String(bad)).not.toBeNull();
    }
  });
});

describe("deny.toml okuma", () => {
  it("[licenses] allow listesini yorumlar dahil okur, başka bölümleri karıştırmaz", () => {
    const toml = `
[graph]
targets = ["x"]

[licenses]
confidence-threshold = 0.9
allow = [
  "MIT",
  # yorum "AGPL-3.0"
  "OFL-1.1",
]

[bans]
allow = ["yanlis"]
`;
    expect([...allowedFromDenyToml(toml)]).toEqual(["MIT", "OFL-1.1"]);
  });
});
