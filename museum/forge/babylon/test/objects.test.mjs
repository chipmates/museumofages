// node --test forge/babylon/test/*.test.mjs (feature 1's sign files read in a child node that strips the module's types)
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'

const W = join(APP, 'src/wings/babylon/objects')
const url = (p) => JSON.stringify(pathToFileURL(join(W, p)).href)
const FILES = ['brick-b5', 'slab-limestone-005', 'slab-breccia-007', 'slab-breccia-sennacherib']
const code = `
import { readFileSync } from 'node:fs'
import { signProblems, placeWedges, cutField, depthAt, signWedges } from ${url('inscription.ts')}
const out = {}
for (const id of ${JSON.stringify(FILES)}) {
  const ins = JSON.parse(readFileSync(new URL('signs/' + id + '.json', ${url('inscription.ts')}), 'utf8'))
  const wedges = placeWedges(ins)
  const field = cutField(ins, 0.5)
  // each sign is cut: the deepest point under its own wedges' heads reaches into the stone
  const shallow = []
  for (const line of ins.lines) line.signs.forEach((s, i) => {
    const own = wedges.filter((w) => w.line === line.n && w.sign === i + 1)
    const deepest = Math.max(...own.map((w) => depthAt(field, w.u + w.du * Math.min(w.len, w.wid) * 0.3, w.v + w.dv * Math.min(w.len, w.wid) * 0.3)))
    if (!(deepest > ins.depth * 0.25)) shallow.push(line.n + ':' + (i + 1) + ' ' + s.sign + ' ' + deepest.toFixed(2))
  })
  out[id] = { problems: signProblems(ins), lines: ins.lines.map((l) => ({ n: l.n, edition: l.edition, signs: l.signs.length,
    wedges: l.signs.map((_, i) => signWedges(ins, l.n, i + 1).length), like: l.signs.filter((s) => s.like).map((s) => s.sign),
    restored: l.signs.filter((s) => s.restored).length })), shallow, credit: ins.credit, copy: ins.copy }
}
console.log(JSON.stringify(out))`
const run = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
if (run.status !== 0) throw new Error(run.stderr)
const R = JSON.parse(run.stdout)

test('every sign of each edition line is drawn, in the edition order, from a named source', () => {
  for (const id of FILES) assert.deepEqual(R[id].problems, [], id)
})

test('every sign has wedges, and every sign is cut into the stone', () => {
  for (const id of FILES) {
    for (const l of R[id].lines) assert.ok(l.wedges.every((n) => n > 0), `${id} line ${l.n}`)
    assert.deepEqual(R[id].shallow, [], id)
  }
})

test('the texts have their editions\' line counts and sign counts', () => {
  assert.deepEqual(R['brick-b5'].lines.map((l) => l.signs), [6, 5, 6, 6, 8, 7])
  assert.equal(R['slab-limestone-005'].lines.length, 6)
  assert.equal(R['slab-breccia-007'].lines.length, 5)
  assert.deepEqual(R['slab-breccia-sennacherib'].lines.map((l) => l.edition.join(' ')), ['AN 30 PAP MEŠ SU', 'MAN KUR AŠ'])
})

test('B5 line 4 ends on IBILA and line 5 opens SAG.KAL ša, as fig. 48 A draws them', () => {
  const [l4, l5] = [R['brick-b5'].lines[3], R['brick-b5'].lines[4]]
  assert.deepEqual(l4.edition.slice(-2), ['TUR', 'UŠ'])
  assert.deepEqual(l5.edition.slice(0, 3), ['SAG', 'KAL', 'ŠA2'])
})

test('slab n keeps Koldewey\'s split: kept signs solid, restored ones flagged', () => {
  const n = R['slab-breccia-007'].lines
  assert.ok(n.reduce((s, l) => s + l.restored, 0) > 30)
  assert.ok(n[0].restored < n[0].signs && n[2].restored < n[2].signs)
  assert.equal(n[4].restored, n[4].signs)
})

test('each file names its edition and its copy', () => {
  for (const id of FILES) {
    assert.match(R[id].credit, /CC BY-SA 3\.0/)
    assert.match(R[id].credit, /Koldewey/)
    assert.ok(R[id].copy.mmPerPx > 0.1 && R[id].copy.mmPerPx < 0.4, id)
  }
})
