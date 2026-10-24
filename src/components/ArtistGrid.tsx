import { useEffect, useId, useRef, useState } from "react";
import { PlayIcon } from "./icons";
import type { LibraryArtist, LibraryTrack } from "../lib/backend";
import {
  drawArtistPlate,
  plateCoordinates,
  plateField,
  type PlateColors,
  type StarAtlas,
} from "../lib/artistPlate";

const NUMBER = new Intl.NumberFormat("tr-TR");
/** Levhanın piksel boyu. */
const PLATE_SIZE = 320;
/** Akılda tutulan levha sayısı. */
const CACHE_LIMIT = 300;

/** Yıldız atlası (≈ 200 KB) yalnızca sanatçılar ilk açılınca yüklenir. */
let atlasPromise: Promise<StarAtlas> | null = null;
function loadAtlas(): Promise<StarAtlas> {
  atlasPromise ??= import("../lib/starAtlas.json").then((m) => m.default as StarAtlas);
  return atlasPromise;
}

const plates = new Map<string, { url: string; coordinates: string }>();

function plateColors(): PlateColors {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    paper: v("--plate-paper", "#ece5d3"),
    ink: v("--plate-ink", "#1e1c1b"),
    line: v("--plate-line", "#2b3f78"),
    accent: v("--library-accent", "#ff5a88"),
  };
}

/** Levhayı çizer ve akılda tutar; tuval çizilemiyorsa boş adres. */
function renderPlate(
  atlas: StarAtlas,
  artist: LibraryArtist,
): { url: string; coordinates: string } {
  const key = `${artist.name}\u0000${artist.albumCount}`;
  const ready = plates.get(key);
  if (ready) return ready;
  const field = plateField(atlas, artist.name, artist.albumCount);
  const canvas = document.createElement("canvas");
  canvas.width = PLATE_SIZE;
  canvas.height = PLATE_SIZE;
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-figures");
  const drawn = drawArtistPlate(
    canvas,
    field,
    artist.albumCount,
    plateColors(),
    mono || "monospace",
  );
  const plate = {
    url: drawn ? canvas.toDataURL("image/jpeg", 0.88) : "",
    coordinates: plateCoordinates(field),
  };
  plates.set(key, plate);
  if (plates.size > CACHE_LIMIT) {
    const oldest = plates.keys().next().value;
    if (oldest !== undefined) plates.delete(oldest);
  }
  return plate;
}

/**
 * Çizim sırası: levhalar karede bir tane çizilir (her biri birkaç ms); atlas yüklenince ya da hızlı
 * kaydırmada görünen bütün levhalar aynı anda çizilip arayüzü takıltmasın.
 */
const queue: (() => void)[] = [];
let pumping = false;
function nextFrame(run: () => void) {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else setTimeout(run, 0);
}
function schedule(job: () => void) {
  queue.push(job);
  if (pumping) return;
  pumping = true;
  const pump = () => {
    queue.shift()?.();
    if (queue.length > 0) nextFrame(pump);
    else pumping = false;
  };
  nextFrame(pump);
}

/** Testler arasında temizler. */
export function clearArtistPlates() {
  plates.clear();
}

/** Sanatçının yıldız atlası levhası (ızgarada ve sanatçı sayfasında aynı çizim ve önbellek). */
export function ArtistPlate({
  artist,
  className = "artist__plate",
}: {
  artist: LibraryArtist;
  className?: string;
}) {
  const [plate, setPlate] = useState<{ url: string; coordinates: string } | null>(
    () => plates.get(`${artist.name}\u0000${artist.albumCount}`) ?? null,
  );
  const ref = useRef<HTMLDivElement>(null);

  // Levha ekrana yaklaşınca çizilir.
  useEffect(() => {
    if (plate) return;
    const element = ref.current;
    if (!element) return;
    let cancelled = false;
    const draw = () => {
      void loadAtlas().then((atlas) => {
        if (cancelled) return;
        schedule(() => {
          if (!cancelled) setPlate(renderPlate(atlas, artist));
        });
      });
    };
    if (typeof IntersectionObserver === "undefined") {
      draw();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          draw();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [plate, artist]);

  return (
    <div ref={ref} className={className}>
      {plate?.url && <img src={plate.url} alt="" draggable={false} />}
      {plate && <span className="artist__coordinates">{plate.coordinates}</span>}
    </div>
  );
}

export interface ArtistGridProps {
  artists: LibraryArtist[];
  /** Çalan şarkı (sanatçısı vurgulanır); kütüphanede değilse `null`. */
  current: LibraryTrack | null;
  /** Karta tıklayınca sanatçı sayfası açılır. */
  onOpen: (artist: LibraryArtist) => void;
  /** Levhanın üstündeki çal düğmesi sanatçının bütün şarkılarını hemen baştan çalar. */
  onPlay: (artist: LibraryArtist) => void;
}

/**
 * Sanatçılar: her sanatçı için basılı bir yıldız atlası levhası. Karta tıklamak sanatçı sayfasını
 * açar; levhanın üstündeki çal düğmesi bütün şarkılarını hemen baştan çalar.
 */
export function ArtistGrid({ artists, current, onOpen, onPlay }: ArtistGridProps) {
  const id = useId();
  const playingArtist = current ? (current.albumArtist ?? current.artist) : null;
  return (
    <ul className="artists" aria-label="Sanatçılar">
      {artists.map((artist, index) => (
        <li key={artist.name} className="artist">
          <button
            type="button"
            className={`artist__button${artist.name === playingArtist ? " is-current" : ""}`}
            onClick={() => onOpen(artist)}
            title={`Sanatçıyı aç: ${artist.name}`}
            data-artist={artist.name}
          >
            {/* Albüm sayısı değişince (tarama) levha yeniden çizilir: halka sayısı ona bağlı. */}
            <ArtistPlate key={artist.albumCount} artist={artist} />
            <span className="artist__name" id={`${id}-${index}`}>
              {artist.name}
            </span>
            <span className="album__meta">
              {NUMBER.format(artist.albumCount)} albüm · {NUMBER.format(artist.trackCount)} şarkı
            </span>
          </button>
          {/* Ayrı düğme (düğme içinde düğme olmaz); adı kısa, sanatçı adı açıklamada. */}
          <button
            type="button"
            className="album__play"
            onClick={() => onPlay(artist)}
            aria-label="Baştan çal"
            aria-describedby={`${id}-${index}`}
            title={`Sanatçının bütün şarkılarını baştan çal: ${artist.name}`}
          >
            <PlayIcon />
          </button>
        </li>
      ))}
    </ul>
  );
}
