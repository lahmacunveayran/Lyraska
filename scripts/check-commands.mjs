// Arayüz ile çekirdek arasındaki komut sözleşmesini denetler:
//
// - Arayüzün `invoke("ad", …)` ile çağırdığı her komut çekirdekte tanımlı ve
//   `generate_handler!` listesinde kayıtlı mı? (Değilse çağrı çalışma anında başarısız olur.)
// - Kayıtlı her komutu arayüz kullanıyor mu? (Kullanılmayan komut ölü koddur.)
// - Gönderilen argüman adları Rust'taki parametre adlarıyla eşleşiyor mu? Tauri, Rust'taki
//   `snake_case` parametreyi arayüzde `camelCase` bekler. Zorunlu (Option olmayan) her
//   parametre gönderilmeli; Rust'ta olmayan bir ad gönderilmemeli.
// - Türler: gönderilen her değerin TypeScript türü Rust parametresinin türüyle, `invoke<T>`'deki
//   T de Rust'un dönüş türüyle aynı mı? (ör. Rust `f64` beklerken arayüz `string` gönderirse,
//   hata ancak o düğmeye basılınca görülür.) Veri yapılarının kendisi ts-rs ile Rust'tan üretilir;
//   burada adları karşılaştırılır.
// Ayrıştırıcının kendisi scripts/lib/commands.mjs; testleri commands.test.mjs.
//
// Kullanım: npm run check:commands

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  contractProblems,
  registeredHandlers,
  rustCommands,
  tsRenames,
  uiCalls,
} from "./lib/commands.mjs";

const RUST_COMMANDS = "src-tauri/src/commands.rs";
const RUST_SETUP = "src-tauri/src/lib.rs";
const UI_ROOT = "src";

function* sourceFiles(dir, pattern) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path, pattern);
    else if (pattern.test(entry)) yield path;
  }
}

const commands = rustCommands(readFileSync(RUST_COMMANDS, "utf8"));
const handlers = registeredHandlers(readFileSync(RUST_SETUP, "utf8"));
const renames = new Map(
  [...sourceFiles("src-tauri/src", /\.rs$/)].flatMap((file) => [
    ...tsRenames(readFileSync(file, "utf8")),
  ]),
);
const calls = [...sourceFiles(UI_ROOT, /^(?!.*\.test\.tsx?$).*\.tsx?$/)].flatMap((file) =>
  uiCalls(readFileSync(file, "utf8"), file),
);
const problems = contractProblems(commands, handlers, calls, RUST_COMMANDS, renames);

if (problems.length > 0) {
  console.error(`Komut sözleşmesi bozuk:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
const typed = calls.filter((call) => call.returns !== null).length;
console.log(
  `Komut sözleşmesi tamam: ${commands.size} komut, arayüzde ${calls.length} çağrı; adlar, ` +
    `argüman türleri ve ${typed} dönüş türü eşleşiyor.`,
);
