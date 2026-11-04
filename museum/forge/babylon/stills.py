"""Babylon's still numbers: a contact sheet, the luma of each still, and two stills' medians side by side.

  python3 -I stills.py sheet <folder> [--out SHEET.jpg] [--width 2400]   every PNG/JPG in the folder on one sheet, names under each
  python3 -I stills.py stats <folder> [--md NUMBERS.md]                  median, p1, p99 of luma per still, with the build its sidecar names
  python3 -I stills.py compare <a.png> <b.png> [<a2.png> <b2.png> ...]   the medians of each pair and their difference in luma levels

Luma is Rec. 709 on the 8-bit values, rounded to a whole level, as the pages' own sidecars and the gate's measure.py
count it, so the numbers here and theirs agree.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None


def luma(path):
    a = np.asarray(Image.open(path).convert('RGB'), dtype=np.float64)
    return np.clip(np.round(0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]), 0, 255).astype(np.uint8)


def levels(path):
    """median, p1, p99 as the pages count them: the first level whose running count reaches the share"""
    hist = np.bincount(luma(path).ravel(), minlength=256)
    cum = np.cumsum(hist)
    n = cum[-1]
    at = lambda f: int(np.searchsorted(cum, f * n))
    return {'median': at(0.5), 'p1': at(0.01), 'p99': at(0.99), 'mean': round(float((hist * np.arange(256)).sum() / n), 2)}


def pictures(folder):
    return sorted(f for f in os.listdir(folder) if f.lower().endswith(('.png', '.jpg', '.jpeg')) and not f.startswith('SHEET'))


def font(size):
    try:
        return ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', size)
    except OSError:
        return ImageFont.load_default()


def sheet(folder, out, width=2400):
    names = pictures(folder)
    if not names:
        sys.exit(f'no stills in {folder}')
    cols = min(4, len(names))
    cell = (width - 10 * (cols + 1)) // cols
    thumbs = []
    for n in names:
        im = Image.open(os.path.join(folder, n)).convert('RGB')
        im.thumbnail((cell, cell))
        thumbs.append((n, im))
    rows = [thumbs[i:i + cols] for i in range(0, len(thumbs), cols)]
    heights = [max(t.height for _, t in r) + 34 for r in rows]
    S = Image.new('RGB', (width, sum(heights) + 10), (24, 24, 24))
    d = ImageDraw.Draw(S)
    y = 10
    for r, h in zip(rows, heights):
        for i, (n, t) in enumerate(r):
            x = 10 + i * (cell + 10)
            S.paste(t, (x, y))
            d.text((x + 2, y + t.height + 6), n, fill=(225, 225, 225), font=font(18))
        y += h
    S.save(out, quality=88)
    print(f'{out}: {len(names)} stills')


def build_of(path):
    side = os.path.splitext(path)[0] + '.json'
    if not os.path.exists(side):
        return '-'
    kit = json.load(open(side)).get('kit') or {}
    b = kit.get('build') or {}
    return (b.get('short', '-') + (' (changed)' if b.get('dirty') else '')) if b else '-'


def stats(folder, md=None):
    rows = []
    for n in pictures(folder):
        p = os.path.join(folder, n)
        w, h = Image.open(p).size
        rows.append((n, f'{w}x{h}', levels(p), build_of(p)))
    lines = ['| still | pixels | median | p1 | p99 | build |', '|---|---|---|---|---|---|']
    lines += [f'| {n} | {s} | {v["median"]} | {v["p1"]} | {v["p99"]} | {b} |' for n, s, v, b in rows]
    text = '\n'.join(lines) + '\n'
    if md:
        open(md, 'w').write(text)
    print(text, end='')
    return rows


def compare(paths):
    if len(paths) < 2 or len(paths) % 2:
        sys.exit('compare takes pairs: <a> <b> [<a> <b> ...]')
    out = []
    for a, b in zip(paths[0::2], paths[1::2]):
        la, lb = levels(a), levels(b)
        d = lb['median'] - la['median']
        out.append((a, b, la, lb, d))
        print(f'{os.path.basename(a)} median {la["median"]} (p1 {la["p1"]}, p99 {la["p99"]}) -> {os.path.basename(b)} median {lb["median"]} '
              f'(p1 {lb["p1"]}, p99 {lb["p99"]}): {d:+d} levels')
    return out


def main(argv):
    if not argv:
        sys.exit(__doc__)
    cmd, rest = argv[0], argv[1:]
    opt = {}
    pos = []
    i = 0
    while i < len(rest):
        if rest[i].startswith('--'):
            opt[rest[i]] = rest[i + 1]
            i += 2
        else:
            pos.append(rest[i])
            i += 1
    if cmd == 'sheet':
        sheet(pos[0], opt.get('--out', os.path.join(pos[0], 'SHEET.jpg')), int(opt.get('--width', 2400)))
    elif cmd == 'stats':
        stats(pos[0], opt.get('--md'))
    elif cmd == 'compare':
        compare(pos)
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])
