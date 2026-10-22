import os,re,sys
root=sys.argv[1]
g={}
for dp,dn,fn in os.walk(root):
    for f in fn:
        if not re.search(r'\.(ts|tsx)$',f) or '.test.' in f: continue
        p=os.path.normpath(os.path.join(dp,f))
        deps=[]
        for m in re.finditer(r'''from\s+["'](\.[^"']+)["']''',open(p).read()):
            t=os.path.normpath(os.path.join(dp,m.group(1)))
            for ext in ['.ts','.tsx','/index.ts']:
                if os.path.exists(t+ext): deps.append(t+ext);break
        g[p]=deps
# Tarjan
idx={};low={};st=[];on=set();out=[];c=[0]
sys.setrecursionlimit(10000)
def sc(v):
    idx[v]=low[v]=c[0];c[0]+=1;st.append(v);on.add(v)
    for w in g.get(v,[]):
        if w not in idx: sc(w);low[v]=min(low[v],low[w])
        elif w in on: low[v]=min(low[v],idx[w])
    if low[v]==idx[v]:
        comp=[]
        while True:
            w=st.pop();on.discard(w);comp.append(w)
            if w==v:break
        if len(comp)>1: out.append(comp)
for v in g:
    if v not in idx: sc(v)
print("dosya:",len(g),"döngü:",out)
