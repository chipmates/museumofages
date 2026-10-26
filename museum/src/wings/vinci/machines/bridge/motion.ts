/** THE ASSEMBLY'S PATHS (the order, the paths and the means are ours). No
 * pole moves through the air on its own. Each bank's first bay goes out as
 * one lashed kit over its seat log and is raised on its props, pivoting on
 * the seat; every other rod is pushed off the bank over the seat, tips into
 * the stream, slides on and floats; a joist rolls off the bank into the
 * stream; each is raised on forked props whose feet slide on the ground, a
 * second-bay rod pivoting on its first joist; the crown joist is threaded in
 * along its length. Every resting pose is solved from what holds the pole
 * (the ground, the seats, the stream's level, the joist it pivots on) and
 * sampled once into a table the clock reads. Pure arithmetic, no renderer: a
 * check sweeps it.
 */
import {
  J3_REST, JOIST_HALF, JOIST_PILE, JOIST_WAIT_Z, JOIST_XY, KITS, MOVES, PARK_DOWN, PARK_UP, POLES, PROPS, PROP_TIMES, RIDES, SEAT_HALF, SEAT_R,
  SEAT_XY, STRUT_R, THREAD_Z, footHeight, laysOutward, WATER_AXIS, YARD, bowAt, buildClock, crotchDepth, floatTurn, footEnd, groundY, landOf, movesOf, radiusAt,
  sideOf, ORDER, type Moves, type Pole, type Prop, type Step, type V3,
} from './plan'

export type Q = [number, number, number, number]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const lerp = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t))
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t))
const ease = (t: number): number => { const x = clamp01(t); return x * x * x * (x * (x * 6 - 15) + 10) }

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
const inverse = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]]
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
/** a pole's pose from its axis ends: rods keep their outward side up, joists the world's */
function fromEnds(a: V3, b: V3, up?: V3): Pose {
  const d = norm(sub(b, a))
  return { at: mul(add(a, b), 0.5), q: basis(d, up ?? (Math.abs(d[2]) > 0.9 ? [0, 1, 0] : [-d[1], d[0], 0])) }
}
/** a pose turned about the world's +Z through a point */
function turned(p: Pose, about: V3, angle: number): Pose {
  const r = axisAngle([0, 0, 1], angle)
  return { at: add(about, rotate(r, sub(p.at, about))), q: qmul(r, p.q) }
}
const moved = (p: Pose, by: V3): Pose => ({ at: add(p.at, by), q: p.q })
const blend = (a: Pose, b: Pose, f: number): Pose => ({ at: lerp(a.at, b.at, f), q: slerp(a.q, b.q, f) })
/** a pose applied to a point in the pole's own frame */
const place = (p: Pose, local: V3): V3 => add(p.at, rotate(p.q, local))

const byId: Record<string, Pole> = Object.fromEntries(POLES.map(p => [p.id, p]))
export function finalPose(p: Pole): Pose { return fromEnds(p.a, p.b, p.kind === 'joist' ? [0, 1, 0] : undefined) }

// ---------------------------------------------------------------- resting on what lies under it

/** the lowest a pole's axis of girth r may lie at (x, z) on the ground or afloat */
function groundFloor(x: number, z: number, r: number): number {
  const g = groundY(x, z), slope = (groundY(x + 0.02, z) - g) / 0.02
  return Math.max(g + r * Math.sqrt(1 + slope * slope), WATER_AXIS)
}
/** the logs a rod may lie across: the seats */
const LOGS: { o: [number, number]; half: number }[] = SEAT_XY.map(o => ({ o, half: SEAT_HALF }))

/** A rod's line in its plane: its bank end's x and y and its rise toward the stream. Rods pushed as one share it. */
interface Line { x: number; y: number; phi: number }
/** rods pushed as one, from one bank end: each lies along the leading rod's line in its own plane, to its own length;
 * `cm` the whole's centre of weight from the bank end */
interface Gang { poles: Pole[]; zs: number[]; side: -1 | 1; length: number; cm: number }
const gangOf = (ids: string[], zs?: number[], cm?: number): Gang => {
  const poles = ids.map(id => byId[id]!)
  return { poles, zs: zs ?? poles.map(p => p.a[2]), side: sideOf(poles[0]!), length: poles[0]!.length, cm: cm ?? weightAt(poles[0]!) }
}
/** distance from the bank end to s from end a */
const fromFoot = (p: Pole, t: number): number => (footEnd(p) === 0 ? t : p.length - t)
/** the rod's centre of weight, metres from its bank end */
function weightAt(p: Pole): number {
  let m = 0, w = 0
  for (let i = 0; i <= 40; i++) { const t = (p.length * i) / 40, r = radiusAt(p, fromFoot(p, t)); m += t * r * r; w += r * r }
  return m / w
}
/** how far a rod's stubs and knots stand out below its girth near t (from its bank end), lying on a line on its side
 * of the stream: a log meets those first */
function outgrowth(p: Pole, t: number, side: -1 | 1): number {
  // a rod's own up runs along its way from end a, turned a quarter: up or down in the world with that way's sense
  const up = footEnd(p) === 0 ? -side : side
  let pad = 0
  for (const st of p.stubs) if (Math.abs(fromFoot(p, st.s) - t) < 0.08 + st.r) pad = Math.max(pad, (st.len + st.r) * Math.max(0, -Math.cos(st.ang) * up))
  for (const k of p.knots) if (Math.abs(fromFoot(p, k.s) - t) < k.w) pad = Math.max(pad, k.amp * Math.max(0, -Math.cos(k.ang) * up))
  return pad
}
const SAMPLES = 32
/** the line on which the gang lies lowest with its bank end at x: the ground and the stream sampled along it, each log it
 * may lie across met exactly where the line touches it */
function restLine(g: Gang, x: number): Line {
  const L = g.length
  const ts = g.poles.map(p => Array.from({ length: SAMPLES + 1 }, (_, i) => (p.length * i) / SAMPLES))
  const rs = g.poles.map((p, k) => ts[k]!.map(t => radiusAt(p, fromFoot(p, t))))
  const cm = g.cm
  const logs = LOGS.filter(l => Math.abs(l.o[0] - x) < L + 0.5 && g.zs.some(z => Math.abs(z) <= l.half))
  const lift = (phi: number): number => {
    const c = Math.cos(phi), s = Math.sin(phi)
    let y = -Infinity
    for (let k = 0; k < g.poles.length; k++) for (let i = 0; i <= SAMPLES; i++) {
      const t = ts[k]![i]!, px = x - g.side * t * c
      y = Math.max(y, groundFloor(px, g.zs[k]!, rs[k]![i]!) - t * s)
    }
    for (const { o } of logs) for (const p of g.poles) {
      const L = p.length
      // the line touching the log from above, if it touches within the rod; else the end that lies over it
      const r0 = radiusAt(p, fromFoot(p, Math.min(L, Math.max(0, (o[0] - x) * -g.side * c))))
      const need = o[1] + (SEAT_R + r0 - (x - o[0]) * g.side * s) / c
      const at = (o[0] - x) * -g.side * c + (o[1] - need) * s
      // the line over the log within the rod, and each end that comes over it (a rod climbing the log end first)
      if (at >= 0 && at <= L) y = Math.max(y, o[1] + (SEAT_R + radiusAt(p, fromFoot(p, at)) + outgrowth(p, at, g.side) + 0.003 - (x - o[0]) * g.side * s) / c)
      for (const t of [0, L]) {
        const reach = SEAT_R + radiusAt(p, fromFoot(p, t)) + 0.006, dx = x - g.side * t * c - o[0]
        if (Math.abs(dx) < reach) y = Math.max(y, o[1] + Math.sqrt(reach * reach - dx * dx) - t * s)
      }
    }
    return y
  }
  const height = (phi: number): number => lift(phi) + cm * Math.sin(phi)
  let best = 0, bestH = Infinity
  for (let phi = -0.8; phi <= 0.8; phi += 0.04) { const h = height(phi); if (h < bestH) { bestH = h; best = phi } }
  let lo = best - 0.04, hi = best + 0.04
  for (let i = 0; i < 18; i++) {
    const a = lo + (hi - lo) * 0.382, b = lo + (hi - lo) * 0.618
    if (height(a) < height(b)) hi = b; else lo = a
  }
  const phi = (lo + hi) / 2
  return { x, y: lift(phi), phi }
}
/** a rod's pose on a line in a plane */
function poseOnLine(p: Pole, l: Line, z: number, side: -1 | 1): Pose {
  const foot: V3 = [l.x, l.y, z]
  const other: V3 = [l.x - side * p.length * Math.cos(l.phi), l.y + p.length * Math.sin(l.phi), z]
  return footEnd(p) === 0 ? fromEnds(foot, other) : fromEnds(other, foot)
}
/** where along the rod, from its bank end, the line passes nearest a point of its plane */
const nearestOn = (l: Line, side: -1 | 1, q: [number, number]): number => (q[0] - l.x) * -side * Math.cos(l.phi) + (q[1] - l.y) * Math.sin(l.phi)

// ---------------------------------------------------------------- tracks

/** a move between two times: a pose for each eased share of it; tabled moves are sampled once */
interface Seg { t0: number; t1: number; at: (f: number) => Pose; eased?: boolean }
type Track = Seg[]
function tabled(t0: number, t1: number, sample: (f: number) => Pose, n: number): Seg {
  const poses = Array.from({ length: n + 1 }, (_, i) => sample(i / n))
  return {
    t0, t1, at: f => {
      const x = clamp01(f) * n, i = Math.min(n - 1, Math.floor(x))
      return blend(poses[i]!, poses[i + 1]!, x - i)
    },
  }
}
function poseOn(track: Track, u: number): Pose {
  if (u <= track[0]!.t0) return track[0]!.at(0)
  for (let i = 0; i < track.length; i++) {
    const seg = track[i]!
    if (u < seg.t1) {
      if (u < seg.t0) return track[i - 1]!.at(1)
      const f = (u - seg.t0) / (seg.t1 - seg.t0)
      return seg.at(seg.eased === false ? f : ease(f))
    }
  }
  return track[track.length - 1]!.at(1)
}
const steps = (s: Step, every = 0.08): number => Math.max(8, Math.round((s[1] - s[0]) / every))
/** a rod's end dropping off a log changes its line fast: those moves are tabled finer */
const OVER_LOGS = 0.012

/** The yard to the stream: pushed out over the seat, tipped when its weight passes the log, slid on (a seat rod until
 * its foot lies on the seat; any other rod off the seat and into the stream until it floats). Returns the gang's track
 * pieces for each of its rods and the line it ends on. */
function outOfTheYard(g: Gang, m: Moves, intoStream: boolean): { segs: Seg[][]; end: Line } {
  const seat = SEAT_XY[g.side < 0 ? 0 : 1], O: [number, number] = [seat[0], seat[1]]
  const p0 = g.poles[0]!, cm = g.cm
  const start = g.side * YARD[p0.id]!.foot
  // the push ends with the weight over the seat's axis
  const tipX = seat[0] + g.side * cm
  const lines = new Map<number, Line>()
  const pushed = (f: number): Line => { const x = start + (tipX - start) * f; let l = lines.get(x); if (!l) lines.set(x, (l = restLine(g, x))); return l }
  const before = pushed(1)
  // tipped about the seat's axis until the far end lies on the stream
  const far = (l: Line): number => l.y + g.poles[0]!.length * Math.sin(l.phi)
  const tipLine = (d: number): Line => {
    // the line turned about the seat's axis: its bank end moves on its own circle round the axis
    const fx = before.x - O[0], fy = before.y - O[1], rz = -g.side * d
    const c = Math.cos(rz), s = Math.sin(rz)
    return { x: O[0] + fx * c - fy * s, y: O[1] + fx * s + fy * c, phi: before.phi + d }
  }
  // it tips until it lies on the stream or on the bank's edge, whichever it meets first
  const clear = (l: Line): boolean => {
    for (let k = 0; k < g.poles.length; k++) for (let i = 4; i <= SAMPLES; i++) {
      const t = (g.poles[k]!.length * i) / SAMPLES, px = l.x - g.side * t * Math.cos(l.phi), py = l.y + t * Math.sin(l.phi)
      if (py < groundFloor(px, g.zs[k]!, radiusAt(g.poles[k]!, fromFoot(g.poles[k]!, t)))) return false
    }
    return true
  }
  let lo = -1.2, hi = 0
  for (let i = 0; i < 40; i++) { const m2 = (lo + hi) / 2; if (clear(tipLine(m2))) hi = m2; else lo = m2 }
  const dTip = hi, after = tipLine(dTip)
  void far
  // slid on: a seat rod until the seat bears where it bears in place; any other until all of it floats
  const footBear = p0.bears[footEnd(p0) === 0 ? 0 : p0.bears.length - 1]!
  const bearAt = footEnd(p0) === 0 ? footBear : p0.length - footBear
  let endX: number
  if (intoStream) endX = g.side * 2.65
  else {
    let a = after.x, b = after.x - g.side * 3
    for (let i = 0; i < 22; i++) { const mid = (a + b) / 2; if (nearestOn(restLine(g, mid), g.side, O) > bearAt) a = mid; else b = mid }
    endX = (a + b) / 2
  }
  const slid = (f: number): Line => { if (f <= 0) return after; const x = after.x + (endX - after.x) * f; let l = lines.get(x); if (!l) lines.set(x, (l = restLine(g, x))); return l }
  const end = slid(1)
  const segs = g.poles.map((p, k) => {
    const z = g.zs[k]!
    return [
      tabled(m.push![0], m.push![1], f => poseOnLine(p, pushed(f), z, g.side), steps(m.push!, OVER_LOGS)),
      tabled(m.tip![0], m.tip![1], f => poseOnLine(p, tipLine(dTip * f), z, g.side), 12),
      tabled(m.slide![0], m.slide![1], f => poseOnLine(p, slid(f), z, g.side), steps(m.slide!, OVER_LOGS)),
    ]
  })
  return { segs, end }
}

const tracks: Record<string, Track> = {}
const yardPose: Record<string, Pose> = {}

/** a kit's centre of weight from its bank end, along its leading rod: every member's weight where it lies */
function kitWeight(lead: string): number {
  const p0 = byId[lead]!, f = finalPose(p0), o = place(f, [(footEnd(p0) === 0 ? -1 : 1) * p0.length / 2, 0, 0]), d = norm(sub(place(f, [0, 0, 0]), o))
  let m = 0, w = 0
  for (const id of [lead, ...KITS[lead]!]) {
    const p = byId[id]!, pf = finalPose(p)
    for (let i = 0; i <= 40; i++) {
      const s = (p.length * i) / 40, r = radiusAt(p, s), q = place(pf, [s - p.length / 2, 0, 0])
      m += dot(sub(q, o), d) * r * r; w += r * r
    }
  }
  return m / w
}
/** a kit: out of its yard on its leading rod's line, its other rods lying along that line in their planes, then
 * raised on its props, pivoting on the seat log; its members ride on the leading rod */
function seatRods(ids: string[]): void {
  const lead = ids[0]!
  const rods = [lead, ...KITS[lead]!.filter(id => byId[id]!.kind !== 'joist')]
  const g = gangOf(rods, undefined, kitWeight(lead)), m = MOVES[lead]!
  const { segs, end } = outOfTheYard(g, m, false)
  g.poles.slice(0, 1).forEach((p, k) => {
    const seat = SEAT_XY[g.side < 0 ? 0 : 1], O: V3 = [seat[0], seat[1], g.zs[k]!]
    const f = finalPose(p), d = norm(sub(p.b, p.a))
    const phiFinal = Math.asin(footEnd(p) === 0 ? d[1] : -d[1])
    const turn = -g.side * (end.phi - phiFinal)
    const from = poseOnLine(p, end, g.zs[k]!, g.side)
    yardPose[p.id] = segs[k]![0]!.at(0)
    tracks[p.id] = [...segs[k]!, {
      t0: m.lift![0], t1: m.lift![1],
      // any difference between the solved rest and the pivot's start is taken up in the first tenth
      at: q => { const pv = turned(f, O, turn * (1 - q)); return q < 0.1 ? blend(from, pv, q / 0.1) : pv },
    }]
  })
}

/** the crown rods: out of the yard into the stream, floated to under the crown and across to their planes, raised level */
function crownRods(ids: string[]): void {
  const g = gangOf(ids, ids.map(id => YARD[id]!.z)), m = MOVES[ids[0]!]!
  const { segs, end } = outOfTheYard(g, m, true)
  g.poles.forEach((p, k) => {
    const f = finalPose(p)
    const floating = moved(f, [0, WATER_AXIS - (p.a[1] + p.b[1]) / 2, 0])
    const off = poseOnLine(p, end, g.zs[k]!, g.side)
    const under = moved(floating, [0, 0, g.zs[k]! - p.a[2]])
    yardPose[p.id] = segs[k]![0]!.at(0)
    tracks[p.id] = [...segs[k]!,
      { t0: m.float![0], t1: m.float![1], at: q => blend(off, under, q) },
      { t0: m.drift![0], t1: m.drift![1], at: q => blend(under, floating, q) },
      { t0: m.lift![0], t1: m.lift![1], at: q => blend(floating, f, q) },
    ]
  })
}

/** a second-bay rod: out of the yard into the stream; its bank end raised onto the first joist while its far end floats;
 * then raised on its far prop, pivoting on the joist */
function secondRods(ids: string[]): void {
  const g = gangOf(ids), m = MOVES[ids[0]!]!
  const { segs, end } = outOfTheYard(g, m, true)
  g.poles.forEach((p, k) => {
    const z = g.zs[k]!, side = g.side, L = p.length
    const J = JOIST_XY[side < 0 ? 1 : 5]!, Jc: V3 = [J[0], J[1], z]
    const f = finalPose(p), d = floatTurn(p), laid = turned(f, Jc, d)
    const footOf = (pose: Pose): V3 => place(pose, [(footEnd(p) === 0 ? -1 : 1) * L / 2, 0, 0])
    const rest = footOf(laid)
    // the bank end's way: straight up beside the joist, across over it, down onto it
    const x0 = side * 2.6, high = rest[1] + 0.12
    const legs: [number, number][] = [[x0, WATER_AXIS], [x0, high], [rest[0], high], [rest[0], rest[1]]]
    const lens = legs.slice(1).map((q, i) => Math.hypot(q[0] - legs[i]![0], q[1] - legs[i]![1]))
    const total = lens.reduce((s, v) => s + v, 0)
    const footAt = (q: number): [number, number] => {
      let dist = q * total
      for (let i = 0; i < lens.length; i++) {
        if (dist <= lens[i]! || i === lens.length - 1) { const t = Math.min(1, dist / lens[i]!); return [legs[i]![0] + (legs[i + 1]![0] - legs[i]![0]) * t, legs[i]![1] + (legs[i + 1]![1] - legs[i]![1]) * t] }
        dist -= lens[i]!
      }
      return legs[legs.length - 1]!
    }
    // the rod from its bank end down to its far end on the stream
    const hanging = (F: [number, number]): Pose => {
      const s = Math.max(-1, Math.min(1, (WATER_AXIS - F[1]) / L))
      return poseOnLine(p, { x: F[0], y: F[1], phi: Math.asin(s) }, z, side)
    }
    const start = hanging(legs[0]!), off = poseOnLine(p, end, z, side)
    yardPose[p.id] = segs[k]![0]!.at(0)
    tracks[p.id] = [...segs[k]!,
      { t0: m.float![0], t1: m.float![1], at: q => blend(off, start, q) },
      tabled(m.foot![0], m.foot![1], q => (q >= 1 ? laid : hanging(footAt(q))), steps(m.foot!)),
      { t0: m.lift![0], t1: m.lift![1], at: q => turned(f, Jc, d * (1 - q)) },
    ]
  })
}

/** a joist rolled off its bank into the stream: where its axis lies as it rolls, on the two high points of the bank under
 * it either side of its middle (or afloat): its middle's height and its fall along its length */
function rollRest(x: number, zc: number): { y: number; fall: number } {
  const r = 0.075, n = 8
  const h = Array.from({ length: n + 1 }, (_, k) => {
    const z = zc + JOIST_HALF * (2 * k / n - 1)
    let y = WATER_AXIS
    for (let i = -6; i <= 6; i++) { const dx = (r * i) / 6; y = Math.max(y, groundY(x + dx, z) + Math.sqrt(r * r - dx * dx)) }
    return y
  })
  let best = { y: Infinity, fall: 0 }
  for (let i = 0; i <= n / 2; i++) for (let j = n / 2; j <= n; j++) {
    const fall = i === j ? 0 : (h[j]! - h[i]!) / (j - i), y = h[i]! + fall * (n / 2 - i)
    if (y < best.y && h.every((v, k) => v <= h[i]! + fall * (k - i) + 1e-6)) best = { y, fall: fall / ((2 * JOIST_HALF) / n) }
  }
  return best
}
/** a joist that goes by water: rolled off the bank, floated out in front, in under its place, raised */
function waterJoist(id: string): void {
  const p = byId[id]!, m = MOVES[id]!, f = finalPose(p)
  const [px, pz] = JOIST_PILE[id]!
  const side = px < 0 ? -1 : 1, intoX = side * 2.5
  const rolled = (x: number): Pose => {
    const { y, fall } = rollRest(x, pz)
    return { at: [x, y, pz], q: qmul(axisAngle([1, 0, 0], -Math.atan(fall)), qmul(axisAngle([0, 0, 1], -(x - px) / 0.075), f.q)) }
  }
  // afloat it turns back to lie as it will lie in place, the short way
  const turns = -(intoX - px) / 0.075, settle = Math.round(turns / (2 * Math.PI)) * 2 * Math.PI
  const unroll = (q: number, at: V3): Pose => ({ at, q: qmul(axisAngle([0, 0, 1], settle + (turns - settle) * (1 - q)), f.q) })
  const wait: V3 = [p.a[0], WATER_AXIS, JOIST_WAIT_Z[id]!], below: V3 = [p.a[0], WATER_AXIS, 0]
  yardPose[id] = rolled(px)
  const track: Track = [
    tabled(m.roll![0], m.roll![1], q => rolled(px + (intoX - px) * q), steps(m.roll!)),
    { t0: m.float![0], t1: m.float![1], at: q => unroll(q, lerp([intoX, WATER_AXIS, pz], wait, q)) },
    { t0: m.drift![0], t1: m.drift![1], at: q => ({ at: lerp(wait, below, q), q: f.q }) },
    { t0: m.lift![0], t1: m.lift![1], at: q => ({ at: lerp(below, f.at, q), q: f.q }) },
  ]
  tracks[id] = track
}

/** the crown joist: lifted from its logs on the bank on its props and walked out over the stream in front of the
 * bridge, then threaded in along its length */
function bankJoist(id: string): void {
  const p = byId[id]!, m = MOVES[id]!, f = finalPose(p)
  const [px, pz] = JOIST_PILE[id]!
  const pile: V3 = [px, J3_REST, pz], raised: V3 = [f.at[0], f.at[1], THREAD_Z]
  yardPose[id] = { at: pile, q: f.q }
  tracks[id] = [
    { t0: m.lift![0], t1: m.lift![1], at: q => ({ at: lerp(pile, raised, q), q: f.q }) },
    { t0: m.thread![0], t1: m.thread![1], at: q => ({ at: lerp(raised, f.at, q), q: f.q }) },
  ]
}

/** the tracks are solved the first time the bridge moves, not when the wing loads */
let solved = false
function solve(): void {
  if (solved) return
  solved = true
  // each kit goes out on its leading rod; the rest each on its own line
  for (const id of Object.keys(KITS)) seatRods([id])
  for (const id of ['R3A', 'R3B']) crownRods([id])
  for (const id of ['R2A', 'R2B', 'R4A', 'R4B']) secondRods([id])
  for (const id of ['J2', 'J4']) waterJoist(id)
  bankJoist('J3')
}

/** a kit's member rides on its leading rod, held to it by the kit's lashings */
function ridingPose(id: string, u: number): Pose {
  const rod = RIDES[id]!, p = byId[id]!, rp = byId[rod]!
  const rel = qmul(inverse(finalPose(rp).q), finalPose(p).q)
  const relAt = rotate(inverse(finalPose(rp).q), sub(finalPose(p).at, finalPose(rp).at))
  const base = poseOn(tracks[rod]!, u)
  return { at: add(base.at, rotate(base.q, relAt)), q: qmul(base.q, rel) }
}

// ---------------------------------------------------------------- the props

/** the point a prop holds on its load, and the load's way there, at the build clock u; the crown joist's props hold still
 * while it is threaded over them */
function heldAt(s: Prop, u: number): { P: V3; D: V3 } {
  const load = byId[s.load]!, m = movesOf(s.load)
  const v = m.thread ? Math.min(u, m.lift![1]) : u
  const pose = poseAtClock(s.load, v), at = holdAt(s, u)
  const P = place(pose, [at - load.length / 2, 0, bowAt(load, at)])
  return { P, D: rotate(pose.q, [1, 0, 0]) }
}
/** where along its load a prop holds at u: its load may slide along its fork */
function holdAt(s: Prop, u: number): number {
  if (!s.slide) return s.s
  return s.s + (s.slide.s - s.s) * ease((u - s.slide.at[0]) / (s.slide.at[1] - s.slide.at[0]))
}
/** the prop's stance under a held point: the angle at which its foot stands on the ground */
function stanceUnder(s: Prop, P: V3, D: V3, hold = s.s): { foot: V3; u: V3; h: number } {
  const load = byId[s.load]!, r = radiusAt(load, hold)
  const at = (th: number): { foot: V3; u: V3; h: number; gap: number } => {
    const u: V3 = [-s.away[0] * Math.cos(th), Math.sin(th), -s.away[1] * Math.cos(th)]
    const phi = Math.acos(Math.min(1, Math.abs(dot(u, D))))
    const h = crotchDepth(r, phi), reach = h + s.length
    const foot = sub(P, mul(u, reach))
    return { foot, u, h, gap: foot[1] - footHeight(foot[0], foot[2]) }
  }
  let lo = 0.02, hi = 1.56
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (at(mid).gap > 0) lo = mid; else hi = mid }
  const { foot, u, h } = at((lo + hi) / 2)
  return { foot, u, h }
}
/** the ground's way up at a point */
function groundNormal(x: number, z: number): V3 {
  const h = 0.05
  return norm([groundY(x - h, z) - groundY(x + h, z), 2 * h, groundY(x, z - h) - groundY(x, z + h)])
}
/** a prop's pose from its foot and its way up, its tines turned across its load (or along the ground, lying) */
function propPose(s: Prop, foot: V3, u: V3, D: V3 | null): Pose {
  const head = add(foot, mul(u, s.length))
  const across = D ? cross(u, D) : cross(u, groundNormal(head[0], head[2]))
  const n = Math.hypot(...across) > 1e-4 ? norm(across) : norm(cross(u, [0, 0, 1]))
  return { at: add(foot, mul(u, s.length / 2)), q: basis(u, cross(n, u)) }
}
/** lying on the ground from its foot, its head toward its load */
function lyingPose(s: Prop, foot: V3): Pose {
  let lo = -0.5, hi = 1.0
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const u: V3 = [-s.away[0] * Math.cos(mid), Math.sin(mid), -s.away[1] * Math.cos(mid)]
    let above = true
    for (let k = 1; k <= 12 && above; k++) { const q = add(foot, mul(u, (s.length * k) / 12)); if (q[1] < groundY(q[0], q[2]) + STRUT_R) above = false }
    if (above) hi = mid; else lo = mid
  }
  const th = hi
  return propPose(s, foot, [-s.away[0] * Math.cos(th), Math.sin(th), -s.away[1] * Math.cos(th)], null)
}
/** how far short of its load a prop's crotch stops before it slides in along itself, so its fork meets the load
 * open side first rather than swinging a tine through it */
const SLIDE_IN = 0.4
/** let go, it backs off further before it is swung over, its head clear of the rods it stood under */
const SLIDE_OUT = 0.6
/** the foot on the ground, in the prop's plane, a prop's length below a crotch */
function footUnder(s: Prop, C: V3): { foot: V3; u: V3 } {
  const at = (th: number): { foot: V3; u: V3; gap: number } => {
    const u: V3 = [-s.away[0] * Math.cos(th), Math.sin(th), -s.away[1] * Math.cos(th)]
    const foot = sub(C, mul(u, s.length))
    return { foot, u, gap: foot[1] - footHeight(foot[0], foot[2]) }
  }
  let lo = 0.02, hi = 1.56
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (at(mid).gap > 0) lo = mid; else hi = mid }
  const { foot, u } = at((lo + hi) / 2)
  return { foot, u }
}
interface Approach { touchFoot: V3; touchU: V3; D: V3; crotch: V3; backFoot: V3; backU: V3; backCrotch: V3 }
const approaches: Record<string, Approach> = {}
function approachOf(s: Prop): Approach {
  const known = approaches[s.id]
  if (known) return known
  const T = PROP_TIMES[s.id]!, { P, D } = heldAt(s, T.rise[1]), st = stanceUnder(s, P, D, holdAt(s, T.rise[1]))
  const crotch = add(st.foot, mul(st.u, s.length)), backCrotch = sub(crotch, mul(st.u, SLIDE_IN))
  const back = footUnder(s, backCrotch)
  return (approaches[s.id] = { touchFoot: st.foot, touchU: st.u, D, crotch, backFoot: back.foot, backU: back.u, backCrotch })
}
/** sliding in: the foot walks in on the ground while the crotch runs along the prop's line to its load */
function slidingIn(s: Prop, a: Approach, q: number): Pose {
  const f = lerp(a.backFoot, a.touchFoot, q)
  f[1] = footHeight(f[0], f[2])
  return propPose(s, f, norm(sub(lerp(a.backCrotch, a.crotch, q), f)), a.D)
}
/** an idle prop lies up or down the stream from the bridge, its head toward it (as it starts) or away from it (laid down
 * outward): its foot's place, out along its plane from a foot where it stood, so that all of it is clear */
function parkFoot(s: Prop, from: V3, headIn: boolean): V3 {
  const side = Math.sign(s.away[1]), edge = side < 0 ? PARK_UP : PARK_DOWN
  const d = Math.max(0, edge - (side * from[2] - (headIn ? s.length : 0)))
  const f: V3 = [from[0], 0, from[2] + side * d]
  f[1] = footHeight(f[0], f[2])
  return f
}
/** lying on the bed from its foot, its head toward its load or (laid down outward) away from it */
function lyingFrom(s: Prop, foot: V3, headIn: boolean): Pose {
  if (headIn) return lyingPose(s, foot)
  return lyingPose({ ...s, away: [-s.away[0], -s.away[1]] }, foot)
}
/** lying, its foot sliding along the bed between two places */
function slidingOnBed(s: Prop, from: V3, to: V3, q: number, headIn: boolean): Pose {
  const f = lerp(from, to, q)
  f[1] = footHeight(f[0], f[2])
  return lyingFrom(s, f, headIn)
}
/** the stance it holds its load in when let go, and the same stance backed off along itself */
const releases: Record<string, Approach> = {}
function releaseOf(s: Prop): Approach {
  const known = releases[s.id]
  if (known) return known
  const T = PROP_TIMES[s.id]!, m = movesOf(s.load), v = Math.min(T.release, m.thread ? m.lift![1] : poleLand(s.load))
  const { P, D } = heldAt(s, v), st = stanceUnder(s, P, D, holdAt(s, v))
  const crotch = add(st.foot, mul(st.u, s.length)), backCrotch = sub(crotch, mul(st.u, SLIDE_OUT))
  const back = footUnder(s, backCrotch)
  return (releases[s.id] = { touchFoot: st.foot, touchU: st.u, D, crotch, backFoot: back.foot, backU: back.u, backCrotch })
}
/** laid down outward: swung up over its foot and down on the far side, away from the bridge */
function swungOver(s: Prop, a: Approach, q: number): Pose {
  const th0 = Math.asin(Math.min(1, a.backU[1])), out = lyingFrom(s, a.backFoot, false)
  const th1 = Math.PI - Math.asin(Math.min(1, Math.max(-1, rotate(out.q, [1, 0, 0])[1])))
  const th = th0 + (th1 - th0) * q
  const u: V3 = [-s.away[0] * Math.cos(th), Math.sin(th), -s.away[1] * Math.cos(th)]
  const pose = propPose(s, a.backFoot, u, a.D)
  if (q < 0.7) return pose
  // turned onto its side about its foot, which stays on the ground
  const turned = slerp(pose.q, out.q, ease((q - 0.7) / 0.3))
  return { at: add(a.backFoot, mul(rotate(turned, [1, 0, 0]), s.length / 2)), q: turned }
}
/** turned about its foot from one pose to another that stand on the same foot, the foot staying put */
function aboutFoot(s: Prop, foot: V3, a: Pose, b: Pose, f: number): Pose {
  const q = slerp(a.q, b.q, f)
  return { at: add(foot, mul(rotate(q, [1, 0, 0]), s.length / 2)), q }
}
function propAt(s: Prop, u: number): Pose {
  const T = PROP_TIMES[s.id]!, land = poleLand(s.load), a = approachOf(s)
  const holding = (v: number): Pose => { const { P, D } = heldAt(s, v), st = stanceUnder(s, P, D, holdAt(s, v)); return propPose(s, st.foot, st.u, D) }
  const lying = (): Pose => lyingPose(s, a.backFoot)
  const back = (): Pose => propPose(s, a.backFoot, a.backU, a.D)
  const outward = laysOutward(s)
  if (u <= T.rise[0]) {
    if (!T.parkIn) return lying()
    const park = parkFoot(s, a.backFoot, true)
    return u <= T.parkIn[0] ? lyingPose(s, park) : slidingOnBed(s, park, a.backFoot, ease((u - T.parkIn[0]) / (T.parkIn[1] - T.parkIn[0])), true)
  }
  if (u < T.rise[1]) {
    const f = (u - T.rise[0]) / (T.rise[1] - T.rise[0])
    return f < 0.7 ? aboutFoot(s, a.backFoot, lying(), back(), ease(f / 0.7)) : slidingIn(s, a, ease((f - 0.7) / 0.3))
  }
  if (u < T.down[0]) return holding(u)
  if (outward) {
    // backed off its load along itself, swung over and laid down outward, then slid out along the bed
    const r = releaseOf(s)
    if (u >= T.down[1]) {
      if (!T.parkOut) return lyingFrom(s, r.backFoot, false)
      const park = parkFoot(s, r.backFoot, false)
      return u >= T.parkOut[1] ? lyingFrom(s, park, false) : slidingOnBed(s, r.backFoot, park, ease((u - T.parkOut[0]) / (T.parkOut[1] - T.parkOut[0])), false)
    }
    const f = (u - T.down[0]) / (T.down[1] - T.down[0])
    return f < 0.25 ? slidingIn(s, r, 1 - ease(f / 0.25)) : swungOver(s, r, ease((f - 0.25) / 0.75))
  }
  if (u >= T.down[1]) {
    if (!T.parkOut) return lying()
    const park = parkFoot(s, a.backFoot, true)
    return u >= T.parkOut[1] ? lyingPose(s, park) : slidingOnBed(s, a.backFoot, park, ease((u - T.parkOut[0]) / (T.parkOut[1] - T.parkOut[0])), true)
  }
  // laid down: its head goes back the way its load's point came up, it slides out from under, then it lies on the bed
  const f = (u - T.down[0]) / (T.down[1] - T.down[0])
  const m = movesOf(s.load), from = Math.min(T.release, m.thread ? m.lift![1] : land)
  if (f < 0.5) return holding(from - (from - T.rise[1]) * ease(f / 0.5))
  if (f < 0.65) return slidingIn(s, a, 1 - ease((f - 0.5) / 0.15))
  return aboutFoot(s, a.backFoot, back(), lying(), ease((f - 0.65) / 0.35))
}
const poleLand = landOf

// ---------------------------------------------------------------- the clock

export const PLACED: Record<string, Pose> = Object.fromEntries(POLES.map(p => [p.id, p.kind === 'strut' ? fromEnds(p.a, p.b) : finalPose(p)]))
const PROP_BY: Record<string, Prop> = Object.fromEntries(PROPS.map(s => [s.id, s]))

function poseAtClock(id: string, u: number): Pose {
  solve()
  if (RIDES[id]) return ridingPose(id, u)
  return poseOn(tracks[id]!, u)
}
/** a pole at the build clock `u`, and how far it stands from its place */
export function poseAt(id: string, u: number): Pose & { off: number } {
  const prop = PROP_BY[id]
  const pose = prop ? propAt(prop, u) : poseAtClock(id, u)
  const d = sub(pose.at, PLACED[id]!.at)
  return { ...pose, off: Math.hypot(d[0], d[1], d[2]) }
}

/** every pole's pose at a time in the cycle */
export function bridgePoses(time: number): Record<string, Pose & { off: number }> {
  const u = buildClock(time)
  return Object.fromEntries(POLES.map(p => [p.id, poseAt(p.id, u)]))
}
export { ORDER, SEAT_R }
