// node --test forge/babylon/test/*.test.mjs (stop 5's candidates and garden built in a child node that strips its types)
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
import { buildGardens } from ${url('gardens/gardens-geom.ts')}
import { buildPlanting } from ${url('gardens/gardens-plants.ts')}
import { palmGeometry } from ${url('gate/gate-life.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), cp = j(${url('court/court-plan.json')}), gp = j(${url('gardens/gardens-plan.json')})
const g = buildGardens(buildPlan(plan), plan, gp)
const pl = buildPlanting(g.F, gp, palmGeometry, { seg: 4, sides: 5, fronds: 16, steps: 4 })
const c = buildCourt(g.built, plan, cp)
const box = (geo) => { geo.computeBoundingBox(); const b = geo.boundingBox; return [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z].map((v) => +v.toFixed(2)) }
const rooms = g.built.prisms.find((p) => p.id === 'south-palace-rooms')
console.log(JSON.stringify({ facts: g.facts, ids: g.bodies.map((b) => b.id), left: g.built.prisms.map((p) => p.id), courtLeft: c.built.prisms.map((p) => p.id),
  roomsHoles: rooms ? rooms.holes.length : -1, courtRooms: c.bodies.find((b) => b.id === 'south-palace-rooms') ? 1 : 0,
  boxes: Object.fromEntries(g.bodies.map((b) => [b.id, box(b.geometry)])), strips: g.F.strips,
  plants: pl.plants.map((p) => ({ id: p.id, kind: p.kind, row: p.row, x: p.x, z: p.z, y: p.y, h: p.h, box: box(p.geometry), n: p.geometry.getAttribute('position').count, leaf: !!p.geometry.getAttribute('leaf'), centre: !!p.geometry.getAttribute('centre') })),
  pfacts: pl.facts, frame: plan.frame }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8', maxBuffer: 1 << 26 })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (tolerance ${tol})`)

test('the gardens build', () => assert.equal(r.status, 0, r.stderr))

test('the vaulted building: about 40 m a side, about 1,600 m2 (P2021 p. 101), its cells block about 26 x 31 m', () => {
  const v = out.facts.vaulted
  assert.ok(v.unitArea >= 1350 && v.unitArea <= 1750, `unit area ${v.unitArea}`)
  assert.ok(v.unitSpan[0] >= 36 && v.unitSpan[0] <= 46 && v.unitSpan[1] >= 36 && v.unitSpan[1] <= 46, `unit span ${v.unitSpan}`)
  assert.ok(v.coreArea >= 450 && v.coreArea <= 800, `core area ${v.coreArea}`)
  // its roof just over the palace floor (+12), never a garden on it
  assert.ok(v.deck > 12 && v.deck < 13 && v.parapetTop < 14, `deck ${v.deck}, parapet ${v.parapetTop}`)
  assert.ok(!out.ids.some((id) => /^vaulted/.test(id) && /garden|plant|tree/.test(id)))
})

test('the palace rooms open over the vaulted building, and the court still draws them', () => {
  assert.ok(out.roomsHoles >= 2, `holes ${out.roomsHoles}`)
  assert.equal(out.courtRooms, 1)
  assert.ok(!out.courtLeft.includes('south-palace-rooms'))
})

test('the North Palace at the sheet: 134.7 x 126.8 m, courts 33 x 35 and 34 x 37 m, principal rooms 21 x 9 and 31 x 11 m', () => {
  const n = out.facts.northPalace
  near(n.outline[0], 134.7, 0.1, 'east-west'); near(n.outline[1], 126.8, 0.1, 'north-south')
  near(n.courts[0][0], 33, 0.5, 'west court E-W'); near(n.courts[0][1], 35, 0.6, 'west court N-S')
  near(n.courts[1][0], 34, 0.8, 'east court E-W'); near(n.courts[1][1], 37, 0.3, 'east court N-S')
  near(n.halls[0][0], 21, 1.0, 'west room'); near(n.halls[0][1], 9, 0.4, 'west room depth')
  near(n.halls[1][0], 31, 0.2, 'east room'); near(n.halls[1][1], 11, 0.4, 'east room depth')
  assert.equal(n.floor, 15)
})

test('the map prisms this stop draws are taken out of the city and drawn here once', () => {
  for (const id of ['north-palace-main', 'north-palace-terrace', 'gardens-edge-1', 'gardens-edge-4']) {
    assert.ok(!out.left.includes(id), `${id} still in the city`)
    assert.equal(out.ids.filter((x) => x === id).length, 1, `${id} drawn once`)
  }
})

test('the garden stands on the edge terraces only, rich and within its rules', () => {
  const P = out.plants
  const trees = P.filter((p) => !['vine', 'caper'].includes(p.kind))
  assert.ok(trees.length >= 120, `trees ${trees.length}`)
  assert.ok(P.filter((p) => p.kind === 'pomegranate').length <= 6, 'a few pomegranates at most')
  assert.ok(P.filter((p) => p.kind === 'fig').length <= 1, 'one fig at most')
  assert.equal(P.filter((p) => ['vine', 'caper'].includes(p.kind)).length, 0, 'no vine or caper over the edges')
  const strips = out.strips
  for (const p of P) {
    const on = strips.find((t) => p.x >= t.x0 - 0.01 && p.x <= t.x1 + 0.01 && p.z >= t.z0 - 0.01 && p.z <= t.z1 + 0.01 && Math.abs(p.y - t.level) < 1e-6)
    assert.ok(on, `${p.id} at ${p.x}, ${p.z}, ${p.y} is on no strip`)
    assert.ok(p.leaf && p.centre, `${p.id} lacks its leaf or centre attribute`)
  }
})

test('nothing hangs or leans over the inner city walls at the strips\' south ends', () => {
  const south = Math.max(...out.strips.filter((t) => t.out === 'w').map((t) => t.z1))
  for (const p of out.plants) assert.ok(p.box[5] < south - 1.0, `${p.id} reaches ${p.box[5]} against the south end ${south}`)
})
