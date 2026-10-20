"""GATES.md from the hand-in's check outputs: each block the command that printed it, then what it printed.

  python3 -I gates.py <hand-in folder> <branch head>

It adds no words of its own beyond the headings and the commands, and refuses to write when a side word slipped in.
"""
import json
import os
import re
import sys

hand, head = sys.argv[1], sys.argv[2]
ch = os.path.join(hand, 'checks')
G = 'museum/forge/babylon-gate'
S = 'node --experimental-strip-types --no-warnings'


def read(name):
    return open(os.path.join(ch, name), encoding='utf-8').read().rstrip('\n')


def block(text):
    return '```\n' + text + '\n```'


def section(fid, title):
    """the part of fidelity.txt under one of its own '== ' headings"""
    out, on = [], False
    for line in fid.split('\n'):
        if line.startswith('== '):
            on = title in line
        if on:
            out.append(line)
    return '\n'.join(out).strip('\n')


fid = read('fidelity.txt')
heads = [l for l in fid.split('\n') if l.startswith('== ')]
parts = []
parts.append(f'# GATES: the Ishtar Gate round, branch babylon-gate-1020 at {head}\n')
parts.append('Every number below was printed by the command above it, run from the worktree on this head. Paths are the hand-in folder\'s (`checks/`, `stills/`).\n')

parts.append('## Plan, rows, chosen heights and their ranges, row 11, street, eye heights, sun and shadow lines, cameras')
parts.append(f'`{S} {G}/fidelity.mjs --facts checks/facts.json --json checks/fidelity.json` (exit 0)')
parts.append(block(fid))

parts.append('## Glazes against COLOURS.md 9')
parts.append(f'`{S} {G}/colour-check.mjs --md checks/colours.md` (exit 0)')
parts.append(read('colours.md'))
parts.append('Hue of the glazes as printed in the stills (a report; the print moves them; the red picks include the red breccia):')
parts.append(f'`python3 -I {G}/measure.py hues stills/<crop>.png --md checks/HUES.md`')
parts.append(read('HUES.md'))

parts.append('## Medians, p1, p99 of every still and of the door box')
parts.append(f'`python3 -I {G}/measure.py stats stills --boxes checks/crop-boxes.json --md checks/NUMBERS.md`')
parts.append(read('NUMBERS.md'))

parts.append('## Coplanar and sub-pixel (ratio 2 and ratio 1, and the three phone sizes)')
parts.append(f'`{S} {G}/geometry-check.mjs --json checks/geometry.json --eyes checks/facts.json` (exit 0)')
parts.append(block(read('geometry.txt')))
parts.append(f'`{S} {G}/geometry-check.mjs --near 10 --json checks/geometry-near10.json --eyes checks/facts.json` (exit 1)')
parts.append(block(read('geometry-near10.txt')))

parts.append('## Settings read back (one sidecar per still) and render seconds')
parts.append(f'`python3 -I {G}/measure.py settings stills --md checks/SETTINGS.md`')
parts.append(read('SETTINGS.md'))

parts.append('## The switch: difference mask and shares (id pass)')
parts.append(f'`python3 -I {G}/measure.py mask stills/<F>-plain.png stills/<F>-switch.png checks/mask-<F>.png --ids checks/ids/<F>-ids.png` and `measure.py shares checks/ids/<F>-ids.png`, F in desk, phone-390x664, phone-360x640, phone-390x844')
parts.append(block(read('SWITCH.txt')))

hero = json.load(open(os.path.join(ch, 'hero.json')))
rows = ['| still | door box (CSS px) | figure box (CSS px) | measured band height (CSS px): east tower, west tower, door wall east, door wall west |', '|---|---|---|---|']
for size, v in hero['cams'].items():
    b = v['band']
    rows.append(f"| {size} | {v['door']} | {v['figure']} | {b['east tower']}, {b['west tower']}, {b['door wall east']}, {b['door wall west']} |")
parts.append('## The measured band, the door and the figure, projected')
parts.append(f'`node {G}/shoot.mjs --port 5220 --data-port 5221 --hero checks/hero.json`')
parts.append('\n'.join(rows))

box = json.load(open(os.path.join(ch, 'sheet-box.json')))
rows = ['| size | lang | box or band top + height (CSS px) | line rows | picture share (%) |', '|---|---|---|---|---|']
for r in box['runs']:
    b = r.get('sheet') or r.get('band') or {}
    rows.append(f"| {r['size']} | {r['lang']} | {b.get('top')} + {b.get('height')} | {(r.get('line') or {}).get('rows')} | {r.get('pictureShare')} |")
parts.append('## The live wing\'s box and band at rest (port 5222)')
parts.append(f'`node {G}/sheet-box.mjs --out checks/sheet-box.json --shots checks/sheet-box --film none`')
parts.append('\n'.join(rows))

parts.append('## The legend over the switch stills and the box\'s outline over the plain stills')
parts.append(f'`node {G}/overlay.mjs --still stills/<S>-switch.png --lang <en|de> --out stills/<S>-switch-<lang>.png --live checks/sheet-box.json --hero checks/hero.json`; `--sheet` for the outline')
parts.append(block('\n'.join(l for l in read('OVERLAY.txt').split('\n') if not l.startswith('step '))))

rights = read('RIGHTS.txt').split('\n')
parts.append('## Rights: every file the page and the overlay loaded, and a grep of the code')
parts.append('`step.sh` rights block: the union of `checks/network-stills.json`, `checks/ids/network.json` and the overlays\' request lists, against `/refs/`, `/sources/`, `evidence-1019`, `research-1020`, `uppsala-maps-1020`, `PILOT`; then `grep -rnE` of the gate\'s code and tools')
parts.append(block('\n'.join(rights)))

parts.append('## The card\'s own')
parts.append('`pnpm -C museum typecheck` (exit 0); `pnpm -C museum build` (exit 0, the manifest check inside it):')
parts.append(block('\n'.join(read('build.txt').split('\n')[:3] + ['...'] + read('build.txt').split('\n')[-6:])))

text = '\n\n'.join(parts) + '\n'
bad = re.findall(r'\b(first|final|dull|opus|fable|claude|gpt|sonnet|seat)\b', text, re.I)
if bad:
    raise SystemExit(f'side words in GATES.md: {sorted(set(bad))}')
open(os.path.join(hand, 'GATES.md'), 'w', encoding='utf-8').write(text)
print(f'GATES.md {len(text)} characters, {text.count(chr(10))} lines')
