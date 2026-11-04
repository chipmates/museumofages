/* THE OPENING'S CITY MATERIALS: the map's bodies in brick and earth instead of
   grey. Each body takes the tone of what it was built of (sun-dried mud brick,
   or the yellow baked brick of the palaces, the quays, the bridge and the
   tower's mantle), a little of its own variation, a lighter top where a roof or
   a wall's crown takes the sky; houses vary house by house. The ground is the
   plain's dry silt, damp and darker toward the water's level. The water is the
   river's silt-laden body under the sky's reflection, its ripples moving with
   the film's clock. Every tone here is ours (class G for colour); the class
   view paints the plan's classes over all of it exactly as the map does. */

import { DataTexture, DoubleSide, FloatType, MeshBasicNodeMaterial, MeshStandardNodeMaterial, NearestFilter, RGBAFormat, type Material, type Texture } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { classColour, uView, type ClassTones } from '../map/mass'
import { lines, PAL } from '../gate/gate-mat'
import type { AirUniforms } from './air'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { mx_worley_noise_vec2 } = TSL as unknown as Record<string, N>
const { abs, attribute, cameraPosition, cameraViewMatrix, clamp, dot, float, floor, fract, instanceIndex, max, min, mix, mx_noise_float, normalWorld, normalize, positionGeometry, positionWorld, pow, reflect, sin, smoothstep, step, texture, uniform, vec2, vec3, vec4 } = TSL as unknown as Record<string, N>

const lin = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const srgb = (r: number, g: number, b: number): [number, number, number] => [lin(r / 255), lin(g / 255), lin(b / 255)]

/** linear albedos from sRGB values, each with where it comes from; brick, plaster and earth kept apart by hue and value */
export const TONES = {
  mud: srgb(156, 136, 108),
  baked: srgb(184, 150, 104),
  plaster: srgb(202, 192, 172),
  temple: srgb(214, 206, 188),
  roof: srgb(186, 174, 152),
  silt: srgb(138, 122, 96),
  damp: srgb(82, 72, 56),
  slab: srgb(196, 188, 170),
  lime: srgb(200, 192, 170),
  says:
    "ours (G): sun-dried mud brick grey-brown; baked brick yellow-brown (the excavated bricks, A1 as a range); the houses' mud plaster under a white gypsum wash (REC bab.houses.type), its roofs a little darker; temples in white lime plaster (MAT); the plain's silt darker and greyer than any brick, damp near the water; the limestone foot pale (no colour source, ours)",
}

/** which tone a body of the plan takes, by its id: baked brick where the excavators found it faced so */
export function toneOf(id: string): 'mud' | 'baked' | 'temple' {
  if (/^(north-gate|south-palace|throne-room|north-palace|gardens-step|north-fortification|west-outwork|moat-counter-wall|kasr-|river-wall|outer-river-wall|east-fortification|babil|altar|outer-east-karu|arahtu-quay|bridge-)/.test(id)) return 'baked'
  if (/^(ninmah|nabu|ishtar-akkad|temple-z|ashratum|esagila|precinct-)/.test(id)) return 'temple'
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

/** the pixel's footprint on a surface of normal n, metres */
function footprint(uPix: N, n: N): N {
  const p = positionWorld
  const v = normalize(cameraPosition.sub(p))
  return uPix.mul(p.distance(cameraPosition)).div(max(abs(dot(n, v)), 0.2))
}

/** baked brick's bond on an upright face: 33 cm square bricks laid flat, about 8 cm with a thick joint of 2 to 3 cm (a
    10.5 cm course), half bond; joints box-filtered over the pixel's footprint so far walls take the joints' mean tone and
    never shimmer; brick to brick and in broad patches a little uneven (fill target A.9) */
export function brickBond(base: N, uPix: N, joint: N, o: { course?: number; half?: number; each?: number } = {}): N {
  const p = positionWorld, n = normalWorld
  const w = footprint(uPix, n)
  const tx = normalize(vec2(n.z.negate(), n.x).add(vec2(1e-5, 0)))
  const u = p.x.mul(tx.x).add(p.z.mul(tx.y))
  const C = o.course ?? 0.105, L = 0.33, h = o.half ?? 0.011
  const row = floor(p.y.div(C))
  const shift = fract(row.mul(0.5)).mul(L)
  const bed = lines(p.y, C, h, w)
  const head = lines(u.add(shift), L, h, w)
  const j = max(bed, head).mul(smoothstep(0.6, 0.3, abs(n.y)))
  const cell = floor(u.add(shift).div(L)).mul(91.7).add(row.mul(47.3))
  const each = fract(sin(cell).mul(43758.5)).sub(0.5).mul(o.each ?? 0.2).mul(smoothstep(0.3, 0.08, w))
  // a few bricks of another firing, darker and redder, seen only near
  const odd = step(0.93, fract(sin(cell.mul(1.37).add(3.1)).mul(24634.6))).mul(smoothstep(0.3, 0.08, w))
  const brick = mix(base.mul(float(1).add(each)), base.mul(vec3(0.82, 0.74, 0.68)), odd.mul(0.8))
  return mix(brick, joint, j)
}

function bond(base: N, uPix: N): N {
  return brickBond(base, uPix, base.mul(0.62))
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
  // a flat roof is never one plane from the air: rooms' roofs in irregular cells a few metres across, each its own shade,
  // a darker seam where two meet, patches of fresh plaster
  const p = positionWorld
  const up = smoothstep(0.55, 0.85, normalWorld.y)
  const cell = mx_worley_noise_vec2(vec2(p.x, p.z).mul(0.19))
  const seam = smoothstep(0.07, 0.02, cell.y.sub(cell.x))
  const shade = mx_noise_float(vec3(floor(p.x.mul(0.19).add(cell.x.mul(0.6))), 1.3, floor(p.z.mul(0.19).add(cell.x.mul(0.6))))).mul(0.12)
  const patch = mx_noise_float(p.mul(0.3)).mul(0.07).add(mx_noise_float(p.mul(1.2)).mul(0.04))
  const roofK = float(1).add(shade).add(patch).sub(seam.mul(0.14))
  const walls = mix(face, bond(face, uPix), baked)
  // roofs are plastered earth over timber whatever the walls are laid in; a third of the wall's own tone kept
  const top = mix(vec3(...TONES.roof).mul(0.94), walls, 0.35).mul(roofK)
  m.colorNode = mix(mix(walls, top, up), classColour(t, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
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

/** the houses: mud brick under mud plaster with a white gypsum wash (REC bab.houses.type), each house its own shade; the
    walls a little darker at the foot where the wash wears; the roofs of trodden mud plaster, each range its own shade, the
    parapet's lip catching the light and the shade just inside it (per instance `hinfo`: house, range, the ground's level, the class band; and `size`) */
export function houseMaterial(t: ClassTones): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 })
  const info = attribute('hinfo', 'vec4'), size = attribute('size', 'vec3')
  const h = info.x, part = info.y, gy = info.z
  const g = positionGeometry, p = positionWorld
  const a = hash(h.add(0.37)), b = hash(h.mul(1.71).add(5.3)), r = hash(h.mul(3.1).add(part.mul(7.3)).add(1.9))
  const lean = mix(vec3(0.97, 0.99, 1.03), vec3(1.03, 1.0, 0.95), b)
  const wash = vec3(...TONES.plaster).mul(a.sub(0.5).mul(0.16).add(1)).mul(lean)
  const above = p.y.sub(gy)
  const wall = wash.mul(mix(float(0.8), float(1), smoothstep(0.15, 0.9, above))).mul(float(1).add(mx_noise_float(p.mul(vec3(0.5, 0.12, 0.5))).mul(0.06)))
  const ex = float(0.5).sub(abs(g.x)).mul(size.x), ez = float(0.5).sub(abs(g.z)).mul(size.z)
  const e = min(ex, ez)
  const roofTone = vec3(...TONES.roof).mul(r.sub(0.5).mul(0.2).add(1)).mul(lean)
  const patch = mx_noise_float(p.mul(0.35)).mul(0.08).add(mx_noise_float(p.mul(1.4)).mul(0.04))
  const lip = smoothstep(0.34, 0.22, e)
  const inner = smoothstep(0.3, 0.42, e).mul(smoothstep(0.9, 0.6, e))
  const roof = roofTone.mul(float(1).add(patch)).mul(float(1).add(lip.mul(0.08))).mul(float(1).sub(inner.mul(0.18)))
  const up = smoothstep(0.5, 0.8, normalWorld.y)
  // the court's floor (part 4): baked brick laid flat, a little darker toward the walls that shade it
  const jx = smoothstep(0.86, 0.93, abs(fract(p.x.div(0.33)).sub(0.5)).mul(2)), jz = smoothstep(0.86, 0.93, abs(fract(p.z.div(0.33)).sub(0.5)).mul(2))
  const court = vec3(...TONES.baked).mul(0.9).mul(float(1).add(r.sub(0.5).mul(0.12))).mul(float(1).sub(max(jx, jz).mul(0.25))).mul(mix(float(0.82), float(1), smoothstep(0.3, 1.2, e)))
  const isCourt = step(3.5, part)
  m.colorNode = mix(mix(mix(wall, roof, up), court, isCourt.mul(up)), classColour(t, attribute('cls', 'vec2'), info.w), uView)
  return m
}

/** the north entry's bodies (north.ts): baked brick in its bond everywhere; the North Gate laid in bitumen below `split` and
    lime-gypsum mortar above (S1-12); the palace's north wall limestone below +0.5 (SET D7), its blocks about 2 m long and
    75 cm high in level courses with fine joints, rough-faced (S1-06; A2), the waterline's wet band on stone and brick; the
    dam's culvert mouths at the waterline (S1-02; their shape ours); tops paved in square brick, the dam's crest earth */
export interface NorthLook { o: [number, number]; a: [number, number]; culvert: { a: number; half: number; crown: number }; split: number; stoneTop: number }
export function northMaterial(t: ClassTones, L: NorthLook, uPix: N): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 })
  const k = attribute('nk', 'float')
  const p = positionWorld, n = normalWorld
  const isGate = step(k, 0.5), isDam = step(0.5, k).mul(step(k, 1.5)), isWall = step(1.5, k).mul(step(k, 2.5))
  const up = smoothstep(0.55, 0.85, n.y)
  const baked = vec3(...TONES.baked)
  const face = brickFace(baked).mul(float(1).add(mx_noise_float(p.mul(vec3(0.05, 0.2, 0.05))).mul(0.07)))
  const bitumen = vec3(0.03, 0.027, 0.024), limeGyp = vec3(...srgb(196, 188, 166)), mortar = vec3(...srgb(120, 106, 86))
  const joint = mix(mortar, mix(bitumen, limeGyp, step(L.split, p.y)), isGate)
  const brick = brickBond(face, uPix, joint)
  // tops: square bricks laid flat, the dam's crest trodden earth
  const w = footprint(uPix, n)
  const pave = max(lines(p.x, 0.345, 0.009, w), lines(p.z, 0.345, 0.009, w))
  const topBrick = mix(face.mul(1.04), face.mul(0.66), pave)
  const crest = vec3(...TONES.silt).mul(1.08).mul(float(1).add(mx_noise_float(p.mul(0.4)).mul(0.1)).add(mx_noise_float(p.mul(2.3)).mul(0.05))).mul(float(1).sub(smoothstep(0.05, 0.4, mx_noise_float(vec3(p.x.mul(0.6), 0.5, p.z.mul(0.06)))).mul(0.12)))
  let c: N = mix(brick, mix(topBrick, crest, isDam), up)
  // the limestone foot: courses down from its top, blocks about 2 m with a course's own offset, fine joints
  const tx = normalize(vec2(n.z.negate(), n.x).add(vec2(1e-5, 0)))
  const u = p.x.mul(tx.x).add(p.z.mul(tx.y))
  const depth = float(L.stoneTop).sub(p.y)
  const course = floor(depth.div(0.75))
  const off = fract(sin(course.mul(17.3).add(2.1)).mul(43758.5)).mul(2.0)
  const blk = floor(u.add(off).div(2.0))
  const sj = max(lines(depth, 0.75, 0.012, w), lines(u.add(off), 2.0, 0.012, w))
  const bt = hash(blk.mul(13.1).add(course.mul(7.7)))
  const rough = mx_noise_float(p.mul(1.1)).mul(0.035).add(mx_noise_float(p.mul(4.5)).mul(0.02))
  const stone = mix(vec3(...TONES.lime).mul(bt.sub(0.5).mul(0.34).add(1)).mul(float(1).add(rough)), vec3(...TONES.lime).mul(0.42), sj)
  const isStone = isWall.mul(step(p.y, L.stoneTop)).mul(float(1).sub(up))
  c = mix(c, stone, isStone)
  // the culvert's mouths on the dam's sloping walls: a narrow opening, its top drawn in like the roof of edge-laid bricks
  const along = p.x.sub(L.o[0]).mul(L.a[0]).add(p.z.sub(L.o[1]).mul(L.a[1]))
  const da = abs(along.sub(L.culvert.a))
  const half = float(L.culvert.half).mul(clamp(float(L.culvert.crown).sub(p.y).div(0.55), 0, 1))
  const side = isDam.mul(float(1).sub(up))
  const mouth = step(da, half).mul(side)
  const ring = step(da, half.add(0.2)).mul(step(p.y, L.culvert.crown + 0.2)).mul(side).sub(mouth).max(0)
  c = mix(c, c.mul(1.12), ring.mul(0.7))
  c = mix(c, vec3(0.012, 0.011, 0.01), mouth)
  // the wet band at the waterline (the water at -1.0 on the map)
  const wet = smoothstep(-0.25, -0.85, p.y).mul(float(1).sub(up))
  c = mix(c, c.mul(vec3(0.62, 0.64, 0.58)), wet)
  m.colorNode = mix(c, classColour(t, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  // rough-faced stone: each block's face uneven, its edges falling back to the joint
  const vv = fract(depth.div(0.75)), uu = fract(u.add(off).div(2.0))
  const gu = smoothstep(0.03, 0, uu).negate().add(smoothstep(0.97, 1, uu)).mul(0.5)
  const gv = smoothstep(0.08, 0, vv).sub(smoothstep(0.92, 1, vv)).mul(0.5)
  const e1 = 0.3
  const q = p.mul(1.3)
  const n0 = mx_noise_float(q), nu = mx_noise_float(q.add(vec3(tx.x.mul(e1), 0, tx.y.mul(e1)))), nv = mx_noise_float(q.add(vec3(0, e1, 0)))
  const tilt = vec2(nu.sub(n0), nv.sub(n0)).mul(0.15).add(vec2(gu, gv).mul(0.4))
  const nb = normalize(n.add(vec3(tx.x, 0, tx.y).mul(tilt.x.mul(isStone))).add(vec3(0, 1, 0).mul(tilt.y.mul(isStone))))
  m.normalNode = normalize(cameraViewMatrix.mul(vec4(nb, 0)).xyz)
  return m
}

/** the date palms: trunks grey-brown, fronds the date palm's grey-green, the oldest hanging dry; each palm its own shade */
export function palmMaterial(t: ClassTones): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0, side: DoubleSide })
  const pk = attribute('pk', 'float')
  const v = hash(float(instanceIndex).add(0.7)), v2 = hash(float(instanceIndex).mul(1.9).add(4.1))
  const trunk = vec3(...srgb(112, 96, 76)).mul(v.mul(0.2).add(0.9)).mul(float(1).add(sin(positionGeometry.y.mul(9)).mul(0.06)))
  const green = mix(vec3(...srgb(74, 88, 58)), vec3(...srgb(98, 108, 74)), v2)
  const dry = vec3(...srgb(136, 112, 78))
  const c = mix(mix(trunk, green, step(0.5, pk)), dry, step(1.5, pk))
  m.colorNode = mix(c, classColour(t, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  return m
}

/** the processional street north of the gate, in the gate's own paving (gate plan, street.paving): limestone slabs of 1.05 m
    five across on the axis, red breccia slabs of 0.66 m four each side, brick of 0.33 m with asphalt joints out to the walls;
    walked lighter along the middle. Measured in the lion frame (`o`, `a` along, `c` across); the rest of the ribbon plain slab */
export interface StreetLook { o: [number, number]; a: [number, number]; c: [number, number] }
export function streetMaterial(t: ClassTones, F: StreetLook, uPix: N): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 })
  const p = positionWorld
  const v = mx_noise_float(p.mul(0.05)).mul(0.06).add(mx_noise_float(p.mul(0.6)).mul(0.04)).add(1)
  const dx = p.x.sub(F.o[0]), dz = p.z.sub(F.o[1])
  const s = dx.mul(F.a[0]).add(dz.mul(F.a[1])), c = dx.mul(F.c[0]).add(dz.mul(F.c[1]))
  const w = footprint(uPix, vec3(0, 1, 0))
  const half = 2.625, outer = half + 0.66 * 4
  const at = abs(c)
  const inLime = step(at, half), inBrec = step(half, at).mul(step(at, outer))
  const jl = max(lines(c.add(half), 1.05, 0.005, w), lines(s, 1.05, 0.005, w))
  const jb = max(lines(at.sub(half), 0.66, 0.005, w), lines(s.add(0.33), 0.66, 0.005, w))
  const kk = floor(s.div(0.33))
  const jr = max(lines(s, 0.33, 0.007, w), lines(c.add(kk.sub(floor(kk.div(2)).mul(2)).mul(0.165)), 0.33, 0.007, w))
  const sl = hash(floor(c.div(1.05)).mul(7.1).add(floor(s.div(1.05)).mul(3.3)))
  const worn = float(1).sub(smoothstep(1.0, 4.5, at))
  const lime = vec3(...PAL.limestone).mul(1.12).mul(float(1).add(sl.sub(0.5).mul(0.16)).add(worn.mul(0.06))).mul(v)
  const bh = hash(floor(c.div(0.66)).mul(5.3).add(floor(s.div(0.66)).mul(1.7)))
  const brec = mix(vec3(...PAL.breccia), vec3(...PAL.brecciaDark), bh.mul(0.6)).mul(float(1.1).add(mx_noise_float(p.mul(3.1)).mul(0.12))).mul(v)
  const brk = mix(vec3(...PAL.buff), vec3(...PAL.redBrown), hash(kk.add(floor(c.div(0.33)).mul(9.7))).mul(0.6)).mul(0.95).mul(v)
  const dark = vec3(...PAL.asphalt)
  const paved = mix(mix(mix(brk, dark, jr.mul(0.7)), mix(brec, brec.mul(0.6), jb), inBrec), mix(lime, lime.mul(0.66), jl), inLime)
  const north = step(-4, s)
  const col = mix(vec3(...TONES.slab).mul(v), paved, north)
  m.colorNode = mix(col, classColour(t, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
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
/** the plain's map (green.ts paintPlain) over its square: colour and masks (r canal, g field, b grove floor) */
export interface PlainLook { colour: Texture; masks: Texture; x0: number; z0: number; size: number }

/** the ground: inside the inner city beaten earth, dusty and trodden, never one flat value (L5); outside, the plain's fields,
    canals and grove floors from the plain's map, and beyond it dry silt in tracts; damp and darker near the water's level;
    grey in the class view as on the map */
export function groundMaterial(waterLevel: number, plain?: PlainLook, sky?: (d: N) => N): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 })
  const p = positionWorld
  const broad = mx_noise_float(vec3(p.x.mul(0.0022), 0, p.z.mul(0.0022)))
  const fields = mx_noise_float(vec3(p.x.mul(0.011), 3.3, p.z.mul(0.011)))
  const lean = smoothstep(0.05, 0.45, mx_noise_float(vec3(p.x.mul(0.004), 7.1, p.z.mul(0.004))))
  const fine = mx_noise_float(p.mul(0.15)).mul(0.05)
  const silt = mix(vec3(...TONES.silt), vec3(...TONES.silt).mul(vec3(0.9, 0.97, 0.84)), lean.mul(0.8))
  const dry = silt.mul(float(1).add(broad.mul(0.2)).add(fields.mul(0.1)).add(fine))
  const tn = mx_noise_float(vec3(p.x.mul(0.0011), 11.3, p.z.mul(0.0016))).add(mx_noise_float(vec3(p.x.mul(0.0043), 5.9, p.z.mul(0.0043))).mul(0.45))
  const near = smoothstep(7000, 4500, vec2(p.x, p.z).length())
  const city = max(insideConvex(INNER[0]!, p, 60), insideConvex(INNER[1]!, p, 60))
  const outside = float(1).sub(city).mul(uTracts).mul(near)
  const grown = smoothstep(0.08, 0.32, tn).mul(outside)
  const fallow = smoothstep(-0.12, -0.36, tn).mul(outside)
  let g: N = mix(mix(dry, dry.mul(vec3(0.62, 0.66, 0.52)), grown), dry.mul(1.12), fallow)
  // the city's open ground: beaten earth a shade paler than the plain, trodden darker in streaks, dust in patches
  const tread = mx_noise_float(vec3(p.x.mul(0.03), 2.2, p.z.mul(0.09)))
  const dust = mx_noise_float(p.mul(0.07)).mul(0.14).add(mx_noise_float(p.mul(0.5)).mul(0.09)).add(mx_noise_float(p.mul(2.1)).mul(0.05))
  const cityG = vec3(...TONES.silt).mul(vec3(1.12, 1.1, 1.08)).mul(float(1).add(dust)).mul(float(1).sub(smoothstep(0.1, 0.5, tread).mul(0.18)))
  g = mix(g, cityG, city)
  if (plain) {
    const uv = vec2(p.x.sub(plain.x0).div(plain.size), p.z.sub(plain.z0).div(plain.size))
    const inDom = smoothstep(0.0, 0.02, uv.x).mul(smoothstep(1.0, 0.98, uv.x)).mul(smoothstep(0.0, 0.02, uv.y)).mul(smoothstep(1.0, 0.98, uv.y))
    const col = texture(plain.colour, uv).rgb
    const msk = texture(plain.masks, uv)
    const out = float(1).sub(city).mul(inDom)
    const crop = col.mul(float(1).add(mx_noise_float(p.mul(0.25)).mul(0.08)).add(mx_noise_float(vec3(p.x.mul(1.2), 0, p.z.mul(1.2))).mul(0.05)))
    const drawn = max(smoothstep(0.3, 0.75, msk.g), smoothstep(0.3, 0.75, msk.b))
    g = mix(g, crop, drawn.mul(out))
    // the canals: damp levees, then water that takes the sky
    const levee = smoothstep(0.02, 0.25, msk.r).mul(out)
    g = mix(g, vec3(...TONES.damp).mul(1.15), levee.mul(0.7))
    const wat = smoothstep(0.35, 0.7, msk.r).mul(out)
    if (sky) {
      const view = normalize(p.sub(cameraPosition))
      const r = vec3(view.x, view.y.negate().max(0.02), view.z)
      const fres = float(0.03).add(float(0.97).mul(pow(float(1).sub(view.y.negate().max(0)), 5)))
      const waterC = mix(vec3(0.07, 0.08, 0.07), sky(normalize(r)).mul(0.9), fres)
      g = mix(g, waterC, wat)
    }
  }
  const wet = smoothstep(waterLevel + 2.6, waterLevel + 0.15, p.y)
  g = mix(g, vec3(...TONES.damp), wet)
  m.colorNode = mix(g, vec3(0.5, 0.48, 0.44), uView)
  // the banks fall from the plain to the bed across a single cell of the 20 m grid, so their faces tilt by the triangle
  // and light up in a zig-zag along the shore; near the water's level the shading normal leans back toward up
  const lean2 = smoothstep(waterLevel + 4.5, waterLevel + 0.5, p.y)
  const n = normalize(mix(normalWorld, vec3(0, 1, 0), lean2.mul(0.85)))
  m.normalNode = normalize(cameraViewMatrix.mul(vec4(n, 0)).xyz)
  return m
}

/** the water: the silt-laden body, by Fresnel the mirrored scene (walls, the tower, the sky: a planar reflection at the
    water's level, its image bent by the ripples) or the sky alone, wind streaks, ripples moving with the clock, the sun's glints */
export function waterMaterial(A: AirUniforms, sky: (d: N) => N, uTime: N, mirror?: N): Material {
  const m = new MeshBasicNodeMaterial({ side: DoubleSide })
  const p = positionWorld
  const t = uTime
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
  const lit = max(A.uSun.y, 0).mul(1.6).add(0.55).mul(A.uDay)
  const body = vec3(0.085, 0.095, 0.085).mul(lit)
  let refl: N = sky(normalize(rUp)).mul(vec3(0.92, 0.96, 1.0))
  if (mirror) {
    // the mirrored scene, its lookup bent by the ripples' slope; distance thins the bend so far walls stay whole
    const bend = sl.mul(0.012).div(max(p.distance(cameraPosition).mul(0.0015), 1))
    mirror.uvNode = mirror.uvNode.add(bend)
    refl = mirror.rgb.mul(vec3(0.92, 0.96, 1.0))
  }
  const glint = pow(max(dot(r, A.uSun), 0), 600).mul(60).mul(A.uDay)
  const sheen = pow(max(dot(r, A.uSun), 0), 24).mul(0.25).mul(A.uDay)
  const c = mix(body, refl, fres).add(vec3(1, 0.82, 0.6).mul(glint.add(sheen)))
  m.colorNode = mix(c, vec3(0.3, 0.33, 0.36), uView.mul(0.6))
  m.fog = false
  void uniform
  void min
  return m
}
