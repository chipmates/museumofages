/* THE FIELD LANGUAGE, the part the measure figure needs: a body as signed
   distance, written as plain data. Negative is inside. Every node knows its
   own bounds, so a union skips the children a point cannot reach.
   Ported unchanged from the animals' kit (field.ts) for the kinds kept here:
   sphere, ellipsoid, tube, box, union, intersection and a placed copy. */

export type V3 = [number, number, number]

export type Field =
  | { k: 'sphere'; c: V3; r: number }
  /** ellipsoid with semi-axes r along the basis columns (default: world axes) */
  | { k: 'ellipsoid'; c: V3; r: V3; basis?: [V3, V3, V3] }
  /** a tube through points, radius per point: [along up, along side]; up orients the section;
      smooth blends the segments into each other (a curved muscle without a crease at every joint) */
  | { k: 'tube'; pts: V3[]; r: Array<[number, number]>; up?: V3; smooth?: number }
  | { k: 'box'; c: V3; h: V3; round?: number; basis?: [V3, V3, V3] }
  | { k: 'u'; of: Field[]; s?: number }
  | { k: 'i'; of: Field[]; s?: number }
  /** placed: m is a 3x4 column-major affine (rotation times uniform scale, then translation) */
  | { k: 'x'; m: number[]; of: Field }

export interface Box {
  min: V3
  max: V3
}

export interface Compiled {
  f: (x: number, y: number, z: number) => number
  box: Box
}

const INF = 1e9
/** joints bent less than about 29 degrees are mitred, sharper ones capped */
export const MITRE_COS = Math.cos(0.5)

function emptyBox(): Box {
  return { min: [INF, INF, INF], max: [-INF, -INF, -INF] }
}
function grow(b: Box, d: number): Box {
  return {
    min: [b.min[0] - d, b.min[1] - d, b.min[2] - d],
    max: [b.max[0] + d, b.max[1] + d, b.max[2] + d],
  }
}
function unionBox(a: Box, b: Box): Box {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  }
}
function interBox(a: Box, b: Box): Box {
  return {
    min: [Math.max(a.min[0], b.min[0]), Math.max(a.min[1], b.min[1]), Math.max(a.min[2], b.min[2])],
    max: [Math.min(a.max[0], b.max[0]), Math.min(a.max[1], b.max[1]), Math.min(a.max[2], b.max[2])],
  }
}
/** distance from a point to a box, 0 inside: a lower bound for any field inside it */
export function boxDist(b: Box, x: number, y: number, z: number): number {
  const dx = Math.max(b.min[0] - x, 0, x - b.max[0])
  const dy = Math.max(b.min[1] - y, 0, y - b.max[1])
  const dz = Math.max(b.min[2] - z, 0, z - b.max[2])
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return a < b ? a : b
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k)
}
/* ---- the compiler ---- */
export function compile(node: Field): Compiled {
  switch (node.k) {
    case 'sphere': {
      const [cx, cy, cz] = node.c
      const r = node.r
      return {
        f: (x, y, z) => Math.sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) - r,
        box: { min: [cx - r, cy - r, cz - r], max: [cx + r, cy + r, cz + r] },
      }
    }
    case 'ellipsoid': {
      const [cx, cy, cz] = node.c
      const [ra, rb, rc] = node.r
      const B = node.basis ?? [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]
      const [e0, e1, e2] = B
      const rmax = Math.max(ra, rb, rc)
      return {
        // the bound-corrected approximation (k0 * (k0 - 1) / k1)
        f: (x, y, z) => {
          const px = x - cx
          const py = y - cy
          const pz = z - cz
          const a = (px * e0[0] + py * e0[1] + pz * e0[2]) / ra
          const b = (px * e1[0] + py * e1[1] + pz * e1[2]) / rb
          const c = (px * e2[0] + py * e2[1] + pz * e2[2]) / rc
          const k0 = Math.sqrt(a * a + b * b + c * c)
          const k1 = Math.sqrt((a * a) / (ra * ra) + (b * b) / (rb * rb) + (c * c) / (rc * rc))
          if (k1 < 1e-9) return -Math.min(ra, rb, rc)
          return (k0 * (k0 - 1)) / k1
        },
        box: { min: [cx - rmax, cy - rmax, cz - rmax], max: [cx + rmax, cy + rmax, cz + rmax] },
      }
    }
    case 'tube':
      return compileTube(node.pts, node.r, node.up ?? [0, 1, 0], node.smooth ?? 0)
    case 'box': {
      const [cx, cy, cz] = node.c
      const round = node.round ?? 0
      const hx = node.h[0] - round
      const hy = node.h[1] - round
      const hz = node.h[2] - round
      const B = node.basis ?? [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]
      const [e0, e1, e2] = B
      const rmax = Math.sqrt(node.h[0] ** 2 + node.h[1] ** 2 + node.h[2] ** 2)
      return {
        f: (x, y, z) => {
          const px = x - cx
          const py = y - cy
          const pz = z - cz
          const a = Math.abs(px * e0[0] + py * e0[1] + pz * e0[2]) - hx
          const b = Math.abs(px * e1[0] + py * e1[1] + pz * e1[2]) - hy
          const c = Math.abs(px * e2[0] + py * e2[1] + pz * e2[2]) - hz
          const o = Math.sqrt(Math.max(a, 0) ** 2 + Math.max(b, 0) ** 2 + Math.max(c, 0) ** 2)
          return o + Math.min(Math.max(a, b, c), 0) - round
        },
        box: { min: [cx - rmax, cy - rmax, cz - rmax], max: [cx + rmax, cy + rmax, cz + rmax] },
      }
    }
    case 'u':
      return compileUnion(node.of.map(compile), node.s ?? 0, false)
    case 'i': {
      const kids = node.of.map(compile)
      const s = node.s ?? 0
      let box = kids[0]!.box
      for (const k of kids.slice(1)) box = interBox(box, k.box)
      return {
        f: (x, y, z) => {
          let d = -INF
          for (const k of kids) d = smax(d, k.f(x, y, z), s)
          return d
        },
        box,
      }
    }
    case 'x': {
      const m = node.m
      const kid = compile(node.of)
      // uniform scale is the length of the first column
      const sc = Math.sqrt(m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!)
      const is2 = 1 / (sc * sc)
      const tx = m[9]!
      const ty = m[10]!
      const tz = m[11]!
      // world -> local: R^T (p - t) / s  with R = columns / s
      const f = (x: number, y: number, z: number): number => {
        const px = x - tx
        const py = y - ty
        const pz = z - tz
        const lx = (m[0]! * px + m[1]! * py + m[2]! * pz) * is2
        const ly = (m[3]! * px + m[4]! * py + m[5]! * pz) * is2
        const lz = (m[6]! * px + m[7]! * py + m[8]! * pz) * is2
        return kid.f(lx, ly, lz) * sc
      }
      // the local box's eight corners, carried out
      let box = emptyBox()
      for (let c = 0; c < 8; c++) {
        const lx = c & 1 ? kid.box.max[0] : kid.box.min[0]
        const ly = c & 2 ? kid.box.max[1] : kid.box.min[1]
        const lz = c & 4 ? kid.box.max[2] : kid.box.min[2]
        const wx = m[0]! * lx + m[3]! * ly + m[6]! * lz + tx
        const wy = m[1]! * lx + m[4]! * ly + m[7]! * lz + ty
        const wz = m[2]! * lx + m[5]! * ly + m[8]! * lz + tz
        box = unionBox(box, { min: [wx, wy, wz], max: [wx, wy, wz] })
      }
      return { f, box }
    }
  }
}

function compileUnion(kids: Compiled[], s: number, expo: boolean): Compiled {
  let box = emptyBox()
  for (const k of kids) box = unionBox(box, k.box)
  const n = kids.length
  const boxes = kids.map((k) => grow(k.box, s))
  const fs = kids.map((k) => k.f)
  if (expo) {
    // -s log sum exp(-d/s): every near mass contributes, far ones are skipped
    return {
      f: (x, y, z) => {
        let best = INF
        const near: number[] = []
        for (let i = 0; i < n; i++) {
          const lb = boxDist(boxes[i]!, x, y, z)
          if (lb > best + 4.5 * s) continue
          const d = fs[i]!(x, y, z)
          near.push(d)
          if (d < best) best = d
        }
        if (best >= INF) return boxDist(box, x, y, z) + s
        let sum = 0
        for (const d of near) sum += Math.exp(-(d - best) / s)
        return best - s * Math.log(sum)
      },
      box: grow(box, s),
    }
  }
  return {
    f: (x, y, z) => {
      let d = INF
      for (let i = 0; i < n; i++) {
        // inside a child's box the bound says nothing; skip only when already well inside
        const bd = boxDist(boxes[i]!, x, y, z)
        if (bd >= d + s && (bd > 0 || d < -s - 0.002)) continue
        d = smin(d, fs[i]!(x, y, z), s)
      }
      return d >= INF ? boxDist(box, x, y, z) + 0.01 : d
    },
    box,
  }
}

/* A TUBE: a chain of segments with an elliptic section that turns with the
   chain. Each segment reports the distance to its own swept ellipse, with the
   radii interpolated along it; the chain is their minimum. */
function compileTube(pts: V3[], rad: Array<[number, number]>, up: V3, smooth: number): Compiled {
  const n = pts.length
  interface Seg {
    ax: number
    ay: number
    az: number
    dx: number
    dy: number
    dz: number
    len: number
    ux: number
    uy: number
    uz: number
    vx: number
    vy: number
    vz: number
    a0: number
    b0: number
    a1: number
    b1: number
    /** the radii's slopes at both ends, per segment, so the section changes smoothly across joints */
    ta0: number
    tb0: number
    ta1: number
    tb1: number
    /** a mitred joint at the start or end: the bisector plane's normal, zero for a capped end */
    n0x: number
    n0y: number
    n0z: number
    n1x: number
    n1y: number
    n1z: number
    m0: boolean
    m1: boolean
    box: Box
  }
  const segs: Seg[] = []
  let box = emptyBox()
  // arc lengths, for radius slopes that respect uneven knot spacing
  const lens: number[] = []
  for (let i = 0; i < n - 1; i++) lens.push(Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1], pts[i + 1]![2] - pts[i]![2]) || 1e-6)
  const slope = (i: number, k: 0 | 1): number => {
    const lo = Math.max(0, i - 1)
    const hi = Math.min(n - 1, i + 1)
    let span = 0
    for (let j = lo; j < hi; j++) span += lens[j]!
    return (rad[hi]![k] - rad[lo]![k]) / (span || 1e-6)
  }
  for (let i = 0; i < n - 1; i++) {
    const p = pts[i]!
    const q = pts[i + 1]!
    let dx = q[0] - p[0]
    let dy = q[1] - p[1]
    let dz = q[2] - p[2]
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6
    dx /= len
    dy /= len
    dz /= len
    // the section's up, made square to the segment
    const d = up[0] * dx + up[1] * dy + up[2] * dz
    let ux = up[0] - d * dx
    let uy = up[1] - d * dy
    let uz = up[2] - d * dz
    let ul = Math.sqrt(ux * ux + uy * uy + uz * uz)
    if (ul < 1e-6) {
      // up runs along the segment: take any square direction
      ux = -dy
      uy = dx
      uz = 0
      ul = Math.sqrt(ux * ux + uy * uy) || 1
    }
    ux /= ul
    uy /= ul
    uz /= ul
    const vx = dy * uz - dz * uy
    const vy = dz * ux - dx * uz
    const vz = dx * uy - dy * ux
    const [a0, b0] = rad[i]!
    const [a1, b1] = rad[i + 1]!
    const r = Math.max(a0, b0, a1, b1) * 1.12
    const sb: Box = {
      min: [Math.min(p[0], q[0]) - r, Math.min(p[1], q[1]) - r, Math.min(p[2], q[2]) - r],
      max: [Math.max(p[0], q[0]) + r, Math.max(p[1], q[1]) + r, Math.max(p[2], q[2]) + r],
    }
    box = unionBox(box, sb)
    segs.push({
      ax: p[0], ay: p[1], az: p[2], dx, dy, dz, len, ux, uy, uz, vx, vy, vz, a0, b0, a1, b1,
      ta0: slope(i, 0) * len, tb0: slope(i, 1) * len, ta1: slope(i + 1, 0) * len, tb1: slope(i + 1, 1) * len,
      n0x: 0, n0y: 0, n0z: 0, n1x: 0, n1y: 0, n1z: 0, m0: false, m1: false,
      box: sb,
    })
  }
  // a gentle joint is mitred (see segRaw); a sharp one keeps both full caps, which round its outer corner
  for (let i = 0; i + 1 < segs.length; i++) {
    const a = segs[i]!
    const b = segs[i + 1]!
    const c = a.dx * b.dx + a.dy * b.dy + a.dz * b.dz
    if (c < MITRE_COS) continue
    // the bisectors of a segment's two ends must not cross inside the tube
    const tan = Math.sqrt(Math.max(0, 1 - c * c)) / c
    if (tan * Math.max(a.a1, a.b1) * 1.5 > Math.min(a.len, b.len)) continue
    let nx = a.dx + b.dx
    let ny = a.dy + b.dy
    let nz = a.dz + b.dz
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz)
    nx /= nl
    ny /= nl
    nz /= nl
    a.n1x = nx
    a.n1y = ny
    a.n1z = nz
    a.m1 = true
    b.n0x = nx
    b.n0y = ny
    b.n0z = nz
    b.m0 = true
  }
  // segments in runs of eight under one box, so a long tube skips most of itself
  const RUN = 8
  const runs: Array<{ box: Box; from: number; to: number }> = []
  for (let i = 0; i < segs.length; i += RUN) {
    let b = emptyBox()
    const to = Math.min(segs.length, i + RUN)
    for (let j = i; j < to; j++) b = unionBox(b, segs[j]!.box)
    runs.push({ box: b, from: i, to })
  }
  const segRaw = (j: number, x: number, y: number, z: number): number => {
    const s = segs[j]!
    const px = x - s.ax
    const py = y - s.ay
    const pz = z - s.az
    let t = px * s.dx + py * s.dy + pz * s.dz
    // a mitred joint splits the space at its bisector plane: each side belongs to one segment, whose
    // section runs on unchanged up to the plane, with no cap to ring or notch the chain
    const s0 = s.m0 ? px * s.n0x + py * s.n0y + pz * s.n0z : t
    const s1 = s.m1 ? (px - s.dx * s.len) * s.n1x + (py - s.dy * s.len) * s.n1y + (pz - s.dz * s.len) * s.n1z : t - s.len
    if ((s.m0 && s0 < 0) || (s.m1 && s1 > 0)) return INF
    const over = t < 0 && !s.m0 ? -t : t > s.len && !s.m1 ? t - s.len : 0
    t = t < 0 ? 0 : t > s.len ? s.len : t
    // the radii run between the two planes, so neighbours agree on a shared bisector
    const span = s0 - s1
    let w = span > 1e-9 ? s0 / span : t / s.len
    w = w < 0 ? 0 : w > 1 ? 1 : w
    // cubic Hermite in the radii: no kink, so no ring in the light at each joint
    const w2 = w * w
    const w3 = w2 * w
    const h00 = 2 * w3 - 3 * w2 + 1
    const h10 = w3 - 2 * w2 + w
    const h01 = 3 * w2 - 2 * w3
    const h11 = w3 - w2
    const a = Math.max(0.0005, h00 * s.a0 + h10 * s.ta0 + h01 * s.a1 + h11 * s.ta1)
    const b = Math.max(0.0005, h00 * s.b0 + h10 * s.tb0 + h01 * s.b1 + h11 * s.tb1)
    const qx = px - s.dx * t
    const qy = py - s.dy * t
    const qz = pz - s.dz * t
    const u = qx * s.ux + qy * s.uy + qz * s.uz
    const v = qx * s.vx + qy * s.vy + qz * s.vz
    // the section's distance by the first-order ellipse estimate k1 (k1 - 1) / k2, exact on the
    // surface and never far over it, so the mesher's block culling keeps thin flat bellies whole;
    // past a segment's end the same estimate over a half ellipsoid rounds the cap
    const c = a < b ? a : b
    const ua = u / a
    const vb = v / b
    const oc = over / c
    const k1 = Math.sqrt(ua * ua + vb * vb + oc * oc)
    const k2 = Math.sqrt((ua / a) * (ua / a) + (vb / b) * (vb / b) + (oc / c) * (oc / c))
    return k2 < 1e-9 ? -c : (k1 * (k1 - 1)) / k2
  }
  // a box bounds a segment only from outside: inside it, a nearly-zero best must not hide a deeper segment
  const far = (b: Box, x: number, y: number, z: number, bound: number): boolean => {
    const bd = boxDist(b, x, y, z)
    return bd > 0 && bd >= bound
  }
  if (smooth <= 0)
    return {
      f: (x, y, z) => {
        let best = INF
        for (const run of runs) {
          if (far(run.box, x, y, z, best)) continue
          for (let j = run.from; j < run.to; j++) {
            if (far(segs[j]!.box, x, y, z, best)) continue
            const d = segRaw(j, x, y, z)
            if (d < best) best = d
          }
        }
        return best
      },
      box,
    }
  // streamed log-sum-exp over the segments near the point
  const k = smooth
  return {
    f: (x, y, z) => {
      let m = INF
      let sum = 0
      for (const run of runs) {
        if (far(run.box, x, y, z, m + 4.5 * k)) continue
        for (let j = run.from; j < run.to; j++) {
          if (far(segs[j]!.box, x, y, z, m + 4.5 * k)) continue
          const d = segRaw(j, x, y, z)
          if (d >= INF) continue
          if (d < m) {
            sum = sum * Math.exp((d - m) / k) + 1
            m = d
          } else sum += Math.exp(-(d - m) / k)
        }
      }
      return m >= INF ? m : m - k * Math.log(sum)
    },
    box: grow(box, k),
  }
}
