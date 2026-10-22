"""components.test.tsx'i 5 kez çalıştırır; her turda sonuç, makine yükü ve 5 sn zaman aşımına en yakın
testler (vitest verbose süreleri) yazılır. Çalıştırma: python3 -I kararlilik_vitest.py <depo_kökü>"""
import os
import re
import subprocess
import sys

root = sys.argv[1]
ansi = re.compile(r"\x1b\[[0-9;]*m")
for i in range(1, 6):
    load = open("/proc/loadavg").read().split()[0]
    p = subprocess.run(["npx", "vitest", "run", "src/components/components.test.tsx", "--reporter=verbose"],
                       cwd=root, capture_output=True, text=True)
    out = ansi.sub("", p.stdout + p.stderr)
    times = [(int(m.group(2)), m.group(1).strip()) for m in re.finditer(r"[✓×] (.+?) (\d+)ms", out)]
    times.sort(reverse=True)
    summary = [l.strip() for l in out.splitlines() if l.strip().startswith(("Tests ", "Duration"))]
    print(f"tur {i}: çıkış {p.returncode}, {os.cpu_count()} çekirdek, başlangıç yükü {load}; {' | '.join(summary)}")
    for ms, name in times[:5]:
        print(f"    {ms:6d} ms  {name[:110]}")
    sys.stdout.flush()
