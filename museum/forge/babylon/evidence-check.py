"""The evidence check over a wing's record (the house's evidence standard: one row per piece, place, form and finish each
on one ladder, the shown class recomputed by the weaker of place and form).

Usage: python3 -I evidence-check.py <EVIDENCE.tsv> --keys <SOURCE-KEYS.tsv> [--switch <shown.json>] [--json <out>]

The record is read by plain tab split (fields may hold quotation marks). Checked:
  schema    the standard's 17 columns in order (piece ... checked_by), then any of phase, rights; every row whole
  ids       one row per piece; every piece id `depends` names is a row (it may also hold conditions in words)
  rungs     place on here, trace, rec, type, ours; form on the whole ladder (moved and lost are form only); finish on
            here, trace, rec, type, ours or -
  shown     a ceiling from the weaker of place and form (here > moved > trace > rec > type > ours): blank if form is
            lost; in place if place and form are here; known if the weaker is here, moved or trace; reconstructed if it
            is rec; typical if it is type, or place is ours under a form of type or stronger (the kind attested, where
            and how many ours); guessed if form is ours. Two sides: known (in place, known, reconstructed) and guessed
            (typical, guessed). The class a row shows is the weaker of its stored word and its ceiling.
  locator   a row with a rung on here, trace or rec names at least one source with a place in it (a page, chapter, part,
            row, figure, plate, or a single map sheet)
  sources   every source's key resolves through the key table (key, target, note): a file that exists, an http(s)
            address, or "via <key>" to another key
  phase     one of PHASES, optionally followed by a note in brackets ("out (why)")
REFUSED (the switch would show a guess as known): a stored word on the known side over a ceiling on the guessed side; any
word but blank on a lost form; a row shown on the known side whose every graded strength is w (guessed, ours); with
--switch (a JSON map piece -> the class the page shows), a piece shown on the known side whose row shows less, a piece
the record does not hold, a piece whose phase is buried, later or out drawn at all.
ERROR as well: a stored word on the guessed side (or blank) under a ceiling on the known side; a page class stronger
than its row's inside one side.
LOWERED, listed, not failing: a stored word stronger than its ceiling inside one side (the class file shows the ceiling);
a stored word weaker than its ceiling inside one side is allowed. LISTED, not failing: every row shown guessed whose kind
has no attested source (place and form both ours, and no "Typical" in strength, basis or alternatives).
Exit 0 when clean, 1 on any error or refusal.
"""
import json
import os
import re
import sys

COLUMNS = ['piece', 'name_en', 'name_de', 'where', 'place', 'form', 'finish', 'shown', 'basis', 'sources', 'strength', 'transfer',
           'depends', 'alternatives', 'never', 'set_by', 'checked_by']
EXTRA = ['phase', 'rights']
PLACE = {'here', 'trace', 'rec', 'type', 'ours'}
FORM = {'here', 'moved', 'trace', 'rec', 'type', 'ours', 'lost'}
FINISH = {'here', 'trace', 'rec', 'type', 'ours', '-'}
PHASES = {'standing', 'late-reign', 'standing-likely', 'open', 'buried', 'not-of-date', 'later', 'out'}
UNDRAWN = {'buried', 'later', 'out'}
RANK = {'blank': 0, 'guessed': 1, 'typical': 2, 'reconstructed': 3, 'known': 4, 'in place': 5}
SIDE = {'in place': 'known', 'known': 'known', 'reconstructed': 'known', 'typical': 'guessed', 'guessed': 'guessed', 'blank': 'none'}
RUNG = {'here': 5, 'moved': 4, 'trace': 3, 'rec': 2, 'type': 1, 'ours': 0}
CLASS_WORD = re.compile(r'^(in place|known|reconstructed|typical|guessed)\b', re.I)
SHEET = re.compile(r'^(?:[A-Z])?\d+\.\d+$')
PIECE_ID = re.compile(r'\b[a-z]{2,5}\.[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*')
LOCATOR = re.compile(r'\b(p|pp|ch|fig|figs|pl|pls|part|row|rows|abb|taf|col|line|lines)\b\.?|§|\b[IVXLC]+\b|\d', re.I)


def shown(place, form):
    """the ceiling place and form give"""
    if form == 'lost':
        return 'blank'
    if place == 'here' and form == 'here':
        return 'in place'
    if form == 'ours' or place not in RUNG or form not in RUNG:
        return 'guessed'
    if place == 'ours':
        return 'typical'
    w = min(RUNG[place], RUNG[form])
    return 'known' if w >= RUNG['trace'] else 'reconstructed' if w == RUNG['rec'] else 'typical'


def weaker(a, b):
    return a if RANK[a] <= RANK[b] else b


def phase_of(text):
    # a phase may carry a note in brackets: "out (why)"
    return re.sub(r'\s*\([^()]*\)$', '', text.strip())


def grades(strength):
    """the strength cell's graded items (s, m, w); a lead class word ("Reconstructed; ...") is the mark, not a grade"""
    items = [s.strip() for s in strength.split(';') if s.strip()]
    return [s[:1] for s in items if not CLASS_WORD.match(s)]


def read_tsv(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    if lines and lines[-1] == '':
        lines = lines[:-1]
    return lines[0].split('\t'), [l.split('\t') for l in lines[1:]]


def read_keys(path):
    head, rows = read_tsv(path)
    if head[:2] != ['key', 'target']:
        raise SystemExit(f'{path}: the key table starts with the columns key, target')
    return {r[0]: r[1] for r in rows if r and r[0]}


def resolve(key, keys, seen=()):
    if key not in keys:
        return None, f'no key "{key}" in the key table'
    t = keys[key].strip()
    if t.startswith('via '):
        nxt = key_of(t[4:].strip(), keys)
        if nxt in seen:
            return None, f'a loop of "via" at {key}'
        return resolve(nxt, keys, seen + (key,))
    if re.match(r'^https?://\S+$', t):
        return t, None
    if os.path.isabs(t) and os.path.exists(t):
        return t, None
    return None, f'"{key}" points at {t}, which is no file here and no address'


def source_items(text):
    return [s.strip() for s in text.split(';') if s.strip()]


def key_of(item, keys=()):
    # Keys may hold spaces ("CAD G", "RIBo 002"): the longest key the item starts with, else its first word.
    for k in sorted(keys, key=len, reverse=True):
        if item == k or (item.startswith(k) and item[len(k)] in ' ,:;('):
            return k
    return item.split()[0].rstrip(',:')


def check(record, keys, switch=None):
    head, rows = read_tsv(record)
    errors, refused, notes, lowered, listed = [], [], [], [], []
    if head[:len(COLUMNS)] != COLUMNS or any(c not in EXTRA for c in head[len(COLUMNS):]):
        errors.append(f'schema: the header is not the standard\'s {len(COLUMNS)} columns in order (then {", ".join(EXTRA)}): {head}')
        return {'rows': len(rows), 'errors': errors, 'refused': refused, 'notes': notes, 'lowered': lowered, 'listed': listed}
    col = {c: i for i, c in enumerate(head)}
    ids, by = set(), {}
    for n, f in enumerate(rows, 2):
        if len(f) != len(head):
            errors.append(f'line {n}: {len(f)} fields, not {len(head)}')
            continue
        r = {c: f[i] for c, i in col.items()}
        pid = r['piece'].strip()
        if not pid:
            errors.append(f'line {n}: no piece id')
            continue
        if pid in ids:
            errors.append(f'line {n}: {pid} has two rows')
        ids.add(pid)
        by[pid] = (n, r)
    unresolved = {}
    prefixes = {p.split('.')[0] for p in ids}
    for pid, (n, r) in by.items():
        at = f'line {n} {pid}'
        if r['place'] not in PLACE:
            errors.append(f'{at}: place "{r["place"]}" is not on the ladder for place')
        if r['form'] not in FORM:
            errors.append(f'{at}: form "{r["form"]}" is not on the ladder')
        if r['finish'] not in FINISH:
            errors.append(f'{at}: finish "{r["finish"]}" is not on the ladder for finish')
        if 'phase' in r and phase_of(r['phase']) not in PHASES:
            errors.append(f'{at}: phase "{r["phase"]}" is not one of {", ".join(sorted(PHASES))}')
        rule = shown(r['place'], r['form'])
        word = r['shown']
        cls = rule
        if word not in RANK:
            errors.append(f'{at}: shown "{word}" is not a class')
        elif word != rule:
            cls = weaker(word, rule)
            why = f'stored "{word}", the rule gives "{rule}" (place {r["place"]}, form {r["form"]})'
            if rule == 'blank' or (SIDE[word] == 'known' and SIDE[rule] == 'guessed'):
                refused.append(f'{at}: {why}')
            elif SIDE[word] != SIDE[rule] and RANK[word] < RANK[rule]:
                errors.append(f'{at}: {why}')
            elif RANK[word] > RANK[rule]:
                lowered.append(f'{at}: {why}; shown "{rule}"')
        g = grades(r['strength'])
        if SIDE[cls] == 'known' and g and all(s == 'w' for s in g):
            refused.append(f'{at}: shown "{cls}" while every strength is w ({r["strength"]})')
        if SIDE[cls] == 'guessed' and r['place'] == 'ours' and r['form'] == 'ours' and not any(
                'typical' in r[c].lower() for c in ('strength', 'basis', 'alternatives')):
            listed.append(f'{at}: shown "{cls}", place and form ours, and no Typical source named')
        items = source_items(r['sources'])
        if not items:
            errors.append(f'{at}: no source')
        if {r['place'], r['form'], r['finish']} & {'here', 'trace', 'rec'}:
            if not any(SHEET.match(key_of(i)) or (len(i.split()) > 1 and LOCATOR.search(i.split(None, 1)[1])) for i in items):
                errors.append(f'{at}: a rung on here, trace or rec and no source names a page, part or sheet ({r["sources"]})')
        for i in items:
            k = key_of(i, keys)
            _, why = resolve(k, keys)
            if why:
                unresolved.setdefault(k, []).append(pid)
        # `depends` holds ids and conditions in words; every id it names must be a row
        for d in PIECE_ID.findall(r['depends']):
            if d.split('.')[0] in prefixes and d not in ids:
                errors.append(f'{at}: depends on "{d}", which is no row')
    for k, pids in sorted(unresolved.items()):
        errors.append(f'source "{k}" does not resolve ({resolve(k, keys)[1]}): {len(pids)} row(s), first {pids[0]}')
    if switch is not None:
        for pid, cls in sorted(switch.items()):
            if pid not in by:
                refused.append(f'switch: {pid} is shown, and the record has no row for it')
                continue
            n, r = by[pid]
            row_cls = class_of(r)
            if cls not in RANK:
                errors.append(f'switch: {pid} shown as "{cls}", which is no class')
            elif SIDE[cls] == 'known' and SIDE[row_cls] != 'known':
                refused.append(f'switch: {pid} shown as "{cls}", its row allows "{row_cls}" (line {n})')
            elif RANK[cls] > RANK[row_cls]:
                errors.append(f'switch: {pid} shown as "{cls}", its row shows "{row_cls}" (line {n})')
            if phase_of(r.get('phase', '')) in UNDRAWN:
                refused.append(f'switch: {pid} is drawn, and its phase is {r["phase"]} (line {n})')
    order = lambda c: sorted(c.items(), key=lambda x: -RANK[x[0]])
    ceilings, classes = {}, {}
    for pid, (n, r) in by.items():
        ceilings[shown(r['place'], r['form'])] = ceilings.get(shown(r['place'], r['form']), 0) + 1
        classes[class_of(r)] = classes.get(class_of(r), 0) + 1
    notes.append(f'recomputed ceilings: {", ".join(f"{k} {v}" for k, v in order(ceilings))}')
    notes.append(f'classes shown (the weaker of word and ceiling): {", ".join(f"{k} {v}" for k, v in order(classes))}')
    return {'rows': len(by), 'errors': errors, 'refused': refused, 'notes': notes, 'lowered': lowered, 'listed': listed,
            'unresolvedKeys': sorted(unresolved)}


def class_of(r):
    """the class a row shows: the weaker of its stored word and its ceiling (the ceiling when the word is no class)"""
    rule = shown(r['place'], r['form'])
    return weaker(r['shown'], rule) if r['shown'] in RANK else rule


def main(argv):
    if len(argv) < 3 or '--keys' not in argv:
        raise SystemExit(__doc__)
    opt = {argv[i]: argv[i + 1] for i in range(1, len(argv) - 1, 2)}
    switch = json.load(open(opt['--switch'])) if '--switch' in opt else None
    rep = check(argv[0], read_keys(opt['--keys']), switch)
    for r in rep['refused']:
        print(f'REFUSED {r}')
    for e in rep['errors']:
        print(f'ERROR {e}')
    for l in rep['lowered']:
        print(f'LOWERED {l}')
    for l in rep['listed']:
        print(f'LISTED {l}')
    for n in rep['notes']:
        print(n)
    if '--json' in opt:
        json.dump(rep, open(opt['--json'], 'w'), indent=1, ensure_ascii=False)
    bad = len(rep['errors']) + len(rep['refused'])
    print(f'{rep["rows"]} rows: {len(rep["refused"])} refused, {len(rep["errors"])} errors, {len(rep["lowered"])} lowered, '
          f'{len(rep["listed"])} listed' + ('' if bad else ', clean'))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main(sys.argv[1:])
