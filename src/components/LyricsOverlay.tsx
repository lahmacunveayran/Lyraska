import { useMemo, useRef, type CSSProperties } from "react";
import type { LyricLine, Lyrics } from "../lib/backend";
import {
  graphemes,
  heldGlyph,
  heldStrength,
  lineMotion,
  lineShownAt,
  meteorLines,
  meteorState,
  type LyricEffect,
} from "../lib/lyricMotion";
import { lyricFrame, type WordFrame } from "../lib/lyrics";
import { usePrefersReducedMotion } from "../lib/usePrefersReducedMotion";
import { LyricSky } from "./LyricSky";

/** Meteorun yolu (piksel) ve açısı (yataydan aşağı, derece): Vega'nın yönünden (sağ üst) gelir. */
const METEOR_PATH = 560;
const METEOR_ANGLE = 8;

/**
 * Kinetik şarkı sözleri: söylenen satır sahnenin üstünde büyük harflerle, kelime kelime belirir.
 * Söylenen kelimenin içinden ışık cephesi geçer (Vega'nın mavimsi beyazı; söylenen yer tam yanar),
 * kelime hafifçe yükselip yerine oturur, uzun hecede harfler sırayla dalgalanır. Satır yayla yerine
 * oturur, önceki satır yukarı kayıp söner; satırın altındaki lir teli her kelimede çekilir
 * (`LyricSky`, `lib/lyricMotion`). Hepsi söz zamanının saf işlevidir; varsayılan modda CSS geçişi yoktur
 * (geçiş her karede yeniden başlayıp sözü ~0,1 sn geride bırakırdı). `positionSecs`: karenin ekrana
 * çıkacağı anda duyulan söz zamanı (`lyricTime`: ses aygıtı gecikmesi telafi edilmiş).
 *
 * Epilepsi güvenli modunda (`safe`) görünüm eskisi gibidir: saydamlık yumuşak geçişle değişir, ışık
 * cephesi, tel, yıldız ve meteor yoktur (güvenli modun davranışı değişmez). "Animasyonları azalt"
 * açıksa hareket yoktur (yay, tel, yıldız, meteor, yükselme); kelimeler yine ışıkla dolar.
 * `notice`: söz kaydırma kısayolunun kısa notu (sözlerin üstünde küçük; ekran okuyucu da duyurur).
 * Otomatik zamanlamada emin olunamayan satır soluk görünür ve yanında küçük "tahmini" yazar.
 */
export function LyricsOverlay({
  lyrics,
  positionSecs,
  safe = false,
  notice = null,
  effect = "constellation",
}: {
  lyrics: Lyrics | null;
  positionSecs: number;
  safe?: boolean;
  notice?: string | null;
  effect?: LyricEffect;
}) {
  const reduced = usePrefersReducedMotion();
  const lineRef = useRef<HTMLParagraphElement | null>(null);
  const meteors = useMemo(() => meteorLines(lyrics?.lines ?? []), [lyrics]);
  const frame = lyricFrame(lyrics, positionSecs);
  const note = notice && (
    <p className="lyrics-notice" role="status">
      {notice}
    </p>
  );
  if (!frame.line && !frame.next) return note || null;
  const lit = !safe;
  const motion = lit && !reduced;
  const lines = lyrics?.lines ?? [];
  const move = motion && frame.line ? lineMotion(lines, frame.line, positionSecs) : null;
  const index = frame.line ? lines.indexOf(frame.line) : -1;
  const meteor =
    motion && effect !== "plain" && index >= 0 && meteors.has(index)
      ? meteorState(positionSecs - lineShownAt(lines, index))
      : null;
  const uncertain = !!frame.line?.uncertain;
  return (
    <>
      {note}
      <div className={`lyrics${safe ? " is-safe" : " is-lit"}`} aria-hidden>
        {frame.line && (
          <div
            className="lyrics__stack"
            style={move ? { transform: `translateY(${move.y}em) scale(${move.scale})` } : undefined}
          >
            {lit && (
              <p className="lyrics__shade" style={{ opacity: frame.opacity }}>
                <Words line={frame.line} words={frame.words} motion={motion} shade />
              </p>
            )}
            <p
              ref={lineRef}
              className={uncertain ? "lyrics__line is-uncertain" : "lyrics__line"}
              style={{ opacity: frame.opacity }}
            >
              <Words line={frame.line} words={frame.words} motion={motion} shade={false} />
            </p>
            {/* Satırdan sonra: satırın ref'i bağlanmış olur, tel ilk karede çizilir (CSS'te arkada). */}
            {motion && effect !== "plain" && (
              <LyricSky
                lineRef={lineRef}
                line={frame.line}
                words={frame.words}
                t={positionSecs}
                opacity={frame.opacity}
                stars={effect === "constellation"}
                dim={uncertain}
              />
            )}
          </div>
        )}
        {move?.ghost && (
          <p
            className="lyrics__ghost"
            style={{ transform: `translateY(${move.ghost.y}em)`, opacity: move.ghost.opacity }}
          >
            {move.ghost.line.text}
          </p>
        )}
        {/* Satırın dışında: satırın metni sözün metnine eşit kalır (zamanlama denetimi). */}
        {uncertain && (
          <p className="lyrics__note" style={{ opacity: frame.opacity }}>
            <span className="lyrics__tag">tahmini</span>
          </p>
        )}
        {meteor && (
          <span
            className="lyrics__meteor"
            style={{
              opacity: meteor.opacity,
              transform:
                `translate(${-meteor.travel * METEOR_PATH * Math.cos((METEOR_ANGLE * Math.PI) / 180)}px, ` +
                `${meteor.travel * METEOR_PATH * Math.sin((METEOR_ANGLE * Math.PI) / 180)}px) ` +
                `rotate(${-METEOR_ANGLE}deg)`,
            }}
          />
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

/**
 * Satırın kelimeleri. `shade`: yazının altındaki gölge ve hale katmanı (aynı dizilişte, yazısı
 * görünmez; söylenen kelimenin halesi yalnızca onda). Uzun hecede söylenen kelime harflerine bölünür.
 */
function Words({
  line,
  words,
  motion,
  shade,
}: {
  line: LyricLine;
  words: WordFrame[];
  motion: boolean;
  shade: boolean;
}) {
  const base = shade ? "lyrics__halo" : "lyrics__word";
  return (
    <>
      {words.length > 0
        ? words.map((word, i) => {
            const timing = line.words[i];
            const strength =
              motion && word.state === "current" && timing
                ? heldStrength(timing.end - timing.start)
                : 0;
            const style = { "--p": word.progress } as CSSProperties;
            if (strength <= 0)
              return (
                <span key={i} className={`${base} is-${word.state}`} style={style}>
                  {word.text}
                </span>
              );
            const glyphs = graphemes(word.text);
            return (
              <span key={i} className={`${base} is-${word.state}`} style={style} data-held="">
                {glyphs.map((glyph, k) => {
                  const g = heldGlyph(k, glyphs.length, word.progress, strength);
                  return (
                    <span
                      key={k}
                      className="lyrics__glyph"
                      style={
                        {
                          "--q": g.progress,
                          transform: `translateY(${g.lift}em)`,
                        } as CSSProperties
                      }
                    >
                      {glyph}
                    </span>
                  );
                })}
              </span>
            );
          })
        : line.text}
    </>
  );
}
