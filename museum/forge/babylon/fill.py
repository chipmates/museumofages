"""The fill measure for repeated motifs (lions, bulls, dragons, rosettes, glazed brick, house types): how much tonal
variation a fill carries, ours against its reference, in the part's own box.

  python3 -I fill.py <image> <x,y,w,h> [<image> <x,y,w,h> ...]      the numbers per box; the last box is the reference
  python3 -I fill.py --boxes <PART-BOXES.tsv> <stills dir> [--parts n,n] [--tsv <out>]   each part's box, ours and its reference

Per box: mean luma; mid = sd of (G1 - G4) over the mean, broad = sd of (G4 - G16) over the mean (Gaussian sigmas in
pixels); repeat = the highest normalised autocorrelation of the detrended luma past 6 px (a tiled texture reads high).
The working target: ours within 0.7 to 1.3 of the reference in mid and broad, repeat near the reference's.
A printed plate carries print grain, so its numbers are an upper bound; a box in deep shade (mean under 30) is not
comparable. Measure at the scale the reader sees: the reference's box is scaled to the height of ours. On a box that
holds structure (windows, a frieze's edges) mid and broad are edge contrast, not grain: box the fill alone.
"""
import importlib.util
import os
import sys

import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
Image.MAX_IMAGE_PIXELS = None


def kernel(s):
    r = int(3 * s + 0.5)
    x = np.arange(-r, r + 1, dtype=np.float64)
    k = np.exp(-x * x / (2 * s * s))
    return k / k.sum()


def blur(a, s):
    k = kernel(s)
    r = len(k) // 2
    p = np.pad(a, r, mode='reflect')
    p = np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), 1, p)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), 0, p)


def numbers(img):
    """mean, mid, broad, repeat of an RGB picture (the whole of it)"""
    a = np.asarray(img.convert('RGB'), dtype=np.float64)
    y = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    m = y.mean()
    g1, g4, g16 = blur(y, 1), blur(y, 4), blur(y, 16)
    mid = (g1 - g4).std() / m if m else float('nan')
    broad = (g4 - g16).std() / m if m else float('nan')
    d = y - g16
    f = np.fft.rfft2(d, s=(2 * d.shape[0], 2 * d.shape[1]))
    ac = np.fft.irfft2(f * np.conj(f))[: d.shape[0], : d.shape[1]]
    ac /= ac[0, 0] if ac[0, 0] else 1
    yy, xx = np.mgrid[: d.shape[0], : d.shape[1]]
    # lags beyond half the box rest on too few pixels to trust
    ok = (np.hypot(yy, xx) > 6) & (yy < d.shape[0] // 2) & (xx < d.shape[1] // 2)
    rep = float(ac[ok].max()) if ok.any() else float('nan')
    return float(m), float(mid), float(broad), rep


def measure(path, xywh):
    x, y, w, h = xywh
    return numbers(Image.open(path).convert('RGB').crop((x, y, x + w, y + h)))


def caveats(m, ref_path=None, ref_m=None):
    out = []
    if m < 30:
        out.append('ours in deep shade (mean under 30): not comparable')
    if ref_m is not None and ref_m < 30:
        out.append('the reference in deep shade: not comparable')
    if ref_path and any(k in os.path.basename(ref_path).lower() for k in ('plate', 'pl.', 'pl-', '-pl', 'tafel')):
        out.append('a printed plate: its numbers are an upper bound')
    return '; '.join(out) or '-'


def by_boxes(tsv, vdir, parts=None, out=None):
    spec = importlib.util.spec_from_file_location('kit_boxes', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'boxes.py'))
    bx = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bx)
    rows = bx.pick(bx.read(tsv), parts)
    bx.check(rows, [vdir])
    head = ['part', 'eye', 'box', 'mean', 'mid', 'broad', 'repeat', 'ref mean', 'ref mid', 'ref broad', 'ref repeat', 'mid / ref', 'broad / ref', 'in 0.7 to 1.3', 'caveat']
    lines = ['\t'.join(head)]
    for r in rows:
        ours = bx.crop(os.path.join(vdir, r['eye']), r['xywh'])
        m, mid, broad, rep = numbers(ours)
        row = [r['part'], r['eye'], r['box'], f'{m:.0f}', f'{mid:.3f}', f'{broad:.3f}', f'{rep:.2f}']
        if r['ref'] != '-':
            ref = bx.crop(r['ref'], r['refxywh'])
            ref = ref.resize((max(1, round(ref.width * ours.height / ref.height)), ours.height), Image.LANCZOS)
            M, MID, BROAD, REP = numbers(ref)
            qm, qb = (mid / MID if MID else float('nan')), (broad / BROAD if BROAD else float('nan'))
            row += [f'{M:.0f}', f'{MID:.3f}', f'{BROAD:.3f}', f'{REP:.2f}', f'{qm:.2f}', f'{qb:.2f}',
                    'yes' if 0.7 <= qm <= 1.3 and 0.7 <= qb <= 1.3 else 'no', caveats(m, r['ref'], M)]
        else:
            row += ['-'] * 7 + [caveats(m)]
        lines.append('\t'.join(row))
    text = '\n'.join(lines) + '\n'
    if out:
        open(out, 'w', encoding='utf-8').write(text)
    print(text, end='')


def main(argv):
    if argv and argv[0] == '--boxes':
        if len(argv) < 3:
            sys.exit(__doc__)
        parts = out = None
        rest = argv[3:]
        while rest:
            if rest[0] == '--parts':
                parts, rest = [p.strip() for p in rest[1].split(',')], rest[2:]
            elif rest[0] == '--tsv':
                out, rest = rest[1], rest[2:]
            else:
                sys.exit(f'unknown argument {rest[0]!r}')
        return by_boxes(argv[1], os.path.abspath(argv[2]), parts, out)
    if len(argv) < 2 or len(argv) % 2:
        sys.exit(__doc__)
    rows = []
    for i in range(0, len(argv), 2):
        box = tuple(int(v) for v in argv[i + 1].split(','))
        rows.append((os.path.basename(argv[i]), box) + measure(argv[i], box))
    print('file\tbox\tmean\tmid\tbroad\trepeat')
    for name, box, m, mid, broad, rep in rows:
        print(f'{name}\t{",".join(map(str, box))}\t{m:.0f}\t{mid:.3f}\t{broad:.3f}\t{rep:.2f}')
    if len(rows) >= 2:
        r = rows[-1]
        for row in rows[:-1]:
            print(f'{row[0]} against {r[0]}: mid {row[3] / r[3]:.2f}, broad {row[4] / r[4]:.2f} of the last box')


if __name__ == '__main__':
    main(sys.argv[1:])
