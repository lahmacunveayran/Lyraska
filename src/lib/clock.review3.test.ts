/**
 * Bağımsız inceleme 3 (ortak saat, 109ed78): `statusTime` çekirdeğin duvar saatini (Rust
 * `SystemTime`, Unix ms) arayüzün tekdüze saatine `performance.timeOrigin` ile çevirir. İkisi yalnızca
 * sayfa açıldığı an hizalıdır: duvar saati NTP ile düzeltilir, `performance.now()` düzeltilmez (kristal
 * sapması 10–100 ppm ≈ saatte 36–360 ms; uykudan dönüş, elle saat ayarı). Sahne denetiminin sahte
 * çekirdeği anı `performance.timeOrigin + read` ile, yani arayüzün kendi saatiyle yazar: fark sıfırdır,
 * denetim bunu göremez.
 *
 * Arayüzün saati duvar saatinden `skew` ms ilerideyse çekirdeğin anı `skew` kadar eski görünür;
 * pencere ([gönderme − 50, yanıt + 2]) 50 ms'ye kadarki farkı sessizce kabul eder ve konum o kadar
 * öne geçer (sözler erken). Ters yönde 2 ms'yi aşan fark reddedilir (eski kurala döner).
 */
import { describe, expect, it } from "vitest";
import { ClockOffset, statusTime } from "./clock";

/** Bir sorgu: arayüz saatiyle gönderme 1000, çekirdek ölçümü 1004, yanıt 1009 (ms). */
function measuredAt(skewMs: number) {
  const timeOrigin = 1_700_000_000_000; // sayfa açılırken duvar saati = arayüz saati
  const trueUiAt = 1004;
  // Çekirdeğin duvar saati: arayüzün saati `skew` ileri kaydıysa duvar saati o kadar geride okur.
  const wallAt = timeOrigin + trueUiAt - skewMs;
  // (İlk sürümde fark `timeOrigin` sayılıyordu; düzeltmeden sonra fark sorgulardan tahmin edilir:
  // çekirdek durumu ölçümle aynı anda okur, `readAtMs` = `wallAt`.)
  const offset = new ClockOffset();
  offset.add(wallAt, 1000, 1009);
  return statusTime(wallAt, offset.estimate(timeOrigin), 1000, 1009, null) - trueUiAt;
}

describe("inceleme 3: statusTime iki saatin kayması", () => {
  it("saat farkı yokken ölçüm anı tam (denetimin varsaydığı durum)", () => {
    expect(measuredAt(0)).toBeCloseTo(0, 9);
  });

  it("arayüzün saati duvar saatinden 30 ms ileri kaymışken konum öne geçmez", () => {
    // Saatlerce açık kalan oynatıcıda olağan; 50 ms'ye kadar fark sessizce kabul ediliyor.
    const errors = [5, 15, 30, 45].map((skew) => measuredAt(skew));
    const worst = errors.reduce((m, e) => (Math.abs(e) > Math.abs(m) ? e : m), 0);
    expect(
      Math.abs(worst),
      `sapmalar ${errors.map((e) => e.toFixed(1)).join(", ")} ms`,
    ).toBeLessThan(8);
  });
});
