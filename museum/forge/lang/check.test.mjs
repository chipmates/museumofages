// node --test forge/lang/check.test.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkDir, checkLanguage, placeholderProblem } from './check.mjs'

const A = 'a3f9c2e1b07d4410'
const B = '0123456789abcdef'
const C = 'fedcba9876543210'
const rec = (status, extra = {}) => ({ src: '5b1e09c2a7f3', beat: 'c09e4471b2aa', status, at: '2026-10-09 14:12', ...extra })

/** A language that holds: two walk strings, one machine string in plural forms, one kept string. */
function good() {
  return {
    'walk.json': { [A]: 'Léonard aurait peint cet ange.', [B]: 'Étape {n} sur {total}' },
    'machines.json': { [C]: { one: '{0} machine', other: '{0} machines' } },
    'status.json': { [A]: rec('checked'), [B]: rec('draft'), [C]: rec('native'), '1111111111111111': rec('kept') },
    'tag.json': { walk: true, records: false, codex: true, pictures: true },
  }
}
const broken = (fn) => { const f = good(); fn(f); return checkLanguage('fr', f) }

test('a language that holds has no problem', () => {
  assert.deepEqual(checkLanguage('fr', good()), [])
  assert.deepEqual(checkLanguage('pt-BR', good()), [])
})

test('placeholders are well formed', () => {
  assert.equal(placeholderProblem('{n} sur {total}, {museum:fly_age}'), null)
  assert.match(placeholderProblem('{n sur'), /never closes/)
  assert.match(placeholderProblem('n} sur'), /closes with none open/)
  assert.match(placeholderProblem('{a{b}}'), /opens inside/)
  assert.match(placeholderProblem('{ }'), /malformed/)
})

const CASES = [
  ['a catalog that is a list', (f) => { f['walk.json'] = [] }, /walk\.json: not a flat object/],
  ['a key that is not a content key', (f) => { f['walk.json'].Back = 'Retour'; f['status.json'].Back = rec('draft') }, /Back is not a content key/],
  ['a value that is a number', (f) => { f['walk.json'][A] = 3 }, /neither a string nor plural forms/],
  ['plural forms without other', (f) => { f['machines.json'][C] = { one: 'x' } }, /neither a string nor plural forms/],
  ['an empty text', (f) => { f['walk.json'][A] = ' ' }, /is empty/],
  ['a broken placeholder', (f) => { f['walk.json'][B] = 'Étape {n sur {total}' }, /opens inside/],
  ['an em dash', (f) => { f['walk.json'][A] = 'Léonard — le peintre.' }, /a dash or a semicolon/],
  ['an en dash', (f) => { f['walk.json'][A] = 'de 1487 – 1489' }, /a dash or a semicolon/],
  ['a semicolon', (f) => { f['walk.json'][A] = 'Il peint; il écrit.' }, /a dash or a semicolon/],
  ['a chunk of no surface', (f) => { f['extra.json'] = {} }, /not one of the chunks/],
  ['a key in two chunks', (f) => { f['machines.json'][A] = 'x' }, /stands in walk\.json too/],
  ['a catalog key with no status', (f) => { delete f['status.json'][B] }, /has no status/],
  ['a status with no catalog entry', (f) => { f['status.json']['2222222222222222'] = rec('draft') }, /stands in no catalog/],
  ['a kept key that ships', (f) => { f['status.json'][A] = rec('kept') }, /is kept, yet walk\.json ships it/],
  ['an unknown status', (f) => { f['status.json'][A] = rec('approved') }, /status approved is not one of/],
  ['a commit id in a status', (f) => { f['status.json'][A] = rec('draft', { at: '998d36092731b899f9330f2025ca2ecc07f605d8' }) }, /is not a time|names a commit/],
  ['a field the status does not have', (f) => { f['status.json'][A] = rec('draft', { commit: 'abc' }) }, /has a field commit/],
  ['no status file', (f) => { delete f['status.json'] }, /status\.json: missing/],
  ['no tag file', (f) => { delete f['tag.json'] }, /tag\.json: missing/],
  ['a tag that says native too early', (f) => { f['tag.json'].walk = false }, /walk is false, the catalogs say true/],
  ['a tag still up on a native surface', (f) => { f['tag.json'].records = true }, /records is true, the catalogs say false/],
  ['a fixture file', (f) => { f['_fixture.json'] = { _: 'note' } }, /a fixture: drop it before landing/],
  ['a source for a passage the chunk does not hold', (f) => { f['walk.json'][`prov.${C}.kind`] = 'ours' }, /names a passage walk\.json does not hold/],
  ['a source of an unknown kind', (f) => { f['walk.json'][`prov.${A}.kind`] = 'printed' }, /not edition or ours/],
  ['a source label with a dash', (f) => { f['walk.json'][`prov.${A}.label`] = 'Traduction — 1910' }, /a dash or a semicolon/],
  ['a source key of another field', (f) => { f['walk.json'][`prov.${A}.year`] = '1910' }, /is not a content key/],
]

for (const [name, fn, want] of CASES) {
  test(`refused: ${name}`, () => {
    const problems = broken(fn)
    assert.ok(problems.some((p) => want.test(p)), `${name}: ${JSON.stringify(problems)}`)
  })
}

test('a passage may name its source: an old edition with its credit, or the museum\'s own', () => {
  assert.deepEqual(broken((f) => {
    f['walk.json'][`prov.${A}.kind`] = 'edition'
    f['walk.json'][`prov.${A}.label`] = 'Traduction de Joséphin Péladan, Textes choisis, 1907.'
    f['walk.json'][`prov.${A}.rest`] = 'Traduction de Péladan, 1907.'
    f['walk.json'][`prov.${B}.kind`] = 'ours'
  }), [])
})

test('a holder\'s own semicolon passes where the status marks it verbatim', () => {
  assert.deepEqual(broken((f) => { f['walk.json'][A] = 'Manuscrit L, vers 1497-1502 ; 1504.'; f['status.json'][A] = rec('checked', { verbatim_signs: true }) }), [])
})

test('the repository\'s own catalogs: every problem is a fixture that must not land', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'lang')
  for (const p of checkDir(dir)) assert.match(p, /\/_[^/]*\.json: a fixture/)
  const out = (() => { try { return execFileSync('node', [join(dirname(fileURLToPath(import.meta.url)), 'check.mjs'), dir], { encoding: 'utf8' }) } catch (e) { return e.stdout } })()
  assert.match(out, /every catalog holds|problem\(s\) in/)
})
