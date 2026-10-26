/** THE BRIDGE'S GEOMETRY. A pole is grown from its own numbers (`plan.ts`): a
 * round stem tapering butt to tip with a slight bend of its own, knots
 * swelling its girth and branch stubs cut off short above them, each end
 * cut with an axe in two or three strokes, a peeled pole's bark standing
 * proud where the drawknife stopped; a strut ends in a fork of two tines.
 * A lashing is four square-lashing turns of hemp round a rod and the
 * support it crosses, drawn tight into the crotch between them, then two
 * frapping turns round the turns between the poles. Every vertex carries
 * what the surfaces need: UVs in metres (U along the stem, V round it; a
 * cut face its own cross-section), `aTone` (the piece's tone, peeled wood
 * or bark, end grain, its seed), `aCyl` (the stem's own cylinder
 * coordinates) and `aShade` (how dark it lies where another part bears on
 * it, and the build-clock moment that part arrives).
 */
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'
import {
  BAND_RAG, BANK, BARK, CROSSINGS, J3_LOGS, LASH_TIME, POLES, ROPE_R, SEAT_HALF, SEAT_R, SEAT_XY, SLEEPERS, SLEEPER_HALF, STAKES, TAU, TURNS, bandEdge, bowAt, groundY, hash, inBand, landOf,
  lashStart, radiusAt, stubAxis, supportOf, tineAxis, type Crossing, type Facet, type Pole, type V3,
} from './plan'
import { PLACED, rotate } from './motion'

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2])
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

export class Sheet {
  readonly position: number[] = []
  readonly normal: number[] = []
  readonly uv: number[] = []
  readonly tone: number[] = []
  readonly seed: number[] = []
  readonly cyl: number[] = []
  readonly shade: number[] = []
  readonly index: number[] = []
  extra: Record<string, { size: number; data: number[] }> = {}
  vertex(p: V3, n: V3, u: number, v: number, tone: V3, seed: number, cyl: V3 = [0, 0, 0], shade: [number, number] = [0, 0]): number {
    this.position.push(p[0], p[1], p[2]); this.normal.push(n[0], n[1], n[2]); this.uv.push(u, v)
    this.tone.push(tone[0], tone[1], tone[2]); this.seed.push(seed); this.cyl.push(cyl[0], cyl[1], cyl[2]); this.shade.push(shade[0], shade[1])
    return this.position.length / 3 - 1
  }
  at(i: number): V3 { return [this.position[i * 3]!, this.position[i * 3 + 1]!, this.position[i * 3 + 2]!] }
  /** a triangle wound so its face looks the way its vertices' normals do */
  tri(a: number, b: number, c: number): void {
    const pa = this.at(a), f = cross(sub(this.at(b), pa), sub(this.at(c), pa))
    const n: V3 = [0, 0, 0]
    for (const i of [a, b, c]) { n[0] += this.normal[i * 3]!; n[1] += this.normal[i * 3 + 1]!; n[2] += this.normal[i * 3 + 2]! }
    if (dot(f, n) >= 0) this.index.push(a, b, c); else this.index.push(a, c, b)
  }
  /** `wood`: the tone with the seed in its fourth place, the cylinder and the shade (a skinned pole adds two buffers of its
   * own: eight in all, the most a pipeline takes); `plain`: the ground's and the stream's place alone */
  geometry(kind: 'wood' | 'rope' | 'plain' = 'wood'): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.position, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.normal, 3))
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2))
    if (kind !== 'plain') {
      const tone: number[] = []
      for (let i = 0; i < this.seed.length; i++) tone.push(this.tone[i * 3]!, this.tone[i * 3 + 1]!, this.tone[i * 3 + 2]!, this.seed[i]!)
      g.setAttribute('aTone', new Float32BufferAttribute(tone, 4))
    }
    if (kind === 'wood') {
      g.setAttribute('aCyl', new Float32BufferAttribute(this.cyl, 3))
      g.setAttribute('aShade', new Float32BufferAttribute(this.shade, 2))
    }
    for (const [name, { size, data }] of Object.entries(this.extra)) g.setAttribute(name, new Float32BufferAttribute(data, size))
    g.setIndex(this.index)
    g.computeBoundingBox(); g.computeBoundingSphere()
    return g
  }
}

/** a pole's fineness: the sides round it, the spacing of its rings, the sides round a stub or a tine */
export interface PoleDetail { around: number; row: number; twig: number }
/** the hero tier reads the knots and the axe's facets close; the tiers below draw the same shapes coarser, under their budget */
export const POLE_FINE: PoleDetail = { around: 24, row: 0.065, twig: 10 }
export const POLE_COARSE: PoleDetail = { around: 14, row: 0.12, twig: 6 }

/** the girth's slow wander, a millimetre or two, kept off the bearings */
function wander(seed: number, s: number, a: number): number {
  return 0.0012 * Math.sin(s * 2.3 + seed * 40) + 0.0008 * Math.sin(s * 5.9 + a * 2 + seed * 17) + 0.0006 * Math.sin(a * 3 + s * 1.1 + seed * 9)
}
/** the stem's girth without the bark a drawknife left: the taper, the knots, the wander */
function baseGirth(p: Pole, s: number, a: number): number {
  let r = radiusAt(p, s) + wander(p.seed, s, a) * Math.min(1, ...p.bears.map(b => Math.abs(s - b) / 0.25))
  for (const k of p.knots) {
    const c = Math.cos(a - k.ang)
    if (c > 0) r += k.amp * Math.exp(-(((s - k.s) / k.w) ** 2)) * c * c * c
  }
  return r
}

/** a facet's depth inward from its end at a point of the cross-section */
const facetDepth = (f: Facet, y: number, z: number): number => -f.c + Math.tan(f.tilt) * (y * Math.cos(f.az) + z * Math.sin(f.az))
/** a convex polygon in the cross-section cut by a half-plane g >= 0 */
function clip(poly: [number, number][], g: (y: number, z: number) => number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i]!, B = poly[(i + 1) % poly.length]!, ga = g(A[0], A[1]), gb = g(B[0], B[1])
    if (ga >= 0) out.push(A)
    if ((ga >= 0) !== (gb >= 0)) { const t = ga / (ga - gb); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]) }
  }
  return out
}

export interface Shading { (local: V3): [number, number] }

/** One grown pole in its own frame: along +X, centred; `shading` gives each vertex its contact shade. */
export function growPole(sheet: Sheet, p: Pole, detail: PoleDetail, shading?: Shading): void {
  const L = p.length, x0 = -L / 2, n = detail.around, seed = p.seed, tone = p.tone
  const R0 = p.r
  const shadeOf = (q: V3): [number, number] => (shading ? shading(q) : [0, 0])
  const point = (s: number, a: number, bark: boolean): V3 => {
    const g = baseGirth(p, s, a) + (bark ? BARK : 0)
    return [x0 + s, g * Math.cos(a), g * Math.sin(a) + bowAt(p, s)]
  }
  const normalAt = (s: number, a: number, bark: boolean): V3 => {
    const h = 1e-4
    const ds = sub(point(s + h, a, bark), point(s - h, a, bark)), da = sub(point(s, a + h, bark), point(s, a - h, bark))
    return norm(cross(da, ds))
  }
  const angle = (k: number): number => (k / n) * TAU
  const girthV = TAU * R0
  /** a ring of the side at s(a): its vertices, bark or wood */
  const ring = (sOf: (a: number) => number, bark: (a: number) => boolean, nrm?: V3): number => {
    const start = sheet.position.length / 3
    for (let k = 0; k <= n; k++) {
      const a = angle(k), s = sOf(a), b = bark(a), q = point(s, a, b)
      sheet.vertex(q, nrm ?? normalAt(s, a, b), s, (k / n) * girthV, [tone, p.peeled && !b ? 1 : 0, 0], seed, [s, R0 * Math.cos(a), R0 * Math.sin(a)], shadeOf(q))
    }
    return start
  }
  const strip = (A: number, B: number): void => { for (let k = 0; k < n; k++) { sheet.tri(A + k, B + k, B + k + 1); sheet.tri(A + k, B + k + 1, A + k + 1) } }
  const barkAt = (s: number) => (a: number): boolean => p.peeled ? inBand(p, s, a) : false

  // the end zones: how deep each end's axe facets reach
  const endR = (e: 0 | 1): number => radiusAt(p, e ? L : 0) + (p.peeled && p.bands.some(b => b.end === e) ? BARK : 0)
  const zone = (e: 0 | 1): number => Math.max(0.002, ...p.cuts[e].map(f => endR(e) * Math.tan(f.tilt) - f.c)) + 0.004

  // the rings along the stem: even spacing, closer round each knot, a doubled ring at a band's ragged edge
  const z0 = zone(0), z1 = zone(1)
  const cuts: number[] = []
  for (let s = z0; s < L - z1; s += detail.row) cuts.push(s)
  cuts.push(L - z1)
  for (const k of p.knots) for (const f of [-1, -0.55, -0.24, 0, 0.24, 0.55, 1]) { const s = k.s + f * k.w * 1.1; if (s > z0 + 0.01 && s < L - z1 - 0.01) cuts.push(s) }
  const edges = p.peeled ? p.bands.map(b => {
    const range = [b.reach - BAND_RAG - 0.004, b.reach + BAND_RAG + 0.004]
    return { b, lo: b.end === 0 ? range[0]! : L - range[1]!, hi: b.end === 0 ? range[1]! : L - range[0]! }
  }) : []
  const rows = [...new Set(cuts.map(s => Math.round(s * 2000) / 2000))].sort((a, b) => a - b)
    .filter(s => edges.every(e => s < e.lo - 0.004 || s > e.hi + 0.004))
  // the band edges join the rows in their place
  type Row = { s: number; edge?: (typeof edges)[number] }
  const all: Row[] = [...rows.map(s => ({ s })), ...edges.map(e => ({ s: (e.lo + e.hi) / 2, edge: e }))].sort((a, b) => a.s - b.s)

  let prev = -1, firstRing = -1
  for (const row of all) {
    if (!row.edge) {
      const at = ring(() => row.s, barkAt(row.s))
      if (prev >= 0) strip(prev, at)
      if (firstRing < 0) firstRing = at
      prev = at
      continue
    }
    // the bark's edge: the bark ring, its cut face standing BARK proud, then the wood
    const { b } = row.edge
    const sOf = (a: number): number => (b.end === 0 ? bandEdge(b, a) : L - bandEdge(b, a))
    const face: V3 = [b.end === 0 ? 1 : -1, 0, 0]
    const first = b.end === 0
    const outer = ring(sOf, () => first), top = ring(sOf, () => true, face), bottom = ring(sOf, () => false, face), inner = ring(sOf, () => !first)
    if (prev >= 0) strip(prev, outer)
    // the step's cut face is bark seen edge on: its tone marks it bark
    for (const i of [top, bottom]) for (let k = 0; k <= n; k++) sheet.tone[(i + k) * 3 + 1] = 0
    strip(top, bottom)
    prev = inner
  }
  const lastRing = prev

  // each end: the side drawn to the facets' edge, the facets, the break between them
  for (const e of [0, 1] as const) {
    const R = endR(e), facets = p.cuts[e]
    const depth = (y: number, z: number): number => Math.max(0, ...facets.map(f => facetDepth(f, y, z)))
    const sAt = (sigma: number): number => (e === 0 ? sigma : L - sigma)
    const ngon: [number, number][] = Array.from({ length: n }, (_, k) => [R * Math.cos(angle(k)), R * Math.sin(angle(k))])
    const bark = p.peeled ? p.bands.some(b => b.end === e) : false
    const edgeTone: V3 = [tone, p.peeled && !bark ? 1 : 0, 0]
    const lift = (y: number, z: number, sigma: number): V3 => { const s = sAt(sigma); return [x0 + s, y, z + bowAt(p, s)] }
    // the side's last stretch: from the ring nearest the end out to where each facet cuts the round
    const inner = e === 0 ? firstRing : lastRing
    for (let k = 0; k < n; k++) {
      const A = ngon[k]!, B = ngon[(k + 1) % n]!
      // where along this edge of the round one facet hands over to the next
      const ts = new Set<number>([0, 1])
      const fns = [...facets.map(f => (y: number, z: number) => facetDepth(f, y, z)), () => 0]
      for (let i = 0; i < fns.length; i++) for (let j = i + 1; j < fns.length; j++) {
        const fa = (t: number) => fns[i]!(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t) - fns[j]!(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t)
        const v0 = fa(0), v1 = fa(1)
        if (v0 * v1 < 0) ts.add(v0 / (v0 - v1))
      }
      const edgePts = [...ts].sort((x, y) => x - y).map(t => {
        const y = A[0] + (B[0] - A[0]) * t, z = A[1] + (B[1] - A[1]) * t, a = Math.atan2(z, y)
        const q = lift(y, z, depth(y, z))
        return sheet.vertex(q, norm([0, Math.cos(a), Math.sin(a)]), sAt(depth(y, z)), ((k + t) / n) * girthV, edgeTone, seed, [sAt(depth(y, z)), R0 * Math.cos(a), R0 * Math.sin(a)], shadeOf(q))
      })
      const lo = inner + k, hi = inner + k + 1
      for (let j = 0; j + 1 < edgePts.length; j++) sheet.tri(lo, edgePts[j]!, edgePts[j + 1]!)
      sheet.tri(lo, edgePts[edgePts.length - 1]!, hi)
    }
    // the cut faces: each facet where it is the deepest, the break square across where none reaches
    const regions: { poly: [number, number][]; normal: V3; sigma: (y: number, z: number) => number }[] = []
    const sgn = e === 0 ? -1 : 1
    facets.forEach((f, i) => {
      let poly = ngon
      poly = clip(poly, (y, z) => facetDepth(f, y, z))
      facets.forEach((g, j) => { if (j !== i) poly = clip(poly, (y, z) => facetDepth(f, y, z) - facetDepth(g, y, z)) })
      const t = Math.tan(f.tilt)
      regions.push({ poly, normal: norm([sgn, t * Math.cos(f.az), t * Math.sin(f.az)]), sigma: (y, z) => facetDepth(f, y, z) })
    })
    let breakPoly = ngon
    for (const f of facets) breakPoly = clip(breakPoly, (y, z) => -facetDepth(f, y, z))
    regions.push({ poly: breakPoly, normal: [sgn, 0, 0], sigma: () => 0 })
    const scale = 0.075 / R
    for (const r of regions) {
      if (r.poly.length < 3) continue
      let cy = 0, cz = 0
      for (const [y, z] of r.poly) { cy += y; cz += z }
      cy /= r.poly.length; cz /= r.poly.length
      const vert = (y: number, z: number): number => {
        const sigma = Math.max(0, r.sigma(y, z)), q = lift(y, z, sigma)
        return sheet.vertex(q, r.normal, y * scale, z * scale, [tone, 1, 1], seed, [sAt(sigma), y, z], shadeOf(q))
      }
      const c = vert(cy, cz), rim = r.poly.map(([y, z]) => vert(y, z))
      for (let i = 0; i < rim.length; i++) sheet.tri(c, rim[i]!, rim[(i + 1) % rim.length]!)
    }
  }

  // branch stubs: short stems out of the knots, cut off square
  for (const st of p.stubs) {
    const { from, dir, t0, t1 } = stubAxis(p, st)
    twig(sheet, add([x0, 0, 0], from), dir, t0, t1, st.r, st.r * 0.65, detail.twig, tone * 0.97, seed, shadeOf, 0.55)
  }
  // a strut's tines out of its crotch
  for (const t of p.tines) {
    const { from, dir } = tineAxis(p, t)
    twig(sheet, add([x0, 0, 0], from), dir, -t.back, t.len, t.r, t.r * 0.7, detail.twig + 2, tone, seed, shadeOf, 1)
  }
}
/** a short round stem from `from` along `dir`, between t0 and t1, its far end cut: a stub (an old cut, weathered grey:
 * `fresh` under 1) or a tine */
function twig(sheet: Sheet, from: V3, dir: V3, t0: number, t1: number, r0: number, r1: number, around: number, tone: number, seed: number, shadeOf: (q: V3) => [number, number], fresh: number): void {
  const helper: V3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const e1 = norm(cross(dir, helper)), e2 = cross(dir, e1)
  const rings = 4
  const starts: number[] = []
  for (let j = 0; j <= rings; j++) {
    const f = j / rings, t = t0 + (t1 - t0) * f, r = r0 + (r1 - r0) * f
    starts.push(sheet.position.length / 3)
    for (let k = 0; k <= around; k++) {
      const a = (k / around) * TAU, rad = add(mul(e1, Math.cos(a)), mul(e2, Math.sin(a)))
      const q = add(add(from, mul(dir, t)), mul(rad, r))
      sheet.vertex(q, rad, t, (k / around) * TAU * r0, [tone, 0, 0], seed, [t + seed * 3, r0 * 1.6 * Math.cos(a), r0 * 1.6 * Math.sin(a)], shadeOf(q))
    }
  }
  for (let j = 0; j < rings; j++) for (let k = 0; k < around; k++) {
    const A = starts[j]! + k, B = starts[j + 1]! + k
    sheet.tri(A, B, B + 1); sheet.tri(A, B + 1, A + 1)
  }
  // the cut: the end grain square across
  const tip = add(from, mul(dir, t1)), scale = 0.075 / r1
  const c = sheet.vertex(tip, dir, 0, 0, [tone, 1, fresh], seed, [t1, 0, 0], shadeOf(tip))
  const rim: number[] = []
  for (let k = 0; k < around; k++) {
    const a = (k / around) * TAU, y = r1 * Math.cos(a), z = r1 * Math.sin(a)
    const q = add(tip, add(mul(e1, y), mul(e2, z)))
    rim.push(sheet.vertex(q, dir, y * scale, z * scale, [tone, 1, fresh], seed, [t1, y, z], shadeOf(q)))
  }
  for (let k = 0; k < around; k++) sheet.tri(c, rim[k]!, rim[(k + 1) % around]!)
}

// ---------------------------------------------------------------- contact shade

/** a capsule-like part for the contact shade: its axis and radius */
interface Body { a: V3; b: V3; r: number; born: number }
function toBody(p: Pole): Body { return { a: p.a, b: p.b, r: radiusAt(p, p.length / 2), born: landOf(p.id) } }
function axisGap(q: V3, b: Body): number {
  const d = sub(b.b, b.a), t = Math.min(1, Math.max(0, dot(sub(q, b.a), d) / dot(d, d)))
  return len(sub(q, add(b.a, mul(d, t)))) - b.r
}
const SEAT_BODIES: Body[] = SEAT_XY.map(([x, y]) => ({ a: [x, y, -SEAT_HALF] as V3, b: [x, y, SEAT_HALF] as V3, r: SEAT_R, born: -1 }))
const POLE_BY: Record<string, Pole> = Object.fromEntries(POLES.map(p => [p.id, p]))
const bodyOf = (id: string): Body => (id === 'S0' ? SEAT_BODIES[0]! : id === 'S6' ? SEAT_BODIES[1]! : toBody(POLE_BY[id]!))

/** The shade a placed pole takes where another part bears on it and where its lashings wind round it, and the
 * build-clock moment each arrives; a foot also darkens toward the bank. In the pole's own frame. */
export function poleShading(p: Pole): Shading | undefined {
  if (p.kind === 'strut') return undefined
  const pose = PLACED[p.id]!
  const mine = CROSSINGS.filter(c => c.rod === p.id || c.support === p.id)
  const near = mine.map(c => ({ other: bodyOf(c.rod === p.id ? c.support : c.rod), lash: lashStart(c) + LASH_TIME * 0.5, frame: crossingFrame(c) }))
  const landed = landOf(p.id)
  return local => {
    const w = add(pose.at, rotate(pose.q, local))
    let best = 0, born = 0
    for (const { other, lash, frame } of near) {
      const gap = Math.max(0, axisGap(w, other))
      const touch = 0.55 * Math.exp(-gap / 0.02)
      const tb = Math.max(landed, other.born) + 0.15
      if (touch > best) { best = touch; born = tb }
      // under and beside the turns: the rope's own shadow on the pole
      const rel = sub(w, frame.o), dd = Math.abs(dot(rel, frame.d)), ww = Math.abs(dot(rel, frame.w))
      const outside = Math.max(0, dd - frame.halfD, 0) + Math.max(0, ww - frame.halfW)
      const rope = 0.42 * Math.exp(-outside / 0.018)
      if (rope > best) { best = rope; born = lash }
    }
    const ground = 0.4 * Math.exp(-Math.max(0, w[1] - groundY(w[0], w[2])) / 0.06)
    if (ground > best) { best = ground; born = landed + 0.1 }
    return [best, born]
  }
}
/** the seats' and stakes' shade: where the feet bear, and toward the bank */
function groundworkShading(local: V3): [number, number] {
  let best = 0.45 * Math.exp(-Math.max(0, local[1] - groundY(local[0], local[2])) / 0.05), born = -1
  for (const c of CROSSINGS) {
    if (!c.support.startsWith('S')) continue
    const rod = toBody(POLE_BY[c.rod]!)
    const v = 0.55 * Math.exp(-Math.max(0, axisGap(local, rod)) / 0.02)
    if (v > best) { best = v; born = rod.born + 0.15 }
  }
  return [best, born]
}

/** One pole's geometry in its own frame: along +X, centred. */
export function poleGeometry(p: Pole, detail: PoleDetail = POLE_FINE): BufferGeometry {
  const sheet = new Sheet()
  growPole(sheet, p, detail, poleShading(p))
  return sheet.geometry()
}

/** the seats and stakes, as poles that never move: logs across the feet and the stakes behind them */
export function groundworkPoles(): Pole[] {
  const parts: Pole[] = []
  const base = (id: string, a: V3, b: V3, r: number, taper: number, seed: number, tone: number): Pole => ({
    id, kind: 'joist', frame: null, k: 0, a, b, length: len(sub(b, a)), r, taper, peeled: 0, tone, seed, bears: [], bow: [0, 0], knots: [], stubs: [],
    cuts: [[], []], bands: [], tines: [],
  })
  SEAT_XY.forEach(([x, y], i) => {
    const p = base(`S${i ? 6 : 0}`, [x, y, -SEAT_HALF], [x, y, SEAT_HALF], SEAT_R, 0.012 * (i ? 1 : -1), hash(i, 61), 0.95 + 0.1 * hash(i, 62))
    p.cuts = [0, 1].map(e => [0, 1, 2].map(j => ({ az: TAU * hash(i, e, j, 63) + (j * TAU) / 3, tilt: 0.5 + 0.12 * hash(i, e, j, 64), c: 0.01 + 0.02 * hash(i, e, j, 65) }))) as [Facet[], Facet[]]
    parts.push(p)
  })
  STAKES.forEach(([x, , z], i) => {
    const p = base(`K${i}`, [x, -0.4, z], [x, 0.19 + 0.04 * hash(i, 63), z], 0.042, 0.004, hash(i, 64), 0.9 + 0.15 * hash(i, 65))
    // driven: its head battered flat, a facet or two where the maul glanced
    p.cuts = [[], [{ az: TAU * hash(i, 66), tilt: 0.55, c: 0.012 }]]
    parts.push(p)
  })
  // the yard's sleepers under the rods, and the two logs the crown joist waits on
  const logs: [V3, V3][] = [
    ...SLEEPERS.map(([x, y]): [V3, V3] => [[x, y, -SLEEPER_HALF], [x, y, SLEEPER_HALF]]),
    ...J3_LOGS.map(([x, z, h]): [V3, V3] => [[x - h, SEAT_XY[0][1], z], [x + h, SEAT_XY[0][1], z]]),
  ]
  logs.forEach(([a, b], i) => {
    const p = base(`L${i}`, a, b, SEAT_R, 0.01 * (hash(i, 67) > 0.5 ? 1 : -1), hash(i, 68), 0.92 + 0.12 * hash(i, 69))
    p.cuts = [0, 1].map(e => [0, 1].map(j => ({ az: TAU * hash(i, e, j, 70) + j * Math.PI, tilt: 0.45 + 0.15 * hash(i, e, j, 71), c: 0.01 + 0.02 * hash(i, e, j, 72) }))) as [Facet[], Facet[]]
    parts.push(p)
  })
  return parts
}

/** The seats and the stakes that hold them, in place: one surface, in their bark. */
export function groundworkGeometry(detail: PoleDetail = POLE_FINE): BufferGeometry {
  const sheet = new Sheet()
  for (const part of groundworkPoles()) {
    const from = sheet.position.length / 3
    const dir = norm(sub(part.b, part.a))
    const helper: V3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const zAxis = norm(cross(dir, helper)), yAxis = cross(zAxis, dir)
    const centre = mul(add(part.a, part.b), 0.5)
    const place = (q: V3): V3 => add(centre, add(mul(dir, q[0]), add(mul(yAxis, q[1]), mul(zAxis, q[2]))))
    growPole(sheet, part, { ...detail, around: Math.max(12, detail.around - 4) }, q => groundworkShading(place(q)))
    for (let i = from; i < sheet.position.length / 3; i++) {
      const q = sheet.at(i)
      const nn: V3 = [sheet.normal[i * 3]!, sheet.normal[i * 3 + 1]!, sheet.normal[i * 3 + 2]!]
      const w = place(q), wn = add(mul(dir, nn[0]), add(mul(yAxis, nn[1]), mul(zAxis, nn[2])))
      sheet.position.splice(i * 3, 3, ...w); sheet.normal.splice(i * 3, 3, ...wn)
    }
  }
  return sheet.geometry()
}

// ---------------------------------------------------------------- the lashings

/** A rod's frame at a crossing: the support's axis at the rod's own plane (its bend there), the rod's direction, the
 * support's, the way from the support's axis to the rod's, the radii, and the lashing's footprint */
function crossingFrame(c: Crossing): { o: V3; d: V3; w: V3; m: V3; rr: number; rs: number; halfD: number; halfW: number } {
  const rod = POLE_BY[c.rod]!
  const s = supportOf(c.support)
  const d = norm(sub(rod.b, rod.a))
  const toS = sub([s.xy[0], s.xy[1], rod.a[2]], rod.a), along = dot(toS, d)
  const o: V3 = [s.xy[0], s.xy[1], rod.a[2] + bowAt(rod, along)]
  const w: V3 = [0, 0, 1]
  const foot = add(rod.a, mul(d, along))
  const m = norm(sub([foot[0], foot[1], o[2]], o))
  const rr = radiusAt(rod, along)
  return { o, d, w, m, rr, rs: s.r, halfD: s.r + ROPE_R * 2 * TURNS + 0.004, halfW: rr + ROPE_R * 2 * TURNS + 0.004 }
}

/** the serving runs where the turn bears, its ends whipped short rather than cut */
const served = (t: number): number => Math.min(1, Math.max(0, (Math.sin(t) - 0.25) / 0.2))

/** a lashing's fineness: the samples round each wrap, the corner-cutting passes, the sides round the rope and the steps
 * of each corner's run in to the crotch */
export interface LashDetail { wrap: number; passes: number; around: number; corner: number }
/** the bench draws the rope about five times a frame (measured): fine for the hero tier, coarse below it, each tier under its budget */
export const LASH_FINE: LashDetail = { wrap: 11, passes: 1, around: 7, corner: 2 }
export const LASH_COARSE: LashDetail = { wrap: 6, passes: 1, around: 4, corner: 1 }

type PathPt = { p: V3; serve: number }

/** The closed centreline of one square-lashing turn: over the rod beside the support, down the rod's side into the
 * crotch, across it to the support, round the support beside the rod, and so on round the four corners; each turn a
 * rope's width out from the one before it. */
function turnPath(c: Crossing, i: number, detail: LashDetail): PathPt[] {
  const { o, d, w, m, rr, rs } = crossingFrame(c)
  const gap = 0.0006, rope = ROPE_R
  const a = rs + rope * (1 + 2 * i) + gap, b = rr + rope * (1 + 2 * i) + gap
  const rodRad = rr + rope + gap, supRad = rs + rope + gap
  const hRod = rs + rr
  // how far into the crotch each turn is wound: the first tight in it, each next one a rope further out
  const crotch = 0.45 * Math.min(rodRad, supRad) + rope * 2 * i
  const at = (du: number, dw: number, dm: number): V3 => add(o, add(mul(d, du), add(mul(w, dw), mul(m, dm))))
  const N = detail.wrap
  const phi1 = Math.acos(Math.min(0.99, crotch / rodRad)), psi2 = Math.acos(Math.min(0.99, crotch / supRad))
  const ext = Math.max(2, Math.round((N * phi1) / Math.PI))
  const path: PathPt[] = []
  // over the rod at d = sd*a, from w = -sw0 side to the other; with each end run on down the rod's side
  const overRod = (sd: number, from: number): void => {
    const steps: number[] = []
    for (let j = ext; j >= 1; j--) steps.push(-(phi1 * j) / ext)
    for (let j = 0; j <= N; j++) steps.push((Math.PI * j) / N)
    for (let j = 1; j <= ext; j++) steps.push(Math.PI + (phi1 * j) / ext)
    for (const t of steps) {
      const ang = from > 0 ? Math.PI - t : t
      path.push({ p: at(sd * a, rodRad * Math.cos(ang), hRod + rodRad * Math.sin(ang)), serve: served(Math.min(Math.PI, Math.max(0, t))) })
    }
  }
  // round the support at w = sw*b, from d = +side to the other under it; each end run on up the support's side
  const roundSupport = (sw: number, from: number): void => {
    const steps: number[] = []
    for (let j = ext; j >= 1; j--) steps.push(-(psi2 * j) / ext)
    for (let j = 0; j <= N; j++) steps.push((Math.PI * j) / N)
    for (let j = 1; j <= ext; j++) steps.push(Math.PI + (psi2 * j) / ext)
    for (const t of steps) {
      const ang = from > 0 ? t : Math.PI - t
      path.push({ p: at(supRad * Math.cos(ang), sw * b, -supRad * Math.sin(ang)), serve: served(Math.min(Math.PI, Math.max(0, t))) })
    }
  }
  // at each corner the frapping turns draw the rope in to the crotch: each turn's corner a rope further out than the one
  // inside it, and where it crosses the inner turns on a pole it lies on them
  const { k, h: apexH } = apexOf(c, i)
  const a0 = rs + rope + gap, b0 = rr + rope + gap
  const lift = (p: V3): V3 => {
    const r = sub(p, o)
    let u = dot(r, d), v = dot(r, w), h = dot(r, m)
    if (i > 0 && Math.abs(u) > a0 - rope && Math.abs(u) < a - rope) {
      const y = h - hRod, q = Math.hypot(v, y), need = rodRad + 2 * rope
      if (q < need) { v *= need / q; h = hRod + (y * need) / q }
    }
    if (i > 0 && Math.abs(v) > b0 - rope && Math.abs(v) < b - rope) {
      const q = Math.hypot(u, h), need = supRad + 2 * rope
      if (q < need) { u *= need / q; h *= need / q }
    }
    return at(u, v, h)
  }
  const corner = (su: number, sw: number, from: V3, to: V3): void => {
    const apex = at(su * k, sw * k, apexH), steps = detail.corner
    for (let s = 1; s <= steps; s++) path.push({ p: lift(add(from, mul(sub(apex, from), s / steps))), serve: 0 })
    for (let s = 1; s < steps; s++) path.push({ p: lift(add(apex, mul(sub(to, apex), s / steps))), serve: 0 })
  }
  const sections: PathPt[][] = []
  const take = (wind: () => void): void => { const n = path.length; wind(); sections.push(path.splice(n)) }
  take(() => overRod(1, 1)); take(() => roundSupport(1, 1)); take(() => overRod(-1, -1)); take(() => roundSupport(-1, -1))
  const quads = [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const
  sections.forEach((sec, n) => {
    path.push(...sec)
    corner(quads[n]![0], quads[n]![1], sec[sec.length - 1]!.p, sections[(n + 1) % 4]![0]!.p)
  })
  return chaikin(path, detail.passes)
}

/** Where a turn passes at a corner: how far out from the poles' meeting along each (the first where the gap between the
 * two round poles has room for the rope, each next one a rope further out), and its height, in the plane where the poles
 * meet wherever the gap leaves it room. */
function apexOf(c: Crossing, i: number): { k: number; h: number } {
  const { rr, rs } = crossingFrame(c)
  const gap = 0.0006, rodRad = rr + ROPE_R + gap, supRad = rs + ROPE_R + gap
  const k = Math.sqrt(2 * ROPE_R * Math.max(rr, rs)) * 1.1 + ROPE_R * 2 * i
  const top = rs + rr - Math.sqrt(Math.max(0, rodRad * rodRad - k * k)), low = Math.sqrt(Math.max(0, supRad * supRad - k * k))
  return { k, h: Math.min(Math.max(rs, low), top) }
}

/** A frapping turn: round the lashing between the two poles, under the rod and over the support, tight round the
 * outside of the turns' four corners where they cross from one pole to the other, pulling them in. */
function frapPath(c: Crossing, j: number, detail: LashDetail): PathPt[] {
  const { o, d, w, m, rs } = crossingFrame(c)
  const gap = 0.0006, rope = ROPE_R
  // a rounded square round the outermost turn where it is drawn in at each corner, under the rod beside the support and
  // over the support beside the rod, rising smoothly between; the second frap beside the first, a rope further out, so
  // the two lie as one flat band
  const { k } = apexOf(c, TURNS - 1)
  const out = k + rope * 2 * Math.SQRT1_2 + rope * 2 * j
  const under = rs - rope - gap, over = rs + rope + gap
  const n = 8 * Math.max(2, Math.round(detail.wrap / 3)), SQ = 4
  const pts: PathPt[] = []
  for (let s = 0; s < n; s++) {
    const t = (s / n) * TAU, cu = Math.cos(t), cw = Math.sin(t)
    const r = out / Math.pow(Math.abs(cu) ** SQ + Math.abs(cw) ** SQ, 1 / SQ)
    const h = (under + over) / 2 + ((under - over) / 2) * Math.cos(2 * t)
    pts.push({ p: add(o, add(mul(d, r * cu), add(mul(w, r * cw), mul(m, h)))), serve: 0 })
  }
  return pts
}

/** Corner cutting on a closed path: rounds the turns where one wrap hands over to the next. */
function chaikin(path: PathPt[], passes: number): PathPt[] {
  let cur = path
  for (let k = 0; k < passes; k++) {
    const next: PathPt[] = []
    for (let i = 0; i < cur.length; i++) {
      const A = cur[i]!, B = cur[(i + 1) % cur.length]!
      next.push({ p: add(mul(A.p, 0.75), mul(B.p, 0.25)), serve: A.serve * 0.75 + B.serve * 0.25 }, { p: add(mul(A.p, 0.25), mul(B.p, 0.75)), serve: A.serve * 0.25 + B.serve * 0.75 })
    }
    cur = next
  }
  return cur
}

/** Every lashing as one surface: each vertex knows the centre of the rope where it lies (`aSpine`), and in `aRope` the
 * moment it is wound, whether it is served there and how close it lies on a pole. */
export function lashingGeometry(detail: LashDetail = LASH_FINE): BufferGeometry {
  const sheet = new Sheet()
  const spine: number[] = [], born: number[] = [], serve: number[] = []
  const around = detail.around
  CROSSINGS.forEach((c, ci) => {
    const start = lashStart(c)
    const rod = bodyOf(c.rod), sup = bodyOf(c.support)
    const loops = [...Array.from({ length: TURNS }, (_, i) => turnPath(c, i, detail)), ...[0, 1].map(j => frapPath(c, j, detail))]
    const lengths = loops.map(t => t.reduce((sum, q, j) => sum + len(sub(t[(j + 1) % t.length]!.p, q.p)), 0))
    const total = lengths.reduce((s, l) => s + l, 0)
    let done = 0
    const seed = hash(ci, 41)
    loops.forEach((path, ti) => {
      const n = path.length
      // parallel-transport frames round the closed loop, the twist's mismatch spread along it
      const tangents = path.map((q, j) => norm(sub(path[(j + 1) % n]!.p, path[(j - 1 + n) % n]!.p)))
      const t0 = tangents[0]!
      let normal = norm(cross(t0, Math.abs(t0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
      const normals: V3[] = []
      for (let j = 0; j < n; j++) {
        const t = tangents[j]!
        normal = norm(sub(normal, mul(t, dot(normal, t))))
        normals.push(normal)
      }
      const endN = norm(sub(normals[n - 1]!, mul(t0, dot(normals[n - 1]!, t0))))
      const startB = cross(t0, normals[0]!)
      const twist = Math.atan2(dot(endN, startB), dot(endN, normals[0]!))
      let s = 0
      const ringStart: number[] = []
      for (let j = 0; j <= n; j++) {
        const q = path[j % n]!, t = tangents[j % n]!
        const fix = -twist * (j / n)
        const nn = normals[j % n]!, bb = cross(t, nn)
        const cn = add(mul(nn, Math.cos(fix)), mul(bb, Math.sin(fix))), cb = cross(t, cn)
        if (j > 0) s += len(sub(q.p, path[(j - 1) % n]!.p))
        const bornAt = start + LASH_TIME * (done + s) / total
        ringStart.push(sheet.position.length / 3)
        for (let k = 0; k <= around; k++) {
          const ang = (k / around) * TAU
          const nrm = add(mul(cn, Math.cos(ang)), mul(cb, Math.sin(ang)))
          const pos = add(q.p, mul(nrm, ROPE_R))
          // the rope's side that lies on a pole is in its shade
          const onPole = Math.max(0, Math.min(axisGap(pos, rod), axisGap(pos, sup)))
          sheet.vertex(pos, nrm, (k / around) * TAU * ROPE_R, s, [0.92 + 0.16 * seed, 0, 0], seed, [0, 0, 0], [0.5 * Math.exp(-onPole / 0.006), bornAt])
          spine.push(q.p[0], q.p[1], q.p[2]); born.push(bornAt); serve.push(q.serve)
        }
      }
      for (let j = 0; j < n; j++) {
        const A = ringStart[j]!, B = ringStart[j + 1]!
        for (let k = 0; k < around; k++) sheet.index.push(A + k, B + k + 1, B + k, A + k, A + k + 1, B + k + 1)
      }
      done += lengths[ti]!
    })
  })
  // the moment each piece is wound, whether it is served there, how close it lies on a pole
  const rope: number[] = []
  for (let i = 0; i < born.length; i++) rope.push(born[i]!, serve[i]!, sheet.shade[i * 2]!)
  sheet.extra = { aSpine: { size: 3, data: spine }, aRope: { size: 3, data: rope } }
  return sheet.geometry('rope')
}

// ---------------------------------------------------------------- the bank and the stream

/** The bank, cut square at its edges as a model's ground is: the level banks and the channel on top, the section
 * through the earth on the four sides. UVs in metres. */
export function bankGeometry(): BufferGeometry {
  const sheet = new Sheet()
  const zero: V3 = [0, 0, 0]
  const X = BANK.halfX, Z0 = BANK.zMin, Z1 = BANK.zMax, h = 0.02
  // fine across the channel's sides and round the seats, coarse on the level banks and the bed
  const xs: number[] = []
  for (let x = -X; x < X - 1e-6;) { xs.push(x); const ax = Math.abs(x); x += ax > 4.8 ? 0.3 : ax > 2.0 ? 0.1 : 0.25 }
  xs.push(X)
  const zs: number[] = []
  for (let z = Z0; z < Z1 - 1e-6;) { zs.push(z); z += Math.abs(z) < 2.2 ? 0.15 : 0.25 }
  zs.push(Z1)
  const nx = xs.length - 1, nz = zs.length - 1
  const top = sheet.position.length / 3
  for (const z of zs) for (const x of xs) {
    const y = groundY(x, z)
    const n = norm([groundY(x - h, z) - groundY(x + h, z), 2 * h, groundY(x, z - h) - groundY(x, z + h)])
    sheet.vertex([x, y, z], n, x, z, zero, 0)
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = top + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1
    sheet.index.push(a, c, b, b, c, d)
  }
  const face = (points: V3[], n: V3, u: (p: V3) => number, flip: boolean): void => {
    const start = sheet.position.length / 3
    for (const p of points) {
      sheet.vertex(p, n, u(p), p[1], zero, 0)
      sheet.vertex([p[0], BANK.bottom, p[2]], n, u(p), BANK.bottom, zero, 0)
    }
    for (let i = 0; i + 1 < points.length; i++) {
      const a = start + 2 * i, b = a + 1, c = a + 2, d = a + 3
      if (flip) sheet.index.push(a, c, b, b, c, d); else sheet.index.push(a, b, c, b, d, c)
    }
  }
  face(xs.map(x => [x, groundY(x, Z1), Z1] as V3), [0, 0, 1], p => p[0], false)
  face(xs.map(x => [x, groundY(x, Z0), Z0] as V3), [0, 0, -1], p => p[0], true)
  face(zs.map(z => [X, groundY(X, z), z] as V3), [1, 0, 0], p => p[2], true)
  face(zs.map(z => [-X, groundY(-X, z), z] as V3), [-1, 0, 0], p => p[2], false)
  return sheet.geometry('plain')
}

/** the stream's half width at its level: the level face is a plane of its own, for the mirror; it runs into the bank's
 * slope on both sides */
export const STREAM_HALF = 3.0

/** The stream's two cut faces where the bank is cut. */
export function waterGeometry(): BufferGeometry {
  const sheet = new Sheet()
  const zero: V3 = [0, 0, 0]
  const W = STREAM_HALF
  for (const side of [1, -1]) {
    // 4 mm inside the bank's own cut: where their edges cross, the earth's face stands in front, never in one plane with it
    const n = 120, first = sheet.position.length / 3, Z = side > 0 ? BANK.zMax - 0.004 : BANK.zMin + 0.004
    for (let i = 0; i <= n; i++) {
      const x = -W + (2 * W * i) / n
      const floor = Math.min(BANK.water, groundY(x, Z))
      sheet.vertex([x, BANK.water, Z], [0, 0, side], x, BANK.water, zero, 0)
      sheet.vertex([x, floor, Z], [0, 0, side], x, floor, zero, 0)
    }
    for (let i = 0; i < n; i++) {
      const a = first + 2 * i, b = a + 1, c = a + 2, d = a + 3
      if (side > 0) sheet.index.push(a, b, c, b, d, c); else sheet.index.push(a, c, b, b, c, d)
    }
  }
  return sheet.geometry('plain')
}
