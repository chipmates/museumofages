// node --test forge/babylon/test/*.test.mjs (stop 10's south front: the slight towers on the south rooms' street face
// and Gate 8 with its open square, built in a child node that strips its types)
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
import { buildTower } from ${url('tower/tower-geom.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), cp = j(${url('court/court-plan.json')}), tp = j(${url('tower/tower-plan.json')})
const t = buildTower(buildCourt(buildPlan(plan), plan, cp).built, plan, tp)
const E0 = plan.frame.E0, N0 = plan.frame.N0, w = plan.walls.find((x) => x.id === 'precinct-south-rooms')
const S = (p) => [p[0] - E0, N0 - p[1]], a = S(w.line[0]), b = S(w.line[1]), L = Math.hypot(b[0] - a[0], b[1] - a[1])
const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
let o = [-d[1], d[0]]; if (o[1] < 0) o = [-o[0], -o[1]]
const f = [a[0] + o[0] * w.thick / 2, a[1] + o[1] * w.thick / 2]
const gap = w.gaps[0], sG = (S(gap.at)[0] - a[0]) * d[0] + (S(gap.at)[1] - a[1]) * d[1]
// each south body in the face's frame: along from the band's west end, off out from the street face
const frame = (g) => {
  const p = g.getAttribute('position'), r = { along: [1e9, -1e9], off: [1e9, -1e9], y: [1e9, -1e9] }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) - f[0], z = p.getZ(i) - f[1], s = x * d[0] + z * d[1], u = x * o[0] + z * o[1]
    for (const [k, v] of [['along', s], ['off', u], ['y', p.getY(i)]]) { r[k][0] = Math.min(r[k][0], v); r[k][1] = Math.max(r[k][1], v) }
  }
  return r
}
const bodies = t.bodies.filter((x) => /^precinct-(south-tower|gate8)/.test(x.id)).map((x) => ({ id: x.id, ...frame(x.geometry) }))
console.log(JSON.stringify({ south: t.facts.south, bodies, gap: { s: sG, w: gap.w }, len: L, top: w.top, E0 }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (tolerance ${tol})`)

test('the south front builds', () => assert.equal(r.status, 0, r.stderr))

test('40 slight towers on the street face, 2 on each side of the square, at the east wall\'s pitch', () => {
  const s = out.south
  assert.equal(s.face, 40, 'face towers')
  assert.equal(s.sides, 2, 'towers a side')
  assert.equal(s.towers, 44, 'all towers')
  near(s.pitch, 10.4, 1e-9, 'pitch')
  assert.equal(out.bodies.filter((b) => b.id.startsWith('precinct-south-tower-')).length, 44, 'tower bodies')
})

test('every face tower stands with its back on the street face, 0.5 m out, 4 m wide, none in the gap', () => {
  const face = out.bodies.filter((b) => b.id.startsWith('precinct-south-tower-') && b.off[0] > -0.05)
  assert.equal(face.length, 40, 'towers on the face')
  const g0 = out.gap.s - out.gap.w / 2, g1 = out.gap.s + out.gap.w / 2
  const mids = []
  for (const b of face) {
    near(b.off[0], 0, 0.01, `${b.id} back on the face`)
    near(b.off[1], 0.5, 0.01, `${b.id} projection`)
    near(b.along[1] - b.along[0], 4, 0.01, `${b.id} width`)
    near(b.y[1], out.top + 0.6, 0.01, `${b.id} top over the wall`)
    assert.ok(b.along[1] <= g0 + 1e-6 || b.along[0] >= g1 - 1e-6, `${b.id} in Gate 8's gap`)
    assert.ok(b.along[0] >= 0 && b.along[1] <= out.len, `${b.id} off the band`)
    mids.push((b.along[0] + b.along[1]) / 2)
  }
  // in each run the towers keep the pitch
  mids.sort((p, q) => p - q)
  let steps = 0
  for (let k = 1; k < mids.length; k++) if (!(mids[k - 1] < g0 && mids[k] > g1)) { near(mids[k] - mids[k - 1], 10.4, 0.01, `step ${k}`); steps++ }
  assert.equal(steps, 38)
})

test('Gate 8: the face centre inside the map\'s gap at 445677 to 445700 E, a square 25 m deep, the gate at its inner end', () => {
  const g = out.south.gate
  assert.ok(g.at[0] > 445677 && g.at[0] < 445700, `gate centre E ${g.at[0]}`)
  near(g.width, 21, 0.01, 'gap width')
  assert.equal(g.square, 25)
  const ids = out.bodies.filter((b) => b.id.startsWith('precinct-gate8-'))
  assert.deepEqual(ids.map((b) => b.id).sort(), ['precinct-gate8-e', 'precinct-gate8-middle', 'precinct-gate8-w'])
  for (const b of ids) {
    assert.ok(b.off[1] <= -25 + 0.41, `${b.id} front ${b.off[1]} in front of the square's inner end`)
    // the masses stay inside the gap, lapped at most 0.3 m into the rooms
    assert.ok(b.along[0] >= out.gap.s - out.gap.w / 2 - 0.31 && b.along[1] <= out.gap.s + out.gap.w / 2 + 0.31, `${b.id} outside the gap`)
  }
  const m = ids.find((b) => b.id === 'precinct-gate8-middle'), wm = ids.find((b) => b.id === 'precinct-gate8-w')
  near(m.y[0], 7.5, 0.01, 'passage height'); near(m.y[1], 14.8, 0.01, 'middle top'); near(wm.y[1], 16, 0.01, 'flank top')
  // the side towers stand inside the square, on its two sides
  const side = out.bodies.filter((b) => b.id.startsWith('precinct-south-tower-') && b.off[0] <= -0.05)
  assert.equal(side.length, 4)
  for (const b of side) assert.ok(b.off[0] > -25 && Math.abs((b.along[0] + b.along[1]) / 2 - out.gap.s) < out.gap.w / 2, `${b.id} in the square`)
})
