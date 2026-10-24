/** THE BRIDGE OF POLES' NUMBERS (Codex Atlanticus f. 71 recto). The sheet
 * gives no size, count or unit, so every metre here is the museum's. The form
 * follows the one engineering reading of the sketch: two arch frames of
 * straight round rods on three staggered planes, joined across by joists,
 * the rods meeting beside the joists and lashed there.
 *
 * THE WEAVE. Every rod rests on a joist at each end and passes under the
 * joist at its middle, so three rods meet at each inner joist, each on its
 * own plane: two ends over it, one middle under it. Fix the span, the parts
 * and the poles' diameter and the rise follows (the reading's rule).
 *
 * Frame: metres, +Y up, +X along the span (the near bank at -X, the far bank
 * at +X), +Z toward the viewer's side; origin on the bank's level midway
 * between the feet.
 */

export type V3 = [number, number, number]
export const TAU = Math.PI * 2

/** rods and joists, 0.15 m across at the middle */
export const POLE_R = 0.075
export const SEAT_R = 0.12
/** a rod's axis to a joist's axis where they touch */
export const E = POLE_R * 2
/** the card's lower guess (8 to 12 m): the width it allows then stands nearest the sketch's proportion */
export const SPAN = 8
export const PANELS = 6

/** the turn at each joist, solved so the feet stand SPAN apart */
function solveTurn(): number {
  let lo = 0.01, hi = 1.0
  for (let i = 0; i < 80; i++) {
    const t = (lo + hi) / 2
    const a = (2 * E) / Math.sin(t / 2), r = a / (2 * Math.sin(t / 2))
    if (2 * r * Math.sin(3 * t) > SPAN) lo = t; else hi = t
  }
  return (lo + hi) / 2
}
export const TURN = solveTurn()
/** the panel along the arch, joist to joist */
export const PANEL = (2 * E) / Math.sin(TURN / 2)
export const RADIUS = PANEL / (2 * Math.sin(TURN / 2))
export const RISE = RADIUS * (1 - Math.cos(3 * TURN))

const sub2 = (a: [number, number], b: [number, number]): [number, number] => [a[0] - b[0], a[1] - b[1]]
const norm2 = (a: [number, number]): [number, number] => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l] }

const ARC: [number, number][] = Array.from({ length: PANELS + 1 }, (_, k) => {
  const phi = (k - 3) * TURN
  return [RADIUS * Math.sin(phi), RADIUS * Math.cos(phi) - RADIUS * Math.cos(3 * TURN)]
})
/** a seat stands in from its foot joist so a rod resting on it stands as on a joist */
const SEAT_SHIFT = SEAT_R + POLE_R - E
/** the seat logs lie on the bank, bedded this much: the whole arch stands on them */
export const SEAT_BED = 0.01
export const BASE = SEAT_R - SEAT_BED + SEAT_SHIFT * norm2(sub2(ARC[2]!, ARC[0]!))[0]

/** the joists' axes in the span's plane, 0 and 6 the feet */
export const JOIST_XY: [number, number][] = ARC.map(([x, y]) => [x, y + BASE])

/** the two frames' centre planes and the three planes of each; the card's upper guess */
export const FRAME_Z = 1.25
export const PLANE_STEP = 0.27
/** plane 0 outer, 1 centre, 2 inner; frame A at -Z, B at +Z, mirrored */
export function planeZ(frame: 'A' | 'B', plane: number): number {
  const s = frame === 'A' ? -1 : 1
  return s * (FRAME_Z + (1 - plane) * PLANE_STEP)
}
/** which plane each rod stands on: three rods at each joist, three planes; the crown rod in the centre */
export const ROD_PLANE: Record<number, number> = { 0: 1, 1: 0, 2: 2, 3: 1, 4: 0, 5: 2, 6: 1 }

/** a joist runs 0.33 m past the outer planes */
export const JOIST_HALF = FRAME_Z + PLANE_STEP + 0.33
export const SEAT_HALF = JOIST_HALF + 0.1
/** how far a rod runs past the joist it rests on */
export const OVERHANG = 0.3
export const ROPE_R = 0.0068
export const TURNS = 4
/** at a foot the rod runs past the seat far enough to hold the seat's outer lashing turns (the seat's radius and
 * four turns of rope) with the axe-cut end clear of them */
export const FOOT_OVERHANG = 0.12 + 2 * TURNS * 0.0068 + 0.07

/** A hash in [0, 1), the same on every load. */
export function hash(...values: number[]): number {
  let h = 2166136261
  for (const value of values) {
    h = Math.imul(h ^ Math.round(value * 1000 + 7919), 16777619)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
  }
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** the outward normal of the chord from joist i to joist j */
function chordFrame(i: number, j: number): { d: [number, number]; n: [number, number] } {
  const d = norm2(sub2(JOIST_XY[j]!, JOIST_XY[i]!))
  return { d, n: [-d[1], d[0]] }
}

/** The bank seats: logs lying across each foot. */
export const SEAT_XY: [[number, number], [number, number]] = (() => {
  const f1 = chordFrame(0, 2), f5 = chordFrame(4, 6)
  const p0 = JOIST_XY[0]!, p6 = JOIST_XY[6]!
  return [[p0[0] - SEAT_SHIFT * f1.n[0], p0[1] - SEAT_SHIFT * f1.n[1]], [p6[0] - SEAT_SHIFT * f5.n[0], p6[1] - SEAT_SHIFT * f5.n[1]]]
})()

export type PoleKind = 'rod' | 'end' | 'joist' | 'strut'
export interface Pole {
  id: string
  kind: PoleKind
  frame: 'A' | 'B' | null
  /** rods: their index 0 to 6 (0 and 6 the end rods); joists: 1 to 5; struts: 0 near, 1 far */
  k: number
  /** the axis in place, from a to b (a strut: its place in its first bay) */
  a: V3
  b: V3
  length: number
  /** radius at the middle, and the change from end a to end b (a positive taper: a is the butt) */
  r: number
  taper: number
  /** 0 in its bark, 1 peeled with a drawknife */
  peeled: number
  tone: number
  seed: number
  /** where along it (metres from a) it bears on another part: the girth stays true there, no knot or stub */
  bears: number[]
  /** its own bend sideways (local +Z, across its frame's plane): sin(pi s/L) and sin(2 pi s/L) in metres */
  bow: [number, number]
  knots: Knot[]
  stubs: Stub[]
  /** the axe's facets at end a and at end b */
  cuts: [Facet[], Facet[]]
  /** a peeled pole's bark left on at its ends */
  bands: Band[]
  /** a strut's fork */
  tines: Tine[]
}

/** Angles round a pole are in its own frame: 0 its local +Y (a rod's outward side), pi/2 its local +Z. */
/** a swelling of the girth on one side, where a branch grew */
export interface Knot { s: number; ang: number; amp: number; w: number }
/** a branch cut off short above its knot: it leaves the stem at `ang` round it, leaning `lean` from straight out toward
 * the pole's tip; `len` past the stem's surface */
export interface Stub { s: number; ang: number; lean: number; len: number; r: number }
/** one axe stroke at an end: a plane through the axis `c` beyond the end, its face turned `tilt` from square toward `az` */
export interface Facet { az: number; tilt: number; c: number }
/** bark the drawknife left at a peeled pole's end, out to `reach` along it, its edge ragged */
export interface Band { end: 0 | 1; reach: number; seed: number }
/** a strut's tine: a straight branch whose axis leaves the stem's axis at the crotch (the strut's end b), `spread` from
 * it toward `ang` round it; it starts `back` metres inside the stem */
export interface Tine { ang: number; spread: number; len: number; r: number; back: number }
/** bark stands this proud of the peeled wood */
export const BARK = 0.004

/** a pole's radius at s metres from end a */
export function radiusAt(p: Pole, s: number): number {
  return p.r + p.taper * (0.5 - s / p.length)
}

const bare = (): Pick<Pole, 'bow' | 'knots' | 'stubs' | 'cuts' | 'bands' | 'tines'> => ({ bow: [0, 0], knots: [], stubs: [], cuts: [[], []], bands: [], tines: [] })

/** the few poles peeled with a drawknife; the rest keep their bark */
const PEELED = new Set(['1B', '4A', 'J2', '6B'])

function support(i: number): { xy: [number, number]; r: number } {
  return i === 0 ? { xy: SEAT_XY[0], r: SEAT_R } : i === 6 ? { xy: SEAT_XY[1], r: SEAT_R } : { xy: JOIST_XY[i]!, r: POLE_R }
}

/** A rod's line: the chord's normal, through each end support at its own touch. */
function rodLine(k: number, frame: 'A' | 'B'): Pole {
  const seed = hash(k, frame === 'A' ? 1 : 2, 3.3)
  const taper = (0.016 + 0.012 * hash(k, frame === 'A' ? 5 : 6)) * (hash(k, frame === 'A' ? 7 : 8) > 0.5 ? 1 : -1)
  const plane = ROD_PLANE[k]!, z = planeZ(frame, plane)
  // supports: the joist index at each end (0 and 6 are the seats) and whether the rod lies over (+1) or under (-1) it
  let i0: number, i1: number, f: { d: [number, number]; n: [number, number] }
  let s0 = 1, s1 = 1, over0 = OVERHANG, over1 = OVERHANG
  if (k === 0) { f = chordFrame(0, 2); i0 = 0; i1 = 1; s1 = -1; over0 = FOOT_OVERHANG }
  else if (k === 6) { f = chordFrame(4, 6); i0 = 5; i1 = 6; s0 = -1; over1 = FOOT_OVERHANG }
  else { f = chordFrame(k - 1, k + 1); i0 = k - 1; i1 = k + 1; if (k === 1) over0 = FOOT_OVERHANG; if (k === 5) over1 = FOOT_OVERHANG }
  const A = support(i0), B = support(i1)
  // the rod's radius where it touches: the contacts stand `over` in from its ends; iterate once for the length
  let length = Math.hypot(B.xy[0] - A.xy[0], B.xy[1] - A.xy[1]) + over0 + over1
  let ca: [number, number] = [0, 0], cb: [number, number] = [0, 0]
  for (let pass = 0; pass < 3; pass++) {
    const pole = { r: POLE_R, taper, length } as Pole
    const ra = radiusAt(pole, over0), rb = radiusAt(pole, length - over1)
    ca = [A.xy[0] + s0 * (A.r + ra) * f.n[0], A.xy[1] + s0 * (A.r + ra) * f.n[1]]
    cb = [B.xy[0] + s1 * (B.r + rb) * f.n[0], B.xy[1] + s1 * (B.r + rb) * f.n[1]]
    length = Math.hypot(cb[0] - ca[0], cb[1] - ca[1]) + over0 + over1
  }
  const d = norm2(sub2(cb, ca))
  const a: V3 = [ca[0] - d[0] * over0, ca[1] - d[1] * over0, z]
  const b: V3 = [cb[0] + d[0] * over1, cb[1] + d[1] * over1, z]
  const kind: PoleKind = k === 0 || k === 6 ? 'end' : 'rod'
  // the middle joist's touch, for a rod: where the line passes its nearest point to that joist's axis
  const bears = [over0, length - over1]
  if (kind === 'rod') {
    const m = JOIST_XY[k]!
    bears.push((m[0] - a[0]) * d[0] + (m[1] - a[1]) * d[1])
  }
  return {
    id: `${kind === 'end' ? 'E' : 'R'}${k}${frame}`, kind, frame, k, a, b, length, r: POLE_R, taper,
    peeled: PEELED.has(`${k}${frame}`) ? 1 : 0, tone: 0.9 + 0.2 * hash(k, frame === 'A' ? 13 : 14), seed, bears: bears.sort((x, y) => x - y),
    ...bare(),
  }
}

function joist(k: number): Pole {
  const [x, y] = JOIST_XY[k]!
  // a joist bears where each rod crosses it: one rod on each of the three planes of both frames
  const bears = [-1, 1].flatMap(s => [0, 1, 2].map(p => JOIST_HALF + s * (FRAME_Z + (1 - p) * PLANE_STEP))).sort((p, q) => p - q)
  return {
    id: `J${k}`, kind: 'joist', frame: null, k, a: [x, y, -JOIST_HALF], b: [x, y, JOIST_HALF], length: 2 * JOIST_HALF,
    r: POLE_R, taper: 0, peeled: PEELED.has(`J${k}`) ? 1 : 0, tone: 0.88 + 0.2 * hash(k, 23), seed: hash(k, 25), bears,
    ...bare(),
  }
}

/** Every rod and the support it crosses: a lashing each. `over`: the rod lies on the support. */
export interface Crossing { rod: string; support: string; over: boolean }
export const CROSSINGS: Crossing[] = (() => {
  const list: Crossing[] = []
  for (const frame of ['A', 'B'] as const) {
    for (let k = 0; k <= 6; k++) {
      const rod = `${k === 0 || k === 6 ? 'E' : 'R'}${k}${frame}`
      const at = (i: number): string => (i === 0 ? 'S0' : i === 6 ? 'S6' : `J${i}`)
      if (k === 0) list.push({ rod, support: 'S0', over: true }, { rod, support: 'J1', over: false })
      else if (k === 6) list.push({ rod, support: 'J5', over: false }, { rod, support: 'S6', over: true })
      else list.push({ rod, support: at(k - 1), over: true }, { rod, support: `J${k}`, over: false }, { rod, support: at(k + 1), over: true })
    }
  }
  return list
})()

/** The supports' axes: joists and seats, all along Z. */
export function supportOf(id: string): { xy: [number, number]; r: number; half: number } {
  if (id === 'S0') return { xy: SEAT_XY[0], r: SEAT_R, half: SEAT_HALF }
  if (id === 'S6') return { xy: SEAT_XY[1], r: SEAT_R, half: SEAT_HALF }
  const k = Number(id.slice(1))
  return { xy: JOIST_XY[k]!, r: POLE_R, half: JOIST_HALF }
}

// ---------------------------------------------------------------- the ground

/** the bank's level falls into the channel: |x| from the middle to its height. The seats stand back from the lip. */
export const BANK = { lip: 3.5, edge: 3.2, toe: 2.2, bed: -1.0, top: 0, water: -0.45, bottom: -1.25, halfX: 12, zMin: -12, zMax: 15 } as const
export function groundY(x: number, z: number): number {
  const ax = Math.abs(x)
  // the bank's edge wanders a little along the stream, least where the bridge stands
  const calm = 0.45 + 0.55 * Math.min(1, Math.max(0, (Math.abs(z) - 2.6) / 2))
  const wander = calm * (0.12 * Math.sin(z * 1.3 + (x > 0 ? 1.7 : 0.4)) + 0.06 * Math.sin(z * 3.1 + 0.8))
  const lip = BANK.lip + wander, edge = BANK.edge + wander * 0.8, toe = BANK.toe + wander * 0.6
  if (ax >= lip) return BANK.top - 0.015 * Math.sin(x * 2.1 + z * 1.7) * Math.min(1, (ax - lip) * 2)
  if (ax >= edge) { const s = (lip - ax) / (lip - edge); return BANK.top - 0.12 * s * s }
  if (ax >= toe) { const s = (edge - ax) / (edge - toe); return BANK.top - 0.12 - (BANK.top - 0.12 - BANK.bed) * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, s * 1.05))) }
  return BANK.bed + 0.03 * Math.sin(x * 1.9 + z * 0.7)
}

/** the stakes that hold each seat from the land side, between the rods' planes */
export const STAKES: V3[] = [-(JOIST_HALF - 0.05), 0, JOIST_HALF - 0.05].flatMap(z => [[SEAT_XY[0][0] - 0.24, 0, z] as V3, [SEAT_XY[1][0] + 0.24, 0, z] as V3])

// ---------------------------------------------------------------- the build (the order and the paths are ours)

/** Built from both banks at once toward the crown: each bank's feet first, its second bay, then the crown rods and the
 * crown joist close it. Each pile lies on its own bank. */
export const NEAR = ['R1A', 'R1B', 'J1', 'E0A', 'E0B', 'R2A', 'R2B', 'J2', 'R3A', 'R3B', 'J3'] as const
export const FAR = ['R5A', 'R5B', 'J5', 'E6A', 'E6B', 'R4A', 'R4B', 'J4'] as const

const ALL: Pole[] = (() => {
  const all: Pole[] = []
  for (const frame of ['A', 'B'] as const) for (let k = 0; k <= 6; k++) all.push(rodLine(k, frame))
  for (let k = 1; k <= 5; k++) all.push(joist(k))
  for (const p of all) dress(p)
  return all
})()
const byId = (id: string): Pole => ALL.find(p => p.id === id)!

/** a pole's sideways bend at s metres from end a (its local +Z) */
export function bowAt(p: Pole, s: number): number {
  const f = s / p.length
  return p.bow[0] * Math.sin(Math.PI * f) + p.bow[1] * Math.sin(2 * Math.PI * f)
}
/** a pole's girth at s round angle a: its taper, its knots, the bark left on a peeled pole */
export function girthAt(p: Pole, s: number, a: number): number {
  let r = radiusAt(p, s)
  for (const k of p.knots) {
    const c = Math.cos(a - k.ang)
    if (c > 0) r += k.amp * Math.exp(-(((s - k.s) / k.w) ** 2)) * c * c * c
  }
  if (p.peeled && inBand(p, s, a)) r += BARK
  return r
}
/** the ragged edge of a bark band, metres from its end, round angle a */
export function bandEdge(b: Band, a: number): number {
  return b.reach + 0.016 * Math.sin(3 * a + b.seed * 40) + 0.009 * Math.sin(7 * a + b.seed * 17) + 0.005 * Math.sin(13 * a + b.seed * 5)
}
/** how far a band's edge wanders either way */
export const BAND_RAG = 0.03
export function inBand(p: Pole, s: number, a: number): boolean {
  return p.bands.some(b => (b.end === 0 ? s : p.length - s) < bandEdge(b, a))
}

/** Each pole's own grown shape, decided once from its seed: a slight bend, knots with branch stubs on the outward
 * side, axe-cut ends, a peeled pole's bark left at its ends. Nothing grows where it bears or where it slides. */
function dress(p: Pole): void {
  const h = (k: number): number => hash(p.seed * 997, k)
  const L = p.length
  // the tip is the thin end: the stubs lean toward it
  const tipward = p.taper >= 0 ? 1 : -1
  const end = (e: 0 | 1): Facet[] => {
    const n = h(10 + e) < 0.55 ? 2 : 3, az0 = TAU * h(12 + e)
    return Array.from({ length: n }, (_, i) => ({
      az: az0 + (TAU * i) / n + 0.5 * (h(20 + e * 5 + i) - 0.5),
      tilt: 0.5 + 0.12 * h(30 + e * 5 + i),
      c: 0.004 + 0.016 * h(40 + e * 5 + i),
    }))
  }
  p.cuts = [end(0), end(1)]
  if (p.kind === 'joist') {
    // threaded in a-end first along the rods, so only its trailing end keeps its bark
    if (p.peeled) p.bands = [{ end: 1, reach: 0.12, seed: h(51) }]
    return
  }
  if (p.kind === 'strut') return
  p.bow = [(0.009 + 0.012 * h(1)) * (h(2) > 0.5 ? 1 : -1), 0.006 * (h(3) - 0.5)]
  // the free stretches: clear of every bearing by 0.4 m and of the ends by 0.35 m
  const free = (s: number): boolean => s > 0.35 && s < L - 0.35 && p.bears.every(b => Math.abs(s - b) > 0.4)
  const spots: number[] = []
  for (let i = 0; i < 40 && spots.length < 3; i++) {
    const s = 0.35 + (L - 0.7) * h(60 + i)
    if (free(s) && spots.every(o => Math.abs(o - s) > 0.32)) spots.push(s)
  }
  // an end rod is carried level under the joist before it, so its knots grow on its sides, not its back
  const side = p.kind === 'end' ? (h(69) > 0.5 ? 1 : -1) * Math.PI / 2 : 0
  spots.forEach((s, i) => {
    const ang = side + 0.45 * (h(70 + i) - 0.5)
    const stubbed = i < 2
    p.knots.push({ s, ang, amp: stubbed ? 0.011 + 0.006 * h(80 + i) : 0.007 + 0.004 * h(80 + i), w: 0.045 + 0.02 * h(90 + i) })
    if (stubbed) p.stubs.push({ s: s - tipward * 0.012, ang, lean: tipward * (0.5 + 0.25 * h(100 + i)), len: 0.035 + 0.04 * h(110 + i), r: 0.014 + 0.007 * h(120 + i) })
  })
  // a scar on a side, healed over
  for (let i = 0; i < 30; i++) {
    const s = 0.35 + (L - 0.7) * h(130 + i)
    if (free(s) && spots.every(o => Math.abs(o - s) > 0.2)) { p.knots.push({ s, ang: (h(140) > 0.5 ? 1 : -1) * (1.2 + 0.5 * h(141)), amp: 0.006, w: 0.05 }); break }
  }
  if (p.peeled) {
    // the drawknife stopped short of the ends that are not a foot
    const footA = Math.abs(Math.min(...p.bears) - FOOT_OVERHANG) < 0.01, footB = Math.abs(L - Math.max(...p.bears) - FOOT_OVERHANG) < 0.01
    if (!footA) p.bands.push({ end: 0, reach: 0.115, seed: h(150) })
    if (!footB) p.bands.push({ end: 1, reach: 0.115, seed: h(151) })
  }
}

/** where a stub's axis runs, in the pole's frame from its end a: out of the axis at s, leaning toward the tip */
export function stubAxis(p: Pole, st: Stub): { from: V3; dir: V3; t0: number; t1: number } {
  const out: V3 = [0, Math.cos(st.ang), Math.sin(st.ang)]
  const dir: V3 = [Math.sin(st.lean), out[1] * Math.cos(st.lean), out[2] * Math.cos(st.lean)]
  const r = radiusAt(p, st.s), c = Math.cos(st.lean)
  return { from: [st.s, 0, bowAt(p, st.s)], dir, t0: (0.45 * r) / c, t1: r / c + st.len }
}
/** where a tine's axis runs, in the pole's frame from its end a */
export function tineAxis(p: Pole, t: Tine): { from: V3; dir: V3 } {
  return { from: [p.length, 0, 0], dir: [Math.cos(t.spread), Math.sin(t.spread) * Math.cos(t.ang), Math.sin(t.spread) * Math.sin(t.ang)] }
}
/** how far a strut's stem runs past its crotch */
export const CROTCH_RUN = 0

/** A pole as capsules in its own frame (X along it, centred; Y its up; Z its side): its bent axis in segments with the
 * girth it has there, a ball at each knot, each stub and tine. The sweep proves the motion on these. */
export interface Capsule { a: V3; b: V3; ra: number; rb: number }
export function capsules(p: Pole): Capsule[] {
  const L = p.length, x0 = -L / 2, out: Capsule[] = []
  const at = (s: number): V3 => [x0 + s, 0, bowAt(p, s)]
  const run = p.kind === 'strut' ? CROTCH_RUN : 0
  const n = p.kind === 'joist' ? 2 : 8
  for (let i = 0; i < n; i++) {
    const s0 = ((L + run) * i) / n, s1 = ((L + run) * (i + 1)) / n
    out.push({ a: at(s0), b: at(Math.min(L, s1)), ra: radiusAt(p, s0), rb: radiusAt(p, Math.min(L, s1)) })
  }
  for (const b of p.bands) {
    const far = b.reach + 0.04, s0 = b.end === 0 ? 0 : L - far, s1 = b.end === 0 ? far : L
    out.push({ a: at(s0), b: at(s1), ra: radiusAt(p, s0) + BARK, rb: radiusAt(p, s1) + BARK })
  }
  if (run) out.push({ a: at(L), b: [x0 + L + run, 0, 0], ra: radiusAt(p, L), rb: radiusAt(p, L) })
  for (const k of p.knots) {
    const ball = 0.03, c = at(k.s), r = radiusAt(p, k.s) + k.amp - ball
    const q: V3 = [c[0], c[1] + r * Math.cos(k.ang), c[2] + r * Math.sin(k.ang)]
    out.push({ a: q, b: q, ra: ball, rb: ball })
  }
  for (const st of p.stubs) {
    const { from, dir, t0, t1 } = stubAxis(p, st)
    const A: V3 = [x0 + from[0] + dir[0] * t0, from[1] + dir[1] * t0, from[2] + dir[2] * t0]
    const B: V3 = [x0 + from[0] + dir[0] * t1, from[1] + dir[1] * t1, from[2] + dir[2] * t1]
    out.push({ a: A, b: B, ra: st.r, rb: st.r * 0.8 })
  }
  for (const t of p.tines) {
    const { from, dir } = tineAxis(p, t)
    const A: V3 = [x0 + from[0] - dir[0] * t.back, from[1] - dir[1] * t.back, from[2] - dir[2] * t.back]
    const B: V3 = [x0 + from[0] + dir[0] * t.len, from[1] + dir[1] * t.len, from[2] + dir[2] * t.len]
    out.push({ a: A, b: B, ra: t.r * TINE_TOUCH, rb: t.r * TINE_TOUCH })
  }
  return out
}

/** the struts: a forked pole under each rod's free end while it has nothing to rest on, raised from the stream and laid back
 * in it when the joist that carries that end is lashed. Four on each side: the first bay's hold the rods from the
 * seats until the second bay's joist takes their ends, the second bay's hold the rods to the crown until the crown
 * joist does. Each stands on its own bank's slope under the water and swings up and down inside its rod's plane.
 * The rod lies in the fork between its two tines, touching both. */
export const STRUT_R = 0.06
const TINE_SPREAD = 0.56
const TINE_R = 0.03
/** a tine's girth where the rod lies on it, as a share of its girth at the crotch */
export const TINE_TOUCH = 0.85
export interface Strut { id: string; frame: 'A' | 'B'; side: -1 | 1; bay: 1 | 2; rod: string; joist: string; foot: V3; fork: V3; length: number; lie: V3; lieZ: number; held: V3; touchAt: number }

/** a strut's place: the rod's axis held in its fork a hand's width short of the joist that will carry it, its foot on its
 * own bank's slope under the water; lying, it rests along the bed toward the stream's middle, beside its plane */
function strut(frame: 'A' | 'B', side: -1 | 1, bay: 1 | 2): Strut {
  const rodId = side < 0 ? `R${bay}${frame}` : `R${6 - bay}${frame}`
  const endJoist = side < 0 ? bay + 1 : 5 - bay
  const rod = byId(rodId)
  const d = norm2([rod.b[0] - rod.a[0], rod.b[1] - rod.a[1]])
  const j = JOIST_XY[endJoist]!
  const atJoist = (j[0] - rod.a[0]) * d[0] + (j[1] - rod.a[1]) * d[1]
  // a near rod's free end is its b end, a far rod's its a end
  const along = side < 0 ? atJoist - 0.3 : atJoist + 0.3
  const held: V3 = [rod.a[0] + d[0] * along, rod.a[1] + d[1] * along, rod.a[2] + bowAt(rod, along)]
  const fx = side * STRUT_FOOT
  // an outer plane's strut lies outside its plane, an inner plane's inside it, the far bank's a step further: all eight
  // lie apart on the bed
  const lieZ = held[2] + Math.sign(held[2]) * (ROD_PLANE[rod.k] === 0 ? 1 : -1) * (side < 0 ? 0.2 : 0.42)
  const foot: V3 = [fx, Math.max(groundY(fx, held[2]), groundY(fx, lieZ)) + 0.045, held[2]]
  // the crotch stands below the rod's axis so far that each tine, leaning out of the plane, touches the rod
  const u = norm2([held[0] - foot[0], held[1] - foot[1]])
  const sinPhi = Math.abs(u[0] * d[1] - u[1] * d[0])
  const sa = Math.sin(TINE_SPREAD), ca = Math.cos(TINE_SPREAD)
  const touch = radiusAt(rod, along) + TINE_R * TINE_TOUCH + 0.0015
  const h = (touch * Math.sqrt(ca * ca * sinPhi * sinPhi + sa * sa)) / (sa * sinPhi)
  const fork: V3 = [held[0] - u[0] * h, held[1] - u[1] * h, held[2]]
  // how far along a tine the rod touches it: the closest points of the tine's axis and the rod's
  const t3: V3 = [u[0] * ca, u[1] * ca, sa], d3: V3 = [d[0], d[1], 0], w0: V3 = [fork[0] - held[0], fork[1] - held[1], 0]
  const B = t3[0] * d3[0] + t3[1] * d3[1], Dd = t3[0] * w0[0] + t3[1] * w0[1], Ee = d3[0] * w0[0] + d3[1] * w0[1]
  const touchAt = (B * Ee - Dd) / (1 - B * B)
  const length = Math.hypot(fork[0] - foot[0], fork[1] - foot[1])
  // lying: its far end on the bed above its bumps, toward the middle
  const endY = BANK.bed + 0.035 + STRUT_R, dy = foot[1] - endY
  const lie: V3 = [foot[0] - side * Math.sqrt(length * length - dy * dy), endY, 0]
  return { id: `S${side < 0 ? 'N' : 'F'}${bay}${frame}`, frame, side, bay, rod: rodId, joist: `J${endJoist}`, foot, fork, length, lie, lieZ, held, touchAt }
}
/** the struts' feet stand this far out on each bank's slope, under the water */
export const STRUT_FOOT = 2.6

export const STRUTS: Strut[] = ([-1, 1] as const).flatMap(side => ([1, 2] as const).flatMap(bay => (['A', 'B'] as const).map(frame => strut(frame, side, bay))))

function strutPole(s: Strut): Pole {
  const seed = hash(s.side, s.bay, s.frame === 'A' ? 33 : 34)
  const p: Pole = {
    id: s.id, kind: 'strut', frame: s.frame, k: s.bay, a: s.foot, b: s.fork, length: s.length, r: STRUT_R, taper: 0.014,
    peeled: 0, tone: 0.86 + 0.18 * hash(s.side, s.bay, s.frame === 'A' ? 31 : 32), seed, bears: [s.length], ...bare(),
  }
  dress(p)
  const h = (k: number): number => hash(seed * 991, k)
  p.bow = [0.012 * (h(1) > 0.5 ? 1 : -1), 0]
  // the stem runs a little past the crotch, the two tines leave it there, out of the plane to either side
  // each tine runs a little past where the rod lies on it
  p.tines = [-1, 1].map((side, i) => ({ ang: (side * Math.PI) / 2, spread: TINE_SPREAD, len: s.touchAt + 0.05 + 0.03 * h(4 + i), r: TINE_R, back: 0.06 }))
  p.knots.push({ s: s.length * (0.45 + 0.2 * h(6)), ang: Math.PI * (h(7) > 0.5 ? 0.5 : -0.5), amp: 0.008, w: 0.05 })
  return p
}

/** every pole of the bridge, the near bank's in their order, then the far bank's, then the struts */
export const ORDER: string[] = [...NEAR, ...FAR]
export const POLES: Pole[] = [...ORDER.map(byId), ...STRUTS.map(strutPole)]

/** the piles: each bank's poles lie across its bank behind the seat, along Z, the first to be taken on top */
export const PILE_X = 5.75
export const PILE_PITCH = 0.28
export const PILE_AT: Record<string, V3> = (() => {
  const at: Record<string, V3> = {}
  // each layer nests in the one below, one pole fewer; the widest butt sets the layers' rise
  const rise = Math.sqrt((2 * (POLE_R + 0.0135)) ** 2 - (PILE_PITCH / 2) ** 2) + 0.004
  const stack = (ids: readonly string[], x0: number, per: number[]): void => {
    let i = 0
    // the bottom layer first: the last poles to be taken lie lowest
    const order = [...ids].reverse()
    per.forEach((count, layer) => {
      for (let c = 0; c < count && i < order.length; c++, i++) {
        const offset = (c - (count - 1) / 2) * PILE_PITCH
        at[order[i]!] = [x0 + offset, POLE_R + 0.0135 + 0.006 + layer * rise, 0]
      }
    })
  }
  stack(NEAR, -PILE_X, [5, 4, 3])
  stack(FAR, PILE_X, [4, 3, 2])
  return at
})()

// ---------------------------------------------------------------- the clock

export const PERIOD = 40
export const HOLD_END = 31
export const REWIND = 2.6

/** when each pole leaves its pile and how long its move takes, in seconds of the build clock (ours) */
export const SCHEDULE: Record<string, { start: number; move: number }> = (() => {
  const s: Record<string, { start: number; move: number }> = {}
  // each pair of rods leaves its pile a second apart, so the first has turned and gone before the second rises
  const near: [string, number, number][] = [
    ['R1A', 0.4, 3.3], ['R1B', 1.5, 3.3], ['J1', 4.0, 2.5], ['E0A', 5.0, 3.3], ['E0B', 6.1, 3.3],
    ['R2A', 7.5, 4.2], ['R2B', 8.6, 4.2], ['J2', 11.5, 2.5], ['R3A', 13.0, 4.25], ['R3B', 14.8, 4.25], ['J3', 17.4, 2.5],
  ]
  const far: [string, number, number][] = near.slice(0, 8).map(([id, start, move]) => [FAR[NEAR.indexOf(id as typeof NEAR[number])]!, start + 0.25, move])
  for (const [id, start, move] of [...near, ...far]) s[id] = { start, move }
  return s
})()

export function startOf(id: string): number { return SCHEDULE[id]!.start }
export function landOf(id: string): number { return SCHEDULE[id]!.start + SCHEDULE[id]!.move }

export const LASH_DELAY = 0.15, LASH_TIME = 0.9
/** when a crossing's lashing starts winding: both its poles stand */
export function lashStart(c: Crossing): number {
  const support = c.support.startsWith('S') ? 0 : landOf(c.support)
  return Math.max(landOf(c.rod), support) + LASH_DELAY
}
export function lashEnd(c: Crossing): number { return lashStart(c) + LASH_TIME }

/** a strut's day: it rises from the stream while its rod settles onto it, and goes back down once the joist that carries
 * the rod's free end is lashed to it */
export const STRUT_SWING = 1.0
export interface StrutTimes { up: number; down: number }
export const STRUT_TIMES: Record<string, StrutTimes> = Object.fromEntries(STRUTS.map(s => {
  const held = CROSSINGS.find(c => c.rod === s.rod && c.support === s.joist)!
  // it rises while its rod comes onto it: tipped down onto it (the first bay) or pushed along into its fork (the second)
  const up = landOf(s.rod) - STRUT_SWING
  return [s.id, { up, down: lashEnd(held) + 0.1 }]
}))

export const BUILT = Math.max(...CROSSINGS.map(lashEnd), ...Object.values(STRUT_TIMES).map(t => t.down + STRUT_SWING)) + 0.1

/** the build's own clock for a time in the cycle: forward, held, run back faster, then the pile */
export function buildClock(time: number): number {
  const t = ((time % PERIOD) + PERIOD) % PERIOD
  if (t < HOLD_END) return Math.min(t, BUILT)
  return Math.max(0, BUILT - (t - HOLD_END) * REWIND)
}
