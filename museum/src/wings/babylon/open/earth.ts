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
import { lines } from '../gate/gate-mat'
import type { AirUniforms } from './air'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { abs, attribute, cameraPosition, cameraViewMatrix, dot, float, floor, fract, instanceIndex, max, min, mix, mx_noise_float, normalWorld, normalize, positionWorld, pow, reflect, sin, smoothstep, texture, uniform, vec2, vec3, vec4 } = TSL as unknown as Record<string, N>

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

/** one row per prism (its index is the `pid` attribute mass.ts writes): the body's tone, and 1 in alpha where its brick shows */
export function toneTexture(ids: string[]): DataTexture {
  const n = Math.max(1, ids.length)
  const data = new Float32Array(n * 4)
  ids.forEach((id, i) => {
    const k = toneOf(id)
    const t = TONES[k]
    data.set([t[0], t[1], t[2], k === 'baked' ? 1 : 0], i * 4)
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

/** baked brick's bond on an upright face: 8.6 cm courses, 33 cm bricks in half bond, joints box-filtered over the pixel's
    footprint (`uPix` the pixel's angle), so far walls take the joints' mean tone and never shimmer */
function bond(base: N, uPix: N): N {
  const p = positionWorld, n = normalWorld
  const v = normalize(cameraPosition.sub(p))
  const d = p.distance(cameraPosition)
  const slant = max(abs(dot(n, v)), 0.2)
  const w = uPix.mul(d).div(slant)
  const tx = normalize(vec2(n.z.negate(), n.x).add(vec2(1e-5, 0)))
  const u = p.x.mul(tx.x).add(p.z.mul(tx.y))
  const C = 0.086, L = 0.33
  const row = floor(p.y.div(C))
  const shift = fract(row.mul(0.5)).mul(L)
  const bed = lines(p.y, C, 0.005, w)
  const head = lines(u.add(shift), L, 0.005, w)
  const joint = max(bed, head).mul(smoothstep(0.6, 0.3, abs(n.y)))
  // brick to brick a little uneven, gone once a brick is under a pixel
  const each = fract(sin(floor(u.add(shift).div(L)).mul(91.7).add(row.mul(47.3))).mul(43758.5)).sub(0.5).mul(0.12).mul(smoothstep(0.25, 0.08, w))
  return mix(base.mul(float(1).add(each)), base.mul(0.62), joint)
}

/** the prisms (walls and buildings): their own tone from the table, the class view over it */
export function blockMaterial(t: ClassTones, tones: DataTexture, count: number, uPix: N): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.93, metalness: 0 })
  const pid = attribute('pid', 'float')
  const tex = texture(tones, vec2(max(pid, 0).add(0.5).div(count), 0.5))
  const row = tex.rgb
  const own = smoothstep(-0.5, -0.4, pid)
  const base = mix(vec3(...TONES.baked), row, own)
  const baked = mix(float(1), tex.a, own)
  const face = brickFace(base)
  m.colorNode = mix(mix(face, bond(face, uPix), baked), classColour(t, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
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

/** the plain's large-scale tracts outside the inner city: 0 none, 1 full */
export const uTracts = uniform(1)
/* the inner city on both banks as two convex outlines (UTM; the plan's circuits closed along the river), where no tract is drawn */
const INNER: Array<Array<[number, number]>> = [
  [[445380, 3600900], [446737, 3601360], [447230, 3599740], [445934, 3599110], [445380, 3599100]],
  [[445275, 3600470], [444290, 3600190], [444690, 3598780], [445560, 3599020]],
]
/** 1 inside the outline, 0 outside, feathered over the given metres; scene x = E - 445700, z = 3600400 - N */
function insideConvex(poly: Array<[number, number]>, p: N, feather: number): N {
  const q = poly.map(([e, n]) => [e - 445700, 3600400 - n] as [number, number])
  let area = 0
  q.forEach((a, i) => { const b = q[(i + 1) % q.length]!; area += a[0] * b[1] - b[0] * a[1] })
  const sgn = Math.sign(area)
  let d: N = null
  q.forEach((a, i) => {
    const b = q[(i + 1) % q.length]!
    const ex = b[0] - a[0], ez = b[1] - a[1], len = Math.hypot(ex, ez)
    const di = p.z.sub(a[1]).mul(ex).sub(p.x.sub(a[0]).mul(ez)).mul(sgn / len)
    d = d === null ? di : min(d, di)
  })
  return smoothstep(-feather, feather, d)
}
/** the plain: dry silt in broad patches, damp and darker within a metre or two of the water's level; grey in the class view as on the map */
export function groundMaterial(waterLevel: number): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 })
  const p = positionWorld
  const broad = mx_noise_float(vec3(p.x.mul(0.0022), 0, p.z.mul(0.0022)))
  const fields = mx_noise_float(vec3(p.x.mul(0.011), 3.3, p.z.mul(0.011)))
  const lean = smoothstep(0.05, 0.45, mx_noise_float(vec3(p.x.mul(0.004), 7.1, p.z.mul(0.004))))
  const fine = mx_noise_float(p.mul(0.15)).mul(0.05)
  // patches drier and paler, damper and darker, a few with an olive lean (stubble, scrub); nothing drawn as single fields
  const silt = mix(vec3(...TONES.silt), vec3(...TONES.silt).mul(vec3(0.9, 0.97, 0.84)), lean.mul(0.8))
  const dry = silt.mul(float(1).add(broad.mul(0.2)).add(fields.mul(0.1)).add(fine))
  // tracts a few hundred metres across: darker where watered and grown, paler where fallow
  const tn = mx_noise_float(vec3(p.x.mul(0.0011), 11.3, p.z.mul(0.0016))).add(mx_noise_float(vec3(p.x.mul(0.0043), 5.9, p.z.mul(0.0043))).mul(0.45))
  // none inside the inner city, and none far out, where the ground's rim would show them as a line on the horizon
  const near = smoothstep(7000, 4500, vec2(p.x, p.z).length())
  const outside = float(1).sub(max(insideConvex(INNER[0]!, p, 60), insideConvex(INNER[1]!, p, 60))).mul(uTracts).mul(near)
  const grown = smoothstep(0.08, 0.32, tn).mul(outside)
  const fallow = smoothstep(-0.12, -0.36, tn).mul(outside)
  const tracted = mix(mix(dry, dry.mul(vec3(0.62, 0.66, 0.52)), grown), dry.mul(1.12), fallow)
  const wet = smoothstep(waterLevel + 2.6, waterLevel + 0.15, p.y)
  const g = mix(tracted, vec3(...TONES.damp), wet)
  m.colorNode = mix(g, vec3(0.5, 0.48, 0.44), uView)
  // the banks fall from the plain to the bed across a single cell of the 20 m grid, so their faces tilt by the triangle
  // and light up in a zig-zag along the shore; near the water's level the shading normal leans back toward up
  const lean2 = smoothstep(waterLevel + 4.5, waterLevel + 0.5, p.y)
  const n = normalize(mix(normalWorld, vec3(0, 1, 0), lean2.mul(0.85)))
  m.normalNode = normalize(cameraViewMatrix.mul(vec4(n, 0)).xyz)
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
  const s2 = slope(0.09, 0.22, 0.12, [0.02, 0.05])
  const s3 = slope(0.45, 0.6, 0.11, [0.06, 0.12])
  const sl = s1.add(s2.add(s3).mul(calm))
  const n = normalize(vec3(sl.x.negate(), 1, sl.y.negate()))
  const view = normalize(p.sub(cameraPosition))
  const r = reflect(view, n)
  const rUp = vec3(r.x, max(r.y, 0.02), r.z)
  const cosV = max(dot(n, view.negate()), 0)
  const fres = float(0.035).add(float(0.965).mul(pow(float(1).sub(cosV), 5)))
  // the body: silt in suspension lit by the sun and the sky, brown-olive
  const lit = max(A.uSun.y, 0).mul(1.6).add(0.55).mul(A.uDay)
  const body = vec3(0.085, 0.095, 0.085).mul(lit)
  const refl = sky(normalize(rUp)).mul(vec3(0.92, 0.96, 1.0))
  const glint = pow(max(dot(r, A.uSun), 0), 600).mul(60).mul(A.uDay)
  const sheen = pow(max(dot(r, A.uSun), 0), 24).mul(0.25).mul(A.uDay)
  const c = mix(body, refl, fres).add(vec3(1, 0.82, 0.6).mul(glint.add(sheen)))
  m.colorNode = mix(c, vec3(0.3, 0.33, 0.36), uView.mul(0.6))
  m.fog = false
  void uniform
  void min
  return m
}
