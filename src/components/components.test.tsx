import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PlaybackStatus, TrackInfo } from "../lib/backend";
import { marqueeWindow } from "./Marquee";
import { ArtistGrid } from "./ArtistGrid";
import { LyricsOverlay } from "./LyricsOverlay";
import { spectrumColumns } from "./SpectrumDemo";
import { textToColumns } from "../lib/dotFont";
import { clearCoverCache } from "../hooks/useCover";
import { layoutSky } from "../lib/skyMap";
import { clearAlbumCovers } from "../lib/albumCovers";

// Rust çekirdeğini taklit eden sahte arka uç.
const backend = vi.hoisted(() => ({
  desktop: false,
  /** Çekirdeğin program bilgisini (desteklenen uzantılar) geciktirmesi için. */
  appInfoGate: null as Promise<void> | null,
  status: null as PlaybackStatus | null,
  toggle: vi.fn(),
  stop: vi.fn(),
  seek: vi.fn(),
  bands: null as number[] | null,
  /** Görsel karedeki Görsel Yönetmen notu (yoksa analiz bitmemiş gibi). */
  director: null as import("../lib/backend").DirectorFrame | null,
  library: null as import("../lib/backend").LibraryStatus | null,
  /** Kütüphane açılamadıysa çekirdeğin her kütüphane komutunda verdiği hata. */
  libraryFailure: null as string | null,
  tracks: [] as import("../lib/backend").LibraryTrack[],
  search: vi.fn(),
  /** Arama gerçekten süzsün (başlıkta geçen); kapalıyken her aramada bütün şarkılar döner. */
  searchFilters: false,
  /** Çekirdeğin "kütüphane değişti" olayını dinleyen işlev. */
  libraryChanged: null as (() => void) | null,
  albums: [] as import("../lib/backend").LibraryAlbum[],
  albumsAsked: vi.fn(),
  artists: [] as import("../lib/backend").LibraryArtist[],
  artistTracks: vi.fn(),
  albumTracks: vi.fn(),
  pickImage: vi.fn(),
  setAlbumCover: vi.fn(),
  clearAlbumCover: vi.fn(),
  setSongCover: vi.fn(),
  clearSongCover: vi.fn(),
  removeMissing: vi.fn(),
  songCoverAsked: vi.fn(),
  addFolder: vi.fn(),
  removeFolder: vi.fn(),
  pickFolder: vi.fn(),
  pickFiles: vi.fn(),
  open: vi.fn(),
  pick: vi.fn(),
  drag: null as import("../lib/backend").DragDropHandlers | null,
  /** Sürükle-bırak dinlemesi kurulamazsa verilecek hata. */
  dragFailure: null as Error | null,
  dropped: vi.fn(),
  dropOutcome: null as import("../lib/backend").DropOutcome | null,
  logError: vi.fn(),
  setEq: vi.fn(),
  headphone: null as import("../lib/backend").HeadphoneState | null,
  pickProfile: vi.fn(),
  importProfile: vi.fn(),
  setNext: vi.fn(),
  openLog: vi.fn(),
  saveMarks: vi.fn(),
  annotation: null as import("../lib/backend").Annotation | null,
  songMap: null as import("../lib/backend").SongMap | null,
  songKey: null as import("../lib/backend").KeyMap | null,
  safe: false,
  setSafe: vi.fn(),
  /** Çekirdek ekolayzer durumunu eksik alanlarla döndürür (0.0.29'daki sahne denetimi olayı). */
  brokenEqualizer: false,
  /** Şarkıların içindeki kapaklar (yol → `data:` adresi). */
  covers: {} as Record<string, string>,
  coverAsked: vi.fn(),
  /** Bilgi yığını çizimde hata versin (hata sınırı testi). */
  infoStackFails: false,
  /** Kütüphane panelinin kaç kez çizildiği (her karede yeniden çizilmemeli). */
  libraryPanelRenders: 0,
  /** Kör test: süren testin durumu ve dosya seçicinin vereceği yollar. */
  abx: null as import("../lib/backend").AbxStatus | null,
  abxPicks: [] as string[],
  /** Parametrik ekolayzer: çekirdeğe giden ayarlar, karşılaştırma, dosya işlemleri. */
  setParametric: vi.fn(),
  parametricCompare: vi.fn(),
  parametricImport: vi.fn(),
  parametricExport: vi.fn(),
  /** Şarkı haritası dosyası: uygulanan harita, çekirdeğe gidenler, seçicilerin verecekleri. */
  importedMap: null as import("../lib/backend").ImportedMapStatus | null,
  mapPick: "C:/İndirilenler/gece.harita.json",
  mapExport: vi.fn(),
  mapImport: vi.fn(),
  mapRemove: vi.fn(),
  songMapAsked: vi.fn(),
  /** Çalan şarkının sözleri. */
  lyrics: null as import("../lib/backend").Lyrics | null,
  /** Crossfeed: çekirdekteki ayar ve çekirdeğe gidenler. */
  crossfeed: null as import("../lib/backend").CrossfeedSettings | null,
  setCrossfeed: vi.fn(),
}));

// Bilgi yığını istenirse çizimde hata verir: hata sınırlarının yeri sınanır (ARA-04).
vi.mock("./InfoStack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./InfoStack")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    InfoStack: (props: Parameters<typeof actual.InfoStack>[0]) => {
      if (backend.infoStackFails) throw new Error("sahte çizim hatası");
      return createElement(actual.InfoStack, props);
    },
  };
});

// Baskı kapağı aynen çizilir; istenirse (jsdom'da 2D tuval yok) çizilmiş sayılır ve çağrılar izlenir.
const print = vi.hoisted(() => ({ fake: false, inputs: [] as { album: string; key: unknown }[] }));
vi.mock("../lib/printCover", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/printCover")>();
  return {
    ...actual,
    drawPrintCover: (...args: Parameters<typeof actual.drawPrintCover>) => {
      if (!print.fake) return actual.drawPrintCover(...args);
      print.inputs.push({ album: args[1].album, key: args[1].key });
      return "A" as const;
    },
  };
});

// Kütüphane paneli aynen çizilir; yalnızca çizim sayılır.
vi.mock("./LibraryPanel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./LibraryPanel")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    LibraryPanel: (props: Parameters<typeof actual.LibraryPanel>[0]) => {
      backend.libraryPanelRenders++;
      return createElement(actual.LibraryPanel, props);
    },
  };
});

vi.mock("../lib/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/backend")>();
  const current = () => backend.status ?? actual.IDLE_STATUS;
  return {
    ...actual,
    isDesktop: () => backend.desktop,
    getAppInfo: async () => {
      if (backend.appInfoGate) await backend.appInfoGate;
      return { ...actual.BROWSER_FALLBACK, supportedExtensions: ["mp3", "flac"] };
    },
    getPlaybackStatus: async () => current(),
    togglePlayback: async () => {
      backend.toggle();
      return current();
    },
    stopPlayback: async () => {
      backend.stop();
      return current();
    },
    seekPlayback: async (seconds: number) => {
      backend.seek(seconds);
      // Gerçek çekirdek gibi: yeni konumdan devam eder.
      if (backend.status) backend.status = { ...backend.status, positionSecs: seconds };
      return current();
    },
    getVisualFrame: async () =>
      backend.bands
        ? {
            positionSecs: current().positionSecs,
            bands: backend.bands,
            rmsDb: [-20, -20],
            peakDb: [-6, -6],
            vuReferenceDb: -14,
            director: backend.director,
          }
        : null,
    openTrack: async (path: string) => {
      backend.open(path);
      return current().track;
    },
    pickAudioFile: async (extensions: string[]) => backend.pick(extensions),
    onDragDrop: async (handlers: import("../lib/backend").DragDropHandlers) => {
      if (backend.dragFailure) throw backend.dragFailure;
      backend.drag = handlers;
      return () => {
        if (backend.drag === handlers) backend.drag = null;
      };
    },
    addDroppedPaths: async (paths: string[]) => {
      backend.dropped(paths);
      return (
        backend.dropOutcome ?? {
          tracks: [],
          addedTracks: 0,
          addedFolders: 0,
          already: 0,
          problems: [],
        }
      );
    },
    logFrontendError: async (message: string) => backend.logError(message),
    getTrackCover: async (path: string) => {
      backend.coverAsked(path);
      return backend.covers[path] ?? null;
    },
    getEqualizer: async () =>
      backend.brokenEqualizer
        ? ({
            enabled: true,
            gainsDb: Array(10).fill(0),
          } as unknown as import("../lib/backend").EqState)
        : actual.getEqualizer(),
    getLibraryStatus: async () => {
      if (backend.libraryFailure) throw backend.libraryFailure;
      return backend.library ?? actual.EMPTY_LIBRARY;
    },
    searchLibrary: async (query: string) => {
      backend.search(query);
      if (backend.libraryFailure) throw backend.libraryFailure;
      if (!backend.searchFilters) return backend.tracks;
      const word = query.toLocaleLowerCase("tr");
      return backend.tracks.filter((t) => t.title.toLocaleLowerCase("tr").includes(word));
    },
    onLibraryChanged: async (handler: () => void) => {
      backend.libraryChanged = handler;
      return () => {
        if (backend.libraryChanged === handler) backend.libraryChanged = null;
      };
    },
    libraryAlbums: async (query: string) => {
      backend.albumsAsked(query);
      return backend.albums;
    },
    libraryArtists: async () => backend.artists,
    libraryArtistTracks: async (artist: string) => backend.artistTracks(artist) ?? [],
    pickImage: async () => backend.pickImage() ?? null,
    setAlbumCover: async (album: string, artist: string | null, path: string) =>
      backend.setAlbumCover(album, artist, path),
    clearAlbumCover: async (album: string, artist: string | null) =>
      backend.clearAlbumCover(album, artist),
    getAlbumCover: async () => null,
    getSongCover: async (path: string) => {
      backend.songCoverAsked(path);
      return null;
    },
    setSongCover: async (path: string, image: string) => backend.setSongCover(path, image),
    clearSongCover: async (path: string) => backend.clearSongCover(path),
    libraryAlbumTracks: async (album: string, artist: string | null) =>
      backend.albumTracks(album, artist) ?? [],
    pickFolder: async () => backend.pickFolder(),
    pickAudioFiles: async (extensions: string[]) => backend.pickFiles(extensions),
    addLibraryFolder: async (path: string) => {
      backend.addFolder(path);
      if (path.includes("zaten")) throw 'Bu zaten kütüphanede: "C:\\Müzik" klasörünün içinde.';
      return backend.library ?? actual.EMPTY_LIBRARY;
    },
    removeLibraryFolder: async (id: number) => {
      backend.removeFolder(id);
      return backend.library ?? actual.EMPTY_LIBRARY;
    },
    rescanLibrary: async () => backend.library ?? actual.EMPTY_LIBRARY,
    removeMissingTracks: async (folderId: number) => {
      backend.removeMissing(folderId);
      return backend.library ?? actual.EMPTY_LIBRARY;
    },
    setEqualizer: async (settings: import("../lib/backend").EqSettings) => {
      backend.setEq(settings);
      return actual.setEqualizer(settings);
    },
    openLog: async () => backend.openLog(),
    getVisualSafe: async () => backend.safe,
    setVisualSafe: async (enabled: boolean) => {
      backend.setSafe(enabled);
      backend.safe = enabled;
      return enabled;
    },
    getAnnotation: async () => backend.annotation,
    getSongMap: async () => {
      backend.songMapAsked();
      return backend.songMap;
    },
    getImportedSongMap: async () => backend.importedMap,
    getTrackLyrics: async () => backend.lyrics,
    exportSongMap: async (path: string, defaultName: string) => {
      backend.mapExport(path, defaultName);
      return `C:/Belgeler/${defaultName}`;
    },
    pickSongMapFile: async () => backend.mapPick,
    importSongMap: async (path: string, file: string) => {
      backend.mapImport(path, file);
      if (file.includes("baska")) throw "Bu harita bu şarkıya ait değil (benzerlik %4).";
      backend.importedMap = {
        sourceName: "gece.harita.json",
        importedAt: "2026-10-22 10:00:00",
        similarity: 0.94,
        offsetSecs: 1.5,
        source: "edited",
        beats: 412,
      };
      return backend.importedMap;
    },
    removeSongMap: async (path: string) => {
      backend.mapRemove(path);
      backend.importedMap = null;
    },
    getSongKey: async () => backend.songKey,
    saveAnnotation: async (
      path: string,
      beats: number[],
      drops: number[],
      key: import("../lib/backend").MarkedKey | null = null,
    ) => {
      backend.saveMarks(path, beats, drops, key);
      return "C:\\Veri\\isaretler\\Lyra - Gece Otoyolu.1234abcd.json";
    },
    evaluateAnnotation: async () => ({
      savedAt: "",
      beats: [],
      drops: [],
      evaluation: {
        fMeasure: 0.873,
        tapOffsetMs: 42,
        fMeasureAligned: 0.951,
        detectedBpm: 128,
        markedBpm: 127.9,
        detectedCount: 400,
        markedCount: 380,
        detectedDrops: [61.5],
        dropHits: 1,
        markedDrops: 1,
        // Program Do majör buldu; işaret La minör: paralel ton, isabet sayılır.
        detectedKey: { tonic: 0, minor: false, confidence: 0.7, camelot: 8 },
        keyRelation: "relative" as const,
      },
    }),
    setNextTrack: async (path: string | null) => {
      backend.setNext(path);
    },
    setParametric: async (settings: import("../lib/backend").ParametricSettings) => {
      backend.setParametric(settings);
      return null;
    },
    setParametricCompare: async (compare: boolean) => {
      backend.parametricCompare(compare);
      return null;
    },
    pickParametricFile: async () => "C:/eq/HD 600 ParametricEQ.txt",
    importParametric: async (path: string) => {
      backend.parametricImport(path);
      const { previewParametricState } = await import("../lib/parametric");
      return previewParametricState({
        enabled: true,
        bands: [
          { kind: "lowShelf", freqHz: 105, gainDb: 5.5, q: 0.7, enabled: true },
          { kind: "peaking", freqHz: 1923, gainDb: -3.2, q: 1.31, enabled: true },
        ],
        design: "rbj",
      });
    },
    exportParametric: async () => {
      backend.parametricExport();
      return "C:/eq/Lyraska ParametricEQ.txt";
    },
    getCrossfeed: async () => {
      const { DEFAULT_CROSSFEED, previewCrossfeedState } = await import("../lib/crossfeed");
      return previewCrossfeedState(backend.crossfeed ?? DEFAULT_CROSSFEED);
    },
    setCrossfeed: async (settings: import("../lib/backend").CrossfeedSettings) => {
      backend.setCrossfeed(settings);
      const { previewCrossfeedState } = await import("../lib/crossfeed");
      // Çekirdek gibi: sınırlara çekip saklar.
      const state = previewCrossfeedState(settings);
      backend.crossfeed = state.settings;
      return state;
    },
    getHeadphone: async () => backend.headphone ?? actual.NO_HEADPHONE,
    pickHeadphoneProfile: async () => backend.pickProfile(),
    importHeadphoneProfile: async (path: string) => {
      backend.importProfile(path);
      if (path.includes("bozuk")) throw "Dosyada kulaklık düzeltmesi bulunamadı.";
      backend.headphone = {
        enabled: true,
        profile: {
          name: "Sennheiser HD 600",
          preampDb: -6.4,
          filters: [{ kind: "peaking", freqHz: 1000, gainDb: 3, q: 1 }],
          design: "rbj",
        },
        curveHz: [20, 1000, 20000],
        curveDb: [-6.4, -3.4, -6.4],
      };
      return backend.headphone;
    },
    setHeadphoneEnabled: async (enabled: boolean) => {
      backend.headphone = { ...(backend.headphone ?? actual.NO_HEADPHONE), enabled };
      return backend.headphone;
    },
    clearHeadphone: async () => {
      backend.headphone = null;
      return actual.NO_HEADPHONE;
    },
    // Kör test, gerçek çekirdek gibi: başlarken çalan oturum kapanır, bitince şarkı kaldığı
    // yerde duraklatılmış geri gelir.
    pickAbxFile: async () => backend.abxPicks.shift() ?? null,
    abxStatus: async () => backend.abx ?? actual.ABX_INACTIVE,
    abxStart: async () => {
      backend.abx = {
        ...actual.ABX_INACTIVE,
        active: true,
        aName: "gece.flac",
        bName: "gece.mp3",
        clipSecs: 20,
        total: 16,
      };
      backend.status = null;
      return backend.abx;
    },
    abxStop: async () => {
      backend.abx = null;
      backend.status = { ...playing, state: "paused" };
      return actual.ABX_INACTIVE;
    },
  };
});

// Testler bileşeni sahte arka uçla birlikte yükler.
const { default: App } = await import("../App");
const { stateLabel } = await import("./NowPlaying");
const { pointerRatio, SeekBar } = await import("./SeekBar");

const track: TrackInfo = {
  path: "C:\\Müzik\\gece.flac",
  fileName: "gece",
  title: "Gece Otoyolu",
  artist: "Lyra",
  codec: "flac",
  sampleRate: 44100,
  channels: 2,
  durationSecs: 225,
  album: null,
  albumArtist: null,
  trackNumber: null,
  discNumber: null,
};

const playing: PlaybackStatus = {
  state: "playing",
  track,
  positionSecs: 83.4,
  underruns: 0,
  error: null,
  bpm: null,
  output: null,
};

beforeEach(() => {
  backend.desktop = false;
  backend.status = null;
  backend.bands = null;
  backend.director = null;
  backend.library = null;
  backend.libraryFailure = null;
  backend.tracks = [];
  backend.searchFilters = false;
  backend.libraryChanged = null;
  backend.albums = [];
  backend.artists = [];
  backend.drag = null;
  backend.dragFailure = null;
  backend.dropOutcome = null;
  backend.songMap = null;
  backend.songKey = null;
  backend.annotation = null;
  backend.covers = {};
  backend.libraryPanelRenders = 0;
  backend.abx = null;
  backend.abxPicks = [];
  clearCoverCache();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("çizim yükü", () => {
  it("çalarken her karede yalnızca konumu gösterenler yeniden çizilir, paneller değil", async () => {
    backend.desktop = true;
    backend.status = playing;
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Kütüphane" })));
    const renders = backend.libraryPanelRenders;
    // Gerçek zamanda 0,6 sn: ekran kareleri sayılır.
    let frames = 0;
    const count = () => {
      frames++;
      if (frames < 1000) raf = window.requestAnimationFrame(count);
    };
    let raf = window.requestAnimationFrame(count);
    await new Promise((resolve) => setTimeout(resolve, 600));
    window.cancelAnimationFrame(raf);
    expect(frames).toBeGreaterThan(20);
    // Kütüphane paneli yalnızca ses motorunun bildirimlerinde (saniyede 4) çizilir. Eskiden
    // bütün ekran her karede yeniden çiziliyordu (5000 şarkıda karenin yaklaşık yarısı).
    expect(backend.libraryPanelRenders - renders).toBeLessThan(frames / 3);
  });
});

/** Alttaki şeridin erişilebilir süre metni: "01:23 / 03:45". */
const seekText = () =>
  screen.getByRole("slider", { name: "Şarkıda konum" }).getAttribute("aria-valuetext");

describe("oynatıcı ekranı", () => {
  it("tarayıcı önizlemesinde program adını gösterir, düğmeler kapalıdır", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Lyraska" })).toBeInTheDocument();
    expect(screen.getByText("Hoş geldiniz")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dosya aç/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Çal/ })).toBeDisabled();
    expect(screen.getByText(/Windows'ta açın/)).toBeInTheDocument();
    // Program bilgisi ayarlar panelinde.
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Ayarlar" })));
    await waitFor(() => expect(screen.getByText(/Test sürümü · Sürüm/)).toBeInTheDocument());
    // Lisanslar: GPL (yalnızca sürüm 3, garanti yok) ve kaynak kodu; metinler açılınca yüklenir
    // ve UTF-8 olarak okunur (C3, DENETIM-FAZ0 BEL-11).
    expect(screen.getByText(/GPL-3.0-only/)).toBeInTheDocument();
    expect(screen.getByText(/hiçbir garanti verilmez/)).toBeInTheDocument();
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(new Response(`metin: ${url} · Ünlü ğüşıöç`, { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      for (const [title, url] of [
        ["GNU GPL sürüm 3 (lisans metni)", "/lisanslar/GPL-3.0.txt"],
        ["Üçüncü taraf lisans bildirimleri", "/lisanslar/UCUNCU-TARAF.txt"],
      ] as const) {
        expect(screen.queryByLabelText(title)).not.toBeInTheDocument();
        const details = screen.getByText(title).closest("details");
        expect(details).not.toBeNull();
        details!.open = true;
        await act(async () => fireEvent(details!, new Event("toggle")));
        await waitFor(() =>
          expect(screen.getByLabelText(title)).toHaveTextContent(`metin: ${url} · Ünlü ğüşıöç`),
        );
      }
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("dosya seçilince şarkıyı açar ve süreyi gösterir", async () => {
    backend.desktop = true;
    backend.pick.mockResolvedValue("C:\\Müzik\\gece.flac");
    render(<App />);

    const open = screen.getByRole("button", { name: /Dosya aç/ });
    await waitFor(() => expect(open).toBeEnabled());
    backend.status = playing;
    await act(async () => fireEvent.click(open));

    await waitFor(() => expect(backend.open).toHaveBeenCalledWith("C:\\Müzik\\gece.flac"));
    expect(backend.pick).toHaveBeenCalledWith(["mp3", "flac"]);
    // Büyük başlıkta şarkının adı ve sanatçısı, altta süre.
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Gece Otoyolu" })).toBeInTheDocument(),
    );
    expect(screen.getByText("Şimdi çalıyor")).toBeInTheDocument();
    expect(screen.getByText("Lyra", { selector: ".now__byline" })).toBeInTheDocument();
    expect(seekText()).toBe("01:23 / 03:45");
    expect(screen.getByText("01:23", { selector: ".dock__time" })).toBeInTheDocument();
    expect(screen.getByText("03:45", { selector: ".dock__time" })).toBeInTheDocument();
    expect(screen.getByText("FLAC 44,1 kHz")).toBeInTheDocument();
    expect(screen.getByText("Kesinti: 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Duraklat/ })).toBeEnabled();
  });

  it("Boşluk tuşu çal/duraklat komutunu gönderir", async () => {
    backend.desktop = true;
    backend.status = { ...playing, state: "paused" };
    render(<App />);
    await act(async () => {
      fireEvent.keyDown(window, { code: "Space", key: " " });
    });
    expect(backend.toggle).toHaveBeenCalledTimes(1);
  });
});

describe("sarma ve spektrum", () => {
  it("ok tuşları ekranda görülen konumdan 5 saniye ileri/geri sarar", async () => {
    backend.desktop = true;
    backend.status = { ...playing, state: "paused" };
    render(<App />);
    // Durum ilk komutla gelir; oynatıcıyı uyandırmak için bir kez Boşluk.
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await act(async () => fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight" }));
    expect(backend.seek).toHaveBeenLastCalledWith(88.4);
    await act(async () => fireEvent.keyDown(window, { key: "ArrowLeft", code: "ArrowLeft" }));
    expect(backend.seek).toHaveBeenLastCalledWith(83.4);
  });

  it("art arda ok basışları birikir, hiçbiri kaybolmaz", async () => {
    backend.desktop = true;
    backend.status = { ...playing, state: "paused" };
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    // Üç basış, ilk sarma cevabı gelmeden: ekran hemen 83,4 + 15 sn'yi göstermeli.
    await act(async () => {
      fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight" });
      fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight" });
      fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight" });
    });
    await waitFor(() => expect(backend.seek).toHaveBeenLastCalledWith(98.4));
    expect(seekText()).toBe("01:38 / 03:45");
  });

  it("çubuğa tıklayınca süre ses motorunu beklemeden hemen değişir", async () => {
    backend.desktop = true;
    backend.status = { ...playing, state: "paused" };
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    const bar = await screen.findByRole("slider", { name: "Şarkıda konum" });
    bar.getBoundingClientRect = () => ({ left: 0, width: 225 }) as DOMRect;
    act(() => {
      fireEvent.pointerDown(bar, { button: 0, clientX: 150, pointerId: 1 });
      fireEvent.pointerUp(bar, { button: 0, clientX: 150, pointerId: 1 });
    });
    // Henüz ses motoru cevap vermeden: ekran 02:30'u göstermeli, eski yere sekmemeli.
    expect(seekText()).toBe("02:30 / 03:45");
    expect(screen.getByText("02:30", { selector: ".dock__time" })).toBeInTheDocument();
    await waitFor(() => expect(backend.seek).toHaveBeenCalledWith(150));
  });

  it("ilerleme çubuğuna tıklayınca o noktaya atlar", async () => {
    backend.desktop = true;
    backend.status = playing;
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    const bar = await screen.findByRole("slider", { name: "Şarkıda konum" });
    bar.getBoundingClientRect = () => ({ left: 100, width: 400 }) as DOMRect;
    await act(async () => {
      fireEvent.pointerDown(bar, { button: 0, clientX: 200, pointerId: 1 });
      fireEvent.pointerUp(bar, { button: 0, clientX: 200, pointerId: 1 });
    });
    // 200 px → çubuğun %25'i → 225 sn'lik şarkıda 56,25 sn
    expect(backend.seek).toHaveBeenCalledWith(56.25);
  });

  it("fareyle çubuğun üstüne gelince o noktanın süresini gösterir", async () => {
    backend.desktop = true;
    backend.status = playing;
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    const bar = await screen.findByRole("slider", { name: "Şarkıda konum" });
    bar.getBoundingClientRect = () => ({ left: 0, width: 225 }) as DOMRect;
    await act(async () => fireEvent.pointerMove(bar, { clientX: 150 }));
    expect(screen.getByText("02:30")).toBeInTheDocument();
    await act(async () => fireEvent.pointerLeave(bar));
    expect(screen.queryByText("02:30")).not.toBeInTheDocument();
    expect(backend.seek).not.toHaveBeenCalled();
  });

  it("çalarken spektrum gerçek veriyle yanar", async () => {
    backend.desktop = true;
    backend.status = playing;
    backend.bands = new Array<number>(32).fill(0.9);
    render(<App />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Spektrum" })));
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    const spectrum = await screen.findByRole("img", { name: "Spektrum" });
    await waitFor(() => {
      const lit = Number(
        spectrum.querySelector(".dot-matrix__lit")!.getAttribute("data-lit-count"),
      );
      expect(lit).toBeGreaterThan(100);
    });
  });
});

describe("VU ve spektrum sahnelerinin ışığı", () => {
  const director = (mood: number) => ({
    atmosphere: { section: 0, theme: 0, mood, warmth: 0.5 },
    rhythm: {
      pulse: 0,
      accent: 0,
      beatPhase: 0,
      barPhase: 0,
      anticipation: 0,
      release: 0,
      barsConfident: true,
    },
    texture: { detail: 0.5, motion: 0.5 },
  });
  const glowOf = (element: Element | null) =>
    Number((element as HTMLElement | null)?.style.getPropertyValue("--stage-glow") || 0);

  for (const [scene, selector] of [
    ["Spektrum", ".vfd-frame"],
    ["VU ibreleri", ".vu-scene"],
  ] as const) {
    it(`${scene}: Görsel Yönetmen'in ruh hâliyle ışır, not yoksa kısık kalır`, async () => {
      backend.desktop = true;
      backend.status = playing;
      backend.bands = new Array<number>(32).fill(0.5);
      backend.director = director(1);
      const { container } = render(<App />);
      await act(async () => fireEvent.click(screen.getByRole("button", { name: scene })));
      await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
      await waitFor(() => expect(glowOf(container.querySelector(selector))).toBeGreaterThan(0.3), {
        timeout: 3000,
      });
      // Analiz yok (not gelmiyor): ışık yumuşakça söner.
      backend.director = null;
      await waitFor(() => expect(glowOf(container.querySelector(selector))).toBeLessThan(0.05), {
        timeout: 4000,
      });
    });
  }
});

describe("kütüphane", () => {
  const song = (id: number, title: string) => ({
    id,
    path: `C:\\Müzik\\${id}.flac`,
    title,
    artist: "Şebnem Ferah",
    album: "Kelimeler",
    albumArtist: null,
    trackNumber: id,
    durationSecs: 200,
    codec: "flac",
    // 1. şarkı 128 BPM ve La minör (8A), 2. ritimsiz ve tonu belirsiz, 3. henüz analiz edilmedi.
    bpm: id === 1 ? 128.4 : null,
    analyzed: id !== 3,
    key: id === 1 ? "8A" : null,
  });
  const library = {
    folders: [{ id: 7, path: "C:\\Müzik", trackCount: 3, single: false }],
    trackCount: 3,
    analyzed: 2,
    scan: { scanning: false, found: 3, processed: 3, current: null },
    problems: [],
  };

  it('şarkılarının çoğu bulunamayan klasör için uyarının yanında "Yine de çıkar" düğmesi var', async () => {
    backend.desktop = true;
    const message =
      "C:\\Müzik: kütüphanedeki 3 şarkı bulunamadı (disk takılı değil); şarkılar kütüphaneden çıkarılmadı.";
    backend.library = {
      ...library,
      problems: [message, "D:\\Arşiv: 1 dosya açılamadı."],
      suspicious: [{ folderId: 7, path: "C:\\Müzik", missing: 3, message }],
    };
    render(<App />);
    const panel = await screen.findByRole("region", { name: "Kütüphane" });
    const button = await within(panel).findByRole("button", {
      name: "Bulunamayan 3 şarkıyı kütüphaneden çıkar: C:\\Müzik",
    });
    // Yalnızca şüpheli silme uyarısının yanında (öteki sorunlarda düğme yok).
    expect(within(panel).getAllByRole("button", { name: /Bulunamayan/ })).toHaveLength(1);
    await act(async () => fireEvent.click(button));
    expect(backend.removeMissing).toHaveBeenCalledWith(7);
  });

  it("kütüphane açılamazsa uyarı panelde ve çekmece kapalıyken ana ekranda görünür", async () => {
    // 0.0.33'te eski kütüphane dosyaları açılamıyordu; hata yalnızca günlüğe yazılıyordu.
    backend.desktop = true;
    backend.libraryFailure = "Kütüphane veritabanı hatası: no such table: analyses";
    render(<App />);
    const panel = await screen.findByRole("region", { name: "Kütüphane" });
    const alert = await within(panel).findByRole("alert");
    expect(alert).toHaveTextContent("Kütüphane açılamadı");
    expect(alert).toHaveTextContent("Müzik dosyalarınıza bir şey olmadı");
    expect(alert).toHaveTextContent("Neden: Kütüphane veritabanı hatası: no such table: analyses");
    // Çalışmayacak düğmeler kapalı; "müziğinizi ekleyin" daveti gösterilmez.
    expect(within(panel).getByRole("button", { name: "Klasör ekle" })).toBeDisabled();
    expect(within(panel).getByRole("button", { name: "Şarkı ekle" })).toBeDisabled();
    expect(screen.queryByText("Müziğinizi ekleyin")).not.toBeInTheDocument();
    // Neden bir kez yazılır (açılıştaki aramanın aynı hatası ayrıca gösterilmez).
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(within(panel).getAllByText(/no such table/)).toHaveLength(1);

    // Çekmece kapanınca uyarı ana ekranda kalır; "Ayrıntılar" kütüphaneyi açar.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Kütüphane" })));
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("Kütüphane açılamadı.");
    await act(async () =>
      fireEvent.click(within(banner).getByRole("button", { name: "Ayrıntılar" })),
    );
    expect(screen.getByRole("region", { name: "Kütüphane" })).toBeVisible();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("klasör yokken klasör eklemeye davet eder ve seçilen klasörü ekler", async () => {
    backend.desktop = true;
    backend.pickFolder.mockResolvedValue("D:\\Arşiv");
    render(<App />);
    expect(await screen.findByText("Müziğinizi ekleyin")).toBeInTheDocument();
    const [, add] = screen.getAllByRole("button", { name: /Klasör ekle/ });
    await act(async () => fireEvent.click(add!));
    expect(backend.addFolder).toHaveBeenCalledWith("D:\\Arşiv");
  });

  it("şarkı ekle: seçilen mp3'leri tek tek ekler, eklenemeyeni bildirir", async () => {
    backend.desktop = true;
    backend.pickFiles.mockResolvedValue([
      "C:\\İndirilenler\\Gülümse.mp3",
      "C:\\Müzik\\zaten.MP3",
      "C:\\İndirilenler\\Bu Akşam.mp3",
    ]);
    render(<App />);
    await screen.findByText("Müziğinizi ekleyin");
    // Uzantılar yüklenince pencere ses dosyalarını gösterir.
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Şarkı ekle/ })).toHaveLength(2),
    );
    const [add] = screen.getAllByRole("button", { name: /Şarkı ekle/ });
    await act(async () => fireEvent.click(add!));
    await waitFor(() => expect(backend.addFolder).toHaveBeenCalledTimes(3));
    expect(backend.pickFiles).toHaveBeenCalledWith(["mp3", "flac"]);
    expect(backend.addFolder).toHaveBeenLastCalledWith("C:\\İndirilenler\\Bu Akşam.mp3");
    expect(await screen.findByText(/Bu zaten kütüphanede/)).toBeInTheDocument();
  });

  it("sürüklerken pencerede 'bırakın' çerçevesi görünür", async () => {
    backend.desktop = true;
    const { container } = render(<App />);
    await waitFor(() => expect(backend.drag).not.toBeNull());
    const zone = container.querySelector(".drop-zone")!;
    expect(zone).not.toHaveClass("is-active");
    act(() => backend.drag!.onHover(true));
    expect(zone).toHaveClass("is-active");
    expect(zone).toHaveTextContent(/Bırakın/);
    act(() => backend.drag!.onHover(false));
    expect(zone).not.toHaveClass("is-active");
  });

  it("bırakılanları kütüphaneye ekler, şarkıları sırayla çalar ve sonucu bildirir", async () => {
    backend.desktop = true;
    backend.dropOutcome = {
      tracks: ["C:\\İndirilenler\\a.mp3", "C:\\İndirilenler\\b.MP3"],
      addedTracks: 2,
      addedFolders: 1,
      already: 0,
      problems: [],
    };
    render(<App />);
    await waitFor(() => expect(backend.drag).not.toBeNull());
    const paths = ["C:\\Müzik\\Rock", "C:\\İndirilenler\\a.mp3", "C:\\İndirilenler\\b.MP3"];
    await act(async () => backend.drag!.onDrop(paths));
    // Dosya mı klasör mü olduğuna çekirdek karar verir: hepsi olduğu gibi gönderilir.
    expect(backend.dropped).toHaveBeenCalledWith(paths);
    await waitFor(() => expect(backend.open).toHaveBeenCalledWith("C:\\İndirilenler\\a.mp3"));
    expect(backend.open).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "2 şarkı kütüphaneye eklendi · 1 klasör kütüphaneye eklendi, şarkıları taranıyor",
    );
  });

  it("program bilgisi gelmeden bırakılan şarkı da hemen eklenip çalınır", async () => {
    backend.desktop = true;
    let release = () => {};
    backend.appInfoGate = new Promise<void>((resolve) => (release = resolve));
    backend.dropOutcome = {
      tracks: ["C:\\İndirilenler\\a.mp3"],
      addedTracks: 1,
      addedFolders: 0,
      already: 0,
      problems: [],
    };
    render(<App />);
    await waitFor(() => expect(backend.drag).not.toBeNull());
    await act(async () => backend.drag!.onDrop(["C:\\İndirilenler\\a.mp3"]));
    await waitFor(() => expect(backend.open).toHaveBeenCalledWith("C:\\İndirilenler\\a.mp3"));
    await act(async () => release());
    backend.appInfoGate = null;
  });

  it("program bilgisi gelmeden Dosya aç'a basılırsa pencere yine uzantı süzgeciyle açılır", async () => {
    // Uzantı listesi çekirdekten gelir; gelmeden basılan Dosya aç eskiden süzgeçsiz pencere
    // açıyordu (CI'da yarış olarak da görüldü).
    backend.desktop = true;
    let release = () => {};
    backend.appInfoGate = new Promise<void>((resolve) => (release = resolve));
    backend.pick.mockResolvedValue(null);
    render(<App />);
    const open = screen.getByRole("button", { name: /Dosya aç/ });
    await waitFor(() => expect(open).toBeEnabled());
    await act(async () => fireEvent.click(open));
    await act(async () => release());
    await waitFor(() => expect(backend.pick).toHaveBeenCalledWith(["mp3", "flac"]));
    backend.appInfoGate = null;
  });

  it("eklenemeyen dosyayı hangi sekmede olursa olsun bildirir", async () => {
    backend.desktop = true;
    backend.dropOutcome = {
      tracks: [],
      addedTracks: 0,
      addedFolders: 0,
      already: 0,
      problems: ["Bu dosya türü desteklenmiyor: Eski Kayıt.wma"],
    };
    render(<App />);
    await act(async () => fireEvent.click(await screen.findByRole("tab", { name: /Senkron/ })));
    await waitFor(() => expect(backend.drag).not.toBeNull());
    await act(async () => backend.drag!.onDrop(["C:\\Eski Kayıt.wma"]));
    const notice = await screen.findByText("Bu dosya türü desteklenmiyor: Eski Kayıt.wma");
    expect(notice).toHaveClass("is-problem");
    expect(backend.open).not.toHaveBeenCalled();
  });

  it("sürükle-bırak dinlenemezse nedeni hata günlüğüne yazılır", async () => {
    backend.desktop = true;
    backend.dragFailure = new Error("izin yok: event.listen");
    render(<App />);
    await waitFor(() =>
      expect(backend.logError).toHaveBeenCalledWith(
        expect.stringContaining("Sürükle-bırak dinlenemedi: Error: izin yok: event.listen"),
      ),
    );
  });

  it("şarkıları listeler, çift tıklayınca çalar, bitince sıradakine geçer", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm"), song(3, "Hoşçakal")];
    render(<App />);
    const first = await screen.findByText("Mayın Tarlası");

    // BPM sütunu ve arka plan analizinin ilerlemesi.
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.querySelector(".library__bpm")?.textContent)).toEqual([
      "128",
      "—",
      "",
    ]);
    // Ton sütunu: herkesin dilinde ad (proje sahibinin kararı); tonu belirsizse çizgi, analiz
    // beklerken boş. DJ görünümünde Camelot kodu.
    const keys = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.querySelector(".library__key")?.textContent);
    expect(keys()).toEqual(["La minör", "—", ""]);
    fireEvent.click(screen.getByRole("button", { name: "DJ görünümü" }));
    expect(keys()).toEqual(["8A", "—", ""]);
    fireEvent.click(screen.getByRole("button", { name: "DJ görünümü" }));
    expect(keys()).toEqual(["La minör", "—", ""]);
    expect(screen.getByText(/Şarkı haritası: 2 \/ 3 şarkı analiz edildi/)).toBeInTheDocument();

    // Çift tıklayınca çalar.
    backend.open.mockImplementation((path: string) => {
      const track = backend.tracks.find((t) => t.path === path)!;
      backend.status = {
        ...playing,
        positionSecs: 0,
        track: { ...playing.track!, path, title: track.title, durationSecs: 200 },
      };
    });
    await act(async () => fireEvent.doubleClick(first));
    await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(backend.tracks[0]!.path));

    // "Sonraki" düğmesi ikinci şarkıyı çalar.
    const nextButton = screen.getByRole("button", { name: "Sonraki" });
    await waitFor(() => expect(nextButton).toBeEnabled());
    await act(async () => fireEvent.click(nextButton));
    await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(backend.tracks[1]!.path));

    // Sıradaki şarkı çekirdeğe önceden bildirilir (boşluksuz geçiş için).
    await waitFor(() => expect(backend.setNext).toHaveBeenLastCalledWith(backend.tracks[2]!.path));

    // Boşluksuz geçiş olamazsa: şarkı bitince üçüncüye kendiliğinden geçer.
    backend.status = { ...backend.status!, state: "ended", positionSecs: 200 };
    await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(backend.tracks[2]!.path), {
      timeout: 2000,
    });
    // Son şarkıda sıradaki yok.
    await waitFor(() => expect(backend.setNext).toHaveBeenLastCalledWith(null));
  });

  it("kütüphaneden çalınca çekmece kapanır, sıradaki görünür; düğmeyle ve Esc ile açılıp kapanır", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm"), song(3, "Hoşçakal")];
    render(<App />);
    const drawer = document.getElementById("drawer")!;
    // Açılışta henüz bir şey çalmıyor: kütüphane açık.
    expect(drawer).toHaveAttribute("aria-hidden", "false");
    backend.open.mockImplementation((path: string) => {
      const track = backend.tracks.find((t) => t.path === path)!;
      backend.status = {
        ...playing,
        state: "paused",
        track: { ...playing.track!, path, title: track.title, durationSecs: 200 },
      };
    });
    const first = await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.doubleClick(first));

    // Çalmaya başlayınca sahne ortaya çıkar.
    expect(drawer).toHaveAttribute("aria-hidden", "true");
    expect(drawer).toHaveAttribute("inert");
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Mayın Tarlası" })).toBeInTheDocument(),
    );
    // Albüm kütüphaneden; sıradaki yer ve sıradaki şarkı.
    expect(screen.getByText("Lyra — Kelimeler")).toBeInTheDocument();
    expect(screen.getByText("Duraklatıldı · 1 / 3")).toBeInTheDocument();
    expect(screen.getByText("Bir Kedi Gördüm · Şebnem Ferah")).toBeInTheDocument();

    const libraryButton = screen.getByRole("button", { name: "Kütüphane" });
    expect(libraryButton).toHaveAttribute("aria-expanded", "false");
    await act(async () => fireEvent.click(libraryButton));
    expect(drawer).toHaveAttribute("aria-hidden", "false");
    expect(libraryButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("tab", { name: "Kütüphane" })).toHaveAttribute("aria-selected", "true");
    await act(async () => fireEvent.keyDown(window, { key: "Escape" }));
    expect(drawer).toHaveAttribute("aria-hidden", "true");
    // Ekolayzer düğmesi çekmeceyi ekolayzerde açar; yeniden basınca kapanır.
    const eqButton = screen.getByRole("button", { name: "Ekolayzer" });
    await act(async () => fireEvent.click(eqButton));
    expect(screen.getByRole("tab", { name: /Ekolayzer/ })).toHaveAttribute("aria-selected", "true");
    await act(async () => fireEvent.click(eqButton));
    expect(drawer).toHaveAttribute("aria-hidden", "true");
  });

  it("çekirdek sıradakine kendisi geçince sıra ilerler, şarkı yeniden açılmaz", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Birinci Şarkı"), song(2, "İkinci Şarkı"), song(3, "Üçüncü Şarkı")];
    render(<App />);
    backend.open.mockImplementation((path: string) => {
      backend.status = {
        ...playing,
        positionSecs: 0,
        track: { ...playing.track!, path, durationSecs: 200 },
      };
    });
    const first = await screen.findByText("Birinci Şarkı");
    await act(async () => fireEvent.doubleClick(first));
    await waitFor(() => expect(backend.setNext).toHaveBeenLastCalledWith(backend.tracks[1]!.path));
    const opened = backend.open.mock.calls.length;

    // Çekirdek boşluksuz geçti: çalan şarkı artık ikincisi.
    backend.status = {
      ...backend.status!,
      positionSecs: 0.2,
      track: { ...backend.status!.track!, path: backend.tracks[1]!.path },
    };
    await waitFor(() => expect(backend.setNext).toHaveBeenLastCalledWith(backend.tracks[2]!.path), {
      timeout: 2000,
    });
    expect(backend.open).toHaveBeenCalledTimes(opened);
    expect(screen.getByRole("button", { name: "Sonraki" })).toBeEnabled();
  });

  it("art arda boşluksuz geçişlerde sıra kaybolmaz, son şarkıya kadar sürer", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [
      song(1, "Birinci Şarkı"),
      song(2, "İkinci Şarkı"),
      song(3, "Üçüncü Şarkı"),
      song(4, "Dördüncü Şarkı"),
    ];
    const paths = backend.tracks.map((t) => t.path);
    render(<App />);
    backend.open.mockImplementation((path: string) => {
      backend.status = {
        ...playing,
        positionSecs: 0,
        track: { ...playing.track!, path, durationSecs: 200 },
      };
    });
    const first = await screen.findByText("Birinci Şarkı");
    await act(async () => fireEvent.doubleClick(first));
    await waitFor(() => expect(backend.setNext).toHaveBeenLastCalledWith(paths[1]));
    const opened = backend.open.mock.calls.length;

    // Çekirdek iki kez kendisi geçer: 1 → 2 → 3. Sıra her geçişte ilerlemeli.
    for (const [now, upcoming] of [
      [paths[1], paths[2]],
      [paths[2], paths[3]],
    ] as const) {
      backend.status = {
        ...backend.status!,
        positionSecs: 0.2,
        track: { ...backend.status!.track!, path: now! },
      };
      await waitFor(() => expect(backend.setNext).toHaveBeenLastCalledWith(upcoming), {
        timeout: 2000,
      });
      expect(screen.getByRole("button", { name: "Sonraki" })).toBeEnabled();
    }
    expect(backend.open).toHaveBeenCalledTimes(opened);
  });

  it("arama sonucu küçülünce eski seçim düşer; Enter olmayan şarkıyı çalmaya kalkmaz", async () => {
    // Eskiden 3. satır seçiliyken arama tek sonuca düşerse Enter `tracks[2]` (undefined) ile
    // çalmaya çalışır, olay işleyicisinde TypeError çıkardı (ARA-03).
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm"), song(3, "Hoşçakal")];
    render(<App />);
    const third = await screen.findByText("Hoşçakal");
    await act(async () => fireEvent.click(third));
    const list = screen.getByRole("grid").querySelector(".library__list")!;
    expect(list).toHaveAttribute("aria-activedescendant", "library-row-3");
    expect(third.closest('[role="row"]')).toHaveAttribute("aria-selected", "true");
    // Hücreler ekran okuyucu için gridcell (ARA-05).
    expect(third.closest('[role="row"]')!.querySelectorAll('[role="gridcell"]')).toHaveLength(7);

    backend.tracks = [song(1, "Mayın Tarlası")];
    const search = screen.getByRole("searchbox", { name: "Kütüphanede ara" });
    await act(async () => fireEvent.change(search, { target: { value: "mayın" } }));
    await waitFor(() => expect(screen.queryByText("Hoşçakal")).not.toBeInTheDocument());
    expect(list).not.toHaveAttribute("aria-activedescendant");
    expect(screen.getByText("Mayın Tarlası").closest('[role="row"]')).toHaveAttribute(
      "aria-selected",
      "false",
    );
    await act(async () => fireEvent.keyDown(list, { key: "Enter" }));
    expect(backend.open).not.toHaveBeenCalled();
    // Ok tuşuyla seçip Enter: ilk (tek) şarkı çalar.
    await act(async () => fireEvent.keyDown(list, { key: "ArrowDown" }));
    await act(async () => fireEvent.keyDown(list, { key: "Enter" }));
    expect(backend.open).toHaveBeenCalledWith(backend.tracks[0]!.path);
  });

  it("çekmece kapanınca odak açan düğmeye döner; sekmelerde ok tuşları gezer", async () => {
    backend.desktop = true;
    backend.library = library;
    render(<App />);
    await screen.findByRole("tab", { name: "Kütüphane" });
    const drawer = document.getElementById("drawer")!;
    const libraryButton = screen.getByRole("button", { name: "Kütüphane" });
    // Açılışta çekmece açıktır: düğme kapatır, odak düğmede kalır.
    libraryButton.focus();
    await act(async () => fireEvent.click(libraryButton));
    expect(drawer).toHaveAttribute("aria-hidden", "true");
    expect(document.activeElement).toBe(libraryButton);
    // Yeniden açınca odak seçili sekmeye gider.
    await act(async () => fireEvent.click(libraryButton));
    const libraryTab = screen.getByRole("tab", { name: "Kütüphane" });
    expect(document.activeElement).toBe(libraryTab);
    expect(libraryTab).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /Ekolayzer/ })).toHaveAttribute("tabindex", "-1");
    // → sağdaki sekmeye geçer ve odaklar; End sona, ← geri.
    await act(async () => fireEvent.keyDown(libraryTab, { key: "ArrowRight" }));
    const eqTab = screen.getByRole("tab", { name: /Ekolayzer/ });
    expect(eqTab).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(eqTab);
    await act(async () => fireEvent.keyDown(eqTab, { key: "End" }));
    expect(screen.getByRole("tab", { name: "Ayarlar" })).toHaveAttribute("aria-selected", "true");
    await act(async () => fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" }));
    expect(screen.getByRole("tab", { name: "Kütüphane" })).toHaveAttribute("aria-selected", "true");
    // Esc kapatır: odak çekmeceyi açan düğmeye döner.
    await act(async () => fireEvent.keyDown(window, { key: "Escape" }));
    expect(drawer).toHaveAttribute("aria-hidden", "true");
    expect(document.activeElement).toBe(libraryButton);
  });

  it("çalma denetimlerinde çizim hatası sahneyi ve panelleri düşürmez", async () => {
    // Eskiden LiveChrome hata sınırının dışındaydı: kök sınır bütün pencereyi kapatırdı (ARA-04).
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.desktop = true;
    backend.library = library;
    backend.infoStackFails = true;
    try {
      render(<App />);
      const alert = await screen.findByText(/Çalma denetimleri çizilemedi/);
      expect(alert).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Kütüphane" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Kütüphane" })).toBeInTheDocument();
      expect(document.querySelector(".stage, .sky-scene")).not.toBeNull();
      await waitFor(() =>
        expect(backend.logError).toHaveBeenCalledWith(
          expect.stringMatching(/^Çalma denetimleri çizilemedi: .*sahte çizim hatası/),
        ),
      );
      // Düzelince "Yeniden dene" denetimleri geri getirir.
      backend.infoStackFails = false;
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Yeniden dene" })));
      expect(screen.queryByText(/Çalma denetimleri çizilemedi/)).not.toBeInTheDocument();
    } finally {
      backend.infoStackFails = false;
    }
  });

  it("tek tek eklenen şarkılar kutucuk değil, kaynak penceresinde tek satır; seçilince süzülür", async () => {
    backend.desktop = true;
    backend.library = {
      ...library,
      folders: [
        { id: 7, path: "C:\\Müzik", trackCount: 1, single: false },
        { id: 8, path: "D:\\İndir\\Tek.mp3", trackCount: 1, single: true },
        { id: 9, path: "D:\\İndir\\Öteki.flac", trackCount: 1, single: true },
      ],
    };
    backend.tracks = [
      song(1, "Mayın Tarlası"),
      { ...song(2, "Tek"), path: "D:\\İndir\\Tek.mp3" },
      { ...song(3, "Öteki"), path: "D:\\İndir\\Öteki.flac" },
    ];
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    // Her şarkı için ayrı kutucuk yok: tek bir özet.
    expect(screen.getByText("Müzik klasörü · 2 tek şarkı")).toBeInTheDocument();
    expect(screen.queryByText("Tek.mp3")).not.toBeInTheDocument();
    const rows = () => screen.getAllByRole("row").length - 1;
    expect(rows()).toBe(3);

    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Tek tek eklenenler/ })),
    );
    expect(rows()).toBe(2);
    expect(screen.queryByText("Mayın Tarlası")).not.toBeInTheDocument();
    // Süzülmüş listede satırdaki × o şarkıyı kütüphaneden çıkarır.
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Kütüphaneden çıkar: D:\\İndir\\Öteki.flac" }),
      ),
    );
    expect(backend.removeFolder).toHaveBeenCalledWith(9);

    // Süzgeç etiketi bütün listeyi geri getirir.
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Kaynak: tek eklenenler/ })),
    );
    expect(rows()).toBe(3);
  });

  it("şarkı satırından şarkıya kapak seçilir ve kaldırılır; liste yeniden sorulur", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), { ...song(2, "Fırtına"), customCover: true }];
    backend.pickImage.mockReturnValue("C:\\Resimler\\sarki.png");
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    // Kapağı seçilmiş şarkının küçük kapağı şarkıya seçilenden istenir (albümünkinden değil).
    await waitFor(() => expect(backend.songCoverAsked).toHaveBeenCalledWith(song(2, "").path));
    expect(backend.songCoverAsked).not.toHaveBeenCalledWith(song(1, "").path);
    const openMenu = async (title: string) =>
      act(async () =>
        fireEvent.click(screen.getByRole("button", { name: `Şarkının kapağı: ${title}` })),
      );
    const asked = backend.search.mock.calls.length;
    await openMenu("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Kapak seç…" })));
    await waitFor(() =>
      expect(backend.setSongCover).toHaveBeenCalledWith(
        song(1, "").path,
        "C:\\Resimler\\sarki.png",
      ),
    );
    // Satırların "seçilmiş kapak" bilgisi değişti: liste yeniden sorulur.
    await waitFor(() => expect(backend.search.mock.calls.length).toBeGreaterThan(asked));

    await openMenu("Fırtına");
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Seçtiğim kapağı kaldır" })),
    );
    await waitFor(() => expect(backend.clearSongCover).toHaveBeenCalledWith(song(2, "").path));
  });

  it("sütun başlığıyla sıralar; liste yeniden gelse de seçim aynı şarkıda kalır", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm"), song(3, "Hoşçakal")];
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    const titles = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.querySelectorAll("[role=gridcell]")[1]?.textContent);
    const header = screen.getByRole("button", { name: /^Başlık/ });
    await act(async () => fireEvent.click(header));
    expect(titles()).toEqual(["Bir Kedi Gördüm", "Hoşçakal", "Mayın Tarlası"]);
    expect(header.closest("[role=columnheader]")).toHaveAttribute("aria-sort", "ascending");
    await act(async () => fireEvent.click(header));
    expect(titles()).toEqual(["Mayın Tarlası", "Hoşçakal", "Bir Kedi Gördüm"]);
    expect(header.closest("[role=columnheader]")).toHaveAttribute("aria-sort", "descending");

    // "Hoşçakal" seçilir; liste çekirdekten yeniden gelir (ör. analiz ilerledi) ve sıra değişir.
    await act(async () => fireEvent.click(screen.getByText("Hoşçakal")));
    backend.tracks = [song(4, "Ağustos"), ...backend.tracks];
    const search = screen.getByRole("searchbox", { name: "Kütüphanede ara" });
    await act(async () => fireEvent.change(search, { target: { value: "a" } }));
    await waitFor(() => expect(titles()).toContain("Ağustos"));
    const selected = screen
      .getAllByRole("row")
      .filter((row) => row.getAttribute("aria-selected") === "true");
    expect(selected.map((row) => row.textContent)).toEqual([expect.stringContaining("Hoşçakal")]);
  });

  it("kaynak listesi Esc ile kapanır ve çekmeceyi kapatmaz; satırdaki × üstünde Enter çalmaz", async () => {
    backend.desktop = true;
    backend.library = {
      ...library,
      folders: [
        { id: 7, path: "C:\\Müzik", trackCount: 1, single: false },
        { id: 8, path: "D:\\İndir\\Tek.mp3", trackCount: 1, single: true },
      ],
    };
    backend.tracks = [song(1, "Mayın Tarlası"), { ...song(2, "Tek"), path: "D:\\İndir\\Tek.mp3" }];
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    const details = document.querySelector<HTMLDetailsElement>(".library__sources")!;
    details.open = true;
    await act(async () => fireEvent.keyDown(document.body, { key: "Escape" }));
    expect(details.open).toBe(false);
    expect(document.getElementById("drawer")).toHaveAttribute("aria-hidden", "false");

    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Tek tek eklenenler/ })),
    );
    const row = screen.getByText("Tek").closest("[role=row]")!;
    await act(async () => fireEvent.click(row));
    const remove = within(row as HTMLElement).getByRole("button", { name: /Kütüphaneden çıkar/ });
    backend.open.mockClear();
    await act(async () => fireEvent.keyDown(remove, { key: "Enter" }));
    expect(backend.open).not.toHaveBeenCalled();
  });

  it("albümler görünümü: kapak ızgarası; albüme tıklayınca albüm sayfası açılır, oradan baştan çalar", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm")];
    backend.albums = [
      {
        name: "Kelimeler",
        artist: "Şebnem Ferah",
        trackCount: 2,
        durationSecs: 400,
        coverPath: backend.tracks[0]!.path,
        bpm: 128,
        key: "8A",
      },
    ];
    backend.albumTracks.mockReturnValue([backend.tracks[0]!.path, backend.tracks[1]!.path]);
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Albümler" })));
    expect(screen.getByRole("heading", { name: /Albümler/ })).toHaveTextContent("1 albüm");
    expect(screen.getByRole("button", { name: "Şarkılar" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // Şarkı tablosu gizli, albüm kartı görünür.
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    const card = await screen.findByRole("button", { name: /Kelimeler/ });
    expect(card).toHaveTextContent("Şebnem Ferah · 2 şarkı · 7 dk");

    // Kullanıcı kendi kapağını seçebilir: kopyası Lyraska'da saklanır; kaldırılabilir.
    backend.pickImage.mockReturnValue("C:\\Resimler\\kapak.jpg");
    await act(async () => fireEvent.click(screen.getByLabelText("Kapak seçenekleri: Kelimeler")));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Kapak seç…" })));
    await waitFor(() =>
      expect(backend.setAlbumCover).toHaveBeenCalledWith(
        "Kelimeler",
        "Şebnem Ferah",
        "C:\\Resimler\\kapak.jpg",
      ),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Seçtiğim kapağı kaldır" })),
    );
    expect(backend.clearAlbumCover).toHaveBeenCalledWith("Kelimeler", "Şebnem Ferah");
    // Kapak menüsü albümü çalmaz.
    expect(backend.albumTracks).not.toHaveBeenCalled();

    // DJ görünümü düğmesi yalnızca şarkılarda (albümlerde işe yaramaz).
    expect(screen.queryByRole("button", { name: "DJ görünümü" })).not.toBeInTheDocument();

    // Karta tıklamak albüm sayfasını açar (çalmaz); çift tık sayfayı bir kez açar, albümün
    // şarkıları bir kez sorulur. (Kapaktaki çal düğmesinin çift tık koruması ayrı testte.)
    await act(async () => {
      fireEvent.click(card);
      fireEvent.click(card);
    });
    expect(backend.albumTracks).toHaveBeenCalledTimes(1);
    expect(backend.albumTracks).toHaveBeenCalledWith("Kelimeler", "Şebnem Ferah");
    expect(screen.getAllByRole("heading", { level: 3, name: "Kelimeler" })).toHaveLength(1);
    expect(backend.open).not.toHaveBeenCalled();
    // "Çal" albümü baştan çalar; çift tık albümü iki kez başlatmaz.
    const playAll = await screen.findByRole("button", { name: "Albümü çal" });
    await waitFor(() => expect(playAll).toBeEnabled());
    await act(async () => {
      fireEvent.click(playAll);
      fireEvent.click(playAll);
    });
    await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(backend.tracks[0]!.path));
    expect(backend.open).toHaveBeenCalledTimes(1);
  });

  const kelimeler = (tracks: { path: string }[]) => ({
    name: "Kelimeler",
    artist: "Şebnem Ferah",
    trackCount: tracks.length,
    durationSecs: 200 * tracks.length,
    coverPath: tracks[0]!.path,
    bpm: 128,
    key: "8A",
  });

  it("albüm sayfası: büyük kapak, özet ve albüm sırasıyla şarkılar; çift tık o şarkıdan çalar", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.status = { ...playing, track: { ...track, path: "C:\\Müzik\\2.flac" } };
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm"), song(3, "Fırtına")];
    backend.albums = [kelimeler(backend.tracks)];
    // Albüm sırası çekirdekten: listedeki sıradan bağımsız.
    const order = [backend.tracks[0]!.path, backend.tracks[2]!.path, backend.tracks[1]!.path];
    backend.albumTracks.mockReturnValue(order);
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.keyDown(window, { key: "2", ctrlKey: true }));
    const card = await screen.findByRole("button", { name: /Kelimeler/ });
    await act(async () => fireEvent.click(card));
    // Odak sayfanın başlığında; ad, sanatçı, şarkı sayısı, süre, ton (Türkçe) ve tempo.
    const heading = screen.getByRole("heading", { level: 3, name: "Kelimeler" });
    expect(heading).toHaveFocus();
    const page = screen.getByRole("region", { name: "Kelimeler" });
    expect(page).toHaveTextContent("Şebnem Ferah");
    expect(page).toHaveTextContent("3 şarkı · 10 dk · La minör · 128 BPM");
    expect(page.querySelector(".album-page__cover")).not.toBeNull();
    const list = await within(page).findByLabelText("Albümün şarkıları");
    const titles = within(list)
      .getAllByRole("row")
      .map((row) => row.querySelectorAll("[role=gridcell]")[1]?.textContent);
    expect(titles).toEqual(["Mayın Tarlası", "Fırtına", "Bir Kedi Gördüm"]);
    // Çalan şarkı vurgulanır.
    await waitFor(() =>
      expect(within(list).getByText("Bir Kedi Gördüm").closest("[role=row]")).toHaveClass(
        "is-current",
      ),
    );
    // Çift tık o şarkıdan albüm sırasıyla çalar: sırada 2 / 3, sıradaki albümün 3. şarkısı.
    backend.open.mockClear();
    backend.open.mockImplementation((path: string) => {
      const found = backend.tracks.find((t) => t.path === path)!;
      backend.status = {
        ...playing,
        state: "paused",
        track: { ...playing.track!, path, title: found.title, durationSecs: 200 },
      };
    });
    await act(async () => fireEvent.doubleClick(within(list).getByText("Fırtına")));
    await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(order[1]));
    expect(await screen.findByText("Duraklatıldı · 2 / 3")).toBeInTheDocument();
    expect(screen.getByText("Bir Kedi Gördüm · Şebnem Ferah")).toBeInTheDocument();
  });

  it("albüm sayfası klavyeyle: ok ve Enter çalar; geri düğmesi odağı karta verir", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm")];
    backend.albums = [kelimeler(backend.tracks)];
    backend.albumTracks.mockReturnValue(backend.tracks.map((t) => t.path));
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Albümler" })));
    const card = await screen.findByRole("button", { name: /Kelimeler/ });
    await act(async () => fireEvent.click(card));
    const list = await screen.findByLabelText("Albümün şarkıları");
    list.focus();
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    await act(async () => fireEvent.keyDown(list, { key: "Enter" }));
    await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(backend.tracks[1]!.path));
    // Çalınca kütüphane kapanır (her yerden çalmada olduğu gibi); yeniden açılır, sayfa yerinde.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Kütüphane" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Albümlere dön" })));
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Kelimeler/ })).toHaveFocus());
  });

  it("kapaktaki çal düğmesi albümü sayfayı açmadan hemen çalar", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm")];
    backend.albums = [kelimeler(backend.tracks)];
    backend.albumTracks.mockReturnValue(backend.tracks.map((t) => t.path));
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Albümler" })));
    const play = await screen.findByRole("button", { name: "Baştan çal" });
    expect(play).toHaveAccessibleDescription("Kelimeler");
    await act(async () => fireEvent.click(play));
    await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(backend.tracks[0]!.path));
    expect(backend.albumTracks).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });

  it("kapaktaki çal düğmesine çift tık albümü bir kez başlatır", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm")];
    backend.albums = [kelimeler(backend.tracks)];
    backend.albumTracks.mockReturnValue(backend.tracks.map((t) => t.path));
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Albümler" })));
    const play = await screen.findByRole("button", { name: "Baştan çal" });
    await act(async () => {
      fireEvent.click(play);
      fireEvent.click(play);
    });
    await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(backend.tracks[0]!.path));
    expect(backend.albumTracks).toHaveBeenCalledTimes(1);
    expect(backend.open).toHaveBeenCalledTimes(1);
  });

  it("albüm sayfasında şarkıya çift tık ve Enter'a üst üste basmak şarkıyı bir kez açar", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm")];
    backend.albums = [kelimeler(backend.tracks)];
    backend.albumTracks.mockReturnValue(backend.tracks.map((t) => t.path));
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Albümler" })));
    await act(async () =>
      fireEvent.click(await screen.findByRole("button", { name: /Kelimeler/ })),
    );
    const list = await screen.findByLabelText("Albümün şarkıları");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    await act(async () => {
      fireEvent.doubleClick(within(list).getByText("Mayın Tarlası"));
      fireEvent.keyDown(list, { key: "Enter" });
    });
    await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(backend.tracks[0]!.path));
    expect(backend.open).toHaveBeenCalledTimes(1);
  });

  it("albüm sayfası aramadan bağımsız: süzülen şarkılar da adı, tempo ve tonuyla görünür", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.searchFilters = true;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm")];
    backend.albums = [kelimeler(backend.tracks)];
    backend.albumTracks.mockReturnValue(backend.tracks.map((t) => t.path));
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Albümler" })));
    const search = screen.getByRole("searchbox", { name: "Kütüphanede ara" });
    await act(async () => fireEvent.change(search, { target: { value: "kedi" } }));
    await waitFor(() => expect(backend.search).toHaveBeenLastCalledWith("kedi"));
    await act(async () =>
      fireEvent.click(await screen.findByRole("button", { name: /Kelimeler/ })),
    );
    const list = await screen.findByLabelText("Albümün şarkıları");
    const row = within(list).getByText("Mayın Tarlası").closest("[role=row]")!;
    expect(row).toHaveTextContent("128");
    expect(row).toHaveTextContent("La minör");
    expect(row).toHaveTextContent("03:20");
    // Arama değişince albümün şarkıları yeniden sorulmaz (kütüphane değişmedi).
    await act(async () => fireEvent.change(search, { target: { value: "ked" } }));
    await waitFor(() => expect(backend.search).toHaveBeenLastCalledWith("ked"));
    expect(backend.albumTracks).toHaveBeenCalledTimes(1);
  });

  it("açık albüm sayfası tazelenen albüm listesini izler; albüm kaybolursa kapanır", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm")];
    backend.albums = [kelimeler(backend.tracks)];
    backend.albumTracks.mockReturnValue(backend.tracks.map((t) => t.path));
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Albümler" })));
    await act(async () =>
      fireEvent.click(await screen.findByRole("button", { name: /Kelimeler/ })),
    );
    const page = () => screen.queryByRole("region", { name: "Kelimeler" });
    expect(page()).toHaveTextContent("2 şarkı");
    await waitFor(() => expect(backend.libraryChanged).not.toBeNull());
    // Tarama yeni bir şarkı buldu: başlık yeni sayıyı gösterir.
    backend.tracks = [...backend.tracks, song(3, "Fırtına")];
    backend.albums = [kelimeler(backend.tracks)];
    backend.albumTracks.mockReturnValue(backend.tracks.map((t) => t.path));
    backend.library = { ...library, trackCount: 3 };
    await act(async () => backend.libraryChanged?.());
    await waitFor(() => expect(page()).toHaveTextContent("3 şarkı"));
    // Albüm kütüphaneden çıktı: sayfa kapanır, ızgaraya dönülür.
    backend.tracks = [song(4, "Başka")];
    backend.albums = [];
    backend.library = { ...library, trackCount: 1 };
    await act(async () => backend.libraryChanged?.());
    await waitFor(() => expect(page()).toBeNull());
  });

  it("albüm sayfasında ok tuşuyla seçilen satır görünür alana kaydırılır", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm")];
    backend.albums = [kelimeler(backend.tracks)];
    backend.albumTracks.mockReturnValue(backend.tracks.map((t) => t.path));
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      render(<App />);
      await screen.findByText("Mayın Tarlası");
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Albümler" })));
      await act(async () =>
        fireEvent.click(await screen.findByRole("button", { name: /Kelimeler/ })),
      );
      const list = await screen.findByLabelText("Albümün şarkıları");
      await act(async () => fireEvent.keyDown(list, { key: "End" }));
      const last = within(list).getByText("Bir Kedi Gördüm").closest("[role=row]")!;
      expect(last).toHaveAttribute("aria-selected", "true");
      expect(scroll).toHaveBeenLastCalledWith({ block: "nearest" });
      expect(scroll.mock.contexts.at(-1)).toBe(last);
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it("şarkılarda aramak albüm listesini sormaz (küçük kapaklar şarkılardan)", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm")];
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    const search = screen.getByRole("searchbox", { name: "Kütüphanede ara" });
    for (const value of ["k", "ke", "ked"]) {
      await act(async () => fireEvent.change(search, { target: { value } }));
    }
    await waitFor(() => expect(backend.search).toHaveBeenLastCalledWith("ked"));
    expect(backend.albumsAsked).not.toHaveBeenCalled();
  });

  it("Esc sırası: önce arama temizlenir, sonra albüm sayfası kapanır, en son kütüphane", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm")];
    backend.albums = [kelimeler(backend.tracks)];
    backend.albumTracks.mockReturnValue(backend.tracks.map((t) => t.path));
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Albümler" })));
    const search = screen.getByRole("searchbox", { name: "Kütüphanede ara" });
    await act(async () => fireEvent.change(search, { target: { value: "kel" } }));
    await act(async () =>
      fireEvent.click(await screen.findByRole("button", { name: /Kelimeler/ })),
    );
    const drawer = document.getElementById("drawer")!;
    const pageOpen = () => screen.queryByRole("heading", { level: 3, name: "Kelimeler" }) !== null;
    expect(pageOpen()).toBe(true);

    search.focus();
    await act(async () => fireEvent.keyDown(search, { key: "Escape" }));
    expect(search).toHaveValue("");
    expect(pageOpen()).toBe(true);
    expect(drawer).toHaveAttribute("aria-hidden", "false");

    await act(async () => fireEvent.keyDown(document.body, { key: "Escape" }));
    expect(pageOpen()).toBe(false);
    expect(drawer).toHaveAttribute("aria-hidden", "false");
    // Arama değiştiği için ızgara yeniden yüklenir; gelince odak karta döner.
    await waitFor(() => expect(screen.getByRole("button", { name: /Kelimeler/ })).toHaveFocus());

    await act(async () => fireEvent.keyDown(document.body, { key: "Escape" }));
    expect(drawer).toHaveAttribute("aria-hidden", "true");
  });

  it("albüm sayfasında kapak değiştirilebilir; Esc önce açık kapak menüsünü kapatır", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası")];
    backend.albums = [kelimeler(backend.tracks)];
    backend.albumTracks.mockReturnValue(backend.tracks.map((t) => t.path));
    backend.pickImage.mockReturnValue("C:\\Resimler\\kapak.jpg");
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Albümler" })));
    await act(async () =>
      fireEvent.click(await screen.findByRole("button", { name: /Kelimeler/ })),
    );
    const page = screen.getByRole("region", { name: "Kelimeler" });
    const menu = page.querySelector<HTMLDetailsElement>(".album-page__menu")!;
    menu.open = true;
    await act(async () =>
      fireEvent.click(within(page).getByRole("button", { name: "Kapak seç…" })),
    );
    await waitFor(() =>
      expect(backend.setAlbumCover).toHaveBeenCalledWith(
        "Kelimeler",
        "Şebnem Ferah",
        "C:\\Resimler\\kapak.jpg",
      ),
    );
    expect(menu.open).toBe(false);
    menu.open = true;
    const remove = within(page).getByRole("button", { name: "Seçtiğim kapağı kaldır" });
    await act(async () => fireEvent.keyDown(remove, { key: "Escape" }));
    expect(menu.open).toBe(false);
    expect(screen.getByRole("heading", { level: 3, name: "Kelimeler" })).toBeInTheDocument();
    await act(async () => fireEvent.click(remove));
    expect(backend.clearAlbumCover).toHaveBeenCalledWith("Kelimeler", "Şebnem Ferah");
  });

  it("şarkı satırında albüm kapağı: albüm başına tek istek, kapak yoksa baskı kapağı", async () => {
    // Önceki testlerden yarım kalan kapak işleri bitsin (sayıma karışmasın).
    await new Promise((resolve) => setTimeout(resolve, 50));
    clearAlbumCovers();
    print.fake = true;
    print.inputs = [];
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/jpeg;base64,YmFza2k=");
    try {
      backend.desktop = true;
      backend.library = { ...library, trackCount: 16 };
      const own = Array.from({ length: 12 }, (_, i) => song(i + 1, `Kelime ${i + 1}`));
      const other = Array.from({ length: 3 }, (_, i) => ({
        ...song(20 + i, `Ayna ${i + 1}`),
        album: "Ayna",
        artist: "Defne Ak",
      }));
      const loose = { ...song(30, "Etiketsiz"), album: null };
      backend.tracks = [...own, ...other, loose];
      backend.albums = [
        kelimeler(own),
        { ...kelimeler(other), name: "Ayna", artist: "Defne Ak", bpm: null, key: null },
      ];
      render(<App />);
      await screen.findByText("Kelime 1");
      await waitFor(() =>
        expect(
          screen.getByText("Kelime 7").closest("[role=gridcell]")!.querySelector("img"),
        ).toHaveAttribute("src", "data:image/jpeg;base64,YmFza2k="),
      );
      await waitFor(() =>
        expect(
          screen.getByText("Ayna 2").closest("[role=gridcell]")!.querySelector("img"),
        ).not.toBeNull(),
      );
      // 12 + 3 satır, iki albüm: iki kapak okuması ve iki baskı kapağı (albümün tonuyla).
      expect(backend.coverAsked.mock.calls.map(([p]) => p).sort()).toEqual(
        [own[0]!.path, other[0]!.path].sort(),
      );
      expect(print.inputs).toEqual(
        expect.arrayContaining([
          { album: "Kelimeler", key: "8A" },
          { album: "Ayna", key: null },
        ]),
      );
      expect(print.inputs).toHaveLength(2);
      // Albüm etiketi olmayan şarkıda düz yer tutucu; başlık hücresinin metni yalnızca şarkı adı.
      const looseCell = screen.getByText("Etiketsiz").closest("[role=gridcell]")!;
      expect(looseCell.querySelector(".library__thumb")).not.toBeNull();
      expect(looseCell.querySelector("img")).toBeNull();
      expect(looseCell.textContent).toBe("Etiketsiz");
      // Sütun başlıkları yerinde.
      expect(screen.getByRole("button", { name: /^Başlık/ })).toBeInTheDocument();
    } finally {
      print.fake = false;
      toDataURL.mockRestore();
      clearAlbumCovers();
    }
  });

  it("sanatçının albüm sayısı değişince (tarama) levhası yeniden çizilir", async () => {
    const artist = { name: "Şebnem Ferah", albumCount: 2, trackCount: 5, coverPath: "C:\\a.flac" };
    const { container, rerender } = render(
      <ArtistGrid artists={[artist]} current={null} onOpen={() => {}} onPlay={() => {}} />,
    );
    await screen.findByText(/^α \d\dh\d\dm/);
    const before = container.querySelector(".artist__plate");
    rerender(
      <ArtistGrid
        artists={[{ ...artist, albumCount: 3 }]}
        current={null}
        onOpen={() => {}}
        onPlay={() => {}}
      />,
    );
    // Eski levha (2 halkalı) kalmaz: yenisi çizilir.
    expect(container.querySelector(".artist__plate")).not.toBe(before);
    expect(await screen.findByText(/^α \d\dh\d\dm/)).toBeInTheDocument();
  });

  it("sanatçılar görünümü: yıldız atlası levhaları; levhadaki çal düğmesi hepsini çalar", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm")];
    backend.artists = [
      { name: "Şebnem Ferah", albumCount: 1, trackCount: 2, coverPath: backend.tracks[0]!.path },
    ];
    backend.artistTracks.mockReturnValue([backend.tracks[0]!.path, backend.tracks[1]!.path]);
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sanatçılar" })));
    expect(screen.getByRole("heading", { name: /Sanatçılar/ })).toHaveTextContent("1 sanatçı");
    const card = await screen.findByRole("button", { name: /Şebnem Ferah/ });
    expect(card).toHaveTextContent("1 albüm · 2 şarkı");
    // Levhanın künyesi (adın gökyüzündeki yeri) yazılır.
    expect(await within(card).findByText(/^α \d\dh\d\dm · δ [+−]\d\d°$/)).toBeInTheDocument();
    // Kart sanatçı sayfasını açar; hepsini hemen çalmak levhanın üstündeki ayrı düğmede.
    const play = within(card.closest("li")!).getByRole("button", { name: "Baştan çal" });
    expect(play).toHaveAccessibleDescription("Şebnem Ferah");
    await act(async () => fireEvent.click(play));
    expect(backend.artistTracks).toHaveBeenCalledWith("Şebnem Ferah");
    await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(backend.tracks[0]!.path));
  });

  // Sanatçı sayfası: iki albüm. Çekirdeğin sanatçı sırası (albüm, disk, parça) listedeki sıradan
  // bağımsızdır: "Sigara" diskte "Ayna"dan önce.
  const setupArtist = () => {
    backend.desktop = true;
    backend.library = { ...library, trackCount: 4 };
    backend.tracks = [
      song(1, "Mayın Tarlası"),
      song(2, "Bir Kedi Gördüm"),
      { ...song(4, "Ayna"), album: "Perdeler", trackNumber: 2, bpm: 90, key: "10B" },
      { ...song(5, "Sigara"), album: "Perdeler", trackNumber: 1 },
    ];
    const [t1, t2, t4, t5] = backend.tracks.map((t) => t.path);
    backend.artists = [{ name: "Şebnem Ferah", albumCount: 2, trackCount: 4, coverPath: t1! }];
    const order = [t1!, t2!, t5!, t4!];
    backend.artistTracks.mockReturnValue(order);
    backend.albumTracks.mockImplementation((album: string) =>
      album === "Perdeler" ? [t5, t4] : [t1, t2],
    );
    return order;
  };

  const openArtistPage = async () => {
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sanatçılar" })));
    await act(async () =>
      fireEvent.click(await screen.findByRole("button", { name: /Şebnem Ferah/ })),
    );
    return screen.getByRole("region", { name: "Şebnem Ferah" });
  };

  it("sanatçı sayfası: karta tıklayınca açılır; levha, ad, özet, albümler ve şarkılar", async () => {
    const order = setupArtist();
    render(<App />);
    const page = await openArtistPage();
    // Kart çalmaz; odak sayfanın başlığında.
    expect(backend.open).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 3, name: "Şebnem Ferah" })).toHaveFocus();
    expect(page.querySelector(".artist-page__plate")).not.toBeNull();
    expect(await within(page).findByText(/^α \d\dh\d\dm · δ [+−]\d\d°$/)).toBeInTheDocument();
    await waitFor(() => expect(page).toHaveTextContent("2 albüm · 4 şarkı · 13 dk"));
    // Albümler küçük kapaklarla, kütüphane sırasıyla.
    const covers = within(page)
      .getAllByRole("button", { name: /^(Kelimeler|Perdeler)/ })
      .map((button) => button.textContent);
    expect(covers).toEqual(["Kelimeler2 şarkı · 7 dk", "Perdeler2 şarkı · 7 dk"]);
    // Şarkılar çekirdeğin sırasıyla; albüm sütunuyla; ton Türkçe.
    const list = await within(page).findByLabelText("Sanatçının şarkıları");
    const cells = (index: number) =>
      within(list)
        .getAllByRole("row")
        .map((row) => row.querySelectorAll("[role=gridcell]")[index]?.textContent);
    expect(cells(1)).toEqual(["Mayın Tarlası", "Bir Kedi Gördüm", "Sigara", "Ayna"]);
    expect(cells(2)).toEqual(["Kelimeler", "Kelimeler", "Perdeler", "Perdeler"]);
    // Sıra sütunu sayfadaki sıra (albümün parça numarası değil).
    expect(cells(0)).toEqual(["1", "2", "3", "4"]);
    expect(within(list).getByText("Mayın Tarlası").closest("[role=row]")).toHaveTextContent(
      "La minör",
    );
    // Çift tık o şarkıdan sanatçının sırasıyla çalar: sırada 3 / 4, sıradaki "Ayna".
    backend.open.mockImplementation((path: string) => {
      const found = backend.tracks.find((t) => t.path === path)!;
      backend.status = {
        ...playing,
        state: "paused",
        track: { ...playing.track!, path, title: found.title, durationSecs: 200 },
      };
    });
    await act(async () => fireEvent.doubleClick(within(list).getByText("Sigara")));
    await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(order[2]));
    expect(await screen.findByText("Duraklatıldı · 3 / 4")).toBeInTheDocument();
    expect(screen.getByText("Ayna · Şebnem Ferah")).toBeInTheDocument();
    expect(backend.open).toHaveBeenCalledTimes(1);
  });

  it("sanatçı sayfasında 'Çal' baştan sırayla, 'Karışık çal' karışık çalar; çift tık bir kez", async () => {
    const order = setupArtist();
    render(<App />);
    await openArtistPage();
    const playAll = screen.getByRole("button", { name: "Sanatçıyı çal" });
    await waitFor(() => expect(playAll).toBeEnabled());
    await act(async () => {
      fireEvent.click(playAll);
      fireEvent.click(playAll);
    });
    await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(order[0]));
    expect(backend.open).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Karışık çal", pressed: false })).toBeInTheDocument();

    // Çalınca kütüphane kapanır; yeniden açılır, sayfa yerinde.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Kütüphane" })));
    await new Promise((resolve) => setTimeout(resolve, 650));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Sanatçıyı karışık çal" })),
    );
    await waitFor(() => expect(backend.open).toHaveBeenCalledTimes(2));
    expect(order).toContain(backend.open.mock.calls[1]![0]);
    expect(screen.getByRole("button", { name: "Karışık çal", pressed: true })).toBeInTheDocument();
  });

  it("sanatçı sayfasından albüm açılır; Esc sanatçı sayfasına, ikinci Esc ızgaraya döndürür", async () => {
    setupArtist();
    render(<App />);
    const artistPage = await openArtistPage();
    const cover = await within(artistPage).findByRole("button", { name: /^Perdeler/ });
    await act(async () => fireEvent.click(cover));
    // Albüm sayfası: albümün kendi sırası; geri düğmesi sanatçıya döner.
    const heading = screen.getByRole("heading", { level: 3, name: "Perdeler" });
    expect(heading).toHaveFocus();
    expect(backend.albumTracks).toHaveBeenCalledWith("Perdeler", "Şebnem Ferah");
    expect(screen.getByRole("region", { name: "Perdeler" })).toHaveTextContent("2 şarkı · 7 dk");
    expect(screen.getByRole("button", { name: "Şebnem Ferah sayfasına dön" })).toHaveTextContent(
      "← Şebnem Ferah",
    );
    expect(screen.queryByRole("heading", { level: 3, name: "Şebnem Ferah" })).toBeNull();
    const list = await screen.findByLabelText("Albümün şarkıları");
    const titles = within(list)
      .getAllByRole("row")
      .map((row) => row.querySelectorAll("[role=gridcell]")[1]?.textContent);
    expect(titles).toEqual(["Sigara", "Ayna"]);

    const drawer = document.getElementById("drawer")!;
    await act(async () => fireEvent.keyDown(document.body, { key: "Escape" }));
    expect(screen.queryByRole("heading", { level: 3, name: "Perdeler" })).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Şebnem Ferah" })).toBeInTheDocument();
    // Odak açılan albümün kapağına döner; sanatçının şarkıları yeniden sorulmaz.
    await waitFor(() => expect(screen.getByRole("button", { name: /^Perdeler/ })).toHaveFocus());
    expect(backend.artistTracks).toHaveBeenCalledTimes(1);
    expect(drawer).toHaveAttribute("aria-hidden", "false");

    await act(async () => fireEvent.keyDown(document.body, { key: "Escape" }));
    expect(screen.queryByRole("region", { name: "Şebnem Ferah" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: /Şebnem Ferah/ })).toHaveFocus());
    expect(drawer).toHaveAttribute("aria-hidden", "false");

    await act(async () => fireEvent.keyDown(document.body, { key: "Escape" }));
    expect(drawer).toHaveAttribute("aria-hidden", "true");
  });

  it("sanatçı sayfasının geri düğmeleri: albümden sanatçıya, sanatçıdan ızgaraya", async () => {
    setupArtist();
    render(<App />);
    const artistPage = await openArtistPage();
    await act(async () =>
      fireEvent.click(await within(artistPage).findByRole("button", { name: /^Kelimeler/ })),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Şebnem Ferah sayfasına dön" })),
    );
    expect(screen.getByRole("heading", { level: 3, name: "Şebnem Ferah" })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sanatçılara dön" })));
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Şebnem Ferah/ })).toHaveFocus());
  });

  it("sanatçı sayfası aramadan bağımsız: süzülen şarkılar ve albümler de tam görünür", async () => {
    backend.searchFilters = true;
    setupArtist();
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sanatçılar" })));
    const search = screen.getByRole("searchbox", { name: "Kütüphanede ara" });
    await act(async () => fireEvent.change(search, { target: { value: "kedi" } }));
    await waitFor(() => expect(backend.search).toHaveBeenLastCalledWith("kedi"));
    await act(async () =>
      fireEvent.click(await screen.findByRole("button", { name: /Şebnem Ferah/ })),
    );
    const page = screen.getByRole("region", { name: "Şebnem Ferah" });
    await waitFor(() => expect(page).toHaveTextContent("2 albüm · 4 şarkı · 13 dk"));
    expect(within(page).getAllByRole("button", { name: /^(Kelimeler|Perdeler)/ })).toHaveLength(2);
    const list = await within(page).findByLabelText("Sanatçının şarkıları");
    const row = within(list).getByText("Ayna").closest("[role=row]")!;
    expect(row).toHaveTextContent("90");
    expect(row).toHaveTextContent("Re majör");
    expect(row).toHaveTextContent("03:20");
    // Arama değişince sanatçının şarkıları yeniden sorulmaz (kütüphane değişmedi).
    await act(async () => fireEvent.change(search, { target: { value: "ked" } }));
    await waitFor(() => expect(backend.search).toHaveBeenLastCalledWith("ked"));
    expect(backend.artistTracks).toHaveBeenCalledTimes(1);
  });

  it("arama sürerken çalan şarkının albümü sanatçı sayfasında vurgulanır", async () => {
    backend.searchFilters = true;
    setupArtist();
    // Çalan "Ayna" aramaya uymuyor (süzülen listede yok).
    backend.status = { ...playing, track: { ...track, path: backend.tracks[2]!.path } };
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sanatçılar" })));
    const search = screen.getByRole("searchbox", { name: "Kütüphanede ara" });
    await act(async () => fireEvent.change(search, { target: { value: "kedi" } }));
    await waitFor(() => expect(backend.search).toHaveBeenLastCalledWith("kedi"));
    await act(async () =>
      fireEvent.click(await screen.findByRole("button", { name: /Şebnem Ferah/ })),
    );
    const page = screen.getByRole("region", { name: "Şebnem Ferah" });
    await waitFor(() =>
      expect(within(page).getByRole("button", { name: /^Perdeler/ })).toHaveClass("is-current"),
    );
    expect(within(page).getByRole("button", { name: /^Kelimeler/ })).not.toHaveClass("is-current");
  });

  it("arama sürerken sanatçı kütüphaneden çıkarsa sayfası kapanır", async () => {
    backend.searchFilters = true;
    setupArtist();
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sanatçılar" })));
    const search = screen.getByRole("searchbox", { name: "Kütüphanede ara" });
    await act(async () => fireEvent.change(search, { target: { value: "kedi" } }));
    await waitFor(() => expect(backend.search).toHaveBeenLastCalledWith("kedi"));
    await act(async () =>
      fireEvent.click(await screen.findByRole("button", { name: /Şebnem Ferah/ })),
    );
    expect(screen.getByRole("region", { name: "Şebnem Ferah" })).toBeInTheDocument();
    await waitFor(() => expect(backend.libraryChanged).not.toBeNull());
    backend.tracks = [{ ...song(6, "Kedi"), artist: "Defne Ak", album: "Ayna" }];
    backend.artists = [];
    backend.library = { ...library, trackCount: 1 };
    await act(async () => backend.libraryChanged?.());
    await waitFor(() => expect(screen.queryByRole("region", { name: "Şebnem Ferah" })).toBeNull());
  });

  it("açık sanatçı sayfası tazelenen listeyi izler; sanatçı kaybolursa kapanır", async () => {
    setupArtist();
    render(<App />);
    const page = await openArtistPage();
    await waitFor(() => expect(page).toHaveTextContent("2 albüm · 4 şarkı"));
    await waitFor(() => expect(backend.libraryChanged).not.toBeNull());
    backend.artists = [{ ...backend.artists[0]!, albumCount: 3, trackCount: 5 }];
    backend.library = { ...library, trackCount: 5 };
    await act(async () => backend.libraryChanged?.());
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Şebnem Ferah" })).toHaveTextContent(
        "3 albüm · 5 şarkı",
      ),
    );
    backend.artists = [];
    backend.library = { ...library, trackCount: 0 };
    await act(async () => backend.libraryChanged?.());
    await waitFor(() => expect(screen.queryByRole("region", { name: "Şebnem Ferah" })).toBeNull());
  });

  it("Ctrl+5 çalma listelerini açar; şarkılarda seçili şarkı listeye eklenebilir", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası")];
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    // Şarkı seçilmeden "Listeye ekle" kapalı; seçilince şarkının adıyla açılır.
    expect(screen.getByLabelText("Listeye eklemek için önce bir şarkı seçin")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.click(screen.getByText("Mayın Tarlası"));
    expect(screen.getByLabelText("Seçili şarkıyı listeye ekle: Mayın Tarlası")).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    await act(async () => fireEvent.keyDown(window, { key: "5", ctrlKey: true }));
    expect(screen.getByRole("button", { name: "Listeler" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await screen.findByRole("button", { name: /Yeni liste/ })).toBeInTheDocument();
    expect(screen.getByText("0 liste")).toBeInTheDocument();
  });

  it("gökyüzü görünümü: tonu ve temposu bilinen şarkı yıldız olur, tıklayınca çalar", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası"), song(2, "Bir Kedi Gördüm"), song(3, "Fırtına")];
    // jsdom yerleşim yapmaz: alanın boyutu elle verilir.
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
    const height = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    try {
      render(<App />);
      await screen.findByText("Mayın Tarlası");
      await act(async () => fireEvent.keyDown(window, { key: "4", ctrlKey: true }));
      expect(screen.getByRole("button", { name: "Gökyüzü" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      // Yalnızca 1. şarkının tonu ve temposu var (2. ritimsiz, 3. analiz bekliyor).
      expect(screen.getByText(/1 yıldız · 2 şarkı gökyüzünde yok/)).toBeInTheDocument();
      const sky = screen.getByRole("img", { name: /Gökyüzü/ });
      expect(within(sky.parentElement!).getByText("La minör")).toBeInTheDocument();
      // Yıldızın yeri saf hesaptan (skyMap testleri); üstüne gelip tıklayınca çalar.
      const { stars } = layoutSky(backend.tracks, 300, 200, 400 / 2 - 40);
      const star = stars[0]!;
      fireEvent.pointerMove(sky, { clientX: star.x, clientY: star.y });
      expect(await screen.findByText("Çalmak için tıklayın")).toBeInTheDocument();
      expect(screen.getByText("La minör · 128 BPM")).toBeInTheDocument();
      await act(async () => fireEvent.click(sky, { clientX: star.x, clientY: star.y }));
      await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(backend.tracks[0]!.path));
      // Dokunmatik ekranda önce imleç hareketi gelmez: tıklama yerinden bulunur.
      backend.open.mockClear();
      fireEvent.pointerLeave(sky);
      expect(screen.queryByText("Çalmak için tıklayın")).not.toBeInTheDocument();
      await act(async () => fireEvent.click(sky, { clientX: star.x, clientY: star.y }));
      await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(backend.tracks[0]!.path));
      // Klavyeyle: ok tuşu yıldız seçer (künye görünür), Enter çalar.
      backend.open.mockClear();
      fireEvent.pointerLeave(sky);
      sky.focus();
      fireEvent.keyDown(sky, { key: "ArrowRight" });
      expect(screen.getByText("La minör · 128 BPM")).toBeInTheDocument();
      await act(async () => fireEvent.keyDown(sky, { key: "Enter" }));
      await waitFor(() => expect(backend.open).toHaveBeenLastCalledWith(backend.tracks[0]!.path));
    } finally {
      width.mockRestore();
      height.mockRestore();
    }
  });

  it("kütüphane ortada cam sayfa; dışındaki sahneye tıklayınca kapanır", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası")];
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    const drawer = document.getElementById("drawer")!;
    expect(drawer).toHaveClass("is-full");
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Kütüphaneyi kapat, sahneye dön" })),
    );
    expect(drawer).toHaveAttribute("aria-hidden", "true");
    // Öteki paneller (ör. Ekolayzer) sağdaki çekmecede kalır; sahneye tıklama yakalanmaz.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ekolayzer" })));
    expect(drawer).not.toHaveClass("is-full");
    expect(
      screen.queryByRole("button", { name: "Kütüphaneyi kapat, sahneye dön" }),
    ).not.toBeInTheDocument();
  });

  it("kütüphane kısayolları: Ctrl+F arama, Ctrl+2 albümler; Esc önce aramayı temizler", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası")];
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    const search = screen.getByRole("searchbox", { name: "Kütüphanede ara" });
    await act(async () => fireEvent.keyDown(window, { key: "f", ctrlKey: true }));
    expect(search).toHaveFocus();
    await act(async () => fireEvent.change(search, { target: { value: "mayın" } }));
    // İlk Esc aramayı temizler, kütüphane açık kalır.
    await act(async () => fireEvent.keyDown(search, { key: "Escape" }));
    expect(search).toHaveValue("");
    expect(document.getElementById("drawer")).toHaveAttribute("aria-hidden", "false");
    // Ctrl+2 albümler; tek başına "2" sahne kısayolu olarak kalır (kütüphaneyi değiştirmez).
    await act(async () => fireEvent.keyDown(window, { key: "2", ctrlKey: true }));
    expect(screen.getByRole("button", { name: "Albümler" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await act(async () => fireEvent.keyDown(window, { key: "1", ctrlKey: true }));
    expect(screen.getByRole("button", { name: "Şarkılar" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("müzik ekle menüsü klasör ve tek tek şarkı; yeniden tarama kaynak menüsünde", async () => {
    backend.desktop = true;
    backend.library = library;
    backend.tracks = [song(1, "Mayın Tarlası")];
    backend.pickFolder.mockResolvedValue("D:\\Arşiv");
    render(<App />);
    await screen.findByText("Mayın Tarlası");
    await act(async () => fireEvent.click(screen.getByText("Müzik ekle")));
    expect(screen.getByText(/sürükleyip de bırakabilirsiniz/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Klasör ekle" })));
    expect(backend.addFolder).toHaveBeenCalledWith("D:\\Arşiv");
    expect(
      screen.getByRole("button", { name: "Kütüphaneyi yeniden tara" }).closest("details"),
    ).toHaveClass("library__sources");
  });

  it("arama kutusuna yazılanla arar ve klasör kaldırılabilir", async () => {
    backend.desktop = true;
    backend.library = library;
    render(<App />);
    const search = await screen.findByRole("searchbox", { name: "Kütüphanede ara" });
    await act(async () => fireEvent.change(search, { target: { value: "sebnem" } }));
    await waitFor(() => expect(backend.search).toHaveBeenLastCalledWith("sebnem"));
    // Kaldırma önce sorar: × düğmesi yalnızca onay ister, "Evet" kaldırır.
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Kütüphaneden çıkar/ })),
    );
    expect(backend.removeFolder).not.toHaveBeenCalled();
    expect(screen.getByText("Kaldırılsın mı?")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Evet" })));
    expect(backend.removeFolder).toHaveBeenCalledWith(7);
  });
});

describe("ekolayzer", () => {
  /** Üst çubuktaki ekolayzer düğmesinin ışığı: ses değiştiriliyorsa yanar. */
  const eqLight = () => screen.getByRole("button", { name: "Ekolayzer" }).querySelector(".led");
  const openEq = async () => {
    render(<App />);
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: /Ekolayzer/ })));
  };

  it("sekmeyle açılır; hazır ayar sürgüleri ve ekrandaki EQ ışığını değiştirir", async () => {
    await openEq();
    expect(screen.getByRole("tab", { name: /Ekolayzer/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Düz" })).toHaveAttribute("aria-pressed", "true");

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Bas" })));
    await waitFor(() =>
      expect(backend.setEq).toHaveBeenLastCalledWith({
        enabled: true,
        gainsDb: [0, 4, 3, 1, 0, 0, 0, 0, 0, 0],
        bassDb: 6,
        smallSpeaker: false,
        bassDepth: 0,
        bassPunch: 0.3,
      }),
    );
    expect(screen.getByRole("slider", { name: "62 Hz" })).toHaveAttribute("aria-valuenow", "4");
    // "Bas" hazır ayarı bas düğmesini de çevirir.
    expect(screen.getByRole("slider", { name: "Bas" })).toHaveValue("6");
    expect(screen.getByRole("button", { name: "Bas" })).toHaveAttribute("aria-pressed", "true");
    expect(eqLight()).toHaveClass("is-on");
    // Tarayıcı önizlemesinde şarkının boşluğu bilinmez: en kötü durum gösterilir
    // (bantların en büyüğü 4 + bas düğmesi 6 + vuruşun en yüksek anı %30 × 8 = 2,4).
    expect(await screen.findByText(/Bozulma koruması: −12,4 dB/)).toBeInTheDocument();
  });

  it("bas kulüp bölgesine çıkar; derinlik ayarlanır, küçük hoparlörde kapanır", async () => {
    await openEq();
    const bass = screen.getByRole("slider", { name: "Bas" });
    expect(bass).toHaveAttribute("max", "18");
    expect(screen.queryByText("Kulüp", { selector: ".bass__badge" })).not.toBeInTheDocument();
    await act(async () => fireEvent.change(bass, { target: { value: "15" } }));
    expect(screen.getByText("Kulüp", { selector: ".bass__badge" })).toBeInTheDocument();
    expect(screen.getByText(/Kulüp düzeyi: bas her şeyin önünde/)).toBeInTheDocument();

    const depth = screen.getByRole("slider", { name: "Derinlik" });
    await act(async () => fireEvent.change(depth, { target: { value: "0.6" } }));
    expect(depth).toHaveAttribute("aria-valuetext", "%60");
    await waitFor(() =>
      expect(backend.setEq).toHaveBeenLastCalledWith(
        expect.objectContaining({ bassDb: 15, bassDepth: 0.6 }),
      ),
    );

    // "Kulüp" hazır ayarı ikisini birlikte ayarlar.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Kulüp" })));
    expect(bass).toHaveValue("14");
    expect(depth).toHaveValue("0.7");
    expect(screen.getByRole("button", { name: "Kulüp" })).toHaveAttribute("aria-pressed", "true");

    // Küçük hoparlörde alt oktav çalınamaz: derinlik kapanır.
    await act(async () =>
      fireEvent.click(screen.getByRole("switch", { name: "Küçük hoparlör bası" })),
    );
    expect(depth).toBeDisabled();
    expect(screen.getByText(/Derinlik küçük hoparlörde kapalı/)).toBeInTheDocument();
  });

  it("vuruş ayarlanır; kulüp hazır ayarında güçlü, küçük hoparlörde de açık", async () => {
    await openEq();
    const punch = screen.getByRole("slider", { name: "Vuruş" });
    expect(punch).toHaveValue("0");
    expect(screen.getByText(/vuruş göğse çarpar, sürekli bas şişmez/)).toBeInTheDocument();
    await act(async () => fireEvent.change(punch, { target: { value: "0.8" } }));
    expect(punch).toHaveAttribute("aria-valuetext", "%80");
    expect(eqLight()).toHaveClass("is-on");
    await waitFor(() =>
      expect(backend.setEq).toHaveBeenLastCalledWith(expect.objectContaining({ bassPunch: 0.8 })),
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Kulüp" })));
    expect(punch).toHaveValue("0.7");
    // Vuruş küçük hoparlörde de çalışır (harmonikler de vuruşla güçlenir).
    await act(async () =>
      fireEvent.click(screen.getByRole("switch", { name: "Küçük hoparlör bası" })),
    );
    expect(punch).not.toBeDisabled();
  });

  it("bas düğmesi ve küçük hoparlör bası ayarlanır; hazır ayar 'özel'e döner", async () => {
    await openEq();
    const bass = screen.getByRole("slider", { name: "Bas" });
    expect(bass).toHaveValue("0");
    expect(eqLight()).not.toHaveClass("is-on");
    await act(async () => fireEvent.change(bass, { target: { value: "8.5" } }));
    expect(bass).toHaveValue("8.5");
    expect(bass).toHaveAttribute("aria-valuetext", "+8,5 dB");
    expect(screen.getByText("Özel ayar")).toBeInTheDocument();
    expect(eqLight()).toHaveClass("is-on");
    await waitFor(() =>
      expect(backend.setEq).toHaveBeenLastCalledWith(expect.objectContaining({ bassDb: 8.5 })),
    );

    const small = screen.getByRole("switch", { name: "Küçük hoparlör bası" });
    expect(small).toHaveAttribute("aria-checked", "false");
    await act(async () => fireEvent.click(small));
    expect(small).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/çalınamayan alt bas süzülür/)).toBeInTheDocument();
    await waitFor(() =>
      expect(backend.setEq).toHaveBeenLastCalledWith(
        expect.objectContaining({ bassDb: 8.5, smallSpeaker: true }),
      ),
    );

    // "Küçük hoparlör" hazır ayarı ikisini birlikte ayarlar.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Küçük hoparlör" })));
    expect(bass).toHaveValue("8");
    expect(screen.getByRole("button", { name: "Küçük hoparlör" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("sürgü klavyeyle ayarlanır, ok tuşları şarkıyı sarmaz", async () => {
    backend.desktop = true;
    backend.status = playing;
    await openEq();
    const slider = screen.getByRole("slider", { name: "1kHz" });
    slider.focus();
    await act(async () => fireEvent.keyDown(slider, { key: "ArrowUp" }));
    await act(async () => fireEvent.keyDown(slider, { key: "PageUp" }));
    expect(slider).toHaveAttribute("aria-valuenow", "3.5");
    expect(screen.getByText("Özel ayar")).toBeInTheDocument();

    // ← / → komşu banda geçer; şarkı sarılmaz.
    await act(async () => fireEvent.keyDown(slider, { key: "ArrowRight" }));
    expect(screen.getByRole("slider", { name: "2kHz" })).toHaveFocus();
    expect(backend.seek).not.toHaveBeenCalled();

    // Çift tıklama sıfırlar; kapatınca ayar korunur ama ışık söner.
    await act(async () => fireEvent.doubleClick(slider));
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    await act(async () => fireEvent.keyDown(slider, { key: "Home" }));
    expect(slider).toHaveAttribute("aria-valuenow", "12");
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Açık" })));
    expect(screen.getByRole("switch", { name: "Kapalı" })).toHaveAttribute("aria-checked", "false");
    expect(slider).toHaveAttribute("aria-valuenow", "12");
    expect(eqLight()).not.toHaveClass("is-on");
    await waitFor(() =>
      expect(backend.setEq).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false })),
    );
  });

  it("işaretçinin konumunu kazanca çevirir", async () => {
    const { pointerToGain } = await import("./EqualizerPanel");
    expect(pointerToGain(100, 100, 200)).toBe(12);
    expect(pointerToGain(300, 100, 200)).toBe(-12);
    expect(pointerToGain(200, 100, 200)).toBe(0);
    expect(pointerToGain(0, 100, 200)).toBe(12);
    expect(pointerToGain(5, 0, 0)).toBe(0);
  });
});

describe("sahneler", () => {
  afterEach(() => window.localStorage.clear());

  it("açılışta gece göğü seçilidir; üstteki düğmeyle VU ibrelerine geçer ve seçimi hatırlar", async () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Gece göğü" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "VU ibreleri" })));
    expect(screen.getByRole("img", { name: "Sol kanal VU ölçer" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Sağ kanal VU ölçer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "VU ibreleri" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Gece göğü" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(window.localStorage.getItem("lyraska.scene")).toBe("vu");
  });

  it("gece sürüşü: ön camdan yol, torpidoda teyp; kaset çalarken döner, ekranda şarkı kayar", async () => {
    backend.desktop = true;
    backend.status = { ...playing, state: "paused" };
    backend.bands = new Array<number>(32).fill(0.6);
    backend.director = {
      atmosphere: { section: 0, theme: 0, mood: 1, warmth: 0.5 },
      rhythm: {
        pulse: 0,
        accent: 0,
        beatPhase: 0,
        barPhase: 0,
        anticipation: 0,
        release: 0,
        barsConfident: true,
      },
      texture: { detail: 0.5, motion: 0.5 },
    };
    const { container } = render(<App />);
    // Oynatıcı çalan şarkıyı ilk komutla öğrenir (duraklatılmış).
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await act(async () => fireEvent.keyDown(window, { key: "5" }));
    expect(screen.getByRole("button", { name: "Gece sürüşü" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Ön camda gece otoyolunun çizimi; torpidoda teyp ve iki VU ibresi.
    expect(screen.getByRole("img", { name: /Gece otoyolu/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Teyp" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Sol kanal VU ölçer" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Kaset duruyor" })).toBeInTheDocument();
    // Ekranda çalan şarkı kayar (sanatçı · başlık).
    expect(screen.getByRole("img", { name: "Lyra · Gece Otoyolu" })).toBeInTheDocument();

    backend.status = playing;
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    expect(await screen.findByRole("img", { name: "Kaset dönüyor" })).toBeInTheDocument();
    // Torpidonun ışığı Görsel Yönetmen'i izler.
    await waitFor(
      () => {
        const dash = container.querySelector<HTMLElement>(".drive-scene__dash");
        expect(Number(dash?.style.getPropertyValue("--stage-glow") || 0)).toBeGreaterThan(0.3);
      },
      { timeout: 3000 },
    );
  });

  it("galeri: listeden, 1–9 ve 0 tuşlarıyla, PageDown/PageUp ile sahne seçilir", async () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: /Galeri/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await act(async () => fireEvent.click(toggle));
    const list = screen.getByRole("group", { name: "Galeri" });
    expect(within(list).getAllByRole("button")).toHaveLength(8);
    // Esc listeyi kapatır, çekmeceye dokunmaz.
    await act(async () => fireEvent.keyDown(list, { key: "Escape" }));
    expect(screen.queryByRole("group", { name: "Galeri" })).not.toBeInTheDocument();
    await act(async () => fireEvent.click(toggle));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Bulutsu.*renkli toz/ })),
    );
    // Seçince liste kapanır, düğme sahnenin adını gösterir; sahne çizilir (jsdom'da WebGL yok).
    expect(screen.queryByRole("group", { name: "Galeri" })).not.toBeInTheDocument();
    const pill = screen.getByRole("button", { name: /Bulutsu/ });
    expect(pill).toHaveClass("is-on");
    const nebula = screen.getByRole("img", { name: /Bulutsu: yıldızların önünde/ });
    expect(nebula).toHaveAttribute("data-webgl", "off");
    expect(nebula.dataset.webglError).toMatch(/WebGL2 açılamadı/);
    expect(window.localStorage.getItem("lyraska.scene")).toBe("nebula");

    await act(async () => fireEvent.keyDown(window, { key: "0" }));
    expect(screen.getByRole("img", { name: /Sarmal gökada/ })).toBeInTheDocument();
    // Tuşu olmayan sahnelere PageDown/PageUp ile; sonda başa döner.
    await act(async () => fireEvent.keyDown(window, { key: "PageDown" }));
    expect(screen.getByRole("img", { name: /Yağmurlu cam/ })).toBeInTheDocument();
    await act(async () => fireEvent.keyDown(window, { key: "PageUp" }));
    expect(screen.getByRole("img", { name: /Sarmal gökada/ })).toBeInTheDocument();
    await act(async () => fireEvent.keyDown(window, { key: "1" }));
    // Sondaki MilkDrop sahnesi: klasör seçilmemişken açıklama ve "Klasör seç" (hazır görsel yok).
    await act(async () => fireEvent.keyDown(window, { key: "PageUp" }));
    expect(
      await screen.findByText("MilkDrop görsellerinizin (.milk) bulunduğu klasörü seçin."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Lyraska hazır görsel içermez/)).toBeInTheDocument();
    // MilkDrop'tan önce "Kendi resmin" (resim seçilmemişken "Resim seç…").
    await act(async () => fireEvent.keyDown(window, { key: "PageUp" }));
    expect(screen.getByRole("img", { name: "Şarkıyla oynayan ışık çizgisi" })).toBeInTheDocument();
    await act(async () => fireEvent.keyDown(window, { key: "PageUp" }));
    expect(screen.getByRole("img", { name: /Yağmurlu cam/ })).toBeInTheDocument();
    await act(async () => fireEvent.keyDown(window, { key: "PageDown" }));
    await act(async () => fireEvent.keyDown(window, { key: "PageDown" }));
    await act(async () => fireEvent.keyDown(window, { key: "PageDown" }));
    expect(screen.getByRole("button", { name: "Gece göğü" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await act(async () => fireEvent.keyDown(window, { key: "6" }));
    expect(screen.getByRole("img", { name: /Bulutsu/ })).toBeInTheDocument();
    // Klasik sahneye dönünce galeri düğmesi yeniden "Galeri".
    await act(async () => fireEvent.keyDown(window, { key: "1" }));
    expect(screen.getByRole("button", { name: /Galeri/ })).not.toHaveClass("is-on");
  });

  it("Kendi resmin: başlık etiketi olmayan şarkıda dosya adı yazar (Lyraska değil)", async () => {
    backend.desktop = true;
    window.localStorage.setItem("lyraska.scene", "photo");
    backend.status = {
      ...playing,
      track: { ...track, title: null, artist: null, fileName: "Kaybolan Yıllar (Canlı)" },
    };
    render(<App />);
    // Durum bir komutla gelir (çal/duraklat).
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    const title = await waitFor(() => {
      const el = document.querySelector(".photo-scene__title");
      expect(el?.textContent).toMatch(/KAYBOLAN YILLAR/);
      return el;
    });
    expect(title?.textContent).not.toMatch(/LYRASKA/);
  });

  it("galeri listesi açılınca seçili sahneye odaklanır; seçimden sonra odak düğmeye döner", async () => {
    window.localStorage.setItem("lyraska.scene", "tunnel");
    render(<App />);
    const toggle = screen.getByRole("button", { name: /Işık tüneli/ });
    // Düğme bir açılır liste düğmesidir: basılı/basılı değil durumu taşımaz.
    expect(toggle).not.toHaveAttribute("aria-pressed");
    await act(async () => fireEvent.click(toggle));
    const list = screen.getByRole("group", { name: "Galeri" });
    expect(document.activeElement).toBe(within(list).getByRole("button", { name: /Işık tüneli/ }));
    await act(async () =>
      fireEvent.click(within(list).getByRole("button", { name: /Yağmurlu cam/ })),
    );
    // Seçilen düğme kaybolur; odak gövdeye düşmez, galeri düğmesine döner.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Yağmurlu cam/ }));
  });

  it("PageDown basılı tutulunca sahneler art arda değişmez (tekrar eden tuş yok sayılır)", async () => {
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { key: "PageDown" }));
    expect(window.localStorage.getItem("lyraska.scene")).toBe("highway");
    for (let i = 0; i < 5; i++) {
      await act(async () => fireEvent.keyDown(window, { key: "PageDown", repeat: true }));
    }
    expect(window.localStorage.getItem("lyraska.scene")).toBe("highway");
  });

  it("galeri: görünüm (hız, palet) ve hazır ayarlar; kullanıcı ayarı kaydedilir ve silinir", async () => {
    const { unmount } = render(<App />);
    await act(async () => fireEvent.keyDown(window, { key: "0" }));
    const galaxy = () => screen.getByRole("img", { name: /Sarmal gökada/ });
    // jsdom'da WebGL yok: görünüm tuvalin veri özniteliklerinden okunur.
    expect(galaxy()).toHaveAttribute("data-speed", "1");
    expect(galaxy()).toHaveAttribute("data-palette", "theme");

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Sarmal gökada/ })));
    const look = screen.getByRole("group", { name: "Görünüm: Sarmal gökada" });
    const palettes = within(look).getByRole("group", { name: "Renk paleti" });
    expect(within(palettes).getAllByRole("button")).toHaveLength(5);
    expect(within(palettes).getByRole("button", { name: "Bölüm teması" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await act(async () => fireEvent.click(within(palettes).getByRole("button", { name: "Kor" })));
    expect(galaxy()).toHaveAttribute("data-palette", "ember");
    expect(within(palettes).getByRole("button", { name: "Kor" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const speed = within(look).getByRole("slider", { name: "Hareket hızı" });
    expect(speed).toHaveAttribute("aria-valuetext", "1×");
    await act(async () => fireEvent.change(speed, { target: { value: "1.5" } }));
    expect(galaxy()).toHaveAttribute("data-speed", "1.5");
    expect(speed).toHaveAttribute("aria-valuetext", "1,5×");
    // Görünüm değişince liste açık kalır; sahnenin görünümü hatırlanır.
    expect(screen.getByRole("group", { name: "Galeri" })).toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem("lyraska.sceneLooks") ?? "{}").looks.galaxy,
    ).toEqual({
      speed: 1.5,
      palette: "ember",
    });

    // Hazır ayar: sahne ve görünüm tek tıkla.
    const presets = screen.getByRole("group", { name: "Hazır ayarlar" });
    await act(async () =>
      fireEvent.click(within(presets).getByRole("button", { name: /^Kor ateşi/ })),
    );
    const nebula = screen.getByRole("img", { name: /Bulutsu/ });
    expect(nebula).toHaveAttribute("data-speed", "0.8");
    expect(nebula).toHaveAttribute("data-palette", "ember");
    expect(within(presets).getByRole("button", { name: /^Kor ateşi/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(window.localStorage.getItem("lyraska.scene")).toBe("nebula");
    // Programla gelen hazır ayar silinemez.
    expect(within(presets).queryByRole("button", { name: /hazır ayarını sil/ })).toBeNull();

    // Kaydet: ad girilir; Esc yalnızca ad girmeyi bırakır.
    await act(async () => fireEvent.click(within(presets).getByRole("button", { name: "Kaydet" })));
    let name = within(presets).getByRole("textbox", { name: "Hazır ayarın adı" });
    expect(name).toHaveValue("Bulutsu · Kor · 0,8×");
    await act(async () => fireEvent.keyDown(name, { key: "Escape" }));
    expect(within(presets).queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("group", { name: "Galeri" })).toBeInTheDocument();
    await act(async () => fireEvent.click(within(presets).getByRole("button", { name: "Kaydet" })));
    name = within(presets).getByRole("textbox", { name: "Hazır ayarın adı" });
    await act(async () => fireEvent.change(name, { target: { value: "  Benim   bulutum " } }));
    await act(async () => fireEvent.click(within(presets).getByRole("button", { name: "Kaydet" })));
    expect(within(presets).getByRole("status")).toHaveTextContent('"Benim bulutum" kaydedildi.');
    const stored = JSON.parse(window.localStorage.getItem("lyraska.scenePresets") ?? "{}");
    expect(stored.presets).toEqual([
      expect.objectContaining({
        name: "Benim bulutum",
        scene: "nebula",
        speed: 0.8,
        palette: "ember",
      }),
    ]);

    // Başka bir hazır ayardan sonra kullanıcınınki yine aynı görünümü kurar.
    await act(async () =>
      fireEvent.click(within(presets).getByRole("button", { name: /^Buzlu gökada/ })),
    );
    expect(galaxy()).toHaveAttribute("data-speed", "0.6");
    expect(galaxy()).toHaveAttribute("data-palette", "ice");
    await act(async () =>
      fireEvent.click(within(presets).getByRole("button", { name: /^Benim bulutum/ })),
    );
    expect(screen.getByRole("img", { name: /Bulutsu/ })).toHaveAttribute("data-palette", "ember");

    // Kapatıp yeniden açınca görünümler ve hazır ayarlar hatırlanır.
    unmount();
    render(<App />);
    expect(screen.getByRole("img", { name: /Bulutsu/ })).toHaveAttribute("data-speed", "0.8");
    await act(async () => fireEvent.keyDown(window, { key: "0" }));
    expect(galaxy()).toHaveAttribute("data-palette", "ice");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Sarmal gökada/ })));
    const again = screen.getByRole("group", { name: "Hazır ayarlar" });
    await act(async () =>
      fireEvent.click(
        within(again).getByRole("button", { name: '"Benim bulutum" hazır ayarını sil' }),
      ),
    );
    expect(within(again).queryByRole("button", { name: /^Benim bulutum/ })).toBeNull();
    expect(within(again).getByRole("status")).toHaveTextContent('"Benim bulutum" silindi.');
    expect(JSON.parse(window.localStorage.getItem("lyraska.scenePresets") ?? "{}").presets).toEqual(
      [],
    );
    // Klasik sahnede görünüm bölümü ve "Kaydet" yok, hazır ayarlar var.
    await act(async () =>
      fireEvent.keyDown(screen.getByRole("group", { name: "Galeri" }), { key: "Escape" }),
    );
    await act(async () => fireEvent.keyDown(window, { key: "1" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Galeri/ })));
    expect(screen.queryByRole("group", { name: /Görünüm/ })).toBeNull();
    expect(screen.getByRole("group", { name: "Hazır ayarlar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kaydet" })).toBeNull();
  });

  it("1–5 tuşları sahne seçer; arama kutusuna yazarken seçmez", async () => {
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { key: "3" }));
    expect(screen.getByRole("img", { name: "Sol kanal VU ölçer" })).toBeInTheDocument();
    await act(async () => fireEvent.keyDown(window, { key: "4" }));
    const spectrum = screen.getByRole("button", { name: "Spektrum" });
    expect(spectrum).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("lyraska.scene")).toBe("spectrum");
    const search = screen.getByRole("searchbox", { name: "Kütüphanede ara" });
    await act(async () => fireEvent.keyDown(search, { key: "3" }));
    expect(spectrum).toHaveAttribute("aria-pressed", "true");
  });

  it("gece göğü: WebGL2 yoksa durgun gök gösterir ve nedeni yazar", async () => {
    // jsdom'da WebGL yok: tuval bağlamı alınamaz, sahne çökmeden durgun göğe düşer.
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => null);
    window.localStorage.setItem("lyraska.scene", "vu");
    render(<App />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Gece göğü" })));
    const sky = screen.getByRole("img", { name: /Gece göğü/ });
    expect(sky).toHaveAttribute("data-webgl", "off");
    // Neden tuvale işlenir ve hata günlüğüne yazılır (kullanıcı bize iletebilir).
    expect(sky.dataset.webglError).toMatch(/WebGL2 açılamadı/);
    expect(getContext).toHaveBeenCalledWith("webgl2", expect.anything());
    expect(window.localStorage.getItem("lyraska.scene")).toBe("sky");
    getContext.mockRestore();
  });

  it("gece otoyolu: WebGL2 yoksa durgun görüntü kalır", async () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => null);
    render(<App />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Gece otoyolu" })));
    const road = screen.getByRole("img", { name: /Gece otoyolu/ });
    expect(road).toHaveAttribute("data-webgl", "off");
    expect(road.dataset.webglError).toMatch(/WebGL2 açılamadı/);
    expect(window.localStorage.getItem("lyraska.scene")).toBe("highway");
    getContext.mockRestore();
  });

  it("otoyol görsel veriden vuruşu ve Yönetmen notunu alır", async () => {
    const { highwayInput } = await import("./HighwayScene");
    const base = {
      positionSecs: 1,
      bands: Array(32).fill(0.8),
      rmsDb: [-20, -20] as [number, number],
      peakDb: [-6, -6] as [number, number],
      vuReferenceDb: null,
      energy: null,
      section: null,
    };
    expect(highwayInput({ ...base, beat: null, director: null })).toMatchObject({
      beat: null,
      director: null,
    });
    const input = highwayInput({
      ...base,
      beat: { bpm: 128, index: 3, phase: 0.25, barBeat: 4, meter: 4 },
      director: {
        atmosphere: { section: 1, theme: 2, mood: 0.7, warmth: 0.5 },
        rhythm: {
          pulse: 0,
          accent: 0,
          beatPhase: 0.25,
          barPhase: 0.81,
          anticipation: 0.4,
          release: 0,
          barsConfident: true,
        },
        texture: { detail: 0.5, motion: 0.6 },
      },
    });
    expect(input.beat).toEqual({ bpm: 128, phase: 0.25 });
    expect(input.director).toEqual({
      mood: 0.7,
      theme: 2,
      barPhase: 0.81,
      anticipation: 0.4,
      release: 0,
      motion: 0.6,
    });
    expect(input.energies[0]).toBeCloseTo(1, 5);
  });

  it("epilepsi güvenli modu ayarlarda açılır, kaydedilir ve ekranda belirtilir", async () => {
    backend.safe = false;
    backend.desktop = true;
    backend.status = playing;
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ayarlar" })));
    const toggle = await screen.findByRole("button", { name: /Epilepsi güvenli modu: Kapalı/ });
    expect(screen.queryByText("Güvenli mod")).not.toBeInTheDocument();
    await act(async () => fireEvent.click(toggle));
    expect(backend.setSafe).toHaveBeenCalledWith(true);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveTextContent("Açık");
    expect(screen.getByText("Güvenli mod")).toBeInTheDocument();
    backend.safe = false;
  });

  it("VU ölçerler sese göre ilerler, susunca dinlenmeye döner", async () => {
    const { stepMeters } = await import("./VuScene");
    const frame = {
      positionSecs: 1,
      bands: [],
      rmsDb: [-14, -60] as [number, number],
      peakDb: [-3, -60] as [number, number],
      vuReferenceDb: -14,
      beat: null,
      energy: null,
      section: null,
      director: null,
    };
    let meters: Parameters<typeof stepMeters>[0] = {
      needles: [
        { position: 0, velocity: 0 },
        { position: 0, velocity: 0 },
      ],
      lamps: [0, 0],
    };
    for (let i = 0; i < 90; i++) meters = stepMeters(meters, frame, 1 / 60);
    // Sol kanal şarkının referans seviyesinde: 0 VU (ölçeğin ~%71'i). Sağ kanal sessiz.
    expect(meters.needles[0].position).toBeCloseTo(0.708, 2);
    expect(meters.needles[1].position).toBe(0);
    for (let i = 0; i < 90; i++) meters = stepMeters(meters, null, 1 / 60);
    expect(meters.needles[0].position).toBeLessThan(0.01);
  });

  it("VU'nun kırmızı ışığı güvenli modda bir saniye, varsayılanda yarım saniye yanık kalır", async () => {
    const { stepMeters, AT_REST } = await import("./VuScene");
    const { stepDash, DASH_AT_REST } = await import("./DriveScene");
    const { STAGE_LIGHT_AT_REST } = await import("../lib/stageLight");
    const { LAMP_HOLD_SECONDS, SAFE_LAMP_HOLD_SECONDS } = await import("../lib/vu");
    const hot = {
      positionSecs: 1,
      bands: [],
      rmsDb: [0, 0] as [number, number],
      peakDb: [0, 0] as [number, number],
      vuReferenceDb: -14,
      beat: null,
      energy: null,
      section: null,
      director: null,
    };
    let normal = AT_REST;
    let safe = AT_REST;
    for (let i = 0; i < 60; i++) {
      normal = stepMeters(normal, hot, 1 / 60);
      safe = stepMeters(safe, hot, 1 / 60, true);
    }
    expect(normal.lamps).toEqual([LAMP_HOLD_SECONDS, LAMP_HOLD_SECONDS]);
    expect(safe.lamps).toEqual([SAFE_LAMP_HOLD_SECONDS, SAFE_LAMP_HOLD_SECONDS]);
    // "Gece sürüşü"nün torpidosundaki VU da aynı kurala uyar.
    let dash = DASH_AT_REST;
    for (let i = 0; i < 60; i++) dash = stepDash(dash, hot, 1 / 60, STAGE_LIGHT_AT_REST, true);
    expect(dash.meters.lamps).toEqual([SAFE_LAMP_HOLD_SECONDS, SAFE_LAMP_HOLD_SECONDS]);
  });
});

describe("senkron", () => {
  it("sekmede ses gecikmesi ayarlanır ve vuruş göstergesi görünür", async () => {
    render(<App />);
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Senkron" })));
    const slider = screen.getByRole("slider", { name: "Ses gecikmesi" });
    expect(slider).toHaveValue("0");
    await act(async () => fireEvent.change(slider, { target: { value: "185" } }));
    expect(screen.getByText("185 ms")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "10 ms artır" })));
    expect(screen.getByText("195 ms")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sıfırla" })));
    expect(screen.getByText("0 ms")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Vuruş göstergesi" })).toBeInTheDocument();
    // Tarayıcı önizlemesinde ses çalınamaz: ölçüm başlatılamaz.
    expect(screen.getByRole("button", { name: "Ölçümü başlat" })).toBeDisabled();
  });
});

describe("kör test", () => {
  it("başlayınca çalan şarkı ekrandan kalkar, bitince kaldığı yerde geri gelir", async () => {
    backend.desktop = true;
    backend.pick.mockResolvedValue("C:\\Müzik\\gece.flac");
    render(<App />);
    const open = screen.getByRole("button", { name: /Dosya aç/ });
    await waitFor(() => expect(open).toBeEnabled());
    backend.status = playing;
    await act(async () => fireEvent.click(open));
    const title = { level: 1, name: "Gece Otoyolu" } as const;
    await screen.findByRole("heading", title);

    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Kör test" })));
    backend.abxPicks = ["C:\\Müzik\\gece.flac", "C:\\Müzik\\gece.mp3"];
    fireEvent.click(screen.getByRole("button", { name: "A dosyasını seç" }));
    await screen.findByText("gece.flac");
    fireEvent.click(screen.getByRole("button", { name: "B dosyasını seç" }));
    await screen.findByText("gece.mp3");
    fireEvent.click(screen.getByRole("button", { name: "Testi başlat" }));
    await screen.findByText(/Deneme 1 \/ 16/);
    await waitFor(() => expect(screen.queryByRole("heading", title)).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Testi bitir" }));
    await screen.findByRole("button", { name: "Testi başlat" });
    await screen.findByRole("heading", title, { timeout: 2000 });
    expect(screen.getByRole("button", { name: /Çal/ })).toBeEnabled();
  });
});

describe("şarkı haritası ve bilgi kartları", () => {
  it("şeritte bölümleri ve drop'ları gösterir, drop yaklaşınca geri sayar", async () => {
    backend.desktop = true;
    backend.status = {
      ...playing,
      state: "paused",
      bpm: 128,
      output: {
        deviceName: "Hoparlörler",
        sampleRate: 48000,
        channels: 2,
        resampled: true,
        normalizationDb: null,
        bitPerfect: false,
        bitDepth: null,
        notice: null,
      },
    };
    backend.songMap = {
      meter: 4,
      downbeatPhase: 0,
      grouping: [],
      meterConfidence: 0.9,
      downbeats: [],
      sections: [
        { start: 0, end: 60, energy: 0.3, label: 0 },
        { start: 60, end: 150, energy: 0.9, label: 1 },
        { start: 150, end: 225, energy: 0.5, label: 0 },
      ],
      drops: [60, 100],
      dropConfidence: [0.9, 0.85],
      energy: [],
    };
    // Şarkı La minör; ikinci bölümde ton Re majöre değişiyor.
    backend.songKey = {
      key: { tonic: 9, minor: true, confidence: 0.8, camelot: 8 },
      sections: [null, { tonic: 2, minor: false, confidence: 0.7, camelot: 10 }, null],
    };
    const { container } = render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    const sections = () => [
      ...container.querySelectorAll(".songmap__layer--future .songmap__section"),
    ];
    await waitFor(() => expect(sections()).toHaveLength(3));
    // Benzer bölümler (aynı etiket) aynı renk temasını alır.
    const [first, second, third] = sections().map((e) => e.className);
    expect(first).toBe(third);
    expect(first).not.toBe(second);
    expect(container.querySelectorAll(".songmap__drop")).toHaveLength(2);
    // 83,4. saniyede sıradaki drop 100. saniyede: 17 saniye kala sayaç görünür.
    expect(screen.getByText("Drop yaklaşıyor")).toBeInTheDocument();
    expect(screen.getByText("17 saniye sonra")).toBeInTheDocument();
    expect(screen.getByText("128 BPM · 4/4")).toBeInTheDocument();
    expect(screen.getByText("FLAC 44,1 → 48 kHz")).toBeInTheDocument();
    // 83,4 sn ikinci bölümde: tonu değişen bölümün tonu vurgulu gösterilir.
    const keyChip = await screen.findByText("10B · Re majör");
    expect(keyChip).toHaveClass("is-on");
    expect(keyChip).toHaveAttribute("title", expect.stringContaining("ton değişiyor"));
    // Arayüzün vurgu renkleri çalan bölümün temasında (83,4 sn: ikinci bölüm, etiket 1).
    expect(container.querySelector("main")).toHaveAttribute("data-theme", "1");
  });

  it("aksak ölçü bilgi kartında gruplamasıyla, belirsiz ölçü hiç görünmez", async () => {
    backend.desktop = true;
    backend.status = { ...playing, state: "paused", bpm: 120 };
    const map = {
      meter: 4,
      downbeatPhase: 0,
      grouping: [2, 2, 2, 3],
      meterConfidence: 0.9,
      downbeats: [],
      sections: [{ start: 0, end: 225, energy: 0.5, label: 0 }],
      drops: [],
      dropConfidence: [],
      energy: [],
    };
    backend.songMap = map;
    const { unmount } = render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    expect(await screen.findByText("120 BPM · 9/8 (2+2+2+3)")).toBeInTheDocument();
    unmount();

    backend.songMap = { ...map, grouping: [], meterConfidence: 0.2 };
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    expect(await screen.findByText("120 BPM")).toBeInTheDocument();
  });

  it("güveni düşük drop için sayaç görünmez", async () => {
    backend.desktop = true;
    backend.status = { ...playing, bpm: 128 };
    backend.songMap = {
      meter: 4,
      downbeatPhase: 0,
      grouping: [],
      meterConfidence: 0.9,
      downbeats: [],
      sections: [{ start: 0, end: 225, energy: 0.6, label: 0 }],
      // 100. saniyedeki "drop" şüpheli (küçük bir bas artışı): "drop yaklaşıyor" denmez.
      drops: [100],
      dropConfidence: [0.2],
      energy: [],
    };
    const { container } = render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await waitFor(() => expect(container.querySelector(".songmap")).toBeInTheDocument());
    expect(screen.getByText("128 BPM · 4/4")).toBeInTheDocument();
    expect(screen.queryByText("Drop yaklaşıyor")).not.toBeInTheDocument();
    // Şerit de onu drop diye işaretlemez: ekranın her yeri aynı droplara bakar.
    expect(container.querySelector(".songmap__drop")).toBeNull();
    expect(screen.queryByText("DROP")).not.toBeInTheDocument();
  });

  it("analiz bitmeden şerit düz çubuktur, sayaç görünmez", async () => {
    backend.desktop = true;
    backend.status = { ...playing, state: "paused" };
    const { container } = render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await waitFor(() => expect(container.querySelector(".seekbar__line")).toBeInTheDocument());
    expect(container.querySelector(".songmap")).not.toBeInTheDocument();
    expect(screen.queryByText("Drop yaklaşıyor")).not.toBeInTheDocument();
  });

  it("çalma hatası başlığın altında gösterilir", async () => {
    backend.desktop = true;
    backend.status = { ...playing, state: "error", error: "Ses aygıtı bulunamadı." };
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ses aygıtı bulunamadı.");
    expect(screen.getByText("Çalınamadı")).toBeInTheDocument();
  });
});

describe("sinema görünümü", () => {
  afterEach(() => vi.useRealTimers());

  it("çalarken fare kıpırdamazsa düğmeler çekilir, kıpırdayınca geri gelir", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    backend.desktop = true;
    backend.status = playing;
    const { container } = render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    const app = container.querySelector(".app")!;
    // Çekmece açıkken çekilmez.
    await act(async () => vi.advanceTimersByTime(5000));
    expect(app).not.toHaveClass("is-cinema");
    await act(async () => fireEvent.keyDown(window, { key: "Escape" }));
    await act(async () => vi.advanceTimersByTime(3000));
    expect(app).not.toHaveClass("is-cinema");
    await act(async () => vi.advanceTimersByTime(1100));
    expect(app).toHaveClass("is-cinema");
    await act(async () => fireEvent.pointerMove(window));
    expect(app).not.toHaveClass("is-cinema");
  });

  it("klavyeyle (Tab) seçilen düğme görünür kalır; fareyle tıklanınca düğmeler yine çekilir (#53)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    backend.desktop = true;
    backend.status = playing;
    const { container } = render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await act(async () => fireEvent.keyDown(window, { key: "Escape" }));
    const app = container.querySelector(".app")!;
    const pause = screen.getByRole("button", { name: "Duraklat" });
    // Tab ile Duraklat'a gelindi.
    await act(async () => {
      fireEvent.keyDown(window, { key: "Tab" });
      pause.focus();
    });
    await act(async () => vi.advanceTimersByTime(4300));
    expect(app).not.toHaveClass("is-cinema");
    // Fareyle tıklandı: odak düğmede kalsa da düğmeler çekilir.
    await act(async () => {
      fireEvent.pointerDown(pause);
      fireEvent.pointerUp(pause);
    });
    await act(async () => vi.advanceTimersByTime(4300));
    expect(app).toHaveClass("is-cinema");
  });
});

describe("ilerleme çubuğunda sürükleme (#53)", () => {
  const bar = (durationSecs: number | null, onSeek = vi.fn()) => (
    <SeekBar positionSecs={30} durationSecs={durationSecs} disabled={false} onSeek={onSeek} />
  );

  it("sürüklerken şarkının süresi bilinmez olsa da bırakınca sürükleme biter", () => {
    const onSeek = vi.fn();
    const { container, rerender } = render(bar(180, onSeek));
    const slider = screen.getByRole("slider");
    slider.getBoundingClientRect = () => ({ left: 0, width: 180 }) as DOMRect;
    fireEvent.pointerDown(slider, { button: 0, clientX: 90, pointerId: 1 });
    // Boşluksuz geçişle süresi bilinmeyen bir şarkıya geçildi.
    rerender(bar(null, onSeek));
    fireEvent.pointerUp(slider, { button: 0, clientX: 120, pointerId: 1 });
    rerender(bar(200, onSeek));
    expect(container.querySelector(".seekbar")).not.toHaveClass("is-dragging");
    // Bırakma, sürüklemenin başladığı şarkıda değil: yeni şarkı sarılmaz.
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("işaretçi yakalaması kaybolunca sürükleme biter, sarılmaz", () => {
    const onSeek = vi.fn();
    const { container } = render(bar(180, onSeek));
    const slider = screen.getByRole("slider");
    slider.getBoundingClientRect = () => ({ left: 0, width: 180 }) as DOMRect;
    fireEvent.pointerDown(slider, { button: 0, clientX: 90, pointerId: 1 });
    expect(container.querySelector(".seekbar")).toHaveClass("is-dragging");
    fireEvent.lostPointerCapture(slider, { pointerId: 1 });
    expect(container.querySelector(".seekbar")).not.toHaveClass("is-dragging");
    fireEvent.pointerMove(slider, { clientX: 150, pointerId: 1 });
    expect(container.querySelector(".seekbar")).not.toHaveClass("is-dragging");
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("aynı şarkıda bırakınca bırakılan yere atlar", () => {
    const onSeek = vi.fn();
    render(bar(180, onSeek));
    const slider = screen.getByRole("slider");
    slider.getBoundingClientRect = () => ({ left: 0, width: 180 }) as DOMRect;
    fireEvent.pointerDown(slider, { button: 0, clientX: 90, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 120, pointerId: 1 });
    fireEvent.pointerUp(slider, { button: 0, clientX: 120, pointerId: 1 });
    expect(onSeek).toHaveBeenCalledWith(120);
  });
});

describe("pointerRatio", () => {
  it("işaretçi konumunu 0..1 aralığına çevirir", () => {
    expect(pointerRatio(150, 100, 200)).toBe(0.25);
    expect(pointerRatio(50, 100, 200)).toBe(0);
    expect(pointerRatio(400, 100, 200)).toBe(1);
    expect(pointerRatio(10, 0, 0)).toBe(0);
  });
});

describe("stateLabel", () => {
  it("başlığın üstünde çalma durumunu yazar", () => {
    expect(stateLabel({ ...playing, track: null, state: "idle" })).toBe("Hoş geldiniz");
    expect(stateLabel(playing)).toBe("Şimdi çalıyor");
    expect(stateLabel({ ...playing, state: "paused" })).toBe("Duraklatıldı");
    // Durdur düğmesi başa sarıp duraklatır.
    expect(stateLabel({ ...playing, state: "paused", positionSecs: 0 })).toBe("Durduruldu");
    expect(stateLabel({ ...playing, state: "ended" })).toBe("Bitti");
    expect(stateLabel({ ...playing, state: "error" })).toBe("Çalınamadı");
  });
});

describe("marqueeWindow", () => {
  const source = textToColumns("AB");

  it("istenen genişlikte pencere döndürür", () => {
    expect(marqueeWindow(source, 0, 20)).toHaveLength(20);
  });

  it("başlangıçta ekran boştur, metin sağdan girer", () => {
    const view = marqueeWindow(source, 0, 20);
    expect(view.every((column) => column.every((dot) => !dot))).toBe(true);
  });

  it("ekran genişliği kadar kaydırınca metnin başı solda görünür", () => {
    expect(marqueeWindow(source, 20, 20)[0]).toEqual(source[0]);
  });

  it("döngüsel olarak tekrar eder", () => {
    const cycle = source.length + 20;
    expect(marqueeWindow(source, 5, 20)).toEqual(marqueeWindow(source, 5 + cycle, 20));
  });
});

describe("spectrumColumns", () => {
  it("seviyeyi alttan yukarı doğru doldurur ve tepe noktasını işaretler", () => {
    const columns = spectrumColumns([0.5], [1], 10);
    expect(columns).toHaveLength(2); // tek bant, iki sütun genişliğinde
    const column = columns[0]!;
    expect(column.filter(Boolean)).toHaveLength(6); // 5 seviye + 1 tepe
    expect(column[0]).toBe(true); // tepe en üstte
    expect(column[9]).toBe(true); // en alt yanık
    expect(column[4]).toBe(false);
  });

  it("aralık dışı değerleri sınırlar", () => {
    const [column] = spectrumColumns([2, -1], [0, 0], 4);
    expect(column!.every(Boolean)).toBe(true);
  });
});

describe("parametrik ekolayzer", () => {
  const openParametric = async () => {
    render(<App />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ekolayzer" })));
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: /Parametrik/ })));
    return screen.getByRole("region", { name: "Parametrik ekolayzer" });
  };
  const lastSent = () =>
    backend.setParametric.mock.calls.at(-1)?.[0] as
      import("../lib/backend").ParametricSettings | undefined;

  it("seçili bandın kutularıyla ayarlanır, çekirdeğe gider ve grafikte görünür", async () => {
    const panel = await openParametric();
    // Düz beş bant; grafikte beş düğüm.
    expect(within(panel).getAllByRole("button", { name: /^Bant \d:/ })).toHaveLength(5);
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: /^3 · PK/ })));
    const gain = within(panel).getByRole("textbox", { name: "Kazanç" });
    fireEvent.change(gain, { target: { value: "+4,5" } });
    await act(async () => fireEvent.keyDown(gain, { key: "Enter" }));
    expect(lastSent()?.bands[2]?.gainDb).toBe(4.5);
    expect(
      within(panel).getByRole("button", { name: "Bant 3: Tepe / çukur, 1 kHz, +4,5 dB, Q 1" }),
    ).toBeInTheDocument();
    // Frekans "k" ekiyle ve Türkçe virgülle yazılabilir; Q da.
    const freq = within(panel).getByRole("textbox", { name: "Frekans" });
    fireEvent.change(freq, { target: { value: "2,5k" } });
    await act(async () => fireEvent.keyDown(freq, { key: "Enter" }));
    const q = within(panel).getByRole("textbox", { name: "Q" });
    fireEvent.change(q, { target: { value: "2,2" } });
    await act(async () => fireEvent.blur(q));
    expect(lastSent()?.bands[2]).toMatchObject({ freqHz: 2500, gainDb: 4.5, q: 2.2 });
    // Tür değişince kazanç kutusu kazancı olmayan türde kapanır.
    await act(async () =>
      fireEvent.change(within(panel).getByRole("combobox", { name: "Tür" }), {
        target: { value: "lowPass" },
      }),
    );
    expect(within(panel).getByRole("textbox", { name: "Kazanç" })).toBeDisabled();
    expect(lastSent()?.bands[2]?.kind).toBe("lowPass");
  });

  it("klavyeyle frekans, kazanç, Q ayarlanır; Delete bandı siler; kısayollar şarkıyı sarmaz", async () => {
    backend.status = playing;
    const panel = await openParametric();
    const node = within(panel).getByRole("button", { name: /^Bant 2:/ });
    await act(async () => node.focus());
    await act(async () => fireEvent.keyDown(node, { key: "ArrowUp" }));
    expect(lastSent()?.bands[1]?.gainDb).toBe(0.5);
    await act(async () => fireEvent.keyDown(node, { key: "ArrowUp", shiftKey: true }));
    expect(lastSent()?.bands[1]?.gainDb).toBe(0.6);
    await act(async () => fireEvent.keyDown(node, { key: "ArrowRight" }));
    expect(lastSent()?.bands[1]?.freqHz).toBeGreaterThan(250);
    await act(async () => fireEvent.keyDown(node, { key: "PageUp" }));
    expect(lastSent()?.bands[1]?.q).toBeCloseTo(1.06, 2);
    expect(backend.seek).not.toHaveBeenCalled();
    await act(async () => fireEvent.keyDown(node, { key: "Delete" }));
    expect(lastSent()?.bands).toHaveLength(4);
  });

  it("düğüm sürüklenince frekans ve kazanç değişir; boş yere çift tıklayınca bant eklenir", async () => {
    const panel = await openParametric();
    const plot = panel.querySelector(".peq__plot") as HTMLDivElement;
    plot.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1000, height: 360, right: 1000, bottom: 360 }) as DOMRect;
    const node = within(panel).getByRole("button", { name: /^Bant 3:/ });
    await act(async () =>
      fireEvent.pointerDown(node, { button: 0, clientX: 500, clientY: 180, pointerId: 1 }),
    );
    // Sağa bir oktav kadar (1000/ log2(1000) ≈ 100 piksel), yukarı 60 piksel (±18 dB'de 6 dB).
    await act(async () =>
      fireEvent.pointerMove(node, { clientX: 600.3, clientY: 120, pointerId: 1 }),
    );
    await act(async () => fireEvent.pointerUp(node, { pointerId: 1 }));
    const band = lastSent()?.bands[2];
    expect(band?.freqHz).toBeGreaterThan(1950);
    expect(band?.freqHz).toBeLessThan(2050);
    expect(band?.gainDb).toBe(6);
    // Çift tıklama: yeni tepe bandı ve seçili.
    await act(async () => fireEvent.doubleClick(plot, { clientX: 250, clientY: 240 }));
    expect(lastSent()?.bands).toHaveLength(6);
    expect(lastSent()?.bands[5]).toMatchObject({ kind: "peaking", gainDb: -6 });
    expect(within(panel).getByRole("button", { name: /^Bant 6:/ })).toHaveClass("is-selected");
  });

  it("A/B karşılaştırma ekolayzersiz ve eşit yükseklikte dinletir; dosyadan yükler ve kaydeder", async () => {
    const panel = await openParametric();
    const compare = within(panel).getByRole("button", { name: "A/B karşılaştır" });
    expect(compare).toBeDisabled();
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: /^1 · LS/ })));
    const gain = within(panel).getByRole("textbox", { name: "Kazanç" });
    fireEvent.change(gain, { target: { value: "3" } });
    await act(async () => fireEvent.keyDown(gain, { key: "Enter" }));
    await act(async () => fireEvent.click(compare));
    expect(backend.parametricCompare).toHaveBeenCalledWith(true);
    expect(
      within(panel).getByRole("button", { name: "Karşılaştırma: ekolayzersiz" }),
    ).toHaveAttribute("aria-pressed", "true");
    await act(async () =>
      fireEvent.click(within(panel).getByRole("button", { name: "Dosyadan yükle" })),
    );
    expect(backend.parametricImport).toHaveBeenCalledWith("C:/eq/HD 600 ParametricEQ.txt");
    expect(within(panel).getAllByRole("button", { name: /^Bant \d:/ })).toHaveLength(2);
    expect(within(panel).getByRole("button", { name: "Equalizer APO ile aynı" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await act(async () =>
      fireEvent.click(within(panel).getByRole("button", { name: "Dosyaya kaydet" })),
    );
    expect(backend.parametricExport).toHaveBeenCalled();
  });
});

describe("kulaklık düzeltmesi", () => {
  afterEach(() => {
    backend.headphone = null;
    backend.pickProfile.mockReset();
    backend.importProfile.mockReset();
  });

  it("AutoEq profili yüklenir, açılıp kapanır ve kaldırılır", async () => {
    backend.pickProfile.mockResolvedValue("C:\\İndirilenler\\Sennheiser HD 600 ParametricEQ.txt");
    render(<App />);
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: /Ekolayzer/ })));
    expect(screen.getByText(/autoeq\.app/)).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Profil yükle" })));
    expect(backend.importProfile).toHaveBeenCalledWith(
      "C:\\İndirilenler\\Sennheiser HD 600 ParametricEQ.txt",
    );
    expect(screen.getByText("Sennheiser HD 600")).toBeInTheDocument();
    expect(screen.getByText(/1 filtre · ön kazanç −6,4 dB/)).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: "Kulaklık düzeltmesi" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await act(async () => fireEvent.click(toggle));
    expect(screen.getByRole("switch", { name: "Kulaklık düzeltmesi" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Kaldır" })));
    expect(screen.queryByText("Sennheiser HD 600")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Profil yükle" })).toBeInTheDocument();
  });

  it("vazgeçilirse bir şey olmaz; bozuk dosyada anlaşılır hata gösterir", async () => {
    render(<App />);
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: /Ekolayzer/ })));
    backend.pickProfile.mockResolvedValue(null);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Profil yükle" })));
    expect(backend.importProfile).not.toHaveBeenCalled();

    backend.pickProfile.mockResolvedValue("C:\\bozuk.txt");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Profil yükle" })));
    expect(screen.getByText(/kulaklık düzeltmesi bulunamadı/)).toBeInTheDocument();
  });
});

describe("şarkı haritası dosyası", () => {
  afterEach(() => {
    backend.desktop = false;
    backend.status = null;
    backend.importedMap = null;
    backend.mapPick = "C:/İndirilenler/gece.harita.json";
    backend.mapExport.mockReset();
    backend.mapImport.mockReset();
    backend.mapRemove.mockReset();
    backend.songMapAsked.mockReset();
  });

  const openStrip = async () => {
    backend.desktop = true;
    backend.status = playing;
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "İşaretle" })));
    const strip = screen.getByRole("group", { name: "Şarkı haritası dosyası" });
    await waitFor(() =>
      expect(within(strip).getByRole("button", { name: "Haritayı dışa aktar" })).toBeEnabled(),
    );
    return strip;
  };

  it("dışa aktarır; içe aktarınca durum görünür, şarkı haritası yeniden sorulur; kaldırılır", async () => {
    const strip = await openStrip();
    expect(within(strip).getByText(/sesin parmak izine/)).toBeInTheDocument();
    await act(async () =>
      fireEvent.click(within(strip).getByRole("button", { name: "Haritayı dışa aktar" })),
    );
    expect(backend.mapExport).toHaveBeenCalledWith(track.path, "Lyra - Gece Otoyolu.harita.json");
    expect(within(strip).getByText(/^Kaydedildi: /)).toBeInTheDocument();

    const asked = backend.songMapAsked.mock.calls.length;
    await act(async () =>
      fireEvent.click(within(strip).getByRole("button", { name: "Harita içe aktar" })),
    );
    expect(backend.mapImport).toHaveBeenCalledWith(track.path, "C:/İndirilenler/gece.harita.json");
    expect(within(strip).getByText(/İçe aktarılan harita kullanılıyor/)).toBeInTheDocument();
    expect(
      within(strip).getByText(/benzerlik %94 · 412 vuruş · zamanlar \+1\.500 ms kaydırıldı/),
    ).toBeInTheDocument();
    expect(within(strip).getByText(/bir insanın düzelttiği/)).toBeInTheDocument();
    // Görseller ve şerit yeni haritayı kullanır: harita yeniden sorulur.
    await waitFor(() => expect(backend.songMapAsked.mock.calls.length).toBeGreaterThan(asked));

    await act(async () => fireEvent.click(within(strip).getByRole("button", { name: "Kaldır" })));
    expect(backend.mapRemove).toHaveBeenCalledWith(track.path);
    expect(within(strip).queryByText(/İçe aktarılan harita kullanılıyor/)).not.toBeInTheDocument();
    expect(within(strip).getByText(/programın kendi analizi/)).toBeInTheDocument();
  });

  it("şarkı açılınca uygulanmış haritayı gösterir; eşleşmeyen dosyada anlaşılır hata", async () => {
    backend.importedMap = {
      sourceName: "eski.harita.json",
      importedAt: "2026-10-20 10:00:00",
      similarity: 0.99,
      offsetSecs: 0,
      source: "analysis",
      beats: 300,
    };
    const strip = await openStrip();
    await waitFor(() => expect(within(strip).getByText(/eski\.harita\.json/)).toBeInTheDocument());
    expect(within(strip).getByText(/analizden/)).toBeInTheDocument();
    expect(within(strip).queryByText(/kaydırıldı/)).not.toBeInTheDocument();
    backend.mapPick = "C:/İndirilenler/baska-sarki.harita.json";
    await act(async () =>
      fireEvent.click(within(strip).getByRole("button", { name: "Harita içe aktar" })),
    );
    expect(within(strip).getByText(/bu şarkıya ait değil \(benzerlik %4\)/)).toBeInTheDocument();
    // Önceki harita yerinde kalır.
    expect(within(strip).getByText(/eski\.harita\.json/)).toBeInTheDocument();
  });
});

describe("şarkı sözleri", () => {
  afterEach(() => {
    backend.desktop = false;
    backend.status = null;
    backend.lyrics = null;
    window.localStorage.clear();
  });
  const word = (start: number, end: number, text: string) => ({ start, end, text });
  const synced: import("../lib/backend").Lyrics = {
    source: "file",
    synced: true,
    lines: [
      {
        start: 82,
        end: 85,
        text: "Gece yolunda yalnız",
        translation: "Alone on the night road",
        estimated: false,
        words: [word(82, 83, "Gece "), word(83, 84, "yolunda "), word(84, 85, "yalnız")],
      },
      {
        start: 85,
        end: 88,
        text: "Işıklar akıyor",
        translation: null,
        estimated: true,
        words: [word(85, 86.5, "Işıklar "), word(86.5, 88, "akıyor")],
      },
    ],
  };

  it("yumuşak saydamlık geçişi yalnızca Epilepsi güvenli modunda (varsayılanda söz tam zamanında)", () => {
    const { container, rerender } = render(<LyricsOverlay lyrics={synced} positionSecs={83.4} />);
    expect(container.querySelector(".lyrics")).not.toHaveClass("is-safe");
    rerender(<LyricsOverlay lyrics={synced} positionSecs={83.4} safe />);
    expect(container.querySelector(".lyrics")).toHaveClass("is-safe");
  });

  it("çalan satır sahnede kelime kelime; ayardan kapatılır ve hatırlanır", async () => {
    backend.desktop = true;
    backend.status = { ...playing, state: "paused" };
    backend.lyrics = synced;
    const { container, unmount } = render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    // Konum 83,4 sn: "Gece" söylendi, "yolunda" söyleniyor, "yalnız" sırada.
    await waitFor(() => expect(container.querySelector(".lyrics__line")).not.toBeNull());
    const states = Array.from(container.querySelectorAll(".lyrics__word")).map((w) => [
      w.textContent,
      w.className.replace("lyrics__word ", ""),
    ]);
    expect(states).toEqual([
      ["Gece ", "is-sung"],
      ["yolunda ", "is-current"],
      ["yalnız", "is-upcoming"],
    ]);
    expect(container.querySelector(".lyrics__translation")?.textContent).toBe(
      "Alone on the night road",
    );
    expect(container.querySelector(".lyrics__next")?.textContent).toBe("Işıklar akıyor");

    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Ayarlar" })));
    expect(screen.getByText(/\.lrc dosyasından/)).toBeInTheDocument();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Sahnede şarkı sözleri: Açık/ })),
    );
    expect(container.querySelector(".lyrics")).toBeNull();
    unmount();
    // Tercih hatırlanır.
    const again = render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    expect(again.container.querySelector(".lyrics")).toBeNull();
  });

  it("şarkı başına söz kaydırma: Alt+→ sözleri geciktirir, sarmaz; Ayarlar'da görünür ve hatırlanır", async () => {
    backend.desktop = true;
    backend.status = { ...playing, state: "paused" };
    backend.lyrics = synced;
    backend.seek.mockClear();
    const { container, unmount } = render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await waitFor(() => expect(container.querySelector(".lyrics__line")).not.toBeNull());
    const current = () => container.querySelector(".lyrics__word.is-current")?.textContent;
    // Konum 83,4 sn: "yolunda" söyleniyor. Sözler 0,5 sn geç gelsin: "Gece" (82–83) söyleniyor olmalı.
    expect(current()).toBe("yolunda ");
    for (let i = 0; i < 10; i++) {
      await act(async () => fireEvent.keyDown(window, { key: "ArrowRight", altKey: true }));
    }
    expect(current()).toBe("Gece ");
    expect(container.querySelector(".lyrics-notice")).toHaveTextContent(
      "Sözler: +0,50 sn (daha geç)",
    );
    expect(backend.seek).not.toHaveBeenCalled(); // Alt+→ 5 sn ileri sarmaz
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Ayarlar" })));
    expect(screen.getByText("+0,50 sn (daha geç)")).toBeInTheDocument();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Sözleri 50 ms erken getir" })),
    );
    expect(screen.getByText("+0,45 sn (daha geç)")).toBeInTheDocument();
    unmount();
    // Aynı şarkı yeniden açılınca kaydırma hatırlanır.
    const again = render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Ayarlar" })));
    await waitFor(() => expect(screen.getByText("+0,45 sn (daha geç)")).toBeInTheDocument());
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sıfırla" })));
    expect(screen.getByText("0,00 sn")).toBeInTheDocument();
    again.unmount();
  });

  it("zamansız sözler sahnede gösterilmez, ayarda nedeni yazar", async () => {
    backend.desktop = true;
    backend.status = { ...playing, state: "paused" };
    backend.lyrics = { ...synced, synced: false };
    const { container } = render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Ayarlar" })));
    await waitFor(() => expect(screen.getByText(/zamanlı değil/)).toBeInTheDocument());
    expect(container.querySelector(".lyrics")).toBeNull();
  });
});

describe("crossfeed", () => {
  afterEach(() => {
    backend.crossfeed = null;
    backend.setCrossfeed.mockReset();
  });
  const lastSent = () =>
    backend.setCrossfeed.mock.calls.at(-1)?.[0] as
      import("../lib/backend").CrossfeedSettings | undefined;
  const openStrip = async () => {
    render(<App />);
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: /Ekolayzer/ })));
    return screen.getByRole("group", { name: "Crossfeed" });
  };

  it("kayıtlı ayarla açılır; hazır ayar açar ve uygular, EQ ışığı yanar", async () => {
    backend.crossfeed = { enabled: false, cutoffHz: 650, levelDb: 9.5 };
    const strip = await openStrip();
    const toggle = within(strip).getByRole("switch", { name: "Crossfeed" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(
      within(strip).getByText(/Hafif · kulaklar arası zaman farkı 245 µs/),
    ).toBeInTheDocument();
    expect(within(strip).getByText(/Hoparlörle dinlerken kapalı tutun/)).toBeInTheDocument();
    // Kapalıyken hiçbir hazır ayar seçili görünmez.
    expect(within(strip).getByRole("button", { name: "Hafif" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await act(async () =>
      fireEvent.click(within(strip).getByRole("button", { name: "Hoparlör gibi" })),
    );
    expect(lastSent()).toEqual({ enabled: true, cutoffHz: 570, levelDb: 1 });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(within(strip).getByRole("button", { name: "Hoparlör gibi" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(strip).getByText(/279 µs/)).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Ekolayzer/ }).querySelector(".led.is-on"),
    ).not.toBeNull();

    await act(async () => fireEvent.click(toggle));
    expect(lastSent()).toEqual({ enabled: false, cutoffHz: 570, levelDb: 1 });
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("gelişmiş ayarda kesim ve seviye sürgüyle değişir; ok tuşları şarkıyı sarmaz", async () => {
    backend.status = playing;
    const strip = await openStrip();
    expect(within(strip).queryByRole("slider", { name: "Kesim" })).not.toBeInTheDocument();
    await act(async () => fireEvent.click(within(strip).getByRole("button", { name: "Gelişmiş" })));
    const cutoff = within(strip).getByRole("slider", { name: "Kesim" });
    await act(async () => fireEvent.change(cutoff, { target: { value: "900" } }));
    expect(lastSent()).toEqual({ enabled: false, cutoffHz: 900, levelDb: 6 });
    const level = within(strip).getByRole("slider", { name: "Seviye" });
    await act(async () => fireEvent.change(level, { target: { value: "3.5" } }));
    expect(lastSent()).toEqual({ enabled: false, cutoffHz: 900, levelDb: 3.5 });
    expect(within(strip).getByText("−3,5 dB")).toBeInTheDocument();
    expect(
      within(strip).getByText(/Özel ayar · kulaklar arası zaman farkı 177 µs/),
    ).toBeInTheDocument();
    await act(async () => fireEvent.keyDown(level, { key: "ArrowLeft" }));
    expect(backend.seek).not.toHaveBeenCalled();
  });

  it("parametrik görünümde de var; bit-perfect çalarken devre dışı görünür", async () => {
    backend.crossfeed = { enabled: true, cutoffHz: 700, levelDb: 6 };
    backend.desktop = true;
    backend.status = {
      ...playing,
      state: "paused",
      output: {
        deviceName: "Kulaklık (USB DAC)",
        sampleRate: 44100,
        channels: 2,
        resampled: false,
        normalizationDb: null,
        bitPerfect: true,
        bitDepth: 24,
        notice: null,
      },
    };
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: /Ekolayzer/ })));
    await waitFor(() =>
      expect(screen.getByRole("group", { name: "Crossfeed" })).toHaveClass("is-off"),
    );
    expect(screen.getByText(/kulaklık düzeltmesi ve crossfeed/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: /Parametrik/ })));
    expect(screen.getByRole("group", { name: "Crossfeed" })).toBeInTheDocument();
  });
});

describe("kapak", () => {
  it("şarkının içindeki kapak başlığın yanında görünür; bir kez okunur", async () => {
    backend.desktop = true;
    backend.status = { ...playing, state: "paused" };
    backend.covers = { [track.path]: "data:image/png;base64,iVBORw0KGgo=" };
    const { container } = render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    const art = await screen.findByRole("img", { name: "Kapak: Gece Otoyolu" });
    expect(art.querySelector("img")).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=");
    expect(container.querySelector(".now")).toHaveClass("has-art");
    // Ekran her karede yeniden çizilir; kapak dosyası yine de bir kez okunur.
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    expect(backend.coverAsked.mock.calls.filter(([p]) => p === track.path)).toHaveLength(1);
  });

  it("kapak yoksa albüm adından özgün renk kapağı; şarkı yokken kapak alanı yok", async () => {
    const empty = render(<App />);
    expect(empty.container.querySelector(".now__art")).toBeNull();
    empty.unmount();
    backend.desktop = true;
    backend.status = { ...playing, state: "paused" };
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    const art = await screen.findByRole("img", { name: "Kapak yok" });
    expect(art.getAttribute("style")).toMatch(/linear-gradient/);
    expect(art.querySelector("img")).toBeNull();
  });
});

describe("hata sınırları", () => {
  afterEach(() => {
    backend.brokenEqualizer = false;
    vi.restoreAllMocks();
  });

  it("bir panel çökerse yalnızca o panel 'açılamadı' der; sahne ve diğer paneller çalışır", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    backend.brokenEqualizer = true;
    render(<App />);
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: /Ekolayzer/ })));
    expect(await screen.findByText(/Ekolayzer açılamadı/)).toBeInTheDocument();
    expect(backend.logError).toHaveBeenCalledWith(expect.stringMatching(/^Ekolayzer çizilemedi/));
    // Sahne yerinde, diğer paneller açılıyor.
    expect(document.querySelector(".stage")).not.toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Ayarlar" })));
    expect(screen.getByRole("button", { name: "Göl" })).toBeInTheDocument();
  });
});

describe("gece göğünün manzarası", () => {
  it("ayarlardan seçilir ve hatırlanır", async () => {
    render(<App />);
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Ayarlar" })));
    const lake = screen.getByRole("button", { name: "Göl" });
    expect(lake).toHaveAttribute("aria-pressed", "true");
    expect(lake).toHaveAccessibleDescription(/durgun gölde yansımaları/);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Korona" })));
    expect(screen.getByRole("button", { name: "Korona" })).toHaveAttribute("aria-pressed", "true");
    expect(lake).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem("lyraska.skyLook")).toBe("corona");
  });
});

describe("hata günlüğü", () => {
  afterEach(() => {
    backend.desktop = false;
    backend.openLog.mockReset();
  });

  it("programda düğmeyle açılır; açılamazsa nedenini söyler", async () => {
    backend.desktop = true;
    render(<App />);
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Ayarlar" })));
    const button = await screen.findByRole("button", { name: "Hata günlüğü" });
    await act(async () => fireEvent.click(button));
    expect(backend.openLog).toHaveBeenCalledTimes(1);

    backend.openLog.mockRejectedValue("Hata günlüğü açılamadı: erişim yok");
    await act(async () => fireEvent.click(button));
    expect(screen.getByText("Hata günlüğü açılamadı: erişim yok")).toBeInTheDocument();
  });

  it("tarayıcı önizlemesinde gösterilmez", () => {
    render(<App />);
    expect(screen.queryByRole("button", { name: "Hata günlüğü" })).not.toBeInTheDocument();
  });
});

describe("işaretleme", () => {
  afterEach(() => {
    backend.desktop = false;
    backend.status = null;
    backend.annotation = null;
    backend.songMap = null;
    backend.saveMarks.mockReset();
    backend.toggle.mockReset();
  });

  it("Boşluk beat, D drop işaretler; Geri siler; kendiliğinden kaydeder; Esc bitirir", async () => {
    backend.desktop = true;
    backend.status = playing;
    render(<App />);
    // Oynatıcı çalan şarkıyı ilk komutla öğrenir (diğer testlerdeki gibi).
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    backend.toggle.mockReset();
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "İşaretle" })));
    const start = await screen.findByRole("button", { name: /İşaretlemeye başla/ });
    await waitFor(() => expect(start).toBeEnabled());
    await act(async () => fireEvent.click(start));

    await act(async () => fireEvent.keyDown(document.body, { code: "Space", key: " " }));
    await act(async () => fireEvent.keyDown(document.body, { code: "KeyD", key: "d" }));
    expect(backend.toggle).not.toHaveBeenCalled(); // Boşluk çal/duraklat yapmadı
    const counts = () => screen.getByText(/beat$/, { selector: ".marker__stat" }).textContent;
    expect(counts()).toMatch(/^1 beat/);
    expect(screen.getByText(/drop/, { selector: ".marker__stat" }).textContent).toMatch(/^1 drop/);

    await act(async () =>
      fireEvent.keyDown(document.body, { code: "Backspace", key: "Backspace" }),
    );
    expect(screen.getByText(/drop/, { selector: ".marker__stat" }).textContent).toMatch(/^0 drop/);

    await waitFor(() => expect(backend.saveMarks).toHaveBeenCalled(), { timeout: 2000 });
    const [path, beats, drops] = backend.saveMarks.mock.calls.at(-1)!;
    expect(path).toBe(playing.track!.path);
    expect(beats).toHaveLength(1);
    expect(drops).toEqual([]);
    await waitFor(() => expect(screen.getByText("Kaydedildi")).toBeInTheDocument());

    // Ton seçimi de işaretlerle birlikte kendiliğinden kaydedilir.
    backend.saveMarks.mockClear();
    await act(async () =>
      fireEvent.change(screen.getByLabelText("Ton"), { target: { value: "4m" } }),
    );
    await waitFor(() => expect(backend.saveMarks).toHaveBeenCalled(), { timeout: 2000 });
    expect(backend.saveMarks.mock.calls.at(-1)![3]).toEqual({ tonic: 4, minor: true });
    await waitFor(() => expect(screen.getByText("Kaydedildi")).toBeInTheDocument());

    await act(async () => fireEvent.keyDown(document.body, { code: "Escape", key: "Escape" }));
    expect(screen.getByRole("button", { name: /İşaretlemeye başla/ })).toBeInTheDocument();
    await act(async () => fireEvent.keyDown(document.body, { code: "Space", key: " " }));
    expect(backend.toggle).toHaveBeenCalledTimes(1); // artık yine çal/duraklat
  });

  /** İşaretlemenin başladığı an: sahte çekirdeğin konumu bundan itibaren gerçek zamanla ilerler. */
  let playingSince = 0;

  /** İşaretleme sekmesini açar ve işaretlemeyi başlatır. */
  async function startMarking() {
    backend.desktop = true;
    backend.status = playing;
    playingSince = performance.now();
    render(<App />);
    // Oynatıcı çalan şarkıyı ilk komutla öğrenir (diğer testlerdeki gibi).
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "İşaretle" })));
    const start = await screen.findByRole("button", { name: /İşaretlemeye başla/ });
    await waitFor(() => expect(start).toBeEnabled());
    await act(async () => fireEvent.click(start));
  }

  /** Bir vuruş aralığı arayla `count` kez Boşluk'a basar (sürekli işaretleme). */
  async function tapBeats(count: number, intervalMs: number) {
    for (let i = 0; i < count; i++) {
      // Sahte çekirdek de şarkının gerçek zamanla ilerlediğini bildirsin. Vuruş başına sabit
      // adım yetmez: makine yüklüyken vuruşlar arası daha uzun sürer, ekrandaki saat bildirilen
      // konumdan uzaklaşıp geri sıçrar ve iki vuruş üst üste düşer.
      const elapsed = (performance.now() - playingSince) / 1000;
      backend.status = { ...backend.status!, positionSecs: playing.positionSecs + elapsed };
      await act(async () => fireEvent.keyDown(document.body, { code: "Space", key: " " }));
      await act(() => new Promise((resolve) => setTimeout(resolve, intervalMs)));
    }
  }

  it("şarkı boyunca durmadan işaretlerken de ara ara kaydeder", async () => {
    await startMarking();
    // 0,25 sn arayla 16 vuruş (4 sn): her vuruş kaydı ertelese hiç kaydedilmezdi.
    await tapBeats(16, 250);
    expect(backend.saveMarks).toHaveBeenCalled();
    const [, beats] = backend.saveMarks.mock.calls.at(-1)!;
    expect(beats.length).toBeGreaterThanOrEqual(8);
  }, 10_000);

  it("şarkı değişince kaydedilmemiş işaretler önceki şarkıya yazılır", async () => {
    await startMarking();
    await tapBeats(4, 150);
    expect(backend.saveMarks).not.toHaveBeenCalled(); // henüz kaydedilmedi
    // Sıradaki şarkı başladı (boşluksuz geçiş ya da "Sonraki").
    backend.status = {
      ...playing,
      positionSecs: 0.1,
      track: { ...playing.track!, path: "C:\\Müzik\\sonraki.flac" },
    };
    await waitFor(
      () =>
        expect(backend.saveMarks).toHaveBeenCalledWith(
          playing.track!.path,
          expect.any(Array),
          [],
          null,
        ),
      { timeout: 2000 },
    );
    const [, beats] = backend.saveMarks.mock.calls.find(([p]) => p === playing.track!.path)!;
    expect(beats).toHaveLength(4);
  });

  it("kayıtlı işaretleri yükler ve doğruluğu gösterir", async () => {
    backend.desktop = true;
    backend.status = playing;
    backend.annotation = {
      format: 1,
      appVersion: "0.0.25",
      track: {
        path: track.path,
        fileName: track.fileName,
        title: track.title,
        artist: track.artist,
        durationSecs: track.durationSecs,
        sizeBytes: null,
      },
      savedAt: "",
      beats: Array.from({ length: 12 }, (_, i) => 1 + i * 0.5),
      drops: [61],
      key: { tonic: 9, minor: true },
      evaluation: null,
    };
    backend.songMap = {
      meter: 4,
      downbeatPhase: 0,
      grouping: [],
      meterConfidence: 0.9,
      downbeats: [],
      sections: [
        { start: 0, end: 60, energy: 0.3, label: 0 },
        { start: 60, end: 225, energy: 0.9, label: 1 },
      ],
      // 150. saniyedeki aday şüpheli: programın bulduğu drop sayılmaz.
      drops: [61.5, 150],
      dropConfidence: [0.9, 0.3],
      energy: [],
    };
    render(<App />);
    // Oynatıcı çalan şarkıyı ilk komutla öğrenir (diğer testlerdeki gibi).
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    backend.toggle.mockReset();
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "İşaretle" })));
    await waitFor(() =>
      expect(screen.getByText(/beat/, { selector: ".marker__stat" }).textContent).toMatch(
        /^12 beat · ~120 BPM/,
      ),
    );
    expect(screen.getByText(/01:01/)).toBeInTheDocument();
    // Diskteki, değişmemiş işaretler doğrudan ölçülebilir.
    const measure = screen.getByRole("button", { name: "Doğruluğu ölç" });
    await waitFor(() => expect(measure).toBeEnabled());
    await act(async () => fireEvent.click(measure));
    expect(screen.getByText("%87,3")).toBeInTheDocument();
    expect(screen.getByText("42 ms")).toBeInTheDocument();
    expect(screen.getByText("%95,1")).toBeInTheDocument();
    expect(screen.getByText("128 / 127,9 BPM")).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument(); // drop isabeti
    // Kayıtlı ton seçili; ölçüm programın tonuyla karşılaştırır.
    expect(screen.getByLabelText("Ton")).toHaveValue("9m");
    expect(
      screen.getByText("8B · Do majör / 8A · La minör — paralel ton (aynı Camelot sayısı) ✓"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Şarkı haritası: 2 bölüm, programın bulduğu 1 drop, sizin 1 drop işaretiniz",
      }),
    ).toBeInTheDocument();

    // Hepsi silinince kaydedilir; 8 beat'ten az olduğu için ölçülemez.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Hepsini sil" })));
    expect(screen.queryByText("%87,3")).not.toBeInTheDocument();
    await waitFor(
      () =>
        // Ton işareti silinmez: işaretler silinse de seçilen ton kalır.
        expect(backend.saveMarks).toHaveBeenLastCalledWith(expect.any(String), [], [], {
          tonic: 9,
          minor: true,
        }),
      {
        timeout: 2000,
      },
    );
    expect(screen.getByRole("button", { name: "Doğruluğu ölç" })).toBeDisabled();
  });
});

describe("bit-perfect", () => {
  const bitPerfectOutput = {
    deviceName: "Kulaklık (USB DAC)",
    sampleRate: 44100,
    channels: 2,
    resampled: false,
    normalizationDb: null,
    bitPerfect: true,
    bitDepth: 24,
    notice: null,
  };

  it("ayarlardan açılır; uyarı ve açıklama görünür", async () => {
    render(<App />);
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Ayarlar" })));
    const toggle = await screen.findByRole("button", { name: "Bit-perfect (özel mod): Kapalı" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/Windows ses düzeyi çoğu aygıtta etkisizdir/)).toBeInTheDocument();
    await act(async () => fireEvent.click(toggle));
    expect(screen.getByRole("button", { name: "Bit-perfect (özel mod): Açık" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Eşitleme ayarı yerinde kalır.
    expect(
      screen.getByRole("button", { name: "Ses yüksekliği eşitleme: Açık" }),
    ).toBeInTheDocument();
  });

  it("çalarken sesin yolunu söyler; ekolayzer devre dışı görünür", async () => {
    backend.desktop = true;
    backend.status = { ...playing, state: "paused", output: bitPerfectOutput };
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await waitFor(() =>
      expect(screen.getByText("FLAC 44,1 kHz · bit-perfect")).toBeInTheDocument(),
    );
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Ayarlar" })));
    expect(
      screen.getByText("FLAC 44,1 kHz → bit-perfect (özel mod, 24 bit) → Kulaklık (USB DAC)"),
    ).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Ekolayzer" })));
    expect(screen.getByText(/Bit-perfect açık: ses hiç işlenmiyor/)).toBeInTheDocument();
  });

  it("açılamadıysa nedenini söyler", async () => {
    backend.desktop = true;
    backend.status = {
      ...playing,
      state: "paused",
      output: {
        ...bitPerfectOutput,
        sampleRate: 48000,
        resampled: true,
        bitPerfect: false,
        bitDepth: null,
        notice: "aygıtı başka bir program özel modda kullanıyor",
      },
    };
    render(<App />);
    await act(async () => fireEvent.keyDown(window, { code: "Space", key: " " }));
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Ayarlar" })));
    await waitFor(() =>
      expect(
        screen.getByText(
          "Bit-perfect açılamadı: aygıtı başka bir program özel modda kullanıyor. Ses normal yoldan çalıyor.",
        ),
      ).toBeInTheDocument(),
    );
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Ekolayzer" })));
    expect(screen.queryByText(/Bit-perfect açık/)).not.toBeInTheDocument();
  });
});
