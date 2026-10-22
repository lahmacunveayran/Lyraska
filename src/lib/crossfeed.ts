import type { CrossfeedPreset, CrossfeedSettings, CrossfeedState } from "./backend";
import { frequencyToRatio } from "./eq";

/** Çekirdeğin sınırları (`audio/crossfeed.rs`; `sanitized` ile aynı). */
export const CROSSFEED_LIMITS = {
  minCutoffHz: 300,
  maxCutoffHz: 1200,
  minLevelDb: 1,
  maxLevelDb: 15,
};

/** Çekirdeğin hazır ayarları (`audio/crossfeed.rs` `PRESETS`; bir test ikisini karşılaştırır). */
export const CROSSFEED_PRESETS: CrossfeedPreset[] = [
  { name: "Hafif", cutoffHz: 650, levelDb: 9.5 },
  { name: "Orta", cutoffHz: 700, levelDb: 6 },
  { name: "Güçlü", cutoffHz: 700, levelDb: 4.5 },
  { name: "Hoparlör gibi", cutoffHz: 570, levelDb: 1 },
];

/** Hazır ayarların kısa açıklamaları (düğmenin üstüne gelince). */
export const CROSSFEED_HINTS: Record<string, string> = {
  Hafif: "Jan Meier'in devresi: sahne biraz daralır, kulaklık hissi büyük ölçüde kalır.",
  Orta: "Chu Moy'un devresi: dengeli; çoğu kayıt için iyi bir başlangıç.",
  Güçlü: "bs2b'nin varsayılanı: sert sola/sağa kaydırılmış eski stereo kayıtlar için.",
  "Hoparlör gibi":
    "İki hoparlörün ±30°'de durduğu bir odadaki baş modeli: bas iki kulağa da neredeyse eşit gider.",
};

/** Çekirdeğin varsayılanı: kapalı, "Orta". */
export const DEFAULT_CROSSFEED: CrossfeedSettings = { enabled: false, cutoffHz: 700, levelDb: 6 };

/** Sürgülerin adımları. */
export const CUTOFF_STEP_HZ = 10;
export const LEVEL_STEP_DB = 0.5;

/** Çekirdeğin `sanitized` işleminin aynısı: sayı değilse varsayılan, sonra sınırlar. */
export function sanitizeCrossfeed(settings: CrossfeedSettings): CrossfeedSettings {
  const finite = (x: number, fallback: number) => (Number.isFinite(x) ? x : fallback);
  const { minCutoffHz, maxCutoffHz, minLevelDb, maxLevelDb } = CROSSFEED_LIMITS;
  return {
    enabled: settings.enabled,
    cutoffHz: Math.min(
      maxCutoffHz,
      Math.max(minCutoffHz, finite(settings.cutoffHz, DEFAULT_CROSSFEED.cutoffHz)),
    ),
    levelDb: Math.min(
      maxLevelDb,
      Math.max(minLevelDb, finite(settings.levelDb, DEFAULT_CROSSFEED.levelDb)),
    ),
  };
}

/**
 * Tamamen sola kaydırılmış seste sol (yakın) ve sağ (uzak) kulağa giden ses (dB), analog tasarım.
 * Karşı kulağın payı ρ = r0 / (1 + j·f/fc); yan süzgeç G = (1 − ρ)/(1 + ρ) olduğundan
 * yakın kulak (1 + G)/2 = 1/(1 + ρ), uzak kulak (1 − G)/2 = ρ/(1 + ρ).
 */
export function crossfeedResponseDb(
  settings: CrossfeedSettings,
  hz: number,
): { nearDb: number; farDb: number } {
  const r0 = Math.pow(10, -settings.levelDb / 20);
  const x = hz / settings.cutoffHz;
  // ρ = r0 (1 − jx) / (1 + x²)
  const rho = { re: r0 / (1 + x * x), im: (-r0 * x) / (1 + x * x) };
  // |1 + ρ|²
  const denominator = (1 + rho.re) ** 2 + rho.im ** 2;
  const rhoSquared = rho.re ** 2 + rho.im ** 2;
  return {
    nearDb: -10 * Math.log10(denominator),
    farDb: 10 * Math.log10(Math.max(1e-30, rhoSquared / denominator)),
  };
}

/** Kulaklar arası zaman farkı (µs): 1/(2π·fc). */
export function crossfeedDelayUs(cutoffHz: number): number {
  return 1e6 / (2 * Math.PI * cutoffHz);
}

/**
 * Çekirdeğin durumunun analog önizlemesi: sürgü sürüklenirken ve tarayıcıda. Çekirdek eğriyi
 * 96 kHz'teki sayısal süzgeçten hesaplar; 5 kHz'in altında ikisi arasındaki fark ≤ 0,07 dB, 20 kHz'e doğru
 * karşı kulakta 1,4 dB'ye çıkar (çift doğrusal dönüşümün frekans bükülmesi; orada karşı kulak zaten −25 dB'nin
 * altında). Çekirdekteki `durum_egrisi_analog_formulle_uyusur` testi bu sınırları denetler.
 */
export function previewCrossfeedState(
  settings: CrossfeedSettings,
  presets: CrossfeedPreset[] = CROSSFEED_PRESETS,
): CrossfeedState {
  const clean = sanitizeCrossfeed(settings);
  const curveHz = Array.from({ length: 121 }, (_, i) => 20 * Math.pow(1000, i / 120));
  const responses = curveHz.map((hz) => crossfeedResponseDb(clean, hz));
  return {
    settings: clean,
    presets,
    delayUs: crossfeedDelayUs(clean.cutoffHz),
    curveHz,
    nearDb: responses.map((r) => r.nearDb),
    farDb: responses.map((r) => r.farDb),
  };
}

/** Ayar bir hazır ayarın aynısıysa onun adı. */
export function matchCrossfeedPreset(
  settings: CrossfeedSettings,
  presets: CrossfeedPreset[],
): string | null {
  const preset = presets.find(
    (p) =>
      Math.abs(p.cutoffHz - settings.cutoffHz) < 0.5 &&
      Math.abs(p.levelDb - settings.levelDb) < 0.05,
  );
  return preset?.name ?? null;
}

/** "227 µs" gibi. */
export function formatDelayUs(us: number): string {
  return `${Math.round(us)} µs`;
}

/** Eğri alanının alt sınırı (dB): üst kenar 0 dB. */
export const CROSSFEED_FLOOR_DB = 36;

/** Eğriyi SVG yoluna çevirir: yatay eksen logaritmik frekans, dikey 0 dB (üst) … −`floorDb` (alt). */
export function crossfeedCurvePath(
  hz: number[],
  db: number[],
  width: number,
  height: number,
  floorDb = CROSSFEED_FLOOR_DB,
): string {
  const points = hz.map((f, i) => {
    const x = frequencyToRatio(f) * width;
    const clamped = Math.min(0, Math.max(-floorDb, db[i] ?? 0));
    const y = (-clamped / floorDb) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return points.length > 0 ? `M${points.join("L")}` : "";
}
