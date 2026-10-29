/**
 * Sahne denetimini CI'da paralel parçalara bölme (`SCENE_SHARD=2/3`): denetimler sırayla
 * numaralanır ve parçalara sırayla dağıtılır (1., 4., 7. … denetim 1. parçaya). Bütün parçaların
 * birleşimi denetimlerin tamamıdır; hiçbiri atlanmaz, hiçbiri iki kez koşmaz.
 */

/** "2/3" → { index: 2, count: 3 }; boşsa tek parça. Bozuk değer hata verir (sessizce atlanmasın). */
export function parseShard(text) {
  if (!text) return { index: 1, count: 1 };
  const match = /^(\d+)\/(\d+)$/.exec(text.trim());
  const index = match ? Number(match[1]) : NaN;
  const count = match ? Number(match[2]) : NaN;
  if (!(count >= 1 && index >= 1 && index <= count)) {
    throw new Error(`SCENE_SHARD "${text}" anlaşılamadı (ör. "2/3")`);
  }
  return { index, count };
}

/** Bu parçanın denetimleri (sıra korunur). */
export function pickShard(items, { index, count }) {
  return items.filter((_, i) => i % count === index - 1);
}
