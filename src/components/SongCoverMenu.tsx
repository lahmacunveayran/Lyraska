import { useContext, useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { ImageIcon } from "./icons";
import { SongCoverContext } from "./songCoverContext";
import type { LibraryTrack } from "../lib/backend";

/** Satırın kapak menüsü; kütüphane paneli işlemleri vermediyse hiçbir şey. */
export function SongCoverSlot({ track }: { track: LibraryTrack }) {
  const actions = useContext(SongCoverContext);
  if (!actions) return null;
  return (
    <SongCoverMenu
      title={track.title}
      custom={track.customCover === true}
      onChoose={() => actions.choose(track.path)}
      onClear={() => actions.clear(track.path)}
    />
  );
}

/**
 * Şarkı satırındaki kapak menüsü: şarkıya kapak seçer ya da seçileni kaldırır (kaldırınca şarkının
 * kendi resmi, o da yoksa albümünki görünür). Satırın üstüne gelince ya da satır seçiliyken
 * görünür; tıklama satırı seçmez, çift tık çalmaz. Seçenekler sayfanın en üstünde, düğmenin altında
 * açılır (satırın hücresi ve kayan liste kırpmasın); dışarı tıklama, kaydırma ve Esc kapatır.
 */
export function SongCoverMenu({
  title,
  custom,
  onChoose,
  onClear,
}: {
  /** Şarkının adı (ekran okuyucu için). */
  title: string;
  /** Kullanıcı bu şarkıya kapak seçmiş mi ("kaldır" yalnızca o zaman). */
  custom: boolean;
  onChoose: () => void;
  onClear: () => void;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Açıkken menünün yeri (pencereye göre); kapalıyken `null` ve seçenekler hiç kurulmaz.
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!at) return;
    list.current?.querySelector("button")?.focus();
    const close = (event: Event) => {
      if (event.target instanceof Node && list.current?.contains(event.target)) return;
      if (event.type === "pointerdown" && event.target === button.current) return;
      setAt(null);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [at]);

  const toggle = () => {
    if (at) return setAt(null);
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    setAt({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  };
  const pick = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    event.stopPropagation();
    setAt(null);
    // Seçenek kaybolunca odak sayfanın başına düşmesin: düğmeye döner.
    button.current?.focus();
    action();
  };
  const stop = (event: MouseEvent) => event.stopPropagation();

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`library__reveal${at ? " is-open" : ""}`}
        aria-label={`Şarkının kapağı: ${title}`}
        aria-expanded={at !== null}
        aria-controls={at ? id : undefined}
        title="Şarkının kapağını değiştir"
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        onDoubleClick={stop}
      >
        <ImageIcon />
      </button>
      {at &&
        createPortal(
          <div
            ref={list}
            id={id}
            role="group"
            aria-label={`Şarkının kapağı: ${title}`}
            className="album__menu-list library__cover-list"
            style={{ top: at.top, right: at.right }}
            onClick={stop}
            onDoubleClick={stop}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setAt(null);
                button.current?.focus();
              }
            }}
          >
            <button type="button" onClick={(e) => pick(e, onChoose)}>
              Kapak seç…
            </button>
            {custom && (
              <button type="button" onClick={(e) => pick(e, onClear)}>
                Seçtiğim kapağı kaldır
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
