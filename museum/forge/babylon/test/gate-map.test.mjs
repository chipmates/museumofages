// node --test forge/babylon/test/*.test.mjs (the Ishtar Gate's own build on the map page, built in a child node that
// strips its types: the massings it replaces, the parts it keeps, its tops from above, its registered place)
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
import { buildPlan, makeFrame } from ${url('map/plan.ts')}
import { buildGate, gateFrame, gateOwnParts, isGateMassing } from ${url('gate/gate-geom.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), gp = j(${url('gate/gate-plan.json')})
const all = buildPlan(plan), F = makeFrame(plan), GF = gateFrame(gp)
const B = buildGate(gp), O = gateOwnParts(buildGate(gp))
const D2R = Math.PI / 180
const lion = plan.frames.lion
const la = [Math.sin(lion.bearing * D2R), Math.cos(lion.bearing * D2R)]
const off = ([E, N]) => (E - lion.origin[0]) * la[1] - (N - lion.origin[1]) * la[0]
const streetOff = [0, -13, -30, -48].map((z) => { const [x, s] = F.s(...GF.utm(0, z)); return all.streetAt(x, s).d })
const streetLevel = [0, -13, -30, -48].map((z) => { const [x, s] = F.s(...GF.utm(0, z)); return all.streetAt(x, s).level })
console.log(JSON.stringify({
  blocks: plan.blocks.filter((b) => /^gate-(front|main)/.test(b.id)).map((b) => b.id),
  dropped: all.prisms.filter((p) => isGateMassing(p.id)).map((p) => p.id),
  kept: all.prisms.filter((p) => !isGateMassing(p.id) && /^(gate|bastion|lion)/.test(p.id)).map((p) => p.id),
  parts: [...new Set([...O.boxes, ...O.prisms, ...O.arches, ...O.beams, ...O.faces].map((b) => b.part))].sort(),
  orphanPanels: O.panels.filter((p) => !O.faces.some((f) => f.id === p.face)).length,
  panels: O.panels.length, panelsAll: B.panels.length,
  runs: O.runs.map((r) => r.id), pedestals: O.pedestals.map((p) => ({ n: p.n, animal: p.animal ?? null })),
  boxes: O.boxes.map((b) => ({ id: b.id, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y1: b.y1, was: B.boxes.find((o) => o.id === b.id).y1 })),
  arches: O.arches.map((a) => ({ id: a.id, x0: a.x0, x1: a.x1, z0: a.z0, z1: a.z1, y1: a.top, was: B.arches.find((o) => o.id === a.id).top })),
  runY: O.runs.map((r) => ({ id: r.id, y: r.y, was: B.runs.find((o) => o.id === r.id).y, a: r.a, b: r.b, out: r.out, thick: r.thick })),
  untouched: B.boxes.length === buildGate(gp).boxes.length && B.boxes.every((b, i) => b.y1 === buildGate(gp).boxes[i].y1),
  faceOff: off(GF.utm(0, 0)), streetOff, streetLevel, door: gp.front.door,
}))
`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const over = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 1e-3

test('the gate builds for the map', () => assert.equal(r.status, 0, r.stderr))

test("the map leaves out its six massings of the two gates (12 prisms) and keeps them in its plan, the forecourt's bastions and the lion walls its own", () => {
  assert.deepEqual(out.blocks, ['gate-front', 'gate-front-tower-w', 'gate-front-tower-e', 'gate-main', 'gate-main-tower-w', 'gate-main-tower-e'])
  assert.equal(out.dropped.length, 12)
  assert.ok(out.dropped.every((id) => /^gate-(front|main)(-|$)/.test(id)))
  assert.ok(out.kept.includes('bastion-w') && out.kept.includes('bastion-e') && out.kept.some((id) => id.startsWith('lion-wall-')))
})

test("the map takes the gate's own parts only: the two gates and the court, every panel on a kept face, no bronze animal", () => {
  assert.deepEqual(out.parts, ['court', 'front gate', 'main gate'])
  assert.equal(out.orphanPanels, 0)
  assert.ok(out.panels > 0 && out.panels < out.panelsAll)
  assert.ok(out.runs.length > 0 && out.runs.every((id) => /^(m?guard-|front-top-|main-top-)/.test(id)))
  assert.deepEqual(out.pedestals.map((p) => p.animal), [null, null, null, null])
})

test('seen from above no two overlapping bodies share a top, every top rose by at most two steps, the gate page build untouched', () => {
  const tops = [...out.boxes, ...out.arches]
  for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) {
    const p = tops[i], q = tops[j]
    if (over(p.x0, p.x1, q.x0, q.x1) && over(p.z0, p.z1, q.z0, q.z1)) assert.ok(Math.abs(p.y1 - q.y1) >= 1e-4, `${p.id} and ${q.id} share their top ${p.y1}`)
  }
  // a body above two others on one level (a guard storey's side wall under its roof and beside its front) rises twice
  for (const t of tops) { const k = (t.y1 - t.was) / 0.012; assert.ok(Math.abs(k - Math.round(k)) < 1e-6 && k > -1e-6 && k < 2 + 1e-6, `${t.id} moved ${t.y1 - t.was}`) }
  assert.ok(out.untouched)
})

test('every battlement run stands on the top of a body under it (none floats, none sinks)', () => {
  const tops = [...out.boxes, ...out.arches]
  for (const r of out.runY) {
    const xs = [r.a[0], r.b[0], r.a[0] - r.out[0] * r.thick, r.b[0] - r.out[0] * r.thick], zs = [r.a[1], r.b[1], r.a[1] - r.out[1] * r.thick, r.b[1] - r.out[1] * r.thick]
    const under = tops.filter((t) => over(Math.min(...xs), Math.max(...xs), t.x0, t.x1) && over(Math.min(...zs), Math.max(...zs), t.z0, t.z1) && Math.abs(t.was - r.was) < 1e-4)
    if (!under.length) continue
    assert.ok(r.y - Math.max(...under.map((t) => t.y1)) >= -1e-9 && r.y - Math.max(...under.map((t) => t.y1)) <= 0.012 + 1e-9, `${r.id} at ${r.y} over ${under.map((t) => `${t.id}@${t.y1}`).join(' ')}`)
  }
})

test("the registered place: the north face 1.7 m from the lion street's axis, the map's street centre inside the door at the gate's +15.40", () => {
  assert.ok(Math.abs(out.faceOff - 1.71) < 0.05, `the face's centre ${out.faceOff} m off the lion axis`)
  for (const d of out.streetOff) assert.ok(d < out.door / 2 - 0.3, `the street centre ${d} m off the passage axis, the door ${out.door} m`)
  for (const y of out.streetLevel) assert.ok(Math.abs(y - 15.4) < 0.01, `the street at +${y}`)
})
