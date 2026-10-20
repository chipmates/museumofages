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
  stop: number
  cut: boolean
  hold: boolean
  kind: string
  say: string
}

export interface PathSample {
  pos: V3
  look: V3
  hfov: number
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
    return { t: k.t, pos: [x, y, z] as V3, look: [lx, k.look[2] as number, lz] as V3, eye, hfov: k.hfov ?? cams.lens.desktop, stop: k.stop, cut: !!k.cut, hold: !!k.hold, kind: k.kind ?? (eye ? 'walk' : 'fly'), say: k.say ?? '' }
  })
  const duration = keys[keys.length - 1]!.t
  /** tangent at key i inside its run, by time */
  const tangent = (i: number, pick: (k: Key) => V3): V3 => {
    const k = keys[i]!
    const prev = i > 0 && !k.cut ? keys[i - 1]! : null
    const next = i + 1 < keys.length && !keys[i + 1]!.cut ? keys[i + 1]! : null
    if (!prev || !next || k.hold) return [0, 0, 0]
    const a = pick(prev), b = pick(next)
    // a key that stands where its neighbour stands is a hold: no drift out of it
    const same = (p: V3, q: V3): boolean => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 0.01
    if (same(pick(k), a) || same(pick(k), b)) return [0, 0, 0]
    const dt = next.t - prev.t
    return [(b[0] - a[0]) / dt, (b[1] - a[1]) / dt, (b[2] - a[2]) / dt]
  }
  const hermite = (p0: V3, m0: V3, p1: V3, m1: V3, dt: number, u: number): V3 => {
    const u2 = u * u, u3 = u2 * u
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2
    return [0, 1, 2].map((c) => h00 * p0[c]! + h10 * dt * m0[c]! + h01 * p1[c]! + h11 * dt * m1[c]!) as V3
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
      return { pos: k.pos, look: k.look, hfov: k.hfov, stop: k.stop, hour: hourAt(t), eye: k.eye, kind: k.kind }
    }
    const dt = b.t - a.t, u = (t - a.t) / dt
    const pos = hermite(a.pos, tangent(i, (k) => k.pos), b.pos, tangent(i + 1, (k) => k.pos), dt, u)
    const look = hermite(a.look, tangent(i, (k) => k.look), b.look, tangent(i + 1, (k) => k.look), dt, u)
    const eye = a.eye && b.eye
    if (eye) pos[1] = stand(pos[0], pos[2]) + EYE
    const s = u * u * (3 - 2 * u)
    return { pos, look, hfov: a.hfov + (b.hfov - a.hfov) * s, stop: u < 0.5 ? a.stop : b.stop, hour: hourAt(t), eye, kind: b.kind }
  }

  return { keys, duration, sample, hourAt, eyeHeight: EYE }
}
