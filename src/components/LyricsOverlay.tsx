import type { CSSProperties } from "react";
import type { Lyrics } from "../lib/backend";
import { lyricFrame } from "../lib/lyrics";

/**
 * Kinetik şarkı sözleri: söylenen satır sahnenin üstünde büyük harflerle, kelime kelime belirir;
 * söylenen kelime hafifçe yükselip yerine oturur, sıradaki satır küçük ve soluk. Parlaklık
 * değişmez (yalnızca yazının saydamlığı yumuşakça); "animasyonları azalt" açıksa hareket yoktur
 * (CSS). `positionSecs` görsellerle aynı zamandır (ses aygıtının gecikmesi düşülmüş).
 */
export function LyricsOverlay({
  lyrics,
  positionSecs,
}: {
  lyrics: Lyrics | null;
  positionSecs: number;
}) {
  const frame = lyricFrame(lyrics, positionSecs);
  if (!frame.line && !frame.next) return null;
  return (
    <div className="lyrics" aria-hidden>
      {frame.line && (
        <p className="lyrics__line" style={{ opacity: frame.opacity }}>
          {frame.words.length > 0
            ? frame.words.map((word, i) => (
                <span
                  key={i}
                  className={`lyrics__word is-${word.state}`}
                  style={{ "--p": word.progress } as CSSProperties}
                >
                  {word.text}
                </span>
              ))
            : frame.line.text}
        </p>
      )}
      {frame.line?.translation && (
        <p className="lyrics__translation" style={{ opacity: frame.opacity }}>
          {frame.line.translation}
        </p>
      )}
      {frame.next && <p className="lyrics__next">{frame.next.text}</p>}
    </div>
  );
}
