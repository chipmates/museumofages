// node --test forge/babylon/test/*.test.mjs (stop 9's Esagila, its ground and street, and the walk round the corner, built in
// a child node that strips its types)
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
import { makePath } from ${url('map/path.ts')}
import { sunAt } from ${url('map/sun.ts')}
import { buildEsagila } from ${url('esagila/esagila-geom.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), ep = j(${url('esagila/esagila-plan.json')}), cams = j(${url('map/map-cams.json')})
const built0 = buildPlan(plan)
const e = buildEsagila(built0, plan, ep)
const F = makeFrame(plan)
const box = (g) => { g.computeBoundingBox(); const b = g.boundingBox; return [b.min.y, b.max.y] }
const down = (g) => { const n = g.getAttribute('normal'); let k = 0; for (let i = 0; i < n.count; i++) if (n.getY(i) < -0.5) k++; return k }
const path = makePath(cams, F.s, (x, z) => e.built.stand(x, z))
const still = path.keys.find((k) => k.stop === 11 && k.still)
const hold = path.sample(still.t)
const [hE, hN] = F.utm(hold.pos[0], hold.pos[2])
// the eye's distance off the street's middle, every quarter second from the tower's hold to the end of Esagila's hold
const off = []
for (let t = 262.03; t <= 335.03; t += 0.25) { const p = path.sample(t); const s = e.built.streetAt(p.pos[0], p.pos[2]); off.push({ t: +t.toFixed(2), d: s.d, half: s.w / 2 }) }
const sun = sunAt(hold.hour)
// the look's bearing at the hold, and the north front's span seen from there
const brg = (x, z) => ((Math.atan2(x - hold.pos[0], -(z - hold.pos[2])) * 180) / Math.PI + 360) % 360
const C = plan.blocks.find((b) => b.id === 'esagila').poly.map((p) => F.s(p[0], p[1]))
console.log(JSON.stringify({ facts: e.facts, ids: e.bodies.map((b) => b.id), prisms: e.built.prisms.map((p) => p.id),
  heights: Object.fromEntries(e.bodies.map((b) => [b.id, box(b.geometry)])),
  down: Object.fromEntries(e.bodies.filter((b) => /^esagila-(street|ground)-/.test(b.id)).map((b) => [b.id, down(b.geometry)])),
  hold: { t: still.t, E: hE, N: hN, hour: hold.hour, look: brg(hold.look[0], hold.look[2]), phone: brg(hold.phone.look[0], hold.phone.look[2]), hfov: hold.hfov,
    nw: brg(C[0][0], C[0][1]), ne: brg(C[1][0], C[1][1]), sun },
  toFront: Math.abs((hold.pos[0] - C[0][0]) * (C[1][1] - C[0][1]) - (hold.pos[2] - C[0][1]) * (C[1][0] - C[0][0])) / Math.hypot(C[1][0] - C[0][0], C[1][1] - C[0][1]),
  worst: off.reduce((m, o) => (o.d - o.half > m.d - m.half ? o : m), off[0]),
  stops: cams.stops.filter((s) => s.n === 10 || s.n === 11) }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (tolerance ${tol})`)

test('Esagila builds', () => assert.equal(r.status, 0, r.stderr))

test("the main building on C6.2's outline: 79.1 by 87.1 m, its east side at 166.5 degrees", () => {
  near(out.facts.sides.north, 79.1, 0.3, 'north side')
  near(out.facts.sides.south, 79.1, 0.3, 'south side')
  near(out.facts.sides.east, 87.1, 0.3, 'east side')
  near(out.facts.sides.west, 87.1, 0.3, 'west side')
  // the record's 166.3 on C6.2, read again by script at 166.5
  near(out.facts.eastBearing, 166.4, 0.3, 'east side bearing')
})

test('the walls 12 m over the +4.4 floor, the casing to +5.8, nothing over the gate block', () => {
  assert.equal(out.facts.floor, 4.4)
  near(out.facts.wallTop - out.facts.floor, 12, 1e-6, 'walls over the floor')
  near(out.heights['esagila'][1], 16.4, 1e-3, 'the walls drawn')
  near(out.heights['esagila-casing'][1], 5.8, 1e-3, 'the casing drawn')
  for (const [id, [, top]] of Object.entries(out.heights)) assert.ok(top <= 19.6 + 1e-3, `${id} reaches ${top}`)
  assert.equal(out.facts.towers, 6)
})

test('the stop replaces the map blocks it stands for and draws every piece under its own id', () => {
  assert.ok(!out.prisms.includes('esagila') && !out.prisms.includes('esagila-annex'), 'a map block left')
  for (const id of ['esagila', 'esagila-casing', 'esagila-annex', 'esagila-gate-n', 'esagila-door-n', 'esagila-ramp-n', 'esagila-ground-n', 'esagila-wall-gate8', 'esagila-street-turn', 'esagila-street-south', 'esagila-street-west']) assert.ok(out.ids.includes(id), id)
})

test('the ramp climbs from the open ground to the floor', () => {
  near(out.facts.ramp.rise, 2.1, 0.05, 'rise')
  assert.equal(out.facts.ramp.run, 14)
})

test('the ground and the street lie face up, split where the record rows meet', () => {
  for (const [id, n] of Object.entries(out.down)) assert.equal(n, 0, `${id} has faces looking down`)
  const s = out.facts.street
  assert.ok(s.turnTo > 0 && s.turnTo < s.dugTo && s.dugTo < s.length, JSON.stringify(s))
})

test('the hold: on the street west of Gate 8, about 94 m from the north front, at 17:45 with the sun low in the west', () => {
  near(out.hold.E, 445650, 15, 'hold easting')
  assert.ok(out.hold.E < 445678.5, 'the hold lies west of the dug run')
  near(out.toFront, 94, 6, 'to the north front')
  near(out.hold.hour, 17.75, 0.01, 'the hour')
  near(out.hold.sun.azimuth, 274.5, 1.5, 'sun azimuth')
  near(out.hold.sun.elevation, 7, 1.5, 'sun elevation')
  // the desktop look takes in the whole north front with a margin
  assert.ok(out.hold.look - out.hold.hfov / 2 < out.hold.ne - 1 && out.hold.look + out.hold.hfov / 2 > out.hold.nw + 1, JSON.stringify(out.hold))
})

test('the camera never leaves the street from the tower to the end of the hold', () => {
  assert.ok(out.worst.d <= out.worst.half + 0.05, `at ${out.worst.t} s the eye is ${out.worst.d.toFixed(2)} m off the street's middle (half width ${out.worst.half})`)
})
