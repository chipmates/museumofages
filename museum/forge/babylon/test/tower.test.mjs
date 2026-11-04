// node --test forge/babylon/test/*.test.mjs (stop 9's precinct, Gate 5 and Etemenanki built in a child node that strips its types)
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'

const W = join(APP, 'src/wings/babylon')
const url = (p) => JSON.stringify(pathToFileURL(join(W, p)).href)
const code = `
import { readFileSync } from 'node:fs'
import { buildPlan } from ${url('map/plan.ts')}
import { buildCourt } from ${url('court/court-geom.ts')}
import { buildTower } from ${url('tower/tower-geom.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), cp = j(${url('court/court-plan.json')}), tp = j(${url('tower/tower-plan.json')})
const c = buildCourt(buildPlan(plan), plan, cp)
const t = buildTower(c.built, plan, tp)
const box = (g) => { g.computeBoundingBox(); const b = g.boundingBox; return [b.min.y, b.max.y] }
// every face that lies more flat than upright, by the sign of its normal's rise
const flats = (g) => {
  const p = g.getAttribute('position'), ix = g.getIndex(), n = ix ? ix.count : p.count
  let up = 0, down = 0
  for (let k = 0; k < n; k += 3) {
    const v = [0, 1, 2].map((d) => { const i = ix ? ix.getX(k + d) : k + d; return [p.getX(i), p.getY(i), p.getZ(i)] })
    const a = v[1].map((x, d) => x - v[0][d]), b = v[2].map((x, d) => x - v[0][d])
    const nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0]
    const l = Math.hypot(nx, ny, nz)
    if (l > 0 && Math.abs(ny / l) > 0.5) ny > 0 ? up++ : down++
  }
  return { up, down }
}
console.log(JSON.stringify({ facts: t.facts, ids: t.bodies.map((b) => b.id), prisms: t.built.prisms.map((p) => p.id),
  boxes: t.built.boxes.map((b) => b.id), heights: Object.fromEntries(t.bodies.map((b) => [b.id, box(b.geometry)])),
  street: ['gate5-street-dug', 'gate5-street-south'].map((id) => flats(t.bodies.find((b) => b.id === id).geometry)) }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (tolerance ${tol})`)

test('the tower builds', () => assert.equal(r.status, 0, r.stderr))

test('Gate 5: an opening about 30 m wide, the recess 75 m deep, the wall at +12', () => {
  near(out.facts.opening, 30.4, 0.05, 'opening')
  near(out.facts.recessDepth, 75, 0.05, 'recess depth')
  assert.equal(out.facts.wallTop, 12)
  for (const id of ['precinct-east-n', 'precinct-east-s']) near(out.heights[id][1], 12, 1e-3, `${id} top`)
})

test('the stages at the tablet sizes: 91.5 square and 33 high on the +2.5 base, then 78, 60, 51, 42, 33, the temple 24 by 21, top at +92.5', () => {
  const s = out.facts.stages
  assert.equal(s.length, 7)
  const sides = [91.5, 78, 60, 51, 42, 33, 24], tops = [35.5, 53.5, 59.5, 65.5, 71.5, 77.5, 92.5]
  s.forEach((x, i) => {
    near(x.side, sides[i], 0.01, `${x.id} side`)
    near(x.y1, tops[i], 0.01, `${x.id} top`)
    // each stage seats a hand's breadth into the one below, so no seam opens
    if (i) assert.ok(x.y0 <= s[i - 1].y1 && x.y0 >= s[i - 1].y1 - 0.1, `${x.id} sits on the stage below`)
  })
  near(s[0].y1 - 2.5, 33, 0.01, 'the first stage over the base')
  near(s[6].y1 - s[5].y1, 15, 0.01, 'the temple')
  near(s[6].across, 21, 0.01, 'temple across')
  near(out.heights['tower-stage-7'][1], 92.5, 1e-3, 'the drawn top')
})

test('the stop replaces the map bodies it stands for and keeps the precinct ids', () => {
  assert.ok(!out.boxes.some((id) => id.startsWith('tower-stage-')), 'a stage left on the map')
  assert.ok(!out.prisms.some((id) => id.startsWith('precinct-')), 'a precinct prism left on the map')
  for (const id of ['gate5-threshold', 'gate5-street-dug', 'gate5-street-south', 'precinct-east-n', 'precinct-east-s', 'precinct-south-rooms-0', 'precinct-north-wall']) assert.ok(out.ids.includes(id), id)
  assert.ok(out.ids.filter((id) => id.startsWith('precinct-tower-')).length === out.facts.towers, 'slight towers')
})

test('the street overlay faces up, its lips stand upright', () => {
  for (const f of out.street) { assert.ok(f.up > 0, 'no top'); assert.equal(f.down, 0, 'a face looks down') }
  near(out.facts.gateToTower, 333.7, 1.0, 'gate to the tower centre')
})
