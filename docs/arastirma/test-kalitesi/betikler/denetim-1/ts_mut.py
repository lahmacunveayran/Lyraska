# Stryker'ın ürettiği mutant listesinden örneklem alır, her mutantı elle uygular, ilgili test
# dosyasını vitest ile çalıştırır, dosyayı geri yükler. Çalışma klasörü: m3 (depo kopyası).
import json, subprocess, sys, pathlib, shutil
sys.stdout.reconfigure(encoding="utf-8")
root = pathlib.Path(sys.argv[1]); per_file = int(sys.argv[2])
d = json.load(open(root / "reports/mutation.json", encoding="utf-8"))
out = []
for name, f in sorted(d["files"].items()):
    path = root / name
    test = str(pathlib.Path(name).with_suffix(".test.ts")).replace("\\", "/")
    src = path.read_text(encoding="utf-8")
    muts = sorted(f["mutants"], key=lambda m: (m["location"]["start"]["line"], m["location"]["start"]["column"]))
    step = max(1, len(muts) // per_file)
    sample = muts[::step][:per_file]
    lines = src.split("\n")
    offs = [0]
    for l in lines: offs.append(offs[-1] + len(l) + 1)
    pos = lambda p: offs[p["line"] - 1] + p["column"] - 1
    for m in sample:
        a, b = pos(m["location"]["start"]), pos(m["location"]["end"])
        mutated = src[:a] + m["replacement"] + src[b:]
        path.write_text(mutated, encoding="utf-8")
        try:
            r = subprocess.run(["npx", "vitest", "run", test], cwd=root, capture_output=True, text=True,
                               encoding="utf-8", errors="replace", timeout=300, shell=True)
            status = "caught" if r.returncode != 0 else "MISSED"
        except subprocess.TimeoutExpired:
            status = "timeout"
        finally:
            path.write_text(src, encoding="utf-8")
        line = m["location"]["start"]["line"]
        row = f"{status}\t{name}:{line}\t{m['mutatorName']}\t{src[a:b][:60]!r} -> {m['replacement'][:60]!r}\tstryker={m['status']}"
        print(row, flush=True); out.append(row)
(root / "reports/ts_manual.tsv").write_text("\n".join(out), encoding="utf-8")
