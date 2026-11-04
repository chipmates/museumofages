/* A BLOCK WITH ROUNDED ARRISES AND CUT FACES: a brick or a slab as six gridded faces on one rounded box, each face
   its own mesh so a step can name it, each grid finest where its face carries words. A face's points are laid on
   the rounded box (the inner box plus the arris's radius along the way out), then pushed in by the face's own
   depths: the cut of its signs, the wear of its use, the grain of its stuff. The faces meet on the arrises' straight
   middle lines, so grids of different steps join with no gap. */
import { BufferAttribute, BufferGeometry, Group, Mesh, Vector3, type Material } from 'three/webgpu'

export type Axis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'

/** a face's depth function: mm into the block at a face point (u, v mm from the face's top-left, as it is read) */
export type Depth = (u: number, v: number) => number

export interface FaceSpec {
  axis: Axis
  /** the face's reading frame: which block axis runs along u (to the right) and along v (down), signed */
  u: Axis
  v: Axis
  /** the grid's step outside and inside the fine rect (mm, in u and v from the face's top-left) */
  step: number
  fine?: { u: [number, number]; v: [number, number]; step: number }
  depth?: Depth
  /** the part's name, for a step or a tap; the record's row it shows */
  name: string
}

const AXES: Record<Axis, Vector3> = {
  '+x': new Vector3(1, 0, 0), '-x': new Vector3(-1, 0, 0), '+y': new Vector3(0, 1, 0),
  '-y': new Vector3(0, -1, 0), '+z': new Vector3(0, 0, 1), '-z': new Vector3(0, 0, -1),
}
const extent = (a: Axis, half: Vector3): number => Math.abs(AXES[a].dot(half))

/** the samples along one side of a face: the arris's round at each end, the fine run, the rest at the plain step */
export function samples(length: number, step: number, round: number, fine?: [number, number], fineStep?: number): number[] {
  const at: number[] = [0, length]
  const edge = Math.max(round / 5, 0.25)
  for (let x = 0; x <= round * 1.6; x += edge) at.push(x, length - x)
  const inFine = (x: number): boolean => !!fine && x > fine[0] && x < fine[1]
  for (let x = 0; x < length; x += step) if (!inFine(x)) at.push(x)
  if (fine) for (let x = Math.max(0, fine[0]); x <= Math.min(length, fine[1]); x += fineStep!) at.push(x)
  const least = Math.min(edge, fine ? fineStep! : step) * 0.45
  const sorted = at.filter(v => v >= 0 && v <= length).sort((a, b) => a - b)
  const kept: number[] = []
  for (const v of sorted) if (!kept.length || v - kept[kept.length - 1]! > least) kept.push(v)
  if (kept[kept.length - 1]! < length) kept[kept.length - 1] = length
  return kept
}

export interface Block { group: Group; faces: Map<string, Mesh>; size: Vector3; specs: Map<string, FaceSpec> }

/** a face point (u, v mm from its top-left as it is read) on the block's plain box, in the block's own metres */
export function facePoint(face: FaceSpec, size: Vector3, u: number, v: number): Vector3 {
  const half = size.clone().multiplyScalar(0.5)
  const U = AXES[face.u], V = AXES[face.v], N = AXES[face.axis]
  const lu = extent(face.u, half) * 2, lv = extent(face.v, half) * 2
  return N.clone().multiplyScalar(extent(face.axis, half)).addScaledVector(U, u / 1000 - lu / 2).addScaledVector(V, v / 1000 - lv / 2)
}

/** the wear of the block's body (mm in, at a point on its rounded box, block metres): one field for all six faces, so
 *  two faces' points on their shared middle line move together and the joins stay closed */
export type Wear = (p: Vector3) => number

/** the block: size in metres (x, y, z), the arris's radius in metres, its six faces (a face not named is plain) */
export function buildBlock(size: [number, number, number], round: number, faces: FaceSpec[], material: Material | ((face: FaceSpec) => Material), wear?: Wear): Block {
  const half = new Vector3(size[0] / 2, size[1] / 2, size[2] / 2)
  const group = new Group()
  const meshes = new Map<string, Mesh>()
  const specs = new Map(faces.map(face => [face.name, face]))
  const inner = half.clone().subScalar(round)
  const p = new Vector3(), q = new Vector3(), out = new Vector3(), n = new Vector3()
  for (const face of faces) {
    const N = AXES[face.axis], U = AXES[face.u], V = AXES[face.v]
    const lu = extent(face.u, half) * 2 * 1000, lv = extent(face.v, half) * 2 * 1000
    const us = samples(lu, face.step, round * 1000, face.fine?.u, face.fine?.step)
    const vs = samples(lv, face.step, round * 1000, face.fine?.v, face.fine?.step)
    const nu = us.length, nv = vs.length
    const pos = new Float32Array(nu * nv * 3), nor = new Float32Array(nu * nv * 3), uvs = new Float32Array(nu * nv * 2)
    // the face's own top-left on the box: along -U and -V from the face's middle
    const middle = N.clone().multiplyScalar(extent(face.axis, half))
    const flat: boolean[] = new Array(nu * nv)
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const u = us[i]!, v = vs[j]!
      p.copy(middle).addScaledVector(U, u / 1000 - lu / 2000).addScaledVector(V, v / 1000 - lv / 2000)
      // onto the rounded box
      q.set(Math.max(-inner.x, Math.min(inner.x, p.x)), Math.max(-inner.y, Math.min(inner.y, p.y)), Math.max(-inner.z, Math.min(inner.z, p.z)))
      out.subVectors(p, q)
      const away = out.length()
      if (away > 1e-9) n.copy(out).divideScalar(away)
      else n.copy(N)
      p.copy(q).addScaledVector(n, round)
      // pushed in by the face's depths, along the way out (a cut stands well inside the flat of its face)
      const d = ((face.depth ? face.depth(u, v) : 0) + (wear ? wear(p) : 0)) / 1000
      p.addScaledVector(n, -d)
      const k = j * nu + i
      pos.set([p.x, p.y, p.z], k * 3)
      nor.set([n.x, n.y, n.z], k * 3)
      uvs.set([u / lu, v / lv], k * 2)
      // a point on the arris's round keeps the box's own normal: the face's neighbour shares it there
      flat[k] = n.distanceToSquared(N) < 1e-8
    }
    const index = new Uint32Array((nu - 1) * (nv - 1) * 6)
    let t = 0
    // wound so the face looks out along N whatever its reading frame
    const cross = new Vector3().crossVectors(U, V).dot(N) < 0
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1
      if (cross) index.set([a, c, b, b, c, d], t)
      else index.set([a, b, c, b, d, c], t)
      t += 6
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setIndex(new BufferAttribute(index, 1))
    g.computeVertexNormals()
    // the round keeps the box's analytic normal, so the six meshes shade as one body across their joins
    const computed = g.getAttribute('normal') as BufferAttribute
    for (let k = 0; k < nu * nv; k++) if (!flat[k]) computed.setXYZ(k, nor[k * 3]!, nor[k * 3 + 1]!, nor[k * 3 + 2]!)
    g.setAttribute('uv', new BufferAttribute(uvs, 2))
    g.computeBoundingBox()
    g.computeBoundingSphere()
    const mesh = new Mesh(g, typeof material === 'function' ? material(face) : material)
    mesh.name = face.name
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    meshes.set(face.name, mesh)
  }
  return { group, faces: meshes, size: half.multiplyScalar(2), specs }
}
