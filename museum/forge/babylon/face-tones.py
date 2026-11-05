# FACE TONES: the mean luma (Rec. 709 on the sRGB still, 0 to 255) of named patches in a still set, for one set or a
# base and an after, with the light round's pair and ratio rows.
#   python3 -I face-tones.py <patches.tsv> <stills a> [<stills b>] [--md out.md] [--boxes <out folder>]
# patches.tsv, tab separated, '#' comments:
#   patch  <stop> <framing> <name> <kind: shade|sun|sky|keep> <x0,y0,x1,y1 in device pixels> <note>
#   pair   <stop> <framing> <name a> <name b> <step>   two shaded patches that should read apart by at least <step>
#   ratio  <stop> <framing> <sun name> <shade name> <lo,hi>   lit over shaded luma inside the band
#   edge   <stop> <framing> <name> <x0,y0,x1,y1> <step>   a segment across a cast shadow's edge: the luma step along it
#          (the 95th less the 5th percentile of a 9 px wide profile) and the 10 to 90 percent width in pixels
# --boxes draws each still's boxes on a half-size copy, to check where they sit.
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np

args = [a for a in sys.argv[1:]]
opts = {}
for k in ('--md', '--boxes'):
    if k in args:
        i = args.index(k); opts[k] = args[i + 1]; del args[i:i + 2]
tsv, sets = Path(args[0]), [Path(a) for a in args[1:]]
patches, pairs, ratios, edges = [], [], [], []
for line in tsv.read_text().splitlines():
    if not line.strip() or line.startswith('#'):
        continue
    c = line.split('\t')
    if c[0] == 'patch':
        patches.append({'stop': c[1], 'framing': c[2], 'name': c[3], 'kind': c[4], 'box': tuple(int(v) for v in c[5].split(',')), 'note': c[6] if len(c) > 6 else ''})
    elif c[0] == 'pair':
        pairs.append({'stop': c[1], 'framing': c[2], 'a': c[3], 'b': c[4], 'step': float(c[5])})
    elif c[0] == 'ratio':
        lo, hi = (float(v) for v in c[5].split(','))
        ratios.append({'stop': c[1], 'framing': c[2], 'sun': c[3], 'shade': c[4], 'lo': lo, 'hi': hi})
    elif c[0] == 'edge':
        edges.append({'stop': c[1], 'framing': c[2], 'name': c[3], 'seg': tuple(int(v) for v in c[4].split(',')), 'step': float(c[5])})


def still(folder: Path, stop: str, framing: str) -> Path | None:
    hits = sorted(folder.glob(f'{int(stop):02d}-*-{framing}.png'))
    return hits[0] if hits else None


cache: dict = {}


def luma_of(folder: Path, stop: str, framing: str):
    key = (folder, stop, framing)
    if key not in cache:
        p = still(folder, stop, framing)
        if p is None:
            cache[key] = None
        else:
            a = np.asarray(Image.open(p).convert('RGB'), dtype=np.float64)
            cache[key] = a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722
    return cache[key]


def tone(folder: Path, p: dict):
    y = luma_of(folder, p['stop'], p['framing'])
    if y is None:
        return None
    x0, y0, x1, y1 = p['box']
    return float(y[y0:y1, x0:x1].mean())


rows = []
for p in patches:
    rows.append({**p, 'v': [tone(s, p) for s in sets]})
by = {(r['stop'], r['framing'], r['name']): r for r in rows}
f = lambda v: '-' if v is None else f'{v:.1f}'
out = []
head = ' | '.join(s.name for s in sets)
out.append(f'| stop | framing | patch | kind | {head} |' + (' after - base |' if len(sets) == 2 else '') + ' note |')
out.append('|---' * (5 + len(sets) + (1 if len(sets) == 2 else 0) + 1) + '|')
for r in rows:
    d = f' {r["v"][1] - r["v"][0]:+.1f} |' if len(sets) == 2 and None not in r['v'] else (' - |' if len(sets) == 2 else '')
    out.append(f'| {r["stop"]} | {r["framing"]} | {r["name"]} | {r["kind"]} | ' + ' | '.join(f(v) for v in r['v']) + f' |{d} {r["note"]} |')
if pairs:
    out.append('\n| stop | framing | pair | step | ' + ' | '.join(f'apart {s.name}' for s in sets) + ' | met (last set) |')
    out.append('|---' * (5 + len(sets)) + '|')
    for q in pairs:
        a, b = by.get((q['stop'], q['framing'], q['a'])), by.get((q['stop'], q['framing'], q['b']))
        if not a or not b:
            out.append(f'| {q["stop"]} | {q["framing"]} | {q["a"]} / {q["b"]} | missing patch |'); continue
        ap = [None if a['v'][i] is None or b['v'][i] is None else abs(a['v'][i] - b['v'][i]) for i in range(len(sets))]
        out.append(f'| {q["stop"]} | {q["framing"]} | {q["a"]} / {q["b"]} | {q["step"]:.0f} | ' + ' | '.join(f(v) for v in ap) + f' | {"yes" if ap[-1] is not None and ap[-1] >= q["step"] else "no"} |')
if ratios:
    out.append('\n| stop | framing | lit / shade | band | ' + ' | '.join(f'ratio {s.name}' for s in sets) + ' | in band (last set) |')
    out.append('|---' * (5 + len(sets)) + '|')
    for q in ratios:
        a, b = by.get((q['stop'], q['framing'], q['sun'])), by.get((q['stop'], q['framing'], q['shade']))
        if not a or not b:
            out.append(f'| {q["stop"]} | {q["framing"]} | {q["sun"]} / {q["shade"]} | missing patch |'); continue
        rt = [None if a['v'][i] is None or not b['v'][i] else a['v'][i] / b['v'][i] for i in range(len(sets))]
        ok = rt[-1] is not None and q['lo'] <= rt[-1] <= q['hi']
        out.append(f'| {q["stop"]} | {q["framing"]} | {q["sun"]} / {q["shade"]} | {q["lo"]:g} to {q["hi"]:g} | ' + ' | '.join('-' if v is None else f'{v:.2f}' for v in rt) + f' | {"yes" if ok else "no"} |')
def profile(folder: Path, e: dict):
    y = luma_of(folder, e['stop'], e['framing'])
    if y is None:
        return None
    x0, y0, x1, y1 = e['seg']
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    t = np.linspace(0, 1, n)
    xs, ys = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
    # a 9 px band across the segment's direction, averaged
    dx, dy = (y1 - y0), -(x1 - x0)
    ln = max(1e-6, (dx * dx + dy * dy) ** 0.5); dx, dy = dx / ln, dy / ln
    vals = np.zeros(n)
    for o in range(-4, 5):
        xi = np.clip(np.round(xs + dx * o).astype(int), 0, y.shape[1] - 1); yi = np.clip(np.round(ys + dy * o).astype(int), 0, y.shape[0] - 1)
        vals += y[yi, xi]
    vals /= 9
    lo, hi = np.percentile(vals, 5), np.percentile(vals, 95)
    a, b = lo + 0.1 * (hi - lo), lo + 0.9 * (hi - lo)
    inside = np.where((vals > a) & (vals < b))[0]
    return hi - lo, len(inside)


if edges:
    out.append('\n| stop | framing | edge | step | ' + ' | '.join(f'step / width {s.name}' for s in sets) + ' | met (last set) |')
    out.append('|---' * (5 + len(sets)) + '|')
    for e in edges:
        pr = [profile(s, e) for s in sets]
        ok = pr[-1] is not None and pr[-1][0] >= e['step']
        out.append(f'| {e["stop"]} | {e["framing"]} | {e["name"]} | {e["step"]:.0f} | ' + ' | '.join('-' if v is None else f'{v[0]:.0f} / {v[1]} px' for v in pr) + f' | {"yes" if ok else "no"} |')
text = '\n'.join(out)
print(text)
if '--md' in opts:
    Path(opts['--md']).write_text(text + '\n')
if '--boxes' in opts:
    dst = Path(opts['--boxes']); dst.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default(size=28)
    for key in sorted({(p['stop'], p['framing']) for p in patches} | {(e['stop'], e['framing']) for e in edges}):
        p0 = still(sets[-1], *key)
        if p0 is None:
            continue
        im = Image.open(p0).convert('RGB'); d = ImageDraw.Draw(im)
        for p in patches:
            if (p['stop'], p['framing']) != key:
                continue
            col = {'shade': (0, 200, 255), 'sun': (255, 200, 0), 'sky': (255, 0, 255)}.get(p['kind'], (0, 255, 0))
            d.rectangle(p['box'], outline=col, width=5); d.text((p['box'][0] + 8, p['box'][1] + 6), p['name'], fill=col, font=font)
        for e in edges:
            if (e['stop'], e['framing']) == key:
                d.line(e['seg'], fill=(255, 40, 40), width=7); d.text((e['seg'][0] + 8, e['seg'][1] + 6), e['name'], fill=(255, 40, 40), font=font)
        im.resize((im.width // 2, im.height // 2), Image.LANCZOS).save(dst / f'{int(key[0]):02d}-{key[1]}.png')
