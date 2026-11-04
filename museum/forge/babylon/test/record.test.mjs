// node --test forge/babylon/test/*.test.mjs
// The class file from the record (record-classes.mjs) and the rows a body shows (src/wings/babylon/record.ts, run in a
// child node that strips its types, as the switch does).
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'
import { RANK, classFileText, classesFrom, shownBy } from '../record-classes.mjs'

const RECORD_TS = pathToFileURL(join(APP, 'src/wings/babylon/record.ts')).href
const ts = (code) => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', `import * as R from ${JSON.stringify(RECORD_TS)}\n${code}`], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

test("a row's class from its place and form, the evidence standard's rule", () => {
  assert.equal(shownBy('here', 'here'), 'in place')
  assert.equal(shownBy('here', 'trace'), 'known')
  assert.equal(shownBy('rec', 'moved'), 'known')
  assert.equal(shownBy('here', 'type'), 'guessed')
  assert.equal(shownBy('type', 'rec'), 'guessed')
  assert.equal(shownBy('ours', 'here'), 'guessed')
  assert.equal(shownBy('here', 'lost'), 'blank')
})

const RECORD = [
  ['piece', 'name_en', 'place', 'form', 'shown', 'sources'],
  ['x.wall.plan', 'A wall "as dug"', 'here', 'here', 'in place', 'SECRET-KEY p. 4'],
  ['x.wall.body', 'The wall above', 'here', 'type', 'known', 'SECRET-KEY p. 5'],
  ['x.relief', 'Reliefs', 'rec', 'moved', 'guessed', 'SECRET-KEY fig. 2'],
  ['x.gates', 'Gates', 'ours', 'lost', 'blank', 'SECRET-KEY'],
].map((r) => r.join('\t')).join('\n') + '\n'

test('the class file takes the weaker of the stored class and the rule, and nothing else', () => {
  const { classes, lowered, problems } = classesFrom(RECORD)
  assert.deepEqual(problems, [])
  // stored known, the rule gives guessed: lowered; stored guessed under a known rule: kept lower
  assert.deepEqual(classes, { 'x.wall.plan': 'in place', 'x.wall.body': 'guessed', 'x.relief': 'guessed', 'x.gates': 'blank' })
  assert.equal(lowered.length, 1)
  assert.match(lowered[0], /^x\.wall\.body/)
  const text = classFileText(classes)
  const j = JSON.parse(text)
  assert.deepEqual(Object.keys(j), ['about', 'classes'])
  for (const v of Object.values(j.classes)) assert.ok(v in RANK)
  assert.ok(!/SECRET|as dug|EVIDENCE|internal/.test(text), 'no source, name or path from the record')
})

test('a record that is not the standard shape is refused, not guessed', () => {
  assert.match(classesFrom('piece\tplace\tform\nx.a\there\there\n').problems.join(), /no column "shown"/)
  assert.match(classesFrom(RECORD + 'x.relief\tagain\there\there\tin place\tK p. 1\n').problems.join(), /two rows/)
  assert.match(classesFrom(RECORD + 'x.odd\todd\there\there\tsure\tK p. 1\n').problems.join(), /no class/)
})

test('the committed class file holds every row the rules name, each a class', () => {
  const file = JSON.parse(readFileSync(join(APP, 'src/wings/babylon/record-classes.json'), 'utf8'))
  const pieces = JSON.parse(readFileSync(join(APP, 'src/wings/babylon/pieces.json'), 'utf8'))
  assert.deepEqual(Object.keys(file), ['about', 'classes'])
  for (const [id, c] of Object.entries(file.classes)) assert.ok(c in RANK, `${id}: "${c}" is no class`)
  const named = pieces.rules.flatMap((r) => [r.piece, r.plan, ...(r.strips ?? [])]).filter(Boolean)
  const lacking = [...new Set(named.filter((id) => !(id in file.classes)))]
  assert.deepEqual(lacking, [], 'rows the rules name and the class file lacks')
})

test('a row overrides the letters; the plan row shows at the foot, else the body row', () => {
  const out = ts(`
    const pieces = { rules: [
      { match: '^a$', part: 'a', piece: 'p.body', plan: 'p.plan' },
      { match: '^b$', part: 'b', piece: 'p.body' },
      { match: '^pave$', part: 'pave', piece: 'p.mid', strips: ['p.mid', 'p.side', 'p.rest'] },
    ] }
    const file = { classes: { 'p.body': 'guessed', 'p.plan': 'in place', 'p.mid': 'known', 'p.side': 'guessed', 'p.rest': 'guessed' } }
    const n = R.recordNamer(pieces, file, '3')
    const pick = (c) => ({ plan: c.plan, piece: c.piece, foot: c.foot, above: c.above, strips: c.strips, missing: c.missing })
    console.log(JSON.stringify({ a: pick(n('a', ['G', 'G'])), b: pick(n('b', ['M', 'M'])), pave: pick(n('pave', ['R', 'R'])) }))`)
  assert.deepEqual(out.a, { plan: 'p.plan', piece: 'p.body', foot: 'in place', above: 'guessed', strips: [], missing: [] })
  assert.deepEqual(out.b, { plan: '', piece: 'p.body', foot: 'guessed', above: 'guessed', strips: [], missing: [] })
  assert.deepEqual(out.pave.strips.map((s) => s.shown), ['known', 'guessed', 'guessed'])
})

test('without a row the letters speak at the lower rung: M known; R, G, T guessed', () => {
  const out = ts(`
    const pieces = { rules: [{ match: '^a$', part: 'a', piece: 'p.none', plan: 'p.noplan' }, { match: '^u$', part: 'u', piece: '', needs: 'a row for u' }] }
    const n = R.recordNamer(pieces, { classes: {} }, '3')
    const pick = (c) => [c.foot, c.above, c.missing]
    console.log(JSON.stringify({ MM: pick(n('a', ['M', 'M'])), MR: pick(n('a', ['M', 'R'])), RR: pick(n('a', ['R', 'R'])), TT: pick(n('a', ['T', 'T'])),
      none: pick(n('a', null)), unruled: [n('zzz', ['M', 'M']).piece, n('zzz', ['M', 'M']).missing], unnamed: n('u', null).missing,
      from: R.FROM_LETTER, tone: R.TONE }))`)
  assert.deepEqual(out.MM, ['known', 'known', ['p.none', 'p.noplan']])
  assert.deepEqual(out.MR, ['known', 'guessed', ['p.none', 'p.noplan']])
  assert.deepEqual(out.RR.slice(0, 2), ['guessed', 'guessed'])
  assert.deepEqual(out.TT.slice(0, 2), ['guessed', 'guessed'])
  assert.deepEqual(out.none.slice(0, 2), ['guessed', 'guessed'])
  assert.deepEqual(out.unruled, ['', ['no rule names this body']])
  assert.deepEqual(out.unnamed, ['no row yet: a row for u'])
  assert.deepEqual(out.from, { M: 'known', R: 'guessed', G: 'guessed', T: 'guessed' })
  assert.deepEqual(out.tone, { 'in place': 0, known: 1, guessed: 2, blank: 2 })
})

test('a rule held to some stops names its row there only, each part capped by its own letters', () => {
  const out = ts(`
    const pieces = { rules: [{ match: '^s$', part: 'n', piece: 'p.north', stops: ['1', '3'] }, { match: '^s$', part: 's', piece: 'p.south', stops: ['4'] },
      { match: '^w$', part: 'w', piece: 'p.south' }] }
    const file = { classes: { 'p.north': 'known', 'p.south': 'in place' } }
    const n = (stop, L) => R.recordNamer(pieces, file, stop)('s', L)
    const pick = (c) => [c.piece, c.foot, c.above]
    console.log(JSON.stringify({ north: pick(n('3', ['M', 'M'])), southM: pick(n('4', ['M', 'M'])), southG: pick(n('4', ['G', 'G'])), bare: pick(n('4', null)),
      off: n('9', ['M', 'M']).missing, unheld: pick(R.recordNamer(pieces, file, '4')('w', ['G', 'G'])) }))`)
  assert.deepEqual(out.north, ['p.north', 'known', 'known'])
  // the stop's row is in place; a stretch whose letter is M shows at most known, a G stretch guessed
  assert.deepEqual(out.southM, ['p.south', 'known', 'known'])
  assert.deepEqual(out.southG, ['p.south', 'guessed', 'guessed'])
  assert.deepEqual(out.bare, ['p.south', 'guessed', 'guessed'])
  assert.deepEqual(out.off, ['no rule names this body'])
  // a row held at every stop overrides the letters
  assert.deepEqual(out.unheld, ['p.south', 'in place', 'in place'])
})

test('every body the gate page builds is named to a row the class file holds (the switch)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bab-switch-'))
  try {
    const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(APP, 'forge/babylon/switch.mjs'), '--page', 'gate', '--out', join(dir, 'shown.json')], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /no rule names \(0 bodies\)/)
    assert.match(r.stdout, /no row in the class file \(0 bodies/)
    const shown = JSON.parse(readFileSync(join(dir, 'shown.json'), 'utf8'))
    for (const s of ['bab.paving.limestone', 'bab.paving.breccia', 'bab.paving.outer']) assert.ok(s in shown, `the paving's strip ${s} is shown`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
