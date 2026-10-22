/**
 * MilkDrop sahnesinin saf hesapları: ne zaman başka görsele geçileceği, geçişin (harmanlama)
 * süresi, önceki/sonraki geçmişi ve çekirdeğin dalga biçiminin Butterchurn'ün ses verisine
 * çevrilmesi. Çizim `MilkDropScene.tsx`'te; görüntü her karede parlaklık freninden
 * (`flashGuard.ts`) geçer.
 *
 * Geçişler müzikle olur: Görsel Yönetmen'in notunda yeni bir bölüm başlayınca ya da drop
 * açılınca. İki geçiş arası en az [`MIN_PRESET_SECONDS`]; bölüm çok uzunsa
 * [`MAX_PRESET_SECONDS`]'ten sonra ilk ölçü başında. Her geçiş en az [`MIN_BLEND_SECONDS`]
 * boyunca harmanlanır (ani değişim parlama sayılabilir; fren ayrıca sınırlar).
 */

import type { VisualFrame } from "./backend";

/** Kanal başına örnek (WebAudio `fftSize`); çekirdeğin dalga biçimi 3 × bu kadar bayt. */
export const WAVEFORM_WINDOW = 1024;

/** Butterchurn'ün `render({ audioLevels })` için beklediği veri (0..255, 128 = sessizlik). */
export interface AudioLevels {
  timeByteArray: Uint8Array;
  timeByteArrayL: Uint8Array;
  timeByteArrayR: Uint8Array;
}

const SILENCE = new Uint8Array(WAVEFORM_WINDOW).fill(128);

/** Sessizlik (duraklatılmış, şarkı yok, veri gelmedi). Butterchurn girdiyi yalnızca kopyalar. */
export const SILENT_LEVELS: AudioLevels = {
  timeByteArray: SILENCE,
  timeByteArrayL: SILENCE,
  timeByteArrayR: SILENCE,
};

/**
 * Çekirdeğin dalga biçimi (`getVisualWaveform`: karışım, sol, sağ; her biri 1024 bayt) →
 * Butterchurn'ün ses verisi. Kopyalanmaz (görünümler); `null` ya da yanlış uzunlukta sessizlik.
 */
export function audioLevels(bytes: Uint8Array | null): AudioLevels {
  if (!bytes || bytes.length !== 3 * WAVEFORM_WINDOW) return SILENT_LEVELS;
  return {
    timeByteArray: bytes.subarray(0, WAVEFORM_WINDOW),
    timeByteArrayL: bytes.subarray(WAVEFORM_WINDOW, 2 * WAVEFORM_WINDOW),
    timeByteArrayR: bytes.subarray(2 * WAVEFORM_WINDOW, 3 * WAVEFORM_WINDOW),
  };
}

/** İki kendiliğinden geçiş arasındaki en kısa süre (saniye, çalarken). */
export const MIN_PRESET_SECONDS = 15;
/** Bölüm değişmese de bu kadar sonra ilk ölçü başında geçilir. */
export const MAX_PRESET_SECONDS = 90;
/** Her geçişin en kısa harmanlama süresi. */
export const MIN_BLEND_SECONDS = 3;
/** Müzikle (kendiliğinden) geçişin harmanlaması: yavaş, bölümün açılışına yayılır. */
export const AUTO_BLEND_SECONDS = 5;
/** Kullanıcının istediği geçişin harmanlaması: daha çabuk ama yine yumuşak. */
export const MANUAL_BLEND_SECONDS = 3;

/** Geçişin harmanlama süresi (saniye); her zaman en az [`MIN_BLEND_SECONDS`]. */
export function blendSeconds(manual: boolean): number {
  return Math.max(MIN_BLEND_SECONDS, manual ? MANUAL_BLEND_SECONDS : AUTO_BLEND_SECONDS);
}

export type SwitchReason = "section" | "drop" | "long";

export interface ScheduleState {
  /** Son geçişten bu yana çalınan süre (saniye; duraklatınca ilerlemez). */
  elapsed: number;
  section: number | null;
  /** Yönetmen'in drop açılımı (1 → 0). */
  release: number;
  barPhase: number | null;
}

export const SCHEDULE_START: ScheduleState = {
  elapsed: 0,
  section: null,
  release: 0,
  barPhase: null,
};

/** Bir karede en fazla bu kadar süre sayılır (sekme uykusundan dönüşte sıçrama olmasın). */
const MAX_STEP_SECONDS = 0.25;

/**
 * Bir ekran karesi: geçiş zamanı geldiyse nedenini döndürür (`auto` kapalıysa hiç). `frame`
 * `null` ise (duraklatılmış, veri yok) zaman ilerlemez ve geçiş olmaz.
 */
export function stepSchedule(
  state: ScheduleState,
  frame: VisualFrame | null,
  dt: number,
  auto: boolean,
): { state: ScheduleState; reason: SwitchReason | null } {
  if (!frame) return { state, reason: null };
  const elapsed = state.elapsed + Math.min(MAX_STEP_SECONDS, Math.max(0, dt || 0));
  const director = frame.director;
  const section = director?.atmosphere.section ?? frame.section;
  const release = director?.rhythm.release ?? 0;
  const barPhase = director?.rhythm.barPhase ?? null;

  const sectionStart = state.section !== null && section !== null && section !== state.section;
  const dropStart = release >= 0.5 && state.release < 0.5;
  // Ölçü başı: ölçü içindeki yer başa sardı.
  const barStart = barPhase !== null && state.barPhase !== null && barPhase < state.barPhase - 0.5;
  // Analiz yoksa (Yönetmen notu yok) uzun bekleyişin sonunda ölçü beklenmez.
  const long = elapsed >= MAX_PRESET_SECONDS && (barStart || !director);

  let reason: SwitchReason | null = null;
  if (auto && elapsed >= MIN_PRESET_SECONDS) {
    reason = sectionStart ? "section" : dropStart ? "drop" : long ? "long" : null;
  }
  return {
    state: { elapsed: reason ? 0 : elapsed, section, release, barPhase },
    reason,
  };
}

/** Kullanıcı görseli değiştirdi: bekleme süresi baştan başlar. */
export function restartSchedule(state: ScheduleState): ScheduleState {
  return { ...state, elapsed: 0 };
}

/** Gezilen görsellerin geçmişi (listedeki sıraları); `position` şu ankinin yeri. */
export interface PresetHistory {
  visited: readonly number[];
  position: number;
}

export const EMPTY_HISTORY: PresetHistory = { visited: [], position: -1 };
/** Geçmişte tutulan en fazla görsel. */
export const MAX_HISTORY = 100;
/** Yeni seçimde yakın zamanda gösterilenlerden bu kadarı tekrar seçilmez. */
const RECENT_AVOID = 8;

/**
 * Sonraki görsel: geçmişte ileri gidilebiliyorsa oraya, değilse yakın zamanda gösterilmemiş
 * rastgele bir görsel. `avoid` (ör. önceki açılışta programı kapatan görsel) mümkünse seçilmez.
 * Liste boşsa `null`.
 */
export function historyNext(
  history: PresetHistory,
  count: number,
  random: () => number = Math.random,
  avoid: number | null = null,
): { history: PresetHistory; index: number } | null {
  if (count <= 0) return null;
  const forward = history.visited[history.position + 1];
  if (forward !== undefined && forward < count) {
    return { history: { ...history, position: history.position + 1 }, index: forward };
  }
  const kept = history.visited.slice(0, history.position + 1).filter((i) => i < count);
  const current = kept[kept.length - 1];
  const recent = new Set(kept.slice(-Math.min(RECENT_AVOID, count - 1)));
  if (avoid !== null) recent.add(avoid);
  let candidates = Array.from({ length: count }, (_, i) => i).filter((i) => !recent.has(i));
  if (candidates.length === 0) {
    candidates = Array.from({ length: count }, (_, i) => i).filter(
      (i) => i !== current && i !== avoid,
    );
  }
  if (candidates.length === 0) candidates = [0];
  const pick = Math.min(candidates.length - 1, Math.floor(clamp01(random()) * candidates.length));
  const index = candidates[pick] ?? 0;
  const visited = [...kept, index].slice(-MAX_HISTORY);
  return { history: { visited, position: visited.length - 1 }, index };
}

/** Önceki görsel (geçmişte bir geri); geçmişin başındaysa `null`. */
export function historyPrevious(
  history: PresetHistory,
): { history: PresetHistory; index: number } | null {
  const index = history.visited[history.position - 1];
  if (index === undefined) return null;
  return { history: { ...history, position: history.position - 1 }, index };
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
