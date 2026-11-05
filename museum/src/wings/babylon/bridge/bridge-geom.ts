/* STOP 12'S BODIES (the walk's old stop 13), pure geometry (three's buffers, no DOM), so the map page and the node
   checks build the same: the six river piers in brick with a stone capping, the two land piers, the deck's beams and
   boards, the quay of about 570 BC swept along its lines, and the places of the west bank's plants.
   Scene frame as plan.ts (x east, y up, z south). Every body carries `kind` (0 brick, 1 stone, 2 beam, 3 boards, 4 the
   quay's brick) and `fa` (per kind: brick u along its face and the brick's top; stone the axis' t and c; a beam its
   along and its index; the boards t and c; the quay s along its line and which face). Bodies that touch never share a
   plane: a part reaches a centimetre or more into the one that carries it.
   Only type imports from the wing: node resolves no relative module without its extension. */

import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three/webgpu'
import type { Built, Cls, P2 } from '../map/plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

export const KIND = { brick: 0, stone: 1, beam: 2, boards: 3, quay: 4 } as const

export interface BridgeBody { id: string; geometry: BufferGeometry; band: number; letters: [Cls, Cls] }
export type PlantKind = 'palm' | 'poplar' | 'willow' | 'tamarisk' | 'reed'
export interface PlantSpot { id: string; kind: PlantKind; x: number; z: number; y: number; h: number; yaw: number; lean: number; seed: number }
export interface Pier { n: number; t: number; c: P2; brickTop: number; capTop: number; outline: P2[] }

export interface Bridge {
  bodies: BridgeBody[]
  plants: PlantSpot[]
  piers: Pier[]
  /** the axis: east end, direction (west), north normal, length; a point at (t, c) */
  frame: { a: P2; d: P2; n: P2; length: number; at: (t: number, c: number) => P2 }
  /** the deck's walking level at t */
  deckTop: (t: number) => number
  built: Built
  facts: Record<string, unknown>
}

/** the map bodies this module draws instead of the map */
export const TAKEN_PRISM = (id: string): boolean => /^bridge-pier-\d+$/.test(id) || id === 'arahtu-quay' || id === 'arahtu-quay-2' || id === 'river-wall-south'
export const TAKEN_BOX = (id: string): boolean => /^bridge-(abutment|pier)-/.test(id)
export const TAKEN_RAMP = (id: string): boolean => id === 'bridge-deck'
export const TAKEN_WATER = (id: string): boolean => id === 'euphrates'
/** each kind's foot (its trunk, stems or sheaves) as a share of its height, and the most the ground may fall under a
    foot (a share of the height) before the spot is left bare */
const FOOT: Record<PlantKind, number> = { palm: 0.04, poplar: 0.035, willow: 0.04, tamarisk: 0.11, reed: 0.15 }
const STEEP: Record<PlantKind, number> = { palm: 0.15, poplar: 0.15, willow: 0.15, tamarisk: 0.15, reed: 0.4 }

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]]
const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]]
const mul = (a: P2, k: number): P2 => [a[0] * k, a[1] * k]
const len = (a: P2): number => Math.hypot(a[0], a[1])
const norm = (a: P2): P2 => mul(a, 1 / (len(a) || 1))

export function inPoly(p: P2, poly: P2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}
export function edgeDist(p: P2, poly: P2[], closed = true): number {
  let d = Infinity
  const n = closed ? poly.length : poly.length - 1
  for (let i = 0; i < n; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!
    const ab = sub(b, a), ap = sub(p, a), L2 = ab[0] * ab[0] + ab[1] * ab[1]
    const t = L2 > 0 ? Math.min(1, Math.max(0, (ap[0] * ab[0] + ap[1] * ab[1]) / L2)) : 0
    d = Math.min(d, len(sub(p, add(a, mul(ab, t)))))
  }
  return d
}
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

/* ── a triangle soup with the shared attribute set; a normal per vertex where given, else the face's ── */
class Soup {
  pos: number[] = []
  nrm: number[] = []
  kind: number[] = []
  fa: number[] = []
  tri(p: number[][], k: number, f: number[][], n?: number[][]): void {
    let fn: number[] | null = null
    if (!n) {
      const u = [0, 1, 2].map((i) => p[1]![i]! - p[0]![i]!), v = [0, 1, 2].map((i) => p[2]![i]! - p[0]![i]!)
      const c = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
      const l = Math.hypot(c[0]!, c[1]!, c[2]!) || 1
      fn = c.map((x) => x / l)
    }
    for (let j = 0; j < 3; j++) {
      this.pos.push(...p[j]!)
      this.nrm.push(...(n ? n[j]! : fn!))
      this.kind.push(k)
      this.fa.push(...f[j]!)
    }
  }
  /** a quad p0 p1 p2 p3, counter-clockwise seen from its front */
  quad(p: number[][], k: number, f: number[][], n?: number[][]): void {
    this.tri([p[0]!, p[1]!, p[2]!], k, [f[0]!, f[1]!, f[2]!], n && [n[0]!, n[1]!, n[2]!])
    this.tri([p[0]!, p[2]!, p[3]!], k, [f[0]!, f[2]!, f[3]!], n && [n[0]!, n[2]!, n[3]!])
  }
  /** a flat ring (scene x, z) at y, wound to face up or down */
  cap(ring: P2[], y: number, up: boolean, k: number, f: (p: P2) => number[]): void {
    for (const [i, j, m] of ShapeUtils.triangulateShape(ring.map(([x, z]) => new Vector2(x, z)), [])) {
      const A = ring[i!]!, B = ring[j!]!, C = ring[m!]!
      const ny = (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1])
      const tri = (ny > 0) === up ? [A, B, C] : [A, C, B]
      this.tri(tri.map((q) => [q[0], y, q[1]]), k, tri.map(f), Array(3).fill([0, up ? 1 : -1, 0]))
    }
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('kind', new Float32BufferAttribute(this.kind, 1))
    g.setAttribute('fa', new Float32BufferAttribute(this.fa, 4))
    return g
  }
}

/** a closed outline (counter-clockwise or not) moved inward by d (negative: outward), mitred, its sharp tip kept sharp */
function inset(ring: P2[], d: number): P2[] {
  const n = ring.length
  let area = 0
  for (let i = 0; i < n; i++) area += ring[i]![0] * ring[(i + 1) % n]![1] - ring[(i + 1) % n]![0] * ring[i]![1]
  const s = area > 0 ? 1 : -1
  return ring.map((p, i) => {
    const a = ring[(i + n - 1) % n]!, b = ring[(i + 1) % n]!
    const e1 = norm(sub(p, a)), e2 = norm(sub(b, p))
    // inward normals of the two edges
    const n1: P2 = [-e1[1] * s, e1[0] * s], n2: P2 = [-e2[1] * s, e2[0] * s]
    const m = norm(add(n1, n2))
    const cos = Math.max(0.3, m[0] * n1[0] + m[1] * n1[1])
    return add(p, mul(m, d / cos))
  })
}

/** the horizontal outward normal at each vertex of a ring: smooth where the turn is gentle, else one per side (sharp) */
function ringNormals(ring: P2[]): Array<{ before: P2; after: P2 }> {
  const n = ring.length
  let area = 0
  for (let i = 0; i < n; i++) area += ring[i]![0] * ring[(i + 1) % n]![1] - ring[(i + 1) % n]![0] * ring[i]![1]
  const s = area > 0 ? 1 : -1
  const out = (i: number): P2 => {
    const e = norm(sub(ring[(i + 1) % n]!, ring[i]!))
    return [e[1] * s, -e[0] * s]
  }
  return ring.map((_, i) => {
    const nb = out((i + n - 1) % n), na = out(i)
    const sharp = nb[0] * na[0] + nb[1] * na[1] < Math.cos((28 * Math.PI) / 180)
    const m = norm(add(nb, na))
    return sharp ? { before: nb, after: na } : { before: m, after: m }
  })
}

/** battered sides between rings at levels ys (each ring vertex for vertex with the first), u the arc length along it */
function loftSides(q: Soup, rings: P2[][], ys: number[], batter: number, kind: number, fa: (u: number, y: number) => number[]): void {
  const base = rings[0]!, n = base.length
  const us = [0]
  for (let i = 1; i <= n; i++) us.push(us[i - 1]! + len(sub(base[i % n]!, base[i - 1]!)))
  const nr = ringNormals(base)
  const k = 1 / Math.hypot(1, batter)
  const N = (h: P2): number[] => [h[0] * k, batter * k, h[1] * k]
  for (let r = 0; r + 1 < rings.length; r++) {
    const R0 = rings[r]!, R1 = rings[r + 1]!, y0 = ys[r]!, y1 = ys[r + 1]!
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const na = N(nr[i]!.after), nb = N(nr[j]!.before)
      q.quad([[R0[i]![0], y0, R0[i]![1]], [R0[j]![0], y0, R0[j]![1]], [R1[j]![0], y1, R1[j]![1]], [R1[i]![0], y1, R1[i]![1]]], kind,
        [fa(us[i]!, y0), fa(us[i + 1]!, y0), fa(us[i + 1]!, y1), fa(us[i]!, y1)], [na, nb, nb, na])
    }
  }
}

/** a convex body of eight corners (the foot's four, then the top's four in the same order), each face wound outward */
function hexa(q: Soup, c: number[][], kind: number, fa: (p: number[]) => number[]): void {
  const ctr = [0, 1, 2].map((k) => c.reduce((s, p) => s + p[k]!, 0) / 8)
  const face = (p: number[][]): void => {
    const u = [0, 1, 2].map((k) => p[1]![k]! - p[0]![k]!), v = [0, 1, 2].map((k) => p[2]![k]! - p[0]![k]!)
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
    const m = [0, 1, 2].map((k) => (p[0]![k]! + p[1]![k]! + p[2]![k]! + p[3]![k]!) / 4 - ctr[k]!)
    const w = n[0]! * m[0]! + n[1]! * m[1]! + n[2]! * m[2]! >= 0 ? p : [p[0]!, p[3]!, p[2]!, p[1]!]
    q.quad(w, kind, w.map(fa))
  }
  face([c[0]!, c[1]!, c[2]!, c[3]!])
  face([c[4]!, c[5]!, c[6]!, c[7]!])
  for (let k = 0; k < 4; k++) face([c[k]!, c[(k + 1) % 4]!, c[4 + ((k + 1) % 4)]!, c[4 + k]!])
}

export function buildBridge(built: Built, mapPlan: J, bp: J): Bridge {
  const E0: number = mapPlan.frame.E0, N0: number = mapPlan.frame.N0
  const S = (E: number, N: number): P2 => [E - E0, N0 - N]
  const br = mapPlan.bridge
  const A = S(br.axis[0][0], br.axis[0][1]), B = S(br.axis[1][0], br.axis[1][1])
  const d = norm(sub(B, A)), length = len(sub(B, A))
  // across the axis toward the north (scene -z): the side the bows face
  let nn: P2 = [d[1], -d[0]]
  if (nn[1] > 0) nn = mul(nn, -1)
  const at = (t: number, c: number): P2 => add(add(A, mul(d, t)), mul(nn, c))
  const deckTop = (t: number): number => {
    const p = at(Math.min(Math.max(t, 0), length), 0)
    return built.streetAt(p[0], p[1]).level
  }
  const P = br.piers, LP = br.abutments, D = bp.deck, CP = bp.capping
  const batter: number = P.batter
  const WL: number = mapPlan.water.find((w: J) => w.id === 'euphrates').level
  const bodies: BridgeBody[] = []
  const BAND: number = mapPlan.classes.band
  const body = (id: string, q: Soup, band: number, letters: [Cls, Cls]): void => { bodies.push({ id, geometry: q.geometry(), band, letters }) }
  /** the plan outline (u along, v north) at a pier's centre t, in scene metres */
  const outlineAt = (t: number): P2[] => P.outline.map((o: number[]) => at(t + o[0]!, o[1]!))
  const tf = (p: number[]): number[] => {
    // a scene point's t and c on the axis
    const r = sub([p[0]!, p[2]!], A)
    return [r[0] * d[0] + r[1] * d[1], r[0] * nn[0] + r[1] * nn[1], 0, 0]
  }

  /* ── the six river piers: brick from the foundation to under the capping, battered from the waterline; the capping ── */
  const piers: Pier[] = []
  for (let i = 0; i < P.count; i++) {
    const t = P.first + i * (P.along + P.gap)
    const capTop = deckTop(t) - D.boards - D.beams.h + 0.03
    const brickTop = capTop - CP.thick
    const foot = outlineAt(t)
    const rings = [inset(foot, batter * (P.base - WL)), foot, inset(foot, batter * (brickTop - WL))]
    const q = new Soup()
    loftSides(q, rings, [P.base, WL, brickTop], batter, KIND.brick, (u, y) => [u, brickTop, i, 0])
    // the brick's top under the capping: the course the slabs are bedded on
    q.cap(rings[2]!, brickTop, true, KIND.brick, () => [0, brickTop, i, 0])
    body(`bridge-pier-${i + 1}`, q, P.base + BAND, [P.plan, 'M'])
    const cap = new Soup()
    const top = inset(foot, batter * (brickTop - WL) - CP.over)
    loftSides(cap, [top, top], [brickTop - 0.03, capTop], 0, KIND.stone, (u, y) => [u, y, i, 1])
    cap.cap(top, capTop, true, KIND.stone, (p) => { const r = tf([p[0], 0, p[1]]); return [r[0]!, r[1]!, i, 0] })
    body(`bridge-piertop-${i + 1}`, cap, brickTop - 1, ['G', 'G'])
    piers.push({ n: i + 1, t, c: at(t, 0), brickTop, capTop, outline: foot })
  }

  /* ── the land piers: brick with battered river faces, paved on top just under the deck's level ── */
  const land = (id: string, s: J, battered: [boolean, boolean]): void => {
    const q = new Soup()
    const half = s.across / 2
    // a river face stands out by the batter below the waterline and in above it; a face on land does not lean
    const b = (y: number): number => batter * (y - WL)
    const yT0 = deckTop(s.from) - 0.02, yT1 = deckTop(s.to) - 0.02
    const C = (tt: number, cc: number, y: number): number[] => { const p = at(tt, cc); return [p[0], y, p[1]] }
    const ring = (y: number): number[][] => {
      const f = s.from + (battered[0] ? b(y) : 0), t = s.to - (battered[1] ? b(y) : 0), h = half - b(y)
      return [C(f, -h, y), C(t, -h, y), C(t, h, y), C(f, h, y)]
    }
    const lo = ring(P.base), hi = ring(0)
    // the top follows the deck's slope from end to end
    const top = hi.map((p, k) => { const r = tf(p); const yy = k === 0 || k === 3 ? yT0 : yT1; const pp = ring(yy)[k]!; void r; return [pp[0]!, yy, pp[2]!] })
    hexa(q, [...lo, ...top], KIND.brick, () => [0, Math.max(yT0, yT1), -1, 0])
    body(id, q, P.base + BAND, [LP.plan, LP.height])
  }
  land('bridge-landpier-east', LP.east, [false, true])
  land('bridge-landpier-west', LP.west, [true, false])

  /* ── the deck: beams along the axis from support to support, the boards across them as one slab ── */
  {
    const Bm = D.beams, w: number = D.w
    const supports = [LP.east.to - 0.6, ...piers.map((p) => p.t), LP.west.from + 0.6]
    const q = new Soup()
    for (let k = 0; k < Bm.n; k++) {
      const c = -w / 2 + (k + 0.5) * (w / Bm.n)
      for (let s = 0; s + 1 < supports.length; s++) {
        const t0 = supports[s]! + (s > 0 ? Bm.gap / 2 : 0), t1 = supports[s + 1]! - (s + 2 < supports.length ? Bm.gap / 2 : 0)
        const yb0 = deckTop(t0) - D.boards + 0.01 - Bm.h, yb1 = deckTop(t1) - D.boards + 0.01 - Bm.h
        const C = (tt: number, cc: number, y: number): number[] => { const p = at(tt, cc); return [p[0], y, p[1]] }
        hexa(q, [C(t0, c - Bm.w / 2, yb0), C(t1, c - Bm.w / 2, yb1), C(t1, c + Bm.w / 2, yb1), C(t0, c + Bm.w / 2, yb0),
          C(t0, c - Bm.w / 2, yb0 + Bm.h), C(t1, c - Bm.w / 2, yb1 + Bm.h), C(t1, c + Bm.w / 2, yb1 + Bm.h), C(t0, c + Bm.w / 2, yb0 + Bm.h)],
        KIND.beam, (p) => { const r = tf(p); return [r[0]!, r[1]!, k + s * 0.01, 0] })
      }
    }
    body('bridge-deck-beams', q, -10, ['G', 'G'])
    const b = new Soup()
    const t0 = LP.east.to - D.lap, t1 = LP.west.from + D.lap
    const C = (tt: number, cc: number, y: number): number[] => { const p = at(tt, cc); return [p[0], y, p[1]] }
    hexa(b, [C(t0, -w / 2, deckTop(t0) - D.boards), C(t1, -w / 2, deckTop(t1) - D.boards), C(t1, w / 2, deckTop(t1) - D.boards), C(t0, w / 2, deckTop(t0) - D.boards),
      C(t0, -w / 2, deckTop(t0)), C(t1, -w / 2, deckTop(t1)), C(t1, w / 2, deckTop(t1)), C(t0, w / 2, deckTop(t0))], KIND.boards, (p) => tf(p))
    body('bridge-deck-boards', b, -10, ['G', 'G'])
  }

  /* ── the quay of about 570 BC: the facing wall's profile swept along its lines (north of the bridge, and south) ── */
  const Q = bp.quay
  const wall = (id: string): J => mapPlan.walls.find((w: J) => w.id === id)
  const lines: Array<{ id: string; line: P2[] }> = [
    { id: 'bridge-quay-north', line: wall('arahtu-quay').line.map((p: number[]) => S(p[0]!, p[1]!)) },
    { id: 'bridge-quay-south', line: [...wall('arahtu-quay-2').line, ...wall('river-wall-south').line.slice(1)].map((p: number[]) => S(p[0]!, p[1]!)) },
  ]
  const quayFacts: Record<string, unknown> = {}
  for (const { id, line } of lines) {
    // offsets toward the land from the water face; the drawn line is the wall's middle, the water on its right going south
    const half = Q.thick / 2
    const right = (i: number): P2 => {
      const dd = i + 1 < line.length ? norm(sub(line[i + 1]!, line[i]!)) : norm(sub(line[i]!, line[i - 1]!))
      return [-dd[1], dd[0]]
    }
    // the outward (water) side is the one whose normal points west in the scene (-x)
    const sgn = right(0)[0] < 0 ? 1 : -1
    const off = (i: number, o: number): P2 => {
      const prev = i > 0 ? mul(right(i - 1), sgn) : null, next = i + 1 < line.length ? mul(right(i), sgn) : null
      const m = norm(add(prev ?? next!, next ?? prev!))
      const cos = Math.max(0.3, m[0] * (next ?? prev!)[0] + m[1] * (next ?? prev!)[1])
      return add(line[i]!, mul(m, (half - o) / cos))
    }
    const prof: Array<[number, number]> = [[0, Q.base], [0, Q.walkwayFront], [Q.walkway, Q.banquette], [Q.walkway, Q.top], [Q.thick, Q.top], [Q.thick, Q.base]]
    const s: number[] = [0]
    for (let i = 1; i < line.length; i++) s.push(s[i - 1]! + len(sub(line[i]!, line[i - 1]!)))
    const q = new Soup()
    for (let i = 0; i + 1 < line.length; i++) {
      for (let e = 0; e + 1 < prof.length; e++) {
        const [o0, y0] = prof[e]!, [o1, y1] = prof[e + 1]!
        const a0 = off(i, o0), a1 = off(i, o1), b0 = off(i + 1, o0), b1 = off(i + 1, o1)
        const pts = [[a0[0], y0, a0[1]], [b0[0], y0, b0[1]], [b1[0], y1, b1[1]], [a1[0], y1, a1[1]]]
        const fa = [[s[i]!, e, o0, 0], [s[i + 1]!, e, o0, 0], [s[i + 1]!, e, o1, 0], [s[i]!, e, o1, 0]]
        // wind each face outward: its normal away from the profile's middle
        const mid = add(off(i, Q.thick / 2), off(i + 1, Q.thick / 2)), m = [mid[0] / 2, (Q.top + Q.base) / 2, mid[1] / 2]
        const u = [0, 1, 2].map((k) => pts[1]![k]! - pts[0]![k]!), v = [0, 1, 2].map((k) => pts[3]![k]! - pts[0]![k]!)
        const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
        const c = [0, 1, 2].map((k) => (pts[0]![k]! + pts[2]![k]!) / 2 - m[k]!)
        if (n[0]! * c[0]! + n[1]! * c[1]! + n[2]! * c[2]! >= 0) q.quad(pts, KIND.quay, fa)
        else q.quad([pts[0]!, pts[3]!, pts[2]!, pts[1]!], KIND.quay, [fa[0]!, fa[3]!, fa[2]!, fa[1]!])
      }
    }
    // the two ends: the profile as a flat cap
    for (const [i, out] of [[0, -1], [line.length - 1, 1]] as Array<[number, number]>) {
      const dd = i + 1 < line.length ? norm(sub(line[i + 1]!, line[i]!)) : norm(sub(line[i]!, line[i - 1]!))
      const ring = prof.map(([o, y]) => { const p = off(i, o); return [p[0], y, p[1]] })
      const flat = prof.map(([o, y]) => new Vector2(o, y))
      for (const [a, b, c] of ShapeUtils.triangulateShape(flat, [])) {
        const tri = [ring[a!]!, ring[b!]!, ring[c!]!]
        const u = [0, 1, 2].map((k) => tri[1]![k]! - tri[0]![k]!), v = [0, 1, 2].map((k) => tri[2]![k]! - tri[0]![k]!)
        const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
        const w = (n[0]! * dd[0] + n[2]! * dd[1]) * out >= 0 ? tri : [tri[0]!, tri[2]!, tri[1]!]
        q.tri(w, KIND.quay, w.map(() => [s[i]!, 5, 0, 0]))
      }
    }
    body(id, q, Q.base + BAND, ['R', 'R'])
    quayFacts[id] = { length: +s[s.length - 1]!.toFixed(1), ends: [line[0]!, line[line.length - 1]!].map((p) => [+(p[0] + E0).toFixed(2), +(N0 - p[1]).toFixed(2)]) }
  }

  /* ── the west bank's plants: palms in a grove behind the bank, poplars and willows along it, tamarisks on its slope ── */
  const water = built.water.find((w) => w.id === 'euphrates')!.poly
  const G = bp.green, R = rng(G.seed)
  const wb = bp.westBank
  // the water's west edge at a northing: the westmost crossing of the river's outline
  const zN = N0 - wb.to, zS = N0 - wb.from
  const edgeX = (z: number): number => {
    let x = Infinity
    for (let i = 0; i < water.length; i++) {
      const a = water[i]!, b = water[(i + 1) % water.length]!
      if ((a[1] > z) !== (b[1] > z)) x = Math.min(x, a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]))
    }
    return x
  }
  const houses = built.boxes.filter((b) => b.group === 'house')
  const nearHouse = (p: P2, clear: number): boolean => houses.some((h) => Math.abs(h.x - p[0]) < h.sx / 2 + h.sz / 2 + clear && Math.abs(h.z - p[1]) < h.sx / 2 + h.sz / 2 + clear && Math.hypot(h.x - p[0], h.z - p[1]) < Math.max(h.sx, h.sz) / 2 + clear)
  const plants: PlantSpot[] = []
  const mid = at(length / 2, 0)
  const place = (kind: PlantKind, near: number, far: number, step: number, keep: number, hr: [number, number]): void => {
    for (let z = zN; z <= zS; z += step) {
      for (let o = near; o <= far; o += step) {
        if (R() > keep) continue
        // tamarisks stand in thickets along the bank with gaps between, never as one even row
        if (kind === 'tamarisk' && Math.sin(z * 0.021 + 1.3) + Math.sin(z * 0.057 + 0.4) * 0.6 < 0.1) continue
        const zz = z + (R() - 0.5) * step * 0.8
        // the edge's x at this z, then o metres west of it
        const ex = edgeX(zz)
        if (!Number.isFinite(ex)) continue
        const p: P2 = [ex - o - (R() - 0.5) * step * 0.6, zz]
        if (inPoly(p, water) && o > 0) continue
        const st = built.streetAt(p[0], p[1])
        if (st.d < st.w / 2 + G.streetClear) continue
        if (nearHouse(p, G.houseClear + (kind === 'palm' ? 2 : 1))) continue
        const h = hr[0] + R() * (hr[1] - hr[0])
        // the foot sits at the lowest ground under it, so no side of it hangs over a falling bank
        const r = FOOT[kind] * h
        const y0 = built.ground(p[0], p[1])
        let y = y0, hi = y0
        for (let k = 0; k < 8; k++) {
          const g = built.ground(p[0] + Math.cos((k * Math.PI) / 4) * r, p[1] + Math.sin((k * Math.PI) / 4) * r)
          y = Math.min(y, g)
          hi = Math.max(hi, g)
        }
        if (hi - y > STEEP[kind] * h) continue
        // the bank's own plants keep to it: tamarisks above the water, reeds at its foot on the earth, never in the water
        if (kind === 'tamarisk' && y0 < WL + 0.15) continue
        if (kind === 'reed' && (y0 < WL - 0.1 || y0 > WL + 1.2)) continue
        // a reed clump's sheaves fan across its local x: turned to face the bridge's middle, where it is seen from
        const yaw = kind === 'reed' ? Math.atan2(-(mid[1] - p[1]), mid[0] - p[0]) + (R() - 0.5) * 0.5 : R() * Math.PI * 2
        plants.push({ id: `bridge-${kind}-${plants.length}`, kind, x: p[0], z: p[1], y, h, yaw, lean: (R() - 0.5) * 0.12, seed: Math.floor(R() * 1e6) })
      }
    }
  }
  place('palm', G.palms.near, G.palms.far, G.palms.step, G.palms.keep, G.palms.h)
  {
    const T = G.trees
    const before = plants.length
    place('poplar', T.near, T.far, T.step, 0.8, T.h)
    // every other one along the bank a willow
    plants.slice(before).forEach((p, k) => { if (k % 2) { p.kind = 'willow'; p.id = p.id.replace('poplar', 'willow'); p.h *= 0.8 } })
  }
  place('tamarisk', G.tamarisks.near, G.tamarisks.far, G.tamarisks.step, 0.75, G.tamarisks.h)
  place('reed', G.reeds.near, G.reeds.far, G.reeds.step, G.reeds.keep, G.reeds.h)

  const keepBox = (id: string): boolean => !TAKEN_BOX(id)
  const facts = {
    axis: { length: +length.toFixed(2), bearing: +(((Math.atan2(d[0], -d[1]) * 180) / Math.PI + 360) % 360).toFixed(2) },
    piers: piers.map((p) => ({ n: p.n, t: +p.t.toFixed(2), centre: [+(p.c[0] + E0).toFixed(2), +(N0 - p.c[1]).toFixed(2)], brickTop: +p.brickTop.toFixed(2), capTop: +p.capTop.toFixed(2) })),
    pierSize: { along: P.along, across: P.across, gap: P.gap, batter },
    landPiers: { east: [LP.east.from, LP.east.to], west: [LP.west.from, LP.west.to], span: +(LP.west.from - LP.east.to).toFixed(2) },
    deck: { w: D.w, from: LP.east.to - D.lap, to: LP.west.from + D.lap, top: [+deckTop(0).toFixed(2), +deckTop(length).toFixed(2)] },
    water: WL,
    quay: quayFacts,
    plants: { palm: plants.filter((p) => p.kind === 'palm').length, poplar: plants.filter((p) => p.kind === 'poplar').length, willow: plants.filter((p) => p.kind === 'willow').length, tamarisk: plants.filter((p) => p.kind === 'tamarisk').length, reed: plants.filter((p) => p.kind === 'reed').length },
  }
  return {
    bodies, plants, piers, deckTop,
    frame: { a: A, d, n: nn, length, at },
    built: {
      ...built,
      prisms: built.prisms.filter((p) => !TAKEN_PRISM(p.id)),
      boxes: built.boxes.filter((b) => keepBox(b.id)),
      ramps: built.ramps.filter((r) => !TAKEN_RAMP(r.id)),
      water: built.water.filter((w) => !TAKEN_WATER(w.id)),
    },
    facts,
  }
}
