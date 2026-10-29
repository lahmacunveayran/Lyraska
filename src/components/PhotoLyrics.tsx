import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Lyrics } from "../lib/backend";
import { lyricFit, lyricFrame, lyricPan, photoLyricWords } from "../lib/lyrics";

/**
 * "Kendi resmin" sahnesinde şarkı sözleri: başlık bloğunda, sanatçı adının altında tek satır. İnce,
 * okunur yazı (büyük harfe çevrilmez: Türkçe harfler olduğu gibi kalır). Söylenen kelime çubuk
 * renginden hafifçe ışıldar (`--photo-glow`, `PhotoScene` yazar), söylenenler okunur kalır,
 * sıradakiler soluk; satır değişimi yalnızca saydamlıkla. Epilepsi güvenli modunda ışıltı yoktur
 * (kelimeler yalnızca yavaş saydamlıkla ayrılır); "animasyonları azalt" açıkken geçiş yoktur (CSS).
 *
 * Uzun satır kesilmez: önce küçülür, o da yetmezse söylendikçe kelime kelime sola kayar
 * (`lyricFit`, `lyricPan`): sözün sonu hiçbir zaman kaybolmaz, söylenen kelime hep görünür.
 * `positionSecs` genel söz katmanıyla aynı zamandır (ses aygıtının gecikmesi düşülmüş).
 */
export function PhotoLyrics({
  lyrics,
  positionSecs,
  safe,
}: {
  lyrics: Lyrics | null;
  positionSecs: number;
  safe: boolean;
}) {
  const frame = lyricFrame(lyrics, positionSecs);
  const words = photoLyricWords(frame, safe);
  const text = frame.line?.text ?? "";
  const boxRef = useRef<HTMLParagraphElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState({ scale: 1, overflow: 0 });

  // Satır ya da yer değişince ölçülür: yazı boyu ölçekle orantılı, tam boydaki genişlik buradan.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const update = () => {
      const scale = parseFloat(inner.style.getPropertyValue("--lyric-scale")) || 1;
      const natural = inner.offsetWidth / scale;
      const next = lyricFit(natural, box.clientWidth);
      setFit((old) =>
        Math.abs(old.scale - next.scale) < 0.002 && Math.abs(old.overflow - next.overflow) < 0.5
          ? old
          : next,
      );
    };
    update();
    // Yazı tipi geç yüklenirse genişlik değişir.
    void document.fonts?.ready.then(update);
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text]);

  const pan = lyricPan(words, fit.overflow);
  return (
    <p
      className={`photo-lyrics${safe ? " is-safe" : ""}${fit.overflow > 0 ? " is-panning" : ""}`}
      ref={boxRef}
      style={{ opacity: frame.line ? frame.opacity : 0 }}
    >
      {/* Yeni satır yeni öğe: önceki uzun satırın kayması yeni satırda geri kaymaz. */}
      <span
        key={frame.line?.start ?? -1}
        className="photo-lyrics__line"
        ref={innerRef}
        style={
          {
            "--lyric-scale": fit.scale,
            transform: pan > 0 ? `translateX(${-pan}px)` : undefined,
          } as CSSProperties
        }
      >
        {words.map((word, i) => (
          <span
            key={i}
            className={`photo-lyrics__word is-${word.state}${word.glow ? " is-glow" : ""}`}
          >
            {word.text}
          </span>
        ))}
      </span>
    </p>
  );
}
