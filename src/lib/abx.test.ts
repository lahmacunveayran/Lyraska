import type { AbxStatus } from "./backend";
import {
  TRIAL_CHOICES,
  baseName,
  binomialTail,
  neededCorrect,
  percentText,
  powerText,
  setupSummary,
  testPower,
  verdict,
} from "./abx";

describe("kör test hesapları", () => {
  it("binom kuyruğu çekirdekle aynı değerleri verir", () => {
    expect(binomialTail(12, 16)).toBeCloseTo(2517 / 65536, 12);
    expect(binomialTail(8, 16)).toBeCloseTo(39203 / 65536, 12);
    expect(binomialTail(0, 16)).toBe(1);
    expect(binomialTail(17, 16)).toBe(0);
  });

  it("kaç doğru gerektiğini söyler", () => {
    expect(neededCorrect(16)).toBe(12);
    expect(neededCorrect(8)).toBe(7);
    expect(neededCorrect(20)).toBe(15);
  });

  // Beklenen değerler koddan bağımsız, tam kesirle hesaplandı:
  // Σ_{k≥c} C(n,k)·p^k·(1−p)^(n−k), Python `fractions` + `math.comb`.
  it("isabet olasılığı verilince binom kuyruğu tam kesirle aynı", () => {
    // 16 denemede ≥ 12 doğru, p = 0,7: 899 808 239 649 809 / 2·10^15.
    expect(binomialTail(12, 16, 0.7)).toBeCloseTo(899808239649809 / 2e15, 12);
    expect(binomialTail(7, 8, 0.9)).toBeCloseTo(0.81310473, 12);
    expect(binomialTail(12, 16, 0.5)).toBeCloseTo(2517 / 65536, 12);
    expect(binomialTail(3, 8, 1)).toBe(1);
    expect(binomialTail(3, 8, 0)).toBe(0);
  });

  it("testin gücü: farkı duyan dinleyicinin testi geçme olasılığı", () => {
    // Leventhal (JAES 1986): 16 denemede isabeti 0,7 olan dinleyici testi ancak %45 geçer.
    expect(testPower(16, 0.7)).toBeCloseTo(0.4499041198249045, 12);
    expect(testPower(30, 0.7)).toBeCloseTo(0.7303703863027231, 12);
    expect(testPower(50, 0.7)).toBeCloseTo(0.8594401236111058, 12);
    expect(testPower(16, 0.9)).toBeCloseTo(0.9829960017221205, 12);
    // Güç deneme sayısıyla düzgün artmaz (gereken doğru sayısı basamaklı): 20 < 16.
    expect(testPower(20, 0.7)).toBeCloseTo(0.4163708294474814, 12);
    // Şansla tahmin eden (p = 0,5) için güç, yanlış "duyuyor" deme olasılığıdır: ≤ %5.
    for (const n of TRIAL_CHOICES) expect(testPower(n, 0.5)).toBeLessThanOrEqual(0.05);
  });

  it("güç metni ve uzun test seçenekleri", () => {
    expect(powerText(16)).toBe(
      "Farkı 10 denemenin 7'sinde duyan biri bu testi %45 olasılıkla geçer.",
    );
    expect(powerText(50)).toContain("%85,9");
    expect(TRIAL_CHOICES).toContain(30);
    expect(TRIAL_CHOICES).toContain(50);
    expect(neededCorrect(30)).toBe(20);
    expect(neededCorrect(50)).toBe(32);
  });

  it("yüzdeyi Türkçe yazar", () => {
    expect(percentText(2517 / 65536)).toBe("%3,8");
    expect(percentText(0.5982)).toBe("%59,8");
    expect(percentText(1 / 65536)).toBe("%0,1'den az");
  });

  it("sonucu sade anlatır", () => {
    const heard = verdict({ correct: 12, total: 16, pValue: 2517 / 65536 });
    expect(heard.heard).toBe(true);
    expect(heard.title).toBe("Farkı duyuyorsunuz");
    expect(heard.detail).toContain("16 denemede 12 doğru");
    expect(heard.detail).toContain("%3,8");
    const not = verdict({ correct: 8, total: 16, pValue: 39203 / 65536 });
    expect(not.heard).toBe(false);
    expect(not.title).toBe("Ayırt edilemedi");
    // "Aynı geliyor" denmez: az denemeli test farkın yokluğunu göstermez, gücü yazılır.
    expect(not.detail).toContain("fark kanıtlanamadı");
    expect(not.detail).not.toContain("aynı geliyor");
    expect(not.detail).toContain("%45 olasılıkla");
  });

  it("kurulumu özetler, küçük farkları yazmaz", () => {
    const status = {
      startSecs: 30,
      clipSecs: 20,
      levelDiffDb: -0.42,
      offsetMs: 25.06,
    } as AbxStatus;
    expect(setupSummary(status)).toBe(
      "00:30–00:50 · seviye farkı 0,4 dB eşitlendi · kayma 25,1 ms düzeltildi",
    );
    expect(setupSummary({ ...status, levelDiffDb: 0.01, offsetMs: 0 })).toBe("00:30–00:50");
  });

  it("dosya adını yoldan ayırır", () => {
    expect(baseName("C:\\Müzik\\Şarkı.flac")).toBe("Şarkı.flac");
    expect(baseName("/home/x/a.mp3")).toBe("a.mp3");
  });
});
