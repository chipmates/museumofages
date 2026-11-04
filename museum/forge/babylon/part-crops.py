"""Fixed crops per part for the builder's own look: the same box cut from two versions and the reference, one sheet a part.

Usage: python3 -I part-crops.py <PART-BOXES.tsv> <stills dir A> <stills dir B> <out dir> [--parts <n,n,...>] [--eyes-only <patterns>]

Per part, fixed-<n>.jpg: row 1 the box of A and of B at 1:1 and the reference's box at the same height; row 2 the box's
centre (at most 320 x 300) at 3x, nearest, and the same share of the reference. A and B are labelled "left" and "right"
in the order given and nothing else: this sheet is for the builders' and the coordinator's look, never a judge packet (the
alone packets are `alone-packet.py`'s). Refused before anything is written: what boxes.py check refuses for both folders.
"""
import importlib.util
import os
import sys

sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location('kit_boxes', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'boxes.py'))
bx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bx)


def part_sheet(r, a_dir, b_dir):
    cols, own = [], None
    for d, word in ((a_dir, 'left'), (b_dir, 'right')):
        one, three, own = bx.panels(bx.crop(os.path.join(d, r['eye']), r['xywh']))
        cols.append((one, three, (f'{word}, 1:1', f'{word}, the box\'s centre at 3x')))
    foot = ''
    if r['ref'] != '-':
        cols.append(bx.ref_column(r, cols[0][0], cols[0][1], own))
    else:
        foot = 'No reference picture for this part: read both sides against the rules\' words.'
    x, y, w, h = r['xywh']
    return bx.sheet(f'Part {r["part"]} ({r["eye"]}, box {x} {y} {w} {h})', cols, foot)


def main(argv):
    if len(argv) < 4:
        raise bx.Refused(__doc__)
    tsv, a, b, out = argv[0], os.path.abspath(argv[1]), os.path.abspath(argv[2]), os.path.abspath(argv[3])
    parts, pats, rest = None, None, argv[4:]
    while rest:
        if rest[0] == '--parts':
            parts, rest = [p.strip() for p in rest[1].split(',') if p.strip()], rest[2:]
        elif rest[0] == '--eyes-only':
            pats, rest = rest[1], rest[2:]
        else:
            raise bx.Refused(f'unknown argument {rest[0]!r}')
    rows = bx.pick(bx.read(tsv, pats), parts)
    bx.check(rows, [a, b], pats)
    sheets = [(bx.num(r['part']), part_sheet(r, a, b)) for r in rows]
    os.makedirs(out, exist_ok=True)
    for n, s in sheets:
        s.save(os.path.join(out, f'fixed-{n}.jpg'), quality=90)
    print(f'{out}: {len(sheets)} sheets')


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except bx.Refused as e:
        sys.exit(f'REFUSED: {e}')
