# The flight's motion read from its frames: the mean change frame to frame (0 to 255, on a 160 px grey copy), per second its
# mean and peak, and the steps where the change jumps against its neighbours (a lurch or a pop).
#   python3 motion.py <frames folder> [--json out]
import glob, json, os, sys
from PIL import Image
import numpy as np
d = sys.argv[1]
fps = 12
for f in sorted(glob.glob(os.path.join(d, 'frames-*.json'))):
    fps = json.load(open(f))['fps']
files = sorted(glob.glob(os.path.join(d, 'f*.jpg')))
prev, ch = None, []
for p in files:
    im = Image.open(p).convert('L')
    im = np.asarray(im.resize((160, round(160 * im.height / im.width)), Image.BILINEAR), dtype=np.float32)
    if prev is not None:
        ch.append(float(np.abs(im - prev).mean()))
    prev = im
ch = np.array(ch)
print(f'{len(files)} frames at {fps} fps; change per frame: mean {ch.mean():.2f}, top {ch.max():.2f} at {np.argmax(ch) / fps:.2f} s')
for s in range(int(len(ch) / fps) + 1):
    seg = ch[s * fps:(s + 1) * fps]
    if len(seg):
        print(f'{s:3d} s  mean {seg.mean():5.2f}  peak {seg.max():5.2f}')
# a jump: a step more than twice the mean of its four neighbours and over 3 levels
jumps = [(i / fps, round(float(ch[i]), 2)) for i in range(2, len(ch) - 2) if ch[i] > 3 and ch[i] > 2 * np.mean([ch[i - 2], ch[i - 1], ch[i + 1], ch[i + 2]])]
print('jumps', jumps if jumps else 'none')
if '--json' in sys.argv:
    json.dump({'fps': fps, 'change': ch.tolist(), 'jumps': jumps}, open(sys.argv[sys.argv.index('--json') + 1], 'w'))
