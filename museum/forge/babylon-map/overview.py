# One look at a stretch of the moving sketch: a frame every N seconds on one sheet, labelled with second, stop and kind.
#   python3 overview.py <frames folder> <out.jpg> [--every 4 --from 0 --to 9999 --w 160 --cols 12]
import json, os, sys, glob
from PIL import Image, ImageDraw

a = sys.argv[1:]
d, out = a[0], a[1]
opt = {a[i][2:]: a[i + 1] for i in range(2, len(a) - 1) if a[i].startswith('--')}
every, w, cols = float(opt.get('every', 4)), int(opt.get('w', 160)), int(opt.get('cols', 12))
frames = {}
fps = 8
for f in sorted(glob.glob(os.path.join(d, 'frames-*.json'))):
    log = json.load(open(f))
    fps = log['fps']
    for fr in log['frames']:
        frames[fr['i']] = fr
last = max(frames) / fps
t, ts = float(opt.get('from', 0)), []
while t <= min(last, float(opt.get('to', 1e9))) + 1e-6:
    ts.append(t)
    t += every
h = round(w * 9 / 16)
rows = (len(ts) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, rows * (h + 12)), (16, 16, 16))
dr = ImageDraw.Draw(sheet)
for k, t in enumerate(ts):
    i = round(t * fps)
    p = os.path.join(d, 'f%05d.jpg' % i)
    if not os.path.exists(p):
        continue
    x, y = (k % cols) * w, (k // cols) * (h + 12)
    sheet.paste(Image.open(p).resize((w, h), Image.LANCZOS), (x, y + 12))
    fr = frames.get(i, {})
    dr.text((x + 2, y), f"{t:.0f} s{fr.get('stop', '')} {fr.get('kind', '')[:4]} +{fr.get('y', 0):.0f}", fill=(230, 230, 230))
sheet.save(out, quality=82)
print(out, sheet.size, len(ts), 'frames')
