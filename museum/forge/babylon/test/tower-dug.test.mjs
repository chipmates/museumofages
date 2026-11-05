// node --test forge/babylon/test/*.test.mjs (stop 12's excavated state built in a child node that strips its types)
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
import { buildDug, toFrame } from ${url('tower/tower-dug.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), cp = j(${url('court/court-plan.json')}), tp = j(${url('tower/tower-plan.json')})
const built = buildCourt(buildPlan(plan), plan, cp).built
const d = buildDug(built, tp)
const R = d.region, L = tp.dug.lattice, step = tp.dug.step
const g = (x, z) => built.ground(x, z)
// the patch's surface where the strips lie: its grid split a, c, b / b, c, d, as the patch builds it
const patchY = (x, z) => {
  const fi = (x - R.x0) / step, fj = (z - R.z0) / step, i = Math.floor(fi), k = Math.floor(fj), u = fi - i, w = fj - k
  const h = (a, b) => d.height(R.x0 + a * step, R.z0 + b * step)
  return u + w <= 1 ? h(i, k) + (h(i + 1, k) - h(i, k)) * u + (h(i, k + 1) - h(i, k)) * w
    : h(i + 1, k + 1) + (h(i, k + 1) - h(i + 1, k + 1)) * (1 - u) + (h(i + 1, k) - h(i + 1, k + 1)) * (1 - w)
}
const out = { facts: d.facts, ids: d.bodies.map((b) => b.id), rim: 0, rimN: 0, clear: Infinity, up: 0, coreTop: [Infinity, -Infinity], court: Infinity }
for (const b of d.bodies) {
  const p = b.geometry.getAttribute('position'), n = b.geometry.getAttribute('normal')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    if (b.id === 'ruin-trench') {
      const onX = Math.abs(x - R.x0) < 1e-6 || Math.abs(x - R.x1) < 1e-6, onZ = Math.abs(z - R.z0) < 1e-6 || Math.abs(z - R.z1) < 1e-6
      if (onX || onZ) {
        // the map ground's own edge: linear between its lattice points
        let want
        if (onX) { const za = R.z0 + Math.floor((z - R.z0) / L) * L, zb = Math.min(R.z1, za + L); want = zb === za ? g(x, za) : g(x, za) + (g(x, zb) - g(x, za)) * (z - za) / (zb - za) }
        else { const xa = R.x0 + Math.floor((x - R.x0) / L) * L, xb = Math.min(R.x1, xa + L); want = xb === xa ? g(xa, z) : g(xa, z) + (g(xb, z) - g(xa, z)) * (x - xa) / (xb - xa) }
        out.rim = Math.max(out.rim, Math.abs(y - want)); out.rimN++
      }
      const [u, v] = toFrame(d.frame, x, z), dd = Math.pow(Math.abs(u) ** 8 + Math.abs(v) ** 8, 1 / 8)
      if (dd < tp.dug.core.half - 6) { out.coreTop[0] = Math.min(out.coreTop[0], y); out.coreTop[1] = Math.max(out.coreTop[1], y) }
      if (dd > 60) out.court = Math.min(out.court, y)
    } else if (b.id.startsWith('ruin-stair')) {
      // only the strips' tops: their lips run down into the ground on purpose
      if (n.getY(i) > 0.9) { out.clear = Math.min(out.clear, y - patchY(x, z)); out.up++ }
    }
  }
}
console.log(JSON.stringify(out))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null

test('the excavated state builds', () => assert.equal(r.status, 0, r.stderr))

test('its bodies: the ruin, its water and the three stairs\' feet', () => {
  assert.deepEqual(out.ids, ['ruin-trench', 'ruin-water', 'ruin-stair-middle-a', 'ruin-stair-middle-b', 'ruin-stair-side'])
})

test('the core stands at +2.0 to +2.5 inside its eroded edge, the trench floor at -4.0, water at -1.2', () => {
  assert.ok(out.coreTop[0] >= 2.0 - 0.36 && out.coreTop[1] <= 2.5 + 1e-6, `core top ${out.coreTop}`)
  assert.equal(out.facts.floor, -4.0)
  assert.equal(out.facts.water, -1.2)
  assert.ok(out.court > out.facts.water + 3, `the court ${out.court} stands well over the water`)
})

test('the patch meets the map ground on its rim, edge for edge', () => {
  assert.ok(out.rimN > 800, `rim points ${out.rimN}`)
  assert.ok(out.rim < 1e-3, `rim off by ${out.rim} m`)
})

test('the stairs\' feet lie over the ruin\'s ground everywhere, never in it', () => {
  assert.ok(out.up > 1000, `strip top points ${out.up}`)
  assert.ok(out.clear >= 0.03, `the least clearance ${out.clear} m`)
  console.log(`strips: ${out.up} top points, least clearance ${out.clear.toFixed(4)} m; rim: ${out.rimN} points, off by ${out.rim.toExponential(2)} m; core top ${out.coreTop.map((v) => v.toFixed(2))}`)
})
