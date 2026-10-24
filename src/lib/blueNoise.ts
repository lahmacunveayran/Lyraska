/**
 * Mavi gürültü dokusu: Robert Ulichney'in "void-and-cluster" yöntemiyle (1993) program içinde
 * üretilir; dışarıdan lisansı belirsiz bir doku alınmaz. Sonuç `BLUE_NOISE_SIZE`² boyutta, her
 * değeri bir kez geçen bir sıra (eşik) dizisidir: yakın pikseller birbirinden farklı değer alır,
 * gürültünün düşük frekanslı (göze bulanık leke gibi görünen) bileşeni yoktur. Koyu gradyanlardaki
 * renk bantlarını titretmek için ekrana 1:1 ve en yakın komşu örneklemeyle döşenir
 * (`postProcess.ts`).
 *
 * Yöntem: seyrek rastgele bir ikili desen önce düzgünleştirilir (en sıkı küme noktası en büyük
 * boşluğa taşınır); sonra noktalar sırayla çıkarılarak (en sıkı kümeden) ve eklenerek (en büyük
 * boşluğa) sıralanır. "Sıkılık" toroidal Gauss çekirdeğiyle ölçülür (σ = 1,5).
 */

export const BLUE_NOISE_SIZE = 64;
const SIGMA = 1.5;
/** Çekirdeğin yarıçapı: bunun dışında Gauss katkısı 1e-5'in altında. */
const RADIUS = 7;

let cached: Uint8Array | null = null;

/** 64×64 mavi gürültü (0..255, satır satır). İlk çağrıda üretilir, sonra aynısı döner. */
export function blueNoise(): Uint8Array {
  cached ??= toBytes(voidAndCluster(BLUE_NOISE_SIZE));
  return cached;
}

/** Sıraları (0..n²−1) baytlara çevirir: her bayt değeri eşit sayıda (n²/256) geçer. */
function toBytes(ranks: Uint16Array): Uint8Array {
  const out = new Uint8Array(ranks.length);
  for (let i = 0; i < ranks.length; i++) {
    out[i] = Math.floor(((ranks[i] ?? 0) * 256) / ranks.length);
  }
  return out;
}

/** `size`×`size` sıra dizisi (her sıra bir kez). Belirlenimci: hep aynı sonuç. */
export function voidAndCluster(size: number): Uint16Array {
  const n = size * size;
  const kernel = buildKernel();
  const pattern = new Uint8Array(n);
  const energy = new Float64Array(n);
  const ranks = new Uint16Array(n);

  const add = (index: number, sign: number) => {
    pattern[index] = sign > 0 ? 1 : 0;
    const x0 = index % size;
    const y0 = (index - x0) / size;
    let k = 0;
    for (let dy = -RADIUS; dy <= RADIUS; dy++) {
      const row = ((y0 + dy + size) % size) * size;
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        energy[row + ((x0 + dx + size) % size)]! += sign * kernel[k++]!;
      }
    }
  };
  /** En sıkı küme: 1 olan noktalar arasında enerjisi en büyük. */
  const tightest = () => {
    let best = -1;
    let value = -Infinity;
    for (let i = 0; i < n; i++) {
      if (pattern[i] === 1 && energy[i]! > value) {
        value = energy[i]!;
        best = i;
      }
    }
    return best;
  };
  /** En büyük boşluk: 0 olan noktalar arasında enerjisi en küçük. */
  const largestVoid = () => {
    let best = -1;
    let value = Infinity;
    for (let i = 0; i < n; i++) {
      if (pattern[i] === 0 && energy[i]! < value) {
        value = energy[i]!;
        best = i;
      }
    }
    return best;
  };

  // Başlangıç: noktaların ~%10'u (belirlenimci karıştırma), sonra düzgünleştirme.
  const random = mulberry32(0x4c797261); // "Lyra"
  const initial = Math.max(1, Math.floor(n / 10));
  let placed = 0;
  while (placed < initial) {
    const i = Math.floor(random() * n);
    if (pattern[i] === 0) {
      add(i, 1);
      placed++;
    }
  }
  for (let guard = 0; guard < n; guard++) {
    const cluster = tightest();
    add(cluster, -1);
    const hole = largestVoid();
    add(hole, 1);
    if (hole === cluster) break;
  }
  const start = Uint8Array.from(pattern);
  const startEnergy = Float64Array.from(energy);

  // 1. aşama: başlangıç noktaları en sıkı kümeden başlayarak çıkarılır (sıra aşağı doğru).
  for (let rank = initial - 1; rank >= 0; rank--) {
    const cluster = tightest();
    add(cluster, -1);
    ranks[cluster] = rank;
  }
  // 2. ve 3. aşama: başlangıç deseninden en büyük boşluğa eklenerek doluncaya kadar (sıra yukarı).
  // (Yarıdan sonra "sıfırların en sıkı kümesi" aynı noktadır: sıfırların enerjisi = toplam − birler.)
  pattern.set(start);
  energy.set(startEnergy);
  for (let rank = initial; rank < n; rank++) {
    const hole = largestVoid();
    add(hole, 1);
    ranks[hole] = rank;
  }
  return ranks;
}

function buildKernel(): Float64Array {
  const side = 2 * RADIUS + 1;
  const kernel = new Float64Array(side * side);
  let k = 0;
  for (let dy = -RADIUS; dy <= RADIUS; dy++) {
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      kernel[k++] = Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA));
    }
  }
  return kernel;
}

/** Küçük, belirlenimci sözde rastgele sayı üreteci (0..1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
