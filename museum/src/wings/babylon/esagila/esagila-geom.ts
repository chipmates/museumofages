/* STOP 9'S BODIES (the walk's old stops 10 and 11), pure geometry (three's buffers, no DOM), so the map page and the
   node checks build the same: Esagila's main building on its casing, the north front's towers and pilasters, the north
   gate's unit with its arch, its closed door and its ramp, the annex as its outline, the open ground before them, the
   wall before Gate 8 and the street round the precinct's south-east corner and west along its south side.
   Scene frame as plan.ts (x east, y up, z south). Every body carries `kind` (0 plaster, 1 the casing's brick, 2 the
   street, 3 the open ground, 4 the ramp's paving, 5 the door, 6 a mud wall) and `fa` (per kind: the plaster's top and
   foot; the street's along and across metres, its width and lip; the ground's distances to its west and east ends).
   Bodies that overlap never share a plane: each part reaches a few decimetres into its neighbour instead.
   Only type imports from the wing: node resolves no relative module without its extension. */

import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Path, Shape } from 'three/webgpu'
import type { Built, Cls, P2 } from '../map/plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

export const KIND = { plaster: 0, casing: 1, street: 2, ground: 3, ramp: 4, door: 5, mud: 6 } as const

export interface EsagilaBody { id: string; geometry: BufferGeometry; band: number; letters: [Cls, Cls] }

/** a face of the main building: s along it from its first corner, t outward from the drawn outer face */
export interface Face { o: P2; a: P2; n: P2; len: number; at: (s: number, t: number) => P2 }

export interface Esagila { north: Face; bodies: EsagilaBody[]; built: Built; facts: Record<string, unknown> }

/** the map prisms this module draws instead of the map */
export const TAKEN_PRISM = (id: string): boolean => id === 'esagila' || id === 'esagila-annex'

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]]
const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]]
const mul = (a: P2, k: number): P2 => [a[0] * k, a[1] * k]
const dot = (a: P2, b: P2): number => a[0] * b[0] + a[1] * b[1]
const norm = (a: P2): P2 => {
  const l = Math.hypot(a[0], a[1]) || 1
  return [a[0] / l, a[1] / l]
}
const centroid = (poly: P2[]): P2 => mul(poly.reduce((s, p) => add(s, p), [0, 0] as P2), 1 / poly.length)

/* ── a triangle soup with the shared attribute set ── */
class Soup {
  pos: number[] = []
  kind: number[] = []
  fa: number[] = []
  tri(p: number[][], k: number, f: number[][]): void {
    for (let j = 0; j < 3; j++) {
      this.pos.push(...p[j]!)
      this.kind.push(k)
      this.fa.push(...f[j]!)
    }
  }
  /** a quad p0 p1 p2 p3 (counter-clockwise seen from its front) */
  quad(p: number[][], k: number, f: number[][]): void {
    this.tri([p[0]!, p[1]!, p[2]!], k, [f[0]!, f[1]!, f[2]!])
    this.tri([p[0]!, p[2]!, p[3]!], k, [f[0]!, f[2]!, f[3]!])
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('kind', new Float32BufferAttribute(this.kind, 1))
    g.setAttribute('fa', new Float32BufferAttribute(this.fa, 4))
    g.computeVertexNormals()
    return g
  }
}

/** the attributes every body carries, on a geometry made by three (kind and fa constant over it) */
function stamp(g0: BufferGeometry, kind: number, fa: number[]): BufferGeometry {
  if (g0.getAttribute('uv')) g0.deleteAttribute('uv')
  const g = g0.index ? g0.toNonIndexed() : g0
  const n = g.getAttribute('position').count
  g.setAttribute('kind', new Float32BufferAttribute(new Float32Array(n).fill(kind), 1))
  const f = new Float32Array(n * 4)
  for (let k = 0; k < n; k++) f.set(fa, k * 4)
  g.setAttribute('fa', new Float32BufferAttribute(f, 4))
  return g
}

/** one geometry of several with the same attributes (non-indexed), so a body may be built of overlapping parts */
function join(parts: BufferGeometry[]): BufferGeometry {
  const names = ['position', 'normal', 'kind', 'fa']
  const g = new BufferGeometry()
  for (const nm of names) {
    const size = parts[0]!.getAttribute(nm).itemSize
    const arr = new Float32Array(parts.reduce((s, p) => s + p.getAttribute(nm).count * size, 0))
    let o = 0
    for (const p of parts) {
      const a = p.getAttribute(nm).array as Float32Array
      arr.set(a, o)
      o += a.length
    }
    g.setAttribute(nm, new Float32BufferAttribute(arr, size))
  }
  return g
}

/** a vertical prism from a plan outline (scene x, z) with holes, y0 to y1 */
function prism(poly: P2[], holes: P2[][], y0: number, y1: number, kind: number, fa: number[]): BufferGeometry {
  const sh = new Shape()
  sh.moveTo(poly[0]![0], -poly[0]![1])
  for (const [px, pz] of poly.slice(1)) sh.lineTo(px, -pz)
  sh.closePath()
  for (const h of holes) {
    const p = new Path()
    p.moveTo(h[0]![0], -h[0]![1])
    for (const [px, pz] of h.slice(1)) p.lineTo(px, -pz)
    p.closePath()
    sh.holes.push(p)
  }
  const e = new ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, steps: 1 })
  e.rotateX(-Math.PI / 2)
  e.translate(0, y0, 0)
  const g = stamp(e, kind, fa)
  g.computeVertexNormals()
  return g
}

/** a convex body of eight corners (the foot's four, then the top's four in the same order), each face wound outward */
function hexa(c: number[][], kind: number, fa: number[]): BufferGeometry {
  const q = new Soup()
  const ctr = [0, 1, 2].map((k) => c.reduce((s, p) => s + p[k]!, 0) / 8)
  const F = Array(4).fill(fa) as number[][]
  const face = (p: number[][]): void => {
    const u = [0, 1, 2].map((k) => p[1]![k]! - p[0]![k]!), v = [0, 1, 2].map((k) => p[2]![k]! - p[0]![k]!)
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
    const m = [0, 1, 2].map((k) => (p[0]![k]! + p[1]![k]! + p[2]![k]! + p[3]![k]!) / 4 - ctr[k]!)
    q.quad(n[0]! * m[0]! + n[1]! * m[1]! + n[2]! * m[2]! >= 0 ? p : [p[0]!, p[3]!, p[2]!, p[1]!], kind, F)
  }
  face([c[0]!, c[1]!, c[2]!, c[3]!])
  face([c[4]!, c[5]!, c[6]!, c[7]!])
  for (let k = 0; k < 4; k++) face([c[k]!, c[(k + 1) % 4]!, c[4 + ((k + 1) % 4)]!, c[4 + k]!])
  return q.geometry()
}

/** a box in a face's frame: s0..s1 along, t0..t1 out, y0..y1 (a flat top, or a top from yA at t0 to yB at t1) */
function box(F: Face, s0: number, s1: number, t0: number, t1: number, y0: number, y1: number, kind: number, fa: number[], y1b = y1): BufferGeometry {
  const P = (s: number, t: number, y: number): number[] => {
    const p = F.at(s, t)
    return [p[0], y, p[1]]
  }
  return hexa([P(s0, t0, y0), P(s1, t0, y0), P(s1, t1, y0), P(s0, t1, y0), P(s0, t0, y1), P(s1, t0, y1), P(s1, t1, y1b), P(s0, t1, y1b)], kind, fa)
}

/** a face standing out to tFront between s0 and s1 with n vertical grooves of width gw and depth dep cut into it:
    a body set back by dep and n + 1 strips standing out in front of it */
function fluted(F: Face, s0: number, s1: number, tBack: number, tFront: number, n: number, gw: number, dep: number, y0: number, y1: number, fa: number[]): BufferGeometry[] {
  const parts = [box(F, s0, s1, tBack, tFront - dep, y0, y1, KIND.plaster, fa)]
  const fw = (s1 - s0 - n * gw) / (n + 1)
  for (let k = 0; k <= n; k++) parts.push(box(F, s0 + k * (fw + gw), s0 + k * (fw + gw) + fw, tFront - dep - 0.1, tFront, y0, y1, KIND.plaster, fa))
  return parts
}

/** an arch through a block in a face's frame, as blocks: the two piers, and over the opening one block per equal slice
    of its width from the arc's chord up to the top (no long thin triangles, as a cut outline's cap would give) */
function archBlock(F: Face, s0: number, s1: number, a0: number, a1: number, yFoot: number, yTop: number, apex: number, t0: number, t1: number, n: number, fa: number[]): BufferGeometry[] {
  const r = (a1 - a0) / 2, c = (a0 + a1) / 2, spring = apex - r
  const arcY = (s: number): number => spring + Math.sqrt(Math.max(0, r * r - (s - c) * (s - c)))
  const P = (s: number, t: number, y: number): number[] => {
    const p = F.at(s, t)
    return [p[0], y, p[1]]
  }
  const parts = [box(F, s0, a0, t0, t1, yFoot, yTop, KIND.plaster, fa), box(F, a1, s1, t0, t1, yFoot, yTop, KIND.plaster, fa)]
  for (let k = 0; k < n; k++) {
    const u = a0 + ((a1 - a0) * k) / n, v = a0 + ((a1 - a0) * (k + 1)) / n
    const yu = k === 0 ? spring : arcY(u), yv = k === n - 1 ? spring : arcY(v)
    parts.push(hexa([P(u, t0, yu), P(v, t0, yv), P(v, t1, yv), P(u, t1, yu), P(u, t0, yTop), P(v, t0, yTop), P(v, t1, yTop), P(u, t1, yTop)], KIND.plaster, fa))
  }
  return parts
}

/** a leaf filling an arch, as blocks: up to the springing, then one block per equal slice up to the arc's chord */
function archLeaf(F: Face, a0: number, a1: number, yFoot: number, apex: number, t0: number, t1: number, n: number, kind: number, fa: number[]): BufferGeometry[] {
  const r = (a1 - a0) / 2, c = (a0 + a1) / 2, spring = apex - r
  const arcY = (s: number): number => spring + Math.sqrt(Math.max(0, r * r - (s - c) * (s - c)))
  const P = (s: number, t: number, y: number): number[] => {
    const p = F.at(s, t)
    return [p[0], y, p[1]]
  }
  const parts = [box(F, a0, a1, t0, t1, yFoot, spring, kind, fa)]
  for (let k = 0; k < n; k++) {
    const u = a0 + ((a1 - a0) * k) / n, v = a0 + ((a1 - a0) * (k + 1)) / n
    const yu = Math.max(arcY(u), spring + 0.05), yv = Math.max(arcY(v), spring + 0.05)
    parts.push(hexa([P(u, t0, spring - 0.01), P(v, t0, spring - 0.01), P(v, t1, spring - 0.01), P(u, t1, spring - 0.01), P(u, t0, yu), P(v, t0, yv), P(v, t1, yv), P(u, t1, yu)], kind, fa))
  }
  return parts
}

export function buildEsagila(built: Built, mapPlan: J, ep: J): Esagila {
  const E0: number = mapPlan.frame.E0, N0: number = mapPlan.frame.N0
  const S = (E: number, N: number): P2 => [E - E0, N0 - N]
  const block = (id: string): J => mapPlan.blocks.find((b: J) => b.id === id)
  const main = block('esagila'), annexB = block('esagila-annex')
  const C: P2[] = main.poly.map((p: number[]) => S(p[0]!, p[1]!))
  const ctr = centroid(C)
  const face = (p: P2, q: P2): Face => {
    const a = norm(sub(q, p))
    let n: P2 = [a[1], -a[0]]
    if (dot(n, sub(mul(add(p, q), 0.5), ctr)) < 0) n = [-n[0], -n[1]]
    return { o: p, a, n, len: Math.hypot(q[0] - p[0], q[1] - p[1]), at: (s, t) => add(add(p, mul(a, s)), mul(n, t)) }
  }
  const FN = face(C[0]!, C[1]!), FE = face(C[1]!, C[2]!), FS = face(C[2]!, C[3]!), FW = face(C[3]!, C[0]!)
  const sides = [FN, FE, FS, FW]
  /** the outline moved inward by d on every side (a rectangle) */
  const inset = (d: number): P2[] => C.map((p, k) => {
    const before = sides[(k + 3) % 4]!, after = sides[k]!
    return sub(sub(p, mul(before.n, d)), mul(after.n, d))
  })
  const g = (x: number, z: number): number => built.ground(x, z)
  const BAND: number = mapPlan.classes.band
  const bodies: EsagilaBody[] = []
  const floor0 = Math.min(...C.map((p) => g(p[0], p[1])))
  const yCase = floor0 - 0.5, yWall = floor0 - 0.7, yAnnex = floor0 - 0.6
  const K = ep.casing, U = ep.units, G = ep.gate
  const thick: number = K.thick, lap: number = K.lap
  const back = -(thick + lap + 0.2)
  const top: number = main.top
  const plasterFa = (yTop: number, yFoot: number, pitch = 0): number[] => [yTop, yFoot, pitch, 0]
  const caseFa = [K.top, floor0, 0, 0]

  /* ── the casing: a ring 2 m thick from the drawn face, and the north gate unit's skins ── */
  {
    const ring = prism(C, [inset(thick + lap)], yCase, K.top, KIND.casing, caseFa)
    const [fw0] = G.flanks[0] as number[], [, fe1] = G.flanks[1] as number[]
    const [c0, c1] = G.centre as number[], [p0, p1] = G.passage as number[]
    // the passage through the casing is 5 cm wider than the arch above, so the two never share a plane
    const q0 = p0! - 0.05, q1 = p1! + 0.05
    const parts = [
      ring,
      box(FN, fw0!, c0! + 0.4, -lap, G.flankOut, yCase, K.top, KIND.casing, caseFa),
      box(FN, c1! - 0.4, fe1!, -lap, G.flankOut, yCase, K.top, KIND.casing, caseFa),
      box(FN, c0!, q0, -lap, G.centreOut, yCase, K.top, KIND.casing, caseFa),
      box(FN, q1, c1!, -lap, G.centreOut, yCase, K.top, KIND.casing, caseFa),
    ]
    bodies.push({ id: 'esagila-casing', geometry: join(parts), band: floor0 + BAND, letters: ['M', 'M'] })
  }

  /* ── the walls above: the outline 2 m in, round the court, its floor; the pilasters between the north towers ── */
  const units: Array<{ s0: number; s1: number }> = []
  {
    const [cw, ch] = ep.main.court as number[]
    const ea = FN.a, ec = mul(FW.a, -1)
    const courtAt = (w: number, h: number): P2[] => [add(add(ctr, mul(ea, -w / 2)), mul(ec, -h / 2)), add(add(ctr, mul(ea, w / 2)), mul(ec, -h / 2)), add(add(ctr, mul(ea, w / 2)), mul(ec, h / 2)), add(add(ctr, mul(ea, -w / 2)), mul(ec, h / 2))]
    const walls = prism(inset(thick), [courtAt(cw!, ch!)], yWall, top, KIND.plaster, plasterFa(top, K.top))
    const floor = prism(courtAt(cw! + 1, ch! + 1), [], yWall, ep.main.floor, KIND.plaster, plasterFa(-1, ep.main.floor))
    // the units along the north face: the corner towers, two towers between each corner and the gate's flanks
    const cs = U.corner
    const [fw0] = G.flanks[0] as number[], [, fe1] = G.flanks[1] as number[]
    units.push({ s0: thick - cs.out, s1: thick - cs.out + cs.w })
    const spread = (a: number, b: number): void => {
      const n: number = U.between, w: number = U.tower.w
      const gap = (b - a - n * w) / (n + 1)
      for (let k = 0; k < n; k++) units.push({ s0: a + gap * (k + 1) + w * k, s1: a + gap * (k + 1) + w * (k + 1) })
    }
    spread(units[0]!.s1, fw0!)
    units.push({ s0: fw0!, s1: fe1! })
    const eastCorner = { s0: FN.len - thick + cs.out - cs.w, s1: FN.len - thick + cs.out }
    spread(fe1!, eastCorner.s0)
    units.push(eastCorner)
    units.sort((a, b) => a.s0 - b.s0)
    // the curtain between two units: n shallow pilasters, evenly
    const pil: BufferGeometry[] = []
    const PL = U.pilaster
    for (let k = 0; k + 1 < units.length; k++) {
      const a0 = units[k]!.s1, b0 = units[k + 1]!.s0
      for (let j = 1; j <= PL.n; j++) {
        const m = a0 + ((b0 - a0) * j) / (PL.n + 1)
        pil.push(box(FN, m - PL.w / 2, m + PL.w / 2, back, -thick + PL.out, U.foot, top, KIND.plaster, plasterFa(top, K.top)))
      }
    }
    bodies.push({ id: 'esagila', geometry: join([walls, floor, ...pil]), band: floor0 + BAND, letters: ['M', 'G'] })
  }

  /* ── the north front's towers: two stepped layers each; the corners stand out on both faces ── */
  let nTower = 0
  const towerFacts: number[] = []
  {
    const cs = U.corner, tw = U.tower
    const corners = [units[0]!, units[units.length - 1]!]
    const GR = U.grooves
    for (const u of corners) {
      const geo = join(fluted(FN, u.s0, u.s1, -thick + cs.out - cs.w, -thick + cs.out, 2, GR.w, GR.depth, U.foot, cs.top, plasterFa(cs.top, K.top)))
      bodies.push({ id: `esagila-tower-${++nTower}`, geometry: geo, band: -1, letters: ['M', 'G'] })
      towerFacts.push(+((u.s0 + u.s1) / 2).toFixed(2))
    }
    for (const u of units.slice(1, -1)) {
      if (u.s1 - u.s0 > tw.w + 0.01) continue
      const c = (u.s0 + u.s1) / 2
      const outer = box(FN, u.s0, u.s1, back, -thick + tw.out, U.foot, tw.top, KIND.plaster, plasterFa(tw.top, K.top))
      const inner = fluted(FN, c - tw.inner.w / 2, c + tw.inner.w / 2, back, -thick + tw.inner.out, 2, GR.w, GR.depth, U.foot, tw.inner.top, plasterFa(tw.inner.top, K.top))
      bodies.push({ id: `esagila-tower-${++nTower}`, geometry: join([outer, ...inner]), band: -1, letters: ['M', 'G'] })
      towerFacts.push(+c.toFixed(2))
    }
  }

  /* ── the north gate: its flanks, the centre block with its arch, the closed door ── */
  const [p0, p1] = G.passage as number[]
  const pc = (p0! + p1!) / 2
  {
    const [fw0, fw1] = G.flanks[0] as number[], [fe0, fe1] = G.flanks[1] as number[]
    const [c0, c1] = G.centre as number[]
    const side = 0.3
    const flankT = -thick + G.flankOut, centreT = -thick + G.centreOut
    const GR = U.grooves
    // each flank fluted on its visible front; its inner end runs into the centre block
    const flankW = fluted(FN, fw0! + side, fw1! + 0.5, back, flankT, 2, GR.w, GR.depth, U.foot, G.flankTop, plasterFa(G.flankTop, K.top))
    const flankE = fluted(FN, fe0! - 0.5, fe1! - side, back, flankT, 2, GR.w, GR.depth, U.foot, G.flankTop, plasterFa(G.flankTop, K.top))
    // the centre block: the arch through it, and in its front skin a wider arch, so the door stands in a stepped reveal
    const R = G.reveal
    const fc = plasterFa(G.centreTop, K.top)
    const centre = archBlock(FN, c0! + side, c1! - side, p0!, p1!, U.foot, G.centreTop, G.arch, back, centreT - R.depth + 0.1, G.archSlices, fc)
    const front = archBlock(FN, c0! + side + 0.05, c1! - side - 0.05, p0! - R.w, p1! + R.w, U.foot, G.centreTop - 0.05, G.arch + R.w, centreT - R.depth, centreT, G.archSlices, fc)
    bodies.push({ id: 'esagila-gate-n', geometry: join([...flankW, ...flankE, ...centre, ...front]), band: -1, letters: ['M', 'G'] })
    // the door leaf closes the arch 2.6 m in from the centre block's face: nothing of the inside is shown. Its ends stop
    // 1 cm inside the landing's sides and its crown takes one slice more than the arch's (two even counts share the
    // middle seam), so none of its faces lies in a plane of the landing or the arch; the springing stays the arch's
    const dt: number = G.door.at, dIn = 0.14
    const door = join(archLeaf(FN, p0! - dIn, p1! + dIn, ep.main.floor - 0.1, G.arch + dIn, dt - G.door.thick, dt, G.archSlices + 1, KIND.door, [pc, 0, 0, 0]))
    bodies.push({ id: 'esagila-door-n', geometry: door, band: -1, letters: ['G', 'G'] })
  }

  /* ── the ramp: a paved slope from the ground to the floor, a landing through the casing to the door, balustrades ── */
  const R = ep.ramp
  const rampFoot = G.centreOut + R.length
  const yFloor: number = ep.main.floor
  const footAt = FN.at(pc, rampFoot)
  const yGround = g(footAt[0], footAt[1])
  {
    const w0 = p0! - 0.15, w1 = p1! + 0.15
    const yB = yGround - 0.6
    const slope = box(FN, w0, w1, G.centreOut, rampFoot, yB, yFloor, KIND.ramp, [0, 0, 0, 0], yGround)
    const landing = box(FN, w0, w1, G.door.at - 0.4, G.centreOut + 0.01, yB, yFloor, KIND.ramp, [0, 0, 0, 0])
    const bw: number = R.balustrade.w, bh: number = R.balustrade.h
    const balL = box(FN, p0! - 0.1 - bw, p0! - 0.1, G.centreOut - 0.2, rampFoot, yB, yFloor + bh + 0.2 * (yFloor - yGround) / R.length, KIND.plaster, plasterFa(-1, yGround), yGround + bh)
    const balR = box(FN, p1! + 0.1, p1! + 0.1 + bw, G.centreOut - 0.2, rampFoot, yB, yFloor + bh + 0.2 * (yFloor - yGround) / R.length, KIND.plaster, plasterFa(-1, yGround), yGround + bh)
    bodies.push({ id: 'esagila-ramp-n', geometry: join([slope, landing, balL, balR]), band: yGround + BAND, letters: ['M', 'G'] })
  }

  /* ── the annex: its outline, its west side reaching into the main building's walls; its court open ── */
  {
    const A: P2[] = annexB.poly.map((p: number[]) => S(p[0]!, p[1]!))
    const into: number = ep.annex.into
    // the first and last corners lie on the main building's east face: move them into its walls
    A[0] = add(A[0]!, mul(FE.n, -into))
    A[A.length - 1] = add(A[A.length - 1]!, mul(FE.n, -into))
    const ac = centroid(A)
    const court = A.map((p) => add(ac, mul(sub(p, ac), Math.sqrt(annexB.court ?? 0.5))))
    const geo = prism(A, [court], yAnnex, annexB.top, KIND.plaster, plasterFa(annexB.top, floor0, ep.annex.pitch))
    bodies.push({ id: 'esagila-annex', geometry: geo, band: floor0 + BAND, letters: ['M', 'G'] })
  }

  /* ── the open ground before the north fronts: a sheet over the map's flat, from under the street to under the casing ── */
  const st = built.street
  const SP = ep.street
  let groundFacts: Record<string, number> = {}
  {
    const GR = ep.ground
    const x0 = GR.from - E0, x1 = GR.to - E0
    const A: P2[] = annexB.poly.map((p: number[]) => S(p[0]!, p[1]!))
    // the fronts' line in scene z at x: the main building's casing face, then the annex's north face; a metre inside
    const frontZ = (x: number): number => {
      const onLine = (p: P2, q: P2): number => p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0])
      const zMain = onLine(C[0]!, C[1]!), zAnnex = onLine(A[0]!, A[1]!)
      const m = x <= C[1]![0] ? zMain : zAnnex
      // a scene z grows southward: a metre inside the face is a metre south
      return m + 1.0
    }
    // the sheet lies flat over the map's flat, a cell's diagonal inside its edge, where every one of the map's ground
    // triangles under it is level: no plane of the sheet can meet the map's ground
    const flat = mapPlan.ground.flats.find((f: J) => f.id === 'esagila-ground')
    const fp: P2[] = flat.poly.map((p: number[]) => S(p[0]!, p[1]!))
    const flatN = (x: number): number => fp[0]![1] + ((fp[1]![1] - fp[0]![1]) * (x - fp[0]![0])) / (fp[1]![0] - fp[0]![0])
    const y = flat.level + GR.lift
    const q = new Soup()
    const cell: number = GR.cell
    const nx = Math.ceil((x1 - x0) / cell)
    const col = (x: number): number[][] => {
      const zN = flatN(x) + GR.inset, zS = frontZ(x)
      const n = Math.max(1, Math.ceil((zS - zN) / cell))
      const out: number[][] = []
      for (let k = 0; k <= n; k++) out.push([x, y, zN + ((zS - zN) * k) / n])
      return out
    }
    for (let i = 0; i < nx; i++) {
      const xa = x0 + ((x1 - x0) * i) / nx, xb = x0 + ((x1 - x0) * (i + 1)) / nx
      const ca = col(xa), cb = col(xb)
      // two columns with their own row counts: walk both down together by their fraction
      const n = Math.max(ca.length, cb.length) - 1
      const at = (c: number[][], u: number): number[] => {
        const f = u * (c.length - 1), k = Math.min(c.length - 2, Math.floor(f)), r = f - k
        const p = c[k]!, s2 = c[k + 1]!
        return [p[0]!, y, p[2]! + (s2[2]! - p[2]!) * r]
      }
      const F0 = [0, 0, 0, 0]
      for (let k = 0; k < n; k++) {
        const a0 = at(ca, k / n), a1 = at(ca, (k + 1) / n), b0 = at(cb, k / n), b1 = at(cb, (k + 1) / n)
        // wound to face up (x east, z south)
        q.quad([a0, a1, b1, b0], KIND.ground, [F0, F0, F0, F0])
      }
    }
    groundFacts = { level: y, north: GR.inset, from: GR.from, to: GR.to }
    bodies.push({ id: 'esagila-ground-n', geometry: q.geometry(), band: 1e6, letters: ['G', 'G'] })
  }

  /* ── the wall before Gate 8: a low plain wall on the sheet's band, its foot at +2.0 ── */
  let wall8: Record<string, number> = {}
  {
    const W8 = ep.wallGate8
    const a = S(W8.line[0][0], W8.line[0][1]), b = S(W8.line[1][0], W8.line[1][1])
    const d = norm(sub(b, a)), nn: P2 = [-d[1] * W8.thick / 2, d[0] * W8.thick / 2]
    // battered: the top narrower than the foot
    const nt: P2 = mul(nn, (W8.thick - 2 * W8.batter) / W8.thick)
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    // one level top: its height over the highest ground along it
    let gMax = -1e9
    for (let k = 0; k <= 20; k++) {
      const p = add(a, mul(d, (len * k) / 20))
      for (const sgn of [1, -1]) gMax = Math.max(gMax, g(p[0] + nn[0] * sgn, p[1] + nn[1] * sgn))
    }
    const yTop = gMax + W8.height
    const P = (p: P2, y: number): number[] => [p[0], y, p[1]]
    const geo = hexa([P(add(a, nn), W8.foot), P(add(b, nn), W8.foot), P(sub(b, nn), W8.foot), P(sub(a, nn), W8.foot), P(add(a, nt), yTop), P(add(b, nt), yTop), P(sub(b, nt), yTop), P(sub(a, nt), yTop)], KIND.mud, [yTop, W8.foot, 0, 0])
    bodies.push({ id: 'esagila-wall-gate8', geometry: geo, band: -1, letters: ['G', 'G'] })
    wall8 = { length: +len.toFixed(1), top: +yTop.toFixed(2) }
  }

  /* ── the street: the map's points from..to, its own triangles over the map's, split where the record's rows meet;
     the first edge as the tower's last (the normal from the point before to the point after), so the two meet ── */
  const streetFacts: Record<string, number> = {}
  {
    const pts = st.slice(SP.from, SP.to + 1)
    const prev = st[SP.from - 1] ?? pts[0]!, next = st[SP.to + 1] ?? pts[pts.length - 1]!
    const edges = pts.map((p, k) => {
      const a = k === 0 ? prev : pts[k - 1]!, b = k === pts.length - 1 ? next : pts[k + 1]!
      const dd = norm([b.x - a.x, b.z - a.z])
      const nn: P2 = [-dd[1] * p.w / 2, dd[0] * p.w / 2]
      return { l: [p.x + nn[0], p.level, p.z + nn[1]], r: [p.x - nn[0], p.level, p.z - nn[1]], w: p.w }
    })
    // the along-distances where the turn ends and the dug run ends, from their eastings
    const sAt = (E: number): number => {
      const x = E - E0
      let acc = 0
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k]!, b = pts[k + 1]!
        const L = Math.hypot(b.x - a.x, b.z - a.z)
        if ((x - a.x) * (x - b.x) <= 0 && Math.abs(b.x - a.x) > 1e-6) return acc + (L * (x - a.x)) / (b.x - a.x)
        acc += L
      }
      return acc
    }
    const sTurn = sAt(SP.turnTo), sDug = sAt(SP.dugTo)
    const soups = { turn: new Soup(), south: new Soup(), west: new Soup() }
    const lerp3 = (a: number[], b: number[], u: number): number[] => a.map((v, c) => v + (b[c]! - v) * u)
    const LIFT: number = SP.lift
    let sAcc = 0
    // cut each leg at the two split points too, so every quad lies in one piece
    for (let k = 0; k + 1 < pts.length; k++) {
      const L = Math.hypot(pts[k + 1]!.x - pts[k]!.x, pts[k + 1]!.z - pts[k]!.z)
      const cuts = [0, 1]
      for (const sc of [sTurn, sDug]) if (sc > sAcc && sc < sAcc + L) cuts.push((sc - sAcc) / L)
      const n = Math.max(1, Math.ceil(L / 6))
      for (let j = 1; j < n; j++) cuts.push(j / n)
      cuts.sort((a, b) => a - b)
      for (let j = 0; j + 1 < cuts.length; j++) {
        const u0 = cuts[j]!, u1 = cuts[j + 1]!
        if (u1 - u0 < 1e-6) continue
        const l0 = lerp3(edges[k]!.l, edges[k + 1]!.l, u0), l1 = lerp3(edges[k]!.l, edges[k + 1]!.l, u1)
        const r0 = lerp3(edges[k]!.r, edges[k + 1]!.r, u0), r1 = lerp3(edges[k]!.r, edges[k + 1]!.r, u1)
        const w0 = edges[k]!.w + (edges[k + 1]!.w - edges[k]!.w) * u0, w1 = edges[k]!.w + (edges[k + 1]!.w - edges[k]!.w) * u1
        const s0 = sAcc + L * u0, s1 = sAcc + L * u1
        const up = (p: number[]): number[] => [p[0]!, p[1]! + LIFT, p[2]!]
        const mid = (s0 + s1) / 2
        const into = mid < sTurn ? soups.turn : mid < sDug ? soups.south : soups.west
        // left is the north edge (t 0), right the south (t w); the top wound to face up, each lip to face away from the middle
        into.quad([up(l0), up(l1), up(r1), up(r0)], KIND.street, [[s0, 0, w0, 0], [s1, 0, w1, 0], [s1, w1, w1, 0], [s0, w0, w0, 0]])
        into.quad([l1, up(l1), up(l0), l0], KIND.street, [[s1, 0, w1, 1], [s1, 0, w1, 1], [s0, 0, w0, 1], [s0, 0, w0, 1]])
        into.quad([r0, up(r0), up(r1), r1], KIND.street, [[s0, w0, w0, 1], [s0, w0, w0, 1], [s1, w1, w1, 1], [s1, w1, w1, 1]])
      }
      sAcc += L
    }
    bodies.push({ id: 'esagila-street-turn', geometry: soups.turn.geometry(), band: 1e6, letters: ['R', 'R'] })
    bodies.push({ id: 'esagila-street-south', geometry: soups.south.geometry(), band: 1e6, letters: ['M', 'M'] })
    bodies.push({ id: 'esagila-street-west', geometry: soups.west.geometry(), band: 1e6, letters: ['G', 'G'] })
    Object.assign(streetFacts, { turnTo: +sTurn.toFixed(1), dugTo: +sDug.toFixed(1), length: +sAcc.toFixed(1) })
  }

  // the winding of the street's and the ground's own quads: every top must face up
  for (const b of bodies.filter((x) => /^esagila-(street|ground)-/.test(x.id))) faceUp(b.geometry)

  const deg = (v: P2): number => ((Math.atan2(v[0], -v[1]) * 180) / Math.PI + 360) % 360
  const facts = {
    sides: { north: +FN.len.toFixed(2), east: +FE.len.toFixed(2), south: +FS.len.toFixed(2), west: +FW.len.toFixed(2) },
    eastBearing: +deg(FE.a).toFixed(2),
    northNormal: +deg(FN.n).toFixed(2),
    wallTop: top,
    floor: yFloor,
    ground: +floor0.toFixed(2),
    casingTop: K.top,
    towers: nTower,
    towerCentres: towerFacts,
    pilasters: (units.length - 1) * U.pilaster.n,
    gate: { centre: +pc.toFixed(2), arch: G.arch, centreTop: G.centreTop },
    ramp: { rise: +(yFloor - yGround).toFixed(2), run: R.length, foot: [+(footAt[0] + E0).toFixed(2), +(N0 - footAt[1]).toFixed(2)] },
    street: streetFacts,
    wall8,
    openGround: groundFacts,
  }
  return {
    north: FN, bodies, facts,
    built: { ...built, prisms: built.prisms.filter((p) => !TAKEN_PRISM(p.id)) },
  }
}

/** turn every triangle of an upward sheet so its normal points up */
function faceUp(g: BufferGeometry): void {
  const p = g.getAttribute('position')
  for (let k = 0; k < p.count; k += 3) {
    const ax = p.getX(k), ay = p.getY(k), az = p.getZ(k)
    const ux = p.getX(k + 1) - ax, uy = p.getY(k + 1) - ay, uz = p.getZ(k + 1) - az
    const vx = p.getX(k + 2) - ax, vy = p.getY(k + 2) - ay, vz = p.getZ(k + 2) - az
    const ny = uz * vx - ux * vz
    const flat = Math.abs(ny) > 0.5 * Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx)
    if (flat && ny < 0) {
      for (let c = 0; c < 3; c++) {
        const t = p.getComponent(k + 1, c)
        p.setComponent(k + 1, c, p.getComponent(k + 2, c))
        p.setComponent(k + 2, c, t)
      }
    }
  }
  p.needsUpdate = true
  g.computeVertexNormals()
}
