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
import { TONES, boxMaterial, groundMaterial, houseMaterial, toneOf, troddenEarth } from '../open/earth'
import { PAL } from '../gate/gate-colours'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { abs, attribute, cameraPosition, float, floor, fract, max, mix, mod, mx_noise_float, normalWorld, normalize, positionWorld, sin, smoothstep, step, texture, uniform, vec2, vec3 } = TSL as unknown as Record<string, N>

/** the map's bodies (mass.ts buildBodies) given the city's materials; `ground` a stop's paint over the ground (the
    precinct's), `band` the class band's height over the ground */
export function paintCity(group: Object3D, built: Built, tones: ClassTones, o: { band: number; ground?: (base: N) => N }): void {
  const houses = group.getObjectByName('houses') as InstancedMesh | undefined
  if (houses && houses.geometry.getAttribute('hinfo')) houses.material = houseMaterial(tones, o.band)
}
