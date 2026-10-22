import sys, time
f = sys.argv[1]
need = sys.argv[2:]
seen = 0
while True:
    lines = open(f, encoding="utf-8").read().splitlines()
    for l in lines[max(seen, 1):]:
        c = l.split("\t")
        print(c[0], c[2], c[3], c[4][:180] if len(c) > 4 else "", flush=True)
    seen = max(seen, len(lines))
    names = {l.split("\t")[0] for l in lines}
    if all(n in names for n in need):
        break
    time.sleep(5)
