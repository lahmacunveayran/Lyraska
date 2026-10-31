import type { CSSProperties } from "react";
import type { Lyrics } from "../lib/backend";
import { lyricFrame } from "../lib/lyrics";

/**
 * Kinetik şarkı sözleri: söylenen satır sahnenin üstünde büyük harflerle, kelime kelime belirir;
 * söylenen kelime hafifçe yükselip yerine oturur, sıradaki satır küçük ve soluk. Parlaklık
 * değişmez (yalnızca yazının saydamlığı yumuşakça); "animasyonları azalt" açıksa hareket yoktur
 * (CSS). `positionSecs`: karenin ekrana çıkacağı anda duyulan söz zamanı (`lyricTime`: ses aygıtı
 * gecikmesi telafi edilmiş). Saydamlık her karede zamandan hesaplanır; varsayılan modda CSS geçişi yoktur
 * (geçiş her karede yeniden başlayıp sözü ~0,1 sn geride bırakırdı). Epilepsi güvenli modunda
 * (`safe`) saydamlık eskisi gibi yumuşak geçişle değişir (güvenli modun davranışı değişmez).
 * `notice`: söz kaydırma kısayolunun kısa notu (sözlerin üstünde küçük; ekran okuyucu da duyurur).
 * Otomatik zamanlamada emin olunamayan satır soluk görünür ve yanında küçük "tahmini" yazar.
 */
export function LyricsOverlay({
  lyrics,
  positionSecs,
  safe = false,
  notice = null,
}: {
  lyrics: Lyrics | null;
  positionSecs: number;
  safe?: boolean;
  notice?: string | null;
}) {
  const frame = lyricFrame(lyrics, positionSecs);
  const note = notice && (
    <p className="lyrics-notice" role="status">
      {notice}
    </p>
  );
  if (!frame.line && !frame.next) return note || null;
  return (
    <>
      {note}
      <div className={safe ? "lyrics is-safe" : "lyrics"} aria-hidden>
        {frame.line && (
          <p
            className={frame.line.uncertain ? "lyrics__line is-uncertain" : "lyrics__line"}
            style={{ opacity: frame.opacity }}
          >
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
            {frame.line.uncertain && <span className="lyrics__tag">tahmini</span>}
          </p>
        )}
        {frame.line?.translation && (
          <p className="lyrics__translation" style={{ opacity: frame.opacity }}>
            {frame.line.translation}
          </p>
        )}
        {frame.next && <p className="lyrics__next">{frame.next.text}</p>}
      </div>
    </>
  );
}
