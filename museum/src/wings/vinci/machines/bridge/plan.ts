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

/** the two frames' centre planes and the three planes of each: 2.9 m apart, a little past the card's guess, so the
 * crown stands over the feet as on the sheet (M2: 1.34 against the sketch's 1.29) */
export const FRAME_Z = 1.45
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
/** the bark's relief cut into a stem in its bark: a valley along each fissure of its surface's net, its half width round
 * the stem and its depth on a mean pole (each pole's own depth scales it, as its surface scales the fissures) */
export const VALLEY = { w: 0.011, depth: 0.006 } as const

/** a pole's radius at s metres from end a */
export function radiusAt(p: Pole, s: number): number {
  return p.r + p.taper * (0.5 - s / p.length)
}

/** a pole's centre of weight, metres from end a */
export function weightFromA(p: Pole): number {
  let m = 0, w = 0
  for (let i = 0; i <= 40; i++) { const t = (p.length * i) / 40, r = radiusAt(p, t); m += t * r * r; w += r * r }
  return m / w
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
  // each rod's butt at its bank end, where it is pushed from and stands: the pair that goes out together balances alike
  const taper = (0.019 + 0.012 * hash(k, frame === 'A' ? 5 : 6)) * (k <= 3 ? 1 : -1)
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

// ---------------------------------------------------------------- the build (the order, the paths and the means are ours)

/** Built from both banks at once toward the crown: each bank's first bay with its first joist riding on it, its end
 * rods, the crown rods, the second joists, the second bay, then the crown joist closes it. The crown rods and the crown
 * joist come from the near bank. */
export const NEAR = ['R1A', 'R1B', 'J1', 'E0A', 'E0B', 'R3A', 'R3B', 'J2', 'R2A', 'R2B', 'J3'] as const
export const FAR = ['R5A', 'R5B', 'J5', 'E6A', 'E6B', 'J4', 'R4A', 'R4B'] as const

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
    // the crown joist slides along its rods and over its forks: a clean stem
    if (p.k === 3) return
    // knots between the frames' inner planes, clear of them by 0.4 m and of where a fork holds a second joist; a kit's
    // joist keeps a branch cut short on its top, a second joist is rolled off its bank, so its knots stay flush
    const mid = L / 2, half = FRAME_Z - PLANE_STEP - 0.4, forks = p.k === 2 ? [0.45] : p.k === 4 ? [0.72] : []
    const clear = (s: number): boolean => Math.abs(s - mid) < half && forks.every(f => Math.abs(Math.abs(s - mid) - f) > 0.14)
    const kit = p.k === 1 || p.k === 5, spots: number[] = []
    for (let i = 0; i < 40 && spots.length < 2; i++) {
      const s = mid - half + 2 * half * h(60 + i)
      if (clear(s) && spots.every(o => Math.abs(o - s) > 0.3)) spots.push(s)
    }
    spots.forEach((s, i) => {
      const stubbed = kit && i === 0
      const ang = stubbed ? 0.4 * (h(70 + i) - 0.5) : (h(72 + i) > 0.5 ? 1 : -1) * (1.3 + 0.3 * h(74 + i))
      p.knots.push({ s, ang, amp: stubbed ? 0.016 : 0.006, w: 0.06 })
      if (stubbed) p.stubs.push({ s, ang, lean: (h(76) > 0.5 ? 1 : -1) * 0.6, len: 0.03 + 0.02 * h(77), r: 0.014 })
    })
    return
  }
  if (p.kind === 'strut') return
  p.bow = [(0.018 + 0.02 * h(1)) * (h(2) > 0.5 ? 1 : -1), 0.012 * (h(3) - 0.5)]
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
    p.knots.push({ s, ang, amp: stubbed ? 0.015 + 0.007 * h(80 + i) : 0.008 + 0.004 * h(80 + i), w: 0.055 + 0.02 * h(90 + i) })
    if (stubbed) p.stubs.push({ s: s - tipward * 0.012, ang, lean: tipward * (0.55 + 0.25 * h(100 + i)), len: 0.025 + 0.035 * h(110 + i), r: 0.013 + 0.006 * h(120 + i) })
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

// ---------------------------------------------------------------- the yard, the joist pile, the stream

/** a floating pole's axis lies this far under the stream's level */
export const WATER_AXIS = BANK.water - 0.02
/** THE KIT. Each bank's first bay is lashed together on the bank before it goes out: its two first rods, its two end
 * rods under the first joist and the first joist across them all. It goes out over the seat and is raised as one; its
 * own lashings are on from the start and move with it. */
export const KITS: Record<string, string[]> = { R1A: ['R1B', 'E0A', 'E0B', 'J1'], R5A: ['R5B', 'E6A', 'E6B', 'J5'] }
/** the kit a pole belongs to, by its leading rod */
export const kitOf = (id: string): string | null => (KITS[id] ? id : Object.keys(KITS).find(k => KITS[k]!.includes(id)) ?? null)
/** where each rod lies on its bank before it goes: the plane it lies in and how far out from the middle its bank end
 * lies. The kit lies across its seat with its foot on the bank; the other rods lie on the bank behind it, clear of the
 * kit's joist, the crown rods between the frames, the rest in their own planes. */
export const KIT_FOOT = 5.95
export const STOCK_FOOT = 8.22
export const YARD: Record<string, { z: number; foot: number }> = Object.fromEntries(ALL.filter(p => p.kind === 'rod' && !kitOf(p.id) || KITS[p.id]).map(p => {
  const crown = p.k === 3
  return [p.id, { z: crown ? (p.frame === 'A' ? -0.4 : 0.4) : p.a[2], foot: KITS[p.id] ? KIT_FOOT : STOCK_FOOT }]
}))
/** the joists that go by water lie on the banks up the stream, behind the bridge, one on each bank; the crown joist
 * waits on two logs on the far bank behind the bridge, back from its edge */
export const JOIST_PILE: Record<string, [number, number]> = { J2: [-4.6, -8.9], J3: [5.8, -4.7], J4: [4.6, -9.0] }
/** where a joist that goes by water waits, floating behind the bridge */
export const JOIST_WAIT_Z: Record<string, number> = { J2: -5.0, J4: -5.0 }
/** the crown joist is raised from its two logs on the bank this far up the stream, then threaded in toward the
 * visitor's side */
export const THREAD_Z = -4.7
/** the crown joist's logs: across the bank under it, x and z of their middles, their half length */
export const J3_LOGS: [number, number, number][] = [[5.8, -3.7, 0.5], [5.8, -5.7, 0.5]]
export const J3_REST = SEAT_XY[0][1] + SEAT_R + 0.075
/** the bank each pole comes from (the crown's from the near bank) and its end there: a near rod's end a, a far rod's end b */
export const sideOf = (p: Pole): -1 | 1 => (p.k === 3 || (p.a[0] + p.b[0]) / 2 < 0 ? -1 : 1)
export const footEnd = (p: Pole): 0 | 1 => (sideOf(p) < 0 ? 0 : 1)

// ---------------------------------------------------------------- the props

/** THE PROPS. A forked pole stands under each pole while it is raised and until what it comes to rest on is lashed: its
 * fork holds one point of its load, the load lying across the fork between its two tines and touching both; its foot
 * stands on the bank, its slope or the stream's bed and slides there, in under the load as the prop raises it and out
 * again as it is laid back down. Laid down, it lies on the bed. */
export const STRUT_R = 0.06
/** a prop's axis over the ground where its foot stands: the height a ball of the foot's girth rests at, the ground
 * sampled under it, since the bank's profile has creases a slope taken at one point misreads */
export function footHeight(x: number, z: number): number {
  const R = STRUT_R + 0.014
  let h = groundY(x, z) + R
  for (const f of [0.45, 0.7, 0.9]) {
    const lift = R * Math.sqrt(1 - f * f)
    for (let k = 0; k < 8; k++) {
      const a = (k * TAU) / 8
      h = Math.max(h, groundY(x + R * f * Math.cos(a), z + R * f * Math.sin(a)) + lift)
    }
  }
  return h
}
export const TINE_SPREAD = 0.56
export const TINE_R = 0.03
/** a tine's girth where the load lies on it, as a share of its girth at the crotch */
export const TINE_TOUCH = 0.85
/** from a load's axis to the crotch, along the prop, when prop and load meet at the angle phi and each tine touches it */
export function crotchDepth(rLoad: number, phi: number): number {
  const touch = rLoad + TINE_R * TINE_TOUCH + 0.008
  const sa = Math.sin(TINE_SPREAD), ca = Math.cos(TINE_SPREAD), sp = Math.max(0.25, Math.abs(Math.sin(phi)))
  return (touch * Math.sqrt(ca * ca * sp * sp + sa * sa)) / (sa * sp)
}
/** how far along a tine the load touches it */
export function touchAlong(rLoad: number, phi: number): number {
  const ca = Math.cos(TINE_SPREAD), c = Math.cos(phi), s = Math.sin(phi)
  return (crotchDepth(rLoad, phi) * ca * s * s) / (1 - ca * ca * c * c)
}
export interface Prop {
  id: string
  /** the pole it carries, and where: metres from that pole's end a */
  load: string
  s: number
  /** the level way from its head to its foot */
  away: [number, number]
  /** its angle above the level where it holds its load still */
  angle: number
  length: number
  frame: 'A' | 'B' | null
  /** its foot and crotch where it holds its load still */
  foot: V3
  crotch: V3
  /** its load slid along its fork to a second hold, metres from end a, between two times */
  slide?: { s: number; at: Step }
}

const mapPt = (c: [number, number], d: number, q: [number, number]): [number, number] => {
  const x = q[0] - c[0], y = q[1] - c[1], cs = Math.cos(d), sn = Math.sin(d)
  return [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs]
}
/** a second-bay rod laid on its first joist with its far end floating: the turn about the joist that brings it there */
export function floatTurn(p: Pole): number {
  const side = sideOf(p), j = JOIST_XY[side < 0 ? 1 : 5]!
  const far: [number, number] = footEnd(p) === 0 ? [p.b[0], p.b[1]] : [p.a[0], p.a[1]]
  let lo = 0, hi = 1.5
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2
    if (mapPt(j, side * m, far)[1] > WATER_AXIS) lo = m; else hi = m
  }
  return side * (lo + hi) / 2
}

/** the point at s of a pole lying on its own line from a to b (its bend left out) */
const along = (p: Pole, a: V3, b: V3, s: number): V3 => {
  const f = s / p.length
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}
/** a prop's stance under a still load: its length chosen so it stands at its angle there with its foot on the ground */
function stance(load: Pole, a: V3, b: V3, s: number, away: [number, number], angle: number): { length: number; foot: V3; crotch: V3 } {
  const P = along(load, a, b, s)
  const D = (() => { const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const l = Math.hypot(...d); return [d[0] / l, d[1] / l, d[2] / l] as V3 })()
  const u: V3 = [-away[0] * Math.cos(angle), Math.sin(angle), -away[1] * Math.cos(angle)]
  const phi = Math.acos(Math.min(1, Math.abs(u[0] * D[0] + u[1] * D[1] + u[2] * D[2])))
  const h = crotchDepth(radiusAt(load, s), phi)
  let reach = 2
  for (let i = 0; i < 8; i++) {
    const f: V3 = [P[0] - u[0] * reach, P[1] - u[1] * reach, P[2] - u[2] * reach]
    reach = (P[1] - footHeight(f[0], f[2])) / Math.sin(angle)
  }
  const crotch: V3 = [P[0] - u[0] * h, P[1] - u[1] * h, P[2] - u[2] * h]
  const foot: V3 = [P[0] - u[0] * reach, P[1] - u[1] * reach, P[2] - u[2] * reach]
  return { length: reach - h, foot, crotch }
}

// ---------------------------------------------------------------- the moves

export type Step = readonly [number, number]
/** a pole's moves, seconds of the build clock (ours): pushed out of its yard, tipped over the seat, slid on, floated
 * along the stream and across it, its bank end set on a joist, rolled off the bank, raised, threaded */
export interface Moves { push?: Step; tip?: Step; slide?: Step; float?: Step; drift?: Step; foot?: Step; roll?: Step; lift?: Step; thread?: Step }
/** the near bank's; the far bank's start a quarter second later. Each kit goes out on its first rod. The second rods go
 * up one bank after the other, so the one never crosses the other on its way. */
const NEAR_MOVES: Record<string, Moves> = {
  R1: { push: [0.3, 1.1], tip: [1.1, 1.55], slide: [1.55, 2.3], lift: [2.9, 4.6] },
  R3: { push: [2.7, 4.6], tip: [4.6, 5.05], slide: [5.05, 6.4], float: [6.4, 6.9], drift: [6.9, 7.6], lift: [7.9, 9.4] },
  J2: { roll: [3.0, 4.6], float: [4.6, 6.5], drift: [8.4, 9.2], lift: [9.4, 11.0] },
  R2: { push: [11.9, 13.5], tip: [13.5, 13.95], slide: [13.95, 15.2], float: [15.2, 15.6], foot: [15.6, 16.6], lift: [17.1, 18.4] },
  R4: { push: [12.15, 13.75], tip: [13.75, 14.2], slide: [14.2, 15.45], float: [15.45, 15.85], foot: [18.4, 19.4], lift: [19.9, 21.2] },
  J3: { lift: [19.2, 21.2], thread: [21.3, 22.5] },
}
export const FAR_LAG = 0.25
const TWIN: Record<string, string> = { R5: 'R1', J4: 'J2' }
const shift = (m: Moves, by: number): Moves => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [v[0] + by, v[1] + by]])) as Moves
const MOVES_OF = (id: string): Moves => { const key = id.replace(/[AB]$/, ''); return NEAR_MOVES[key] ?? shift(NEAR_MOVES[TWIN[key]!]!, FAR_LAG) }

export const PROPS: Prop[] = (() => {
  const list: Prop[] = []
  const add = (id: string, load: string, s: number, away: [number, number], angle: number, where: 'placed' | 'floatTurn' | 'thread' = 'placed'): void => {
    const p = byId(load)
    let a = p.a, b = p.b
    if (where === 'floatTurn') {
      const side = sideOf(p), j = JOIST_XY[side < 0 ? 1 : 5]!, d = floatTurn(p)
      const A = mapPt(j, d, [p.a[0], p.a[1]]), B = mapPt(j, d, [p.b[0], p.b[1]])
      a = [A[0], A[1], p.a[2]]; b = [B[0], B[1], p.b[2]]
    } else if (where === 'thread') {
      a = [p.a[0], p.a[1], p.a[2] + THREAD_Z]; b = [p.b[0], p.b[1], p.b[2] + THREAD_Z]
    }
    const st = stance(p, a, b, s, away, angle)
    list.push({ id, load, s, away, angle, length: st.length, frame: p.frame, foot: st.foot, crotch: st.crotch })
  }
  // a fork holds a stretch of bare wood: the requested place nudged clear of the load's stubs and knots
  const fromFoot = (p: Pole, d: number): number => {
    const s = footEnd(p) === 0 ? d : p.length - d
    for (let k = 0; k <= 30; k++) for (const sign of [1, -1]) {
      const t = s + sign * k * 0.02
      if (p.stubs.every(st => Math.abs(st.s - t) >= 0.12) && p.knots.every(kn => Math.abs(kn.s - t) >= 0.08)) return t
    }
    return s
  }
  // a fork that holds a pole balanced holds it at its centre of weight, the nearest bare wood within a few centimetres
  const balance = (p: Pole): number => {
    const c = weightFromA(p)
    for (let k = 0; k <= 5; k++) for (const sign of [1, -1]) {
      const t = c + sign * k * 0.015
      if (p.stubs.every(st => Math.abs(st.s - t) >= 0.12) && p.knots.every(kn => Math.abs(kn.s - t) >= 0.08)) return t
    }
    return c
  }
  for (const frame of ['A', 'B'] as const) {
    const out: [number, number] = [0, frame === 'A' ? -1 : 1]
    // each kit stands on a prop under each first rod; the near one leans flatter, clear of the second rod pushed out under it
    for (const [k, s, angle] of [[1, 3.17, 1.22], [5, 2.95, 1.0]] as const) { const p = byId(`R${k}${frame}`); add(`F${p.id}`, p.id, fromFoot(p, s), out, angle) }
    // a crown rod is raised level on one fork under its centre of weight
    const r3 = byId(`R3${frame}`)
    add(`FR3${frame}`, r3.id, balance(r3), out, 1.19)
    // a second rod's one prop: under its bank end while that goes onto its first joist, then the rod slides along the
    // fork until the prop stands beyond its centre of weight, and it is raised
    for (const [k, first, then] of [[2, 1.1, 2.2], [4, 1.7, 2.62]] as const) {
      const p = byId(`R${k}${frame}`), m = MOVES_OF(p.id)
      add(`F${p.id}`, p.id, fromFoot(p, then), out, 1.22)
      const last = list[list.length - 1]!
      list[list.length - 1] = { ...last, s: fromFoot(p, first), slide: { s: fromFoot(p, then), at: [m.foot![1] + 0.05, m.lift![0] - 0.05] } }
    }
  }
  // a second joist is raised out of the stream on two forks between the frames, the far one's either side of the near one's
  for (const [k, off, x] of [[2, 0.45, 1], [4, 0.72, -1]] as const) {
    add(`FJ${k}`, `J${k}`, JOIST_HALF - off, [x, 0], 1.15)
    add(`GJ${k}`, `J${k}`, JOIST_HALF + off, [x, 0], 1.15)
  }
  // the crown joist's props stand on the bank behind it and walk it out over the stream; threaded in, it lies on both
  // props, then on the near one and the far frame's crown rod, then on that rod held down by the rods over it
  add('FJ3', 'J3', JOIST_HALF + (-3.4 - THREAD_Z), [1, 0], 1.15, 'thread')
  add('GJ3', 'J3', JOIST_HALF + (-4.9 - THREAD_Z), [1, 0], 1.15, 'thread')
  return list
})()

function propPole(s: Prop): Pole {
  const seed = hash(s.s * 7, s.length * 3, s.away[0] + 2 * s.away[1], s.id.charCodeAt(1), s.id.charCodeAt(2))
  const p: Pole = {
    id: s.id, kind: 'strut', frame: s.frame, k: 0, a: s.foot, b: s.crotch, length: s.length, r: STRUT_R, taper: 0.014,
    peeled: 0, tone: 0.86 + 0.18 * hash(seed, 31), seed, bears: [s.length], ...bare(),
  }
  dress(p)
  const h = (k: number): number => hash(seed * 991, k)
  p.bow = [0.012 * (h(1) > 0.5 ? 1 : -1), 0]
  // each tine runs a little past where the load lies on it at its widest
  const reach = touchAlong(POLE_R + 0.012, Math.PI / 2)
  p.tines = [-1, 1].map((side, i) => ({ ang: (side * Math.PI) / 2, spread: TINE_SPREAD, len: reach + 0.05 + 0.03 * h(4 + i), r: TINE_R, back: 0.06 }))
  p.knots.push({ s: s.length * (0.45 + 0.2 * h(6)), ang: Math.PI * (h(7) > 0.5 ? 0.5 : -0.5), amp: 0.008, w: 0.05 })
  return p
}

/** every pole of the bridge, the near bank's in their order, then the far bank's, then the props */
export const ORDER: string[] = [...NEAR, ...FAR]
export const POLES: Pole[] = [...ORDER.map(byId), ...PROPS.map(propPole)]

// ---------------------------------------------------------------- the clock

export const PERIOD = 40
export const HOLD_END = 31
export const REWIND = 2.8

/** which pole a kit's member rides on: its leading rod */
export const RIDES: Record<string, string> = Object.fromEntries(Object.entries(KITS).flatMap(([lead, members]) => members.map(m => [m, lead])))
export const MOVES: Record<string, Moves> = Object.fromEntries(ORDER.filter(id => !RIDES[id]).map(id => {
  return [id, MOVES_OF(id)]
}))
/** a pole's moves, a kit's member by its leading rod's */
export const movesOf = (id: string): Moves => MOVES[RIDES[id] ?? id]!
/** when a pole comes to rest in its place */
export function landOf(id: string): number {
  const m = movesOf(id)
  return (m.thread ?? m.lift)![1]
}

export const LASH_DELAY = 0.15, LASH_TIME = 0.9
/** a kit's own lashings were wound on the bank before the clock starts */
export const KIT_LASHED = -2
export const inKit = (c: Crossing): boolean => kitOf(c.rod) !== null && kitOf(c.rod) === kitOf(c.support)
/** when a crossing's lashing starts winding: both its poles stand */
export function lashStart(c: Crossing): number {
  if (inKit(c)) return KIT_LASHED
  const support = c.support.startsWith('S') ? 0 : landOf(c.support)
  return Math.max(landOf(c.rod), support) + LASH_DELAY
}
export function lashEnd(c: Crossing): number { return lashStart(c) + LASH_TIME }

/** a prop's day: it slides in along the bed from where it lies up or down the stream, rises to meet its load as the
 * load's raising starts and holds it. The props go out in two moves: the kits' and the crown rods' together once the
 * second joists under them are lashed (they are slid away), the rest together once the last lashing is wound (they lie
 * where they are laid); the crown joist's let go as it slides off them. */
export const PROP_RISE = 0.6, PROP_DOWN = 1.0, PARK_SLIDE = 1.2
/** idle props lie with their heads at least this far up the stream from the bridge's middle, or down it */
export const PARK_UP = 5.6, PARK_DOWN = 6.8
export interface PropTimes { rise: Step; release: number; down: Step; parkIn?: Step; parkOut?: Step }
/** props that stand in a plane across the bridge: idle up or down the stream */
const across = (s: Prop): boolean => Math.abs(s.away[1]) > 0.5
/** the first move's props: those under the kits and the crown rods */
const firstOut = (s: Prop): boolean => kitOf(s.load) !== null || byId(s.load).k === 3 && byId(s.load).kind === 'rod'
export const parksBefore = (s: Prop): boolean => across(s)
export const parksAfter = (s: Prop): boolean => across(s) && firstOut(s)
/** the last move's props are laid down outward, swung over the foot away from the bridge; the first move's go back
 * down the way their loads came up, under the bridge, and are slid away along the bed, as the crown joist's are laid */
export const laysOutward = (s: Prop): boolean => across(s) && !firstOut(s) && s.load !== 'J3'
/** the crown joist slides off its props as it is threaded: each lets go while its trailing end is still 0.3 m short
 * of the fork (the thread runs on the motion's smootherstep, inverted here) */
function threadRelease(s: Prop, load: Pole, thread: Step): number {
  const ease = (x: number): number => x * x * x * (x * (x * 6 - 15) + 10)
  // the way it is threaded, and its trailing end's place when raised
  const way = -Math.sign(THREAD_Z), holdZ = load.a[2] + THREAD_Z + s.s
  const need = 1 - (holdZ - way * 0.3 + way * JOIST_HALF) / THREAD_Z
  if (need >= 1) return thread[1]
  let lo = 0, hi = 1
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (ease(mid) < need) lo = mid; else hi = mid }
  return thread[0] + (thread[1] - thread[0]) * lo
}
/** the first move: the kits' rods and the crown rods lashed onto the second joists */
const FIRST_OUT = Math.max(...CROSSINGS.filter(c => (c.support === 'J2' || c.support === 'J4') && c.over && (kitOf(c.rod) || c.rod.startsWith('R3'))).map(lashEnd))
/** the last: every lashing wound */
const LAST_OUT = Math.max(...CROSSINGS.map(lashEnd))
export const PROP_TIMES: Record<string, PropTimes> = Object.fromEntries(PROPS.map(s => {
  const load = byId(s.load), m = movesOf(s.load)
  const second = load.kind === 'rod' && (load.k === 2 || load.k === 4)
  const start = second ? m.foot![0] : m.lift![0]
  const release = load.id === 'J3' ? threadRelease(s, load, m.thread!) : firstOut(s) ? FIRST_OUT : LAST_OUT
  const rise: Step = [start - PROP_RISE, start], down: Step = [release + 0.05, release + 0.05 + PROP_DOWN]
  return [s.id, {
    rise, release, down,
    ...(parksBefore(s) ? { parkIn: [rise[0] - PARK_SLIDE, rise[0]] as Step } : {}),
    ...(parksAfter(s) ? { parkOut: [down[1], down[1] + PARK_SLIDE] as Step } : {}),
  }]
}))

export const BUILT = Math.max(...CROSSINGS.map(lashEnd), ...Object.values(PROP_TIMES).map(t => (t.parkOut ?? t.down)[1])) + 0.1

/** the build's own clock for a time in the cycle: forward, held, run back faster, then the yard */
export function buildClock(time: number): number {
  const t = ((time % PERIOD) + PERIOD) % PERIOD
  if (t < HOLD_END) return Math.min(t, BUILT)
  return Math.max(0, BUILT - (t - HOLD_END) * REWIND)
}
