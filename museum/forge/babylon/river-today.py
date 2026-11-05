"""TODAY'S RIVER AT THE BRIDGE for feature 10, read off the 2004 ASTER picture of the site (public domain).

The picture is registered by two landmarks it shows plainly, each against the walk's own plan (map-plan.json, UTM 38N):
the rebuilt South Palace's block over the palace's plan, and the mound of Babil over its traced courtyards. Two points
fix a similarity (scale, turn, shift); the tool says the scale and the turn it found, so a reader can hold them against
the sensor's own (15 m a pixel, the scene's columns turned about ten degrees off north on a descending pass). The water
is the picture's dark blue, the largest body inside the window; its two banks are read row by row and turned into UTM.

  python3 -I forge/babylon/river-today.py <aster jpg> <out .json> [--overlay <out .jpg>] [--plan <map-plan.json>]
  python3 -I forge/babylon/river-today.py --self-test

The course is today's, drawn from one picture of one day: never the course of any other year, never a measured line.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
PLAN = HERE.parent.parent / 'src/wings/babylon/map/map-plan.json'

# the landmarks' picture pixels, read by eye on 4x crops of the 1400 x 1556 file: each the middle of the pale body
LANDMARKS = {
    'south-palace': {'px': (722.5, 615.0), 'block': 'south-palace'},
    'babil': {'px': (712.5, 440.0), 'block': 'babil'},
}
# the road in the old bed (P2021 p. 23: the old riverbed dry, used as a modern road), its pale line read by eye on an
# 12x crop of the picture with the plan's river of 570 BC drawn over it: the road keeps inside that bed for its length
ROAD_PX = [(712.5, 645.0), (713.58, 657.5), (714.42, 665.83), (715.5, 672.5), (717.75, 680.83), (721.5, 688.33),
           (724.83, 695.0), (729.0, 700.83), (733.17, 705.83), (738.17, 711.67)]
# the window the course is read in, in UTM (wider than the plate, so a plate never ends on the trace's own end)
WINDOW = {'w': 444700.0, 'e': 445900.0, 's': 3599350.0, 'n': 3600650.0}


def plan_point(plan, block):
    """a block's middle in UTM, from its polygon or its rect"""
    b = next(x for x in plan['blocks'] if x['id'] == block)
    if 'rect' in b:
        return tuple(b['rect']['c'])
    pts = b.get('poly') or b.get('outline')
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)


def similarity(a_px, a_utm, b_px, b_utm):
    """px -> UTM from two pairs: picture y runs down, UTM north up. Returns (fn, metres per pixel, turn in degrees)"""
    # complex numbers: picture (x, -y) to UTM (E, N)
    pa, pb = complex(a_px[0], -a_px[1]), complex(b_px[0], -b_px[1])
    ua, ub = complex(*a_utm), complex(*b_utm)
    k = (ub - ua) / (pb - pa)

    def fn(x, y):
        u = ua + k * (complex(x, -y) - pa)
        return (u.real, u.imag)

    def inv(e, n):
        p = pa + (complex(e, n) - ua) / k
        return (p.real, -p.imag)

    return fn, inv, abs(k), math.degrees(math.atan2(k.imag, k.real))


def water_mask(rgb):
    """the picture's river: dark blue, bluer than green and red"""
    r, g, b = (rgb[..., i].astype(np.int32) for i in range(3))
    return (b > r + 22) & (b > g + 6) & (b < 190) & (r < 110)


def largest(mask):
    """the largest 4-connected body of a mask (a plain flood fill, no SciPy)"""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best = None
    for y0 in range(h):
        for x0 in np.nonzero(mask[y0] & ~seen[y0])[0]:
            stack, body = [(y0, x0)], []
            seen[y0, x0] = True
            while stack:
                y, x = stack.pop()
                body.append((y, x))
                for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True
                        stack.append((yy, xx))
            if best is None or len(body) > len(best):
                best = body
    out = np.zeros_like(mask, dtype=bool)
    for y, x in best or []:
        out[y, x] = True
    return out


def banks(body, x0, y0):
    """row by row, the body's west and east edge (pixel edges, so a 3 px river keeps its width)"""
    west, east = [], []
    for j in range(body.shape[0]):
        xs = np.nonzero(body[j])[0]
        if len(xs) == 0:
            continue
        west.append((x0 + xs.min(), y0 + j + 0.5))
        east.append((x0 + xs.max() + 1, y0 + j + 0.5))
    return west, east


def simplify(pts, tol):
    """Douglas-Peucker in the points' own unit"""
    if len(pts) < 3:
        return list(pts)
    a, b = np.array(pts[0]), np.array(pts[-1])
    ab = b - a
    n = np.hypot(*ab) or 1.0
    d = [abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / n for p in pts[1:-1]]
    i = int(np.argmax(d)) + 1
    if d[i - 1] <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[:i + 1], tol)[:-1] + simplify(pts[i:], tol)


def smooth(pts, r=2):
    """a running mean over 2r+1 rows: the picture's pixel steps are not the bank's shape"""
    out = []
    for i in range(len(pts)):
        win = pts[max(0, i - r):i + r + 1]
        out.append((sum(p[0] for p in win) / len(win), sum(p[1] for p in win) / len(win)))
    return out


def read(jpg, plan_path=PLAN):
    from PIL import Image
    plan = json.loads(Path(plan_path).read_text(encoding='utf-8'))
    rgb = np.asarray(Image.open(jpg).convert('RGB'))
    a, b = LANDMARKS['south-palace'], LANDMARKS['babil']
    fn, inv, mpp, turn = similarity(a['px'], plan_point(plan, a['block']), b['px'], plan_point(plan, b['block']))
    corners = [inv(e, n) for e in (WINDOW['w'], WINDOW['e']) for n in (WINDOW['s'], WINDOW['n'])]
    x0 = int(max(0, min(c[0] for c in corners))); x1 = int(min(rgb.shape[1], max(c[0] for c in corners) + 1))
    y0 = int(max(0, min(c[1] for c in corners))); y1 = int(min(rgb.shape[0], max(c[1] for c in corners) + 1))
    body = largest(water_mask(rgb[y0:y1, x0:x1]))
    west, east = banks(body, x0, y0)
    to_utm = lambda pts: [tuple(round(v, 1) for v in fn(*p)) for p in smooth(pts)]
    keep = lambda pts: [p for p in pts if WINDOW['w'] <= p[0] <= WINDOW['e'] and WINDOW['s'] <= p[1] <= WINDOW['n']]
    wb, eb = keep(to_utm(west)), keep(to_utm(east))
    widths = [math.dist(fn(*w), fn(*e)) for w, e in zip(west, east)]
    return {
        'about': "today's river at the bridge, read off the ASTER picture of 20 October 2004 (NASA/METI/AIST/Japan Space "
                 "Systems, and U.S./Japan ASTER Science Team, public domain), registered by two landmarks against "
                 "map-plan.json; one picture of one day, never a measured line",
        'landmarks': {k: {'px': v['px'], 'utm': plan_point(plan, v['block'])} for k, v in LANDMARKS.items()},
        'metresPerPx': round(mpp, 3), 'turnDeg': round(turn, 2),
        'window': WINDOW, 'rows': len(west), 'medianWidthM': round(float(np.median(widths)), 1) if widths else None,
        'west': [list(p) for p in simplify(wb, 3.0)], 'east': [list(p) for p in simplify(eb, 3.0)],
        'road': [[round(v, 1) for v in fn(*p)] for p in ROAD_PX],
    }, (fn, inv, rgb, plan)


def overlay(out_jpg, res, ctx):
    """the plan's river of 570 BC, its bridge and the two landmarks drawn over the picture, for the eye"""
    from PIL import Image, ImageDraw
    fn, inv, rgb, plan = ctx
    k = 4
    corners = [inv(e, n) for e in (WINDOW['w'], WINDOW['e']) for n in (WINDOW['s'], WINDOW['n'])]
    x0, y0 = min(c[0] for c in corners), min(c[1] for c in corners)
    x1, y1 = max(c[0] for c in corners), max(c[1] for c in corners)
    im = Image.fromarray(rgb).crop((int(x0), int(y0), int(x1), int(y1)))
    im = im.resize((im.width * k, im.height * k), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    P = lambda e, n: ((inv(e, n)[0] - int(x0)) * k, (inv(e, n)[1] - int(y0)) * k)
    old = next(w for w in plan['water'] if w['id'] == 'euphrates')['poly']
    d.line([P(*p) for p in old] + [P(*old[0])], fill=(255, 220, 0), width=2)
    for b in plan['blocks']:
        if b['id'] in ('south-palace', 'esagila', 'esagila-annex') and b.get('poly'):
            d.line([P(*p) for p in b['poly']] + [P(*b['poly'][0])], fill=(255, 80, 80), width=2)
    ax = plan['bridge']['axis']
    d.line([P(*ax[0]), P(*ax[1])], fill=(255, 0, 255), width=3)
    for side, col in (('west', (0, 255, 255)), ('east', (0, 255, 120)), ('road', (255, 255, 255))):
        d.line([P(*p) for p in res[side]], fill=col, width=2)
    im.save(out_jpg, quality=90)


def self_test():
    # a similarity from two pairs maps both exactly and keeps a third point's distance ratio
    fn, inv, mpp, turn = similarity((0, 0), (1000.0, 2000.0), (0, -10), (1000.0, 2150.0))
    assert abs(mpp - 15) < 1e-9 and abs(turn - 0) < 1e-9, (mpp, turn)
    e, n = fn(10, 0)
    assert abs(e - 1150) < 1e-9 and abs(n - 2000) < 1e-9, (e, n)
    x, y = inv(*fn(3.5, -7.25))
    assert abs(x - 3.5) < 1e-9 and abs(y + 7.25) < 1e-9
    # the banks of a straight band three pixels wide
    m = np.zeros((5, 9), dtype=bool)
    m[:, 3:6] = True
    w, ee = banks(largest(m), 0, 0)
    assert w[0][0] == 3 and ee[0][0] == 6 and len(w) == 5
    assert simplify([(0, 0), (1, 0.01), (2, 0)], 0.1) == [(0, 0), (2, 0)]
    print('self-test: ok')


def main():
    if '--self-test' in sys.argv:
        self_test()
        return
    ap = argparse.ArgumentParser()
    ap.add_argument('jpg')
    ap.add_argument('out')
    ap.add_argument('--overlay')
    ap.add_argument('--plan', default=str(PLAN))
    a = ap.parse_args()
    res, ctx = read(a.jpg, a.plan)
    Path(a.out).write_text(json.dumps(res, indent=1), encoding='utf-8')
    if a.overlay:
        overlay(a.overlay, res, ctx)
    print(f"scale {res['metresPerPx']} m/px, turn {res['turnDeg']} deg, {res['rows']} rows, median width {res['medianWidthM']} m, "
          f"west {len(res['west'])} points, east {len(res['east'])} points")


if __name__ == '__main__':
    main()
