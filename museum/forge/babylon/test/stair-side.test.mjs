// node --test forge/babylon/test/stair-side.test.mjs (the tower's side stairs as built steps, against tower-plan.json and the map's ramps)
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'

const W = join(APP, 'src/wings/babylon')
const url = (p) => JSON.stringify(pathToFileURL(join(W, p)).href)
const code = `
import { readFileSync } from 'node:fs'
import { buildPlan } from ${url('map/plan.ts')}
import { buildCourt } from ${url('court/court-geom.ts')}
import { buildTower } from ${url('tower/tower-geom.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), cp = j(${url('court/court-plan.json')}), tp = j(${url('tower/tower-plan.json')})
const t = buildTower(buildCourt(buildPlan(plan), plan, cp).built, plan, tp)
// each side flight's faces: how many look down, how many are treads (up) and risers (upright, toward the foot)
const faces = (g) => {
  const p = g.getAttribute('position'); let up = 0, down = 0, upright = 0
  for (let k = 0; k < p.count; k += 3) {
    const v = [0, 1, 2].map((d) => [p.getX(k + d), p.getY(k + d), p.getZ(k + d)])
    const a = v[1].map((x, d) => x - v[0][d]), b = v[2].map((x, d) => x - v[0][d])
    const ny = a[2] * b[0] - a[0] * b[2], l = Math.hypot(a[1] * b[2] - a[2] * b[1], ny, a[0] * b[1] - a[1] * b[0])
    if (l === 0) continue
    if (ny / l > 0.99) up++; else if (ny / l < -0.5) down++; else if (Math.abs(ny / l) < 0.01) upright++
  }
  return { up, down, upright }
}
const side = ['tower-stair-east', 'tower-stair-west']
// each parapet's level head: how far its top (over the landing's level) runs along the climb, and the normals of its
// upright faces looking on along it
const head = (id) => {
  const f = t.facts.sideStairs[id], p = t.bodies.find((b) => b.id === id + '-wall-outer').geometry.getAttribute('position')
  const L = Math.hypot(f.head[0] - f.foot[0], f.head[1] - f.foot[1]), d = [(f.head[0] - f.foot[0]) / L, (f.head[1] - f.foot[1]) / L]
  const s = (k) => (p.getX(k) - f.foot[0]) * d[0] + (p.getZ(k) - f.foot[1]) * d[1]
  let topEnd = -Infinity
  const ends = []
  for (let k = 0; k < p.count; k += 3) {
    const v = [0, 1, 2].map((q) => [p.getX(k + q), p.getY(k + q), p.getZ(k + q)])
    const a = v[1].map((x, q) => x - v[0][q]), b = v[2].map((x, q) => x - v[0][q])
    const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], l = Math.hypot(...c)
    if (l === 0 || Math.min(...v.map((x) => x[1])) < f.y1 - 1e-6) continue
    const ny = c[1] / l, along = (c[0] * d[0] + c[2] * d[1]) / l
    if (ny > 0.99 && v[0][1] > f.y1 + 0.5 && v.every((x) => Math.abs(x[1] - v[0][1]) < 1e-6)) topEnd = Math.max(topEnd, ...[0, 1, 2].map((q) => s(k + q)))
    if (Math.abs(ny) < 0.01 && along > 0.5) ends.push(+along.toFixed(4))
  }
  return { topEnd: +topEnd.toFixed(3), ends: [...new Set(ends)] }
}
console.log(JSON.stringify({ facts: t.facts.sideStairs, wallsEnd: t.facts.middleWallsEnd, faces: Object.fromEntries(side.map((id) => [id, faces(t.bodies.find((b) => b.id === id).geometry)])), heads: Object.fromEntries(side.map((id) => [id, head(id)])) }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (tolerance ${tol})`)
const tp = JSON.parse(readFileSync(join(W, 'tower/tower-plan.json'), 'utf8'))
const mp = JSON.parse(readFileSync(join(W, 'map/map-plan.json'), 'utf8'))
const half = mp.tower.stages[0].side / 2, sd = mp.tower.stairs.side, SS = tp.tower.stairs.side, top1 = mp.tower.base + sd.top

test('the side stairs build', () => assert.equal(r.status, 0, r.stderr))

test('each foot stands at the dug band, beyond the tower corner, at the court level', () => {
  for (const [id, f] of Object.entries(out.facts)) {
    near(Math.abs(f.footUV[1]), half + SS.beyond, 0.01, `${id} foot across`)
    near(Math.abs(f.footUV[1]), tp.dug.stairs.halfSpan, 0.01, `${id} foot against the dug state's band`)
    near(f.footUV[0], half + sd.w / 2, 0.01, `${id} centre line out from the face`)
    near(f.y0, mp.tower.base, 1e-6, `${id} first riser's level`)
  }
})

test("each is the map's width, its outer face at the band's outer edge", () => {
  for (const [id, f] of Object.entries(out.facts)) {
    near(f.width, sd.w, 1e-6, `${id} width`)
    near(f.outerU, half + sd.w, 0.01, `${id} outer face`)
  }
})

test("each climbs in 0.3 m risers to the first stage's top at the map's head, then a landing to the middle flight", () => {
  for (const [id, f] of Object.entries(out.facts)) {
    near(f.y1, top1, 1e-6, `${id} head level`)
    near(f.steps, Math.round((top1 - mp.tower.base) / tp.tower.stairs.riser), 0, `${id} risers`)
    near(f.riser, tp.tower.stairs.riser, 0.001, `${id} riser height`)
    near(Math.abs(f.headUV[1]), half - sd.run, 0.01, `${id} head across`)
    near(Math.abs(f.endUV[1]), f.clear / 2, 0.01, `${id} landing's end at the middle flight's edge`)
    near(f.tread * f.steps, f.run, 1e-3, `${id} treads fill the run`)
  }
})

test('the flights are steps: a tread and a riser each, nothing faces down', () => {
  for (const [id, n] of Object.entries(out.faces)) {
    const steps = out.facts[id].steps
    assert.equal(n.down, 0, `${id}: a face looks down`)
    assert.ok(n.up >= 2 * (steps + 1), `${id}: ${n.up} upward triangles for ${steps} treads and a landing`)
    assert.ok(n.upright >= 2 * steps, `${id}: ${n.upright} upright triangles for ${steps} risers`)
  }
})

test("the middle stair's walls end against the side stairs' outer face", () => {
  const f = Object.values(out.facts)[0]
  near(out.wallsEnd, f.outerU - (half - 0.5), 0.01, "walls end short of the middle stair's head")
})

test("the parapet runs level to the landing's end, the west one held back with its end turned in, as the plan says", () => {
  for (const [id, h] of Object.entries(out.heads)) {
    const f = out.facts[id], hd = SS.head?.[id], sEnd = f.run + f.landing
    near(h.topEnd, sEnd - (hd ? hd.back : 0), 0.01, `${id}: the level top's end along the climb`)
    assert.equal(h.ends.length, 1, `${id}: one end face over the landing (${h.ends})`)
    const t = SS.wall - SS.ledge
    near(h.ends[0], hd ? t / Math.hypot(t, hd.turn) : 1, 1e-3, `${id}: its end face's share along the climb`)
  }
  assert.ok(SS.head['tower-stair-west'] && !SS.head['tower-stair-east'], 'the west head alone is held back')
})
