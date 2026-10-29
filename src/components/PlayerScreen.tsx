import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Dock } from "./Dock";
import { DropOverlay } from "./DropOverlay";
import { FlashWarning } from "./FlashWarning";
import { EqualizerPanel } from "./EqualizerPanel";
import { InfoStack, type UpNext } from "./InfoStack";
import { LibraryPanel } from "./LibraryPanel";
import { MarkerPanel } from "./MarkerPanel";
import { NowPlaying } from "./NowPlaying";
import { ErrorBoundary } from "./ErrorBoundary";
import { SceneGallery } from "./SceneGallery";
import { SceneStage } from "./SceneStage";
import { SettingsPanel } from "./SettingsPanel";
import { SyncPanel } from "./SyncPanel";
import { AbxPanel } from "./AbxPanel";
import { CloseIcon, LibraryIcon, LyraMark, SettingsIcon, SlidersIcon } from "./icons";
import {
  BROWSER_FALLBACK,
  getAppInfo,
  type AppInfo,
  type LibraryTrack,
  type KeyMap,
  type SongMap,
} from "../lib/backend";
import { CLASSIC_SCENES } from "../lib/scene";
import { fileStem, sceneCredits, trackTitle } from "../lib/format";
import { confidentDrops, themeAt } from "../lib/songMap";
import { timelineLayout, type TimelineLayout } from "../lib/timeline";
import { useDrawer, type Panel } from "../hooks/useDrawer";
import { useDropToLibrary } from "../hooks/useDropToLibrary";
import { useEqualizer } from "../hooks/useEqualizer";
import { useParametric } from "../hooks/useParametric";
import { useHeadphone } from "../hooks/useHeadphone";
import { useCrossfeed } from "../hooks/useCrossfeed";
import { useMapFile } from "../hooks/useMapFile";
import { useLyrics } from "../hooks/useLyrics";
import { LyricsOverlay } from "./LyricsOverlay";
import { lyricTime } from "../lib/lyrics";
import type { Lyrics } from "../lib/backend";
import { useIdle } from "../hooks/useIdle";
import { useKeyboardFocusWithin } from "../hooks/useKeyboardFocus";
import { usePlayback, useShuffleShortcut, type PlayOrder } from "../hooks/usePlayback";
import { useLivePosition, type PlayerControls } from "../hooks/usePlayer";
import { usePlaybackOptions } from "../hooks/usePlaybackOptions";
import { useScene } from "../hooks/useScene";
import { useScenePresets } from "../hooks/useScenePresets";
import { useBackgroundImage } from "../hooks/useBackgroundImage";
import { usePhotoParticles } from "../hooks/usePhotoParticles";
import { useMilkdrop } from "../hooks/useMilkdrop";
import { useSkyLook } from "../hooks/useSkyLook";
import { useCover, type CoverAlbum } from "../hooks/useCover";
import { useSongKey } from "../hooks/useSongKey";
import { useSongMap } from "../hooks/useSongMap";
import { useSync } from "../hooks/useSync";
import { useVisualSafe } from "../hooks/useVisualSafe";
import { useMarker } from "../hooks/useMarker";
import { useLibrary } from "../hooks/useLibrary";
import { useAbx } from "../hooks/useAbx";

const PANELS: [Panel, string][] = [
  ["library", "Kütüphane"],
  ["eq", "Ekolayzer"],
  ["marker", "İşaretle"],
  ["sync", "Senkron"],
  ["abx", "Kör test"],
  ["settings", "Ayarlar"],
];

/** Müzik çalarken fare bu kadar kıpırdamazsa düğmeler çekilir, yalnızca sahne kalır. */
const IDLE_MS = 4000;

/** Kütüphanede yolu verilen şarkı (arama sonucunda varsa). */
function libraryTrack(tracks: LibraryTrack[], path: string | null): LibraryTrack | null {
  return path === null ? null : (tracks.find((t) => t.path === path) ?? null);
}

/** Şarkının albümü (kapağı albüme seçilmişse büyük kapakta o görünür); etiketsizse `null`. */
function coverAlbum(
  track: { album: string | null; albumArtist: string | null; artist: string | null } | null,
): CoverAlbum | null {
  return track?.album ? { album: track.album, artist: track.albumArtist ?? track.artist } : null;
}

/**
 * Ana ekran: seçilen görsel sahne tüm pencereyi kaplar; şarkının adı, şarkı haritası
 * ve düğmeler sahnenin üstünde cam katmanlarda durur. Kütüphane, ekolayzer ve
 * diğer paneller sağdan açılan çekmecededir. Müzik çalarken fare bir süre
 * kıpırdamazsa düğmeler çekilir, yalnızca sahne kalır.
 */
export function PlayerScreen() {
  const [info, setInfo] = useState<AppInfo>(BROWSER_FALLBACK);
  const library = useLibrary();
  const equalizer = useEqualizer();
  const headphone = useHeadphone();
  const parametric = useParametric();
  const crossfeed = useCrossfeed();
  const visualSafe = useVisualSafe();
  const playbackOptions = usePlaybackOptions();
  const [scene, chooseScene] = useScene();
  const scenePresets = useScenePresets();
  const milkdrop = useMilkdrop(scene === "milkdrop");
  const background = useBackgroundImage(scene === "photo");
  const photoParticles = usePhotoParticles();
  const skyLook = useSkyLook();

  const playback = usePlayback(info.supportedExtensions);
  const { player, playList, upcoming } = playback;
  const { status } = player;
  // Ekolayzer, kulaklık düzeltmesi ya da crossfeed sesi değiştiriyorsa ekolayzer ışığı yanar.
  // Bit-perfect çalarken hiçbiri sese uygulanmaz.
  const bitPerfect = status.output?.bitPerfect ?? false;
  const soundShaped =
    (equalizer.active ||
      headphone.active ||
      crossfeed.active ||
      (parametric.active && !parametric.comparing)) &&
    !bitPerfect;
  const statusPath = status.track?.path ?? null;
  const playing = status.state === "playing";
  const credits = status.track ? sceneCredits(status.track) : null;
  const mapFile = useMapFile(statusPath, status.track ? trackTitle(status.track) : null);
  const songMap = useSongMap(statusPath, mapFile.revision);
  const songKey = useSongKey(statusPath, songMap?.sections.length ?? 0, mapFile.revision);
  const sync = useSync(
    player.openPath,
    player.positionNow,
    status.state === "ended" ? statusPath : null,
  );
  const marker = useMarker(statusPath, playing, player.positionNow, songMap, sync.delayMs);
  const lyrics = useLyrics(statusPath);
  // S karışık çalı açar/kapatır; işaretleme sürerken tuşlar işaretlemenindir.
  useShuffleShortcut(playback.toggleShuffle, player.available && !marker.recording);

  // Panelden ayrılınca işaretleme biter (Boşluk yine çal/duraklat olur), senkron ölçümü de.
  const { setRecording } = marker;
  const { finishCalibration } = sync;
  const onLeave = useCallback(
    (panel: Panel) => {
      if (panel === "marker") setRecording(false);
      if (panel === "sync") finishCalibration();
    },
    [setRecording, finishCalibration],
  );
  const drawer = useDrawer({ onLeave, escapeBusy: marker.recording });
  // Kör test: panel açık değilken süren test duraklatılır. Test çalan şarkıyı kapatır, bitince
  // kaldığı yerde geri açar: oynatıcı ekranı da güncellenir.
  const abx = useAbx(
    info.supportedExtensions,
    drawer.open && drawer.panel === "abx",
    player.refresh,
  );

  // Çalmaya başlayınca sahne ortaya çıksın; kütüphane düğmesiyle geri açılır.
  const { close: closeDrawer } = drawer;
  const playAndReveal = useCallback(
    (paths: string[], start?: string, order?: PlayOrder, startIndex?: number) => {
      if (paths.length === 0 && start === undefined) return;
      playList(paths, start, order, startIndex);
      closeDrawer();
    },
    [playList, closeDrawer],
  );
  const playPaths = (paths: string[], start?: string, order?: PlayOrder, startIndex?: number) =>
    playAndReveal(paths, start, order, startIndex);
  const playFromLibrary = (track: LibraryTrack, list: LibraryTrack[]) =>
    playAndReveal(
      list.map((t) => t.path),
      track.path,
    );
  const drop = useDropToLibrary(
    library.addDropped,
    useCallback((tracks: string[]) => playAndReveal(tracks, tracks[0]!), [playAndReveal]),
  );

  useEffect(() => {
    let cancelled = false;
    getAppInfo()
      .then((value) => !cancelled && setInfo(value))
      .catch(() => {
        /* Çekirdeğe ulaşılamazsa yedek bilgi gösterilmeye devam eder. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const idle = useIdle(IDLE_MS);
  // Klavyeyle seçilmiş bir düğme varken düğmeler çekilmez: odak görünmeyen düğmede kalırdı.
  const keyboardInChrome = useKeyboardFocusWithin(".chrome");
  const cinema = idle && playing && !drawer.open && !drop.dragging && !keyboardInChrome;

  // Son bilinen konum (saniyede birkaç kez güncellenir). Akıcı konum yalnızca `LiveChrome`'da:
  // ekranın geri kalanı her karede yeniden çizilmez.
  const position = player.position;
  const hasTrack = status.track !== null;
  const durationSecs = status.track?.durationSecs ?? null;
  // Arayüzün vurgu renkleri çalan bölümün temasına (gökyüzüyle aynı) yavaşça geçer.
  const theme = themeAt(songMap?.sections ?? [], position);
  const layout = useMemo(
    () =>
      songMap && durationSecs
        ? timelineLayout({
            durationSecs,
            sections: songMap.sections,
            // Güveni düşük drop şeritte de işaretlenmez (sayaç ve Görsel Yönetmen gibi).
            programDrops: confidentDrops(songMap),
            markedDrops: [],
          })
        : null,
    [songMap, durationSecs],
  );
  // Büyük kütüphanede aramayı her çizimde yapmamak için.
  const current = useMemo(
    () => libraryTrack(library.tracks, statusPath),
    [library.tracks, statusPath],
  );
  const upcomingTrack = useMemo(
    () => libraryTrack(library.tracks, upcoming),
    [library.tracks, upcoming],
  );
  const cover = useCover(statusPath, coverAlbum(status.track));
  const upcomingCover = useCover(upcoming, coverAlbum(upcomingTrack ?? null));
  const upNext: UpNext | null = upcoming
    ? {
        title: upcomingTrack?.title ?? fileStem(upcoming),
        artist: upcomingTrack?.artist ?? null,
        album: upcomingTrack?.album ?? null,
        cover: upcomingCover,
      }
    : null;

  // Odak yönetimi (ARA-06): çekmece açılınca odak seçili sekmeye gider; kapanınca onu açan
  // düğmeye döner (yoksa klavye kullanıcısı belgenin başından Tab'lamaya başlardı).
  // Kütüphane sekmesi tam ekran açılır; öteki paneller sağdaki çekmecede kalır.
  const libraryFull = drawer.open && drawer.panel === "library";
  // Tam ekran kütüphane alttaki çalma çubuğunun hemen üstünde biter. Çubuğun boyu değişir (şarkı
  // haritası şeridi, dar pencere): üst kenarı ölçülür, CSS değişkenine yazılır.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const main = mainRef.current;
    const dock = main?.querySelector<HTMLElement>(".dock");
    if (!main || !dock || !libraryFull) return;
    const update = () => {
      const space = main.getBoundingClientRect().bottom - dock.getBoundingClientRect().top;
      main.style.setProperty("--dock-space", `${Math.max(0, Math.round(space))}px`);
    };
    update();
    window.addEventListener("resize", update);
    if (typeof ResizeObserver === "undefined")
      return () => window.removeEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(dock);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [libraryFull]);
  const drawerTrigger = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(drawer.open);
  useEffect(() => {
    if (wasOpen.current === drawer.open) return;
    wasOpen.current = drawer.open;
    if (drawer.open) {
      document.getElementById(`drawer-tab-${drawer.panel}`)?.focus();
    } else {
      drawerTrigger.current?.focus();
    }
  }, [drawer.open, drawer.panel]);
  // Sekmelerde ok tuşları (ARIA sekme örüntüsü): ←/→ komşu sekme, Home/End uçlar.
  const onTabsKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = PANELS.findIndex(([id]) => id === drawer.panel);
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: PANELS.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = PANELS[(target + PANELS.length) % PANELS.length]![0];
    drawer.select(next);
    document.getElementById(`drawer-tab-${next}`)?.focus();
  };

  const chromeButton = (id: Panel, label: string, icon: ReactNode, led?: boolean) => (
    <button
      type="button"
      className={`icon-button${drawer.open && drawer.panel === id ? " is-active" : ""}`}
      aria-label={label}
      aria-expanded={drawer.open && drawer.panel === id}
      aria-controls="drawer"
      title={label}
      onClick={(event) => {
        drawerTrigger.current = event.currentTarget;
        drawer.toggle(id);
      }}
    >
      {icon}
      {led !== undefined && <span className={`led${led ? " is-on" : ""}`} aria-hidden />}
    </button>
  );

  return (
    <main
      ref={mainRef}
      className={`app${cinema ? " is-cinema" : ""}${drawer.open ? " has-drawer" : ""}${
        libraryFull ? " has-full-drawer" : ""
      }${status.state === "error" || player.error ? " is-error" : ""}`}
      data-theme={theme}
    >
      {/* Sahne çizilemezse yalnızca sahne yerine durgun gök kalır; başka sahne seçilince yeniden denenir. */}
      <ErrorBoundary
        key={`${scene}-${skyLook.look}`}
        name="Sahne"
        fallback={() => (
          <div className="stage" data-scene="error">
            <p className="stage__error" role="alert">
              Sahne çizilemedi; hata günlüğe yazıldı. Başka bir sahne seçebilirsiniz (1–9, 0).
            </p>
          </div>
        )}
      >
        <SceneStage
          scene={scene}
          playing={playing}
          hasTrack={hasTrack}
          safe={visualSafe.safe}
          skyLook={skyLook.look}
          looks={scenePresets.looks}
          milkdrop={milkdrop}
          background={background}
          particles={photoParticles.style}
          particleDensity={photoParticles.density}
          // Başlık etiketi yoksa (ör. yt-dlp'nin .webm'leri) dosya adı: "Lyraska" yazmasın.
          songTitle={credits?.title ?? null}
          songArtist={credits?.artist ?? null}
          title={
            status.track
              ? [status.track.artist, status.track.title].filter(Boolean).join(" · ")
              : null
          }
        />
      </ErrorBoundary>
      <div className="stage__shade" aria-hidden />

      {/* Üst çubuk ve çalma denetimleri de kendi hata sınırlarında (ARA-04): birinde çizim hatası
          olursa yalnızca o bölüm kapanır; sahne, kısayollar ve paneller sürer. */}
      <ErrorBoundary
        name="Üst çubuk"
        fallback={(retry) => (
          <header className="topbar chrome">
            <div className="app-alert" role="alert">
              <span>Üst çubuk çizilemedi; hata günlüğe yazıldı.</span>
              <button type="button" className="glass-button" onClick={retry}>
                Yeniden dene
              </button>
            </div>
          </header>
        )}
      >
        <header className="topbar chrome">
          <div className="brand" title={`Lyraska ${info.version}`}>
            <LyraMark />
            <span className="brand__name">Lyraska</span>
          </div>
          <nav className="scenes" aria-label="Sahne">
            {CLASSIC_SCENES.map(({ id, name }, index) => (
              <button
                key={id}
                type="button"
                className={`pill${scene === id ? " is-on" : ""}`}
                aria-pressed={scene === id}
                title={`${name} (${index + 1})`}
                onClick={() => chooseScene(id)}
              >
                {name}
              </button>
            ))}
            <SceneGallery
              scene={scene}
              onChoose={chooseScene}
              presets={scenePresets}
              milkdrop={milkdrop}
              background={background}
              particles={photoParticles}
            />
          </nav>
          <div className="topbar__actions">
            {chromeButton("library", "Kütüphane", <LibraryIcon />)}
            {chromeButton("eq", "Ekolayzer", <SlidersIcon />, soundShaped)}
            {chromeButton("settings", "Ayarlar", <SettingsIcon />)}
          </div>
        </header>
      </ErrorBoundary>

      {/* Kütüphane açılamadıysa çekmece kapalıyken de görünür; ayrıntı kütüphane panelinde. */}
      {library.unavailable && !(drawer.open && drawer.panel === "library") && (
        <div className="app-alert chrome" role="alert">
          <span>
            <strong>Kütüphane açılamadı.</strong> Müzik dosyalarınıza bir şey olmadı; şimdilik şarkı
            eklenemiyor.
          </span>
          <button type="button" className="glass-button" onClick={() => drawer.toggle("library")}>
            Ayrıntılar
          </button>
        </div>
      )}

      <ErrorBoundary
        name="Çalma denetimleri"
        fallback={(retry) => (
          <div className="lower">
            <div className="app-alert chrome" role="alert">
              <span>
                Çalma denetimleri çizilemedi; hata günlüğe yazıldı. Klavye kısayolları (Boşluk, ok
                tuşları) çalışır.
              </span>
              <button type="button" className="glass-button" onClick={retry}>
                Yeniden dene
              </button>
            </div>
          </div>
        )}
      >
        <LiveChrome
          player={player}
          album={status.track?.album ?? current?.album ?? null}
          queueLabel={playback.queueLabel}
          cover={cover}
          songMap={songMap}
          songKey={songKey}
          lyrics={lyrics.visible ? lyrics.lyrics : null}
          audioDelaySecs={sync.delayMs / 1000}
          soundShaped={soundShaped}
          safe={visualSafe.safe}
          next={upNext}
          layout={layout}
          canNext={playback.canNext}
          onPrevious={playback.previous}
          onNext={playback.next}
          shuffle={playback.shuffle}
          onToggleShuffle={playback.toggleShuffle}
        />
      </ErrorBoundary>

      {libraryFull && (
        <button
          type="button"
          className="library-backdrop"
          aria-label="Kütüphaneyi kapat, sahneye dön"
          tabIndex={-1}
          onClick={drawer.close}
        />
      )}
      <aside
        id="drawer"
        className={`drawer${drawer.open ? " is-open" : ""}${
          drawer.panel === "library" ? " is-full" : ""
        }`}
        aria-label="Paneller"
        aria-hidden={!drawer.open}
        inert={!drawer.open}
      >
        <div className="drawer__head">
          <div className="drawer__tabs" role="tablist" aria-label="Paneller" onKeyDown={onTabsKey}>
            {PANELS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`drawer-tab-${id}`}
                aria-controls={`drawer-panel-${id}`}
                aria-selected={drawer.panel === id}
                tabIndex={drawer.panel === id ? 0 : -1}
                className={`drawer__tab${drawer.panel === id ? " is-selected" : ""}`}
                onClick={() => drawer.select(id)}
              >
                {label}
                {id === "eq" && (
                  <span className={`led${soundShaped ? " is-on" : ""}`} aria-hidden />
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-button icon-button--small"
            aria-label="Paneli kapat"
            title="Paneli kapat (Esc)"
            onClick={drawer.close}
          >
            <CloseIcon />
          </button>
        </div>
        {/* Bütün paneller bağlı kalır: geçişte liste konumu ve seçim kaybolmaz. */}
        <div
          className="drawer__panel"
          role="tabpanel"
          id="drawer-panel-library"
          aria-labelledby="drawer-tab-library"
          hidden={drawer.panel !== "library"}
        >
          <ErrorBoundary name="Kütüphane">
            <LibraryPanel
              library={library}
              available={player.available}
              extensions={info.supportedExtensions}
              currentPath={statusPath}
              playing={playing}
              onPlay={playFromLibrary}
              onPlayPaths={playPaths}
            />
          </ErrorBoundary>
        </div>
        <div
          className="drawer__panel"
          role="tabpanel"
          id="drawer-panel-eq"
          aria-labelledby="drawer-tab-eq"
          hidden={drawer.panel !== "eq"}
        >
          <ErrorBoundary name="Ekolayzer">
            <EqualizerPanel
              equalizer={equalizer}
              headphone={headphone}
              parametric={parametric}
              crossfeed={crossfeed}
              bypassed={bitPerfect}
            />
          </ErrorBoundary>
        </div>
        <div
          className="drawer__panel"
          role="tabpanel"
          id="drawer-panel-marker"
          aria-labelledby="drawer-tab-marker"
          hidden={drawer.panel !== "marker"}
        >
          <ErrorBoundary name="İşaretleme">
            <MarkerPanel
              marker={marker}
              trackTitle={status.track ? trackTitle(status.track) : null}
              mapFile={mapFile}
              playing={playing}
              durationSecs={durationSecs}
            />
          </ErrorBoundary>
        </div>
        <div
          className="drawer__panel"
          role="tabpanel"
          id="drawer-panel-sync"
          aria-labelledby="drawer-tab-sync"
          hidden={drawer.panel !== "sync"}
        >
          <ErrorBoundary name="Senkron">
            <SyncPanel
              sync={sync}
              playing={playing}
              available={player.available}
              visible={drawer.open && drawer.panel === "sync"}
            />
          </ErrorBoundary>
        </div>
        <div
          className="drawer__panel"
          role="tabpanel"
          id="drawer-panel-abx"
          aria-labelledby="drawer-tab-abx"
          hidden={drawer.panel !== "abx"}
        >
          <ErrorBoundary name="Kör test">
            <AbxPanel abx={abx} available={player.available} />
          </ErrorBoundary>
        </div>
        <div
          className="drawer__panel"
          role="tabpanel"
          id="drawer-panel-settings"
          aria-labelledby="drawer-tab-settings"
          hidden={drawer.panel !== "settings"}
        >
          <ErrorBoundary name="Ayarlar">
            <SettingsPanel
              info={info}
              status={status}
              available={player.available}
              visualSafe={visualSafe}
              playback={playbackOptions}
              skyLook={skyLook}
              lyrics={lyrics}
            />
          </ErrorBoundary>
        </div>
      </aside>

      <DropOverlay dragging={drop.dragging} notice={drop.notice} />
      <FlashWarning
        safe={visualSafe.safe}
        ready={visualSafe.loaded}
        onEnableSafe={() => void visualSafe.setSafe(true)}
      />
    </main>
  );
}

interface LiveChromeProps {
  player: PlayerControls;
  album: string | null;
  queueLabel: string | null;
  cover: string | null;
  songMap: SongMap | null;
  songKey: KeyMap | null;
  /** Gösterilecek şarkı sözleri (kapalıysa ya da yoksa `null`). */
  lyrics: Lyrics | null;
  /** Ses aygıtının ek gecikmesi (saniye): sözler görseller gibi bu kadar geriden okunur (`lyricTime`). */
  audioDelaySecs: number;
  soundShaped: boolean;
  safe: boolean;
  next: UpNext | null;
  layout: TimelineLayout | null;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  shuffle: boolean;
  onToggleShuffle: () => void;
}

/**
 * Akıcı konumu gösteren cam katmanlar: büyük başlık, bilgi kartları (drop sayacı) ve alttaki
 * şarkı haritası şeridi. Çalarken her karede yalnızca bunlar yeniden çizilir.
 */
function LiveChrome({
  player,
  album,
  queueLabel,
  cover,
  songMap,
  songKey,
  lyrics,
  audioDelaySecs,
  soundShaped,
  safe,
  next,
  layout,
  canNext,
  onPrevious,
  onNext,
  shuffle,
  onToggleShuffle,
}: LiveChromeProps) {
  const position = useLivePosition(player);
  const { status } = player;
  return (
    <>
      <LyricsOverlay
        lyrics={lyrics}
        positionSecs={lyricTime(position, audioDelaySecs)}
        safe={safe}
      />
      <div className="lower">
        <div className="hero chrome">
          <NowPlaying
            status={{ ...status, positionSecs: position }}
            album={album}
            queueLabel={queueLabel}
            error={player.error}
            available={player.available}
            cover={cover}
          />
          <InfoStack
            status={status}
            positionSecs={position}
            songMap={songMap}
            songKey={songKey}
            soundShaped={soundShaped}
            safe={safe}
            next={next}
          />
        </div>

        <Dock
          player={player}
          position={position}
          layout={layout}
          canNext={canNext}
          onPrevious={onPrevious}
          onNext={onNext}
          shuffle={shuffle}
          onToggleShuffle={onToggleShuffle}
        />
      </div>
    </>
  );
}
