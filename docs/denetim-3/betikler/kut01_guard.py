# scan.rs:157-167 mantığının birebir Python karşılığı (PureWindowsPath.starts_with = Path::starts_with)
from pathlib import PureWindowsPath as P
def removal_candidates(known, on_disk, untouched):
    return [p for p in known if p not in on_disk and not any(P(p).is_relative_to(u) for u in untouched)]
def scan(known, on_disk, unreadable, skipped):
    removed = removal_candidates(known, on_disk, unreadable + skipped)
    suspicious = len(removed) if known and len(removed) == len(known) else 0
    if suspicious: removed = []
    return removed, suspicious
# 0.0.50 ve öncesinde E:\ kökünden taranmış kütüphane: 1000 şarkı + çöp kutusundan 3 kayıt (KUT-05)
known = [f"E:\\Muzik\\{i}.mp3" for i in range(1000)] + [f"E:\\$RECYCLE.BIN\\S-1-5-21\\$R{i}.mp3" for i in range(3)]
# E: harfini artık başka bir USB bellek almış: müzik yok, ama kendi $RECYCLE.BIN klasörü var
r, s = scan(known, set(), [], [P("E:\\$RECYCLE.BIN")])
print("başka disk + $RECYCLE.BIN var: silinen", len(r), "suspicious", s)
r, s = scan(known, set(), [], [])
print("başka disk, $RECYCLE.BIN yok : silinen", len(r), "suspicious", s)
