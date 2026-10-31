import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LyricsControls } from "../hooks/useLyrics";
import type { LyricLine, Lyrics } from "../lib/backend";
import type { LyricEffect } from "../lib/lyricMotion";
import { lyricFrame } from "../lib/lyrics";
import { LyricsOverlay } from "./LyricsOverlay";
import { LyricsPanel } from "./LyricsPanel";

// ---------- Çekirdek taklidi (söz paketi) ----------

const pkg = vi.hoisted(() => ({
  installed: false,
  pick: vi.fn<() => Promise<string | null>>(async () => null),
  install: vi.fn<(path: string) => Promise<void>>(async () => undefined),
}));

vi.mock("../lib/backend", async (original) => ({
  ...(await original<typeof import("../lib/backend")>()),
  isLyricsPackageInstalled: async () => pkg.installed,
  pickLyricsPackageFile: () => pkg.pick(),
  installLyricsPackage: (path: string) => pkg.install(path),
}));

// ---------- Tuval ve yerleşim taklidi (jsdom çizmez, ölçmez) ----------

const drawn = { stroke: 0, drawImage: 0, clearRect: 0 };

function fakeContext(): unknown {
  const target: Record<string, unknown> = {
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  };
  return new Proxy(target, {
    get(obj, key: string) {
      if (key in obj) return obj[key];
      return () => {
        if (key in drawn) drawn[key as keyof typeof drawn]++;
      };
    },
    set(obj, key: string, value) {
      obj[key] = value;
      return true;
    },
  });
}

const geometry = ["clientWidth", "clientHeight", "offsetWidth", "offsetLeft", "offsetTop"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
let clientWidthReads = 0;

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => fakeContext() as CanvasRenderingContext2D,
  );
  (globalThis as { Path2D?: unknown }).Path2D ??= class {
    moveTo() {}
    lineTo() {}
  };
  for (const key of geometry) {
    saved.set(key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement) {
        if (key === "clientWidth") {
          clientWidthReads++;
          return this.tagName === "CANVAS" ? 864 : 800;
        }
        if (key === "clientHeight") return this.tagName === "CANVAS" ? 180 : 70;
        if (key === "offsetWidth") return 90;
        if (key === "offsetTop") return this.tagName === "CANVAS" ? -60 : 0;
        const parent = this.parentElement;
        return parent ? Array.prototype.indexOf.call(parent.children, this) * 95 : 0;
      },
    });
  }
});

afterAll(() => {
  for (const key of geometry) {
    const descriptor = saved.get(key);
    if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
});

beforeEach(() => {
  drawn.stroke = drawn.drawImage = drawn.clearRect = 0;
  clientWidthReads = 0;
  pkg.installed = false;
  pkg.pick.mockReset();
  pkg.pick.mockResolvedValue(null);
  pkg.install.mockReset();
  pkg.install.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---------- Rastgele söz üreteci ----------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYLLABLES = [
  "gece",
  "yol",
  "ış",
  "ığ",
  "İs",
  "tan",
  "bul",
  "şar",
  "kı",
  "söz",
  "üç",
  "çö",
  "ğ",
];

/** Rastgele zamanlı sözler: bitişik/aralıklı satırlar, kelimesiz satır, sıfır süreli ve uzun kelime. */
function randomLyrics(random: () => number, uncertainShare = 0): Lyrics {
  const lines: LyricLine[] = [];
  let t = random() * 2;
  const count = 1 + Math.floor(random() * 8);
  for (let l = 0; l < count; l++) {
    const start = t + (random() < 0.4 ? random() * 0.3 : random() * 3);
    const wordCount = random() < 0.15 ? 0 : 1 + Math.floor(random() * 7);
    const words = [];
    let w = start;
    for (let k = 0; k < wordCount; k++) {
      const len = 1 + Math.floor(random() * 3);
      let text = Array.from(
        { length: len },
        () => SYLLABLES[Math.floor(random() * SYLLABLES.length)],
      ).join("");
      if (k < wordCount - 1) text += " ";
      const r = random();
      const duration = r < 0.1 ? 0 : r < 0.25 ? 0.8 + random() * 2 : random() * 0.6;
      words.push({ start: w, end: w + duration, text });
      w += duration + (random() < 0.5 ? 0 : random() * 0.2);
    }
    const end = wordCount > 0 ? w : start + 0.5 + random() * 2;
    const text = wordCount > 0 ? words.map((x) => x.text).join("") : "Kelimesiz satır";
    lines.push({
      start,
      end,
      text,
      translation: random() < 0.2 ? "çeviri" : null,
      estimated: false,
      uncertain: random() < uncertainShare,
      words,
    });
    t = end;
  }
  return { source: "user", synced: true, lines, auto: null };
}

/** Rastgele an dizisi: ileri akış, geri ve ileri sarmalar, kelime sınırları. */
function randomTimes(random: () => number, lyrics: Lyrics): number[] {
  const last = lyrics.lines.at(-1)!.end + 1;
  const times: number[] = [];
  let t = -0.5;
  for (let k = 0; k < 120; k++) {
    const r = random();
    if (r < 0.1)
      t = random() * last; // sarma (geri de olabilir)
    else if (r < 0.2) {
      const l = lyrics.lines[Math.floor(random() * lyrics.lines.length)]!;
      const w = l.words[Math.floor(random() * l.words.length)];
      t = w ? (random() < 0.5 ? w.start : w.end) : l.start;
    } else t += 1 / 60 + random() * 0.05;
    times.push(t);
  }
  return times;
}

/** Tuvalsiz HTML (sahnenin DOM'u): sarma güvenliği için karşılaştırılır. */
function html(container: HTMLElement): string {
  // Tuvalin piksel boyutu çizimin yan etkisidir, DOM'un içeriği değil.
  return container.innerHTML.replace(/ width="\d+" height="\d+"/g, "");
}

const EFFECTS: LyricEffect[] = ["constellation", "lyre", "plain"];

describe("inceleme: rastgele söz zaman çizelgeleri", () => {
  it("satır metni, kelime sınıfları ve --p programdan bağımsız hesapla aynı; her an sarma güvenli", () => {
    const random = rng(42);
    for (let trial = 0; trial < 12; trial++) {
      const lyrics = randomLyrics(random);
      const times = randomTimes(random, lyrics);
      for (const safe of [false, true]) {
        for (const effect of EFFECTS) {
          const live = render(
            <LyricsOverlay lyrics={lyrics} positionSecs={times[0]!} safe={safe} effect={effect} />,
          );
          for (const t of times) {
            live.rerender(
              <LyricsOverlay lyrics={lyrics} positionSecs={t} safe={safe} effect={effect} />,
            );
            const frame = lyricFrame(lyrics, t);
            const lineEl = live.container.querySelector(".lyrics__line");
            if (!frame.line) {
              expect(lineEl).toBeNull();
            } else {
              expect(lineEl?.textContent).toBe(frame.line.text);
              const words = [...lineEl!.querySelectorAll<HTMLElement>(".lyrics__word")];
              expect(words).toHaveLength(frame.line.words.length);
              frame.line.words.forEach((w, i) => {
                const state = t >= w.end ? "sung" : t < w.start ? "upcoming" : "current";
                expect(words[i]!.className).toBe(`lyrics__word is-${state}`);
                expect(words[i]!.textContent).toBe(w.text);
                const p = Number(words[i]!.style.getPropertyValue("--p"));
                if (state === "current")
                  expect(p).toBeCloseTo((t - w.start) / (w.end - w.start), 9);
                else expect(p).toBe(state === "sung" ? 1 : 0);
              });
            }
            // Varsayılan modda satır içinde CSS geçişi yok.
            for (const el of live.container.querySelectorAll<HTMLElement>("[style]"))
              expect(el.style.transition).toBe("");
            // Sarma güvenliği: aynı an, sıfırdan çizilenle aynı DOM.
            const fresh = render(
              <LyricsOverlay lyrics={lyrics} positionSecs={t} safe={safe} effect={effect} />,
            );
            expect(html(live.container)).toBe(html(fresh.container));
            fresh.unmount();
            if (safe) {
              const root = live.container.querySelector(".lyrics");
              if (root) expect(root.className).toBe("lyrics is-safe");
              for (const sel of [
                ".lyrics__shade",
                ".lyrics__sky",
                ".lyrics__ghost",
                ".lyrics__meteor",
                ".lyrics__glyph",
                "[data-held]",
                ".lyrics__halo",
              ])
                expect(live.container.querySelector(sel)).toBeNull();
              expect(
                live.container.querySelector(".lyrics__stack")?.getAttribute("style") ?? null,
              ).toBeNull();
            }
          }
          live.unmount();
        }
      }
    }
  }, 120_000);

  it('"animasyonları azalt"ta hiçbir dönüşüm, tel, yıldız, meteor, hayalet yok', () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("reduce"),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    const random = rng(7);
    for (let trial = 0; trial < 6; trial++) {
      const lyrics = randomLyrics(random);
      for (const t of randomTimes(random, lyrics)) {
        const view = render(
          <LyricsOverlay lyrics={lyrics} positionSecs={t} effect="constellation" />,
        );
        for (const el of view.container.querySelectorAll<HTMLElement>("[style]"))
          expect(el.style.transform).toBe("");
        for (const sel of [".lyrics__sky", ".lyrics__ghost", ".lyrics__meteor", ".lyrics__glyph"])
          expect(view.container.querySelector(sel)).toBeNull();
        view.unmount();
      }
    }
  }, 60_000);

  it("geçersiz an (NaN, sonsuz) hiçbir şey çizmez, çökmez", () => {
    const lyrics = randomLyrics(rng(9));
    for (const t of [NaN, Infinity, -Infinity]) {
      const view = render(<LyricsOverlay lyrics={lyrics} positionSecs={t} />);
      expect(view.container.querySelector(".lyrics")).toBeNull();
      view.unmount();
    }
  });
});

// ---------- Tek satırlık kesin senaryolar ----------

const held: Lyrics = {
  source: "user",
  synced: true,
  auto: null,
  lines: [
    {
      start: 10,
      end: 14,
      text: "Aşkı İstanbul",
      translation: null,
      estimated: false,
      uncertain: false,
      words: [
        { start: 10, end: 11, text: "Aşkı " },
        { start: 11, end: 14, text: "İstanbul" },
      ],
    },
  ],
};

describe("inceleme: lir teli tuvali", () => {
  it("duraklatılmışken satıra sarınca tel ilk karede çizilir (sonraki kare gelmeyebilir)", () => {
    // Duraklatılmışken konum değişmez, bileşen yeniden çizilmez: ilk çizim tek çizimdir.
    render(<LyricsOverlay lyrics={held} positionSecs={12} effect="lyre" />);
    expect(drawn.stroke).toBeGreaterThan(0);
  });

  it("aynı satırda yazı tipi ölçümü (getComputedStyle) yalnızca bir kez", () => {
    const spy = vi.spyOn(window, "getComputedStyle");
    const view = render(<LyricsOverlay lyrics={held} positionSecs={10.5} effect="lyre" />);
    for (let k = 1; k <= 60; k++)
      view.rerender(<LyricsOverlay lyrics={held} positionSecs={10.5 + k / 60} effect="lyre" />);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    spy.mockRestore();
  });

  it("yerleşim okuması yalnızca satır ya da genişlik değişince (her karede clientWidth okunmaz)", () => {
    const view = render(<LyricsOverlay lyrics={held} positionSecs={10.5} effect="lyre" />);
    view.rerender(<LyricsOverlay lyrics={held} positionSecs={10.51} effect="lyre" />);
    clientWidthReads = 0;
    for (let k = 1; k <= 60; k++)
      view.rerender(<LyricsOverlay lyrics={held} positionSecs={10.51 + k / 60} effect="lyre" />);
    // Bilgi amaçlı: kare başına okuma sayısı (satır p'si + tuval).
    expect(clientWidthReads / 60).toBeLessThan(1);
  });

  it("uzun hecede harflere bölünen kelimenin metni ve sınıfı aynı kalır", () => {
    const view = render(<LyricsOverlay lyrics={held} positionSecs={12.5} />);
    const words = view.container.querySelectorAll<HTMLElement>(".lyrics__line .lyrics__word");
    expect(words[1]!.className).toBe("lyrics__word is-current");
    expect(words[1]!.hasAttribute("data-held")).toBe(true);
    expect(words[1]!.textContent).toBe("İstanbul");
    expect(view.container.querySelector(".lyrics__line")!.textContent).toBe("Aşkı İstanbul");
  });
});

describe("inceleme: tahmini satır ve zamanlama sözleşmesi", () => {
  it('tahmini satırda da .lyrics__line metni satırın metnine eşit ("tahmini" etiketi dışarıda)', () => {
    const uncertain: Lyrics = {
      ...held,
      lines: [{ ...held.lines[0]!, uncertain: true }],
    };
    const view = render(<LyricsOverlay lyrics={uncertain} positionSecs={12} />);
    expect(view.container.querySelector(".lyrics__line")!.textContent).toBe("Aşkı İstanbul");
  });
});

describe("inceleme: CSS'te varsayılan modda söz geçişi yok", () => {
  it("söz katmanının kurallarında geçiş/animasyon yalnızca güvenli modda (ya da 'none')", () => {
    const css = readFileSync(resolve(__dirname, "../styles/global.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    const offenders: string[] = [];
    for (const m of css.matchAll(rule)) {
      const selector = m[1]!.trim();
      const body = m[2]!;
      if (!/\.lyrics(?![-\w]|edit)/.test(selector) && !/\.lyrics__/.test(selector)) continue;
      if (/photo-lyrics|lyricsedit|lyrics-notice/.test(selector)) continue;
      const motion = /(?:^|;)\s*(transition|animation)[\w-]*\s*:\s*([^;]+)/.exec(body);
      if (motion && motion[2]!.trim() !== "none" && !selector.includes("is-safe"))
        offenders.push(selector);
    }
    expect(offenders).toEqual([]);
  });
});

// ---------- Söz paketi ekleme ----------

const untimed: Lyrics = {
  source: "user",
  synced: false,
  auto: null,
  lines: [{ ...held.lines[0]!, start: 0, end: 0, words: [] }],
};

function controls(shown: Lyrics | null) {
  return {
    lyrics: shown,
    visible: true,
    setVisible: () => undefined,
    shiftMs: 0,
    setShift: () => undefined,
    shiftNotice: null,
    loadText: vi.fn(async () => ({ source: "user" as const, text: "Aşkı İstanbul" })),
    saveText: vi.fn(async () => undefined),
    clearText: vi.fn(async () => undefined),
    refresh: vi.fn(),
  } satisfies LyricsControls;
}

describe("inceleme: söz paketini ekleme düğmesi", () => {
  it("düğmeye çift tıklayınca paket bir kez kurulur (iki seçim penceresi, iki kurulum yok)", async () => {
    let choose: (path: string) => void = () => undefined;
    pkg.pick.mockImplementation(
      () =>
        new Promise<string | null>((done) => {
          choose = done;
        }),
    );
    render(<LyricsPanel lyrics={controls(untimed)} trackPath="C:/a.flac" trackTitle="A" visible />);
    const add = await screen.findByRole("button", { name: "Söz paketini ekle…" });
    await act(async () => {
      fireEvent.click(add);
      fireEvent.click(add);
    });
    await act(async () => choose("C:/model.onnx"));
    expect(pkg.pick).toHaveBeenCalledTimes(1);
  });

  it("kurulum sürerken panel kapanırsa (bileşen söker) hata yok", async () => {
    let finish: () => void = () => undefined;
    pkg.pick.mockResolvedValue("C:/model.onnx");
    pkg.install.mockImplementation(
      () =>
        new Promise<void>((done) => {
          finish = done;
        }),
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lyrics = controls(untimed);
    const view = render(
      <LyricsPanel lyrics={lyrics} trackPath="C:/a.flac" trackTitle="A" visible />,
    );
    const add = await screen.findByRole("button", { name: "Söz paketini ekle…" });
    await act(async () => fireEvent.click(add));
    expect(screen.getByRole("button", { name: "Söz paketini ekle…" })).toBeDisabled();
    view.unmount();
    await act(async () => finish());
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("seçim penceresi açılamazsa kullanıcıya bir şey söylenir", async () => {
    pkg.pick.mockRejectedValue(new Error("pencere açılamadı"));
    render(<LyricsPanel lyrics={controls(untimed)} trackPath="C:/a.flac" trackTitle="A" visible />);
    const add = await screen.findByRole("button", { name: "Söz paketini ekle…" });
    await act(async () => fireEvent.click(add));
    expect(screen.queryByRole("status")).not.toBeNull();
  });
});
