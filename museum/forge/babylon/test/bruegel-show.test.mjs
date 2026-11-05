// node --test forge/babylon/test/*.test.mjs (stop 12's fourth state, Bruegel's tower as a showpiece, built in a child node that strips its types)
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'

const W = join(APP, 'src/wings/babylon')
const url = (p) => JSON.stringify(pathToFileURL(join(W, p)).href)
const code = `
import { readFileSync } from 'node:fs'
import { buildPlan } from ${url('map/plan.ts')}
import { buildCourt } from ${url('court/court-geom.ts')}
import { towerFrame } from ${url('tower/tower-dug.ts')}
import { buildShow } from ${url('bruegel-show/show-geom.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), cp = j(${url('court/court-plan.json')}), sp = j(${url('bruegel-show/show-plan.json')})
const built = buildCourt(buildPlan(plan), plan, cp).built
const f = towerFrame(built.boxes.find((b) => b.id === 'tower-stage-1'))
const b = buildShow(f, built.ground, sp)
// over the masonry: the highest point, the widest reach of the base storey's wall at the ground, the share of its
// round faces that look out; and the triangles in all
let top = -Infinity, out = 0, walls = 0, tris = 0
const feet = []
for (const body of b.bodies) {
  const p = body.geometry.getAttribute('position'), sk = body.geometry.getAttribute('sk'), sq = body.geometry.getAttribute('sq')
  tris += p.count / 3
  for (let i = 0; i < p.count; i += 3) {
    const v = [0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)])
    const masonry = /storey|cells|core/.test(body.id)
    if (masonry) for (const q of v) top = Math.max(top, q[1] - b.frame.base)
    if (!masonry) continue
    const a = v[1].map((x, k) => x - v[0][k]), c = v[2].map((x, k) => x - v[0][k])
    const n = [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]]
    const l = Math.hypot(...n)
    if (!l || Math.abs(n[1] / l) > 0.5) continue
    const cx = (v[0][0] + v[1][0] + v[2][0]) / 3 - f.x, cz = (v[0][2] + v[1][2] + v[2][2]) / 3 - f.z
    if (body.id === 'bruegel-show-storey-1' && sq.getZ(i) < 0.05 && sk.getX(i) === 0) for (const q of v) if (q[1] - b.frame.base < 1) feet.push(Math.hypot(q[0] - f.x, q[2] - f.z))
    // the facing of the walls only: the dark backs inside look in by design, reveals and caps lie across the radius
    if (sk.getX(i) === 7 || sq.getZ(i) > 0.05) continue
    const radial = Math.abs(n[0] * cx + n[2] * cz) / (l * Math.hypot(cx, cz))
    if (radial < 0.9) continue
    walls++
    if (n[0] * cx + n[2] * cz > 0) out++
  }
}
// the wall's own foot: the median of the base storey's facing at the ground (the spurs run out past it)
feet.sort((x, y) => x - y)
const reach = feet[Math.floor(feet.length / 2)]
console.log(JSON.stringify({ ids: b.bodies.map((x) => x.id), facts: b.facts, top, reach, out, walls, tris }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null

test("Bruegel's tower as a showpiece builds", () => assert.equal(r.status, 0, r.stderr))

test('its parts: six storeys, the red cells and core, the rock, the builders\' works, each named for the switch', () => {
  assert.deepEqual(out.ids, ['bruegel-show-storey-1', 'bruegel-show-storey-2', 'bruegel-show-storey-3', 'bruegel-show-storey-4', 'bruegel-show-storey-5', 'bruegel-show-storey-6', 'bruegel-show-cells', 'bruegel-show-core', 'bruegel-show-rock', 'bruegel-show-works'])
  // pieces.json names map:bruegel- bodies to bab.bruegel.tower; the evidence switch lists them outside the classes
  for (const id of out.ids) assert.match(id, /^bruegel-show-/)
})

test('the scale as chosen: about 110 m to the highest masonry, the base storey about 118 m across', () => {
  assert.equal(out.facts.height, 110)
  assert.equal(out.facts.baseDiameter, 118)
  assert.ok(out.top > 108.5 && out.top < 111, `the highest masonry at ${out.top} m over its foot`)
  assert.ok(out.reach > 57.5 && out.reach < 60.5, `the base storey's wall ${out.reach} m from the axis at the ground`)
  const sp = JSON.parse(readFileSync(join(W, 'bruegel-show/show-plan.json'), 'utf8'))
  assert.equal(sp.scale.mPerPx, 0.054)
  assert.match(sp.scale.src, /never a measure/)
})

test('its walls look out', () => {
  // the parapets' and the red shells' backs are the only round faces that look in
  assert.ok(out.walls > 3000 && out.out / out.walls > 0.93, `${out.out} of ${out.walls} round wall faces look out`)
})

test('it stays a showpiece the page can carry', () => {
  assert.ok(out.tris < 120000, `${out.tris} triangles`)
})

test('the painting is read, never copied: no image, texture or sampled colour in its files', () => {
  const dir = join(W, 'bruegel-show')
  for (const name of readdirSync(dir)) {
    const text = readFileSync(join(dir, name), 'utf8')
    assert.doesNotMatch(text, /TextureLoader|\.jpe?g|\.png|\.webp|texture\(/i, name)
  }
})
