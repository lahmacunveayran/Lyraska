/**
 * Programın içinde tarayıcı davranışlarını kapatır (yalnızca sürüm derlemesinde, `main.tsx`).
 * WebView2 bir tarayıcıdır: F5 / Ctrl+R sayfayı yeniden yükler (çalan şarkı ve açık paneller
 * kaybolur), Alt+← ve faredeki geri düğmesi "önceki sayfaya" gider, Ctrl+P yazdırma penceresini,
 * Ctrl+F arama çubuğunu, sağ tık tarayıcı menüsünü ("Geri", "Yeniden yükle", "İncele") açar.
 * Bir müzik çalarda bunların hiçbiri beklenmez. Yakınlaştırma (Ctrl + tekerlek, Ctrl +/−) açık kalır:
 * erişilebilirlik içindir. Metin kutularında sağ tık (kes/kopyala/yapıştır) çalışır.
 */

const EDITABLE = "input, textarea, select, [contenteditable]";

/** Engellenen tuş birleşimi mi? (Saf: test edilir.) */
export function isBrowserShortcut(event: {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (event.key === "F5" || event.key === "F3" || event.key === "F7") return true; // yenile, ara, imleçle gezinme
  if (event.key === "BrowserBack" || event.key === "BrowserForward") return true;
  if (event.key === "BrowserRefresh" || event.key === "BrowserSearch") return true;
  if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return true; // geri/ileri
  if (mod && ["r", "p", "f", "g", "s", "u", "j", "h"].includes(key)) return true; // yenile, yazdır, ara, kaydet, kaynak, indirilenler, geçmiş
  return false;
}

/** Korumayı kurar; kaldırmak için dönen fonksiyon çağrılır. */
export function installBrowserGuard(target: Window = window): () => void {
  const onContextMenu = (event: MouseEvent) => {
    const element = event.target instanceof Element ? event.target : null;
    if (!element?.closest(EDITABLE)) event.preventDefault();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (isBrowserShortcut(event)) event.preventDefault();
  };
  // Faredeki geri/ileri düğmeleri (3, 4).
  const onMouseUp = (event: MouseEvent) => {
    if (event.button === 3 || event.button === 4) event.preventDefault();
  };
  target.addEventListener("contextmenu", onContextMenu);
  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("mouseup", onMouseUp);
  return () => {
    target.removeEventListener("contextmenu", onContextMenu);
    target.removeEventListener("keydown", onKeyDown);
    target.removeEventListener("mouseup", onMouseUp);
  };
}
