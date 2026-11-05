/* STOP 7 ON THE MAP PAGE (the new walk's stop 6): House VI, House III and the Merkes blocks round them (house-geom.ts)
   as one mesh in the house material (house-mat.ts), and their classes in the evidence view painted from the record
   like the court's (record.ts). */

import { Float32BufferAttribute, Mesh, Vector3, type BufferGeometry, type DirectionalLight, type Object3D } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Built, Cls } from '../map/plan'
import type { ClassTones } from '../map/mass'
import { TONE, type Namer } from '../record'
import type { Painted } from '../record-tones'
import { buildHouse, lanesBody, type Body, type House } from './house-geom'
import { houseMaterial, setHousePixel, uHouseSun, uHouseSunDir } from './house-mat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

const TONE_OF: Record<Cls, number> = { M: 0, R: 1, G: 2 }

/* the court's bounce and its own shade follow the page's own sun, read before each draw */
let sun: DirectionalLight | null = null
function readSun(scene: Object3D): void {
  if (!sun) scene.traverse((o) => { if ((o as DirectionalLight).isDirectionalLight && !sun) sun = o as DirectionalLight })
  if (sun) (uHouseSun.value as Vector3).set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.intensity)
  // toward the sun: the court's own walls shade it in the material (house-mat.ts)
  if (sun) (uHouseSunDir.value as Vector3).copy(sun.position).sub(sun.target.position).normalize()
}

export interface HouseMount {
  house: House
  bodies: Body[]
  /** the plan without the prisms the house stop draws */
  built: Built
  mesh: Mesh
  tone: (name: Namer) => Painted
  setPixel: (vfovDeg: number, heightPx: number) => void
}

export function mountHouse(built: Built, mapPlan: J, housePlan: J, tones: ClassTones): HouseMount {
  const house = buildHouse(built, mapPlan, housePlan)
  const bodies = [...house.bodies, lanesBody(house.lanes, housePlan.flat.level)]
  const parts: BufferGeometry[] = bodies.map((b, i) => {
    const g = b.geometry
    const n = g.getAttribute('position').count
    const cls = new Float32Array(n * 2)
    for (let k = 0; k < n; k++) {
      cls[k * 2] = TONE_OF[b.letters[1]]
      cls[k * 2 + 1] = TONE_OF[b.letters[0]]
    }
    g.setAttribute('cls', new Float32BufferAttribute(cls, 2))
    g.setAttribute('band', new Float32BufferAttribute(new Float32Array(n).fill(b.band), 1))
    g.setAttribute('cid', new Float32BufferAttribute(new Float32Array(n).fill(i), 1))
    g.setAttribute('fl', new Float32BufferAttribute(new Float32Array(n).fill(b.floor), 1))
    g.setAttribute('six', new Float32BufferAttribute(new Float32Array(n).fill(b.six ? 1 : 0), 1))
    return g
  })
  const geometry = mergeGeometries(parts)
  const mesh = new Mesh(geometry, houseMaterial({ a: house.frame.a, c: house.frame.c, hp: housePlan }, tones))
  mesh.name = 'house'
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.onBeforeRender = (_r, scene) => readSun(scene)
  const tone = (name: Namer): Painted => {
    const each = bodies.map((b) => name(`map:${b.id}`, b.letters))
    const a = geometry.getAttribute('cls') as Float32BufferAttribute, cid = geometry.getAttribute('cid')
    const arr = a.array as Float32Array
    for (let k = 0; k < a.count; k++) {
      const c = each[cid.getX(k)]!
      arr[k * 2] = TONE[c.above]
      arr[k * 2 + 1] = TONE[c.foot]
    }
    a.needsUpdate = true
    return { bodies: bodies.length, byLetters: bodies.filter((_, i) => each[i]!.missing.length).map((b) => b.id) }
  }
  return { house, bodies, built: house.built, mesh, tone, setPixel: setHousePixel }
}
