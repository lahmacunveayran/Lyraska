# Tam videodan (854×480, 30 kare/sn) çizgi bölgesinin en küçük bileşenini (olc.py'nin kullandığı) ve sesi çıkarır.
# Kullanım: python3 tam_cikar.py <video.mp4> <ad> <Y0> <H>  → veri/<ad>-min.npy (kare × H × 854, uint8),
#   veri/<ad>-pts.json, veri/<ad>.st.f32 (44,1 kHz iki kanal), veri/<ad>.f32 ((L+R)/2), veri/<ad>-meta.json
import json, subprocess, sys
import numpy as np
src, name, Y0, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
o = 'veri/' + name
W = int(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0', src],
                       capture_output=True, text=True).stdout.strip().strip(','))
p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-map', '0:v:0', '-vf', f'crop={W}:{H}:0:{Y0}', '-fps_mode', 'passthrough',
                      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
frames = []
fs = W * H * 3
while True:
    b = p.stdout.read(fs)
    if len(b) < fs: break
    frames.append(np.frombuffer(b, np.uint8).reshape(H, W, 3).min(axis=2))
np.save(o + '-min.npy', np.stack(frames))
n = len(frames)
json.dump([i / 30 for i in range(n)], open(o + '-pts.json', 'w'))
json.dump({'audio_start': 0.0}, open(o + '-meta.json', 'w'))
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-map', '0:a:0', '-ac', '2', '-ar', '44100', '-f', 'f32le', o + '.st.f32'], check=True)
s = np.fromfile(o + '.st.f32', '<f4').reshape(-1, 2).astype(np.float64)
s.mean(axis=1).astype('<f4').tofile(o + '.f32')
print(name, n, 'kare,', W, 'px;', len(s) / 44100, 's ses')
