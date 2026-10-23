import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MilkdropFolder, MilkdropPreset, VisualFrame } from "../lib/backend";

/** Sahte çekirdek, sahte Butterchurn, sahte fren ve sahte WebGL. */
const fake = vi.hoisted(() => ({
  folder: null as MilkdropFolder | null,
  picked: null as string | null,
  loads: [] as string[],
  loadFails: new Set<string>(),
  setFolder: vi.fn(),
  webgl: true,
  guardOk: true,
  guard: null as null | {
    storage: string;
    processSource: ReturnType<typeof vi.fn>;
    setSafe: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    process: ReturnType<typeof vi.fn>;
  },
  guardOptions: [] as unknown[],
  visualizers: [] as {
    options: Record<string, unknown>;
    internalCanvas: HTMLCanvasElement;
    outputGl: unknown;
    loadPreset: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    setRendererSize: ReturnType<typeof vi.fn>;
    loseGLContext: ReturnType<typeof vi.fn>;
  }[],
  tick: null as ((frame: VisualFrame | null, dt: number) => void) | null,
  waveform: null as Uint8Array | null,
  /** Butterchurn'ün çizimi bu kadar kez hata versin (ör. denklemde WebAssembly tuzağı). */
  renderThrows: 0,
}));

const preset = (name: string): MilkdropPreset => ({
  name,
  simplified: name.includes("sade"),
  shaderError: name.includes("sade") ? "bükme: gölgelendirici çevrilemedi" : null,
  preset: {
    version: 2,
    baseVals: { zoom: 1.01 },
    shapes: [],
    waves: [],
    init_eqs_eel: "",
    frame_eqs_eel: "",
    pixel_eqs_eel: "",
    warp: "",
    comp: "",
  },
});

vi.mock("../lib/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/backend")>();
  return {
    ...actual,
    getMilkdropFolder: async () => fake.folder ?? actual.NO_MILKDROP_FOLDER,
    pickMilkdropFolder: async () => fake.picked,
    setMilkdropFolder: async (path: string) => {
      fake.setFolder(path);
      return fake.folder ?? actual.NO_MILKDROP_FOLDER;
    },
    loadMilkdropPreset: async (path: string) => {
      fake.loads.push(path);
      if (fake.loadFails.has(path)) throw "Görsel açılamadı (bozuk): MilkDrop görseli değil";
      return preset(path.replace(/^.*\//, "").replace(/\.milk$/, ""));
    },
    getVisualWaveform: async () => fake.waveform,
    logFrontendError: async () => undefined,
  };
});

vi.mock("../hooks/useVisualFeed", () => ({
  useVisualFeed: (_playing: boolean, onTick: (frame: VisualFrame | null, dt: number) => void) => {
    fake.tick = onTick;
  },
}));

vi.mock("../lib/gl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/gl")>();
  return {
    ...actual,
    getWebGl2: () => (fake.webgl ? ({ isContextLost: () => false } as never) : null),
    gpuName: () => "deneme kartı",
    fitCanvas: () => ({ width: 320, height: 180, pixel: 1 }),
  };
});

vi.mock("../lib/flashGuard", () => ({
  createFlashGuard: (_gl: unknown, options: unknown) => {
    fake.guardOptions.push(options);
    if (!fake.guardOk) return { ok: false, reason: "öz denetim başarısız" };
    fake.guard = {
      storage: "packed",
      processSource: vi.fn(() => true),
      setSafe: vi.fn(),
      dispose: vi.fn(),
      reset: vi.fn(),
      process: vi.fn(() => true),
    };
    return { ok: true, guard: fake.guard };
  },
}));

vi.mock("butterchurn", () => ({
  default: {
    createVisualizer: (_context: unknown, _canvas: unknown, options: Record<string, unknown>) => {
      const visualizer = {
        options,
        internalCanvas: document.createElement("canvas"),
        outputGl: {} as unknown,
        loadPreset: vi.fn(async () => undefined),
        render: vi.fn(() => {
          if (fake.renderThrows > 0) {
            fake.renderThrows -= 1;
            throw new Error("unreachable");
          }
        }),
        setRendererSize: vi.fn(),
        loseGLContext: vi.fn(),
      };
      fake.visualizers.push(visualizer);
      return visualizer;
    },
  },
}));

import { MilkDropScene } from "./MilkDropScene";
import { SceneGallery } from "./SceneGallery";
import { useMilkdrop, type MilkdropControls } from "../hooks/useMilkdrop";

const PENDING_KEY = "lyraska.milkdrop.pending";
const SKIP_KEY = "lyraska.milkdrop.skipped";
import type { ScenePresetControls } from "../hooks/useScenePresets";

/** Sahne ve galeri aynı denetimleri paylaşır (programdaki gibi). */
function Harness({ safe = false, gallery = false }: { safe?: boolean; gallery?: boolean }) {
  const controls = useMilkdrop(true);
  return (
    <>
      {gallery && (
        <SceneGallery
          scene="milkdrop"
          onChoose={() => undefined}
          presets={{ looks: {}, presets: [] } as unknown as ScenePresetControls}
          milkdrop={controls}
        />
      )}
      <MilkDropScene playing safe={safe} controls={controls} />
    </>
  );
}

const FOLDER: MilkdropFolder = {
  folder: "C:/Görseller",
  presets: [
    { name: "ayna", path: "C:/Görseller/ayna.milk" },
    { name: "bulut sade", path: "C:/Görseller/bulut sade.milk" },
    { name: "çiy", path: "C:/Görseller/çiy.milk" },
  ],
  truncated: false,
  error: null,
};

beforeEach(() => {
  fake.folder = null;
  fake.picked = null;
  fake.loads = [];
  fake.loadFails = new Set();
  fake.setFolder.mockReset();
  fake.webgl = true;
  fake.guardOk = true;
  fake.guard = null;
  fake.guardOptions = [];
  fake.visualizers = [];
  fake.tick = null;
  fake.waveform = null;
  fake.renderThrows = 0;
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MilkDrop sahnesi", () => {
  it("klasör seçilmemişse açıklama, Klasör seç ve hazır görsel olmadığı notu görünür", async () => {
    render(<Harness />);
    expect(
      await screen.findByText("MilkDrop görsellerinizin (.milk) bulunduğu klasörü seçin."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Lyraska hazır görsel içermez/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Klasör seç" })).toBeEnabled();
    expect(fake.visualizers).toHaveLength(0);
  });

  it("klasör seçilince görseller listelenir, biri yalnızca WebAssembly yoluyla açılır, frenden geçer", async () => {
    fake.picked = "C:/Görseller";
    render(<Harness />);
    await screen.findByRole("button", { name: "Klasör seç" });
    fake.folder = FOLDER;
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Klasör seç" })));
    expect(fake.setFolder).toHaveBeenCalledWith("C:/Görseller");

    await waitFor(() => expect(fake.visualizers).toHaveLength(1));
    const visualizer = fake.visualizers[0]!;
    // JS (`new Function`) yolu kapalı; görünmeyen tuvalden görünen tuvale kopya yok.
    expect(visualizer.options).toMatchObject({ onlyUseWASM: true, pixelRatio: 1 });
    expect(visualizer.outputGl).toBeNull();
    await waitFor(() => expect(visualizer.loadPreset).toHaveBeenCalledTimes(1));
    expect(fake.loads).toHaveLength(1);
    expect(FOLDER.presets.map((p) => p.path)).toContain(fake.loads[0]);
    // İlk görselde harmanlanacak önceki görsel yok.
    expect(visualizer.loadPreset.mock.calls[0]![1]).toBe(0);
    const canvas = document.querySelector<HTMLCanvasElement>(".milkdrop-scene__canvas")!;
    await waitFor(() => expect(canvas.dataset.preset).toBeDefined());
    expect(canvas.dataset.webgl).toBe("on");
    expect(canvas.dataset.guard).toBe("packed");

    // Bir kare: sessizlik (çalmıyor) ile çizilir, görüntü frenden geçer (gerçek dt ile).
    act(() => fake.tick?.(null, 1 / 60));
    expect(visualizer.render).toHaveBeenCalledTimes(1);
    const { audioLevels, elapsedTime } = visualizer.render.mock.calls[0]![0] as {
      audioLevels: { timeByteArray: Uint8Array };
      elapsedTime: number;
    };
    expect(audioLevels.timeByteArray).toHaveLength(1024);
    expect(audioLevels.timeByteArray[0]).toBe(128);
    expect(elapsedTime).toBeCloseTo(1 / 60);
    expect(fake.guard!.processSource).toHaveBeenCalledWith(visualizer.internalCanvas, 1 / 60);
  });

  it("sonraki görsel en az 3 sn harmanlanır; galeride ad, Önceki/Sonraki ve not görünür", async () => {
    fake.folder = FOLDER;
    render(<Harness gallery />);
    await waitFor(() => expect(fake.visualizers[0]?.loadPreset).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /MilkDrop/ }));
    const section = await screen.findByRole("group", { name: "MilkDrop görselleri" });
    expect(section).toHaveTextContent("Klasör: Görseller · 3 görsel");
    expect(section).toHaveTextContent(/Lyraska hazır görsel içermez/);

    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Sonraki MilkDrop görseli" })),
    );
    const visualizer = fake.visualizers[0]!;
    await waitFor(() => expect(visualizer.loadPreset).toHaveBeenCalledTimes(2));
    expect(visualizer.loadPreset.mock.calls[1]![1]).toBeGreaterThanOrEqual(3);
    expect(fake.loads[1]).not.toBe(fake.loads[0]);

    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Önceki MilkDrop görseli" })),
    );
    await waitFor(() => expect(visualizer.loadPreset).toHaveBeenCalledTimes(3));
    expect(fake.loads[2]).toBe(fake.loads[0]);

    // Kendiliğinden değiştirme kapatılabilir (hatırlanır).
    const auto = screen.getByRole("checkbox", { name: /kendiliğinden değiştir/ });
    expect(auto).toBeChecked();
    fireEvent.click(auto);
    expect(auto).not.toBeChecked();
    expect(window.localStorage.getItem("lyraska.milkdrop.auto")).toBe("0");
  });

  it("açılamayan görselde sonrakine geçilir ve neden bildirilir", async () => {
    fake.folder = { ...FOLDER, presets: FOLDER.presets.slice(0, 2) };
    fake.loadFails = new Set([FOLDER.presets[0]!.path]);
    // İlk seçim hep ilk görsel olsun.
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<Harness gallery />);
    await waitFor(() => expect(fake.loads).toEqual(FOLDER.presets.slice(0, 2).map((p) => p.path)));
    await waitFor(() => expect(fake.visualizers[0]!.loadPreset).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /MilkDrop/ }));
    const section = await screen.findByRole("group", { name: "MilkDrop görselleri" });
    // Sade hâliyle çalan görsel (gölgelendiricisi atılmış) belirtilir.
    expect(section).toHaveTextContent("bulut sade");
    expect(section).toHaveTextContent("Gölgelendiricisi çevrilemedi, sade hâliyle çalıyor.");
    // Nedeni de kısa bir not olarak görünür (çekirdeğin `shaderError`'ı).
    expect(section).toHaveTextContent("Neden: bükme: gölgelendirici çevrilemedi");
    expect(section).toHaveTextContent(
      "Görsel açılamadı, sonrakine geçildi: Görsel açılamadı (bozuk): MilkDrop görseli değil",
    );
    // Açılamayan görsel bu oturumda bir daha denenmez (Sonraki de onu seçmez).
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Sonraki MilkDrop görseli" })),
    );
    await waitFor(() => expect(fake.loads).toHaveLength(3));
    expect(fake.loads[2]).toBe(FOLDER.presets[1]!.path);
    vi.restoreAllMocks();
  });

  it("çalarken kapanan görsel atlananlara girer, kalıcıdır; yeniden denenebilir", async () => {
    fake.folder = { ...FOLDER, presets: FOLDER.presets.slice(0, 2) };
    // Önceki açılışta "ayna" çalarken program kapandı (işaret kaldı).
    window.localStorage.setItem(PENDING_KEY, FOLDER.presets[0]!.path);
    vi.spyOn(Math, "random").mockReturnValue(0);
    const first = render(<Harness gallery />);
    await waitFor(() => expect(fake.visualizers[0]?.loadPreset).toHaveBeenCalledTimes(1));
    expect(fake.loads).toEqual([FOLDER.presets[1]!.path]);
    expect(JSON.parse(window.localStorage.getItem(SKIP_KEY)!)).toEqual([FOLDER.presets[0]!.path]);
    fireEvent.click(screen.getByRole("button", { name: /MilkDrop/ }));
    const section = await screen.findByRole("group", { name: "MilkDrop görselleri" });
    expect(section).toHaveTextContent(
      '"ayna" önceki açılışta çalarken program kapandı; atlananlara eklendi.',
    );
    expect(section).toHaveTextContent("1 görsel atlandı");
    // Çalan görselin işareti çaldığı sürece durur (yalnızca 2 sn değil).
    for (let i = 0; i < 400; i++) act(() => fake.tick?.(null, 1 / 60));
    expect(window.localStorage.getItem(PENDING_KEY)).toBe(FOLDER.presets[1]!.path);
    // Sahneden çıkınca silinir (programı düzgün kapatmak görseli suçlamaz).
    first.unmount();
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();

    // Yeni açılış: atlanan yine seçilmez.
    fake.loads = [];
    fake.visualizers = [];
    render(<Harness gallery />);
    await waitFor(() => expect(fake.visualizers[0]?.loadPreset).toHaveBeenCalledTimes(1));
    expect(fake.loads).toEqual([FOLDER.presets[1]!.path]);
    fireEvent.click(screen.getByRole("button", { name: /MilkDrop/ }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Atlanan görselleri yeniden dene" })),
    );
    expect(window.localStorage.getItem(SKIP_KEY)).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Sonraki MilkDrop görseli" })),
    );
    await waitFor(() => expect(fake.loads).toHaveLength(2));
    expect(fake.loads[1]).toBe(FOLDER.presets[0]!.path);
    vi.restoreAllMocks();
  });

  it("sayfa kapanırken çalan görselin işareti silinir", async () => {
    fake.folder = FOLDER;
    render(<Harness />);
    await waitFor(() => expect(fake.visualizers[0]?.loadPreset).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(PENDING_KEY)).toBe(fake.loads[0]);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("bütün görseller atlandıysa hiçbiri açılmaz, neden yazılır", async () => {
    fake.folder = { ...FOLDER, presets: FOLDER.presets.slice(0, 2) };
    window.localStorage.setItem(
      SKIP_KEY,
      JSON.stringify(FOLDER.presets.slice(0, 2).map((p) => p.path)),
    );
    render(<Harness gallery />);
    fireEvent.click(await screen.findByRole("button", { name: /MilkDrop/ }));
    const section = await screen.findByRole("group", { name: "MilkDrop görselleri" });
    await waitFor(() =>
      expect(section).toHaveTextContent("Bu klasördeki görsellerin hepsi atlandı"),
    );
    expect(fake.loads).toEqual([]);
  });

  it("çizerken hata veren görsel bırakılır, sonrakine harmanlamadan geçilir", async () => {
    fake.folder = FOLDER;
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<Harness gallery />);
    const visualizer = await waitFor(() => {
      const v = fake.visualizers[0];
      expect(v?.loadPreset).toHaveBeenCalledTimes(1);
      return v!;
    });
    fake.renderThrows = 1;
    act(() => fake.tick?.(null, 1 / 60));
    await waitFor(() => expect(visualizer.loadPreset).toHaveBeenCalledTimes(2));
    expect(fake.loads[1]).not.toBe(fake.loads[0]);
    // Hatalı görsel karışmasın: yeni görsel harmanlamadan gelir (fren ani geçişi yine yumuşatır).
    expect(visualizer.loadPreset.mock.calls[1]![1]).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /MilkDrop/ }));
    expect(await screen.findByRole("group", { name: "MilkDrop görselleri" })).toHaveTextContent(
      "çizilirken hata verdi",
    );
    vi.restoreAllMocks();
  });

  it("bağlam kaybında en çok üç kez yeniden kurulur; temiz bir kare sayacı sıfırlar", async () => {
    fake.folder = FOLDER;
    render(<Harness />);
    const canvas = await waitFor(() => {
      const found = document.querySelector<HTMLCanvasElement>(".milkdrop-scene__canvas");
      expect(found).not.toBeNull();
      return found!;
    });
    const loseAndRestore = async (clean: boolean) => {
      const count = fake.visualizers.length;
      act(() => {
        canvas.dispatchEvent(new Event("webglcontextlost"));
        canvas.dispatchEvent(new Event("webglcontextrestored"));
      });
      await waitFor(() => expect(fake.visualizers.length).toBe(count + 1));
      if (clean) {
        await waitFor(() => expect(fake.visualizers[count]!.loadPreset).toHaveBeenCalled());
        act(() => fake.tick?.(null, 1 / 60));
      }
    };
    await waitFor(() => expect(fake.visualizers[0]?.loadPreset).toHaveBeenCalled());
    // Arada temiz kareler olunca kayıp sayısı birikmez.
    for (let i = 0; i < 5; i++) await loseAndRestore(true);
    expect(canvas).not.toHaveAttribute("hidden");
    // Art arda dört kayıp (arada kare yok): sahne bırakılır.
    for (let i = 0; i < 3; i++) await loseAndRestore(false);
    act(() => {
      canvas.dispatchEvent(new Event("webglcontextlost"));
      canvas.dispatchEvent(new Event("webglcontextrestored"));
    });
    expect(await screen.findByText(/çizmeyi bıraktı/)).toBeInTheDocument();
  });

  it("WebGL2 açılamazsa sahne yerine açıklama görünür", async () => {
    fake.folder = FOLDER;
    fake.webgl = false;
    render(<Harness />);
    expect(await screen.findByText(/WebGL2 açılamadı/)).toBeInTheDocument();
    expect(document.querySelector(".milkdrop-scene__canvas")).toHaveAttribute("hidden");
    expect(fake.visualizers).toHaveLength(0);
  });

  it("parlaklık freni kurulamazsa sahne hiç gösterilmez", async () => {
    fake.folder = FOLDER;
    fake.guardOk = false;
    render(<Harness />);
    expect(await screen.findByText(/Parlaklık freni bu ekran kartında kurulamadı/)).toBeVisible();
    expect(document.querySelector(".milkdrop-scene__canvas")).toHaveAttribute("hidden");
    expect(fake.visualizers).toHaveLength(0);
  });

  it("güvenli modda fren sıkı çalışır", async () => {
    fake.folder = FOLDER;
    const { rerender } = render(<Harness safe />);
    await waitFor(() => expect(fake.visualizers).toHaveLength(1));
    expect(fake.guardOptions[0]).toEqual({ safe: true });
    // Ayar sahne açıkken değişince fren hemen uyar (sahne yeniden kurulmaz).
    rerender(<Harness safe={false} />);
    expect(fake.guard!.setSafe).toHaveBeenLastCalledWith(false);
    rerender(<Harness safe />);
    expect(fake.guard!.setSafe).toHaveBeenLastCalledWith(true);
    expect(fake.visualizers).toHaveLength(1);
  });

  it("animasyonları azalt açıksa sahne çalışmaz, kısa açıklama görünür", async () => {
    fake.folder = FOLDER;
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    render(<Harness />);
    expect(await screen.findByText(/animasyonları azalt/)).toBeInTheDocument();
    expect(document.querySelector(".milkdrop-scene__canvas")).toBeNull();
    expect(fake.visualizers).toHaveLength(0);
  });
});

describe("MilkDrop denetimleri (galeri)", () => {
  it("görsel yokken Önceki/Sonraki kapalı; Klasör seç açık", () => {
    const controls = {
      library: { folder: null, presets: [], truncated: false, error: null },
      loading: false,
      request: null,
      currentName: null,
      simplified: false,
      shaderNote: null,
      notice: null,
      skippedCount: 0,
      retrySkipped: vi.fn(),
      auto: true,
      setAuto: vi.fn(),
      chooseFolder: vi.fn(async () => undefined),
      next: vi.fn(),
      previous: vi.fn(),
      advance: vi.fn(),
      loaded: vi.fn(),
      failed: vi.fn(),
    } satisfies MilkdropControls;
    render(
      <SceneGallery
        scene="milkdrop"
        onChoose={() => undefined}
        presets={{ looks: {}, presets: [] } as unknown as ScenePresetControls}
        milkdrop={controls}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /MilkDrop/ }));
    expect(screen.getByText("Klasör seçilmedi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sonraki MilkDrop görseli" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Önceki MilkDrop görseli" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "MilkDrop görsellerinin klasörünü seç" }));
    expect(controls.chooseFolder).toHaveBeenCalledTimes(1);
  });
});
