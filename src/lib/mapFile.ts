import type { ImportedMapStatus } from "./backend";

/** Dışa aktarılan harita dosyasının uzantısı (içinde JSON; adından tanınsın). */
export const MAP_FILE_SUFFIX = ".harita.json";

/**
 * Şarkı haritası dosyasının önerilen adı: "Sanatçı - Başlık.harita.json". Windows'ta geçersiz
 * karakterler "_" olur; ad boşsa "sarki".
 */
export function mapFileName(title: string): string {
  const safe = Array.from(title)
    .map((c) => (c < " " || '<>:"/\\|?*'.includes(c) ? "_" : c))
    .join("")
    .slice(0, 80)
    .trim()
    .replace(/\.+$/, "")
    .trim();
  return `${safe || "sarki"}${MAP_FILE_SUFFIX}`;
}

/** "%93" gibi (Türkçe yüzde biçimi). */
function percent(x: number): string {
  return `%${Math.round(Math.min(1, Math.max(0, x)) * 100)}`;
}

/**
 * İçe aktarılan haritanın tek satırlık özeti: kaynağı, benzerliği, (varsa) uygulanan kayma ve
 * kimin hazırladığı.
 */
export function importedSummary(status: ImportedMapStatus): string {
  const parts = [`benzerlik ${percent(status.similarity)}`, `${status.beats} vuruş`];
  const ms = Math.round(status.offsetSecs * 1000);
  if (Math.abs(ms) >= 10) {
    parts.push(
      `zamanlar ${ms > 0 ? "+" : "−"}${Math.abs(ms).toLocaleString("tr-TR")} ms kaydırıldı`,
    );
  }
  parts.push(status.source === "edited" ? "bir insanın düzelttiği" : "analizden");
  return parts.join(" · ");
}
