/* STOP 5 ON THE MAP PAGE: the vaulted building, the North Palace and the guessed garden (gardens-geom.ts,
   gardens-plants.ts) as three meshes in their materials (gardens-mat.ts), their classes in the evidence view painted
   from the record like the map's (record.ts): each body by its name, its plan row in the band at its foot, its body
   row above. The garden switch: planted, bare terraces, or the dug plans only (no edge terraces). */

import { DirectionalLight, Float32BufferAttribute, Mesh, Vector3, type BufferGeometry, type Object3D } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Built, Cls } from '../map/plan'
import type { ClassTones } from '../map/mass'
import { TONE, type Namer } from '../record'
import type { Painted } from '../record-tones'
import { buildGardens, type Gardens } from './gardens-geom'
import { buildPlanting, type PalmBuilder, type Plant } from './gardens-plants'
import { bodiesMaterial, plantsMaterial, setGardensPixel, uGarden, uGardensSun } from './gardens-mat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

const TONE_OF: Record<Cls, number> = { M: 0, R: 1, G: 2 }
export type GardenState = 'planted' | 'bare' | 'dug'

let sun: DirectionalLight | null = null
const tmp = new Vector3()
function readSun(scene: Object3D): void {
  if (!sun) scene.traverse((o) => { if ((o as DirectionalLight).isDirectionalLight && !sun) sun = o as DirectionalLight })
  if (!sun) return
  ;(uGardensSun.dir.value as Vector3).copy(tmp.copy(sun.position).sub(sun.target.position).normalize())
  ;(uGardensSun.irr.value as Vector3).set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.intensity)
}

/** one mesh of named parts: `cls` (height, plan tones), `band`, `cid` (the part's index) and any per-part float */
function merged(parts: Array<{ geometry: BufferGeometry; band: number; letters: [Cls, Cls]; look?: number }>): BufferGeometry {
  const gs = parts.map((b, i) => {
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
    if (b.look !== undefined) g.setAttribute('look', new Float32BufferAttribute(new Float32Array(n).fill(b.look), 1))
    return g
  })
  return mergeGeometries(gs)!
}

export interface GardensMount {
  gardens: Gardens
  plants: Plant[]
  /** the map's plan without the prisms this stop draws, and with the vaulted building's hole in the palace's rooms */
  built: Built
  meshes: Mesh[]
  tone: (name: Namer) => Painted
  setPixel: (vfovDeg: number, heightPx: number) => void
  setGarden: (state: GardenState) => void
  facts: Record<string, unknown>
}

export function mountGardens(built: Built, mapPlan: J, gp: J, tones: ClassTones, palm: PalmBuilder, palmDetail: { seg: number; sides: number; fronds: number; steps: number }): GardensMount {
  const gardens = buildGardens(built, mapPlan, gp)
  const planting = buildPlanting(gardens.F, gp, palm, palmDetail)
  const plants = planting.plants
  const fixed = gardens.bodies.filter((b) => !b.garden), edge = gardens.bodies.filter((b) => b.garden)
  const bodyMat = bodiesMaterial(tones, gardens.F.cells)
  const mk = (g: BufferGeometry, name: string, mat = bodyMat): Mesh => {
    const m = new Mesh(g, mat)
    m.name = name
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    return m
  }
  const meshA = mk(merged(fixed), 'gardens')
  const meshB = mk(merged(edge), 'gardens-edge')
  // the plants: one part per kind for the class view (every plant of a kind shows the same row)
  const kinds = [...new Set(plants.map((p) => p.kind))]
  const plantParts = plants.map((p) => ({ geometry: p.geometry, band: -1e6, letters: ['G', 'G'] as [Cls, Cls] }))
  const meshC = mk(merged(plantParts), 'gardens-plants', plantsMaterial(tones))
  meshC.onBeforeRender = (_r, scene) => readSun(scene)
  const kindOf = plants.map((p) => kinds.indexOf(p.kind))

  const paint = (geometry: BufferGeometry, classes: Array<{ above: string; foot: string }>, index: (cid: number) => number): void => {
    const a = geometry.getAttribute('cls') as Float32BufferAttribute, cid = geometry.getAttribute('cid')
    const arr = a.array as Float32Array
    for (let k = 0; k < a.count; k++) {
      const c = classes[index(cid.getX(k))]!
      arr[k * 2] = TONE[c.above as keyof typeof TONE]
      arr[k * 2 + 1] = TONE[c.foot as keyof typeof TONE]
    }
    a.needsUpdate = true
  }
  const tone = (name: Namer): Painted => {
    const fx = fixed.map((b) => name(`map:${b.id}`, b.letters)), ed = edge.map((b) => name(`map:${b.id}`, b.letters))
    const kc = kinds.map((k) => name(`map:${plants.find((p) => p.kind === k)!.id}`, ['G', 'G']))
    paint(meshA.geometry, fx, (i) => i)
    paint(meshB.geometry, ed, (i) => i)
    paint(meshC.geometry, kc, (i) => kindOf[i]!)
    const missing = [...fixed.filter((_, i) => fx[i]!.missing.length).map((b) => b.id), ...edge.filter((_, i) => ed[i]!.missing.length).map((b) => b.id), ...kinds.filter((_, i) => kc[i]!.missing.length).map((k) => `garden-${k}`)]
    return { bodies: fixed.length + edge.length + plants.length, byLetters: missing }
  }
  const setGarden = (state: GardenState): void => {
    meshC.visible = state === 'planted'
    meshB.visible = state !== 'dug'
    uGarden.value = state === 'planted' ? 1 : 0
  }
  return {
    gardens, plants, built: gardens.built, meshes: [meshA, meshB, meshC], tone, setPixel: setGardensPixel, setGarden,
    facts: { ...gardens.facts, planting: planting.facts },
  }
}
