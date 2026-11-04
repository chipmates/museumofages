// node --experimental-strip-types --no-warnings --test forge/babylon-map/sheet-measure.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crossings, inPoly, measure, sheetFrame, table } from './sheet-measure.mjs'

const MAP = join(dirname(fileURLToPath(import.meta.url)), '../../src/wings/babylon/map')
const mods = await import(join(MAP, 'plan.ts'))
const base = () => JSON.parse(readFileSync(join(MAP, 'map-plan.json'), 'utf8'))
const cams = JSON.parse(readFileSync(join(MAP, 'map-cams.json'), 'utf8'))
const rowOf = (rows, pt, re) => rows.find((r) => r.pt === pt && re.test(r.name))

test('a sheet frame turns both ways', () => {
  const f = sheetFrame(445773.0, 3600844.0, 348.96)
  const [E, N] = f.at(98.7, -3.8)
  assert.ok(Math.abs(f.a(E, N) - 98.7) < 1e-9 && Math.abs(f.c(E, N) + 3.8) < 1e-9)
  // c runs to the right of the bearing: east of a northward axis
  assert.ok(sheetFrame(0, 0, 0).c(1, 0) > 0.999)
})

test('crossings and inside', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]]
  assert.deepEqual(crossings(sq, (p) => p[1], 5, (p) => p[0]).sort((a, b) => a - b), [0, 10])
  assert.ok(inPoly([5, 5], sq) && !inPoly([11, 5], sq))
})

test('every settled point has a row, and the rows read the plan', () => {
  const rows = measure(base(), cams, mods)
  for (const pt of ['C1', 'C2', 'C3', 'C4', 'C5', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'T', 'D11', 'D12', 'D13', 'D14', 'G19', 'G20', 'B1', 'B2', 'N1'])
    assert.ok(rows.some((r) => r.pt === pt), `no row for ${pt}`)
  assert.ok(rows.every((r) => typeof r.pass === 'boolean' && r.src))
  assert.match(table(rows), /of \d+ pass/)
})

test('a moved record moves its measure (not a copy of the target)', () => {
  const p0 = base(), r0 = measure(p0, cams, mods)
  const p1 = base()
  const es = p1.blocks.find((b) => b.id === 'esagila')
  es.poly = es.poly.map(([E, N]) => [E + 3, N])
  p1.frames.lion.bearing += 0.3
  p1.walls.find((w) => w.id === 'precinct-east-wall').gaps[0].at[1] -= 4
  const r1 = measure(p1, cams, mods)
  const d = (re, pt) => rowOf(r1, pt, re).value - rowOf(r0, pt, re).value
  assert.ok(Math.abs(d(/bearing/, 'C3') - 0.3) < 1e-6)
  assert.ok(Math.abs(d(/south side length/, 'D12')) < 1e-6, 'a shift keeps the length')
  // the opening's centre slides along the wall with the gap's point
  assert.ok(Math.abs(Math.abs(d(/centre along the wall/, 'C1')) - 4 * 0.961) < 0.2)
})

test('a missing body fails its row instead of passing', () => {
  const p = base()
  p.blocks = p.blocks.filter((b) => b.id !== 'north-palace-main')
  const rows = measure(p, cams, mods)
  const r = rowOf(rows, 'D2', /largest edge offset/)
  assert.equal(r.value, null)
  assert.equal(r.pass, false)
})
