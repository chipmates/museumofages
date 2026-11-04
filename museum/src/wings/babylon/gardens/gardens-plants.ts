/* STOP 5'S PLANTING, pure geometry with vertex colours (no DOM): the guessed garden on the edge terraces. Trees as a
   trunk under a crown of jittered lobes whose normals lean out from the crown's middle, so a crown shades as one soft
   mass seen from 150 to 400 m; cypresses as a tall spindle of lobes; the date palms are the gate's own (passed in, so
   this module keeps no relative import for node); vine curtains and caper mounds hang over the terraces' own edges.
   Every vertex carries `leaf` (1 foliage, 0 wood) and `centre` (its crown's middle, for the leaves' light). */

import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'
import type { GardensFrame, Strip } from './gardens-geom'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
type V3 = [number, number, number]

export type Kind = 'palm' | 'cypress' | 'broad' | 'pomegranate' | 'fig' | 'shrub' | 'vine' | 'caper'
export interface Plant { id: string; kind: Kind; row: string; x: number; z: number; y: number; h: number; geometry: BufferGeometry }
/** the gate's palm builder (gate-life.ts palmGeometry): one palm at the origin, its foot at 0 */
export type PalmBuilder = (h: number, detail: { seg: number; sides: number; fronds: number; steps: number }, seed: number) => BufferGeometry

const rnd = (seed: number): (() => number) => {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

/** linear albedos of the leaves and wood, April (the deciduous kinds in new leaf); ours, from the photo sheet's kinds */
const LEAF: Record<Kind, V3> = {
  broad: [0.07, 0.1, 0.032],
  cypress: [0.028, 0.046, 0.022],
  pomegranate: [0.085, 0.12, 0.03],
  fig: [0.1, 0.14, 0.045],
  shrub: [0.065, 0.088, 0.038],
  palm: [0.06, 0.095, 0.035],
  vine: [0.105, 0.15, 0.038],
  caper: [0.07, 0.095, 0.05],
}
const WOOD: V3 = [0.11, 0.085, 0.062], FIG_WOOD: V3 = [0.24, 0.22, 0.19]

class Mesh {
  pos: number[] = []
  nor: number[] = []
  col: number[] = []
  leaf: number[] = []
  cen: number[] = []
  tri(a: V3, b: V3, c: V3, n: [V3, V3, V3], col: V3, leaf: number, centre: V3): void {
    this.pos.push(...a, ...b, ...c)
    this.nor.push(...n[0], ...n[1], ...n[2])
    for (let i = 0; i < 3; i++) {
      this.col.push(...col)
      this.leaf.push(leaf)
      this.cen.push(...centre)
    }
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    g.setAttribute('leaf', new Float32BufferAttribute(this.leaf, 1))
    g.setAttribute('centre', new Float32BufferAttribute(this.cen, 3))
    return g
  }
}

/* the icosahedron's twelve corners and twenty faces */
const T = (1 + Math.sqrt(5)) / 2
const ICO_V: V3[] = [[-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0], [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T], [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1]].map((v) => norm(v as V3))
const ICO_F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
/** the icosahedron split once: 42 corners, 80 faces, round enough that a crown's lobe reads as foliage, not a facet */
const ICO1 = (() => {
  const V: V3[] = [...ICO_V], F: number[][] = [], mid = new Map<string, number>()
  const half = (a: number, b: number): number => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    let i = mid.get(key)
    if (i === undefined) {
      i = V.length
      V.push(norm([(V[a]![0] + V[b]![0]) / 2, (V[a]![1] + V[b]![1]) / 2, (V[a]![2] + V[b]![2]) / 2]))
      mid.set(key, i)
    }
    return i
  }
  for (const [a, b, c] of ICO_F) {
    const ab = half(a!, b!), bc = half(b!, c!), ca = half(c!, a!)
    F.push([a!, ab, ca], [b!, bc, ab], [c!, ca, bc], [ab, bc, ca])
  }
  return { V, F }
})()

/** one lobe of foliage: an icosphere with each corner a little in or out, its normals bent toward the crown's own */
function lobe(m: Mesh, c: V3, r: [number, number, number], crown: V3, col: V3, r01: () => number, bend = 0.62, fine = true): void {
  const S = fine ? ICO1 : { V: ICO_V, F: ICO_F }
  const k = S.V.map(() => 0.86 + r01() * 0.24)
  const P = S.V.map((v, i): V3 => [c[0] + v[0] * r[0] * k[i]!, c[1] + v[1] * r[1] * k[i]!, c[2] + v[2] * r[2] * k[i]!])
  const N = P.map((p, i): V3 => {
    const own = S.V[i]!
    const out = norm([p[0] - crown[0], (p[1] - crown[1]) * 1.4, p[2] - crown[2]])
    return norm([own[0] * (1 - bend) + out[0] * bend, own[1] * (1 - bend) + out[1] * bend, own[2] * (1 - bend) + out[2] * bend])
  })
  for (const f of S.F) m.tri(P[f[0]!]!, P[f[1]!]!, P[f[2]!]!, [N[f[0]!]!, N[f[1]!]!, N[f[2]!]!], col, 1, crown)
}

/** a trunk: a tapered five-sided stem from the foot to `top`, leaning a little */
function trunk(m: Mesh, x: number, y: number, z: number, top: number, r0: number, r1: number, lean: [number, number], col: V3, crown: V3): void {
  const S = 5, seg = 2
  const ring = (t: number): V3[] => {
    const c: V3 = [x + lean[0] * t * t, y + (top - y) * t, z + lean[1] * t * t]
    const r = r0 + (r1 - r0) * t
    return Array.from({ length: S }, (_, k): V3 => [c[0] + Math.cos((k / S) * Math.PI * 2) * r, c[1], c[2] + Math.sin((k / S) * Math.PI * 2) * r])
  }
  for (let i = 0; i < seg; i++) {
    const a = ring(i / seg), b = ring((i + 1) / seg)
    for (let k = 0; k < S; k++) {
      const k1 = (k + 1) % S
      const n0 = norm([Math.cos((k / S) * Math.PI * 2), 0, Math.sin((k / S) * Math.PI * 2)])
      const n1 = norm([Math.cos((k1 / S) * Math.PI * 2), 0, Math.sin((k1 / S) * Math.PI * 2)])
      m.tri(a[k]!, b[k]!, b[k1]!, [n0, n0, n1], col, 0, crown)
      m.tri(a[k]!, b[k1]!, a[k1]!, [n0, n1, n1], col, 0, crown)
    }
  }
}

const tint = (c: V3, k: number, warm = 0): V3 => [c[0] * k * (1 + warm), c[1] * k, c[2] * k * (1 - warm)]

/** a broad crown on a short trunk: lobes over an ellipsoid, lighter and larger toward the top, darker underneath */
function broadTree(m: Mesh, x: number, y: number, z: number, h: number, r: number, kind: Kind, seed: number): void {
  const R = rnd(seed)
  const cy = y + h * (kind === 'fig' ? 0.52 : 0.62), ry = h * (kind === 'fig' ? 0.42 : 0.36)
  const crown: V3 = [x, cy, z]
  const lean: [number, number] = [(R() - 0.5) * 0.8, (R() - 0.5) * 0.8]
  trunk(m, x, y - 0.3, z, cy, kind === 'fig' ? 0.26 : 0.17, 0.09, lean, kind === 'fig' ? FIG_WOOD : WOOD, crown)
  const n = kind === 'shrub' || kind === 'pomegranate' ? 6 : 10
  for (let i = 0; i < n; i++) {
    // a direction over the upper part of a sphere, the lobes nearer the top a little larger
    const u = R() * 2 - 0.6, a = R() * Math.PI * 2
    const s = Math.sqrt(Math.max(0, 1 - u * u))
    const d: V3 = [Math.cos(a) * s, u, Math.sin(a) * s]
    const f = 0.42 + R() * 0.32
    const c: V3 = [x + lean[0] + d[0] * r * f, cy + d[1] * ry * f, z + lean[1] + d[2] * r * f]
    const lr = r * (0.48 + R() * 0.16) * (1 + Math.max(0, d[1]) * 0.18)
    const col = tint(LEAF[kind], (0.78 + R() * 0.3) * (0.82 + 0.3 * Math.max(0, d[1] * 0.5 + 0.5)), (R() - 0.5) * 0.12)
    lobe(m, c, [lr, lr * 0.8, lr], crown, col, R)
  }
}

/** a cypress: a short stem and one tall spindle, widest a third of the way up and closing to a point, its surface
    uneven as a cypress's sprays are; a few tufts stand out of it */
function cypress(m: Mesh, x: number, y: number, z: number, h: number, r: number, seed: number): void {
  const R = rnd(seed)
  const crown: V3 = [x, y + h * 0.5, z]
  trunk(m, x, y - 0.3, z, y + h * 0.12, 0.2, 0.14, [0, 0], WOOD, crown)
  const S = 9, RINGS = 12
  const y0 = y + h * 0.07
  const ring: V3[][] = []
  const tone = 0.85 + R() * 0.25
  for (let j = 0; j <= RINGS; j++) {
    const t = j / RINGS
    const w = j === RINGS ? 0 : r * Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.9)), 0.75) * (1 - 0.4 * t) + 0.05
    const yy = y0 + (h - (y0 - y)) * t
    ring.push(Array.from({ length: S }, (_, k): V3 => {
      const a = (k / S) * Math.PI * 2 + j * 0.35
      const ww = w * (0.84 + R() * 0.3)
      return [x + Math.cos(a) * ww, yy + (R() - 0.5) * 0.25 * (j > 0 && j < RINGS ? 1 : 0), z + Math.sin(a) * ww]
    }))
  }
  const nrm = (p: V3, j: number): V3 => norm([p[0] - x, 0.35 + (j / RINGS) * 0.5, p[2] - z])
  for (let j = 0; j < RINGS; j++) {
    const t = j / RINGS
    const col = tint(LEAF.cypress, tone * (0.82 + 0.3 * t))
    for (let k = 0; k < S; k++) {
      const k1 = (k + 1) % S
      const a = ring[j]![k]!, b = ring[j]![k1]!, c = ring[j + 1]![k1]!, d = ring[j + 1]![k]!
      m.tri(a, c, b, [nrm(a, j), nrm(c, j + 1), nrm(b, j)], col, 1, crown)
      m.tri(a, d, c, [nrm(a, j), nrm(d, j + 1), nrm(c, j + 1)], col, 1, crown)
    }
  }
  // the bottom closed, under the spindle
  for (let k = 0; k < S; k++) m.tri([x, y0, z], ring[0]![k]!, ring[0]![(k + 1) % S]!, [[0, -1, 0], [0, -1, 0], [0, -1, 0]], tint(LEAF.cypress, tone * 0.7), 1, crown)
  for (let i = 0; i < 4; i++) {
    const t = 0.2 + R() * 0.55, a = R() * Math.PI * 2
    const w = r * Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.9)), 0.75) * (1 - 0.4 * t)
    const c: V3 = [x + Math.cos(a) * w * 0.85, y0 + (h - (y0 - y)) * t, z + Math.sin(a) * w * 0.85]
    lobe(m, c, [w * 0.45, h * 0.06, w * 0.45], crown, tint(LEAF.cypress, tone * (0.9 + 0.3 * t)), R, 0.6, false)
  }
}

/** a hanging curtain over a terrace's edge: a lip on the top, then a ragged sheet down the face, bulging out from it */
function curtain(m: Mesh, at: { x: number; z: number; nx: number; nz: number }, top: number, w: number, drop: number, kind: Kind, seed: number): void {
  const R = rnd(seed)
  const cols = 5, rows = 4
  const tx = -at.nz, tz = at.nx
  const centre: V3 = [at.x + at.nx * 0.6, top - drop * 0.4, at.z + at.nz * 0.6]
  const ends = Array.from({ length: cols + 1 }, () => drop * (0.45 + R() * 0.55))
  const grid: V3[][] = []
  for (let j = 0; j <= rows + 1; j++) {
    const row: V3[] = []
    for (let i = 0; i <= cols; i++) {
      const u = (i / cols - 0.5) * w * (j === 0 ? 0.8 : 1)
      const edgeK = Math.sin((i / cols) * Math.PI)
      if (j === 0) {
        // the lip: half a metre in from the edge, a hand over the top
        row.push([at.x - at.nx * 0.55 + tx * u, top + 0.12 + R() * 0.1, at.z - at.nz * 0.55 + tz * u])
        continue
      }
      const t = (j - 1) / rows
      const d = ends[i]! * Math.min(1, t * (0.85 + edgeK * 0.15))
      const bulge = 0.12 + (0.18 + R() * 0.2) * Math.sin(Math.PI * Math.min(1, t + 0.15)) * (0.5 + edgeK * 0.5)
      row.push([at.x + at.nx * bulge + tx * u * (1 - t * 0.12), top - d + (j === 1 ? 0.05 : 0), at.z + at.nz * bulge + tz * u * (1 - t * 0.12)])
    }
    grid.push(row)
  }
  const col = (j: number): V3 => tint(LEAF[kind], (0.85 + R() * 0.25) * (1 - j * 0.04))
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = grid[j]![i]!, b = grid[j]![i + 1]!, c = grid[j + 1]![i + 1]!, d = grid[j + 1]![i]!
      // the sheet's normal faces out of the wall; on the lip it faces up and out
      const n: V3 = j === 0 ? norm([at.nx, 1, at.nz]) : norm([at.nx, 0.25, at.nz])
      const k = col(j)
      m.tri(a, d, c, [n, n, n], k, 1, centre)
      m.tri(a, c, b, [n, n, n], k, 1, centre)
    }
  }
  // a few clumps along the sheet, so it is never one flat plane
  for (let i = 0; i < 3; i++) {
    const u = (R() - 0.5) * w * 0.8, d = drop * (0.15 + R() * 0.5)
    const c: V3 = [at.x + at.nx * 0.3 + tx * u, top - d, at.z + at.nz * 0.3 + tz * u]
    const r = 0.35 + R() * 0.3
    lobe(m, c, [r, r * 0.9, r], centre, col(1), R, 0.5, false)
  }
}

export interface Planting { plants: Plant[]; facts: Record<string, unknown> }

/** the garden's plants over the strips; `inStair` says where a flight runs (no tree and no curtain there) */
export function buildPlanting(F: GardensFrame, gp: J, palm: PalmBuilder, palmDetail: { seg: number; sides: number; fronds: number; steps: number }): Planting {
  const P = gp.planting, T = gp.terraces
  const R = rnd(P.seed)
  const plants: Plant[] = []
  const count: Record<string, number> = {}
  const nextId = (k: Kind): string => {
    count[k] = (count[k] ?? 0) + 1
    return `garden-${k}-${count[k]}`
  }
  const pick = (mix: Array<[Kind, number]>): Kind => {
    for (let tries = 0; tries < 8; tries++) {
      let u = R(), k: Kind = mix[0]![0]
      for (const [kk, w] of mix) {
        if (u < w) { k = kk; break }
        u -= w
      }
      const max = P.kinds[k]?.max
      if (max === undefined || (count[k] ?? 0) < max) return k
    }
    return 'broad'
  }
  const range = (r: number[]): number => r[0]! + R() * (r[1]! - r[0]!)
  const stairs = T.stairs as J[]
  const stairW = stairs.find((s) => s.id === 'garden-stair-w'), stairN = stairs.find((s) => s.id === 'garden-stair-n')
  const clearOf = (t: Strip, along: number): boolean => {
    if (t.out === 'w' && stairW) return Math.abs(along - (F.N0 - stairW.n)) > stairW.w / 2 + 2.2
    if (t.out === 'n' && stairN) return along > stairN.e - F.E0 + 1.5 || along < stairN.e - F.E0 - 12
    return true
  }

  const put = (k: Kind, x: number, z: number, y: number, room: number): void => {
    const spec = P.kinds[k]
    const h = range(spec.h)
    const id = nextId(k)
    const seed = Math.floor(R() * 1e9)
    const m = new Mesh()
    if (k === 'palm') {
      const g = palm(h, palmDetail, seed % 997)
      const turn = R() * Math.PI * 2, c = Math.cos(turn), s = Math.sin(turn)
      const lean: [number, number] = [(R() - 0.5) * 1.6, (R() - 0.5) * 1.6]
      const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), col = g.getAttribute('color')
      const crown: V3 = [x + lean[0], y + h, z + lean[1]]
      const tone = 0.9 + R() * 0.2
      for (let i = 0; i < pos.count; i += 3) {
        const v: V3[] = [], n: Array<V3> = []
        let isLeaf = 0
        for (let j = 0; j < 3; j++) {
          const px = pos.getX(i + j), py = pos.getY(i + j), pz = pos.getZ(i + j)
          const f = Math.max(0, py / h) ** 2
          v.push([x + px * c - pz * s + lean[0] * f, y + py, z + px * s + pz * c + lean[1] * f])
          n.push([nor.getX(i + j) * c - nor.getZ(i + j) * s, nor.getY(i + j), nor.getX(i + j) * s + nor.getZ(i + j) * c])
          if (py > h * 0.9) isLeaf = 1
        }
        const cc: V3 = [col.getX(i) * tone, col.getY(i) * tone, col.getZ(i) * tone]
        m.tri(v[0]!, v[1]!, v[2]!, [n[0]!, n[1]!, n[2]!], cc, isLeaf, crown)
      }
    } else if (k === 'cypress') cypress(m, x, y, z, h, Math.min(range(spec.r), room), seed)
    else broadTree(m, x, y, z, h, Math.min(range(spec.r), room), k, seed)
    plants.push({ id, kind: k, row: spec.row, x, z, y, h, geometry: m.geometry() })
  }

  for (const t of F.strips) {
    const rows = P.rows[t.out] as J[]
    const depth = t.out === 'w' ? t.x1 - t.x0 : t.z1 - t.z0
    for (const row of rows) {
      const across = row.at
      // along the strip: west strips run north to south (z0 to z1), north strips west to east (x0 to x1)
      const a0 = t.out === 'w' ? t.z0 + 3 : t.x0 + 3
      const a1 = t.out === 'w' ? t.z1 - T.southClear : t.x1 - T.eastClear
      for (let a = a0 + R() * row.every * 0.5; a < a1; a += row.every * (0.8 + R() * 0.4)) {
        if (!clearOf(t, a)) continue
        const k = pick(P.mixes[row.mix])
        const j = (R() - 0.5) * 1.2
        const x = t.out === 'w' ? t.x0 + across + j : a
        const z = t.out === 'w' ? a : t.z0 + across + j
        // a crown keeps clear of the higher terrace's wall behind it, less half a metre
        const room = depth - across + 0.5
        put(k, x, z, t.level, Math.max(1.2, room))
      }
    }
  }

  /* the hanging green over each strip's outer edge, and over the lowest strips' faces down to the plain */
  const H = P.hanging
  const levels = [...new Set(F.strips.map((t) => t.level))].sort((a, b) => b - a)
  for (const t of F.strips) {
    const below = levels[levels.indexOf(t.level) + 1] ?? 0
    const face = t.level - below
    const a0 = t.out === 'w' ? t.z0 + 1.5 : t.x0 + 1.5
    const a1 = t.out === 'w' ? t.z1 - T.southClear : t.x1 - T.eastClear
    for (let a = a0 + R() * H.every; a < a1; a += H.every * (0.7 + R() * 0.6)) {
      if (!clearOf(t, a)) continue
      if (R() < 0.18) continue
      const w = range(H.w), drop = Math.min(range(H.drop), face - 0.3)
      const kind: Kind = R() < H.vine ? 'vine' : 'caper'
      const at = t.out === 'w' ? { x: t.x0, z: a, nx: -1, nz: 0 } : { x: a, z: t.z0, nx: 0, nz: -1 }
      const m = new Mesh()
      curtain(m, at, t.level, w, drop, kind, Math.floor(R() * 1e9))
      const id = nextId(kind)
      plants.push({ id, kind, row: kind === 'vine' ? 'bab.green.vine' : 'bab.green.hanging', x: at.x, z: at.z, y: t.level, h: drop, geometry: m.geometry() })
    }
  }
  const facts = { count, total: plants.length, triangles: plants.reduce((s, p) => s + p.geometry.getAttribute('position').count / 3, 0) }
  return { plants, facts }
}
