/* THE WALK AS A TIMED PATH, pure: the keys of `map-cams.json` (UTM, levels,
   seconds) turned into a camera at any second of the film. Between two keys
   on foot the eye stays 1.65 m over whatever the visitor stands on; a flight
   key carries its own height. A cut starts a new run: no motion crosses it.
   Positions ease through the keys on time-spaced Hermite curves; a run's
   ends and a held key stand still. */

export type V3 = [number, number, number]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

export interface Key {
  t: number
  pos: V3
  look: V3
  eye: boolean
  hfov: number
  /** the desktop frame slid up (+) or down, a shift lens */
  shift: number
  /** the phone's own look, lens and shift at this key */
  phone: { look: V3; hfov: number; shift: number }
  stop: number
  cut: boolean
  hold: boolean
  still: boolean
  kind: string
  say: string
}

export interface PathSample {
  pos: V3
  look: V3
  hfov: number
  shift: number
  phone: { look: V3; hfov: number; shift: number }
  stop: number
  hour: number
  eye: boolean
  kind: string
}

export function makePath(cams: J, toScene: (E: number, N: number) => [number, number], stand: (x: number, z: number) => number) {
  const EYE: number = cams.eye
  const keys: Key[] = cams.path.map((k: J) => {
    const [x, z] = toScene(k.at[0], k.at[1])
    const eye = k.y === 'eye'
    const y = eye ? stand(x, z) + EYE : (k.y as number)
    const [lx, lz] = toScene(k.look[0], k.look[1])
    const look: V3 = [lx, k.look[2] as number, lz]
    const ph = k.phone ?? {}
    const pl = ph.look ? toScene(ph.look[0], ph.look[1]) : null
    const phone = { look: pl ? ([pl[0], ph.look[2] as number, pl[1]] as V3) : look, hfov: ph.hfov ?? cams.lens.phoneFilm ?? cams.lens.phone, shift: ph.shift ?? 0 }
    return { t: k.t, pos: [x, y, z] as V3, look, eye, hfov: k.hfov ?? cams.lens.desktop, shift: k.shift ?? 0, phone, stop: k.stop, cut: !!k.cut, hold: !!k.hold, still: !!k.still, kind: k.kind ?? (eye ? 'walk' : 'fly'), say: k.say ?? '' }
  })
  const duration = keys[keys.length - 1]!.t
  /** a scalar's tangent at key i inside its run, by time: zero on a held key, the leg's own pace at a run's
      end (the edit cuts on motion), and between two legs a mean that never overshoots (zero where the value
      turns back), so a walk never steps backward and a turn never runs past where it stops */
  const slope = (i: number, val: (k: Key) => number): number => {
    const k = keys[i]!
    const prev = i > 0 && !k.cut ? keys[i - 1]! : null
    const next = i + 1 < keys.length && !keys[i + 1]!.cut ? keys[i + 1]! : null
    if (k.hold || (!prev && !next)) return 0
    if (!prev) return (val(next!) - val(k)) / (next!.t - k.t)
    if (!next) return (val(k) - val(prev)) / (k.t - prev.t)
    const d0 = (val(k) - val(prev)) / (k.t - prev.t), d1 = (val(next) - val(k)) / (next.t - k.t)
    if (d0 * d1 <= 0) return 0
    return (2 * d0 * d1) / (d0 + d1)
  }
  const tangent = (i: number, pick: (k: Key) => V3): V3 => [0, 1, 2].map((c) => slope(i, (k) => pick(k)[c]!)) as V3
  const hermite = (p0: V3, m0: V3, p1: V3, m1: V3, dt: number, u: number): V3 => {
    const u2 = u * u, u3 = u2 * u
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2
    return [0, 1, 2].map((c) => h00 * p0[c]! + h10 * dt * m0[c]! + h01 * p1[c]! + h11 * dt * m1[c]!) as V3
  }
  const herm1 = (p0: number, m0: number, p1: number, m1: number, dt: number, u: number): number => hermite([p0, 0, 0], [m0, 0, 0], [p1, 0, 0], [m1, 0, 0], dt, u)[0]
  /* the look as a heading and a tilt from the camera, unwrapped along the film: a straight line between two
     look points sweeps past the camera and spins the view; angles turn at the pace the keys ask */
  const angles = (pick: (k: Key) => V3) => {
    let last = 0
    return keys.map((k, i) => {
      const l = pick(k)
      const dx = l[0] - k.pos[0], dy = l[1] - k.pos[1], dz = l[2] - k.pos[2]
      let yaw = Math.atan2(dx, dz)
      if (i > 0) yaw = last + ((((yaw - last) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
      last = yaw
      return { yaw, tilt: Math.atan2(dy, Math.hypot(dx, dz)) }
    })
  }
  const deskA = angles((k) => k.look), phoneA = angles((k) => k.phone.look)
  const lookAt = (A: Array<{ yaw: number; tilt: number }>, i: number, dt: number, u: number, pos: V3): V3 => {
    const yaw = herm1(A[i]!.yaw, slope(i, (k) => A[keys.indexOf(k)]!.yaw), A[i + 1]!.yaw, slope(i + 1, (k) => A[keys.indexOf(k)]!.yaw), dt, u)
    const tilt = herm1(A[i]!.tilt, slope(i, (k) => A[keys.indexOf(k)]!.tilt), A[i + 1]!.tilt, slope(i + 1, (k) => A[keys.indexOf(k)]!.tilt), dt, u)
    const c = Math.cos(tilt) * 100
    return [pos[0] + Math.sin(yaw) * c, pos[1] + Math.sin(tilt) * 100, pos[2] + Math.cos(yaw) * c]
  }
  const stopHour = new Map<number, number>()
  for (const s of cams.stops) {
    const [h, m] = String(s.hour).split(':').map(Number)
    stopHour.set(s.n, (h ?? 0) + (m ?? 0) / 60)
  }
  const stopStart = new Map<number, number>()
  for (const k of keys) if (!stopStart.has(k.stop)) stopStart.set(k.stop, k.t)
  const hourAt = (t: number): number => {
    const stops = [...stopStart.entries()].sort((a, b) => a[1] - b[1])
    for (let i = 0; i < stops.length; i++) {
      const [n, t0] = stops[i]!
      const nextStop = stops[i + 1]
      if (!nextStop || t < nextStop[1]) {
        const h0 = stopHour.get(n)!
        const end = cams.endHour ? Number(String(cams.endHour).split(':')[0]) + Number(String(cams.endHour).split(':')[1] ?? 0) / 60 : h0
        if (!nextStop) return h0 + Math.min(1, (t - t0) / Math.max(1, duration - t0)) * (end - h0)
        const h1 = stopHour.get(nextStop[0])!
        return h0 + ((h1 - h0) * (t - t0)) / Math.max(1e-6, nextStop[1] - t0)
      }
    }
    return stopHour.get(stops[0]![0])!
  }

  function sample(t: number): PathSample {
    t = Math.min(Math.max(t, 0), duration)
    let i = 0
    while (i + 2 < keys.length && keys[i + 1]!.t <= t) i++
    const a = keys[i]!, b = keys[i + 1]!
    if (b.cut || b.t - a.t < 1e-6) {
      const k = t >= b.t ? b : a
      return { pos: k.pos, look: k.look, hfov: k.hfov, shift: k.shift, phone: k.phone, stop: k.stop, hour: hourAt(t), eye: k.eye, kind: k.kind }
    }
    const dt = b.t - a.t, u = (t - a.t) / dt
    const pos = hermite(a.pos, tangent(i, (k) => k.pos), b.pos, tangent(i + 1, (k) => k.pos), dt, u)
    const eye = a.eye && b.eye
    if (eye) pos[1] = stand(pos[0], pos[2]) + EYE
    const look = lookAt(deskA, i, dt, u, pos)
    const plook = lookAt(phoneA, i, dt, u, pos)
    const mixN = (p: number, q: number): number => p + (q - p) * u
    return {
      pos, look, hfov: mixN(a.hfov, b.hfov), shift: mixN(a.shift, b.shift),
      phone: { look: plook, hfov: mixN(a.phone.hfov, b.phone.hfov), shift: mixN(a.phone.shift, b.phone.shift) },
      // a stop runs from its first key to the next stop's first key; a segment's kind is that of the key it runs to
      stop: a.stop, hour: hourAt(t), eye, kind: b.kind,
    }
  }

  return { keys, duration, sample, hourAt, eyeHeight: EYE }
}
