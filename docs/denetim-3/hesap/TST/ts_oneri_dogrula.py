"""Önerilen TS testlerinin (denetim_tst.test.ts) kaçan P10 ve X12 mutantlarını yakaladığını gösterir.
Çalıştırma: python3 -I ts_oneri_dogrula.py <depo_kökü>"""
import pathlib
import subprocess
import sys

root = pathlib.Path(sys.argv[1])
cases = [
    ("P10", "src/lib/parametric.ts", "den = add(add(s2, scale(s, k)), [a, 0]);", "den = add(add(s2, scale(s, k)), one);"),
    ("X12", "src/lib/crossfeed.ts", "const x = hz / settings.cutoffHz;", "const x = hz / (2 * settings.cutoffHz);"),
]
for ident, rel, old, new in cases:
    path = root / rel
    original = path.read_text(encoding="utf-8")
    assert original.count(old) == 1
    try:
        path.write_text(original.replace(old, new), encoding="utf-8")
        p = subprocess.run(["npx", "vitest", "run", "src/lib/denetim_tst.test.ts"], cwd=root, capture_output=True, text=True)
    finally:
        path.write_text(original, encoding="utf-8")
    line = [l.strip() for l in p.stdout.splitlines() if "Tests " in l]
    print(ident, "YAKALANDI" if p.returncode else "KACTI", line[-1] if line else "")
