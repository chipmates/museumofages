/** THE FLYING MACHINE'S NUMBERS AND ITS ONE BEAT, after Manuscript B 74v.
 *
 * 74v gives no size. Every length here is the museum's, scaled from a man of
 * 1.70 m lying face down in the body; the span is 20 braccia (88v's test wing),
 * chosen, not read. Frame: metres, +Y up, +Z toward the head end, +X the
 * machine's left, origin on the floor under the pivot M.
 *
 * Pure numbers: the builder, the checks and the bench all read this module.
 */

export const BRACCIO = 0.5836
const DEG = Math.PI / 180

/** The pivot M on the half-hoop's crown. Its pin leans forward and down, so
 * a wing turning down about it also swings back toward the feet (74v). */
export const PIN = { y: 2.2, tilt: 18 * DEG, half: 0.12, radius: 0.011 } as const
/** the pin's axis, a unit vector: forward and down */
export const AXIS: readonly [number, number, number] = [0, -Math.sin(PIN.tilt), Math.cos(PIN.tilt)]
/** each spar's hub rides on the pin this far fore (left wing) or aft (right) */
export const HUB = { offset: 0.047, radius: 0.066, thick: 0.074 } as const

export const BODY = {
  head: 0.45, foot: -1.8,
  /** half widths of the top rails, head and foot: the trough narrows hard to
   * the feet, as 74v draws it */
  headHalf: 0.36, footHalf: 0.1,
  topY: 1.42,
} as const
export interface Rail { side: 1 | -1; level: 'top' | 'mid' | 'bottom' }
/** a rail's centre at a given z along the body */
export function railAt(rail: Rail, z: number): [number, number, number] {
  const f = (BODY.head - z) / (BODY.head - BODY.foot)
  const half = BODY.headHalf + (BODY.footHalf - BODY.headHalf) * f
  const inset = rail.level === 'bottom' ? 0.86 : 1
  // shallower toward the feet: 0.30 deep at the head, 0.10 at the foot
  const y = rail.level === 'top' ? BODY.topY
    : rail.level === 'mid' ? 1.27 + (1.37 - 1.27) * f
      : 1.12 + (1.32 - 1.12) * f
  return [rail.side * half * inset, y, z]
}
export const RAILS: readonly Rail[] = ([1, -1] as const).flatMap(side =>
  (['top', 'mid', 'bottom'] as const).map(level => ({ side, level })))
/** a bundle of three canes: radius at the head and at the foot */
export const RAIL_R = { head: 0.023, foot: 0.016 } as const
/** where the frames cross the body */
export const FRAMES = { head: 0.45, hoop: 0.0, small: -0.92, foot: -1.8 } as const

/** the half-hoop: bound cane bent over the body, its crown under the pin */
export const HOOP = { z: 0, crown: 2.02, r: 0.022 } as const
/** the small hoop part-way down, with an iron eye on its near side */
export const SMALL_HOOP = { z: -0.92, rise: 0.28, r: 0.015 } as const

/** a wing, along its own +X from the hub: the root piece, its step joint, the
 * outer piece, the lever past M, the ribs that fan from it (74r's bat wing) */
export const WING = {
  tip: 10 * BRACCIO,
  lever: 0.62,
  root: { r0: 0.032, r1: 0.02, end: 3.26 },
  joint: { at: 2.9, lift: 0.042 },
  outer: { r0: 0.02, r1: 0.011 },
  eyeTip: 10 * BRACCIO - 0.22,
  /** where the lowering cord takes hold, the twist arm, the spring's ring */
  lowerEye: 0.46, twistArm: 0.36, twistLength: 0.2, springRing: -0.25,
  /** the ribs: distance out along the spar, length, fan angle from straight aft */
  ribs: [
    { s: 0.5, len: 0.8, fan: 0 },
    { s: 0.85, len: 1.55, fan: 6 * DEG },
    { s: 1.45, len: 1.6, fan: 12 * DEG },
    { s: 2.1, len: 1.55, fan: 19 * DEG },
    { s: 2.8, len: 1.42, fan: 27 * DEG },
    { s: 3.55, len: 1.2, fan: 36 * DEG },
    { s: 4.3, len: 0.95, fan: 47 * DEG },
    { s: 5.0, len: 0.65, fan: 58 * DEG },
  ],
  rib: { w: 0.028, h: 0.014, camber: 0.04 },
} as const
export const SPAN = 2 * WING.tip

/** the beat: seconds, and the stroke and twist in radians */
export const PERIOD = 3
export const STROKE = { up: 35 * DEG, down: -15 * DEG, downShare: 0.42 } as const
export const TWIST_MAX = 34 * DEG

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
const smoothstep = (a: number, b: number, x: number): number => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u) }
const smoother = (x: number): number => { const u = clamp01(x); return u * u * u * (u * (u * 6 - 15) + 10) }
/** where in the beat, 0 at the top of the stroke */
export function beatPhase(t: number): number {
  const s = Number.isFinite(t) ? Math.max(0, t) : 0
  const u = s / PERIOD
  return u - Math.floor(u)
}
/** the stroke angle: positive up. The feet drive it down fast; the spring
 * brings it up more slowly. */
export function strokeAt(t: number): number {
  const u = beatPhase(t), d = STROKE.downShare
  return u < d
    ? STROKE.up + (STROKE.down - STROKE.up) * smoother(u / d)
    : STROKE.down + (STROKE.up - STROKE.down) * smoother((u - d) / (1 - d))
}
/** the twist: flat on the way down, turned edge on near the bottom, flat
 * again before the top */
export function twistAt(t: number): number {
  const u = beatPhase(t)
  return TWIST_MAX * (smoothstep(0.34, 0.5, u) - smoothstep(0.88, 1, u))
}

type V3 = [number, number, number]
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!]
const add = (a: readonly number[], b: readonly number[]): V3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!]
const scale = (a: readonly number[], k: number): V3 => [a[0]! * k, a[1]! * k, a[2]! * k]
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]
export const length3 = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!)
export const distance3 = (a: readonly number[], b: readonly number[]): number => length3(sub(a, b))
/** Rodrigues: v turned by angle about a unit axis */
export function turn(v: readonly number[], axis: readonly number[], angle: number): V3 {
  const c = Math.cos(angle), s = Math.sin(angle)
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)))
}
/** the hub a wing turns about: left fore of M, right aft */
export function hubCentre(side: 1 | -1): V3 {
  return add([0, PIN.y, 0], scale(AXIS, HUB.offset * side))
}
/** A point given in a wing's own frame (spar along +X for the left wing, -X
 * for the right; chord toward -Z; up +Y), carried to the machine at time t:
 * the twist rolls it about the spar, the stroke turns it about the pin. */
export function wingPoint(side: 1 | -1, local: readonly number[], t: number): V3 {
  const tw = twistAt(t), c = Math.cos(tw), s = Math.sin(tw)
  // roll about +X by -twist: the trailing edge goes down on both wings
  const rolled: V3 = [local[0]!, local[1]! * c + local[2]! * s, -local[1]! * s + local[2]! * c]
  return add(hubCentre(side), turn(rolled, AXIS, strokeAt(t) * side))
}

/** THE CORDS. Each wing has its lowering cord to one heel, its twist cord to
 * one hand, and its spring cord from the far lever to the bow. */
/** the small hoop's crown, where the lowering cords turn (its fitting) */
export const CROWN = { y: BODY.topY + SMALL_HOOP.rise, z: SMALL_HOOP.z } as const
/** a swivel sheave hung under the crown for each cord: it turns to lie in
 * its cord's plane */
export const SHEAVE = { x: 0.034, y: CROWN.y - SMALL_HOOP.r - 0.08, z: SMALL_HOOP.z, r: 0.036 } as const
export const DRUM = { x: 0.395, y: 1.17, z: 0.47, r: 0.045, len: 0.12 } as const
export const BOW = { half: 0.5, y: 1.06, z: 0.44 } as const

/** the wing's own points the cords take hold of */
export function lowerEyeLocal(side: 1 | -1): V3 { return [side * WING.lowerEye, -0.05, 0] }
export function springRingLocal(side: 1 | -1): V3 { return [side * WING.springRing, -0.045, 0] }
export function twistTipLocal(side: 1 | -1): V3 { return [side * WING.twistArm, -WING.root.r0 - WING.twistLength, 0] }

/** THE PILOT'S LEGS (the museums' reading of 74v: a man lying face down).
 * The thighs lie still and the knees rest on a bar; each shin swings about
 * its knee, raised by the cord as the wing rises and pushed back and down to
 * beat it. The heel's strap carries the cord. */
export const KNEE = { x: 0.08, y: 1.49, z: -1.14 } as const
export const SHIN = 0.42
/** the strap's knot at the back of the heel: this far back along the foot
 * from the ankle and this far toward the sole (the figure's foot, figure.ts) */
export const HEEL_BACK = 0.047
export const HEEL_DOWN = 0.053
/** how far the toes point past the shin's own line, radians */
export const PLANTAR = 35 * DEG
export function kneeAt(side: 1 | -1): V3 { return [side * KNEE.x, KNEE.y, KNEE.z] }
export function ankleAt(side: 1 | -1, lift: number): V3 {
  const k = kneeAt(side)
  return [side * (KNEE.x - 0.03), k[1] + SHIN * Math.sin(lift), k[2] - SHIN * Math.cos(lift)]
}
/** the foot's own direction, heel to toe */
export function toeDirection(lift: number): V3 {
  const front: V3 = [0, -Math.cos(lift), -Math.sin(lift)], along: V3 = [0, Math.sin(lift), -Math.cos(lift)]
  return add(scale(front, Math.cos(PLANTAR)), scale(along, Math.sin(PLANTAR)))
}
/** the foot's instep side, square to the line from the ankle to the toes */
export function instepDirection(lift: number): V3 {
  const front: V3 = [0, -Math.cos(lift), -Math.sin(lift)], along: V3 = [0, Math.sin(lift), -Math.cos(lift)]
  return unitV(add(scale(along, -Math.cos(PLANTAR)), scale(front, Math.sin(PLANTAR))))
}
export function heelKnot(side: 1 | -1, lift: number): V3 {
  return add(add(ankleAt(side, lift), scale(toeDirection(lift), -HEEL_BACK)), scale(instepDirection(lift), -HEEL_DOWN))
}

/** the sheave's plane: the swivel lies in the plane of its two cords at the
 * middle of the beat, so the cord leaves the groove straight */
function sheaveFrame(side: 1 | -1): { c: V3; e1: V3; e2: V3 } {
  const c: V3 = [side * SHEAVE.x, SHEAVE.y, SHEAVE.z]
  const eye = wingPoint(side, lowerEyeLocal(side), PERIOD * 0.21)
  const heel = heelKnot(side, 35 * DEG)
  const toEye = sub(eye, c), toHeel = sub(heel, c)
  const n = unitV(cross(toEye, toHeel))
  // e1 toward the head end in the plane, e2 up in it
  const e1 = unitV(sub([0, 0, 1], scale(n, n[2])))
  const e2 = cross(n, e1)
  return { c, e1, e2: e2[1] < 0 ? scale(e2, -1) : e2 }
}
const unitV = (a: readonly number[]): V3 => { const l = length3(a) || 1; return [a[0]! / l, a[1]! / l, a[2]! / l] }
const FRAME = { 1: sheaveFrame(1), [-1]: sheaveFrame(-1) } as Record<1 | -1, { c: V3; e1: V3; e2: V3 }>
export function sheaveAxis(side: 1 | -1): V3 { const f = FRAME[side]; return cross(f.e1, f.e2) }
export function sheaveCentre(side: 1 | -1): V3 { return FRAME[side].c }
const onRim = (side: 1 | -1, a: number): V3 => {
  const f = FRAME[side], r = SHEAVE.r - 0.004
  return add(f.c, add(scale(f.e1, r * Math.cos(a)), scale(f.e2, r * Math.sin(a))))
}
/** The cord from the eye under the spar wraps under the sheave and runs on
 * to the heel: the tangent points, the wrap and its length. */
export function lowerCord(side: 1 | -1, t: number, lift: number): { points: V3[]; length: number } {
  const f = FRAME[side], r = SHEAVE.r - 0.004
  const eye = wingPoint(side, lowerEyeLocal(side), t), heel = heelKnot(side, lift)
  const local = (p: V3): [number, number] => { const d = sub(p, f.c); return [dot(d, f.e1), dot(d, f.e2)] }
  const [e1, e2] = local(eye), [h1, h2] = local(heel)
  const aE = Math.atan2(e2, e1) - Math.acos(Math.min(1, r / Math.hypot(e1, e2)))
  const aH = Math.atan2(h2, h1) + Math.acos(Math.min(1, r / Math.hypot(h1, h2)))
  // from the eye's tangent clockwise under the sheave to the heel's
  let wrap = aE - aH
  while (wrap < 0) wrap += Math.PI * 2
  while (wrap > Math.PI * 2) wrap -= Math.PI * 2
  // a fixed count of nodes, so the cord's sweep keeps its size
  const n = 8
  const arc = Array.from({ length: n + 1 }, (_, i) => onRim(side, aE - wrap * i / n))
  const length = distance3(eye, arc[0]!) + wrap * r + distance3(arc[n]!, heel)
  return { points: [eye, ...arc, heel], length }
}
const LIFT_MAX = 95 * DEG
/** the cord's whole length: the legs lie straight at the bottom of the stroke */
const CORD_LENGTH = {
  1: Math.min(...Array.from({ length: 721 }, (_, i) => lowerCord(1, PERIOD * i / 720, 0).length)),
  [-1]: Math.min(...Array.from({ length: 721 }, (_, i) => lowerCord(-1, PERIOD * i / 720, 0).length)),
} as Record<1 | -1, number>
/** the shin's lift above straight, radians: the cord's length held */
export function shinLift(t: number, side: 1 | -1 = 1): number {
  let lo = 0, hi = LIFT_MAX
  if (lowerCord(side, t, 0).length <= CORD_LENGTH[side]) return 0
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    // raising the heel brings it nearer the sheave: the cord shortens
    if (lowerCord(side, t, mid).length > CORD_LENGTH[side]) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
/** how far the heel has come forward along the cord from its bottom place */
export function stirrupTravel(t: number, side: 1 | -1 = 1): number {
  return distance3(heelKnot(side, 0), onRim(side, -Math.PI / 2)) - distance3(heelKnot(side, shinLift(t, side)), onRim(side, -Math.PI / 2))
}
/** the cord's run over the sheave, for its turning */
export function sheaveRun(t: number, side: 1 | -1 = 1): number {
  const c = lowerCord(side, t, shinLift(t, side))
  return distance3(c.points[0]!, c.points[1]!)
}

/** a span's least or most over one beat, per side: the hubs sit fore and aft
 * on the pin, so the two sides differ by a few centimetres */
const extreme = (f: (side: 1 | -1, t: number) => number, pick: (...v: number[]) => number): Record<1 | -1, number> => {
  const over = (side: 1 | -1): number => pick(...Array.from({ length: 721 }, (_, i) => f(side, PERIOD * i / 720)))
  return { 1: over(1), [-1]: over(-1) } as Record<1 | -1, number>
}

/** the spring cord: from the lever's ring (the far wing's lever lies over
 * this side) to the drum's top */
export function drumTop(side: 1 | -1): V3 { return [side * (DRUM.x + DRUM.r * 0.3), DRUM.y + DRUM.r * 0.95, DRUM.z - 0.02] }
/** The lever over this side belongs to the other wing. */
const springSpan = (side: 1 | -1, t: number): number =>
  distance3(wingPoint((-side) as 1 | -1, springRingLocal((-side) as 1 | -1), t), drumTop(side))
const SPRING_MIN = extreme(springSpan, Math.min)
/** the bow tip's lift on this side: a preload at the top, most at the bottom */
export const BOW_PRELOAD = 0.025
export function bowLift(t: number, side: 1 | -1 = 1): number {
  return BOW_PRELOAD + springSpan(side, t) - SPRING_MIN[side]
}

/** THE TWIST CORD runs from the arm under the spar forward to an eye on an
 * iron beak that carries the pin's axis on past its fore end. A point on the
 * axis keeps its distance from everything the stroke turns, so the hand alone
 * works the twist; from the eye the cord drops to the hand. */
export const BEAK = 0.26
export function twistEye(side: 1 | -1): V3 { return [side * 0.018, PIN.y + AXIS[1] * BEAK, AXIS[2] * BEAK] }
/** where the hand rests, holding the cord, with the wing flat */
export const HAND_REST: V3 = [0.16, 1.55, 0.21]
const twistSpan = (side: 1 | -1, t: number): number => distance3(wingPoint(side, twistTipLocal(side), t), twistEye(side))
const TWIST_SPAN_MAX = extreme(twistSpan, Math.max)
/** the hand's pull on the twist cord, back from where it rests */
export function handPull(t: number, side: 1 | -1 = 1): number {
  return TWIST_SPAN_MAX[side] - twistSpan(side, t)
}
/** the hand's place: drawn back along the cord, away from the eye */
export function handAt(side: 1 | -1, t: number): V3 {
  const rest: V3 = [HAND_REST[0] * side, HAND_REST[1], HAND_REST[2]]
  const away = sub(rest, twistEye(side))
  return add(rest, scale(away, handPull(t, side) / length3(away)))
}

/** Every joint the schedule drives, in SI units. */
export function flyingJoints(t: number): Record<string, number> {
  const stroke = strokeAt(t), twist = twistAt(t)
  return {
    'stroke-left': stroke, 'stroke-right': stroke,
    'twist-left': twist, 'twist-right': twist,
    'stirrup-f': stirrupTravel(t, 1), 'stirrup-d': stirrupTravel(t, -1),
    'shin-f': shinLift(t, 1), 'shin-d': shinLift(t, -1),
    'spring-left': bowLift(t, 1), 'spring-right': bowLift(t, -1),
    'hand-left': handPull(t, 1), 'hand-right': handPull(t, -1),
  }
}
