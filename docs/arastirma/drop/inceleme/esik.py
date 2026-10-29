"""Eşiğe göre gösterilen aday: gerçek drop (±1 vuruş) / yanlış. Belirsiz geçişler atılır. esik.py <olcum.txt> <set> <yöntem>"""
import json, re, sys
from pathlib import Path
text, folder, method = Path(sys.argv[1]).read_text(), Path(sys.argv[2]), sys.argv[3]
rows, marked = [], 0
for line in text.splitlines():
    m = re.match(rf"{method} (\S+): .*bulunan (.*?) · ±vuruş", line)
    if not m: continue
    t = json.loads((folder / f"{m.group(1)}.json").read_text()); beat = 60 / t["bpm"]; marked += len(t["drops"])
    for a, c in re.findall(r"([\d.]+)\(([\d.]+)\)", m.group(2)):
        a, c = float(a), float(c)
        if any(abs(a - u) <= 1 for u in t.get("belirsiz", [])): continue
        rows.append((c, any(abs(a - d) <= beat + 1e-9 for d in t["drops"])))
print(sys.argv[1], method, " ".join(f"≥{e}: {sum(y for c,y in rows if c>=e)}/{marked} yanlış {sum(not y for c,y in rows if c>=e)}" for e in (0.3, 0.4, 0.5, 0.6)))
