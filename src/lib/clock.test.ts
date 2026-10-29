import {
  CORRECTION,
  FRAME_TIME_WINDOW_MS,
  frameTime,
  positionAt,
  reanchor,
  type ClockAnchor,
} from "./clock";

const playing: ClockAnchor = { position: 10, at: 1000, running: true };

describe("positionAt", () => {
  it("çalarken geçen süreyi ekler, duraklatılmışken sabit kalır", () => {
    expect(positionAt(playing, 1500, 200)).toBeCloseTo(10.5);
    expect(positionAt({ ...playing, running: false }, 5000, 200)).toBe(10);
  });

  it("şarkı süresini ve sıfırı aşmaz", () => {
    expect(positionAt(playing, 100_000, 30)).toBe(30);
    expect(positionAt({ position: -2, at: 0, running: false }, 0, 30)).toBe(0);
    expect(positionAt(playing, 500, 200)).toBe(10); // saatten önceki an
  });
});

describe("reanchor", () => {
  it("küçük sapmayı yumuşakça düzeltir, zıplamaz", () => {
    // 0,5 sn sonra tahmin 10,5; ses motoru 10,6 diyor → 10,525
    const next = reanchor(playing, 10.6, true, 1500, 200);
    expect(next.position).toBeCloseTo(10.5 + 0.1 * CORRECTION);
    expect(next.at).toBe(1500);
  });

  it("büyük farkı (sarma) hemen uygular", () => {
    expect(reanchor(playing, 95, true, 1500, 200).position).toBe(95);
  });

  it("duraklatma ve başlatmada bildirilen konumu doğrudan alır", () => {
    expect(reanchor(playing, 10.45, false, 1500, 200)).toEqual({
      position: 10.45,
      at: 1500,
      running: false,
    });
    expect(reanchor(null, 3, true, 1500, 200).position).toBe(3);
  });
});

describe("frameTime", () => {
  it("karenin başlangıcını kullanır: aynı karede önce koşan çizim konumu ileri kaydırmaz", () => {
    expect(frameTime(1000, 1004)).toBe(1000);
  });

  it("başka saatten ya da çok eski damgada şimdiki an", () => {
    expect(frameTime(250, 90_000)).toBe(90_000); // sahne denetiminin sanal saati
    expect(frameTime(1000, 1000 + FRAME_TIME_WINDOW_MS + 1)).toBe(1000 + FRAME_TIME_WINDOW_MS + 1);
    expect(frameTime(1010, 1000)).toBe(1000); // gelecekteki damga
  });
});
