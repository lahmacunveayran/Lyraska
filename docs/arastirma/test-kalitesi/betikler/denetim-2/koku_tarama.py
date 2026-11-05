"""Test kokusu taraması (Rust + TypeScript).

Kullanım: py -3.8 -I koku_tarama.py D:/Lyraska > koku.txt
Her test gövdesi çıkarılır, doğrulama sayılır, zayıf doğrulama kalıpları işaretlenir.
"""
import os
import re
import sys
import subprocess
from collections import Counter

ROOT = sys.argv[1]

ASSERT_RS = re.compile(r"\b(assert(_eq|_ne)?!|prop_assert|debug_assert)")
# zayıf: yalnızca var/yok, ok/hata, boş değil
WEAK_RS = re.compile(
    r"assert!\(\s*[^;]*\.(is_ok|is_some|is_err|is_none)\(\)\s*[,)]"
    r"|assert!\(\s*![^;]*\.is_empty\(\)\s*[,)]"
)
PANIC_HELPERS = re.compile(r"\.(unwrap|expect)\(")


def git_files(patterns):
    out = subprocess.check_output(["git", "-C", ROOT, "ls-files"] + patterns, text=True)
    return [l for l in out.splitlines() if l.strip()]


def extract_bodies(text, start_pat):
    """start_pat ile başlayan her test için (satır, ad, gövde) döndürür."""
    res = []
    for m in start_pat.finditer(text):
        i = text.find("{", m.end())
        if i < 0:
            continue
        depth = 0
        j = i
        while j < len(text):
            c = text[j]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        line = text.count("\n", 0, m.start()) + 1
        res.append((line, m.group("name"), text[i : j + 1]))
    return res


RS_TEST = re.compile(r"#\[test\]\s*(?:#\[[^\]]*\]\s*)*fn\s+(?P<name>\w+)")
TS_TEST = re.compile(r"^\s*(?:it|test)(?:\.each\([^)]*\))?\(\s*(?P<q>['\"`])(?P<name>.*?)(?P=q)", re.M)


def helper_asserts(text):
    """Dosyadaki assert içeren yardımcı fonksiyon adları (testler onları çağırabilir)."""
    names = set()
    for m in re.finditer(r"fn\s+(\w+)\s*(?:<[^>]*>)?\(", text):
        i = text.find("{", m.end())
        if i < 0:
            continue
        depth = 0
        j = i
        while j < len(text):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        if ASSERT_RS.search(text[i:j]):
            names.add(m.group(1))
    return names


def main():
    rs = git_files(["src-tauri/src", "src-tauri/tests", "src-tauri/examples"])
    rs = [f for f in rs if f.endswith(".rs")]
    total = 0
    no_assert = []
    weak_only = []
    per_count = Counter()
    for f in rs:
        text = open(os.path.join(ROOT, f), encoding="utf-8").read()
        helpers = helper_asserts(text)
        for line, name, body in extract_bodies(text, RS_TEST):
            total += 1
            n = len(ASSERT_RS.findall(body))
            calls_helper = any(re.search(r"\b" + h + r"\s*\(", body) for h in helpers)
            per_count[min(n, 5)] += 1
            has_should_panic = False
            if n == 0 and not calls_helper:
                no_assert.append((f, line, name, len(PANIC_HELPERS.findall(body))))
            elif n > 0:
                asserts = [a for a in re.findall(r"assert(?:_eq|_ne)?!\((.*?)\);", body, re.S)]
                weak = WEAK_RS.findall(body)
                if asserts and len(weak) == len(asserts) and not calls_helper:
                    weak_only.append((f, line, name))
    print("RUST testleri:", total)
    print("doğrulama sayısı dağılımı (5 = 5+):", dict(sorted(per_count.items())))
    print("\nassert içermeyen ve assert'li yardımcı çağırmayan testler:", len(no_assert))
    for f, line, name, u in no_assert:
        print(f"  {f}:{line} {name} (unwrap/expect: {u})")
    print("\nyalnızca is_ok/is_some/is_err/is_none/!is_empty doğrulayan testler:", len(weak_only))
    for f, line, name in weak_only:
        print(f"  {f}:{line} {name}")

    ts = [f for f in git_files(["src"]) if re.search(r"\.test\.tsx?$", f)]
    tt = 0
    ts_no = []
    ts_weak = []
    for f in ts:
        text = open(os.path.join(ROOT, f), encoding="utf-8").read()
        for m in TS_TEST.finditer(text):
            tt += 1
            # gövde: bir sonraki test başlangıcına kadar (yaklaşık)
            nxt = TS_TEST.search(text, m.end())
            body = text[m.end() : nxt.start() if nxt else len(text)]
            line = text.count("\n", 0, m.start()) + 1
            exp = re.findall(r"expect(?:\.\w+)?\(", body)
            if not exp:
                ts_no.append((f, line, m.group("name")))
                continue
            matchers = re.findall(r"\)\s*(?:\.not)?\.(to\w+)\(", body)
            if matchers and all(
                mm in ("toBeDefined", "toBeTruthy", "toBeInTheDocument", "not") for mm in matchers
            ) and all(mm != "not" for mm in matchers):
                ts_weak.append((f, line, m.group("name"), Counter(matchers)))
    print("\nTS testleri (it/test):", tt)
    print("expect içermeyen TS testleri (yaklaşık; yardımcı çağırıyor olabilir):", len(ts_no))
    for f, line, name in ts_no:
        print(f"  {f}:{line} {name}")
    print("\nyalnızca toBeDefined/toBeTruthy/toBeInTheDocument doğrulayan TS testleri:", len(ts_weak))
    for f, line, name, c in ts_weak:
        print(f"  {f}:{line} {name} {dict(c)}")


main()
