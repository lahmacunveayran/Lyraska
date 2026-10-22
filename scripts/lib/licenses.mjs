// Lisans denetiminin saf mantığı (scripts/check-licenses.mjs kullanır; testleri licenses.test.ts).
//
// - İzin verilen lisanslar tek yerde: src-tauri/deny.toml `[licenses] allow`. npm ve Rust aynı
//   listeyi kullanır (CLAUDE.md: "İzin verilen lisanslar deny.toml içinde listelidir").
// - Lisans alanı bir SPDX ifadesidir: `MIT`, `(MIT OR Apache-2.0)`, `MIT AND Zlib`,
//   `Apache-2.0 WITH LLVM-exception`. OR'da bir seçeneğin, AND'de hepsinin izinli olması gerekir.

/** deny.toml metninden `[licenses]` bölümündeki `allow = [ … ]` listesini okur. */
export function allowedFromDenyToml(text) {
  const section = /^\[licenses\]([\s\S]*?)(?=^\[)/m.exec(text);
  if (!section) throw new Error("deny.toml: [licenses] bölümü bulunamadı");
  const list = /^allow\s*=\s*\[([\s\S]*?)\]/m.exec(section[1]);
  if (!list) throw new Error("deny.toml: [licenses] allow listesi bulunamadı");
  const ids = [...list[1].replace(/#.*$/gm, "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (ids.length === 0) throw new Error("deny.toml: allow listesi boş");
  return new Set(ids);
}

/** SPDX ifadesini sözcüklere ayırır. */
function tokenize(expression) {
  return expression.replace(/\(/g, " ( ").replace(/\)/g, " ) ").trim().split(/\s+/).filter(Boolean);
}

/**
 * SPDX ifadesini ayrıştırır: ağaç `{ op: "or"|"and", items }` ya da `{ id }` (`WITH` dahil, ör.
 * "Apache-2.0 WITH LLVM-exception"). Bozuk ifadede hata fırlatır.
 * Öncelik SPDX'teki gibi: WITH > AND > OR.
 */
export function parseSpdx(expression) {
  if (typeof expression !== "string" || expression.trim() === "") {
    throw new Error("lisans belirtilmemiş");
  }
  const tokens = tokenize(expression);
  let at = 0;
  const peek = () => tokens[at];
  const next = () => tokens[at++];

  function primary() {
    const token = next();
    if (token === undefined) throw new Error(`eksik ifade: "${expression}"`);
    if (token === "(") {
      const inner = or();
      if (next() !== ")") throw new Error(`kapanmayan parantez: "${expression}"`);
      return inner;
    }
    if (/^(AND|OR|WITH|\))$/i.test(token))
      throw new Error(`beklenmeyen "${token}": "${expression}"`);
    if (peek() !== undefined && /^WITH$/i.test(peek())) {
      next();
      const exception = next();
      if (exception === undefined || /^(AND|OR|WITH|\(|\))$/i.test(exception)) {
        throw new Error(`WITH'ten sonra istisna yok: "${expression}"`);
      }
      return { id: `${token} WITH ${exception}` };
    }
    return { id: token };
  }
  function and() {
    const items = [primary()];
    while (peek() !== undefined && /^AND$/i.test(peek())) {
      next();
      items.push(primary());
    }
    return items.length === 1 ? items[0] : { op: "and", items };
  }
  function or() {
    const items = [and()];
    while (peek() !== undefined && /^OR$/i.test(peek())) {
      next();
      items.push(and());
    }
    return items.length === 1 ? items[0] : { op: "or", items };
  }

  const tree = or();
  if (at !== tokens.length) throw new Error(`fazla sözcük "${tokens[at]}": "${expression}"`);
  return tree;
}

/** Ağaç izin verilen lisanslarla karşılanıyor mu? */
export function satisfies(tree, allowed) {
  if ("id" in tree) {
    // "GPL-3.0+" eski yazımı: "-or-later" ile aynı.
    const id = tree.id.replace(/\+$/, "-or-later");
    return allowed.has(id) || allowed.has(tree.id);
  }
  return tree.op === "or"
    ? tree.items.some((item) => satisfies(item, allowed))
    : tree.items.every((item) => satisfies(item, allowed));
}

/** package.json / paket kilidindeki lisans alanını SPDX ifadesine çevirir (eski biçimler dahil). */
export function licenseExpression(field) {
  if (typeof field === "string") return field;
  if (Array.isArray(field)) {
    const ids = field.map((l) => (typeof l === "string" ? l : l?.type)).filter(Boolean);
    return ids.length > 0 ? `(${ids.join(" OR ")})` : "";
  }
  if (field && typeof field === "object" && typeof field.type === "string") return field.type;
  return "";
}

/**
 * Tek bir paketin lisansını denetler. `null` = uygun; metin = neden uygun olmadığı.
 * `UNLICENSED`, `SEE LICENSE IN …` ve boş alan izin listesinde olamayacağı için reddedilir.
 */
export function checkLicense(field, allowed) {
  const expression = licenseExpression(field);
  let tree;
  try {
    tree = parseSpdx(expression);
  } catch (error) {
    return `${error.message}`;
  }
  return satisfies(tree, allowed) ? null : `izin listesinde değil: ${expression}`;
}
