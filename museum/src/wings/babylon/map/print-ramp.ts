/* THE PRINT'S RAMP, pure: a value each stop holds (its exposure, its air) eased along the film as the share of the
   6 s window around a second that each stop takes up. A stop change inside a run ramps at one even pace; the window
   is clipped at the cuts on either side, so a cut switches the value with the view. A stop runs from its key to the
   next key, the path's own reading (`path.ts` `sample`). */

export interface RampKey {
  t: number
  stop: number
  cut: boolean
}

export function makeRamp(keys: readonly RampKey[], duration: number, half = 3) {
  const spans: Array<{ a: number; b: number; stop: number }> = []
  for (let i = 0; i < keys.length; i++) {
    const a = i === 0 ? 0 : keys[i]!.t
    const b = i + 1 < keys.length ? keys[i + 1]!.t : duration
    if (b <= a) continue
    const last = spans[spans.length - 1]
    if (last && last.stop === keys[i]!.stop && Math.abs(last.b - a) < 1e-9) last.b = b
    else spans.push({ a, b, stop: keys[i]!.stop })
  }
  const cuts = keys.filter((k) => k.cut).map((k) => k.t)
  const stopAt = (t: number): number => {
    for (const s of spans) if (t < s.b) return s.stop
    return keys[keys.length - 1]!.stop
  }
  /** the window a second averages over: 6 s, clipped at the film's ends and the cuts on either side (a frame on a
      cut's second is the cut's first frame) */
  const window = (time: number): [number, number] => {
    const t = Math.min(Math.max(time, 0), duration)
    let lo = Math.max(0, t - half), hi = Math.min(duration, t + half)
    for (const c of cuts) {
      if (c <= t) lo = Math.max(lo, c)
      else hi = Math.min(hi, c)
    }
    return [lo, hi]
  }
  function at(time: number, valueOf: (stop: number) => number): number {
    const t = Math.min(Math.max(time, 0), duration)
    const [lo, hi] = window(t)
    if (hi - lo < 1e-9) return valueOf(stopAt(t))
    let acc = 0, first: number | null = null, same = true
    for (const s of spans) {
      const w = Math.min(hi, s.b) - Math.max(lo, s.a)
      if (w <= 0) continue
      const v = valueOf(s.stop)
      if (first === null) first = v
      else if (v !== first) same = false
      acc += v * w
    }
    // one value over the whole window is that value exactly, not a sum divided back
    return first === null ? valueOf(stopAt(t)) : same ? first : acc / (hi - lo)
  }
  return { at, stopAt, window, spans, cuts }
}
