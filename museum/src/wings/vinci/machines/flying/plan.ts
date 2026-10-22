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
  /** half widths of the top rails, head and foot */
  headHalf: 0.35, footHalf: 0.13,
  topY: 1.42,
} as const
export interface Rail { side: 1 | -1; level: 'top' | 'mid' | 'bottom' }
/** a rail's centre at a given z along the body */
export function railAt(rail: Rail, z: number): [number, number, number] {
  const f = (BODY.head - z) / (BODY.head - BODY.foot)
  const half = BODY.headHalf + (BODY.footHalf - BODY.headHalf) * f
  const inset = rail.level === 'bottom' ? 0.86 : 1
  const y = rail.level === 'top' ? BODY.topY
    : rail.level === 'mid' ? 1.27 + (1.34 - 1.27) * f
      : 1.12 + (1.26 - 1.12) * f
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
  lowerEye: 0.17, twistArm: 0.36, twistLength: 0.13, springRing: -0.25,
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

/** THE CORDS. Each wing has its lowering cord to one foot, its twist cord to
 * one hand, and its spring cord from the far lever to the bow. */
export const SHEAVE = { x: 0.255, y: 1.5, z: -0.2, r: 0.04 } as const
export const GUIDE = { x: 0.205, y: 1.455, z: -0.7 } as const
/** the stirrup at the bottom of the stroke (legs straight), left foot */
export const STIRRUP_OUT: V3 = [0.095, 1.4, -1.27]
export const DRUM = { x: 0.395, y: 1.17, z: 0.47, r: 0.045, len: 0.12 } as const
export const BOW = { half: 0.5, y: 1.06, z: 0.44 } as const

/** the wing's own points the cords take hold of */
export function lowerEyeLocal(side: 1 | -1): V3 { return [side * WING.lowerEye, -0.05, 0] }
export function springRingLocal(side: 1 | -1): V3 { return [side * WING.springRing, -0.045, 0] }
export function twistTipLocal(side: 1 | -1): V3 { return [side * WING.twistArm, -WING.root.r0 - WING.twistLength, 0] }

/** where the lowering cord leaves the sheave's front, toward the spar */
export function sheaveTop(side: 1 | -1): V3 { return [side * SHEAVE.x, SHEAVE.y + 0.012, SHEAVE.z + SHEAVE.r * 0.95] }
const lowerSpan = (side: 1 | -1, t: number): number => distance3(wingPoint(side, lowerEyeLocal(side), t), sheaveTop(side))
/** the lowering cord's span from the spar's eye to the sheave, at the bottom
 * of the stroke (the shortest) */
const LOWER_MIN = Math.min(...Array.from({ length: 721 }, (_, i) => lowerSpan(1, PERIOD * i / 720)))
/** how far the stirrup has come forward of its place at the bottom */
export function stirrupTravel(t: number, side: 1 | -1 = 1): number {
  return lowerSpan(side, t) - LOWER_MIN
}
/** the stirrup's place: on the line from its bottom place toward the guide */
export function stirrupAt(side: 1 | -1, t: number): V3 {
  const out: V3 = [STIRRUP_OUT[0] * side, STIRRUP_OUT[1], STIRRUP_OUT[2]]
  const guide: V3 = [GUIDE.x * side, GUIDE.y, GUIDE.z]
  const dir = sub(guide, out), d = length3(dir)
  return add(out, scale(dir, stirrupTravel(t, side) / d))
}

/** the spring cord: from the lever's ring (the far wing's lever lies over
 * this side) to the drum's top */
export function drumTop(side: 1 | -1): V3 { return [side * (DRUM.x + DRUM.r * 0.3), DRUM.y + DRUM.r * 0.95, DRUM.z - 0.02] }
/** The lever over this side belongs to the other wing. */
const springSpan = (side: 1 | -1, t: number): number =>
  distance3(wingPoint((-side) as 1 | -1, springRingLocal((-side) as 1 | -1), t), drumTop(side))
const SPRING_MIN = Math.min(...Array.from({ length: 721 }, (_, i) => springSpan(1, PERIOD * i / 720)))
/** the bow tip's lift on this side: a preload at the top, most at the bottom */
export const BOW_PRELOAD = 0.025
export function bowLift(t: number, side: 1 | -1 = 1): number {
  return BOW_PRELOAD + springSpan(side, t) - SPRING_MIN
}

/** THE TWIST CORD runs from the arm under the spar to an eye at the pin's
 * fore end, near the axis, so the stroke hardly changes its length and the
 * hand alone works the twist; from there it drops to the hand. */
export function twistEye(side: 1 | -1): V3 { return [side * 0.03, PIN.y + AXIS[1] * 0.125, AXIS[2] * 0.125] }
/** where the hand rests, holding the cord, with the wing flat */
export const HAND_REST: V3 = [0.15, 1.47, 0.43]
const twistSpan = (side: 1 | -1, t: number): number => distance3(wingPoint(side, twistTipLocal(side), t), twistEye(side))
const TWIST_SPAN_MAX = Math.max(...Array.from({ length: 721 }, (_, i) => twistSpan(1, PERIOD * i / 720)))
/** the hand's pull on the twist cord, back from where it rests */
export function handPull(t: number, side: 1 | -1 = 1): number {
  return TWIST_SPAN_MAX - twistSpan(side, t)
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
    'spring-left': bowLift(t, 1), 'spring-right': bowLift(t, -1),
    'hand-left': handPull(t, 1), 'hand-right': handPull(t, -1),
  }
}
