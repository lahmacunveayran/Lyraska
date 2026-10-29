import { AURORA_MAX_LUMINANCE, auroraLuminance, type SkyState } from "./sky";

/**
 * Gölgelendirici sahneleri (galeri): her biri tek bir tam ekran parça gölgelendiricisinde çizilen
 * özgün sahneler. Hepsi gece göğünün saf hesabını (`stepSky`) paylaşır: parlaklığı değiştiren her
 * değer orada yumuşatılır (Epilepsi güvenli modunda ayrıca yarı hızla sınırlı), müziğin vuruşları
 * parlaklıktan çok akış hızına yansır. Sahnenin kendi kodu yalnızca görüntünün biçimini çizer;
 * parlaklığı tek bir çarpandan ([`sceneLevel`]) alır; çarpanın dar bandı tasarımdır.
 */

export type ShaderSceneId =
  "sea" | "nebula" | "tunnel" | "fireflies" | "kaleido" | "ribbons" | "galaxy" | "rain";

export interface ShaderSceneInfo {
  id: ShaderSceneId;
  name: string;
  /** Galeride adın altında görünen tek satır. */
  hint: string;
  /** Ekran okuyucunun okuduğu açıklama. */
  label: string;
}

/** Galerideki sırayla. */
export const SHADER_SCENES: ShaderSceneInfo[] = [
  {
    id: "sea",
    name: "Gece denizi",
    hint: "Ayın denizdeki yolu; bas dalgaları büyütür.",
    label: "Gece denizi: ayın ışığı dalgaların üstünde müziğe göre kırılıyor",
  },
  {
    id: "nebula",
    name: "Bulutsu",
    hint: "Yıldızların önünde akan renkli toz; drop'ta açılır.",
    label: "Bulutsu: yıldızların önünde müziğe göre akan renkli gaz bulutları",
  },
  {
    id: "tunnel",
    name: "Işık tüneli",
    hint: "Işık çizgilerinden bir tünelde süzülme.",
    label: "Işık tüneli: vuruşlarla hızlanan, ışık çizgilerinden bir tünel",
  },
  {
    id: "fireflies",
    name: "Ateşböcekleri",
    hint: "Orman kıyısında yavaşça yanıp sönen ışıklar.",
    label: "Ateşböcekleri: ağaçların önünde müziğe göre süzülen ışıklar",
  },
  {
    id: "kaleido",
    name: "Kaleydoskop",
    hint: "Altı aynalı, yavaşça dönen renk deseni.",
    label: "Kaleydoskop: altı aynada yansıyan, müziğe göre akan renk deseni",
  },
  {
    id: "ribbons",
    name: "İpek şeritler",
    hint: "Bas, orta ve tizin ayrı ayrı dalgalandırdığı ışık şeritleri.",
    label: "İpek şeritler: bas, orta ve tize göre dalgalanan ışık şeritleri",
  },
  {
    id: "galaxy",
    name: "Sarmal gökada",
    hint: "Yavaşça dönen kollar; drop'ta gökada açılır.",
    label: "Sarmal gökada: müziğe göre dönen yıldız kolları",
  },
  {
    id: "rain",
    name: "Yağmurlu cam",
    hint: "Camdaki damlaların ardında bulanık şehir ışıkları.",
    label: "Yağmurlu cam: damlaların ardında müziğe göre süzülen şehir ışıkları",
  },
];

export function isShaderScene(id: string): id is ShaderSceneId {
  return SHADER_SCENES.some((s) => s.id === id);
}

/**
 * Sahnenin en sönük hâlindeki parlaklık çarpanı (müzik yokken). Müzik sahnenin ışığını yalnızca
 * `1 − SHADER_LEVEL_FLOOR` kadar güçlendirir; gerisi biçime ve akışa yansır.
 */
export const SHADER_LEVEL_FLOOR = 0.72;

/**
 * Sahnelerin ışığının, parlama penceresi büyüklüğündeki bir alanda ulaşabileceği en büyük bağıl
 * parlaklık için tasarım üst sınırı (parlama testinde kullanılır). Gerçek tarayıcıda
 * `npm run check:scenes` ölçer: sessizden tam sese geçişte her sahnede ve temada fark < 0,10.
 */
export const SHADER_MAX_WINDOW_LUMINANCE = 0.3;

const CALM_LUMINANCE = auroraLuminance([0, 0, 0], 0);

/**
 * Sahnenin parlaklık çarpanının müzikle değişen kısmı (0..1): gece göğündeki perde parlaklığının
 * ([`auroraLuminance`]) kendi aralığına oranı. Güvenli modda enerjiler ve açılım hız sınırlı
 * olduğundan bu değer de hız sınırlıdır; tekdüze artan bir dönüşüm olduğu için parlama sayısını
 * artıramaz.
 */
export function sceneLevel(state: Pick<SkyState, "energies" | "bloom">): number {
  const lum = auroraLuminance(state.energies, state.bloom);
  const level = (lum - CALM_LUMINANCE) / (AURORA_MAX_LUMINANCE - CALM_LUMINANCE);
  return Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
}

/** Gölgelendiricinin uyguladığı parlaklık çarpanı (`SHADER_LEVEL_FLOOR` … 1). */
export function sceneGain(level: number): number {
  return SHADER_LEVEL_FLOOR + (1 - SHADER_LEVEL_FLOOR) * level;
}

/** Parlama testi için sahnenin en kötü penceredeki parlaklığı (üst sınır). */
export function sceneWindowLuminance(state: Pick<SkyState, "energies" | "bloom">): number {
  return SHADER_MAX_WINDOW_LUMINANCE * sceneGain(sceneLevel(state));
}
