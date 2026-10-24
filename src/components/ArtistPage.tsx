import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { PlayIcon, ShuffleIcon } from "./icons";
import { AlbumArt, albumKey, albumLength, isAlbumOf } from "./AlbumGrid";
import { albumRows, REPEAT_PLAY_MS } from "./AlbumPage";
import { ArtistPlate } from "./ArtistGrid";
import { TrackTable } from "./TrackTable";
import {
  errorMessage,
  libraryArtistTracks,
  type LibraryAlbum,
  type LibraryArtist,
  type LibraryTrack,
} from "../lib/backend";
import { albumCoverRequest } from "../lib/albumCovers";
import type { PlayOrder } from "../hooks/usePlayback";

const NUMBER = new Intl.NumberFormat("tr-TR");

/**
 * Sanatçının albümleri, kütüphanenin şarkılarından (çekirdeğin albüm listesiyle aynı kural):
 * albüm sanatçısıyla (yoksa sanatçıyla) gruplanır; sıra, kapak, ton ve tempo albümün ilk
 * şarkısından (şarkılar çekirdekten albüm sırasıyla gelir). Böylece kapaklar ızgarayla aynı
 * önbelleği paylaşır ve albüm listesi ayrıca sorulmaz.
 */
export function artistAlbums(tracks: readonly LibraryTrack[], artist: string): LibraryAlbum[] {
  const albums = new Map<string, LibraryAlbum>();
  for (const track of tracks) {
    if (!track.album || (track.albumArtist ?? track.artist) !== artist) continue;
    const album = albums.get(track.album);
    if (album) {
      album.trackCount += 1;
      album.durationSecs += track.durationSecs ?? 0;
      continue;
    }
    albums.set(track.album, {
      name: track.album,
      artist,
      trackCount: 1,
      durationSecs: track.durationSecs ?? 0,
      coverPath: track.path,
      bpm: track.bpm,
      key: track.key,
    });
  }
  return [...albums.values()];
}

export interface ArtistPageProps {
  artist: LibraryArtist;
  /** Sanatçının albümleri (`artistAlbums`). */
  albums: LibraryAlbum[];
  /** Kütüphanenin şarkıları: sanatçının yollarını satırlara çevirmek için. */
  tracks: LibraryTrack[];
  /** Değişince (tarama, analiz) sanatçının şarkıları yeniden sorulur. */
  refreshKey: unknown;
  /** Çalan şarkı, aramadan bağımsız listeden (albümü vurgulanır); kütüphanede değilse `null`. */
  current: LibraryTrack | null;
  currentPath: string | null;
  playing: boolean;
  /** DJ görünümü: ton Camelot koduyla. */
  camelot: boolean;
  onBack: () => void;
  /** Albüm kapağına tıklayınca albüm sayfası açılır (geri dönünce bu sayfaya gelinir). */
  onOpenAlbum: (album: LibraryAlbum) => void;
  /**
   * Sanatçının bütün şarkılarını çalar (albüm albüm); `start` verilirse o şarkıdan başlar.
   * `order`: "Çal" sırayla, "Karışık çal" karışık; şarkıya çift tıklayınca (verilmez) Karışık çal
   * düğmesinin durumu geçerlidir.
   */
  onPlay: (paths: string[], start?: string, order?: PlayOrder) => void;
  /** "Listeye ekle" menüsü (sanatçının bütün şarkıları için). */
  addToPlaylist?: (paths: string[]) => ReactNode;
  /** Şarkının dosyasını dosya gezgininde gösterir. */
  onReveal?: (path: string) => void;
}

/**
 * Sanatçı sayfası (kütüphane sayfasının içinde): büyük yıldız atlası levhası, ad, özet, "Çal" ve
 * "Karışık çal", albüm kapakları, albüm albüm bütün şarkılar. Açılınca odak başlığa gelir; Esc ve
 * "← Sanatçılar" ızgaraya döndürür (Esc'i kütüphane paneli yönetir: önce arama, sonra açık albüm
 * sayfası, sonra bu sayfa, en son kütüphane).
 */
export function ArtistPage({
  artist,
  albums,
  tracks,
  refreshKey,
  current,
  currentPath,
  playing,
  camelot,
  onBack,
  onOpenAlbum,
  onPlay,
  addToPlaylist,
  onReveal,
}: ArtistPageProps) {
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [loaded, setLoaded] = useState<{ name: string; paths: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // Açılınca odak başlığa: ekran okuyucu sayfanın adını okur, Tab sayfanın düğmelerine gider.
  useEffect(() => {
    headingRef.current?.focus();
  }, [artist.name]);

  useEffect(() => {
    const mine = ++seq.current;
    libraryArtistTracks(artist.name)
      .then((paths) => {
        if (mine !== seq.current) return;
        setLoaded({ name: artist.name, paths });
        setError(paths.length > 0 ? null : `“${artist.name}” için şarkı bulunamadı.`);
      })
      .catch((e) => {
        if (mine === seq.current) setError(errorMessage(e));
      });
  }, [artist.name, refreshKey]);

  const paths = loaded?.name === artist.name ? loaded.paths : null;
  // Satırlar yalnızca yollar ya da kütüphane değişince kurulur (her durum sorgusunda değil).
  const rows = useMemo(() => (paths ? albumRows(paths, tracks) : []), [paths, tracks]);
  const total = useMemo(
    () => rows.reduce((sum, track) => sum + (track.durationSecs ?? 0), 0),
    [rows],
  );

  // Son çalma isteğinin zamanı: üst üste gelen istek sanatçıyı ikinci kez başlatmaz.
  const lastPlay = useRef(-Infinity);
  const play = (time: number, start?: string, order?: PlayOrder) => {
    if (!paths || paths.length === 0) return;
    if (time - lastPlay.current < REPEAT_PLAY_MS) return;
    lastPlay.current = time;
    onPlay(paths, start, order);
  };
  // Satırların çalma işlevi kimliğini korur (liste `memo` ile yeniden çizilmez); en son `play`.
  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  });
  const playRow = useCallback((time: number, path: string) => playRef.current(time, path), []);

  return (
    <div className="album-page artist-page" aria-labelledby={`${id}-title`} role="region">
      <button
        type="button"
        className="album-page__back"
        onClick={onBack}
        aria-label="Sanatçılara dön"
        title="Sanatçılara dön (Esc)"
      >
        ← Sanatçılar
      </button>
      <div className="album-page__hero">
        <ArtistPlate
          key={artist.albumCount}
          artist={artist}
          className="artist__plate artist-page__plate"
        />
        <div className="album-page__info">
          <span className="album-page__eyebrow">Sanatçı</span>
          <h3 className="album-page__title" id={`${id}-title`} ref={headingRef} tabIndex={-1}>
            {artist.name}
          </h3>
          <p className="album-page__meta">
            {[
              `${NUMBER.format(artist.albumCount)} albüm`,
              `${NUMBER.format(artist.trackCount)} şarkı`,
              total > 0 ? albumLength(total) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="album-page__actions">
            <button
              type="button"
              className="hw-button hw-button--primary album-page__play"
              onClick={(event) => play(event.timeStamp, undefined, "ordered")}
              disabled={!paths || paths.length === 0}
              aria-label="Sanatçıyı çal"
              title="Sanatçının bütün şarkılarını baştan çal"
            >
              <PlayIcon />
              <span>Çal</span>
            </button>
            <button
              type="button"
              className="hw-button hw-button--small album-page__shuffle"
              onClick={(event) => play(event.timeStamp, undefined, "shuffled")}
              disabled={!paths || paths.length === 0}
              aria-label="Sanatçıyı karışık çal"
              title="Sanatçının bütün şarkılarını karışık sırayla çal"
            >
              <ShuffleIcon />
              <span>Karışık çal</span>
            </button>
            {addToPlaylist?.(paths ?? [])}
          </div>
        </div>
      </div>
      {error && (
        <p className="library__problem" role="alert">
          {error}
        </p>
      )}
      {albums.length > 0 && (
        <section className="artist-page__section" aria-labelledby={`${id}-albums`}>
          <h4 className="artist-page__heading" id={`${id}-albums`}>
            Albümler
          </h4>
          <ul className="artist-page__albums">
            {albums.map((album) => (
              <li key={albumKey(album)}>
                <button
                  type="button"
                  className={`album__button artist-page__album${current && isAlbumOf(current, album) ? " is-current" : ""}`}
                  onClick={() => onOpenAlbum(album)}
                  title={`Albümü aç: ${album.name}`}
                  data-album={albumKey(album)}
                >
                  <AlbumArt request={albumCoverRequest(album)} />
                  <span className="album__name">{album.name}</span>
                  <span className="album__meta">
                    {NUMBER.format(album.trackCount)} şarkı
                    {album.durationSecs > 0 ? ` · ${albumLength(album.durationSecs)}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {rows.length > 0 && (
        <section className="artist-page__section" aria-labelledby={`${id}-songs`}>
          <h4 className="artist-page__heading" id={`${id}-songs`}>
            Şarkılar
          </h4>
          <TrackTable
            onReveal={onReveal}
            rows={rows}
            currentPath={currentPath}
            playing={playing}
            camelot={camelot}
            label="Sanatçının şarkıları"
            showAlbum
            numbering="position"
            onPlay={playRow}
          />
        </section>
      )}
    </div>
  );
}
