import sys,csv,datetime as dt
rows=[r for r in csv.reader(open(sys.argv[1]),delimiter='\t')]
P=lambda s: dt.datetime.fromisoformat(s.replace('Z','+00:00'))
ci=[r for r in rows if r[1]=='CI']
for t in rows:
    if t[1]!='Test sürümü' or t[2]!='workflow_run': continue
    tc=P(t[6]); best=min(ci,key=lambda c: abs((P(c[7])-tc).total_seconds()))
    d=(tc-P(best[7])).total_seconds()
    print(f"TS run {t[0]} GITHUB_SHA(head_sha)={t[4]} concl={t[5]} | tetikleyen CI {best[0]} {best[2]} {best[3]} {best[4]} {best[5]} (fark {d:.0f}s) {'AYNI' if best[4]==t[4] else 'FARKLI'}")
