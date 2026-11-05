/* STOP 5'S PLANTING, geometry with vertex colours: the guessed garden on the edge terraces. The trees are the stack's
   tree kit's, grown in the page through the wing's adapter (plants/grown.ts, which a page loads; node mounts each
   tree's stand-in, its crown's bounds as one closed body, so the checks run without a DOM); the date palms are the
   gate's own at their mid preset (passed in, so this module keeps no relative import for node); vine curtains and
   caper mounds hang over the terraces' own edges. Every vertex carries `leaf` (1 foliage, 0 wood) and `centre` (its
   crown's middle, for the leaves' light). April (the flora's seasons): the deciduous kinds in new leaf, no fruit. */

import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'
import type { GardensFrame, Strip } from './gardens-geom'
import type { GrowSpec, Spray } from '../plants/grown'
import type { Species } from '../../../stack/parts/planting'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
type V3 = [number, number, number]

export type Kind = 'palm' | 'cypress' | 'broad' | 'tamarisk' | 'pomegranate' | 'fig' | 'shrub' | 'vine' | 'caper'
export interface Plant { id: string; kind: Kind; row: string; x: number; z: number; y: number; h: number; geometry: BufferGeometry; crown?: { y0: number; y1: number; rx: number; rz: number }; grown?: boolean; r?: number }
/** the gate's palm builder (gate-life.ts palmGeometry): one palm at the origin, its foot at 0 */
export type PalmBuilder = (h: number, detail: { seg: number; sides: number; fronds: number; steps: number }, seed: number) => BufferGeometry

/** the kit's trees grow only where a page can draw their leaf atlas */
const kit: typeof import('../plants/grown') | null = typeof document === 'undefined' ? null : await import('../plants/grown')

const rnd = (seed: number): (() => number) => {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

/** each tree kind as the kit grows it: its species row, how it carries its leaves, its April leaf and its bark (linear
    albedos, ours, from the photo sheet's kinds); `base` is the share of the height the kit starts the crown at, `hang`
    how far its lowest sprays reach below that (m, measured on the grown gardens) */
interface TreeKind { species: Species; spray: Spray; leaf: V3; wood: V3; base: number; hang: number; lod: 1 | 2 }
const TREES: Partial<Record<Kind, TreeKind>> = {
  broad: { species: 'terebinth', spray: 'broad', leaf: [0.076, 0.108, 0.038], wood: [0.12, 0.1, 0.08], base: 0.28, hang: 0.4, lod: 1 },
  tamarisk: { species: 'tamarisk', spray: 'thread', leaf: [0.08, 0.098, 0.07], wood: [0.13, 0.085, 0.062], base: 0.18, hang: 0.6, lod: 1 },
  pomegranate: { species: 'pomegranate', spray: 'narrow', leaf: [0.07, 0.1, 0.03], wood: [0.12, 0.11, 0.09], base: 0.12, hang: 0.15, lod: 1 },
  fig: { species: 'fig', spray: 'broad', leaf: [0.1, 0.14, 0.045], wood: [0.24, 0.22, 0.19], base: 0.2, hang: 0, lod: 1 },
  cypress: { species: 'cypress', spray: 'scale', leaf: [0.03, 0.048, 0.024], wood: [0.11, 0.085, 0.062], base: 0.06, hang: 0, lod: 1 },
  shrub: { species: 'shrub', spray: 'broad', leaf: [0.065, 0.088, 0.038], wood: [0.11, 0.085, 0.062], base: 0.06, hang: 0.5, lod: 1 },
}
/** the leaves reach this far past the kit's crown (a spray's card), and the stand-in keeps that margin */
const MARGIN = 0.65
/** the stand-in's bounds of a grown tree: the crown from its base share (less its hanging sprays) to the top, its radius,
    and the margin; a shrub's lowest sprays touch the ground, so its stand-in's foot may lie a little under it */
export function standInCrown(kind: Kind, h: number, r: number): { y0: number; y1: number; rx: number; rz: number } {
  const t = TREES[kind]!
  return { y0: Math.max(-0.3, h * t.base - MARGIN - t.hang), y1: h + MARGIN, rx: r + MARGIN, rz: r + MARGIN }
}
const WOOD: V3 = [0.11, 0.085, 0.062]
/** linear albedos of the hanging green, April; ours, from the photo sheet's kinds */
const LEAF: Partial<Record<Kind, V3>> = { vine: [0.105, 0.15, 0.038], caper: [0.07, 0.095, 0.05] }

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

/** a lobe for the hanging curtains' clumps: an icosahedron scaled to `r`, each corner a little in or out, its normals
    bent toward the curtain's middle */
function lobe(m: Mesh, c: V3, r: [number, number, number], crown: V3, col: V3, r01: () => number, bend = 0.5): void {
  const k = ICO_V.map(() => 0.86 + r01() * 0.24)
  const P = ICO_V.map((v, i): V3 => [c[0] + v[0] * r[0] * k[i]!, c[1] + v[1] * r[1] * k[i]!, c[2] + v[2] * r[2] * k[i]!])
  const N = P.map((p, i): V3 => {
    const own = ICO_V[i]!
    const out = norm([p[0] - crown[0], (p[1] - crown[1]) * 1.4, p[2] - crown[2]])
    return norm([own[0] * (1 - bend) + out[0] * bend, own[1] * (1 - bend) + out[1] * bend, own[2] * (1 - bend) + out[2] * bend])
  })
  for (const f of ICO_F) m.tri(P[f[0]!]!, P[f[1]!]!, P[f[2]!]!, [N[f[0]!]!, N[f[1]!]!, N[f[2]!]!], col, 1, crown)
}

/** a grown tree's stand-in for node: one closed body over the crown's bounds (an icosahedron stretched to them, its
    lowest corner on the crown's foot) and a four-sided stem from the ground to it */
function standIn(m: Mesh, x: number, y: number, z: number, b: { y0: number; y1: number; rx: number; rz: number }, col: V3): void {
  const cy = y + (b.y0 + b.y1) / 2, hy = (b.y1 - b.y0) / 2
  const crown: V3 = [x, cy, z]
  // the icosahedron's corners reach 0.85 of its radius along y: stretched so its top and foot touch the bounds
  const ky = hy / 0.8507
  const P = ICO_V.map((v): V3 => [x + v[0] * b.rx, cy + v[1] * ky, z + v[2] * b.rz])
  for (const f of ICO_F) m.tri(P[f[0]!]!, P[f[1]!]!, P[f[2]!]!, [ICO_V[f[0]!]!, ICO_V[f[1]!]!, ICO_V[f[2]!]!], col, 1, crown)
  const foot = Math.min(...P.map((p) => p[1]))
  const w = 0.25
  const q: V3[] = [[x - w, 0, z - w], [x + w, 0, z - w], [x + w, 0, z + w], [x - w, 0, z + w]]
  for (let k = 0; k < 4; k++) {
    const a = q[k]!, b2 = q[(k + 1) % 4]!
    const n = norm([a[0] + b2[0] - 2 * x, 0, a[2] + b2[2] - 2 * z])
    const lo = (p: V3): V3 => [p[0], y - 0.3, p[2]], hi = (p: V3): V3 => [p[0], foot + 0.4, p[2]]
    m.tri(lo(a), lo(b2), hi(b2), [n, n, n], WOOD, 0, crown)
    m.tri(lo(a), hi(b2), hi(a), [n, n, n], WOOD, 0, crown)
  }
}

const tint = (c: V3, k: number): V3 => [c[0] * k, c[1] * k, c[2] * k]

/** a hanging curtain over a terrace's edge: a lip on the top, then a ragged sheet down the face, bulging out from it */
function curtain(m: Mesh, at: { x: number; z: number; nx: number; nz: number }, top: number, w: number, drop: number, kind: Kind, seed: number): void {
  const R = rnd(seed)
  const cols = 4, rows = 4
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
        row.push([at.x - at.nx * 0.55 + tx * u, top + 0.25 + R() * 0.1, at.z - at.nz * 0.55 + tz * u])
        continue
      }
      const t = (j - 1) / rows
      const d = ends[i]! * Math.min(1, t * (0.85 + edgeK * 0.15))
      const bulge = 0.12 + (0.18 + R() * 0.2) * Math.sin(Math.PI * Math.min(1, t + 0.15)) * (0.5 + edgeK * 0.5)
      row.push([at.x + at.nx * bulge + tx * u * (1 - t * 0.12), top - Math.max(d, j === 1 ? 0.3 : (j - 1) * 0.25 + 0.3), at.z + at.nz * bulge + tz * u * (1 - t * 0.12)])
    }
    grid.push(row)
  }
  const col = (j: number): V3 => tint(LEAF[kind]!, (0.85 + R() * 0.25) * (1 - j * 0.04))
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
    lobe(m, c, [r, r * 0.9, r], centre, col(1), R)
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

  const put = (k0: Kind, x: number, z: number, y: number, room: number): void => {
    const spec = P.kinds[k0]
    const h = range(spec.h)
    // the royal garden's broad trees: terebinths, and tamarisks under their own row (the Assyrian kings' lists name both)
    const k: Kind = k0 === 'broad' && R() < 0.4 ? 'tamarisk' : k0
    const row: string = k === 'tamarisk' ? 'bab.green.tamarisk' : spec.row
    const id = nextId(k)
    const seed = Math.floor(R() * 1e9)
    const m = new Mesh()
    if (k === 'palm') {
      const g = palm(h, palmDetail, seed % 997)
      const turn = R() * Math.PI * 2, c = Math.cos(turn), s = Math.sin(turn)
      const lean: [number, number] = [(R() - 0.5) * 1.6, (R() - 0.5) * 1.6]
      const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), col = g.getAttribute('color'), lf = g.getAttribute('leaf')
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
          if (lf ? lf.getX(i + j) > 0.5 : py > h * 0.9) isLeaf = 1
        }
        const cc: V3 = [col.getX(i) * tone, col.getY(i) * tone, col.getZ(i) * tone]
        m.tri(v[0]!, v[1]!, v[2]!, [n[0]!, n[1]!, n[2]!], cc, isLeaf, crown)
      }
      plants.push({ id, kind: k, row, x, z, y, h, geometry: m.geometry() })
      return
    }
    const t = TREES[k]!
    const r = Math.min(range(spec.r), room)
    if (kit) {
      const g = kit.grow({ species: t.species, height: h, radius: r, seed, spray: t.spray, leaf: tint(t.leaf, 0.92 + R() * 0.16), wood: t.wood, lod: t.lod } satisfies GrowSpec)
      const at = g.geometry.getAttribute('position') as Float32BufferAttribute, cen = g.geometry.getAttribute('centre') as Float32BufferAttribute
      for (let i = 0; i < at.count; i++) {
        at.setXYZ(i, at.getX(i) + x, at.getY(i) + y, at.getZ(i) + z)
        cen.setXYZ(i, cen.getX(i) + x, cen.getY(i) + y, cen.getZ(i) + z)
      }
      plants.push({ id, kind: k, row, x, z, y, h, geometry: g.geometry, crown: g.crown, grown: true, r })
    } else {
      R()
      const b = standInCrown(k, h, r)
      standIn(m, x, y, z, b, t.leaf)
      plants.push({ id, kind: k, row, x, z, y, h, geometry: m.geometry(), crown: b, grown: false, r })
    }
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
