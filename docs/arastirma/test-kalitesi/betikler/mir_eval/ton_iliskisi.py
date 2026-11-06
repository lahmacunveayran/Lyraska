"""Ton ilişkisi kuralı (Lyraska testi, beşli yalnız yukarı alınınca) mir_eval key.weighted_score'la aynı mı?"""
# Çalıştırma: pip install mir_eval==0.8.2; python -I ton_iliskisi.py (beklenen çıktı: uyuşmayan 0 / 576).
import mir_eval
names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
score_of = {"same": 1.0, "fifth": 0.5, "relative": 0.3, "parallel": 0.2, "other": 0.0}
bad = 0
for mt in range(12):
    for mm in (False, True):
        for t in range(12):
            for m in (False, True):
                d = (t - mt) % 12
                if d == 0 and m == mm: c = "same"
                elif m == mm and d == 7: c = "fifth"
                elif (not mm and m and d == 9) or (mm and not m and d == 3): c = "relative"
                elif d == 0: c = "parallel"
                else: c = "other"
                ref = f"{names[mt]} {'minor' if mm else 'major'}"; est = f"{names[t]} {'minor' if m else 'major'}"
                if mir_eval.key.weighted_score(ref, est) != score_of[c]: bad += 1; print(ref, est, c)
print("uyuşmayan:", bad, "/ 576")
