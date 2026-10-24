import { useCallback, useEffect, useRef, useState } from "react";
import type { ButterchurnVisualizer } from "butterchurn";
import type { MilkdropControls } from "../hooks/useMilkdrop";
import { useVisualFeed } from "../hooks/useVisualFeed";
import {
  getVisualWaveform,
  loadMilkdropPreset,
  logFrontendError,
  type MilkdropPreset,
  type VisualFrame,
} from "../lib/backend";
import { describeError } from "../lib/errorReporting";
import { createFlashGuard, type FlashGuard } from "../lib/flashGuard";
import { fitCanvas, getWebGl2, gpuName, reportSceneProblem } from "../lib/gl";
import {
  SCHEDULE_START,
  audioLevels,
  blameContextLoss,
  restartSchedule,
  stepSchedule,
  writePending,
} from "../lib/milkdrop";
import { brokenShaders, resetShaders } from "../lib/milkdropShaders";
import { usePrefersReducedMotion } from "../lib/usePrefersReducedMotion";

const SCENE_NAME = "MilkDrop";
/** Ekran kartı bağlamı art arda (arada temiz kare olmadan) en fazla bu kadar kez yeniden kurulur. */
const MAX_REBUILDS = 3;

export interface MilkDropSceneProps {
  playing: boolean;
  /**
   * Epilepsi güvenli modu: görüntü parlaklık freninden geçer (saniyede ≤ 1 parlama). Kapalıyken
   * görüntü olduğu gibi gösterilir.
   */
  safe?: boolean;
  controls: MilkdropControls;
}

/**
 * MilkDrop sahnesi: kullanıcının kendi `.milk` görsellerini Butterchurn ile çizer. Lyraska hazır
 * görsel içermez.
 *
 * Güvenlik:
 * - Butterchurn kendi, **görünmeyen** tuvaline çizer (OffscreenCanvas; DOM'da değil). Görünen
 *   tuvale parlaklık freni (`flashGuard.ts`) çizer. Fren yalnızca Epilepsi güvenli modunda
 *   sınırlar (proje sahibinin kararı, 24 Ekim 2026): görüntünün her bölgesinin parlaklığı saniyede
 *   en çok 0,18, her küçük bloğun piksellerinin parlaklığı ortalama 0,095 değişir; preset ne
 *   yaparsa yapsın saniyede 1'den az parlama, ince desenler (şerit, dama) saniyede ~1 tersine
 *   döner. Varsayılan modda kare olduğu gibi geçer (`primeSource`); güvenli mod açılınca fren o
 *   kareden sürer. Fren kurulamazsa varsayılan modda görüntü frensiz, Butterchurn'ün kopyasıyla
 *   ayrı bir tuvalde gösterilir; güvenli modda sahne gösterilmez.
 * - Preset denklemleri yalnızca WebAssembly'ye derlenir (`onlyUseWASM`); JavaScript olarak
 *   çalıştırılmaz (CSP'de `'unsafe-eval'` yok). Gölgelendiricileri çekirdek GLSL'e çevirir;
 *   ekran kartında derlenemeyen olursa varsayılanla değiştirilir (`milkdropShaders.ts`).
 * - "Animasyonları azalt" açıksa sahne çalışmaz, kısa bir açıklama görünür.
 */
export function MilkDropScene({ playing, safe = false, controls }: MilkDropSceneProps) {
  const reducedMotion = usePrefersReducedMotion();
  if (reducedMotion) {
    return (
      <div className="milkdrop-scene">
        <div className="milkdrop-scene__message" role="status">
          <p>
            İşletim sisteminizde “animasyonları azalt” açık. MilkDrop görselleri hızlı ve önceden
            bilinmeyen hareketler içerdiği için bu sahne çalışmıyor; galeriden sakin bir sahne
            seçebilirsiniz.
          </p>
        </div>
      </div>
    );
  }
  if (controls.library.presets.length === 0) return <MilkDropEmpty controls={controls} />;
  return <MilkDropCanvas playing={playing} safe={safe} controls={controls} />;
}

/** Klasör seçilmedi ya da klasörde görsel yok. */
function MilkDropEmpty({ controls }: { controls: MilkdropControls }) {
  const { library, loading, notice } = controls;
  const text = loading
    ? "Görseller okunuyor…"
    : library.error
      ? `Seçilen klasör okunamadı: ${library.error}`
      : library.folder
        ? "Seçilen klasörde .milk dosyası yok."
        : "MilkDrop görsellerinizin (.milk) bulunduğu klasörü seçin.";
  return (
    <div className="milkdrop-scene">
      <div className="milkdrop-scene__message">
        <p role="status">{text}</p>
        {notice && notice !== library.error && <p>{notice}</p>}
        <button
          type="button"
          className="glass-button"
          disabled={loading}
          onClick={() => void controls.chooseFolder()}
        >
          Klasör seç
        </button>
        <p className="milkdrop-scene__note">
          Lyraska hazır görsel içermez: kendi .milk dosyalarınızı seçersiniz. Dosyalar kopyalanmaz,
          yalnızca klasörün yeri hatırlanır.
        </p>
      </div>
    </div>
  );
}

interface Engine {
  gl: WebGL2RenderingContext;
  /** Parlaklık freni; kurulamadıysa `null` (yalnızca varsayılan modda: görüntü frensiz). */
  guard: FlashGuard | null;
  visualizer: ButterchurnVisualizer;
  width: number;
  height: number;
  /** Bir görsel açıldı mı (açılmadan Butterchurn çizemez). */
  hasPreset: boolean;
  wave: Uint8Array | null;
  waveInFlight: boolean;
  /** Çalan görselin yolu ve isteğinin sırası (donma işareti ve hata bildirimi için). */
  currentPath: string | null;
  currentSerial: number;
  /**
   * Açılan ya da yeni açılmış görsel ve anı (`performance.now`): bu arada bağlam kaybolursa
   * (ekran kartı sıfırlandı) görsel suçlanır.
   */
  suspect: { serial: number; path: string; since: number } | null;
  lost: boolean;
}

/**
 * Fren kurulamadığında sahnenin durumu: `raw` varsayılan modda frensiz gösteriliyor, `hidden`
 * güvenli modda gösterilmiyor. Güvenli mod değişince sahne yeniden kurulur.
 */
type GuardMissing = "raw" | "hidden" | null;

/** Butterchurn ve parlaklık freni; çizim her karede `useVisualFeed` ile. */
function MilkDropCanvas({ playing, safe, controls }: Required<MilkDropSceneProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Fren kurulamazsa varsayılan modda görüntünün frensiz gösterildiği tuval (2D). */
  const rawRef = useRef<HTMLCanvasElement>(null);
  const [unguarded, setUnguarded] = useState(false);
  const guardMissing = useRef<GuardMissing>(null);
  const engine = useRef<Engine | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [ready, setReady] = useState(0);
  const rebuilds = useRef(0);
  const schedule = useRef(SCHEDULE_START);
  const safeRef = useRef(safe);
  const controlsRef = useRef(controls);
  const loadChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    safeRef.current = safe;
    engine.current?.guard?.setSafe(safe);
    // Fren kurulamadıysa: güvenli mod açılınca sahne kapanır, kapanınca frensiz kurulur.
    const missing = guardMissing.current;
    if ((missing === "raw" && safe) || (missing === "hidden" && !safe)) {
      setGeneration((g) => g + 1);
    }
  }, [safe]);

  // Program düzgün kapanırken çalan görsel suçlanmasın: donma işareti silinir. (İşaret yalnızca
  // program bir görsel çalarken zorla kapandıysa kalır; bkz. `lib/milkdrop.ts`.)
  useEffect(() => {
    const clear = () => writePending(null);
    window.addEventListener("pagehide", clear);
    window.addEventListener("beforeunload", clear);
    return () => {
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("beforeunload", clear);
    };
  }, []);

  // Kurulum: görünen tuvalde fren, görünmeyen tuvalde Butterchurn.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let created: Engine | null = null;
    const fail = (problem: string, message: string) => {
      canvas.dataset.webgl = "off";
      reportSceneProblem(canvas, SCENE_NAME, problem);
      setFailure(message);
    };
    const gl = getWebGl2(canvas);
    if (!gl) {
      fail(
        "WebGL2 açılamadı",
        "Ekran kartı bu sahneyi çizemiyor (WebGL2 açılamadı). Başka bir sahne seçebilirsiniz.",
      );
      return;
    }
    canvas.dataset.gpu = gpuName(gl);
    const setup = createFlashGuard(gl, { safe: safeRef.current });
    let guard: FlashGuard | null = null;
    // Fren kurulamazsa varsayılan modda görüntü frensiz gösterilir (ayrı 2D tuvalde).
    const raw = setup.ok ? null : rawRef.current;
    if (setup.ok) {
      guard = setup.guard;
      canvas.dataset.guard = guard.storage;
      guardMissing.current = null;
      setUnguarded(false);
    } else if (safeRef.current || !raw) {
      guardMissing.current = "hidden";
      setUnguarded(false);
      fail(
        setup.reason,
        "Parlaklık freni bu ekran kartında kurulamadı; Epilepsi güvenli modunda MilkDrop sahnesi " +
          "gösterilmiyor.",
      );
      return;
    } else {
      guardMissing.current = "raw";
      canvas.dataset.webgl = "off";
      raw.dataset.guard = "off";
      raw.dataset.guardError = setup.reason;
      logFrontendError(
        `${SCENE_NAME}: parlaklık freni kurulamadı (${setup.reason}); varsayılan modda frensiz ` +
          "gösteriliyor",
      ).catch(() => {
        /* Günlüğe yazılamazsa yapılacak bir şey yok. */
      });
    }

    // Görsel açılırken ya da yeni açılmışken bağlam kaybolduysa (ekran kartı sıfırlandı; ör.
    // gölgelendiricideki uzun döngü) görsel kalıcı atlanır: yeniden kurulum onu bir daha açmaz.
    const blame = () => {
      const suspect = created?.suspect;
      if (!created || !suspect) return;
      created.suspect = null;
      if (blameContextLoss(suspect.since, performance.now())) {
        controlsRef.current.failed(
          suspect.serial,
          "ekran kartı bu görseli çizerken durdu (bağlam kayboldu); atlananlara eklendi",
          suspect.path,
        );
      }
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      blame();
      if (created) created.lost = true;
    };
    const onRestored = () => {
      if (disposed) return;
      rebuilds.current += 1;
      if (rebuilds.current > MAX_REBUILDS) {
        fail("bağlam defalarca kayboldu", "Ekran kartı MilkDrop sahnesini çizmeyi bıraktı.");
        return;
      }
      setGeneration((g) => g + 1);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    let internal: HTMLCanvasElement | OffscreenCanvas | null = null;
    const onInternalLost = (event: Event) => {
      event.preventDefault();
      blame();
      if (created) created.lost = true;
      // Butterchurn'ün durumu geri gelmez: kısa bir süre sonra baştan kurulur.
      window.setTimeout(onRestored, 1000);
    };

    import("butterchurn")
      .then(({ default: butterchurn }) => {
        if (disposed) return;
        const { width, height } = fitCanvas(raw ?? canvas);
        // Butterchurn her karede bu tuvale kopyalamak ister; tuval DOM'a eklenmez ve kopya
        // kapatılır (`outputGl = null`). Görüntü ekrana frenden geçerek ulaşır; fren yoksa
        // (yalnızca varsayılan modda) kopya doğrudan görünen 2D tuvale yapılır.
        const sink = document.createElement("canvas");
        sink.width = 1;
        sink.height = 1;
        const visualizer = butterchurn.createVisualizer(null, raw ?? sink, {
          width,
          height,
          pixelRatio: 1,
          textureRatio: 1,
          // Preset denklemleri yalnızca WebAssembly'ye derlenir: JS (`new Function`) yolu kapalı.
          onlyUseWASM: true,
        });
        if (!raw) visualizer.outputGl = null;
        internal = visualizer.internalCanvas;
        internal.addEventListener("webglcontextlost", onInternalLost);
        created = {
          gl,
          guard,
          visualizer,
          width,
          height,
          hasPreset: false,
          wave: null,
          waveInFlight: false,
          currentPath: null,
          currentSerial: 0,
          suspect: null,
          lost: false,
        };
        engine.current = created;
        const shown = raw ?? canvas;
        shown.dataset.webgl = "on";
        delete shown.dataset.webglError;
        if (raw) setUnguarded(true);
        setFailure(null);
        setReady((r) => r + 1);
      })
      .catch((error: unknown) => {
        if (!disposed) {
          fail(describeError(error), "MilkDrop sahnesi açılamadı; hata günlüğe yazıldı.");
        }
      });

    return () => {
      disposed = true;
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      internal?.removeEventListener("webglcontextlost", onInternalLost);
      if (created) {
        // Sahneden çıkınca çalan görsel yok: donma işareti silinir.
        writePending(null);
        try {
          // Ekran kartı kaynakları hemen bırakılsın (bağlam zaten kayıpsa uzantı yoktur).
          created.visualizer.loseGLContext();
        } catch {
          /* Bağlam zaten kayıp: bırakılacak bir şey yok. */
        }
      }
      guard?.dispose();
      engine.current = null;
    };
  }, [generation]);

  // İstenen görseli aç: istekler sırayla işlenir, yenisi gelmişse eskisi atlanır.
  const request = controls.request;
  useEffect(() => {
    if (!request || ready === 0) return;
    const run = async () => {
      const current = engine.current;
      if (!current || current.lost || controlsRef.current.request?.serial !== request.serial) {
        return;
      }
      let preset: MilkdropPreset;
      try {
        preset = await loadMilkdropPreset(request.entry.path);
        if (engine.current !== current) return;
        // Donma işareti: bu görsel çalarken (ya da açılırken) program zorla kapanırsa bir sonraki
        // açılışta atlanır. İşaret görsel çaldığı sürece durur.
        writePending(request.entry.path);
        current.suspect = {
          serial: request.serial,
          path: request.entry.path,
          since: performance.now(),
        };
        await current.visualizer.loadPreset(
          preset.preset,
          current.hasPreset ? request.blendSeconds : 0,
        );
      } catch (error) {
        // Açılamadı: işaret hâlâ çalan görsele döner.
        writePending(current.hasPreset ? current.currentPath : null);
        // Sahne bu arada yeniden kurulduysa ya da bağlam kaybolduysa açılamaması görselin suçu
        // değil (kayıp ayrıca değerlendirildi); yeni kurulum açar.
        if (engine.current === current && !current.lost) {
          current.suspect = null;
          controlsRef.current.failed(request.serial, describeError(error));
        }
        return;
      }
      // Çevrilen gölgelendirici ekran kartında derlenemediyse Butterchurn'ün varsayılanı kullanılır
      // (yoksa görüntü kararırdı); görsel sade hâliyle çalar.
      const broken = brokenShaders(current.visualizer);
      if (broken !== "unknown" && broken.length > 0) resetShaders(current.visualizer, broken);
      const gpuBroken = broken !== "unknown" && broken.length > 0;
      const simplified = preset.simplified || gpuBroken;
      const note =
        preset.shaderError ??
        (gpuBroken
          ? `${broken.map((s) => (s === "warp" ? "bükme" : "birleştirme")).join(", ")}: ` +
            "ekran kartında derlenemedi"
          : null);
      if (current.lost) return;
      current.hasPreset = true;
      current.currentPath = request.entry.path;
      current.currentSerial = request.serial;
      // Süre açılış bitince yeniden başlar: ilk kareler de gölgelendiriciyi çalıştırır.
      current.suspect = {
        serial: request.serial,
        path: request.entry.path,
        since: performance.now(),
      };
      schedule.current = restartSchedule(schedule.current);
      if (canvasRef.current) {
        canvasRef.current.dataset.preset = preset.name;
        canvasRef.current.dataset.shaders =
          broken === "unknown" ? "unknown" : broken.length > 0 ? "reset" : "ok";
      }
      controlsRef.current.loaded(request.serial, preset.name, simplified, note);
    };
    loadChain.current = loadChain.current.then(run, run);
  }, [request, ready]);

  const onTick = useCallback((frame: VisualFrame | null, dt: number) => {
    const current = engine.current;
    if (!current || !current.hasPreset || current.lost) return;
    // Ham dalga biçimi: istek sürerken bir önceki kullanılır; çalmıyorken sessizlik.
    if (!frame) {
      current.wave = null;
    } else if (!current.waveInFlight) {
      current.waveInFlight = true;
      getVisualWaveform()
        .then((bytes) => {
          current.wave = bytes;
        })
        .catch(() => {
          current.wave = null;
        })
        .finally(() => {
          current.waveInFlight = false;
        });
    }
    // Fren yoksa görüntü yalnızca varsayılan modda (frensiz) gösterilir; güvenli mod açıldıysa
    // sahne yeniden kurulana dek hiçbir şey çizilmez.
    if (!current.guard && safeRef.current) return;
    const canvas = current.guard ? canvasRef.current : rawRef.current;
    if (!canvas) return;
    const { width, height } = fitCanvas(canvas);
    if (width !== current.width || height !== current.height) {
      current.visualizer.setRendererSize(width, height, { pixelRatio: 1, textureRatio: 1 });
      current.width = width;
      current.height = height;
    }
    // Butterchurn `elapsedTime` 0 ise kendi saatine döner: en az küçük bir adım verilir.
    const step = Math.min(0.25, Math.max(1 / 240, dt));
    try {
      current.visualizer.render({ audioLevels: audioLevels(current.wave), elapsedTime: step });
    } catch (error) {
      // Görselin denklemi çizerken hata verdi (ör. WebAssembly tuzağı): görsel bırakılır, bu
      // oturumda bir daha seçilmez; sonraki harmanlamadan gelir (hatalı görsel karışmasın, ani
      // geçişi güvenli modda fren yumuşatır). Görüntü o zamana kadar son karede kalır.
      current.hasPreset = false;
      current.currentPath = null;
      writePending(null);
      controlsRef.current.failed(
        current.currentSerial,
        `çizilirken hata verdi (${describeError(error)})`,
      );
      return;
    }
    // Fren yalnızca Epilepsi güvenli modunda sınırlar (proje sahibinin kararı, 24 Ekim 2026);
    // kapalıyken her kare olduğu gibi çizilir ve frenin durumu o kareye getirilir: güvenli mod
    // açılınca fren o kareden sürer. Fren yoksa Butterchurn kareyi görünen tuvale zaten kopyaladı.
    const source = current.visualizer.internalCanvas;
    const shown = current.guard
      ? safeRef.current
        ? current.guard.processSource(source, dt)
        : current.guard.primeSource(source)
      : true;
    if (!shown) {
      current.lost = true;
      return;
    }
    // Temiz bir kare: bağlam kaybı sayacı baştan.
    rebuilds.current = 0;
    const next = stepSchedule(schedule.current, frame, dt, controlsRef.current.auto);
    schedule.current = next.state;
    if (next.reason) controlsRef.current.advance();
  }, []);
  useVisualFeed(playing, onTick);

  const name = controls.currentName;
  return (
    <div className="milkdrop-scene">
      <canvas
        ref={canvasRef}
        className="milkdrop-scene__canvas"
        hidden={failure !== null || unguarded}
        role="img"
        aria-label={name ? `MilkDrop görseli: ${name}` : "MilkDrop görseli"}
      />
      {/* Fren kurulamadıysa varsayılan modda frensiz görüntü (güvenli modda gösterilmez). */}
      <canvas
        ref={rawRef}
        className="milkdrop-scene__canvas milkdrop-scene__canvas--raw"
        hidden={failure !== null || !unguarded || safe}
        aria-hidden={!unguarded || safe}
      />
      {failure && (
        <div className="milkdrop-scene__message" role="status">
          <p>{failure}</p>
        </div>
      )}
    </div>
  );
}
