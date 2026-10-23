#!/usr/bin/env python3
"""B-GUV mutasyon sürücüsü: tohum dosyalardan mutantlar üretir, koşumu toplu çalıştırır,
panik / zaman aşımı / dev bellek isteği / çökme (abort) bulgularını sınıflandırır.

Kullanım: fuzz.py <kip> <tohum klasörü> <çıktı klasörü> <mutant sayısı/tohum> [tohum uzantı süzgeci]
"""
import os, random, struct, subprocess, sys, time, collections, shutil, json

HARNESS = "/home/user/denetim-bagimsiz/target/debug/examples/b_guv_fuzz"
BATCH = 150
PROC_TIMEOUT = 40 * BATCH  # koşumun kendi zaman aşımı dosya başına 40 s

MAGIC_U32 = [0, 1, 2, 7, 8, 0x7F, 0xFF, 0x100, 0x7FFF, 0xFFFF, 0x10000, 0x7FFFFFFF, 0x80000000,
             0xFFFFFFFE, 0xFFFFFFFF, 0x0FFFFFFF, 0x3FFFFFFF]
MAGIC_U16 = [0, 1, 2, 0xFF, 0x100, 0x7FFF, 0x8000, 0xFFFF]
MAGIC_U64 = [0, 1, 0x7FFFFFFFFFFFFFFF, 0x8000000000000000, 0xFFFFFFFFFFFFFFFF, 1 << 40]


def mutate(data: bytes, rng: random.Random) -> bytes:
    b = bytearray(data)
    n = len(b)
    if n == 0:
        return bytes(b)
    kind = rng.randrange(10)
    if kind == 0:  # bit çevirme (birkaç)
        for _ in range(rng.randint(1, 8)):
            i = rng.randrange(n)
            b[i] ^= 1 << rng.randrange(8)
    elif kind == 1:  # rastgele bayt
        for _ in range(rng.randint(1, 16)):
            b[rng.randrange(n)] = rng.randrange(256)
    elif kind == 2:  # kesme
        b = b[: rng.randrange(1, n)] if n > 1 else b
    elif kind == 3:  # 32 bit sihirli (LE ve BE)
        for _ in range(rng.randint(1, 4)):
            i = rng.randrange(max(1, n - 4))
            v = rng.choice(MAGIC_U32)
            b[i:i + 4] = struct.pack("<I" if rng.random() < 0.5 else ">I", v)
    elif kind == 4:  # 16 bit sihirli
        for _ in range(rng.randint(1, 4)):
            i = rng.randrange(max(1, n - 2))
            v = rng.choice(MAGIC_U16)
            b[i:i + 2] = struct.pack("<H" if rng.random() < 0.5 else ">H", v)
    elif kind == 5:  # 64 bit sihirli
        i = rng.randrange(max(1, n - 8))
        v = rng.choice(MAGIC_U64)
        b[i:i + 8] = struct.pack("<Q" if rng.random() < 0.5 else ">Q", v)
    elif kind == 6:  # parça silme
        i = rng.randrange(n); j = min(n, i + rng.randint(1, 512))
        del b[i:j]
    elif kind == 7:  # parça çoğaltma
        i = rng.randrange(n); j = min(n, i + rng.randint(1, 512))
        at = rng.randrange(n)
        b[at:at] = b[i:j]
    elif kind == 8:  # başlık alanına odaklı (ilk 512 bayt) sihirli
        lim = min(n, 512)
        for _ in range(rng.randint(1, 6)):
            i = rng.randrange(max(1, lim - 4))
            if rng.random() < 0.5:
                b[i:i + 4] = struct.pack("<I" if rng.random() < 0.5 else ">I", rng.choice(MAGIC_U32))
            else:
                b[i:i + 2] = struct.pack("<H" if rng.random() < 0.5 else ">H", rng.choice(MAGIC_U16))
    else:  # birleşik
        for _ in range(rng.randint(2, 4)):
            b = bytearray(mutate(bytes(b), rng))
    return bytes(b)


def run_batch(mode, files, log):
    """Koşumu bir toplu dosyayla çalıştırır; (sonuçlar, çöken dosya, stderr) döner."""
    results = {}
    remaining = list(files)
    findings = []
    while remaining:
        cmd = [HARNESS, mode] + remaining
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, errors="replace",
                               timeout=PROC_TIMEOUT)
        except subprocess.TimeoutExpired as e:
            out = e.stdout or ""; err = e.stderr or ""; code = -999
        else:
            out, err, code = p.stdout, p.stderr, p.returncode
        last_begin = None
        for line in out.splitlines():
            if line.startswith("BEGIN "):
                last_begin = line[6:]
            elif line.startswith(("OK ", "PANIC ", "TIMEOUT ")):
                tag, rest = line.split(" ", 1)
                path = rest.split(" ms=")[0]
                results[path] = line
                if tag != "OK":
                    findings.append((tag, path, line, err.strip().splitlines()[-1:] ))
        panics = [l for l in err.splitlines() if l.startswith("PANIC_AT")]
        # Panik satırlarını OK olmayan sonuçlarla eşle (sırayla).
        pi = 0
        for f in findings:
            if f[0] == "PANIC" and f[3] == [] and pi < len(panics):
                pass
        if code == 0:
            break
        # Çökme (abort / OOM / zaman aşımı): son BEGIN'den sonrakiler bekliyor.
        if last_begin is None:
            break
        crashed = last_begin
        if crashed not in results:
            tail = err.strip().splitlines()[-3:]
            findings.append(("ABORT" if code != 124 else "TIMEOUT", crashed,
                             f"ABORT code={code}", tail))
            results[crashed] = f"ABORT code={code}"
        idx = remaining.index(crashed) if crashed in remaining else len(remaining) - 1
        remaining = remaining[idx + 1:]
        log.write(err)
    return results, findings


def main():
    mode, seed_dir, out_dir, per_seed = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    ext_filter = sys.argv[5].split(",") if len(sys.argv) > 5 else None
    rng = random.Random(20261022)
    os.makedirs(out_dir, exist_ok=True)
    mut_dir = os.path.join(out_dir, "mutants"); crash_dir = os.path.join(out_dir, "crashes")
    shutil.rmtree(mut_dir, ignore_errors=True)
    os.makedirs(mut_dir); os.makedirs(crash_dir, exist_ok=True)
    seeds = sorted(f for f in os.listdir(seed_dir) if os.path.isfile(os.path.join(seed_dir, f)))
    if ext_filter:
        seeds = [s for s in seeds if s.rsplit(".", 1)[-1].lower() in ext_filter]
    files = []
    for s in seeds:
        data = open(os.path.join(seed_dir, s), "rb").read()
        stem, ext = (s.rsplit(".", 1) + [""])[:2]
        orig = os.path.join(mut_dir, f"{stem}__orig.{ext}")
        open(orig, "wb").write(data); files.append(orig)
        for i in range(per_seed):
            m = mutate(data, rng)
            p = os.path.join(mut_dir, f"{stem}__m{i:05d}.{ext}")
            open(p, "wb").write(m); files.append(p)
    print(f"{len(seeds)} tohum, {len(files)} girdi, kip={mode}", flush=True)
    t0 = time.time()
    all_findings = []
    stats = collections.Counter()
    peak_max = 0; slow = []
    with open(os.path.join(out_dir, "stderr.log"), "w") as log:
        for i in range(0, len(files), BATCH):
            batch = files[i:i + BATCH]
            results, findings = run_batch(mode, batch, log)
            for path, line in results.items():
                tag = line.split(" ", 1)[0]
                stats[tag] += 1
                if " peak=" in line:
                    pk = int(line.split(" peak=")[1].split("MB")[0]); peak_max = max(peak_max, pk)
                    if pk > 512: slow.append(("PEAK", pk, path))
                if " ms=" in line:
                    ms = int(line.split(" ms=")[1].split(" ")[0])
                    if ms > 10000: slow.append(("SLOW", ms, path))
            for f in findings:
                all_findings.append(f)
                shutil.copy(f[1], crash_dir)
            print(f"  {i + len(batch)}/{len(files)} {dict(stats)} bulgular={len(all_findings)}", flush=True)
    dt = time.time() - t0
    summary = {"mode": mode, "inputs": len(files), "seconds": round(dt, 1), "stats": dict(stats),
               "peak_max_mb": peak_max, "findings": [list(f) for f in all_findings],
               "slow_or_big": slow[:50]}
    json.dump(summary, open(os.path.join(out_dir, "summary.json"), "w"), indent=1, ensure_ascii=False)
    print(json.dumps(summary, indent=1, ensure_ascii=False)[:6000])


if __name__ == "__main__":
    main()
