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

/** the shared area of two face sets in one plane, on a grid; `cover` faces (a third body's, looking the other way)
    close the cells they lie on; `masked(point)` drops a cell the page hides. A cell counts only where the two sets'
    own planes lie within `bedM` of each other along `n` there (the local gap): a plane's offset from the origin
    matches a long, slightly tilted face to a level one far above it. `gapMm` is the local gap's median over the
    counted cells, `gapMinMm` its least over every shared cell; `overlap` and `overlapGapMm` the area and median of
    every shared cell, counted or not. */
export function sharedArea(a, b, n, { cover = [], masked = null, bedM = Infinity } = {}) {
  const helper = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const e1 = new THREE.Vector3().crossVectors(n, helper).normalize()
  const e2 = new THREE.Vector3().crossVectors(n, e1)
  const flat = (set) => set.map((f) => f.v.map((q) => [q.dot(e1), q.dot(e2)]))
  const FA = flat(a), FB = flat(b), FC = flat(cover)
  const d0 = a[0].d
  // a face's height over the plane `d0` along n at (u, v): t = c - pu * u - pv * v, from its own normal and offset
  const height = (set) => set.map((f) => { const k = f.n.dot(n); return [f.n.dot(e1) / k, f.n.dot(e2) / k, f.d / k - d0] })
  const HA = height(a), HB = height(b)
  const bb = (F) => { const p = F.flat(); return [minOf(p.map((x) => x[0])), minOf(p.map((x) => x[1])), maxOf(p.map((x) => x[0])), maxOf(p.map((x) => x[1]))] }
  const ba = bb(FA), bq = bb(FB)
  const box = [Math.max(ba[0], bq[0]), Math.max(ba[1], bq[1]), Math.min(ba[2], bq[2]), Math.min(ba[3], bq[3])]
  if (box[2] <= box[0] || box[3] <= box[1]) return null
  const CELL = Math.min(0.05, Math.max(0.01, Math.sqrt(((box[2] - box[0]) * (box[3] - box[1])) / 2e6)))
  // samples off the cell's middle: two bodies meeting edge to edge share an edge at a whole or half cell from the corner
  const F = 0.537
  const cols = Math.ceil((box[2] - box[0]) / CELL) + 1, rows = Math.ceil((box[3] - box[1]) / CELL) + 1
  const grid = new Uint8Array(cols * rows)
  // per cell: the lowest and highest of a's heights, then the least gap from any of b's faces to either of them
  // (exact where a lays at most two faces on a cell)
  const aLo = new Float32Array(cols * rows), aHi = new Float32Array(cols * rows), gap = new Float32Array(cols * rows).fill(Infinity)
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
          gap[k] = Math.min(gap[k], Math.abs(y - aLo[k]), Math.abs(y - aHi[k]))
        }
        grid[k] |= bit
      }
    }
  }
  paint(FA, 1, HA)
  paint(FB, 2, HB)
  paint(FC, 4)
  const shared = []
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (grid[j * cols + i] !== 3) continue
    if (masked) {
      const p = e1.clone().multiplyScalar(box[0] + (i + F) * CELL).addScaledVector(e2, box[1] + (j + F) * CELL).addScaledVector(n, d0)
      if (masked(p)) continue
    }
    shared.push(gap[j * cols + i])
  }
  const gaps = Float32Array.from(shared).sort()
  let both = 0
  while (both < gaps.length && gaps[both] <= bedM) both++
  const mm = (x) => (x === undefined ? null : +(x * 1000).toFixed(1))
  return {
    area: both * CELL * CELL, cell: +CELL.toFixed(3), gapMm: mm(gaps[(both - 1) >> 1]), gapMinMm: mm(gaps[0]),
    overlap: +(gaps.length * CELL * CELL).toFixed(3), overlapGapMm: mm(gaps[(gaps.length - 1) >> 1]),
  }
}

/** pairs of bodies sharing a plane (normal to a hundredth, offsets within the bed) and some area where their own
    planes lie within the bed of each other (sharedArea's local gap; `local: false` counts every shared cell, as
    before the local gap). kinds: fight (both look one way), butt (opposite ways: two closed bodies face to face),
    unseen (a fight every eye stands behind). `counts(a, b)` says whether a pair is this check's to report. */
export function coplanar(faces, { bedM = 0.002, areaMin = 0.01, eyes = [], counts = () => true, masked = null, local = true } = {}) {
  const groups = new Map()
  for (const f of faces) {
    const key = [f.n.x, f.n.y, f.n.z].map((c) => (Math.round(c * 100) / 100).toFixed(2)).join(',')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(f)
  }
  const pairs = []
  for (const [, set] of groups) {
    set.sort((p, q) => p.d - q.d)
    let run = []
    const close = () => {
      if (run.length > 1) {
        const by = new Map()
        for (const f of run) { if (!by.has(f.body)) by.set(f.body, []); by.get(f.body).push(f) }
        const names = [...by.keys()]
        for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
          const an = names[i], bn = names[j]
          if (!counts(an, bn)) continue
          for (const [fa, fb, k0] of [[1, 1, 'fight'], [-1, -1, 'fight'], [1, -1, 'butt'], [-1, 1, 'butt']]) {
            const sa = by.get(an).filter((f) => f.facing === fa), sb = by.get(bn).filter((f) => f.facing === fb)
            if (!sa.length || !sb.length) continue
            const kind = k0 === 'fight' && eyes.length && eyes.every((e) => fa * (run[0].n.dot(e) - run[0].d) < 0.001) ? 'unseen' : k0
            const cover = k0 === 'fight' ? run.filter((f) => f.facing === -fa && f.body !== an && f.body !== bn) : []
            const o = sharedArea(sa, sb, run[0].n, { cover, masked: masked ? (p) => masked(p, an, bn) : null, bedM: local ? bedM : Infinity })
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
  return pairs
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
