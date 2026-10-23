import re,os,sys
prod=sys.argv[1]; full=sys.argv[2]
files={}
for dp,dn,fn in os.walk(prod):
    for f in fn:
        if f.endswith('.rs'): files[os.path.join(dp,f)]=open(os.path.join(dp,f)).read()
allprod='\n'.join(files.values())
fulltext=''
for dp,dn,fn in os.walk(full):
    for f in fn:
        if f.endswith('.rs'): fulltext+=open(os.path.join(dp,f)).read()
# also examples/tests
for extra in ['repo/src-tauri/examples','repo/src-tauri/tests']:
    for dp,dn,fn in os.walk(extra):
        for f in fn:
            if f.endswith('.rs'): fulltext+=open(os.path.join(dp,f)).read()
res=[]
for p,t in files.items():
    for m in re.finditer(r'pub(?:\(crate\))? fn (\w+)',t):
        n=m.group(1)
        cprod=len(re.findall(r'\b'+n+r'\b',allprod))
        if cprod<=1:
            call=len(re.findall(r'\b'+n+r'\b',fulltext))
            res.append((p.replace(prod+'/',''),n,call-1))
for r in sorted(res): print(*r)
