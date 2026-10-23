import { hash, rng } from "./printCover";

/**
 * Sanatçı levhası: "basılı yıldız atlası". Sanatçının adı gökyüzünde sabit bir noktaya düşer
 * (ad → sağ açıklık ve dik açıklık); o noktanın 20°'lik alanındaki gerçek yıldızlar (HYG v4.0)
 * ve takımyıldız çizgileri (Stellarium) krem kâğıda mürekkeple basılır. Pembe halkalar sanatçının
 * albüm sayısı kadardır. Veri: `starAtlas.json` (CC BY-SA 4.0, bkz. docs/LISANSLAR.md).
 *
 * Eşleme sabittir: aynı ad her sürümde aynı gökyüzü parçasını almalı (test bunu dondurur).
 */

export interface StarAtlas {
  /** [sağ açıklık saat × 1000, dik açıklık derece × 100, kadir × 100, HIP (yoksa 0)] */
  stars: number[][];
  /** IAU kısaltması → HIP dizileri (kırık çizgiler). */
  constellations: Record<string, number[][]>;
}

/** Levhadaki yıldız: alan içinde −1…1 koordinat. */
export interface PlateStar {
  x: number;
  y: number;
  mag: number;
  hip: number;
}

export interface PlateField {
  /** Alanın merkezi: sağ açıklık (saat) ve dik açıklık (derece). */
  raHours: number;
  decDeg: number;
  stars: PlateStar[];
  /** En çok çizgisi alana düşen takımyıldız (yoksa `null`: o zaman en parlaklardan ağaç çizilir). */
  constellation: string | null;
  segments: [PlateStar, PlateStar][];
}

/** IAU takımyıldızlarının Türkçe adları. */
export const CONSTELLATION_TR: Record<string, string> = {
  And: "Andromeda",
  Ant: "Hava Pompası",
  Aps: "Cennet Kuşu",
  Aqr: "Kova",
  Aql: "Kartal",
  Ara: "Sunak",
  Ari: "Koç",
  Aur: "Arabacı",
  Boo: "Çoban",
  Cae: "Çelik Kalem",
  Cam: "Zürafa",
  Cnc: "Yengeç",
  CVn: "Av Köpekleri",
  CMa: "Büyük Köpek",
  CMi: "Küçük Köpek",
  Cap: "Oğlak",
  Car: "Karina",
  Cas: "Kraliçe",
  Cen: "Erboğa",
  Cep: "Kral",
  Cet: "Balina",
  Cha: "Bukalemun",
  Cir: "Pergel",
  Col: "Güvercin",
  Com: "Berenis'in Saçı",
  CrA: "Güney Tacı",
  CrB: "Kuzey Tacı",
  Crv: "Karga",
  Crt: "Kupa",
  Cru: "Güney Haçı",
  Cyg: "Kuğu",
  Del: "Yunus",
  Dor: "Kılıç Balığı",
  Dra: "Ejderha",
  Equ: "Tay",
  Eri: "Irmak",
  For: "Ocak",
  Gem: "İkizler",
  Gru: "Turna",
  Her: "Herkül",
  Hor: "Saat",
  Hya: "Su Yılanı",
  Hyi: "Küçük Su Yılanı",
  Ind: "Hintli",
  Lac: "Kertenkele",
  Leo: "Aslan",
  LMi: "Küçük Aslan",
  Lep: "Tavşan",
  Lib: "Terazi",
  Lup: "Kurt",
  Lyn: "Vaşak",
  Lyr: "Çalgı",
  Men: "Masa Dağı",
  Mic: "Mikroskop",
  Mon: "Tekboynuz",
  Mus: "Sinek",
  Nor: "Gönye",
  Oct: "Oktant",
  Oph: "Yılancı",
  Ori: "Avcı",
  Pav: "Tavus",
  Peg: "Kanatlı At",
  Per: "Kahraman",
  Phe: "Anka",
  Pic: "Ressam",
  Psc: "Balıklar",
  PsA: "Güney Balığı",
  Pup: "Pupa",
  Pyx: "Pusula",
  Ret: "Ağ",
  Sge: "Ok",
  Sgr: "Yay",
  Sco: "Akrep",
  Scl: "Heykeltıraş",
  Sct: "Kalkan",
  Ser: "Yılan",
  Sex: "Sekstant",
  Tau: "Boğa",
  Tel: "Teleskop",
  Tri: "Üçgen",
  TrA: "Güney Üçgeni",
  Tuc: "Tukan",
  UMa: "Büyük Ayı",
  UMi: "Küçük Ayı",
  Vel: "Yelken",
  Vir: "Başak",
  Vol: "Uçan Balık",
  Vul: "Tilki",
};

/** Alanın yarı açısı (derece): levha 20°'lik bir gökyüzü parçası gösterir. */
const HALF_FIELD_DEG = 10;
/** Alanda en az bu kadar parlak (V ≤ 4,5) yıldız olmalı; yoksa ad bir sonraki noktaya kayar. */
const MIN_BRIGHT = 4;
const DEG = Math.PI / 180;

/** Adın gökyüzündeki yeri (küre üzerinde düzgün dağılım); `salt` boş alanları atlamak için. */
export function skyPoint(name: string, salt: number): { ra: number; dec: number } {
  const h = hash(salt ? `${name}#${salt}` : name);
  const u = (h & 0xffff) / 65536;
  const v = (h >>> 16) / 65536;
  return { ra: 2 * Math.PI * u, dec: Math.asin(2 * v - 1) };
}

/** Gnomonik izdüşümle alandaki yıldızlar (x, y: −1…1; doğu solda, atlas gibi). */
function project(atlas: StarAtlas, ra0: number, dec0: number): PlateStar[] {
  const t = Math.tan(HALF_FIELD_DEG * DEG);
  const minCos = Math.cos(HALF_FIELD_DEG * DEG * Math.SQRT2);
  const out: PlateStar[] = [];
  for (const [raMilli, decCenti, magCenti, hip] of atlas.stars) {
    const ra = (((raMilli ?? 0) / 1000) * 15) * DEG;
    const dec = ((decCenti ?? 0) / 100) * DEG;
    const c = Math.sin(dec0) * Math.sin(dec) + Math.cos(dec0) * Math.cos(dec) * Math.cos(ra - ra0);
    if (c < minCos) continue;
    const x = (Math.cos(dec) * Math.sin(ra - ra0)) / c / t;
    const y =
      (Math.cos(dec0) * Math.sin(dec) - Math.sin(dec0) * Math.cos(dec) * Math.cos(ra - ra0)) / c / t;
    if (Math.abs(x) > 1 || Math.abs(y) > 1) continue;
    out.push({ x, y, mag: (magCenti ?? 0) / 100, hip: hip ?? 0 });
  }
  return out;
}

/** Sanatçının levhası: alan, yıldızlar ve çizgiler (saf hesap; çizim `drawArtistPlate`). */
export function plateField(atlas: StarAtlas, name: string, albums: number): PlateField {
  let salt = 0;
  let point = skyPoint(name, 0);
  let stars = project(atlas, point.ra, point.dec);
  while (stars.filter((s) => s.mag <= 4.5).length < MIN_BRIGHT && salt < 64) {
    salt++;
    point = skyPoint(name, salt);
    stars = project(atlas, point.ra, point.dec);
  }
  const byHip = new Map(stars.filter((s) => s.hip).map((s) => [s.hip, s]));
  let constellation: string | null = null;
  let segments: [PlateStar, PlateStar][] = [];
  for (const [id, polylines] of Object.entries(atlas.constellations)) {
    const local: [PlateStar, PlateStar][] = [];
    for (const line of polylines) {
      for (let i = 0; i + 1 < line.length; i++) {
        const a = byHip.get(line[i] ?? -1);
        const b = byHip.get(line[i + 1] ?? -1);
        if (a && b) local.push([a, b]);
      }
    }
    if (local.length > segments.length) {
      segments = local;
      constellation = id;
    }
  }
  if (segments.length < 2) {
    // Takımyıldız çizgisi düşmeyen alan: en parlak yıldızlardan en kısa ağaç (Prim).
    const count = Math.min(7, Math.max(3, albums + 2));
    const top = [...stars].sort((a, b) => a.mag - b.mag).slice(0, count);
    segments = [];
    constellation = null;
    const inside = top.slice(0, 1);
    const outside = top.slice(1);
    while (outside.length > 0) {
      let best: [PlateStar, PlateStar, number] | null = null;
      for (const a of inside) {
        for (const b of outside) {
          const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
          if (!best || d < best[2]) best = [a, b, d];
        }
      }
      if (!best) break;
      segments.push([best[0], best[1]]);
      inside.push(best[1]);
      outside.splice(outside.indexOf(best[1]), 1);
    }
  }
  return {
    raHours: (point.ra / (2 * Math.PI)) * 24,
    decDeg: point.dec / DEG,
    stars,
    constellation,
    segments,
  };
}

/** Levhanın künyesi: "α 05h34m · δ +22°". */
export function plateCoordinates(field: PlateField): string {
  const h = Math.floor(field.raHours);
  const m = Math.floor((field.raHours - h) * 60);
  const d = Math.round(Math.abs(field.decDeg));
  const sign = field.decDeg >= 0 ? "+" : "−";
  return `α ${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}m · δ ${sign}${String(d).padStart(2, "0")}°`;
}

export interface PlateColors {
  paper: string;
  ink: string;
  line: string;
  accent: string;
}

/**
 * Levhayı çizer (kare). Durağandır: hareket, parlama yok. Tuval çizilemiyorsa `false`.
 * Yıldız boyu kadirden (parlak yıldız büyük), takımyıldız çizgileri yıldızlara değmez.
 */
export function drawArtistPlate(
  canvas: HTMLCanvasElement,
  field: PlateField,
  albums: number,
  colors: PlateColors,
  mono = "monospace",
): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const W = canvas.width;
  const r = rng(hash(`${field.raHours}:${field.decDeg}`));
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, W, W);
  // Sabit kâğıt tanesi.
  const img = ctx.getImageData(0, 0, W, W);
  for (let i = 0; i < img.data.length; i += 4) {
    const g = (r() + r() - 1) * 7;
    img.data[i] = img.data[i]! + g;
    img.data[i + 1] = img.data[i + 1]! + g;
    img.data[i + 2] = img.data[i + 2]! + g;
  }
  ctx.putImageData(img, 0, 0);

  const pts = field.segments.flat();
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const mx = pts.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  const my = pts.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
  const span = Math.max(
    0.35,
    ...pts.map((p) => Math.abs(p.x - mx)),
    ...pts.map((p) => Math.abs(p.y - my)),
  );
  const scale = (W * 0.36) / span;
  const at = (s: PlateStar): [number, number] => [W / 2 - (s.x - mx) * scale, W / 2 - (s.y - my) * scale];

  // Izgara ve levha çerçevesi.
  ctx.strokeStyle = colors.ink;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = W / 700;
  ctx.setLineDash([W / 280, W / 140]);
  for (let k = -3; k <= 3; k++) {
    const p = W / 2 + k * W * 0.14;
    ctx.beginPath();
    ctx.moveTo(p, W * 0.06);
    ctx.lineTo(p, W * 0.94);
    ctx.moveTo(W * 0.06, p);
    ctx.lineTo(W * 0.94, p);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = W / 420;
  ctx.strokeRect(W * 0.05, W * 0.05, W * 0.9, W * 0.9);
  for (let k = 0; k <= 20; k++) {
    const x = W * 0.05 + k * W * 0.045;
    ctx.beginPath();
    ctx.moveTo(x, W * 0.05);
    ctx.lineTo(x, W * 0.05 + (k % 5 ? W * 0.01 : W * 0.02));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.beginPath();
  ctx.rect(W * 0.05, W * 0.05, W * 0.9, W * 0.9);
  ctx.clip();
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = W / 320;
  const gap = W * 0.014;
  for (const [a, b] of field.segments) {
    const [x1, y1] = at(a);
    const [x2, y2] = at(b);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    if (len <= gap * 2) continue;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    ctx.beginPath();
    ctx.moveTo(x1 + ux * gap, y1 + uy * gap);
    ctx.lineTo(x2 - ux * gap, y2 - uy * gap);
    ctx.stroke();
  }
  const highlighted = new Set(
    [...new Set(pts)].sort((a, b) => a.mag - b.mag).slice(0, Math.max(0, albums)),
  );
  ctx.fillStyle = colors.ink;
  for (const s of field.stars) {
    const [x, y] = at(s);
    if (x < 0 || y < 0 || x > W || y > W) continue;
    const size = Math.min(W * 0.016, Math.max(W * 0.0017, W * 0.011 * Math.pow(10, -0.2 * (s.mag - 1))));
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    if (highlighted.has(s)) {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = W / 350;
      ctx.beginPath();
      ctx.arc(x + W * 0.003, y + W * 0.002, size + W * 0.01, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.fillStyle = colors.ink;
  ctx.globalAlpha = 0.75;
  ctx.font = `500 ${Math.round(W * 0.03)}px ${mono}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const label = field.constellation
    ? (CONSTELLATION_TR[field.constellation] ?? field.constellation)
    : "Adsız küme";
  ctx.fillText(label.toLocaleUpperCase("tr"), W * 0.08, W * 0.11);
  ctx.globalAlpha = 1;
  return true;
}
