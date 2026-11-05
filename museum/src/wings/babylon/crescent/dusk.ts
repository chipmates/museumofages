/* THE SKY AFTER SUNSET on the map page: the walk's air (open/air.ts) holds a sun above the horizon; once the sun is a
   few degrees under it, the sky takes the twilight's own order instead, the glow over the set sun lying low and
   narrowing upward (orange at the horizon, yellow, then pale into blue), the rest a blue darkening to the zenith. Mixed
   in by the sun's depression only, so every frame with the sun up keeps the air's sky exactly. Its colours are ours. */

import * as TSL from 'three/tsl'
import type { AirUniforms } from '../open/air'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const { clamp, dot, exp, max, mix, normalize, pow, smoothstep, uniform, vec3 } = TSL as unknown as Record<string, N>

export interface Dusk {
  /** 0 while the sun is up, 1 once it is `full` degrees under the horizon */
  uDusk: N
  setSun: (elevationDeg: number) => void
  /** the twilight sky along d */
  colour: (d: N) => N
  /** a sky function with the twilight mixed in, for anything that reflects or shows the sky */
  wrap: (base: (d: N) => N) => (d: N) => N
}

export function makeDusk(A: AirUniforms, plan: J): Dusk {
  const K = plan.dusk
  const uDusk = uniform(0)
  const v = (c: number[]): N => vec3(c[0], c[1], c[2])
  const colour = (d: N): N => {
    const e = clamp(d.y, 0, 1)
    const flat = normalize(vec3(d.x, 0.0001, d.z)), sunFlat = normalize(vec3(A.uSun.x, 0.0001, A.uSun.z))
    // how near the bearing is to the set sun's, 0 to 1, narrowed by the arch's width
    const toward = pow(dot(flat, sunFlat).mul(0.5).add(0.5), K.width)
    const blue = mix(v(K.away), v(K.zenith), pow(e, 0.5))
    const band = mix(mix(v(K.arch[0]), v(K.arch[1]), smoothstep(0, K.bands[0], e)), v(K.arch[2]), smoothstep(K.bands[0], K.bands[1], e))
    const arch = band.mul(exp(e.div(K.height).negate())).mul(toward)
    return max(blue.add(arch), 0)
  }
  const [a, b] = K.from as [number, number]
  return {
    uDusk,
    setSun: (el: number) => {
      uDusk.value = Math.min(1, Math.max(0, (a - el) / (a - b)))
    },
    colour,
    wrap: (base) => (d: N): N => mix(base(d), colour(d), uDusk),
  }
}
