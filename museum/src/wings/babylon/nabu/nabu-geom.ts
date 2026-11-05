/* STOP 8'S BODIES, pure geometry (three's buffers, no DOM), so the map page and the node checks build the same: the
   Nabu temple on its plan with its two courts, its cellas, the vestibule, the gate towers with their grooves, the
   pilasters and battlements; the Ashratum temple before it; the open ground before the gate. Scene frame as plan.ts
   (x east, y up, z south). The temple is axis-aligned, so its volume is a grid of cells, each a stack of solid spans,
   and only the faces between a solid and an empty span (or two bodies) are drawn: no body overlaps another in a plane.
   Only type imports from the wing: node resolves no relative module without its extension. */

import { BoxGeometry, BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape } from 'three/webgpu'
import type { Built, Cls, P2 } from '../map/plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

/** what a face shows, by the space it looks into: the material branches on this code */
export const SURF = {
  exterior: 0, courtWall: 1, bandedRoom: 2, room: 3, smallCourt: 4, black: 5, reveal: 6, soffit: 7, ceiling: 8,
  paving: 9, deck: 10, coping: 11, parapet: 12, earth: 13, ashratum: 14, merlon: 15, altar: 16, pedestal: 17, leaf: 18,
  sill: 19,
} as const

/** the space an empty span of a cell belongs to */
const SPACE = { outside: 0, court: 1, small: 2, cella: 3, smallCella: 4, vestibule: 5, side: 6, door: 7, roof: 8, ashCourt: 9, ashRoof: 10 } as const

export interface Box2 { x0: number; x1: number; z0: number; z1: number }
export interface DoorF { id: string; wall: 'x' | 'z'; box: Box2; c: number; w: number; top: number }

export interface NabuFrame {
  floor: number
  pave: number
  ceiling: number
  deck: number
  top: number
  towerTop: number
  outline: Box2
  court: Box2
  small: Box2
  rooms: Record<string, Box2>
  doors: DoorF[]
  niche: Box2 & { top: number; sill: number }
  /** the god's pedestal in the cella: its plan box, its top, the cut of its front corners */
  pedestal: Box2 & { top: number; chamfer: number }
  /** the court's altar block as tiers (each a plan box and a top) and the two low blocks beside the cella's door */
  altar: Array<Box2 & { top: number }>
  /** the lamps' places in the scene, [x, y, z] */
  lamps: number[][]
  towers: Box2[]
  ash: Box2
  ashCourt: Box2
  ashTop: number
  apronTop: number
}

const D = (v: number): number => +v.toFixed(4)

export function nabuFrame(np: J, E0: number, N0: number): NabuFrame {
  const x = (E: number): number => D(E - E0)
  const z = (N: number): number => D(N0 - N)
  const box = (b: number[]): Box2 => ({ x0: x(b[0]!), x1: x(b[1]!), z0: z(b[3]!), z1: z(b[2]!) })
  const floor: number = np.floor, pave = floor + np.paving.top
  const outline = box(np.outline.box)
  const doors: DoorF[] = np.doors.map((d: J) => {
    const half = d.w / 2
    const b = d.wall === 'x' ? box([d.from, d.to, d.at - half, d.at + half]) : box([d.at - half, d.at + half, d.from, d.to])
    return { id: d.id, wall: d.wall, box: b, c: d.wall === 'x' ? z(d.at) : x(d.at), w: d.w, top: floor + d.h }
  })
  const rooms: Record<string, Box2> = {}
  for (const [k, r] of Object.entries<J>(np.rooms)) rooms[k] = box(r.box)
  const N = np.niche
  const PD = np.pedestal
  const pedestal = { ...box(PD.box), top: D(pave + PD.h), chamfer: PD.chamfer }
  const niche = { ...box([N.e[0], N.e[1], np.rooms.cella.box[2] - N.depth, np.rooms.cella.box[2]]), top: floor + N.h, sill: D(pave + PD.h + 0.02) }
  // the altar block's tiers, and a low block either side of the cella's door, its back sunk 5 cm into the court's wall
  const AL = np.altar
  const altar: Array<Box2 & { top: number }> = AL.tiers.map((t: J) => ({ ...box([AL.box[0], AL.box[1], t.n[0], t.n[1]]), top: D(pave + t.h) }))
  const cd = np.doors.find((d: J) => d.id === 'cella'), wallN = np.courts.nabu.box[2], by = AL.by
  for (const s of [-1, 1]) {
    const e0 = s < 0 ? cd.at - cd.w / 2 - by.gap - by.w : cd.at + cd.w / 2 + by.gap
    altar.push({ ...box([e0, e0 + by.w, wallN - 0.05, wallN + by.d]), top: D(pave + by.h) })
  }
  const lamps = np.lamp.at.map((a: number[]) => [x(a[0]!), D(pave + a[2]!), z(a[1]!)])
  // the two gate towers on the street side, either side of the gate's opening
  const gate = np.doors.find((d: J) => d.id === 'gate')
  const T = np.towers, east = np.outline.box[1]
  const towers = [
    box([east, east + T.proj, gate.at - gate.w / 2 - T.w, gate.at - gate.w / 2]),
    box([east, east + T.proj, gate.at + gate.w / 2, gate.at + gate.w / 2 + T.w]),
  ]
  const A = np.ashratum
  return {
    floor, pave, ceiling: np.heights.ceiling, deck: np.heights.deck, top: np.heights.top, towerTop: np.heights.towerTop,
    outline, court: box(np.courts.nabu.box), small: box(np.courts.small.box), rooms, doors, niche, pedestal, altar, lamps, towers,
    ash: box(A.box), ashCourt: box(A.court), ashTop: A.top, apronTop: np.apron.top,
  }
}

/* ── the cell grid: every cell a stack of solid spans, each of one body, and a space tag for its empty spans ── */
interface Span { y0: number; y1: number; b: number }
class Grid {
  xs: number[]
  zs: number[]
  nx: number
  nz: number
  spans: Span[][]
  tag: Int8Array
  constructor(xs: number[], zs: number[]) {
    const uniq = (v: number[]): number[] => [...new Set(v.map(D))].sort((a, b) => a - b)
    this.xs = uniq(xs)
    this.zs = uniq(zs)
    this.nx = this.xs.length - 1
    this.nz = this.zs.length - 1
    this.spans = Array.from({ length: this.nx * this.nz }, () => [])
    this.tag = new Int8Array(this.nx * this.nz)
  }
  /** each cell whose middle lies in the box */
  each(b: Box2, fn: (k: number) => void): void {
    for (let i = 0; i < this.nx; i++) {
      const cx = (this.xs[i]! + this.xs[i + 1]!) / 2
      if (cx < b.x0 || cx > b.x1) continue
      for (let j = 0; j < this.nz; j++) {
        const cz = (this.zs[j]! + this.zs[j + 1]!) / 2
        if (cz >= b.z0 && cz <= b.z1) fn(i * this.nz + j)
      }
    }
  }
  carveAt(k: number, y0: number, y1: number): void {
    const out: Span[] = []
    for (const s of this.spans[k]!) {
      if (s.y1 <= y0 || s.y0 >= y1) out.push(s)
      else {
        if (s.y0 < y0) out.push({ y0: s.y0, y1: y0, b: s.b })
        if (s.y1 > y1) out.push({ y0: y1, y1: s.y1, b: s.b })
      }
    }
    this.spans[k] = out
  }
  fill(b: Box2, y0: number, y1: number, body: number): void {
    this.each(b, (k) => {
      this.carveAt(k, y0, y1)
      this.spans[k]!.push({ y0, y1, b: body })
      this.spans[k]!.sort((p, q) => p.y0 - q.y0)
    })
  }
  carve(b: Box2, y0: number, y1: number): void {
    this.each(b, (k) => this.carveAt(k, y0, y1))
  }
  mark(b: Box2, t: number): void {
    this.each(b, (k) => { this.tag[k] = t })
  }
  bodyAt(k: number, y: number): number {
    for (const s of this.spans[k]!) if (y > s.y0 && y < s.y1) return s.b
    return -1
  }
  solidAbove(k: number, y: number): boolean {
    return this.spans[k]!.some((s) => s.y0 >= y - 1e-6)
  }
}

/** an axis-aligned quad: on plane `axis` = c, spanning u (the next axis round: x -> z, z -> x, y -> x) and v */
interface Quad { axis: 0 | 1 | 2; sign: 1 | -1; c: number; u0: number; u1: number; v0: number; v1: number; b: number; s: number }

function mergeQuads(qs: Quad[]): Quad[] {
  const groups = new Map<string, Quad[]>()
  for (const q of qs) {
    const key = `${q.axis}|${q.sign}|${q.c}|${q.b}|${q.s}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(q)
  }
  const out: Quad[] = []
  for (const g of groups.values()) {
    // along u for the same v span, then along v for the same u span
    g.sort((a, b) => a.v0 - b.v0 || a.v1 - b.v1 || a.u0 - b.u0)
    const row: Quad[] = []
    for (const q of g) {
      const last = row[row.length - 1]
      if (last && Math.abs(last.v0 - q.v0) < 1e-6 && Math.abs(last.v1 - q.v1) < 1e-6 && Math.abs(last.u1 - q.u0) < 1e-6) last.u1 = q.u1
      else row.push({ ...q })
    }
    row.sort((a, b) => a.u0 - b.u0 || a.u1 - b.u1 || a.v0 - b.v0)
    const col: Quad[] = []
    for (const q of row) {
      const last = col[col.length - 1]
      if (last && Math.abs(last.u0 - q.u0) < 1e-6 && Math.abs(last.u1 - q.u1) < 1e-6 && Math.abs(last.v1 - q.v0) < 1e-6) last.v1 = q.v1
      else col.push(q)
    }
    out.push(...col)
  }
  return out
}

/** a quad's corners in the scene, wound so its front faces along its normal */
function corners(q: Quad): number[][] {
  const P = (u: number, v: number): number[] => (q.axis === 0 ? [q.c, v, u] : q.axis === 2 ? [u, v, q.c] : [u, q.c, v])
  const a = P(q.u0, q.v0), b = P(q.u1, q.v0), c = P(q.u1, q.v1), d = P(q.u0, q.v1)
  // (b - a) x (d - a) points along +axis for x (u = z, v = y) and z planes reversed; check and flip
  const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], e2 = [d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!]
  const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!]
  return n[q.axis]! * q.sign > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]
}

/** the grid's faces as quads: tops, bottoms (not under `base`), and the sides between cells */
function gridQuads(g: Grid, F: NabuFrame, kindTop: (k: number, y: number) => number, base: number): Quad[] {
  const qs: Quad[] = []
  const at = (i: number, j: number): number => (i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : i * g.nz + j)
  /** a side face's surface: by its body and the space it looks into (the neighbour's tag; enclosed when the neighbour
      has a solid over the gap) */
  const side = (body: number, toward: number, ya: number, yb: number, axis: 0 | 2, sgn: number): number => {
    const t = toward < 0 ? SPACE.outside : g.tag[toward]!
    if (t === SPACE.door) return SURF.reveal
    if (body === 1) return SURF.ashratum
    if (toward >= 0 && g.solidAbove(toward, yb)) return t === SPACE.cella || t === SPACE.smallCella || t === SPACE.side ? SURF.bandedRoom : SURF.room
    if (t === SPACE.court) return SURF.courtWall
    // the smaller court's south wall: its face looking north into the court is the black wall
    if (t === SPACE.small) return axis === 2 && sgn < 0 ? SURF.black : SURF.smallCourt
    if (t === SPACE.outside) return SURF.exterior
    return ya >= F.deck - 0.01 ? SURF.parapet : SURF.exterior
  }
  for (let i = 0; i < g.nx; i++) for (let j = 0; j < g.nz; j++) {
    const k = at(i, j)
    const sp = g.spans[k]!
    const x0 = g.xs[i]!, x1 = g.xs[i + 1]!, z0 = g.zs[j]!, z1 = g.zs[j + 1]!
    for (const s of sp) {
      const over = sp.find((o) => Math.abs(o.y0 - s.y1) < 1e-6)
      if (!over || over.b !== s.b) qs.push({ axis: 1, sign: 1, c: s.y1, u0: x0, u1: x1, v0: z0, v1: z1, b: s.b, s: kindTop(k, s.y1) })
      const under = sp.find((o) => Math.abs(o.y1 - s.y0) < 1e-6)
      if (s.y0 > base + 1e-6 && (!under || under.b !== s.b)) {
        const t = g.tag[k]!
        qs.push({ axis: 1, sign: -1, c: s.y0, u0: x0, u1: x1, v0: z0, v1: z1, b: s.b, s: t === SPACE.door ? SURF.soffit : under ? SURF.soffit : SURF.ceiling })
      }
    }
    // sides toward +x and +z, and toward -x and -z at the grid's edge
    for (const [di, dj, axis] of [[1, 0, 0], [0, 1, 2], [-1, 0, 0], [0, -1, 2]] as Array<[number, number, 0 | 2]>) {
      const n = at(i + di, j + dj)
      if ((di < 0 || dj < 0) && n >= 0) continue
      const ys = new Set<number>()
      for (const s of sp) { ys.add(s.y0); ys.add(s.y1) }
      if (n >= 0) for (const s of g.spans[n]!) { ys.add(s.y0); ys.add(s.y1) }
      const ev = [...ys].sort((a, b) => a - b)
      const c = axis === 0 ? (di > 0 ? x1 : x0) : (dj > 0 ? z1 : z0)
      const [u0, u1] = axis === 0 ? [z0, z1] : [x0, x1]
      const sgn = (di + dj) as 1 | -1
      for (let e = 0; e + 1 < ev.length; e++) {
        const ya = ev[e]!, yb = ev[e + 1]!, mid = (ya + yb) / 2
        const a = g.bodyAt(k, mid), o = n >= 0 ? g.bodyAt(n, mid) : -1
        if (a >= 0 && a !== o) qs.push({ axis, sign: sgn, c, u0, u1, v0: ya, v1: yb, b: a, s: side(a, n, ya, yb, axis, sgn) })
        if (n >= 0 && o >= 0 && o !== a) qs.push({ axis, sign: (-sgn) as 1 | -1, c, u0, u1, v0: ya, v1: yb, b: o, s: side(o, k, ya, yb, axis, -sgn) })
      }
    }
  }
  return mergeQuads(qs)
}

export interface NabuBody { id: string; geometry: BufferGeometry; band: number; letters: [Cls, Cls] }

function quadsGeometry(qs: Quad[]): BufferGeometry {
  const pos: number[] = [], nor: number[] = [], surf: number[] = []
  for (const q of qs) {
    const n = [0, 0, 0]
    n[q.axis] = q.sign
    for (const p of corners(q)) {
      pos.push(p[0]!, p[1]!, p[2]!)
      nor.push(n[0]!, n[1]!, n[2]!)
      surf.push(q.s)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('surf', new Float32BufferAttribute(surf, 1))
  return g
}

/** boxes (centre, size) as one non-indexed geometry with normals and a surface code */
function boxesGeometry(boxes: Array<{ c: number[]; s: number[] }>, code: number): BufferGeometry {
  const pos: number[] = [], nor: number[] = []
  for (const b of boxes) {
    const g = new BoxGeometry(b.s[0], b.s[1], b.s[2]).toNonIndexed()
    g.translate(b.c[0]!, b.c[1]!, b.c[2]!)
    pos.push(...(g.getAttribute('position').array as Float32Array))
    nor.push(...(g.getAttribute('normal').array as Float32Array))
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('surf', new Float32BufferAttribute(new Array(pos.length / 3).fill(code), 1))
  return g
}

function join(gs: BufferGeometry[]): BufferGeometry {
  const pos: number[] = [], nor: number[] = [], surf: number[] = []
  for (const g of gs) {
    pos.push(...(g.getAttribute('position').array as Float32Array))
    nor.push(...(g.getAttribute('normal').array as Float32Array))
    surf.push(...(g.getAttribute('surf').array as Float32Array))
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('surf', new Float32BufferAttribute(surf, 1))
  return g
}

type Boxes = Array<{ c: number[]; s: number[] }>

/** one stepped merlon (a broad lower tier, a narrow upper one) on a face's top at `u` along it: its outer face 5 cm
    inside the plane `c` of what it stands on, each tier sunk 5 cm into what it stands on */
function merlon(out: Boxes, axis: 'x' | 'z', c: number, inward: 1 | -1, u: number, y: number, M: J, w = M.low[0]): void {
  const tiers: Array<[number, number, number, number]> = [[w, M.low[1], y - 0.05, y + M.low[2]], [M.high[0] * (w / M.low[0]), M.high[1], y + M.low[2] - 0.05, y + M.low[2] + M.high[2]]]
  for (const [sa, st, y0, y1] of tiers) {
    const mid = c + inward * (st / 2 + 0.05)
    // a face along x (axis 'z': its plane is z = c) runs along x; a face along z runs along z
    out.push(axis === 'z' ? { c: [u, (y0 + y1) / 2, mid], s: [sa, y1 - y0, st] } : { c: [mid, (y0 + y1) / 2, u], s: [st, y1 - y0, sa] })
  }
}

/** the places along a face for its merlons: each corner, each pilaster, and evenly between where a gap holds one;
    a long gap (a tower's stretch) stays empty */
function merlonPlaces(a: number, b: number, pil: number[], pitch: number): number[] {
  const keys = [a + 0.45, ...pil.filter((p) => p > a + 1.2 && p < b - 1.2).sort((p, q) => p - q), b - 0.45]
  const out: number[] = []
  for (let i = 0; i < keys.length; i++) {
    out.push(keys[i]!)
    const next = keys[i + 1]
    if (next === undefined) break
    const D0 = next - keys[i]!
    if (D0 > 1.6 * pitch) continue
    const k = Math.round(D0 / (pitch / 2)) - 1
    for (let j = 1; j <= k; j++) out.push(keys[i]! + (D0 * j) / (k + 1))
  }
  return out
}

/** a merlon run along a box's whole edge at the given pitch (the Ashratum's) */
function merlonRun(out: Boxes, axis: 'x' | 'z', c: number, inward: 1 | -1, a: number, b: number, y: number, M: J, pitch: number): void {
  const n = Math.max(1, Math.round((b - a - 0.9) / pitch))
  for (let k = 0; k <= n; k++) merlon(out, axis, c, inward, a + 0.45 + ((b - a - 0.9) * k) / n, y, M)
}

/** the four runs round a box's top; the east and west runs start behind the north and south runs' corner merlons */
function merlonRing(out: Boxes, b: Box2, y: number, M: J, pitch: number): void {
  const inset = M.low[1] + 0.1
  merlonRun(out, 'z', b.z0, 1, b.x0, b.x1, y, M, pitch)
  merlonRun(out, 'z', b.z1, -1, b.x0, b.x1, y, M, pitch)
  merlonRun(out, 'x', b.x0, 1, b.z0 + inset, b.z1 - inset, y, M, pitch)
  merlonRun(out, 'x', b.x1, -1, b.z0 + inset, b.z1 - inset, y, M, pitch)
}

/** pilasters along a box's four faces, kept off the corners by `m`, skipping a stretch [z0, z1] of the east face */
function pilasters(b: Box2, P: J, skip: [number, number] | null, m = 0.6): Box2[] {
  const out: Box2[] = []
  const along = (L: number): number[] => {
    const room = L - 2 * m - P.w
    const n = Math.floor(room / P.pitch)
    const start = m + P.w / 2 + (room - n * P.pitch) / 2
    return Array.from({ length: n + 1 }, (_, k) => start + k * P.pitch)
  }
  for (const u of along(b.x1 - b.x0)) {
    const x = b.x0 + u
    out.push({ x0: x - P.w / 2, x1: x + P.w / 2, z0: b.z0 - P.d, z1: b.z0 })
    out.push({ x0: x - P.w / 2, x1: x + P.w / 2, z0: b.z1, z1: b.z1 + P.d })
  }
  for (const u of along(b.z1 - b.z0)) {
    const z = b.z0 + u
    out.push({ x0: b.x0 - P.d, x1: b.x0, z0: z - P.w / 2, z1: z + P.w / 2 })
    if (!skip || z + P.w / 2 < skip[0] || z - P.w / 2 > skip[1]) out.push({ x0: b.x1, x1: b.x1 + P.d, z0: z - P.w / 2, z1: z + P.w / 2 })
  }
  return out
}

/** a vertical prism from a plan outline (scene x, z), y0 to y1 */
function prism(poly: P2[], y0: number, y1: number, code: number): BufferGeometry {
  const sh = new Shape()
  sh.moveTo(poly[0]![0], -poly[0]![1])
  for (const [px, pz] of poly.slice(1)) sh.lineTo(px, -pz)
  sh.closePath()
  const g0 = new ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, steps: 1 })
  g0.rotateX(-Math.PI / 2)
  g0.translate(0, y0, 0)
  g0.deleteAttribute('uv')
  const g = g0.index ? g0.toNonIndexed() : g0
  g.setAttribute('surf', new Float32BufferAttribute(new Array(g.getAttribute('position').count).fill(code), 1))
  return g
}

/** a plastered block: a vertical prism from a plan outline whose arrises are rounded by a bevel `r` (the outline is
    inset by it, so the block keeps its size), y0 to y1 */
function slab(poly: P2[], y0: number, y1: number, code: number, r = 0.04): BufferGeometry {
  // inset each vertex along its corner's bisector; the outlines here are convex and wound either way
  const n = poly.length
  let area = 0
  for (let i = 0; i < n; i++) { const a = poly[i]!, b = poly[(i + 1) % n]!; area += a[0] * b[1] - b[0] * a[1] }
  const sg = area > 0 ? 1 : -1
  const inset: P2[] = poly.map((p, i) => {
    const a = poly[(i + n - 1) % n]!, b = poly[(i + 1) % n]!
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]]
    const l1 = Math.hypot(e1[0]!, e1[1]!), l2 = Math.hypot(e2[0]!, e2[1]!)
    // inward normals of the two edges (left of the edge for a counter-clockwise outline)
    const n1 = [-e1[1]! / l1 * sg, e1[0]! / l1 * sg], n2 = [-e2[1]! / l2 * sg, e2[0]! / l2 * sg]
    const m = [n1[0]! + n2[0]!, n1[1]! + n2[1]!], k = r / Math.max(0.2, (m[0]! * n1[0]! + m[1]! * n1[1]!))
    return [p[0] + m[0]! * k, p[1] + m[1]! * k]
  })
  const sh = new Shape()
  sh.moveTo(inset[0]![0], -inset[0]![1])
  for (const [px, pz] of inset.slice(1)) sh.lineTo(px, -pz)
  sh.closePath()
  const g0 = new ExtrudeGeometry(sh, { depth: y1 - y0 - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelOffset: 0, bevelSegments: 2, steps: 1 })
  g0.rotateX(-Math.PI / 2)
  g0.translate(0, y0 + r, 0)
  g0.deleteAttribute('uv')
  const g = g0.index ? g0.toNonIndexed() : g0
  g.setAttribute('surf', new Float32BufferAttribute(new Array(g.getAttribute('position').count).fill(code), 1))
  return g
}

/** the map prisms this module draws on the map page instead of the map */
export const TAKEN_NABU = (id: string): boolean => id === 'nabu'

export interface Nabu { F: NabuFrame; bodies: NabuBody[]; built: Built; facts: Record<string, unknown>; spaces: { inside: (x: number, z: number) => boolean } }

export function buildNabu(built: Built, mapPlan: J, np: J): Nabu {
  const F = nabuFrame(np, mapPlan.frame.E0, mapPlan.frame.N0)
  const BAND: number = mapPlan.classes.band
  const O = F.outline, W: number = np.wall
  // the base: under the lowest ground beneath the temple and the Ashratum
  let low = Infinity
  for (const b of [O, F.ash]) for (let u = 0; u <= 8; u++) for (let v = 0; v <= 8; v++) low = Math.min(low, built.ground(b.x0 + ((b.x1 - b.x0) * u) / 8, b.z0 + ((b.z1 - b.z0) * v) / 8))
  const base = D(low - 0.4)
  const P = np.pilasters, T = np.towers
  const gateD = F.doors.find((d) => d.id === 'gate')!
  // the stretch of the street face the gate's towers take, in z (north to south), kept clear of pilasters
  const towerZone: [number, number] = [Math.min(...F.towers.map((t) => t.z0)) - 0.6, Math.max(...F.towers.map((t) => t.z1)) + 0.6]
  const pil = pilasters(O, P, towerZone)
  const ashPil = pilasters(F.ash, { ...P, w: 1.1, d: 0.3, pitch: 3.0 }, null)
  // the grooves: n vertical channels in each tower's street face, one down the middle of each pilaster's face
  const grooves: Box2[] = []
  const fins: number[][] = []
  for (const t of F.towers) {
    const n: number = T.grooves.n
    const zc = Array.from({ length: n }, (_, k) => t.z0 + ((t.z1 - t.z0) * (k + 1)) / (n + 1))
    for (const z of zc) grooves.push({ x0: t.x1 - T.grooves.d, x1: t.x1 + 0.01, z0: z - T.grooves.w / 2, z1: z + T.grooves.w / 2 })
    // the fins between the grooves, each crowned by a merlon
    const edges = [t.z0, ...zc.flatMap((z) => [z - T.grooves.w / 2, z + T.grooves.w / 2]), t.z1]
    fins.push(Array.from({ length: n + 1 }, (_, k) => (edges[2 * k]! + edges[2 * k + 1]!) / 2))
  }
  const PG = P.groove
  const pilGrooves: Box2[] = pil.map((p) => {
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2
    if (p.z1 === O.z0) return { x0: cx - PG.w / 2, x1: cx + PG.w / 2, z0: p.z0 - 0.01, z1: p.z0 + PG.d }
    if (p.z0 === O.z1) return { x0: cx - PG.w / 2, x1: cx + PG.w / 2, z0: p.z1 - PG.d, z1: p.z1 + 0.01 }
    if (p.x1 === O.x0) return { x0: p.x0 - 0.01, x1: p.x0 + PG.d, z0: cz - PG.w / 2, z1: cz + PG.w / 2 }
    return { x0: p.x1 - PG.d, x1: p.x1 + 0.01, z0: cz - PG.w / 2, z1: cz + PG.w / 2 }
  })
  // the roof's parapet ring round the outside, and a coping ring round each court
  const ring = 1.0, curb: number = np.coping.curb
  const deckBox: Box2 = { x0: O.x0 + ring, x1: O.x1 - ring, z0: O.z0 + ring, z1: O.z1 - ring }
  const grow = (b: Box2, d: number): Box2 => ({ x0: b.x0 - d, x1: b.x1 + d, z0: b.z0 - d, z1: b.z1 + d })
  const ashDeck: Box2 = { x0: F.ash.x0 + ring, x1: F.ash.x1 - ring, z0: F.ash.z0 + ring, z1: F.ash.z1 - ring }

  const xs: number[] = [], zs: number[] = []
  const add = (b: Box2): void => { xs.push(b.x0, b.x1); zs.push(b.z0, b.z1) }
  for (const b of [O, F.court, F.small, ...Object.values(F.rooms), F.niche, ...F.towers, F.ash, F.ashCourt, deckBox, ashDeck, grow(F.court, curb), grow(F.small, curb), ...pil, ...ashPil, ...grooves, ...pilGrooves, ...F.doors.map((d) => d.box)]) add(b)
  const g = new Grid(xs, zs)

  const SKY = 1e3
  // the temple: a solid block, the courts open over the paving, the rooms hollow under the roof's slab
  g.fill(O, base, F.top, 0)
  for (const t of F.towers) g.fill(t, base, F.towerTop, 0)
  for (const p of pil) g.fill(p, base, F.top, 0)
  for (const c of [F.court, F.small]) g.carve(c, F.pave, SKY)
  for (const r of Object.values(F.rooms)) g.carve(r, F.pave, F.ceiling)
  g.carve(F.niche, F.niche.sill, F.niche.top)
  for (const d of F.doors) g.carve(d.box, F.pave, d.top)
  // between the towers the gate's mouth lies open to the sky, at the ground's level before it
  g.carve({ x0: O.x1, x1: F.towers[0]!.x1, z0: gateD.box.z0, z1: gateD.box.z1 }, base, SKY)
  for (const gr of grooves) g.carve(gr, F.apronTop - 0.3, SKY)
  for (const gr of pilGrooves) g.carve(gr, F.apronTop - 0.3, F.top)
  // the roof: the deck inside the parapet, kept as high as the coping round each court
  g.each(deckBox, (k) => {
    const i = Math.floor(k / g.nz), j = k % g.nz
    const cx = (g.xs[i]! + g.xs[i + 1]!) / 2, cz = (g.zs[j]! + g.zs[j + 1]!) / 2
    const inCurb = [F.court, F.small].some((c) => { const b = grow(c, curb); return cx > b.x0 && cx < b.x1 && cz > b.z0 && cz < b.z1 })
    if (!inCurb) g.carveAt(k, F.deck, SKY)
  })
  // the Ashratum: its own block, pilasters, a court open to the sky over the ground before it
  g.fill(F.ash, base, F.ashTop, 1)
  for (const p of ashPil) g.fill(p, base, F.ashTop, 1)
  g.carve(F.ashCourt, F.apronTop - 0.08, SKY)
  g.carve(ashDeck, F.ashTop - 0.6, SKY)
  // the spaces: what each cell's empty spans belong to
  g.mark(grow(O, 50), SPACE.outside)
  g.mark(deckBox, SPACE.roof)
  g.mark(F.court, SPACE.court)
  g.mark(F.small, SPACE.small)
  for (const [k, r] of Object.entries(F.rooms)) g.mark(r, k === 'cella' ? SPACE.cella : k === 'smallCella' ? SPACE.smallCella : k === 'vestibule' ? SPACE.vestibule : SPACE.side)
  g.mark(F.niche, SPACE.cella)
  for (const d of F.doors) if (d.id !== 'gate') g.mark(d.box, SPACE.door)
  g.mark({ ...gateD.box, x1: O.x1 }, SPACE.door)
  g.mark(ashDeck, SPACE.ashRoof)
  g.mark(F.ashCourt, SPACE.ashCourt)

  const kindTop = (k: number, y: number): number => {
    const t = g.tag[k]!
    if (t === SPACE.ashCourt) return SURF.earth
    if (Math.abs(y - F.pave) < 0.01) return SURF.paving
    if (Math.abs(y - F.deck) < 0.01 || t === SPACE.ashRoof) return SURF.deck
    return SURF.coping
  }
  const quads = gridQuads(g, F, kindTop, base)
  const temple = quadsGeometry(quads.filter((q) => q.b === 0))
  const ash = quadsGeometry(quads.filter((q) => q.b === 1))

  // the battlements on the outer walls (clear of the gate towers) and on the towers and the Ashratum
  const M = np.merlons
  const mt: Boxes = [], ma: Boxes = []
  // on the outer walls: on each pilaster (its face standing out by the pilaster's depth) and in the recesses between
  const onFace = (sel: (p: Box2) => boolean, along: (p: Box2) => number): number[] => pil.filter(sel).map(along)
  const cx = (p: Box2): number => (p.x0 + p.x1) / 2, cz = (p: Box2): number => (p.z0 + p.z1) / 2
  const faces: Array<{ axis: 'x' | 'z'; c: number; inward: 1 | -1; a: number; b: number; pil: number[]; out: number }> = [
    { axis: 'z', c: O.z0, inward: 1, a: O.x0, b: O.x1, pil: onFace((p) => p.z1 === O.z0, cx), out: -P.d },
    { axis: 'z', c: O.z1, inward: -1, a: O.x0, b: O.x1, pil: onFace((p) => p.z0 === O.z1, cx), out: P.d },
    { axis: 'x', c: O.x0, inward: 1, a: O.z0 + 0.7, b: O.z1 - 0.7, pil: onFace((p) => p.x1 === O.x0, cz), out: -P.d },
    { axis: 'x', c: O.x1, inward: -1, a: O.z0 + 0.7, b: O.z1 - 0.7, pil: onFace((p) => p.x0 === O.x1, cz), out: P.d },
  ]
  for (const f of faces) {
    const pitch: number = P.pitch
    let places = merlonPlaces(f.a, f.b, f.pil, pitch)
    // the east face: none over the gate's towers and the gap between them
    if (f.axis === 'x' && f.inward === -1) {
      const keep = (u: number): boolean => u + 0.45 < towerZone[0] || u - 0.45 > towerZone[1]
      const cut = [towerZone[0] - 0.45, towerZone[1] + 0.45]
      places = merlonPlaces(f.a, cut[0]!, f.pil.filter((u) => u < towerZone[0]), pitch).concat(merlonPlaces(cut[1]!, f.b, f.pil.filter((u) => u > towerZone[1]), pitch)).filter(keep)
    }
    for (const u of places) {
      const onPil = f.pil.some((p) => Math.abs(p - u) < 0.05)
      merlon(mt, f.axis, onPil ? f.c + f.out : f.c, f.inward, u, F.top, M)
    }
  }
  // two over the gate's opening between the towers
  for (const s of [-1, 1]) merlon(mt, 'x', O.x1, -1, gateD.c + s * 0.6, F.top, M)
  // on each tower a merlon over each fin between its grooves
  for (const [i, t] of F.towers.entries()) for (const z of fins[i]!) merlon(mt, 'x', t.x1, -1, z, F.towerTop, M, Math.min(M.low[0], (t.z1 - t.z0) / 3 - T.grooves.w))
  merlonRing(ma, F.ash, F.ashTop, M, P.pitch / 2)
  // the god's pedestal: C6.2's outline with its front corners cut, standing 3 cm in the paving, its back 5 cm in the wall
  const pd = F.pedestal, ch = pd.chamfer, zb = D(pd.z1 + 0.05)
  const pedestalG = slab([[pd.x0 + ch, pd.z0], [pd.x1 - ch, pd.z0], [pd.x1, pd.z0 + ch], [pd.x1, zb], [pd.x0, zb], [pd.x0, pd.z0 + ch]], F.pave - 0.03, pd.top, SURF.pedestal)
  // the court's altars: plastered blocks standing 3 cm in the paving; the block's tiers overlap 5 cm, so no face is shared
  const altarG = join(F.altar.map((a) => slab([[a.x0, a.z0], [a.x1, a.z0], [a.x1, a.z1], [a.x0, a.z1]], F.pave - 0.03, a.top, SURF.altar)))
  // round each court a coping course standing proud of the wall's face, and stepped merlons on it (Guessed, after the
  // temples' battlements, K1914 ch. IX); the north and south runs take the corners, the east and west runs sit 5 mm
  // lower where they overlap them
  const CP = np.coping, cope: Boxes = [], cm: Boxes = []
  for (const c of [F.court, F.small]) {
    const y0 = F.top - CP.h, y1 = F.top + CP.lift, back = CP.back, out = CP.proj
    for (const [zA, zB] of [[c.z0 - back, c.z0 + out], [c.z1 - out, c.z1 + back]] as Array<[number, number]>) cope.push({ c: [(c.x0 + c.x1) / 2, (y0 + y1) / 2, (zA + zB) / 2], s: [c.x1 - c.x0 + 2 * back, y1 - y0, zB - zA] })
    for (const [xA, xB] of [[c.x0 - back, c.x0 + out], [c.x1 - out, c.x1 + back]] as Array<[number, number]>) cope.push({ c: [(xA + xB) / 2, (y0 + y1 - 0.005) / 2, (c.z0 + c.z1) / 2], s: [xB - xA, y1 - 0.005 - y0, c.z1 - c.z0 + 2 * back - 0.04] })
    const ym = y1 - 0.005, pitch: number = CP.pitch
    merlonRun(cm, 'z', c.z0, -1, c.x0 - back + 0.05, c.x1 + back - 0.05, ym, M, pitch)
    merlonRun(cm, 'z', c.z1, 1, c.x0 - back + 0.05, c.x1 + back - 0.05, ym, M, pitch)
    merlonRun(cm, 'x', c.x0, -1, c.z0 + 0.1, c.z1 - 0.1, ym, M, pitch)
    merlonRun(cm, 'x', c.x1, 1, c.z0 + 0.1, c.z1 - 0.1, ym, M, pitch)
  }
  const templeAll = join([temple, boxesGeometry(mt, SURF.merlon), boxesGeometry(cope, SURF.coping), boxesGeometry(cm, SURF.merlon), pedestalG])

  // every door: a sill across it, proud of both faces, its ends in the jambs; the leaves (Guessed: wood, hung at the
  // end that opens into a room) standing open against the reveal, 1 cm off it; a door under 1.9 m takes one leaf, on
  // its south side
  const LV = np.leaves, sill: Boxes = [], leaf: Boxes = []
  const sillTop = F.pave + LV.sill
  const inRoom = (x: number, z: number): boolean => Object.values(F.rooms).some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)
  for (const d of F.doors) {
    const b = d.box, alongX = d.wall === 'x'
    const a0 = alongX ? b.x0 : b.z0, a1 = alongX ? (d.id === 'gate' ? O.x1 : b.x1) : b.z1
    const half = d.w / 2
    const sA = a0 - 0.06, sB = a1 + 0.06
    sill.push(alongX ? { c: [(sA + sB) / 2, (F.pave - 0.03 + sillTop) / 2, d.c], s: [sB - sA, sillTop - F.pave + 0.03, d.w + 0.1] } : { c: [d.c, (F.pave - 0.03 + sillTop) / 2, (sA + sB) / 2], s: [d.w + 0.1, sillTop - F.pave + 0.03, sB - sA] })
    // the end that opens into a room hangs the leaves
    const at0 = alongX ? inRoom(a0 - 0.1, d.c) : inRoom(d.c, a0 - 0.1)
    const hinge = at0 ? a0 + 0.03 : a1 - 0.03, dir = at0 ? 1 : -1
    const two = d.w >= 1.9
    const L = Math.min(two ? half - 0.02 : d.w - 0.04, a1 - a0 - 0.06)
    const y0 = sillTop - 0.01, y1 = d.top - 0.06, t: number = LV.t
    for (const side of two ? [-1, 1] : [1]) {
      const across = d.c + side * (half - 0.01 - t / 2)
      const along = hinge + (dir * L) / 2
      leaf.push(alongX ? { c: [along, (y0 + y1) / 2, across], s: [L, y1 - y0, t] } : { c: [across, (y0 + y1) / 2, along], s: [t, y1 - y0, L] })
    }
  }
  const doorsG = join([boxesGeometry(sill, SURF.sill), boxesGeometry(leaf, SURF.leaf)])
  const ashAll = join([ash, boxesGeometry(ma, SURF.merlon)])

  // the open ground before the gate: from the temple's street face to the street's west edge, the Ashratum on it
  const N0 = mapPlan.frame.N0
  // the street's west edge on a line of z, less a gutter of 25 cm so the ground shows between the two
  const edgeAt = (z: number): number => {
    let x = O.x1 + 2
    for (; x < O.x1 + 60; x += 0.05) { const s = built.streetAt(x, z); if (s.d <= s.w / 2 + 0.25) break }
    return D(x)
  }
  const zN = D(N0 - 3600436.0), zS = O.z1
  const apronPoly: P2[] = [[O.x1, zN], [edgeAt(zN), zN], [edgeAt(zS), zS], [O.x1, zS]]
  const apron = prism(apronPoly, base, F.apronTop, SURF.earth)

  const bodies: NabuBody[] = [
    { id: 'nabu', geometry: templeAll, band: F.floor + BAND, letters: ['M', 'G'] },
    { id: 'nabu-ashratum', geometry: ashAll, band: F.floor + BAND, letters: ['M', 'G'] },
    { id: 'nabu-altar', geometry: altarG, band: F.floor + BAND, letters: ['M', 'G'] },
    { id: 'nabu-doors', geometry: doorsG, band: F.floor - 10, letters: ['G', 'G'] },
    { id: 'nabu-apron', geometry: apron, band: 1e6, letters: ['G', 'G'] },
  ]

  // a visitor stands on the paving inside the temple and on the open ground before it
  const inside = (x: number, z: number): boolean => x > O.x0 && x < O.x1 + T.proj && z > O.z0 && z < O.z1
  const onApron = (x: number, z: number): boolean => x >= O.x1 && x <= Math.max(apronPoly[1]![0], apronPoly[2]![0]) && z >= zN && z <= zS && !(x > F.ash.x0 && x < F.ash.x1 && z > F.ash.z0 && z < F.ash.z1)
  const stand = (x: number, z: number): number => {
    if (inside(x, z)) return F.pave
    if (onApron(x, z)) {
      const s = built.streetAt(x, z)
      if (s.d <= s.w / 2 + 0.5) return built.stand(x, z)
      return F.apronTop
    }
    return built.stand(x, z)
  }
  const area = (b: Box2): number => +((b.x1 - b.x0) * (b.z1 - b.z0)).toFixed(2)
  const size = (b: Box2): [number, number] => [+(b.x1 - b.x0).toFixed(2), +(b.z1 - b.z0).toFixed(2)]
  const cella = F.rooms['cella']!, smallCella = F.rooms['smallCella']!
  const facts = {
    outline: size(O), area: area(O),
    court: size(F.court), small: size(F.small),
    cella: { size: size(cella), area: area(cella), width: +(cella.z1 - cella.z0).toFixed(2), southOfCourt: cella.z0 > F.court.z1 },
    smallCella: { size: size(smallCella), area: area(smallCella), width: +(smallCella.z1 - smallCella.z0).toFixed(2), southOfCourt: smallCella.z0 > F.small.z1 },
    walls: { outer: W, courtSouth: +(cella.z0 - F.court.z1).toFixed(2), smallSouth: +(smallCella.z0 - F.small.z1).toFixed(2) },
    floor: F.floor, pave: F.pave, top: F.top, towerTop: F.towerTop,
    merlonTop: +Math.max(...mt.map((m) => m.c[1]! + m.s[1]! / 2)).toFixed(3),
    doors: F.doors.map((d) => ({ id: d.id, w: d.w, h: +(d.top - F.floor).toFixed(2), flat: true })),
    towers: F.towers.map(size),
    pedestal: { size: size(pd), top: +(pd.top - F.floor).toFixed(2), niche: +(F.niche.sill - F.floor).toFixed(2) },
    altar: F.altar.map((a) => ({ size: size(a), top: +(a.top - F.floor).toFixed(2) })),
    triangles: bodies.reduce((t, b) => t + b.geometry.getAttribute('position').count / 3, 0),
    cells: g.nx * g.nz,
  }
  return {
    F, bodies, facts,
    built: { ...built, prisms: built.prisms.filter((p) => !TAKEN_NABU(p.id)), stand },
    spaces: { inside },
  }
}
