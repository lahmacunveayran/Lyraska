#!/usr/bin/env python3
"""Mutasyon deneyi: ürün kodunda geçici bir değişiklik yapar, derler, söz denetimini çalıştırır, geri alır.

Kullanım: mutate.py <ad> [<dosya> <eski> <yeni>]... [--args "<tarayıcı argümanları>"]
Çalışma kopyasının kökünden çalıştırılır. Not: derleme (dist/) mutasyonlu kalır; iş bitince
`npm run build` yeniden çalıştırılır.

Örnek (127885e üzerinde): flushSync kaldırılınca denetim düşer:
  python3 docs/arastirma/sozler/inceleme/mutasyon.py noflush src/hooks/usePlayer.ts \
    "flushSync(() => setLive(positionNow(at)));" "setLive(positionNow(at)); void flushSync;"
"""
import os
import subprocess
import sys

# Günlükler ve denetim betiği (port çakışmasın diye PORT değiştirilmiş kopya verilebilir).
S = os.environ.get("OUT", "/tmp")
CHECK = os.environ.get("CHECK", "scripts/check-scenes.mjs")
argv = sys.argv[1:]
args = ""
if "--args" in argv:
    i = argv.index("--args")
    args = argv[i + 1]
    argv = argv[:i] + argv[i + 2 :]
name = argv[0]
edits = [argv[i : i + 3] for i in range(1, len(argv), 3)]
originals = {}
try:
    for f, old, new in edits:
        s = originals.setdefault(f, open(f).read()) if f not in originals else open(f).read()
        c = s.count(old)
        assert c == 1, f"{f}: eşleşme {c}"
        open(f, "w").write(s.replace(old, new))
    b = subprocess.run(["npm", "run", "build"], capture_output=True, text=True)
    if b.returncode:
        print("derleme hatası", b.stdout[-2000:], b.stderr[-2000:])
        sys.exit(1)
finally:
    for f, s in originals.items():
        open(f, "w").write(s)
env = dict(os.environ, SCENE_ONLY="lyrics", SCENE_BROWSER_PATH="/opt/pw-browsers/chromium",
           SCENE_BROWSER_ARGS=args)
r = subprocess.run(["node", CHECK], capture_output=True, text=True, env=env,
                   timeout=1500)
out = r.stdout + r.stderr
open(f"{S}/run-{name}.log", "w").write(out)
print(f"== {name} (çıkış {r.returncode})")
lines = [l for l in out.splitlines() if l.strip()]
for l in lines[-14:]:
    print(l[:400])
