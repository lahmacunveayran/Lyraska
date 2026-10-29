import { describe, expect, it } from "vitest";
import {
  contractProblems,
  normalizeTs,
  registeredHandlers,
  rustCommands,
  rustToTs,
  tsRenames,
  uiCalls,
  unusedBridgeFunctions,
} from "./commands.mjs";

const RUST = `
#[tauri::command]
pub async fn seek(seconds: f64, player: State<'_, PlayerState>) -> Result<Status, String> {}

/// Belge yorumu araya girebilir.
#[tauri::command(rename_all = "snake_case")]
#[allow(clippy::too_many_arguments, reason = "x")]
pub fn pair_set(mut range: (f64, f64), next_path: Option<PathBuf>, app: tauri::AppHandle) -> Result<(), String> {}

#[tauri::command(async)]
pub fn list(query: String) -> Result<Vec<crate::db::TrackRow>, String> {}
`;

const TS = `
interface Request { a: string; trials: number }
export function seek(seconds: number): Promise<Status> {
  return invoke<Status>("seek", { seconds });
}
export async function pairSet(range: [number, number], path: string | null = null): Promise<void> {
  return invoke<void>("pair_set", { range: { lo: range[0], hi: range[1] }, next_path: path });
}
export function list(request: Request): Promise<LibraryTrack[]> {
  return invoke<LibraryTrack[]>("list", { query: request.a });
}
`;

const renames = new Map([["TrackRow", "LibraryTrack"]]);
const problemsFor = (
  rust,
  ts,
  handlers = "generate_handler![commands::seek, commands::pair_set, commands::list]",
) =>
  contractProblems(
    rustCommands(rust),
    registeredHandlers(handlers),
    uiCalls(ts, "x.ts"),
    "c.rs",
    renames,
  );

describe("Rust tarafı ayrıştırma", () => {
  it("öznitelik biçimleri, araya giren yorum ve öznitelik, parantezli tür, mut", () => {
    const commands = rustCommands(RUST);
    expect([...commands.keys()]).toEqual(["seek", "pair_set", "list"]);
    expect(commands.get("pair_set").params).toEqual([
      { name: "range", key: "range", type: "(f64, f64)", optional: false },
      { name: "next_path", key: "next_path", type: "Option<PathBuf>", optional: true },
    ]);
    expect(commands.get("seek").params.map((p) => p.key)).toEqual(["seconds"]);
    expect(commands.get("list").returns).toBe("Result<Vec<crate::db::TrackRow>, String>");
  });

  it("Rust türlerini arayüz türlerine çevirir", () => {
    expect(rustToTs("Result<Option<Vec<String>>, String>")).toBe("null | string[]");
    expect(rustToTs("Result<(), String>")).toBe("void");
    expect(rustToTs("crate::analysis::key::KeyMap")).toBe("KeyMap");
    expect(normalizeTs(rustToTs("Result<tauri::ipc::Response, String>"))).toBe(
      "ArrayBuffer | number[]",
    );
    expect(rustToTs("Vec<TrackRow>", renames)).toBe("LibraryTrack[]");
    expect(normalizeTs("Promise<LibraryTrack[] | null>")).toBe("LibraryTrack[] | null");
  });

  it("ts-rs ile başka adla dışa verilen tipler", () => {
    const source = `#[cfg_attr(test, derive(ts_rs::TS), ts(export, rename = "LibraryTrack"))]\npub struct TrackRow {}`;
    expect([...tsRenames(source)]).toEqual([["TrackRow", "LibraryTrack"]]);
  });
});

describe("sözleşme", () => {
  it("doğru sözleşme temiz; iç içe süslü parantez ve istek.alan çözülür", () => {
    const problems = problemsFor(RUST, TS);
    // pair_set'in "range" değeri bir nesne kalıbı: türü çözülemez, açıkça bildirilir.
    expect(problems).toEqual([
      'x.ts:7: "pair_set" / "range" değerinin türü çözülemedi (parametreyi doğrudan ya da `istek.alan` biçiminde verin)',
    ]);
  });

  it("tür uyuşmazlığı: Rust f64 beklerken arayüz string gönderir (denetimdeki kaçak)", () => {
    const ts = `export function seek(seconds: string) { return invoke<Status>("seek", { seconds }); }`;
    const problems = problemsFor(RUST, ts, "generate_handler![commands::seek]").filter((p) =>
      p.includes("seek"),
    );
    expect(problems).toContain(
      'x.ts:1: "seek" / "seconds": Rust f64 bekliyor, arayüz string gönderiyor',
    );
  });

  it("dönüş türü uyuşmazlığı", () => {
    const ts = `export function seek(seconds: number) { return invoke<string>("seek", { seconds }); }`;
    expect(problemsFor(RUST, ts, "generate_handler![commands::seek]").join("\n")).toContain(
      '"seek" dönüşü: Rust Result<Status, String> (Status), arayüz invoke<string>',
    );
  });

  it("commands:: dışında kayıtlı komut ve değişkenle çağrı (denetimdeki kaçaklar)", () => {
    const ts = `const ad = "seek"; export function f() { return invoke(ad); }`;
    const problems = problemsFor(RUST, ts, "generate_handler![commands::seek, other::seek2]");
    expect(problems).toContain(
      "other::seek2: komutlar c.rs içinde tanımlanır (commands:: ile kaydedilir)",
    );
    expect(problems).toContain(
      "x.ts:1: invoke'a komut adı değişkenle verilmiş; adı düz metin yazın",
    );
  });

  it("değer çağrıyı saran fonksiyondan okunur; ok fonksiyonu ve takma ad (denetimdeki kaçaklar)", () => {
    const ts = `
export function seek(seconds: number): Promise<Status> {
  return invoke<Status>("seek", { seconds });
}
export const seekText = (seconds: string) => invoke<Status>("seek", { seconds });
`;
    const problems = problemsFor(RUST, ts, "generate_handler![commands::seek]");
    expect(problems).toContain(
      'x.ts:5: "seek" / "seconds": Rust f64 bekliyor, arayüz string gönderiyor',
    );
    expect(problems.filter((p) => p.startsWith("x.ts:3"))).toEqual([]);

    const outside = `export function a(seconds: number) { return 1; }\nconst b = invoke<Status>("seek", { seconds });`;
    expect(problemsFor(RUST, outside, "generate_handler![commands::seek]")).toContain(
      'x.ts:2: "seek" / "seconds" değerinin türü çözülemedi (parametreyi doğrudan ya da `istek.alan` biçiminde verin)',
    );

    const alias = `import { invoke as call } from "@tauri-apps/api/core";`;
    expect(problemsFor(RUST, alias, "generate_handler![commands::seek]")).toContain(
      "x.ts:1: invoke takma adla içe aktarılmış; adıyla (invoke) çağırın",
    );
  });

  it("yanlış ad, eksik zorunlu parametre, kayıtsız ve kullanılmayan komut", () => {
    const ts = `export function seek(secs: number) { return invoke<Status>("seek", { secs }); }`;
    const problems = problemsFor(RUST, ts, "generate_handler![commands::seek, commands::list]");
    expect(problems).toEqual(
      expect.arrayContaining([
        'x.ts:1: "seek" komutunda "secs" diye bir parametre yok',
        'x.ts:1: "seek" komutuna zorunlu "seconds" gönderilmiyor',
        "pair_set: tanımlı ama generate_handler! listesinde yok",
        "list: çekirdekte var ama arayüz hiç çağırmıyor (ölü kod)",
      ]),
    );
  });
});

it("köprünün kullanılmayan fonksiyonları (denetimdeki kaçak: sarmalayıcı kullanım sayılıyordu)", () => {
  const bridge = `export function getA() {}\nexport async function getB() {}\nfunction ic() {}`;
  expect(unusedBridgeFunctions(bridge, ["getA();", "getAB();"])).toEqual(["getB"]);
});

describe("düzenli ifadeler kötü girdide yavaşlamaz (CodeQL: verimsiz düzenli ifade)", () => {
  // Satır sonu olmayan uzun yorum: eski desen boşlukları iki yoldan eşleyip geri izlemede patlıyordu.
  const spaces = " \t".repeat(20000);

  it("rustCommands", () => {
    const start = performance.now();
    expect(() => rustCommands(`#[tauri::command]\n//${spaces}`)).toThrow();
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("tsRenames", () => {
    const start = performance.now();
    expect(tsRenames(`#[ts(rename = "A")]\n//${spaces}`).size).toBe(0);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
