import subprocess, shutil, os, json, time
ROOT="/home/user/denetim-bagimsiz/calisma/B-SUR/kopya"
Q=f"{ROOT}/src/lib/queue.ts"; F=f"{ROOT}/src/lib/format.ts"
TESTS=["src/lib/library.test.ts","src/lib/format.test.ts","src/hooks/usePlayback.test.ts"]
MUT=[
 ("Q1 nextInQueue: '< length' → '<= length' (bir fazla ilerler)", Q, "queue.index + 1 < queue.paths.length", "queue.index + 1 <= queue.paths.length"),
 ("Q2 previousInQueue: '> 0' → '>= 0' (başta da geri gider)", Q, "queue.index > 0 ?", "queue.index >= 0 ?"),
 ("Q3 queueFrom: listede olmayan şarkı tek başına sıra olmaz", Q, "index < 0 ? { paths: [path], index: 0 }", "index < 0 ? { paths, index: 0 }"),
 ("Q4 followQueue: çalan şarkı denetimi kaldırıldı", Q, "next && playingPath !== null && currentPath(next) === playingPath ? next : queue", "next ? next : queue"),
 ("Q5 upcomingPath: 'çalan sıradaki mi' denetimi kaldırıldı", Q, "if (playingPath === null || currentPath(queue) !== playingPath) return null;", "if (playingPath === null) return null;"),
 ("Q6 RESTART_THRESHOLD_SECONDS 3 → 0", Q, "RESTART_THRESHOLD_SECONDS = 3;", "RESTART_THRESHOLD_SECONDS = 0;"),
 ("F1 formatTime: 'h > 0' → 'h >= 0' (0:03:45)", F, "return h > 0 ?", "return h >= 0 ?"),
 ("F2 progress: 0..1 kıskacı kaldırıldı", F, "return Math.min(1, Math.max(0, positionSecs / durationSecs));", "return positionSecs / durationSecs;"),
 ("F3 titleScale: sınır 14 → 15", F, "if (length <= 14) return \"xl\";", "if (length <= 15) return \"xl\";"),
 ("F4 formatDb: '0 dB' özel durumu kaldırıldı", F, "if (rounded === 0) return \"0 dB\";", ""),
 ("F5 fileStem: 'dot > 0' → 'dot >= 0' (.gizli → boş)", F, "return dot > 0 ? name.slice(0, dot) : name;", "return dot >= 0 ? name.slice(0, dot) : name;"),
 ("F6 signalPathText: takılma '> 0' → '>= 0'", F, "status.underruns > 0 ?", "status.underruns >= 0 ?"),
 ("F7 trackTitle: '&&' → '||'", F, "if (track.title && track.artist) return", "if (track.title || track.artist) return"),
]
orig={p:open(p).read() for p in (Q,F)}
results=[]
for name,path,old,new in MUT:
    src=orig[path]
    assert src.count(old)==1, (name, src.count(old))
    open(path,"w").write(src.replace(old,new))
    t=time.time()
    r=subprocess.run(["npx","vitest","run",*TESTS],cwd=ROOT,capture_output=True,text=True)
    open(path,"w").write(src)
    out=r.stdout+r.stderr
    import re
    m=re.search(r"Tests\s+(\d+) failed",out)
    failed=int(m.group(1)) if m else 0
    status="YAKALANDI" if r.returncode!=0 else "HAYATTA KALDI"
    results.append((name,status,failed,round(time.time()-t,1)))
    print(f"{status:14} {name}  (başarısız test: {failed}, {round(time.time()-t,1)} s)",flush=True)
for p in (Q,F): open(p,"w").write(orig[p])
alive=[r for r in results if r[1]!="YAKALANDI"]
print(f"\nToplam {len(results)} mutant, yakalanan {len(results)-len(alive)}, hayatta kalan {len(alive)}")
