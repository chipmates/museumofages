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


def row(piece, place, form, finish, shown, sources, strength='s Measured', depends='none', phase='standing'):
    r = dict.fromkeys(HEAD, '-')
    r.update(piece=piece, place=place, form=form, finish=finish, shown=shown, sources=sources, strength=strength, depends=depends, phase=phase, checked_by='')
    return '\t'.join(r[c] for c in HEAD)


with tempfile.TemporaryDirectory() as T:
    src = os.path.join(T, 'book.txt')
    open(src, 'w').write('a source')
    keys = os.path.join(T, 'KEYS.tsv')
    open(keys, 'w').write(f'key\ttarget\tnote\nBK\t{src}\ta book\nWEB\thttps://example.org/page\ta page\nVIA\tvia BK\tthrough the book\n2.28\t{src}\ta map sheet\n')
    good = [row('bab.a', 'here', 'here', 'here', 'in place', 'BK p. 5'),
            row('bab.b', 'rec', 'moved', 'rec', 'known', 'BK ch. IV; WEB', depends='bab.a stands'),
            row('bab.c', 'type', 'ours', 'ours', 'guessed', 'VIA'),
            row('bab.d', 'rec', 'lost', '-', 'blank', '2.28'),
            row('bab.e', 'here', 'here', '-', 'in place', 'BK p. 9', phase='later')]
    rec = os.path.join(T, 'EVIDENCE.tsv')
    open(rec, 'w').write('\t'.join(HEAD) + '\n' + '\n'.join(good) + '\n')
    rep = ec.check(rec, ec.read_keys(keys))
    assert not rep['errors'] and not rep['refused'], rep
    print('ok 1 - a clean record passes: rungs, the recomputed class, locators, keys through files, addresses and via')

    bad = good + [row('bab.f', 'type', 'here', 'here', 'known', 'BK p. 1'),            # stored stronger than the rule
                  row('bab.g', 'rec', 'rec', 'rec', 'known', 'BK p. 2', strength='w Guessed'),  # known on a guess
                  row('bab.h', 'here', 'trace', '-', 'guessed', 'BK p. 3'),            # stored weaker: an error
                  row('bab.i', 'rec', 'rec', '-', 'known', 'BK'),                      # no page on rec
                  row('bab.j', 'moved', 'here', '-', 'guessed', 'NOPE p. 1', depends='bab.zz')]
    open(rec, 'w').write('\t'.join(HEAD) + '\n' + '\n'.join(bad) + '\n')
    rep = ec.check(rec, ec.read_keys(keys), switch={'bab.c': 'known', 'bab.a': 'in place', 'bab.e': 'in place', 'bab.q': 'known'})
    R, E = '\n'.join(rep['refused']), '\n'.join(rep['errors'])
    assert 'bab.f: stored "known", the rule gives "guessed"' in R, R
    assert 'bab.g: shown "known" while every strength is w' in R, R
    assert 'switch: bab.c shown as "known", its row allows "guessed"' in R, R
    assert 'switch: bab.e is drawn, and its phase is later' in R, R
    assert 'switch: bab.q is shown, and the record has no row' in R, R
    assert 'bab.a' not in R
    assert 'bab.h: stored "guessed", the rule gives "known"' in E, E
    assert 'bab.i: a rung on here, trace or rec and no source names' in E, E
    assert 'place "moved" is not on the ladder for place' in E, E
    assert 'depends on "bab.zz"' in E and 'source "NOPE" does not resolve' in E, E
    print('ok 2 - a guess shown as known is refused (stored, by strength, by the switch); a drawn later piece and an unknown piece are refused')
    print('ok 3 - a weaker stored class, a rec without a page, a rung off its ladder, an unknown id and key are errors')

    open(keys, 'a').write(f'BK II\t{src}\ta second volume\nBK II note\tvia BK II\tan alias with spaces\n')
    spaced = good + [row('bab.k', 'rec', 'rec', '-', 'known', 'BK II p. 4'), row('bab.l', 'type', 'ours', 'ours', 'guessed', 'BK II note')]
    open(rec, 'w').write('\t'.join(HEAD) + '\n' + '\n'.join(spaced) + '\n')
    rep = ec.check(rec, ec.read_keys(keys))
    assert not rep['errors'] and not rep['refused'], rep
    assert ec.key_of('BK II p. 4', ec.read_keys(keys)) == 'BK II' and ec.key_of('BK p. 4', ec.read_keys(keys)) == 'BK'
    print('ok 4 - a key with a space resolves by the longest key the source starts with, also through via')

    open(rec, 'w').write('piece\tplace\n' + 'bab.a\there\n')
    rep = ec.check(rec, ec.read_keys(keys))
    assert rep['errors'] and rep['errors'][0].startswith('schema'), rep
    print('ok 5 - a record off the standard\'s columns is refused at the schema')
print('5 passed')
