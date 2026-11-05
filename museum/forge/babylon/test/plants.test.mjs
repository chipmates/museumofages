// node --test forge/babylon/test/*.test.mjs (the plants: the grown trees' stand-ins, the palm's presets, the banks; built
// in a child node that strips its types)
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'

const W = join(APP, 'src/wings/babylon')
const url = (p) => JSON.stringify(pathToFileURL(join(W, p)).href)

/* the kit grows a tree only in a page (its leaf atlas is drawn on a canvas), so the grown crowns come recorded from the
   map page's own planting (231 grown trees): per kind, the trees reaching furthest toward each side of their stand-in,
   as [kind, height, radius asked, crown y0, y1, rx, rz] in metres */
const GROWN = [
  ['fig', 6.267, 3.127, 0.919, 6.418, 3.745, 3.261],
  ['tamarisk', 8.061, 3.2, 0.572, 7.953, 3.624, 3.036],
  ['tamarisk', 7.143, 3.192, 0.574, 7.054, 3.151, 3.707],
  ['tamarisk', 7.623, 3.2, 0.797, 7.68, 3.308, 3.371],
  ['tamarisk', 8.666, 3.13, 0.508, 8.461, 3.126, 3.219],
  ['pomegranate', 3.937, 1.569, 0.444, 3.899, 1.763, 1.666],
  ['pomegranate', 3.07, 1.421, 0.182, 3.143, 1.468, 1.66],
  ['pomegranate', 3.081, 1.447, 0.357, 3.267, 1.417, 1.411],
  ['broad', 9.073, 3.174, 2.191, 9.104, 3.716, 3.35],
  ['broad', 7.879, 3.381, 1.663, 8.36, 3.434, 3.797],
  ['broad', 6.576, 2.657, 1.612, 7.106, 2.853, 3.045],
  ['broad', 8.584, 3.2, 1.549, 8.551, 3.468, 3.429],
  ['cypress', 15.579, 1.278, 0.626, 15.918, 1.733, 1.498],
  ['cypress', 14.03, 1.498, 0.516, 14.344, 1.827, 1.963],
  ['cypress', 12.018, 1.546, 0.386, 12.435, 1.79, 1.609],
  ['cypress', 12.211, 1.471, 0.392, 12.53, 1.645, 1.81],
  ['shrub', 1.576, 1.145, -0.087, 1.845, 1.479, 1.483],
  ['shrub', 1.75, 1.104, -0.157, 2.042, 1.386, 1.54],
  ['shrub', 1.621, 1.347, -0.059, 2.025, 1.628, 1.581],
]

const code = `
import { readFileSync } from 'node:fs'
import { buildPlan } from ${url('map/plan.ts')}
import { buildGardens } from ${url('gardens/gardens-geom.ts')}
import { buildPlanting, standInCrown } from ${url('gardens/gardens-plants.ts')}
import { palmGeometry, PALM_NEAR, PALM_MID, PALM_FAR } from ${url('gate/gate-life.ts')}
import { reedGeometry } from ${url('plants/banks.ts')}
import { buildPlain } from ${url('open/plain.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), gp = j(${url('gardens/gardens-plan.json')})
const box = (geo) => { geo.computeBoundingBox(); const b = geo.boundingBox; return [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z] }
const g = buildGardens(buildPlan(plan), plan, gp)
const pl = buildPlanting(g.F, gp, palmGeometry, PALM_MID)
const stands = pl.plants.filter((p) => p.crown).map((p) => ({ id: p.id, kind: p.kind, x: p.x, y: p.y, z: p.z, h: p.h, r: p.r, crown: p.crown, grown: p.grown, box: box(p.geometry) }))
const grown = ${JSON.stringify(GROWN)}.map(([k, h, r]) => standInCrown(k, h, r))
const tris = (d, h = 12) => palmGeometry(h, d).getAttribute('position').count / 3
const palms = { near8: tris(PALM_NEAR, 8), near15: tris(PALM_NEAR, 15), mid: tris(PALM_MID), far: tris(PALM_FAR) }
const reed = reedGeometry()
const P = buildPlain(plan)
const s = (E, N) => [E - plan.frame.E0, plan.frame.N0 - N]
const water = plan.water.map((w) => w.poly.map((q) => s(q[0], q[1])))
const inPoly = (x, z, poly) => { let c = false; for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) { const a = poly[i], b = poly[k]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c } return c }
const BANK = ['reed', 'tamarisk', 'poplar', 'willow']
const rows = {}, wet = [], detailOnBank = []
for (const p of P.palms) {
  rows[p.row] = (rows[p.row] ?? 0) + 1
  if (BANK.includes(p.row) && water.some((w) => inPoly(p.x, p.z, w))) wet.push(p.row)
  if (BANK.includes(p.row) && p.detail) detailOnBank.push(p.row)
}
const detail = { near: P.palms.filter((p) => p.detail === 'near').length, mid: P.palms.filter((p) => p.detail === 'mid').length }
console.log(JSON.stringify({ stands, grown, palms, reed: { tris: reed.getAttribute('position').count / 3, box: box(reed) }, rows, wet, detailOnBank, detail }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8', maxBuffer: 1 << 26 })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const EPS = 1e-3

test('the plants build in node', () => assert.equal(r.status, 0, r.stderr))

test('every grown crown recorded in the page lies inside the stand-in node mounts in its place', () => {
  GROWN.forEach(([kind, h, r, y0, y1, rx, rz], i) => {
    const s = out.grown[i]
    const what = `${kind} h ${h} r ${r}`
    assert.ok(y0 >= s.y0 - EPS, `${what}: crown foot ${y0} under the stand-in's ${s.y0}`)
    assert.ok(y1 <= s.y1 + EPS, `${what}: crown top ${y1} over the stand-in's ${s.y1}`)
    assert.ok(rx <= s.rx + EPS && rz <= s.rz + EPS, `${what}: crown ${rx} x ${rz} past the stand-in's ${s.rx} x ${s.rz}`)
  })
})

test("node draws every grown kind as its stand-in: a body filling the crown's bounds and nothing past them", () => {
  const kinds = new Set(out.stands.map((p) => p.kind))
  for (const k of ['broad', 'tamarisk', 'pomegranate', 'fig', 'cypress', 'shrub']) assert.ok(kinds.has(k), `no ${k} in the gardens`)
  for (const p of out.stands) {
    assert.equal(p.grown, false, `${p.id} grown in node`)
    const [x0, x1, y0, y1, z0, z1] = p.box, c = p.crown
    const what = `${p.id} (${p.kind})`
    assert.ok(x0 >= p.x - c.rx - EPS && x1 <= p.x + c.rx + EPS && z0 >= p.z - c.rz - EPS && z1 <= p.z + c.rz + EPS, `${what}: past its bounds across`)
    assert.ok(y1 <= p.y + c.y1 + EPS && Math.abs(y1 - (p.y + c.y1)) < 0.05, `${what}: top ${y1} against ${p.y + c.y1}`)
    // the stem reaches 0.3 m into the ground under it
    assert.ok(y0 >= p.y + Math.min(c.y0, 0) - 0.3 - EPS, `${what}: foot ${y0}`)
    assert.ok(x1 - x0 >= 1.6 * c.rx && z1 - z0 >= 1.6 * c.rz, `${what}: the body fills too little of its bounds`)
  }
})

test("the palm's presets: near draws one count at every height (the gate's mount splits by it), mid and far cheaper", () => {
  const p = out.palms
  assert.equal(p.near8, p.near15)
  assert.ok(p.near8 > 20 * p.mid, `near ${p.near8} against mid ${p.mid}`)
  assert.ok(p.mid <= 650 && p.mid > 2 * p.far, `mid ${p.mid}, far ${p.far}`)
  assert.ok(p.far <= 220, `far ${p.far}`)
})

test('a reed clump stands on its foot, under 3.5 m and about 2.4 m across', () => {
  const [x0, x1, y0, y1, z0, z1] = out.reed.box
  assert.ok(Math.abs(y0) < 1e-6, `foot ${y0}`)
  assert.ok(y1 > 2 && y1 < 3.5, `top ${y1}`)
  assert.ok(x1 - x0 < 3.6 && z1 - z0 < 3.6, `across ${x1 - x0} x ${z1 - z0}`)
  assert.ok(out.reed.tris <= 80, `${out.reed.tris} triangles`)
})

test("the plain's bank plants stand on land, by their rows, and only palms carry a preset", () => {
  for (const k of ['reed', 'tamarisk', 'poplar', 'willow']) assert.ok(out.rows[k] > 0, `no ${k}`)
  assert.deepEqual(out.wet, [])
  assert.deepEqual(out.detailOnBank, [])
  assert.ok(out.detail.near > 0 && out.detail.near < 60, `near palms ${out.detail.near}`)
  assert.ok(out.detail.mid > out.detail.near, `mid palms ${out.detail.mid}`)
})
