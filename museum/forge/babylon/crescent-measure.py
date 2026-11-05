"""The crescent on a still against the computation: where the camera must put the Moon (sky-570.json at a UT minute,
projected through the page's lens with its shift), where the drawn crescent's light lies, and crops at 1:1 and 3:1.

  python3 -I crescent-measure.py --png <still> --eye E,N,Y --look E,N,Y --hfov <deg> [--shift s] --ut 16:09 \
      --sky <sky-570.json> [--out <folder>] [--name <prefix>]

The drawn crescent's place is the centroid of its light over the sky beside it (the window's median taken off), set
against the centroid the computed crescent must have (its lit part integrated on the disc, Lommel-Seeliger, as
crescent/sky.ts draws it): the difference, in pixels and in degrees, is the place error. Prints one JSON line.
"""
import argparse, json, math, os
import numpy as np
from PIL import Image

D = math.pi / 180


def lit_at(u, v, sto):
    r2 = u * u + v * v
    w = np.sqrt(np.clip(1 - r2, 0, 1))
    i = sto * D
    mu0 = u * math.sin(i) + w * math.cos(i)
    out = np.where((r2 < 1) & (mu0 > 0), np.clip(mu0, 0, None) / np.maximum(mu0 + w, 1e-4), 0.0)
    return out


def row_at(sky, ut):
    h, m = ut.split(':')
    t = int(h) * 60 + float(m)
    R = sky['minutes']
    for a, b in zip(R, R[1:]):
        ta = int(a['ut'][:2]) * 60 + int(a['ut'][3:]); tb = ta + 1
        if ta <= t <= tb:
            f = t - ta
            mix = lambda x, y: x + (y - x) * f
            return {k: {q: mix(a[k][q], b[k][q]) for q in ('az', 'el', 'elR')} | ({'diam': mix(a[k]['diam'], b[k]['diam']), 'sto': mix(a[k]['sto'], b[k]['sto']), 'illu': mix(a[k]['illu'], b[k]['illu'])} if k == 'moon' else {}) for k in ('sun', 'moon')}
    raise SystemExit(f'{ut} outside the file')


def dir_of(az, el, conv):
    A, c = (az - conv) * D, math.cos(el * D)
    return np.array([c * math.sin(A), math.sin(el * D), -c * math.cos(A)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--png', required=True)
    ap.add_argument('--eye', required=True)
    ap.add_argument('--look', required=True)
    ap.add_argument('--hfov', type=float, required=True)
    ap.add_argument('--shift', type=float, default=0.0)
    ap.add_argument('--ut', required=True)
    ap.add_argument('--sky', required=True)
    ap.add_argument('--out')
    ap.add_argument('--name', default='crescent')
    a = ap.parse_args()
    sky = json.load(open(a.sky))
    conv = sky['convergence']
    r = row_at(sky, a.ut)
    im = np.asarray(Image.open(a.png).convert('RGB')).astype(np.float64)
    H, W = im.shape[:2]
    E = [float(x) for x in a.eye.split(',')]; L = [float(x) for x in a.look.split(',')]
    # the scene's frame: x east, y up, z south (grid)
    f = np.array([L[0] - E[0], L[2] - E[2], -(L[1] - E[1])]); f /= np.linalg.norm(f)
    rt = np.cross(f, [0, 1, 0]); rt /= np.linalg.norm(rt)
    up = np.cross(rt, f)
    th = math.tan(a.hfov / 2 * D); tv = th * H / W

    def px(d):
        x, y, z = d @ rt, d @ up, d @ f
        nx, ny = x / z / th, y / z / tv - a.shift
        return np.array([(nx + 1) / 2 * W, (1 - ny) / 2 * H])

    m = dir_of(r['moon']['az'], r['moon']['elR'], conv)
    s_air = dir_of(r['sun']['az'], r['sun']['el'], conv); m_air = dir_of(r['moon']['az'], r['moon']['el'], conv)
    limb = s_air - (s_air @ m_air) * m_air; limb -= (limb @ m) * m; limb /= np.linalg.norm(limb)
    rad = math.tan(r['moon']['diam'] / 2 * D)
    c = px(m); e = px(m + limb * rad)
    lv = (e - c); rpx = float(np.hypot(*lv)); lv /= rpx
    side = np.array([-lv[1], lv[0]])
    # the computed crescent's light centroid in the frame (pixels), from the disc integrated on a fine grid
    g = np.linspace(-1, 1, 801)
    U, V = np.meshgrid(g, g)
    Lm = lit_at(U, V, r['moon']['sto'])
    cu = (Lm * U).sum() / Lm.sum(); cv = (Lm * V).sum() / Lm.sum()
    want = c + rpx * (cu * lv + cv * side)
    # the drawn light: a window round the computed disc, the sky's median off
    half = int(max(12, rpx * 2.5))
    x0, x1 = max(0, int(c[0]) - half), min(W, int(c[0]) + half)
    y0, y1 = max(0, int(c[1]) - half), min(H, int(c[1]) + half)
    win = im[y0:y1, x0:x1].mean(axis=2)
    # the sky beside, row by row (it brightens toward the horizon): each row's median outside 1.4 radii of the disc
    yy0, xx0 = np.mgrid[y0:y1, x0:x1]
    out_disc = np.hypot(xx0 - c[0], yy0 - c[1]) > 1.4 * rpx
    rowbg = np.array([np.median(win[i][out_disc[i]]) if out_disc[i].any() else np.median(win) for i in range(win.shape[0])])
    bg = float(np.median(rowbg))
    exc = np.clip(win - rowbg[:, None], 0, None)
    exc[exc < 3] = 0
    res = {'png': os.path.basename(a.png), 'ut': a.ut, 'moon': {k: round(v, 4) for k, v in r['moon'].items()}, 'sun': {k: round(v, 4) for k, v in r['sun'].items()},
           'computedCentre': [round(float(x), 2) for x in c], 'radiusPx': round(rpx, 2), 'limbScreen': [round(float(x), 3) for x in lv],
           'litCentroidWanted': [round(float(x), 2) for x in want], 'inFrame': bool(0 <= c[0] < W and 0 <= c[1] < H), 'skyBeside': round(float(bg), 1)}
    if exc.sum() > 0:
        yy, xx = np.mgrid[y0:y1, x0:x1]
        got = np.array([(exc * xx).sum() / exc.sum(), (exc * yy).sum() / exc.sum()]) + 0.5
        err = got - want
        degpx = a.hfov / W
        res |= {'litCentroidDrawn': [round(float(x), 2) for x in got], 'errorPx': [round(float(x), 2) for x in err], 'errorDeg': round(float(np.hypot(*err)) * degpx, 4),
                'peak': round(float(win.max()), 1), 'peakOverSky': round(float(win.max() / max(rowbg[int(np.argmax(win) // win.shape[1])], 1)), 2), 'litPixels': int((exc > 0).sum())}
        # the drawn light's direction from the computed centre against the limb's
        dv = got - c
        res['drawnLimbAngleDeg'] = round(math.degrees(math.atan2(dv[0] * lv[1] - dv[1] * lv[0], dv @ lv)), 2)
    if a.out:
        os.makedirs(a.out, exist_ok=True)
        img = Image.open(a.png).convert('RGB')
        for k in (1, 3):
            hs = int(max(40, rpx * 3)) if k == 3 else int(max(120, rpx * 8))
            box = (int(c[0]) - hs, int(c[1]) - hs, int(c[0]) + hs, int(c[1]) + hs)
            cr = img.crop(box)
            if k > 1:
                cr = cr.resize((cr.width * k, cr.height * k), Image.NEAREST)
            cr.save(os.path.join(a.out, f'{a.name}-{k}x.png'))
    print(json.dumps(res))


if __name__ == '__main__':
    main()
