// node --test forge/babylon/test/*.test.mjs (stop 1, the open page: the flight's cameras in the geometry check's bound
// and eyes, on a planted fight only the landing's eye can see; and the arrival's rooms, no two that overlap on one top;
// both built in a child node that strips the pages' types)
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'

const KIT = join(APP, 'forge/babylon'), W = join(APP, 'src/wings/babylon')
const url = (p) => JSON.stringify(pathToFileURL(p).href)
const run = (code) => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8', maxBuffer: 1 << 26 })
  return { r, out: r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null }
}

// two 1 m squares in one level plane facing down, 2 m over the landing's eye: every first-frame eye (330 m up) stands
// behind them, the landing's eye in front
const flight = run(`
import { MOUNTS } from ${url(join(KIT, 'mounts.mjs'))}
import { pushFace } from ${url(join(KIT, 'geometry.mjs'))}
import { checkMount } from ${url(join(KIT, 'geometry-check.mjs'))}
const M = await MOUNTS.open('1')
const land = M.flightCameras(1).at(-1)
const faces = []
const e = land.eye, y = e.y + 2
const P = (x, z) => e.clone().set(e.x + x, y, e.z + z)
for (const n of ['test:lid-a', 'test:lid-b']) { pushFace(faces, n, P(-0.5, -0.5), P(0.5, -0.5), P(0.5, 0.5)); pushFace(faces, n, P(-0.5, -0.5), P(0.5, 0.5), P(-0.5, 0.5)) }
const st = { stop: '1', id: 'moat', page: 'open' }
const row = (rep) => rep.coplanar.list.find((p) => [p.a, p.b].includes('test:lid-a')) ?? null
const on = checkMount({ ...M, faces }, st, { all: true }).report, off = checkMount({ ...M, faces }, st, { all: true, flight: 0 }).report
console.log(JSON.stringify({ land: land.name, t: land.t, down: faces.map((f) => f.facing * f.n.y), on: { bound: on.bound, eyes: on.eyes, row: row(on) }, off: { bound: off.bound, eyes: off.eyes, row: row(off) } }))`)

test("the flight's cameras mount at stop 1", () => assert.ok(flight.out, flight.r.stderr))

test("the bound names the first frame's 4 cameras and the flight's 100, every second to the landing", () => {
  const b = flight.out.on.bound
  assert.equal(b.kind, 'frame')
  assert.equal(b.cameras.length, 104)
  assert.deepEqual(b.flight.times, Array.from({ length: 25 }, (_, i) => i + 1))
  assert.equal(b.flight.cameras, 100)
  assert.ok(b.cameras.includes('open flight 25 s desktop 3200x1800') && b.cameras.includes('open flight 1 s phone 1170x2532'))
  assert.equal(flight.out.land, 'open flight 25 s phone 1080x1920')
  assert.equal(flight.out.on.eyes, flight.out.off.eyes + 25)
})

test("a fight only the landing's eye can see is a fight with the flight, unseen without it", () => {
  assert.ok(flight.out.down.every((d) => d < -0.99), 'the lids face down')
  const on = flight.out.on.row, off = flight.out.off.row
  assert.ok(on, 'a row with the flight')
  assert.equal(on.kind, 'fight')
  assert.ok(on.area > 0.9 && on.area < 1.1, `area ${on.area}`)
  assert.ok(!off || off.kind === 'unseen', `without the flight: ${off?.kind}`)
  assert.equal(flight.out.off.bound.flight.cameras, 0)
})

// the arrival's rooms (houses.ts), on the map's lots: every pair whose plans overlap by over a millimetre, by their
// separating axes; none may keep one top within the check's 2 mm bed
const rooms = run(`
import { readFileSync } from 'node:fs'
import { buildPlan } from ${url(join(W, 'map/plan.ts'))}
import { rebuildHouses } from ${url(join(W, 'open/houses.ts'))}
const built = buildPlan(JSON.parse(readFileSync(new URL(${url(join(W, 'map/map-plan.json'))}), 'utf8')))
const H = rebuildHouses(built.boxes.filter((b) => b.group === 'house'), built.ground)
const B = H.boxes, ax = B.map((b) => [Math.cos(b.yaw), -Math.sin(b.yaw), Math.sin(b.yaw), Math.cos(b.yaw)])
const grid = new Map(), C = 16
B.forEach((b, i) => { const r = Math.hypot(b.sx, b.sz) / 2; for (let x = Math.floor((b.x - r) / C); x <= Math.floor((b.x + r) / C); x++) for (let z = Math.floor((b.z - r) / C); z <= Math.floor((b.z + r) / C); z++) (grid.get(x + ',' + z) ?? grid.set(x + ',' + z, []).get(x + ',' + z)).push(i) })
const seen = new Set()
let overlapping = 0, oneTop = 0, oneHouse = 0
for (const list of grid.values()) for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++) {
  const i = list[p], j = list[q], k = i < j ? i * 1e6 + j : j * 1e6 + i
  if (seen.has(k)) continue
  seen.add(k)
  const A = B[i], D = B[j], a = ax[i], d = ax[j]
  let apart = false
  for (const [u, v] of [[a[0], a[1]], [a[2], a[3]], [d[0], d[1]], [d[2], d[3]]]) {
    const rA = (A.sx * Math.abs(a[0] * u + a[1] * v) + A.sz * Math.abs(a[2] * u + a[3] * v)) / 2, rD = (D.sx * Math.abs(d[0] * u + d[1] * v) + D.sz * Math.abs(d[2] * u + d[3] * v)) / 2
    if (rA + rD - Math.abs((D.x - A.x) * u + (D.z - A.z) * v) <= 0.001) { apart = true; break }
  }
  if (apart) continue
  overlapping++
  if (Math.abs(A.y1 - D.y1) < 0.002) { oneTop++; if (A.house === D.house) oneHouse++ }
}
console.log(JSON.stringify({ rooms: B.length, overlapping, oneTop, oneHouse, parted: H.parted ?? null }))`)

test("the arrival's rooms build", () => assert.ok(rooms.out, rooms.r.stderr))

test('no two rooms whose plans overlap share a top (the side ranges reach into the end ranges, neighbours meet)', () => {
  assert.equal(rooms.out.rooms, 37686)
  assert.ok(rooms.out.overlapping > 10000, `${rooms.out.overlapping} overlapping pairs`)
  assert.equal(rooms.out.oneTop, 0, `${rooms.out.oneTop} pairs on one top (${rooms.out.oneHouse} in one house)`)
  assert.ok(rooms.out.parted > 0)
})
