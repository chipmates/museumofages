"""The kit's Python tools on made-up stills: python3 -I forge/babylon/test/test_kit.py (exit 0 when all pass)."""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, PngImagePlugin

sys.dont_write_bytecode = True
KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), os.path.join(KIT, f'{name}.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def run(*args):
    return subprocess.run([PY, '-I', *args], capture_output=True, text=True)


def still(path, shade=120, noise=0, seed=0, text=None):
    rng = np.random.default_rng(seed)
    a = np.full((200, 300, 3), shade, dtype=np.int16) + (rng.integers(-noise, noise + 1, (200, 300, 1)) if noise else 0)
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8).repeat(1, axis=2))
    info = PngImagePlugin.PngInfo()
    if text:
        info.add_text('build', text)
    im.save(path, pnginfo=info)


def table(path, rows):
    head = 'part\teye\tbox\tref\trefbox\tcredit\tsince\tnote'
    open(path, 'w').write('\n'.join([head] + ['\t'.join(r) for r in rows]) + '\n')


passed = []


def ok(name):
    passed.append(name)
    print(f'ok {len(passed)} - {name}')


with tempfile.TemporaryDirectory() as T:
    A, B, R = os.path.join(T, 'a'), os.path.join(T, 'b'), os.path.join(T, 'ref.png')
    os.makedirs(A)
    os.makedirs(B)
    still(os.path.join(A, '03-forecourt-desktop.png'), 120, 8, 1, text='head 1111')
    still(os.path.join(B, '03-forecourt-desktop.png'), 160, 8, 2, text='head 2222')
    json.dump({'kit': {'build': {'short': '1111'}}}, open(os.path.join(A, '03-forecourt-desktop.json'), 'w'))
    still(R, 140, 20, 3)
    tsv = os.path.join(T, 'PART-BOXES.tsv')
    table(tsv, [['4 the lion frieze', '03-forecourt-desktop.png', '10 20 100 80', R, '0 0 150 120', 'A credit, CC BY 4.0', 'c1', '-'],
                ['7 the paving', '03-forecourt-desktop.png', '150 100 120 90', '-', '-', '-', 'c1', '-']])

    bx = load('boxes')
    rows = bx.read(tsv)
    bx.check(rows, [A, B])
    ok('a well-formed table reads and its boxes lie inside both folders\' stills')
    for bad, why in ((['4 the lion frieze after', '03-forecourt-desktop.png', '10 20 100 80', '-', '-', '-', 'c1', '-'], 'version word'),
                     (['4 a', '03-forecourt-desktop.png', '250 20 100 80', '-', '-', '-', 'c1', '-'], 'outside'),
                     (['4 a', '03-forecourt-desktop.png', '10 20 100 80', R, '0 0 10 10', '-', 'c1', '-'], 'credit')):
        t2 = os.path.join(T, 'bad.tsv')
        table(t2, [bad])
        try:
            bx.check(bx.read(t2), [A])
            raise AssertionError(f'not refused: {why}')
        except bx.Refused:
            pass
    ok('a version word, a box outside its still and a reference without credit are refused')
    ids = os.path.join(T, 'ids.tsv')
    table(ids, [[p + ' a part', '03-forecourt-desktop.png', '10 20 100 80', '-', '-', '-', 'c1', '-'] for p in ('9', '9a', 'A.9', 'A.14', '6.3', '3.5a')])
    assert [bx.num(r['part']) for r in bx.read(ids)] == ['9', '9a', 'A.9', 'A.14', '6.3', '3.5a']
    for bad in ('A', 'A9', 'a.9', '6.', '.3', '(9)', '6.3x1'):
        table(ids, [[bad + ' a part', '03-forecourt-desktop.png', '10 20 100 80', '-', '-', '-', 'c1', '-']])
        try:
            bx.read(ids)
            raise AssertionError(f'not refused: part {bad!r}')
        except bx.Refused:
            pass
    ok('a part leads with a whole number or a rule number (A.9, 6.3, 3.5a); anything else is refused')
    moved = os.path.join(T, 'moved.tsv')
    table(moved, [['4 the lion frieze', '03-forecourt-desktop.png', '12 20 100 80', R, '0 0 150 120', 'A credit, CC BY 4.0', 'c2', '-']])
    try:
        bx.kept(bx.read(moved), rows)
        raise AssertionError('a moved box passed')
    except bx.Refused:
        pass
    assert bx.kept(bx.read(tsv), rows) == []
    ok('a box that moved since the last cycle is refused, a kept one passes')

    out = os.path.join(T, 'crops')
    r = run(os.path.join(KIT, 'part-crops.py'), tsv, A, B, out)
    assert r.returncode == 0, r.stderr
    assert sorted(os.listdir(out)) == ['fixed-4.jpg', 'fixed-7.jpg'], os.listdir(out)
    w, h = Image.open(os.path.join(out, 'fixed-4.jpg')).size
    assert w >= 300 + 300 and h > 80 + 3 * 80, (w, h)
    ok('part-crops cuts one sheet per part, both versions and the reference')

    brief, rules = os.path.join(T, 'brief.md'), os.path.join(T, 'rules.md')
    open(brief, 'w').write('Read the packet at {PACKET} alone against the photos.\n')
    open(rules, 'w').write('1. The frieze reads as glazed brick.\n')
    root, seal = os.path.join(T, 'judge'), os.path.join(T, 'keys', 'r1-SEAL.txt')
    r = run(os.path.join(KIT, 'alone-packet.py'), 'gate-r1', '--boxes', tsv, '--a', A, '--b', B, '--rules', rules, '--brief', brief, '--root', root, '--seal', seal)
    assert r.returncode == 0, r.stderr
    packs = sorted(os.listdir(root))
    assert len(packs) == 2 and all(p.startswith('gate-r1-') for p in packs), packs
    for p in packs:
        files = sorted(os.listdir(os.path.join(root, p)))
        assert files == ['JUDGE-BRIEF.md', 'RULES.md', 'V', 'fixed-4.jpg', 'fixed-7.jpg'], files
        v = os.listdir(os.path.join(root, p, 'V'))
        assert v == ['03-forecourt-desktop.png'], v
        assert not Image.open(os.path.join(root, p, 'V', v[0])).text, 'a text chunk travelled'
        assert os.path.join(root, p) in open(os.path.join(root, p, 'JUDGE-BRIEF.md')).read()
    sealed = open(seal).read()
    assert all(p in sealed for p in packs) and ' = A ' in sealed and ' = B ' in sealed
    r = run(os.path.join(KIT, 'alone-packet.py'), 'gate-r1', '--boxes', tsv, '--a', A, '--b', B, '--rules', rules, '--brief', brief, '--root', root, '--seal', seal)
    assert r.returncode != 0 and 'exists' in r.stderr
    ok('alone-packet seals two packets: pixels only, every part, the map in the seal alone; a second seal is refused')
    open(rules, 'w').write('1. Better than the version before.\n')
    r = run(os.path.join(KIT, 'alone-packet.py'), 'gate-r2', '--boxes', tsv, '--a', A, '--b', B, '--rules', rules, '--brief', brief, '--root', root, '--seal', seal + '2')
    assert r.returncode != 0 and 'version word' in r.stderr, r.stderr
    ok('rules carrying a version word are refused')

    C = os.path.join(T, 'c')
    os.makedirs(C)
    still(os.path.join(C, '03-forecourt-desktop.png'), 120, 8, 9)
    r = run(os.path.join(KIT, 'change.py'), A, C)
    assert r.returncode == 2 and 'NO JUDGE' in r.stdout, r.stdout
    r = run(os.path.join(KIT, 'change.py'), A, B)
    assert r.returncode == 0 and r.stdout.strip().splitlines()[-1].startswith('JUDGE'), r.stdout
    ok('change: a re-render\'s noise is no change, a 40-level lift is')

    fill = load('fill')
    rng = np.random.default_rng(4)
    flat = Image.fromarray(np.full((64, 64, 3), 128, np.uint8))
    grain = Image.fromarray(np.clip(128 + rng.normal(0, 12, (64, 64, 1)).repeat(3, axis=2), 0, 255).astype(np.uint8))
    tile = Image.fromarray(np.tile(np.clip(128 + rng.normal(0, 12, (8, 8, 1)).repeat(3, axis=2), 0, 255).astype(np.uint8), (8, 8, 1)))
    m0, mid0, broad0, _ = fill.numbers(flat)
    m1, mid1, broad1, rep1 = fill.numbers(grain)
    _, _, _, rep2 = fill.numbers(tile)
    assert mid0 == 0 and mid1 > 0.01 and abs(m1 - 128) < 3
    assert rep2 > rep1 + 0.3, (rep1, rep2)
    r = run(os.path.join(KIT, 'fill.py'), '--boxes', tsv, A)
    assert r.returncode == 0 and r.stdout.count('\n') == 3, r.stdout + r.stderr
    ok('fill: a flat box has no band contrast, grain has some, a tiled texture repeats')

print(f'{len(passed)} passed')
