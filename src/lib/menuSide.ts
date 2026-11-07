/** Yatay aralık (ekran pikseli): sol ve sağ kenar. */
export interface Span {
  left: number;
  right: number;
}

/**
 * Açılır menünün hangi kenara hizalanacağı. `"end"`: menünün sağ kenarı düğmenin sağ kenarında (menü
 * sola uzanır); `"start"`: sol kenarı düğmenin sol kenarında (sağa uzanır). Önce `"end"` denenir (düğme
 * başlığın sağ köşesindeyken menü panelin içinde kalır); sola sığmazsa `"start"`. İkisi de sığmazsa
 * taşmanın az olduğu yan seçilir. `bounds`: menünün kesilmeden görünebildiği alan (panel).
 */
export function menuSide(anchor: Span, menuWidth: number, bounds: Span): "start" | "end" {
  const endOverflow = Math.max(0, bounds.left - (anchor.right - menuWidth));
  if (endOverflow === 0) return "end";
  const startOverflow = Math.max(0, anchor.left + menuWidth - bounds.right);
  return startOverflow < endOverflow ? "start" : "end";
}
