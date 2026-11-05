# SKY STEPS: two runs of one film span (the control and the shade light's field, sky-clip.mjs frames), read frame to
# frame. Per frame: each run's step from the frame before (the 99th percentile over 32 px tiles of the tile's mean luma
# change), and the step of the field-over-control difference (a refit shows there as a jump the motion does not make).
#   python3 -I sky-steps.py <control frames> <field frames> [--tile 32] [--over 1.0] [--md out.md]
# A frame counts when the field's step exceeds the control's by more than --over levels. Exit 1 when one does.
import sys
from pathlib import Path
import numpy as np
from PIL import Image

args = sys.argv[1:]
opts = {'--tile': '32', '--over': '1.0', '--md': ''}
for k in list(opts):
    if k in args:
        i = args.index(k); opts[k] = args[i + 1]; del args[i:i + 2]
C, F = Path(args[0]), Path(args[1])
T, OVER = int(opts['--tile']), float(opts['--over'])
names = sorted(p.name for p in C.glob('f*.jpg') if (F / p.name).exists())
if len(names) < 2:
    sys.exit(f'fewer than two frames in both {C} and {F}')


def tiles(p: Path) -> np.ndarray:
    a = np.asarray(Image.open(p).convert('RGB')).astype(float) @ np.array([0.2126, 0.7152, 0.0722])
    h, w = (a.shape[0] // T) * T, (a.shape[1] // T) * T
    return a[:h, :w].reshape(h // T, T, w // T, T).mean(axis=(1, 3))


rows, prev = [], None
for n in names:
    c, f = tiles(C / n), tiles(F / n)
    if prev is not None:
        pc, pf = prev
        sc = float(np.percentile(np.abs(c - pc), 99))
        sf = float(np.percentile(np.abs(f - pf), 99))
        sd = float(np.percentile(np.abs((f - c) - (pf - pc)), 99))
        rows.append((n, sc, sf, sd, float(np.abs(f - c).mean())))
    prev = (c, f)
over = [r for r in rows if r[2] > r[1] + OVER]
worst = max(rows, key=lambda r: r[2] - r[1])
peak = max(rows, key=lambda r: r[3])
med_d = float(np.median([r[3] for r in rows]))
lines = [
    f'frames {len(names)} ({names[0]} to {names[-1]}), tile {T} px, p99 of the tiles\' mean luma step',
    f'control step: median {np.median([r[1] for r in rows]):.2f}, max {max(r[1] for r in rows):.2f}',
    f'field step: median {np.median([r[2] for r in rows]):.2f}, max {max(r[2] for r in rows):.2f}',
    f'field over control, largest: {worst[2] - worst[1]:+.2f} at {worst[0]}',
    f'the difference\'s own step: median {med_d:.2f}, max {peak[3]:.2f} at {peak[0]}',
    f'frames whose field step exceeds the control\'s by more than {OVER}: {len(over)}' + (f' ({", ".join(r[0] for r in over[:12])})' if over else ''),
]
print('\n'.join(lines))
if opts['--md']:
    md = ['| frame | control step | field step | difference step | mean field - control |', '|---|---|---|---|---|']
    md += [f'| {r[0]} | {r[1]:.2f} | {r[2]:.2f} | {r[3]:.2f} | {r[4]:.2f} |' for r in rows]
    Path(opts['--md']).write_text('\n'.join(lines) + '\n\n' + '\n'.join(md) + '\n')
sys.exit(1 if over else 0)
