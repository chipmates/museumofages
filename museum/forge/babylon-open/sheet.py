# A contact sheet of the flight's frames: one frame every N seconds, labelled with the second, the height and the speed.
#   python3 sheet.py <frames folder> <out.jpg> [--every 1 --w 240 --cols 8 --from 0 --to 99]
import glob, json, os, sys
from PIL import Image, ImageDraw
a = sys.argv[1:]
d, out = a[0], a[1]
opt = {a[i][2:]: a[i + 1] for i in range(2, len(a) - 1) if a[i].startswith('--')}
every, w, cols = float(opt.get('every', 1)), int(opt.get('w', 240)), int(opt.get('cols', 8))
log, fps = {}, 24
for f in sorted(glob.glob(os.path.join(d, 'frames-*.json'))):
    j = json.load(open(f))
    fps = j['fps']
    for fr in j['frames']:
        log[fr['i']] = fr
last = max(log) / fps
ts, t = [], float(opt.get('from', 0))
while t <= min(last, float(opt.get('to', 1e9))) + 1e-6:
    ts.append(t)
    t += every
first = Image.open(os.path.join(d, 'f%05d.jpg' % round(ts[0] * fps)))
h = round(w * first.height / first.width)
rows = (len(ts) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, rows * (h + 14)), (16, 16, 16))
dr = ImageDraw.Draw(sheet)
for k, t in enumerate(ts):
    i = round(t * fps)
    p = os.path.join(d, 'f%05d.jpg' % i)
    if not os.path.exists(p):
        continue
    im = Image.open(p).convert('RGB').resize((w, h), Image.LANCZOS)
    x, y = (k % cols) * w, (k // cols) * (h + 14)
    sheet.paste(im, (x, y + 14))
    fr = log.get(i, {})
    dr.text((x + 3, y + 1), f"{t:.0f}s +{fr.get('level', 0):.0f} {fr.get('speed', 0):.0f}m/s", fill=(230, 230, 230))
sheet.save(out, quality=88)
print(out, sheet.size)
