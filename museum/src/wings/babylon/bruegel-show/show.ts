/* Bruegel's Tower of Babel as a showpiece on the map page: the switch's fourth state, one mesh shown only while
   `?tower=bruegel-show`, on the real tower's centre. Outside the evidence classes, so the record never tones it. */

import { Mesh, type BufferGeometry } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildShow, type Show } from './show-geom'
import { showMaterial } from './show-mat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

export interface ShowMount {
  show: Show
  mesh: Mesh
  on: (v: boolean) => void
}

export function mountShow(frame: { x: number; z: number; c: number; s: number }, ground: (x: number, z: number) => number, sp: J): ShowMount {
  const show = buildShow(frame, ground, sp)
  const geometry = mergeGeometries(show.bodies.map((b) => b.geometry) as BufferGeometry[])
  const mesh = new Mesh(geometry, showMaterial(show.frame, sp))
  mesh.name = 'bruegel-show-tower'
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.visible = false
  return { show, mesh, on: (v) => { mesh.visible = v } }
}
