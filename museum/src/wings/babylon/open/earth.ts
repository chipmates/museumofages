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
const { abs, atan, attribute, cameraPosition, cameraViewMatrix, clamp, cos, dot, float, floor, fract, instanceIndex, max, min, mix, mod, mx_noise_float, normalWorld, normalize, positionGeometry, positionWorld, pow, reflect, sin, smoothstep, step, texture, uniform, vec2, vec3, vec4 } = TSL as unknown as Record<string, N>

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

/** trodden earth: the dam's crest, the street past its paving, the way on over the plain (ours). Its grain reads from the
    flight (10 to 100 m): dusty patches and compacted ones a few metres across, tracks drawn out along the way (north-south),
    finer foot and hoof lines in them, and near the eye a grit of brick crumbs and pale lime bits */
export function troddenEarth(p: N): N {
  const base = vec3(...TONES.silt).mul(1.08)
  const patch = mx_noise_float(vec3(p.x.mul(0.13), 1.9, p.z.mul(0.11)))
  const dusty = mix(base.mul(vec3(0.94, 0.95, 0.97)), base.mul(vec3(1.1, 1.07, 1.02)), smoothstep(-0.35, 0.45, patch))
  const tone = float(1).add(mx_noise_float(p.mul(0.4)).mul(0.1)).add(mx_noise_float(p.mul(2.3)).mul(0.05))
  const track = smoothstep(0.05, 0.4, mx_noise_float(vec3(p.x.mul(0.5), 0.5, p.z.mul(0.11)))).mul(0.14)
  const lines2 = smoothstep(0.1, 0.45, mx_noise_float(vec3(p.x.mul(2.2), 3.1, p.z.mul(0.35)))).mul(0.07)
  // stains and scuffs a metre or two across, so the crest from 20 to 60 m reads as earth, not as a brushed plane
  const scuff = smoothstep(0.2, 0.6, mx_noise_float(vec3(p.x.mul(0.7), 6.3, p.z.mul(0.7)))).mul(0.09)
  const near = smoothstep(70, 18, p.distance(cameraPosition))
  const cell = vec2(floor(p.x.div(0.28)), floor(p.z.div(0.28)))
  const g = fract(sin(cell.x.mul(127.1).add(cell.y.mul(311.7))).mul(43758.5))
  const crumb = step(0.94, g).mul(near), lime = step(g, 0.035).mul(near)
  const ground = dusty.mul(tone).mul(float(1).sub(track).sub(lines2).sub(scuff))
  return mix(mix(ground, base.mul(vec3(0.86, 0.66, 0.52)), crumb.mul(0.7)), base.mul(1.25), lime.mul(0.6))
}

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

/** the room roofs' factor on a top (1 is the plain plaster): rooms in a jittered grid, parapet lines box-filtered over the
    pixel's footprint `w`, a court in about one room in eight. `o` refines it for a nearer camera: `split` the share of
    cells cut into two rooms at 30 to 70 percent across (a palace's halls are not one square each), `line` how dark a
    parapet's line, `tone` each room's spread of value; none keeps the arrival's */
export interface RoomRoofs { split?: number; line?: number; tone?: number }
function roomRoofs(p: N, w: N, o: RoomRoofs = {}): N {
  const S = 11.0
  const row = floor(p.z.div(S))
  const x = p.x.add(hash(row.mul(3.7).add(1.3)).mul(0.6 * S))
  const col = floor(x.div(S))
  const id = hash(col.mul(17.1).add(row.mul(31.7)).add(0.5))
  const fx = fract(x.div(S)), fz = fract(p.z.div(S))
  // the parapet between rooms, 0.6 m, box-filtered over the pixel
  let line: N = max(lines(x, S, 0.3, w), lines(p.z, S, 0.3, w))
  let tone: N = id.sub(0.5).mul(o.tone ?? 0.16).add(1)
  if (o.split) {
    // a cell cut in two along x or z, each room its own value, the cut a parapet like the rest
    const across = step(0.5, hash(id.mul(3.1).add(5.7)))
    const at = hash(id.mul(7.3).add(2.1)).mul(0.4).add(0.3)
    const cut = step(1 - o.split, hash(id.mul(11.3).add(0.9)))
    const f = mix(fx, fz, across)
    line = max(line, lines(f.sub(at).mul(S), S, 0.3, w).mul(cut))
    const id2 = hash(id.mul(5.9).add(step(at, f).mul(cut).mul(13.7)).add(1.1))
    tone = id2.sub(0.5).mul(o.tone ?? 0.16).add(1)
  }
  // a court in about one room in eight: a square about a third of the room across, in shade; a far device only: within
  // about half a kilometre a painted court reads as a flat dark square (it has no walls), so it fades out there
  const far = smoothstep(350, 700, p.distance(cameraPosition))
  const court = step(0.875, id).mul(smoothstep(0.19, 0.16, max(abs(fx.sub(0.5)), abs(fz.sub(0.5))))).mul(far)
  return tone.mul(float(1).sub(line.mul(o.line ?? 0.18))).mul(float(1).sub(court.mul(0.4)))
}

/** a wall's foot in the river or a moat (the water at -1.0): darker and wetter toward the water, about 1.5 m of it */
function waterFoot(p: N, up: N): N {
  const damp = smoothstep(0.6, -0.9, p.y).mul(float(1).sub(up))
  return mix(vec3(1), vec3(0.66, 0.67, 0.62), damp)
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
  m.colorNode = mix(cityBlockColour(base, baked, uPix), classColour(t, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  return m
}

/** a block's look without the class view, for a page that composes its own material (the map): `base` its tone, `baked`
    0 to 1 how much of its brick bond shows; `seamsFrom` the distances (m) over which the roof cells' seams come in, for
    a camera that comes down to the roofs (close up a seam reads as a crack), none keeps them at every distance; `rooms`
    the room roofs' refinement (roomRoofs) */
export function cityBlockColour(base: N, baked: N, uPix: N, o: { seamsFrom?: [number, number]; rooms?: RoomRoofs } = {}): N {
  const face = brickFace(base)
  // a flat roof is never one plane from the air: rooms' roofs in irregular cells a few metres across, each its own shade,
  // a darker seam where two meet, patches of fresh plaster
  const p = positionWorld
  const up = smoothstep(0.55, 0.85, normalWorld.y)
  const cell = mx_worley_noise_vec2(vec2(p.x, p.z).mul(0.19))
  const seam0 = smoothstep(0.07, 0.02, cell.y.sub(cell.x))
  const seam = o.seamsFrom ? seam0.mul(smoothstep(o.seamsFrom[0], o.seamsFrom[1], p.distance(cameraPosition))) : seam0
  const shade = mx_noise_float(vec3(floor(p.x.mul(0.19).add(cell.x.mul(0.6))), 1.3, floor(p.z.mul(0.19).add(cell.x.mul(0.6))))).mul(0.12)
  const patch = mx_noise_float(p.mul(0.3)).mul(0.07).add(mx_noise_float(p.mul(1.2)).mul(0.04))
  // and at the scale of whole rooms, seen from the air: a jittered grid of room roofs 8 to 14 m, each its own shade, a parapet's
  // dark line between them, now and then a small court or light well in shade (ours, a type: no room plan is claimed)
  const R = roomRoofs(p, footprint(uPix, vec3(0, 1, 0)), o.rooms)
  const roofK = float(1).add(shade).add(patch).sub(seam.mul(0.14)).mul(R)
  const wet = waterFoot(p, up)
  // baked faces as the north entry's: patches of a few metres and the courses' own shades over the bond, so a long sunlit
  // face (the outer city's river wall from the air) never reads as one flat value
  const tw = normalize(vec2(normalWorld.z.negate(), normalWorld.x).add(vec2(1e-5, 0)))
  const uw = p.x.mul(tw.x).add(p.z.mul(tw.y))
  const patchW = smoothstep(-0.25, 0.35, mx_noise_float(vec3(uw.mul(0.32), p.y.mul(0.55), 1.7))).sub(0.5).mul(0.18)
  const broadW = mx_noise_float(vec3(uw.mul(0.045), p.y.mul(0.08), 5.3)).mul(0.1)
  const courseW = hash(floor(p.y.div(0.105)).add(floor(uw.div(7.0)).mul(13.1))).sub(0.5).mul(0.06)
  const walls = mix(face, bond(face.mul(float(1).add(patchW).add(broadW).add(courseW)), uPix), baked).mul(wet)
  // roofs are plastered earth over timber whatever the walls are laid in; a third of the wall's own tone kept
  const top = mix(vec3(...TONES.roof).mul(0.94), walls, 0.35).mul(roofK)
  return mix(walls, top, up)
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
    parapet's lip catching the light and the shade just inside it; each block between streets its own value, so from the air the
    blocks read apart and the streets between them (per instance `hinfo`: house, range + 8 x the butted sides, the ground's
    level, the block; and `size`); `band` is the class band's height over the ground */
export function houseMaterial(t: ClassTones, band = 0): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 })
  const info = attribute('hinfo', 'vec4'), size = attribute('size', 'vec3')
  const h = info.x, part = mod(info.y, 8), gy = info.z
  const butt = floor(info.y.div(8))
  const g = positionGeometry, p = positionWorld
  const a = hash(h.add(0.37)), b = hash(h.mul(1.71).add(5.3)), r = hash(h.mul(3.1).add(part.mul(7.3)).add(1.9))
  const blockK = hash(info.w.mul(0.917).add(6.1)).sub(0.5).mul(0.3).add(1)
  const lean = mix(vec3(0.97, 0.99, 1.03), vec3(1.03, 1.0, 0.95), b)
  const wash = vec3(...TONES.plaster).mul(a.sub(0.5).mul(0.24).add(1)).mul(lean)
  const above = p.y.sub(gy)
  const wall = wash.mul(mix(float(0.8), float(1), smoothstep(0.15, 0.9, above))).mul(float(1).add(mx_noise_float(p.mul(vec3(0.5, 0.12, 0.5))).mul(0.06)))
  // the distance to the box's nearest side that is a parapet (the house's outside or its court), not a seam where two rooms
  // of the house meet: a lip on every room drew each roof as a row of planks
  const side = (k: number): N => mod(floor(butt.div(k)), 2).mul(100)
  const e = min(min(float(0.5).add(g.x).mul(size.x).add(side(1)), float(0.5).sub(g.x).mul(size.x).add(side(2))), min(float(0.5).add(g.z).mul(size.z).add(side(4)), float(0.5).sub(g.z).mul(size.z).add(side(8))))
  // a roof is trodden mud plaster: nearly half of them bare of any wash, darker and browner; each house its own value, each
  // range and each room its own shade, so neighbours never read as one laid tile
  const bare = step(0.55, hash(h.mul(2.3).add(8.1)))
  const own = hash(h.mul(5.37).add(2.9)).sub(0.5).mul(0.16).add(1)
  const room = hash(float(instanceIndex).mul(0.731).add(4.2)).sub(0.5).mul(0.08).add(1)
  const roofTone = mix(vec3(...TONES.roof), vec3(...TONES.mud).mul(1.06), bare.mul(0.8)).mul(r.sub(0.5).mul(0.12).add(1)).mul(own).mul(room).mul(blockK).mul(lean)
  const patch = mx_noise_float(p.mul(0.35)).mul(0.08).add(mx_noise_float(p.mul(1.4)).mul(0.04))
  const lip = smoothstep(0.34, 0.22, e)
  const inner = smoothstep(0.3, 0.42, e).mul(smoothstep(0.9, 0.6, e))
  const roof = roofTone.mul(float(1).add(patch)).mul(float(1).add(lip.mul(0.08))).mul(float(1).sub(inner.mul(0.18)))
  const up = smoothstep(0.5, 0.8, normalWorld.y)
  // the court's floor (part 4): baked brick laid flat, a little darker toward the walls that shade it
  const jx = smoothstep(0.86, 0.93, abs(fract(p.x.div(0.33)).sub(0.5)).mul(2)), jz = smoothstep(0.86, 0.93, abs(fract(p.z.div(0.33)).sub(0.5)).mul(2))
  const court = vec3(...TONES.baked).mul(0.9).mul(float(1).add(r.sub(0.5).mul(0.12))).mul(float(1).sub(max(jx, jz).mul(0.25))).mul(mix(float(0.82), float(1), smoothstep(0.3, 1.2, e)))
  const isCourt = step(3.5, part)
  // a butted side's face shows only as the step between two rooms' roofs: the roof's plaster, not the wall's wash (a washed
  // step drew a bright dash at every seam)
  const seam = max(max(step(0.499, g.x.negate()).mul(side(1)), step(0.499, g.x).mul(side(2))), max(step(0.499, g.z.negate()).mul(side(4)), step(0.499, g.z).mul(side(8)))).div(100)
  const face = mix(wall, roof.mul(0.9), seam)
  m.colorNode = mix(mix(mix(face, roof, up), court, isCourt.mul(up)), classColour(t, attribute('cls', 'vec2'), gy.add(band)), uView)
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
  // brick faces in patches of a few metres (repairs, weathering, a course or two of another firing) and the courses' own shades,
  // so a face in shade still shows its making; ours
  const tx0 = normalize(vec2(n.z.negate(), n.x).add(vec2(1e-5, 0)))
  const u0 = p.x.mul(tx0.x).add(p.z.mul(tx0.y))
  const patchB = smoothstep(-0.25, 0.35, mx_noise_float(vec3(u0.mul(0.32), p.y.mul(0.55), 1.7))).sub(0.5).mul(0.18)
  const courseB = hash(floor(p.y.div(0.105)).add(floor(u0.div(7.0)).mul(13.1))).sub(0.5).mul(0.06)
  const brick = brickBond(face.mul(float(1).add(patchB).add(courseB)), uPix, joint)
  // tops: square bricks laid flat, the dam's crest trodden earth
  const w = footprint(uPix, n)
  const pave = max(lines(p.x, 0.345, 0.009, w), lines(p.z, 0.345, 0.009, w))
  const topBrick = mix(face.mul(1.04), face.mul(0.66), pave)
  const crest = troddenEarth(p)
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
  // block to block and over each face as uneven as the dug wall's stone (fill target A.10, k1914 fig. 110 at the moat pass)
  const rough = mx_noise_float(p.mul(1.1)).mul(0.05).add(mx_noise_float(p.mul(4.5)).mul(0.03))
  const stone = mix(vec3(...TONES.lime).mul(bt.sub(0.5).mul(0.44).add(1)).mul(float(1).add(rough)), vec3(...TONES.lime).mul(0.42), sj)
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
  // the wet band at the waterline (the water at -1.0 on the map), on brick a damp foot above it
  const wet = smoothstep(-0.25, -0.85, p.y).mul(float(1).sub(up))
  c = mix(c, c.mul(vec3(0.62, 0.64, 0.58)), wet)
  c = c.mul(mix(vec3(1), waterFoot(p, up), float(1).sub(isStone)))
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

/** the date palms: the palm's own vertex colours (trunk, green and pale fronds, the dead ones hanging), each palm its own shade */
export function palmMaterial(t: ClassTones): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0, side: DoubleSide })
  const v = hash(float(instanceIndex).add(0.7)), v2 = hash(float(instanceIndex).mul(1.9).add(4.1))
  const c = attribute('color', 'vec3').mul(v.mul(0.2).add(0.9)).mul(mix(vec3(1.0, 0.97, 1.03), vec3(1.0, 1.04, 0.94), v2))
  m.colorNode = mix(c, classColour(t, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  return m
}

/** the processional street north of the gate, in the gate's own paving (gate plan, street.paving): limestone slabs of 1.05 m
    five across on the axis, red breccia slabs of 0.66 m four each side, brick of 0.33 m with asphalt joints out to the walls;
    walked lighter along the middle. Measured in the lion frame (`o`, `a` along, `c` across); the paving ends at `pavedTo` (a), its
    edge a little uneven, and the street beyond is trodden earth; south of the gate's face the ribbon is plain slab */
export interface StreetLook { o: [number, number]; a: [number, number]; c: [number, number]; pavedTo: number }
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
  const beyond = step(F.pavedTo, s.add(mx_noise_float(vec3(c.mul(0.9), 2.7, 0)).mul(0.5)))
  const col = mix(mix(vec3(...TONES.slab).mul(v), paved, north), troddenEarth(p), beyond)
  m.colorNode = mix(col, classColour(t, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  return m
}

/** the plain's large-scale tracts outside the inner city: 0 none, 1 full */
export const uTracts = uniform(1)
/* the inner city on both banks as two convex outlines (UTM; the plan's circuits closed along the river), where no tract is drawn */
const INNER: Array<Array<[number, number]>> = [
  [[445340, 3600900], [445440, 3601090], [446737, 3601360], [447230, 3599740], [445934, 3599110], [445380, 3599100]],
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
export interface PlainLook { colour: Texture; masks: Texture; rows?: Texture; x0: number; z0: number; size: number; uPix?: N }

/** the ground: inside the inner city beaten earth, dusty and trodden, never one flat value (L5); outside, the plain's fields,
    canals and grove floors from the plain's map, and beyond it dry silt in tracts; damp and darker near the water's level;
    grey in the class view as on the map */
export function groundMaterial(waterLevel: number, plain?: PlainLook, sky?: (d: N) => N, track?: Array<[number, number]>): Material {
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
    // a field is one crop: only a little uneven inside it (a broad blotch read as patches from the air), finer rows near
    let crop: N = col.mul(float(1).add(mx_noise_float(p.mul(0.25)).mul(0.035)).add(mx_noise_float(vec3(p.x.mul(1.2), 0, p.z.mul(1.2))).mul(0.05)))
    const isField = smoothstep(0.3, 0.75, msk.g)
    if (plain.rows && plain.uPix) {
      // each plot sown in strips along its long side (a strip 5 to 11 m, its own shade of the crop: sown or watered a few
      // days apart), furrows 1.4 m apart, and the crop's tone drifting across the plot; each faded where a pixel spans it,
      // across the strips by the view's slant, so nothing shimmers from the air
      const rw = texture(plain.rows, uv)
      const ang = atan(rw.g.mul(2).sub(1), rw.r.mul(2).sub(1)).mul(0.5)
      const nx = sin(ang).negate(), nz = cos(ang)
      const seed = rw.b
      const v = p.x.mul(nx).add(p.z.mul(nz))
      const view = normalize(p.sub(cameraPosition))
      const flatLen = max(vec2(view.x, view.z).length(), 1e-4)
      const c = view.x.mul(nx).add(view.z.mul(nz)).div(flatLen)
      const fp = p.distance(cameraPosition).mul(plain.uPix).mul(c.mul(c).div(max(view.y.mul(view.y), 0.012)).add(float(1).sub(c.mul(c))).sqrt())
      const ws = float(5).add(seed.mul(6))
      const si = floor(v.div(ws))
      const h = fract(sin(si.mul(12.9898).add(seed.mul(78.233))).mul(43758.5453))
      const e = fract(v.div(ws))
      const bund = smoothstep(0.0, 0.06, e).mul(smoothstep(1.0, 0.94, e))
      const stripK = smoothstep(ws.mul(0.75), ws.mul(0.25), fp)
      const strip = mix(vec3(1), mix(vec3(0.82, 0.88, 0.84), vec3(1.14, 1.1, 0.88), h).mul(mix(0.84, 1, bund)), stripK)
      const fu = fract(v.div(1.4))
      const furrow = float(1).sub(smoothstep(0.32, 0.5, abs(fu.sub(0.5))).mul(0.16).mul(smoothstep(0.7, 0.3, fp)))
      const drift = mx_noise_float(vec3(p.x.mul(0.03), seed.mul(17), p.z.mul(0.03)))
      const tone = mix(vec3(0.9, 0.94, 0.95), vec3(1.1, 1.07, 0.88), smoothstep(-0.35, 0.35, drift))
      crop = mix(crop, crop.mul(strip).mul(furrow).mul(tone), isField)
    }
    const drawn = max(isField, smoothstep(0.3, 0.75, msk.b))
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
  if (track && track.length > 1) {
    // the way on from the street's end (scene points), 9 m of trodden earth that fades out along it
    let total = 0
    const lens: number[] = []
    for (let i = 0; i + 1 < track.length; i++) { const L = Math.hypot(track[i + 1]![0] - track[i]![0], track[i + 1]![1] - track[i]![1]); lens.push(L); total += L }
    let d: N = float(1e6), along: N = float(0), acc = 0
    for (let i = 0; i + 1 < track.length; i++) {
      const [ax, az] = track[i]!, [bx, bz] = track[i + 1]!
      const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez
      const u = clamp(p.x.sub(ax).mul(ex).add(p.z.sub(az).mul(ez)).div(L2), 0, 1)
      const di = vec2(p.x.sub(ax).sub(u.mul(ex)), p.z.sub(az).sub(u.mul(ez))).length()
      const closer = step(di, d)
      along = mix(along, u.mul(lens[i]!).add(acc), closer)
      d = min(d, di)
      acc += lens[i]!
    }
    const edge = d.add(mx_noise_float(vec3(p.x.mul(0.15), 4.1, p.z.mul(0.15))).mul(1.2))
    const k = smoothstep(5.5, 3.2, edge).mul(float(1).sub(smoothstep(total * 0.45, total, along)))
    g = mix(g, troddenEarth(p), k)
  }
  const wet = smoothstep(waterLevel + 2.6, waterLevel + 0.15, p.y)
  g = mix(g, vec3(...TONES.damp), wet)
  m.colorNode = mix(g, vec3(0.5, 0.48, 0.44), uView)
  // the banks fall from the plain to the bed across a single cell of the 20 m grid, so their faces tilt by the triangle
  // and light up in a zig-zag along the shore; near the water's level the shading normal leans back toward up
  const lean2 = smoothstep(waterLevel + 4.5, waterLevel + 0.5, p.y)
  // a gentle slope (the ground drawn up to a street, a mound) leans its shading toward up: under the low sun the flank of the
  // way down from the dam read as a dark streak beside it; the banks, steeper, keep their own
  const gentle = smoothstep(0.94, 0.985, normalWorld.y).mul(0.6)
  const n = normalize(mix(normalWorld, vec3(0, 1, 0), max(lean2.mul(0.85), gentle)))
  m.normalNode = normalize(cameraViewMatrix.mul(vec4(n, 0)).xyz)
  return m
}

/** the water: the silt-laden body, by Fresnel the mirrored scene (walls, the tower, the sky: a planar reflection at the
    water's level, its image bent by the ripples) or the sky alone, wind streaks, ripples moving with the clock, the sun's glints */
/** the river seen from near, an eye on a bridge's deck (additive: without it the opening's far river is unchanged): the
    body's colour, the current (scene metres a second) that carries the ripples, a finer ripple for the near water, the
    piers that heap the water at their bows and leave a rougher wake behind, the glint's strength, the page's fog */
export interface WaterLook {
  body?: [number, number, number]
  flow?: [number, number]
  fine?: number
  /** each pier: its centre, half its length along the current and half its width across it, the wake's length */
  wakes?: Array<{ x: number; z: number; r: number; h: number; len: number }>
  glint?: number
  fog?: boolean
  /** the long swells' share (1 the opening's): near water at a low eye reads calmer */
  swell?: number
  /** what the reflected ray meets before the sky (banks, walls), given the water's point, the ray and the sky it sees */
  reflect?: (p: N, r: N, sky: N) => N
}

/** the night's water (ours): the long swells' share and the breeze's ripples, k per metre of the noise, the slope's
    amplitude, how much longer a crest is than wide, its bearing from the scene's z (the river's course here) */
const NIGHT = {
  swells: 1.0,
  spread: 0.008,
  /** the spread each unit of slope the footprint took off adds */
  lostSpread: 0.12,
  /** the band's glints: cells a metre or so apart (k per metre across the current, stretched along it), a glint's
      size in the cell, its mean share once under a few pixels, its gain, the current's drift (m/s), the fade */
  glints: { k: 0.8, stretch: 3, angle: 0.15, size: 0.3, share: 0.2, gain: 1.15, drift: 0.6, fade: [0.25, 0.8] as [number, number] },
  /** the breeze's share while the sun is still up (the bridge's sunset): the same ripples, a little calmer */
  day: 1.0,
  /** a ripple fades between these footprints times its wavelength over 2 pi: kept until its crests are a few pixels apart */
  fade: [0.3, 1.0] as [number, number],
  /** the body's light at night: a blue-white of luminance 1 and its strength (as the stone's, crescent-plan dusk.light) */
  bodyTint: [0.9, 1.0, 1.1] as [number, number, number],
  bodyGain: 2.0,
  ripples: [
    { k: 0.8, speed: 0.7, amp: 0.07, stretch: 3.5, angle: 0.15 },
    { k: 2.4, speed: 1.4, amp: 0.08, stretch: 2.8, angle: -0.3 },
    { k: 6.5, speed: 2.4, amp: 0.1, stretch: 2.2, angle: 0.4 },
    { k: 13, speed: 3.4, amp: 0.16, stretch: 1.8, angle: -0.2 },
  ],
}
/** the ripples' footprint floor: a device pixel's angle at the stills' sizes (radians; the phone's, the coarser of the
    two framings), so every still at those sizes keeps its water */
export const PIX_RAD = 0.00057
/** the pixel drawn, the camera's vertical field over the drawing height (the field's mean angle a pixel), never finer
    than the floor: a coarser rendition (the 1x film) fades the ripples where they would fall under a pixel */
export const waterPixel = (vfovDeg: number, heightPx: number): number =>
  Math.max(PIX_RAD, (vfovDeg * Math.PI) / 180 / Math.max(1, heightPx))
export const uWaterPix = uniform(PIX_RAD)
/** each frame, from the camera (map.ts aim) */
export function setWaterPixel(vfovDeg: number, heightPx: number): void {
  uWaterPix.value = waterPixel(vfovDeg, heightPx)
}

export function waterMaterial(A: AirUniforms, sky: (d: N) => N, uTime: N, mirror?: N, look: WaterLook = {}): Material {
  const m = new MeshBasicNodeMaterial({ side: DoubleSide })
  const p = positionWorld
  const t = uTime
  const flow = look.flow
  const slope = (k: number, s: number, amp: number, drift0: [number, number]): N => {
    // carried by the current where one is given: the pattern moves at the water's speed
    const drift: [number, number] = flow ? [-flow[0] * k * 0.8, -flow[1] * k * 0.8] : drift0
    const q = vec3(p.x.mul(k).add(t.mul(drift[0])), t.mul(s), p.z.mul(k).add(t.mul(drift[1])))
    const e = 0.35
    const h0 = mx_noise_float(q)
    const hx = mx_noise_float(q.add(vec3(e, 0, 0)))
    const hz = mx_noise_float(q.add(vec3(0, 0, e)))
    return vec2(hx.sub(h0), hz.sub(h0)).mul(amp / e)
  }
  const streak = smoothstep(-0.3, 0.5, mx_noise_float(vec3(p.x.mul(0.004), 1.7, p.z.mul(0.0011)).add(vec3(t.mul(0.002), 0, t.mul(0.004)))))
  const calm = mix(0.35, 1, streak)
  const sw = look.swell ?? 1
  const s1 = slope(0.018, 0.05, 0.06 * sw, [0.004, 0.012])
  const s2 = slope(0.09, 0.22, 0.12 * sw, [0.02, 0.05])
  const s3 = slope(0.45, 0.6, 0.11 * sw, [0.06, 0.12])
  /* once the water's sun is turned far under the horizon (only the river at the walk's last stop: every other water has
     its sun up) the evening breeze's ripples: crests long across the wind, finer toward the eye, each faded where the
     pixel's footprint on the water outgrows it, so the far river keeps the long swells and does not shimmer */
  const night = float(1).sub(smoothstep(-0.7, -0.3, A.uSun.y))
  const dist = p.distance(cameraPosition)
  const grazing = max(abs(p.y.sub(cameraPosition.y)).div(max(dist, 1e-3)), 0.03)
  const foot = dist.mul(uWaterPix).div(grazing)
  const breeze = mix(float(NIGHT.day), float(1), night)
  // the slope the footprint took off the breeze's ripples: it widens the mirrored image's spread (below)
  let lost: N = float(0)
  const ripple = (k: number, s: number, amp: number, stretch: number, ang: number): N => {
    const ca = Math.cos(ang), sa = Math.sin(ang), e = 0.35
    const u = p.x.mul(ca).add(p.z.mul(sa)), v = p.z.mul(ca).sub(p.x.mul(sa))
    const q = vec3(u.mul(k), t.mul(s), v.mul(k / stretch))
    const h0 = mx_noise_float(q), hu = mx_noise_float(q.add(vec3(e, 0, 0))), hv = mx_noise_float(q.add(vec3(0, 0, e)))
    const su = hu.sub(h0).mul(amp / e), sv = hv.sub(h0).mul(amp / e / stretch)
    const seen = float(1).sub(smoothstep(NIGHT.fade[0] / k, NIGHT.fade[1] / k, foot))
    lost = lost.add(float(1).sub(seen).mul(amp))
    const keep = seen.mul(breeze)
    return vec2(su.mul(ca).sub(sv.mul(sa)), su.mul(sa).add(sv.mul(ca))).mul(keep)
  }
  // built only for a river seen from near (a bridge's look), the one water that is ever seen after sunset
  let sl: N = s1.add(s2.add(s3).mul(calm))
  if (look.wakes) {
    sl = s1.add(s2.add(s3).mul(calm).mul(mix(float(1), float(NIGHT.swells), night)))
    for (const r of NIGHT.ripples) sl = sl.add(ripple(r.k, r.speed, r.amp, r.stretch, r.angle))
  }
  if (look.fine) sl = sl.add(slope(2.1, 1.3, look.fine, [0.2, 0.4]).mul(calm))
  if (look.wakes && flow) {
    // behind each pier the water runs rough for a while; at its bow it heaps a little
    const fl = Math.hypot(flow[0], flow[1]) || 1, fx = flow[0] / fl, fz = flow[1] / fl
    let rough: N = float(0)
    for (const w of look.wakes) {
      const dx = p.x.sub(w.x), dz = p.z.sub(w.z)
      const down = dx.mul(fx).add(dz.mul(fz)), side = abs(dx.mul(fz).sub(dz.mul(fx)))
      const wake = smoothstep(w.r * 0.85, w.r * 1.05, down).mul(float(1).sub(smoothstep(w.r, w.r + w.len, down))).mul(float(1).sub(smoothstep(w.h * 0.6, down.sub(w.r).mul(0.05).add(w.h * 1.2), side)))
      const bow = float(1).sub(smoothstep(0, 3, down.negate().sub(w.r))).mul(step(down, -w.r * 0.9)).mul(float(1).sub(smoothstep(0.5, w.h * 0.7, side)))
      rough = max(rough, max(wake, bow.mul(0.7)))
    }
    sl = sl.mul(float(1).add(rough.mul(1.6))).add(slope(1.2, 0.9, 0.09, [0.1, 0.2]).mul(rough))
  }
  const n = normalize(vec3(sl.x.negate(), 1, sl.y.negate()))
  const view = normalize(p.sub(cameraPosition))
  const r = reflect(view, n)
  const rUp = vec3(r.x, max(r.y, 0.02), r.z)
  const cosV = max(dot(n, view.negate()), 0)
  const fres = float(0.035).add(float(0.965).mul(pow(float(1).sub(cosV), 5)))
  const lit = max(A.uSun.y, 0).mul(1.6).add(0.55).mul(A.uDay)
  let body: N = (look.body ? vec3(...look.body) : vec3(0.085, 0.095, 0.085)).mul(lit)
  if (look.wakes) {
    // at night the silt body takes the twilight's light as the stone does: paler and cooler, so the print's toe leaves
    // it a dark blue-grey, not a brown
    const by = body.dot(vec3(0.2126, 0.7152, 0.0722))
    body = mix(body, vec3(...NIGHT.bodyTint).mul(by).mul(NIGHT.bodyGain), night)
  }
  let refl: N = sky(normalize(rUp)).mul(vec3(0.92, 0.96, 1.0))
  if (look.reflect && look.wakes) {
    // at night the banks' mirrored edge is spread over the ripples finer than a pixel (the more, the more of them the
    // footprint took off): the reflected ray taken a little lower and higher as well and the three averaged, so the
    // band of sky over the far bank shows as a soft rim, never as a drawn line round each dark patch
    const sp = night.mul(lost.mul(NIGHT.lostSpread).add(NIGHT.spread))
    const lo = normalize(rUp.sub(vec3(0, sp, 0))), hi = normalize(rUp.add(vec3(0, sp, 0)))
    const r0 = look.reflect(p, normalize(rUp), refl)
    const skyC = refl
    const soft = r0.mul(0.5).add(look.reflect(p, lo, skyC).add(look.reflect(p, hi, skyC)).mul(0.25))
    // and the facets that catch the band whole: short glints along the current, where the sharp image shows; under a
    // few pixels they fade to their mean share
    const G = NIGHT.glints, ga = Math.cos(G.angle), gb = Math.sin(G.angle)
    const gq = vec2(p.x.mul(ga).add(p.z.mul(gb)).mul(G.k), p.z.mul(ga).sub(p.x.mul(gb)).mul(G.k / G.stretch).add(t.mul(G.drift)))
    const cell = mx_worley_noise_vec2(gq).x
    const gSeen = float(1).sub(smoothstep(G.fade[0] / G.k, G.fade[1] / G.k, foot))
    const glint = mix(float(G.share), float(1).sub(smoothstep(G.size * 0.6, G.size, cell)), gSeen)
    refl = mix(r0, mix(soft, r0.mul(G.gain), glint), night)
  } else if (look.reflect) refl = look.reflect(p, normalize(rUp), refl)
  if (mirror) {
    // the mirrored scene, its lookup bent by the ripples' slope; distance thins the bend so far walls stay whole
    const bend = sl.mul(0.012).div(max(p.distance(cameraPosition).mul(0.0015), 1))
    mirror.uvNode = mirror.uvNode.add(bend)
    refl = mirror.rgb.mul(vec3(0.92, 0.96, 1.0))
  }
  const glint = pow(max(dot(r, A.uSun), 0), 600).mul(look.glint ?? 60).mul(A.uDay)
  const sheen = pow(max(dot(r, A.uSun), 0), 24).mul(0.25).mul(A.uDay)
  // far off the mirrored horizon sky outshone the haze over the land round it: past about 5 km the reflection gives way
  const far = smoothstep(4500, 10000, p.distance(cameraPosition)).mul(0.5)
  const c = mix(body, refl.mul(float(1).sub(far)), fres).add(vec3(1, 0.82, 0.6).mul(glint.add(sheen)))
  m.colorNode = mix(c, vec3(0.3, 0.33, 0.36), uView.mul(0.6))
  m.fog = look.fog ?? false
  void uniform
  void min
  return m
}
