import re, sys, pathlib
root = pathlib.Path(sys.argv[1])
def body_at(src, i):
    j = src.index('{', i); d = 0
    for k in range(j, len(src)):
        c = src[k]
        if c == '{': d += 1
        elif c == '}':
            d -= 1
            if d == 0: return src[j:k+1]
    return src[j:]
total = 0; weak = []
for f in list(root.glob('src-tauri/src/**/*.rs')) + list(root.glob('src-tauri/tests/*.rs')):
    s = f.read_text(encoding='utf-8')
    for m in re.finditer(r'#\[test\]\s*(?:#\[[^\]]*\]\s*)*fn\s+(\w+)', s):
        total += 1
        b = body_at(s, m.end())
        if re.search(r'assert|panic!|should_panic|expect_err|unwrap_err|matches!|\bcheck_|\bverify|\bensure|\bexpect_', b + s[m.start():m.end()]):
            continue
        weak.append((str(f.relative_to(root)), s[:m.start()].count('\n')+1, m.group(1), len(b.splitlines())))
print('rust tests', total, 'without assert-ish', len(weak))
for w in weak: print(*w)
ttotal = 0; tweak = []
for f in list(root.glob('src/**/*.test.ts')) + list(root.glob('src/**/*.test.tsx')) + list(root.glob('scripts/**/*.test.*')):
    s = f.read_text(encoding='utf-8')
    for m in re.finditer(r'\b(?:it|test)\(\s*[\'"`]', s):
        ttotal += 1
        try: b = body_at(s, m.end())
        except ValueError: continue
        if re.search(r'expect|assert|toThrow|rejects|\bcheck', b): continue
        tweak.append((str(f.relative_to(root)), s[:m.start()].count('\n')+1, s[m.end():m.end()+60].split('\n')[0]))
print('ts tests', ttotal, 'without expect', len(tweak))
for w in tweak: print(*w)
