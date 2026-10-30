import {
  CORRECTION,
  ClockOffset,
  OFFSET_WINDOW_MS,
  FrameClock,
  MAX_FRAME_MS,
  MAX_MIDPOINT_RTT_MS,
  displayTime,
  nextFrameAt,
  positionAt,
  reanchor,
  replyTime,
  statusTime,
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

describe("displayTime", () => {
  it("karenin başlangıcından bir kare sonra: aynı karede önce koşan çizim anı kaydırmaz", () => {
    expect(displayTime(1000, 1004, 1000 / 60)).toBeCloseTo(1000 + 1000 / 60, 9);
    expect(displayTime(1000, 1004, 1000 / 144)).toBeCloseTo(1000 + 1000 / 144, 9); // 144 Hz
  });

  it("ağır karede geri çağrının anından önce değil; damga gelecekte ya da başka saatten olsa da sınırlı", () => {
    expect(displayTime(1000, 1051, 1000 / 60)).toBe(1051);
    expect(displayTime(250, 90_000, 1000 / 60)).toBe(90_000); // sahne denetiminin sanal saati
    expect(displayTime(5000, 1000, 1000 / 60)).toBeCloseTo(1000 + 1000 / 60, 9);
  });
});

describe("FrameClock", () => {
  it("kare süresi son karelerin ortancası: tek takılma tahmini bozmaz", () => {
    const clock = new FrameClock();
    let t = 0;
    for (let i = 0; i < 10; i++) clock.tick((t += 1000 / 144));
    clock.tick(t + 200); // takılma
    expect(clock.frameMs()).toBeCloseTo(1000 / 144, 9);
  });

  it("ağır sahnede yavaşlayan kareyi izler; sınırlar içinde kalır", () => {
    const clock = new FrameClock();
    let t = 0;
    for (let i = 0; i < 20; i++) clock.tick((t += 33.3));
    expect(clock.frameMs()).toBeCloseTo(33.3, 9);
    expect(new FrameClock().frameMs()).toBeCloseTo(1000 / 60, 9); // henüz ölçüm yok
    const odd = new FrameClock();
    for (let i = 0; i < 5; i++) odd.tick(i * 250); // sanal saat: 250 ms adım
    expect(odd.frameMs()).toBe(MAX_FRAME_MS);
    expect(odd.tick(-5)).toBe(MAX_FRAME_MS); // geri giden damga sayılmaz
  });
});

describe("replyTime", () => {
  it("kısa sorguda istek ile yanıtın ortası", () => {
    expect(replyTime(1000, 1010, null)).toBe(1005);
  });

  it("uzun sorguda (çekirdek meşgul) yanıtın geldiği an: orta nokta saati öne iterdi", () => {
    expect(replyTime(1000, 1000 + MAX_MIDPOINT_RTT_MS + 1, null)).toBe(
      1000 + MAX_MIDPOINT_RTT_MS + 1,
    );
  });

  it("saatin son bağlandığı andan eski olmaz (sorgu sürerken biten sarma)", () => {
    expect(replyTime(1000, 1010, 1008)).toBe(1008);
  });
});

describe("nextFrameAt", () => {
  it("küçük geri adımda (bir kareye kadar) önceki an tutulur; büyükte yeni an", () => {
    expect(nextFrameAt(1000, 1010, 16)).toBe(1010);
    expect(nextFrameAt(1000, 990, 16)).toBe(1000); // geri gitmez: söz yanıp sönmesin
    expect(nextFrameAt(1000, 900, 16)).toBe(900); // önceki tahmin fazla ileriydi: donmasın
  });
});

describe("FrameClock: kare hızı değişince", () => {
  it("ağır sahneden hafif sahneye geçince tahmin hemen kısalır", () => {
    const clock = new FrameClock();
    let t = 0;
    for (let i = 0; i < 15; i++) clock.tick((t += 125));
    expect(clock.frameMs()).toBe(125);
    expect(clock.tick(t + 1000 / 60)).toBeCloseTo(1000 / 60, 9);
  });

  it("4 kare/sn'ye kadar yavaş kareyi izler", () => {
    const clock = new FrameClock();
    let t = 0;
    for (let i = 0; i < 15; i++) clock.tick((t += 166.6));
    expect(clock.frameMs()).toBeCloseTo(166.6, 9);
  });
});

describe("statusTime", () => {
  const origin = 1_700_000_000_000; // performance.timeOrigin (Unix ms)

  it("çekirdeğin ölçüm anı: yanıt ana iş parçacığında geç işlense de konum geride kalmaz", () => {
    // Sorgu 1000'de gitti, çekirdek konumu 1003'te ölçtü, yanıt meşgul karelerden sonra 1060'ta işlendi.
    expect(statusTime(origin + 1003, origin, 1000, 1060, null)).toBeCloseTo(1003, 6);
  });

  it("ses aygıtının dönemi: ölçüm sorgudan biraz önce olabilir", () => {
    expect(statusTime(origin + 992, origin, 1000, 1004, null)).toBeCloseTo(992, 6);
  });

  it("güvenilmez anda (çok eski: çıkış durdu; yanıttan sonra: saat farkı) eski kural", () => {
    expect(statusTime(origin + 900, origin, 1000, 1010, null)).toBe(replyTime(1000, 1010, null));
    expect(statusTime(origin + 1020, origin, 1000, 1010, null)).toBe(replyTime(1000, 1010, null));
    expect(statusTime(null, origin, 1000, 1010, null)).toBe(1005);
    expect(statusTime(undefined, origin, 1000, 1010, null)).toBe(1005);
  });

  it("küçük saat farkı yanıtın anına kırpılır; son bağlantıdan eski olmaz", () => {
    expect(statusTime(origin + 1011, origin, 1000, 1010, null)).toBe(1010);
    expect(statusTime(origin + 1003, origin, 1000, 1010, 1008)).toBe(1008);
  });
});

describe("ClockOffset", () => {
  const origin = 1_700_000_000_000;

  it("saat kaymamışsa sayfa açılışındaki fark aynen kullanılır", () => {
    const offset = new ClockOffset();
    expect(offset.estimate(origin)).toBeNull();
    offset.add(origin + 1003, 1000, 1006); // çekirdek 1003'te okudu
    expect(offset.estimate(origin)).toBe(origin);
  });

  it("duvar saati kayınca fark sorguların kesişimine çekilir (en kısa gidiş-dönüş kadar doğru)", () => {
    const offset = new ClockOffset();
    // Duvar saati 37 ms ileri: okuma anı 1003 + 37.
    offset.add(origin + 37 + 1003, 1000, 1080); // ağır sahne: yanıt geç işlendi, geniş aralık
    offset.add(origin + 37 + 1252, 1250, 1253); // kısa sorgu: dar aralık
    const estimate = offset.estimate(origin)!;
    expect(Math.abs(estimate - (origin + 37))).toBeLessThanOrEqual(1);
  });

  it("açılışta bütün yanıtlar geç işlenirse (ağır sahne yükleniyor) fark gidiş yolundan tahmin edilir", () => {
    // CI'da "Kendi resmin" ilk satırı 11–22 ms geç: sahne yüklenirken ana iş parçacığı dolu, her
    // yanıt 25–40 ms geç işleniyor. Gidiş beklemez (istek çağrı anında gönderilir): çekirdek isteği
    // gidişten 3 ms sonra okur. Kesişimin ortası farkı yanıtın gecikmesinin yarısı kadar kaydırırdı.
    const truth = origin + 37;
    const offset = new ClockOffset();
    for (const [sent, late] of [
      [1000, 40],
      [1250, 31],
      [1500, 25],
      [1750, 33],
    ] as const) {
      offset.add(truth + sent + 3, sent, sent + 3 + late);
    }
    // Gidiş 3 ms: kesişim [gidiş ucu − 10, gidiş ucu], ortası 2 ms yanılır (yanıtın gecikmesinden bağımsız).
    expect(Math.abs(offset.estimate(origin)! - truth)).toBeLessThanOrEqual(2);
  });

  it("aşırı yüklü sahnede (gidiş-dönüş 46 ms) 37 ms'lik kayma kesişimin içinde kalmaz", () => {
    // CI ve sahne denetimi: ağır sahne 22 ms, her yanıt ~40 ms geç; sayfa açılışındaki fark kesişime
    // girerse (geniş aralık) kayma hiç görülmez, sözler 37 ms geç kalırdı.
    const truth = origin + 37;
    const offset = new ClockOffset();
    for (const sent of [1000, 1250, 1500]) offset.add(truth + sent + 6, sent, sent + 46);
    expect(Math.abs(offset.estimate(origin)! - truth)).toBeLessThanOrEqual(2);
  });

  it("asimetrik yolda (gidiş 6, dönüş 1 ms) hata yarım karenin altında", () => {
    const truth = origin + 37;
    const offset = new ClockOffset();
    offset.add(truth + 1006, 1000, 1007);
    expect(Math.abs(offset.estimate(origin)! - truth)).toBeLessThanOrEqual(3.5);
  });

  it("duvar saati sıçrayınca eski sorgular atılır; eskiler pencereden çıkar", () => {
    const offset = new ClockOffset();
    offset.add(origin + 1003, 1000, 1006);
    offset.add(origin + 5000 + 2003, 2000, 2006); // saat elle 5 sn ileri alındı
    expect(Math.abs(offset.estimate(origin)! - (origin + 5000))).toBeLessThanOrEqual(6);
    const old = new ClockOffset();
    old.add(origin + 1003, 1000, 1001); // çok dar ama eski
    old.add(
      origin + 20 + 1000 + OFFSET_WINDOW_MS + 3,
      1000 + OFFSET_WINDOW_MS + 1,
      1000 + OFFSET_WINDOW_MS + 6,
    );
    expect(old.estimate(origin)).toBeGreaterThan(origin + 15);
  });
});
