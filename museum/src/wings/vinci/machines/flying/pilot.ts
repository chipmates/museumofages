/** WHERE THE PILOT LIES: face down on the sling (79v), his knees on a bar,
 * hands on the twist cords, a strap round each heel. The museums' reading of
 * 74v (no man is drawn on it). The thighs lie still; each shin swings about
 * its knee with its cord, so the legs are the drive the eye can follow.
 * Pure numbers. */
import { FOOT_LENGTH, bend, type FigureJoints } from './figure'
import { ankleAt, handAt, instepDirection, kneeAt, shinLift, toeDirection, twistEye } from './plan'
import type { V3 } from './shapes'

const UPPER = 0.28, FORE = 0.25
/** the closed hand's middle, where the cord is held, from the wrist */
const GRIP = 0.05
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export const PILOT = {
  pelvis: [0, 1.43, -0.68] as V3,
  chest: [0, 1.46, -0.4] as V3,
  neck: [0, 1.47, -0.16] as V3,
  head: [0, 1.56, -0.04] as V3,
  shoulder: 0.185, shoulderY: 1.46, shoulderZ: -0.24,
  hip: 0.09, hipY: 1.42, hipZ: -0.72,
} as const

/** the same for both sides: the left (+X) first */
const pair = (f: (side: 1 | -1, k: 0 | 1) => V3): [V3, V3] => [f(1, 0), f(-1, 1)]

export function pilotJoints(t: number): FigureJoints {
  const shoulder = pair(s => [s * PILOT.shoulder, PILOT.shoulderY, PILOT.shoulderZ])
  // each hand closes round its twist cord's end: the cord runs through the
  // fist across the fingers, the knuckles point on from the arm, square to it
  const held = pair(s => handAt(s, t))
  const cord = pair((s, k) => unit(sub(held[k], twistEye(s))))
  const reach = pair((_s, k) => { const r = sub(held[k], shoulder[k]); return unit(sub(r, scale(cord[k], dot(r, cord[k])))) })
  const hand = pair((_s, k) => sub(held[k], scale(reach[k], GRIP)))
  const knuckle = pair((_s, k) => add(hand[k], scale(reach[k], 0.1)))
  const elbow = pair((s, k) => bend(shoulder[k], hand[k], UPPER, FORE, [s * 0.4, -1, 0.2]))
  const hip = pair(s => [s * PILOT.hip, PILOT.hipY, PILOT.hipZ])
  const knee = pair(s => kneeAt(s))
  const lift = pair(s => [shinLift(t, s), 0, 0])
  const ankle = pair((s, k) => ankleAt(s, lift[k][0]))
  const toe = pair((_s, k) => add(ankle[k], scale(toeDirection(lift[k][0]), FOOT_LENGTH)))
  const sole = pair((_s, k) => scale(instepDirection(lift[k][0]), -1))
  return {
    pelvis: PILOT.pelvis, chest: PILOT.chest, neck: PILOT.neck, head: PILOT.head, front: [0, -1, 0.1],
    shoulder, elbow, hand, hip, knee, ankle, toe, sole, knuckle, grip: cord,
  }
}
