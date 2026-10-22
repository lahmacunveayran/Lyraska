import { useEffect, useRef, useState } from "react";
import { getVisualFrame, type VisualFrame } from "../lib/backend";
import { extrapolateFrame } from "../lib/sync";

/**
 * Her ekran karesinde `onTick(frame, dt)` çağırır. Çalarken `frame`, Rust'tan
 * alınan en son görsel veridir (o an duyulan anın önceden yapılmış analizi);
 * çalmıyorken `null`.
 *
 * Bütün dinleyiciler (sahne, içindeki alt sahne, çekmecedeki vuruş göstergesi) **tek**
 * döngüyü paylaşır: ekran karesi başına en fazla bir `visual_frame` isteği gider, aynı anda
 * tek istek uçuştadır (IPC kuyruğu birikmez) ve istek hızı saniyede 60'ı aşmaz (144 Hz
 * ekranda da). Veri ekran karelerine tam denk gelmez; bu yüzden her karede verinin
 * hesaplandığı andan bu yana geçen süre ölçülür ve vuruşa bağlı değerler o kadar ileri
 * alınır (`extrapolateFrame`): hareketler takılmadan, tam vuruşunda akar.
 *
 * Kimse çalmıyorken (boşta, duraklatılmış) sahneler saniyede 60 yerine en fazla 15 kez
 * çizilir: tam ekran gölgelendiriciler boşta ekran kartını ve pili tüketmesin; durgun gök
 * yine yavaşça kıpırdar (ARA-01).
 *
 * `onTick` hata verirse hata bir sonraki çizimde yeniden fırlatılır: böylece bileşenin
 * hata sınırı yakalar ("Sahne çizilemedi"), döngü her karede aynı hatayı tekrarlamaz.
 */
export function useVisualFeed(
  playing: boolean,
  onTick: (frame: VisualFrame | null, dt: number) => void,
): void {
  const [error, setError] = useState<unknown>(null);
  if (error !== null) throw error;

  const subscriber = useRef<Subscriber | null>(null);
  useEffect(() => {
    const entry: Subscriber = {
      playing: false,
      tick: () => undefined,
      fail: (e) => setError(() => e ?? new Error("sahne döngüsü hata verdi")),
      failed: false,
    };
    subscriber.current = entry;
    subscribe(entry);
    return () => {
      subscriber.current = null;
      unsubscribe(entry);
    };
  }, []);
  useEffect(() => {
    if (subscriber.current) subscriber.current.playing = playing;
  }, [playing]);
  useEffect(() => {
    if (subscriber.current) subscriber.current.tick = onTick;
  }, [onTick]);
}

/** İstekler arası en kısa süre (ms): saniyede en fazla 60 istek (60 Hz'de her kare). */
const MIN_FETCH_INTERVAL_MS = 1000 / 60 - 2;
/** Kimse çalmıyorken çizimler arası en kısa süre (ms): saniyede en fazla 15 çizim. */
export const IDLE_TICK_INTERVAL_MS = 1000 / 15 - 2;

interface Subscriber {
  playing: boolean;
  tick: (frame: VisualFrame | null, dt: number) => void;
  fail: (error: unknown) => void;
  failed: boolean;
}

const subscribers = new Set<Subscriber>();
let raf = 0;
let last = 0;
let inFlight = false;
let latest: VisualFrame | null = null;
/** En son verinin hesaplandığı an (istek ile yanıtın ortası, ms). */
let latestAt = 0;
let lastSentAt = -Infinity;
/** Son çizimin anı ve o çizimden beri biriken süre (boşta seyrek çizim için). */
let lastTickAt = -Infinity;
let pendingDt = 0;

function subscribe(entry: Subscriber) {
  subscribers.add(entry);
  if (raf === 0 && typeof window.requestAnimationFrame === "function") {
    last = performance.now();
    raf = window.requestAnimationFrame(loop);
  }
}

function unsubscribe(entry: Subscriber) {
  subscribers.delete(entry);
  if (subscribers.size === 0 && raf !== 0) {
    window.cancelAnimationFrame(raf);
    raf = 0;
    latest = null;
  }
}

function loop(now: number) {
  if (subscribers.size === 0) {
    raf = 0;
    return;
  }
  raf = window.requestAnimationFrame(loop);
  // Saat farkı ya da sekme uykusu sonrası eksi süre gelmez.
  pendingDt += Math.max(0, now - last) / 1000;
  last = now;

  let playing = false;
  for (const s of subscribers) playing ||= s.playing && !s.failed;
  if (!playing) {
    // Kimse çalmıyor: eski kare bir sonraki çalmada görünmesin; seyrek çizilir.
    latest = null;
    if (now - lastTickAt < IDLE_TICK_INTERVAL_MS) return;
  } else if (!inFlight && now - lastSentAt >= MIN_FETCH_INTERVAL_MS) {
    inFlight = true;
    lastSentAt = now;
    const sentAt = performance.now();
    getVisualFrame()
      .then((frame) => {
        // `null`: o an için veri yok (ör. şarkı değişti, analiz henüz yetişmedi).
        // Sahne dinlenmeye geçer; önceki karede donup kalmaz.
        latest = frame;
        latestAt = (sentAt + performance.now()) / 2;
      })
      .catch(() => {
        /* Geçici hata: bir sonraki karede yeniden denenir. */
      })
      .finally(() => {
        inFlight = false;
      });
  }
  // Uzun bir takılmadan sonra (sekme arka plandaydı) en fazla 250 ms ileri alınır.
  const age = Math.max(0, Math.min(0.25, (now - latestAt) / 1000));
  const frame = latest ? extrapolateFrame(latest, age) : null;
  const dt = pendingDt;
  pendingDt = 0;
  lastTickAt = now;
  for (const s of subscribers) {
    if (s.failed) continue;
    try {
      s.tick(s.playing ? frame : null, dt);
    } catch (e) {
      s.failed = true;
      s.fail(e);
    }
  }
}
