/* THE OPENING'S FLIGHT, pure: the camera from the first frame to the walk's
   first step. The way is a clamped cubic B-spline through the authored control
   points (continuous in position, heading and curvature, so a turn never
   kinks); the camera runs along it by arc length, its speed an eased profile of
   its own (rest at the first frame, then a smooth climb to cruise, a long
   braking, and the walker's own pace at the end, so the walk goes on without a
   cut). The look is a point on a track of its own, eased between keys, so the
   subject stays where the frame put it while the camera turns round it. No DOM
   and no imports: node mounts it (`--experimental-strip-types`). */

export type V3 = [number, number, number]

export interface LookKey { t: number; at: V3 }
export interface NumKey { t: number; v: number }

export interface FlightSpec {
  duration: number
  /** B-spline control points in the scene's frame; the first and last are where it starts and ends */
  points: V3[]
  /** the speed's shape: keys of relative speed, scaled so the way is covered in time */
  speed: NumKey[]
  /** the walker's pace at the end (m/s), reached from `walkFrom` seconds on */
  walk: number
  walkFrom: number
  look: LookKey[]
  phoneLook: LookKey[]
  hfov: NumKey[]
  phoneHfov: NumKey[]
  shift?: NumKey[]
  phoneShift?: NumKey[]
}

export interface FlightSample {
  t: number
  pos: V3
  look: V3
  phoneLook: V3
  hfov: number
  phoneHfov: number
  shift: number
  phoneShift: number
  /** metres along the way, and the speed along it */
  s: number
  speed: number
}

/** a monotone cubic through (t, v) keys (Fritsch and Carlson): no overshoot, continuous slope */
export function monotone(keys: NumKey[]): (t: number) => number {
  const n = keys.length
  if (n === 1) return () => keys[0]!.v
  const d: number[] = []
  for (let i = 0; i + 1 < n; i++) d.push((keys[i + 1]!.v - keys[i]!.v) / (keys[i + 1]!.t - keys[i]!.t))
  const m: number[] = new Array(n).fill(0)
  m[0] = d[0]!
  m[n - 1] = d[n - 2]!
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2
  for (let i = 0; i + 1 < n; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i]! / d[i]!, b = m[i + 1]! / d[i]!
    const h = a * a + b * b
    if (h > 9) {
      const k = 3 / Math.sqrt(h)
      m[i] = k * a * d[i]!
      m[i + 1] = k * b * d[i]!
    }
  }
  // a key whose two neighbours hold the same value is a plateau: flat there
  return (t: number): number => {
    if (t <= keys[0]!.t) return keys[0]!.v
    if (t >= keys[n - 1]!.t) return keys[n - 1]!.v
    let i = 0
    while (i + 2 < n && keys[i + 1]!.t <= t) i++
    const a = keys[i]!, b = keys[i + 1]!
    const h = b.t - a.t, u = (t - a.t) / h
    const u2 = u * u, u3 = u2 * u
    return (2 * u3 - 3 * u2 + 1) * a.v + (u3 - 2 * u2 + u) * h * m[i]! + (-2 * u3 + 3 * u2) * b.v + (u3 - u2) * h * m[i + 1]!
  }
}

/** smootherstep, flat in slope and curvature at both ends */
const ease = (u: number): number => {
  const x = Math.min(1, Math.max(0, u))
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/** a point track eased key to key (each leg a smootherstep), so the look rests at every key */
function track(keys: LookKey[]): (t: number) => V3 {
  return (t: number): V3 => {
    if (t <= keys[0]!.t) return keys[0]!.at
    const last = keys[keys.length - 1]!
    if (t >= last.t) return last.at
    let i = 0
    while (i + 2 < keys.length && keys[i + 1]!.t <= t) i++
    const a = keys[i]!, b = keys[i + 1]!
    const u = ease((t - a.t) / (b.t - a.t))
    return [0, 1, 2].map((c) => a.at[c]! + (b.at[c]! - a.at[c]!) * u) as V3
  }
}

/** the clamped uniform cubic B-spline of the points, at u in [0, 1] */
function bspline(P: V3[]): (u: number) => V3 {
  const C = [P[0]!, P[0]!, ...P, P[P.length - 1]!, P[P.length - 1]!]
  const segs = C.length - 3
  return (u: number): V3 => {
    const x = Math.min(Math.max(u, 0), 1) * segs
    const i = Math.min(segs - 1, Math.floor(x))
    const f = x - i
    const b0 = ((1 - f) ** 3) / 6, b1 = (3 * f ** 3 - 6 * f ** 2 + 4) / 6, b2 = (-3 * f ** 3 + 3 * f ** 2 + 3 * f + 1) / 6, b3 = f ** 3 / 6
    return [0, 1, 2].map((c) => b0 * C[i]![c]! + b1 * C[i + 1]![c]! + b2 * C[i + 2]![c]! + b3 * C[i + 3]![c]!) as V3
  }
}

export function makeFlight(spec: FlightSpec) {
  const T = spec.duration
  const curve = bspline(spec.points)
  /* arc length table */
  const N = 20000
  const us: number[] = [0], ss: number[] = [0]
  let prev = curve(0), acc = 0
  for (let k = 1; k <= N; k++) {
    const u = k / N
    const p = curve(u)
    acc += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2])
    us.push(u)
    ss.push(acc)
    prev = p
  }
  const length = acc
  const atS = (s: number): V3 => {
    const x = Math.min(Math.max(s, 0), length)
    let lo = 0, hi = N
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (ss[mid]! < x) lo = mid
      else hi = mid
    }
    const f = ss[hi]! > ss[lo]! ? (x - ss[lo]!) / (ss[hi]! - ss[lo]!) : 0
    return curve(us[lo]! + (us[hi]! - us[lo]!) * f)
  }
  /* speed: k times the shape, plus the walker's pace eased in at the end; k so the way is covered at T */
  const shape = monotone(spec.speed)
  const walk = (t: number): number => spec.walk * ease((t - spec.walkFrom) / Math.max(1e-6, T - spec.walkFrom))
  const DT = 1 / 600
  let ia = 0, ib = 0
  for (let t = 0; t < T; t += DT) {
    ia += Math.max(0, shape(t + DT / 2)) * DT
    ib += walk(t + DT / 2) * DT
  }
  const k = (length - ib) / ia
  const speedAt = (t: number): number => k * Math.max(0, shape(t)) + walk(t)
  const sTable: number[] = [0]
  for (let i = 1, s = 0; i <= Math.ceil(T / DT); i++) {
    const t = i * DT
    s += speedAt(t - DT / 2) * DT
    sTable.push(s)
  }
  const sAt = (t: number): number => {
    const x = Math.min(Math.max(t, 0), T) / DT
    const i = Math.min(sTable.length - 2, Math.floor(x))
    return sTable[i]! + (sTable[i + 1]! - sTable[i]!) * (x - i)
  }
  const look = track(spec.look), phoneLook = track(spec.phoneLook)
  const hfov = monotone(spec.hfov), phoneHfov = monotone(spec.phoneHfov)
  const shift = monotone(spec.shift ?? [{ t: 0, v: 0 }]), phoneShift = monotone(spec.phoneShift ?? [{ t: 0, v: 0 }])
  function sample(t: number): FlightSample {
    const tt = Math.min(Math.max(t, 0), T)
    const s = sAt(tt)
    return { t: tt, pos: atS(s), look: look(tt), phoneLook: phoneLook(tt), hfov: hfov(tt), phoneHfov: phoneHfov(tt), shift: shift(tt), phoneShift: phoneShift(tt), s, speed: speedAt(tt) }
  }
  return { duration: T, length, cruise: k, sample, end: atS(length) }
}

/** what the camera file's points need from the page's frames: UTM to scene, a point on the lion street's line, the walk's look */
export interface Frames {
  scene: (E: number, N: number) => [number, number]
  /** s metres out on the street's line: scene x, z and the street's level there */
  street: (s: number) => { x: number; z: number; level: number }
  eye: number
  /** the walk's first look point, scene */
  walkLook: V3
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

/** the camera file's flight, its points and looks turned into the scene's frame */
export function resolveFlight(f: J, F: Frames): FlightSpec {
  const point = (p: J): V3 => {
    if (p.street !== undefined) {
      const q = F.street(p.street)
      return [q.x, p.y === 'eye' ? q.level + F.eye : p.y, q.z]
    }
    const [x, z] = F.scene(p.utm[0], p.utm[1])
    return [x, p.y, z]
  }
  const lookKey = (k: J): LookKey => ({ t: k.t, at: k.walk ? F.walkLook : point(k) })
  return {
    duration: f.duration,
    points: f.points.map(point),
    speed: f.speed,
    walk: f.walk,
    walkFrom: f.walkFrom,
    look: f.look.map(lookKey),
    phoneLook: f.phoneLook.map(lookKey),
    hfov: f.hfov,
    phoneHfov: f.phoneHfov,
    shift: f.shift,
    phoneShift: f.phoneShift,
  }
}
