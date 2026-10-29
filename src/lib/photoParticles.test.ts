import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DENSITY,
  DEFAULT_PARTICLE_STYLE,
  DENSITY_MAX,
  DENSITY_MIN,
  clampDensity,
  loadParticleDensity,
  saveParticleDensity,
  PARTICLE_MOTION,
  PARTICLE_POOL,
  createParticlePool,
  loadParticleStyle,
  particleAlpha,
  particleColor,
  particleDrive,
  particlesShown,
  saveParticleStyle,
  stepParticles,
  type ParticleInput,
  type ParticlePool,
  type ParticleStyle,
} from "./photoParticles";
import { PHOTO_BARS, barColors } from "./photoScene";

const W = 1280;
const H = 720;
const BARS = 200;
const PITCH = W / (BARS - 1);
const TOP = H / 2;
const CAP = 0.45 * H;

function input(extents: number[], over: Partial<ParticleInput> = {}): ParticleInput {
  return {
    extents,
    width: W,
    height: H,
    top: TOP,
    pitch: PITCH,
    cap: CAP,
    pulse: 0,
    spawn: true,
    ...over,
  };
}

const loud = () => new Array<number>(BARS).fill(CAP);
const quiet = () => new Array<number>(BARS).fill(2);

/** `seconds` boyunca 60 kare/sn ilerletir; her karede `each` çağrılır. */
function run(
  pool: ParticlePool,
  style: ParticleStyle,
  at: (frame: number) => ParticleInput,
  seconds: number,
  each?: () => void,
) {
  const frames = Math.round(seconds * 60);
  for (let f = 0; f < frames; f++) {
    stepParticles(pool, style, at(f), 1 / 60);
    each?.();
  }
}

function living(pool: ParticlePool): number[] {
  const out: number[] = [];
  for (let i = 0; i < PARTICLE_POOL; i++) if (pool.alive[i]) out.push(i);
  return out;
}

describe("parçacık biçiminin kaydı", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("kayıt yoksa ya da tanınmıyorsa Kıvılcım", () => {
    expect(loadParticleStyle()).toBe("sparks");
    window.localStorage.setItem("lyraska.photoParticles", "yagmur");
    expect(loadParticleStyle()).toBe(DEFAULT_PARTICLE_STYLE);
  });

  it("seçim hatırlanır", () => {
    saveParticleStyle("snow");
    expect(loadParticleStyle()).toBe("snow");
    saveParticleStyle("off");
    expect(loadParticleStyle()).toBe("off");
  });

  it("depolama açılamazsa çökmez, Kıvılcım'la başlar", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("kapalı");
      },
      setItem: () => {
        throw new Error("kapalı");
      },
    });
    expect(() => saveParticleStyle("snow")).not.toThrow();
    expect(loadParticleStyle()).toBe("sparks");
  });
});

describe("parçacıklar ne zaman çizilir", () => {
  it("güvenli modda, animasyonları azalt açıkken ve Kapalı'da çizilmez", () => {
    expect(particlesShown("sparks", false, false)).toBe(true);
    expect(particlesShown("snow", false, false)).toBe(true);
    expect(particlesShown("off", false, false)).toBe(false);
    for (const style of ["sparks", "snow", "off"] as const) {
      expect(particlesShown(style, true, false)).toBe(false);
      expect(particlesShown(style, false, true)).toBe(false);
      expect(particlesShown(style, true, true)).toBe(false);
    }
  });
});

describe("parçacık havuzu", () => {
  it("aynı tohumla aynı parçacıklar (belirlenimli)", () => {
    const a = createParticlePool(7);
    const b = createParticlePool(7);
    const at = (f: number) => input(loud(), { pulse: f % 28 < 4 ? 1 : 0 });
    run(a, "sparks", at, 2);
    run(b, "sparks", at, 2);
    expect(Array.from(a.x)).toEqual(Array.from(b.x));
    expect(Array.from(a.y)).toEqual(Array.from(b.y));
    expect(a.count).toBe(b.count);
    expect(a.count).toBeGreaterThan(0);
  });

  it("havuz hiç büyümez, sınırı aşılmaz (en uç girdide de)", () => {
    const pool = createParticlePool(3);
    const arrays = [pool.x, pool.y, pool.alive, pool.cumulative];
    for (let f = 0; f < 600; f++) {
      stepParticles(pool, "snow", input(loud(), { pulse: 1 }), 0.1);
      expect(pool.count).toBeLessThanOrEqual(PARTICLE_POOL);
    }
    expect(living(pool).length).toBe(pool.count);
    expect([pool.x, pool.y, pool.alive, pool.cumulative]).toEqual(arrays);
    expect(pool.x.length).toBe(PARTICLE_POOL);
  });

  it("çalmıyorken yenisi doğmaz, olanlar ömrü bitince söner", () => {
    const pool = createParticlePool(5);
    run(pool, "sparks", () => input(loud()), 1);
    expect(pool.count).toBeGreaterThan(0);
    run(pool, "sparks", () => input(loud(), { spawn: false }), 0.05);
    const before = pool.count;
    run(pool, "sparks", () => input(loud(), { spawn: false }), 0.5);
    expect(pool.count).toBeLessThanOrEqual(before);
    run(pool, "sparks", () => input(loud(), { spawn: false }), PARTICLE_MOTION.sparks.life[1]);
    expect(pool.count).toBe(0);
  });

  it("Kapalı'ya geçince havuz boşalır, doğum olmaz", () => {
    const pool = createParticlePool(5);
    run(pool, "sparks", () => input(loud()), 1);
    run(pool, "off", () => input(loud(), { pulse: 1 }), 1);
    expect(pool.count).toBe(0);
    expect(living(pool)).toEqual([]);
  });

  it("kalabalık değil: tam seste ve vuruşlu da bir avuç parçacık", () => {
    for (const style of ["sparks", "snow"] as const) {
      const pool = createParticlePool(11);
      let most = 0;
      run(
        pool,
        style,
        (f) => input(loud(), { pulse: Math.exp(-(f % 28) / 6) }),
        8,
        () => (most = Math.max(most, pool.count)),
      );
      expect(most).toBeGreaterThan(15);
      expect(most).toBeLessThan(200);
    }
  });

  it("vuruşta ve yüksek seste daha çok doğar", () => {
    const born = (extents: () => number[], pulse: number) => {
      const pool = createParticlePool(9);
      let total = 0;
      let last = 0;
      run(
        pool,
        "snow",
        () => input(extents(), { pulse }),
        3,
        () => {
          // Ömrü kısa: doğanları her karede sayılandan çıkar (artış = doğum − sönen).
          total += Math.max(0, pool.count - last);
          last = pool.count;
        },
      );
      return total;
    };
    expect(born(loud, 1)).toBeGreaterThan(1.5 * born(loud, 0));
    expect(born(loud, 0)).toBeGreaterThan(2 * born(quiet, 0));
  });

  it("gerçek müzik seviyelerinde (ortalama ~%2, bas ~%10) parçacıklar görünür kalabalıkta", () => {
    // Proje sahibinin kaydındaki (Flying High, −14 LUFS) çekirdek seviyelerine benzer çizgi.
    const extents = new Array<number>(BARS).fill(0).map((_, i) => (i < 40 ? 0.1 : 0.012) * CAP);
    for (const [style, least] of [
      ["sparks", 60],
      ["snow", 30],
    ] as const) {
      const pool = createParticlePool(31);
      run(pool, style, (f) => input(extents, { pulse: Math.exp(-(f % 24) / 7) }), 5);
      expect(pool.count).toBeGreaterThan(least);
      expect(pool.count).toBeLessThan(PARTICLE_POOL);
    }
  });

  it("enerji: sessizde 0, tam seste 1, bas ağır basar", () => {
    expect(
      particleDrive(
        quiet().map(() => 0),
        CAP,
      ),
    ).toBe(0);
    expect(particleDrive(loud(), CAP)).toBe(1);
    const bass = new Array<number>(BARS).fill(0).map((_, i) => (i < 40 ? CAP : 0));
    const treble = new Array<number>(BARS).fill(0).map((_, i) => (i >= 160 ? CAP : 0));
    expect(particleDrive(bass, CAP)).toBeGreaterThan(2 * particleDrive(treble, CAP));
    expect(particleDrive([], CAP)).toBe(0);
  });

  it("yüksek çubukların yakınında doğar", () => {
    const pool = createParticlePool(13);
    const extents = new Array<number>(BARS).fill(0).map((_, i) => (i >= 150 && i < 160 ? CAP : 0));
    run(pool, "sparks", () => input(extents, { pulse: 1 }), 1.5);
    const xs = living(pool).map((i) => pool.x[i]!);
    expect(xs.length).toBeGreaterThan(3);
    // Bir buçuk saniyede yana kayma 20 pikseli geçmez.
    for (const x of xs) {
      expect(x).toBeGreaterThan(149.5 * PITCH - 20);
      expect(x).toBeLessThan(159.5 * PITCH + 20);
    }
  });

  it("Kıvılcım çizgiden yukarı süzülür", () => {
    const pool = createParticlePool(17);
    run(pool, "sparks", () => input(loud()), 2);
    const ys = living(pool).map((i) => pool.y[i]!);
    expect(ys.length).toBeGreaterThan(5);
    for (const y of ys) expect(y).toBeLessThanOrEqual(TOP);
    // Bir kısmı çizgiden belirgin biçimde uzaklaşmış (ekranın üst yarısında).
    expect(ys.filter((y) => y < TOP - 0.1 * H).length).toBeGreaterThan(0);
  });

  it("Kar çubuklardan aşağı dökülür ve kısa yol alır", () => {
    const pool = createParticlePool(19);
    const extents = new Array<number>(BARS).fill(0.1 * H);
    const start = new Float64Array(PARTICLE_POOL);
    let longest = 0;
    let previousAge = new Float64Array(PARTICLE_POOL);
    run(
      pool,
      "snow",
      () => input(extents),
      3,
      () => {
        for (const i of living(pool)) {
          // Yeni doğan (yaşı küçülmüş ya da yeni): başlangıcı saklanır.
          if (pool.age[i]! < previousAge[i]! || previousAge[i] === 0) start[i] = pool.y[i]!;
          longest = Math.max(longest, pool.y[i]! - start[i]!);
          expect(pool.y[i]!).toBeGreaterThanOrEqual(TOP);
        }
        previousAge = Float64Array.from(pool.age);
      },
    );
    expect(longest).toBeGreaterThan(0);
    // Ömrü boyunca en çok yüksekliğin ~%11'i (0,09 × 1,2 sn).
    expect(longest).toBeLessThan(0.12 * H);
  });

  it("Kar çubuğun ucuna yakın doğar (parlak çubuğun içinde kaybolmaz)", () => {
    const pool = createParticlePool(29);
    const extents = new Array<number>(BARS).fill(0.2 * H);
    stepParticles(pool, "snow", input(extents, { pulse: 1 }), 0.1);
    const ys = living(pool).map((i) => pool.y[i]!);
    expect(ys.length).toBeGreaterThan(0);
    for (const y of ys) expect(y).toBeGreaterThanOrEqual(TOP + 0.8 * 0.2 * H);
  });

  it("saydamlık 0..1 arası: belirir ve sönerek biter", () => {
    const pool = createParticlePool(23);
    let seenLow = false;
    run(
      pool,
      "sparks",
      () => input(loud()),
      3,
      () => {
        for (const i of living(pool)) {
          const a = particleAlpha(pool, i);
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThanOrEqual(1);
          if (pool.life[i]! - pool.age[i]! < 0.05 && a < 0.01) seenLow = true;
        }
      },
    );
    expect(seenLow).toBe(true);
    expect(particleAlpha(createParticlePool(1), 0)).toBe(0);
  });

  it("renk çubuğun ışıltı renginden, beyaza açılmış", () => {
    const [r, g, b] = particleColor(barColors([200, 20, 40]));
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(20);
    expect(b).toBeGreaterThan(40);
    expect(particleColor(barColors([255, 255, 255]))).toEqual([255, 255, 255]);
  });
});

describe("parçacık yoğunluğu", () => {
  it("aralığa ve adıma oturur; sayı değilse varsayılan", () => {
    expect(clampDensity(1.1)).toBe(1);
    expect(clampDensity(1.4)).toBe(1.5);
    expect(clampDensity(0)).toBe(DENSITY_MIN);
    expect(clampDensity(9)).toBe(DENSITY_MAX);
    expect(clampDensity(Number.NaN)).toBe(DEFAULT_DENSITY);
  });

  it("hatırlanır; kayıt yoksa ya da bozuksa 1", () => {
    expect(loadParticleDensity()).toBe(1);
    saveParticleDensity(1.75);
    expect(loadParticleDensity()).toBe(1.75);
    window.localStorage.setItem("lyraska.photoParticleDensity", "abc");
    expect(loadParticleDensity()).toBe(1);
  });

  it("doğum hızını ölçekler: 2× yoğunlukta yaklaşık iki kat, havuz taşmaz", () => {
    const extents = new Array<number>(BARS).fill(0).map((_, i) => (i < 40 ? 0.1 : 0.012) * CAP);
    for (const style of ["sparks", "snow"] as const) {
      const count = (density: number) => {
        const pool = createParticlePool(5);
        run(pool, style, () => input(extents, { density }), 4);
        return pool.count;
      };
      const normal = count(1);
      const dense = count(2);
      expect(dense).toBeGreaterThan(1.6 * normal);
      expect(dense).toBeLessThan(PARTICLE_POOL);
      expect(count(0.25)).toBeLessThan(0.4 * normal);
    }
  });

  it("en uç girdide 2× yoğunlukta da havuz dolup taşmaz", () => {
    const pool = createParticlePool(3);
    run(
      pool,
      "sparks",
      () => input(loud(), { pulse: 1, density: 2 }),
      8,
      () => expect(pool.count).toBeLessThanOrEqual(PARTICLE_POOL),
    );
  });
});

describe("bozuk girdiye dayanıklılık (bağımsız inceleme)", () => {
  it("geçersiz dt (NaN/Infinity) havuzu kalıcı bozmaz", () => {
    const extents = new Array<number>(BARS).fill(100);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const pool = createParticlePool(1);
      run(pool, "sparks", () => input(extents), 1);
      stepParticles(pool, "sparks", input(extents), bad);
      run(pool, "sparks", () => input(extents), 10);
      expect(Number.isFinite(pool.carry)).toBe(true);
      for (const i of living(pool)) expect(Number.isFinite(pool.age[i]!)).toBe(true);
      expect(pool.count).toBeGreaterThan(0);
    }
  });

  it("boş kayıtta yoğunluk varsayılana döner", () => {
    window.localStorage.setItem("lyraska.photoParticleDensity", "");
    expect(loadParticleDensity()).toBe(DEFAULT_DENSITY);
    window.localStorage.setItem("lyraska.photoParticleDensity", "  ");
    expect(loadParticleDensity()).toBe(DEFAULT_DENSITY);
  });

  it("havuz çizginin çubuk sayısıyla kurulur", () => {
    expect(createParticlePool(1).cumulative.length).toBe(PHOTO_BARS);
  });
});
