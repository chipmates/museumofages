/* PART plaster-wash-babylon: a white lime-gypsum wash over plaster, its tone only: a ceiling (a face looking down)
   cooled by the white walls' bounce the stack does not carry, a wall warmed by the light brick floors throw in, a
   slow mottle. The light a room takes through its doors is the room's own (its material's AO). No room imports. */

import * as TSL from 'three/tsl'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const T = TSL as unknown as Record<string, N>
const { mx_noise_float, select, vec3 } = T

type RGB = [number, number, number]

export const DEFAULTS = Object.freeze({ colour: [0.62, 0.6, 0.55] as RGB })
export const PRESETS = Object.freeze({
  /** inside the throne room (court-plan.json colours.plaster) */
  court: Object.freeze({ colour: [0.62, 0.6, 0.55] as RGB }),
  /** House VI's rooms: the same wash over mud plaster */
  house: Object.freeze({ colour: [0.62, 0.6, 0.55] as RGB }),
})

/** the wash's albedo at a point `p` on a face of normal `n` (world) */
export function plasterWash(p: N, n: N, colour: RGB = DEFAULTS.colour): N {
  return vec3(...colour).mul(select(n.y.lessThan(-0.5), vec3(0.9, 1.0, 1.16), vec3(1.06, 1.0, 0.9))).mul(mx_noise_float(p.mul(0.9)).mul(0.04).add(1))
}
