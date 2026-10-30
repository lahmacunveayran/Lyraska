# Kayıttan çizgi bölgesinin karelerini, kare zamanlarını ve sesi çıkarır (telifli: yalnız scratchpad'de).
# Kullanım: python3 cikar.py <kayıt.mp4> <ad> <W> <H> <X0> <Y0>
#   → veri/<ad>-crop.npy (kare × H × W × 3), veri/<ad>-pts.json, veri/<ad>.st.f32 (44,1 kHz iki kanal),
#     veri/<ad>.f32 ((L+R)/2 tek kanal: spectrum.rs mono_mix gibi)
import json, subprocess, sys
import numpy as np
src, name = sys.argv[1], sys.argv[2]
W, H, X0, Y0 = map(int, sys.argv[3:7])
o = 'veri/' + name
cmd = ['ffmpeg', '-v', 'error', '-i', src, '-vf', f'crop={W}:{H}:{X0}:{Y0}', '-fps_mode', 'passthrough',
       '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
raw = subprocess.run(cmd, capture_output=True, check=True).stdout
n = len(raw) // (W * H * 3)
np.save(o + '-crop.npy', np.frombuffer(raw, np.uint8)[:n * W * H * 3].reshape(n, H, W, 3))
pts = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time',
                      '-of', 'csv=p=0', src], capture_output=True, text=True, check=True).stdout.split()
json.dump([float(p.strip(',')) for p in pts if p.strip(',')], open(o + '-pts.json', 'w'))
# Ses akışının başlangıcı (video zamanıyla hizalamak için)
st = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=start_time',
                     '-of', 'csv=p=0', src], capture_output=True, text=True, check=True).stdout.split()[0].strip(',')
json.dump({'audio_start': float(st)}, open(o + '-meta.json', 'w'))
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', '2', '-ar', '44100', '-af', 'aresample=resampler=soxr',
                '-f', 'f32le', o + '.st.f32'], check=True)
s = np.fromfile(o + '.st.f32', '<f4').reshape(-1, 2).astype(np.float64)
s.mean(axis=1).astype('<f4').tofile(o + '.f32')
print(name, n, 'kare; ses başı', st, 's;', len(s) / 44100, 's ses')
