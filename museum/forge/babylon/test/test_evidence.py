"""The evidence check on a made-up record: python3 -I forge/babylon/test/test_evidence.py (exit 0 when all pass)."""
import importlib.util
import json
import os
import sys
import tempfile

sys.dont_write_bytecode = True
KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('evidence_check', os.path.join(KIT, 'evidence-check.py'))
ec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ec)

HEAD = ec.COLUMNS + ['phase', 'rights']


def row(piece, place, form, finish, shown, sources, strength='s Measured', depends='none', phase='standing', basis='-'):
    r = dict.fromkeys(HEAD, '-')
    r.update(piece=piece, place=place, form=form, finish=finish, shown=shown, sources=sources, strength=strength, depends=depends, phase=phase, checked_by='',
             basis=basis)
    return '\t'.join(r[c] for c in HEAD)


assert [ec.shown(p, f) for p, f in [('here', 'here'), ('here', 'trace'), ('trace', 'moved'), ('rec', 'moved'), ('here', 'rec'), ('rec', 'rec'),
                                     ('here', 'type'), ('type', 'rec'), ('ours', 'here'), ('ours', 'type'), ('type', 'ours'), ('here', 'ours'),
                                     ('rec', 'lost')]] == \
    ['in place', 'known', 'known', 'reconstructed', 'reconstructed', 'reconstructed',
     'typical', 'typical', 'typical', 'typical', 'guessed', 'guessed', 'blank']
assert [ec.SIDE[c] for c in sorted(ec.RANK, key=ec.RANK.get)] == ['none', 'guessed', 'guessed', 'known', 'known', 'known']
print('ok 1 - six classes from the weaker of place and form, on two sides: a place of ours under an attested form is typical')

with tempfile.TemporaryDirectory() as T:
    src = os.path.join(T, 'book.txt')
    open(src, 'w').write('a source')
    keys = os.path.join(T, 'KEYS.tsv')
    open(keys, 'w').write(f'key\ttarget\tnote\nBK\t{src}\ta book\nWEB\thttps://example.org/page\ta page\nVIA\tvia BK\tthrough the book\n2.28\t{src}\ta map sheet\n')
    good = [row('bab.a', 'here', 'here', 'here', 'in place', 'BK p. 5'),
            row('bab.b', 'rec', 'moved', 'rec', 'reconstructed', 'BK ch. IV; WEB', depends='bab.a stands'),
            row('bab.c', 'type', 'ours', 'ours', 'guessed', 'VIA'),
            row('bab.d', 'rec', 'lost', '-', 'blank', '2.28'),
            row('bab.e', 'here', 'here', '-', 'in place', 'BK p. 9', phase='later'),
            row('bab.m', 'ours', 'type', 'type', 'typical', 'BK p. 6', strength='Typical; s Text-attested; w Guessed (place)'),
            row('bab.n', 'ours', 'type', 'type', 'guessed', 'BK p. 7'),                       # weaker inside a side: allowed
            row('bab.o', 'here', 'trace', '-', 'reconstructed', 'BK p. 8'),                   # weaker inside a side: allowed
            row('bab.p', 'ours', 'ours', 'ours', 'guessed', 'BK', phase='out (a note)', basis='a Typical kind elsewhere')]
    rec = os.path.join(T, 'EVIDENCE.tsv')
    open(rec, 'w').write('\t'.join(HEAD) + '\n' + '\n'.join(good) + '\n')
    rep = ec.check(rec, ec.read_keys(keys))
    assert not rep['errors'] and not rep['refused'] and not rep['lowered'] and not rep['listed'], rep
    print('ok 2 - a clean record passes: rungs, the classes, a weaker word inside a side, a phase with a note, locators, keys')

    bad = good + [row('bab.f', 'type', 'here', 'here', 'known', 'BK p. 1'),                    # known over a typical ceiling
                  row('bab.g', 'rec', 'rec', 'rec', 'reconstructed', 'BK p. 2', strength='Reconstructed; w Guessed'),  # on a guess
                  row('bab.h', 'here', 'trace', '-', 'guessed', 'BK p. 3'),                # a guessed word under a known ceiling
                  row('bab.i', 'rec', 'rec', '-', 'reconstructed', 'BK'),                  # no page on rec
                  row('bab.j', 'moved', 'here', '-', 'guessed', 'NOPE p. 1', depends='bab.zz'),
                  row('bab.r', 'here', 'ours', 'ours', 'reconstructed', 'BK p. 3'),        # reconstructed over a guessed ceiling
                  row('bab.s', 'rec', 'lost', '-', 'guessed', 'BK p. 3'),                  # a word on a lost form
                  row('bab.t', 'rec', 'rec', '-', 'typical', 'BK p. 3'),                   # typical under a reconstructed ceiling
                  row('bab.u', 'type', 'type', '-', 'mixed', 'BK p. 3'),
                  row('bab.v', 'ours', 'ours', 'ours', 'guessed', 'BK p. 3', phase='gone')]
    open(rec, 'w').write('\t'.join(HEAD) + '\n' + '\n'.join(bad) + '\n')
    rep = ec.check(rec, ec.read_keys(keys), switch={'bab.c': 'known', 'bab.a': 'in place', 'bab.e': 'in place', 'bab.q': 'known', 'bab.p': 'guessed',
                                                     'bab.b': 'known', 'bab.n': 'typical', 'bab.m': 'reconstructed'})
    R, E = '\n'.join(rep['refused']), '\n'.join(rep['errors'])
    assert 'bab.f: stored "known", the rule gives "typical"' in R, R
    assert 'bab.r: stored "reconstructed", the rule gives "guessed"' in R, R
    assert 'bab.s: stored "guessed", the rule gives "blank"' in R, R
    assert 'bab.g: shown "reconstructed" while every strength is w' in R, R
    assert 'switch: bab.c shown as "known", its row allows "guessed"' in R, R
    assert 'switch: bab.m shown as "reconstructed", its row allows "typical"' in R, R
    assert 'switch: bab.e is drawn, and its phase is later' in R, R
    assert 'switch: bab.p is drawn, and its phase is out (a note)' in R, R
    assert 'switch: bab.q is shown, and the record has no row' in R, R
    assert 'bab.a' not in R and 'bab.b' not in R and 'bab.n' not in R
    assert 'bab.h: stored "guessed", the rule gives "known"' in E, E
    assert 'bab.t: stored "typical", the rule gives "reconstructed"' in E, E
    assert 'bab.u: shown "mixed" is not a class' in E, E
    assert 'bab.v: phase "gone" is not one of' in E, E
    assert 'switch: bab.b shown as "known", its row shows "reconstructed"' in E, E
    assert 'switch: bab.n shown as "typical", its row shows "guessed"' in E, E
    assert 'bab.i: a rung on here, trace or rec and no source names' in E, E
    assert 'place "moved" is not on the ladder for place' in E, E
    assert 'depends on "bab.zz"' in E and 'source "NOPE" does not resolve' in E, E
    assert not rep['lowered'], rep['lowered']
    assert [l.split(':')[0] for l in rep['listed']] == ['line 20 bab.v'], rep['listed']
    print('ok 3 - a guess shown as known is refused (a known-side word over a guessed-side ceiling, a word on a lost form, by strength '
          'past a lead class word, by the switch); a drawn later or out piece and an unknown piece are refused')
    print('ok 4 - a guessed-side word under a known-side ceiling, a page class over its row inside a side, a rec without a page, a rung '
          'off its ladder, no class, an unknown phase, id and key are errors')
    print('ok 5 - a row shown guessed with place and form ours and no Typical source is listed, not failed')

    lowered = good + [row('bab.k', 'rec', 'rec', '-', 'known', 'BK p. 4'), row('bab.w', 'here', 'rec', '-', 'in place', 'BK p. 4'),
                      row('bab.x', 'type', 'type', '-', 'typical', 'BK p. 4'), row('bab.y', 'type', 'ours', '-', 'typical', 'BK p. 4')]
    open(rec, 'w').write('\t'.join(HEAD) + '\n' + '\n'.join(lowered) + '\n')
    rep = ec.check(rec, ec.read_keys(keys), switch={'bab.k': 'reconstructed', 'bab.y': 'guessed'})
    assert not rep['errors'] and not rep['refused'], rep
    assert [l.split(':')[0] for l in rep['lowered']] == ['line 11 bab.k', 'line 12 bab.w', 'line 14 bab.y'], rep['lowered']
    assert rep['lowered'][0].endswith('shown "reconstructed"') and rep['lowered'][2].endswith('shown "guessed"'), rep['lowered']
    print('ok 6 - a word stronger than its ceiling inside one side is lowered and listed, not failed; the switch takes the lowered class')

    open(keys, 'a').write(f'BK II\t{src}\ta second volume\nBK II note\tvia BK II\tan alias with spaces\n')
    spaced = good + [row('bab.k', 'rec', 'rec', '-', 'reconstructed', 'BK II p. 4'), row('bab.l', 'type', 'ours', 'ours', 'guessed', 'BK II note')]
    open(rec, 'w').write('\t'.join(HEAD) + '\n' + '\n'.join(spaced) + '\n')
    rep = ec.check(rec, ec.read_keys(keys))
    assert not rep['errors'] and not rep['refused'], rep
    assert ec.key_of('BK II p. 4', ec.read_keys(keys)) == 'BK II' and ec.key_of('BK p. 4', ec.read_keys(keys)) == 'BK'
    print('ok 7 - a key with a space resolves by the longest key the source starts with, also through via')

    open(rec, 'w').write('piece\tplace\n' + 'bab.a\there\n')
    rep = ec.check(rec, ec.read_keys(keys))
    assert rep['errors'] and rep['errors'][0].startswith('schema'), rep
    print('ok 8 - a record off the standard\'s columns is refused at the schema')
print('8 passed')
