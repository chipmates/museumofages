// node --test forge/babylon/test/*.test.mjs (stop 6's court built in a child node that strips its types)
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
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), cp = j(${url('court/court-plan.json')})
const c = buildCourt(buildPlan(plan), plan, cp)
const box = (g) => { g.computeBoundingBox(); const b = g.boundingBox; return [b.min.y, b.max.y] }
console.log(JSON.stringify({ facts: c.facts, ids: c.bodies.map((b) => b.id), left: c.built.prisms.map((p) => p.id),
  heights: Object.fromEntries(c.bodies.map((b) => [b.id, box(b.geometry)])) }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (tolerance ${tol})`)

test('the court builds', () => assert.equal(r.status, 0, r.stderr))

test('the court and the throne room stand at the sheet sizes (SET D3)', () => {
  const f = out.facts
  near(f.court[0], 55.6, 0.05, 'court east-west'); near(f.court[1], 60.4, 0.05, 'court north-south')
  near(f.roomOuter[0], 57.5, 0.05, 'room over all'); near(f.roomOuter[1], 29.6, 0.05, 'room depth over all')
  near(f.roomInner[0], 51.9, 0.2, 'room inside'); near(f.roomInner[1], 17.5, 0.25, 'room depth inside')
  near(f.walls.north, 6.0, 0.05, 'north wall'); near(f.walls.west, 2.8, 0.1, 'west wall'); near(f.walls.east, 2.8, 0.15, 'east wall')
})

test('three doors 3.8, 5.8 and 3.8 m, the side doors at -22.0 and +20.6 m from the room centre', () => {
  const d = out.facts.doors
  assert.deepEqual(d.map((x) => x.w), [3.8, 5.8, 3.8])
  near(d[0].fromRoomCentre, -22.0, 0.15, 'west door'); near(d[2].fromRoomCentre, 20.6, 0.15, 'east door')
  near(d[1].fromRoomCentre, 0, 1.0, 'main door')
})

test('the niche: opening about 8.0 m, inner step 5.85 m', () => {
  near(out.facts.niche.opening, 8.0, 0.1, 'opening'); near(out.facts.niche.step, 5.85, 0.01, 'inner step')
})

test('the room tops out at +23 and the court bodies replace the map prisms they stand for', () => {
  assert.equal(out.facts.top, 23)
  for (const [id, h] of Object.entries(out.heights)) if (id.startsWith('throne-room')) assert.ok(h[1] <= 23.0001, `${id} over +23`)
  near(out.heights['throne-room-roof'][1], 23, 1e-3, 'roof top')
  for (const id of ['throne-room-facade', 'throne-room-roof', 'court-paving', 'south-palace-rooms']) assert.ok(out.ids.includes(id), id)
  assert.ok(!out.left.some((id) => id === 'south-palace-rooms' || id.startsWith('throne-room')), 'a replaced prism is left on the map')
})
