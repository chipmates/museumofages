"""A frame's bands and seams, from its pixels: what share of the height is sky, textured scene and blank near plane,
where a row-wide tone step (a seam) crosses the ground, and what stands under the bottom rows' centre.

  python3 -I frame-bands.py bands <png> [--band 20] [--sky 0.2] [--grad 0.8] [--dark 110] [--all]
      rows in bands of --band, each with its mean horizontal luma gradient (on a 1.5 px blur) and mean luma.
      sky = the bands from the top with a gradient up to --sky (a sky's own is under 0.1, a haze horizon's over 0.3);
      near = the bands from the bottom with a gradient up to --grad whose mean luma is under --dark (a blank near
      plane); scene = the rest. Shares of the height.
  python3 -I frame-bands.py seams <png> [--from 0.5] [--step 4] [--share 0.3] [--gap 2]
      from the row --from (a share of the height) down: per row the share of columns whose luma moved more than --step
      levels between rows r-gap and r+gap, the larger of the up and down shares; rows over --share are seams.
  python3 -I frame-bands.py bottom <png> [--rows 40] [--x0 0.45] [--x1 0.55]
      the bottom rows' centre: mean RGB, mean horizontal gradient (joints read as gradient), mean luma.
Exit 0 always; the numbers are read against the round's written pass lines.
"""
import sys

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None


def luma(img):
    a = np.asarray(img.convert('RGB'), dtype=np.float64)
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def arg(name, default):
    if name in sys.argv:
        return type(default)(sys.argv[sys.argv.index(name) + 1])
    return default


def bands(path):
    band, skyg, grad, dark = arg('--band', 20), arg('--sky', 0.2), arg('--grad', 0.8), arg('--dark', 110.0)
    y = luma(Image.open(path).filter(ImageFilter.GaussianBlur(1.5)))
    h = y.shape[0]
    g = np.abs(np.diff(y, axis=1)).mean(axis=1)
    rows = []
    for r0 in range(0, h, band):
        r1 = min(h, r0 + band)
        rows.append((r0, r1, float(g[r0:r1].mean()), float(y[r0:r1].mean())))
    top = 0
    while top < len(rows) and rows[top][2] <= skyg:
        top += 1
    bot = len(rows)
    while bot > top and rows[bot - 1][2] <= grad and rows[bot - 1][3] < dark:
        bot -= 1
    sky = (rows[top - 1][1] if top else 0) / h
    near = (h - rows[bot][0]) / h if bot < len(rows) else 0.0
    print(f'{path}')
    print(f'sky {100 * sky:.1f} %  scene {100 * (1 - sky - near):.1f} %  near {100 * near:.1f} %  (band {band}, sky {skyg}, grad {grad}, dark {dark})')
    if '--all' in sys.argv:
        for r0, r1, gg, ll in rows:
            print(f'  rows {r0:5d}-{r1:5d}  grad {gg:5.2f}  luma {ll:6.1f}')


def seams(path):
    frm, step, share, gap = arg('--from', 0.5), arg('--step', 4.0), arg('--share', 0.3), arg('--gap', 2)
    y = luma(Image.open(path))
    h = y.shape[0]
    r0 = int(frm * h)
    found, worst = [], (0.0, 0)
    for r in range(max(r0, gap), h - gap):
        d = y[r + gap] - y[r - gap]
        s = max(float((d > step).mean()), float((d < -step).mean()))
        if s > worst[0]:
            worst = (s, r)
        if s > share:
            found.append((r, s))
    print(f'{path}')
    print(f'rows {r0}-{h - 1}: worst row {worst[1]} with {100 * worst[0]:.1f} % of columns stepping over {step} levels (gap {gap}); seams over {100 * share:.0f} %: {len(found)}')
    # one line per run of neighbouring seam rows
    run = []
    for r, s in found + [(None, None)]:
        if run and (r is None or r - run[-1][0] > 2 * gap + 1):
            rr = [x[0] for x in run]
            print(f'  seam rows {rr[0]}-{rr[-1]}, peak {100 * max(x[1] for x in run):.1f} %')
            run = []
        if r is not None:
            run.append((r, s))


def bottom(path):
    n, x0, x1 = arg('--rows', 40), arg('--x0', 0.45), arg('--x1', 0.55)
    img = Image.open(path).convert('RGB')
    a = np.asarray(img, dtype=np.float64)
    h, w = a.shape[:2]
    c = a[h - n:, int(x0 * w):int(x1 * w)]
    y = luma(Image.fromarray(c.astype(np.uint8)))
    g = float(np.abs(np.diff(y, axis=1)).mean())
    m = c.reshape(-1, 3).mean(axis=0)
    print(f'{path}')
    print(f'bottom {n} rows, x {x0}-{x1}: rgb {m[0]:.0f},{m[1]:.0f},{m[2]:.0f}  luma {y.mean():.1f}  grad {g:.2f}')


if __name__ == '__main__':
    if len(sys.argv) < 3 or sys.argv[1] not in ('bands', 'seams', 'bottom'):
        print(__doc__)
        sys.exit(2)
    {'bands': bands, 'seams': seams, 'bottom': bottom}[sys.argv[1]](sys.argv[2])
