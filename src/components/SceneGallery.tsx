import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { GALLERY_SCENES, sceneKey, type Scene } from "../lib/scene";

export interface SceneGalleryProps {
  scene: Scene;
  onChoose: (scene: Scene) => void;
}

/**
 * Üst çubuktaki "Galeri" düğmesi ve açılan sahne listesi. Galeriden bir sahne seçiliyse düğme
 * onun adını gösterir. Liste dışarı tıklayınca, Esc'ye basınca ya da seçim yapılınca kapanır.
 */
export function SceneGallery({ scene, onChoose }: SceneGalleryProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const active = GALLERY_SCENES.find((s) => s.id === scene) ?? null;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // Açılınca seçili (yoksa ilk) sahneye odaklan: klavyeyle hemen gezilebilsin.
  useEffect(() => {
    if (!open) return;
    // Seçici listesi belge sırasındaki ilk eşleşmeyi verir; seçili olan ayrıca aranır.
    const item =
      root.current?.querySelector<HTMLButtonElement>('.scene-gallery__item[aria-pressed="true"]') ??
      root.current?.querySelector<HTMLButtonElement>(".scene-gallery__item");
    item?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && open) {
      event.preventDefault(); // çekmece de kapanmasın
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (!open || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    const items = [
      ...(root.current?.querySelectorAll<HTMLButtonElement>(".scene-gallery__item") ?? []),
    ];
    const index = items.findIndex((item) => item === document.activeElement);
    const next =
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    event.preventDefault();
    next?.focus();
  };

  return (
    <div className="scene-gallery" ref={root} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className={`pill scene-gallery__toggle${active ? " is-on" : ""}`}
        aria-expanded={open}
        aria-controls={listId}
        title="Galerideki sahneler (PageDown / PageUp: sıradaki / önceki sahne)"
        onClick={() => setOpen((o) => !o)}
      >
        {active ? active.name : "Galeri"}
        <span className="scene-gallery__caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="scene-gallery__list" id={listId} role="group" aria-label="Galeri">
          {GALLERY_SCENES.map(({ id, name, hint }) => {
            const key = sceneKey(id);
            return (
              <button
                key={id}
                type="button"
                className="scene-gallery__item"
                aria-pressed={scene === id}
                onClick={() => {
                  onChoose(id);
                  setOpen(false);
                  // Seçilen düğme kaybolur: odak gövdeye düşmesin, galeri düğmesine dönsün.
                  button.current?.focus();
                }}
              >
                <span className="scene-gallery__name">
                  {name}
                  {key && <kbd>{key}</kbd>}
                </span>
                <span className="scene-gallery__hint">{hint}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
