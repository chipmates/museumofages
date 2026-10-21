/* THE OPENING'S CITY MATERIALS: the map's bodies in brick and earth instead of
   grey. Each body takes the tone of what it was built of (sun-dried mud brick,
   or the yellow baked brick of the palaces, the quays, the bridge and the
   tower's mantle), a little of its own variation, a lighter top where a roof or
   a wall's crown takes the sky; houses vary house by house. The ground is the
   plain's dry silt, damp and darker toward the water's level. The water is the
   river's silt-laden body under the sky's reflection, its ripples moving with
   the film's clock. Every tone here is ours (class G for colour); the class
   view paints the plan's classes over all of it exactly as the map does. */

import { DataTexture, DoubleSide, FloatType, MeshBasicNodeMaterial, MeshStandardNodeMaterial, NearestFilter, RGBAFormat, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { classColour, uView, type ClassTones } from '../map/mass'
import type { AirUniforms } from './air'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { abs, attribute, cameraPosition, dot, float, fract, instanceIndex, max, mix, mx_noise_float, normalWorld, normalize, positionWorld, pow, reflect, sin, smoothstep, texture, uniform, vec2, vec3 } = TSL as unknown as Record<string, N>

/** linear albedos (sRGB values converted), each with where it comes from */
export const TONES = {
  mud: [0.4, 0.335, 0.25] as [number, number, number],
  baked: [0.5, 0.385, 0.24] as [number, number, number],
  plaster: [0.46, 0.405, 0.32] as [number, number, number],
  roof: [0.47, 0.43, 0.36] as [number, number, number],
  silt: [0.35, 0.305, 0.24] as [number, number, number],
  damp: [0.15, 0.135, 0.105] as [number, number, number],
  slab: [0.56, 0.52, 0.44] as [number, number, number],
  says:
    'ours (G): sun-dried mud brick and its mud plaster near the plain\'s silt, a little lighter; the baked brick of the palaces, quays, bridge and tower mantle the yellow-buff of the excavated bricks; roofs of mud plaster; the plain\'s silt dry and, near the water\'s level, damp',
}

/** which tone a body of the plan takes, by its id: baked brick where the excavators found it faced so */
export function toneOf(id: string): 'mud' | 'baked' | 'plaster' {
  if (/^(north-gate|south-palace|throne-room|north-palace|gardens-step|north-fortification|west-outwork|moat-counter-wall|kasr-|river-wall|outer-river-wall|east-fortification|babil|altar|outer-east-karu)/.test(id)) return 'baked'
  if (/^(ninmah|nabu|ishtar-akkad|temple-z|ashratum|esagila)/.test(id)) return 'plaster'
  return 'mud'
}

/** one row per prism (its index is the `pid` attribute mass.ts writes): the body's tone */
export function toneTexture(ids: string[]): DataTexture {
  const n = Math.max(1, ids.length)
  const data = new Float32Array(n * 4)
  ids.forEach((id, i) => {
    const t = TONES[toneOf(id)]
    data.set([t[0], t[1], t[2], 1], i * 4)
  })
  const tex = new DataTexture(data, n, 1, RGBAFormat, FloatType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  return tex
}

const hash = (x: N): N => fract(sin(x.mul(12.9898)).mul(43758.5453))

/** a wall's face, a little uneven at every scale, its crown and any top that takes the sky a shade lighter */
function brickFace(base: N): N {
  const p = positionWorld
  const broad = mx_noise_float(p.mul(0.011)).mul(0.07)
  const mid = mx_noise_float(p.mul(0.09)).mul(0.045)
  const fine = mx_noise_float(p.mul(0.7)).mul(0.03)
  const up = smoothstep(0.55, 0.9, normalWorld.y)
  const top = mix(base, vec3(...TONES.roof), up.mul(0.55))
  return top.mul(float(1).add(broad).add(mid).add(fine))
}

/** the prisms (walls and buildings): their own tone from the table, the class view over it */
export function blockMaterial(t: ClassTones, tones: DataTexture, count: number): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.93, metalness: 0 })
  const pid = attribute('pid', 'float')
  const row = texture(tones, vec2(max(pid, 0).add(0.5).div(count), 0.5)).rgb
  const base = mix(vec3(...TONES.baked), row, smoothstep(-0.5, -0.4, pid))
  m.colorNode = mix(brickFace(base), classColour(t, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  return m
}

/** the instanced boxes: wall towers in mud brick, the tower's stages and the bridge's piers in baked brick (a per-instance `tone`, 0 mud, 1 baked) */
export function boxMaterial(t: ClassTones): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.93, metalness: 0 })
  const k = attribute('tone', 'float')
  const v = hash(float(instanceIndex).add(3.1)).sub(0.5).mul(0.08).add(1)
  const base = mix(vec3(...TONES.mud), vec3(...TONES.baked), k).mul(v)
  m.colorNode = mix(brickFace(base), classColour(t, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  return m
}

/** the houses: mud brick under mud plaster, each house its own shade (a per-instance `house` number) */
export function houseMaterial(t: ClassTones): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 })
  const h = attribute('house', 'float')
  const a = hash(h.add(0.37)), b = hash(h.mul(1.71).add(5.3))
  // value and a slight warm or grey lean, house by house
  const shade = a.sub(0.5).mul(0.28).add(1)
  const lean = mix(vec3(0.95, 0.98, 1.05), vec3(1.05, 1.0, 0.92), b)
  const base = vec3(...TONES.plaster).mul(shade).mul(lean)
  m.colorNode = mix(brickFace(base), classColour(t, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  return m
}

/** the processional street: worn limestone slabs, pale */
export function streetMaterial(t: ClassTones): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 })
  const p = positionWorld
  const v = mx_noise_float(p.mul(0.05)).mul(0.06).add(mx_noise_float(p.mul(0.6)).mul(0.04)).add(1)
  m.colorNode = mix(vec3(...TONES.slab).mul(v), classColour(t, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  return m
}

/** the plain: dry silt in broad patches, damp and darker within a metre or two of the water's level; grey in the class view as on the map */
export function groundMaterial(waterLevel: number): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 })
  const p = positionWorld
  const broad = mx_noise_float(vec3(p.x.mul(0.0025), 0, p.z.mul(0.0025)))
  const fields = mx_noise_float(vec3(p.x.mul(0.012), 3.3, p.z.mul(0.012)))
  const fine = mx_noise_float(p.mul(0.15)).mul(0.05)
  const dry = vec3(...TONES.silt).mul(float(1).add(broad.mul(0.12)).add(fields.mul(0.07)).add(fine))
  const wet = smoothstep(waterLevel + 2.6, waterLevel + 0.15, p.y)
  const g = mix(dry, vec3(...TONES.damp), wet)
  m.colorNode = mix(g, vec3(0.5, 0.48, 0.44), uView)
  return m
}

/** the water: the silt-laden body, the sky by Fresnel, wind streaks, ripples that move with the clock, the sun's glints */
export function waterMaterial(A: AirUniforms, sky: (d: N) => N, uTime: N): Material {
  const m = new MeshBasicNodeMaterial({ side: DoubleSide })
  const p = positionWorld
  const t = uTime
  // the ripples' slope from moving noise at three scales; the river flows south, the wind from the north-west
  const slope = (k: number, s: number, amp: number, drift: [number, number]): N => {
    const q = vec3(p.x.mul(k).add(t.mul(drift[0])), t.mul(s), p.z.mul(k).add(t.mul(drift[1])))
    const e = 0.35
    const h0 = mx_noise_float(q)
    const hx = mx_noise_float(q.add(vec3(e, 0, 0)))
    const hz = mx_noise_float(q.add(vec3(0, 0, e)))
    return vec2(hx.sub(h0), hz.sub(h0)).mul(amp / e)
  }
  const streak = smoothstep(-0.3, 0.5, mx_noise_float(vec3(p.x.mul(0.004), 1.7, p.z.mul(0.0011)).add(vec3(t.mul(0.002), 0, t.mul(0.004)))))
  const calm = mix(0.35, 1, streak)
  const s1 = slope(0.018, 0.05, 0.06, [0.004, 0.012])
  const s2 = slope(0.09, 0.22, 0.09, [0.02, 0.05])
  const s3 = slope(0.45, 0.6, 0.08, [0.06, 0.12])
  const sl = s1.add(s2.add(s3).mul(calm))
  const n = normalize(vec3(sl.x.negate(), 1, sl.y.negate()))
  const view = normalize(p.sub(cameraPosition))
  const r = reflect(view, n)
  const rUp = vec3(r.x, max(r.y, 0.02), r.z)
  const cosV = max(dot(n, view.negate()), 0)
  const fres = float(0.02).add(float(0.98).mul(pow(float(1).sub(cosV), 5)))
  // the body: silt in suspension lit by the sun and the sky, brown-olive
  const lit = max(A.uSun.y, 0).mul(1.6).add(0.55).mul(A.uDay)
  const body = vec3(0.09, 0.085, 0.066).mul(lit)
  const refl = sky(normalize(rUp)).mul(vec3(0.92, 0.96, 1.0))
  const glint = pow(max(dot(r, A.uSun), 0), 600).mul(60).mul(A.uDay)
  const sheen = pow(max(dot(r, A.uSun), 0), 24).mul(0.25).mul(A.uDay)
  const c = mix(body, refl, fres).add(vec3(1, 0.82, 0.6).mul(glint.add(sheen)))
  m.colorNode = mix(c, vec3(0.3, 0.33, 0.36), uView.mul(0.6))
  m.fog = false
  void abs
  void uniform
  return m
}
