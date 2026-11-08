// node --test forge/babylon/test/*.test.mjs (the edge timber's look: its depth attribute for the grain, and an albedo
// in the beams' hue lighter than theirs, so its shaded face at dusk is not near-black; built in a child node)
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
import { buildBridge, FASCIA, KIND } from ${url('bridge/bridge-geom.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), bp = j(${url('bridge/bridge-plan.json')})
const b = buildBridge(buildPlan(plan), plan, bp)
const fr = b.frame
const tOf = (x, z) => (x - fr.a[0]) * fr.d[0] + (z - fr.a[1]) * fr.d[1]
const g = b.bodies.find((x) => x.id === 'bridge-deck-boards').geometry
const pos = g.getAttribute('position'), kind = g.getAttribute('kind'), fa = g.getAttribute('fa')
const fascia = [], boards = []
for (let i = 0; i < pos.count; i++) {
  const v = { t: tOf(pos.getX(i), pos.getZ(i)), y: pos.getY(i), z: fa.getZ(i), w: fa.getW(i) }
  if (kind.getX(i) === KIND.beam) fascia.push(v); else if (kind.getX(i) === KIND.boards) boards.push(v)
}
const top = boards.filter((v) => v.y >= Math.max(...boards.filter((u) => Math.abs(u.t - v.t) < 1e-3).map((u) => u.y)) - 1e-6)
const e0 = top.reduce((a, v) => (v.t < a.t ? v : a)), e1 = top.reduce((a, v) => (v.t > a.t ? v : a))
console.log(JSON.stringify({ FASCIA, n: bp.deck.beams.n, timber: bp.colours.timber, fascia, s0: [e0.t, e0.y], s1: [e1.t, e1.y] }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null

// the material imports three/webgpu, so its two constants are read from the source
const mat = readFileSync(join(W, 'bridge/bridge-mat.ts'), 'utf8')
const alb = JSON.parse(mat.match(/export const FAS_ALB: RGB = (\[[^\]]+\])/)[1])
const len = Number(mat.match(/export const FAS_LEN = ([\d.]+)/)[1])

test('the fascia carries its depth under the walking face for its grain', () => {
  assert.equal(r.status, 0, r.stderr)
  const slab = (t) => out.s0[1] + ((t - out.s0[0]) / (out.s1[0] - out.s0[0])) * (out.s1[1] - out.s0[1])
  for (const v of out.fascia) {
    assert.ok(v.z > out.n - 0.5, `fascia vertex with fa.z ${v.z}: not past the ${out.n} beams' indices`)
    assert.ok(Math.abs(v.w - (slab(v.t) - v.y)) < 1e-3, `fa.w ${v.w.toFixed(4)} against depth ${(slab(v.t) - v.y).toFixed(4)}`)
    assert.ok(v.w >= 0 && v.w <= out.FASCIA.h + 1e-3, `fa.w ${v.w} outside 0..${out.FASCIA.h}`)
  }
})

test('its albedo is the beams\' timber hue, lighter, and still a timber (not a pale stone)', () => {
  const k = alb.map((c, i) => c / out.timber[i])
  for (const x of k) assert.ok(x > 1.2 && x < 2, `albedo ${alb} is ${x.toFixed(2)} x the timber's ${out.timber}`)
  assert.ok(Math.max(...k) - Math.min(...k) < 0.1, `hue moved: ratios ${k.map((x) => x.toFixed(2))}`)
  assert.ok(alb[0] > alb[1] && alb[1] > alb[2], `not warm: ${alb}`)
  assert.ok(Math.max(...alb) < 0.45, `too pale for weathered timber: ${alb}`)
})

test('its lengths butt every few metres', () => {
  assert.ok(len >= 2 && len <= 6, `FAS_LEN ${len}`)
})
