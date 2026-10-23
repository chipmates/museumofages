/** A GREY FIGURE OF 1.70 M for size, stood beside a machine for the eyes that
 * ask for one. A plain marker, not a person: no face, no clothes, one matte
 * grey. Modern bench furniture, outside every machine's dossier and bounds.
 */
import { CapsuleGeometry, Color, Group, Mesh, MeshStandardNodeMaterial, SphereGeometry, type BufferGeometry } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export const FIGURE_HEIGHT = 1.7

export function buildScaleFigure(): { group: Group; geometry: BufferGeometry; material: MeshStandardNodeMaterial } {
  const pieces: BufferGeometry[] = []
  const capsule = (r: number, length: number, x: number, y: number, z: number, tilt = 0): void => {
    const g = new CapsuleGeometry(r, length, 6, 14)
    g.rotateZ(tilt)
    g.translate(x, y, z)
    pieces.push(g)
  }
  // legs, torso, arms and head, proportioned to stand 1.70 m
  capsule(0.07, 0.72, -0.1, 0.43, 0)
  capsule(0.07, 0.72, 0.1, 0.43, 0)
  capsule(0.17, 0.36, 0, 1.12, 0)
  capsule(0.05, 0.56, -0.25, 1.06, 0, 0.06)
  capsule(0.05, 0.56, 0.25, 1.06, 0, -0.06)
  const head = new SphereGeometry(0.1, 18, 12)
  head.scale(0.92, 1.12, 0.98)
  head.translate(0, FIGURE_HEIGHT - 0.112, 0)
  pieces.push(head)
  const neck = new CapsuleGeometry(0.045, 0.08, 4, 10)
  neck.translate(0, 1.5, 0)
  pieces.push(neck)
  const geometry = mergeGeometries(pieces, false)!
  for (const piece of pieces) piece.dispose()
  const material = new MeshStandardNodeMaterial({ color: new Color('#8d8f90'), roughness: 0.92, metalness: 0 })
  material.name = 'bench:scale-figure'
  const mesh = new Mesh(geometry, material)
  mesh.name = 'vinci/bench/scale-figure'
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData['assetClass'] = 'GENERATED'
  const group = new Group()
  group.name = 'vinci/bench/scale-figure'
  group.add(mesh)
  return { group, geometry, material }
}
