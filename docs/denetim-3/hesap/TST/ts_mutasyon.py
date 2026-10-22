"""Elle TypeScript mutasyon testi: src/lib/parametric.ts ve src/lib/crossfeed.ts.

Her mutasyon tek bir metin değişikliğidir (eski metin dosyada tam bir kez geçmeli). Uygulanır, bu iki dosyayı
içe aktaran bütün test dosyaları (lib testleri + components.test.tsx) çalıştırılır, dosya HER durumda geri
yazılır. Sonuç ts_mutasyon.tsv'ye yazılır. Yük altında zaman aşımı yanlış "yakalandı" saymasın diye
--testTimeout=60000 kullanılır; önce mutasyonsuz temel çalıştırma yeşil olmalı.

Çalıştırma: python3 -I ts_mutasyon.py <depo_kökü>
"""
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(sys.argv[1])
OUT = pathlib.Path(__file__).with_name("ts_mutasyon.tsv")
TESTS = ["src/lib/parametric.test.ts", "src/lib/crossfeed.test.ts", "src/components/components.test.tsx"]

P = "src/lib/parametric.ts"
X = "src/lib/crossfeed.ts"
MUTANTS = [
    ("P01", P, "Math.log(hz / PEQ_MIN_HZ)", "Math.log(hz / PEQ_MAX_HZ)", "hzToX: yanlış referans frekansı"),
    ("P02", P, "clamped < 100 ? 0.1", "clamped <= 100 ? 0.1", "roundHz: sınır < → <="),
    ("P03", P, "clamped < 10000 ? 10 : 100", "clamped < 10000 ? 10 : 1000", "roundHz: 10 kHz üstü adım 100 → 1000"),
    ("P04", P, "return clamped < 1 ? Math.round", "return clamped < 2 ? Math.round", "roundQ: hassasiyet sınırı 1 → 2"),
    ("P05", P, "Math.pow(2, steps / 12)", "Math.pow(2, steps / 6)", "stepQ: oktavda 12 → 6 adım"),
    ("P06", P, "Math.asinh(1 / (2 * q))", "Math.asinh(1 / q)", "qToOctaves: formül"),
    ("P07", P, "Math.abs(band.gainDb) >= 0.005", "Math.abs(band.gainDb) > 0.005", "bandIsEffective: sınır >= → >"),
    ("P08", P, "band.enabled && (!kindHasGain", "band.enabled && (kindHasGain", "bandIsEffective: olumsuzlama kaldırıldı"),
    ("P09", P, "num = scale(add(add(s2, scale(s, k)), [a, 0]), a);", "num = add(add(s2, scale(s, k)), [a, 0]);", "analogDb alçak raf: dış A çarpanı yok"),
    ("P10", P, "den = add(add(s2, scale(s, k)), [a, 0]);", "den = add(add(s2, scale(s, k)), one);", "analogDb yüksek raf: payda sabiti A → 1"),
    ("P11", P, "num = add(sub(s2, scale(s, 1 / q)), one);", "num = add(add(s2, scale(s, 1 / q)), one);", "analogDb tüm geçiren: pay işareti"),
    ("P12", P, "den = add(add(s2, scale(s, 1 / (a * q))), one);", "den = add(add(s2, scale(s, a / q)), one);", "analogDb tepe: payda 1/(A·Q) → A/Q"),
    ("P13", P, "boostDb: Math.max(0, ...curveDb)", "boostDb: Math.max(...curveDb)", "önizleme: yükseltme 0'ın altına inebilir"),
    ("P14", P, "return Math.min(30, Math.max(PEQ_RANGE_DB", "return Math.min(36, Math.max(PEQ_RANGE_DB", "plotRangeDb: üst sınır 30 → 36"),
    ("P15", P, "Math.max(-PEQ_RANGE_DB, analogDb(band, band.freqHz))", "Math.max(-30, analogDb(band, band.freqHz))", "nodeDb: alt sınır"),
    ("P16", P, "maxBands: 20,", "maxBands: 16,", "PEQ_LIMITS.maxBands çekirdekten saptı"),
    ("P17", P, "maxGainDb: 24,", "maxGainDb: 30,", "PEQ_LIMITS.maxGainDb çekirdekten saptı"),
    ("P18", P, '  design: "matched",\n};', '  design: "rbj",\n};', "DEFAULT_PARAMETRIC tasarımı çekirdekten saptı"),
    ("P19", P, "!Number.isFinite(value) || value <= 0", "!Number.isFinite(value) || value < 0", "parseFrequency: 0 Hz kabul"),
    ("P20", P, '.replace(",", ".").replace("−", "-")', '.replace(",", ".")', "parseDecimal: Unicode eksi okunmaz"),
    ("P21", P, 'rounded > 0 ? "+" : "−"', 'rounded > 0 ? "−" : "+"', "formatDb: işaret ters"),
    ("P22", P, "export const PEQ_FREQ_MIN = 10;", "export const PEQ_FREQ_MIN = 20;", "PEQ_FREQ_MIN çekirdekten saptı"),
    ("X01", X, "Math.pow(10, -settings.levelDb / 20)", "Math.pow(10, -settings.levelDb / 10)", "r0: dB → oran yanlış"),
    ("X02", X, "im: (-r0 * x) / (1 + x * x)", "im: (r0 * x) / (1 + x * x)", "ρ sanal kısım işareti"),
    ("X03", X, "nearDb: -10 * Math.log10(denominator)", "nearDb: -20 * Math.log10(denominator)", "yakın kulak dB çarpanı"),
    ("X04", X, "minLevelDb: 1,", "minLevelDb: 0.5,", "CROSSFEED_LIMITS.minLevelDb çekirdekten saptı"),
    ("X05", X, "maxCutoffHz: 1200,", "maxCutoffHz: 1500,", "CROSSFEED_LIMITS.maxCutoffHz çekirdekten saptı"),
    ("X06", X, "return 1e6 / (2 * Math.PI * cutoffHz);", "return 1e6 / (Math.PI * cutoffHz);", "zaman farkı formülü"),
    ("X07", X, "Math.abs(p.cutoffHz - settings.cutoffHz) < 0.5", "Math.abs(p.cutoffHz - settings.cutoffHz) <= 100", "hazır ayar eşleşme toleransı"),
    ("X08", X, "Math.abs(p.levelDb - settings.levelDb) < 0.05", "Math.abs(p.levelDb - settings.levelDb) < 1", "hazır ayar seviye toleransı 0,05 → 1 dB"),
    ("X09", X, "const clamped = Math.min(0, Math.max(-floorDb", "const clamped = Math.min(6, Math.max(-floorDb", "eğri yolu üst kırpma 0 → +6 dB"),
    ("X10", X, "const responses = curveHz.map((hz) => crossfeedResponseDb(clean, hz));", "const responses = curveHz.map((hz) => crossfeedResponseDb(settings, hz));", "önizleme sınırlanmamış ayarla çizer"),
    ("X11", X, "export const CROSSFEED_FLOOR_DB = 36;", "export const CROSSFEED_FLOOR_DB = 30;", "eğri alanı alt sınırı"),
    ("X12", X, "const x = hz / settings.cutoffHz;", "const x = hz / (2 * settings.cutoffHz);", "ρ kesim frekansı iki katına"),
]


def run_tests():
    t0 = time.time()
    proc = subprocess.run(
        ["npx", "vitest", "run", "--testTimeout=60000", *TESTS],
        cwd=ROOT, capture_output=True, text=True,
    )
    tail = [l for l in (proc.stdout + proc.stderr).splitlines() if "Tests" in l and ("passed" in l or "failed" in l)]
    return proc.returncode, time.time() - t0, (tail[-1].strip() if tail else "")


def main():
    if "--denetle" in sys.argv:
        for ident, rel, old, *_ in MUTANTS:
            n = (ROOT / rel).read_text(encoding="utf-8").count(old)
            if n != 1:
                print("SORUN", ident, n)
        print(len(MUTANTS), "mutasyon")
        return
    code, dt, summary = run_tests()
    print(f"temel: çıkış {code}, {dt:.0f} sn, {summary}", flush=True)
    if code != 0:
        sys.exit("temel çalıştırma kırmızı; mutasyon sonuçları anlamsız olur")
    rows = ["kimlik\tdosya\tdegisiklik\tsonuc\tsure_sn\tozet"]
    for ident, rel, old, new, what in MUTANTS:
        path = ROOT / rel
        original = path.read_text(encoding="utf-8")
        if original.count(old) != 1:
            rows.append(f"{ident}\t{rel}\t{what}\tUYGULANAMADI ({original.count(old)} eşleşme)\t0\t")
            print(rows[-1], flush=True)
            continue
        try:
            path.write_text(original.replace(old, new), encoding="utf-8")
            code, dt, summary = run_tests()
        finally:
            path.write_text(original, encoding="utf-8")
        result = "YAKALANDI" if code != 0 else "KACTI"
        rows.append(f"{ident}\t{rel}\t{what}\t{result}\t{dt:.0f}\t{summary}")
        print(rows[-1], flush=True)
    OUT.write_text("\n".join(rows) + "\n", encoding="utf-8")


main()
