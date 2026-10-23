/* THE MEASURE'S BODY: a plain adult standing at ease, made of distance
   fields. No face, no hair, no clothes, no sex, no fingers: a measure reads
   as a height and nothing else. Drawn at 1.70 m on the adult canon (about
   7.5 heads; hip joint 0.53, knee 0.285, fingertips 0.39 of the height),
   then scaled about the soles so the crown stands at the height asked.
   Each limb is one tube of elliptic sections; joins are small fillets.
   Drawn frame: x forward, y up, z to the figure's right. */

import { compile, type Field, type V3 } from './field'

/** a section: centre x, y, z; a the radius along the tube's `up`, b across it */
export type Knot = [x: number, y: number, z: number, a: number, b: number]

const FWD: V3 = [1, 0, 0]
const UP: V3 = [0, 1, 0]

/** Catmull-Rom through the knots in steps of about `step` metres: a bend spread over many mitred joints. Shorter steps
    fail the tube's mitre test on a thick limb, and an unmitred joint gets a full cap that swells past the taper */
function dense(knots: Knot[], step: number): Knot[] {
  if (step <= 0 || knots.length < 3) return knots
  const out: Knot[] = []
  const n = knots.length
  for (let i = 0; i < n - 1; i++) {
    const p0 = knots[Math.max(0, i - 1)]!
    const p1 = knots[i]!
    const p2 = knots[i + 1]!
    const p3 = knots[Math.min(n - 1, i + 2)]!
    const per = Math.max(1, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]) / step))
    for (let k = 0; k < per; k++) {
      const t = k / per
      const t2 = t * t
      const t3 = t2 * t
      out.push(p1.map((v, j) => 0.5 * (2 * v + (-p0[j]! + p2[j]!) * t + (2 * p0[j]! - 5 * v + 4 * p2[j]! - p3[j]!) * t2 + (-p0[j]! + 3 * v - 3 * p2[j]! + p3[j]!) * t3)) as Knot)
    }
  }
  out.push(knots[n - 1]!)
  return out
}
export const tube = (knots: Knot[], up: V3, step = 0): Field => {
  const kn = dense(knots, step)
  return { k: 'tube', pts: kn.map(([x, y, z]) => [x, y, z] as V3), r: kn.map(([, , , a, b]) => [a, b] as [number, number]), up }
}
export const flip = (knots: Knot[], s: 1 | -1): Knot[] => knots.map(([x, y, z, a, b]) => [x, y, z * s, a, b])

// the trunk from the seat into the neck, depth along x and width along z. The front rises evenly from the belly to
// the chest with no overhang a light from above could print as a band; above the chest it narrows into the neck, so
// its rounded end lies hidden inside the neck and draws no line across the chest
const TORSO: Knot[] = [
  [-0.02, 0.88, 0, 0.104, 0.157],
  [-0.016, 0.93, 0, 0.107, 0.154],
  [-0.01, 0.98, 0, 0.106, 0.146],
  [-0.004, 1.03, 0, 0.102, 0.138],
  [0.002, 1.08, 0, 0.101, 0.135],
  [0.007, 1.14, 0, 0.104, 0.14],
  [0.009, 1.215, 0, 0.108, 0.15],
  [0.004, 1.29, 0, 0.104, 0.156],
  [-0.006, 1.345, 0, 0.094, 0.152],
  [-0.013, 1.385, 0, 0.08, 0.128],
  [-0.018, 1.42, 0, 0.068, 0.088],
  [-0.02, 1.45, 0, 0.061, 0.066],
  [-0.02, 1.47, 0, 0.06, 0.062],
]
// the trapezius, from the neck's side a hand under the jaw to the shoulder: thickness up, depth across
const TRAP: Knot[] = [
  [-0.026, 1.4, 0.06, 0.034, 0.046],
  [-0.018, 1.392, 0.11, 0.034, 0.047],
  [-0.01, 1.38, 0.162, 0.033, 0.046],
]
// a neck as wide as a man's (about 0.12 m), its sides upright from the jaw to the trapezius, so the chin's
// shadow falls on a neck and never hoods the head
const NECK: Knot[] = [
  [-0.02, 1.38, 0, 0.062, 0.062],
  [-0.006, 1.46, 0, 0.057, 0.058],
  [0.006, 1.535, 0, 0.053, 0.055],
]
// right side (z > 0); the left is its mirror. Upper arm 8 degrees forward, forearm 18, hand 10: the hand hangs clear
// in front of the thigh. The arm starts inside the shoulder's mass, so its end never stands up as a pad
const ARM: Knot[] = [
  [-0.004, 1.37, 0.17, 0.046, 0.044],
  [0.0, 1.345, 0.176, 0.049, 0.046],
  [0.012, 1.274, 0.182, 0.045, 0.041],
  [0.025, 1.186, 0.19, 0.041, 0.037],
  [0.035, 1.113, 0.196, 0.036, 0.034],
  [0.041, 1.069, 0.199, 0.033, 0.032],
  [0.06, 1.012, 0.202, 0.037, 0.034],
  [0.088, 0.926, 0.205, 0.031, 0.027],
  [0.118, 0.833, 0.207, 0.026, 0.02],
]
// a mitten seen flat from the side, width along x, thickness along z; the fingers curl a little toward the thigh
const HAND: Knot[] = [
  [0.118, 0.833, 0.207, 0.026, 0.018],
  [0.127, 0.774, 0.208, 0.035, 0.016],
  [0.134, 0.733, 0.206, 0.034, 0.014],
  [0.139, 0.694, 0.2, 0.028, 0.012],
  [0.141, 0.671, 0.193, 0.019, 0.01],
]
const THUMB: Knot[] = [
  [0.136, 0.822, 0.203, 0.0125, 0.0125],
  [0.157, 0.768, 0.197, 0.0115, 0.0115],
  [0.162, 0.746, 0.195, 0.0095, 0.0095],
]
// the thigh starts inside the seat's dome and leaves it from below, as a leg leaves the pelvis
const LEG: Knot[] = [
  [-0.004, 0.86, 0.083, 0.083, 0.07],
  [0.0, 0.8, 0.087, 0.08, 0.072],
  [0.004, 0.68, 0.092, 0.07, 0.064],
  [0.006, 0.56, 0.096, 0.056, 0.052],
  [0.006, 0.49, 0.098, 0.05, 0.048],
  [0.0, 0.425, 0.099, 0.048, 0.045],
  [-0.012, 0.34, 0.1, 0.054, 0.046],
  [-0.01, 0.23, 0.101, 0.041, 0.036],
  [-0.004, 0.13, 0.102, 0.03, 0.028],
  [0.0, 0.075, 0.103, 0.032, 0.033],
]
// heel, arch and toes as one mass, about 0.155 of the height long; it dips below the floor, which cuts the sole flat
const FOOT: Knot[] = [
  [-0.04, 0.03, 0.103, 0.034, 0.03],
  [0.0, 0.04, 0.104, 0.042, 0.034],
  [0.07, 0.031, 0.11, 0.032, 0.04],
  [0.14, 0.016, 0.117, 0.02, 0.044],
  [0.178, 0.012, 0.12, 0.015, 0.04],
]

/** the drawn figure at about 1.70 m, soles on y = 0 */
export function drawnBody(): Field {
  // the skull with a back to it over the neck, a plain face mass and a jaw; no features
  const head: Field = {
    k: 'u',
    s: 0.035,
    of: [
      { k: 'ellipsoid', c: [-0.012, 1.6, 0], r: [0.097, 0.1, 0.076] },
      { k: 'ellipsoid', c: [0.03, 1.56, 0], r: [0.062, 0.075, 0.06] },
      // the jaw, falling from under the ear to the chin
      { k: 'ellipsoid', c: [0.03, 1.524, 0], r: [0.062, 0.028, 0.056], basis: [[0.883, -0.469, 0], [0.469, 0.883, 0], [0, 0, 1]] },
    ],
  }
  // the shoulder's round mass: the trapezius runs onto it and the arm hangs out of it, so its top is no pad
  const deltoid = (s: 1 | -1): Field => ({ k: 'ellipsoid', c: [-0.004, 1.35, 0.17 * s], r: [0.052, 0.066, 0.05] })
  // the lower belly carried down between the thighs, its front flush with theirs: no V where they leave the seat
  const groin: Field = { k: 'box', c: [0.025, 0.86, 0], h: [0.05, 0.07, 0.08], round: 0.04 }
  const legs = (s: 1 | -1): Field => ({ k: 'u', s: 0.025, of: [tube(flip(LEG, s), FWD, 0.015), tube(flip(FOOT, s), UP, 0.015)] })
  const arm = (s: 1 | -1): Field => ({ k: 'u', s: 0.012, of: [tube(flip(ARM, s), FWD, 0.015), tube(flip(HAND, s), FWD, 0.012), tube(flip(THUMB, s), FWD)] })
  // the chest's panel edges go in one wide fillet over trunk, trapezius and shoulders
  const chest: Field = { k: 'u', s: 0.06, of: [tube(TORSO, FWD, 0.015), tube(TRAP, UP, 0.015), tube(flip(TRAP, -1), UP, 0.015), deltoid(1), deltoid(-1)] }
  const pelvis: Field = { k: 'u', s: 0.075, of: [chest, groin] }
  // the neck takes a small fillet of its own: a wide one turns it into a cowl
  const upper: Field = { k: 'u', s: 0.03, of: [pelvis, tube(NECK, FWD, 0.015)] }
  const trunk: Field = { k: 'u', s: 0.06, of: [upper, legs(1), legs(-1)] }
  const body: Field = { k: 'u', s: 0.028, of: [trunk, arm(1), arm(-1)] }
  // the jaw's fillet is wide enough for 4k triangles to carry: a narrower one leaves a dark facet under the chin
  const whole: Field = { k: 'u', s: 0.04, of: [body, head] }
  // the floor: everything below y = 0 cut away, so the soles stand flat on the level line
  return { k: 'i', s: 0.004, of: [whole, { k: 'box', c: [0, 1, 0], h: [1, 1, 1] }] }
}

/** the crown's height on a field drawn about 1.70 m, found by bisection along the top (blends move it off the skull's own top) */
export function crownOf(f: Field): number {
  const c = compile(f)
  let top = 0
  for (const dx of [-0.02, -0.01, 0, 0.01, 0.02])
    for (const dz of [-0.01, 0, 0.01]) {
      let lo = 1.6
      let hi = 1.8
      if (c.f(-0.004 + dx, lo, dz) >= 0) continue
      for (let i = 0; i < 40; i++) {
        const m = (lo + hi) / 2
        if (c.f(-0.004 + dx, m, dz) < 0) lo = m
        else hi = m
      }
      top = Math.max(top, lo)
    }
  return top
}

/** a drawn body scaled about its soles so its crown stands at `height`, turned so it faces +z with its width along x */
export function standing(drawn: Field, height: number): Field {
  const s = height / (crownOf(drawn) || 1.7)
  // columns: where the drawn forward, up and side go, times the scale
  const m = [0, 0, s, 0, s, 0, -s, 0, 0, 0, 0, 0]
  return { k: 'x', m, of: drawn }
}
