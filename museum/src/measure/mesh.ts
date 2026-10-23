/* THE MEASURE'S MESH: surface nets over the compiled field, then a quadric
   reduction to a few thousand triangles, then every kept vertex pulled back
   onto the field with the field's own gradient as its normal.

   The nets and the Newton pull are the animals' kit mesher (mesh.ts) without
   its slabs, baked occlusion and attributes: the scene's own occlusion pass
   shades the figure, so nothing dark is printed into it. */

import type { Compiled } from './field'

export interface Surface {
  pos: Float32Array
  nrm: Float32Array
  idx: Uint32Array
}

const B = 8

/** sparse surface nets at `h` metres: a block of eight cells whose centre is farther from the surface than its reach is never sampled */
export function nets(c: Compiled, h: number, refine = 2): Surface {
  const f = c.f
  const pad = 2 * h
  const ox = c.box.min[0] - pad
  const oy = c.box.min[1] - pad
  const oz = c.box.min[2] - pad
  const ncx = Math.max(1, Math.ceil((c.box.max[0] + pad - ox) / h))
  const ncy = Math.max(1, Math.ceil((c.box.max[1] + pad - oy) / h))
  const ncz = Math.max(1, Math.ceil((c.box.max[2] + pad - oz) / h))
  const nbx = Math.ceil(ncx / B)
  const nby = Math.ceil(ncy / B)
  const nbz = Math.ceil(ncz / B)
  const S = B + 1
  interface Block {
    bi: number
    bj: number
    bk: number
    v: Float32Array
    cell: Int32Array
  }
  const blocks = new Map<number, Block>()
  const bkey = (bi: number, bj: number, bk: number): number => bi + nbx * (bj + nby * bk)
  const reach = 0.866 * B * h * 1.35 + h
  for (let bk = 0; bk < nbz; bk++)
    for (let bj = 0; bj < nby; bj++)
      for (let bi = 0; bi < nbx; bi++) {
        const cx = ox + (bi * B + B / 2) * h
        const cy = oy + (bj * B + B / 2) * h
        const cz = oz + (bk * B + B / 2) * h
        if (Math.abs(f(cx, cy, cz)) > reach) continue
        const v = new Float32Array(S * S * S)
        let neg = false
        let pos = false
        for (let k = 0; k < S; k++)
          for (let j = 0; j < S; j++)
            for (let i = 0; i < S; i++) {
              const d = f(ox + (bi * B + i) * h, oy + (bj * B + j) * h, oz + (bk * B + k) * h)
              v[i + S * (j + S * k)] = d
              if (d < 0) neg = true
              else pos = true
            }
        if (!(neg && pos)) continue
        blocks.set(bkey(bi, bj, bk), { bi, bj, bk, v, cell: new Int32Array(B * B * B).fill(-1) })
      }

  // vertices: one per cell whose corners disagree, at the mean of its edge crossings
  const P: number[] = []
  const corner = new Float32Array(8)
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ] as const
  for (const b of blocks.values()) {
    const v = b.v
    for (let k = 0; k < B; k++)
      for (let j = 0; j < B; j++)
        for (let i = 0; i < B; i++) {
          let mask = 0
          for (let c8 = 0; c8 < 8; c8++) {
            const d = v[i + (c8 & 1) + S * (j + ((c8 >> 1) & 1) + S * (k + ((c8 >> 2) & 1)))]!
            corner[c8] = d
            if (d < 0) mask |= 1 << c8
          }
          if (mask === 0 || mask === 255) continue
          let sx = 0
          let sy = 0
          let sz = 0
          let n = 0
          for (const [a, e] of EDGES) {
            const da = corner[a]!
            const de = corner[e]!
            if (da < 0 === de < 0) continue
            const t = da / (da - de)
            const ax = a & 1
            const ay = (a >> 1) & 1
            const az = (a >> 2) & 1
            sx += ax + ((e & 1) - ax) * t
            sy += ay + (((e >> 1) & 1) - ay) * t
            sz += az + (((e >> 2) & 1) - az) * t
            n++
          }
          b.cell[i + B * (j + B * k)] = P.length / 3
          P.push(ox + (b.bi * B + i + sx / n) * h, oy + (b.bj * B + j + sy / n) * h, oz + (b.bk * B + k + sz / n) * h)
        }
  }
  const cellVert = (gi: number, gj: number, gk: number): number => {
    if (gi < 0 || gj < 0 || gk < 0) return -1
    const bi = Math.floor(gi / B)
    const bj = Math.floor(gj / B)
    const bk = Math.floor(gk / B)
    const b = blocks.get(bkey(bi, bj, bk))
    if (!b) return -1
    return b.cell[gi - bi * B + B * (gj - bj * B + B * (gk - bk * B))]!
  }
  // faces: one quad around every edge whose ends disagree, split along the shorter diagonal
  const I: number[] = []
  const quad = (a: number, b: number, c: number, d: number, flip: boolean): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (flip) {
      const t = b
      b = d
      d = t
    }
    if (dist2(P, a, c) <= dist2(P, b, d)) I.push(a, b, c, a, c, d)
    else I.push(a, b, d, b, c, d)
  }
  for (const b of blocks.values()) {
    const v = b.v
    for (let k = 0; k < B; k++)
      for (let j = 0; j < B; j++)
        for (let i = 0; i < B; i++) {
          const gi = b.bi * B + i
          const gj = b.bj * B + j
          const gk = b.bk * B + k
          const d0 = v[i + S * (j + S * k)]!
          const dx = v[i + 1 + S * (j + S * k)]!
          if (d0 < 0 !== dx < 0) quad(cellVert(gi, gj - 1, gk - 1), cellVert(gi, gj, gk - 1), cellVert(gi, gj, gk), cellVert(gi, gj - 1, gk), !(d0 < 0))
          const dy = v[i + S * (j + 1 + S * k)]!
          if (d0 < 0 !== dy < 0) quad(cellVert(gi - 1, gj, gk - 1), cellVert(gi - 1, gj, gk), cellVert(gi, gj, gk), cellVert(gi, gj, gk - 1), !(d0 < 0))
          const dz = v[i + S * (j + S * (k + 1))]!
          if (d0 < 0 !== dz < 0) quad(cellVert(gi - 1, gj - 1, gk), cellVert(gi, gj - 1, gk), cellVert(gi, gj, gk), cellVert(gi - 1, gj, gk), !(d0 < 0))
        }
  }
  const pos = new Float32Array(P)
  const nrm = new Float32Array(pos.length)
  pull(c, pos, nrm, h, refine)
  return { pos, nrm, idx: new Uint32Array(I) }
}

/** Newton steps onto the surface, never farther than `reach`, and the field's gradient as the normal */
export function pull(c: Compiled, pos: Float32Array, nrm: Float32Array, reach: number, steps = 2): void {
  const f = c.f
  const e = Math.min(reach * 0.35, 0.002)
  for (let q = 0; q < pos.length / 3; q++) {
    let x = pos[3 * q]!
    let y = pos[3 * q + 1]!
    let z = pos[3 * q + 2]!
    const x0 = x
    const y0 = y
    const z0 = z
    let gx = 0
    let gy = 0
    let gz = 1
    for (let s = 0; s <= steps; s++) {
      gx = f(x + e, y, z) - f(x - e, y, z)
      gy = f(x, y + e, z) - f(x, y - e, z)
      gz = f(x, y, z + e) - f(x, y, z - e)
      const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1
      gx /= gl
      gy /= gl
      gz /= gl
      if (s === steps) break
      const d = f(x, y, z)
      x -= gx * d
      y -= gy * d
      z -= gz * d
      const mx = x - x0
      const my = y - y0
      const mz = z - z0
      const m = Math.sqrt(mx * mx + my * my + mz * mz)
      if (m > reach) {
        x = x0 + (mx / m) * reach
        y = y0 + (my / m) * reach
        z = z0 + (mz / m) * reach
      }
    }
    pos[3 * q] = x
    pos[3 * q + 1] = y
    pos[3 * q + 2] = z
    nrm[3 * q] = gx
    nrm[3 * q + 1] = gy
    nrm[3 * q + 2] = gz
  }
}

function dist2(P: ArrayLike<number>, a: number, b: number): number {
  const dx = P[3 * a]! - P[3 * b]!
  const dy = P[3 * a + 1]! - P[3 * b + 1]!
  const dz = P[3 * a + 2]! - P[3 * b + 2]!
  return dx * dx + dy * dy + dz * dz
}

/* THE REDUCTION: edge collapses in the order of the quadric error (Garland
   and Heckbert 1997), each to the point that minimises the summed planes of
   both ends. A collapse that would flip a face, sliver it, or pinch the
   surface (the two ends sharing more than the edge's own two neighbours)
   is refused. `pinned` vertices never move: the crown keeps its height. */
export function reduce(src: Surface, target: number, pinned: Set<number> = new Set()): Surface {
  const nv = src.pos.length / 3
  const P = Float64Array.from(src.pos)
  const tri = Int32Array.from(src.idx)
  const nt = tri.length / 3
  const alive = new Uint8Array(nt).fill(1)
  let faces = nt
  const Q = new Float64Array(nv * 10)
  const vf: number[][] = Array.from({ length: nv }, () => [])
  for (let t = 0; t < nt; t++) {
    const a = tri[3 * t]!
    const b = tri[3 * t + 1]!
    const c = tri[3 * t + 2]!
    if (a === b || b === c || a === c) {
      alive[t] = 0
      faces--
      continue
    }
    vf[a]!.push(t)
    vf[b]!.push(t)
    vf[c]!.push(t)
    const [nx, ny, nz, area] = faceNormal(P, a, b, c)
    if (area <= 0) continue
    const d = -(nx * P[3 * a]! + ny * P[3 * a + 1]! + nz * P[3 * a + 2]!)
    const k = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d]
    for (const v of [a, b, c]) for (let i = 0; i < 10; i++) Q[v * 10 + i] = Q[v * 10 + i]! + k[i]! * area
  }
  const version = new Uint32Array(nv)
  const gone = new Uint8Array(nv)
  // a binary heap of [cost, a, b, version a, version b, x, y, z]
  const heap: Array<[number, number, number, number, number, number, number, number]> = []
  const push = (e: (typeof heap)[number]): void => {
    heap.push(e)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p]![0] <= heap[i]![0]) break
      ;[heap[p], heap[i]] = [heap[i]!, heap[p]!]
      i = p
    }
  }
  const pop = (): (typeof heap)[number] | undefined => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length && last) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i]!, heap[m]!]
        i = m
      }
    }
    return top
  }
  const qerr = (q: Float64Array, o: number, x: number, y: number, z: number): number =>
    q[o]! * x * x + 2 * q[o + 1]! * x * y + 2 * q[o + 2]! * x * z + 2 * q[o + 3]! * x + q[o + 4]! * y * y + 2 * q[o + 5]! * y * z + 2 * q[o + 6]! * y + q[o + 7]! * z * z + 2 * q[o + 8]! * z + q[o + 9]!
  const sum = new Float64Array(10)
  const plan = (a: number, b: number): void => {
    if (pinned.has(a) && pinned.has(b)) return
    for (let i = 0; i < 10; i++) sum[i] = Q[a * 10 + i]! + Q[b * 10 + i]!
    let x: number
    let y: number
    let z: number
    if (pinned.has(a) || pinned.has(b)) {
      const v = pinned.has(a) ? a : b
      x = P[3 * v]!
      y = P[3 * v + 1]!
      z = P[3 * v + 2]!
    } else {
      const s = solve(sum)
      const mx = (P[3 * a]! + P[3 * b]!) / 2
      const my = (P[3 * a + 1]! + P[3 * b + 1]!) / 2
      const mz = (P[3 * a + 2]! + P[3 * b + 2]!) / 2
      // the optimum, unless the planes are near parallel; then the best of the ends and the middle
      const len = Math.sqrt(dist2(P, a, b))
      if (s && Math.hypot(s[0] - mx, s[1] - my, s[2] - mz) < len * 2) [x, y, z] = s
      else {
        const cands: V[] = [[P[3 * a]!, P[3 * a + 1]!, P[3 * a + 2]!], [P[3 * b]!, P[3 * b + 1]!, P[3 * b + 2]!], [mx, my, mz]]
        let best = cands[0]!
        for (const c of cands) if (qerr(sum, 0, ...c) < qerr(sum, 0, ...best)) best = c
        ;[x, y, z] = best
      }
    }
    push([Math.max(0, qerr(sum, 0, x, y, z)), a, b, version[a]!, version[b]!, x, y, z])
  }
  const edgesOf = (v: number): Set<number> => {
    const out = new Set<number>()
    for (const t of vf[v]!) {
      if (!alive[t]) continue
      for (let k = 0; k < 3; k++) {
        const w = tri[3 * t + k]!
        if (w !== v) out.add(w)
      }
    }
    return out
  }
  for (let v = 0; v < nv; v++) for (const w of edgesOf(v)) if (v < w) plan(v, w)

  while (faces > target && heap.length) {
    const [, a, b, va, vb, x, y, z] = pop()!
    if (gone[a] || gone[b] || version[a] !== va || version[b] !== vb) continue
    // keep the pinned end; the other one goes
    const keep = pinned.has(b) ? b : a
    const drop = keep === a ? b : a
    const na = edgesOf(keep)
    if (!na.has(drop)) continue
    const nb = edgesOf(drop)
    // the link condition: the two ends share exactly the two vertices across the edge
    let shared = 0
    for (const w of nb) if (na.has(w)) shared++
    if (shared !== 2) continue
    // no face around either end may flip or collapse to a sliver at the new point
    let ok = true
    for (const v of [keep, drop]) {
      for (const t of vf[v]!) {
        if (!alive[t]) continue
        const ids = [tri[3 * t]!, tri[3 * t + 1]!, tri[3 * t + 2]!]
        if (ids.includes(keep) && ids.includes(drop)) continue
        const [n0x, n0y, n0z, a0] = faceNormal(P, ids[0]!, ids[1]!, ids[2]!)
        const save = [P[3 * v]!, P[3 * v + 1]!, P[3 * v + 2]!]
        P[3 * v] = x
        P[3 * v + 1] = y
        P[3 * v + 2] = z
        const [n1x, n1y, n1z, a1] = faceNormal(P, ids[0]!, ids[1]!, ids[2]!)
        P[3 * v] = save[0]!
        P[3 * v + 1] = save[1]!
        P[3 * v + 2] = save[2]!
        if (a0 > 0 && (n0x * n1x + n0y * n1y + n0z * n1z < 0.2 || a1 < a0 * 0.02)) {
          ok = false
          break
        }
      }
      if (!ok) break
    }
    if (!ok) continue
    P[3 * keep] = x
    P[3 * keep + 1] = y
    P[3 * keep + 2] = z
    for (let i = 0; i < 10; i++) Q[keep * 10 + i] = Q[keep * 10 + i]! + Q[drop * 10 + i]!
    gone[drop] = 1
    for (const t of vf[drop]!) {
      if (!alive[t]) continue
      const has = tri[3 * t] === keep || tri[3 * t + 1] === keep || tri[3 * t + 2] === keep
      if (has) {
        alive[t] = 0
        faces--
        continue
      }
      for (let k = 0; k < 3; k++) if (tri[3 * t + k] === drop) tri[3 * t + k] = keep
      vf[keep]!.push(t)
    }
    vf[keep] = vf[keep]!.filter((t) => alive[t])
    version[keep]!++
    for (const w of edgesOf(keep)) {
      version[w]!++
      for (const u of edgesOf(w)) plan(w, u)
    }
  }
  // compact
  const map = new Int32Array(nv).fill(-1)
  const outP: number[] = []
  const outI: number[] = []
  for (let t = 0; t < nt; t++) {
    if (!alive[t]) continue
    for (let k = 0; k < 3; k++) {
      const v = tri[3 * t + k]!
      if (map[v] === -1) {
        map[v] = outP.length / 3
        outP.push(P[3 * v]!, P[3 * v + 1]!, P[3 * v + 2]!)
      }
      outI.push(map[v]!)
    }
  }
  const pos = new Float32Array(outP)
  return { pos, nrm: new Float32Array(pos.length), idx: new Uint32Array(outI) }
}

type V = [number, number, number]

function faceNormal(P: ArrayLike<number>, a: number, b: number, c: number): [number, number, number, number] {
  const ux = P[3 * b]! - P[3 * a]!
  const uy = P[3 * b + 1]! - P[3 * a + 1]!
  const uz = P[3 * b + 2]! - P[3 * a + 2]!
  const vx = P[3 * c]! - P[3 * a]!
  const vy = P[3 * c + 1]! - P[3 * a + 1]!
  const vz = P[3 * c + 2]! - P[3 * a + 2]!
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz)
  return l > 0 ? [nx / l, ny / l, nz / l, l / 2] : [0, 0, 0, 0]
}

/** the point minimising a quadric, or null when its 3x3 part is near singular */
function solve(q: Float64Array): V | null {
  const a = q[0]!, b = q[1]!, c = q[2]!, d = q[4]!, e = q[5]!, f = q[7]!
  const det = a * (d * f - e * e) - b * (b * f - e * c) + c * (b * e - d * c)
  const scale = Math.abs(a) + Math.abs(d) + Math.abs(f)
  if (Math.abs(det) < 1e-12 * scale * scale * scale || scale === 0) return null
  const r0 = -q[3]!, r1 = -q[6]!, r2 = -q[8]!
  const x = (r0 * (d * f - e * e) - b * (r1 * f - e * r2) + c * (r1 * e - d * r2)) / det
  const y = (a * (r1 * f - e * r2) - r0 * (b * f - e * c) + c * (b * r2 - r1 * c)) / det
  const z = (a * (d * r2 - r1 * e) - b * (b * r2 - r1 * c) + r0 * (b * e - d * c)) / det
  return [x, y, z]
}
