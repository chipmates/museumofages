// node --test forge/babylon/test/*.test.mjs (the gate page's own build, in a child node that strips its types: two
// overlapping bodies never share a top, a run's corner always stands on a top, two lion pieces never share their outer face)
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
import { buildGate } from ${url('gate/gate-geom.ts')}
const B = buildGate(JSON.parse(readFileSync(new URL(${url('gate/gate-plan.json')}), 'utf8')))
console.log(JSON.stringify({
  tops: [
    ...B.boxes.map((b) => ({ id: b.id, x0: b.x0 + (b.inset?.nx ?? 0), x1: b.x1 - (b.inset?.px ?? 0), z0: b.z0 + (b.inset?.nz ?? 0), z1: b.z1 - (b.inset?.pz ?? 0), y: b.y1, was: b.topBefore ?? b.y1 })),
    ...B.arches.map((a) => ({ id: a.id, x0: a.x0, x1: a.x1, z0: a.z0 + (a.inset0 ?? 0), z1: a.z1 - a.inset, y: a.top, was: a.topBefore ?? a.top })),
  ],
  runs: B.runs.map((r) => ({ id: r.id, a: r.a, b: r.b, out: r.out, thick: r.thick, y: r.y })),
  lions: B.prisms.filter((p) => /^lion-[we]-\\d+$/.test(p.id)).map((p) => ({ id: p.id, t: Math.max(...p.poly.map(([x, z]) => Math.abs(B.street.t(x, z)))) })),
}))
`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null
const cut = (a, b) => ({ x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), z0: Math.max(a.z0, b.z0), z1: Math.min(a.z1, b.z1) })
const meet = (o) => o.x1 - o.x0 > 1e-3 && o.z1 - o.z0 > 1e-3
const foot = (r) => {
  const xs = [r.a[0], r.b[0], r.a[0] - r.out[0] * r.thick, r.b[0] - r.out[0] * r.thick], zs = [r.a[1], r.b[1], r.a[1] - r.out[1] * r.thick, r.b[1] - r.out[1] * r.thick]
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }
}

test('the gate builds', () => assert.equal(r.status, 0, r.stderr))

test('seen from above no two bodies overlapping by a hundredth of a square metre share a top; a parted top moved 5 mm, a lintel up', () => {
  const T = out.tops
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    const o = cut(T[i], T[j])
    if ((o.x1 - o.x0) * (o.z1 - o.z0) >= 0.01 && o.x1 > o.x0 && o.z1 > o.z0) assert.ok(Math.abs(T[i].y - T[j].y) >= 1e-4, `${T[i].id} and ${T[j].id} share their top ${T[i].y}`)
  }
  const sunk = T.filter((t) => t.y !== t.was)
  assert.ok(sunk.length > 0)
  for (const t of sunk) assert.ok(Math.abs(Math.abs(t.was - t.y) - 0.005) < 1e-9 && (t.y > t.was) === /-lintel(-\d+)?$/.test(t.id), `${t.id} moved ${t.y - t.was}`)
})

test("where two runs cross on one level, a body's top at that level holds the corner (no two soffits face each other in a slot)", () => {
  const R = out.runs.filter((q) => out.tops.some((t) => Math.abs(t.was - q.y) < 1e-4))
  let corners = 0
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
    if (Math.abs(R[i].y - R[j].y) >= 1e-4) continue
    const o = cut(foot(R[i]), foot(R[j]))
    if (!meet(o)) continue
    corners++
    assert.ok(out.tops.some((t) => meet(cut(o, t)) && Math.abs(t.y - R[i].y) < 1e-4), `${R[i].id} and ${R[j].id} at ${R[i].y}`)
  }
  assert.ok(corners > 10)
})

test("each lion piece's outer face stands at least 4 mm off its neighbours' (each laps 0.3 m into the one before)", () => {
  for (const side of ['w', 'e']) {
    const L = out.lions.filter((p) => p.id.startsWith(`lion-${side}-`)).sort((a, b) => +a.id.split('-')[2] - +b.id.split('-')[2])
    assert.ok(L.length > 10)
    for (let k = 1; k < L.length; k++) assert.ok(Math.abs(L[k].t - L[k - 1].t) >= 0.004, `${L[k - 1].id} and ${L[k].id} at ${L[k].t}`)
  }
})
