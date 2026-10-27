/**
 * Kurgu defteri (CueSheet): şarkı haritasını sahnenin oynayacağı olaylara ve ileriye bakış
 * fonksiyonlarına çevirir (saf hesap; şarkı açılınca bir kez).
 *
 * Görsel Yönetmen "şimdi"yi anlatır (ruh hâli, nabız, gerilim). Yeni sahneler ise "ne zaman, ne
 * olacak" bilgisine muhtaç: droptan önce geri sayım, ölçü başı, bölüm tekrarı, kelimenin gelişi.
 * Tasarım: `docs/arastirma/sahneler-v2/README.md` §3.4.
 *
 * Zamanlar saniyedir. Bozuk (NaN, sonsuz, negatif) değerler sessizce atılır: eksik olay sahneyi
 * durdurmaz, yanlış zamanlı olay onu yanlış oynatır.
 */
import type { Lyrics } from "./bindings/Lyrics";
import type { KeyMap } from "./bindings/KeyMap";
import type { MusicalKey } from "./bindings/MusicalKey";
import type { Section } from "./bindings/Section";
import { DROP_CONFIDENCE_MIN, METER_CONFIDENCE_MIN } from "./songMap";

/** Drop geri sayımının kapsadığı ölçü sayısı. */
export const COUNTDOWN_BARS = 8;
/** Drop'tan hemen önce sayılan vuruş sayısı ("son dörtlük"). */
export const FINAL_BEATS = 4;
/** Büyük döngü (ışık sahnesi değişimi) varsayılan uzunluğu (ölçü). */
export const PHRASE_BARS = 8;

/** Bölüm başlangıcı; tekrar eden nakaratlarda `repeat` artar, son bölüm `isOutro` olur. */
export interface SectionCue {
  time: number;
  end: number;
  /** Benzer bölümler aynı etiketi alır (`SongMap.sections[].label`). */
  label: number;
  /** Aynı etiketin kaçıncı kez geldiği (0 ilk). */
  repeat: number;
  energy: number;
  isOutro: boolean;
  /** Son nakarat: çekim kitaplığında en büyük çekim bunun için seçilir. */
  isFinalChorus: boolean;
}

/** Bir kelimenin sahneye gelişi (sözler varsa). */
export interface WordCue {
  time: number;
  end: number;
  text: string;
  /** Satırın ilk kelimesi mi? */
  lineStart: boolean;
  /** Kelime zamanı dosyadan değil tahminden mi? */
  estimated: boolean;
}

export type CueEvent =
  | ({ kind: "sectionStart" } & SectionCue)
  | { kind: "keyChange"; time: number; from: MusicalKey; to: MusicalKey }
  | { kind: "buildStart"; time: number; dropAt: number }
  | { kind: "countdown"; time: number; dropAt: number; barsLeft: number }
  | { kind: "finalBeat"; time: number; dropAt: number; beatsLeft: number }
  | { kind: "drop"; time: number; index: number; confidence: number }
  | { kind: "phrase"; time: number; bars: number }
  | { kind: "groupHead"; time: number; index: number; length: number }
  | { kind: "word"; time: number; end: number; text: string; lineStart: boolean };

export interface CueSheetInput {
  map: {
    meter: number;
    grouping: readonly number[];
    meterConfidence: number;
    downbeats: readonly number[];
    sections: readonly Section[];
    drops: readonly number[];
    dropConfidence: readonly number[];
  };
  keys?: KeyMap | null;
  lyrics?: Lyrics | null;
}

export interface CueSheet {
  events: CueEvent[];
  /** Temizlenmiş (sıralı, tekrarsız) ölçü başları. */
  downbeats: number[];
  meter: number;
  grouping: number[];
  sections: SectionCue[];
  /** Güveni yeterli dropların zamanları (`events` içindeki `drop` olaylarıyla aynı). */
  dropTimes: number[];
  words: WordCue[];
}

/** Şarkı haritasından kurgu defterini kurar. Girdi eksikse defter yalnızca eldeki olayları taşır. */
export function cueSheet(input: CueSheetInput): CueSheet {
  const downbeats = uniqueTimes(input.map.downbeats);
  const meter = Number.isFinite(input.map.meter) && input.map.meter > 0 ? input.map.meter : 4;
  const grouping = validGrouping(input.map.grouping);
  const events: CueEvent[] = [];

  const sections = sectionCues(input.map.sections);
  for (const section of sections) events.push({ kind: "sectionStart", ...section });

  const dropTimes = confidentDrops(input.map).map((d) => d.time);
  for (const drop of confidentDrops(input.map)) {
    events.push({ kind: "drop", ...drop });
    for (const event of buildEvents(drop.time, drop.time, downbeats, meter)) events.push(event);
  }

  // Ton değişimi: bölüm tonu şarkının tonundan belirgin biçimde farklıysa.
  let previousKey: MusicalKey | null = null;
  for (let i = 0; i < sections.length; i++) {
    const next = input.keys?.sections?.[i] ?? null;
    if (!next) continue;
    if (previousKey && (previousKey.tonic !== next.tonic || previousKey.minor !== next.minor)) {
      events.push({ kind: "keyChange", time: sections[i]!.time, from: previousKey, to: next });
    }
    previousKey = next;
  }

  for (let i = 0; i < downbeats.length; i += PHRASE_BARS) {
    events.push({ kind: "phrase", time: downbeats[i]!, bars: PHRASE_BARS });
  }

  if (grouping.length > 0 && input.map.meterConfidence >= METER_CONFIDENCE_MIN) {
    for (const head of groupHeads(downbeats, grouping)) events.push(head);
  }

  const words = wordCues(input.lyrics);
  for (const word of words) {
    events.push({
      kind: "word",
      time: word.time,
      end: word.end,
      text: word.text,
      lineStart: word.lineStart,
    });
  }

  events.sort(compareEvents);
  return { events, downbeats, meter, grouping, sections, dropTimes, words };
}

/** Güveni yeterli droplar: düşük güvenli aday hiçbir yerde drop sayılmaz. */
function confidentDrops(
  map: CueSheetInput["map"],
): { time: number; index: number; confidence: number }[] {
  const out: { time: number; index: number; confidence: number }[] = [];
  for (let i = 0; i < map.drops.length; i++) {
    const time = map.drops[i]!;
    const confidence = map.dropConfidence[i] ?? 0;
    if (!isTime(time) || confidence < DROP_CONFIDENCE_MIN) continue;
    out.push({ time, index: i, confidence: Math.min(1, confidence) });
  }
  return out;
}

/**
 * Bir drop için geri sayım ve son vuruşlar.
 *
 * Ölçü başları kullanılır (ölçü uzunluğu civardaki ölçü başlarından ölçülür): sabit ızgaraya
 * bölmek, canlı çalınmış şarkılarda droptan uzaklaştıkça kayar ve sayım drop'a oturmaz.
 */
function buildEvents(
  dropAt: number,
  buildStart: number,
  downbeats: readonly number[],
  meter: number,
): CueEvent[] {
  const out: CueEvent[] = [];
  const bar = barLengthAt(downbeats, dropAt);
  const start = buildStart - COUNTDOWN_BARS * bar;
  if (start >= 0) out.push({ kind: "buildStart", time: start, dropAt });

  const seen = new Set<number>();
  for (const time of downbeats) {
    if (time <= 0 || time >= dropAt) continue;
    const barsLeft = Math.round((dropAt - time) / bar);
    if (barsLeft < 1 || barsLeft > COUNTDOWN_BARS) continue;
    if (seen.has(barsLeft)) continue;
    seen.add(barsLeft);
    out.push({ kind: "countdown", time, dropAt, barsLeft });
  }

  const beat = bar / Math.max(1, meter);
  for (let beatsLeft = FINAL_BEATS; beatsLeft >= 1; beatsLeft--) {
    const time = dropAt - beatsLeft * beat;
    if (time < 0) continue;
    out.push({ kind: "finalBeat", time, dropAt, beatsLeft });
  }
  return out;
}

/** Aksak ölçüde sekizlik grupların başlangıçları (ör. 9/8 = 2+2+2+3). */
function groupHeads(downbeats: readonly number[], grouping: readonly number[]): CueEvent[] {
  const out: CueEvent[] = [];
  const eighths = grouping.reduce((sum, g) => sum + g, 0);
  if (eighths <= 0) return out;
  for (let i = 0; i + 1 < downbeats.length; i++) {
    const from = downbeats[i]!;
    const to = downbeats[i + 1]!;
    const eighth = (to - from) / eighths;
    let offset = 0;
    for (let g = 0; g < grouping.length; g++) {
      const length = grouping[g]!;
      out.push({ kind: "groupHead", time: from + offset * eighth, index: g, length });
      offset += length;
    }
  }
  return out;
}

function sectionCues(sections: readonly Section[]): SectionCue[] {
  const out: SectionCue[] = [];
  const seen = new Map<number, number>();
  for (const section of sections) {
    if (!isTime(section.start) || !isTime(section.end) || section.end <= section.start) continue;
    const label = Number.isFinite(section.label) ? Math.max(0, Math.floor(section.label)) : 0;
    const repeat = seen.get(label) ?? 0;
    seen.set(label, repeat + 1);
    out.push({
      time: section.start,
      end: section.end,
      label,
      repeat,
      energy: clamp01(section.energy),
      isOutro: false,
      isFinalChorus: false,
    });
  }
  out.sort((a, b) => a.time - b.time);
  const last = out[out.length - 1];
  if (last) {
    last.isOutro = true;
    const repeats = out.filter((s) => s.label === last.label).length;
    last.isFinalChorus = repeats > 1;
  }
  return out;
}

function wordCues(lyrics: Lyrics | null | undefined): WordCue[] {
  const out: WordCue[] = [];
  if (!lyrics) return out;
  for (const line of lyrics.lines) {
    for (let i = 0; i < line.words.length; i++) {
      const word = line.words[i]!;
      if (!isTime(word.start) || !isTime(word.end) || word.end < word.start) continue;
      if (word.text.length === 0) continue;
      out.push({
        time: word.start,
        end: word.end,
        text: word.text,
        lineStart: i === 0,
        estimated: line.estimated,
      });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Olayların sırası: aynı anda gelen olaylarda bölüm/drop önce, söz en sonda. */
const KIND_ORDER: Record<CueEvent["kind"], number> = {
  sectionStart: 0,
  keyChange: 1,
  buildStart: 2,
  countdown: 3,
  finalBeat: 4,
  drop: 5,
  phrase: 6,
  groupHead: 7,
  word: 8,
};

function compareEvents(a: CueEvent, b: CueEvent): number {
  if (a.time !== b.time) return a.time - b.time;
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
}

/** `after` anından sonra gelen ilk olay (yoksa `null`). */
export function nextOfKind(
  sheet: CueSheet,
  kind: CueEvent["kind"],
  after: number,
): CueEvent | null {
  for (const event of sheet.events) {
    if (event.time > after && event.kind === kind) return event;
  }
  return null;
}

/** Bir sonraki drop'un zamanı (yoksa `null`). */
export function nextDrop(sheet: CueSheet, positionSecs: number): number | null {
  let next: number | null = null;
  for (const time of sheet.dropTimes) {
    if (time > positionSecs && (next === null || time < next)) next = time;
  }
  return next;
}

/** Sıradaki drop'a kalan saniye (yoksa `null`). */
export function timeToDrop(sheet: CueSheet, positionSecs: number): number | null {
  const next = nextDrop(sheet, positionSecs);
  return next === null ? null : next - positionSecs;
}

/** Sıradaki drop'a kalan ölçü (yoksa `null`). */
export function barsToDrop(sheet: CueSheet, positionSecs: number): number | null {
  const seconds = timeToDrop(sheet, positionSecs);
  if (seconds === null) return null;
  return seconds / barLengthAt(sheet.downbeats, positionSecs);
}

/**
 * Sıradaki drop'un kurulum yüzdesi: 0 kurulum başında, 1 drop anında. Kurulum yoksa `null`
 * (ör. şarkının sonundaki drop ya da droptan 8 ölçüden yakın olmayan an).
 */
export function buildProgress(sheet: CueSheet, positionSecs: number): number | null {
  let build: { time: number; dropAt: number } | null = null;
  for (const event of sheet.events) {
    if (event.kind !== "buildStart") continue;
    if (event.time <= positionSecs && event.dropAt > positionSecs) {
      build = { time: event.time, dropAt: event.dropAt };
    }
  }
  if (!build) return null;
  const span = build.dropAt - build.time;
  if (span <= 0) return null;
  return clamp01((positionSecs - build.time) / span);
}

/** `positionSecs` anındaki bölüm (yoksa `null`). */
export function currentSection(sheet: CueSheet, positionSecs: number): SectionCue | null {
  for (const section of sheet.sections) {
    if (positionSecs >= section.time && positionSecs < section.end) return section;
  }
  return null;
}

/** Sıradaki bölüm (yoksa `null`). */
export function nextSection(sheet: CueSheet, positionSecs: number): SectionCue | null {
  for (const section of sheet.sections) {
    if (section.time > positionSecs) return section;
  }
  return null;
}

/** Sıradaki kelime (yoksa `null`). */
export function nextWord(sheet: CueSheet, positionSecs: number): WordCue | null {
  for (const word of sheet.words) {
    if (word.time > positionSecs) return word;
  }
  return null;
}

/**
 * Bir bölümün çekim (kamera açısı + kompozisyon) numarası: şarkıya ve bölüme göre belirlenimci,
 * aynı şarkı her çalışta aynı koreografiyi alır. Sahne, çekimlerini bu numarayla seçer; son
 * nakarat için büyük çekimi kendisi ayırır (`isFinalChorus`).
 */
export function shotIndex(seed: number, label: number, repeat: number, count: number): number {
  if (count <= 0) return 0;
  let h = Math.trunc(seed) ^ 0x9e3779b9;
  h = mix(h ^ Math.trunc(label * 0x85ebca6b));
  h = mix(h ^ Math.trunc(repeat * 0xc2b2ae35));
  return (h >>> 0) % count;
}

function mix(value: number): number {
  let h = value | 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return h ^ (h >>> 15);
}

/** Sürekli değerlerde yükseliş hızlı, düşüş en az `ENVELOPE_FALL_RATIO` kat yavaş. */
export const ENVELOPE_RISE_PER_SECOND = 8;
export const ENVELOPE_FALL_PER_SECOND = 0.8;
export const ENVELOPE_FALL_RATIO = 10;

/** Zarfı hedefe doğru `dt` saniye ilerletir (yükseliş hızlı, iniş yavaş). */
export function followEnvelope(
  current: number,
  target: number,
  dt: number,
  risePerSecond = ENVELOPE_RISE_PER_SECOND,
  fallPerSecond = ENVELOPE_FALL_PER_SECOND,
): number {
  if (!Number.isFinite(current) || !Number.isFinite(target) || !Number.isFinite(dt)) return current;
  const step = Math.max(0, Math.min(dt, 0.25));
  const rise = Math.max(0, risePerSecond);
  // Düşüş, yükselişten en az ENVELOPE_FALL_RATIO kat yavaştır: ani sönme "kesme" gibi görünür.
  const fall = Math.min(Math.max(0, fallPerSecond), rise / ENVELOPE_FALL_RATIO);
  const rate = target >= current ? rise : fall;
  const delta = target - current;
  const move = Math.min(Math.abs(delta), rate * step);
  return current + Math.sign(delta) * move;
}

export type Ease = "step" | "linear" | "smooth";

/** Kanal anahtar karesi: `ease`, bu değere **varış** eğrisidir (GNU Rocket mantığı). */
export interface Keyframe {
  time: number;
  value: number;
  ease?: Ease;
}

/**
 * Anahtar kareli kanalı `time` anında örnekler (ör. `beamCount`, `exposure`, `strobeRate`).
 * İlk kareden önce ilk değer, son kareden sonra son değer döner.
 */
export function sampleChannel(keys: readonly Keyframe[], time: number): number {
  if (keys.length === 0) return 0;
  const first = keys[0]!;
  if (time <= first.time) return first.value;
  const last = keys[keys.length - 1]!;
  if (time >= last.time) return last.value;
  for (let i = 1; i < keys.length; i++) {
    const to = keys[i]!;
    if (time > to.time) continue;
    const from = keys[i - 1]!;
    const span = to.time - from.time;
    if (span <= 0) return to.value;
    const t = (time - from.time) / span;
    switch (to.ease ?? "linear") {
      case "step":
        return from.value;
      case "smooth":
        return from.value + (to.value - from.value) * t * t * (3 - 2 * t);
      default:
        return from.value + (to.value - from.value) * t;
    }
  }
  return last.value;
}

/**
 * `time` çevresindeki ölçü uzunluğu (saniye): zamanı kapsayan ölçü başı aralığı, yoksa en yakın
 * aralık. Ölçü başı yoksa 2 saniye (120 BPM) varsayılır.
 */
export function barLengthAt(downbeats: readonly number[], time: number): number {
  if (downbeats.length < 2) return 2;
  let best = 2;
  for (let i = 0; i + 1 < downbeats.length; i++) {
    const from = downbeats[i]!;
    const to = downbeats[i + 1]!;
    const length = to - from;
    if (!(length > 0)) continue;
    if (time >= from && time < to) return length;
    best = length;
  }
  return best;
}

function uniqueTimes(times: readonly number[]): number[] {
  const clean = times.filter(isTime).sort((a, b) => a - b);
  const out: number[] = [];
  for (const time of clean) {
    const previous = out[out.length - 1];
    if (previous === undefined || time - previous > 1e-6) out.push(time);
  }
  return out;
}

function validGrouping(grouping: readonly number[]): number[] {
  if (grouping.length === 0) return [];
  const out: number[] = [];
  for (const group of grouping) {
    if (!Number.isFinite(group) || group <= 0 || group !== Math.floor(group)) return [];
    out.push(group);
  }
  return out;
}

function isTime(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
