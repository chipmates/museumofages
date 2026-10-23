/* THE MEASURE: the one scale figure of every wing's film and every page
   picture. One body at one height, one grey, one draw plus its shadow.

   The body is baked once from its field (build.ts, forge/measure-bake.mjs)
   to a file in the asset store; a wing loads that file, never the field:
   meshing the field costs seconds of one core, the file a fetch.

   The house's rules for a measure are this module's defaults: square to the
   camera, standing on the measured part's own line, whole in the frame, a
   pace in from its edge, casting its own shadow in the scene's light. */

import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardNodeMaterial, Vector3, type Camera, type Object3D } from 'three/webgpu'

/** crown above the soles, metres; one height everywhere */
export const MEASURE_HEIGHT = 1.7
/** the lit chest's print as CIE L* (lo, hi): set by the look step, unset until then */
export const MEASURE_BAND: Readonly<{ lo: number; hi: number }> | null = null
/** the dark contour where the ground is as light as the body: set by the look step, unset until then */
export const MEASURE_EDGE: Readonly<{ lstar: number; desktopPx: number; phonePx: number }> | null = null
/** the figure's smallest height on a 390 CSS px phone, and its inset from a phone frame's edge, CSS px */
export const MEASURE_MIN_PHONE_PX = 48
export const MEASURE_PHONE_INSET_PX = 60
/** the share of a search picture's height the figure takes at least */
export const MEASURE_SEARCH_SHARE = 0.18
/** the class the edge pass reads off a mask; the sign person carried the same */
export const MEASURE_CLASS = 64
/** the baked body in the asset store, at MEASURE_HEIGHT, soles on y 0, facing +z */
export const MEASURE_FILE = 'shared/measure/measure-170.glb'
/** a neutral grey with a hair of warmth (linear), matte */
export const MEASURE_ALBEDO: Readonly<[number, number, number]> = [0.42, 0.42, 0.41]
export const MEASURE_ROUGHNESS = 0.85

export type MeasureVariant = 'figure'

export interface MeasureArrays {
  pos: Float32Array
  nrm: Float32Array
  idx: Uint16Array | Uint32Array
}

/** the body's geometry from its arrays: positions, the field's normals, indices */
export function measureGeometry(a: MeasureArrays): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(a.pos, 3))
  g.setAttribute('normal', new BufferAttribute(a.nrm, 3))
  g.setIndex(new BufferAttribute(a.idx, 1))
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

/** the arrays of a baked file (one mesh: POSITION, NORMAL, indices), as forge/measure-bake.mjs writes it */
export function readMeasureFile(buf: ArrayBuffer): MeasureArrays {
  const view = new DataView(buf)
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('measure: not a glb')
  const jsonLength = view.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLength))) as {
    accessors: Array<{ bufferView: number; componentType: number; count: number; type: string }>
    bufferViews: Array<{ byteOffset?: number; byteLength: number }>
    meshes: Array<{ primitives: Array<{ attributes: Record<string, number>; indices: number }> }>
  }
  const bin = 20 + jsonLength + 8
  const prim = json.meshes[0]!.primitives[0]!
  const array = (accessor: number): Float32Array | Uint16Array | Uint32Array => {
    const a = json.accessors[accessor]!
    const v = json.bufferViews[a.bufferView]!
    const at = bin + (v.byteOffset ?? 0)
    const n = a.count * (a.type === 'VEC3' ? 3 : 1)
    if (a.componentType === 5126) return new Float32Array(buf.slice(at, at + n * 4))
    if (a.componentType === 5123) return new Uint16Array(buf.slice(at, at + n * 2))
    return new Uint32Array(buf.slice(at, at + n * 4))
  }
  return { pos: array(prim.attributes['POSITION']!) as Float32Array, nrm: array(prim.attributes['NORMAL']!) as Float32Array, idx: array(prim.indices) as Uint16Array | Uint32Array }
}

const loaded = new Map<string, Promise<BufferGeometry>>()
/** the baked body's geometry, fetched once per address and shared by every copy */
export function loadMeasureGeometry(url: string): Promise<BufferGeometry> {
  let p = loaded.get(url)
  if (!p) {
    p = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`measure: ${url} answered ${r.status}`)
      return measureGeometry(readMeasureFile(await r.arrayBuffer()))
    })
    loaded.set(url, p)
  }
  return p
}

/** the one material: matte grey, no texture; one per scene is enough, every copy may share it */
export function measureMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ color: new Color().setRGB(...MEASURE_ALBEDO), roughness: MEASURE_ROUGHNESS, metalness: 0 })
  m.name = 'measure'
  return m
}

export interface MeasureOptions {
  /** crown above the soles; the measure is MEASURE_HEIGHT and a caller should not change it */
  height?: number
  material?: MeshStandardNodeMaterial
  /** its own shadow in the scene's light (default on) */
  shadow?: boolean
}

/** one measure: a mesh standing with its soles at its origin and its front toward +z */
export function measure(geometry: BufferGeometry, opts: MeasureOptions = {}): Mesh {
  const mesh = new Mesh(geometry, opts.material ?? measureMaterial())
  mesh.name = 'measure'
  const s = (opts.height ?? MEASURE_HEIGHT) / MEASURE_HEIGHT
  mesh.scale.setScalar(s)
  mesh.castShadow = opts.shadow ?? true
  mesh.receiveShadow = opts.shadow ?? true
  mesh.userData['cls'] = MEASURE_CLASS
  mesh.userData['assetClass'] = 'GENERATED'
  return mesh
}

/** turn about the upright so the front looks at the camera across the floor: square to it */
export function faceCamera(figure: Object3D, camera: Camera): void {
  const eye = new Vector3().setFromMatrixPosition(camera.matrixWorld)
  const at = new Vector3().setFromMatrixPosition(figure.matrixWorld)
  figure.rotation.y = Math.atan2(eye.x - at.x, eye.z - at.z)
}

export interface Placement {
  /** the measured part's own line on the floor (x, z pairs, world metres) and how far along it, 0 to 1 */
  line: [[number, number], [number, number]]
  along: number
  /** the floor's height under the soles */
  floor: number
  /** square to this camera (the default), unless a yaw in degrees is given */
  camera?: Camera
  yaw?: number
}

/** stand the figure on its line, square to the camera unless a yaw is named */
export function place(figure: Object3D, p: Placement): void {
  const [[ax, az], [bx, bz]] = p.line
  figure.position.set(ax + (bx - ax) * p.along, p.floor, az + (bz - az) * p.along)
  figure.updateMatrixWorld(true)
  if (p.yaw !== undefined) figure.rotation.y = (p.yaw * Math.PI) / 180
  else if (p.camera) faceCamera(figure, p.camera)
  figure.updateMatrixWorld(true)
}

export interface FrameReading {
  /** the figure's box in CSS px of the frame */
  left: number
  top: number
  right: number
  bottom: number
  /** its height in CSS px, its least distance to a frame edge, and whether all of it is inside */
  tall: number
  inset: number
  whole: boolean
}

/** where the figure lands in a frame of `width` x `height` CSS px, read off its own vertices */
export function measureFrame(figure: Mesh, camera: Camera, width: number, height: number): FrameReading {
  figure.updateMatrixWorld(true)
  camera.updateMatrixWorld(true)
  const pos = figure.geometry.getAttribute('position')
  const v = new Vector3()
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(figure.matrixWorld).project(camera)
    const x = ((v.x + 1) / 2) * width
    const y = ((1 - v.y) / 2) * height
    left = Math.min(left, x)
    right = Math.max(right, x)
    top = Math.min(top, y)
    bottom = Math.max(bottom, y)
  }
  const inset = Math.min(left, top, width - right, height - bottom)
  return { left, top, right, bottom, tall: bottom - top, inset, whole: inset >= 0 }
}
