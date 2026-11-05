/* STOP 7'S BODIES (the new walk's stop 6), pure geometry (three's buffers, no DOM), so the map page and the node
   checks build the same: House VI in Merkes with its rooms, doors, two courts, flat roof and toothed street walls;
   House III across Winkelgasse on its terrace; the Merkes blocks round them as rows of court houses; the lanes'
   surface. Every body is built on a plan grid in its own frame (u along the house's east-west walls, v along its
   north-south walls) and layered in height, so the walls, doors, roofs and parapets share no face and every face
   knows what it looks into. Scene frame as plan.ts (x east, y up, z south). Only type imports from the wing: node
   resolves no relative module without its extension. */

import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'
import type { Built, Cls, P2 } from '../map/plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

const D2R = Math.PI / 180

/* what a plan cell is */
export const OUT = 0, WALL = 1, ROOM = 2, COURT = 3, DOOR = 4
/* what a face shows, the material's zones */
export const Z = { outer: 0, court: 1, room: 2, reveal: 3, deck: 4, coping: 5, parapetBack: 6, floor: 7, paving: 8, hidden: 9, courtFloor: 10, terrace: 11, lanes: 12, wood: 13, sill: 14, stone: 15, edge: 16, leaf: 17 } as const

export interface Frame { o: P2; a: P2; c: P2; bearing: number }
export function frameOf(origin: number[], bearing: number, E0: number, N0: number): Frame {
  const dir = (b: number): P2 => [Math.sin(b * D2R), -Math.cos(b * D2R)]
  return { o: [origin[0]! - E0, N0 - origin[1]!], a: dir(bearing), c: dir(bearing + 90), bearing }
}
const toScene = (f: Frame, u: number, v: number): P2 => [f.o[0] + f.a[0] * u + f.c[0] * v, f.o[1] + f.a[1] * u + f.c[1] * v]
export const toFrame = (f: Frame, x: number, z: number): P2 => {
  const dx = x - f.o[0], dz = z - f.o[1]
  return [dx * f.a[0] + dz * f.a[1], dx * f.c[0] + dz * f.c[1]]
}

/** a layer of a body: from y0 to y1, solid where `solid` says for a cell's kind and whether it is under a parapet */
export interface Layer { y0: number; y1: number; solid: (kind: number, rim: boolean) => boolean; name: string }

export interface CellPlan {
  us: number[]
  vs: number[]
  kind: (u: number, v: number) => number
  rim: (u: number, v: number) => boolean
}

interface Face { p: number[][]; n: [number, number, number]; zone: number; loc: number[][] }

const uniq = (xs: number[]): number[] => [...new Set(xs.map((x) => Math.round(x * 1000) / 1000))].sort((a, b) => a - b)

/** the faces of a layered plan: every face between a solid cell and an open one, merged along runs, with the zone of
    what it looks into */
export function cellFaces(cp: CellPlan, layers: Layer[], zoneOf: (side: 'side' | 'up' | 'down', layer: string, kind: number, own: number, rim: boolean) => number): Face[] {
  const us = uniq(cp.us), vs = uniq(cp.vs)
  const nu = us.length - 1, nv = vs.length - 1
  const kind: number[] = new Array(nu * nv), rim: boolean[] = new Array(nu * nv)
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const cu = (us[i]! + us[i + 1]!) / 2, cv = (vs[j]! + vs[j + 1]!) / 2
    kind[j * nu + i] = cp.kind(cu, cv)
    rim[j * nu + i] = kind[j * nu + i] !== OUT && cp.rim(cu, cv)
  }
  const K = (i: number, j: number): number => (i < 0 || j < 0 || i >= nu || j >= nv ? OUT : kind[j * nu + i]!)
  const R = (i: number, j: number): boolean => (i < 0 || j < 0 || i >= nu || j >= nv ? false : rim[j * nu + i]!)
  const S = (L: number, i: number, j: number): boolean => L >= 0 && L < layers.length && K(i, j) !== OUT && layers[L]!.solid(K(i, j), R(i, j))
  const faces: Face[] = []
  layers.forEach((Ly, L) => {
    // side faces: along u (faces looking -v or +v) merged over runs of i; along v merged over runs of j
    for (const dir of [-1, 1]) {
      for (let j = 0; j < nv; j++) {
        let run: { i0: number; zone: number } | null = null
        const flush = (iEnd: number): void => {
          if (!run) return
          const v = dir < 0 ? vs[j]! : vs[j + 1]!
          const u0 = us[run.i0]!, u1 = us[iEnd]!
          faces.push({ p: [[u0, Ly.y0, v], [u1, Ly.y0, v], [u1, Ly.y1, v], [u0, Ly.y1, v]], n: [0, 0, dir], zone: run.zone, loc: [] })
          run = null
        }
        for (let i = 0; i <= nu; i++) {
          let zone = -1
          if (i < nu && S(L, i, j) && !S(L, i, j + dir)) zone = zoneOf('side', Ly.name, K(i, j + dir), K(i, j), R(i, j + dir))
          if (run && zone !== run.zone) flush(i)
          if (zone >= 0 && !run) run = { i0: i, zone }
        }
      }
      for (let i = 0; i < nu; i++) {
        let run: { j0: number; zone: number } | null = null
        const flush = (jEnd: number): void => {
          if (!run) return
          const u = dir < 0 ? us[i]! : us[i + 1]!
          const v0 = vs[run.j0]!, v1 = vs[jEnd]!
          faces.push({ p: [[u, Ly.y0, v0], [u, Ly.y0, v1], [u, Ly.y1, v1], [u, Ly.y1, v0]], n: [dir, 0, 0], zone: run.zone, loc: [] })
          run = null
        }
        for (let j = 0; j <= nv; j++) {
          let zone = -1
          if (j < nv && S(L, i, j) && !S(L, i + dir, j)) zone = zoneOf('side', Ly.name, K(i + dir, j), K(i, j), R(i + dir, j))
          if (run && zone !== run.zone) flush(j)
          if (zone >= 0 && !run) run = { j0: j, zone }
        }
      }
    }
    // top and bottom faces: greedy rectangles of cells with one zone
    for (const side of ['up', 'down'] as const) {
      const y = side === 'up' ? Ly.y1 : Ly.y0
      const zg: number[] = new Array(nu * nv).fill(-1)
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        if (!S(L, i, j)) continue
        const other = side === 'up' ? L + 1 : L - 1
        // the next layer must touch this one for its solid to hide the face
        const touching = other >= 0 && other < layers.length && Math.abs((side === 'up' ? layers[other]!.y0 : layers[other]!.y1) - y) < 1e-6
        if (touching && S(other, i, j)) continue
        zg[j * nu + i] = zoneOf(side, Ly.name, K(i, j), K(i, j), R(i, j))
      }
      const used = new Array(nu * nv).fill(false)
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const z = zg[j * nu + i]!
        if (z < 0 || used[j * nu + i]) continue
        let i1 = i
        while (i1 + 1 < nu && zg[j * nu + i1 + 1] === z && !used[j * nu + i1 + 1]) i1++
        let j1 = j
        grow: while (j1 + 1 < nv) {
          for (let k = i; k <= i1; k++) if (zg[(j1 + 1) * nu + k] !== z || used[(j1 + 1) * nu + k]) break grow
          j1++
        }
        for (let jj = j; jj <= j1; jj++) for (let k = i; k <= i1; k++) used[jj * nu + k] = true
        const u0 = us[i]!, u1 = us[i1 + 1]!, v0 = vs[j]!, v1 = vs[j1 + 1]!
        faces.push({ p: [[u0, y, v0], [u1, y, v0], [u1, y, v1], [u0, y, v1]], n: [0, side === 'up' ? 1 : -1, 0], zone: z, loc: [] })
      }
    }
  })
  return faces
}

/** a body: its faces, the band its plan row is painted up to, its letters, its floor (where its walls' feet stand) and
    whether it is House VI's own */
export interface Body { id: string; geometry: BufferGeometry; band: number; letters: [Cls, Cls]; floor: number; six?: boolean }

/** faces in a frame turned into one geometry in the scene: position, normal, the zone and `loc`, the frame's (u, v)
    per vertex and a part's own (s, t) for its grain (zero on the cell bodies): one buffer, as a pipeline takes eight */
export function faceGeometry(f: Frame, faces: Face[]): BufferGeometry {
  const pos: number[] = [], nor: number[] = [], zone: number[] = [], loc: number[] = []
  for (const fc of faces) {
    const w = fc.p.map(([u, y, v]) => { const [x, z] = toScene(f, u!, v!); return [x, y!, z] })
    // the face's normal in the scene: u and v turn with the frame, y stays
    const n: [number, number, number] = [f.a[0] * fc.n[0] + f.c[0] * fc.n[2], fc.n[1], f.a[1] * fc.n[0] + f.c[1] * fc.n[2]]
    // wind each triangle so it faces along n
    const tri = (A: number, B: number, C: number): void => {
      const a = w[A]!, b = w[B]!, c = w[C]!
      const cx = (b[1]! - a[1]!) * (c[2]! - a[2]!) - (b[2]! - a[2]!) * (c[1]! - a[1]!)
      const cy = (b[2]! - a[2]!) * (c[0]! - a[0]!) - (b[0]! - a[0]!) * (c[2]! - a[2]!)
      const cz = (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!)
      const order = cx * n[0] + cy * n[1] + cz * n[2] >= 0 ? [A, B, C] : [A, C, B]
      for (const k of order) {
        pos.push(...w[k]!)
        nor.push(...n)
        zone.push(fc.zone)
        loc.push(fc.p[k]![0]!, fc.p[k]![2]!, 0, 0)
      }
    }
    tri(0, 1, 2)
    tri(0, 2, 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('zone', new Float32BufferAttribute(zone, 1))
  g.setAttribute('loc', new Float32BufferAttribute(loc, 4))
  return g
}

/* ── a toothed outline: each street face steps in teeth of the house's own bearing that follow the street's line ── */
interface Edge { a: P2; b: P2 }
/** the face's value at a coordinate: along u for a face running east-west (its v), along v for one running north-south */
function toothValue(e: Edge, along: 'u' | 'v', t: number, tooth: number): number {
  const i = along === 'u' ? 0 : 1, k = 1 - i
  const t0 = Math.min(e.a[i]!, e.b[i]!)
  const m = t0 + (Math.floor((t - t0) / tooth) + 0.5) * tooth
  const s = (m - e.a[i]!) / (e.b[i]! - e.a[i]!)
  return e.a[k]! + (e.b[k]! - e.a[k]!) * s
}
function toothCoords(e: Edge, along: 'u' | 'v', tooth: number, inset: number[]): { along: number[]; across: number[] } {
  const i = along === 'u' ? 0 : 1
  const t0 = Math.min(e.a[i]!, e.b[i]!), t1 = Math.max(e.a[i]!, e.b[i]!)
  const al: number[] = [], ac: number[] = []
  for (let t = t0; t < t1 + 1e-6; t += tooth) {
    al.push(t)
    const v = toothValue(e, along, Math.min(t + 1e-4, t1 - 1e-4), tooth)
    for (const d of inset) ac.push(v + d)
  }
  al.push(t1)
  return { along: al, across: ac }
}

/** a quad's four faces (north, east, south, west in the frame), each toothed, and the test whether a point is inside */
export interface Outline { N: Edge; E: Edge; S: Edge; W: Edge; tooth: number }
export function insideOutline(o: Outline, u: number, v: number, inset = 0): boolean {
  const clampU = (x: number): number => Math.min(Math.max(x, Math.min(o.N.a[0], o.N.b[0])), Math.max(o.N.a[0], o.N.b[0]) - 1e-6)
  const clampV = (x: number, e: Edge): number => Math.min(Math.max(x, Math.min(e.a[1], e.b[1])), Math.max(e.a[1], e.b[1]) - 1e-6)
  const vn = toothValue(o.N, 'u', clampU(u), o.tooth)
  const vsn = toothValue(o.S, 'u', Math.min(Math.max(u, Math.min(o.S.a[0], o.S.b[0])), Math.max(o.S.a[0], o.S.b[0]) - 1e-6), o.tooth)
  const ue = toothValue(o.E, 'v', clampV(v, o.E), o.tooth)
  const uw = toothValue(o.W, 'v', clampV(v, o.W), o.tooth)
  return v >= vn + inset && v <= vsn - inset && u <= ue - inset && u >= uw + inset
}
function outlineCoords(o: Outline, insets: number[]): { us: number[]; vs: number[] } {
  const us: number[] = [], vs: number[] = []
  for (const [e, al] of [[o.N, 'u'], [o.S, 'u'], [o.E, 'v'], [o.W, 'v']] as Array<[Edge, 'u' | 'v']>) {
    const c = toothCoords(e, al, o.tooth, insets.map((d) => (e === o.N ? d : e === o.S ? -d : e === o.E ? -d : d)))
    if (al === 'u') { us.push(...c.along); vs.push(...c.across) } else { vs.push(...c.along); us.push(...c.across) }
  }
  return { us, vs }
}

interface Rect { u: [number, number]; v: [number, number] }
const inRect = (r: Rect, u: number, v: number, grow = 0): boolean => u > r.u[0] - grow && u < r.u[1] + grow && v > r.v[0] - grow && v < r.v[1] + grow

/* the layered body of a court house: foundation to floor, walls to the door heads, lintels to the ceiling, the roof
   slab to the deck, the parapets to the top */
function houseLayers(lv: { base: number; floor: number; doorHead: number; ceiling: number; deck: number; top: number }): Layer[] {
  return [
    { name: 'floor', y0: lv.base, y1: lv.floor, solid: (k) => k !== OUT },
    { name: 'walls', y0: lv.floor, y1: lv.doorHead, solid: (k) => k === WALL },
    { name: 'lintels', y0: lv.doorHead, y1: lv.ceiling, solid: (k) => k === WALL || k === DOOR },
    { name: 'roof', y0: lv.ceiling, y1: lv.deck, solid: (k) => k !== COURT },
    { name: 'parapet', y0: lv.deck, y1: lv.top, solid: (k, rim) => rim && k !== COURT },
  ]
}
function zoneFor(courtFloor: number) {
  return (side: 'side' | 'up' | 'down', layer: string, k: number, own: number, rim: boolean): number => {
    if (side === 'side') {
      if (k === OUT) return Z.outer
      // the roof's own face toward a court is the roof edge's (houseConstruction)
      if (k === COURT) return layer === 'roof' ? Z.hidden : Z.court
      if (layer === 'parapet') return Z.parapetBack
      if (k === ROOM) return Z.room
      if (k === DOOR) return layer === 'parapet' ? Z.parapetBack : Z.reveal
      return layer === 'parapet' ? Z.parapetBack : rim ? Z.outer : Z.room
    }
    if (side === 'up') {
      if (layer === 'floor') return k === COURT ? courtFloor : Z.floor
      if (layer === 'parapet') return Z.coping
      if (layer === 'roof') return Z.deck
      return Z.hidden
    }
    if (layer === 'lintels') return Z.reveal
    if (layer === 'roof') return Z.room
    return Z.hidden
  }
}

export interface HouseFacts { [k: string]: unknown }

/** House VI from its plan: the house's body, and the court's paving as a body of its own */
export function buildHouse6(hp: J, E0: number, N0: number): { frame: Frame; bodies: Body[]; facts: HouseFacts } {
  const f = frameOf(hp.frame.origin, hp.frame.bearing, E0, N0)
  const O = hp.outline
  const ol: Outline = { N: { a: O.north[0], b: O.north[1] }, E: { a: O.east[0], b: O.east[1] }, S: { a: O.south[1], b: O.south[0] }, W: { a: [O.west, O.north[0][1] - 1], b: [O.west, O.south[1][1] + 1] }, tooth: O.tooth }
  const notch = O.notch as number[]
  const courts: Rect[] = hp.courts, rooms: Rect[] = hp.rooms, doors: Rect[] = hp.doors
  const pt: number = O.parapet
  const inside = (u: number, v: number, inset = 0): boolean => insideOutline(ol, u, v, inset) && !(u < notch[0]! + inset && v > notch[1]! - inset)
  const kind = (u: number, v: number): number => {
    if (!inside(u, v)) return OUT
    if (courts.some((r) => inRect(r, u, v))) return COURT
    if (rooms.some((r) => inRect(r, u, v))) return ROOM
    if (doors.some((r) => inRect(r, u, v))) return DOOR
    return WALL
  }
  const rim = (u: number, v: number): boolean => !inside(u, v, pt) || courts.some((r) => inRect(r, u, v, pt))
  const oc = outlineCoords(ol, [0, pt])
  const us = [...oc.us, notch[0]!, notch[0]! + pt], vs = [...oc.vs, notch[1]!, notch[1]! - pt]
  for (const r of [...courts, ...rooms, ...doors]) { us.push(...r.u); vs.push(...r.v) }
  for (const r of courts) { us.push(r.u[0] - pt, r.u[1] + pt); vs.push(r.v[0] - pt, r.v[1] + pt) }
  const L = hp.levels
  const faces = cellFaces({ us, vs, kind, rim }, houseLayers(L), zoneFor(Z.paving)).filter((x) => x.zone !== Z.hidden)
  const paving = faces.filter((x) => x.zone === Z.paving), rest = faces.filter((x) => x.zone !== Z.paving)
  const band = L.floor + 2
  const bodies: Body[] = [
    { id: 'house6', geometry: faceGeometry(f, rest), band, letters: ['G', 'G'], floor: L.floor, six: true },
    { id: 'house6-court-paving', geometry: faceGeometry(f, paving), band: 1e6, letters: ['G', 'G'], floor: L.floor, six: true },
    ...houseConstruction(hp, f).map((b) => ({ ...b, band, letters: ['G', 'G'] as [Cls, Cls], floor: L.floor, six: true })),
  ]
  // the area the outline covers, by its cells
  let area = 0
  {
    const uu = uniq(us), vv = uniq(vs)
    for (let j = 0; j + 1 < vv.length; j++) for (let i = 0; i + 1 < uu.length; i++) if (inside((uu[i]! + uu[i + 1]!) / 2, (vv[j]! + vv[j + 1]!) / 2)) area += (uu[i + 1]! - uu[i]!) * (vv[j + 1]! - vv[j]!)
  }
  const size = (r: Rect): number[] => [+(r.u[1] - r.u[0]).toFixed(2), +(r.v[1] - r.v[0]).toFixed(2)]
  const facts: HouseFacts = {
    area: +area.toFixed(1),
    court: size(courts[0]!),
    room4: size(rooms.find((r: J) => r.id === 'room-4')!),
    room4Door: size(doors.find((r: J) => r.id === 'room-4')!),
    doorHead: +(L.doorHead - L.floor).toFixed(2),
    wallToDeck: +(L.deck - L.floor).toFixed(2),
    top: L.top,
    floor: L.floor,
    centre: hp.frame.origin,
    faces: faces.length,
  }
  return { frame: f, bodies, facts }
}

/* ── House VI's construction (plan `build`): the courts' roof edges and parapet caps, the court doors' lintels, sills,
   pivot stones and leaves, a ladder to the roof. Parts in the frame (u, y, v) with smooth normals; every part ends
   inside the body it rests on, never on its plane. ── */
type V3 = [number, number, number]
const v3sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const v3cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const v3norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const v3add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]

/** triangles in a frame: position and normal per vertex, the zone, and a part-local (s, t) for the material's grain */
class Mesher {
  p: V3[] = []
  n: V3[] = []
  z: number[] = []
  w: Array<[number, number]> = []
  tri(p: V3[], n: V3[], zone: number, w: Array<[number, number]>): void {
    const g = v3cross(v3sub(p[1]!, p[0]!), v3sub(p[2]!, p[0]!))
    const m = v3add(v3add(n[0]!, n[1]!), n[2]!)
    const order = g[0] * m[0] + g[1] * m[1] + g[2] * m[2] >= 0 ? [0, 1, 2] : [0, 2, 1]
    for (const k of order) { this.p.push(p[k]!); this.n.push(n[k]!); this.z.push(zone); this.w.push(w[k]!) }
  }
  quad(p: V3[], n: V3[], zone: number, w: Array<[number, number]>): void {
    this.tri([p[0]!, p[1]!, p[2]!], [n[0]!, n[1]!, n[2]!], zone, [w[0]!, w[1]!, w[2]!])
    this.tri([p[0]!, p[2]!, p[3]!], [n[0]!, n[2]!, n[3]!], zone, [w[0]!, w[2]!, w[3]!])
  }
  /** a cylinder from a to b: smooth sides, flat caps where asked */
  cyl(a: V3, b: V3, r: number, seg: number, zone: number, o: { caps?: [boolean, boolean]; phase?: number; rb?: number } = {}): void {
    const ax = v3norm(v3sub(b, a)), len = Math.hypot(...v3sub(b, a))
    const h: V3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const e1 = v3norm(v3cross(ax, h)), e2 = v3cross(ax, e1)
    const rb = o.rb ?? r, ph = o.phase ?? 0
    const ring = (c: V3, rr: number, k: number): { p: V3; n: V3 } => {
      const t = ph + (k / seg) * Math.PI * 2
      const d: V3 = v3add(v3add([0, 0, 0], e1, Math.cos(t)), e2, Math.sin(t))
      return { p: v3add(c, d, rr), n: d }
    }
    for (let k = 0; k < seg; k++) {
      const A = ring(a, r, k), Bq = ring(a, r, k + 1), C = ring(b, rb, k + 1), D = ring(b, rb, k)
      const s0 = (k / seg) * Math.PI * 2 * r, s1 = ((k + 1) / seg) * Math.PI * 2 * r
      this.quad([A.p, Bq.p, C.p, D.p], [A.n, Bq.n, C.n, D.n], zone, [[0, s0], [0, s1], [len, s1], [len, s0]])
    }
    const cap = (c: V3, rr: number, nrm: V3, at: number): void => {
      for (let k = 0; k < seg; k++) {
        const A = ring(c, rr, k), Bq = ring(c, rr, k + 1)
        this.tri([c, A.p, Bq.p], [nrm, nrm, nrm], zone, [[at, 0], [at, rr], [at, rr]])
      }
    }
    if (o.caps?.[0]) cap(a, r, [-ax[0], -ax[1], -ax[2]], 0)
    if (o.caps?.[1]) cap(b, rb, ax, len)
  }
  /** a box from its centre, three unit axes and half sizes; faces named by axis and sign may be left out */
  box(c: V3, axes: [V3, V3, V3], hs: V3, zone: number, skip: string[] = []): void {
    const names = ['x', 'y', 'z']
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      if (skip.includes(`${s < 0 ? '-' : '+'}${names[i]}`)) continue
      const n = axes[i]!.map((x) => x * s) as V3
      const j = (i + 1) % 3, k = (i + 2) % 3
      const ctr = v3add(c, axes[i]!, s * hs[i]!)
      const corner = (a: number, b: number): V3 => v3add(v3add(ctr, axes[j]!, a * hs[j]!), axes[k]!, b * hs[k]!)
      const pts = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]
      // every face keeps the box's own (x, y): a leaf's boards run on across its edges, not along them
      const w = pts.map((q) => { const d = v3sub(q, c); return [d[0] * axes[0]![0] + d[1] * axes[0]![1] + d[2] * axes[0]![2], d[0] * axes[1]![0] + d[1] * axes[1]![1] + d[2] * axes[1]![2]] as [number, number] })
      this.quad(pts, [n, n, n, n], zone, w)
    }
  }
  geometry(f: Frame): BufferGeometry {
    const pos: number[] = [], nor: number[] = [], zone: number[] = [], loc: number[] = []
    for (let i = 0; i < this.p.length; i++) {
      const [u, y, v] = this.p[i]!, [nu, ny, nv] = this.n[i]!
      const [x, z] = toScene(f, u, v)
      pos.push(x, y, z)
      const nn = v3norm([f.a[0] * nu + f.c[0] * nv, ny, f.a[1] * nu + f.c[1] * nv])
      nor.push(...nn)
      zone.push(this.z[i]!)
      loc.push(u, v, ...this.w[i]!)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
    g.setAttribute('zone', new Float32BufferAttribute(zone, 1))
    g.setAttribute('loc', new Float32BufferAttribute(loc, 4))
    return g
  }
}

/** a profile swept round a court's rectangle: each point (a, y) lies on the rectangle grown by a (outward from the
    court, into its walls), its normal (na along that outward, ny); the corners mitre */
function ringSweep(m: Mesher, r: Rect, prof: Array<{ a: number; y: number; na: number; ny: number }>, zone: number): void {
  const sides: Array<(a: number) => { p0: [number, number]; p1: [number, number]; out: [number, number] }> = [
    (a) => ({ p0: [r.u[0] - a, r.v[0] - a], p1: [r.u[1] + a, r.v[0] - a], out: [0, -1] }),
    (a) => ({ p0: [r.u[1] + a, r.v[0] - a], p1: [r.u[1] + a, r.v[1] + a], out: [1, 0] }),
    (a) => ({ p0: [r.u[1] + a, r.v[1] + a], p1: [r.u[0] - a, r.v[1] + a], out: [0, 1] }),
    (a) => ({ p0: [r.u[0] - a, r.v[1] + a], p1: [r.u[0] - a, r.v[0] - a], out: [-1, 0] }),
  ]
  for (const side of sides) {
    for (let i = 0; i + 1 < prof.length; i++) {
      const A = prof[i]!, Bp = prof[i + 1]!
      const sa = side(A.a), sb = side(Bp.a)
      if (Math.abs(A.a - Bp.a) < 1e-9 && Math.abs(A.y - Bp.y) < 1e-9) continue
      const nA: V3 = [sa.out[0] * A.na, A.ny, sa.out[1] * A.na], nB: V3 = [sb.out[0] * Bp.na, Bp.ny, sb.out[1] * Bp.na]
      const len = Math.hypot(sa.p1[0] - sa.p0[0], sa.p1[1] - sa.p0[1])
      m.quad([[sa.p0[0], A.y, sa.p0[1]], [sa.p1[0], A.y, sa.p1[1]], [sb.p1[0], Bp.y, sb.p1[1]], [sb.p0[0], Bp.y, sb.p0[1]]],
        [nA, nA, nB, nB], zone, [[0, A.y], [len, A.y], [len, Bp.y], [0, Bp.y]])
    }
  }
}

/** a door on a court: the wall it pierces in door-local terms (s along the wall, t from the court face into the room) */
interface CourtDoor { id: string; s: [number, number]; depth: number; map: (s: number, t: number) => [number, number]; dir: (ns: number, nt: number) => [number, number] }
function courtDoors(hp: J): CourtDoor[] {
  const out: CourtDoor[] = []
  const eq = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6
  for (const d of hp.doors as Array<Rect & { id: string }>) {
    // House VI's own court only: the doors on Court 12 lie out of every frame of the stop
    for (const c of [hp.courts[0]] as Rect[]) {
      const overlapU = d.u[0] >= c.u[0] - 1e-6 && d.u[1] <= c.u[1] + 1e-6, overlapV = d.v[0] >= c.v[0] - 1e-6 && d.v[1] <= c.v[1] + 1e-6
      // the court line, the sign into the room, and which axis crosses the wall
      let k: { axis: 'u' | 'v'; line: number; sg: number; depth: number } | null = null
      if (overlapU && eq(d.v[0], c.v[1])) k = { axis: 'v', line: d.v[0], sg: 1, depth: d.v[1] - d.v[0] }
      else if (overlapU && eq(d.v[1], c.v[0])) k = { axis: 'v', line: d.v[1], sg: -1, depth: d.v[1] - d.v[0] }
      else if (overlapV && eq(d.u[0], c.u[1])) k = { axis: 'u', line: d.u[0], sg: 1, depth: d.u[1] - d.u[0] }
      else if (overlapV && eq(d.u[1], c.u[0])) k = { axis: 'u', line: d.u[1], sg: -1, depth: d.u[1] - d.u[0] }
      if (!k) continue
      const K = k
      out.push({
        id: d.id,
        s: K.axis === 'v' ? [d.u[0], d.u[1]] : [d.v[0], d.v[1]],
        depth: K.depth,
        map: (s, t) => (K.axis === 'v' ? [s, K.line + K.sg * t] : [K.line + K.sg * t, s]),
        dir: (ns, nt) => (K.axis === 'v' ? [ns, K.sg * nt] : [K.sg * nt, ns]),
      })
    }
  }
  return out
}

export function houseConstruction(hp: J, f: Frame): Array<{ id: string; geometry: BufferGeometry }> {
  const Bd = hp.build, L = hp.levels
  const fl: number = L.floor, head: number = L.doorHead, top: number = L.top, pt: number = hp.outline.parapet
  const R = rng(Bd.seed), R2 = rng(Bd.seed + 1)
  const parts: Array<{ id: string; geometry: BufferGeometry }> = []

  /* the roof's edge over each court, a drip course a little proud of the wall, and the parapet's rounded mud cap */
  const tops = new Mesher()
  const E = Bd.edge, Cp = Bd.cap
  for (const c of hp.courts as Rect[]) {
    // the chamfers wide enough to stay over a pixel from the stop's eye across both courts
    const y0 = L.ceiling, y1 = L.deck, o = -E.out, ch = 0.025
    ringSweep(tops, c, [
      { a: E.in, y: y0, na: 0, ny: -1 }, { a: o + ch, y: y0, na: 0, ny: -1 },
      { a: o + ch, y: y0, na: -0.7, ny: -0.7 }, { a: o, y: y0 + ch, na: -0.7, ny: -0.7 },
      { a: o, y: y0 + ch, na: -1, ny: 0 }, { a: o, y: y1 - ch, na: -1, ny: 0 },
      { a: o, y: y1 - ch, na: -0.7, ny: 0.7 }, { a: o + ch, y: y1, na: -0.7, ny: 0.7 },
      { a: o + ch, y: y1, na: 0, ny: 1 }, { a: E.in, y: y1, na: 0, ny: 1 },
    ], Z.edge)
    // the cap: from under the court side's overhang over the crown to under the deck side's
    const ov: number = Cp.over, w = pt + 2 * ov, prof: Array<{ a: number; y: number; na: number; ny: number }> = []
    prof.push({ a: 0.01, y: top - Cp.drop, na: 0, ny: -1 }, { a: -ov, y: top - Cp.drop, na: 0, ny: -1 })
    const n = 9
    for (let i = 0; i <= n; i++) {
      // a flattened half round over the cap's width, its sides steep
      const t = (i / n) * Math.PI
      const a = -ov + (w * (1 - Math.cos(t))) / 2
      const y = top - Cp.drop + (Cp.drop + Cp.rise) * Math.pow(Math.sin(t), 0.55)
      const dy = (Cp.drop + Cp.rise) * 0.55 * Math.pow(Math.max(Math.sin(t), 1e-3), -0.45) * Math.cos(t), da = (w * Math.sin(t)) / 2
      // the outward normal: the tangent (da, dy) turned a quarter
      const nn = v3norm([-dy, da, 0])
      prof.push({ a, y, na: nn[0], ny: nn[1] })
    }
    prof[2]!.na = -1; prof[2]!.ny = 0
    prof[prof.length - 1]!.na = 1; prof[prof.length - 1]!.ny = 0
    prof.push({ a: pt + ov, y: top - Cp.drop, na: 0, ny: -1 }, { a: pt - 0.01, y: top - Cp.drop, na: 0, ny: -1 })
    ringSweep(tops, c, prof, Z.coping)
  }
  parts.push({ id: 'house6-tops', geometry: tops.geometry(f) })

  /* the court doors: a lintel of poles, a baked-brick sill, a pivot stone and a leaf of boards */
  const lintels = new Mesher(), sills = new Mesher(), pivots = new Mesher(), leaves = new Mesher()
  const LT = Bd.lintel, SL = Bd.sill, PV = Bd.pivot
  for (const d of courtDoors(hp)) {
    const P = (s: number, y: number, t: number): V3 => { const [u, v] = d.map(s, t); return [u, y, v] }
    const N = (ns: number, ny: number, nt: number): V3 => { const [u, v] = d.dir(ns, nt); return [u, ny, v] }
    const s0 = d.s[0], s1 = d.s[1], D = d.depth
    // poles side by side through the wall's depth, the first and last a little proud of its faces; a hand's width past
    // each jamb the wall's plaster laps over those two, so their bearing ends lie inside the wall, not on its face
    const r0 = LT.d / 2, first = r0 - LT.proud, last = D - r0 + LT.proud
    const nL = Math.max(2, Math.round((last - first) / LT.d) + 1)
    for (let k = 0; k < nL; k++) {
      const t = first + ((last - first) * k) / (nL - 1)
      const r = r0 * (0.9 + 0.2 * R()), yc = head - 0.02 + r + 0.01 * (R() - 0.5)
      const ends = k === 0 || k === nL - 1
      const e0 = s0 - LT.bear - 0.05 * R(), e1 = s1 + LT.bear + 0.05 * R(), y1 = yc + 0.012 * (R() - 0.5), ph = R() * 6.28, rEnd = r * (0.9 + 0.12 * R())
      if (!ends) { lintels.cyl(P(e0, yc, t), P(e1, y1, t), r, 16, Z.wood, { caps: [false, false], phase: ph, rb: rEnd }); continue }
      const at = (q: number): number => (q - e0) / (e1 - e0)
      const m0 = s0 - LT.enter * (0.8 + 0.4 * R2()), m1 = s1 + LT.enter * (0.8 + 0.4 * R2())
      const ya = yc + (y1 - yc) * at(m0 + 0.008), yb = yc + (y1 - yc) * at(m1 - 0.008)
      const ra = r + (rEnd - r) * at(m0), rb = r + (rEnd - r) * at(m1)
      lintels.cyl(P(m0 + 0.008, ya, t), P(m1 - 0.008, yb, t), ra, 16, Z.wood, { caps: [true, true], phase: ph, rb })
      // the lap: from a skin just over the pole back onto the wall's face, its proud part easing out over LT.lap; it
      // starts 2 cm onto the pole, past the pole's cut end, so no gap between them shows the wall's face
      const faceT = k === 0 ? 0 : D, out = k === 0 ? -1 : 1, dist = Math.abs(t - faceT), onto = 0.02
      for (const [sm, dir, rr, yy] of [[m0, -1, ra, ya], [m1, 1, rb, yb]] as Array<[number, number, number, number]>) {
        const rl = rr + 0.003
        if (rl <= dist) continue
        const fm = Math.acos(dist / rl), nf = 6, np = 10
        const at3 = (f: number, a: number): V3 => {
          const g = f * f * (3 - 2 * f)
          return P(sm + dir * (f * (LT.lap + onto) - onto), yy + rl * Math.sin(a), faceT + (t + out * rl * Math.cos(a) - faceT) * (1 - g))
        }
        const nrm = (f: number, a: number): V3 => {
          const df = v3sub(at3(Math.min(1, f + 0.01), a), at3(Math.max(0, f - 0.01), a)), da = v3sub(at3(f, a + 0.01), at3(f, a - 0.01))
          const c = v3norm(v3cross(df, da)), o = N(0, 0, out)
          return c[0] * o[0] + c[1] * o[1] + c[2] * o[2] >= 0 ? c : [-c[0], -c[1], -c[2]]
        }
        const grid = (i: number, j: number): [number, number] => [i / nf, -fm + (2 * fm * j) / np]
        for (let i = 0; i < nf; i++) for (let j = 0; j < np; j++) {
          const q = [grid(i, j), grid(i + 1, j), grid(i + 1, j + 1), grid(i, j + 1)]
          lintels.quad(q.map(([f, a]) => at3(f, a)), q.map(([f, a]) => nrm(f, a)), k === 0 ? Z.court : Z.room, q.map(([f, a]) => [f, a] as [number, number]))
        }
      }
    }
    // the sill: a course of baked bricks the opening's width and the wall's depth, proud of both faces
    const sh = SL.rise, so = SL.out, ch = 0.012
    const sp = (s: number, y: number, t: number): V3 => P(s, y, t)
    const A0 = s0 - 0.02, A1 = s1 + 0.02, T0 = -so, T1 = D + so, yb = fl - 0.005, yt = fl + sh
    const Nt = N(0, 1, 0), Nc = N(0, 0, -1), Nr = N(0, 0, 1), N0 = N(-1, 0, 0), N1 = N(1, 0, 0)
    const ce = N(0, 0.7, -0.7), re = N(0, 0.7, 0.7)
    sills.quad([sp(A0, yt, T0 + ch), sp(A1, yt, T0 + ch), sp(A1, yt, T1 - ch), sp(A0, yt, T1 - ch)], [Nt, Nt, Nt, Nt], Z.sill, [[A0, T0], [A1, T0], [A1, T1], [A0, T1]])
    sills.quad([sp(A0, yt - ch, T0), sp(A1, yt - ch, T0), sp(A1, yt, T0 + ch), sp(A0, yt, T0 + ch)], [ce, ce, ce, ce], Z.sill, [[A0, T0], [A1, T0], [A1, T0], [A0, T0]])
    sills.quad([sp(A0, yb, T0), sp(A1, yb, T0), sp(A1, yt - ch, T0), sp(A0, yt - ch, T0)], [Nc, Nc, Nc, Nc], Z.sill, [[A0, T0], [A1, T0], [A1, T0], [A0, T0]])
    sills.quad([sp(A0, yt, T1 - ch), sp(A1, yt, T1 - ch), sp(A1, yt - ch, T1), sp(A0, yt - ch, T1)], [re, re, re, re], Z.sill, [[A0, T1], [A1, T1], [A1, T1], [A0, T1]])
    sills.quad([sp(A0, yt - ch, T1), sp(A1, yt - ch, T1), sp(A1, yb, T1), sp(A0, yb, T1)], [Nr, Nr, Nr, Nr], Z.sill, [[A0, T1], [A1, T1], [A1, T1], [A0, T1]])
    for (const [S, Nn] of [[A0, N0], [A1, N1]] as Array<[number, V3]>) {
      sills.quad([sp(S, yb, T0), sp(S, yt - ch, T0), sp(S, yt, T0 + ch), sp(S, yt, T1 - ch)], [Nn, Nn, Nn, Nn], Z.sill, [[S, T0], [S, T0], [S, T0], [S, T1]])
      sills.quad([sp(S, yb, T0), sp(S, yt, T1 - ch), sp(S, yt - ch, T1), sp(S, yb, T1)], [Nn, Nn, Nn, Nn], Z.sill, [[S, T0], [S, T1], [S, T1], [S, T1]])
    }
    const lf = (Bd.leaves as J[]).find((x) => x.door === d.id)
    if (!lf) continue
    // the leaf turns on a pole standing in a pivot stone just inside the room, at its hinge jamb
    const sg = lf.hinge === 0 ? 1 : -1, sh0 = lf.hinge === 0 ? s0 + PV.inset : s1 - PV.inset, th0 = D + PV.inset
    const pr = PV.r, seg = 11, ring: V3[] = []
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2 + R() * 0.3, rr = pr * (0.8 + 0.35 * R())
      ring.push(P(sh0 + Math.cos(a) * rr, fl + PV.rise, th0 + Math.sin(a) * rr))
    }
    const cTop = P(sh0, fl + PV.rise + 0.004, th0), up: V3 = [0, 1, 0]
    for (let k = 0; k < seg; k++) {
      const a = ring[k]!, b = ring[(k + 1) % seg]!
      pivots.tri([cTop, a, b], [up, up, up], Z.stone, [[0, 0], [a[0] - cTop[0], a[2] - cTop[2]], [b[0] - cTop[0], b[2] - cTop[2]]])
      const a0: V3 = [a[0], fl - 0.005, a[2]], b0: V3 = [b[0], fl - 0.005, b[2]]
      const na = v3norm([a[0] - cTop[0], 0.25, a[2] - cTop[2]]), nb = v3norm([b[0] - cTop[0], 0.25, b[2] - cTop[2]])
      pivots.quad([a0, b0, b, a], [na, nb, nb, na], Z.stone, [[1, 0], [1, 0], [1, 0], [1, 0]])
    }
    const th = (lf.open * Math.PI) / 180
    const ds = sg * Math.cos(th), dt = Math.sin(th)
    const W = s1 - s0 - PV.inset - 0.02, Hh = head - 0.05 - (fl + 0.05), yc = fl + 0.05 + Hh / 2
    const ax = N(ds, 0, dt), ay: V3 = [0, 1, 0], az = v3cross(ax, ay)
    const hinge = P(sh0, yc, th0)
    leaves.box(v3add(hinge, ax, W / 2), [ax, ay, az], [W / 2, Hh / 2, 0.022], Z.leaf)
    for (const hb of [0.32, Hh - 0.32]) leaves.box(v3add(v3add(v3add(hinge, ax, W / 2 + 0.02), az, 0.022 + 0.012), ay, hb - Hh / 2), [ax, ay, az], [W / 2 - 0.06, 0.055, 0.013], Z.wood, ['-z'])
    leaves.cyl(P(sh0, fl - 0.005, th0), P(sh0, head + 0.1, th0), 0.045, 10, Z.wood, { caps: [false, false], phase: R() * 6.28 })
    // the pole's upper socket: a block fixed to the wall's room face
    const tc = (D - 0.02 + th0 + 0.06) / 2
    leaves.box(P(sh0, head + 0.08, tc), [N(1, 0, 0), ay, N(0, 0, 1)], [0.08, 0.06, (th0 + 0.06 - (D - 0.02)) / 2], Z.wood, ['-z'])
  }
  parts.push({ id: 'house6-lintels', geometry: lintels.geometry(f) }, { id: 'house6-sills', geometry: sills.geometry(f) },
    { id: 'house6-pivots', geometry: pivots.geometry(f) }, { id: 'house6-leaves', geometry: leaves.geometry(f) })

  /* a ladder of two poles and rungs leaning on a court wall's cap: `wall` the axis its face runs across (u for an
     east or west wall, v for a north or south one), `at` the face's line, `s` the poles along the face */
  const LD = Bd.ladder
  if (LD) {
    const ld = new Mesher()
    const sgn = Math.sign(-LD.at) || 1
    const Q = (s: number, y: number, t: number): V3 => (LD.wall === 'u' ? [t, y, s] : [s, y, t])
    const t0 = LD.at + sgn * LD.foot, t1 = LD.at + sgn * (Cp.over + LD.r + 0.004)
    const slope = (t1 - t0) / (top - (fl - 0.005))
    for (const s of LD.s as number[]) {
      const foot = Q(s, fl - 0.005, t0), rest = Q(s, top, t1)
      const dir = v3norm(v3sub(rest, foot)), k = (top + LD.over - foot[1]) / dir[1]
      ld.cyl(foot, v3add(foot, dir, k), LD.r * (0.95 + 0.1 * R()), 10, Z.wood, { caps: [false, true], phase: R() * 6.28, rb: LD.r * 0.8 })
    }
    // rungs lashed on by hand: their spacing and level a little uneven
    const sa = (LD.s as number[])[0]!, sb = (LD.s as number[])[1]!
    for (let y = fl + 0.32; y < top - 0.2; y += LD.step * (0.9 + 0.2 * R())) {
      const ya = y + 0.012 * (R() - 0.5), yb = y + 0.012 * (R() - 0.5)
      const ta = t0 + slope * (ya - (fl - 0.005)), tb = t0 + slope * (yb - (fl - 0.005))
      ld.cyl(Q(sa + LD.r * 0.4, ya, ta), Q(sb - LD.r * 0.4, yb, tb), LD.rung * (0.85 + 0.3 * R()), 7, Z.wood, { caps: [false, false], phase: R() * 6.28 })
    }
    parts.push({ id: 'house6-ladder', geometry: ld.geometry(f) })
  }
  return parts
}

/* ── a court-house block: an outline (a quad in the frame, toothed), courts, ridges where two houses meet; no rooms ── */
export interface BlockSpec {
  id: string
  frame: Frame
  ol: Outline
  courts: Rect[]
  /** lot lines inside the block (u = const or v = const), raised where two houses' parapets meet */
  ridges: Array<{ u?: number; v?: number }>
  base: number
  floor: number
  deck: number
  top: number
  /** a terrace's foot under the house (House III): its outer faces take the terrace's zone */
  terrace?: boolean
}
export function blockBody(b: BlockSpec, pt = 0.4): Body {
  const inside = (u: number, v: number, inset = 0): boolean => insideOutline(b.ol, u, v, inset)
  const ridge = (u: number, v: number): boolean => b.ridges.some((r) => (r.u !== undefined ? Math.abs(u - r.u) < pt : Math.abs(v - r.v!) < pt))
  const kind = (u: number, v: number): number => (!inside(u, v) ? OUT : b.courts.some((r) => inRect(r, u, v)) ? COURT : WALL)
  const rim = (u: number, v: number): boolean => !inside(u, v, pt) || b.courts.some((r) => inRect(r, u, v, pt)) || ridge(u, v)
  const oc = outlineCoords(b.ol, [0, pt])
  const us = [...oc.us], vs = [...oc.vs]
  for (const r of b.courts) { us.push(...r.u, r.u[0] - pt, r.u[1] + pt); vs.push(...r.v, r.v[0] - pt, r.v[1] + pt) }
  for (const r of b.ridges) { if (r.u !== undefined) us.push(r.u - pt, r.u + pt); else vs.push(r.v! - pt, r.v! + pt) }
  const layers: Layer[] = [
    { name: 'floor', y0: b.base, y1: b.floor, solid: (k) => k !== OUT },
    { name: 'roof', y0: b.floor, y1: b.deck, solid: (k) => k !== COURT },
    { name: 'parapet', y0: b.deck, y1: b.top, solid: (k, r) => r && k !== COURT },
  ]
  const zone = (side: 'side' | 'up' | 'down', layer: string, k: number, own: number, r: boolean): number => {
    if (side === 'side') {
      if (layer === 'floor') return b.terrace && k === OUT ? Z.terrace : k === COURT ? Z.court : Z.outer
      if (k === OUT) return Z.outer
      if (k === COURT) return Z.court
      return Z.parapetBack
    }
    if (side === 'up') return layer === 'floor' ? (k === COURT ? Z.courtFloor : Z.hidden) : layer === 'parapet' ? Z.coping : Z.deck
    return Z.hidden
  }
  const faces = cellFaces({ us, vs, kind, rim }, layers, zone).filter((x) => x.zone !== Z.hidden)
  return { id: b.id, geometry: faceGeometry(b.frame, faces), band: b.floor + 2, letters: ['G', 'G'], floor: b.floor }
}

/* seeded numbers */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** a block given as a UTM rectangle turned into a toothed quad in the house frame, cut into lots with a court each */
function quarterBlock(id: string, rect: number[][], f: Frame, E0: number, N0: number, Q: J, ground: (x: number, z: number) => number, R: () => number): BlockSpec | null {
  // the rectangle's corners in the frame
  const cs = rect.map(([E, N]) => toFrame(f, E! - E0, N0 - N!))
  // sort into north-west, north-east, south-east, south-west by the frame's axes
  const byV = [...cs].sort((p, q) => p[1] - q[1])
  const north = byV.slice(0, 2).sort((p, q) => p[0] - q[0]), south = byV.slice(2).sort((p, q) => p[0] - q[0])
  const [nw, ne] = north as [P2, P2], [sw, se] = south as [P2, P2]
  const ol: Outline = { N: { a: nw, b: ne }, E: { a: ne, b: se }, S: { a: sw, b: se }, W: { a: nw, b: sw }, tooth: 2.4 }
  // lots on the frame's axes over the block's inner box
  const u0 = Math.max(nw[0], sw[0]) + 1, u1 = Math.min(ne[0], se[0]) - 1, v0 = Math.max(nw[1], ne[1]) + 1, v1 = Math.min(sw[1], se[1]) - 1
  if (u1 - u0 < 10 || v1 - v0 < 10) return null
  const keep: Array<{ poly: P2[] }> = (Q.keep ?? []).map((k: J) => ({ poly: k.poly.map(([E, N]: number[]) => toFrame(f, E! - E0, N0 - N!)) }))
  const inKeep = (u: number, v: number): boolean => keep.some((k) => pip([u, v], k.poly))
  const courts: Rect[] = [], ridges: Array<{ u?: number; v?: number }> = []
  const rows = v1 - v0 > 2 * Q.depth[0] ? 2 : 1
  const rowD = (v1 - v0) / rows
  for (let r = 0; r < rows; r++) {
    const rv0 = v0 + r * rowD, rv1 = rv0 + rowD
    if (r > 0) ridges.push({ v: rv0 })
    let lu = u0
    while (lu < u1 - 8) {
      let lw = Q.lot[0] + R() * (Q.lot[1] - Q.lot[0])
      if (u1 - (lu + lw) < Q.lot[0] * 0.7) lw = u1 - lu
      const area = lw * rowD * (Q.court * (0.85 + R() * 0.3))
      const asp = 0.8 + R() * 0.4
      const cw = Math.min(Math.sqrt(area * asp), lw - 6), cd = Math.min(area / Math.sqrt(area * asp), rowD - 6)
      const cu = lu + lw / 2 + (R() - 0.5) * Math.max(0, lw - cw - 7), cv = (rv0 + rv1) / 2 + (R() - 0.5) * Math.max(0, rowD - cd - 7)
      const c: Rect = { u: [cu - cw / 2, cu + cw / 2], v: [cv - cd / 2, cv + cd / 2] }
      const corners: P2[] = [[c.u[0] - 2.5, c.v[0] - 2.5], [c.u[1] + 2.5, c.v[0] - 2.5], [c.u[1] + 2.5, c.v[1] + 2.5], [c.u[0] - 2.5, c.v[1] + 2.5]]
      if (cw > 3 && cd > 3 && corners.every(([u, v]) => insideOutline(ol, u, v, 0.5) && !inKeep(u, v))) courts.push(c)
      lu += lw
      if (lu < u1 - 1) ridges.push({ u: lu })
    }
  }
  // the block on the lowest ground under it, its floor over the highest
  let gLo = Infinity, gHi = -Infinity
  for (const [u, v] of [nw, ne, se, sw, [(u0 + u1) / 2, (v0 + v1) / 2] as P2]) {
    const [x, z] = toScene(f, u, v)
    const g = ground(x, z)
    gLo = Math.min(gLo, g)
    gHi = Math.max(gHi, g)
  }
  const floor = gHi + 0.15, wall = Q.walls[0] + R() * (Q.walls[1] - Q.walls[0])
  return { id, frame: f, ol, courts, ridges, base: gLo - 1.2, floor, deck: floor + wall, top: floor + wall + 0.35 }
}

export function pip(p: P2, poly: P2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

/** the map prisms this module draws instead of the map */
export const TAKEN_HOUSE = (id: string, blocks: string[]): boolean => id === 'house6-floor' || blocks.includes(id)

export interface House { frame: Frame; bodies: Body[]; built: Built; facts: HouseFacts; lanes: P2[] }

/** House VI, House III, the refined Merkes blocks and the lanes; the map's plan without the prisms they replace */
export function buildHouse(built: Built, mapPlan: J, hp: J): House {
  const E0: number = mapPlan.frame.E0, N0: number = mapPlan.frame.N0
  const h6 = buildHouse6(hp, E0, N0)
  const bodies: Body[] = [...h6.bodies]
  // House III on its terrace
  const H3 = hp.house3
  const f3 = frameOf(H3.frame.origin, H3.frame.bearing, E0, N0)
  const o3 = H3.outline
  const [ua, ub] = o3.u as number[], [va, vb] = o3.v as number[]
  const ol3: Outline = {
    N: { a: [ua!, va!], b: [ub!, va! + o3.skewN * (ub! - ua!)] },
    E: { a: [ub!, va! + o3.skewN * (ub! - ua!)], b: [ub! + o3.skewE * (vb! - va!), vb!] },
    S: { a: [ua!, vb!], b: [ub! + o3.skewE * (vb! - va!), vb!] },
    W: { a: [ua!, va!], b: [ua!, vb!] },
    tooth: o3.tooth,
  }
  const g3 = built.ground(f3.o[0], f3.o[1])
  bodies.push(blockBody({ id: 'house3', frame: f3, ol: ol3, courts: H3.courts, ridges: [], base: g3 - 1.2, floor: H3.levels.terrace, deck: H3.levels.deck, top: H3.levels.top, terrace: true }))
  // the Merkes blocks round them
  const Q = hp.quarter
  const R = rng(Q.seed)
  const fq = frameOf(hp.frame.origin, hp.frame.bearing, E0, N0)
  const taken: string[] = []
  for (const id of Q.blocks as string[]) {
    const b = mapPlan.blocks.find((x: J) => x.id === id)
    if (!b?.poly) continue
    taken.push(id)
    const parts: number[][][] = id === 'merkes-4' ? Q.split : [b.poly]
    parts.forEach((poly, k) => {
      const spec = quarterBlock(parts.length > 1 ? `${id}-${k}` : id, poly, fq, E0, N0, Q, built.ground, R)
      if (spec) bodies.push(blockBody({ ...spec, id: `quarter-${spec.id}` }))
    })
  }
  // the lanes' slab a little inside the flat, so its sides meet no block's face on the flat's edge
  const fl: P2[] = hp.flat.poly.map(([E, N]: number[]) => [E! - E0, N0 - N!] as P2)
  const cx = fl.reduce((t, p) => t + p[0], 0) / fl.length, cz = fl.reduce((t, p) => t + p[1], 0) / fl.length
  const lanes: P2[] = fl.map(([x, z]) => [x - Math.sign(x - cx) * 1.3, z - Math.sign(z - cz) * 1.3] as P2)
  const facts = { house6: h6.facts, bodies: bodies.length }
  return { frame: h6.frame, bodies, built: { ...built, prisms: built.prisms.filter((p) => !TAKEN_HOUSE(p.id, taken)) }, facts, lanes }
}

/** the lanes round the houses: a slab over the quarter's flat (a quad), its top a little over the ground there */
export function lanesBody(poly: P2[], level: number): Body {
  const y0 = level - 0.35, y1 = level + 0.05
  const I: Frame = { o: [0, 0], a: [1, 0], c: [0, 1], bearing: 90 }
  const faces: Face[] = [{ p: poly.map(([x, z]) => [x, y1, z]), n: [0, 1, 0], zone: 12, loc: [] }]
  let area = 0
  for (let i = 0; i < poly.length; i++) { const p = poly[i]!, q = poly[(i + 1) % poly.length]!; area += p[0] * q[1] - q[0] * p[1] }
  const s = area > 0 ? 1 : -1
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!
    const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz)
    faces.push({ p: [[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]], n: [(-s * dz) / L, 0, (s * dx) / L], zone: 12, loc: [] })
  }
  const g = faceGeometry(I, faces)
  const lc = g.getAttribute('loc')
  for (let k = 0; k < lc.count; k++) lc.setXY(k, 0, 0)
  return { id: 'merkes-lanes', geometry: g, band: 1e6, letters: ['G', 'G'], floor: level }
}
