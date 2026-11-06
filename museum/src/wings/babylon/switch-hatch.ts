/* THE GUESSED SIDE'S HATCH, one home for the gate's walls (gate/gate-mat.ts) and the map's bodies (map/mass.ts).
   The forge's node tools load this file through mass.ts: its value imports stay ones node resolves. */

import * as TSL from 'three/tsl'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { abs, cameraPosition, clamp, dot, float, floor, max, min, normalize, positionWorld, smoothstep } = TSL as unknown as Record<string, N>

/** the integral of a train of lines of half width h at multiples of P */
const lineInt = (x: N, P: number, h: number): N => {
  const m = x.sub(floor(x.div(P)).mul(P))
  return floor(x.div(P)).mul(2 * h).add(min(m, h)).add(max(m.sub(P - h), 0))
}
/** coverage of those lines, box-filtered over a footprint w */
export const lines = (x: N, P: number, h: number, w: N): N => {
  const ww = max(w, 1e-4)
  return clamp(lineInt(x.add(ww.mul(0.5)), P, h).sub(lineInt(x.sub(ww.mul(0.5)), P, h)).div(ww), 0, 1)
}
/** the guessed side's hatch, the share it darkens: lines 0.6 m apart along s, faded where the footprint fw passes
    their width, and calmed where the face of world normal n is seen grazing (a floor's stripes beat against the
    pixels there); without n, no calm */
export const hatchOf = (s: N, fw: N, n?: N): N => {
  const h = lines(s, 0.6, 0.09, fw.mul(1.4)).mul(float(1).sub(smoothstep(0.08, 0.2, fw))).mul(0.28)
  return n ? h.mul(smoothstep(0.3, 0.9, abs(dot(n, normalize(cameraPosition.sub(positionWorld)))))) : h
}
