import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import type { LibraryTrack } from "../lib/backend";
import { bpmLabel } from "../lib/analysis";
import { camelotName } from "../lib/librarySort";
import {
  BPM_RINGS,
  bpmRadius,
  keyAngle,
  layoutSky,
  nearestStar,
  orderStars,
  type SkyStar,
} from "../lib/skyMap";

const NUMBER = new Intl.NumberFormat("tr-TR");

export interface SkyViewProps {
  tracks: LibraryTrack[];
  /** Çalan şarkının yolu: dört kollu, durağan ışık. */
  currentPath: string | null;
  onPlay: (track: LibraryTrack) => void;
}

/** `--key-1` … `--key-12` renkleri (CSS'ten; yoksa yedek). */
function keyColors(element: Element): string[] {
  const style = getComputedStyle(element);
  return Array.from(
    { length: 12 },
    (_, i) => style.getPropertyValue(`--key-${i + 1}`).trim() || "#9fb4ff",
  );
}

/** "#58b5e3" → "rgba(88, 181, 227, a)". */
function withAlpha(color: string, alpha: number): string {
  const v = Number.parseInt(color.replace("#", "").slice(0, 6), 16);
  if (!Number.isFinite(v)) return `rgba(200, 210, 255, ${alpha})`;
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
}

interface Geometry {
  width: number;
  height: number;
  cx: number;
  cy: number;
  radius: number;
}

/**
 * Gökyüzü görünümü: şarkılar yıldız, renk ton, yer ton ve tempo. Bir kez çizilir (boyut ya da
 * şarkılar değişince yeniden); hareket ve parlama yoktur. Üzerine gelinen yıldızın künyesi görünür,
 * tıklanınca çalar.
 */
export function SkyView({ tracks, currentPath, onPlay }: SkyViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  // Seçili yıldız, seçildiği yerleşimle birlikte: yerleşim değişince (boyut, yeni analiz) eski seçim
  // kendiliğinden düşer, başka şarkı çalınmaz.
  const [picked, setPicked] = useState<{ layout: unknown; star: SkyStar } | null>(null);

  // Alanın boyutu (pencere değişince).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => {
      const width = wrap.clientWidth;
      const height = wrap.clientHeight;
      if (width < 50 || height < 50) return;
      const radius = Math.min(width, height) / 2 - 40;
      setGeometry({ width, height, cx: width / 2, cy: height / 2, radius });
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // Yerleşim birim çemberde bir kez (şarkılar değişince); pencere boyutu yalnızca ölçekler.
  const unit = useMemo(() => layoutSky(tracks, 0, 0, 1), [tracks]);
  const layout = useMemo(() => {
    if (!geometry) return null;
    const { cx, cy, radius } = geometry;
    return {
      stars: unit.stars.map((s) => ({ ...s, x: cx + s.x * radius, y: cy + s.y * radius })),
      unplaced: unit.unplaced,
    };
  }, [unit, geometry]);
  const order = useMemo(
    () => (layout && geometry ? orderStars(layout.stars, geometry.cx, geometry.cy) : []),
    [layout, geometry],
  );
  const hover = picked && picked.layout === layout ? picked.star : null;
  const setHover = (star: SkyStar | null) => {
    // Aynı yıldızın üstünde gezinmek yeniden çizdirmez.
    if (star !== hover) setPicked(star ? { layout, star } : null);
  };

  // Çizim: ızgara, renkli bulutsu (sönük yıldızların toplamı), yıldızlar, çalan şarkı.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !geometry || !layout) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(geometry.width * dpr);
    canvas.height = Math.round(geometry.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const colors = keyColors(canvas);
    // Büyük kütüphanede yoğun kümeler beyaza doymasın: ışık yıldız sayısıyla azalır.
    const density = Math.min(1, Math.max(0.25, Math.sqrt(500 / Math.max(1, layout.stars.length))));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, geometry.width, geometry.height);
    const { cx, cy, radius } = geometry;

    // Izgara: tempo halkaları ve ton ışınları, çok soluk.
    ctx.strokeStyle = "rgba(232, 226, 212, 0.09)";
    ctx.lineWidth = 0.7;
    ctx.setLineDash([1, 4]);
    for (const bpm of BPM_RINGS) {
      ctx.beginPath();
      ctx.arc(cx, cy, bpmRadius(bpm) * radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let n = 1; n <= 12; n++) {
      const a = keyAngle(n, true) + (22 * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * radius * 0.12, cy + Math.sin(a) * radius * 0.12);
      ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Bulutsu: her yıldız düşük çözünürlükte geniş, soluk bir leke bırakır; bulanıklaştırılıp eklenir.
    const scale = 0.25;
    const glow = document.createElement("canvas");
    glow.width = Math.max(1, Math.round(geometry.width * scale));
    glow.height = Math.max(1, Math.round(geometry.height * scale));
    const g = glow.getContext("2d");
    if (g) {
      g.globalCompositeOperation = "lighter";
      for (const star of layout.stars) {
        g.fillStyle = withAlpha(
          colors[star.hue - 1] ?? "#9fb4ff",
          0.05 * star.brightness * density,
        );
        g.beginPath();
        g.arc(star.x * scale, star.y * scale, 2.2, 0, Math.PI * 2);
        g.fill();
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.filter = "blur(14px)";
      ctx.drawImage(glow, 0, 0, geometry.width, geometry.height);
      ctx.restore();
    }

    // Yıldızlar: renkli hale, açık çekirdek.
    ctx.globalCompositeOperation = "lighter";
    for (const star of layout.stars) {
      const color = colors[star.hue - 1] ?? "#9fb4ff";
      const size = 0.7 + star.brightness * 1.5;
      ctx.fillStyle = withAlpha(color, 0.35 * star.brightness * density);
      ctx.beginPath();
      ctx.arc(star.x, star.y, size * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha(color, 0.95);
      ctx.beginPath();
      ctx.arc(star.x, star.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    // Çalan şarkı: dört kollu, durağan ışık (nabız yok).
    const current = layout.stars.find((s) => s.track.path === currentPath);
    if (current) {
      ctx.strokeStyle = "rgba(240, 248, 255, 0.85)";
      ctx.lineWidth = 1;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(current.x - dx * 22, current.y - dy * 22);
        ctx.lineTo(current.x + dx * 22, current.y + dy * 22);
        ctx.stroke();
      }
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(current.x, current.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [geometry, layout, currentPath]);

  const starAt = (event: PointerEvent<HTMLCanvasElement> | MouseEvent<HTMLCanvasElement>) => {
    if (!layout) return null;
    const box = event.currentTarget.getBoundingClientRect();
    return nearestStar(layout.stars, event.clientX - box.left, event.clientY - box.top, 10);
  };
  const onMove = (event: PointerEvent<HTMLCanvasElement>) => setHover(starAt(event));
  // Tıklanan yer (dokunmatik ekranda önce imleç hareketi gelmez).
  const onClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const star = starAt(event);
    if (star) onPlay(star.track);
  };
  // Klavye: oklar çarkta tondan tona dolaşır, Enter ya da boşluk çalar.
  const onKey = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (order.length === 0) return;
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    const step = steps[event.key];
    if (step !== undefined) {
      event.preventDefault();
      const at = hover ? order.findIndex((s) => s.track.path === hover.track.path) : -1;
      const next = at < 0 ? (step > 0 ? 0 : order.length - 1) : at + step;
      setHover(order[(next + order.length) % order.length] ?? null);
    } else if ((event.key === "Enter" || event.key === " ") && hover) {
      event.preventDefault();
      onPlay(hover.track);
    }
  };

  // Tempo halkalarının etiketleri: iki ton arasındaki soluk ışın üzerinde (yıldızların arasında).
  const ringLabels = geometry
    ? [80, 120, 160].map((bpm) => {
        const a = keyAngle(1, true) + (22 * Math.PI) / 180;
        const r = bpmRadius(bpm) * geometry.radius;
        return { bpm, x: geometry.cx + Math.cos(a) * r, y: geometry.cy + Math.sin(a) * r };
      })
    : [];

  const keyLabels = geometry
    ? Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        const a = keyAngle(n, true) + (7 * Math.PI) / 180;
        const r = geometry.radius + 18;
        return {
          n,
          x: geometry.cx + Math.cos(a) * r,
          y: geometry.cy + Math.sin(a) * r,
          minor: camelotName(`${n}A`) ?? "",
          major: camelotName(`${n}B`) ?? "",
        };
      })
    : [];

  return (
    <div className="sky-view" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="sky-view__canvas"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onClick={onClick}
        onKeyDown={onKey}
        tabIndex={0}
        style={{ cursor: hover ? "pointer" : "default" }}
        aria-label="Gökyüzü: şarkılar tonlarına ve tempolarına göre yıldız olarak dizili. Ok tuşlarıyla yıldız seçin, Enter ile çalın."
        role="img"
      />
      {keyLabels.map((label) => (
        <span
          key={label.n}
          className="sky-view__key"
          aria-hidden
          style={{ left: label.x, top: label.y, color: `var(--key-${label.n})` }}
        >
          {label.minor}
          <br />
          <small>{label.major}</small>
        </span>
      ))}
      {hover && (
        <div
          className="sky-view__card"
          role="status"
          style={{
            left:
              geometry && hover.x > geometry.width - 300
                ? Math.max(4, hover.x - 294)
                : hover.x + 14,
            top: geometry && hover.y > geometry.height - 110 ? hover.y - 100 : hover.y + 14,
          }}
        >
          <b>{hover.track.title}</b>
          <span>{[hover.track.artist, hover.track.album].filter(Boolean).join(" · ")}</span>
          <span className="sky-view__facts">
            {camelotName(hover.track.key ?? "") ?? ""} · {bpmLabel(hover.track)} BPM
          </span>
          <small>Çalmak için tıklayın</small>
        </div>
      )}
      {ringLabels.map((label) => (
        <span
          key={label.bpm}
          className="sky-view__ring"
          aria-hidden
          style={{ left: label.x, top: label.y }}
        >
          {label.bpm}
        </span>
      ))}
      {layout && (
        <p className="sky-view__legend">
          Çarkta ton, içeriden dışarıya tempo (BPM) · {NUMBER.format(layout.stars.length)} yıldız
          {layout.unplaced > 0 &&
            ` · ${NUMBER.format(layout.unplaced)} şarkı gökyüzünde yok (tonu ya da temposu bilinmiyor)`}
        </p>
      )}
    </div>
  );
}
