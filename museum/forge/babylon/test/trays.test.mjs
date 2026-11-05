// node --test forge/babylon/test/*.test.mjs (the map's houses as trays, built in a child node that strips its types)
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
import { rebuildHouses, RIM } from ${url('open/houses.ts')}
import { TRAY_RIM } from ${url('map/mass.ts')}
const plan = JSON.parse(readFileSync(new URL(${url('map/map-plan.json')}), 'utf8'))
const built = buildPlan(plan)
const H = rebuildHouses(built.boxes.filter((b) => b.group === 'house'), built.ground)
const roomTop = new Map(), by = new Map()
for (const b of H.boxes) if (b.part < 4) roomTop.set(b.house, Math.max(roomTop.get(b.house) ?? -Infinity, b.y1))
for (const t of H.trays) (by.get(t.house) ?? by.set(t.house, []).get(t.house)).push(t)
let over = 0, sideHigh = 0, noCourt = 0, doors = 0, rooms = 0
for (const [k, ts] of by) {
  const top = Math.max(...ts.filter((t) => t.part < 4).map((t) => t.y1 + (t.rims ? RIM.h : 0)))
  if (top > roomTop.get(k) + 0.16) over++
  const ends = Math.min(...ts.filter((t) => t.part < 2).map((t) => t.y1)), sides = Math.max(...ts.filter((t) => t.part === 2 || t.part === 3).map((t) => t.y1))
  if (sides > ends - 0.149) sideHigh++
  if (!ts.some((t) => t.part === 4)) noCourt++
  doors += ts.filter((t) => t.part < 4 && t.door >= 0).length
  rooms += ts.filter((t) => t.part === 5).length
}
console.log(JSON.stringify({ rooms: H.boxes.length, houses: H.houses, trays: H.trays.length, over, sideHigh, noCourt, doors, roofRooms: rooms, rim: RIM, trayRim: TRAY_RIM }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null

test('the trays build', () => assert.ok(out, r.stderr))
test("the arrival's rooms stay as they were (their own random stream)", () => assert.equal(out.rooms, 37686))
test('every house has its court and one street door', () => {
  assert.equal(out.noCourt, 0)
  assert.equal(out.doors, out.houses)
})
test('a room on about one roof in five', () => assert.ok(out.roofRooms > out.houses * 0.17 && out.roofRooms < out.houses * 0.27, `${out.roofRooms} of ${out.houses}`))
test("no parapet stands above the old rooms' highest roof (the skyline and the bridge's evening shadows)", () => assert.equal(out.over, 0))
test('the side ranges stay at least 15 cm under the street ranges (no two roofs of a house share a level)', () => assert.equal(out.sideHigh, 0))
test("the mesh's parapet is the houses' own", () => assert.deepEqual(out.trayRim, out.rim))
