// node --test forge/babylon/test/*.test.mjs (the deck's edge timber: both sides, flush with the walking face, clear of
// the capping, between the land piers' faces; built in a child node that strips its types)
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
import { buildBridge, FASCIA, KIND } from ${url('bridge/bridge-geom.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), bp = j(${url('bridge/bridge-plan.json')})
const b = buildBridge(buildPlan(plan), plan, bp)
const fr = b.frame
const tc = (x, z) => { const r = [x - fr.a[0], z - fr.a[1]]; return [r[0] * fr.d[0] + r[1] * fr.d[1], r[0] * fr.n[0] + r[1] * fr.n[1]] }
const g = b.bodies.find((x) => x.id === 'bridge-deck-boards').geometry
const pos = g.getAttribute('position'), kind = g.getAttribute('kind')
const boards = [], fascia = []
for (let i = 0; i < pos.count; i++) {
  const [t, c] = tc(pos.getX(i), pos.getZ(i)), v = { t, c, y: pos.getY(i) }
  if (kind.getX(i) === KIND.beam) fascia.push(v); else if (kind.getX(i) === KIND.boards) boards.push(v)
}
// the boards' walking face: a straight slab between its two ends
const top = boards.filter((v) => v.y >= Math.max(...boards.filter((u) => Math.abs(u.t - v.t) < 1e-3).map((u) => u.y)) - 1e-6)
const e0 = top.reduce((a, v) => (v.t < a.t ? v : a)), e1 = top.reduce((a, v) => (v.t > a.t ? v : a))
const slab = (t) => e0.y + ((t - e0.t) / (e1.t - e0.t)) * (e1.y - e0.y)
console.log(JSON.stringify({ FASCIA, w: bp.deck.w, LP: plan.bridge.abutments, fascia, slab0: [e0.t, e0.y], slab1: [e1.t, e1.y],
  caps: b.piers.map((p) => ({ t: p.t, capTop: p.capTop })), slabAtPiers: b.piers.map((p) => slab(p.t)) }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const slab = (t) => out.slab0[1] + ((t - out.slab0[0]) / (out.slab1[0] - out.slab0[0])) * (out.slab1[1] - out.slab0[1])

test('the deck builds with its fascia', () => {
  assert.equal(r.status, 0, r.stderr)
  assert.ok(out.fascia.length >= 72, `${out.fascia.length} fascia vertices: two boxes of six faces`)
})

test('the fascia runs along both sides, just outside the boards, 0.08 m across', () => {
  const half = out.w / 2
  for (const side of [-1, 1]) {
    const cs = out.fascia.filter((v) => Math.sign(v.c) === side).map((v) => Math.abs(v.c))
    assert.ok(cs.length > 0, `no fascia on side ${side}`)
    assert.ok(Math.abs(Math.min(...cs) - half) < 1e-3, `side ${side}: inner face at ${Math.min(...cs)}`)
    assert.ok(Math.abs(Math.max(...cs) - half - out.FASCIA.w) < 1e-3, `side ${side}: outer face at ${Math.max(...cs)}`)
  }
})

test('its top is flush with the walking face and it hangs 0.25 m', () => {
  for (const v of out.fascia) {
    const d = slab(v.t) - v.y
    assert.ok(Math.abs(d) < 1e-3 || Math.abs(d - out.FASCIA.h) < 1e-3, `vertex at t ${v.t.toFixed(2)}: ${d.toFixed(4)} under the walking face`)
  }
})

test('it clears every capping and stops at the land piers\' faces', () => {
  out.caps.forEach((p, i) => assert.ok(out.slabAtPiers[i] - out.FASCIA.h - p.capTop > 0.15, `pier ${i + 1}: ${(out.slabAtPiers[i] - out.FASCIA.h - p.capTop).toFixed(3)} m clear`))
  const ts = out.fascia.map((v) => v.t), f0 = Math.min(...ts), f1 = Math.max(...ts)
  // the land piers' river faces lean in by the batter: the fascia ends inside a metre of each face, never over a paved top
  assert.ok(f0 <= out.LP.east.to && f0 > out.LP.east.to - 1, `east end ${f0} against the face at ${out.LP.east.to}`)
  assert.ok(f1 >= out.LP.west.from && f1 < out.LP.west.from + 1, `west end ${f1} against the face at ${out.LP.west.from}`)
})
