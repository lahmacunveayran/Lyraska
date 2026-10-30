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
/** Farkın tahmin hatası için pay (ms): ölçüm anı yanıttan bu kadar sonra görünebilir. */
export const CLOCK_SKEW_MS = 2;

/** Saat farkı tahmininde bu kadar ms'lik son sorgular kullanılır (duvar saatinin yavaş kayması izlenir). */
export const OFFSET_WINDOW_MS = 10_000;

/**
 * Pencerenin en hızlı sorgusunda isteğin gidişi (gönderme → çekirdeğin okuması) en çok bu kadar sürer
 * (ms). Gidiş ana iş parçacığını beklemez (istek çağrı anında gönderilir); yanıt ise ana iş parçacığı
 * boşalınca işlenir, ağır sahnede onlarca ms gecikir. Bu sınır olmadan uzun gidiş-dönüş (ör. 46 ms)
 * saat kaymasını (ör. 37 ms) içine alır, kayma görünmez ve sözler o kadar geç kalırdı.
 */
export const REQUEST_LEG_MAX_MS = 10;

/**
 * Çekirdeğin duvar saati (Unix ms) ile arayüzün saati (`performance.now()` ms) arasındaki fark. İkisi
 * yalnızca sayfa açılırken hizalıdır (`performance.timeOrigin`): duvar saati NTP ile düzeltilir,
 * uykudan dönüşte ve elle ayarda sıçrar; arayüzün saati düzeltilmez. Her sorgu farkı sınırlar: çekirdek
 * durumu `readAtMs` anında okudu, bu an isteğin gidişi ile yanıtın gelişi arasındadır, yani fark
 * [readAtMs − yanıt, readAtMs − gidiş] aralığındadır (NTP'deki gibi). Son [`OFFSET_WINDOW_MS`]'deki
 * aralıkların kesişimi alınır (her birinden dar). Önceden bilinen fark (sayfa açılışındaki hizalama)
 * kesişimin içindeyse aynen kullanılır (saat kaymamış: tam); değilse kesişimin ortası. Kesişim gidiş
 * ucundan en çok [`REQUEST_LEG_MAX_MS`] geniş sayılır (yanıtın geç işlenmesi aralığı açmaz).
 * Kesişim boşalırsa (duvar saati sıçradı) yalnızca son sorgu tutulur.
 */
export class ClockOffset {
  private samples: { at: number; low: number; high: number }[] = [];

  add(readAtMs: number, sentAt: number, receivedAt: number): void {
    if (!Number.isFinite(readAtMs) || !(receivedAt >= sentAt)) return;
    this.samples.push({ at: receivedAt, low: readAtMs - receivedAt, high: readAtMs - sentAt });
    while (this.samples[0]!.at < receivedAt - OFFSET_WINDOW_MS) this.samples.shift();
    const bounds = this.bounds();
    if (bounds && bounds.low > bounds.high) this.samples = this.samples.slice(-1);
  }

  /**
   * Farkın tahmini (ms; duvar saati − arayüzün saati): `prior` kesişimin içindeyse o (saat kaymamış),
   * değilse kesişimin ortası (iki yol eşit sayılır; en yakın uç bir yolun tamamı kadar yanılırdı).
   * Kesişimin alt ucu gidiş ucundan en çok [`REQUEST_LEG_MAX_MS`] aşağıda: daha aşağısını yalnızca
   * yanıtın geç işlenmesi açar (ağır sahne), orta da kayma da o kadar yanılırdı.
   */
  estimate(prior: number): number | null {
    const bounds = this.bounds();
    if (!bounds) return null;
    const high = bounds.high;
    const low = Math.max(bounds.low, high - REQUEST_LEG_MAX_MS);
    return prior >= low && prior <= high ? prior : (low + high) / 2;
  }

  private bounds(): { low: number; high: number } | null {
    if (this.samples.length === 0) return null;
    let low = -Infinity;
    let high = Infinity;
    for (const s of this.samples) {
      low = Math.max(low, s.low);
      high = Math.min(high, s.high);
    }
    return { low, high };
  }
}

/**
 * Sorgu yanıtındaki konumun geçerli olduğu an (`performance.now()` ms). Çekirdek konumu ses
 * çıkışında ölçtüğü anı bildirir (`positionAtMs`, duvar saati); arayüzün saatine `offsetMs`
 * ([`ClockOffset`]) ile çevrilir. Bu an sorgunun gidiş-dönüşünden ve ana iş parçacığının yanıtı geç
 * işlemesinden bağımsızdır. An sorgudan [`MAX_HEARD_AGE_MS`]'den eski (çıkış durmuş) ya da yanıttan
 * sonraysa ya da fark bilinmiyorsa [`replyTime`] kullanılır. An, saatin son bağlandığı andan eski olamaz.
 */
export function statusTime(
  positionAtMs: number | null | undefined,
  offsetMs: number | null,
  sentAt: number,
  receivedAt: number,
  previousAt: number | null,
): number {
  if (typeof positionAtMs === "number" && Number.isFinite(positionAtMs) && offsetMs !== null) {
    const at = positionAtMs - offsetMs;
    if (at >= sentAt - MAX_HEARD_AGE_MS && at <= receivedAt + CLOCK_SKEW_MS) {
      const bounded = Math.min(at, receivedAt);
      return previousAt === null ? bounded : Math.max(bounded, previousAt);
    }
  }
  return replyTime(sentAt, receivedAt, previousAt);
}
