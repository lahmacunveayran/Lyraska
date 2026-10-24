import { useState } from "react";

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
 * modunda. Uyarı modu tek tıkla açtırır. Güvenli mod zaten açıksa gösterilmez.
 */
export function FlashWarning({ safe, onEnableSafe }: { safe: boolean; onEnableSafe: () => void }) {
  const [open, setOpen] = useState(() => !seen());
  if (!open || safe) return null;
  const close = (enable: boolean) => {
    remember();
    setOpen(false);
    if (enable) onEnableSafe();
  };
  return (
    <div
      className="flash-warning"
      role="alertdialog"
      aria-labelledby="flash-warning-title"
      aria-describedby="flash-warning-text"
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
        <button type="button" className="glass-button" onClick={() => close(true)}>
          Epilepsi güvenli modunu aç
        </button>
        <button type="button" className="glass-button" onClick={() => close(false)}>
          Anladım
        </button>
      </div>
    </div>
  );
}
