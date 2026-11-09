// node --test forge/babylon/test/*.test.mjs (stop 5's stair ramps: the plane each flight reads the sun's shadow on,
// built in a child node that strips its types)
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
import { buildGardens, LOOK } from ${url('gardens/gardens-geom.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), gp = j(${url('gardens/gardens-plan.json')})
const g = buildGardens(buildPlan(plan), plan, gp)
const bodies = g.bodies.map((b) => {
  const pos = b.geometry.getAttribute('position'), ramp = b.geometry.getAttribute('ramp')
  if (!ramp) return { id: b.id, stair: b.look === LOOK.stair, ramp: false }
  // per flight (one plane each): how far each vertex lies under its plane, and the plan points on it
  const flights = {}
  let offStair = 0
  for (let i = 0; i < pos.count; i++) {
    const A = ramp.getX(i), B = ramp.getY(i), C = ramp.getZ(i), w = ramp.getW(i)
    if (w === 0) { offStair = Math.max(offStair, Math.abs(A) + Math.abs(B) + Math.abs(C)); continue }
    const key = [A, B, C].map((v) => v.toFixed(4)).join(',')
    const f = (flights[key] ??= { A, B, C, minUnder: Infinity, on: new Set() })
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const under = A + B * x + C * z - y
    f.minUnder = Math.min(f.minUnder, under)
    if (Math.abs(under) < 1e-3) f.on.add(x.toFixed(3) + ',' + z.toFixed(3))
  }
  return { id: b.id, stair: b.look === LOOK.stair, ramp: true, count: pos.count, offStair,
    flights: Object.values(flights).map((f) => ({ A: f.A, B: f.B, C: f.C, minUnder: f.minUnder, on: f.on.size })) }
})
console.log(JSON.stringify({ bodies, tread: gp.terraces.tread, riser: gp.terraces.riser, levels: g.facts.terraces.levels }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8', maxBuffer: 1 << 26 })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null

test('the stair ramps build', () => assert.equal(r.status, 0, r.stderr))

test('every gardens body carries a ramp, so the two merged meshes keep one attribute set', () => {
  for (const b of out.bodies) assert.ok(b.ramp, `${b.id} has no ramp`)
})

test('only the stairs carry a plane; every other body a zero ramp', () => {
  for (const b of out.bodies) {
    if (b.stair) assert.ok(b.flights.length >= 2, `${b.id}: ${b.flights.length} flights`)
    else assert.equal(b.flights.length, 0, `${b.id} carries a plane`)
    assert.equal(b.offStair, 0, `${b.id}: a zero ramp holds ${b.offStair}`)
  }
})

test("each flight's plane runs through its nosings at the riser over the tread, and no step rises over it", () => {
  const k = out.riser / out.tread
  for (const b of out.bodies.filter((x) => x.stair)) {
    for (const f of b.flights) {
      // the flight rounds its step count, so its riser is the plan's within a tenth
      assert.ok(Math.abs(Math.hypot(f.B, f.C) - k) < 0.1 * k, `${b.id}: slope ${Math.hypot(f.B, f.C)} against ${k}`)
      assert.ok(f.minUnder > -1e-3, `${b.id}: a vertex ${-f.minUnder} m over its plane`)
      // each step's front top edge: two plan points per tread, at least six treads to a flight (2 m at 0.16 m risers)
      assert.ok(f.on >= 12 && f.on % 2 === 0, `${b.id}: ${f.on} plan points on the plane`)
    }
  }
})
