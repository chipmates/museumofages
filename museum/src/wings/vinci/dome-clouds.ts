/* THE DOME'S CLOUD LAYER AS THE WING WAS MADE UNDER. From r187 SkyMesh draws
   lit white banks where r185 laid a thin dim veil, which only darkened the
   dome in streaks; the wing's sky was set against the veil. This is r185's
   cloud block (three.js, MIT), read from SkyMesh's own cloud uniforms, with
   the sun's intensity computed as SkyMesh computes it. SkyMesh's own layer
   is left at coverage 0 and this one is mixed in its place. */
import type { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import * as TSL from 'three/tsl'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { Fn, Loop, acos, add, dot, exp, float, floor, fract, max, mix, normalize, sin, smoothstep, sub, time, vec2, vec3 } =
  TSL as unknown as Record<string, N>

const hash = Fn(([p]: N[]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123)))
const noise = Fn(([at]: N[]) => {
  const p = vec2(at).toVar()
  const i = floor(p), f = fract(p)
  const ff = f.mul(f).mul(sub(3, f.mul(2)))
  return mix(mix(hash(i), hash(add(i, vec2(1, 0))), ff.x), mix(hash(add(i, vec2(0, 1))), hash(add(i, vec2(1, 1))), ff.x), ff.y)
})
const fbm = Fn(([at]: N[]) => {
  const p = vec2(at).toVar(), value = float(0).toVar(), amplitude = float(.5).toVar()
  Loop(5, () => {
    value.addAssign(amplitude.mul(noise(p)))
    p.mulAssign(2)
    amplitude.mulAssign(.5)
  })
  return value
})

/** the sky's colour with the veil over it; `ray` is the eye's unit direction */
export function domeClouds(sky: SkyMesh, skyRGB: N, ray: N, coverage: number): N {
  const s = sky as unknown as Record<string, N>
  const sun = normalize(s['sunPosition'])
  // SkyMesh's sun intensity: 1000 at the zenith, cut off at 1.611 rad, steepness 1.5
  const sunE = float(1000).mul(max(0, float(1).sub(exp(float(1.6110731556870734).sub(acos(sun.y)).div(1.5).negate()))))
  const uv = ray.xz.div(ray.y.mul(mix(1, .1, s['cloudElevation']))).mul(s['cloudScale']).add(time.mul(s['cloudSpeed']))
  const cloudNoise = fbm(uv.mul(1000)).add(fbm(uv.mul(2000).add(3.7)).mul(.5)).mul(.5).add(.5)
  const mask = smoothstep(1 - coverage, 1.3 - coverage, cloudNoise).mul(smoothstep(0, add(.1, s['cloudElevation'].mul(.2)), ray.y))
  const sunInfluence = dot(ray, sun).mul(.5).add(.5)
  const daylight = max(0, sun.y.mul(2))
  // r185 lit the veil with the dome's in-scattering; the clear dome's colour stands in for it
  const colour = mix(mix(vec3(.3), vec3(1), daylight), skyRGB.add(1), sunInfluence.mul(.5)).mul(sunE.mul(.00002))
  return ray.y.greaterThan(0).select(mix(skyRGB, colour, mask.mul(s['cloudDensity'])), skyRGB)
}
