/** WHERE THE PILOT LIES: face down on the sling (79v), his knees on a bar,
 * hands on the twist cords, a strap round each heel. The museums' reading of
 * 74v (no man is drawn on it). The thighs lie still; each shin swings about
 * its knee with its cord, so the legs are the drive the eye can follow.
 * Pure numbers. */
import { bend, type FigureJoints } from './figure'
import { ankleAt, handAt, kneeAt, shinLift, toeDirection } from './plan'
import type { V3 } from './shapes'

const UPPER = 0.28, FORE = 0.25, FOOT = 0.2
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]

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
  const hand = pair(s => handAt(s, t))
  const elbow = pair((s, k) => bend(shoulder[k], hand[k], UPPER, FORE, [s * 0.4, -1, 0.2]))
  const hip = pair(s => [s * PILOT.hip, PILOT.hipY, PILOT.hipZ])
  const knee = pair(s => kneeAt(s))
  const lift = pair(s => [shinLift(t, s), 0, 0])
  const ankle = pair((s, k) => ankleAt(s, lift[k][0]))
  const toe = pair((_s, k) => add(ankle[k], scale(toeDirection(lift[k][0]), FOOT)))
  return {
    pelvis: PILOT.pelvis, chest: PILOT.chest, neck: PILOT.neck, head: PILOT.head, front: [0, -1, 0.1],
    shoulder, elbow, hand, hip, knee, ankle, toe,
  }
}
