import { DriveScene } from "./DriveScene";
import { HighwayScene } from "./HighwayScene";
import { LightShowScene } from "./LightShowScene";
import { MilkDropScene } from "./MilkDropScene";
import { PhotoScene } from "./PhotoScene";
import { ShaderScene } from "./ShaderScene";
import { SkyScene } from "./SkyScene";
import { SpectrumDemo } from "./SpectrumDemo";
import { SpectrumView } from "./SpectrumView";
import { VuScene } from "./VuScene";
import type { BackgroundImageControls } from "../hooks/useBackgroundImage";
import type { MilkdropControls } from "../hooks/useMilkdrop";
import type { ParticleStyle } from "../lib/photoParticles";
import type { KeyMap, SongMap } from "../lib/backend";
import type { Intensity } from "../lib/lightShow";
import type { Scene } from "../lib/scene";
import type { SceneLooks } from "../lib/sceneLook";
import { isShaderScene } from "../lib/shaderScene";
import type { SkyLook } from "../lib/sky";

const SPECTRUM_BANDS = 16;
const SPECTRUM_ROWS = 10;

export interface SceneStageProps {
  scene: Scene;
  playing: boolean;
  hasTrack: boolean;
  /** Epilepsi güvenli modu. */
  safe: boolean;
  /** Gece göğünün manzarası. */
  skyLook: SkyLook;
  /** Çalan şarkının adı (gece sürüşünde teybin ekranında kayar). */
  title?: string | null;
  /** Galeri sahnelerinin görünümleri (hız, palet). */
  looks?: SceneLooks;
  /** MilkDrop sahnesinin denetimleri (klasör, görseller); galeri paneliyle paylaşılır. */
  milkdrop: MilkdropControls;
  /** "Kendi resmin" sahnesinin resmi ve çalan şarkının adı ile sanatçısı. */
  background?: BackgroundImageControls;
  songTitle?: string | null;
  songArtist?: string | null;
  /** "Kendi resmin" sahnesinin parçacıkları. */
  particles?: ParticleStyle;
  particleDensity?: number;
  /** "Kendi resmin": zamanlı sözler gösteriliyor mu ve söz satırının yeri (`PhotoScene`). */
  hasLyrics?: boolean;
  lyricsSlot?: (element: HTMLElement | null) => void;
  /** Çalan şarkının haritası ve tonu (Işık Ustası'nın kurgusu ve renkleri). */
  songMap?: SongMap | null;
  songKey?: KeyMap | null;
  /** Işık Ustası'nın yoğunluğu. */
  intensity?: Intensity;
}

/** Tüm pencereyi kaplayan görsel sahne. Sahne değişince yenisi yavaşça belirir. */
export function SceneStage({
  scene,
  playing,
  hasTrack,
  safe,
  skyLook,
  title = null,
  looks,
  milkdrop,
  background,
  songTitle = null,
  songArtist = null,
  particles,
  particleDensity,
  hasLyrics,
  lyricsSlot,
  songMap = null,
  songKey = null,
  intensity = "normal",
}: SceneStageProps) {
  return (
    <div className="stage" data-scene={scene}>
      {isShaderScene(scene) ? (
        // Her sahne kendi tuvalinde açılır: yenisi yavaşça belirir.
        <ShaderScene key={scene} id={scene} playing={playing} safe={safe} look={looks?.[scene]} />
      ) : scene === "lightshow" ? (
        <LightShowScene
          playing={playing}
          safe={safe}
          songMap={songMap}
          songKey={songKey}
          intensity={intensity}
        />
      ) : scene === "photo" ? (
        <PhotoScene
          playing={playing}
          safe={safe}
          image={background ? background.url : null}
          title={songTitle}
          artist={songArtist}
          onChooseImage={background ? () => void background.choose() : undefined}
          particles={particles}
          particleDensity={particleDensity}
          hasLyrics={hasLyrics}
          lyricsSlot={lyricsSlot}
        />
      ) : scene === "milkdrop" ? (
        <MilkDropScene playing={playing} safe={safe} controls={milkdrop} />
      ) : scene === "vu" ? (
        <VuScene playing={playing} safe={safe} />
      ) : scene === "highway" ? (
        <HighwayScene playing={playing} safe={safe} />
      ) : scene === "drive" ? (
        <DriveScene playing={playing} safe={safe} title={title} />
      ) : scene === "spectrum" ? (
        <div className="spectrum-scene">
          {/* Şarkı açıkken gerçek spektrum; boştayken gösteri animasyonu. */}
          {hasTrack ? (
            <SpectrumView
              bands={SPECTRUM_BANDS}
              rows={SPECTRUM_ROWS}
              playing={playing}
              safe={safe}
              className="vfd vfd--primary"
            />
          ) : (
            <>
              <SpectrumDemo
                bands={SPECTRUM_BANDS}
                rows={SPECTRUM_ROWS}
                safe={safe}
                className="vfd vfd--primary"
              />
              <p className="spectrum-scene__demo">Gösteri · şarkı açınca gerçek spektrum</p>
            </>
          )}
        </div>
      ) : (
        <SkyScene playing={playing} safe={safe} look={skyLook} />
      )}
    </div>
  );
}
