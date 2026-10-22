import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { previewEqState } from "./eq";
import type { AbxChoice } from "./bindings/AbxChoice";
import type { AbxResult } from "./bindings/AbxResult";
import type { AbxSource } from "./bindings/AbxSource";
import type { AbxStatus } from "./bindings/AbxStatus";
import type { Annotation } from "./bindings/Annotation";
import type { AppInfo } from "./bindings/AppInfo";
import type { BeatEvaluation } from "./bindings/BeatEvaluation";
import type { BeatFrame } from "./bindings/BeatFrame";
import type { ButterchurnPreset } from "./bindings/ButterchurnPreset";
import type { ButterchurnShape } from "./bindings/ButterchurnShape";
import type { ButterchurnWave } from "./bindings/ButterchurnWave";
import type { CalibrationTrack } from "./bindings/CalibrationTrack";
import type { CrossfeedPreset } from "./bindings/CrossfeedPreset";
import type { CrossfeedSettings } from "./bindings/CrossfeedSettings";
import type { CrossfeedState } from "./bindings/CrossfeedState";
import type { DesignMethod } from "./bindings/DesignMethod";
import type { DirectorFrame } from "./bindings/DirectorFrame";
import type { DropOutcome } from "./bindings/DropOutcome";
import type { EqSettings } from "./bindings/EqSettings";
import type { EqState } from "./bindings/EqState";
import type { HeadphoneFilter } from "./bindings/HeadphoneFilter";
import type { HeadphoneProfile } from "./bindings/HeadphoneProfile";
import type { HeadphoneState } from "./bindings/HeadphoneState";
import type { ImportedMapStatus } from "./bindings/ImportedMapStatus";
import type { MapSource } from "./bindings/MapSource";
import type { FilterKind } from "./bindings/FilterKind";
import type { ParametricBand } from "./bindings/ParametricBand";
import type { ParametricSettings } from "./bindings/ParametricSettings";
import type { ParametricState } from "./bindings/ParametricState";
import type { KeyMap } from "./bindings/KeyMap";
import type { KeyRelation } from "./bindings/KeyRelation";
import type { LibraryFolder } from "./bindings/LibraryFolder";
import type { LibraryStatus } from "./bindings/LibraryStatus";
import type { LibraryTrack } from "./bindings/LibraryTrack";
import type { LyricLine } from "./bindings/LyricLine";
import type { LyricWord } from "./bindings/LyricWord";
import type { Lyrics } from "./bindings/Lyrics";
import type { LyricsSource } from "./bindings/LyricsSource";
import type { MarkedKey } from "./bindings/MarkedKey";
import type { MilkdropEntry } from "./bindings/MilkdropEntry";
import type { MilkdropFolder } from "./bindings/MilkdropFolder";
import type { MilkdropPreset } from "./bindings/MilkdropPreset";
import type { MusicalKey } from "./bindings/MusicalKey";
import type { PlaybackOptions } from "./bindings/PlaybackOptions";
import type { PlaybackState } from "./bindings/PlaybackState";
import type { PlaybackStatus } from "./bindings/PlaybackStatus";
import type { ScanProgress } from "./bindings/ScanProgress";
import type { SignalPath } from "./bindings/SignalPath";
import type { SongMap } from "./bindings/SongMap";
import type { TrackInfo } from "./bindings/TrackInfo";
import type { VisualFrame } from "./bindings/VisualFrame";

// Rust → arayüz veri tipleri Rust tanımlarından üretilir (ts-rs: `cd src-tauri && cargo test`,
// çıktı `./bindings/`). Elle yazılmaz; CI üretilenin depodakiyle aynı olduğunu denetler.
export type {
  AbxChoice,
  AbxResult,
  AbxSource,
  AbxStatus,
  Annotation,
  AppInfo,
  BeatEvaluation,
  BeatFrame,
  ButterchurnPreset,
  ButterchurnShape,
  ButterchurnWave,
  CalibrationTrack,
  CrossfeedPreset,
  CrossfeedSettings,
  CrossfeedState,
  DesignMethod,
  DirectorFrame,
  DropOutcome,
  EqSettings,
  EqState,
  HeadphoneFilter,
  HeadphoneProfile,
  HeadphoneState,
  ImportedMapStatus,
  MapSource,
  FilterKind,
  ParametricBand,
  ParametricSettings,
  ParametricState,
  KeyMap,
  KeyRelation,
  LibraryFolder,
  LibraryStatus,
  LibraryTrack,
  LyricLine,
  LyricWord,
  Lyrics,
  LyricsSource,
  MarkedKey,
  MilkdropEntry,
  MilkdropFolder,
  MilkdropPreset,
  MusicalKey,
  PlaybackOptions,
  PlaybackState,
  PlaybackStatus,
  ScanProgress,
  SignalPath,
  SongMap,
  TrackInfo,
  VisualFrame,
};

/** Çalan şarkının yapısı; analiz bitmediyse `null`. */
/** Şarkının içindeki kapak resmi (`data:` adresi); yoksa ya da tarayıcı önizlemesinde `null`. */
export async function getTrackCover(path: string): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("track_cover", { path });
}

/**
 * Şarkının sözleri: yanındaki `.lrc` dosyası ya da şarkıya gömülü sözler; yoksa ya da tarayıcı
 * önizlemesinde `null`. Sözler yalnızca kullanıcının kendi dosyalarından okunur.
 */
export async function getTrackLyrics(path: string): Promise<Lyrics | null> {
  if (!isTauri()) return null;
  return invoke<Lyrics | null>("track_lyrics", { path });
}

export async function getSongMap(): Promise<SongMap | null> {
  if (!isTauri()) return null;
  return invoke<SongMap | null>("song_map");
}

/** Çalan şarkının tonu ve tonu farklı bölümleri; ton analizi bitmediyse `null`. */
export async function getSongKey(): Promise<KeyMap | null> {
  if (!isTauri()) return null;
  return invoke<KeyMap | null>("song_key");
}

export const EMPTY_LIBRARY: LibraryStatus = {
  folders: [],
  trackCount: 0,
  analyzed: 0,
  scan: { scanning: false, found: 0, processed: 0, current: null },
  problems: [],
};

export const IDLE_STATUS: PlaybackStatus = {
  state: "idle",
  track: null,
  positionSecs: 0,
  underruns: 0,
  error: null,
  bpm: null,
  output: null,
};

/** Tarayıcıda (Tauri dışında) geliştirme yaparken kullanılan yedek bilgi. */
export const BROWSER_FALLBACK: AppInfo = {
  name: "Lyraska",
  version: __APP_VERSION__,
  commit: "tarayıcı",
  phase: "Faz 2",
  audioEngine: "tarayıcı önizlemesi",
  analysis: "tarayıcı önizlemesi",
  visualBridge: "tarayıcı önizlemesi",
  supportedExtensions: [],
};

/** Program Tauri penceresinde mi çalışıyor? (Tarayıcı önizlemesinde ses çalınamaz.) */
export function isDesktop(): boolean {
  return isTauri();
}

/** Program bilgisini Rust çekirdeğinden alır. */
export async function getAppInfo(): Promise<AppInfo> {
  if (!isTauri()) return BROWSER_FALLBACK;
  return invoke<AppInfo>("app_info");
}

/** Kör test kurulu değilken çekirdeğin döndürdüğü durum (tarayıcı önizlemesinde de). */
export const ABX_INACTIVE: AbxStatus = {
  active: false,
  aName: "",
  bName: "",
  startSecs: 0,
  clipSecs: 0,
  positionSecs: 0,
  playing: null,
  answered: 0,
  total: 0,
  result: null,
  levelDiffDb: 0,
  offsetMs: 0,
  similarity: 0,
  sampleRate: 0,
  error: null,
};

export interface AbxRequest {
  a: string;
  b: string;
  startSecs: number;
  clipSecs: number;
  trials: number;
}

/**
 * Kör dinleme testini (ABX) kurar: iki dosyanın aynı bölümü belleğe çözülür, hizalanır ve ses
 * yüksekliği eşitlenir. Çalan şarkı durur; test bitince kaldığı yerde duraklatılmış açılır.
 */
export function abxStart(request: AbxRequest): Promise<AbxStatus> {
  return invoke<AbxStatus>("abx_start", {
    a: request.a,
    b: request.b,
    startSecs: request.startSecs,
    clipSecs: request.clipSecs,
    trials: request.trials,
  });
}

/** Testte A, B ya da X'i çalar (aynı konumdan, kısa geçişle). */
export function abxSelect(choice: AbxChoice): Promise<AbxStatus> {
  return invoke<AbxStatus>("abx_select", { choice });
}

export function abxPause(): Promise<AbxStatus> {
  return invoke<AbxStatus>("abx_pause");
}

/** "X, A'dır" ya da "X, B'dir". */
export function abxAnswer(guess: AbxSource): Promise<AbxStatus> {
  return invoke<AbxStatus>("abx_answer", { guess });
}

export async function abxStatus(): Promise<AbxStatus> {
  if (!isTauri()) return ABX_INACTIVE;
  return invoke<AbxStatus>("abx_status");
}

export function abxStop(): Promise<AbxStatus> {
  return invoke<AbxStatus>("abx_stop");
}

/** Kör test için tek bir ses dosyası seçtirir. */
export async function pickAbxFile(label: string, extensions: string[]): Promise<string | null> {
  const selected = await open({
    title: `${label} dosyasını seçin`,
    multiple: false,
    directory: false,
    filters: extensions.length > 0 ? [{ name: "Ses dosyaları", extensions }] : undefined,
  });
  return typeof selected === "string" ? selected : null;
}

/** "Dosya aç" penceresini gösterir; seçilen dosyanın yolunu ya da `null` döndürür. */
export async function pickAudioFile(extensions: string[]): Promise<string | null> {
  const selected = await open({
    title: "Şarkı seç",
    multiple: false,
    directory: false,
    filters: extensions.length > 0 ? [{ name: "Ses dosyaları", extensions }] : undefined,
  });
  return typeof selected === "string" ? selected : null;
}

export function openTrack(path: string): Promise<TrackInfo> {
  return invoke<TrackInfo>("open_track", { path });
}

export function togglePlayback(): Promise<PlaybackStatus> {
  return invoke<PlaybackStatus>("toggle_playback");
}

export function stopPlayback(): Promise<PlaybackStatus> {
  return invoke<PlaybackStatus>("stop_playback");
}

/** Şarkının kayıtlı işaretleri (yoksa `null`). Tarayıcı önizlemesinde hep `null`. */
export async function getAnnotation(path: string): Promise<Annotation | null> {
  if (!isTauri()) return null;
  return invoke<Annotation | null>("annotation_get", { path });
}

/** İşaretleri kaydeder; yazılan dosyanın yolunu döndürür. */
export async function saveAnnotation(
  path: string,
  beats: number[],
  drops: number[],
  key: MarkedKey | null = null,
): Promise<string> {
  return invoke<string>("annotation_save", { path, beats, drops, key });
}

/** Kayıtlı işaretleri programın beat analiziyle karşılaştırır (birkaç saniye sürer). */
export async function evaluateAnnotation(path: string): Promise<Annotation> {
  return invoke<Annotation>("annotation_evaluate", { path });
}

export async function openAnnotationFolder(): Promise<void> {
  await invoke("annotation_open_folder");
}

/** Arayüzde oluşan hatayı çekirdeğin günlüğüne yazar (tarayıcı önizlemesinde yok sayılır). */
export async function logFrontendError(message: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("log_frontend_error", { message });
}

/** Hata günlüğünü dosya gezgininde seçili olarak gösterir. */
export async function openLog(): Promise<void> {
  await invoke("open_log");
}

/** Boşluksuz geçiş için sıradaki şarkıyı çekirdeğe bildirir (`null`: sıra yok). */
export async function setNextTrack(path: string | null): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_next_track", { path });
}

export function seekPlayback(seconds: number): Promise<PlaybackStatus> {
  return invoke<PlaybackStatus>("seek_playback", { seconds });
}

/** Şu an duyulan anın görsel verisi; analiz o ana yetişmediyse `null`. */
export function getVisualFrame(): Promise<VisualFrame | null> {
  return invoke<VisualFrame | null>("visual_frame");
}

/** Dalga biçimi yanıtının uzunluğu: karışım, sol, sağ (her biri 1024 örnek). */
export const WAVEFORM_BYTES = 3 * 1024;

/**
 * Şu an duyulan anın ham dalga biçimi (MilkDrop sahnesi): 3 × 1024 bayt — karışım, sol, sağ;
 * 44,1 kHz; 0..255, 128 = sessizlik (WebAudio `getByteTimeDomainData` biçimi). Görsel karelerle
 * aynı an (gecikme telafili). Duraklatılmışsa ya da şarkı bittiyse hepsi 128; çalan şarkı yoksa
 * ya da tarayıcı önizlemesinde `null`. Çekirdek ham bayt döndürür (JSON değil).
 */
export async function getVisualWaveform(): Promise<Uint8Array | null> {
  if (!isTauri()) return null;
  const bytes = await invoke<ArrayBuffer | number[]>("visual_waveform");
  const array = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
  return array.length === WAVEFORM_BYTES ? array : null;
}

/** MilkDrop klasörü seçilmemişken (ve tarayıcı önizlemesinde) durum. */
export const NO_MILKDROP_FOLDER: MilkdropFolder = {
  folder: null,
  presets: [],
  truncated: false,
  error: null,
};

/**
 * MilkDrop sahnesi: hatırlanan klasör ve içindeki `.milk` görselleri. Lyraska hazır görsel
 * içermez; kullanıcı kendi klasörünü seçer.
 */
export async function getMilkdropFolder(): Promise<MilkdropFolder> {
  if (!isTauri()) return NO_MILKDROP_FOLDER;
  return invoke<MilkdropFolder>("milkdrop_list");
}

/** MilkDrop klasörünü seçer (hatırlanır) ve içindeki görselleri döndürür. */
export function setMilkdropFolder(path: string): Promise<MilkdropFolder> {
  return invoke<MilkdropFolder>("milkdrop_set_folder", { path });
}

/** Seçilen klasördeki bir görseli Butterchurn biçiminde açar (çekirdek `.milk`'i çevirir). */
export function loadMilkdropPreset(path: string): Promise<MilkdropPreset> {
  return invoke<MilkdropPreset>("milkdrop_load", { path });
}

/** MilkDrop görsellerinin klasörünü seçtirir; seçilen klasörün yolu ya da `null`. */
export async function pickMilkdropFolder(): Promise<string | null> {
  if (!isTauri()) return null;
  const selected = await open({
    title: "MilkDrop görsellerinin (.milk) klasörünü seçin",
    multiple: false,
    directory: true,
  });
  return typeof selected === "string" ? selected : null;
}

export function getPlaybackStatus(): Promise<PlaybackStatus> {
  return invoke<PlaybackStatus>("playback_status");
}

/**
 * Şarkı seçme penceresini gösterir (birden fazla seçilebilir); seçilen dosyaların
 * yollarını döndürür (vazgeçilirse boş liste).
 */
export async function pickAudioFiles(extensions: string[]): Promise<string[]> {
  const selected = await open({
    title: "Kütüphaneye eklenecek şarkıları seçin (birden fazla seçebilirsiniz)",
    multiple: true,
    directory: false,
    filters: extensions.length > 0 ? [{ name: "Ses dosyaları", extensions }] : undefined,
  });
  if (Array.isArray(selected)) return selected;
  return typeof selected === "string" ? [selected] : [];
}

/**
 * Klasör seçme penceresinin başlığı. Windows bu pencerede dosyaları göstermez;
 * yalnızca şarkı içeren bir klasöre girince "öğe yok" yazar. Kullanıcı bunu hata
 * sanmasın diye ne yapacağı başlıkta yazar.
 */
export const PICK_FOLDER_TITLE =
  "Müzik klasörünü seçin — şarkılar bu pencerede görünmez; klasöre girip “Klasör seç”e basın";

/** Klasör seçme penceresini gösterir; seçilen klasörün yolunu ya da `null` döndürür. */
export async function pickFolder(): Promise<string | null> {
  const selected = await open({ title: PICK_FOLDER_TITLE, multiple: false, directory: true });
  return typeof selected === "string" ? selected : null;
}

export function getLibraryStatus(): Promise<LibraryStatus> {
  return invoke<LibraryStatus>("library_status");
}

export function addLibraryFolder(path: string): Promise<LibraryStatus> {
  return invoke<LibraryStatus>("library_add_folder", { path });
}

/**
 * Pencereye bırakılanları kütüphaneye ekler. Dosya mı klasör mü olduğuna çekirdek
 * diskte bakar; çalınacak şarkıları ve sorunları döndürür.
 */
export function addDroppedPaths(paths: string[]): Promise<DropOutcome> {
  return invoke<DropOutcome>("library_add_dropped", { paths });
}

export function removeLibraryFolder(id: number): Promise<LibraryStatus> {
  return invoke<LibraryStatus>("library_remove_folder", { id });
}

export function rescanLibrary(): Promise<LibraryStatus> {
  return invoke<LibraryStatus>("library_rescan");
}

export function searchLibrary(query: string): Promise<LibraryTrack[]> {
  return invoke<LibraryTrack[]>("library_search", { query });
}

/** Ekolayzer durumu. Tarayıcı önizlemesinde yaklaşık bir eğri hesaplanır. */
export async function getEqualizer(): Promise<EqState> {
  if (!isTauri()) {
    return previewEqState({
      enabled: true,
      gainsDb: Array(10).fill(0),
      bassDb: 0,
      smallSpeaker: false,
      bassDepth: 0,
      bassPunch: 0,
    });
  }
  return invoke<EqState>("equalizer_get");
}

/** Ekolayzer ayarlarını uygular ve kaydeder; uygulanan eğriyi döndürür. */
export async function setEqualizer(settings: EqSettings): Promise<EqState> {
  if (!isTauri()) return previewEqState(settings);
  return invoke<EqState>("equalizer_set", { settings });
}

/** Epilepsi güvenli modu açık mı. Tarayıcı önizlemesinde kapalı başlar. */
export async function getVisualSafe(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("visual_safe_get");
}

/** Epilepsi güvenli modunu açar/kapatır ve kaydeder; uygulanan değeri döndürür. */
export async function setVisualSafe(enabled: boolean): Promise<boolean> {
  if (!isTauri()) return enabled;
  return invoke<boolean>("visual_safe_set", { enabled });
}

/** Çalma seçenekleri (ses yüksekliği eşitlemesi, bit-perfect). Tarayıcı önizlemesinde varsayılanlar. */
export async function getPlaybackOptions(): Promise<PlaybackOptions> {
  if (!isTauri()) return { normalize: true, bitPerfect: false };
  return invoke<PlaybackOptions>("playback_options_get");
}

/** Çalma seçeneklerini uygular ve kaydeder; uygulananı döndürür. */
export async function setPlaybackOptions(options: PlaybackOptions): Promise<PlaybackOptions> {
  if (!isTauri()) return options;
  return invoke<PlaybackOptions>("playback_options_set", { options });
}

/** Ses aygıtının ek gecikmesi (ms). Tarayıcı önizlemesinde 0. */
export async function getAudioDelay(): Promise<number> {
  if (!isTauri()) return 0;
  return invoke<number>("audio_delay_get");
}

/** Ses gecikmesini uygular ve kaydeder; uygulanan (sınırlanmış) değeri döndürür. */
export async function setAudioDelay(ms: number): Promise<number> {
  if (!isTauri()) return ms;
  return invoke<number>("audio_delay_set", { ms });
}

export function getCalibrationTrack(): Promise<CalibrationTrack> {
  return invoke<CalibrationTrack>("calibration_track");
}

export const NO_HEADPHONE: HeadphoneState = {
  enabled: false,
  profile: null,
  curveHz: [],
  curveDb: [],
};

/** Kulaklık düzeltmesi. Tarayıcı önizlemesinde profil yoktur. */
export async function getHeadphone(): Promise<HeadphoneState> {
  if (!isTauri()) return NO_HEADPHONE;
  return invoke<HeadphoneState>("headphone_get");
}

/** AutoEq profil dosyasını (ParametricEQ.txt) yükler ve düzeltmeyi açar. */
export async function importHeadphoneProfile(path: string): Promise<HeadphoneState> {
  return invoke<HeadphoneState>("headphone_import", { path });
}

export async function setHeadphoneEnabled(enabled: boolean): Promise<HeadphoneState> {
  return invoke<HeadphoneState>("headphone_set_enabled", { enabled });
}

export async function clearHeadphone(): Promise<HeadphoneState> {
  return invoke<HeadphoneState>("headphone_clear");
}

/** Kulaklık profili seçme penceresi; seçilen dosyanın yolu ya da `null`. */
export async function pickHeadphoneProfile(): Promise<string | null> {
  const selected = await open({
    title: "AutoEq kulaklık profilini seçin (ParametricEQ.txt)",
    multiple: false,
    directory: false,
    filters: [{ name: "AutoEq parametrik profil", extensions: ["txt"] }],
  });
  return typeof selected === "string" ? selected : null;
}

/** Elle parametrik ekolayzer. Tarayıcı önizlemesinde `null`: eğriyi arayüz yaklaşık çizer. */
export async function getParametric(): Promise<ParametricState | null> {
  if (!isTauri()) return null;
  return invoke<ParametricState>("parametric_get");
}

export async function setParametric(settings: ParametricSettings): Promise<ParametricState | null> {
  if (!isTauri()) return null;
  return invoke<ParametricState>("parametric_set", { settings });
}

/** Karşılaştırma (A/B): açıkken parametrik ekolayzer atlanır, ses eşit yükseklikte çalar. */
export async function setParametricCompare(compare: boolean): Promise<ParametricState | null> {
  if (!isTauri()) return null;
  return invoke<ParametricState>("parametric_compare", { compare });
}

/** Equalizer APO biçimindeki dosyayı (AutoEq, REW, Equalizer APO) yükler. */
export async function importParametric(path: string): Promise<ParametricState> {
  return invoke<ParametricState>("parametric_import", { path });
}

/** Ayarı Equalizer APO biçiminde dosyaya yazar. */
export async function exportParametric(path: string): Promise<void> {
  return invoke<void>("parametric_export", { path });
}

/** Parametrik ekolayzer dosyası seçme penceresi. */
export async function pickParametricFile(): Promise<string | null> {
  const selected = await open({
    title: "Equalizer APO biçiminde ekolayzer dosyası seçin",
    multiple: false,
    directory: false,
    filters: [{ name: "Equalizer APO / AutoEq / REW", extensions: ["txt"] }],
  });
  return typeof selected === "string" ? selected : null;
}

/** Kaydetme penceresi; seçilen yol ya da `null`. */
export async function pickParametricSavePath(): Promise<string | null> {
  const path = await save({
    title: "Parametrik ekolayzeri kaydet (Equalizer APO biçimi)",
    defaultPath: "Lyraska ParametricEQ.txt",
    filters: [{ name: "Equalizer APO", extensions: ["txt"] }],
  });
  return path ?? null;
}

/** Crossfeed (kulaklıkta hoparlörden dinler gibi). Tarayıcı önizlemesinde `null`: arayüz çizer. */
export async function getCrossfeed(): Promise<CrossfeedState | null> {
  if (!isTauri()) return null;
  return invoke<CrossfeedState>("crossfeed_get");
}

/** Crossfeed ayarını uygular ve kaydeder; uygulanan (sınırlara çekilmiş) durumu döndürür. */
export async function setCrossfeed(settings: CrossfeedSettings): Promise<CrossfeedState | null> {
  if (!isTauri()) return null;
  return invoke<CrossfeedState>("crossfeed_set", { settings });
}

/**
 * Şarkı haritasını dosyaya yazar (açık biçim; ses içermez). İşaretlenmiş vuruş, drop ve ton
 * analizinkinin yerine geçer.
 */
export async function exportSongMap(path: string, target: string): Promise<void> {
  return invoke<void>("song_map_export", { path, target });
}

/** Şarkı haritası dosyasını şarkıya uygular; ses parmak izi tutmazsa hata verir. */
export async function importSongMap(path: string, file: string): Promise<ImportedMapStatus> {
  return invoke<ImportedMapStatus>("song_map_import", { path, file });
}

/** Şarkıya içe aktarılmış ve uygulanan harita; yoksa ya da tarayıcı önizlemesinde `null`. */
export async function getImportedSongMap(path: string): Promise<ImportedMapStatus | null> {
  if (!isTauri()) return null;
  return invoke<ImportedMapStatus | null>("song_map_imported", { path });
}

/** İçe aktarılan haritayı kaldırır: programın analizi geri gelir. */
export async function removeSongMap(path: string): Promise<void> {
  return invoke<void>("song_map_remove", { path });
}

/** Şarkı haritası dosyası seçme penceresi. */
export async function pickSongMapFile(): Promise<string | null> {
  const selected = await open({
    title: "Lyraska şarkı haritası seçin",
    multiple: false,
    directory: false,
    filters: [{ name: "Lyraska şarkı haritası", extensions: ["json"] }],
  });
  return typeof selected === "string" ? selected : null;
}

/** Şarkı haritasını kaydetme penceresi; seçilen yol ya da `null`. */
export async function pickSongMapSavePath(defaultName: string): Promise<string | null> {
  const path = await save({
    title: "Şarkı haritasını kaydet",
    defaultPath: defaultName,
    filters: [{ name: "Lyraska şarkı haritası", extensions: ["json"] }],
  });
  return path ?? null;
}

/** Pencereye dosya sürükleme olaylarını dinleyen işlevler. */
export interface DragDropHandlers {
  /** Dosyalar pencerenin üstüne geldi (`true`) ya da gitti/bırakıldı (`false`). */
  onHover: (hovering: boolean) => void;
  /** Dosyalar bırakıldı. */
  onDrop: (paths: string[]) => void;
}

/** Pencereye sürüklenen dosyaları dinler. Dinlemeyi bırakmak için dönen fonksiyon çağrılır. */
export async function onDragDrop(handlers: DragDropHandlers): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  return getCurrentWebview().onDragDropEvent((event) => {
    switch (event.payload.type) {
      case "enter":
      case "over":
        handlers.onHover(true);
        break;
      case "leave":
        handlers.onHover(false);
        break;
      case "drop":
        handlers.onHover(false);
        handlers.onDrop(event.payload.paths);
        break;
    }
  });
}

/** Tauri komutlarından gelen hatayı (genellikle Türkçe metin) okunur hale getirir. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Bilinmeyen bir hata oluştu.";
}
