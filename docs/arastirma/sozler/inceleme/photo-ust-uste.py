#!/usr/bin/env python3
"""photo-ust-uste.inc.mjs'i check-scenes.mjs'in geçici kopyasına ekleyip çalıştırır (önce `npm run build`).

Kullanım (depo kökünden): python3 docs/arastirma/sozler/inceleme/photo-ust-uste.py
Port 4179 başka denetimle çakışmasın diye kopya 4194'ü kullanır; kopya iş bitince silinir.
"""
import os
import subprocess

here = os.path.dirname(os.path.abspath(__file__))
src = open("scripts/check-scenes.mjs").read()
inc = open(os.path.join(here, "photo-ust-uste.inc.mjs")).read()
anchor = 'if (!ONLY || ONLY.includes("photo")) {'
assert src.count(anchor) == 1 and src.count("const PORT = 4179;") == 1
src = src.replace("const PORT = 4179;", "const PORT = 4194;")
src = src.replace(
    anchor,
    'if (ONLY?.includes("photooverlap")) add(() => checkPhotoLyricsOverlap(browser));\n  ' + anchor,
)
src += "\n" + inc
tmp = "scripts/.photo-ust-uste.tmp.mjs"
open(tmp, "w").write(src)
try:
    env = dict(os.environ, SCENE_ONLY="photooverlap")
    env.setdefault("SCENE_BROWSER_PATH", "/opt/pw-browsers/chromium")
    raise SystemExit(subprocess.run(["node", tmp], env=env).returncode)
finally:
    os.remove(tmp)
