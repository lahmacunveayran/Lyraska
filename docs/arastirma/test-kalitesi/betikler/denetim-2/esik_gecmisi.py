"""git geçmişinde sayısal eşik değişikliklerini bulur.

Her commit'in diff'inde, aynı hunk içinde silinen ve eklenen satır çiftlerinden yalnızca sayıları
farklı olanları (sayılar çıkarılınca metni aynı kalanlar) listeler. Satırda assert, tolerans,
TOLERANCE, < , <= gibi karşılaştırma bulunması şartı aranır.
Kullanım: py -3.8 -I esik_gecmisi.py D:/Lyraska
"""
import re
import subprocess
import sys

ROOT = sys.argv[1]
NUM = re.compile(r"-?\d[\d_]*(?:\.\d[\d_]*)?(?:e-?\d+)?")
CMP = re.compile(r"assert|expect|TOLERANCE|toBeLessThan|toBeGreaterThan|toBeCloseTo|<=?|>=?|abs\(\)")


def run(*args):
    return subprocess.check_output(["git", "-C", ROOT] + list(args), text=True, encoding="utf-8", errors="replace")


commits = run("log", "--format=%H", "--no-merges").split()
for h in commits:
    meta = run("show", "-s", "--format=%h %ad %s", "--date=short", h).strip()
    diff = run("show", "--format=", "-U0", h, "--", "src-tauri/src", "src-tauri/tests", "src")
    found = []
    path = None
    minus, plus = [], []

    def flush():
        for m in minus:
            for p in plus:
                if NUM.sub("#", m) == NUM.sub("#", p) and m != p and CMP.search(m):
                    found.append((path, m.strip(), p.strip()))
                    break

    for line in diff.splitlines():
        if line.startswith("+++ "):
            flush()
            minus, plus = [], []
            path = line[6:]
        elif line.startswith("@@"):
            flush()
            minus, plus = [], []
        elif line.startswith("-") and not line.startswith("---"):
            minus.append(line[1:])
        elif line.startswith("+"):
            plus.append(line[1:])
    flush()
    if found:
        print("==", meta)
        for p, m, a in found:
            print("  ", p)
            print("     -", m[:160])
            print("     +", a[:160])
