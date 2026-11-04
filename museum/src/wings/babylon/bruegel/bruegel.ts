/* Bruegel's Tower of Babel on the map page: the switch's third state, one mesh shown only while `?tower=bruegel`.
   Outside the evidence classes, so the record never tones it. */

import { Mesh, type BufferGeometry } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildBruegel, type Bruegel } from './bruegel-geom'
import { bruegelMaterial } from './bruegel-mat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

export interface BruegelMount {
  bruegel: Bruegel
  mesh: Mesh
  show: (on: boolean) => void
}

export function mountBruegel(frame: { x: number; z: number; c: number; s: number }, ground: (x: number, z: number) => number, bp: J): BruegelMount {
  const bruegel = buildBruegel(frame, ground, bp)
  const geometry = mergeGeometries(bruegel.bodies.map((b) => b.geometry) as BufferGeometry[])
  const mesh = new Mesh(geometry, bruegelMaterial(bruegel.frame, bp))
  mesh.name = 'bruegel-tower'
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.visible = false
  return { bruegel, mesh, show: (on) => { mesh.visible = on } }
}
