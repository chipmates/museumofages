/** WHERE THE PILOT LIES: face down on the sling (79v), head toward the hoop's
 * open side, hands on the twist cords, feet in the stirrups. The museums'
 * reading of 74v (no man is drawn on it); his body is the place, his legs
 * and hands are the drive. Pure numbers. */
import { bend, type FigureJoints } from './figure'
import { handAt, stirrupAt } from './plan'
import { STIRRUP_LOOP } from './parts'
import type { V3 } from './shapes'

const THIGH = 0.42, SHIN = 0.42, UPPER = 0.28, FORE = 0.25
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

export const PILOT = {
  pelvis: [0, 1.43, -0.4] as V3,
  neck: [0, 1.47, 0.13] as V3,
  head: [0, 1.57, 0.25] as V3,
  shoulder: 0.185, shoulderY: 1.46, shoulderZ: 0.05,
  hip: 0.095, hipY: 1.42, hipZ: -0.44,
} as const

/** the same for both sides: the left (+X) first */
const pair = (f: (side: 1 | -1, k: 0 | 1) => V3): [V3, V3] => [f(1, 0), f(-1, 1)]

export function pilotJoints(t: number): FigureJoints {
  const shoulder = pair(s => [s * PILOT.shoulder, PILOT.shoulderY, PILOT.shoulderZ])
  const hand = pair(s => handAt(s, t))
  const elbow = pair((s, k) => bend(shoulder[k], hand[k], UPPER, FORE, [s * 0.15, -1, 0.5]))
  const hip = pair(s => [s * PILOT.hip, PILOT.hipY, PILOT.hipZ])
  // the ball of the foot in the strap's loop, the ankle above and forward
  // of it, the toes pointing down and back
  const ball = pair(s => add(stirrupAt(s, t), [0, 0, -STIRRUP_LOOP]))
  const ankle = pair((_s, k) => add(ball[k], [0, 0.075, 0.06]))
  const toe = pair((_s, k) => add(ball[k], [0, -0.055, -0.035]))
  const knee = pair((_s, k) => bend(hip[k], ankle[k], THIGH, SHIN, [0, -1, 0.1]))
  return {
    pelvis: PILOT.pelvis, chest: [0, 1.46, -0.1], neck: PILOT.neck, head: PILOT.head, front: [0, -1, 0.15],
    shoulder, elbow, hand, hip, knee, ankle, toe,
  }
}
