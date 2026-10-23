/** THE ASSEMBLY'S PATHS (the order and the paths are ours). Each pole leaves
 * the pile on the near bank, is carried to its place and set there. A rod
 * comes over the work and is lowered onto the joist it rests on; a joist is
 * drawn out of the pile along its own length, carried in front of the
 * bridge and threaded between the rods along its axis, so the weave closes
 * as a hand would close it. Pure arithmetic, no renderer: a check sweeps it.
 */
import { FLY, LIFT, MOVE, ORDER, PILE_AT, POLES, SETTLE, buildClock, startOf, type Pole, type V3 } from './plan'

const KIND: Record<string, Pole['kind']> = Object.fromEntries(POLES.map(p => [p.id, p.kind]))
/** a carried rod's centre stays this high over the work until it turns into its slope (the crown's top is 2.9 m) */
const CARRY = 3.6
/** seconds of a joist's move given from the carry to the threading */
const JOIST_THREAD = 0.6

export type Q = [number, number, number, number]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const lerp = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t))
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const smoother = (t: number): number => { const x = Math.min(1, Math.max(0, t)); return x * x * x * (x * (x * 6 - 15) + 10) }

/** a rotation taking unit `from` to unit `to` the short way */
function arc(from: V3, to: V3): Q {
  const c = dot(from, to)
  if (c < -0.999999) { const ax = norm(Math.abs(from[0]) < 0.9 ? cross(from, [1, 0, 0]) : cross(from, [0, 1, 0])); return [ax[0], ax[1], ax[2], 0] }
  const ax = cross(from, to), s = Math.sqrt((1 + c) * 2)
  return [ax[0] / s, ax[1] / s, ax[2] / s, s / 2]
}
export function qmul(a: Q, b: Q): Q {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]
}
export function slerp(a: Q, b: Q, t: number): Q {
  let c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  let bb: Q = b
  if (c < 0) { c = -c; bb = [-b[0], -b[1], -b[2], -b[3]] }
  if (c > 0.9995) { const r: Q = [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]; const l = Math.hypot(...r); return [r[0] / l, r[1] / l, r[2] / l, r[3] / l] }
  const th = Math.acos(c), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb]
}
export function rotate(q: Q, v: V3): V3 {
  const u: V3 = [q[0], q[1], q[2]], t = mul(cross(u, v), 2)
  return add(add(v, mul(t, q[3])), cross(u, t))
}
/** the rotation whose +X is `x` and +Y lies toward `y` */
function basis(x: V3, y: V3): Q {
  const X = norm(x), Z = norm(cross(X, y)), Y = cross(Z, X)
  const m = [X, Y, Z]
  const tr = X[0] + Y[1] + Z[2]
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [(Y[2] - Z[1]) / s, (Z[0] - X[2]) / s, (X[1] - Y[0]) / s, s / 4] }
  if (X[0] > Y[1] && X[0] > Z[2]) { const s = Math.sqrt(1 + X[0] - Y[1] - Z[2]) * 2; return [s / 4, (Y[0] + X[1]) / s, (Z[0] + X[2]) / s, (Y[2] - Z[1]) / s] }
  if (Y[1] > Z[2]) { const s = Math.sqrt(1 + Y[1] - X[0] - Z[2]) * 2; return [(Y[0] + X[1]) / s, s / 4, (Z[1] + Y[2]) / s, (Z[0] - X[2]) / s] }
  void m
  const s = Math.sqrt(1 + Z[2] - X[0] - Y[1]) * 2
  return [(Z[0] + X[2]) / s, (Z[1] + Y[2]) / s, s / 4, (X[1] - Y[0]) / s]
}

export interface Placing { centre: V3; dir: V3; up: V3; q: Q; pileQ: Q; pile: V3; approach: V3; reach: number }
/** where each pole stands in the bridge and in the pile */
export const PLACING: Record<string, Placing> = Object.fromEntries(POLES.map((p: Pole) => {
  const centre = mul(add(p.a, p.b), 0.5), dir = norm(sub(p.b, p.a))
  const up: V3 = p.kind === 'joist' ? [0, 1, 0] : norm([-dir[1], dir[0], 0])
  const q = basis(dir, up)
  // in the pile every pole lies along Z; the turn from there is the short one, with no roll
  const pileQ = qmul(arc(dir, [0, 0, 1]), q)
  const approach: V3 = p.kind === 'joist' ? [0, 0, 1] : up
  // a joist starts its threading clear of every joist already set (they reach 1.7 m each side); a rod comes down onto its place square
  const reach = p.kind === 'joist' ? 3.6 : 1.2
  return [p.id, { centre, dir, up, q, pileQ, pile: PILE_AT[p.id]!, approach, reach }]
}))

export interface Pose { at: V3; q: Q; /** metres from its place */ off: number }

/** a pole at the build clock `u` */
export function poseAt(id: string, u: number): Pose {
  const P = PLACING[id]!
  const s = u - startOf(id)
  const lifted = add(P.pile, [0, LIFT, 0])
  const S = add(P.centre, mul(P.approach, P.reach))
  const joist = KIND[id] === 'joist'
  // a joist spends longer threading along its own length than a rod spends coming down: the move's total is the same
  const fly = joist ? FLY - JOIST_THREAD : FLY, settle = joist ? SETTLE + JOIST_THREAD : SETTLE
  let at: V3, q: Q
  if (s <= 0) { at = P.pile; q = P.pileQ }
  else if (s < LIFT) { at = lerp(P.pile, lifted, smoother(s / LIFT)); q = P.pileQ }
  else if (s < LIFT + fly) {
    const f = (s - LIFT) / fly
    if (joist) {
      // out of the pile along its own length, then along the front of the bridge, rising to its height
      const front: V3 = [lifted[0], lifted[1] + 0.25, S[2]]
      if (f < 0.35) at = lerp(lifted, front, smoother(f / 0.35))
      else at = lerp(front, S, smoother((f - 0.35) / 0.65))
      q = P.q
    } else {
      // carried high over the work still lying across it as it lay in the pile, turned into its slope only above its place
      const g = smoother(f)
      const high = Math.max(S[1], CARRY) + 1.0
      const B1: V3 = [lifted[0], high, lifted[2]], B2: V3 = [S[0], high, S[2]]
      const k = 1 - g
      at = add(add(mul(lifted, k * k * k), mul(B1, 3 * k * k * g)), add(mul(B2, 3 * k * g * g), mul(S, g * g * g)))
      q = slerp(P.pileQ, P.q, smoother((f - 0.55) / 0.4))
    }
  } else if (s < MOVE) { at = lerp(S, P.centre, smoother((s - LIFT - fly) / settle)); q = P.q }
  else { at = P.centre; q = P.q }
  const d = sub(at, P.centre)
  return { at, q, off: Math.hypot(d[0], d[1], d[2]) }
}

/** every pole's pose at a time in the cycle */
export function bridgePoses(time: number): Record<string, Pose> {
  const u = buildClock(time)
  return Object.fromEntries(ORDER.map(id => [id, poseAt(id, u)]))
}
