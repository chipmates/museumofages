/* THE MAP'S CITY IN ITS MATERIAL: the map's bodies in the arrival's mud and baked brick (open/earth.ts) instead of
   grey, so the city round each stop is the one the opening flies over. Each body takes its tone by its plan id as
   the arrival's do, refined where the map shows bodies the arrival never draws: the lion walls, the bastions, the dam
   and the palace's north wall in baked brick, the gate's two massings glazed blue, the inner and outer walls in mud
   brick with their embankments baked (REC bab.innerwall.embankment, bab.outerwall.embankment); a floor a visitor
   stands on (the South Palace's courts) paved in baked brick. The houses are the arrival's own (open/houses.ts,
   rebuilt in mass.ts), the ground its beaten earth. The class view paints the record's classes over all of it as
   the grey map did; the ground stays grey there, as on the arrival. Every tone is ours (class G for colour). */

import { DataTexture, FloatType, InstancedBufferAttribute, MeshStandardNodeMaterial, NearestFilter, RGBAFormat, type InstancedMesh, type Material, type Mesh, type Object3D } from 'three/webgpu'
import * as TSL from 'three/tsl'
import type { Built } from './plan'
import { classColour, uView, type ClassTones } from './mass'
import { TONES, boxMaterial, cityBlockColour, groundMaterial, houseMaterial, toneOf, troddenEarth } from '../open/earth'
import { PAL } from '../gate/gate-colours'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { abs, attribute, cameraPosition, float, floor, fract, max, mix, mod, mx_noise_float, normalWorld, normalize, positionWorld, sin, smoothstep, step, texture, uniform, vec2, vec3 } = TSL as unknown as Record<string, N>

export type MapTone = 'mud' | 'baked' | 'temple' | 'glaze'

/** one device pixel's angle (radians), set by the page for each frame's size and lens */
export const uCityPix = uniform(0.0003)
export function setCityPixel(vfovDeg: number, heightPx: number): void {
  uCityPix.value = (2 * Math.tan(((vfovDeg / 2) * Math.PI) / 180)) / heightPx
}

/** a map body's tone by its plan id: the arrival's `toneOf`, refined for the bodies only the map draws */
export function mapTone(id: string): MapTone {
  // the Ishtar Gate's two massings: glazed brick on every face (the gate page draws the gate itself)
  if (/^gate-(front|main)/.test(id)) return 'glaze'
  return toneOf(id)
}

/** one row per prism (its `pid`): the tone in rgb; in alpha 1 where its brick bond shows, + 2 on a floor a visitor stands
    on, + 4 where it is glazed */
export function cityTones(prisms: Built['prisms']): DataTexture {
  const n = Math.max(1, prisms.length)
  const data = new Float32Array(n * 4)
  prisms.forEach((p, i) => {
    const k = mapTone(p.id)
    const t = k === 'glaze' ? (PAL.cobalt as [number, number, number]) : TONES[k]
    data.set([t[0], t[1], t[2], (k === 'baked' || k === 'glaze' ? 1 : 0) + (p.walk ? 2 : 0) + (k === 'glaze' ? 4 : 0)], i * 4)
  })
  const tex = new DataTexture(data, n, 1, RGBAFormat, FloatType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  return tex
}

const hash = (x: N): N => fract(sin(x.mul(12.9898)).mul(43758.5453))
/** the roofs for the map's nearer cameras (70 to 300 m where the arrival's are 400 m and more): the cells' seams only far
    off (nearer they read as cracks in a laid floor), more than half the room cells cut in two, fainter parapet lines and
    a wider spread of each room's value, so a palace's roof never reads as one tiled slab */
const SEAMS = { seamsFrom: [150, 400] as [number, number], rooms: { split: 0.6, line: 0.1, tone: 0.24 } }

/** a floor of square baked bricks laid flat (about 33 cm, the palace's courts), joints faded over the pixel's footprint */
function brickFloor(p: N, uPix: N): N {
  const w = uPix.mul(p.distance(cameraPosition)).div(max(abs(normalize(cameraPosition.sub(p)).y), 0.2))
  const fade = smoothstep(0.12, 0.03, w)
  const jx = smoothstep(0.86, 0.93, abs(fract(p.x.div(0.33)).sub(0.5)).mul(2)), jz = smoothstep(0.86, 0.93, abs(fract(p.z.div(0.33)).sub(0.5)).mul(2))
  const each = hash(floor(p.x.div(0.33)).mul(17.3).add(floor(p.z.div(0.33)).mul(31.1))).sub(0.5).mul(0.12).mul(fade)
  const broad = mx_noise_float(vec3(p.x.mul(0.06), 4.4, p.z.mul(0.06))).mul(0.08).add(mx_noise_float(p.mul(0.7)).mul(0.04))
  const joint = max(jx, jz).mul(0.22).mul(fade).add(float(0.07).mul(float(1).sub(fade)))
  return vec3(...TONES.baked).mul(0.92).mul(float(1).add(each).add(broad)).mul(float(1).sub(joint))
}

/** the map's prisms: walls and tops by their tone (cityBlockColour), a floor paved where a visitor stands on it */
export function cityBlockMaterial(t: ClassTones, tones: DataTexture, count: number, uPix: N): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.93, metalness: 0 })
  const pid = attribute('pid', 'float')
  const tex = texture(tones, vec2(max(pid, 0).add(0.5).div(count), 0.5))
  const own = smoothstep(-0.5, -0.4, pid)
  const flags = mix(float(1), tex.a, own)
  const baked = mod(flags, 2)
  const walk = step(1.5, mod(flags, 4))
  const glaze = step(3.5, flags)
  const base = mix(vec3(...TONES.baked), tex.rgb, own)
  let c: N = cityBlockColour(base, baked, uPix, SEAMS)
  const up = smoothstep(0.55, 0.85, normalWorld.y)
  // a floor a visitor stands on, and the gate's walkways, paved in baked brick
  c = mix(c, brickFloor(positionWorld, uPix), max(walk, glaze).mul(up))
  // a glazed face keeps its blue in shade (CRIT C4): the ground's lighter end, so the massing never reads navy
  c = mix(c, c.mul(1.6), glaze.mul(float(1).sub(up)))
  m.colorNode = mix(c, classColour(t, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  m.roughnessNode = mix(float(0.93), float(0.55), glaze.mul(float(1).sub(up)))
  return m
}

/** the map's bodies (mass.ts buildBodies) given the city's materials; `ground` a stop's paint over the ground (the
    precinct's), `band` the class band's height over the ground */
export function paintCity(group: Object3D, built: Built, tones: ClassTones, o: { band: number; ground?: (base: N) => N }): void {
  const blocks = group.getObjectByName('blocks') as Mesh | undefined
  if (blocks) blocks.material = cityBlockMaterial(tones, cityTones(built.prisms), Math.max(1, built.prisms.length), uCityPix)
  const houses = group.getObjectByName('houses') as InstancedMesh | undefined
  if (houses && houses.geometry.getAttribute('hinfo')) houses.material = houseMaterial(tones, o.band)
}

/** the court's body of the South Palace's rooms (the court draws it, to cut its court and room into it) in the city's
    look, outside the court's own fronts: `cid` 0 is that body, `court` the court's rectangle (scene x, z) */
export function cityOnCourtRooms(mesh: Mesh, court: { x0: number; x1: number; z0: number; z1: number }, uPix: N): void {
  const m = mesh.material as MeshStandardNodeMaterial
  const P = positionWorld
  const n = normalize(attribute('normal', 'vec3'))
  const inX = step(court.x0 - 0.02, P.x).mul(step(P.x, court.x1 + 0.02)), inZ = step(court.z0 - 0.02, P.z).mul(step(P.z, court.z1 + 0.02))
  const courtFront = step(abs(n.y), 0.5).mul(inX).mul(inZ)
  const rooms = step(attribute('cid', 'float'), 0.5).mul(float(1).sub(courtFront))
  m.colorNode = mix(m.colorNode, cityBlockColour(vec3(...TONES.baked), float(1), uPix, SEAMS), rooms.mul(float(1).sub(uView)))
}
