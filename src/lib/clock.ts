/**
 * Oynatma saati: ekrandaki süre ve ilerleme çubuğunun akıcı ilerlemesi için.
 *
 * Ses motoru konumu saniyede birkaç kez bildirir. Arada ekran, son bildirilen
 * konumdan geçen süreyi ekleyerek her karede ileri sayar. Yeni bildirim küçük bir
 * sapma gösterirse konum zıplamaz, yumuşakça düzeltilir; büyük farklar (sarma,
 * şarkı değişimi) hemen uygulanır.
 */

export interface ClockAnchor {
  /** Bilinen konum (saniye). */
  position: number;
  /** Bu konumun bilindiği an (`performance.now()` ms). */
  at: number;
  /** Çalıyor mu? Çalmıyorsa konum sabit kalır. */
  running: boolean;
}

/** Bu kadar saniyeden büyük sapmalar düzeltilmez, doğrudan uygulanır. */
export const SNAP_SECONDS = 0.3;
/** Küçük sapmanın her bildirimde düzeltilen oranı. */
export const CORRECTION = 0.25;

/**
 * Kare süresi tahmininin sınırları (ms): 240 Hz ile 4 kare/sn arası (ekran kartı olmayan çok yavaş,
 * yüklü makinede kareler 150 ms'yi aşabilir; sözler yine o karenin ekrana çıktığı ana göre okunur).
 */
export const MIN_FRAME_MS = 1000 / 240;
export const MAX_FRAME_MS = 1000 / 4;
/** Kare süresi bu kadar son karenin ortancasıdır (tek takılma tahmini bozmaz). */
export const FRAME_HISTORY = 15;

/**
 * Ekran karelerinin süresi (ms): son karelerin `requestAnimationFrame` damgaları arasındaki sürelerin
 * ortancası, ama son aralıktan uzun değil. Ortanca tek takılmayı (sekme arka plandan dönüşü) yok
 * sayar; son aralık, ağır sahneden hafif sahneye geçince tahminin hemen kısalmasını sağlar (yoksa
 * sözler birkaç kare boyunca erken gelirdi). Ekranın tazelenme hızını (60, 144 Hz) ve ağır sahnede
 * yavaşlayan kareyi (30 kare/sn) izler. Damgalar başka bir saatten gelse de (sahne denetiminin sanal
 * saati) sonuç sınırlar içindedir.
 */
export class FrameClock {
  private last: number | null = null;
  private readonly intervals: number[] = [];

  /** Yeni karenin damgasını kaydeder; güncel kare süresini döndürür. */
  tick(frameStamp: number): number {
    if (this.last !== null && frameStamp > this.last) {
      this.intervals.push(frameStamp - this.last);
      if (this.intervals.length > FRAME_HISTORY) this.intervals.shift();
    }
    this.last = frameStamp;
    return this.frameMs();
  }

  frameMs(): number {
    if (this.intervals.length === 0) return 1000 / 60;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const estimate = Math.min(sorted[sorted.length >> 1]!, this.intervals.at(-1)!);
    return Math.min(MAX_FRAME_MS, Math.max(MIN_FRAME_MS, estimate));
  }
}

/**
 * Bu karenin ekrana çıkacağı tahmini an (`performance.now()` ms): karenin başlangıcından
 * (`requestAnimationFrame` damgası) bir kare sonra; ama geri çağrının koştuğu andan önce değil (ağır
 * karede, geri çağrı damgadan geç koşar) ve ondan bir kareden sonra da değil (damga gelecekte ya da
 * başka bir saatten). Aynı karede önce koşan çizimler (sahne) anı ileri kaydırmaz.
 */
export function displayTime(frameStamp: number, now: number, frameMs: number): number {
  return Math.min(now + frameMs, Math.max(frameStamp + frameMs, now));
}

/**
 * Ardışık karelerin anı: geri gitmez (söz bir kelime geri dönüp yanıp sönmesin), ama yalnızca küçük
 * geri adımda (en çok bir kare); büyük geri adımda (ağır sahneden hafif sahneye geçince önceki tahmin
 * fazla ileriydi) yeni an alınır, yoksa sözler o kadar donardı.
 */
export function nextFrameAt(lastAt: number, at: number, frameMs: number): number {
  return at < lastAt && lastAt - at <= frameMs ? lastAt : at;
}

/**
 * Gidiş-dönüşü bundan uzun sorguda konumun okunduğu an bilinmez (ms; çekirdek meşgul ya da yanıt geç
 * işlendi): orta nokta yarısı kadar yanılabilir; eşik yarım kareyi aşmayacak kadar kısa.
 */
export const MAX_MIDPOINT_RTT_MS = 16;

/**
 * Sorgu yanıtındaki konumun okunduğu tahmini an (ms). Kısa sorguda istek ile yanıtın ortası (IPC'nin
 * dönüş yolu konumu geride bırakmasın); uzun sorguda (çekirdek kilit ya da iş bekledi, konum yolun
 * herhangi bir yerinde okunmuş olabilir) yanıtın geldiği an: orta nokta saati öne itebilirdi. Saatin
 * son bağlandığı andan (`previousAt`; ör. sorgu sürerken biten sarma) eski olamaz.
 */
export function replyTime(sentAt: number, receivedAt: number, previousAt: number | null): number {
  const at = receivedAt - sentAt <= MAX_MIDPOINT_RTT_MS ? (sentAt + receivedAt) / 2 : receivedAt;
  return previousAt === null ? at : Math.max(at, previousAt);
}

/** Verilen anda tahmin edilen konum; [0, süre] aralığında. */
export function positionAt(anchor: ClockAnchor, now: number, duration: number | null): number {
  const elapsed = anchor.running ? Math.max(0, now - anchor.at) / 1000 : 0;
  const position = anchor.position + elapsed;
  return Math.max(0, duration && duration > 0 ? Math.min(position, duration) : position);
}

/** Ses motorundan yeni konum bildirimi geldiğinde saati günceller. */
export function reanchor(
  prev: ClockAnchor | null,
  reported: number,
  running: boolean,
  now: number,
  duration: number | null,
): ClockAnchor {
  if (prev && prev.running && running) {
    const predicted = positionAt(prev, now, duration);
    const drift = reported - predicted;
    if (Math.abs(drift) < SNAP_SECONDS) {
      return { position: predicted + drift * CORRECTION, at: now, running };
    }
  }
  return { position: reported, at: now, running };
}

/**
 * Çekirdeğin bildirdiği ölçüm anı, sorgu gönderilmeden en çok bu kadar önce olabilir (ms): ses
 * aygıtının dönemi (~10 ms) ve birkaç dönemlik pay. Daha eskiyse çıkış durmuş sayılır.
 */
export const MAX_HEARD_AGE_MS = 50;
/** Çekirdeğin saatiyle arayüzün saati arasında kabul edilen en büyük fark (ms; duvar saatinin oynaması). */
export const CLOCK_SKEW_MS = 2;

/**
 * Sorgu yanıtındaki konumun geçerli olduğu an (`performance.now()` ms). Çekirdek konumu ses
 * çıkışında ölçtüğü anı bildirir (`positionAtMs`, Unix ms); arayüzün saatine çevrilir
 * (`performance.timeOrigin`). Bu an sorgunun gidiş-dönüşünden ve ana iş parçacığının yanıtı geç
 * işlemesinden bağımsızdır. Ama iki saat aynı duvar saatine bağlı olsa da güvenilmez: an sorgudan
 * [`MAX_HEARD_AGE_MS`]'den eski ya da yanıttan sonraysa (saat farkı, duran çıkış) [`replyTime`]
 * kullanılır. An, saatin son bağlandığı andan eski olamaz.
 */
export function statusTime(
  positionAtMs: number | null | undefined,
  timeOrigin: number,
  sentAt: number,
  receivedAt: number,
  previousAt: number | null,
): number {
  if (typeof positionAtMs === "number" && Number.isFinite(positionAtMs)) {
    const at = positionAtMs - timeOrigin;
    if (at >= sentAt - MAX_HEARD_AGE_MS && at <= receivedAt + CLOCK_SKEW_MS) {
      const bounded = Math.min(at, receivedAt);
      return previousAt === null ? bounded : Math.max(bounded, previousAt);
    }
  }
  return replyTime(sentAt, receivedAt, previousAt);
}
