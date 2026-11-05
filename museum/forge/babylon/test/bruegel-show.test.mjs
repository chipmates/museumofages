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
// the rock: its faces by part kind, and its rock faces in each band of the crag, by angle round the axis and height
const tops = [sp.base.h]
for (const st of sp.storeys) tops.push(tops[tops.length - 1] + st.h)
const rockKinds = {}, crag = {}
{
  const g = b.bodies.find((x) => x.id === 'bruegel-show-rock').geometry
  const p = g.getAttribute('position'), sk = g.getAttribute('sk')
  for (let i = 0; i < p.count; i += 3) {
    const k = sk.getX(i)
    rockKinds[k] = (rockKinds[k] ?? 0) + 1
    if (k !== 3) continue
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3 - f.x, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3 - f.z
    const h = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 - b.frame.base
    const phi = Math.atan2(-(cx * f.s + cz * f.c), cx * f.c - cz * f.s) * 180 / Math.PI
    for (const [n, [a0, a1]] of Object.entries(sp.rock.crag.bands)) {
      if (phi > a0 + 2 && phi < a1 - 2 && h > tops[n - 2] - 3 && h < tops[n - 1] + 3) crag[n] = (crag[n] ?? 0) + 1
    }
  }
}
console.log(JSON.stringify({ ids: b.bodies.map((x) => x.id), facts: b.facts, top, reach, out, walls, tris, rockKinds, crag }))`
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

test("the rock is the building's body: rock, its quarry's dusty treads and its caves, through the crag's bands", () => {
  // part kinds 3 rock, 9 floor (the treads), 7 dark (the caves' backs); no stone, brick or timber in it
  for (const k of Object.keys(out.rockKinds)) assert.ok(['3', '7', '9'].includes(k), `part kind ${k} in the rock`)
  assert.ok(out.rockKinds['3'] > 5000, `${out.rockKinds['3']} rock faces`)
  const sp = JSON.parse(readFileSync(join(W, 'bruegel-show/show-plan.json'), 'utf8'))
  for (const n of Object.keys(sp.rock.crag.bands)) assert.ok((out.crag[n] ?? 0) > 100, `tier ${n}'s crag band holds ${out.crag[n] ?? 0} rock faces`)
  // the quarry in benches of uneven height, never an even stair
  const hs = [0, ...sp.rock.front.quarry.heights, 1], rises = hs.slice(1).map((x, i) => x - hs[i])
  assert.ok(Math.max(...rises) - Math.min(...rises) > 0.1, `bench rises ${rises.map((x) => x.toFixed(2))}`)
  // warm ochre-grey: red over green over blue, darker and greyer than the masonry's old cream
  const [r, g, bl] = sp.colours.rock, [or, og, ob] = sp.colours.old
  assert.ok(r > g && g > bl, 'the rock warm')
  assert.ok(0.2126 * r + 0.7152 * g + 0.0722 * bl < 0.2126 * or + 0.7152 * og + 0.0722 * ob, 'the rock darker than the masonry')
  assert.ok((r - bl) / r < (or - ob) / or, 'the rock greyer than the masonry')
  // its shade has no course lines: the rock's block of the material draws no lines
  const mat = readFileSync(join(W, 'bruegel-show/show-mat.ts'), 'utf8')
  const block = mat.slice(mat.indexOf('/* ── rock:'), mat.indexOf('/* ── the rest:'))
  assert.ok(block.length > 200, 'the rock block found')
  const code = block.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n')
  assert.doesNotMatch(code, /lineEvery\(|course/i)
})

test("the painter's vantage is a key the showpiece alone walks, after the hold", async () => {
  const { keysFor, vantageTime } = await import(pathToFileURL(join(W, 'bruegel-show/show-path.ts')).href)
  const cams = JSON.parse(readFileSync(join(W, 'map/map-cams.json'), 'utf8'))
  const own = cams.only['bruegel-show'], v = own.filter((k) => k.vantage)
  assert.equal(v.length, 1)
  assert.equal(vantageTime(cams, 'bruegel-show'), v[0].t)
  assert.equal(vantageTime(cams, 'bruegel'), null)
  // after stop 12's still, within the stop; high, on a flight level; from the front, as the hold
  const still = cams.path.find((k) => k.stop === 12 && k.still)
  assert.ok(v[0].t > still.t && own.every((k) => k.stop === 12))
  assert.equal(typeof v[0].y, 'number')
  assert.ok(v[0].y > 60, `the vantage at level ${v[0].y}`)
  const dir = (p) => { const x = p[0] - v[0].look[0], y = p[1] - v[0].look[1], l = Math.hypot(x, y); return [x / l, y / l] }
  const a = dir(v[0].at), h = dir(still.at)
  assert.ok(Math.acos(a[0] * h[0] + a[1] * h[1]) * 180 / Math.PI < 10, 'the vantage on the hold\'s side of the tower')
  // every other state walks the shared path as it is, and the shared path holds no key of the showpiece's
  for (const s of ['built', 'dug', 'bruegel']) assert.equal(keysFor(cams, s), cams.path)
  assert.ok(!cams.path.some((k) => k.vantage))
  // the showpiece's walk: its own keys in place of the shared ones their span covers, a cut back to the walk after
  const mine = keysFor(cams, 'bruegel-show')
  const t0 = Math.min(...own.map((k) => k.t)), t1 = Math.max(...own.map((k) => k.t))
  assert.ok(mine.filter((k) => k.t >= t0 && k.t <= t1).every((k) => own.includes(k)))
  assert.equal(mine.find((k) => k.t > t1).cut, true)
  for (let i = 1; i < mine.length; i++) assert.ok(mine[i].t > mine[i - 1].t, `keys in time at ${mine[i].t}`)
})
