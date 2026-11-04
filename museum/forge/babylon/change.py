"""The change measure before any judge: a round whose stills barely move gets no judge.

Usage: python3 -I change.py <stills dir A> <stills dir B> [--min 1.0] [--over 12] [--blur 1.5] [--maps <dir>]

For every picture both folders hold under one name: both blurred (Gaussian, --blur px, so a re-render's noise and a
one-pixel shift do not count), then the share of pixels whose largest channel moved more than --over of 255, and the
box that holds them. JUDGE when one still changes --min percent or more, else NO JUDGE. Stills of different sizes
count as changed. --maps writes a change map per still (moved pixels white over B darkened). Exit 0 JUDGE, 2 NO JUDGE.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None


def moved(a_path, b_path, over=12, blur=1.5):
    a, b = Image.open(a_path).convert('RGB'), Image.open(b_path).convert('RGB')
    if a.size != b.size:
        return None, a.size, b.size
    if blur > 0:
        a, b = a.filter(ImageFilter.GaussianBlur(blur)), b.filter(ImageFilter.GaussianBlur(blur))
    m = np.abs(np.asarray(a, dtype=np.int16) - np.asarray(b, dtype=np.int16)).max(axis=2) > over
    return m, a.size, b.size


def measure(da, db, lo=1.0, over=12, blur=1.5, maps=None):
    pics = lambda d: {f for f in os.listdir(d) if f.lower().endswith(('.png', '.jpg', '.jpeg')) and not f.startswith(('SHEET', 'change-'))}
    names = sorted(pics(da) & pics(db))
    rows, top = [], 0.0
    for n in names:
        m, sa, sb = moved(os.path.join(da, n), os.path.join(db, n), over, blur)
        if m is None:
            rows.append((100.0, n, f'sizes differ {sa[0]}x{sa[1]} / {sb[0]}x{sb[1]}'))
            top = 100.0
            continue
        share = 100.0 * m.mean()
        top = max(top, share)
        if m.any():
            ys, xs = np.nonzero(m)
            where = f'x {xs.min()}-{xs.max()}, y {ys.min()}-{ys.max()}'
            if maps:
                os.makedirs(maps, exist_ok=True)
                out = (np.asarray(Image.open(os.path.join(db, n)).convert('RGB')) * 0.35).astype(np.uint8)
                out[m] = 255
                Image.fromarray(out).save(os.path.join(maps, f'change-{os.path.splitext(n)[0]}.png'))
        else:
            where = 'no pixel'
        rows.append((share, n, where))
    only = sorted(pics(da) ^ pics(db))
    return rows, top, only, ('JUDGE' if top >= lo else 'NO JUDGE')


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__)
    da, db, rest = argv[0], argv[1], argv[2:]
    o = {'--min': '1.0', '--over': '12', '--blur': '1.5', '--maps': None}
    for i in range(0, len(rest), 2):
        if rest[i] not in o or i + 1 >= len(rest):
            sys.exit(f'unknown argument {rest[i]!r}')
        o[rest[i]] = rest[i + 1]
    lo = float(o['--min'])
    rows, top, only, verdict = measure(da, db, lo, int(o['--over']), float(o['--blur']), o['--maps'])
    for share, n, where in sorted(rows, reverse=True):
        print(f'{share:7.3f} %  {n}: {where}')
    if only:
        print('in one folder only:', ' '.join(only))
    print(f'{verdict}: the largest change {top:.3f} % of a still\'s pixels (bar {lo} %, a pixel moved past {o["--over"]} of 255 after a {o["--blur"]} px blur), {len(rows)} stills')
    sys.exit(0 if verdict == 'JUDGE' else 2)


if __name__ == '__main__':
    main(sys.argv[1:])
