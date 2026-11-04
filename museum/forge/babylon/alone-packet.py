"""Two alone packets: each version read alone against its photos, under a random name, the map only in the seal.

Usage: python3 -I alone-packet.py <round> --boxes <PART-BOXES.tsv> --a <stills dir> --b <stills dir> --rules <RULES.md>
                                  --brief <template> --root <packets folder> --seal <seal file> [--eyes-only <patterns>]

Per version one packet <root>/<round>-<four random hex>/ holding: V/ the version's stills (pixels only: each picture
decoded and written again, so no sidecar, build id or text chunk travels), fixed-<n>.jpg per part of the table (the
version's box at 1:1 and 3x beside the reference's), RULES.md, and JUDGE-BRIEF.md (the template with {PACKET} set).
Every part goes in: a set cut to the moved parts would tell the reader where the round worked. The packets' order is
random; which is A and which B is written only to the seal (read-only, outside both packets).
Refused before anything is written: a round name with a slash, an existing seal, a seal inside the root, a template
without {PACKET}, a version word in the template, the rules, a still's name or a caption, an eyes-only name, and what
boxes.py check refuses for both folders.
"""
import datetime
import importlib.util
import os
import secrets
import stat
import sys

sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location('kit_boxes', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'boxes.py'))
bx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bx)
from PIL import Image  # noqa: E402

PICTURES = ('.png', '.jpg', '.jpeg')


def alone_sheet(r, vdir):
    one, three, own = bx.panels(bx.crop(os.path.join(vdir, r['eye']), r['xywh']))
    x, y, w, h = r['xywh']
    cols = [(one, three, (f'ours: {r["eye"]}, box {x} {y} {w} {h}, 1:1', f'ours: the box\'s centre at 3x'))]
    foot = ''
    if r['ref'] != '-':
        cols.append(bx.ref_column(r, one, three, own))
    else:
        foot = 'No reference picture for this part: read it against the rules\' words.'
    return bx.sheet(f'Part {r["part"]}', cols, foot)


def opts(argv):
    o, rest = {}, argv[1:]
    while rest:
        if not rest[0].startswith('--') or len(rest) < 2:
            raise bx.Refused(f'unknown argument {rest[0]!r}')
        o[rest[0][2:]] = rest[1]
        rest = rest[2:]
    for k in ('boxes', 'a', 'b', 'rules', 'brief', 'root', 'seal'):
        if k not in o:
            raise bx.Refused(f'--{k} is missing\n{__doc__}')
    return o


def main(argv):
    if not argv or argv[0].startswith('--'):
        raise bx.Refused(__doc__)
    rnd, o = argv[0], opts(argv)
    if '/' in rnd or not rnd.strip():
        raise bx.Refused('the round name is one word without a slash')
    root, seal = os.path.abspath(o['root']), os.path.abspath(o['seal'])
    if os.path.exists(seal):
        raise bx.Refused(f'the seal {seal} exists: a round is sealed once')
    if seal.startswith(root + os.sep):
        raise bx.Refused('the seal belongs outside the packets\' folder')
    pats = o.get('eyes-only')
    hits = bx.eyes_only(pats)
    brief, rules = open(o['brief'], encoding='utf-8').read(), open(o['rules'], encoding='utf-8').read()
    if '{PACKET}' not in brief:
        raise bx.Refused('the brief template has no {PACKET}')
    for name, text in (('brief', brief), ('rules', rules)):
        if bx.VERSION_WORDS.search(text):
            raise bx.Refused(f'the {name} carries a version word: {bx.VERSION_WORDS.search(text).group(0)!r}')
        if hits(text):
            raise bx.Refused(f'the {name} carries an eyes-only name')
    dirs = {'A': os.path.abspath(o['a']), 'B': os.path.abspath(o['b'])}
    rows = bx.read(o['boxes'], pats)
    bx.check(rows, list(dirs.values()), pats)
    plan = {}
    for side, d in dirs.items():
        pics = sorted(f for f in os.listdir(d) if f.lower().endswith(PICTURES))
        bad = [f for f in pics if bx.VERSION_WORDS.search(f) or hits(f)]
        if bad:
            raise bx.Refused(f'still names that tell the version or are eyes only in {d}: {", ".join(bad[:5])}')
        plan[side] = (pics, [(bx.num(r['part']), alone_sheet(r, d)) for r in rows])
    sides = ['A', 'B']
    secrets.SystemRandom().shuffle(sides)
    lines = []
    os.makedirs(root, exist_ok=True)
    for side in sides:
        name = f'{rnd}-{secrets.token_hex(2)}'
        P = os.path.join(root, name)
        os.makedirs(os.path.join(P, 'V'))
        pics, sheets = plan[side]
        for f in pics:
            im = Image.open(os.path.join(dirs[side], f))
            if im.mode == 'P':
                im = im.convert('RGBA')
            # decoded and written again: pixels only, no text chunk or profile naming a build
            clean = Image.frombytes(im.mode, im.size, im.tobytes())
            clean.save(os.path.join(P, 'V', f), **({'quality': 95} if f.lower().endswith(('.jpg', '.jpeg')) else {}))
        for n, s in sheets:
            s.save(os.path.join(P, f'fixed-{n}.jpg'), quality=90)
        open(os.path.join(P, 'RULES.md'), 'w', encoding='utf-8').write(rules)
        open(os.path.join(P, 'JUDGE-BRIEF.md'), 'w', encoding='utf-8').write(brief.replace('{PACKET}', P))
        lines.append(f'{name} = {side} <- {dirs[side]} ({len(pics)} stills, {len(sheets)} part sheets)')
    lines.append('sealed ' + datetime.datetime.now().isoformat(timespec='seconds'))
    os.makedirs(os.path.dirname(seal), exist_ok=True)
    open(seal, 'w').write('\n'.join(lines) + '\n')
    os.chmod(seal, stat.S_IRUSR | stat.S_IRGRP)
    print('packets (sorted; which is which is in the seal only):', ' '.join(sorted(l.split(' = ')[0] for l in lines[:-1])))


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except bx.Refused as e:
        sys.exit(f'REFUSED: {e}')
