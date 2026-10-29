/**
 * Kurgu defteri (CueSheet): şarkı haritasını sahnelerin oynayacağı olaylara ve ileriye bakış
 * fonksiyonlarına çevirir (saf hesap; şarkı açılınca, harita gelince bir kez).
 *
 * Görsel Yönetmen "şimdi"yi anlatır (ruh hâli, nabız, gerilim). Yeni sahneler ise "ne zaman, ne
 * olacak" bilgisine muhtaç: doruktan önce geri sayım, doruktan hemen önceki boşluk, ölçü başı, bölüm
 * tekrarı, kırılma, final. Tasarım: `docs/arastirma/sahneler-v2/README.md` §3.4 ve bağımsız
 * denetim (`BAGIMSIZ-DENETIM.md` §3.2).
 *
 * İlk taslak `deepseek-kurgu` dalındaydı (#132); buradaki sürüm onu düzeltip genişletir:
 *
 * - **Doruk (climax) birinci sınıf olaydır**, yalnızca drop değil. Güvenilir drop yoksa doruk,
 *   en yüksek enerjili bölüm türünün (nakarat) girişi, belirgin bir enerji sıçraması ya da son
 *   yüksek bölümdür. Geri sayım, boşluk ve açılım doruğa bağlanır: dropsuz Türkçe pop şarkısında da
 *   sahnenin "vay" anı gelir (gücü daha düşük).
 * - **Harita yoksa canlı mod**: analiz bitene kadar ya da başarısızsa defter boştur (`live`);
 *   sahne yalnızca o anki sesle oynar, harita gelince kurguya yumuşakça geçer.
 * - **Belirlenimci tohum** (`seed`): analiz sürümüyle değişen alanlardan (vuruşlar, spektrum
 *   parmak izi) değil, şarkının süresinden ve bölüm etiketlerinin sırasından. Aynı şarkı her
 *   çalışta aynı koreografiyi alır.
 * - **Mutlak zaman**: ölçü ve vuruş konumu ölçü başlarından hesaplanır (`barPosition`), kare
 *   sayısından değil: kare kaçınca strob ve geri sayım kaymaz; sarmada (seek) kurgu doğrudur.
 *
 * Boşluk (`gap`): analiz droptan önceki sessizliği ayrıca bulmuyor (60 kare/sn karelerden boşluk
 * tespiti Rust'ta ayrı bir iş). Bu sürümde boşluk doruğun son vuruşudur; drop dışındaki
 * doruklarda yarı derinlikte.
 *
 * Zamanlar saniyedir. Bozuk (NaN, sonsuz, negatif) değerler sessizce atılır: eksik olay sahneyi
 * durdurmaz, yanlış zamanlı olay onu yanlış oynatır.
 */
import type { KeyMap } from "./bindings/KeyMap";
import type { Lyrics } from "./bindings/Lyrics";
import type { MusicalKey } from "./bindings/MusicalKey";
import type { Section } from "./bindings/Section";
import { DROP_CONFIDENCE_MIN, METER_CONFIDENCE_MIN } from "./songMap";

/** Doruk öncesi geri sayımın kapsadığı ölçü sayısı (8 → 1). */
export const COUNTDOWN_BARS = 8;
/** Büyük döngü (ışık "sahnesi" değişimi) uzunluğu (ölçü). */
export const PHRASE_BARS = 8;
/** İki doruk arasında en az bu kadar ölçü olmalı (yoksa geri sayımlar üst üste biner). */
export const CLIMAX_MIN_GAP_BARS = 12;
/** Ölçü başı yoksa varsayılan ölçü uzunluğu (saniye; 120 BPM 4/4). */
export const DEFAULT_BAR_SECS = 2;

/** Dorukların türü ve sahnelerin onlara verdiği temel güç. */
export type ClimaxKind = "drop" | "chorusEntry" | "energyStep" | "finalSection";
export const CLIMAX_STRENGTH: Record<ClimaxKind, number> = {
  drop: 1,
  chorusEntry: 0.75,
  energyStep: 0.65,
  finalSection: 0.6,
};
/** Drop dışındaki dorukların boşluğundaki kararma derinliği (drop'ta 1). */
export const SOFT_GAP_DEPTH = 0.5;

/** Bölüm; tekrar eden nakaratlarda `repeat` artar. */
export interface SectionCue {
  time: number;
  end: number;
  /** Benzer bölümler aynı etiketi alır (`SongMap.sections[].label`). */
  label: number;
  /** Aynı etiketin kaçıncı kez geldiği (0 ilk). */
  repeat: number;
  /** Bölüm enerjisi (0..1). */
  energy: number;
  /** Bu bölüm bir doruğun açılımından sonraki sakin ara mı (kırılma)? */
  breakdown: boolean;
  /** Şarkının son bölümü ve enerjisi düşük (çıkış). */
  outro: boolean;
}

/** Doruk: sahnenin büyük anı. */
export interface Climax {
  time: number;
  kind: ClimaxKind;
  /** 0..1: drop güveni ya da türün temel gücü. */
  strength: number;
  /** Geri sayımın başladığı an (doruktan `COUNTDOWN_BARS` ölçü önce; şarkının başından önce olamaz). */
  buildStart: number;
  /** Boşluğun başladığı an (doruğun son vuruşu). */
  gapStart: number;
  /** Boşluktaki kararmanın derinliği (0..1). */
  gapDepth: number;
  /** Doruğun ölçü uzunluğu (saniye). */
  barSecs: number;
  /** Sondan bir önceki doruk değil, son doruk (final). */
  final: boolean;
}

/** Bir kelimenin sahneye gelişi (sözler varsa). */
export interface WordCue {
  time: number;
  end: number;
  text: string;
  lineStart: boolean;
  estimated: boolean;
}

export type CueEvent =
  | ({ kind: "sectionStart" } & SectionCue)
  | { kind: "keyChange"; time: number; from: MusicalKey; to: MusicalKey }
  | { kind: "buildStart"; time: number; climaxAt: number }
  | { kind: "countdown"; time: number; climaxAt: number; barsLeft: number }
  | { kind: "gap"; time: number; end: number; depth: number }
  | { kind: "climax"; time: number; climaxKind: ClimaxKind; strength: number; final: boolean }
  | { kind: "phrase"; time: number; bars: number }
  | { kind: "groupHead"; time: number; index: number; length: number }
  | { kind: "word"; time: number; end: number; text: string; lineStart: boolean };

/** Şarkı haritasının kurgu defterinin kullandığı alanları. */
export interface CueMap {
  meter: number;
  grouping: readonly number[];
  meterConfidence: number;
  downbeats: readonly number[];
  sections: readonly Section[];
  drops: readonly number[];
  dropConfidence: readonly number[];
  energy: readonly number[];
}

export interface CueSheetInput {
  /** Şarkı haritası; analiz yoksa `null` (canlı mod). */
  map: CueMap | null;
  keys?: KeyMap | null;
  lyrics?: Lyrics | null;
}

export interface CueSheet {
  /** Harita yok: sahne yalnızca o anki sesle oynar. */
  live: boolean;
  /** Belirlenimci tohum (çekim seçimi, desen çeşitliliği). */
  seed: number;
  /** Şarkının süresi (haritadan; bilinmiyorsa 0). */
  duration: number;
  events: CueEvent[];
  /** Temizlenmiş (sıralı, tekrarsız) ölçü başları. */
  downbeats: number[];
  meter: number;
  grouping: number[];
  /** Ölçü başları güvenilir mi (değilse ölçü başı vurgulanmaz). */
  barsConfident: boolean;
  sections: SectionCue[];
  climaxes: Climax[];
  /** Bölümlerin tonu (bölüm sırasıyla; ton değişmiyorsa şarkının tonu, yoksa `null`). */
  sectionKeys: (MusicalKey | null)[];
  words: WordCue[];
}

/** Haritası olmayan şarkının defteri (canlı mod). */
export const LIVE_SHEET: CueSheet = {
  live: true,
  seed: 0,
  duration: 0,
  events: [],
  downbeats: [],
  meter: 4,
  grouping: [],
  barsConfident: false,
  sections: [],
  climaxes: [],
  sectionKeys: [],
  words: [],
};

/** Şarkı haritasından kurgu defterini kurar. Harita yoksa canlı mod defteri döner. */
export function cueSheet(input: CueSheetInput): CueSheet {
  const map = input.map;
  if (!map) return LIVE_SHEET;
  const downbeats = uniqueTimes(map.downbeats);
  const meter = Number.isFinite(map.meter) && map.meter > 0 ? Math.round(map.meter) : 4;
  const grouping = validGrouping(map.grouping);
  const barsConfident =
    downbeats.length >= 2 &&
    Number.isFinite(map.meterConfidence) &&
    map.meterConfidence >= METER_CONFIDENCE_MIN;
  const sections = sectionCues(map.sections);
  // Süre: saniyede bir enerji değeri ve bölümlerin sonu (ölçü başları yalnızca başka bilgi yoksa).
  const known = Math.max(map.energy.length, sections[sections.length - 1]?.end ?? 0);
  const duration = known > 0 ? known : (downbeats[downbeats.length - 1] ?? 0);
  const climaxes = findClimaxes(map, sections, downbeats, meter, duration);
  markBreakdowns(sections, climaxes);
  const events: CueEvent[] = [];

  for (const section of sections) events.push({ kind: "sectionStart", ...section });
  for (const climax of climaxes) {
    events.push({ kind: "buildStart", time: climax.buildStart, climaxAt: climax.time });
    for (const c of countdown(climax, downbeats)) events.push(c);
    events.push({
      kind: "gap",
      time: climax.gapStart,
      end: climax.time,
      depth: climax.gapDepth,
    });
    events.push({
      kind: "climax",
      time: climax.time,
      climaxKind: climax.kind,
      strength: climax.strength,
      final: climax.final,
    });
  }

  // Ton değişimi: bölüm tonu şarkının tonundan belirgin biçimde farklıysa (KeyMap'in kuralı).
  const songKey = input.keys?.key ?? null;
  const sectionKeys = sections.map((_, i) => input.keys?.sections?.[i] ?? songKey);
  for (let i = 1; i < sections.length; i++) {
    const from = sectionKeys[i - 1] ?? null;
    const to = sectionKeys[i] ?? null;
    if (from && to && (from.tonic !== to.tonic || from.minor !== to.minor)) {
      events.push({ kind: "keyChange", time: sections[i]!.time, from, to });
    }
  }

  for (let i = 0; i < downbeats.length; i += PHRASE_BARS) {
    events.push({ kind: "phrase", time: downbeats[i]!, bars: PHRASE_BARS });
  }

  if (grouping.length > 0 && barsConfident) {
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
  return {
    live: false,
    seed: songSeed(duration, sections),
    duration,
    events,
    downbeats,
    meter,
    grouping,
    barsConfident,
    sections,
    climaxes,
    sectionKeys,
    words,
  };
}

/**
 * Dorukları bulur. Güvenilir droplar her zaman doruktur. Drop yoksa: en yüksek enerjili bölüm
 * türünün (birden çok kez geliyorsa nakarat sayılır) her girişi; o da yoksa belirgin bir enerji
 * sıçraması; o da yoksa şarkının son yüksek bölümü. Birbirine `CLIMAX_MIN_GAP_BARS` ölçüden yakın
 * doruklardan güçlü olan kalır.
 */
function findClimaxes(
  map: CueMap,
  sections: SectionCue[],
  downbeats: number[],
  meter: number,
  duration: number,
): Climax[] {
  const candidates: { time: number; kind: ClimaxKind; strength: number }[] = [];
  for (let i = 0; i < map.drops.length; i++) {
    const time = map.drops[i]!;
    const confidence = map.dropConfidence[i] ?? 0;
    if (!isTime(time) || !(confidence >= DROP_CONFIDENCE_MIN)) continue;
    candidates.push({ time, kind: "drop", strength: Math.min(1, confidence) });
  }
  if (candidates.length === 0 && sections.length >= 2) {
    const maxEnergy = Math.max(...sections.map((s) => s.energy));
    // En yüksek ortalama enerjili, birden çok kez gelen etiket: nakarat.
    const labels = new Map<number, { sum: number; count: number }>();
    for (const s of sections) {
      const entry = labels.get(s.label) ?? { sum: 0, count: 0 };
      entry.sum += s.energy;
      entry.count += 1;
      labels.set(s.label, entry);
    }
    let chorus: number | null = null;
    let best = -1;
    for (const [label, { sum, count }] of labels) {
      const mean = sum / count;
      if (count >= 2 && mean > best && mean >= 0.75 * maxEnergy) {
        best = mean;
        chorus = label;
      }
    }
    sections.forEach((s, i) => {
      if (i === 0) return;
      const prev = sections[i - 1]!;
      if (chorus !== null && s.label === chorus && prev.label !== chorus) {
        candidates.push({
          time: s.time,
          kind: "chorusEntry",
          strength: CLIMAX_STRENGTH.chorusEntry,
        });
      } else if (s.energy - prev.energy >= 0.2 && s.energy >= 0.8 * maxEnergy) {
        candidates.push({ time: s.time, kind: "energyStep", strength: CLIMAX_STRENGTH.energyStep });
      }
    });
    if (candidates.length === 0) {
      // Son yüksek bölüm (şarkının ilk dörtte birinden sonra).
      for (let i = sections.length - 1; i >= 1; i--) {
        const s = sections[i]!;
        if (s.energy >= 0.85 * maxEnergy && s.time >= 0.25 * duration) {
          candidates.push({
            time: s.time,
            kind: "finalSection",
            strength: CLIMAX_STRENGTH.finalSection,
          });
          break;
        }
      }
    }
  }
  candidates.sort((a, b) => a.time - b.time);
  // Yakın dorukları ayıkla: güçlü olan kalır.
  const kept: typeof candidates = [];
  for (const c of candidates) {
    const last = kept[kept.length - 1];
    const minGap = CLIMAX_MIN_GAP_BARS * barLengthAt(downbeats, c.time);
    if (last && c.time - last.time < minGap) {
      if (c.strength > last.strength) kept[kept.length - 1] = c;
      continue;
    }
    kept.push(c);
  }
  return kept.map((c, i) => {
    const bar = barLengthAt(downbeats, c.time);
    const beat = bar / Math.max(1, meter);
    const previous = kept[i - 1]?.time ?? 0;
    return {
      time: c.time,
      kind: c.kind,
      strength: c.strength,
      // Geri sayım önceki doruğun üstüne binmez ve şarkının başından önce başlamaz.
      buildStart: Math.max(0, previous, c.time - COUNTDOWN_BARS * bar),
      gapStart: Math.max(0, c.time - beat),
      gapDepth: c.kind === "drop" ? 1 : SOFT_GAP_DEPTH,
      barSecs: bar,
      final: i === kept.length - 1,
    };
  });
}

/**
 * Doruğun geri sayımı: doruktan önceki son `COUNTDOWN_BARS` ölçü başında `barsLeft` 8 → 1. Gerçek
 * ölçü başları kullanılır (sabit ızgaraya bölmek canlı çalınmış şarkıda droptan uzaklaştıkça
 * kayar); ölçü başı yoksa doruktan geriye ölçü uzunluğuyla sayılır.
 */
function countdown(climax: Climax, downbeats: readonly number[]): CueEvent[] {
  const out: CueEvent[] = [];
  const seen = new Set<number>();
  for (const time of downbeats) {
    if (time < climax.buildStart - 1e-6 || time >= climax.time - 1e-6) continue;
    const barsLeft = Math.round((climax.time - time) / climax.barSecs);
    if (barsLeft < 1 || barsLeft > COUNTDOWN_BARS || seen.has(barsLeft)) continue;
    seen.add(barsLeft);
    out.push({ kind: "countdown", time, climaxAt: climax.time, barsLeft });
  }
  if (out.length === 0) {
    for (let barsLeft = COUNTDOWN_BARS; barsLeft >= 1; barsLeft--) {
      const time = climax.time - barsLeft * climax.barSecs;
      if (time >= climax.buildStart - 1e-6) {
        out.push({ kind: "countdown", time, climaxAt: climax.time, barsLeft });
      }
    }
  }
  return out;
}

/** Bir doruğun bölümünden sonra enerjisi belirgin düşen bölüm kırılmadır; son düşük bölüm çıkış. */
function markBreakdowns(sections: SectionCue[], climaxes: readonly Climax[]) {
  if (sections.length === 0) return;
  const maxEnergy = Math.max(...sections.map((s) => s.energy));
  for (let i = 1; i < sections.length; i++) {
    const s = sections[i]!;
    const afterClimax = climaxes.some((c) => c.time < s.time - 1e-6);
    s.breakdown =
      afterClimax && s.energy <= 0.7 * maxEnergy && s.energy <= sections[i - 1]!.energy - 0.1;
  }
  const last = sections[sections.length - 1]!;
  last.outro = sections.length >= 2 && last.energy <= 0.6 * maxEnergy;
  if (last.outro) last.breakdown = false;
}

/** Aksak ölçüde sekizlik grupların başlangıçları (ör. 9/8 = 2+2+2+3). */
function groupHeads(downbeats: readonly number[], grouping: readonly number[]): CueEvent[] {
  const out: CueEvent[] = [];
  const eighths = grouping.reduce((sum, g) => sum + g, 0);
  if (eighths <= 0) return out;
  for (let i = 0; i + 1 < downbeats.length; i++) {
    const from = downbeats[i]!;
    const eighth = (downbeats[i + 1]! - from) / eighths;
    let offset = 0;
    for (let g = 0; g < grouping.length; g++) {
      out.push({ kind: "groupHead", time: from + offset * eighth, index: g, length: grouping[g]! });
      offset += grouping[g]!;
    }
  }
  return out;
}

function sectionCues(sections: readonly Section[]): SectionCue[] {
  const clean = sections
    .filter((s) => isTime(s.start) && isTime(s.end) && s.end > s.start)
    .slice()
    .sort((a, b) => a.start - b.start);
  const seen = new Map<number, number>();
  return clean.map((section) => {
    const label = Number.isFinite(section.label) ? Math.max(0, Math.floor(section.label)) : 0;
    const repeat = seen.get(label) ?? 0;
    seen.set(label, repeat + 1);
    return {
      time: section.start,
      end: section.end,
      label,
      repeat,
      energy: clamp01(section.energy),
      breakdown: false,
      outro: false,
    };
  });
}

function wordCues(lyrics: Lyrics | null | undefined): WordCue[] {
  const out: WordCue[] = [];
  if (!lyrics?.synced) return out;
  for (const line of lyrics.lines) {
    for (let i = 0; i < line.words.length; i++) {
      const word = line.words[i]!;
      if (!isTime(word.start) || !isTime(word.end) || word.end < word.start) continue;
      if (word.text.trim().length === 0) continue;
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

/** Aynı anda gelen olayların sırası: bölüm önce, doruk boşluktan sonra, söz en sonda. */
const KIND_ORDER: Record<CueEvent["kind"], number> = {
  sectionStart: 0,
  keyChange: 1,
  buildStart: 2,
  countdown: 3,
  gap: 4,
  climax: 5,
  phrase: 6,
  groupHead: 7,
  word: 8,
};

function compareEvents(a: CueEvent, b: CueEvent): number {
  if (a.time !== b.time) return a.time - b.time;
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
}

/**
 * Belirlenimci tohum: süre (saniyeye yuvarlanmış) ve bölüm etiketlerinin sırası. Analiz sürümüyle
 * değişen ince alanlar (vuruş zamanları, parmak izi) girmez: aynı şarkı aynı koreografiyi alır.
 */
export function songSeed(duration: number, sections: readonly { label: number }[]): number {
  let h = hashMix(0x4c595241 ^ Math.round(Number.isFinite(duration) ? duration : 0));
  for (const s of sections) h = hashMix(h ^ Math.imul(s.label + 1, 0x9e3779b1));
  return h >>> 0;
}

// ---------------------------------------------------------------------------------------------
// İleriye bakış

/** `time` anında gelen ya da süren doruk penceresi: geri sayımdan doruk anına kadar. */
export interface ClimaxAhead {
  climax: Climax;
  /** Doruğa kalan süre (saniye, ≥ 0). */
  seconds: number;
  /** Geri sayımın ilerleyişi: 0 kurulum başında … 1 doruk anında. */
  progress: number;
  /** Doruğa kalan ölçü (tam sayı, yukarı yuvarlanmış: geri sayımın gösterdiği sayı, 8 … 1). */
  barsLeft: number;
}

/** Kurulumu süren doruk (yoksa `null`). */
export function climaxAhead(sheet: CueSheet, time: number): ClimaxAhead | null {
  for (const climax of sheet.climaxes) {
    if (time >= climax.buildStart && time < climax.time) {
      const span = climax.time - climax.buildStart;
      const seconds = climax.time - time;
      return {
        climax,
        seconds,
        progress: span > 0 ? clamp01((time - climax.buildStart) / span) : 1,
        barsLeft: Math.max(1, Math.ceil(seconds / climax.barSecs - 1e-6)),
      };
    }
  }
  return null;
}

/** En son geçilen doruk ve üstünden geçen süre (yoksa `null`). */
export function climaxBehind(
  sheet: CueSheet,
  time: number,
): { climax: Climax; seconds: number } | null {
  let found: Climax | null = null;
  for (const climax of sheet.climaxes) if (climax.time <= time) found = climax;
  return found ? { climax: found, seconds: time - found.time } : null;
}

/** `time` anındaki bölümün sırası (yoksa −1). */
export function sectionIndexAt(sheet: CueSheet, time: number): number {
  const sections = sheet.sections;
  for (let i = 0; i < sections.length; i++) {
    if (time >= sections[i]!.time && time < sections[i]!.end) return i;
  }
  return -1;
}

/** Ölçü ve vuruş konumu (mutlak zamandan). */
export interface BarPosition {
  /** Ölçünün sırası (ilk ölçü başı 0; öncesi eksi). */
  bar: number;
  /** Ölçünün içindeki yer (0..1). */
  barPhase: number;
  /** Ölçüdeki vuruş (0'dan) ve vuruşun içindeki yer (0..1). */
  beat: number;
  beatPhase: number;
  /** Ölçü ve vuruş uzunluğu (saniye). */
  barSecs: number;
  beatSecs: number;
}

/**
 * `time` anının ölçü ve vuruş konumu: ölçü başlarından (ilk ve son ölçü başının ötesinde komşu
 * ölçünün uzunluğuyla sürdürülür). Ölçü başı yoksa `fallbackBpm` ile sıfırdan başlayan ızgara.
 */
export function barPosition(sheet: CueSheet, time: number, fallbackBpm = 120): BarPosition {
  const meter = Math.max(1, sheet.meter);
  const d = sheet.downbeats;
  let bar: number;
  let barStart: number;
  let barSecs: number;
  if (d.length >= 2) {
    if (time < d[0]!) {
      barSecs = d[1]! - d[0]!;
      const back = Math.ceil((d[0]! - time) / barSecs);
      bar = -back;
      barStart = d[0]! - back * barSecs;
    } else if (time >= d[d.length - 1]!) {
      barSecs = d[d.length - 1]! - d[d.length - 2]!;
      const ahead = Math.floor((time - d[d.length - 1]!) / barSecs);
      bar = d.length - 1 + ahead;
      barStart = d[d.length - 1]! + ahead * barSecs;
    } else {
      let lo = 0;
      let hi = d.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (d[mid]! <= time) lo = mid;
        else hi = mid;
      }
      bar = lo;
      barStart = d[lo]!;
      barSecs = d[hi]! - d[lo]!;
    }
  } else {
    const bpm = Number.isFinite(fallbackBpm) && fallbackBpm > 20 ? fallbackBpm : 120;
    barSecs = (60 / bpm) * meter;
    bar = Math.floor(time / barSecs);
    barStart = bar * barSecs;
  }
  barSecs = barSecs > 0.05 ? barSecs : DEFAULT_BAR_SECS;
  const barPhase = clamp01((time - barStart) / barSecs);
  const beats = barPhase * meter;
  const beat = Math.min(meter - 1, Math.floor(beats));
  return {
    bar,
    barPhase,
    beat,
    beatPhase: beats - beat,
    barSecs,
    beatSecs: barSecs / meter,
  };
}

/**
 * Bir bölümün çekim (kamera açısı + kompozisyon) numarası: şarkıya ve bölüme göre belirlenimci,
 * aynı şarkı her çalışta aynı koreografiyi alır. Aynı etiketli bölüm (her nakarat) aynı çekimle
 * başlar; tekrarlarda bir sonraki çekime kayar (ikinci nakarat birinciden farklı).
 */
export function shotIndex(seed: number, label: number, repeat: number, count: number): number {
  if (count <= 0) return 0;
  const base = hashMix(Math.trunc(seed) ^ Math.imul(Math.trunc(label) + 1, 0x85ebca6b));
  return ((base >>> 0) + Math.max(0, Math.trunc(repeat))) % count;
}

/** 32 bitlik karıştırma (murmur3 sonlandırıcısı). */
export function hashMix(value: number): number {
  let h = value | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return h ^ (h >>> 16);
}

/**
 * `time` çevresindeki ölçü uzunluğu (saniye): zamanı kapsayan ölçü başı aralığı, yoksa en yakın
 * aralık. Ölçü başı yoksa `DEFAULT_BAR_SECS`.
 */
export function barLengthAt(downbeats: readonly number[], time: number): number {
  if (downbeats.length < 2) return DEFAULT_BAR_SECS;
  if (time < downbeats[0]!) return downbeats[1]! - downbeats[0]!;
  for (let i = 0; i + 1 < downbeats.length; i++) {
    if (time >= downbeats[i]! && time < downbeats[i + 1]!) {
      return downbeats[i + 1]! - downbeats[i]!;
    }
  }
  return downbeats[downbeats.length - 1]! - downbeats[downbeats.length - 2]!;
}

function uniqueTimes(times: readonly number[]): number[] {
  const clean = times.filter(isTime).sort((a, b) => a - b);
  const out: number[] = [];
  for (const time of clean) {
    const previous = out[out.length - 1];
    if (previous === undefined || time - previous > 1e-3) out.push(time);
  }
  return out;
}

function validGrouping(grouping: readonly number[]): number[] {
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

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
