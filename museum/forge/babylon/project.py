"""A world point to a still's pixel, for the map's walk cameras: so a crop box can stay fixed on the same houses when a
stop's lens, bearing or shift changes between two still sets.

  python3 -I project.py <map-cams.json> <key> <framing> <w>x<h> <E> <N> <y> [<E> <N> <y> ...]
      the pixel (x, y from the top left) of each UTM point at level y, through path key <key>'s camera (its phone block
      for framing phone); a point behind the eye prints "behind".
  python3 -I project.py <map-cams.json> <key> <framing> <w>x<h> --box <E0> <N0> <E1> <N1> <y> [--pad 0]
      the pixel bounds of a world rectangle's four corners at level y (x0 y0 x1 y1), clipped to the frame.

The page's lens (map.ts aim): a level look, hfov across the width, and the shift added to the projection's [9], so a
point's height in the frame is tan(elevation) / tan(vfov / 2) - shift in device coordinates. A numeric key y is the
eye's level; 'eye' keys are not handled (the eye over the street needs the plan's levels).
"""
import json
import math
import sys


def camera(cams, key, framing):
    k = cams['path'][key]
    if not isinstance(k.get('y'), (int, float)):
        sys.exit(f"key {key}: y is {k.get('y')!r}, not a level")
    look = k['look']
    hfov = k.get('hfov', cams['lens']['desktop'])
    shift = k.get('shift', 0.0)
    if framing == 'phone':
        ph = k.get('phone', {})
        look = ph.get('look', look)
        hfov = ph.get('hfov', cams['lens']['phone'])
        shift = ph.get('shift', 0.0)
    return k['at'], float(k['y']), look, float(hfov), float(shift)


def project(cam, w, h, E, N, y):
    (ex, en), ey, look, hfov, shift = cam
    # a level look: forward is the look's bearing on the ground
    fx, fn = look[0] - ex, look[1] - en
    L = math.hypot(fx, fn)
    fx, fn = fx / L, fn / L
    rx, rn = fn, -fx  # right of forward (east of north)
    dx, dn, dy = E - ex, N - en, y - ey
    z = dx * fx + dn * fn
    if z <= 0:
        return None
    xr = dx * rx + dn * rn
    t = math.tan(math.radians(hfov) / 2)
    tv = t * h / w
    xn = xr / z / t
    yn = dy / z / tv - shift
    return (xn + 1) / 2 * w, (1 - yn) / 2 * h


def main(a):
    cams = json.load(open(a[0]))
    key, framing = int(a[1]), a[2]
    w, h = (int(v) for v in a[3].split('x'))
    cam = camera(cams, key, framing)
    if '--box' in a:
        i = a.index('--box')
        E0, N0, E1, N1, y = (float(v) for v in a[i + 1:i + 6])
        pad = float(a[a.index('--pad') + 1]) if '--pad' in a else 0.0
        pts = [project(cam, w, h, E, N, y) for E, N in ((E0, N0), (E1, N0), (E1, N1), (E0, N1))]
        if any(p is None for p in pts):
            sys.exit('a corner is behind the eye')
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        x0, y0 = max(0, min(xs) - pad), max(0, min(ys) - pad)
        x1, y1 = min(w, max(xs) + pad), min(h, max(ys) + pad)
        print(f'{x0:.0f} {y0:.0f} {x1:.0f} {y1:.0f}')
        return
    v = [float(s) for s in a[4:]]
    for i in range(0, len(v) - 2, 3):
        p = project(cam, w, h, v[i], v[i + 1], v[i + 2])
        print('behind' if p is None else f'{p[0]:.1f} {p[1]:.1f}')


if __name__ == '__main__':
    main(sys.argv[1:])
