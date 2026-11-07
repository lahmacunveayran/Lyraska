"""Saf bir modülün bozma (mutasyon) yeniden sınaması, küçük kopya projede (BILGI-BIRIKIMI §5).

Kullanım: python3 -I kopya_mutasyon.py <modül.rs> <kaçanlar.txt> <proje klasörü> <dosya adı> [test süzgeci]

- `kaçanlar.txt`: cargo-mutants'ın `missed.txt` satırları ("src/audio/biquad.rs:116:37: replace + with - in ...").
- Proje klasöründe `Cargo.toml` ve `src/lib.rs` hazır olmalı (`pub type Sample = f64; pub mod <ad>;`); modül
  `src/<dosya adı>`'na kopyalanır. Her bozma tek tek uygulanır, `cargo test -q <süzgeç>` çalışır: test düşerse ya da
  derlenmezse "yakalandı", geçerse "kaçtı". Kaynak dosyaya dokunulmaz (kopya projede çalışır).
- Uygulanan biçimler: "replace A with B" (sütundaki işleç), "delete -" (sütundaki eksi). Diğerleri (dönüşü sabit
  yapma, kolu silme) "elle" diye yazılır.
"""
import re, subprocess, sys, pathlib

src, missed, proj, name = sys.argv[1:5]
filt = sys.argv[5] if len(sys.argv) > 5 else ""
module = pathlib.Path(src).name
lines = pathlib.Path(src).read_text(encoding="utf-8").split("\n")
target = pathlib.Path(proj) / "src" / name
pat = re.compile(rf".*{re.escape(module)}:(\d+):(\d+): (.*)$")


def apply(line, col, desc):
    i = col - 1
    m = re.match(r"replace (\S+) with (\S+) in ", desc)
    if m:
        a, b = m[1], m[2]
        if line[i:i + len(a)] != a:
            return None
        return line[:i] + b + line[i + len(a):]
    if desc.startswith("delete -"):
        if line[i] != "-":
            return None
        return line[:i] + line[i + 1:]
    return None


def run():
    r = subprocess.run(["cargo", "test", "-q", "--", filt] if filt else ["cargo", "test", "-q"],
                       cwd=proj, capture_output=True, text=True)
    return r.returncode == 0


target.write_text("\n".join(lines), encoding="utf-8")
if not run():
    sys.exit("bozmasız testler geçmeli")
for raw in open(missed, encoding="utf-8"):
    m = pat.match(raw.strip())
    if not m:
        continue
    ln, col, desc = int(m[1]), int(m[2]), m[3]
    new = apply(lines[ln - 1], col, desc)
    if new is None:
        print(f"elle\t{ln}:{col}\t{desc}", flush=True)
        continue
    mutated = lines.copy()
    mutated[ln - 1] = new
    target.write_text("\n".join(mutated), encoding="utf-8")
    print(f"{'kaçtı' if run() else 'yakalandı'}\t{ln}:{col}\t{desc}", flush=True)
target.write_text("\n".join(lines), encoding="utf-8")
