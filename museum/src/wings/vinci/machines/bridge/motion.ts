/** THE ASSEMBLY'S PATHS (the order and the paths are ours). From both banks at
 * once, nothing carried higher than the crown and a pole's width:
 * - a foot rod is carried low to its seat, laid across it and tipped up over
 *   it, rolling on the log, while a forked strut rises from the stream under
 *   its free end; an end rod is tipped up the same way under its joist;
 * - a second-bay rod is laid over the first joist from the bank and pushed up
 *   over it, sliding on it, until its end comes down on a strut at the crown;
 * - a crown rod is lifted over the bank and pushed out level onto the joists;
 * - a joist is drawn from its pile, carried along the front at its height and
 *   threaded between the rods along its own length;
 * - a strut lies in the stream, rises about its foot and lies back down.
 * Pure arithmetic, no renderer: a check sweeps it.
 */
import {
  JOIST_XY, ORDER, PILE_AT, POLES, SCHEDULE, SEAT_R, SEAT_XY, STRUTS, STRUT_SWING, STRUT_TIMES, buildClock, radiusAt, type Pole, type V3,
} from './plan'

export type Q = [number, number, number, number]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const lerp = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t))
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const ease = (t: number): number => { const x = Math.min(1, Math.max(0, t)); return x * x * x * (x * (x * 6 - 15) + 10) }

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
const axisAngle = (axis: V3, angle: number): Q => { const s = Math.sin(angle / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)] }
/** the rotation whose +X is `x` and +Y lies toward `y` */
function basis(x: V3, y: V3): Q {
  const X = norm(x), Z = norm(cross(X, y)), Y = cross(Z, X)
  const tr = X[0] + Y[1] + Z[2]
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [(Y[2] - Z[1]) / s, (Z[0] - X[2]) / s, (X[1] - Y[0]) / s, s / 4] }
  if (X[0] > Y[1] && X[0] > Z[2]) { const s = Math.sqrt(1 + X[0] - Y[1] - Z[2]) * 2; return [s / 4, (Y[0] + X[1]) / s, (Z[0] + X[2]) / s, (Y[2] - Z[1]) / s] }
  if (Y[1] > Z[2]) { const s = Math.sqrt(1 + Y[1] - X[0] - Z[2]) * 2; return [(Y[0] + X[1]) / s, s / 4, (Z[1] + Y[2]) / s, (Z[0] - X[2]) / s] }
  const s = Math.sqrt(1 + Z[2] - X[0] - Y[1]) * 2
  return [(Z[0] + X[2]) / s, (Z[1] + Y[2]) / s, s / 4, (X[1] - Y[0]) / s]
}

export interface Pose { at: V3; q: Q }
/** a pole's pose from its axis ends: rods keep their outward side up, joists and struts the world's */
function fromEnds(a: V3, b: V3, up?: V3): Pose {
  const d = norm(sub(b, a))
  return { at: mul(add(a, b), 0.5), q: basis(d, up ?? (Math.abs(d[2]) > 0.9 ? [0, 1, 0] : [-d[1], d[0], 0])) }
}
/** a pose turned about a world axis through a point */
function turned(p: Pose, about: V3, axis: V3, angle: number): Pose {
  const r = axisAngle(axis, angle)
  return { at: add(about, rotate(r, sub(p.at, about))), q: qmul(r, p.q) }
}
const raised = (p: Pose, by: V3): Pose => ({ at: add(p.at, by), q: p.q })
/** the eased blend of two poses (the centre straight, the turn the short way) */
const blend = (a: Pose, b: Pose, f: number): Pose => ({ at: lerp(a.at, b.at, f), q: slerp(a.q, b.q, f) })

interface Seg { t0: number; t1: number; at: (f: number) => Pose }
interface Track { segs: Seg[] }
function poseOn(track: Track, u: number): Pose {
  const s = track.segs
  if (u <= s[0]!.t0) return s[0]!.at(0)
  for (const seg of s) if (u < seg.t1) return seg.at(ease((u - seg.t0) / (seg.t1 - seg.t0)))
  return s[s.length - 1]!.at(1)
}
/** a chain of blends through key poses, each taking its share of the time */
function chain(t0: number, keys: [Pose, number][]): Seg[] {
  const segs: Seg[] = []
  let t = t0
  for (let i = 1; i < keys.length; i++) {
    const [a] = keys[i - 1]!, [b, dt] = keys[i]!
    segs.push({ t0: t, t1: t + dt, at: f => blend(a, b, f) })
    t += dt
  }
  return segs
}

const byId: Record<string, Pole> = Object.fromEntries(POLES.map(p => [p.id, p]))
export function finalPose(p: Pole): Pose { return fromEnds(p.a, p.b, p.kind === 'joist' ? [0, 1, 0] : undefined) }
/** in the pile every pole lies along Z, its outward side up */
function pilePose(p: Pole): Pose {
  return { at: PILE_AT[p.id]!, q: p.kind === 'joist' ? finalPose(p).q : basis([0, 0, 1], [0, 1, 0]) }
}
const d0 = (p: Pole): V3 => norm(sub(p.b, p.a))
const sideOf = (p: Pole): -1 | 1 => ((p.a[0] + p.b[0]) / 2 < 0 ? -1 : 1)
/** a pole lifted from its pile rises to LIFT_Y and turns there; carried, it goes at CARRY_Y, over the next one rising */
const LIFT_Y = 0.95
const CARRY_Y = 1.25
const LEVEL: Q = [0, 0, 0, 1]
/** the first keys of every rod: lifted from its pile, turned there to lie along the span, moved over its own plane */
function fromPile(p: Pole): [Pose, number][] {
  const pile = pilePose(p)
  const lift = raised(pile, [0, LIFT_Y - pile.at[1], 0])
  const turned: Pose = { at: lift.at, q: LEVEL }
  const inPlane: Pose = { at: [lift.at[0], CARRY_Y, p.a[2]], q: LEVEL }
  return [[pile, 0], [lift, 0.3], [turned, 0.4], [inPlane, 0.3]]
}
const FROM_PILE = 0.3 + 0.4 + 0.3

/** a rod that ends on a seat: laid across the seat and tipped up over it, rolling on the log */
function tipUp(p: Pole): Track {
  const { start, move } = SCHEDULE[p.id]!
  const side = sideOf(p), seat = SEAT_XY[side < 0 ? 0 : 1]
  const O: V3 = [seat[0], seat[1], p.a[2]]
  const f = finalPose(p), d = norm(sub(p.b, p.a)), angle = Math.atan2(d[1], d[0])
  // turned flat about the seat's axis: the rod lies across the log, the contact at the log's top
  const flat = turned(f, O, [0, 0, 1], -angle)
  const over = raised(flat, [0, CARRY_Y - flat.at[1], 0])
  const swing = 1.0, carry = move - FROM_PILE - 0.3 - swing
  const segs = chain(start, [...fromPile(p), [over, carry], [flat, 0.3]])
  const t = start + move - swing
  segs.push({ t0: t, t1: t + swing, at: g => turned(flat, O, [0, 0, 1], angle * g) })
  return { segs }
}

/** a second-bay rod: lifted level over the first joist and laid across it, tipped over it like a beam on a trestle
 * until it lies on its own line, then pushed along that line over the joist until its front end lies in its strut's
 * fork */
function pushUp(p: Pole): Track {
  const { start, move } = SCHEDULE[p.id]!
  const side = sideOf(p)
  const J = JOIST_XY[side < 0 ? 1 : 5]!
  const f = finalPose(p)
  // the rod's own line, back toward its bank: a near rod's back end is a, a far rod's b
  const back = norm(side < 0 ? sub(p.a, p.b) : sub(p.b, p.a))
  // the rod thickens toward one end: laid back, the part on the joist and the part that will pass over the fork are
  // thicker than the parts that rest there, so it lies and is pushed that much proud along its normal
  const n = rotate(f.q, [0, 1, 0])
  const sJ = p.bears[0]!, sF = Math.max(...STRUTS.filter(x => x.rod === p.id).map(x => Math.abs(x.held[0] - p.a[0]) / Math.abs(d0(p)[0])))
  const rise = (from: number, to: number): number => { let m = 0; for (let k = 0; k <= 20; k++) m = Math.max(m, radiusAt(p, from + (to - from) * k / 20) - radiusAt(p, from)); return m }
  const proudBy = side < 0 ? Math.max(rise(sJ, sJ + PUSH), rise(sF, p.length)) : Math.max(rise(p.length - sJ, p.length - sJ - PUSH), rise(sF, 0))
  const proud = mul(n, proudBy + 0.002)
  const laid = raised(raised(f, mul(back, PUSH)), proud)
  const Jc: V3 = [J[0], J[1], p.a[2]]
  const d = norm(sub(p.b, p.a))
  const tilt = Math.atan2(d[1], d[0])
  // the same rod turned level about the joist's axis: still on the joist, lying across it
  const across = turned(laid, Jc, [0, 0, 1], -tilt)
  const high = raised(across, [0, 0.04, 0])
  const level: Pose = { at: [PILE_AT[p.id]![0], high.at[1], p.a[2]], q: high.q }
  const tip = 0.6, slide = 1.2, carry = move - FROM_PILE - 0.4 - tip - slide
  const segs = chain(start, [...fromPile(p), [level, 0.4], [high, carry - 0.15], [across, 0.15]])
  const t1 = start + move - slide - tip
  segs.push({ t0: t1, t1: t1 + tip, at: g => turned(across, Jc, [0, 0, 1], tilt * g) })
  segs.push(...chain(t1 + tip, [[laid, 0], [raised(f, proud), slide - 0.2], [f, 0.2]]))
  return { segs }
}
/** how far back along its line a second-bay rod is laid before it is pushed home */
const PUSH = 1.5

/** a crown rod: lifted over its bank to its height before it turns (its twin still lies below), pushed out level, a
 * hand over the joists, then laid on them */
function outLevel(p: Pole): Track {
  const { start, move } = SCHEDULE[p.id]!
  const f = finalPose(p)
  const hover = raised(f, [0, 0.12, 0])
  const pile = pilePose(p)
  const lift = raised(pile, [0, LIFT_Y - pile.at[1], 0])
  const high = raised(pile, [0, hover.at[1] - pile.at[1], 0])
  const turnedHigh: Pose = { at: high.at, q: LEVEL }
  const behind: Pose = { at: [high.at[0], hover.at[1], hover.at[2]], q: hover.q }
  const lay = 0.4, push = move - 0.3 - 0.6 - 0.4 - 0.3 - lay
  return { segs: chain(start, [[pile, 0], [lift, 0.3], [high, 0.6], [turnedHigh, 0.4], [behind, 0.3], [hover, push], [f, lay]]) }
}

/** a joist: drawn out of its pile along its length to the front, carried along the front at its height, threaded in */
function threadIn(p: Pole): Track {
  const { start, move } = SCHEDULE[p.id]!
  const f = finalPose(p), pile = pilePose(p)
  const lift = raised(pile, [0, LIFT_Y - pile.at[1], 0])
  const outZ = p.length + 0.25
  const drawn = raised(lift, [0, 0, outZ])
  const front: Pose = { at: [f.at[0], f.at[1], outZ], q: f.q }
  const lifted = 0.3, draw = 0.45, thread = 0.9, carry = move - lifted - draw - thread
  return { segs: chain(start, [[pile, 0], [lift, lifted], [drawn, draw], [front, carry], [f, thread]]) }
}

/** a strut: lying on the stream's bed beside its plane, swung up about its foot inside the plane, laid back down */
function strutTrack(p: Pole): Track {
  const s = STRUTS.find(x => x.id === p.id)!
  const times = STRUT_TIMES[p.id]!
  const stand = finalPose(p)
  const lying = fromEnds(s.foot, [s.lie[0], s.lie[1], s.foot[2]]).q
  // the swing keeps the foot where it stands and turns about the plane's normal; it steps between its own plane and the
  // place where it lies while it stands steep, its head clear of the struts lying on the bed
  const at = (g: number): Pose => {
    const q = slerp(lying, stand.q, g)
    const step = Math.min(1, Math.max(0, (g - 0.45) / 0.4))
    const foot: V3 = [s.foot[0], s.foot[1], s.lieZ + (s.foot[2] - s.lieZ) * step * step * (3 - 2 * step)]
    return { at: add(foot, rotate(q, [p.length / 2, 0, 0])), q }
  }
  return {
    segs: [
      { t0: times.up, t1: times.up + STRUT_SWING, at },
      { t0: times.down, t1: times.down + STRUT_SWING, at: g => at(1 - g) },
    ],
  }
}

export const TRACKS: Record<string, Track> = Object.fromEntries(POLES.map(p => {
  let track: Track
  if (p.kind === 'strut') track = strutTrack(p)
  else if (p.kind === 'joist') track = threadIn(p)
  else if (p.kind === 'end' || p.k === 1 || p.k === 5) track = tipUp(p)
  else if (p.k === 2 || p.k === 4) track = pushUp(p)
  else track = outLevel(p)
  return [p.id, track]
}))

export const PLACED: Record<string, Pose> = Object.fromEntries(POLES.map(p => [p.id, finalPose(p)]))

/** a pole at the build clock `u`, and how far it stands from its place */
export function poseAt(id: string, u: number): Pose & { off: number } {
  const pose = poseOn(TRACKS[id]!, u)
  const d = sub(pose.at, PLACED[id]!.at)
  return { ...pose, off: Math.hypot(d[0], d[1], d[2]) }
}

/** every pole's pose at a time in the cycle */
export function bridgePoses(time: number): Record<string, Pose & { off: number }> {
  const u = buildClock(time)
  return Object.fromEntries(POLES.map(p => [p.id, poseAt(p.id, u)]))
}
export { ORDER, SEAT_R }
