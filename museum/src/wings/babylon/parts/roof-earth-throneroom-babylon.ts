/* PART roof-earth-throneroom-babylon: a flat earth roof behind a low brick parapet. The deck in the city's earth tone
   with broad drift, patches of newer and older plaster fading into each other over metres (a hard patch edge read as
   camouflage from the air), fine cracks fading with distance, a damp margin along the parapet's foot; the parapet's
   top a course of baked brick laid flat. Works in the roof's own frame: `p` the point in it, `ax` and `az` its x and
   z as world directions, `dPar` the distance to the parapet's inner face (metres), `copeU` the coping's run along its
   length. No room imports. */

import * as TSL from 'three/tsl'
import { BR, PAL, footprint, lines } from '../gate/gate-mat'
import { TONES } from '../open/earth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const T = TSL as unknown as Record<string, N>
const { float, max, mix, mx_noise_float, mx_worley_noise_vec2, smoothstep, vec2, vec3 } = T

type RGB = [number, number, number]
const V = (c: RGB): N => vec3(...c)

/** `cracks`: how dark the fine cracks print where they show (0 to 1) */
export interface RoofIn { p: N; U: { uPix: N }; ax: N; az: N; dPar: N; copeU: N; tone?: RGB; cracks?: number }

export const DEFAULTS = Object.freeze({ tone: TONES.roof as RGB, cracks: 0.35 })
export const PRESETS = Object.freeze({
  /** the throne room's roof */
  court: Object.freeze({ tone: TONES.roof as RGB, cracks: 0.35 }),
  /** the Merkes houses' roofs: the same earth, seen from a few metres, its cracks fainter */
  house: Object.freeze({ tone: TONES.roof as RGB, cracks: 0.06 }),
})

export interface Roof { deck: N; cope: N; fR: N }

export function roofEarth(I: RoofIn): Roof {
  const P = I.p, U = I.U, dPar = I.dPar
  const fR = max(footprint(U, I.ax, vec3(0, 1, 0)), footprint(U, I.az, vec3(0, 1, 0)))
  // newer plaster paler, older weathered darker and greyer, each fading into the next over metres: a hard patch edge
  // reads as camouflage from the fly
  const fresh = smoothstep(0.15, 0.4, mx_noise_float(vec3(P.x.mul(0.21), 8.3, P.z.mul(0.21))))
  const crackCell = mx_worley_noise_vec2(vec2(P.x, P.z).mul(1.6))
  const cracks = smoothstep(0.06, 0.0, crackCell.y.sub(crackCell.x)).mul(float(1).sub(smoothstep(0.01, 0.05, fR)))
  const old = smoothstep(0.1, 0.45, mx_noise_float(vec3(P.x.mul(0.11), 1.9, P.z.mul(0.11))).negate())
  const deckTone = V(I.tone ?? DEFAULTS.tone).mul(float(1).add(mx_noise_float(vec3(P.x.mul(0.05), 4.1, P.z.mul(0.05))).mul(0.16)).add(mx_noise_float(vec3(P.x.mul(0.45), 2.2, P.z.mul(0.45))).mul(0.08)))
  // a darker damp margin along the parapet's foot
  const deck = mix(deckTone.mul(mix(float(1), float(1.12), fresh.mul(0.8))), deckTone.mul(vec3(0.8, 0.8, 0.82)), old.mul(0.7))
    .mul(float(1).sub(float(1).sub(smoothstep(0.0, 1.2, dPar)).mul(0.2))).mul(float(1).sub(cracks.mul(I.cracks ?? DEFAULTS.cracks)))
  const cope = mix(V(PAL.buff as RGB).mul(0.86), V(PAL.asphalt as RGB), lines(I.copeU, BR, 0.006, fR).mul(0.8))
  return { deck, cope, fR }
}
