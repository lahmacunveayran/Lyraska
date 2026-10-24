import { describe, expect, it } from "vitest";
import {
  MAX_FRAMES,
  MAX_PIXELS,
  dataUrlBytes,
  frameAt,
  frameDelay,
  isAnimated,
} from "./animatedImage";

const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );

/** 1×1 GIF, `frames` kare (çekirdeğin testindeki gibi). */
function gif(frames: number): Uint8Array {
  const out: (string | number[])[] = [
    "GIF89a",
    [1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff],
  ];
  for (let i = 0; i < frames; i++) {
    out.push([0x21, 0xf9, 4, 0, 10, 0, 0, 0]);
    out.push([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0]);
  }
  out.push([0x3b]);
  return bytes(...out);
}

const chunk = (kind: string, body: number[]) => [
  ...[0, 0, 0, body.length],
  ...[...kind].map((c) => c.charCodeAt(0)),
  ...body,
  0,
  0,
  0,
  0,
];

describe("hareketli arka plan: tanıma ve zamanlama", () => {
  it("GIF, APNG ve hareketli WebP tanınır (çekirdekle aynı kural)", () => {
    expect(isAnimated(gif(1))).toBe(false);
    expect(isAnimated(gif(2))).toBe(true);
    const ihdr = chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
    const idat = chunk("IDAT", [0x78, 0x9c, 0x63, 0, 0, 0, 1, 0, 1]);
    const png = (animated: boolean) =>
      bytes(
        [0x89],
        "PNG\r\n\x1a\n",
        ihdr,
        animated ? chunk("acTL", [0, 0, 0, 2, 0, 0, 0, 0]) : [],
        idat,
      );
    expect(isAnimated(png(false))).toBe(false);
    expect(isAnimated(png(true))).toBe(true);
    const webp = (body: number[]) => bytes("RIFF", [body.length + 4, 0, 0, 0], "WEBP", body);
    const still = [
      ..."VP8L".split("").map((c) => c.charCodeAt(0)),
      5,
      0,
      0,
      0,
      0x2f,
      0,
      0,
      0,
      0,
      0,
    ];
    const anim = [
      ..."VP8X".split("").map((c) => c.charCodeAt(0)),
      10,
      0,
      0,
      0,
      2,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];
    expect(isAnimated(webp(still))).toBe(false);
    expect(isAnimated(webp(anim))).toBe(true);
    // Kareleri sayılamayan bozuk GIF hareketli sayılır (güvenli yan: <img>'e verilmez).
    const broken = gif(1).slice(0, 30);
    expect(isAnimated(bytes([...broken], [0x99]))).toBe(true);
    // JPEG değil.
    expect(isAnimated(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
  });

  it("data: adresinin baytları", () => {
    const data = dataUrlBytes("data:image/gif;base64," + btoa(String.fromCharCode(...gif(2))));
    expect(data?.type).toBe("image/gif");
    expect(isAnimated(data!.bytes)).toBe(true);
    expect(dataUrlBytes("resim.gif")).toBeNull();
  });

  it("kare zamanlaması: tarayıcılar gibi 10 ms altı 100 ms; tekrar bitince son kare", () => {
    expect(frameDelay(0)).toBe(100);
    expect(frameDelay(10)).toBe(100);
    expect(frameDelay(40)).toBe(40);
    const d = [100, 50, 50];
    expect(frameAt(0, d, Infinity)).toBe(0);
    expect(frameAt(120, d, Infinity)).toBe(1);
    expect(frameAt(160, d, Infinity)).toBe(2);
    expect(frameAt(210, d, Infinity)).toBe(0); // döngü
    expect(frameAt(210, d, 0)).toBe(2); // bir kez: son karede kalır
    expect(frameAt(250, d, 1)).toBe(0); // iki kez
    expect(frameAt(1e9, [50], Infinity)).toBe(0);
  });

  it("sınırlar çekirdekle aynı", () => {
    expect(MAX_FRAMES).toBe(600);
    expect(MAX_PIXELS).toBe(50_000_000);
  });
});
