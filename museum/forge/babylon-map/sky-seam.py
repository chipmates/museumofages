# THE SKY SEAM: the hardest horizontal edge across a whole frame (sky, haze and far ground).
#   python3 sky-seam.py <image or folder> [...]
# Row means of luma over the full width; the largest jump between rows two apart (at 1080 rows; scaled to
# the frame's height) anywhere in the frame's upper 70 percent. A building's edge spans part of a row
# and averages out; a band across the whole sky does not. Prints the jump, its row, and the rows' values.
import os, sys
from PIL import Image

def seam(path):
    im = Image.open(path).convert('L')
    w, h = im.size
    px = im.load()
    rows = [sum(px[x, y] for x in range(0, w, 2)) / len(range(0, w, 2)) for y in range(h)]
    gap = max(1, round(2 * h / 1080))
    best = (0, 0)
    for y in range(int(h * 0.7) - gap):
        d = rows[y + gap] - rows[y]
        if abs(d) > abs(best[0]):
            best = (d, y)
    return best, rows[best[1]], rows[best[1] + gap], h

files = []
for a in sys.argv[1:]:
    files += sorted(os.path.join(a, f) for f in os.listdir(a) if f.endswith(('.png', '.jpg'))) if os.path.isdir(a) else [a]
for f in files:
    (d, y), r0, r1, h = seam(f)
    print(f'{os.path.basename(f):40s} jump {d:+6.1f} at row {y:4d} of {h} ({r0:5.1f} -> {r1:5.1f})')
