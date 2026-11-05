// node --test forge/babylon/test/*.test.mjs (Esagila's north door: its faces off the ramp's and the arch's planes, and
// the arch still closed by it; built in a child node that strips its types)
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
import { buildEsagila } from ${url('esagila/esagila-geom.ts')}
const j = (p) => JSON.parse(readFileSync(new URL(p), 'utf8'))
const plan = j(${url('map/map-plan.json')}), ep = j(${url('esagila/esagila-plan.json')})
const e = buildEsagila(buildPlan(plan), plan, ep)
const tris = (id) => {
  const g = e.bodies.find((b) => b.id === id).geometry, P = g.getAttribute('position'), I = g.getIndex(), out = []
  const n = I ? I.count : P.count
  for (let k = 0; k < n; k++) { const i = I ? I.getX(k) : k; out.push(P.getX(i), P.getY(i), P.getZ(i)) }
  return out
}
console.log(JSON.stringify({ o: e.north.o, a: e.north.a, n: e.north.n, door: tris('esagila-door-n'), ramp: tris('esagila-ramp-n'), gate: tris('esagila-gate-n'),
  G: ep.gate, floor: ep.main.floor, foot: ep.units.foot }))`
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8', maxBuffer: 1 << 28 })
const out = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null

const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]]
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]
const unit = (p) => { const l = Math.hypot(...p); return p.map((v) => v / l) }
const triangles = (f) => { const o = []; for (let k = 0; k + 8 < f.length; k += 9) o.push([f.slice(k, k + 3), f.slice(k + 3, k + 6), f.slice(k + 6, k + 9)]); return o }
/** the convex polygon p clipped by the convex polygon c (2D, Sutherland-Hodgman) */
function clip(p, c) {
  const sgn = Math.sign((c[1][0] - c[0][0]) * (c[2][1] - c[0][1]) - (c[1][1] - c[0][1]) * (c[2][0] - c[0][0]))
  let o = p
  for (let i = 0; i < c.length && o.length; i++) {
    const A = c[i], B = c[(i + 1) % c.length], side = (q) => sgn * ((B[0] - A[0]) * (q[1] - A[1]) - (B[1] - A[1]) * (q[0] - A[0]))
    const next = []
    for (let k = 0; k < o.length; k++) {
      const P = o[k], Q = o[(k + 1) % o.length], sp = side(P), sq = side(Q)
      if (sp >= 0) next.push(P)
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); next.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]) }
    }
    o = next
  }
  return o
}
const area2 = (p) => { let s = 0; for (let k = 0; k < p.length; k++) { const a = p[k], b = p[(k + 1) % p.length]; s += a[0] * b[1] - a[1] * b[0] } return Math.abs(s) / 2 }

/** every door triangle against every triangle of the other body whose plane is within a hundredth of parallel and whose
    area overlaps it: the overlap's area and the least local gap between the two planes over it */
function overlaps(other) {
  const rows = []
  for (const D of triangles(out.door)) {
    const nD = unit(cross(sub(D[1], D[0]), sub(D[2], D[0])))
    for (const O of triangles(out[other])) {
      const nO = unit(cross(sub(O[1], O[0]), sub(O[2], O[0])))
      if (Math.abs(dot(nD, nO)) < 0.9999) continue
      const dist = D.map((v) => dot(sub(v, O[0]), nO))
      if (dist.every((d) => d > 0.05) || dist.every((d) => d < -0.05)) continue
      const e1 = unit(sub(O[1], O[0])), e2 = cross(nO, e1)
      const flat = (v) => [dot(sub(v, O[0]), e1), dot(sub(v, O[0]), e2)]
      const poly = clip(D.map(flat), O.map(flat))
      if (poly.length < 3 || area2(poly) < 1e-5) continue
      // the door's plane over each corner of the overlap, measured along the other's normal
      const gaps = poly.map((q) => { const Q = [0, 1, 2].map((c) => O[0][c] + q[0] * e1[c] + q[1] * e2[c]); return -dot(sub(Q, D[0]), nD) / dot(nD, nO) })
      const least = gaps.some((g) => g >= 0) && gaps.some((g) => g <= 0) ? 0 : Math.min(...gaps.map(Math.abs))
      rows.push({ area: area2(poly), gapMm: least * 1000 })
    }
  }
  return rows
}

test('Esagila builds with its north door', () => assert.equal(r.status, 0, r.stderr))

test("the north door's faces keep at least 2 mm off the ramp's and the gate's planes where they overlap", (t) => {
  const bad = []
  for (const other of ['ramp', 'gate']) {
    const rows = overlaps(other), close = rows.filter((x) => x.gapMm < 2)
    const area = close.reduce((s, x) => s + x.area, 0)
    t.diagnostic(`door against ${other}: ${rows.length} overlapping parallel pairs within 5 cm, least gap ${rows.length ? Math.min(...rows.map((x) => x.gapMm)).toFixed(2) : '-'} mm; under 2 mm ${close.length} (${area.toFixed(4)} m2)`)
    if (close.length) bad.push(`${other}: ${close.length} pairs under 2 mm over ${area.toFixed(4)} m2`)
  }
  assert.deepEqual(bad, [], `the door's faces in another body's plane: ${bad.join('; ')}`)
})

test('the north door still closes the arch: every ray through the passage meets the leaf, its ends and foot held in', (t) => {
  const { o, a, n, G, floor, foot } = out
  const [p0, p1] = G.passage, pc = (p0 + p1) / 2, R = (p1 - p0) / 2, spring = G.arch - R, N = G.archSlices
  // the passage as the gate and the casing cut it: 5 cm wider below the gate block's foot, under the arch's slices above
  const arcY = (s) => spring + Math.sqrt(Math.max(0, R * R - (s - pc) * (s - pc)))
  const intrados = (s) => {
    const k = Math.min(N - 1, Math.max(0, Math.floor(((s - p0) / (p1 - p0)) * N)))
    const u = p0 + ((p1 - p0) * k) / N, v = p0 + ((p1 - p0) * (k + 1)) / N
    const yu = k === 0 ? spring : arcY(u), yv = k === N - 1 ? spring : arcY(v)
    return yu + ((yv - yu) * (s - u)) / (v - u)
  }
  const at = (s, t, y) => [o[0] + a[0] * s + n[0] * t, y, o[1] + a[1] * s + n[1] * t]
  const D = triangles(out.door)
  const hits = (p, q) => {
    const d = sub(q, p), L = Math.hypot(...d), u = d.map((v) => v / L)
    return D.some(([A, B, C]) => {
      const e1 = sub(B, A), e2 = sub(C, A), h = cross(u, e2), det = dot(e1, h)
      if (Math.abs(det) < 1e-12) return false
      const s = sub(p, A), x = dot(s, h) / det, qv = cross(s, e1), y = dot(u, qv) / det, t = dot(e2, qv) / det
      return x >= 0 && y >= 0 && x + y <= 1 && t > 0 && t < L
    })
  }
  let cast = 0, passed = 0
  for (let s = p0 - 0.05 + 0.001; s <= p1 + 0.05 - 0.001; s += 0.01) {
    const top = s < p0 || s > p1 ? foot : intrados(s)
    for (let y = floor + 0.005; y < top - 0.002; y += 0.02) {
      cast++
      if (!hits(at(s, G.door.at + 0.2, y), at(s, G.door.at - G.door.thick - 0.2, y))) passed++
    }
  }
  t.diagnostic(`rays cast ${cast}, passed ${passed}`)
  assert.ok(cast > 50000, `rays cast ${cast}`)
  assert.equal(passed, 0, `${passed} of ${cast} rays pass the door`)
  // the leaf's ends in the casing's and the arch's jambs, its foot in the floor, at least 1 cm each
  const vs = D.flat(), s = vs.map((v) => (v[0] - o[0]) * a[0] + (v[2] - o[1]) * a[1]), yMin = Math.min(...vs.map((v) => v[1]))
  const sMin = Math.min(...s), sMax = Math.max(...s)
  t.diagnostic(`leaf ends ${sMin.toFixed(4)} to ${sMax.toFixed(4)} m along the face (casing jambs ${(p0 - 0.05).toFixed(2)}, ${(p1 + 0.05).toFixed(2)}; arch jambs ${p0}, ${p1}), foot ${yMin.toFixed(4)} under the floor ${floor}`)
  assert.ok(p0 - 0.05 - sMin >= 0.01 && sMax - (p1 + 0.05) >= 0.01, `the leaf's ends ${sMin.toFixed(3)} to ${sMax.toFixed(3)} against the casing's passage ${p0 - 0.05} to ${p1 + 0.05}`)
  assert.ok(floor - yMin >= 0.01, `the leaf's foot ${yMin.toFixed(3)} against the floor ${floor}`)
  // its crown over the arch's slices
  const front = vs.filter((v) => Math.abs((v[0] - o[0]) * n[0] + (v[2] - o[1]) * n[1] - G.door.at) < 1e-3 && v[1] > spring + 0.02)
  const crown = [...new Map(front.map((v) => [((v[0] - o[0]) * a[0] + (v[2] - o[1]) * a[1]).toFixed(4), v[1]])).entries()].map(([k, y]) => [Number(k), y]).sort((p, q) => p[0] - q[0])
  const leafTop = (x) => { for (let k = 0; k + 1 < crown.length; k++) if (crown[k][0] <= x && x <= crown[k + 1][0]) return crown[k][1] + ((crown[k + 1][1] - crown[k][1]) * (x - crown[k][0])) / (crown[k + 1][0] - crown[k][0]); return -Infinity }
  let least = Infinity
  for (let x = p0; x <= p1; x += 0.002) least = Math.min(least, leafTop(x) - intrados(x))
  t.diagnostic(`the crown over the arch's slices by at least ${least.toFixed(4)} m, ${crown.length} crown vertices`)
  assert.ok(least >= 0.01, `the leaf's crown over the arch's slices by at least ${least.toFixed(4)} m`)
})
