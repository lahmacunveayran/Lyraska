// Komut sözleşmesi denetiminin saf mantığı (scripts/check-commands.mjs kullanır; testleri
// commands.test.mjs). Rust'taki `#[tauri::command]` fonksiyonlarını ve arayüzün `invoke` çağrılarını
// ayrıştırır, türleri karşılaştırılabilir biçime çevirir.

/** Tauri'nin kendisinin verdiği parametreler (arayüzden gönderilmez). */
const INJECTED = /^(tauri::)?(State|AppHandle|Window|WebviewWindow|Webview)\b/;

export const camel = (name) => name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

/** `text[open]` açılış parantezinden eşleşen kapanışın indeksi ((), <>, [] iç içe). */
function matching(text, open) {
  const pairs = { "(": ")", "<": ">", "[": "]", "{": "}" };
  const stack = [];
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "-" && text[i + 1] === ">") {
      i++; // "->" bir parantez değil
      continue;
    }
    if (c in pairs) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

/**
 * Fonksiyon gövdesinin sonu. `{` ile başlıyorsa eşleşen `}`; değilse (ok fonksiyonunun tek ifadesi)
 * üst düzeyde `;`, `,` ya da kapanan bir parantez. Yalnızca (), [], {} sayılır (`<` karşılaştırma
 * olabilir).
 */
function bodyEnd(text, from) {
  let depth = 0;
  let i = from;
  while (i < text.length && /\s/.test(text[i])) i++;
  const block = text[i] === "{";
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (block && depth === 0) return i;
      if (depth < 0) return i;
    } else if (!block && depth === 0 && (c === ";" || c === ",")) return i;
  }
  return text.length;
}

/** Üst düzey virgüllerden böler (tür içindeki `<…, …>` ve `(…, …)` virgülleri hariç). */
export function splitTopLevel(text, separator = ",") {
  const parts = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "-" && text[i + 1] === ">") {
      current += "->";
      i++;
      continue;
    }
    if ("(<[{".includes(c)) depth++;
    if (")>]}".includes(c)) depth--;
    if (c === separator && depth === 0) {
      parts.push(current);
      current = "";
    } else current += c;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * `#[tauri::command]` (ve `#[tauri::command(rename_all = …, async)]`) işaretli fonksiyonlar.
 * Öznitelik ile `fn` arasında belge yorumu ve başka öznitelikler olabilir.
 * Dönüş: ad → { params: [{ name, key, type, optional }], returns, renameAll }
 */
export function rustCommands(source) {
  const commands = new Map();
  const attribute = /#\[tauri::command(?:\(([^\]]*)\))?\]/g;
  for (const match of source.matchAll(attribute)) {
    const options = match[1] ?? "";
    const rest = source.slice(match.index + match[0].length);
    const fn =
      /^(?:\s*(?:\/\/[^\n]*|#\[[^\]]*\]))*\s*pub(?:\([^)]*\))?\s+(?:async\s+)?fn\s+([a-z0-9_]+)\s*(?:<[^>]*>)?\s*\(/.exec(
        rest,
      );
    if (!fn)
      throw new Error(`#[tauri::command] sonrası fonksiyon anlaşılamadı: ${rest.slice(0, 80)}`);
    const name = fn[1];
    const open = fn.index + fn[0].length - 1;
    const close = matching(rest, open);
    if (close < 0) throw new Error(`${name}: parametre listesi kapanmıyor`);
    const snakeArgs = /rename_all\s*=\s*"snake_case"/.test(options);
    const params = splitTopLevel(rest.slice(open + 1, close))
      .map((arg) => {
        const colon = arg.indexOf(":");
        const binding = arg
          .slice(0, colon)
          .replace(/^mut\s+/, "")
          .trim();
        return { name: binding, type: arg.slice(colon + 1).trim() };
      })
      .filter((arg) => !INJECTED.test(arg.type))
      .map((arg) => ({
        name: arg.name,
        key: snakeArgs ? arg.name : camel(arg.name),
        type: arg.type,
        optional: /^Option\s*</.test(arg.type),
      }));
    const after = rest.slice(close + 1);
    const ret = /^\s*->\s*([\s\S]*?)\s*(?:where\b[\s\S]*?)?\{/.exec(after);
    commands.set(name, { params, returns: ret ? ret[1].trim() : "()" });
  }
  return commands;
}

/** `generate_handler![ … ]` listesi: yol → son parça. */
export function registeredHandlers(source) {
  const block = /generate_handler!\[([^\]]*)\]/.exec(source);
  if (!block) throw new Error("generate_handler! bulunamadı");
  return splitTopLevel(block[1].replace(/\/\/[^\n]*/g, "")).map((path) => ({
    path,
    name: path.split("::").pop(),
  }));
}

/**
 * ts-rs'te başka adla dışa verilen tipler (`#[ts(rename = "LibraryTrack")] pub struct TrackRow`):
 * Rust adı → arayüzdeki ad.
 */
export function tsRenames(source) {
  const renames = new Map();
  const pattern =
    /ts\([^()]*\brename\s*=\s*"(\w+)"[^()]*\)\)?\]\s*(?:#\[[^\]]*\]\s*|\/\/[^\n]*\s*)*pub\s+(?:struct|enum)\s+(\w+)/g;
  for (const m of source.matchAll(pattern)) renames.set(m[2], m[1]);
  return renames;
}

/** Rust türünü arayüzde beklenen TypeScript türüne çevirir (karşılaştırma biçiminde). */
export function rustToTs(type, renames = new Map()) {
  const name = rustToTsInner(type);
  return name.replace(/\b\w+\b/g, (word) => renames.get(word) ?? word);
}

function rustToTsInner(type) {
  const t = type.replace(/\s+/g, " ").trim();
  const generic = /^([\w:]+)\s*<([\s\S]*)>$/.exec(t);
  if (generic) {
    const head = generic[1].split("::").pop();
    const inner = splitTopLevel(generic[2]);
    if (head === "Result") return rustToTsInner(inner[0]);
    if (head === "Option") return union([rustToTsInner(inner[0]), "null"]);
    if (head === "Vec" || head === "VecDeque") return `${wrapArray(rustToTsInner(inner[0]))}[]`;
    if (head === "Box" || head === "Arc") return rustToTsInner(inner[0]);
    if (head === "State") return "(injected)";
    return head;
  }
  if (/^\(\s*\)$/.test(t)) return "void";
  // Ham bayt yanıtı: arayüze ArrayBuffer olarak (eski WebView'de sayı dizisi) gelir.
  if (/^(tauri::)?(ipc::)?Response$/.test(t)) return "ArrayBuffer | number[]";
  if (/^&?'?\w*\s*(mut\s+)?str$/.test(t) || /^(String|PathBuf|&Path|Path)$/.test(t))
    return "string";
  if (/^&/.test(t)) return rustToTsInner(t.replace(/^&('\w+\s+)?(mut\s+)?/, ""));
  if (t === "bool") return "boolean";
  if (/^(f32|f64|u8|u16|u32|u64|usize|i8|i16|i32|i64|isize)$/.test(t)) return "number";
  if (/^\[(.+);\s*\d+\]$/.test(t)) return `${wrapArray(rustToTsInner(/^\[(.+);/.exec(t)[1]))}[]`;
  return t.split("::").pop();
}

const wrapArray = (t) => (t.includes("|") ? `(${t})` : t);

/** Birleşimi sıralı ve tekrarsız yazar: "null | X" ile "X | null" aynı sayılır. */
function union(parts) {
  return [...new Set(parts.flatMap((p) => splitTopLevel(p, "|")))].sort().join(" | ");
}

/** TypeScript tür metnini karşılaştırma biçimine getirir. */
export function normalizeTs(type) {
  let t = type.replace(/\s+/g, " ").trim();
  if (/^Promise<([\s\S]*)>$/.test(t)) t = /^Promise<([\s\S]*)>$/.exec(t)[1];
  t = t.replace(/Array<([^<>]*)>/g, "$1[]");
  return union(splitTopLevel(t, "|").map((p) => p.replace(/^\((.*)\)\[\]$/, "($1)[]")));
}

/** Rust parametresi ile arayüzün gönderdiği değerin türü uyumlu mu? */
export function argumentMatches(rustType, tsType, renames = new Map()) {
  const expected = normalizeTs(rustToTs(rustType, renames));
  const actual = normalizeTs(tsType.replace(/\s*\|\s*undefined\b/g, ""));
  if (expected === actual) return true;
  // Option<T> parametresi: arayüz T de gönderebilir (null hiç gelmez).
  if (/^Option\s*</.test(rustType.trim())) {
    return (
      normalizeTs(rustToTs(rustType.trim().replace(/^Option\s*<([\s\S]*)>$/, "$1"), renames)) ===
      actual
    );
  }
  return false;
}

/** Fonksiyonun parametre listesini ad → tür eşlemine çevirir (`a: T = varsayılan` dahil). */
function parseTsParams(text) {
  const params = new Map();
  for (const part of splitTopLevel(text)) {
    const m = /^(\w+)(\?)?\s*:\s*([\s\S]+?)(?:\s*=\s*[\s\S]+)?$/.exec(part);
    if (m) params.set(m[1], m[2] ? `${m[3]} | undefined` : m[3]);
  }
  return params;
}

/** Dosyadaki `interface X { a: T; b?: U }` tanımları: ad → (alan → tür). */
export function tsInterfaces(text) {
  const result = new Map();
  for (const m of text.matchAll(/interface\s+(\w+)\s*\{([^}]*)\}/g)) {
    const fields = new Map();
    for (const f of m[2].matchAll(/^\s*(?:readonly\s+)?(\w+)(\?)?\s*:\s*([^;\n]+);?/gm)) {
      fields.set(f[1], f[2] ? `${f[3]} | undefined` : f[3]);
    }
    result.set(m[1], fields);
  }
  return result;
}

/**
 * Arayüz dosyasındaki `invoke` çağrıları: ad, dönüş türü (`invoke<T>`), gönderilen anahtarlar ve her
 * değerin türü (çağıran fonksiyonun parametresinden ya da `istek.alan` biçiminde arayüz alanından).
 * Türü çözülemeyen değer `type: null` olur.
 */
export function uiCalls(text, file = "") {
  const calls = [];
  const interfaces = tsInterfaces(text);
  // Çağrıyı saran fonksiyon: `function ad(…) { … }` ya da `const ad = (…) => …`. Gövdenin sonu da
  // tutulur: bir çağrının değerleri yalnızca içinde durduğu fonksiyonun parametrelerinden okunur.
  const fnPattern =
    /function\s+\w+\s*(?:<[^>]*>)?\s*\(|(?:const|let)\s+\w+\s*=\s*(?:async\s*)?(?:<[^>]*>)?\s*\(/g;
  const functions = [...text.matchAll(fnPattern)].flatMap((m) => {
    const open = m.index + m[0].length - 1;
    const close = matching(text, open);
    if (close < 0) return [];
    const arrow = !m[0].startsWith("function");
    const bodyAt = arrow ? text.indexOf("=>", close) : text.indexOf("{", close);
    if (bodyAt < 0) return [];
    return [
      {
        at: m.index,
        end: bodyEnd(text, arrow ? bodyAt + 2 : bodyAt),
        params: parseTsParams(text.slice(open + 1, close)),
      },
    ];
  });
  // `import { invoke as çağır }`: takma adlı çağrılar okunamaz, sözleşme dışı kalırdı.
  for (const m of text.matchAll(/\binvoke\s+as\s+\w+/g)) {
    calls.push({ name: null, alias: true, where: `${file}:${lineOf(text, m.index)}` });
  }
  for (const m of text.matchAll(/\binvoke\s*(<)?/g)) {
    let at = m.index + m[0].length;
    let returns = null;
    if (m[1]) {
      const close = matching(text, at - 1);
      returns = text.slice(at, close);
      at = close + 1;
    }
    const call = /^\s*\(\s*(["'`])([a-z0-9_]+)\1\s*(,\s*\{)?/.exec(text.slice(at));
    if (!call) {
      // `invoke(ad)` gibi değişkenle çağrı: denetlenemez, sözleşme dışı sayılır.
      if (/^\s*\(/.test(text.slice(at))) {
        calls.push({ name: null, where: `${file}:${lineOf(text, m.index)}` });
      }
      continue;
    }
    const line = lineOf(text, m.index);
    const enclosing = functions.filter((f) => f.at < m.index && m.index < f.end).pop();
    const args = [];
    if (call[3]) {
      const open = at + call[0].length - 1;
      const close = matching(text, open);
      for (const part of splitTopLevel(text.slice(open + 1, close))) {
        const colon = part.indexOf(":");
        const key = (colon < 0 ? part : part.slice(0, colon)).trim();
        const value = (colon < 0 ? part : part.slice(colon + 1)).trim();
        args.push({ key, type: valueType(value, enclosing?.params, interfaces) });
      }
    }
    calls.push({ name: call[2], returns, args, where: `${file}:${line}` });
  }
  return calls;
}

function valueType(value, params, interfaces) {
  if (!params) return null;
  if (/^\w+$/.test(value)) return params.get(value) ?? null;
  const member = /^(\w+)\.(\w+)$/.exec(value);
  if (member) {
    const owner = params.get(member[1]);
    return (owner && interfaces.get(owner.trim())?.get(member[2])) ?? null;
  }
  return null;
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/** Sözleşme sorunlarının listesi (boşsa sözleşme tamam). */
export function contractProblems(
  commands,
  handlers,
  calls,
  rustFile = "commands.rs",
  renames = new Map(),
) {
  const problems = [];
  const handlerNames = new Set(handlers.map((h) => h.name));
  for (const handler of handlers) {
    if (!/^commands::/.test(handler.path)) {
      problems.push(
        `${handler.path}: komutlar ${rustFile} içinde tanımlanır (commands:: ile kaydedilir)`,
      );
    } else if (!commands.has(handler.name)) {
      problems.push(`${handler.name}: kayıtlı ama ${rustFile} içinde yok`);
    }
  }
  for (const name of commands.keys()) {
    if (!handlerNames.has(name))
      problems.push(`${name}: tanımlı ama generate_handler! listesinde yok`);
    if (!calls.some((call) => call.name === name)) {
      problems.push(`${name}: çekirdekte var ama arayüz hiç çağırmıyor (ölü kod)`);
    }
  }
  for (const call of calls) {
    if (call.alias) {
      problems.push(`${call.where}: invoke takma adla içe aktarılmış; adıyla (invoke) çağırın`);
      continue;
    }
    if (call.name === null) {
      problems.push(`${call.where}: invoke'a komut adı değişkenle verilmiş; adı düz metin yazın`);
      continue;
    }
    const command = commands.get(call.name);
    if (!command) {
      problems.push(`${call.where}: "${call.name}" komutu çekirdekte yok`);
      continue;
    }
    for (const arg of call.args) {
      const param = command.params.find((p) => p.key === arg.key);
      if (!param) {
        problems.push(
          `${call.where}: "${call.name}" komutunda "${arg.key}" diye bir parametre yok`,
        );
      } else if (arg.type === null) {
        problems.push(
          `${call.where}: "${call.name}" / "${arg.key}" değerinin türü çözülemedi ` +
            "(parametreyi doğrudan ya da `istek.alan` biçiminde verin)",
        );
      } else if (!argumentMatches(param.type, arg.type, renames)) {
        problems.push(
          `${call.where}: "${call.name}" / "${arg.key}": Rust ${param.type} bekliyor, arayüz ${arg.type} gönderiyor`,
        );
      }
    }
    for (const param of command.params) {
      if (!param.optional && !call.args.some((a) => a.key === param.key)) {
        problems.push(
          `${call.where}: "${call.name}" komutuna zorunlu "${param.key}" gönderilmiyor`,
        );
      }
    }
    if (call.returns !== null) {
      const expected = normalizeTs(rustToTs(command.returns, renames));
      const actual = normalizeTs(call.returns);
      if (expected !== actual) {
        problems.push(
          `${call.where}: "${call.name}" dönüşü: Rust ${command.returns} (${expected}), arayüz invoke<${call.returns}>`,
        );
      }
    }
  }
  return problems;
}

/**
 * Köprünün (`backend.ts`) dışa verdiği ama ürün kodunda (testler hariç) hiç çağrılmayan
 * fonksiyonlar. Komut "kullanılıyor" sayılırken sarmalayıcısının kendisi kullanılmıyor olabilir:
 * o zaman komut da sarmalayıcı da ölü koddur.
 */
export function unusedBridgeFunctions(bridge, productTexts) {
  const exported = [...bridge.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)].map(
    (m) => m[1],
  );
  return exported.filter(
    (name) => !productTexts.some((text) => new RegExp(`\\b${name}\\b`).test(text)),
  );
}
