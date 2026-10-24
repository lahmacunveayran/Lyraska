import { memo, useId, useState, type KeyboardEvent } from "react";
import { CloseIcon, PauseIcon, PlayIcon } from "./icons";
import type { LibraryTrack } from "../lib/backend";
import { bpmLabel } from "../lib/analysis";
import { keyHue, keyText } from "../lib/librarySort";
import { formatTime } from "../lib/format";

export interface TrackTableProps {
  rows: LibraryTrack[];
  currentPath: string | null;
  playing: boolean;
  /** DJ görünümü: ton Camelot koduyla. */
  camelot: boolean;
  /** Listenin ekran okuyucudaki adı ("Albümün şarkıları"). */
  label: string;
  /** Albüm sütunu (sanatçı sayfasında şarkılar albüm albüm sıralı). */
  showAlbum?: boolean;
  /** Sanatçı sütunu (çalma listesinde şarkılar farklı sanatçılardan). */
  showArtist?: boolean;
  /** Sıra sütunu: albümün parça numarası ("track") ya da listedeki sıra ("position"). */
  numbering?: "track" | "position";
  /**
   * Şarkıyı çalar (çift tık, Enter); `time` üst üste gelen isteği ayıklamak için, `index` satırın
   * sırası (aynı şarkı listede iki kez olabilir).
   */
  onPlay: (time: number, path: string, index: number) => void;
  /**
   * Çalma listesinde: satırı çıkarır (satırdaki × ya da Delete). Verilirse satırlar Alt+↑/↓ ile
   * `onMove` üzerinden taşınır. Aynı şarkı listede iki kez olabilir: satır sırasıyla bilinir.
   */
  onRemove?: (index: number) => void;
  onMove?: (from: number, to: number) => void;
}

/**
 * Albüm ve sanatçı sayfasının şarkı listesi: tıklama seçer, çift tık ve Enter seçili şarkıdan
 * çalar, ok tuşları / Home / End seçimi taşır ve satırı görünür alana getirir. Değişmeyen
 * özelliklerle yeniden çizilmez (`memo`): oynatıcının durum sorgusu uzun listeyi baştan kurmaz.
 */
export const TrackTable = memo(function TrackTable({
  rows,
  currentPath,
  playing,
  camelot,
  label,
  showAlbum = false,
  numbering = "track",
  showArtist = false,
  onPlay,
  onRemove,
  onMove,
}: TrackTableProps) {
  const id = useId();
  const [selected, setSelected] = useState(-1);
  const rowId = (index: number) => `${id}-row-${index}`;
  const rowClass = `album-page__row${showAlbum || showArtist ? " album-page__row--album" : ""}${onRemove ? " album-page__row--edit" : ""}`;

  /** Satırı seçer ve görünür alana getirir (uzun listede ok tuşları listeyi kaydırır). */
  const selectRow = (index: number) => {
    setSelected(index);
    document.getElementById(rowId(index))?.scrollIntoView?.({ block: "nearest" });
  };

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || rows.length === 0) return;
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    if (event.key in moves && event.altKey && onMove) {
      event.preventDefault();
      if (selected < 0) return;
      const to = selected + moves[event.key]!;
      if (to < 0 || to >= rows.length) return;
      onMove(selected, to);
      selectRow(to);
    } else if (event.key in moves) {
      event.preventDefault();
      const from = selected < 0 ? -1 : selected;
      selectRow(Math.max(0, Math.min(rows.length - 1, from + moves[event.key]!)));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      selectRow(event.key === "Home" ? 0 : rows.length - 1);
    } else if (event.key === "Delete" && onRemove) {
      if (selected < 0 || !rows[selected]) return;
      event.preventDefault();
      onRemove(selected);
      // Seçim yerinde kalır (bir sonraki şarkıya geçer); son satır çıktıysa bir yukarı.
      setSelected(Math.min(selected, rows.length - 2));
    } else if (event.key === "Enter") {
      const track = rows[selected];
      if (!track) return;
      event.preventDefault();
      onPlay(event.timeStamp, track.path, selected);
    }
  };

  if (rows.length === 0) return null;
  return (
    <div className="album-page__table" role="grid" aria-rowcount={rows.length}>
      <div className={`${rowClass} library__row--head`} role="row">
        <span role="columnheader" className="library__no">
          #
        </span>
        <span role="columnheader">Başlık</span>
        {showAlbum && <span role="columnheader">Albüm</span>}
        {showArtist && <span role="columnheader">Sanatçı</span>}
        <span role="columnheader" className="library__time library__bpm">
          BPM
        </span>
        <span role="columnheader" className="library__key">
          Ton
        </span>
        <span role="columnheader" className="library__time">
          Süre
        </span>
        {onRemove && <span role="columnheader" aria-label="Çıkar" />}
      </div>
      <div
        className="album-page__list"
        tabIndex={0}
        onKeyDown={onListKey}
        aria-label={label}
        aria-activedescendant={selected >= 0 && rows[selected] ? rowId(selected) : undefined}
      >
        {rows.map((track, index) => {
          const isCurrent = track.path === currentPath;
          const hue = keyHue(track.key);
          return (
            <div
              key={`${index}\u0000${track.path}`}
              id={rowId(index)}
              role="row"
              aria-rowindex={index + 1}
              aria-selected={index === selected}
              className={`${rowClass}${isCurrent ? " is-current" : ""}${index === selected ? " is-selected" : ""}`}
              onClick={() => setSelected(index)}
              onDoubleClick={(event) => onPlay(event.timeStamp, track.path, index)}
              title={track.path}
            >
              <span className="library__no" role="gridcell">
                {isCurrent ? (
                  playing ? (
                    <PlayIcon />
                  ) : (
                    <PauseIcon />
                  )
                ) : (
                  ((numbering === "track" ? track.trackNumber : null) ?? index + 1)
                )}
              </span>
              <span className="library__cell library__title-cell" role="gridcell">
                {track.title}
              </span>
              {showAlbum && (
                <span className="library__cell library__muted" role="gridcell">
                  {track.album ?? "—"}
                </span>
              )}
              {showArtist && (
                <span className="library__cell library__muted" role="gridcell">
                  {track.artist ?? "—"}
                </span>
              )}
              <span className="library__time library__bpm" role="gridcell">
                {bpmLabel(track)}
              </span>
              <span className="library__key" role="gridcell">
                {hue !== null && (
                  <i
                    className="library__key-dot"
                    style={{ background: `var(--key-${hue})` }}
                    aria-hidden
                  />
                )}
                {keyText(track, camelot)}
              </span>
              <span className="library__time" role="gridcell">
                {track.durationSecs ? formatTime(track.durationSecs) : ""}
              </span>
              {onRemove && (
                <span role="gridcell">
                  <button
                    type="button"
                    className="library__remove"
                    onDoubleClick={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(index);
                    }}
                    aria-label={`Listeden çıkar: ${track.title}`}
                    title="Listeden çıkar (dosya silinmez)"
                  >
                    <CloseIcon />
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
