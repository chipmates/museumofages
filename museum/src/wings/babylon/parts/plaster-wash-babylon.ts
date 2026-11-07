/* PART plaster-wash-babylon: a white lime-gypsum wash over plaster, its tone only: a ceiling (a face looking down)
   cooled by the white walls' bounce the stack does not carry, a wall warmed by the light brick floors throw in, a
   slow mottle. The light a room takes through its doors is the room's own (its material's AO). No room imports.
   Its grain is opt-in (a fifth argument): a hand-laid wash's unevenness, the trowel's strokes, the mud brick's courses
   where the wash is thin and a band of wear at a wall's foot, each octave kept only while it spans four of the eye's
   pixels on the face, so a face far off stays calm and the finer grain comes in as it nears. `washGrain` lays the same
   grain on a material's own plaster; out of doors its unevenness takes the coarser octaves of OUTDOOR. */

import * as TSL from 'three/tsl'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const T = TSL as unknown as Record<string, N>
const { abs, cameraPosition, dot, float, floor, fract, length, max, mix, mx_noise_float, select, sin, smoothstep, sqrt, step, vec3 } = T

type RGB = [number, number, number]
/** the tints a face takes for the bounce its room does not model: a wall's and a ceiling's */
export type WashTint = { wall?: RGB; ceiling?: RGB }
/** the grain's inputs: one device pixel's angle (a uniform), the floor's level under the walls, the brick behind;
    the unevenness's octaves (per m) and each one's share of the albedo (the room's by default); a face's horizontal
    tangent where walls stand off the world's axes; the share an octave keeps once it spans 24 of the eye's pixels
    (unset: all of it, the room's rule); the strokes' share; how much mud brick shows where the wash is thin (0: none
    under it); `wear: false` where the caller lays its own foot */
export type WashGrain = {
  pix: N; floor: N | number; course: number; brick: number; joint: number; mud?: RGB
  octaves?: readonly number[]; share?: readonly number[]; coarse?: number; tan?: N; stroke?: number; thin?: number; wear?: boolean
}

export const DEFAULTS = Object.freeze({ colour: [0.62, 0.6, 0.55] as RGB, wall: [1.06, 1.0, 0.9] as RGB, ceiling: [0.9, 1.0, 1.16] as RGB, mud: [0.4, 0.33, 0.25] as RGB })
export const PRESETS = Object.freeze({
  /** inside the throne room (its colour is court-plan.json colours.plaster): the room's light carries the floor's
      warmth and the walls' bounce itself (court-mat.ts ROOM), so the wash takes no tint of its own */
  court: Object.freeze({ colour: [0.62, 0.6, 0.55] as RGB, wall: [1, 1, 1] as RGB, ceiling: [1, 1, 1] as RGB }),
  /** House VI's rooms: the same wash over mud plaster */
  house: Object.freeze({ colour: [0.62, 0.6, 0.55] as RGB }),
})

/** the grain's strengths, as shares of the wash's albedo */
export const GRAIN = Object.freeze({ uneven: [0.1, 0.09, 0.07], stroke: 0.17, joint: 0.45, brick: 0.2, thin: 0.75, wear: 0.45, wearH: 0.9 })
/** the unevenness at the outdoor cameras' 3 to 24 cm a pixel: three coarser octaves before the room's, each calmed
    once it spans many pixels, so the grain reads at the eye's scale and a near wall does not cloud over (shares ours) */
export const OUTDOOR = Object.freeze({ octaves: Object.freeze([0.5, 1, 2.5, 6, 14, 30]), share: Object.freeze([0.14, 0.14, 0.14, 0.14, 0.12, 0.1]), coarse: 0.3, stroke: 0.1 })

const hash = (a: N, b: N): N => fract(sin(a.mul(12.9898).add(b.mul(78.233))).mul(43758.5453))
/** a train of lines `w` wide every `p`, box-filtered over a footprint `fw`: the share of the footprint they cover */
const pulses = (x: N, p: number, w: number, fw: N): N => {
  const F = (t: N): N => floor(t.div(p)).mul(w).add(max(fract(t.div(p)).mul(p).sub(p - w), 0))
  const f = max(fw, 1e-4)
  return F(x.add(f.mul(0.5))).sub(F(x.sub(f.mul(0.5)))).div(f)
}

/** the grain over a base albedo `base` at a point `p` on a face of normal `n` (world) */
export function washGrain(p: N, n: N, base: N, g: WashGrain): N {
  const G = GRAIN
  const toEye = cameraPosition.sub(p), dist = length(toEye), v = toEye.div(dist)
  const nv2 = max(dot(n, v).mul(dot(n, v)), 0.01)
  const fp = (t: N): N => g.pix.mul(dist).mul(sqrt(float(1).add(dot(t, v).mul(dot(t, v)).div(nv2))))
  // a wall's u runs along it, its y up from the floor; a ceiling keeps only the unevenness
  const wallX = abs(n.x).greaterThan(0.5)
  const vertical = step(abs(n.y), 0.5)
  const u = g.tan ? dot(p, g.tan) : select(wallX, p.z, p.x), y = p.y.sub(g.floor)
  const fu = fp(g.tan ?? select(wallX, vec3(0, 0, 1), vec3(1, 0, 0))), fy = fp(vec3(0, 1, 0)), fw = max(fu, fy)
  const keep = (lambda: number, f: N = fw): N => smoothstep(f.mul(2), f.mul(4), float(lambda))
  const calm = (lambda: number): N => (g.coarse === undefined ? float(1) : mix(float(1), float(g.coarse), smoothstep(fw.mul(8), fw.mul(24), float(lambda))))
  // unevenness: the wash a little thicker or thinner, by octaves
  let k: N = float(1)
  const share = g.share ?? G.uneven
  ;(g.octaves ?? [6, 14, 30]).forEach((f, i) => { k = k.add(mx_noise_float(p.mul(f).add(i * 3.1)).mul(share[i] ?? 0).mul(keep(1 / f)).mul(calm(1 / f))) })
  // the trowel's strokes, laid in two directions by patches: long along, narrow across
  const ca = Math.cos((35 * Math.PI) / 180), sa = Math.sin((35 * Math.PI) / 180)
  const s1 = mx_noise_float(vec3(u.mul(ca).add(y.mul(sa)).mul(1.4), u.mul(-sa).add(y.mul(ca)).mul(11), 1.7))
  const s2 = mx_noise_float(vec3(u.mul(ca).sub(y.mul(sa)).mul(1.4), u.mul(sa).add(y.mul(ca)).mul(11), 5.3))
  const patch = smoothstep(-0.25, 0.25, mx_noise_float(vec3(u.mul(0.7), y.mul(0.7), 9.1)))
  k = k.add(mix(s1, s2, patch).mul(g.stroke ?? G.stroke).mul(keep(1 / 11)).mul(vertical))
  if (g.thin === 0) return g.wear === false ? base.mul(k) : footWear(base.mul(k), u, y, vertical, fu, keep, g)
  // where the wash is thin the mud brick shows through: its courses, its head joints half a brick on in every other
  // course, each brick its own tone
  let thin: N = smoothstep(-0.05, 0.4, mx_noise_float(vec3(u.mul(0.45), y.mul(0.8), 3.3)).add(mx_noise_float(vec3(u.mul(1.6), y.mul(2.2), 4.7)).mul(0.4))).mul(vertical)
  if (g.thin !== undefined) thin = thin.mul(g.thin)
  const kc = floor(y.div(g.course)), odd = kc.sub(floor(kc.div(2)).mul(2))
  const ub = u.sub(odd.mul(g.brick / 2))
  const bed = pulses(y, g.course, g.joint, fy), head = pulses(ub, g.brick, g.joint, fu)
  const jointMean = g.joint / g.course + g.joint / g.brick
  const joint = bed.add(head).sub(bed.mul(head)).sub(jointMean).mul(keep(g.course, fy))
  const brickTone = hash(floor(ub.div(g.brick)), kc).sub(0.5).mul(keep(g.brick, fu))
  k = k.mul(float(1).sub(joint.mul(G.joint).mul(thin))).mul(float(1).add(brickTone.mul(G.brick).mul(thin)))
  const mud = vec3(...(g.mud ?? DEFAULTS.mud))
  const c: N = mix(base, mud.mul(1.2), thin.mul(G.thin * 0.35)).mul(k)
  return g.wear === false ? c : footWear(c, u, y, vertical, fu, keep, g)
}

/** a band of wear at the foot, its top ragged: darker and browner, as hands, feet and brooms leave it */
function footWear(c: N, u: N, y: N, vertical: N, fu: N, keep: (lambda: number, f?: N) => N, g: WashGrain): N {
  const G = GRAIN, mud = vec3(...(g.mud ?? DEFAULTS.mud))
  const top = float(G.wearH).add(mx_noise_float(vec3(u.mul(1.3), 0.5, 2.2)).mul(0.25)).add(mx_noise_float(vec3(u.mul(7), 0.5, 6.1)).mul(0.07).mul(keep(1 / 7, fu)))
  const wear = float(1).sub(smoothstep(top.sub(0.12), top.add(0.04), y)).mul(vertical)
  const scuff = float(1).add(mx_noise_float(vec3(u.mul(9), y.mul(5), 8.8)).mul(0.12).mul(keep(1 / 9)))
  return mix(c, mud.mul(0.95).mul(scuff), wear.mul(G.wear))
}

/** the wash's albedo at a point `p` on a face of normal `n` (world); with `grain`, its hand-laid grain */
export function plasterWash(p: N, n: N, colour: RGB = DEFAULTS.colour, tint: WashTint = {}, grain?: WashGrain): N {
  const c = tint.ceiling ?? DEFAULTS.ceiling, w = tint.wall ?? DEFAULTS.wall
  const base = vec3(...colour).mul(select(n.y.lessThan(-0.5), vec3(...c), vec3(...w))).mul(mx_noise_float(p.mul(0.9)).mul(0.04).add(1))
  return grain ? washGrain(p, n, base, grain) : base
}
