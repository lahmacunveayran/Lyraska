#!/usr/bin/env python3
"""Yeniden örnekleme ölçümü: dürtü yanıtından frekans yanıtı (geçirme dalgalanması, durdurma
bastırması), gecikme/hizalama, basamaklı sinüslerle THD+N ve yansıma, uzunluk."""
import csv
import os

import numpy as np

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "olcum")


def load(name):
    return np.fromfile(os.path.join(D, name), dtype="<f8")


man = list(csv.DictReader(open(os.path.join(D, "rs_manifest.csv"))))
pairs = sorted({(int(m["from"]), int(m["to"])) for m in man})
for frm, to in pairs:
    print(f"\n=== {frm} → {to} ===")
    imp = [m for m in man if m["kind"] == "impulse" and int(m["from"]) == frm and int(m["to"]) == to][0]
    y = load(imp["file"])
    expected_len = round(int(imp["in_len"]) * to / frm)
    k = int(np.argmax(np.abs(y)))
    # Darbe girişte 1,0 s'de: çıkışta `to` karesinde olmalı. Alt örnek konumu: ağırlık merkezi.
    seg = y[k - 50:k + 51]
    centroid = k - 50 + np.sum(np.arange(101) * seg ** 2) / np.sum(seg ** 2)
    print(f"uzunluk: çıkış {len(y)}, beklenen {expected_len} (fark {len(y)-expected_len})")
    print(f"darbe: giriş 1,000 s → çıkış en büyük örnek {k} ({k/to*1000:.3f} ms; beklenen {to} → {1000.0:.3f} ms), "
          f"enerji merkezi {centroid/to*1000:.3f} ms; parça boyutu 777 ile aynı mı: "
          f"{np.array_equal(y, load(imp['file'].replace('impulse', 'impulse777')))}")
    # Frekans yanıtı: dürtü yanıtının FFT'si (çıkış hızında). Tüm IR'yi al.
    n = 1 << 18
    H = np.fft.rfft(y, n)
    f = np.fft.rfftfreq(n, 1 / to)
    # Darbe (1 örnek) giriş hızında 1/frm s alan taşır; çıkış hızında to/frm örnek: ölçek düzeltilir.
    mag = 20 * np.log10(np.abs(H) + 1e-300) - 20 * np.log10(to / frm)
    nyq_in = frm / 2
    nyq_out = to / 2
    pb_top = min(20000, 0.9 * min(nyq_in, nyq_out))
    pb = (f >= 20) & (f <= pb_top)
    print(f"geçirme bandı 20 Hz–{pb_top:.0f} Hz: {mag[pb].min():+.4f}..{mag[pb].max():+.4f} dB")
    for edge in (0.8, 0.9, 0.95, 0.97, 0.99):
        fe = edge * min(nyq_in, nyq_out)
        i = int(np.argmin(np.abs(f - fe)))
        print(f"   {fe:8.0f} Hz ({edge:.2f}·Nyq): {mag[i]:+.3f} dB")
    if to < frm:
        print("durdurma bandı (giriş alanında): aşağıdaki Nyquist_out üstü tonların yansıma seviyesine bakın")
    else:
        sb = f >= nyq_in * 1.05
        print(f"görüntü bandı (>1,05·Nyq_in): en yüksek {mag[sb].max():.1f} dB")
    # Faz: geçirme bandında doğrusal fazdan sapma (grup gecikmesi düzlüğü).
    ph = np.unwrap(np.angle(H[pb]))
    fit = np.polyfit(f[pb], ph, 1)
    dev = ph - np.polyval(fit, f[pb])
    print(f"faz: grup gecikmesi {-fit[0]/(2*np.pi)*1000:.3f} ms; doğrusal fazdan sapma ±{np.max(np.abs(dev))*180/np.pi:.3f}°")
    # Basamaklı sinüsler.
    tones = [m for m in man if m["kind"] == "tone" and int(m["from"]) == frm and int(m["to"]) == to]
    worst_thdn, worst_f = -999, 0
    alias = []
    for m in tones:
        freq = float(m["freq"])
        y = load(m["file"])
        a, b = int(0.2 * to), len(y) - int(0.2 * to)
        seg = y[a:b]
        t = np.arange(a, b) / to
        # Çıkışta beklenen frekans: fs_out/2 üstü yansımaz (süzülmeli); yansıma varsa to - freq'te.
        if freq < nyq_out:
            A = np.stack([np.sin(2 * np.pi * freq * t), np.cos(2 * np.pi * freq * t)], axis=1)
            c, *_ = np.linalg.lstsq(A, seg, rcond=None)
            amp = np.hypot(*c)
            res = seg - A @ c
            thdn = 20 * np.log10(np.sqrt(np.mean(res ** 2)) / (0.5 / np.sqrt(2)))
            gain = 20 * np.log10(amp / 0.5)
            if thdn > worst_thdn:
                worst_thdn, worst_f = thdn, freq
            if freq > 0.9 * nyq_out or freq < 30:
                print(f"   ton {freq:9.1f} Hz: kazanç {gain:+.3f} dB, THD+N {thdn:.1f} dB")
        else:
            level = 20 * np.log10(np.sqrt(np.mean(seg ** 2)) / (0.5 / np.sqrt(2)) + 1e-300)
            alias.append((freq, level))
    print(f"basamaklı sinüsler: en kötü THD+N {worst_thdn:.1f} dB @ {worst_f:.0f} Hz")
    if alias:
        print("   Nyquist_out üstü tonların çıkıştaki toplam seviyesi (yansıma bastırması):")
        for freq, lvl in alias:
            print(f"      {freq:8.0f} Hz → {lvl:.1f} dB")
    for m in man:
        if m["kind"] == "length" and int(m["from"]) == frm and int(m["to"]) == to:
            exp = round(int(m["in_len"]) * to / frm)
            print(f"uzunluk {m['in_len']} kare → {m['out_len']} (beklenen {exp}, fark {int(m['out_len'])-exp})")
