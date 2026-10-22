/**
 * Butterchurn 3.0.0-beta.5'in (MIT) kullandığımız kısmının türleri; paket tür dosyası taşımaz.
 * Kaynak: `node_modules/butterchurn/dist/butterchurn.js` (`Visualizer`, `Butterchurn`).
 */
declare module "butterchurn" {
  export interface ButterchurnAudioLevels {
    /** 1024 örnek, 0..255 (128 = sessizlik): karışım, sol, sağ. */
    timeByteArray: Uint8Array;
    timeByteArrayL: Uint8Array;
    timeByteArrayR: Uint8Array;
  }

  export interface ButterchurnOptions {
    width?: number;
    height?: number;
    pixelRatio?: number;
    textureRatio?: number;
    meshWidth?: number;
    meshHeight?: number;
    /** Preset denklemleri yalnızca WebAssembly'ye derlenir; JavaScript (`new Function`) yolu kapalı. */
    onlyUseWASM?: boolean;
    /** Rastgeleliği sabitler (global `Math.random`'u değiştirir; yalnızca denetimde). */
    deterministic?: boolean;
    seed?: number;
  }

  export interface ButterchurnVisualizer {
    /** Butterchurn'ün kendi WebGL2 tuvali (OffscreenCanvas varsa o; DOM'da değil). */
    readonly internalCanvas: HTMLCanvasElement | OffscreenCanvas;
    /**
     * Her `render`'da iç tuvalin kopyalandığı 2D bağlam. Lyraska bunu `null` yapar: görüntü
     * ekrana yalnızca parlaklık freninden geçerek ulaşır.
     */
    outputGl: CanvasRenderingContext2D | null;
    loadPreset(preset: object, blendTime?: number): Promise<void>;
    render(options: { audioLevels: ButterchurnAudioLevels; elapsedTime?: number }): unknown;
    setRendererSize(
      width: number,
      height: number,
      options?: { pixelRatio?: number; textureRatio?: number },
    ): void;
    /** İç tuvalin WebGL bağlamını bırakır (sahne kapanırken). */
    loseGLContext(): void;
  }

  const butterchurn: {
    createVisualizer(
      audioContext: AudioContext | null,
      canvas: HTMLCanvasElement | OffscreenCanvas,
      options?: ButterchurnOptions,
    ): ButterchurnVisualizer;
  };
  export default butterchurn;
}
