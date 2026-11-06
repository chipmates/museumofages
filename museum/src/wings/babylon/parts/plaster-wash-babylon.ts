/* PART plaster-wash-babylon: a white lime-gypsum wash over plaster, its tone only: a ceiling (a face looking down)
   cooled by the white walls' bounce the stack does not carry, a wall warmed by the light brick floors throw in, a
   slow mottle. The light a room takes through its doors is the room's own (its material's AO). No room imports. */

import * as TSL from 'three/tsl'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const T = TSL as unknown as Record<string, N>
const { mx_noise_float, select, vec3 } = T

type RGB = [number, number, number]
/** the tints a face takes for the bounce its room does not model: a wall's and a ceiling's */
export type WashTint = { wall?: RGB; ceiling?: RGB }

export const DEFAULTS = Object.freeze({ colour: [0.62, 0.6, 0.55] as RGB, wall: [1.06, 1.0, 0.9] as RGB, ceiling: [0.9, 1.0, 1.16] as RGB })
export const PRESETS = Object.freeze({
  /** inside the throne room (its colour is court-plan.json colours.plaster): the room's light carries the floor's
      warmth and the walls' bounce itself (court-mat.ts ROOM), so the wash takes no tint of its own */
  court: Object.freeze({ colour: [0.62, 0.6, 0.55] as RGB, wall: [1, 1, 1] as RGB, ceiling: [1, 1, 1] as RGB }),
  /** House VI's rooms: the same wash over mud plaster */
  house: Object.freeze({ colour: [0.62, 0.6, 0.55] as RGB }),
})

/** the wash's albedo at a point `p` on a face of normal `n` (world) */
export function plasterWash(p: N, n: N, colour: RGB = DEFAULTS.colour, tint: WashTint = {}): N {
  const c = tint.ceiling ?? DEFAULTS.ceiling, w = tint.wall ?? DEFAULTS.wall
  return vec3(...colour).mul(select(n.y.lessThan(-0.5), vec3(...c), vec3(...w))).mul(mx_noise_float(p.mul(0.9)).mul(0.04).add(1))
}
