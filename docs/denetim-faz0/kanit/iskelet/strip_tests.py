import sys,re,os
root=sys.argv[1]
out=sys.argv[2]
for dp,dn,fn in os.walk(root):
    for f in fn:
        if not f.endswith('.rs'): continue
        p=os.path.join(dp,f)
        lines=open(p).read().split('\n')
        keep=[]
        i=0
        while i<len(lines):
            if lines[i].strip()=='#[cfg(test)]' and i+1<len(lines) and re.match(r'\s*(pub(\(crate\))?\s+)?mod \w+\s*\{',lines[i+1]):
                # skip brace block
                depth=0;j=i+1;started=False
                while j<len(lines):
                    depth+=lines[j].count('{')-lines[j].count('}')
                    if '{' in lines[j]: started=True
                    j+=1
                    if started and depth<=0: break
                keep.extend(['']*(j-i)); i=j; continue
            keep.append(lines[i]); i+=1
        rel=os.path.relpath(p,root)
        os.makedirs(os.path.join(out,os.path.dirname(rel)),exist_ok=True)
        open(os.path.join(out,rel),'w').write('\n'.join(keep))
