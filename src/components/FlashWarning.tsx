import { useEffect, useRef, useState } from "react";

/** Uyarının görüldüğünü tutan anahtar (tarayıcı deposu; program yeniden açılınca hatırlanır). */
export const FLASH_WARNING_KEY = "lyraska.flashWarning.seen";

function seen(): boolean {
  try {
    return window.localStorage.getItem(FLASH_WARNING_KEY) === "1";
  } catch {
    return false;
  }
}

function remember() {
  try {
    window.localStorage.setItem(FLASH_WARNING_KEY, "1");
  } catch {
    // Depo kapalıysa uyarı bir sonraki açılışta yeniden görünür.
  }
}

/**
 * İlk açılışta bir kez görünen ışığa duyarlılık uyarısı. Görseller varsayılanda parlama sınırı
 * olmadan çizilir (proje sahibinin kararı, 24 Ekim 2026); sınır yalnızca Epilepsi güvenli
 * modunda. Uyarı modu tek tıkla açtırır. Güvenli mod zaten açıksa gösterilmez; kayıtlı ayar
 * okunana dek de (`ready`): güvenli modu açık kullanıcıda bir an bile görünmesin.
 *
 * Açılınca odak "Epilepsi güvenli modunu aç" düğmesine gelir (klavye ve ekran okuyucu kullanıcısı
 * için; odak o an başka bir denetimdeyse alınmaz); Esc "Anladım" gibi kapatır. Güvenli mod açıkken uyarı "görüldü" sayılmaz: kullanıcı modu
 * sonra kapatırsa uyarı o an bir kez çıkar (modu kapatan kullanıcı bir kez uyarılır).
 */
export function FlashWarning({
  safe,
  ready = true,
  onEnableSafe,
}: {
  safe: boolean;
  /** Güvenli modun kayıtlı ayarı okundu mu. */
  ready?: boolean;
  onEnableSafe: () => void;
}) {
  const [open, setOpen] = useState(() => !seen());
  const enableRef = useRef<HTMLButtonElement>(null);
  const visible = open && !safe && ready;
  useEffect(() => {
    // Odak boştaysa (açılışta) düğmeye gelir; kullanıcının o an kullandığı denetimden alınmaz.
    const active = document.activeElement;
    if (visible && (!active || active === document.body)) enableRef.current?.focus();
  }, [visible]);
  if (!visible) return null;
  const close = (enable: boolean) => {
    remember();
    setOpen(false);
    if (enable) onEnableSafe();
  };
  return (
    <div
      className="flash-warning"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="flash-warning-title"
      aria-describedby="flash-warning-text"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        close(false);
      }}
    >
      <h2 id="flash-warning-title" className="flash-warning__title">
        Işığa duyarlılık uyarısı
      </h2>
      <p id="flash-warning-text" className="flash-warning__text">
        Lyraska'nın görselleri müzikle birlikte hızlı yanıp sönen ışıklar ve renkler içerebilir.
        Işığa duyarlı epilepsiniz varsa ya da yanıp sönen ışıklardan rahatsız oluyorsanız Epilepsi
        güvenli modunu açın: görseller saniyede en fazla bir kez parlar. Bu ayarı sonra Ayarlar'dan
        da değiştirebilirsiniz.
      </p>
      <div className="flash-warning__actions">
        <button ref={enableRef} type="button" className="glass-button" onClick={() => close(true)}>
          Epilepsi güvenli modunu aç
        </button>
        <button type="button" className="glass-button" onClick={() => close(false)}>
          Anladım
        </button>
      </div>
    </div>
  );
}
