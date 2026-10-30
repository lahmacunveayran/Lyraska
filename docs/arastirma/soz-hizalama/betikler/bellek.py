"""Bir komutu çalıştırır; duvar saati süresini ve tepe belleğini (alt süreç, MB) yazar.
Kullanım: python bellek.py <komut> [argümanlar...]"""
import resource, subprocess, sys, time
t = time.time()
r = subprocess.run(sys.argv[1:])
el = time.time() - t
mb = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / 1024
print(f"BELLEK süre_sn={el:.1f} tepe_mb={mb:.0f} çıkış={r.returncode}", file=sys.stderr)
