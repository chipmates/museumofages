"""PART-BOXES: one fixed box per part of a stop, kept across cycles, and the sheets cut from them.

  python3 -I boxes.py check <PART-BOXES.tsv> [<stills dir> ...] [--since <the last cycle's table>] [--eyes-only <patterns>]

The table, one per stop, tab-separated, one header line:
  part     its RULES number, then a short name ("4 the lion frieze's glaze")
  eye      the still's file name in a version folder, at its packet size ("03-forecourt-desktop.png")
  box      x y w h on that still, device pixels
  ref      the reference picture's absolute path, or -
  refbox   x y w h on the reference, or -
  credit   the reference's credit line as a sheet prints it, or - (a reference needs one)
  since    the cycle the box was set ("c1")
  note     free words
check refuses: a malformed row, a part twice, a version word in a part's name, a box outside its still in any folder
given, a reference without its credit, an eyes-only name (a pattern file, one regex a line), and with --since a part
whose box moved since the last cycle (a box is fixed; a new part gets a new row).
The other kit tools load this file by path for the same reading and the same sheet.
"""
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None
HEAD = ['part', 'eye', 'box', 'ref', 'refbox', 'credit', 'since', 'note']
CAP3 = (320, 300)  # the 3x panel's source region, so the panel stays at most 960 x 900
GAP, BG, INK = 16, (20, 20, 20), (230, 230, 230)
# words that would tell a reader which version a sheet shows; sheet names like C6.2 or a credit's R1 stay free
VERSION_WORDS = re.compile(r'\b(before|after|older|newer|version|v\d+|cycle \d+|arm [a-c])\b', re.I)


class Refused(Exception):
    pass


def font(n):
    try:
        return ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', n)
    except OSError:
        return ImageFont.load_default()


def eyes_only(patterns):
    if not patterns:
        return lambda text: 0
    pats = [re.compile(p.strip(), re.I) for p in open(patterns) if p.strip() and not p.startswith('#')]
    return lambda text: sum(1 for p in pats if p.search(text))


def num(part):
    return part.split()[0]


def quad(text, what):
    v = text.split()
    if len(v) != 4 or not all(re.fullmatch(r'-?\d+', x) for x in v):
        raise Refused(f'{what}: {text!r} is not four whole numbers x y w h')
    x, y, w, h = map(int, v)
    if w <= 0 or h <= 0:
        raise Refused(f'{what}: width and height must be positive')
    return x, y, w, h


def read(tsv, patterns=None):
    if not os.path.isfile(tsv):
        raise Refused(f'the box table {tsv} is missing')
    text = open(tsv, encoding='utf-8').read()
    hits = eyes_only(patterns)
    if hits(text):
        raise Refused(f'eyes-only names in {tsv} (count {hits(text)})')
    lines = [l for l in text.split('\n') if l.strip()]
    if not lines or lines[0].split('\t') != HEAD:
        raise Refused(f'{tsv}: the header must be {" | ".join(HEAD)}')
    rows, seen = [], set()
    for k, l in enumerate(lines[1:], 2):
        f = l.split('\t')
        if len(f) != len(HEAD):
            raise Refused(f'{tsv} line {k}: {len(f)} fields, not {len(HEAD)}')
        r = dict(zip(HEAD, f))
        if not re.fullmatch(r'\d+[a-z]?', num(r['part'])):
            raise Refused(f'{tsv} line {k}: the part must start with its RULES number')
        if num(r['part']) in seen:
            raise Refused(f'{tsv} line {k}: part {num(r["part"])} has two rows; one box per part')
        seen.add(num(r['part']))
        if VERSION_WORDS.search(r['part']):
            raise Refused(f'{tsv} line {k}: the part name carries a version word')
        r['xywh'] = quad(r['box'], f'{tsv} line {k} box')
        if (r['ref'] == '-') != (r['refbox'] == '-'):
            raise Refused(f'{tsv} line {k}: ref and refbox are both given or both -')
        r['refxywh'] = None if r['ref'] == '-' else quad(r['refbox'], f'{tsv} line {k} refbox')
        if r['ref'] != '-' and (r['credit'].strip() in ('', '-')):
            raise Refused(f'{tsv} line {k}: a reference needs its credit line')
        rows.append(r)
    return rows


def pick(rows, parts):
    if parts is None:
        return rows
    byn = {num(r['part']): r for r in rows}
    miss = [p for p in parts if p not in byn]
    if miss:
        raise Refused(f'parts not in the box table: {", ".join(miss)}')
    return [byn[p] for p in parts]


def inside(path, xywh, what):
    if not os.path.isfile(path):
        raise Refused(f'{what}: {path} is missing')
    W, H = Image.open(path).size
    x, y, w, h = xywh
    if x < 0 or y < 0 or x + w > W or y + h > H:
        raise Refused(f'{what}: box {x} {y} {w} {h} lies outside the picture ({W} x {H})')


def check(rows, dirs, patterns=None):
    hits = eyes_only(patterns)
    for d in dirs:
        if not os.path.isdir(d):
            raise Refused(f'the stills folder {d} is missing')
    for r in rows:
        p = num(r['part'])
        if hits(r['eye']) or (r['ref'] != '-' and hits(r['ref'])):
            raise Refused(f'part {p}: an eyes-only name in a file name')
        for d in dirs:
            inside(os.path.join(d, r['eye']), r['xywh'], f'part {p} still in {d}')
        if r['ref'] != '-':
            if not os.path.isabs(r['ref']):
                raise Refused(f'part {p}: the reference path is not absolute')
            inside(r['ref'], r['refxywh'], f'part {p} reference')


def kept(rows, old_rows):
    """a part's box never moves between cycles"""
    old = {num(r['part']): r for r in old_rows}
    moved = [num(r['part']) for r in rows if num(r['part']) in old and (old[num(r['part'])]['box'], old[num(r['part'])]['eye']) != (r['box'], r['eye'])]
    if moved:
        raise Refused(f'boxes moved since the last cycle: parts {", ".join(moved)} (a box is fixed; a new box is a new part)')
    gone = [p for p in old if p not in {num(r['part']) for r in rows}]
    return gone


def crop(path, xywh):
    x, y, w, h = xywh
    return Image.open(path).convert('RGB').crop((x, y, x + w, y + h))


def centre(w, h):
    cw, ch = min(w, CAP3[0]), min(h, CAP3[1])
    return (w - cw) // 2, (h - ch) // 2, cw, ch


def panels(img):
    """the box at 1:1 and its centre at 3x (nearest, so the still's own pixels show)"""
    cx, cy, cw, ch = centre(*img.size)
    c = img.crop((cx, cy, cx + cw, cy + ch))
    return img, c.resize((cw * 3, ch * 3), Image.NEAREST), (cx, cy, cw, ch)


def ref_panels(r, h1, h3, own):
    """the reference's box at the 1:1 row's height, and the same share of it at the 3x row's height"""
    ref = crop(r['ref'], r['refxywh'])
    W, H = ref.size
    w, h = r['xywh'][2], r['xywh'][3]
    cx, cy, cw, ch = own
    sx, sy = W / w, H / h
    sub = ref.crop((round(cx * sx), round(cy * sy), round((cx + cw) * sx), round((cy + ch) * sy)))
    fit = lambda im, t: im.resize((max(1, round(im.width * t / im.height)), t), Image.LANCZOS)
    return fit(ref, h1), fit(sub, h3)


def sheet(title, cols, foot=''):
    """cols: (row-1 image, row-2 image, (caption 1, caption 2)); captions are refused when they carry a version word"""
    for t in [title, foot] + [c for _, _, cap in cols for c in cap]:
        if t and VERSION_WORDS.search(t):
            raise Refused(f'a sheet caption carries a version word: {t!r}')
    F, f = font(22), font(18)
    cw = [max(a.width, b.width) for a, b, _ in cols]
    h1, h3 = max(a.height for a, _, _ in cols), max(b.height for _, b, _ in cols)
    W = sum(cw) + GAP * (len(cols) - 1)
    H = 40 + h1 + 34 + h3 + 34 + (30 if foot else 0)
    S = Image.new('RGB', (max(W, 600), H), BG)
    d = ImageDraw.Draw(S)
    d.text((8, 8), title, fill=INK, font=F)
    x = 0
    for (a, b, cap), w in zip(cols, cw):
        S.paste(a, (x, 40))
        d.text((x + 6, 40 + h1 + 7), cap[0], fill=INK, font=f)
        S.paste(b, (x, 40 + h1 + 34))
        d.text((x + 6, 40 + h1 + 34 + h3 + 7), cap[1], fill=INK, font=f)
        x += w + GAP
    if foot:
        d.text((8, H - 26), foot, fill=INK, font=f)
    return S


def ref_column(r, one, three, own):
    ra, rb = ref_panels(r, one.height, three.height, own)
    return (ra, rb, (r['credit'], r['credit'] + ', the same share of the box'))


def main(argv):
    if len(argv) < 2 or argv[0] != 'check':
        raise Refused(__doc__)
    rest, dirs, since, pats = argv[2:], [], None, None
    while rest:
        if rest[0] == '--since':
            since, rest = rest[1], rest[2:]
        elif rest[0] == '--eyes-only':
            pats, rest = rest[1], rest[2:]
        else:
            dirs.append(os.path.abspath(rest[0]))
            rest = rest[1:]
    rows = read(argv[1], pats)
    check(rows, dirs, pats)
    gone = kept(rows, read(since, pats)) if since else []
    print(f'{argv[1]}: {len(rows)} parts, every box inside its still in {len(dirs)} folder(s)'
          + (f'; boxes kept since {since}' + (f' (parts dropped: {", ".join(gone)})' if gone else '') if since else ''))


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Refused as e:
        sys.exit(f'REFUSED: {e}')
