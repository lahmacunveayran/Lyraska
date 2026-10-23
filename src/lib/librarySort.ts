import type { LibraryTrack } from "./backend";
import { camelotNumber, keyName } from "./musicalKey";

/**
 * Kütüphane listesinin sıralanması ve ton sütununun gösterimi (saf yardımcılar).
 * Çekirdek listeyi sanatçı → albüm → parça sırasıyla verir; öteki sıralar arayüzde yapılır.
 */

/** Sıralanabilen sütunlar. "artist": çekirdeğin sırası (sanatçı, albüm, parça). */
export type SortKey = "artist" | "title" | "album" | "bpm" | "key" | "duration";

export interface LibrarySort {
  key: SortKey;
  descending: boolean;
}

export const DEFAULT_SORT: LibrarySort = { key: "artist", descending: false };

const COLLATOR = new Intl.Collator("tr", { sensitivity: "base", numeric: true });

/** Camelot kodunu ("8A") sayıya ve kipe ayırır; geçersizse `null`. */
export function parseCamelot(code: string): { number: number; minor: boolean } | null {
  const match = /^(\d{1,2})([AB])$/.exec(code);
  if (!match) return null;
  const number = Number(match[1]);
  return number >= 1 && number <= 12 ? { number, minor: match[2] === "A" } : null;
}

/** Camelot kodunun Türkçe adı: "8A" → "La minör", "8B" → "Do majör"; geçersizse `null`. */
export function camelotName(code: string): string | null {
  const parsed = parseCamelot(code);
  if (!parsed) return null;
  for (let tonic = 0; tonic < 12; tonic++) {
    const key = { tonic, minor: parsed.minor };
    if (camelotNumber(key) === parsed.number) return keyName(key);
  }
  return null;
}

/**
 * Ton sütunu: herkesin dilinde ad ("La minör"); DJ görünümünde Camelot kodu ("8A").
 * Analiz edildiği hâlde tonu belirsiz şarkıda "—", henüz analiz edilmemişte boş.
 */
export function keyText(
  track: { key: string | null; analyzed: boolean },
  camelot: boolean,
): string {
  if (track.key) return camelot ? track.key : (camelotName(track.key) ?? track.key);
  return track.analyzed ? "—" : "";
}

/** Ton rengi için Camelot sayısı (1–12); tonu yoksa `null`. */
export function keyHue(code: string | null): number | null {
  return code ? (parseCamelot(code)?.number ?? null) : null;
}

/** Ton sırası: Camelot çarkı (1A, 1B, 2A …); uyumlu tonlar yan yana gelir. */
function keyRank(code: string | null): number | null {
  const parsed = code ? parseCamelot(code) : null;
  return parsed ? parsed.number * 2 + (parsed.minor ? 0 : 1) : null;
}

/** Sütunun sıralama değeri; değeri olmayan şarkıda `null`. */
function sortValue(track: LibraryTrack, key: Exclude<SortKey, "artist">): string | number | null {
  switch (key) {
    case "title":
      return track.title || null;
    case "album":
      return track.album || null;
    case "bpm":
      return track.bpm;
    case "key":
      return keyRank(track.key);
    case "duration":
      return track.durationSecs;
  }
}

function compare(a: string | number, b: string | number): number {
  return typeof a === "string" && typeof b === "string"
    ? COLLATOR.compare(a, b)
    : Number(a) - Number(b);
}

/**
 * Listeyi sıralar (yeni dizi; giriş değişmez). Eşitler çekirdeğin sırasını korur. Değeri
 * olmayanlar (analiz edilmemiş tempo, etiketsiz albüm) yön ne olursa olsun sonda kalır.
 * Varsayılan sıranın tersi çekirdeğin sırasını yalnızca çevirir.
 */
export function sortTracks(tracks: LibraryTrack[], sort: LibrarySort): LibraryTrack[] {
  const key = sort.key;
  if (key === "artist") return sort.descending ? [...tracks].reverse() : tracks;
  const sign = sort.descending ? -1 : 1;
  return tracks
    .map((track, index) => ({ track, index, value: sortValue(track, key) }))
    .sort((x, y) => {
      if (x.value === null || y.value === null) {
        if (x.value !== y.value) return x.value === null ? 1 : -1;
      } else {
        const c = compare(x.value, y.value);
        if (c !== 0) return sign * c;
      }
      return x.index - y.index;
    })
    .map((o) => o.track);
}

/** Başlığa tıklanınca: aynı sütunsa yön döner, başka sütunsa artan sırayla başlar. */
export function nextSort(current: LibrarySort, key: SortKey): LibrarySort {
  return current.key === key
    ? { key, descending: !current.descending }
    : { key, descending: false };
}
