/**
 * Işık Ustası sahnesinin kurgusu (saf hesap; ekran kartı kodu `lightShowRenderer.ts`, gölgelendirici
 * `lightShowShader.ts`). Kurgu defterinden (`cueSheet.ts`) her an için ışık şovunun durumunu üretir:
 * hangi evrede olunduğu (giriş, kıta, kurulum, boşluk, drop, yüksek bölüm, kırılma, çıkış), kaç
 * ışının yandığı, ışınların deseni ve yönü, strob, kamera çekimi. Her şey mutlak zamanın saf
 * fonksiyonudur: sarma (seek), duraklatma ve kare kaybında doğru kalır; strob evresi ölçü
 * başlarından hesaplanır.
 *
 * Sahne: puslu (haze) karanlık bir salon, ışık kaynakları dört sırada (arka tavan, sahne zemini,
 * iki yan kule, ortada lazer), ıslak ve yansıtan zemin, kamera ışınların arasında. Kalabalık, LED
 * duvar ve iskele bilerek yok (dizüstü ekranında ucuz görünür; bağımsız denetim §2.1).
 *
 * Epilepsi güvenli modu sahnenin kendi yorumudur (fren değil): strob yok, boşlukta karartma yarıya
 * ve yavaş, drop mekânsal (ışınlar yavaşça açılır, kamera geri çekilir), vuruş adımı yok, en fazla
 * 8 ışın, yavaş süpürme; bütün ışık tek bir hız sınırlı düzeyden geçer (`stepSafeLights`).
 * "Animasyonları azalt" açıkken kamera durur, süpürme yavaşlar, strob yok.
 */
import {
  barPosition,
  climaxAhead,
  climaxBehind,
  hashMix,
  sectionIndexAt,
  shotIndex,
  clamp01,
  type Climax,
  type CueSheet,
  type SectionCue,
} from "./cueSheet";

// ---------------------------------------------------------------------------------------------
// Yoğunluk (kalıcı ayar) ve kalite katmanı

export type Intensity = "calm" | "normal" | "wild";

/** Ayarlardaki sırayla. */
export const INTENSITIES: { id: Intensity; name: string; hint: string }[] = [
  { id: "calm", name: "Sakin", hint: "Az ışın, strob yok, yavaş kamera." },
  { id: "normal", name: "Normal", hint: "Dropta vuruşa kilitli strob." },
  { id: "wild", name: "Çılgın", hint: "Çok ışın, hızlı strob, hızlı kamera." },
];

export const DEFAULT_INTENSITY: Intensity = "normal";

export interface IntensityProfile {
  /** Yanan ışın sayısının katı. */
  beams: number;
  /** Dropta strobun notası (vuruş başına çakma; 0 = strob yok) ve süresi (ölçü). */
  strobePerBeat: number;
  strobeBars: number;
  /** Kamera hareketinin ve süpürmenin hız katı. */
  camera: number;
  sweep: number;
  /** Drop vuruşunun gücü (pozlama sıçraması). */
  hit: number;
}

export const INTENSITY_PROFILES: Record<Intensity, IntensityProfile> = {
  calm: { beams: 0.55, strobePerBeat: 0, strobeBars: 0, camera: 0.6, sweep: 0.6, hit: 0.45 },
  normal: { beams: 1, strobePerBeat: 2, strobeBars: 2, camera: 1, sweep: 1, hit: 1 },
  wild: { beams: 1.4, strobePerBeat: 4, strobeBars: 4, camera: 1.45, sweep: 1.5, hit: 1.3 },
};

export function isIntensity(value: unknown): value is Intensity {
  return value === "calm" || value === "normal" || value === "wild";
}

const INTENSITY_KEY = "lyraska.lightShowIntensity";

/** Kayıtlı yoğunluk; yoksa ya da okunamazsa Normal. */
export function loadIntensity(): Intensity {
  try {
    const saved = window.localStorage.getItem(INTENSITY_KEY);
    return isIntensity(saved) ? saved : DEFAULT_INTENSITY;
  } catch {
    return DEFAULT_INTENSITY;
  }
}

export function saveIntensity(intensity: Intensity): void {
  try {
    window.localStorage.setItem(INTENSITY_KEY, intensity);
  } catch {
    /* Kaydedilemezse bir sonraki açılışta Normal başlar. */
  }
}

export type Quality = "high" | "low";

export interface QualityProfile {
  /** Fikstür sayıları: arka tavan, sahne zemini, yan kuleler (iki yanın toplamı), lazer. */
  back: number;
  floor: number;
  side: number;
  laser: number;
  /** Sahne dokusunun en fazla piksel sayısı (son geçiş tuval boyunda). */
  maxPixels: number;
  /** Islak zeminde ışınların yansıması (yoksa yalnızca ışık havuzları ve lens yansımaları). */
  reflections: boolean;
  /** Pusun gürültü katmanı sayısı. */
  hazeOctaves: number;
}

export const QUALITY_PROFILES: Record<Quality, QualityProfile> = {
  high: {
    back: 12,
    floor: 8,
    side: 6,
    laser: 6,
    maxPixels: 1280 * 720,
    reflections: true,
    hazeOctaves: 2,
  },
  low: {
    back: 8,
    floor: 4,
    side: 0,
    laser: 4,
    maxPixels: 800 * 450,
    reflections: false,
    hazeOctaves: 1,
  },
};

/** En fazla ışın (gölgelendiricideki dizinin boyu). */
export const MAX_BEAMS = 32;

export function beamTotal(q: QualityProfile): number {
  return Math.min(MAX_BEAMS, q.back + q.floor + q.side + q.laser);
}

/**
 * Kalite katmanı: yazılımsal çizimde ve tümleşik ekran kartlarında (Intel, AMD "Radeon Graphics")
 * Düşük; ayrık kartlarda Yüksek. Ayrıca dinamik çözünürlük kare süresine göre ayarlar.
 */
export function chooseQuality(gpu: string, software: boolean): Quality {
  if (software) return "low";
  const name = gpu.toLowerCase();
  if (/(swiftshader|llvmpipe|basic render|software|microsoft basic)/.test(name)) return "low";
  if (/intel/.test(name) && !/\barc\b/.test(name)) return "low";
  if (/radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|680m|780m/.test(name)) return "low";
  return "high";
}

// ---------------------------------------------------------------------------------------------
// Palet: şarkının tonundan (Camelot çarkı = renk çemberi, `--key-1…12`)

export type Rgb = [number, number, number];

export interface ShowPalette {
  /** Ana jel rengi (tonun rengi), karşıt jel, sıcak beyaz (spot), soğuk beyaz (strob, lazer çekirdeği). */
  primary: Rgb;
  secondary: Rgb;
  warm: Rgb;
  white: Rgb;
}

/** sRGB kod değerinden (0..1) doğrusal ışığa. */
export function srgbToLinear(v: number): number {
  if (!(v > 0)) return 0;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/**
 * Jel rengi: sRGB rengi doğrusal ışığa çevrilir, en büyük kanalı 1 olacak biçimde ölçeklenir ve
 * doygunluğu artırılır (sahne ışığının jeli arayüz renginden daha doygundur). Parlaklığı sahnenin
 * ışık düzeyi belirler.
 */
export function gelColor(srgb: Rgb): Rgb {
  const lin = srgb.map(srgbToLinear) as Rgb;
  const peak = Math.max(...lin, 1e-6);
  return lin.map((c) => Math.pow(c / peak, 1.35)) as Rgb;
}

/**
 * Karşıt jelin Camelot sırası (1..12): çarkta dört adım ötesi (120°; sahne ışığında iyi ayrışan,
 * çatışmayan ikili, ör. mavi + pembe, turuncu + mor). Ana renk yeşil değilken karşıt renk yeşile
 * (9–11) düşüyorsa dört adım geriye alınır: yeşil jel ten ve pusu hastalıklı gösterir.
 */
export function secondaryKey(camelot: number): number {
  const i = ((((Math.round(camelot) - 1) % 12) + 12) % 12) + 1;
  const green = (k: number) => k >= 9 && k <= 11;
  const up = ((i + 3) % 12) + 1;
  return green(up) && !green(i) ? ((i + 7) % 12) + 1 : up;
}

/**
 * Tonun paleti: Camelot sayısının rengi (`--key-N`, arayüzdeki ton rengiyle aynı) ana jel,
 * `secondaryKey` karşıt jel. Ton bilinmiyorsa bölüm temasının iki rengi.
 */
export function keyPalette(
  camelot: number | null,
  keyColors: readonly Rgb[],
  fallback: { low: Rgb; high: Rgb },
  warm: Rgb,
  white: Rgb,
): ShowPalette {
  const lights = { warm: warm.map(srgbToLinear) as Rgb, white: white.map(srgbToLinear) as Rgb };
  if (camelot !== null && Number.isFinite(camelot) && keyColors.length === 12) {
    const i = ((((Math.round(camelot) - 1) % 12) + 12) % 12) + 1;
    return {
      primary: gelColor(keyColors[i - 1]!),
      secondary: gelColor(keyColors[secondaryKey(i) - 1]!),
      ...lights,
    };
  }
  return { primary: gelColor(fallback.low), secondary: gelColor(fallback.high), ...lights };
}

// ---------------------------------------------------------------------------------------------
// Kurgu: her an için ışık şovunun durumu

export type ShowPhase =
  "live" | "calm" | "verse" | "build" | "gap" | "drop" | "high" | "breakdown" | "outro";

/** O anki sesten (analiz yokken canlı mod için). */
export interface LiveInput {
  /** Bas (0..1), genel düzey (0..1). */
  bass: number;
  level: number;
}

export interface ShowOptions {
  intensity: Intensity;
  safe: boolean;
  reducedMotion: boolean;
}

/** Desenler: fikstürlerin yönünü belirleyen kalıplar. */
export type Pattern = "sweep" | "converge" | "burst" | "chase" | "spot" | "rise";

export interface ShowCue {
  phase: ShowPhase;
  /** Yanan arka tavan ışını sayısı (kesirli = sönmekte), sahne zemini, yan, lazer. */
  back: number;
  floor: number;
  side: number;
  laser: number;
  /** Ana ışık düzeyi (pozlamadan önce; 1 olağan). */
  level: number;
  /** Salonun pustan yansıyan genel ışığı (0..1). */
  fill: number;
  /** Strob (bu anda: 0 kapalı … 1 tam) ve strob penceresi (çakmalar arası karanlık). */
  strobe: number;
  strobeActive: boolean;
  /** Drop vuruşu (1 → 0 sönen dürtü). */
  hit: number;
  pattern: Pattern;
  /** Önceki desenden geçiş (0 → 1) ve önceki desen. */
  patternFrom: Pattern;
  patternMix: number;
  /** Kurulumda toplanma (0..1). */
  focus: number;
  /** Süpürme genliği ve hızı (radyan, radyan/sn); aşağı (seyircinin üstünden zemine) mi? */
  sweep: number;
  sweepDown: boolean;
  sweepSpeed: number;
  /** Vuruşa kilitli adımın sırası ve adımın içindeki ilerleyiş (0..1); adım yoksa −1. */
  step: number;
  stepEase: number;
  /** Vuruş nabzı (1 → 0); güvenli modda ölçü başına, ≤ 1/sn. */
  pulse: number;
  /** Nabzın derinliği: 0 nabız yalnızca parlatır, 1 nabızlar arası karanlık (kurulumda çakma). */
  flicker: number;
  /** Renk: ana/karşıt jel karışımı (0 ana … 1 karşıt), sıcak beyaz payı. */
  colorMix: number;
  warmth: number;
  /** Kamera: çekim, çekimin başladığı an, önceki çekim (güvenli modda yumuşak geçiş için). */
  shot: Shot;
  shotStart: number;
  prevShot: Shot;
  /** Önceki çekimin başladığı an (güvenli modda önceki çekim kaldığı yerden sürer). */
  prevShotStart: number;
  /** Kamera itişi (metre; + ileri) ve görüş açısı farkı (derece). */
  push: number;
  fovKick: number;
  /** Doruğun gücü (0..1; dropsuz şarkıda daha küçük). */
  climax: number;
}

export type Shot = "foh" | "low" | "crane" | "build" | "wide";
export const SHOTS: Shot[] = ["foh", "low", "crane"];

/** Drop açılımının süresi (ölçü). */
export const DROP_BARS = 4;
/** Güvenli modda en fazla aynı anda yanan ışın. */
export const SAFE_MAX_BEAMS = 8;
/** Güvenli modda süpürmenin en yüksek açısal hızı (radyan/sn). */
export const SAFE_SWEEP_SPEED = 0.18;

const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Kırılma, yüksek bölüm vb. için bölümün türü. */
function sectionPhase(section: SectionCue | null, sheet: CueSheet, t: number): ShowPhase {
  if (!section) return "calm";
  if (section.outro) return "outro";
  if (section.breakdown) return "breakdown";
  if (section.energy >= 0.62) return "high";
  if (section.energy >= 0.4 || t > (sheet.climaxes[0]?.time ?? Infinity)) return "verse";
  return "calm";
}

/**
 * Şovun `t` anındaki durumu. `live`: canlı mod için o anki ses (harita yokken); `bpm`: ölçü başı
 * yoksa vuruş ızgarası için tempo.
 */
export function showCue(
  sheet: CueSheet,
  t: number,
  opts: ShowOptions,
  quality: QualityProfile,
  live: LiveInput | null = null,
  bpm = 120,
): ShowCue {
  const prof = INTENSITY_PROFILES[opts.intensity];
  const time = Number.isFinite(t) ? t : 0;
  const pos = barPosition(sheet, time, bpm);
  const ahead = sheet.live ? null : climaxAhead(sheet, time);
  const behind = sheet.live ? null : climaxBehind(sheet, time);
  const sIndex = sheet.live ? -1 : sectionIndexAt(sheet, time);
  const section = sIndex >= 0 ? sheet.sections[sIndex]! : null;

  const cue: ShowCue = {
    phase: "calm",
    back: 0,
    floor: 0,
    side: 0,
    laser: 0,
    level: 1,
    fill: 0.15,
    strobe: 0,
    strobeActive: false,
    hit: 0,
    pattern: "sweep",
    patternFrom: "sweep",
    patternMix: 1,
    focus: 0,
    sweep: 0.35,
    sweepDown: false,
    sweepSpeed: 0.22 * prof.sweep,
    step: -1,
    stepEase: 1,
    pulse: 0,
    flicker: 0,
    colorMix: 0,
    warmth: 0,
    shot: "foh",
    shotStart: 0,
    prevShot: "foh",
    prevShotStart: 0,
    push: 0,
    fovKick: 0,
    climax: 0,
  };
  const beatPulse = Math.exp(-pos.beatPhase * 5);

  if (sheet.live) {
    // Canlı mod: analiz yok; ışın sayısı ve düzey o anki sesten.
    const level = clamp01(live?.level ?? 0.4);
    const bass = clamp01(live?.bass ?? 0);
    cue.phase = "live";
    cue.back = 3 + level * 5;
    cue.floor = level > 0.6 ? (level - 0.6) * 10 : 0;
    cue.level = 0.7 + 0.5 * level + 0.35 * bass;
    cue.fill = 0.12 + 0.2 * level;
    cue.sweep = 0.4;
    cue.sweepSpeed = (0.15 + 0.25 * level) * prof.sweep;
    cue.pulse = bass;
  } else if (ahead && time >= ahead.climax.gapStart) {
    // Boşluk: doruktan hemen önce karanlık.
    applyBuild(cue, ahead.climax, 1, 1, pos);
    cue.phase = "gap";
    cue.level = 1 - 0.97 * ahead.climax.gapDepth;
    cue.fill = 0.03;
    cue.push = -0.6 * smooth(ahead.climax.gapStart, ahead.climax.time, time);
  } else if (ahead) {
    // Kurulum: ışınlar tepede toplanır, her ölçüde biri söner (8 → 1).
    applyBuild(cue, ahead.climax, ahead.progress, ahead.barsLeft, pos);
    // Kalan ışınlar vuruşta çakar; çakma doruğa yaklaştıkça hızlanır (dörtlük → sekizlik →
    // onaltılık, son ölçüde otuzikilik): yükselişin davul dolgusu gibi.
    const rate = buildRate(ahead.barsLeft);
    const sub = pos.beatPhase * rate;
    cue.pulse = Math.exp(-(sub - Math.floor(sub)) * 5);
    cue.flicker = 0.35 + 0.5 * ahead.progress;
    cue.push = 0.9 * ahead.progress * prof.camera;
  } else if (behind && behind.seconds < DROP_BARS * behind.climax.barSecs) {
    applyDrop(cue, behind.climax, behind.seconds, pos, prof, quality);
  } else {
    cue.phase = sectionPhase(section, sheet, time);
    applySection(cue, cue.phase, section, sheet, time, pos, prof);
    cue.pulse = cue.phase === "high" ? beatPulse : 0.45 * beatPulse;
  }
  // Gerçek ses: basın vuruşu (kick) ışınları her bölümde nefes aldırır.
  if (live && !sheet.live) cue.pulse = Math.max(cue.pulse, 0.6 * clamp01((live.bass - 0.35) / 0.5));

  // Yoğunluk: ışın sayısı (doruk ve kurulum hariç: geri sayım her yoğunlukta 8 → 1).
  if (cue.phase !== "build" && cue.phase !== "gap") {
    cue.back *= prof.beams;
    cue.floor *= prof.beams;
    cue.side *= prof.beams;
    cue.laser *= prof.beams;
  }
  clampCounts(cue, quality);
  chooseShot(cue, sheet, time, section, sIndex, ahead?.climax ?? null, behind);

  if (opts.reducedMotion) {
    cue.flicker = Math.min(cue.flicker, 0.3);
    cue.strobe = 0;
    cue.strobeActive = false;
    cue.sweepSpeed *= 0.35;
    cue.step = -1;
    cue.stepEase = 1;
    cue.push = 0;
    cue.fovKick = 0;
    cue.shot = "foh";
    cue.prevShot = "foh";
    cue.prevShotStart = 0;
    cue.shotStart = 0;
  }
  if (opts.safe) applySafe(cue, sheet, time, ahead?.climax ?? null, behind, pos);
  return cue;
}

/** Kurulumda vuruş başına çakma sayısı: kalan ölçüye göre hızlanır. */
export function buildRate(barsLeft: number): number {
  if (barsLeft > 4) return 1;
  if (barsLeft > 2) return 2;
  if (barsLeft > 1) return 4;
  return 8;
}

function applyBuild(
  cue: ShowCue,
  climax: Climax,
  progress: number,
  barsLeft: number,
  pos: { beatPhase: number },
) {
  cue.phase = "build";
  cue.climax = climax.strength;
  cue.back = Math.min(8, barsLeft);
  cue.floor = 0;
  cue.laser = 0;
  cue.side = 0;
  cue.pattern = "converge";
  cue.patternFrom = "sweep";
  cue.patternMix = smooth(0, 0.25, progress);
  cue.focus = progress;
  cue.sweep = 0.1;
  cue.sweepSpeed = 0.15;
  // Kalan ışınlar giderek parlar; salon kararır (gözler toplanan ışına).
  cue.level = 1 + 0.9 * progress;
  cue.fill = 0.12 * (1 - progress) + 0.04;
  cue.colorMix = 0;
  cue.warmth = 0.15 * progress;
  void pos;
}

function applyDrop(
  cue: ShowCue,
  climax: Climax,
  seconds: number,
  pos: { beatPhase: number; barPhase: number; beat: number; bar: number },
  prof: IntensityProfile,
  quality: QualityProfile,
) {
  const strength = climax.strength;
  cue.phase = "drop";
  cue.climax = strength;
  const big = climax.final ? 1 : 0.85;
  cue.back = quality.back * big;
  cue.floor = quality.floor * big;
  cue.side = quality.side * (climax.final ? 1 : 0.5);
  cue.laser = quality.laser;
  cue.pattern = "burst";
  cue.patternFrom = "converge";
  // Açılım: toplanmış ışınlar bir vuruşun dörtte birinde dışarı patlar (yaylı, hafif aşmalı).
  cue.patternMix = clamp01(seconds / 0.18);
  cue.hit = prof.hit * strength * Math.exp(-seconds / 0.45);
  cue.level = 1.15 + 0.6 * cue.hit;
  cue.fill = 0.16 + 0.25 * cue.hit;
  cue.sweep = 0.25;
  cue.sweepSpeed = 0.6 * prof.sweep;
  cue.step = pos.bar * 4 + pos.beat;
  cue.stepEase = smooth(0, 0.18, pos.beatPhase);
  cue.pulse = Math.exp(-pos.beatPhase * 6);
  // Renk her ölçü başında ana ve karşıt jel arasında yer değiştirir (vuruşun ilk onda birinde).
  const swap = pos.bar + smooth(0, 0.1, pos.barPhase);
  cue.colorMix = 0.5 - 0.35 * Math.cos(Math.PI * swap);
  // Strob: vuruşa kilitli (ölçü başlarından, mutlak zaman), ilk `strobeBars` ölçü.
  const barSecs = climax.barSecs;
  if (prof.strobePerBeat > 0 && seconds < prof.strobeBars * barSecs) {
    const flashes = pos.beatPhase * prof.strobePerBeat;
    const phase = flashes - Math.floor(flashes);
    cue.strobe = (phase < 0.32 ? 1 : 0) * Math.max(0.6, strength);
    cue.strobeActive = true;
  }
  // Kamera: drop karesinde ileri fırlar, yayla oturur; görüş açısı açılıp daralır.
  cue.push = springStep(seconds) * 1.6 * prof.camera;
  cue.fovKick = 9 * Math.exp(-seconds / 0.5) * strength;
}

/**
 * Yaylı adım tepkisi (0 → 1, hafif aşmalı): kameranın dropta ileri atılıp oturması (beklenti ve
 * aşma, canlandırmanın "anticipation / overshoot" ilkesi).
 */
export function springStep(seconds: number): number {
  if (!(seconds > 0)) return 0;
  const tau = 0.28;
  const omega = (2 * Math.PI) / 1.1;
  return (
    1 -
    Math.exp(-seconds / tau) *
      (Math.cos(omega * seconds) + Math.sin(omega * seconds) / (omega * tau))
  );
}

function applySection(
  cue: ShowCue,
  phase: ShowPhase,
  section: SectionCue | null,
  sheet: CueSheet,
  time: number,
  pos: { beatPhase: number; barPhase: number; beat: number; bar: number; barSecs: number },
  prof: IntensityProfile,
) {
  const energy = section?.energy ?? 0.3;
  const sinceStart = section ? time - section.time : time;
  switch (phase) {
    case "high": {
      cue.back = 4 + 6 * energy;
      cue.floor = 2 + 4 * energy;
      cue.side = energy > 0.85 ? 2 : 0;
      cue.laser = energy > 0.8 ? 4 : 0;
      cue.pattern = pos.bar % 4 < 2 ? "chase" : "sweep";
      cue.patternFrom = pos.bar % 4 < 2 ? "sweep" : "chase";
      cue.patternMix = smooth(0, 0.5, pos.barPhase + (pos.bar % 2));
      cue.level = 1.05;
      cue.fill = 0.28;
      cue.sweep = 0.45;
      cue.sweepSpeed = 0.5 * prof.sweep;
      cue.step = pos.bar * 4 + pos.beat;
      cue.stepEase = smooth(0, 0.2, pos.beatPhase);
      cue.colorMix = section && section.repeat % 2 === 1 ? 0.7 : 0.3;
      break;
    }
    case "breakdown": {
      cue.back = 3;
      cue.floor = 0;
      cue.side = 0;
      cue.laser = 0;
      cue.pattern = "spot";
      cue.patternFrom = "spot";
      cue.patternMix = smooth(0, 2, sinceStart);
      cue.level = 0.85;
      cue.fill = 0.1;
      cue.sweep = 0.5;
      cue.sweepSpeed = 0.12 * prof.sweep;
      cue.warmth = 0.35;
      cue.colorMix = 0.5;
      break;
    }
    case "outro": {
      // Işınlar ölçü ölçü söner; son ışın yukarıyı gösterir.
      const span = section ? section.end - section.time : 16;
      const left = clamp01(1 - (time - (section?.time ?? 0)) / Math.max(1, span));
      const bars = Math.ceil(left * 8);
      cue.back = bars;
      cue.floor = 0;
      cue.pattern = "rise";
      cue.patternFrom = "sweep";
      cue.patternMix = smooth(0, 3, sinceStart);
      cue.level = 0.8;
      cue.fill = 0.08 * left + 0.03;
      cue.sweep = 0.2;
      cue.sweepSpeed = 0.1 * prof.sweep;
      cue.warmth = 0.3;
      break;
    }
    default: {
      // Giriş ve kıta: birkaç ışın pusta yavaşça tarar.
      cue.back = 2 + Math.round(energy * 6);
      cue.floor = phase === "verse" && energy > 0.5 ? 2 : 0;
      cue.pattern = "sweep";
      cue.patternFrom = "sweep";
      cue.level = 0.85 + 0.25 * energy;
      cue.fill = 0.1 + 0.15 * energy;
      cue.sweep = 0.38;
      cue.sweepSpeed = (0.16 + 0.2 * energy) * prof.sweep;
      cue.colorMix = section && section.label % 2 === 1 ? 0.5 : 0;
      cue.sweepDown = Math.floor(pos.bar / 8) % 2 === 1;
      break;
    }
  }
  void sheet;
}

function clampCounts(cue: ShowCue, q: QualityProfile) {
  cue.back = Math.max(0, Math.min(q.back, cue.back));
  cue.floor = Math.max(0, Math.min(q.floor, cue.floor));
  cue.side = Math.max(0, Math.min(q.side, cue.side));
  cue.laser = Math.max(0, Math.min(q.laser, cue.laser));
}

/**
 * Kamera çekimi: her bölüm kendi çekimini alır (şarkıya göre belirlenimci; aynı nakarat aynı
 * çekimle başlar, tekrarında bir sonrakine kayar). Kurulum ana salon çekimi (yavaşça ileri),
 * kırılma vinç, ilk drop ışınların içinde alçak çekim, son doruk tünel.
 */
function chooseShot(
  cue: ShowCue,
  sheet: CueSheet,
  time: number,
  section: SectionCue | null,
  sIndex: number,
  building: Climax | null,
  behind: { climax: Climax; seconds: number } | null,
) {
  if (sheet.live) {
    const segment = Math.floor(time / 24);
    cue.shot = SHOTS[(hashMix(segment) >>> 0) % SHOTS.length]!;
    cue.shotStart = segment * 24;
    cue.prevShot = SHOTS[(hashMix(segment - 1) >>> 0) % SHOTS.length]!;
    cue.prevShotStart = (segment - 1) * 24;
    return;
  }
  const sectionShot = (s: SectionCue | null): Shot => {
    if (!s) return "foh";
    if (s.breakdown) return "low";
    if (s.outro) return "foh";
    return SHOTS[shotIndex(sheet.seed, s.label, s.repeat, SHOTS.length)]!;
  };
  if (building) {
    cue.shot = "build";
    cue.shotStart = building.buildStart;
    const before = sheet.sections[sectionIndexAt(sheet, building.buildStart - 0.01)] ?? null;
    cue.prevShot = sectionShot(before);
    cue.prevShotStart = before?.time ?? 0;
    return;
  }
  if (behind && behind.seconds < DROP_BARS * behind.climax.barSecs) {
    cue.shot = behind.climax.final ? "wide" : "low";
    cue.shotStart = behind.climax.time;
    // Her doruğun önünde kurulum vardır: önceki çekim kurulumun çekimi.
    cue.prevShot = "build";
    cue.prevShotStart = behind.climax.buildStart;
    return;
  }
  cue.shot = sectionShot(section);
  // Bölüm bir drop açılımının içinde başladıysa çekim açılımın bitişinde başlar.
  let start = section ? section.time : 0;
  if (behind) start = Math.max(start, behind.climax.time + DROP_BARS * behind.climax.barSecs);
  cue.shotStart = start;
  const prev = sIndex > 0 ? sheet.sections[sIndex - 1]! : null;
  cue.prevShot =
    behind && start > (section?.time ?? 0)
      ? behind.climax.final
        ? "wide"
        : "low"
      : sectionShot(prev);
  cue.prevShotStart =
    behind && start > (section?.time ?? 0) ? behind.climax.time : (prev?.time ?? 0);
}

/**
 * Güvenli yorum: aynı koreografi, parlamasız. Strob yok; boşlukta karartma yarıya ve 1,5 sn'de;
 * drop açılımı mekânsal (ışınlar 1,5 sn'de açılır, kamera geri çekilir); vuruş adımı ve titreşim
 * yok; nabız yalnızca ölçü başında ve ölçü ≥ 1 sn ise; en fazla `SAFE_MAX_BEAMS` ışın; yavaş
 * süpürme. Kalan sıçramaları (bölüm sınırları) `stepSafeLights` hız sınırıyla yumuşatır.
 */
function applySafe(
  cue: ShowCue,
  sheet: CueSheet,
  time: number,
  building: Climax | null,
  behind: { climax: Climax; seconds: number } | null,
  pos: { barPhase: number; barSecs: number },
) {
  cue.strobe = 0;
  cue.strobeActive = false;
  cue.flicker = 0;
  cue.hit = 0;
  cue.step = -1;
  cue.stepEase = 1;
  cue.fovKick = 0;
  cue.sweepSpeed = Math.min(cue.sweepSpeed, SAFE_SWEEP_SPEED);
  // Ölçü başında yumuşak bir nefes (yükselişi de yumuşak: karede sıçrama yok).
  cue.pulse =
    pos.barSecs >= 1 ? 0.2 * smooth(0, 0.15, pos.barPhase) * Math.exp(-pos.barPhase * 3) : 0;
  if (cue.phase === "gap" || cue.phase === "build") {
    const climax = building!;
    // Karartma: doruktan 1,5 sn önce başlar, yarıya iner.
    const dim = 0.5 * climax.gapDepth * smooth(climax.time - 1.5, climax.time, time);
    cue.level = Math.min(cue.level, 1.3) * (1 - dim);
    cue.fill = Math.max(cue.fill, 0.08);
    cue.push = 0;
  }
  if (cue.phase === "drop") {
    // Renk değişimi yavaş (ölçü başında sıçramaz).
    cue.colorMix = 0.5 - 0.35 * Math.cos(time * 0.5);
  }
  if (behind && cue.phase === "drop") {
    const open = smooth(0, 1.5, behind.seconds);
    cue.patternMix = open;
    cue.level = 1;
    cue.fill = 0.2 + 0.1 * open;
    // Mekânsal açılım: kamera yavaşça geri çekilir.
    cue.push = -1.2 * smooth(0, 3, behind.seconds);
  }
  const total = cue.back + cue.floor + cue.side + cue.laser;
  if (total > SAFE_MAX_BEAMS) {
    const k = SAFE_MAX_BEAMS / total;
    cue.back *= k;
    cue.floor *= k;
    cue.side *= k;
    cue.laser *= k;
  }
  void sheet;
}

// ---------------------------------------------------------------------------------------------
// Güvenli modda tek hız sınırlı ışık düzeyi

/** Güvenli modda ışık düzeyinin ve her ışının parlaklığının en yüksek değişim hızı (1/sn). */
export const SAFE_LEVEL_RATE = 0.35;
export const SAFE_BEAM_RATE = 0.8;

export interface SafeLights {
  level: number;
  fill: number;
  /** Işın başına görünürlük (0..1). */
  beams: Float32Array;
}

export function createSafeLights(count: number): SafeLights {
  return { level: 0, fill: 0, beams: new Float32Array(count) };
}

/**
 * Güvenli modda ışık düzeyini ve ışınların görünürlüğünü hız sınırıyla hedefe yaklaştırır
 * (yerinde; karede bellek ayırmaz). `jump`: sarma ya da şarkı değişimi: değerler hemen hedefe
 * oturur (kullanıcının kendi eylemi; parlama sayılmaz, tek bir değişimdir).
 */
export function stepSafeLights(
  state: SafeLights,
  level: number,
  fill: number,
  beams: Float32Array,
  dt: number,
  jump: boolean,
): void {
  const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
  const approach = (current: number, target: number, rate: number) =>
    jump ? target : current + Math.max(-rate * step, Math.min(rate * step, target - current));
  state.level = approach(state.level, level, SAFE_LEVEL_RATE);
  state.fill = approach(state.fill, fill, SAFE_LEVEL_RATE);
  for (let i = 0; i < state.beams.length; i++) {
    state.beams[i] = approach(state.beams[i]!, beams[i] ?? 0, SAFE_BEAM_RATE);
  }
}

/**
 * Parlama testleri için ekranın ortalama parlaklığının kaba vekili (doğrusal ışık): salonun genel
 * ışığı + yanan ışınların payı + strob, ışık düzeyiyle çarpılmış.
 */
export function lightProxy(
  cue: Pick<ShowCue, "level" | "fill" | "strobe" | "back" | "floor" | "side" | "laser" | "hit">,
): number {
  const beams = cue.back + cue.floor + cue.side + 0.4 * cue.laser;
  return cue.level * (0.35 * cue.fill + 0.006 * beams) + 0.5 * cue.strobe + 0.1 * cue.hit;
}

// ---------------------------------------------------------------------------------------------
// Canlı mod girdisi ve palet geçişi

/** O anki sesten canlı mod girdisi: bas (ilk dört bant) ve etkin seviye (−60…0 dB → 0..1). */
export function liveInput(bands: readonly number[], rmsDb: readonly number[]): LiveInput {
  let bass = 0;
  const n = Math.min(4, bands.length);
  for (let i = 0; i < n; i++) bass += bands[i] ?? 0;
  const rms =
    rmsDb.length > 0 ? Math.max(...rmsDb.map((v) => (Number.isFinite(v) ? v : -60))) : -60;
  return { bass: clamp01(n > 0 ? bass / n : 0), level: clamp01((rms + 48) / 42) };
}

/** Palet değişince renklerin geçiş süresi (sn); güvenli modda iki katı. */
export const PALETTE_SECONDS = 2;

/**
 * Görünen paleti hedefe yaklaştırır (yerinde): her renk kanalı saniyede en fazla
 * `1 / PALETTE_SECONDS` değişir. Ton değişimi (bölümün tonu) ya da harita gelince renk sıçramaz.
 */
export function stepPalette(
  shown: ShowPalette,
  target: ShowPalette,
  dt: number,
  safe: boolean,
): void {
  const step =
    (Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.25)) : 0) /
    (PALETTE_SECONDS * (safe ? 2 : 1));
  for (const key of ["primary", "secondary", "warm", "white"] as const) {
    for (let k = 0; k < 3; k++) {
      const d = target[key][k]! - shown[key][k]!;
      shown[key][k] = shown[key][k]! + Math.max(-step, Math.min(step, d));
    }
  }
}

export function copyPalette(p: ShowPalette): ShowPalette {
  return {
    primary: [...p.primary],
    secondary: [...p.secondary],
    warm: [...p.warm],
    white: [...p.white],
  };
}
