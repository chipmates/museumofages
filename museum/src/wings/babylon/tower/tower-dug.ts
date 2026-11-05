/* THE TOWER AS EXCAVATED, the switch's second state on the map page (pure geometry, so node builds the same): the
   mud-brick core about 60 m square standing to +2.0 to +2.5, the brick robbers' trench where the baked-brick mantle was,
   its floor at the mantle's foundation (-4.0), water standing in it, and the three stairs' feet as dug, their foundation
   walls' tops flush with the ground. The ground here is one patch on the map ground's own lattice: the page sinks the
   map ground's vertices strictly inside it while this state shows, so the patch's rim meets the map ground edge for edge.
   Scene frame as plan.ts (x east, y up, z south); u along the tower's axis toward its stairs, v across it. */

import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'
import type { BoxRec, Built, Cls, P2 } from '../map/plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

export const DUG_KIND = { ground: 8, water: 9, brick: 10 } as const

export interface DugBody { id: string; geometry: BufferGeometry; band: number; letters: [Cls, Cls] }

export interface TowerFrame { x: number; z: number; c: number; s: number }
/** the tower's frame from its first stage's box: (u, v) to the scene and back */
export function towerFrame(b: BoxRec): TowerFrame {
  return { x: b.x, z: b.z, c: Math.cos(b.yaw), s: Math.sin(b.yaw) }
}
export const toScene = (f: TowerFrame, u: number, v: number): P2 => [f.x + u * f.c + v * f.s, f.z - u * f.s + v * f.c]
export const toFrame = (f: TowerFrame, x: number, z: number): P2 => {
  const dx = x - f.x, dz = z - f.z
  return [dx * f.c - dz * f.s, dx * f.s + dz * f.c]
}

/** a smooth hash noise on the plane, -1 to 1, for the ruin's irregular edges (pure, so the page and node agree) */
function noise2(x: number, z: number): number {
  const h = (i: number, j: number): number => {
    const t = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
    return (t - Math.floor(t)) * 2 - 1
  }
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz)
  const a = h(i, j) + (h(i + 1, j) - h(i, j)) * sx
  const b = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * sx
  return a + (b - a) * sz
}

export interface Dug {
  /** the map ground's lattice cell the patch fills, in scene metres: the page sinks the map ground strictly inside */
  region: { x0: number; x1: number; z0: number; z1: number }
  bodies: DugBody[]
  /** the ruin's height at a scene point (the patch's surface), for the checks */
  height: (x: number, z: number) => number
  frame: TowerFrame
  facts: Record<string, unknown>
}

export function buildDug(built: Built, tp: J): Dug {
  const D = tp.dug
  const st1 = built.boxes.find((b) => b.id === 'tower-stage-1') ?? null
  if (!st1) throw new Error('the dug state needs the tower\'s first stage in the plan')
  const f = towerFrame(st1)
  const [x0, x1, z0, z1] = D.region as [number, number, number, number]
  const L = D.lattice as number
  const g = (x: number, z: number): number => built.ground(x, z)
  // the map ground's own surface on the patch's rim: linear between its lattice points, as its triangles are
  const rim = (x: number, z: number): number => {
    if (x === x0 || x === x1) {
      const j = Math.floor((z - z0) / L), za = z0 + j * L, zb = Math.min(z1, za + L)
      return zb === za ? g(x, za) : g(x, za) + ((g(x, zb) - g(x, za)) * (z - za)) / (zb - za)
    }
    const i = Math.floor((x - x0) / L), xa = x0 + i * L, xb = Math.min(x1, xa + L)
    return xb === xa ? g(xa, z) : g(xa, z) + ((g(xb, z) - g(xa, z)) * (x - xa)) / (xb - xa)
  }
  const C = D.core, T = D.trench
  /** the ruin's outline distance: a square softened at its corners (robbed and eroded) */
  const dist = (u: number, v: number): number => Math.pow(Math.pow(Math.abs(u), 8) + Math.pow(Math.abs(v), 8), 1 / 8)
  const ease = (t: number): number => {
    const k = Math.min(1, Math.max(0, t))
    return k * k * (3 - 2 * k)
  }
  const height = (x: number, z: number): number => {
    const [u, v] = toFrame(f, x, z)
    const d = dist(u, v)
    // the core's edge eroded: a slow wander, and gullies a few metres apart cut back into its sides
    const gully = Math.max(0, noise2(x * 0.24 + 11, z * 0.24)) * 0.9
    const e1 = noise2(x * 0.06, z * 0.06) * 2.0 + noise2(x * 0.4, z * 0.4) * 0.4 - gully
    const e2 = noise2(x * 0.05 + 40, z * 0.05) * 1.2 + noise2(x * 0.5, z * 0.5 + 9) * 0.3
    const hum = 0.5 + 0.5 * noise2(x * 0.08, z * 0.08 + 3)
    const slope = C.slope * (0.7 + 0.25 * (1 + noise2(x * 0.1 + 5, z * 0.1)))
    const floor = T.floor + Math.max(0, noise2(x * 0.05 + 7, z * 0.05)) * T.debris
    const dc = C.half + e1, dco = dc + slope, dbo = T.bankFoot + e2, dbt = T.bankTop + e2 * 0.6
    // the top within the record's +2.0 to +2.5, rounding down over its last metres into the side
    const top = Math.min(C.top[1], C.top[0] + (C.top[1] - C.top[0]) * hum + noise2(x * 0.6, z * 0.6) * 0.06) - 0.35 * ease((d - dc + 5) / 5)
    const court = g(x, z)
    if (d <= dc) return top
    if (d <= dco) return top + (floor - top) * ease((d - dc) / slope)
    if (d <= dbo) return floor
    if (d <= dbt) {
      // the robbed bank is never a clean slope: slumps and spoil along its face, nothing at its foot or its lip
      const t = (d - dbo) / (dbt - dbo)
      return floor + (court - floor) * ease(t) + Math.sin(Math.PI * t) * noise2(x * 0.3 + 2, z * 0.3 - 5) * 0.45
    }
    return court
  }
  /* ── the patch: a grid on the lattice's cell, its rim on the map ground's edges ── */
  const step: number = D.step
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step)
  const H = new Float32Array((nx + 1) * (nz + 1))
  /* the map ground's two corner triangles whose three points all lie on the rim never sink (its cells split a, c, b):
     the patch leaves them to the map ground, meeting their diagonal on its plane */
  const m = Math.round(L / step)
  const plane = (ax: number, az: number, sx: number, sz: number) => (x: number, z: number): number => {
    const u = (sx * (x - ax)) / L, w = (sz * (z - az)) / L
    return g(ax, az) + (g(ax + sx * L, az) - g(ax, az)) * u + (g(ax, az + sz * L) - g(ax, az)) * w
  }
  const nearC = plane(x0, z0, 1, 1), farC = plane(x1, z1, -1, -1)
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * step, z = z0 + j * step
    H[j * (nx + 1) + i] = i + j <= m ? nearC(x, z) : nx - i + nz - j <= m ? farC(x, z) : i === 0 || i === nx || j === 0 || j === nz ? rim(x, z) : height(x, z)
  }
  // indexed for smooth normals over the grid, then unrolled to merge with the other bodies
  const grid = new BufferGeometry()
  const gp = new Float32Array((nx + 1) * (nz + 1) * 3)
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) gp.set([x0 + i * step, H[j * (nx + 1) + i]!, z0 + j * step], (j * (nx + 1) + i) * 3)
  const idx: number[] = []
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1
    const far = nx - 1 - i + nz - 1 - j
    if (i + j > m - 1 && far > m - 2) idx.push(a, c, b)
    if (i + j > m - 2 && far > m - 1) idx.push(b, c, d)
  }
  grid.setAttribute('position', new Float32BufferAttribute(gp, 3))
  grid.setIndex(idx)
  grid.computeVertexNormals()
  const flat = grid.toNonIndexed()
  const pos = Array.from(flat.getAttribute('position').array as Float32Array)
  const patch = withKind(pos, DUG_KIND.ground, flat.getAttribute('normal').array as Float32Array)
  /* ── the water: one sheet over the trench's ring, the banks and the core rising out of it ── */
  const W: number = D.water.level
  const ring = (r: number): P2[] => [[r, -r], [r, r], [-r, r], [-r, -r]].map(([u, v]) => toScene(f, u!, v!))
  const wo = ring(T.bankTop + 1.5), wi = ring(C.half - 4)
  const wpos: number[] = []
  for (let k = 0; k < 4; k++) {
    const a = wo[k]!, b = wo[(k + 1) % 4]!, c = wi[k]!, d = wi[(k + 1) % 4]!
    for (const t of [[a, c, b], [b, c, d]]) {
      const tri = t.map((p) => [p[0], W, p[1]])
      // face up
      const ux = tri[1]![0]! - tri[0]![0]!, uz = tri[1]![2]! - tri[0]![2]!, vx = tri[2]![0]! - tri[0]![0]!, vz = tri[2]![2]! - tri[0]![2]!
      if (uz * vx - ux * vz < 0) wpos.push(...tri[0]!, ...tri[2]!, ...tri[1]!)
      else wpos.push(...tri[0]!, ...tri[1]!, ...tri[2]!)
    }
  }
  const water = withKind(wpos, DUG_KIND.water)
  /* ── the stairs' feet as dug: the foundation walls' tops a few centimetres proud of the ground, draped on it ── */
  const S = D.stairs
  const strip = (ua: number, ub: number, va: number, vb: number): BufferGeometry => {
    const q: number[] = []
    const nU = Math.max(1, Math.ceil(Math.abs(ub - ua) / D.step)), nV = Math.max(1, Math.ceil(Math.abs(vb - va) / D.step))
    const at = (u: number, v: number, lift: number): number[] => {
      const [x, z] = toScene(f, u, v)
      return [x, height(x, z) + lift, z]
    }
    // a top quad wound to face up
    const quad = (a: number[], b: number[], c: number[], d: number[]): void => {
      for (const [p, r, t] of [[a, b, c], [a, c, d]] as number[][][]) {
        const ny = (r![2]! - p![2]!) * (t![0]! - p![0]!) - (r![0]! - p![0]!) * (t![2]! - p![2]!)
        q.push(...p!, ...(ny > 0 ? r! : t!), ...(ny > 0 ? t! : r!))
      }
    }
    for (let i = 0; i < nU; i++) for (let k = 0; k < nV; k++) {
      const u0 = ua + ((ub - ua) * i) / nU, u1 = ua + ((ub - ua) * (i + 1)) / nU
      const v0 = va + ((vb - va) * k) / nV, v1 = va + ((vb - va) * (k + 1)) / nV
      quad(at(u0, v0, S.proud), at(u1, v0, S.proud), at(u1, v1, S.proud), at(u0, v1, S.proud))
    }
    // its lips down into the ground on all four sides
    const lip = (pts: Array<[number, number]>): void => {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ua0, va0] = pts[i]!, [ua1, va1] = pts[i + 1]!
        const a = at(ua0, va0, S.proud), b = at(ua1, va1, S.proud), c = at(ua1, va1, -0.25), d = at(ua0, va0, -0.25)
        const mid = toScene(f, (ua0 + ua1) / 2, (va0 + va1) / 2), cen = toScene(f, (ua + ub) / 2, (va + vb) / 2)
        const out = [mid[0] - cen[0], mid[1] - cen[1]]
        const ux = b[0]! - a[0]!, uy = b[1]! - a[1]!, uz = b[2]! - a[2]!, vx = c[0]! - a[0]!, vy = c[1]! - a[1]!, vz = c[2]! - a[2]!
        const nx2 = uy * vz - uz * vy, nz2 = ux * vy - uy * vx
        if (nx2 * out[0]! + nz2 * out[1]! > 0) q.push(...a, ...b, ...c, ...a, ...c, ...d)
        else q.push(...a, ...c, ...b, ...a, ...d, ...c)
      }
    }
    const edge = (a: number, b: number, n: number): number[] => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)
    lip(edge(ua, ub, nU).map((u) => [u, va] as [number, number]))
    lip(edge(ua, ub, nU).map((u) => [u, vb] as [number, number]))
    lip(edge(va, vb, nV).map((v) => [ua, v] as [number, number]))
    lip(edge(va, vb, nV).map((v) => [ub, v] as [number, number]))
    return withKind(q, DUG_KIND.brick)
  }
  const ho = S.middle.w / 2, hc = S.middle.clear / 2
  const bodies: DugBody[] = [
    { id: 'ruin-trench', geometry: patch, band: 1e6, letters: ['M', 'M'] },
    { id: 'ruin-water', geometry: water, band: 1e6, letters: ['M', 'M'] },
    { id: 'ruin-stair-middle-a', geometry: strip(S.band[1], S.middle.foot, hc, ho), band: 1e6, letters: ['M', 'M'] },
    { id: 'ruin-stair-middle-b', geometry: strip(S.band[1], S.middle.foot, -ho, -hc), band: 1e6, letters: ['M', 'M'] },
    { id: 'ruin-stair-side', geometry: strip(S.band[0], S.band[1], -S.halfSpan, S.halfSpan), band: 1e6, letters: ['M', 'M'] },
  ]
  return {
    region: { x0, x1, z0, z1 }, bodies, height, frame: f,
    facts: { coreHalf: C.half, coreTop: C.top, floor: T.floor, water: W, bank: [T.bankFoot, T.bankTop], region: [x0, x1, z0, z1], step, vertices: (nx + 1) * (nz + 1) },
  }
}

/** a triangle soup with the dug bodies' attribute set: `kind`, and `fa`, `fb` zero (the tower's set, so they merge) */
function withKind(pos: number[], kind: number, normals?: Float32Array): BufferGeometry {
  const g = new BufferGeometry()
  const n = pos.length / 3
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('kind', new Float32BufferAttribute(new Float32Array(n).fill(kind), 1))
  g.setAttribute('fa', new Float32BufferAttribute(new Float32Array(n * 4), 4))
  g.setAttribute('fb', new Float32BufferAttribute(new Float32Array(n * 4), 4))
  if (normals) g.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  else g.computeVertexNormals()
  return g
}
