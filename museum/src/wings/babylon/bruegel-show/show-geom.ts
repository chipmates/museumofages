/* BRUEGEL'S TOWER OF BABEL AS A SHOWPIECE (pure geometry, so node builds the same): the tower of the Vienna painting
   (GG 1026, 1563) at its own figure scale, its forms read off the painting by eye and made here, never its pixels.
   Faceted rings of bays, each bay a flat wall between piers with real arched niches cut into it, and in each niche's
   back a door and a two-light window; the terraces wind up as one spiral; the right side unfaced red brick, open in a
   cutaway where the cells step back to the red core; the rock breaking through the front; the builders' timber.
   Scene frame as plan.ts (x east, y up, z south); angles round the axis, 0 toward the stairs, positive to the right
   of one who faces the tower from there. */

import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
type V3 = [number, number, number]
type F1 = (s: number) => number

/** what a face is, for the material */
export const SK = { old: 0, fresh: 1, brick: 2, rock: 3, timber: 4, thatch: 5, tile: 6, dark: 7, cloth: 8, floor: 9, plaster: 10 } as const

export interface ShowBody { id: string; geometry: BufferGeometry }
export interface ShowFrame { x: number; z: number; c: number; s: number; base: number }
export interface Show { bodies: ShowBody[]; frame: ShowFrame; facts: Record<string, unknown> }

const D2R = Math.PI / 180
/** one course of the masonry: broken tops and toothed ends step by whole courses, never by slivers */
const COURSE = 0.6

/** a hash in [0, 1) of a few numbers (pure, so the page and node agree) */
export function hash(...k: number[]): number {
  let h = 0.3183
  for (const v of k) {
    const t = Math.sin(h * 91.3458 + v * 47.853 + 1.618) * 43758.5453
    h = t - Math.floor(t)
  }
  return h
}

/** a smooth value noise in space, -1 to 1 */
export function noise3(x: number, y: number, z: number): number {
  const h = (i: number, j: number, k: number): number => {
    const t = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453
    return (t - Math.floor(t)) * 2 - 1
  }
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z)
  const f = (t: number): number => t * t * (3 - 2 * t)
  const u = f(x - i), v = f(y - j), w = f(z - k)
  const l = (a: number, b: number, t: number): number => a + (b - a) * t
  return l(l(l(h(i, j, k), h(i + 1, j, k), u), l(h(i, j + 1, k), h(i + 1, j + 1, k), u), v),
    l(l(h(i, j, k + 1), h(i + 1, j, k + 1), u), l(h(i, j + 1, k + 1), h(i + 1, j + 1, k + 1), u), v), w)
}

/** a face's look: its kind, a tone seed for its batch, how fresh the work is, how deep it lies in the wall, the
    height over the foot of the ledge above it (streaks run down from there) */
export interface Q { k: number; tone: number; fresh: number; depth: number; ledge: number }
const q = (k: number, tone: number, fresh = 0, depth = 0, ledge = 0): Q => ({ k, tone, fresh, depth, ledge })

/** a soup of triangles, each with its own normal (flat: the painter's planes), and the material's attributes */
export class Soup {
  pos: number[] = []
  nrm: number[] = []
  sk: number[] = []
  sq: number[] = []
  tri(a: V3, b: V3, c: V3, f: Q, depths?: number[]): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz)
    if (l < 1e-9) return
    const p = [a, b, c]
    for (let i = 0; i < 3; i++) {
      const v = p[i]!
      this.pos.push(v[0], v[1], v[2])
      this.nrm.push(nx / l, ny / l, nz / l)
      this.sk.push(f.k)
      this.sq.push(f.tone, f.fresh, depths?.[i] ?? f.depth, f.ledge)
    }
  }
  /** a, b, c, d counter-clockwise seen from the side the face looks to */
  quad(a: V3, b: V3, c: V3, d: V3, f: Q, depths?: number[]): void {
    this.tri(a, b, c, f, depths && [depths[0]!, depths[1]!, depths[2]!])
    this.tri(a, c, d, f, depths && [depths[0]!, depths[2]!, depths[3]!])
  }
  get count(): number { return this.pos.length / 9 }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('sk', new Float32BufferAttribute(this.sk, 1))
    g.setAttribute('sq', new Float32BufferAttribute(this.sq, 4))
    return g
  }
}

/** a vertical plane: o its left foot (at the tower's foot level), s along it to the right seen from outside, n out */
export interface WF { o: V3; s: V3; n: V3 }
export const at = (F: WF, s: number, t: number, d = 0): V3 => [F.o[0] + s * F.s[0] + d * F.n[0], F.o[1] + t, F.o[2] + s * F.s[2] + d * F.n[2]]

/** an arched or square opening in a plane: its outline from s0 to s1 and sill to spring, round or flat headed, cut
    `depth` into the plane, with a back of its own (or open, seen through) that may hold further openings */
export interface Hole {
  s0: number; s1: number; sill: number; spring: number
  head: 'round' | 'flat'
  depth: number
  sub?: Hole[]
  rev: Q
  back: Q
  open?: boolean
  snapped?: boolean
}

/** the grid every opening's jambs and head points lie on, along its wall: no strip of wall between two of them is
    thinner than this (a pixel at the hold), so the wall never breaks into slivers */
const GRID = 0.25
const onGrid = (s: number): number => Math.round(s / GRID) * GRID
function snapHole(h: Hole): void {
  if (h.snapped) return
  const s0 = onGrid(h.s0)
  h.s1 = Math.max(s0 + GRID, onGrid(h.s1))
  h.s0 = s0
  h.snapped = true
}
const headCache = new WeakMap<Hole, Array<[number, number]>>()
function headPts(h: Hole): Array<[number, number]> {
  let p = headCache.get(h)
  if (p) return p
  if (h.head === 'flat') p = [[h.s0, h.spring], [h.s1, h.spring]]
  else {
    // the arc sampled at the grid's points across the opening, so the head's points are the wall's own breaks
    const r = (h.s1 - h.s0) / 2, c = (h.s0 + h.s1) / 2, m = Math.max(1, Math.round((h.s1 - h.s0) / GRID))
    p = []
    for (let i = 0; i <= m; i++) {
      const sx = i === 0 ? h.s0 : i === m ? h.s1 : h.s0 + i * GRID
      p.push([sx, h.spring + Math.sqrt(Math.max(0, r * r - (sx - c) * (sx - c)))])
    }
  }
  headCache.set(h, p)
  return p
}
/** the head's height at s along its polyline (the same segments the reveal draws, so no crack opens between them) */
function headAt(h: Hole, s: number): number {
  const p = headPts(h)
  for (let i = 0; i + 1 < p.length; i++) {
    const [sa, ta] = p[i]!, [sb, tb] = p[i + 1]!
    if (s >= sa - 1e-9 && s <= sb + 1e-9) return sb - sa < 1e-9 ? Math.max(ta, tb) : ta + ((tb - ta) * (s - sa)) / (sb - sa)
  }
  return h.spring
}
/** the outline clockwise seen from outside: up the left jamb, over the head, down the right jamb (closed by the sill) */
function outline(h: Hole): Array<[number, number]> {
  return [[h.s0, h.sill], ...headPts(h), [h.s1, h.sill]]
}

/** a plane between S0 and S1 from foot(s) to top(s), offset d along n, with holes cut through it; extra breaks for
    a stepped top */
export function panel(S: Soup, F: WF, S0: number, S1: number, foot: F1, top: F1, holes: Hole[], d: number, f: Q, breaks: number[] = []): void {
  for (const h of holes) snapHole(h)
  const bp = new Set<number>([S0, S1])
  for (const s of breaks) if (s > S0 && s < S1) bp.add(s)
  for (const h of holes) for (const [s] of outline(h)) if (s > S0 + 1e-6 && s < S1 - 1e-6) bp.add(s)
  const xs = [...bp].sort((a, b) => a - b)
  const depth = -d
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i]!, b = xs[i + 1]!
    if (b - a < 1e-5) continue
    const m = (a + b) / 2
    const cover = holes.filter((h) => h.s0 <= m && m <= h.s1).sort((p, r) => p.sill - r.sill)
    let lo: F1 = foot
    for (const h of cover) {
      span(S, F, a, b, lo, () => h.sill, d, f, depth)
      lo = (s) => headAt(h, s)
    }
    span(S, F, a, b, lo, top, d, f, depth)
  }
  for (const h of holes) cut(S, F, h, d)
}
function span(S: Soup, F: WF, a: number, b: number, lo: F1, hi: F1, d: number, f: Q, depth: number): void {
  // evaluated just inside the interval, so a stepped top takes the step's own height on each side
  const e = Math.min(1e-6, (b - a) / 4)
  const la = lo(a + e), lb = lo(b - e), ha = hi(a + e), hb = hi(b - e)
  if (ha - la < 1e-4 && hb - lb < 1e-4) return
  S.quad(at(F, a, la, d), at(F, b, lb, d), at(F, b, Math.max(hb, lb), d), at(F, a, Math.max(ha, la), d), { ...f, depth })
}
function cut(S: Soup, F: WF, h: Hole, d: number): void {
  const o = outline(h)
  const d0 = -d, d1 = -d + h.depth
  for (let i = 0; i < o.length; i++) {
    const p = o[i]!, r = o[(i + 1) % o.length]!
    if (Math.hypot(r[0] - p[0], r[1] - p[1]) < 1e-6) continue
    S.quad(at(F, p[0], p[1], d), at(F, p[0], p[1], d - h.depth), at(F, r[0], r[1], d - h.depth), at(F, r[0], r[1], d), h.rev, [d0, d1, d1, d0])
  }
  if (h.open) return
  panel(S, F, h.s0, h.s1, () => h.sill, (s) => headAt(h, s), h.sub ?? [], d - h.depth, h.back)
}

/** a box in a plane's frame: s0..s1 along, t0..t1 up (each end its own heights), d0..d1 out; faces listed by name */
export function slab(S: Soup, F: WF, s0: number, s1: number, t0: [number, number], t1: [number, number], d0: number, d1: number, f: Q, faces = 'fbtlrd'): void {
  const P = (s: number, t: number, d: number): V3 => at(F, s, t, d)
  if (faces.includes('f')) S.quad(P(s0, t0[0], d1), P(s1, t0[1], d1), P(s1, t1[1], d1), P(s0, t1[0], d1), f)
  if (faces.includes('b')) S.quad(P(s1, t0[1], d0), P(s0, t0[0], d0), P(s0, t1[0], d0), P(s1, t1[1], d0), f)
  if (faces.includes('t')) S.quad(P(s0, t1[0], d1), P(s1, t1[1], d1), P(s1, t1[1], d0), P(s0, t1[0], d0), f)
  if (faces.includes('d')) S.quad(P(s0, t0[0], d0), P(s1, t0[1], d0), P(s1, t0[1], d1), P(s0, t0[0], d1), f)
  if (faces.includes('l')) S.quad(P(s0, t0[0], d0), P(s0, t0[0], d1), P(s0, t1[0], d1), P(s0, t1[0], d0), f)
  if (faces.includes('r')) S.quad(P(s1, t0[1], d1), P(s1, t0[1], d0), P(s1, t1[1], d0), P(s1, t1[1], d1), f)
}

/** a ledge along a bay of a faceted ring, mitred at both corners on the radial lines (at offset d the bay runs from
    -d tan to W + d tan), so neighbouring bays meet without a gap or an overlap: front, back, top, bottom */
function ledge(S: Soup, F: WF, W: number, tan: number, t0: [number, number], t1: [number, number], d0: number, d1: number, f: Q, faces = 'fbtd'): void {
  const sA = (d: number): number => -d * tan, sB = (d: number): number => W + d * tan
  const P = (s: number, t: number, d: number): V3 => at(F, s, t, d)
  const h = (e: [number, number], s: number): number => e[0] + ((e[1] - e[0]) * s) / W
  const a0 = sA(d0), b0 = sB(d0), a1 = sA(d1), b1 = sB(d1)
  if (faces.includes('f')) S.quad(P(a1, h(t0, a1), d1), P(b1, h(t0, b1), d1), P(b1, h(t1, b1), d1), P(a1, h(t1, a1), d1), f)
  if (faces.includes('b')) S.quad(P(b0, h(t0, b0), d0), P(a0, h(t0, a0), d0), P(a0, h(t1, a0), d0), P(b0, h(t1, b0), d0), f)
  if (faces.includes('t')) S.quad(P(a1, h(t1, a1), d1), P(b1, h(t1, b1), d1), P(b0, h(t1, b0), d0), P(a0, h(t1, a0), d0), f)
  if (faces.includes('d')) S.quad(P(a0, h(t0, a0), d0), P(b0, h(t0, b0), d0), P(b1, h(t0, b1), d1), P(a1, h(t0, a1), d1), f)
}

/** a point round the tower's axis in the scene's plan */
export function sceneAt(f: { x: number; z: number; c: number; s: number }, phiDeg: number, r: number): [number, number] {
  const u = r * Math.cos(phiDeg * D2R), v = -r * Math.sin(phiDeg * D2R)
  return [f.x + u * f.c + v * f.s, f.z - u * f.s + v * f.c]
}
/** an angle wrapped into (-180, 180] */
export const wrap = (a: number): number => a - 360 * Math.ceil((a - 180) / 360)

/** a ring's plane between two angles at radius r: o at the left corner seen from outside, s toward the right one */
function chordFrame(f: ShowFrame, a0: number, a1: number, r: number): { F: WF; W: number; left: number; right: number } {
  const [ax, az] = sceneAt(f, a0, r), [bx, bz] = sceneAt(f, a1, r)
  const mx = (ax + bx) / 2 - f.x, mz = (az + bz) / 2 - f.z
  let sx = bx - ax, sz = bz - az
  const W = Math.hypot(sx, sz)
  sx /= W
  sz /= W
  // out: the chord's normal away from the axis; s = y x n, so s x y = n and a quad listed counter-clockwise from
  // outside looks out (s right seen from out)
  let nx = -sz, nz = sx
  if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz }
  const s2x = nz, s2z = -nx
  const flip = s2x * sx + s2z * sz < 0
  const o: V3 = flip ? [bx, f.base, bz] : [ax, f.base, az]
  return { F: { o, s: [s2x, 0, s2z], n: [nx, 0, nz] }, W, left: flip ? a1 : a0, right: flip ? a0 : a1 }
}
/** a radial frame at an angle: s along the tangent to the right seen from outside, n out, o on the axis's foot */
function radialFrame(f: ShowFrame, phi: number): WF {
  const [ox, oz] = sceneAt(f, phi, 0), [px, pz] = sceneAt(f, phi, 1), [qx, qz] = sceneAt(f, phi + 0.01, 1)
  const nx = px - ox, nz = pz - oz
  let sx = qx - px, sz = qz - pz
  const l = Math.hypot(sx, sz)
  sx /= l
  sz /= l
  // s = y x n keeps the frame right-handed
  const s2x = nz, s2z = -nx
  const sign = s2x * sx + s2z * sz < 0 ? -1 : 1
  return { o: [ox, f.base, oz], s: [s2x * sign, 0, s2z * sign], n: [nx, 0, nz] }
}

/* ── the bays ── */

interface Ring { r: number; bays: number; off: number; foot: (phi: number) => number; top: (phi: number) => number; H: number; n: number }
/** what one bay of a ring holds */
type BayKind = 'white' | 'red' | 'open' | 'rock' | 'overRock'

/** the niche's back: a door below and a two-light window above, or two windows stacked (upper tiers), or blocked */
function nicheBack(nw: number, sill: number, H: number, foot: number, variant: number, stacked: boolean, f: { dark: Q; rev: Q; deep: Q }): Hole[] {
  const c = nw / 2
  const subs: Hole[] = []
  const light = (cx: number, w: number, s0: number, s1: number): Hole => ({ s0: cx - w / 2, s1: cx + w / 2, sill: s0, spring: s1 - w / 2, head: 'round', depth: 0.55, rev: f.rev, back: f.dark })
  const pair = (y0: number, y1: number): void => {
    const lw = Math.min(0.85, nw * 0.2), gap = Math.max(0.3, nw * 0.075)
    subs.push(light(c - gap / 2 - lw / 2, lw, y0, y1), light(c + gap / 2 + lw / 2, lw, y0, y1))
  }
  if (stacked) {
    pair(foot + H * 0.22, foot + H * 0.36)
    pair(foot + H * 0.46, foot + H * 0.6)
    return subs
  }
  // the door: arched, dark and deep; one in six a wide shop opening with a flat lintel; one in eight blocked
  if (variant < 0.125) {
    // blocked: no door, the window only
  } else if (variant < 0.29) {
    const w = nw * 0.62
    subs.push({ s0: c - w / 2, s1: c + w / 2, sill, spring: foot + H * 0.24, head: 'flat', depth: 0.9, rev: f.rev, back: f.deep })
  } else {
    const w = Math.min(1.9, nw * 0.44)
    subs.push({ s0: c - w / 2, s1: c + w / 2, sill, spring: foot + H * 0.27 - w / 2, head: 'round', depth: 0.9, rev: f.rev, back: f.deep })
  }
  if (variant > 0.9) {
    const w = Math.min(0.9, nw * 0.24)
    subs.push(light(c, w, foot + H * 0.45, foot + H * 0.58))
  } else pair(foot + H * 0.44, foot + H * 0.58)
  return subs
}

/** a white bay of tiers 2 to 6: two tall round niches between broad piers, a column with a balcony between them, slit
    windows over them, the corbel frieze under the cornice (in the material), the cornice and the parapet, the
    terrace behind; heights follow the spiral along the bay */
function whiteBay(S: Soup, F: WF, W: number, footL: number, footR: number, topL: number, topR: number, H: number, st: { n: number; stacked: boolean; pw: number; fresh: number; tone: number; v: number; redBack: boolean; last: boolean; tan: number; pierL: boolean; pierR: boolean }): void {
  const foot = (s: number): number => footL + ((footR - footL) * s) / W
  const top = (s: number): number => topL + ((topR - topL) * s) / W
  const f0 = Math.max(footL, footR)
  const ledge0 = (topL + topR) / 2
  const face = q(st.fresh > 0.5 ? SK.fresh : SK.old, st.tone, st.fresh, 0, ledge0)
  const rev = q(face.k, st.tone, st.fresh, 0, ledge0)
  const back = q(st.redBack ? SK.brick : face.k, st.tone, st.redBack ? 1 : st.fresh, 0.8, ledge0)
  const dark = q(SK.dark, st.tone, 0, 1.6, ledge0), deep = q(SK.dark, st.tone, 0, 2, ledge0)
  const pw = st.pw, m = W * 0.095, nw = W * 0.27
  const nsill = f0 + 0.3
  const ncrown = f0 + H * (st.stacked ? 0.7 : 0.69)
  const niche = (s0: number): Hole => ({
    s0, s1: s0 + nw, sill: nsill, spring: ncrown - nw / 2, head: 'round', depth: 0.85, rev, back,
    sub: nicheBack(nw, nsill, H, f0, st.v, st.stacked, { dark, rev: q(face.k, st.tone, st.fresh, 0.9, ledge0), deep }).map((h) => ({ ...h, s0: h.s0 + s0, s1: h.s1 + s0 })),
  })
  const sL = pw / 2 + m, sR = W - pw / 2 - m - nw
  const holes: Hole[] = [niche(sL), niche(sR)]
  // the slit windows in a row over the niches and the column
  for (const sx of [sL + nw / 2, W / 2, sR + nw / 2]) {
    const w = 0.55, t0 = f0 + H * 0.835
    holes.push({ s0: sx - w / 2, s1: sx + w / 2, sill: t0, spring: t0 + Math.min(1.1, H * 0.065), head: 'flat', depth: 0.5, rev, back: dark })
  }
  panel(S, F, st.pierL ? pw / 2 - 0.05 : 0, st.pierR ? W - pw / 2 + 0.05 : W, foot, (s) => top(s) - 0.62, holes, 0, face)
  // the column between the niches, its collar and capital, carrying the balcony
  const cx = W / 2, colTop = f0 + H * 0.74 - 1.0
  column(S, F, cx, foot(cx) - 0.02, colTop, 0.36, face)
  slab(S, F, cx - 0.55, cx + 0.55, [foot(cx) + (colTop - foot(cx)) * 0.48, foot(cx) + (colTop - foot(cx)) * 0.48], [foot(cx) + (colTop - foot(cx)) * 0.48 + 0.42, foot(cx) + (colTop - foot(cx)) * 0.48 + 0.42], -0.05, 0.5, face, 'ftlrd')
  if (st.v < 0.82) balcony(S, F, cx, colTop, 1.15, face, q(SK.dark, st.tone, 0, 0.6, ledge0))
  // the cornice under the terrace's edge and the parapet on it; the top ring keeps its wall's top bare
  ledge(S, F, W, st.tan, [topL - 0.62, topR - 0.62], [topL, topR], -0.6, 0.95, face, 'fd')
  if (!st.last) ledge(S, F, W, st.tan, [topL, topR], [topL + 1.0, topR + 1.0], 0.35, 0.95, q(face.k, st.tone, st.fresh, 0, ledge0 + 1.1), 'ftb')
  else ledge(S, F, W, st.tan, [topL, topR], [topL, topR], -3.0, 0.95, face, 't')
}

/** a half-octagon column standing out of a plane at s, from t0 to t1, radius r */
function column(S: Soup, F: WF, s: number, t0: number, t1: number, r: number, f: Q): void {
  const N = 4
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI * (i / N), a1 = Math.PI * ((i + 1) / N)
    const p0 = [s - r * Math.cos(a0), r * Math.sin(a0) - 0.04] as const, p1 = [s - r * Math.cos(a1), r * Math.sin(a1) - 0.04] as const
    S.quad(at(F, p0[0], t0, p0[1]), at(F, p1[0], t0, p1[1]), at(F, p1[0], t1, p1[1]), at(F, p0[0], t1, p0[1]), f)
  }
}

/** a corbelled balcony: a half cup on a pointed corbel, its parapet's rim, the dark floor inside */
function balcony(S: Soup, F: WF, s: number, t: number, r: number, f: Q, inside: Q): void {
  const N = 6, h = 1.05, rim = 0.28, cone = 1.1
  const P = (a: number, rr: number, tt: number): V3 => at(F, s - rr * Math.cos(a), tt, rr * Math.sin(a) - 0.05)
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI * (i / N), a1 = Math.PI * ((i + 1) / N)
    S.quad(P(a0, r, t), P(a1, r, t), P(a1, r, t + h), P(a0, r, t + h), f)
    S.quad(P(a0, r, t + h), P(a1, r, t + h), P(a1, r - rim, t + h), P(a0, r - rim, t + h), f)
    S.quad(P(a1, r - rim, t + h), P(a1, r - rim, t + 0.25), P(a0, r - rim, t + 0.25), P(a0, r - rim, t + h), inside)
    S.tri(P(a0, r - rim, t + 0.25), P(a1, r - rim, t + 0.25), at(F, s, t + 0.25, -0.05), inside)
    // the corbel: a half cone to a point under the cup
    S.tri(P(a1, r, t), P(a0, r, t), at(F, s, t - cone, 0.08), f)
  }
}

/** a red bay: the unfaced brick shell, two tall arched cells in it, plain brick piers, its top broken in steps of courses */
function redBay(S: Soup, F: WF, W: number, footL: number, footR: number, topL: number, topR: number, H: number, st: { tone: number; seed: number; broken: number; thick: number; drop?: (s: number) => number }): void {
  const foot = (s: number): number => footL + ((footR - footL) * s) / W
  const f0 = Math.max(footL, footR)
  const ledge0 = (topL + topR) / 2
  const brick = q(SK.brick, st.tone, 1, 0, ledge0)
  const dark = q(SK.dark, st.tone, 0, 2.4, ledge0)
  // three steps along the top, each down by whole courses
  const steps = [0, onGrid(W / 3), onGrid((2 * W) / 3), W]
  const drop = [0, 1, 2].map((i) => (st.drop ? Math.round(st.drop(((i + 0.5) * W) / 3) / COURSE) * COURSE : Math.round((st.broken * H * (0.15 + 0.85 * hash(st.seed, i, 3.3))) / COURSE) * COURSE))
  const stepTop = (s: number): number => {
    const i = s < steps[1]! ? 0 : s < steps[2]! ? 1 : 2
    const t = topL + ((topR - topL) * s) / W
    return Math.max(f0 + H * 0.3, t - drop[i]!)
  }
  const cw = W * 0.3, cs = W * 0.12
  const holes: Hole[] = []
  for (const s0 of [cs, W - cs - cw]) {
    const crown = Math.min(f0 + H * 0.78, Math.min(stepTop(s0 + 0.01), stepTop(s0 + cw - 0.01)) - 1.0)
    if (crown - cw / 2 < f0 + 1.5) continue
    holes.push({ s0, s1: s0 + cw, sill: f0 + 0.2, spring: crown - cw / 2, head: 'round', depth: 2.4, rev: brick, back: dark })
  }
  panel(S, F, -0.04, W + 0.04, foot, stepTop, holes, 0, brick, steps.slice(1, 3))
  // the shell's top and inner face, step by step, and the risers between steps
  for (let i = 0; i < 3; i++) {
    const a = steps[i]!, b = steps[i + 1]!
    const ta = stepTop(a + 1e-3), tb = stepTop(b - 1e-3)
    slab(S, F, a, b, [foot(a), foot(b)], [ta, tb], -st.thick, 0, brick, 'tb')
    if (i < 2) {
      const tn = stepTop(b + 1e-3)
      if (Math.abs(tn - tb) > 1e-3) {
        const lo = Math.min(tb, tn), hi = Math.max(tb, tn)
        // the riser faces the lower step
        if (tn < tb) S.quad(at(F, b, lo, 0), at(F, b, lo, -st.thick), at(F, b, hi, -st.thick), at(F, b, hi, 0), brick)
        else S.quad(at(F, b, lo, -st.thick), at(F, b, lo, 0), at(F, b, hi, 0), at(F, b, hi, -st.thick), brick)
      }
    }
  }
}

/** the base storey's bay: two great arches at the ground, twin tall windows over them with their timber, a balcony,
    slit windows, the cornice and parapet; its spurs stand at the corners */
function baseBay(S: Soup, F: WF, W: number, foot0: number, topL: number, topR: number, H: number, st: { tone: number; v: number; fresh: number; red: boolean; pw: number; tan: number }): void {
  const top = (s: number): number => topL + ((topR - topL) * s) / W
  const ledge0 = (topL + topR) / 2
  const face = q(st.fresh > 0.5 ? SK.fresh : SK.old, st.tone, st.fresh, 0, ledge0)
  const red = q(SK.brick, st.tone, 1, 0.4, ledge0)
  const dark = q(SK.dark, st.tone, 0, 3.5, ledge0)
  const pw = st.pw
  const inner = W - pw
  const gw = inner * 0.31, gm = inner * 0.12
  const holes: Hole[] = []
  const gs = [pw / 2 + gm, W - pw / 2 - gm - gw]
  for (const s0 of gs) {
    holes.push({ s0, s1: s0 + gw, sill: 0.75, spring: H * 0.36 - gw / 2, head: 'round', depth: 3.6, rev: st.red ? red : face, back: st.red ? q(SK.brick, st.tone, 1, 3.6, ledge0) : dark,
      // a bay rebuilt in new red brick: a lower arched door in the brick infill
      sub: st.red ? [{ s0: s0 + gw * 0.3, s1: s0 + gw * 0.7, sill: 0.75, spring: H * 0.2, head: 'round', depth: 1.2, rev: red, back: dark }] : undefined })
  }
  const tw = inner * 0.17
  for (const s0 of [gs[0]! + (gw - tw) / 2, gs[1]! + (gw - tw) / 2]) {
    holes.push({ s0, s1: s0 + tw, sill: H * 0.46, spring: H * 0.79 - tw / 2, head: 'round', depth: 1.3, rev: face, back: st.v < 0.5 ? dark : q(SK.dark, st.tone, 0, 2.2, ledge0) })
  }
  for (const sx of [W * 0.3, W / 2, W * 0.7]) {
    const t0 = H * 0.86
    holes.push({ s0: sx - 0.32, s1: sx + 0.32, sill: t0, spring: t0 + 1.2, head: 'flat', depth: 0.6, rev: face, back: dark })
  }
  panel(S, F, pw / 2 - 0.05, W - pw / 2 + 0.05, () => foot0, (s) => top(s) - 0.7, holes, 0, face)
  balcony(S, F, W / 2, H * 0.79, 1.35, face, q(SK.dark, st.tone, 0, 0.6, ledge0))
  ledge(S, F, W, st.tan, [topL - 0.7, topR - 0.7], [topL, topR], -0.6, 1.1, face, 'fd')
  ledge(S, F, W, st.tan, [topL, topR], [topL + 1.1, topR + 1.1], 0.5, 1.1, q(face.k, st.tone, st.fresh, 0, ledge0 + 1.2), 'ftb')
}

/** a pier at a corner: a box standing out radially, from foot to top */
function pier(S: Soup, f: ShowFrame, phi: number, r: number, w: number, out: number, foot: number, top: number, fc: Q): void {
  const F = radialFrame(f, phi)
  slab(S, F, -w / 2, w / 2, [foot, foot], [top, top], r - 0.6, r + out, fc, 'flr')
}

/** a spur at a corner of the base storey: battered from `out0` at the foot to `out1` at `rise` of its height, then
    upright; its sloping face and its sides */
function spur(S: Soup, f: ShowFrame, phi: number, r: number, w: number, out0: number, out1: number, rise: number, foot: number, top: number, fc: Q): void {
  const F = radialFrame(f, phi)
  const tk = foot + (top - foot) * rise
  const d0 = r - 0.8
  const P = (s: number, t: number, d: number): V3 => at(F, s, t, d)
  const a = -w / 2, b = w / 2
  // the battered face, the upright face
  S.quad(P(a, foot, r + out0), P(b, foot, r + out0), P(b, tk, r + out1), P(a, tk, r + out1), fc)
  S.quad(P(a, tk, r + out1), P(b, tk, r + out1), P(b, top, r + out1), P(a, top, r + out1), fc)
  // its sides
  for (const [s, sgn] of [[a, -1], [b, 1]] as Array<[number, number]>) {
    const pts: V3[] = [P(s, foot, d0), P(s, foot, r + out0), P(s, tk, r + out1), P(s, top, r + out1), P(s, top, d0)]
    if (sgn > 0) { S.quad(pts[1]!, pts[0]!, pts[4]!, pts[2]!, fc); S.tri(pts[3]!, pts[2]!, pts[4]!, fc) }
    else { S.quad(pts[0]!, pts[1]!, pts[2]!, pts[4]!, fc); S.tri(pts[2]!, pts[3]!, pts[4]!, fc) }
  }
}

/** a toothed end of a facing: every other course left standing out, to bond the work to come */
function toothed(S: Soup, F: WF, s: number, dir: 1 | -1, foot: number, top: number, thick: number, fc: Q): void {
  for (let t = foot, i = 0; t + COURSE <= top + 1e-6; t += COURSE, i++) {
    if (i % 2) continue
    const s1 = s + dir * 0.75
    if (dir > 0) slab(S, F, s, s1, [t, t], [t + COURSE, t + COURSE], -thick, 0.4, fc, 'ftrdb')
    else slab(S, F, s1, s, [t, t], [t + COURSE, t + COURSE], -thick, 0.4, fc, 'ftldb')
  }
}

/** a ring's terrace between an inner radius and the parapet, bay by bay along the spiral */
function terrace(S: Soup, f: ShowFrame, a0: number, a1: number, rIn: number, rOut: number, h0: number, h1: number, fl: Q): void {
  const n = Math.max(1, Math.ceil((a1 - a0) / 3))
  for (let i = 0; i < n; i++) {
    const p = a0 + ((a1 - a0) * i) / n, r = a0 + ((a1 - a0) * (i + 1)) / n
    const hp = h0 + ((h1 - h0) * i) / n, hr = h0 + ((h1 - h0) * (i + 1)) / n
    const [ax, az] = sceneAt(f, p, rIn), [bx, bz] = sceneAt(f, r, rIn), [cx, cz] = sceneAt(f, r, rOut), [dx, dz] = sceneAt(f, p, rOut)
    const A: V3 = [ax, f.base + hp, az], B: V3 = [bx, f.base + hr, bz], C: V3 = [cx, f.base + hr, cz], D: V3 = [dx, f.base + hp, dz]
    // seen from above, growing angles turn clockwise (to the right of one facing in): the up face winds A, D, C, B
    upQuad(S, A, B, C, D, fl)
  }
}
/** a quad whose face must look away from the point c, whichever way its corners were listed */
function awayQuad(S: Soup, a: V3, b: V3, c3: V3, d: V3, c: V3, f: Q): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c3[0] - a[0], vy = c3[1] - a[1], vz = c3[2] - a[2]
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const mx = (a[0] + b[0] + c3[0] + d[0]) / 4 - c[0], my = (a[1] + b[1] + c3[1] + d[1]) / 4 - c[1], mz = (a[2] + b[2] + c3[2] + d[2]) / 4 - c[2]
  if (nx * mx + ny * my + nz * mz >= 0) S.quad(a, b, c3, d, f)
  else S.quad(a, d, c3, b, f)
}
/** a quad whose face must look up, whichever way its corners were listed */
function upQuad(S: Soup, a: V3, b: V3, c: V3, d: V3, f: Q): void {
  const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
  if (ny > 0) S.quad(a, b, c, d, f)
  else S.quad(a, d, c, b, f)
}

/* ── the tower ── */

/** a ring's bays from its offset; the bay across the seam at the back is split there, each half plain */
function ringBays(n: number, off: number): Array<{ i: number; a0: number; a1: number; plain: boolean }> {
  const out: Array<{ i: number; a0: number; a1: number; plain: boolean }> = []
  for (let i = 0; i < n; i++) {
    const a0 = -180 + off + (360 * i) / n, a1 = a0 + 360 / n
    if (a0 < -180 - 1e-9) out.push({ i, a0: -180, a1, plain: true }, { i, a0: a0 + 360, a1: 180, plain: true })
    else if (a1 > 180 + 1e-9) out.push({ i, a0, a1: 180, plain: true }, { i, a0: -180, a1: a1 - 360, plain: true })
    else out.push({ i, a0, a1, plain: false })
  }
  return out
}

/** a weathered mass of rock: an irregular section whose corners each keep their own offset all the way up, so its
    faces run upright in broad planes split by clefts; strata where it steps in; its top broken off in a tilted plane */
function mass(S: Soup, f: ShowFrame, phi: number, r: number, w: number, dep: number, h0: number, h1: number, seed: number, tone: number, clefts = 2): void {
  const F = radialFrame(f, phi)
  const N = 11, M = Math.max(3, Math.round((h1 - h0) / 5))
  const cl = Array.from({ length: clefts }, (_, i) => Math.floor(hash(seed, i, 21) * N))
  const rock = q(SK.rock, tone, 0, 0, h1)
  const corner = Array.from({ length: N }, (_, i) => (0.72 + 0.48 * hash(seed, i, 23)) * (cl.includes(i) ? 0.62 : 1))
  const strata = [0.3 + 0.2 * hash(seed, 24), 0.62 + 0.2 * hash(seed, 25)]
  const tilt = [(hash(seed, 26) - 0.5) * 1.1, (hash(seed, 27) - 0.5) * 0.7]
  const ring = (j: number): V3[] => {
    const u = j / M
    const t = h0 + (h1 - h0) * u
    const step = strata.reduce((k, z) => (u > z ? k * 0.86 : k), 1)
    const batter = (1 - 0.16 * u) * step
    return Array.from({ length: N }, (_, i) => {
      const a = (2 * Math.PI * (i + 0.3 * (hash(seed, i, 28) - 0.5))) / N
      const k = corner[i]! * (1 + 0.07 * noise3(i * 0.9, seed, u * 3.0)) * batter
      const sx = Math.cos(a) * (w / 2) * k, dz = Math.sin(a) * (dep / 2) * k
      const tt = j === M ? t - 0.12 * (h1 - h0) * (0.5 + tilt[0]! * sx / (w / 2) + tilt[1]! * dz / (dep / 2)) - 0.6 * hash(seed, i, 29) : t
      return at(F, sx, tt, r + dz)
    })
  }
  let below = ring(0)
  for (let j = 1; j <= M; j++) {
    const above = ring(j)
    const [cx, cz] = sceneAt(f, phi, r)
    const c: V3 = [cx, f.base + h0 + ((h1 - h0) * (j - 0.5)) / M, cz]
    for (let i = 0; i < N; i++) {
      const k = (i + 1) % N
      awayQuad(S, below[i]!, below[k]!, above[k]!, above[i]!, c, rock)
    }
    below = above
  }
  let mx = 0, my = 0, mz = 0
  for (const p of below) { mx += p[0] / N; my += p[1] / N; mz += p[2] / N }
  const C: V3 = [mx, my + 0.3, mz]
  for (let i = 0; i < N; i++) {
    const A = below[i]!, B = below[(i + 1) % N]!
    const ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2])
    if (ny > 0) S.tri(A, B, C, rock)
    else S.tri(A, C, B, rock)
  }
}

/** the quarried slope between the masses: steps cut from the ground up to the base storey's terrace, ochre rubble on
    the treads, and the platform at its head that carries the arches above */
function quarry(S: Soup, f: ShowFrame, a0: number, a1: number, rFoot: number, rTop: number, rHead: number, hTop: number, steps: number, seed: number): void {
  const n = 4
  const P = (phi: number, r: number, t: number): V3 => { const [x, z] = sceneAt(f, phi, r); return [x, f.base + t, z] }
  // each step one depth across, each piece of it a little off the step's height, as the stone was broken out
  const tAt = (k: number, i: number): number => (k < 0 ? -0.4 : k + 1 === steps ? hTop : hTop * ((k + 1) / steps) + (hash(seed, k, i, 1) - 0.5) * 0.5)
  const rAt = (k: number, _i: number): number => (k < 0 ? rFoot : k + 1 === steps ? rHead : rFoot + ((rTop - rFoot) * (k + 1)) / steps)
  for (let k = 0; k < steps; k++) {
    const u0 = k / steps
    const w0 = a0 + (a1 - a0) * 0.06 * u0, w1 = a1 - (a1 - a0) * 0.06 * u0
    for (let i = 0; i < n; i++) {
      const p0 = w0 + ((w1 - w0) * i) / n, p1 = w0 + ((w1 - w0) * (i + 1)) / n
      const t = tAt(k, i), tb = tAt(k - 1, i)
      const r0 = k ? rAt(k - 1, i) : rFoot, r1 = rAt(k, i)
      const tread = q(SK.floor, hash(seed, k, i, 3), 0, 0, t)
      upQuad(S, P(p0, r0, t), P(p1, r0, t), P(p1, r1, t), P(p0, r1, t), tread)
      const [ox, oz] = sceneAt(f, (p0 + p1) / 2, r0 - 3)
      awayQuad(S, P(p0, r0, Math.min(tb, t) - 0.05), P(p1, r0, Math.min(tb, t) - 0.05), P(p1, r0, t), P(p0, r0, t), [ox, f.base + (t + tb) / 2, oz], q(SK.rock, hash(seed, k, i, 4), 0, 0, t))
      // where a neighbouring piece stands higher, the step's side shows
      if (i + 1 < n) {
        const tn = tAt(k, i + 1)
        if (Math.abs(tn - t) > 0.05) {
          const lo = Math.min(t, tn), hi = Math.max(t, tn), r1n = Math.min(r1, rAt(k, i + 1))
          const [sx, sz] = sceneAt(f, tn > t ? p1 - 1 : p1 + 1, (r0 + r1) / 2)
          awayQuad(S, P(p1, r0, lo), P(p1, r1n, lo), P(p1, r1n, hi), P(p1, r0, hi), [sx, f.base + hi + 3, sz], q(SK.rock, hash(seed, k, i, 5), 0, 0, hi))
        }
      }
    }
  }
}

/* ── the builders' works: timber, huts and the rising ramp wall ── */

/** a square timber from a to b, w thick, every face looking away from its middle */
function beam(S: Soup, a: V3, b: V3, w: number, f: Q): void {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const L = Math.hypot(d[0]!, d[1]!, d[2]!)
  if (L < 1e-4) return
  const u = d.map((x) => x / L)
  const up = Math.abs(u[1]!) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  let e1 = [u[1]! * up[2]! - u[2]! * up[1]!, u[2]! * up[0]! - u[0]! * up[2]!, u[0]! * up[1]! - u[1]! * up[0]!]
  const l1 = Math.hypot(e1[0]!, e1[1]!, e1[2]!)
  e1 = e1.map((x) => x / l1)
  const e2 = [u[1]! * e1[2]! - u[2]! * e1[1]!, u[2]! * e1[0]! - u[0]! * e1[2]!, u[0]! * e1[1]! - u[1]! * e1[0]!]
  const h = w / 2
  const off = (p: V3, i: number, j: number): V3 => [p[0] + h * (i * e1[0]! + j * e2[0]!), p[1] + h * (i * e1[1]! + j * e2[1]!), p[2] + h * (i * e1[2]! + j * e2[2]!)]
  const ring: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  const c: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  for (let k = 0; k < 4; k++) {
    const [i0, j0] = ring[k]!, [i1, j1] = ring[(k + 1) % 4]!
    awayQuad(S, off(a, i0, j0), off(a, i1, j1), off(b, i1, j1), off(b, i0, j0), c, f)
  }
  awayQuad(S, off(a, -1, -1), off(a, 1, -1), off(a, 1, 1), off(a, -1, 1), c, f)
  awayQuad(S, off(b, -1, -1), off(b, 1, -1), off(b, 1, 1), off(b, -1, 1), c, f)
}

/** a scaffold along an arc at radius r before a wall at rWall: standards on the foot, ledgers every lift, putlogs into
    the wall from every other standard */
function scaffold(S: Soup, f: ShowFrame, a0: number, a1: number, r: number, rWall: number, foot: (phi: number) => number, top: (phi: number) => number, tm: Q, lift = 2.0, keep = 1, w = 0.3): void {
  const n = Math.max(1, Math.round(((a1 - a0) * D2R * r) / 2.4))
  const P = (phi: number, rr: number, t: number): V3 => { const [x, z] = sceneAt(f, phi, rr); return [x, f.base + t, z] }
  const phis = Array.from({ length: n + 1 }, (_, i) => a0 + ((a1 - a0) * i) / n)
  // a scaffold half struck: some standards gone, each left at its own height, ledgers only between two left standing
  const kept = phis.map((phi, i) => i === 0 || i === n || hash(phi, 7.7) < keep)
  const tops = phis.map((phi) => top(phi) + 0.6 + 2.2 * hash(phi, 3.1) * (keep < 1 ? 1 : 0.4))
  phis.forEach((phi, i) => {
    if (!kept[i]) return
    const t1 = tops[i]!
    beam(S, P(phi, r, foot(phi) - 0.15), P(phi, r, t1), w, tm)
    for (let t = 2.0, j = 0; foot(phi) + t < t1 - 0.4; t += lift, j++) {
      if (i < n && kept[i + 1] && foot(phis[i + 1]!) + t < tops[i + 1]! - 0.4) beam(S, P(phi, r, foot(phi) + t), P(phis[i + 1]!, r, foot(phis[i + 1]!) + t), w * 0.87, tm)
      if ((i + j) % 2 === 0) beam(S, P(phi, r + 0.25, foot(phi) + t - 0.2), P(phi, rWall - 0.4, foot(phi) + t - 0.2), w * 0.8, tm)
    }
  })
}

/** a treadwheel crane on a terrace: the wheel upright across the terrace, its frame, the jib leaning out */
function treadwheel(S: Soup, f: ShowFrame, phi: number, r: number, t: number, tm: Q): void {
  const F = radialFrame(f, phi)
  const R = 2.5, hc = t + R + 0.5
  const P = (s: number, tt: number, d: number): V3 => at(F, s, tt, d)
  const N = 16
  for (const d of [r - 0.55, r + 0.55]) {
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N, b = (2 * Math.PI * (i + 1)) / N
      beam(S, P(R * Math.cos(a), hc + R * Math.sin(a), d), P(R * Math.cos(b), hc + R * Math.sin(b), d), 0.3, tm)
      if (i % 2 === 0) beam(S, P(0, hc, d), P(R * Math.cos(a), hc + R * Math.sin(a), d), 0.24, tm)
    }
  }
  for (let i = 0; i < N; i += 2) {
    const a = (2 * Math.PI * i) / N
    beam(S, P(R * Math.cos(a), hc + R * Math.sin(a), r - 0.7), P(R * Math.cos(a), hc + R * Math.sin(a), r + 0.7), 0.26, tm)
  }
  beam(S, P(0, hc, r - 1.3), P(0, hc, r + 1.3), 0.34, tm)
  for (const d of [r - 1.2, r + 1.2]) {
    beam(S, P(-2.0, t - 0.1, d), P(0, hc, d), 0.3, tm)
    beam(S, P(2.0, t - 0.1, d), P(0, hc, d), 0.3, tm)
  }
  // the jib, pointed, leaning out over the parapet, and its stay
  const tip = P(0.6, t + 15.5, r + 8.5)
  beam(S, P(2.4, t - 0.1, r - 0.4), tip, 0.42, tm)
  beam(S, P(2.4, t - 0.1, r - 1.6), P(2.4, t + 7.0, r + 2.2), 0.3, tm)
  beam(S, tip, P(0.6, t + 6.0, r + 8.5), 0.2, tm)
}

/** shear legs: two legs spread along the terrace and a back leg, meeting over the edge, a fall hanging from the head */
function shearLegs(S: Soup, f: ShowFrame, phi: number, r: number, t: number, h: number, tm: Q): void {
  const F = radialFrame(f, phi)
  const head = at(F, 0, t + h, r + 2.6)
  beam(S, at(F, -1.8, t - 0.1, r - 0.6), head, 0.32, tm)
  beam(S, at(F, 1.8, t - 0.1, r - 0.6), head, 0.32, tm)
  beam(S, at(F, 0, t - 0.1, r - 2.2), head, 0.3, tm)
  beam(S, head, at(F, 0, t + h - 7.0, r + 2.6), 0.2, tm)
}

/** an arch's centring: the timber arc under its head, the tie at the springing, struts and the posts that hold it */
function centring(S: Soup, F: WF, s0: number, s1: number, sill: number, spring: number, d: number, tm: Q): void {
  const r = (s1 - s0) / 2 - 0.3, c = (s0 + s1) / 2
  const N = 8
  const pt = (i: number): V3 => at(F, c - r * Math.cos((Math.PI * i) / N), spring + r * Math.sin((Math.PI * i) / N), d)
  for (let i = 0; i < N; i++) beam(S, pt(i), pt(i + 1), 0.32, tm)
  beam(S, at(F, c - r, spring, d), at(F, c + r, spring, d), 0.3, tm)
  for (const i of [2, 4, 6]) beam(S, at(F, c, spring, d), pt(i), 0.26, tm)
  for (const s of [c - r + 0.2, c + r - 0.2]) beam(S, at(F, s, sill, d), at(F, s, spring, d), 0.3, tm)
}

/** a hut against a wall on a terrace: its walls, a lean-to roof over them, a dark door */
function hut(S: Soup, f: ShowFrame, phi: number, rIn: number, depth: number, w: number, t: number, h: number, wallQ: Q, roofQ: Q, doorQ: Q): void {
  const F = radialFrame(f, phi)
  const P = (s: number, tt: number, d: number): V3 => at(F, s, tt, d)
  const t0 = t - 0.12, hi = t + h + 0.9, lo = t + h, a = -w / 2, b = w / 2, d0 = rIn, d1 = rIn + depth
  const c = P(0, t + h / 2, d0 + depth / 2)
  awayQuad(S, P(a, t0, d1), P(b, t0, d1), P(b, lo, d1), P(a, lo, d1), c, wallQ)
  for (const sx of [a, b]) {
    awayQuad(S, P(sx, t0, d0), P(sx, t0, d1), P(sx, lo, d1), P(sx, hi, d0), c, wallQ)
  }
  // the roof: a slab over the walls, sloping off the wall, a hand's breadth thick
  const o = 0.35, th = 0.32
  const A = P(a - o, hi + 0.05, d0), B = P(b + o, hi + 0.05, d0), C = P(b + o, lo - 0.18, d1 + 0.5), D = P(a - o, lo - 0.18, d1 + 0.5)
  const dn = (p: V3): V3 => [p[0], p[1] - th, p[2]]
  upQuad(S, A, B, C, D, roofQ)
  const rc = P(0, (hi + lo) / 2 - th / 2, d0 + depth / 2)
  awayQuad(S, dn(A), dn(B), dn(C), dn(D), P(0, (hi + lo) / 2 + 2, d0 + depth / 2), roofQ)
  awayQuad(S, D, C, dn(C), dn(D), rc, roofQ)
  awayQuad(S, A, D, dn(D), dn(A), rc, roofQ)
  awayQuad(S, C, B, dn(B), dn(C), rc, roofQ)
  // the door
  const dw = Math.min(1.1, w * 0.3), ds = (hash(phi, 5.5) - 0.5) * (w - dw - 0.6)
  awayQuad(S, P(ds - dw / 2, t0 + 0.1, d1 + 0.04), P(ds + dw / 2, t0 + 0.1, d1 + 0.04), P(ds + dw / 2, t + 1.9, d1 + 0.04), P(ds - dw / 2, t + 1.9, d1 + 0.04), P(0, t + 1, d1 - 1), doorQ)
}

export function buildShow(f0: { x: number; z: number; c: number; s: number }, ground: (x: number, z: number) => number, sp: J): Show {
  // its foot: the ground's mean round the base storey's circle; the base sunk below the lowest point of it
  let sum = 0, lo = Infinity
  for (let a = 0; a < 360; a += 5) {
    const [x, z] = sceneAt(f0, a, sp.base.r0)
    const g = ground(x, z)
    sum += g
    lo = Math.min(lo, g)
  }
  const base = sum / 72
  const f: ShowFrame = { ...f0, base }
  const sink = lo - base - 0.6
  const P = sp.pitch.perTurn as number
  /** the spiral: every terrace rises counterclockwise seen from above, P a turn, level at the front, the seam behind */
  // -180 is the seam's low side (wrap would take it to +180)
  const riseAt = (phi: number): number => (P * (phi <= -180 + 1e-9 ? -180 : wrap(phi))) / 360
  const inRanges = (phi: number, rs: number[][] | undefined): boolean => !!rs && rs.some(([a, b]) => phi >= a! && phi <= b!)
  const bodies: ShowBody[] = []
  const facts: Record<string, unknown> = {}
  const stA = sp.storeys as J[]
  // the rings: the base storey, then tiers 2 to 6; each ring's foot and top over the tower's foot at the front
  const rings = [{ n: 1, r: sp.base.r1 + 0.7, h: sp.base.h, bays: sp.base.bays, off: 0, stacked: false }, ...stA.map((st) => ({ n: st.n, r: st.r, h: st.h, bays: st.bays, off: (hash(st.n, 4.4) - 0.5) * (360 / st.bays), stacked: !!st.stacked }))]
  const tops: number[] = []
  rings.forEach((g, k) => tops.push((k ? tops[k - 1]! : 0) + g.h))
  facts['tops'] = tops.map((t) => +t.toFixed(2))
  const rockF = sp.rock.front.phi as [number, number], over = sp.overRock.phi as [number, number]
  /* pass 1: what each bay is; a bay above open air is open too */
  type Bay = { i: number; a0: number; a1: number; plain: boolean; kind: BayKind }
  const kinds: Bay[][] = []
  const kindAt = (k: number, phi: number): BayKind => {
    const list = kinds[k]
    if (!list) return 'open'
    const p = wrap(phi)
    for (const b of list) if (p >= b.a0 - 1e-9 && p <= b.a1 + 1e-9) return b.kind
    return 'open'
  }
  rings.forEach((g, k) => {
    const list: Bay[] = ringBays(g.bays, g.off).map((b) => {
      const mid = (b.a0 + b.a1) / 2
      let kind: BayKind
      if (k === 0) kind = mid > rockF[0] && mid < rockF[1] ? 'rock' : 'white'
      else if (k === 1) kind = mid > over[0] && mid < over[1] ? 'overRock' : 'white'
      else kind = inRanges(mid, sp.white[String(g.n)]) ? 'white' : inRanges(mid, sp.red[String(g.n)]) ? 'red' : 'open'
      if (k >= 2 && kind !== 'open') for (let u = 0; u <= 4; u++) if (kindAt(k - 1, b.a0 + ((b.a1 - b.a0) * u) / 4) === 'open') kind = 'open'
      return { ...b, kind }
    })
    kinds.push(list)
  })
  const solid = (kd: BayKind): boolean => kd !== 'open' && kd !== 'rock'
  /* pass 2: the rings, each its own body */
  rings.forEach((g, k) => {
    const S = new Soup()
    const list = kinds[k]!
    const tan = Math.tan(Math.PI / g.bays)
    const footH = k ? tops[k - 1]! : 0, topH = tops[k]!
    const rNext = rings[k + 1]?.r
    const lastRing = k === rings.length - 1
    list.forEach((b, bi) => {
      if (!solid(b.kind)) return
      const { F, W, left, right } = chordFrame(f, b.a0, b.a1, g.r)
      const fl = k ? footH + riseAt(left) : sink, fr = k ? footH + riseAt(right) : sink
      const tl = topH + riseAt(left), tr = topH + riseAt(right)
      const mid = (b.a0 + b.a1) / 2
      const tone = hash(g.n, b.i, 0.7), v = hash(g.n, b.i, 5.1)
      const aboveOpen = lastRing || [0.15, 0.5, 0.85].some((u) => !solid(kindAt(k + 1, b.a0 + (b.a1 - b.a0) * u)))
      const prev = list[(bi + list.length - 1) % list.length]!, next = list[(bi + 1) % list.length]!
      const pierL = solid(prev.kind) && !b.plain, pierR = solid(next.kind) && !b.plain
      if (b.kind === 'white' && k === 0) {
        baseBay(S, F, W, sink, tl, tr, g.h, { tone, v, fresh: hash(1, b.i, 9.2) < 0.18 ? 1 : 0, red: mid > -45 && mid < -30, pw: W * sp.base.spur.w, tan })
      } else if (b.kind === 'white' && b.plain) {
        panel(S, F, 0, W, (s) => fl + ((fr - fl) * s) / W, (s) => tl + ((tr - tl) * s) / W, [], 0, q(SK.old, tone, 0, 0, (tl + tr) / 2))
      } else if (b.kind === 'white') {
        whiteBay(S, F, W, fl, fr, tl, tr, g.h, { n: g.n, stacked: g.stacked, pw: W * 0.15, fresh: hash(g.n, b.i, 9.2) < 0.15 ? 1 : 0, tone, v, redBack: hash(g.n, b.i, 7.7) < 0.12, last: lastRing, tan, pierL, pierR })
      } else if (b.kind === 'red') {
        redBay(S, F, W, fl, fr, tl, tr, g.h, { tone, seed: g.n * 100 + b.i, broken: aboveOpen ? (g.n >= 5 ? 0.5 : 0.3) : 0, thick: 2.6 })
      } else if (b.kind === 'overRock') {
        // two arches spring from the rock's top; the wall above them, its cornice and parapet
        const face = q(SK.old, tone, 0, 0, (tl + tr) / 2)
        const aw = W * 0.4
        const holes: Hole[] = [W * 0.07, W * 0.53].map((s0) => ({ s0, s1: s0 + aw, sill: Math.max(fl, fr) + 0.05, spring: footH + 10.7 - aw / 2, head: 'round' as const, depth: 4.5, rev: face, back: q(SK.dark, tone, 0, 4.5, (tl + tr) / 2) }))
        panel(S, F, -0.04, W + 0.04, (s) => fl + ((fr - fl) * s) / W, (s) => tl - 0.62 + ((tr - tl) * s) / W, holes, 0, face)
        ledge(S, F, W, tan, [tl - 0.62, tr - 0.62], [tl, tr], -0.6, 0.95, face, 'fd')
        ledge(S, F, W, tan, [tl, tr], [tl + 1.0, tr + 1.0], 0.35, 0.95, q(SK.old, tone, 0, 0, (tl + tr) / 2 + 1.1), 'ftb')
      }
      // the wall's back, dark inside the tower, so an opening never shows the sky through the far side
      if (b.kind !== 'red') slab(S, F, 0, W, [fl, fr], [tl, tr], -2.6, -2.55, q(SK.dark, tone, 0, 2.6, tl), 'b')
      // the terrace this ring carries, where a ring stands on it or its own ledge stays open to the sky
      const carries = !lastRing && (b.kind !== 'red' || !aboveOpen)
      if (carries && rNext !== undefined) terrace(S, f, left, right, rNext - 2.5, g.r + (b.kind === 'red' ? 0.0 : 0.6), tl, tr, q(SK.floor, tone, 0, 0, tl))
      // a wall run's ends: the cut end showing its thickness, the facing toothed
      for (const [nb, end, dir] of [[prev, left, -1], [next, right, 1]] as Array<[Bay, number, 1 | -1]>) {
        if (solid(nb.kind) || b.plain) continue
        const t0 = k ? footH + riseAt(end) : sink, t1 = topH + riseAt(end)
        const cap = radialFrame(f, end)
        slab(S, cap, -0.01, 0.01, [t0, t0], [t1, t1], g.r - 2.6, g.r + 0.6, q(b.kind === 'red' ? SK.brick : SK.old, hash(g.n, end, 2.2), b.kind === 'red' ? 1 : 0, 0, t1), dir > 0 ? 'r' : 'l')
        if ((b.kind === 'white' || b.kind === 'overRock') && nb.kind !== 'rock') toothed(S, F, dir > 0 ? W : 0, dir, t0, t1 - 0.7, 2.6, q(SK.old, hash(g.n, end, 1.9), 0.5, 0, t1))
      }
    })
    // piers between white bays, spurs on the base storey
    list.forEach((b, bi) => {
      const prev = list[(bi + list.length - 1) % list.length]!
      if (b.plain || prev.plain) return
      const phi = b.a0
      const both = solid(b.kind) && solid(prev.kind)
      if (!both || (b.kind !== 'white' && prev.kind !== 'white')) return
      if (b.kind === 'red' || prev.kind === 'red') return
      const W = 2 * g.r * Math.sin(Math.PI / g.bays)
      const t1 = topH + riseAt(phi)
      if (k === 0) {
        const big = inRanges(phi, sp.base.spur.big)
        spur(S, f, phi, g.r, W * sp.base.spur.w, big ? sp.base.spur.bigOut : sp.base.spur.out0, sp.base.spur.out1, big ? sp.base.spur.bigRise : sp.base.spur.rise, sink, t1 - 0.68, q(SK.old, hash(1, b.i, 2.9), 0, 0, t1))
      } else {
        pier(S, f, phi, g.r, W * 0.15, 0.55, footH + riseAt(phi) - 0.02, t1 - 0.6, q(SK.old, hash(g.n, b.i, 3.1), 0, 0, t1))
      }
    })
    bodies.push({ id: `bruegel-show-storey-${g.n}`, geometry: S.geometry() })
    facts[`storey${g.n}Tris`] = S.count
  })
  facts['kinds'] = kinds.map((list) => list.map((b) => `${b.kind[0]}${Math.round((b.a0 + b.a1) / 2)}`).join(' '))

  /* ── the red cells stepping back toward the core ── */
  {
    const S = new Soup()
    const cells = sp.cells as J[]
    // the first row where tier 4's ring is open, on tier 3's terrace; the rows above it on the row below; all on the spiral
    const open4 = kinds[3]!.filter((b) => b.kind === 'open' && b.a0 > -90 && b.a1 < 90)
    const o0 = Math.min(...open4.map((b) => b.a0)), o1 = Math.max(...open4.map((b) => b.a1))
    let footAt = (phi: number): number => tops[2]! + riseAt(phi) - 0.05
    cells.forEach((c, k) => {
      const full = k >= cells.length - 2
      const a0 = full ? -180 : k === 0 ? o0 : -52, a1 = full ? 180 : k === 0 ? o1 : 128
      const topAt = (phi: number): number => (c.top as number) + riseAt(phi)
      const foot = footAt
      const n = Math.max(3, Math.round(((a1 - a0) / 360) * c.bays))
      for (let i = 0; i < n; i++) {
        const p0 = a0 + ((a1 - a0) * i) / n, p1 = a0 + ((a1 - a0) * (i + 1)) / n
        const { F, W, left, right } = chordFrame(f, p0, p1, c.r)
        redBay(S, F, W, foot(left), foot(right), topAt(left), topAt(right), topAt(left) - foot(left), { tone: hash(7, k, i), seed: 700 + k * 50 + i, broken: k === 0 ? 0.12 : 0.06, thick: 1.2 })
      }
      const rIn = k === cells.length - 1 ? 3.0 : (cells[k + 1].r as number) - 1.5
      const n2 = Math.max(4, Math.round((a1 - a0) / 6))
      for (let i = 0; i < n2; i++) {
        const p0 = a0 + ((a1 - a0) * i) / n2, p1 = a0 + ((a1 - a0) * (i + 1)) / n2
        const [ax, az] = sceneAt(f, p0, rIn), [bx, bz] = sceneAt(f, p1, rIn), [cx, cz] = sceneAt(f, p1, c.r - 1.2), [dx, dz] = sceneAt(f, p0, c.r - 1.2)
        upQuad(S, [ax, base + topAt(p0), az], [bx, base + topAt(p1), bz], [cx, base + topAt(p1), cz], [dx, base + topAt(p0), dz], q(SK.floor, hash(8, k, i), 1, 0, c.top))
      }
      if (!full) {
        for (const e of [a0, a1]) {
          const cap = radialFrame(f, e)
          slab(S, cap, -0.01, 0.01, [foot(e), foot(e)], [topAt(e), topAt(e)], k === 0 ? (c.r as number) - 1.2 : rIn, c.r, q(SK.brick, hash(9, k, e), 1, 0, c.top), e === a0 ? 'l' : 'r')
        }
      }
      footAt = topAt
    })
    bodies.push({ id: 'bruegel-show-cells', geometry: S.geometry() })
    facts['cellsTris'] = S.count
  }
  /* ── the red core, its top ring unfinished ── */
  {
    const S = new Soup()
    const core = sp.core as J[]
    core.forEach((c, k) => {
      const n = c.bays as number
      for (let i = 0; i < n; i++) {
        const a0 = -180 + (360 * i) / n, a1 = a0 + 360 / n
        const { F, W } = chordFrame(f, a0, a1, c.r)
        const tone = hash(11, k, i)
        const brick = q(SK.brick, tone, 1, 0, c.y1), dark = q(SK.dark, tone, 0, 2, c.y1)
        const H = c.y1 - c.y0
        if (c.kind === 'broken') {
          // the drop runs on from bay to bay, so the top falls and climbs in long steps of courses, never in merlons
          const dropAt = (sl: number): number => {
            const phi = a0 + ((a1 - a0) * sl) / W
            const n1 = noise3(phi / 55, 3.7, 1.3), n2 = noise3(phi / 17, 8.1, 2.9)
            return H * Math.min(0.72, Math.max(0, 0.32 + 0.38 * n1 + 0.12 * n2))
          }
          redBay(S, F, W, c.y0, c.y0, c.y1, c.y1, H, { tone, seed: 1100 + i, broken: 0.75, thick: 1.4, drop: dropAt })
          continue
        }
        const holes: Hole[] = []
        if (c.kind === 'arcade') {
          const w = W * 0.5
          holes.push({ s0: (W - w) / 2, s1: (W + w) / 2, sill: c.y0 + 0.3, spring: c.y0 + H * 0.82 - w / 2, head: 'round', depth: 1.8, rev: brick, back: dark })
        } else if (c.kind === 'marked') {
          const w = W * 0.62
          holes.push({ s0: (W - w) / 2, s1: (W + w) / 2, sill: c.y0 + H * 0.12, spring: c.y0 + H * 0.82, head: 'flat', depth: 0.25, rev: brick, back: q(SK.brick, tone, 1, 0.25, c.y1) })
        } else {
          const w = W * 0.3
          holes.push({ s0: (W - w) / 2, s1: (W + w) / 2, sill: c.y0 + H * 0.3, spring: c.y0 + H * 0.78 - w / 2, head: 'round', depth: 1.2, rev: brick, back: dark })
        }
        panel(S, F, -0.03, W + 0.03, () => c.y0, () => c.y1 - 0.45, holes, 0, brick)
        // under the first ring a plain plinth, down to the lowest turn of the spiral floor it stands in
        if (k === 0) panel(S, F, -0.03, W + 0.03, () => c.y0 - 4.6, () => c.y0, [], 0, brick)
        ledge(S, F, W, Math.tan(Math.PI / n), [c.y1 - 0.45, c.y1 - 0.45], [c.y1, c.y1], -0.5, 0.4, brick, 'fd')
      }
      const rIn = k + 1 < core.length ? (core[k + 1].r as number) - 1.0 : 0.01
      if (c.kind !== 'broken') {
        for (let i = 0; i < 36; i++) {
          const p0 = -180 + i * 10, p1 = p0 + 10
          const [ax, az] = sceneAt(f, p0, rIn), [bx, bz] = sceneAt(f, p1, rIn), [cx, cz] = sceneAt(f, p1, c.r + 0.4), [dx, dz] = sceneAt(f, p0, c.r + 0.4)
          upQuad(S, [ax, base + c.y1, az], [bx, base + c.y1, bz], [cx, base + c.y1, cz], [dx, base + c.y1, dz], q(SK.floor, hash(12, k, i), 1, 0, c.y1))
        }
      }
    })
    bodies.push({ id: 'bruegel-show-core', geometry: S.geometry() })
    facts['coreTris'] = S.count
  }
  /* ── the rock the tower is built round: two weathered masses at the front's foot, the quarried slope between them
     up to the base storey's terrace, the crag in the cutaway ── */
  {
    const S = new Soup()
    const t2 = tops[0]!
    const top = sp.rock.front.top as number
    let seed = 1
    // behind, under the walls' ends either side, so each wall ends against rock
    for (const [a, h] of [[-14.0, t2 + 2.5], [13.5, t2 + 3.5]] as Array<[number, number]>) mass(S, f, a, 57.0, 9.0, 9.0, sink, h + riseAt(a), ++seed, hash(seed, 4), 1)
    // the left mass, up to the base storey's frieze, a cleft and a ledge in it
    mass(S, f, -9.5, 62.0, 13.0, 12.0, sink, t2 - 1.0, ++seed, 0.35, 3)
    mass(S, f, -12.5, 66.5, 7.0, 6.0, sink, 13.0, ++seed, 0.6, 1)
    // the right mass: the great pillar through the base storey's terrace
    mass(S, f, 8.6, 61.0, 10.0, 11.0, sink, top, ++seed, 0.5, 2)
    mass(S, f, 12.4, 64.5, 6.5, 6.5, sink, 18.0, ++seed, 0.7, 1)
    // a shelf of rock at the base storey's terrace across the gap, under tier 2's walls, its face behind the masses
    for (let a = -15; a < 15 - 1e-6; a += 3) {
      const b = a + 3, ta = t2 + riseAt(a) - 0.05, tb = t2 + riseAt(b) - 0.05
      const P = (phi: number, r: number, t: number): V3 => { const [x, z] = sceneAt(f, phi, r); return [x, f.base + t, z] }
      const sh = q(SK.rock, hash(51, a), 0, 0, ta)
      upQuad(S, P(a, 51.5, ta), P(b, 51.5, tb), P(b, 58.6, tb), P(a, 58.6, ta), sh)
      const [ox, oz] = sceneAt(f, (a + b) / 2, 50)
      awayQuad(S, P(a, 58.6, ta - 6), P(b, 58.6, tb - 6), P(b, 58.6, tb), P(a, 58.6, ta), [ox, f.base + ta, oz], sh)
    }
    // the slope between them, cut in steps, its head carrying tier 2's arches
    quarry(S, f, -5.2, 5.0, 75.0, 59.0, 51.5, t2 + riseAt(0) - 0.05, 8, 41)
    // the crag among the red walls of the cutaway
    const [c0, c1] = sp.rock.crag.phi as [number, number]
    mass(S, f, (c0 + c1) / 2, 45.0, 10.0, 9.0, sp.rock.crag.foot - 4.5, sp.rock.crag.top - 8.0, ++seed, 0.45, 2)
    mass(S, f, c0 + 3, 46.5, 6.0, 6.0, sp.rock.crag.foot - 4.5, sp.rock.crag.top - 14.0, ++seed, 0.65, 1)
    bodies.push({ id: 'bruegel-show-rock', geometry: S.geometry() })
    facts['rockTris'] = S.count
  }
  /* ── the builders' works: scaffolds, the crane, the hoist, centrings, masts, huts on the terraces, the ramp wall ── */
  {
    const S = new Soup()
    const tm = (seed: number): Q => q(SK.timber, hash(seed, 2.7))
    const terraceAt = (k: number, phi: number): number => tops[k]! + riseAt(phi)
    // the base storey's red bay, rebuilt behind its scaffold, standing on the ground
    scaffold(S, f, -43.2, -31.8, sp.base.r1 + 0.7 + 1.4, sp.base.r1 + 0.7, () => -0.35, (phi) => tops[0]! + riseAt(phi) - 1.5, tm(1))
    // round the core's top ring, on the ring below
    const cTop = (sp.core as J[])[3]!, cUnder = (sp.core as J[])[2]!
    for (const [a0, a1] of [[-168, -42], [8, 122]] as Array<[number, number]>) scaffold(S, f, a0, a1, (cTop.r as number) + 1.4, cTop.r as number, () => cUnder.y1 as number, () => (cTop.y1 as number) - 2.0, tm(2), 2.0, 0.62, 0.4)
    // on the red shells
    scaffold(S, f, 28, 40, rings[2]!.r + 1.3, rings[2]!.r, (phi) => terraceAt(1, phi), (phi) => terraceAt(2, phi) - 1.0, tm(3))
    scaffold(S, f, 60, 75, rings[3]!.r + 1.3, rings[3]!.r, (phi) => terraceAt(2, phi), (phi) => terraceAt(3, phi) - 1.0, tm(4))
    // two masts and a ladder by the top white ring's toothed end
    const r5 = rings[5]!.r + 1.3
    for (const [phi, h] of [[-37.6, 100.6], [-35.2, 99.2]] as Array<[number, number]>) {
      const [x0, z0] = sceneAt(f, phi, r5)
      beam(S, [x0, f.base + terraceAt(4, phi) - 0.12, z0], [x0, f.base + h, z0], 0.4, tm(5))
    }
    {
      const L = radialFrame(f, -33.4)
      const t0 = terraceAt(4, -33.4) - 0.1, t1 = terraceAt(5, -33.4) - 0.6
      const d0 = rings[5]!.r + 2.3, d1 = rings[5]!.r + 0.35
      for (const sx of [-0.32, 0.32]) beam(S, at(L, sx, t0, d0), at(L, sx, t1, d1), 0.22, tm(6))
      for (let t = t0 + 0.9; t < t1 - 0.3; t += 1.1) {
        const u = (t - t0) / (t1 - t0), d = d0 + (d1 - d0) * u
        beam(S, at(L, -0.32, t, d), at(L, 0.32, t, d), 0.2, tm(6))
      }
    }
    // the treadwheel crane on the base storey's terrace, at the right
    treadwheel(S, f, 35, 57.0, terraceAt(0, 35), tm(7))
    // shear legs on tier 3's terrace over the front, at the left
    shearLegs(S, f, -12, 51.3, terraceAt(2, -12), 11, tm(8))
    // the centrings still standing in the arches over the rock
    const g1 = rings[1]!
    for (const b of kinds[1]!) {
      if (b.kind !== 'overRock') continue
      const { F, W, left, right } = chordFrame(f, b.a0, b.a1, g1.r)
      const aw = W * 0.4
      const sill = Math.max(tops[0]! + riseAt(left), tops[0]! + riseAt(right)) + 0.05
      for (const s0 of [W * 0.07, W * 0.53]) centring(S, F, s0, s0 + aw, sill, tops[0]! + 10.7 - aw / 2, -0.7, tm(9))
    }
    // huts, sheds and small brick houses against the next wall, on the terraces
    const huts: Array<[number, number[]]> = [[0, [-58, -71, -86, -104, -121, -137, 50, 64]], [1, [-54, -66, -93, -110, -128, 30]], [2, [-48, -62, -79, -97, -116]], [3, [-45, -70, -90]]]
    for (const [k, phis] of huts) {
      const rIn = rings[k + 1]!.r + 0.05, free = rings[k]!.r + 0.3 - rIn
      for (const phi of phis) {
        if (kindAt(k, phi) === 'open' || kindAt(k + 1, phi) === 'open') continue
        const sd = hash(k, phi, 6.1)
        const brickHouse = sd < 0.3
        const wallQ = brickHouse ? q(SK.brick, sd, 1, 0, 0) : q(SK.plaster, sd, 0, 0, 0)
        const roofQ = q(sd > 0.6 ? SK.thatch : SK.tile, sd)
        hut(S, f, phi, rIn, Math.min(2.6, free - 0.4), 2.8 + 1.8 * hash(k, phi, 6.2), terraceAt(k, phi), 2.3 + 0.8 * hash(k, phi, 6.3), wallQ, roofQ, q(SK.dark, sd, 0, 0.3, 0))
      }
    }
    // the curved ramp wall on the right, rising from the top white ring's height to a peak, people's way up its top
    {
      const r = rings[3]!.r + 1.6, a0 = 78, a1 = 104, n = 7
      const topAt = (phi: number): number => {
        const u = (phi - a0) / (a1 - a0)
        return u < 0.82 ? 64.0 + 14.0 * Math.pow(u / 0.82, 1.3) : 78.0 - 6.0 * ((u - 0.82) / 0.18)
      }
      for (let i = 0; i < n; i++) {
        const p0 = a0 + ((a1 - a0) * i) / n, p1 = a0 + ((a1 - a0) * (i + 1)) / n
        const { F, W, left, right } = chordFrame(f, p0, p1, r)
        const fl = terraceAt(2, left) - 0.1, fr = terraceAt(2, right) - 0.1
        const tl = topAt(left), tr = topAt(right)
        const tone = hash(31, i), brick = q(SK.brick, tone, 1, 0, Math.max(tl, tr))
        const holes: Hole[] = i % 2 === 0 ? [{ s0: W * 0.3, s1: W * 0.7, sill: Math.max(fl, fr) + 1.2, spring: Math.max(fl, fr) + 1.2 + W * 0.5, head: 'round', depth: 1.3, rev: brick, back: q(SK.dark, tone, 0, 1.3, 0), open: true }] : []
        panel(S, F, -0.03, W + 0.03, (sl) => fl + ((fr - fl) * sl) / W, (sl) => tl + ((tr - tl) * sl) / W, holes, 0, brick)
        slab(S, F, 0, W, [fl, fr], [tl, tr], -1.3, 0, brick, 'bt')
        if (i === 0) slab(S, F, 0, 0.6, [fl, fl], [tl, tl], -1.3, 0, brick, 'l')
        if (i === n - 1) slab(S, F, W - 0.6, W, [fr, fr], [tr, tr], -1.3, 0, brick, 'r')
      }
    }
    bodies.push({ id: 'bruegel-show-works', geometry: S.geometry() })
    facts['worksTris'] = S.count
  }
  const height = Math.max(...(sp.core as J[]).map((c) => c.y1 as number))
  return { bodies, frame: f, facts: { ...facts, foot: +base.toFixed(2), footLow: +lo.toFixed(2), baseDiameter: 2 * sp.base.r0, height, scale: sp.scale.mPerPx } }
}
