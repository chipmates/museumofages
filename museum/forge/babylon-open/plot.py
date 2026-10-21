# A top view of the flight over the plan: bodies by height, houses, water, the way by second, the look every 2 s.
#   python3 plot.py <plot.json> <out.png> [--box E0,N0,E1,N1] [--px 0.5]
import json, sys
from PIL import Image, ImageDraw
a = sys.argv[1:]
d = json.load(open(a[0]))
opt = {a[i][2:]: a[i + 1] for i in range(2, len(a) - 1) if a[i].startswith('--')}
E0, N0 = d['frame']['E0'], d['frame']['N0']
box = [float(v) for v in opt.get('box', '444900,3599300,446300,3601500').split(',')]
mpp = float(opt.get('px', 1.0))
W, H = int((box[2] - box[0]) / mpp), int((box[3] - box[1]) / mpp)
im = Image.new('RGB', (W, H), (232, 226, 214))
dr = ImageDraw.Draw(im)
def P(x, z):
    E, N = x + E0, N0 - z
    return ((E - box[0]) / mpp, (box[3] - N) / mpp)
for w in d['water']:
    dr.polygon([P(x, z) for x, z in w], fill=(120, 160, 190))
for h in d['houses']:
    dr.polygon([P(x, z) for x, z in h], fill=(190, 180, 165))
for s in d['solids']:
    v = max(0, min(1, (s['y1'] - 0) / 40))
    c = (int(180 - 120 * v), int(150 - 100 * v), int(120 - 80 * v))
    dr.polygon([P(x, z) for x, z in s['poly']], fill=c, outline=(40, 30, 20))
path = d['path']
for i in range(1, len(path)):
    t, x, y, z, yaw = path[i]
    col = (int(255 * min(1, y / 400)), 40, int(255 * (1 - min(1, y / 400))))
    dr.line([P(path[i - 1][1], path[i - 1][3]), P(x, z)], fill=col, width=3)
import math
for t, x, y, z, yaw in path:
    if abs(t - round(t)) < 1e-6:
        cx, cy = P(x, z)
        dr.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], outline=(0, 0, 0))
        dr.text((cx + 6, cy - 6), f"{int(round(t))}s {y:.0f}", fill=(0, 0, 0))
        if int(round(t)) % 2 == 0:
            r = 60 / mpp
            dr.line([(cx, cy), (cx + r * math.sin(math.radians(yaw)), cy - r * math.cos(math.radians(yaw)))], fill=(0, 120, 0), width=2)
for p in d['points']:
    cx, cy = P(p[0], p[2])
    dr.rectangle([cx - 3, cy - 3, cx + 3, cy + 3], outline=(200, 0, 0))
im.save(a[1])
print(a[1], im.size)
