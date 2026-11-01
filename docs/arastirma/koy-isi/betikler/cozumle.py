import json, sys, os, re, statistics as st, collections
sys.stdout.reconfigure(encoding="utf-8")
R = r"D:\LyraskaVeri\koy-isi\sonuc"
rows = [json.loads(l) for l in open(os.path.join(R, "sonuclar.jsonl"), encoding="utf-8")]

# 1) Aynı kaydın iki biçimi
groups = collections.defaultdict(list)
for r in rows:
    groups[os.path.splitext(os.path.basename(r["yol"]))[0]].append(r)
pairs = [g for g in groups.values() if len(g) == 2]
bpm_same = bpm_oct = bpm_close = key_same = drop_same = 0
drop_match = drop_total = 0
bad = []
for a, b in pairs:
    ba, bb = a.get("bpm"), b.get("bpm")
    if ba and bb:
        q = ba / bb
        if abs(q - 1) <= 0.005: bpm_same += 1
        elif abs(q - 1) <= 0.02: bpm_close += 1
        elif abs(q - 2) < 0.05 or abs(q - 0.5) < 0.02: bpm_oct += 1; bad.append(("oktav", a, b))
        else: bad.append(("tempo", a, b))
    if a.get("ton") == b.get("ton"): key_same += 1
    else: bad.append(("ton", a, b))
    da, db = a.get("drop") or [], b.get("drop") or []
    if len(da) == len(db): drop_same += 1
    for t in da:
        drop_total += 1
        if any(abs(t - u) <= 1.0 for u in db): drop_match += 1
print(f"Çift: {len(pairs)}; tempo aynı (±%0,5) {bpm_same}, yakın (±%2) {bpm_close}, oktav farkı {bpm_oct}; ton aynı {key_same}; drop sayısı aynı {drop_same}; drop zamanı ±1 sn eşleşen {drop_match}/{drop_total}")
for kind, a, b in bad:
    print("  ", kind, os.path.basename(a["yol"])[:60], a.get("bpm"), b.get("bpm"), a.get("ton"), b.get("ton"), a.get("ton_guveni"), b.get("ton_guveni"))

# 2) Diğer işaretler
mc = [r.get("olcu_guveni") for r in rows if r.get("olcu_guveni") is not None]
print("Ölçü güveni dağılımı:", collections.Counter(round(x, 1) for x in mc).most_common())
print("Ölçü:", collections.Counter(r.get("olcu") for r in rows))
print("Tempo yok:", [os.path.basename(r["yol"])[:60] for r in rows if r.get("bpm") is None])
slow = sorted(rows, key=lambda r: -r.get("analiz_sn", 0))[:3]
print("En yavaş analiz:", [(os.path.basename(r["yol"])[:40], round(r["analiz_sn"], 1), r.get("sure")) for r in slow])

# 3) Sözler: işaretli farkları yeniden hesapla (vtt ↔ programın lrc'si)
def vtt_lines(text):
    def stamp(s):
        t = 0.0
        for p in s.strip().replace(",", ".").split(":"):
            t = t * 60 + float(p)
        return t
    out, start = [], None
    for raw in text.splitlines():
        l = raw.strip()
        if "-->" in l:
            start = stamp(l.split("-->")[0].split()[0]); continue
        if start is None: continue
        if not l: start = None; continue
        c = re.sub(r"<[^>]*>", "", l).replace("♪", "").replace("♫", "").replace("&amp;", "&").strip()
        if not c or c.startswith("[") or c.startswith("("): continue
        if any(c == x for _, x in out[-2:]): continue
        out.append((start, c))
    return out

def norm(t):
    return " ".join("".join(ch for ch in t if ch.isalnum() or ch.isspace()).lower().split())

signed_all, per_song = [], []
for r in rows:
    s = r.get("soz")
    if not s or "hata" in s: continue
    stem = os.path.splitext(os.path.basename(r["yol"]))[0]
    lrc = os.path.join(R, "sozler", stem + ".lrc")
    src = os.path.join(os.path.dirname(r["yol"]), s["kaynak"])
    if not (os.path.exists(lrc) and os.path.exists(src)): continue
    truth = vtt_lines(open(src, encoding="utf-8", errors="replace").read())
    found = []
    for l in open(lrc, encoding="utf-8", errors="replace"):
        m = re.match(r"\[(\d+):(\d+\.\d+)\](.)\s*([\d.]+)\s\s(.*)", l.rstrip("\n"))
        if m:
            found.append((int(m[1]) * 60 + float(m[2]), m[3], float(m[4]), m[5].strip()))
    j, errs = 0, []
    for t, mark, conf, text in found:
        if mark == "-": continue
        w = norm(text)
        for k in range(j, len(truth)):
            if norm(truth[k][1]) == w:
                errs.append((t - truth[k][0], mark, conf)); j = k + 1; break
    if errs:
        e = [x[0] for x in errs]
        per_song.append((stem, len(found), len(errs), st.median(e), st.median(abs(x) for x in e), s.get("ozet", "")))
        signed_all += errs

e = [x[0] for x in signed_all]
print(f"\nSöz: {len(per_song)} şarkı, {len(e)} satır karşılaştırıldı")
print(f"  işaretli ortanca {st.median(e):+.2f} sn (artı = program geç), ortalama {st.mean(e):+.2f}")
ae = sorted(abs(x) for x in e)
for lim in (0.25, 0.5, 1, 2, 5):
    print(f"  ±{lim} sn içinde: %{100 * sum(x <= lim for x in ae) / len(ae):.0f}")
for name, sel in (("güvenli", lambda x: x[1] == " "), ("tahmini (~)", lambda x: x[1] == "~")):
    sub = [abs(x[0]) for x in signed_all if sel(x)]
    if sub:
        print(f"  {name}: {len(sub)} satır, ortanca |hata| {st.median(sub):.2f} sn, ±1 sn içinde %{100 * sum(v <= 1 for v in sub) / len(sub):.0f}")
hi = [abs(x[0]) for x in signed_all if x[1] == " " and x[2] >= 0.9]
print(f"  güven ≥ 0,9: {len(hi)} satır, ±1 sn içinde %{100 * sum(v <= 1 for v in hi) / max(1, len(hi)):.0f}")
verdicts = collections.Counter(re.search(r"hüküm (\w+)", p[5]).group(1) if re.search(r"hüküm (\w+)", p[5]) else "?" for p in per_song)
print("  hükümler:", verdicts)
per_song.sort(key=lambda p: -p[4])
print("  en kötü 8 şarkı (ortanca |hata|):")
for p in per_song[:8]:
    print(f"    {p[4]:6.1f} sn  işaretli {p[3]:+6.1f}  {p[2]}/{p[1]} satır  {p[0][:60]}")
song_med = sorted(p[4] for p in per_song)
print("  şarkı başına ortanca |hata| dağılımı: ≤0,5 sn", sum(x <= .5 for x in song_med), "≤1", sum(x <= 1 for x in song_med), ">3", sum(x > 3 for x in song_med))
speeds = [float(m) for p in per_song for m in re.findall(r"\(([\d.]+)× gerçek zaman\)", p[5])]
if speeds: print("  model hızı (× gerçek zaman):", round(st.median(speeds), 2))

print("\n--- ek ---")
# drop eşleşmeyenlerin güveni
miss_c, hit_c = [], []
for a, b in pairs:
    for x, y in ((a, b), (b, a)):
        for t, c in zip(x.get("drop") or [], x.get("drop_guveni") or []):
            (hit_c if any(abs(t - u) <= 1.0 for u in (y.get("drop") or [])) else miss_c).append(c)
print(f"drop güveni: eşleşen ortanca {st.median(hit_c):.2f}, eşleşmeyen ortanca {st.median(miss_c):.2f}; eşleşmeyenlerin %{100*sum(c<0.5 for c in miss_c)/len(miss_c):.0f}'i < 0,5")
# yüksek tempolu türler yavaş bulunmuş mu
kw = re.compile(r"hardstyle|hands up|nightcore|frenchcore|hardcore|dnb|drum ?& ?bass|speed|phonk|psy", re.I)
sus = [(r.get("bpm"), os.path.basename(r["yol"])[:70]) for r in rows if r.get("bpm") and r["bpm"] < 110 and kw.search(r["yol"])]
print(f"hızlı türde (başlıkta) 110'un altında tempo: {len(sus)}")
for s in sus[:25]: print("  ", s)
# söz: en az 10 satırı karşılaştırılan şarkılar, hükme göre güvenli satırlar
by = collections.defaultdict(list)
songs10 = 0
for r in rows:
    s = r.get("soz")
    if not s or "hata" in s: continue
    stem = os.path.splitext(os.path.basename(r["yol"]))[0]
    m = [p for p in per_song if p[0] == stem]
    if not m or m[0][2] < 10: continue
    songs10 += 1
    v = re.search(r"hüküm (\w+)", s.get("ozet", ""))
    by[v.group(1) if v else "?"].append(m[0])
print(f"en az 10 satırlı şarkı: {songs10}")
for v, lst in by.items():
    meds = sorted(p[4] for p in lst)
    print(f"  {v}: {len(lst)} şarkı; şarkı ortancası |hata| ≤1 sn olan {sum(x<=1 for x in meds)}, >3 sn {sum(x>3 for x in meds)}")
