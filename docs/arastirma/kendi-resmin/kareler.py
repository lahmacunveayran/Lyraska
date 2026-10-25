# Örnek kayıttan (ekran kaydı, 2712×1220, ~24 kare/sn) çizgi bölgesinin karelerini, kare zamanlarını
# ve sesi çıkarır. Telifli kayıt, kareler ve ses depoya GİRMEZ: çalışma klasöründe kalır.
# Kullanım: python3 kareler.py <kayıt.mp4> <ad>   (ör. a) → <ad>-crop.npy, <ad>-pts.json, <ad>.f32,
#           <ad>.st.f32 (tek kanal ffmpeg karışımı = (L+R)/√2, iki kanal)
import json, subprocess, sys
import numpy as np

src, name = sys.argv[1], sys.argv[2]
W, H, X0, Y0 = 2168, 700, 272, 520  # 16:9 video alanı (yanlarda bulanık dolgu), çizgiden aşağısı
cmd = ['ffmpeg', '-v', 'error', '-i', src, '-vf', f'crop={W}:{H}:{X0}:{Y0}', '-fps_mode', 'passthrough',
       '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
raw = subprocess.run(cmd, capture_output=True, check=True).stdout
n = len(raw) // (W * H * 3)
np.save(name + '-crop.npy', np.frombuffer(raw, np.uint8)[:n * W * H * 3].reshape(n, H, W, 3))
pts = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time',
                      '-of', 'csv=p=0', src], capture_output=True, text=True, check=True).stdout.split()
json.dump([float(p) for p in pts], open(name + '-pts.json', 'w'))
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '44100', '-f', 'f32le', name + '.f32'], check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', '2', '-ar', '44100', '-f', 'f32le', name + '.st.f32'], check=True)
print(name, n, 'kare')
