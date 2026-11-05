import sys; sys.stdout.reconfigure(encoding="utf-8")
import re, subprocess, sys
num = re.compile(r'-?\d[\d_]*(?:\.\d+)?(?:e-?\d+)?')
out = subprocess.run(['git','log','-p','-U0','--no-merges','--format=@@@%h %ad %s','--date=short','--','src-tauri/src','src-tauri/tests','src'],capture_output=True,text=True,encoding='utf-8',errors='replace').stdout
commit=None; f=None; minus=[]; res=[]
kw = re.compile(r'assert|expect\(|toBeLessThan|toBeGreaterThan|toBeCloseTo|const [A-Z_]+|TOLERANCE|LIMIT|MAX_|MIN_|<=|>=|< |> ')
def flush(plus):
    global minus
    for a,b in zip(minus,plus):
        if a==b: continue
        if num.sub('#',a).strip()==num.sub('#',b).strip() and kw.search(b):
            res.append((commit,f,a.strip(),b.strip()))
    minus=[]
plus=[]
for line in out.splitlines():
    if line.startswith('@@@'):
        flush(plus); plus=[]; commit=line[3:]; continue
    if line.startswith('+++ '): f=line[6:]; continue
    if line.startswith('--- '): continue
    if line.startswith('@@'):
        flush(plus); plus=[]; continue
    if line.startswith('-'): minus.append(line[1:])
    elif line.startswith('+'): plus.append(line[1:])
flush(plus)
for r in res: print(' | '.join(r))
print(len(res), file=sys.stderr)
