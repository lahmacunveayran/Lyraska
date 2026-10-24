import { FolderIcon } from "./icons";

/**
 * Şarkı satırındaki "dosya konumunu aç" düğmesi (Steam'deki "yerel dosyalara göz at" gibi):
 * satırın üstüne gelince ya da satır seçiliyken görünür; tıklama satırı seçmez, çift tık çalmaz.
 */
export function RevealButton({
  title,
  onReveal,
}: {
  /** Şarkının adı (ekran okuyucu için). */
  title: string;
  onReveal: () => void;
}) {
  return (
    <button
      type="button"
      className="library__reveal"
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onReveal();
      }}
      aria-label={`Dosya konumunu aç: ${title}`}
      title="Dosya konumunu aç (dosya gezgininde gösterir)"
    >
      <FolderIcon />
    </button>
  );
}
