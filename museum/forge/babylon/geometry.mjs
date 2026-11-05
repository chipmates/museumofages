// THE KIT'S GEOMETRY MEASURES, offline (no renderer), on any stop's bodies: two bodies in one plane (coplanar), faces
// thinner than a device pixel at the stills' cameras (sub-pixel), and bodies with nothing under a corner (floating).
// The method is the gate pilot's checker made generic: a mount (mounts.mjs) hands in named triangles and cameras in one
// frame (the map's scene metres, y up), and these functions measure them.
//   import { facesFrom, coplanar, subPixel, floating, cameraFrom } from './geometry.mjs'
import * as THREE from 'three/webgpu'

const D2R = Math.PI / 180
// loops, not spreads: a body of a hundred thousand vertices overflows the call stack as arguments
const minOf = (xs) => { let m = Infinity; for (const x of xs) if (x < m) m = x; return m }
const maxOf = (xs) => { let m = -Infinity; for (const x of xs) if (x > m) m = x; return m }

/** one face record per triangle: body, unit normal turned to its major axis's positive side, plane offset, vertices */
export function pushFace(faces, body, a, b, c) {
  const n = b.clone().sub(a).cross(c.clone().sub(a))
  const twice = n.length()
  if (twice < 1e-9) return
  n.divideScalar(twice)
  const major = Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z) ? n.x : Math.abs(n.y) >= Math.abs(n.z) ? n.y : n.z
  // one plane whichever way its faces look; `facing` keeps the way, so a butt joint parts from a fight
  const facing = major < 0 ? -1 : 1
  if (major < 0) n.negate()
  faces.push({ body, n, d: n.dot(a), v: [a, b, c], area: twice / 2, facing })
}

/** the triangles of a geometry under a matrix; bodyAt(vertex index) names the body or returns null to skip it */
export function facesFrom(faces, geo, matrix, bodyAt, keep = null) {
  const P = geo.getAttribute('position'), I = geo.getIndex()
  const count = I ? I.count : P.count
  for (let k = 0; k + 2 < count; k += 3) {
    const v = [0, 1, 2].map((j) => {
      const i = I ? I.getX(k + j) : k + j
      const p = new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i))
      return matrix ? p.applyMatrix4(matrix) : p
    })
    if (keep && !keep(v)) continue
    const body = bodyAt(I ? I.getX(k) : k)
    if (body) pushFace(faces, body, v[0], v[1], v[2])
  }
  return faces
}

// one buffer for sharedArea's per-cell heights and gaps, grown to the largest grid
let pool = new Float32Array(0)
const scratch = (n) => {
  if (pool.length < 3 * n) pool = new Float32Array(3 * n)
  return [pool.subarray(0, n), pool.subarray(n, 2 * n), pool.subarray(2 * n, 3 * n)]
}
/** the k-th least of xs[0, len), in place (Hoare's selection: runs of equal values stay linear) */
function nth(xs, len, k) {
  let lo = 0, hi = len - 1
  while (hi > lo) {
    const pivot = xs[(lo + hi) >> 1]
    let i = lo, j = hi
    while (i <= j) {
      while (xs[i] < pivot) i++
      while (xs[j] > pivot) j--
      if (i <= j) { const t = xs[i]; xs[i] = xs[j]; xs[j] = t; i++; j-- }
    }
    if (k <= j) hi = j
    else if (k >= i) lo = i
    else return xs[k]
  }
  return xs[k]
}

/** the two unit axes across `n` that sharedArea measures in */
export function frameOf(n) {
  const helper = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const e1 = new THREE.Vector3().crossVectors(n, helper).normalize()
  return [e1, new THREE.Vector3().crossVectors(n, e1)]
}

/** the shared area of two face sets in one plane, on a grid; `cover` faces (a third body's, looking the other way)
    close the cells they lie on (with `coverBedM`, only where they lie that close to a's faces); `masked(point)` drops
    a cell the page hides; `clip` ([u0, v0, u1, v1] in frameOf(n)) keeps the grid inside a box. A cell counts only where
    the two sets' own planes lie within `bedM` of each other along `n` there (the local gap): a plane's offset from
    the origin matches a long, slightly tilted face to a level one far above it. `gapMm` is the local gap's median over
    the counted cells, `gapMinMm` its least over every shared cell, `overlap` the area of every shared cell.
    `cellOf(box, e1, e2, n, d0)` may coarsen the grid's cell for that box (a stop's pixel scale; see pixelCell). */
export function sharedArea(a, b, n, { cover = [], masked = null, bedM = Infinity, coverBedM = null, clip = null, keepGaps = false, cellOf = null } = {}) {
  const [e1, e2] = frameOf(n)
  const flat = (set) => set.map((f) => f.v.map((q) => [q.dot(e1), q.dot(e2)]))
  const FA = flat(a), FB = flat(b), FC = flat(cover)
  const bb = (F) => { const p = F.flat(); return [minOf(p.map((x) => x[0])), minOf(p.map((x) => x[1])), maxOf(p.map((x) => x[0])), maxOf(p.map((x) => x[1]))] }
  const ba = bb(FA), bq = bb(FB)
  const box = [Math.max(ba[0], bq[0]), Math.max(ba[1], bq[1]), Math.min(ba[2], bq[2]), Math.min(ba[3], bq[3])]
  if (clip) for (let k = 0; k < 4; k++) box[k] = k < 2 ? Math.max(box[k], clip[k]) : Math.min(box[k], clip[k])
  if (box[2] <= box[0] || box[3] <= box[1]) return null
  const CELL = Math.max(Math.min(0.05, Math.max(0.01, Math.sqrt(((box[2] - box[0]) * (box[3] - box[1])) / 2e6))), cellOf ? cellOf(box, e1, e2, n, a[0].d) : 0)
  // samples off the cell's middle: two bodies meeting edge to edge share an edge at a whole or half cell from the corner
  const F = 0.537
  const cols = Math.ceil((box[2] - box[0]) / CELL) + 1, rows = Math.ceil((box[3] - box[1]) / CELL) + 1
  const grid = new Uint8Array(cols * rows)
  const d0 = a[0].d
  // a face's height over the plane `d0` along n at (u, v): t = c - pu * u - pv * v, from its own normal and offset
  const height = (set) => set.map((f) => { const k = f.n.dot(n); return [f.n.dot(e1) / k, f.n.dot(e2) / k, f.d / k - d0] })
  const HA = height(a), HB = height(b)
  // per cell: the lowest and highest of a's heights, then the least gap from any of b's faces to either of them
  // (exact where a lays at most two faces on a cell); the grid's bits say which cells hold a value
  const [aLo, aHi, gap] = scratch(cols * rows)
  const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const paint = (set, bit, H = null) => {
    for (let t = 0; t < set.length; t++) {
      const tri = set[t], h = H && H[t]
      const lo = [Math.min(...tri.map((p) => p[0])), Math.min(...tri.map((p) => p[1]))], hi = [Math.max(...tri.map((p) => p[0])), Math.max(...tri.map((p) => p[1]))]
      const i0 = Math.max(0, Math.floor((lo[0] - box[0]) / CELL)), i1 = Math.min(cols - 1, Math.ceil((hi[0] - box[0]) / CELL))
      const j0 = Math.max(0, Math.floor((lo[1] - box[1]) / CELL)), j1 = Math.min(rows - 1, Math.ceil((hi[1] - box[1]) / CELL))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const P = [box[0] + (i + F) * CELL, box[1] + (j + F) * CELL]
        const d1 = side(tri[0], tri[1], P), d2 = side(tri[1], tri[2], P), d3 = side(tri[2], tri[0], P)
        if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue
        const k = j * cols + i
        if (bit === 1) {
          const y = h[2] - h[0] * P[0] - h[1] * P[1]
          if (!(grid[k] & 1)) { aLo[k] = y; aHi[k] = y } else if (y < aLo[k]) aLo[k] = y; else if (y > aHi[k]) aHi[k] = y
        } else if (bit === 2 && grid[k] & 1) {
          const y = h[2] - h[0] * P[0] - h[1] * P[1]
          const g = Math.min(Math.abs(y - aLo[k]), Math.abs(y - aHi[k]))
          if (!(grid[k] & 2) || g < gap[k]) gap[k] = g
        } else if (bit === 4 && h) {
          const y = h[2] - h[0] * P[0] - h[1] * P[1]
          if (!(grid[k] & 1) || Math.min(Math.abs(y - aLo[k]), Math.abs(y - aHi[k])) > coverBedM) continue
        }
        grid[k] |= bit
      }
    }
  }
  paint(FA, 1, HA)
  paint(FB, 2, HB)
  paint(FC, 4, coverBedM == null ? null : height(cover))
  // the shared cells' gaps packed to the front in place, those within the bed first
  let w = 0, both = 0, least = Infinity
  const at = [Infinity, Infinity, -Infinity, -Infinity]
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (grid[j * cols + i] !== 3) continue
    // a clipped grid's last row and column sample past the clip, where the next tile counts
    if (clip && (box[0] + (i + F) * CELL >= box[2] || box[1] + (j + F) * CELL >= box[3])) continue
    if (masked) {
      const p = e1.clone().multiplyScalar(box[0] + (i + F) * CELL).addScaledVector(e2, box[1] + (j + F) * CELL).addScaledVector(n, d0)
      if (masked(p)) continue
    }
    const g = gap[j * cols + i]
    if (g < least) least = g
    gap[w] = gap[both]
    if (g <= bedM) {
      gap[both++] = g
      if (keepGaps) { const u = box[0] + (i + F) * CELL, v = box[1] + (j + F) * CELL; at[0] = Math.min(at[0], u); at[1] = Math.min(at[1], v); at[2] = Math.max(at[2], u); at[3] = Math.max(at[3], v) }
    } else gap[w] = g
    w++
  }
  const mm = (x) => +(x * 1000).toFixed(1)
  const kept = keepGaps ? gap.slice(0, both) : null
  return {
    area: both * CELL * CELL, cell: +CELL.toFixed(3), gapMm: both ? mm(nth(gap, both, (both - 1) >> 1)) : null, gapMinMm: w ? mm(least) : null,
    overlap: +(w * CELL * CELL).toFixed(3), ...(kept ? { gaps: kept, where: both ? [[0, 1], [2, 1], [0, 3], [2, 3]].map(([u, v]) => e1.clone().multiplyScalar(at[u]).addScaledVector(e2, at[v]).addScaledVector(n, d0)) : [] } : {}),
  }
}

/** each face's box in the plane frame (e1, e2), as sharedArea measures it: [u0, v0, u1, v1] per face */
function planeBoxes(set, e1, e2) {
  const B = new Float64Array(4 * set.length)
  for (let t = 0; t < set.length; t++) {
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity
    for (const q of set[t].v) { const u = q.dot(e1), v = q.dot(e2); if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v }
    B.set([u0, v0, u1, v1], 4 * t)
  }
  return B
}
/** the pairs i < j of n boxes that overlap with some area (sharedArea's test), as i * n + j, ascending */
function overlapPairs(B, n) {
  const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => B[4 * p] - B[4 * q])
  const out = []
  let open = []
  for (const i of order) {
    open = open.filter((j) => B[4 * j + 2] > B[4 * i])
    for (const j of open) if (B[4 * i + 1] < B[4 * j + 3] && B[4 * j + 1] < B[4 * i + 3]) out.push(i < j ? i * n + j : j * n + i)
    open.push(i)
  }
  return out.sort((p, q) => p - q)
}
/** a query for the boxes (of planeBoxes) that meet a box [u0, v0, u1, v1], edges included: a grid of up to 512 cells
    a side over their extent; a box over 64 cells is checked on every query */
function boxIndex(B, n) {
  const E = [Infinity, Infinity, -Infinity, -Infinity]
  for (let t = 0; t < n; t++) for (let k = 0; k < 2; k++) { E[k] = Math.min(E[k], B[4 * t + k]); E[2 + k] = Math.max(E[2 + k], B[4 * t + 2 + k]) }
  const S = Math.max(1e-6, (E[2] - E[0]) / 512, (E[3] - E[1]) / 512)
  const at = (x, k) => Math.min(512, Math.max(0, Math.floor((x - E[k]) / S)))
  const cells = new Map(), wide = []
  for (let t = 0; t < n; t++) {
    const i0 = at(B[4 * t], 0), i1 = at(B[4 * t + 2], 0), j0 = at(B[4 * t + 1], 1), j1 = at(B[4 * t + 3], 1)
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 64) { wide.push(t); continue }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const c = i * 1024 + j, l = cells.get(c); if (l) l.push(t); else cells.set(c, [t]) }
  }
  const seen = new Uint32Array(n)
  let stamp = 0
  const EPS = 1e-6
  const meets = (t, q) => B[4 * t] <= q[2] + EPS && B[4 * t + 2] >= q[0] - EPS && B[4 * t + 1] <= q[3] + EPS && B[4 * t + 3] >= q[1] - EPS
  return (q) => {
    const i0 = at(q[0] - EPS, 0), i1 = at(q[2] + EPS, 0), j0 = at(q[1] - EPS, 1), j1 = at(q[3] + EPS, 1)
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 4096) return Array.from({ length: n }, (_, t) => t).filter((t) => meets(t, q))
    stamp++
    const out = wide.filter((t) => meets(t, q))
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const t of cells.get(i * 1024 + j) ?? []) if (seen[t] !== stamp) { seen[t] = stamp; if (meets(t, q)) out.push(t) }
    return out
  }
}

/** pairs of bodies sharing a plane (normal to a hundredth, offsets within the bed) and some area where their own
    planes lie within the bed of each other (sharedArea's local gap; `local: false` counts every shared cell, as
    before the local gap). kinds: fight (both look one way), butt (opposite ways: two closed bodies face to face),
    unseen (a fight every eye stands behind). `counts(a, b)` says whether a pair is this check's to report.
    The offsets group faces into runs; `across` (on with the local gap) then finds the pairs no run holds together
    (acrossRuns), each such row marked with the number of run pairs it joins and `where` it fights. */
export function coplanar(faces, { bedM = 0.002, areaMin = 0.01, eyes = [], counts = () => true, masked = null, local = true, across = local, cellOf = null } = {}) {
  const groups = new Map()
  for (const f of faces) {
    const key = [f.n.x, f.n.y, f.n.z].map((c) => (Math.round(c * 100) / 100).toFixed(2)).join(',')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(f)
  }
  const pairs = []
  const runOf = new Map()
  let runs = 0
  for (const [, set] of groups) {
    set.sort((p, q) => p.d - q.d)
    let run = []
    const close = () => {
      for (const f of run) runOf.set(f, runs)
      runs++
      if (run.length > 1) {
        const by = new Map()
        for (const f of run) { if (!by.has(f.body)) by.set(f.body, []); by.get(f.body).push(f) }
        const names = [...by.keys()]
        // only pairs whose boxes in the run's plane overlap (sharedArea returns null for the rest), in the nested
        // loop's order; the cover only from faces whose box meets the pair's (a city's house feet share one run)
        const FB = planeBoxes(run, ...frameOf(run[0].n))
        const NB = new Float64Array(4 * names.length)
        for (let i = 0; i < names.length; i++) NB.set([Infinity, Infinity, -Infinity, -Infinity], 4 * i)
        const slot = new Map(names.map((b, i) => [b, i]))
        for (let t = 0; t < run.length; t++) {
          const o = 4 * slot.get(run[t].body)
          for (let k = 0; k < 2; k++) { NB[o + k] = Math.min(NB[o + k], FB[4 * t + k]); NB[o + 2 + k] = Math.max(NB[o + 2 + k], FB[4 * t + 2 + k]) }
        }
        const near = boxIndex(FB, run.length)
        for (const ij of overlapPairs(NB, names.length)) {
          const i = Math.floor(ij / names.length), j = ij - i * names.length
          const an = names[i], bn = names[j]
          if (!counts(an, bn)) continue
          const q = [Math.max(NB[4 * i], NB[4 * j]), Math.max(NB[4 * i + 1], NB[4 * j + 1]), Math.min(NB[4 * i + 2], NB[4 * j + 2]), Math.min(NB[4 * i + 3], NB[4 * j + 3])]
          for (const [fa, fb, k0] of [[1, 1, 'fight'], [-1, -1, 'fight'], [1, -1, 'butt'], [-1, 1, 'butt']]) {
            const sa = by.get(an).filter((f) => f.facing === fa), sb = by.get(bn).filter((f) => f.facing === fb)
            if (!sa.length || !sb.length) continue
            const kind = k0 === 'fight' && eyes.length && eyes.every((e) => fa * (run[0].n.dot(e) - run[0].d) < 0.001) ? 'unseen' : k0
            const cover = k0 === 'fight' ? near(q).filter((t) => run[t].facing === -fa && run[t].body !== an && run[t].body !== bn).sort((s, t) => s - t).map((t) => run[t]) : []
            const o = sharedArea(sa, sb, run[0].n, { cover, masked: masked ? (p) => masked(p, an, bn) : null, bedM: local ? bedM : Infinity, cellOf })
            if (!o || o.area < areaMin) continue
            const pts = [...sa, ...sb].flatMap((f) => f.v)
            const span = (k) => [+minOf(pts.map((p) => p[k])).toFixed(2), +maxOf(pts.map((p) => p[k])).toFixed(2)]
            pairs.push({ a: an, b: bn, kind, facing: fa, area: +o.area.toFixed(3), cell: o.cell, gapMm: o.gapMm, gapMinMm: o.gapMinMm, n: [run[0].n.x, run[0].n.y, run[0].n.z].map((c) => +c.toFixed(3)), d: +run[0].d.toFixed(3), x: span('x'), y: span('y'), z: span('z') })
          }
        }
      }
      run = []
    }
    for (const f of set) {
      if (run.length && f.d - run[0].d > bedM) close()
      run.push(f)
    }
    close()
  }
  if (across) pairs.push(...acrossRuns(faces, runOf, { bedM, areaMin, eyes, counts, masked, cellOf }))
  return pairs
}

const HASH_M = 4 // the search's cell, metres across a bucket's plane
const TILE_M = 64 // sharedArea's grid kept to tiles of this size
const WIDE = 4096, COARSE_M = 256 // a face over this many hash cells is hashed on the coarse grid instead

/** the pairs the runs never compare: two bodies' faces with normals within a hundredth, either way round, whose own
    planes come within the bed where they overlap, but which no run holds together: tilted against each other far
    from the origin (the offsets part them by the tilt times that distance), split at a run's edge (runs start at
    their first face), or on two sides of a hundredth's rounding. Each bucket of rounded normals is hashed in its own
    plane (a long wall is a strip there, not a box); a pair is measured only when the gap between the two planes, a
    linear function, comes within the bed at some corner of the box where their outlines overlap. A pair within the
    bed somewhere has such a point inside that box, so the bound cuts no true pair. */
/** the last search's size and time: face pairs kept by the bound, run pairs measured, grid tiles, milliseconds */
export const acrossCost = { pairs: 0, runPairs: 0, tiles: 0, ms: 0 }
function acrossRuns(faces, runOf, { bedM, areaMin, eyes, counts, masked, cellOf = null }) {
  const t0 = Date.now()
  const keyOf = (x, y, z) => ((x + 101) * 203 + (y + 101)) * 203 + (z + 101)
  const buckets = new Map()
  for (let i = 0; i < faces.length; i++) {
    const n = faces[i].n, k = keyOf(Math.round(n.x * 100), Math.round(n.y * 100), Math.round(n.z * 100))
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k).push(i)
  }
  const tol = bedM * 1.01 + 1e-7 // the gap along a neighbour's normal differs from it along n by under a percent
  const PI = [], PJ = [], PS = []
  // a face's outline box and plane height w = c0 + cu u + cv v in a frame (e1, e2, nB), 1 cm wider each way
  const place = (f, e1, e2, nB, out, o) => {
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity
    for (const q of f.v) { const u = q.dot(e1), v = q.dot(e2); if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v }
    const k = f.n.dot(nB)
    out[o] = u0 - 0.01; out[o + 1] = v0 - 0.01; out[o + 2] = u1 + 0.01; out[o + 3] = v1 + 0.01
    out[o + 4] = f.d / k; out[o + 5] = -f.n.dot(e1) / k; out[o + 6] = -f.n.dot(e2) / k
  }
  // i in A (box at a[o]), j in B (box at b[p]); the pair is kept when its normals agree and the planes come within the bed
  const test = (i, j, a, o, b, p, cu, cv) => {
    const f = faces[i], g = faces[j]
    if (f.body === g.body) return
    const U0 = Math.max(a[o], b[p]), V0 = Math.max(a[o + 1], b[p + 1]), U1 = Math.min(a[o + 2], b[p + 2]), V1 = Math.min(a[o + 3], b[p + 3])
    if (U1 < U0 || V1 < V0 || Math.floor(U0 / HASH_M) !== cu || Math.floor(V0 / HASH_M) !== cv) return
    const s = f.n.dot(g.n) < 0 ? -1 : 1
    if (Math.abs(f.n.x - s * g.n.x) > 0.01 || Math.abs(f.n.y - s * g.n.y) > 0.01 || Math.abs(f.n.z - s * g.n.z) > 0.01) return
    const c0 = b[p + 4] - a[o + 4], du = b[p + 5] - a[o + 5], dv = b[p + 6] - a[o + 6]
    let lo = Infinity, hi = -Infinity
    for (const u of [U0, U1]) for (const v of [V0, V1]) { const w = c0 + du * u + dv * v; if (w < lo) lo = w; if (w > hi) hi = w }
    if (lo > tol || hi < -tol) return
    PI.push(i); PJ.push(j); PS.push(s)
  }
  const OFF = 1 << 20, W = 1 << 21
  for (const [K, L] of buckets) {
    const kv = [Math.floor(K / 41209) - 101, (Math.floor(K / 203) % 203) - 101, (K % 203) - 101]
    const nB = new THREE.Vector3(...kv).normalize()
    const [e1, e2] = frameOf(nB)
    const box = new Float64Array(7 * L.length), run = new Int32Array(L.length), side = new Int8Array(L.length)
    const cells = new Map(), wide = []
    const span = (b, o, m) => (Math.floor(b[o + 2] / m) - Math.floor(b[o] / m) + 1) * (Math.floor(b[o + 3] / m) - Math.floor(b[o + 1] / m) + 1)
    for (let t = 0; t < L.length; t++) {
      run[t] = runOf.get(faces[L[t]]); side[t] = faces[L[t]].facing
      place(faces[L[t]], e1, e2, nB, box, 7 * t)
      if (span(box, 7 * t, HASH_M) > WIDE) { wide.push(t); continue }
      for (let cu = Math.floor(box[7 * t] / HASH_M); cu <= Math.floor(box[7 * t + 2] / HASH_M); cu++)
        for (let cv = Math.floor(box[7 * t + 1] / HASH_M); cv <= Math.floor(box[7 * t + 3] / HASH_M); cv++) {
          const c = (cu + OFF) * W + cv + OFF
          const list = cells.get(c)
          if (list) list.push(t); else cells.set(c, [t])
        }
    }
    // within the bucket: each pair once, in the cell holding its overlap's low corner
    for (const [c, list] of cells) {
      if (list.length < 2) continue
      const cu = Math.floor(c / W) - OFF, cv = (c % W) - OFF
      for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
        const p = list[x], q = list[y]
        // a run already compares its own faces; it holds a cover face only when that one looks the other way
        if (run[p] === run[q] && side[p] === side[q]) continue
        test(L[p], L[q], box, 7 * p, box, 7 * q, cu, cv)
      }
    }
    // the wide faces (a whole city's ground or water) on a coarse grid instead: each pair once, in the coarse cell
    // holding its overlap's low corner, and tested in the hash cell holding it, as above
    const coarse = (list) => {
      const g = new Map()
      for (const t of list) for (let cu = Math.floor(box[7 * t] / COARSE_M); cu <= Math.floor(box[7 * t + 2] / COARSE_M); cu++)
        for (let cv = Math.floor(box[7 * t + 1] / COARSE_M); cv <= Math.floor(box[7 * t + 3] / COARSE_M); cv++) {
          const c = (cu + OFF) * W + cv + OFF, l = g.get(c)
          if (l) l.push(t); else g.set(c, [t])
        }
      return g
    }
    let all = null
    const allOf = () => (all ??= coarse(Array.from({ length: L.length }, (_, t) => t)))
    const wideG = wide.length ? coarse(wide) : null
    const isWide = new Uint8Array(L.length)
    for (const t of wide) isWide[t] = 1
    // the pairs of `b` (at b[o]) with the listed faces whose low overlap corner lies in its coarse cells: (t, cu, cv)
    const meet = (g, b, o, fn) => {
      for (let CU = Math.floor(b[o] / COARSE_M); CU <= Math.floor(b[o + 2] / COARSE_M); CU++)
        for (let CV = Math.floor(b[o + 1] / COARSE_M); CV <= Math.floor(b[o + 3] / COARSE_M); CV++)
          for (const t of g.get((CU + OFF) * W + CV + OFF) ?? []) {
            const U0 = Math.max(box[7 * t], b[o]), V0 = Math.max(box[7 * t + 1], b[o + 1])
            if (Math.min(box[7 * t + 2], b[o + 2]) < U0 || Math.min(box[7 * t + 3], b[o + 3]) < V0) continue
            if (Math.floor(U0 / COARSE_M) !== CU || Math.floor(V0 / COARSE_M) !== CV) continue
            fn(t, Math.floor(U0 / HASH_M), Math.floor(V0 / HASH_M))
          }
    }
    for (const w of wide) meet(allOf(), box, 7 * w, (t, cu, cv) => {
      if (t === w || (isWide[t] && t < w) || (run[t] === run[w] && side[t] === side[w])) return
      const [p, q] = t < w ? [t, w] : [w, t]
      test(L[p], L[q], box, 7 * p, box, 7 * q, cu, cv)
    })
    // the neighbouring buckets (each bucket pair once), their faces placed in this bucket's frame
    const near = new Set()
    for (const sg of [1, -1]) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const q = [sg * kv[0] + dx, sg * kv[1] + dy, sg * kv[2] + dz]
      if (q.some((c) => Math.abs(c) > 101)) continue
      const K2 = keyOf(...q)
      if (K2 > K && buckets.has(K2)) near.add(K2)
    }
    const one = new Float64Array(7)
    for (const K2 of near) for (const j of buckets.get(K2)) {
      place(faces[j], e1, e2, nB, one, 0)
      if (span(one, 0, HASH_M) > WIDE) { meet(allOf(), one, 0, (t, cu, cv) => test(L[t], j, box, 7 * t, one, 0, cu, cv)); continue }
      for (let cu = Math.floor(one[0] / HASH_M); cu <= Math.floor(one[2] / HASH_M); cu++)
        for (let cv = Math.floor(one[1] / HASH_M); cv <= Math.floor(one[3] / HASH_M); cv++) {
          const list = cells.get((cu + OFF) * W + cv + OFF)
          if (list) for (const t of list) test(L[t], j, box, 7 * t, one, 0, cu, cv)
        }
      if (wideG) meet(wideG, one, 0, (t, cu, cv) => test(L[t], j, box, 7 * t, one, 0, cu, cv))
    }
  }
  // the kept pairs: those across two runs into run pairs; every kept pair is a neighbour for the cover faces
  const nbrs = new Map()
  const link = (i, j) => { const l = nbrs.get(i); if (l) l.push(j); else nbrs.set(i, [j]) }
  const combos = new Map()
  for (let p = 0; p < PI.length; p++) {
    let i = PI[p], j = PJ[p]
    const s = PS[p]
    link(i, j); link(j, i)
    let ri = runOf.get(faces[i]), rj = runOf.get(faces[j])
    if (ri === rj) continue
    if (ri > rj) { [i, j] = [j, i]; [ri, rj] = [rj, ri] }
    const A = faces[i].body, B = faces[j].body
    if (!counts(A, B)) continue
    const fa = faces[i].facing, fb = faces[j].facing * s
    const key = `${ri} ${rj} ${A} ${B} ${fa} ${fb}`
    const c = combos.get(key)
    if (c) c.pairs.push(i, j); else combos.set(key, { A, B, fa, fb, pairs: [i, j] })
  }
  const rows = new Map()
  let nTiles = 0
  for (const c of combos.values()) {
    const ia = [...new Set(c.pairs.filter((_, k) => k % 2 === 0))], ib = [...new Set(c.pairs.filter((_, k) => k % 2 === 1))]
    const n = faces[ia[0]].n, d = faces[ia[0]].d
    const k0 = c.fa === c.fb ? 'fight' : 'butt'
    const kind = k0 === 'fight' && eyes.length && eyes.every((e) => c.fa * (n.dot(e) - d) < 0.001) ? 'unseen' : k0
    const cover = []
    if (k0 === 'fight') {
      const seen = new Set()
      for (const i of ia) {
        const l = nbrs.get(i) ?? []
        for (let k = 0; k < l.length; k++) {
          const g = faces[l[k]]
          if (seen.has(l[k]) || g.body === c.A || g.body === c.B || g.facing * (g.n.dot(n) < 0 ? -1 : 1) !== -c.fa) continue
          seen.add(l[k]); cover.push(g)
        }
      }
    }
    // each kept pair's overlap box in sharedArea's frame; the grid runs per tile of those boxes, so no grid grows huge
    const [e1, e2] = frameOf(n)
    const fbox = new Map()
    const boxOf = (i) => { let r = fbox.get(i); if (!r) { r = [Infinity, Infinity, -Infinity, -Infinity]; for (const q of faces[i].v) { const u = q.dot(e1), v = q.dot(e2); r[0] = Math.min(r[0], u); r[1] = Math.min(r[1], v); r[2] = Math.max(r[2], u); r[3] = Math.max(r[3], v) } fbox.set(i, r) } return r }
    const tiles = new Map()
    for (let k = 0; k < c.pairs.length; k += 2) {
      const a = boxOf(c.pairs[k]), b = boxOf(c.pairs[k + 1])
      const o = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]
      if (o[2] < o[0] || o[3] < o[1]) continue
      for (let tu = Math.floor(o[0] / TILE_M); tu <= Math.floor(o[2] / TILE_M); tu++) for (let tv = Math.floor(o[1] / TILE_M); tv <= Math.floor(o[3] / TILE_M); tv++) {
        const t = `${tu} ${tv}`
        if (!tiles.has(t)) tiles.set(t, { tu, tv, a: new Set(), b: new Set() })
        tiles.get(t).a.add(c.pairs[k]); tiles.get(t).b.add(c.pairs[k + 1])
      }
    }
    let area = 0, least = Infinity, cell = 0, best = 0
    const gaps = [], where = []
    for (const t of tiles.values()) {
      nTiles++
      const clip = [t.tu * TILE_M, t.tv * TILE_M, (t.tu + 1) * TILE_M, (t.tv + 1) * TILE_M]
      const o = sharedArea([...t.a].map((i) => faces[i]), [...t.b].map((i) => faces[i]), n, { cover, coverBedM: bedM, masked: masked ? (p) => masked(p, c.A, c.B) : null, bedM, clip, keepGaps: true, cellOf })
      if (!o) continue
      if (o.gapMinMm !== null && o.gapMinMm < least) least = o.gapMinMm
      if (o.area > 0) { area += o.area; gaps.push(o.gaps); where.push(...o.where); if (o.area > best) { best = o.area; cell = o.cell } }
    }
    if (area <= 0) continue
    // one row per body pair, kind and side: bodies by name, the side the first one's faces look
    const swap = c.B < c.A
    const P = swap ? c.B : c.A, Q = swap ? c.A : c.B, side = swap ? c.fb : c.fa
    const key = `${P}|${Q}|${kind}|${side}`
    const r = rows.get(key) ?? { a: P, b: Q, kind, facing: side, area: 0, least: Infinity, gaps: [], where: [], faces: new Set(), best: 0, runs: 0 }
    r.area += area; r.least = Math.min(r.least, least); r.gaps.push(...gaps); r.where.push(...where); r.runs++
    for (const i of [...ia, ...ib]) r.faces.add(i)
    if (area > r.best) Object.assign(r, { best: area, cell, n, d })
    rows.set(key, r)
  }
  const out = []
  for (const r of rows.values()) {
    if (r.area < areaMin) continue
    // the gap: the median over every counted cell of every run pair and tile
    const all = new Float32Array(r.gaps.reduce((s, g) => s + g.length, 0))
    let at = 0
    for (const g of r.gaps) { all.set(g, at); at += g.length }
    const gapMm = +(nth(all, all.length, (all.length - 1) >> 1) * 1000).toFixed(1)
    const pts = [...r.faces].flatMap((i) => faces[i].v)
    const span = (k) => [+minOf(pts.map((p) => p[k])).toFixed(2), +maxOf(pts.map((p) => p[k])).toFixed(2)]
    // where it fights: the box of the counted cells, scene metres
    const box = (k) => [+minOf(r.where.map((p) => p[k])).toFixed(2), +maxOf(r.where.map((p) => p[k])).toFixed(2)]
    out.push({ a: r.a, b: r.b, kind: r.kind, facing: r.facing, area: +r.area.toFixed(3), cell: r.cell, gapMm, gapMinMm: r.least === Infinity ? null : r.least, n: [r.n.x, r.n.y, r.n.z].map((c) => +c.toFixed(3)), d: +r.d.toFixed(3), x: span('x'), y: span('y'), z: span('z'), across: r.runs, where: { x: box('x'), y: box('y'), z: box('z') } })
  }
  Object.assign(acrossCost, { pairs: PI.length, runPairs: combos.size, tiles: nTiles, ms: Date.now() - t0 })
  return out
}

/** a still's camera: eye, look, the vertical field fitted as the page fits it, device pixels, the lens shift */
export function cameraFrom({ name, eye, look, vfov, w, h, shift = 0 }) {
  const e = new THREE.Vector3(...eye), l = new THREE.Vector3(...look)
  const forward = l.clone().sub(e).normalize()
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
  const up = new THREE.Vector3().crossVectors(right, forward).normalize()
  const half = Math.tan((vfov * D2R) / 2)
  return { name, eye: e, forward, right, up, w, h, half, aspect: w / h, shift, reach: h / (2 * half) }
}
/** the vertical field for a horizontal one at a size: keep the width, unless the authored frame asks to keep its height */
export function fittedFov(hfov, w, h, authored = null) {
  const vKeepH = 2 * Math.atan(Math.tan((hfov / 2) * D2R) * (h / w))
  if (!authored) return vKeepH / D2R
  const vAuth = 2 * Math.atan(Math.tan((hfov / 2) * D2R) * (authored[1] / authored[0]))
  return (w / h >= authored[0] / authored[1] ? vKeepH : Math.max(vKeepH, vAuth)) / D2R
}
/** a sharedArea cell at the cameras' pixel scale: 1/perPx of a device pixel where the box comes nearest to an eye, by
    the finest of the cameras (their pixel at the frame's centre); `used` keeps the least and the most it gave */
export function pixelCell(cameras, { perPx = 4 } = {}) {
  const used = { calls: 0, least: Infinity, most: 0 }
  const cellOf = (box, e1, e2, n, d0) => {
    let c = Infinity
    for (const e of cameras) {
      const u = e.eye.dot(e1), v = e.eye.dot(e2)
      const du = Math.max(box[0] - u, 0, u - box[2]), dv = Math.max(box[1] - v, 0, v - box[3]), dn = e.eye.dot(n) - d0
      c = Math.min(c, Math.hypot(du, dv, dn) / (e.reach * perPx))
    }
    used.calls++; used.least = Math.min(used.least, c); used.most = Math.max(used.most, c)
    return c
  }
  return { cellOf, used, perPx }
}
/** whether a face can show in any of the cameras: it is dropped only where all three corners lie past one side of a
    camera's frustum (onStage's frame, `margin` times each half width; the near side at 0.25 m), for every camera */
export function frameKeep(cameras, { margin = 1.1 } = {}) {
  const to = new THREE.Vector3()
  const past = (f, e) => {
    let near = 0, right = 0, left = 0, top = 0, bottom = 0
    for (const p of f.v) {
      to.subVectors(p, e.eye)
      const d = to.dot(e.forward), x = to.dot(e.right), y = to.dot(e.up), w = margin * e.half * e.aspect * d
      if (d <= 0.25) near++
      if (x > w) right++
      if (x < -w) left++
      if (y > (e.shift + margin) * e.half * d) top++
      if (y < (e.shift - margin) * e.half * d) bottom++
    }
    return near === 3 || right === 3 || left === 3 || top === 3 || bottom === 3
  }
  return (f) => cameras.some((e) => !past(f, e))
}
function onStage(e, p) {
  const to = p.clone().sub(e.eye)
  const depth = to.dot(e.forward)
  if (depth <= 0.25) return null
  const ny = to.dot(e.up) / depth / e.half - e.shift, nx = to.dot(e.right) / depth / e.half / e.aspect
  return { x: (nx * e.w) / 2, y: (ny * e.h) / 2, depth, inside: Math.abs(nx) <= 1.1 && Math.abs(ny) <= 1.1 }
}
function altitude(v) {
  let longest = 0, at = 0
  for (let i = 0; i < 3; i++) { const l = v[(i + 1) % 3].distanceTo(v[i]); if (l > longest) { longest = l; at = i } }
  const a = v[at], b = v[(at + 1) % 3], c = v[(at + 2) % 3]
  const axis = b.clone().sub(a)
  const t = axis.lengthSq() > 0 ? c.clone().sub(a).dot(axis) / axis.lengthSq() : 0
  const foot = a.clone().addScaledVector(axis, t)
  return { foot, top: c, along: [a, b], thick: foot.distanceTo(c) }
}

/** faces thinner than one device pixel over a run of at least runPx, per body and camera. A sliver of a triangulated
    surface is not a thin surface: where the same body's face (turned under 30 degrees) or a face in the same plane
    goes on across its long edge, it is set aside. `checks(body)` says which bodies are this check's. */
export function subPixel(faces, cameras, { runPx = 4, facing = 0.15, thickCap = 0.5, checks = () => true } = {}) {
  const mine = faces.filter((f) => checks(f.body))
  const vkey = (v) => `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`
  const ekey = (a, b) => { const p = vkey(a), q = vkey(b); return p < q ? `${p}|${q}` : `${q}|${p}` }
  const pkey = (f) => `${[f.n.x, f.n.y, f.n.z].map((c) => (Math.round(c * 1000) / 1000).toFixed(3)).join(',')}|${Math.round(f.d * 1000)}`
  const edges = new Map(), planes = new Map()
  for (const f of mine) {
    for (let i = 0; i < 3; i++) { const k = ekey(f.v[i], f.v[(i + 1) % 3]); if (!edges.has(k)) edges.set(k, []); edges.get(k).push(f) }
    const k = pkey(f)
    if (!planes.has(k)) planes.set(k, [])
    planes.get(k).push(f)
  }
  const inTri = (p, f) => {
    const [a, b, c] = f.v
    const v0 = c.clone().sub(a), v1 = b.clone().sub(a), v2 = p.clone().sub(a)
    const d00 = v0.dot(v0), d01 = v0.dot(v1), d02 = v0.dot(v2), d11 = v1.dot(v1), d12 = v1.dot(v2)
    const inv = 1 / (d00 * d11 - d01 * d01)
    const u = (d11 * d02 - d01 * d12) * inv, w = (d00 * d12 - d01 * d02) * inv
    return u >= -1e-6 && w >= -1e-6 && u + w <= 1 + 1e-6 && Math.abs(p.clone().sub(a).dot(f.n)) < 2e-4
  }
  const goesOn = (f, foot, top, along) => {
    const across = edges.get(ekey(along[0], along[1])) ?? []
    // a neighbour turned up to 30 degrees continues a curved surface; a neighbour in the same plane only counts where
    // the probe lands in it, so a thin quad split on its diagonal is not taken for a sliver of a larger plane
    if (across.some((g) => g !== f && g.body === f.body && g.n.dot(f.n) > 0.866 && g.n.dot(f.n) < 0.99999)) return true
    const probe = along[0].clone().add(along[1]).multiplyScalar(0.5).addScaledVector(foot.clone().sub(top).normalize(), 0.002)
    return (planes.get(pkey(f)) ?? []).some((g) => g !== f && inTri(probe, g))
  }
  let slivers = 0
  const thin = new Map()
  for (const f of mine) {
    const { foot, top, along, thick } = altitude(f.v)
    if (!(thick > 1e-4) || thick >= thickCap) continue
    if (goesOn(f, foot, top, along)) { slivers++; continue }
    const centre = foot.clone().add(top).multiplyScalar(0.5)
    for (const e of cameras) {
      if (centre.distanceTo(e.eye) < e.reach * thick) continue
      if (Math.abs(e.eye.clone().sub(centre).normalize().dot(f.n)) < facing) continue
      const a = onStage(e, foot), b = onStage(e, top)
      if (!a || !b || !a.inside) continue
      const px = Math.hypot(a.x - b.x, a.y - b.y)
      if (px >= 1) continue
      const p = onStage(e, along[0]), q = onStage(e, along[1])
      if (!p || !q) continue
      const run = Math.hypot(p.x - q.x, p.y - q.y)
      if (run < runPx) continue
      const body = f.body.replace(/#.*/, '')
      const key = `${body}|${e.name}`
      const row = thin.get(key) ?? { body, camera: e.name, faces: 0, thinnestPx: 9, thickM: 0, atM: 0, runPx: 0 }
      row.faces++
      if (px < row.thinnestPx) Object.assign(row, { thinnestPx: +px.toFixed(3), thickM: +thick.toFixed(4), atM: +a.depth.toFixed(1), runPx: Math.round(run), where: f.v.map((q) => [q.x, q.y, q.z].map((c) => +c.toFixed(3))) })
      thin.set(key, row)
    }
  }
  return { slivers, rows: [...thin.values()].sort((a, b) => a.thinnestPx - b.thinnestPx) }
}

/** the map's support rule on triangles: a body whose foot is near the ground reaches it (`ground(x, z)` + tol) under
    each base corner (its lowest vertices' outline); a raised body is held at its base's centre by another body: an
    upward face at most `carry` under it, or the centre inside that body (a stage sunk into the one below); a span
    (beam, lintel, roof slab) is held when corners at least half its length apart are. A body sunk into the ground
    is supported. `checks(body)` says which bodies are this check's. */
export function floating(faces, { ground, tol = 0.01, carry = 0.5, checks = () => true } = {}) {
  const byBody = new Map()
  for (const f of faces) { if (!byBody.has(f.body)) byBody.set(f.body, []); byBody.get(f.body).push(f) }
  const tops = faces.filter((f) => f.facing > 0 && f.n.y > 0.9)
  const lowest = new Map()
  for (const [b, set] of byBody) lowest.set(b, minOf(set.flatMap((f) => f.v.map((p) => p.y))))
  const holds = (x, z, y0, self) => tops.some((f) => {
    if (f.body === self) return false
    const [a, b, c] = f.v
    const s = (p, q) => (q.x - p.x) * (z - p.z) - (q.z - p.z) * (x - p.x)
    const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a)
    if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) return false
    const y = (f.d - f.n.x * x - f.n.z * z) / f.n.y
    // a top just under the corner carries it; a top above it carries it when the corner sits inside that body
    return y >= y0 - carry && (y <= y0 + tol || lowest.get(f.body) <= y0 + tol)
  })
  // a span (a beam, a lintel, a roof slab) rests on its ends: held corners at least half its length apart
  const spans = (qs, y0, self) => {
    const held = qs.filter((q) => holds(q.x, q.z, y0, self))
    const far = (ps) => { let m = 0; for (const a of ps) for (const b of ps) m = Math.max(m, Math.hypot(a.x - b.x, a.z - b.z)); return m }
    return held.length >= 2 && far(held) >= 0.5 * far(qs)
  }
  const rows = []
  for (const [body, set] of byBody) {
    if (!checks(body)) continue
    const pts = set.flatMap((f) => f.v)
    const y0 = minOf(pts.map((p) => p.y))
    const base = pts.filter((p) => p.y <= y0 + 0.02)
    // the outline's corners: the extremes along eight directions in plan
    const corners = []
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4, dx = Math.cos(a), dz = Math.sin(a)
      let best = null, bv = -Infinity
      for (const p of base) { const v = p.x * dx + p.z * dz; if (v > bv) { bv = v; best = p } }
      if (best && !corners.some((c) => c.distanceTo(best) < 1e-3)) corners.push(best)
    }
    // the map's rule (scale-check 12): a body whose foot lies within `carry` of the ground under its corners is
    // grounded and must reach the ground under each corner; a body standing higher must stand on another body at
    // its base's centre (an overhang, a coping or a cornice past the edge, is held by its centre)
    const ctr = base.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(base.length)
    const gaps = corners.map((c) => { const q = c.clone().lerp(ctr, 0.01); return { q, gap: y0 - ground(q.x, q.z) } })
    const lowGround = Math.min(...gaps.map((g) => g.gap))
    let worst = null
    if (lowGround <= carry) {
      for (const { q, gap } of gaps) {
        if (gap <= tol || holds(q.x, q.z, y0, body)) continue
        if (!worst || gap > worst.gapM) worst = { gapM: +gap.toFixed(3), at: [q.x, q.z].map((v) => +v.toFixed(2)), rule: 'grounded: a corner over the ground' }
      }
    } else if (!holds(ctr.x, ctr.z, y0, body) && !spans(gaps.map((g) => g.q), y0, body)) {
      worst = { gapM: +(y0 - ground(ctr.x, ctr.z)).toFixed(3), at: [ctr.x, ctr.z].map((v) => +v.toFixed(2)), rule: 'raised: nothing under its centre' }
    }
    if (worst) rows.push({ body, baseY: +y0.toFixed(3), ...worst })
  }
  return rows.sort((a, b) => b.gapM - a.gapM)
}
