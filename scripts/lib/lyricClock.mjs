/**
 * Söz zamanlaması denetiminin sınırları (scripts/check-scenes.mjs): tek tük düzensiz kare (vsync
 * kaçması, çöp toplama) bir olayı bir iki kare kaydırabilir; sistematik bir kare gecikme ise her ölçümü
 * aşar. Sınır yarım karedir: 60 Hz'te 8 ms (değişmez); CI makinesi yavaşken (kareler 17 ms'den uzun)
 * ölçülen karenin yarısı. Bir karelik gecikme yine her zaman yakalanır: denetimin sıkı yolu kareler 20 ms'den
 * kısayken çalışır, yarım kare de 10 ms'nin altında kalır.
 */

/** 60 Hz'te yarım kare (ms): oynatma saatinin tahmini (bildirimler arası yerel saat, IPC) birkaç ms oynar. */
export const LYRIC_TOLERANCE_MS = 8;
/** Bundan uzun kareler (ms) 60 Hz'in altındadır; 60 Hz'in kendi titremesi (16,6–16,8 ms) sınırı oynatmaz. */
export const LYRIC_SLOW_FRAME_MS = 17;
/** Tek bir düzensiz karede kabul edilen en büyük sapma (ms; bir kare ve biraz pay). */
export const LYRIC_FRAME_LIMIT_MS = 20;

/** Ölçülen ortanca kare süresine (ms) göre yarım kare sınırı: 60 Hz'te ve daha hızlıda 8 ms. */
export function lyricTolerance(frameMs) {
  return frameMs > LYRIC_SLOW_FRAME_MS ? frameMs / 2 : LYRIC_TOLERANCE_MS;
}

/**
 * Söz saatinin sapmaları (ms) için hüküm: %95'i yarım karenin, %99'u bir karenin (ve payın) içinde
 * olmalı.
 */
export function lyricClockVerdict(errors, frameMs) {
  const sorted = errors.map(Math.abs).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(errors.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(errors.length * 0.99)] ?? 0;
  return { p95, p99, ok: p95 <= lyricTolerance(frameMs) && p99 <= LYRIC_FRAME_LIMIT_MS };
}
