# THE WALK'S STILL RUNS: how long the moving sketch shows a near-frozen frame.
#   python3 still-runs.py <frames folder> <map-cams.json> [--json out.json] [--from s --to s]
# One frame a second at the contact sheets' size (240 x 135), grey; a second is near-frozen when its mean
# absolute change from the second before is under 2.5 grey levels; runs of 8 s or more count. Per stop
# (a stop runs from its first path key to the next stop's first key) and for the whole film.
import json, os, sys, glob
from PIL import Image

LIMIT, RUN, SIZE = 2.5, 8, (240, 135)

def main():
    a = sys.argv[1:]
    d, cams_file = a[0], a[1]
    opt = {a[i][2:]: a[i + 1] for i in range(2, len(a) - 1) if a[i].startswith('--')}
    frames = []
    for f in sorted(glob.glob(os.path.join(d, 'frames-*.json'))):
        log = json.load(open(f))
        fps = log['fps']
        frames += log['frames']
    by_i = {f['i']: f for f in frames}
    cams = json.load(open(cams_file))
    starts = {}
    for k in cams['path']:
        starts.setdefault(k['stop'], k['t'])
    order = sorted(starts.items(), key=lambda kv: kv[1])
    def stop_at(t):
        n = order[0][0]
        for s, t0 in order:
            if t + 1e-6 >= t0:
                n = s
        return n
    last = max(by_i) // fps
    lo, hi = int(float(opt.get('from', 0))), min(last, int(float(opt.get('to', last))))
    grey = {}
    for s in range(lo, hi + 1):
        p = os.path.join(d, 'f%05d.jpg' % (s * fps))
        if os.path.exists(p):
            grey[s] = Image.open(p).convert('L').resize(SIZE, Image.BILINEAR)
    change = {}
    for s in range(lo + 1, hi + 1):
        if s in grey and s - 1 in grey:
            g0, g1 = grey[s - 1].tobytes(), grey[s].tobytes()
            change[s] = sum(abs(x - y) for x, y in zip(g0, g1)) / len(g0)
    frozen = sorted(s for s, c in change.items() if c < LIMIT)
    runs, cur = [], []
    for s in frozen:
        if cur and s == cur[-1] + 1:
            cur.append(s)
        else:
            if len(cur) >= RUN:
                runs.append(cur)
            cur = [s]
    if len(cur) >= RUN:
        runs.append(cur)
    in_runs = {s for r in runs for s in r}
    total = len(change)
    per = {}
    for s in change:
        n = stop_at(s)
        e = per.setdefault(n, {'seconds': 0, 'frozen': 0})
        e['seconds'] += 1
        e['frozen'] += s in in_runs
    print(f'film {lo} to {hi} s: {len(in_runs)} of {total} s in still runs of {RUN} s or more under {LIMIT} ({100 * len(in_runs) / max(1, total):.1f}%)')
    for n in sorted(per):
        e = per[n]
        print(f"  stop {n:2d}: {e['frozen']:4d} of {e['seconds']:4d} s ({100 * e['frozen'] / max(1, e['seconds']):5.1f}%)")
    for r in runs:
        print(f'  run {r[0] - 1} to {r[-1]} s ({len(r)} s), stop {stop_at(r[0])}')
    if 'json' in opt:
        json.dump({'limit': LIMIT, 'run': RUN, 'film': [lo, hi], 'frozen': len(in_runs), 'seconds': total, 'perStop': per,
                   'runs': [[r[0] - 1, r[-1]] for r in runs], 'change': {s: round(c, 2) for s, c in change.items()}}, open(opt['json'], 'w'))

main()
