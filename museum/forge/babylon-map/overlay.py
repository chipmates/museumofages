# The plan's footprints over an Uppsala sheet, top view: blue water, red blocks and walls, green street.
#   python3 overlay.py <dump.json> <sheet raster> <sheet> <E0> <N0> <E1> <N1> <scale> <out.png>
import sys, json
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS = None
SHEETS = {'centre': (404, 385, 445300, 3601100, 2.830), 'east': (410, 447, 445400, 3601400, 1.4870), 'areas': (545, 558, 444500, 3603500, 0.6355), 'exc': (535, 557, 444500, 3603500, 0.6355)}
dump, raster, sheet = sys.argv[1], sys.argv[2], sys.argv[3]
e0, n0, e1, n1, scale = map(float, sys.argv[4:9]); out = sys.argv[9]
X0, Y0, E0, N0, K = SHEETS[sheet]
px = lambda e: X0 + (e - E0) * K
py = lambda n: Y0 + (N0 - n) * K
d = json.load(open(dump))
im = Image.open(raster).convert('RGB')
box = (int(px(e0)), int(py(n1)), int(px(e1)), int(py(n0)))
c = im.crop(box)
c = Image.blend(c, Image.new('RGB', c.size, (255, 255, 255)), 0.45)
c = c.resize((int(c.width * scale), int(c.height * scale)), Image.LANCZOS)
dr = ImageDraw.Draw(c, 'RGBA')
P = lambda p: ((px(p[0]) - box[0]) * scale, (py(p[1]) - box[1]) * scale)
for w in d['water']:
    dr.polygon([P(p) for p in w['poly']], fill=(40, 110, 255, 50), outline=(40, 110, 255, 200))
pts = [P(s['at']) for s in d['street']]
dr.line(pts, fill=(0, 170, 60, 230), width=max(1, int(3 * scale)))
for b in d['boxes']:
    col = (255, 140, 0, 150) if b['group'] == 'house' else (200, 0, 160, 220)
    dr.polygon([P(p) for p in b['poly']], outline=col)
for p in d['prisms']:
    dr.polygon([P(q) for q in p['poly']], outline=(230, 0, 0, 230))
    for h in p['holes']:
        dr.polygon([P(q) for q in h], outline=(230, 0, 0, 160))
for r in d['ramps']:
    dr.line([P(r['a']), P(r['b'])], fill=(120, 0, 200, 230), width=2)
for k in range(int(e0 // 50 + 1) * 50, int(e1), 50):
    x = (px(k) - box[0]) * scale; dr.text((x + 2, 2), str(k)[-4:], fill=(0, 0, 0, 255))
for k in range(int(n0 // 50 + 1) * 50, int(n1), 50):
    y = (py(k) - box[1]) * scale; dr.text((2, y + 2), str(k)[-4:], fill=(0, 0, 0, 255))
c.save(out); print(out, c.size)
