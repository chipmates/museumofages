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
 * Frame: metres, +Y up, +X along the span (the assembly runs from the -X
 * bank to the +X bank), +Z toward the viewer's side; origin on the bank's
 * level midway between the feet.
 */

export type V3 = [number, number, number]
export const TAU = Math.PI * 2

/** rods and joists, 0.15 m across at the middle */
export const POLE_R = 0.075
export const SEAT_R = 0.12
/** a rod's axis to a joist's axis where they touch */
export const E = POLE_R * 2
export const SPAN = 10
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

/** the joists' axes in the span's plane, 0 and 6 the feet */
export const JOIST_XY: [number, number][] = Array.from({ length: PANELS + 1 }, (_, k) => {
  const phi = (k - 3) * TURN
  return [RADIUS * Math.sin(phi), RADIUS * Math.cos(phi) - RADIUS * Math.cos(3 * TURN)]
})

/** the two frames' centre planes and the three planes of each */
export const FRAME_Z = 1.1
export const PLANE_STEP = 0.27
/** plane 0 outer, 1 centre, 2 inner; frame A at -Z, B at +Z, mirrored */
export function planeZ(frame: 'A' | 'B', plane: number): number {
  const s = frame === 'A' ? -1 : 1
  return s * (FRAME_Z + (1 - plane) * PLANE_STEP)
}
/** which plane each rod stands on: three rods at each joist, three planes; the crown rod in the centre */
export const ROD_PLANE: Record<number, number> = { 0: 1, 1: 0, 2: 2, 3: 1, 4: 0, 5: 2, 6: 1 }

export const JOIST_HALF = 1.7
export const SEAT_HALF = 1.8
/** how far a rod runs past the joist it rests on */
export const OVERHANG = 0.3
/** at a foot the rod rests in a scrape in the bank: shorter past the seat */
export const FOOT_OVERHANG = 0.16
export const ROPE_R = 0.008
export const TURNS = 3

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

const sub2 = (a: [number, number], b: [number, number]): [number, number] => [a[0] - b[0], a[1] - b[1]]
const norm2 = (a: [number, number]): [number, number] => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l] }

/** the outward normal of the chord from joist i to joist j */
function chordFrame(i: number, j: number): { d: [number, number]; n: [number, number] } {
  const d = norm2(sub2(JOIST_XY[j]!, JOIST_XY[i]!))
  return { d, n: [-d[1], d[0]] }
}

/** The bank seats: logs bedded across each foot, set in so a rod resting on one stands as on a joist. */
export const SEAT_XY: [[number, number], [number, number]] = (() => {
  const f1 = chordFrame(0, 2), f5 = chordFrame(4, 6)
  const shift = SEAT_R + POLE_R - E
  const p0 = JOIST_XY[0]!, p6 = JOIST_XY[6]!
  return [[p0[0] - shift * f1.n[0], p0[1] - shift * f1.n[1]], [p6[0] - shift * f5.n[0], p6[1] - shift * f5.n[1]]]
})()

export type PoleKind = 'rod' | 'end' | 'joist'
export interface Pole {
  id: string
  kind: PoleKind
  frame: 'A' | 'B' | null
  /** rods: their index 0 to 6 (0 and 6 the end rods); joists: 1 to 5 */
  k: number
  /** the axis in place, from a to b */
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
}

/** a pole's radius at s metres from end a */
export function radiusAt(p: Pole, s: number): number {
  return p.r + p.taper * (0.5 - s / p.length)
}

/** the few poles peeled with a drawknife; the rest keep their bark */
const PEELED = new Set(['1B', '4A', 'J2', '6B'])

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
  const support = (i: number): { xy: [number, number]; r: number } => i === 0 ? { xy: SEAT_XY[0], r: SEAT_R } : i === 6 ? { xy: SEAT_XY[1], r: SEAT_R } : { xy: JOIST_XY[i]!, r: POLE_R }
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
  return {
    id: `${kind === 'end' ? 'E' : 'R'}${k}${frame}`, kind, frame, k, a, b, length, r: POLE_R, taper,
    peeled: PEELED.has(`${k}${frame}`) ? 1 : 0, tone: 0.9 + 0.2 * hash(k, frame === 'A' ? 13 : 14), seed,
  }
}

function joist(k: number): Pole {
  const [x, y] = JOIST_XY[k]!
  return {
    id: `J${k}`, kind: 'joist', frame: null, k, a: [x, y, -JOIST_HALF], b: [x, y, JOIST_HALF], length: 2 * JOIST_HALF,
    r: POLE_R, taper: 0, peeled: PEELED.has(`J${k}`) ? 1 : 0, tone: 0.88 + 0.2 * hash(k, 23), seed: hash(k, 25),
  }
}

/** The order of placing (ours): from the near bank to the far one, each frame's rod in turn, the joist threaded
 * between the rods as soon as the rod over it and the rod under it stand. */
export const ORDER: string[] = [
  'E0A', 'E0B', 'R1A', 'R1B', 'J1', 'R2A', 'R2B', 'J2', 'R3A', 'R3B', 'J3', 'R4A', 'R4B', 'J4', 'R5A', 'R5B', 'J5', 'E6A', 'E6B',
]

export const POLES: Pole[] = (() => {
  const all: Pole[] = []
  for (const frame of ['A', 'B'] as const) for (let k = 0; k <= 6; k++) all.push(rodLine(k, frame))
  for (let k = 1; k <= 5; k++) all.push(joist(k))
  return ORDER.map(id => all.find(p => p.id === id)!)
})()

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

/** the bank's level falls into the channel: |x| from the middle to its height */
export const BANK = { lip: 4.45, edge: 4.1, toe: 3.05, bed: -1.0, top: 0, water: -0.45, bottom: -1.25, halfX: 12, zMin: -6, zMax: 15 } as const
export function groundY(x: number, z: number): number {
  const ax = Math.abs(x)
  // the bank's edge wanders a little along the stream
  const wander = 0.12 * Math.sin(z * 1.3 + (x > 0 ? 1.7 : 0.4)) + 0.06 * Math.sin(z * 3.1 + 0.8)
  const lip = BANK.lip + wander, edge = BANK.edge + wander * 0.8, toe = BANK.toe + wander * 0.6
  if (ax >= lip) return BANK.top - 0.015 * Math.sin(x * 2.1 + z * 1.7) * Math.min(1, (ax - lip) * 2)
  if (ax >= edge) { const s = (lip - ax) / (lip - edge); return BANK.top - 0.12 * s * s }
  if (ax >= toe) { const s = (edge - ax) / (edge - toe); return BANK.top - 0.12 - (BANK.top - 0.12 - BANK.bed) * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, s * 1.05))) }
  return BANK.bed + 0.03 * Math.sin(x * 1.9 + z * 0.7)
}

/** the pile on the near bank: two sleepers along X, the poles across them along Z, three layers */
export const PILE = { x: -6.75, sleeperZ: 1.45, sleeperR: 0.06, pitch: 0.17 } as const
/** where each pole lies in the pile, the first placed on top */
export const PILE_AT: Record<string, V3> = (() => {
  const at: Record<string, V3> = {}
  const base = 2 * PILE.sleeperR - 0.02 + POLE_R + 0.008
  const layers: [number, number][] = [[6, base + 2 * PILE.pitch * Math.sin(Math.PI / 3)], [6, base + PILE.pitch * Math.sin(Math.PI / 3)], [7, base]]
  let i = 0
  layers.forEach(([count, y], layer) => {
    for (let c = 0; c < count; c++, i++) {
      const offset = (c - (count - 1) / 2) * PILE.pitch
      at[ORDER[i]!] = [PILE.x + offset, y + 0.004 * layer, 0]
    }
  })
  return at
})()

/** the stakes that hold each seat from the land side */
export const STAKES: V3[] = [-1.3, 0, 1.3].flatMap(z => [[SEAT_XY[0][0] - 0.25, 0, z] as V3, [SEAT_XY[1][0] + 0.25, 0, z] as V3])

// ---------------------------------------------------------------- the motion

/** one cycle: the pile, the poles set one by one, the bridge whole, then back to the pile */
export const FIRST = 0.6
export const STEP = 1.0
export const LIFT = 0.35, FLY = 1.5, SETTLE = 0.6
export const MOVE = LIFT + FLY + SETTLE
export const LASH_DELAY = 0.15, LASH_TIME = 0.9
export const BUILT = FIRST + (ORDER.length - 1) * STEP + MOVE + LASH_DELAY + LASH_TIME + 0.1
export const HOLD_END = 31
export const REWIND = 2.5
export const PERIOD = 40

/** the build's own clock for a time in the cycle: forward, held, run back faster, then the pile */
export function buildClock(time: number): number {
  const t = ((time % PERIOD) + PERIOD) % PERIOD
  if (t < HOLD_END) return Math.min(t, BUILT)
  return Math.max(0, BUILT - (t - HOLD_END) * REWIND)
}

export function startOf(id: string): number { return FIRST + ORDER.indexOf(id) * STEP }
export function landOf(id: string): number { return startOf(id) + MOVE }
/** when a crossing's lashing starts winding: both its poles stand */
export function lashStart(c: Crossing): number {
  const support = c.support.startsWith('S') ? 0 : landOf(c.support)
  return Math.max(landOf(c.rod), support) + LASH_DELAY
}
