import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LyricLine, Lyrics } from "../lib/backend";
import { DYE_MAX, SIM_MAX } from "../lib/inkFluid";
import { inkSize, lightSource, pixelSize } from "./LyricInk";
import { LyricsOverlay } from "./LyricsOverlay";

function line(start: number, words: [string, number][]): LyricLine {
  let t = start;
  const timed = words.map(([text, d], k) => {
    const w = { start: t, end: t + d, text: k < words.length - 1 ? `${text} ` : text };
    t += d;
    return w;
  });
  return {
    start,
    end: t,
    text: timed.map((w) => w.text).join(""),
    translation: null,
    estimated: false,
    uncertain: false,
    words: timed,
  };
}

const lyrics: Lyrics = {
  source: "file",
  synced: true,
  lines: [
    line(10, [
      ["Gece", 0.5],
      ["yolunda", 1.5],
    ]),
    line(11.9, [["Işıklar", 1]]),
    line(20, [["Yol", 1]]),
  ],
  auto: null,
};

describe("Mürekkep söz görünümü", () => {
  it("akışkanın tuvali sözün yanında; tel, yıldız, meteor ve hayalet yok; satırın metni aynı", () => {
    // 11,9: bitişik satır başladı (Lir görünümünde önceki satırın hayaleti çıkardı).
    const view = render(<LyricsOverlay lyrics={lyrics} positionSecs={11.95} effect="ink" />);
    const c = view.container;
    expect(c.querySelector(".lyrics-ink")).not.toBeNull();
    expect(c.querySelector(".lyrics__sky")).toBeNull();
    expect(c.querySelector(".lyrics__ghost")).toBeNull();
    expect(c.querySelector(".lyrics__meteor")).toBeNull();
    expect(c.querySelector(".lyrics__line")).toHaveTextContent(/^Işıklar$/);
    // Ekran kartı yoksa (jsdom) çökmez: sözler görünür, neden tuvalde.
    expect(c.querySelector<HTMLCanvasElement>(".lyrics-ink")!.dataset.webglError).toBeTruthy();
  });

  it("satır arasında da tuval durur (duman dağılmayı sürdürür)", () => {
    const view = render(<LyricsOverlay lyrics={lyrics} positionSecs={15} effect="ink" />);
    expect(view.container.querySelector(".lyrics__line")).toBeNull();
    expect(view.container.querySelector(".lyrics-ink")).not.toBeNull();
  });

  it("güvenli modda, zamansız sözde ve başka görünümde akışkan yok", () => {
    const safe = render(<LyricsOverlay lyrics={lyrics} positionSecs={10.2} effect="ink" safe />);
    expect(safe.container.querySelector(".lyrics-ink")).toBeNull();
    expect(safe.container.querySelector(".lyrics")).toHaveClass("is-safe");
    const untimed = render(
      <LyricsOverlay lyrics={{ ...lyrics, synced: false }} positionSecs={10.2} effect="ink" />,
    );
    expect(untimed.container.querySelector(".lyrics-ink")).toBeNull();
    const lyre = render(<LyricsOverlay lyrics={lyrics} positionSecs={10.2} effect="lyre" />);
    expect(lyre.container.querySelector(".lyrics-ink")).toBeNull();
  });

  it("ızgaralar kare hücreli ve sınırlı; tuval en çok 1,5× yoğunlukta", () => {
    for (const css of [
      [1400, 560],
      [700, 560],
      [3000, 560],
    ] as [number, number][]) {
      for (const software of [false, true]) {
        const { sim, dye } = inkSize(css, software);
        expect(sim[0]).toBeLessThanOrEqual(SIM_MAX[0]);
        expect(sim[1]).toBeLessThanOrEqual(SIM_MAX[1]);
        expect(dye[0]).toBeLessThanOrEqual(DYE_MAX[0]);
        expect(dye[1]).toBeLessThanOrEqual(DYE_MAX[1]);
        // Hücreler kare: ızgaranın en-boy oranı tuvalinkine eşit (yuvarlama payıyla).
        expect(Math.abs(sim[0] / sim[1] - css[0] / css[1])).toBeLessThan(0.06 * (css[0] / css[1]));
      }
    }
    expect(pixelSize([1400, 560], 2, false)).toEqual([1600, 640]);
    expect(pixelSize([800, 400], 1, false)).toEqual([800, 400]);
    const soft = pixelSize([1400, 560], 2, true);
    expect(soft[0] * soft[1]).toBeLessThanOrEqual((1600 * 640) / 4 + 2000);
  });

  it("ışık kaynağı söylenen kelimenin ucunda; kelime bitince söner", () => {
    const l = lyrics.lines[0]!;
    const m = {
      words: [
        { x: 100, y: 200, width: 100, height: 50 },
        { x: 220, y: 200, width: 200, height: 50 },
      ],
    };
    const words = (t: number) =>
      l.words.map((w) => ({
        text: w.text,
        state:
          t >= w.end
            ? ("sung" as const)
            : t < w.start
              ? ("upcoming" as const)
              : ("current" as const),
        progress: Math.min(1, Math.max(0, (t - w.start) / (w.end - w.start))),
      }));
    const during = lightSource(m, l, words(10.5 + 0.75), 10.5 + 0.75, 1000, 500, 0);
    expect(during.strength).toBe(1);
    expect(during.point[0]).toBeCloseTo((220 + 200 * 0.5) / 1000, 9);
    expect(during.point[1]).toBeCloseTo(1 - 225 / 500, 9);
    const after = lightSource(m, l, words(12 + 0.35), 12 + 0.35, 1000, 500, 0);
    expect(after.strength).toBeCloseTo(Math.exp(-1), 9);
    expect(lightSource(m, l, words(9), 9, 1000, 500, 0).strength).toBe(0);
    expect(lightSource(null, l, words(10.2), 10.2, 1000, 500, 0).strength).toBe(0);
  });
});
