// node --test forge/babylon/test/*.test.mjs (stop 12's third state, Bruegel's tower, built in a child node that strips its types)
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
import { towerFrame } from ${url('tower/tower-dug.ts')}
import { buildBruegel } from ${url('bruegel/bruegel-geom.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), cp = j(${url('court/court-plan.json')}), bp = j(${url('bruegel/bruegel-plan.json')})
const built = buildCourt(buildPlan(plan), plan, cp).built
const f = towerFrame(built.boxes.find((b) => b.id === 'tower-stage-1'))
const b = buildBruegel(f, built.ground, bp)
// over all its faces: the widest reach from the axis below the first terrace, the highest point, the share of walls facing out
let reach = 0, top = -Infinity, out = 0, walls = 0
for (const body of b.bodies) {
  const p = body.geometry.getAttribute('position')
  for (let i = 0; i < p.count; i += 3) {
    const v = [0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)])
    for (const q of v) {
      top = Math.max(top, q[1] - b.frame.base)
      // the base storey's foot runs on a little into the ground, along its batter
      if (body.id === 'bruegel-storey-1' && q[1] - b.frame.base < 0) reach = Math.max(reach, Math.hypot(q[0] - f.x, q[2] - f.z))
    }
    if (body.id === 'bruegel-rock') continue
    const a = v[1].map((x, k) => x - v[0][k]), c = v[2].map((x, k) => x - v[0][k])
    const n = [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]]
    const l = Math.hypot(...n)
    if (!l || Math.abs(n[1] / l) > 0.5) continue
    const cx = (v[0][0] + v[1][0] + v[2][0]) / 3 - f.x, cz = (v[0][2] + v[1][2] + v[2][2]) / 3 - f.z
    // round faces only (a cap's normal lies across the radius)
    const radial = Math.abs(n[0] * cx + n[2] * cz) / (l * Math.hypot(cx, cz))
    if (radial < 0.9) continue
    walls++
    if (n[0] * cx + n[2] * cz > 0) out++
  }
}
console.log(JSON.stringify({ ids: b.bodies.map((x) => x.id), facts: b.facts, reach, top, out, walls }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null

test("Bruegel's tower builds", () => assert.equal(r.status, 0, r.stderr))

test('its parts: six storeys, the red cells and core, the ramp, the rock', () => {
  assert.deepEqual(out.ids, ['bruegel-storey-1', 'bruegel-storey-2', 'bruegel-storey-3', 'bruegel-storey-4', 'bruegel-storey-5', 'bruegel-storey-6', 'bruegel-cells', 'bruegel-core', 'bruegel-ramp', 'bruegel-rock'])
})

test('the scale as chosen: the base storey 91.5 m across, about 84.5 m high to its highest masonry', () => {
  assert.equal(out.facts.baseDiameter, 91.5)
  assert.ok(Math.abs(out.reach - 45.75) < 0.1, `the base storey's foot ${out.reach} m from the axis`)
  assert.ok(Math.abs(out.top - 83.6) < 0.05, `the top at ${out.top} m over its foot`)
})

test('its round faces look out, its shells\' inner faces in', () => {
  // the shells' inner faces are the only round faces that look in
  assert.ok(out.walls > 3000 && out.out / out.walls > 0.85, `${out.out} of ${out.walls} round faces look out`)
})
