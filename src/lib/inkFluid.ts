import type { LyricLine, SongMap } from "./backend";
import { LYRIC_TAIL } from "./lyrics";
import { confidentDrops, METER_CONFIDENCE_MIN, themeAt } from "./songMap";

/*
 * "Mürekkep" söz görünümü: sözler gerçek bir akışkanın içinde yazılır. Söylenen kelimenin ışık
 * cephesinden mürekkep akar ve harflerden duman gibi yükselir; uzun hece tutuldukça mürekkep kelimenin
 * çevresinde açılır; satır bitince yazı harf biçimiyle dumana dönüşüp girdaplarla dağılır. Şarkının
 * haritası akışı sürer: her ölçü başında akış nefes alır, enerji girdapları coşturur, drop'ta patlar,
 * renkler bölüme göre değişir.
 *
 * Akışkan: sıkıştırılamaz Navier–Stokes, Stam'ın "kararlı akışkanlar" yöntemiyle ekran kartında
 * (`inkRenderer.ts`): ∂u/∂t = −(u·∇)u − ∇p + f, ∇·u = 0. Taşıma yarı Lagrange (geri iz), basınç Poisson
 * denklemi ∇²p = ∇·u Jacobi yinelemesiyle, u ← u − ∇p ile ıraksaksız yapılır; ince girdaplar sayısal
 * sönümde kaybolmasın diye girdap güçlendirme (Fedkiw–Stam–Jensen 2001): f = ε (N × ω), N = ∇|ω| / |∇|ω||.
 * Mürekkep kaldırma kuvvetiyle yükselir (Boussinesq: f = β ρ ĵ).
 *
 * Bu dosya yalnızca saf hesaplardır (zaman çizelgesi, sabitler, renkler, girdap dizisi): çizimden
 * bağımsız test edilir. Olaylar yarı açık aralıklarla (t0, t1] üretilir: kare hızı ne olursa olsun her
 * olay tam bir kez olur (testi var).
 */

// ---------- Akışkanın sabitleri ----------

/** Benzetim ızgarasının bir hücresi (CSS pikseli) ve en fazla hücre sayısı. */
export const SIM_CELL = 4;
export const SIM_MAX = [384, 160] as const;
/** Mürekkep dokusunun bir pikseli (CSS pikseli): harf biçimi dumanda okunacak kadar ince. */
export const DYE_CELL = 1.5;
export const DYE_MAX = [1024, 448] as const;
/** Basınç Poisson denkleminin Jacobi yineleme sayısı ve önceki karenin basıncından başlama payı. */
export const PRESSURE_ITERATIONS = 24;
export const PRESSURE_WARM = 0.8;
/**
 * Açık viskozite adımının katsayısı k = ν dt / h². Dalga boyu λ hücre olan kip bir adımda
 * 1 − 2k·a·(1 − cos 2π/λ) katına iner (a: değiştiği eksen sayısı). Izgara ölçeğindeki dama tahtası
 * (λ = 2, iki eksen) 1 − 8k = 0,2 katına; 20 hücrelik (80 px) girdap tek eksende 0,990, iki eksende 0,980.
 */
export const VISCOSITY_K = 0.1;

/** k ∇² adımında dalga boyu `lambda` hücre olan kipin bir adımda kalan payı (`axes`: 1 ya da 2). */
export function viscosityKeep(lambda: number, axes: 1 | 2 = 2, k = VISCOSITY_K): number {
  return 1 - 2 * k * axes * (1 - Math.cos((2 * Math.PI) / lambda));
}
/** Mürekkebin ve hızın yarılanma süresi (saniye): duman ~3 sn'de kaybolur, akış ~2 sn'de durulur. */
export const DYE_HALF_LIFE = 0.85;
export const VELOCITY_HALF_LIFE = 0.7;
/** Bir benzetim adımı en çok bu kadar (saniye); bir karede en çok bu kadar zaman ilerler. */
export const MAX_STEP = 1 / 60;
export const MAX_FRAME = 1 / 20;
/** Bundan büyük atlama sarma sayılır: akışkan temizlenir (geçmişi bilinmez). */
export const JUMP_SECS = 0.5;

/**
 * Bir adımdaki sönüm çarpanı: d = 0,5^(dt / T½). Çarpım adımların toplamına bağlıdır, adımların
 * bölünüşüne değil: kare hızı ne olursa olsun yarılanma süresi aynıdır.
 */
export function decayFactor(halfLife: number, dt: number): number {
  return Math.pow(0.5, Math.max(0, dt) / halfLife);
}

/** Karenin benzetim adımları: geçen süre `MAX_FRAME` ile sınırlı, eşit `MAX_STEP`'ten küçük adımlar. */
export function stepPlan(dt: number): { steps: number; h: number } {
  const span = Math.min(Math.max(0, dt), MAX_FRAME);
  if (span <= 0) return { steps: 0, h: 0 };
  const steps = Math.ceil(span / MAX_STEP - 1e-9);
  return { steps, h: span / steps };
}

/**
 * Girdap güçlendirme katsayısı ε (hücre/sn²) ve kaldırma katsayısı β (hücre/sn², birim mürekkep
 * yoğunluğunda): şarkının enerjisiyle (0..1) artar. Sakin bölümde duman yavaş kıvrılır, nakaratta coşar.
 */
export function vorticityFor(energy: number): number {
  return 16 + 22 * clamp01(energy);
}

export function buoyancyFor(energy: number): number {
  return 8 + 16 * clamp01(energy);
}

// ---------- Şarkının haritası ----------

/** Akışı süren müzik: harita (yoksa sabit orta enerji) ve harita saatinin söz saatinden farkı. */
export interface InkMusic {
  map: SongMap | null;
}

/** Saniyede bir enerji değerinin doğrusal ara değeri (0..1); harita yoksa 0,6. */
export function energyAt(map: SongMap | null, t: number): number {
  const e = map?.energy;
  if (!e || e.length === 0 || !Number.isFinite(t)) return 0.6;
  const x = Math.min(Math.max(t, 0), e.length - 1);
  const i = Math.floor(x);
  const a = e[i] ?? 0;
  const b = e[Math.min(i + 1, e.length - 1)] ?? a;
  return clamp01(a + (b - a) * (x - i));
}

/** Çalan bölümün renk teması (0..3). */
export function inkTheme(map: SongMap | null, t: number): number {
  return map ? themeAt(map.sections, t) : 0;
}

// ---------- Zaman çizelgesi ----------

/**
 * Satırın dumana dönüştüğü an: sıradaki satır hemen başlıyorsa (`lyricFrame` onu bitişik sayar)
 * onun başladığı an, yoksa satırın sonu (yazı `LYRIC_TAIL` içinde sönerken duman onu devralır).
 */
export function dissolveAt(lines: readonly LyricLine[], index: number): number {
  const line = lines[index]!;
  const next = lines[index + 1];
  return next && next.start - line.end < LYRIC_TAIL ? next.start : line.end;
}

/** Kelimenin vurgusu (0..1): kısa hece hafif, uzun hece güçlü damla. */
export function wordAccent(duration: number): number {
  return 0.35 + 0.65 * clamp01(duration / 0.9);
}

export type InkEvent =
  /** Kelimenin ilk anı: kelimenin ortasına düşen damla. */
  | { kind: "onset"; at: number; line: number; word: number; strength: number }
  /** Ölçü başı: akış satır boyunca nefes alır (yukarı itiş; yönü ölçüden ölçüye değişir). */
  | { kind: "breath"; at: number; strength: number; side: 1 | -1 }
  /** Drop: satırın ortasından patlama. */
  | { kind: "drop"; at: number; strength: number }
  /** Satır dumana dönüşür. */
  | { kind: "dissolve"; at: number; line: number };

/**
 * (t0, t1] aralığındaki olaylar, zamana göre sıralı. `musicShift`: harita saati = söz saati + kayma
 * (söz kaydırması sözü sesten ayırır, müzik olayları sesle kalır). Aralıkların her bölünüşünde olaylar
 * aynıdır: kare hızından bağımsız.
 */
export function inkEvents(
  lines: readonly LyricLine[],
  music: InkMusic,
  t0: number,
  t1: number,
  musicShift = 0,
): InkEvent[] {
  if (!(t1 > t0)) return [];
  const inside = (x: number) => x > t0 && x <= t1;
  const events: InkEvent[] = [];
  lines.forEach((line, l) => {
    line.words.forEach((w, k) => {
      if (inside(w.start) && w.text.trim())
        events.push({
          kind: "onset",
          at: w.start,
          line: l,
          word: k,
          strength: wordAccent(w.end - w.start),
        });
    });
    const gone = dissolveAt(lines, l);
    if (inside(gone)) events.push({ kind: "dissolve", at: gone, line: l });
  });
  const map = music.map;
  if (map) {
    const m0 = t0 + musicShift;
    const m1 = t1 + musicShift;
    if (map.meterConfidence >= METER_CONFIDENCE_MIN) {
      map.downbeats.forEach((d, i) => {
        if (d > m0 && d <= m1)
          events.push({
            kind: "breath",
            at: d - musicShift,
            strength: 0.4 + 0.6 * energyAt(map, d),
            side: i % 2 === 0 ? 1 : -1,
          });
      });
    }
    for (const d of confidentDrops(map)) {
      if (d > m0 && d <= m1) events.push({ kind: "drop", at: d - musicShift, strength: 1 });
    }
  }
  // Aynı anda dumana dönüşme önce: eski satırın maskesi yeni satırınkinden önce kullanılır.
  const order = { dissolve: 0, drop: 1, breath: 2, onset: 3 } as const;
  return events.sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind]);
}

// ---------- Kalem: söylenen kelimeden akan mürekkep ----------

/** Kalemin saniyedeki mürekkebi (maskenin tam dolu pikselinde): enerjiyle artar. */
export function penRate(energy: number): number {
  return 2.6 + 2.8 * clamp01(energy);
}

/**
 * Kalemin izi: cephenin gerisinde mürekkep e^(−(cephe − x) / kuyruk) ile azalır (taze yazı en çok
 * akar). Kuyruk kelime genişliğinin `PEN_TAIL` katı.
 */
export const PEN_TAIL = 0.3;

/**
 * Uzun hecede kelimeden yükselen dumanın gücü (girdap çiftinin hızı, hücre/sn²): heceyi tutan ses ne
 * kadar uzunsa duman o kadar güçlü yükselir.
 */
export function heldBloom(strength: number, energy: number): number {
  return strength * (90 + 90 * clamp01(energy));
}

// ---------- Girdaplar ----------

export interface Vortex {
  /** Yeri: kutunun genişliğine göre (0..1) ve dikey sapması (kutu yüksekliği biriminde, aşağı artı). */
  x: number;
  y: number;
  /** Dolaşım: işareti dönüş yönü (artı: saat yönünün tersi), büyüklüğü göreli güç. */
  gamma: number;
  /** Çekirdeğin yarıçapı (kutu yüksekliği biriminde). */
  size: number;
}

/**
 * Mürekkep damlası: sıkıştırılamaz akışta dışa itiş basınçla silinir (ıraksaklık yok); suya düşen damla
 * bir girdap halkasıyla açılır. İki boyutta halkanın kesiti zıt dönen iki girdaptır: solda saat yönünün
 * tersi, sağda saat yönü; aralarından akış yukarı fışkırır, mürekkep mantar biçiminde yükselip iki
 * yana kıvrılır. Toplam dolaşım sıfır.
 */
export function plume(spread: number): Vortex[] {
  return [
    { x: 0.5 - spread / 2, y: 0, gamma: 1, size: 0.45 },
    { x: 0.5 + spread / 2, y: 0, gamma: -1, size: 0.45 },
  ];
}

/**
 * Satırı dumana çeviren girdap dizisi: satır boyunca eşit aralıklı, yönleri sırayla değişen (von
 * Kármán girdap yolu gibi), büyüklükleri ve yerleri dağınık girdaplar. Toplam dolaşım sıfırdır (satır bütün olarak dönmez, yalnızca
 * harfler kıvrılarak kopar); yerleri satırın metninden türeyen küçük sapmalarla her satırda farklı ama
 * hep aynı (tohumlu).
 */
export function vortexStreet(text: string, widthPx: number, fontPx: number): Vortex[] {
  const count = Math.max(2, 2 * Math.round(widthPx / (0.9 * Math.max(8, fontPx)) / 2));
  let seed = hash(text);
  const random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let x = seed;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const vortices: Vortex[] = [];
  for (let i = 0; i < count; i++) {
    const magnitude = 0.5 + random();
    vortices.push({
      x: (i + 0.5 + (random() - 0.5) * 0.7) / count,
      y: (random() - 0.5) * 1.1,
      gamma: (i % 2 === 0 ? 1 : -1) * magnitude,
      size: 0.22 + 0.4 * random(),
    });
  }
  // Toplam dolaşım tam sıfır: rastgele büyüklüklerin farkı her girdaba eşit paylaştırılır.
  const net = vortices.reduce((s, v) => s + v.gamma, 0) / count;
  return vortices.map((v) => ({ ...v, gamma: v.gamma - net }));
}

// ---------- Renk ----------

/**
 * Bölüm temalarının mürekkep renkleri (doğrusal RGB, 0..1): satır boyunca birinciden ikinciye geçer.
 * Gece göğünün temalarıyla aynı sırada: 0 gece mavisi, 1 kor, 2 zümrüt, 3 ametist.
 */
export const INK_PALETTES: readonly (readonly [Rgb, Rgb])[] = [
  [
    [0.22, 0.4, 1.0],
    [0.25, 1.0, 0.88],
  ],
  [
    [1.0, 0.16, 0.32],
    [1.0, 0.72, 0.18],
  ],
  [
    [0.08, 0.9, 0.52],
    [0.85, 1.0, 0.3],
  ],
  [
    [0.5, 0.2, 1.0],
    [1.0, 0.3, 0.62],
  ],
];
export type Rgb = readonly [number, number, number];

/** Satırın iki ucunun rengi: tema ve satırın sırası (her satır paletin içinde biraz kayar). */
export function lineColors(theme: number, lineIndex: number): [Rgb, Rgb] {
  const [a, b] = INK_PALETTES[((theme % 4) + 4) % 4]!;
  // Tek satırlarda yön değişir: renk satırdan satıra dalgalanır.
  return lineIndex % 2 === 0 ? [a, b] : [b, a];
}

/** Drop'un beyaz-sıcak rengi. */
export const DROP_COLOR: Rgb = [1.0, 0.94, 0.86];

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
