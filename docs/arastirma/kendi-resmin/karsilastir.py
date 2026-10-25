# Yan yana karşılaştırma ve şerit (çıktılar depo dışında kalır: örnek kareler telifli).
# Kullanım:
#   python3 karsilastir.py <ad> <önizleme öneki> <ilk kare> <çıktı.png>
#       solda örnek video karesi, sağda önizleme (aynı ses anı), 1080p ölçeğinde çizgi bölgesi, 8 satır
#   python3 karsilastir.py serit <önizleme öneki> <çıktı.png>
#       strip_a.png düzeni: 8 ardışık kare, satır başına karenin çizgi bölgesi, yanlarda koyu dolgu
import sys
import numpy as np
from PIL import Image, ImageDraw

if sys.argv[1] == 'serit':
    prefix, out = sys.argv[2], sys.argv[3]
    img = Image.new('RGB', (1356, 1200))
    for i in range(8):
        im = Image.open(f'{prefix}-{i:03d}.png').convert('RGB')
        W, H = im.size
        band = im.crop((0, round(0.405 * H), W, round(0.65 * H))).resize((1084, 150), Image.LANCZOS)
        row = Image.new('RGB', (1356, 150), (58, 46, 48))
        row.paste(band, (136, 0))
        img.paste(row, (0, i * 150))
    img.save(out)
    sys.exit()

v, prefix, i0, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
a = np.load(v + '-crop.npy', mmap_mode='r')
S = 1920 / 2168
Y0, Y1 = 440, 900  # 1080p satırları
half = (Y1 - Y0) // 2
rows = []
for i in range(8):
    ref = Image.fromarray(np.array(a[i0 + i])).resize((1920, round(700 * S)), Image.LANCZOS)
    off = round(520 * S)
    ref = ref.crop((0, Y0 - off, 1920, Y1 - off))
    ours = Image.open(f'{prefix}-{i:03d}.png').convert('RGB').crop((0, Y0, 1920, Y1))
    row = Image.new('RGB', (1920, half))
    row.paste(ref.resize((960, half)), (0, 0))
    row.paste(ours.resize((960, half)), (960, 0))
    rows.append(row)
img = Image.new('RGB', (1920, len(rows) * half + 30), (16, 16, 16))
d = ImageDraw.Draw(img)
d.text((10, 8), 'ornek video (sol)', fill=(255, 255, 255))
d.text((970, 8), 'Lyraska onizleme (sag), ayni ses ani', fill=(255, 255, 255))
for i, r in enumerate(rows):
    img.paste(r, (0, 30 + i * half))
img.save(out)
