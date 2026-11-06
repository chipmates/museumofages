// node --test forge/babylon/test/*.test.mjs (the South Palace's floor, rooms and decks on the map, built in a child node
// that strips its types: the rooms share the floor's outline, so any height both bodies span puts their outer faces in
// one plane; the ground at the palace's east corner rises past the floor's top, which must not sink the rooms)
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
const plan = JSON.parse(readFileSync(new URL(${url('map/map-plan.json')}), 'utf8'))
const built = buildPlan(plan)
const pick = (p) => ({ id: p.id, y0: p.y0, y1: p.y1, poly: p.poly, holes: p.holes })
console.log(JSON.stringify({
  floor: pick(built.prisms.find((p) => p.id === 'south-palace')),
  rooms: pick(built.prisms.find((p) => p.id === 'south-palace-rooms')),
  decks: built.prisms.filter((p) => p.id.startsWith('south-palace-deck-')).map(pick),
  groundAtCorners: built.prisms.find((p) => p.id === 'south-palace').poly.map(([x, z]) => built.ground(x, z)),
}))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null

const inPoly = ([x, z], poly) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c
  }
  return c
}
const centre = (poly) => poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0])

test('the South Palace builds its floor, rooms and decks', () => {
  assert.equal(r.status, 0, r.stderr)
  assert.ok(out.floor && out.rooms && out.decks.length > 0)
})

test("the rooms meet the floor edge to edge: the rooms' foot at the floor's top, the outline the same within 1 cm", () => {
  // the case the cure is for: the ground at a corner stands over the floor's top
  assert.ok(Math.max(...out.groundAtCorners) > out.floor.y1 + 0.5, `ground at the corners ${out.groundAtCorners.map((g) => g.toFixed(2)).join(' ')}`)
  assert.equal(out.rooms.poly.length, out.floor.poly.length)
  out.rooms.poly.forEach((p, i) => assert.ok(Math.hypot(p[0] - out.floor.poly[i][0], p[1] - out.floor.poly[i][1]) < 0.01, `corner ${i} moved`))
  assert.ok(Math.abs(out.rooms.y0 - out.floor.y1) < 1e-3, `the rooms' foot at ${out.rooms.y0.toFixed(3)} m, the floor's top at ${out.floor.y1} m (under it: both bodies' outer faces share that band)`)
})

test("every deck sits on the floor's top, sunk 0.1 m into it, with the floor under its centre", () => {
  for (const d of out.decks) {
    assert.ok(Math.abs(d.y0 - (out.floor.y1 - 0.1)) < 1e-3, `${d.id}: foot at ${d.y0.toFixed(3)} m, the floor's top at ${out.floor.y1} m`)
    const c = centre(d.poly)
    assert.ok(inPoly(c, out.floor.poly) && !out.floor.holes.some((h) => inPoly(c, h)), `${d.id}: no floor under its centre`)
    assert.ok(d.y1 > out.floor.y1, `${d.id}: its top under the floor's`)
  }
})
