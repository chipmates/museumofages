// node --test forge/babylon/test/*.test.mjs (the house stop's bodies built in a child node that strips its types)
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
import { buildPlan, makeFrame } from ${url('map/plan.ts')}
import { buildCourt } from ${url('court/court-geom.ts')}
import { buildHouse, lanesBody } from ${url('house/house-geom.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), hp = j(${url('house/house-plan.json')})
const court = buildCourt(buildPlan(plan, { houses: false }), plan, j(${url('court/court-plan.json')}))
const h = buildHouse(court.built, plan, hp)
const F = makeFrame(plan)
const box = (g) => { g.computeBoundingBox(); const b = g.boundingBox; return [b.min.y, b.max.y] }
const [cx, cz] = F.s(hp.frame.origin[0], hp.frame.origin[1])
const lanes = lanesBody(h.lanes, hp.flat.level)
console.log(JSON.stringify({ facts: h.facts.house6, ids: h.bodies.map((b) => b.id), left: h.built.prisms.map((p) => p.id),
  heights: Object.fromEntries([...h.bodies, lanes].map((b) => [b.id, box(b.geometry)])), stand: h.built.stand(cx, cz), ground: h.built.ground(cx, cz),
  zones: [...new Set(Array.from(h.bodies[0].geometry.getAttribute('zone').array))].sort((a, b) => a - b) }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (tolerance ${tol})`)

test('the house stop builds', () => assert.equal(r.status, 0, r.stderr))

test('House VI at the plan sizes (P2021 Fig. 6.15): court 6.5 by 6.5 m, Room 4 8.0 by 3.3 m to its south', () => {
  const f = out.facts
  near(f.court[0], 6.5, 0.01, 'court east-west'); near(f.court[1], 6.5, 0.01, 'court north-south')
  near(f.room4[0], 8.0, 0.01, 'Room 4 long'); near(f.room4[1], 3.3, 0.01, 'Room 4 deep')
  // the house about 330 m2 as printed; ours drawn on the sheet's outer line, within 15 percent
  assert.ok(f.area > 330 && f.area < 330 * 1.15, `area ${f.area}`)
})

test('one storey: the paving at +5.2, doors 2 m, about 3 m to the roof, the parapet top +8.6', () => {
  const f = out.facts
  near(f.floor, 5.2, 1e-6, 'floor'); near(f.doorHead, 2.0, 0.01, 'door head'); near(f.room4Door[0], 1.5, 0.01, "Room 4's door")
  assert.ok(f.wallToDeck >= 2.8 && f.wallToDeck <= 3.4, `floor to deck ${f.wallToDeck}`)
  near(out.heights.house6[1], 8.6, 1e-3, 'house top'); near(out.heights['house6-court-paving'][0], 5.2, 1e-3, 'paving')
  near(out.stand, 5.2, 1e-3, 'the stand in the court'); assert.ok(out.ground < 5.2, `ground ${out.ground} under the floor`)
})

test('the house stop replaces the generic Merkes blocks and draws its neighbours', () => {
  for (const id of ['house6', 'house6-court-paving', 'house3']) assert.ok(out.ids.includes(id), id)
  assert.ok(out.ids.filter((id) => id.startsWith('quarter-merkes-')).length >= 6, 'the quarter blocks')
  assert.ok(!out.left.some((id) => /^merkes-\d$/.test(id) || id === 'house6-floor'), 'a replaced prism is left on the map')
  // every face of House VI knows what it shows: walls to the street and the court, rooms, reveals, deck, coping, floors, paving
  for (const z of [0, 1, 2, 3, 4, 5, 6, 7]) assert.ok(out.zones.includes(z), `zone ${z}`)
  near(out.heights['merkes-lanes'][1], 5.0, 1e-3, 'lanes top')
})
