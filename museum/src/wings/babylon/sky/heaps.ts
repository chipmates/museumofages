/* WHAT ONE SHEKEL BOUGHT, AS THINGS ON THE CLOSE VIEW'S STAGE: three heaps poured to the edition's litres at one slope
   (`sky-data.ts`: barley, dates, sesame), the dates as fruits over their heap, a cut lump of silver of one shekel's
   weight, and the walk's own scale figure (place/person.ts f2) beside them. No balance, no coin, no wool, no kasu heap.
   Built in code; the stage and its lamps are the vitrine's (`stage-close-view.ts`). */

import { Group, InstancedMesh, LatheGeometry, Matrix4, Mesh, MeshStandardNodeMaterial, Quaternion, SphereGeometry, Vector2, Vector3 } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { PERSON_FORMS, signPerson } from '../../place/person'
import { HEAPS_LOOK, HEAPS_PLAN, SILVER_MM, datesCore, heapProfile, heapRadius, litresOf, silverVolumeCm3, type Good } from './sky-data'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { float, mix, mx_fractal_noise_float, positionWorld, vec3 } = TSL as unknown as Record<string, N>

/** a small seeded random, so every build lays the same fruits */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

/** a surface of grains: the good's albedo broken by noise at the grain's size and a coarser drift */
function grainMaterial(look: { albedo: readonly [number, number, number]; grain: number; roughness: number }): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: look.roughness, metalness: 0 })
  const fine = mx_fractal_noise_float(positionWorld.mul(1 / look.grain), 2, 2.0, 0.5)
  const coarse = mx_fractal_noise_float(positionWorld.mul(1 / (look.grain * 12)), 2, 2.0, 0.5)
  const shade = float(1).add(fine.mul(0.32)).add(coarse.mul(0.12)).clamp(0.55, 1.35)
  m.colorNode = vec3(...look.albedo).mul(shade)
  m.roughnessNode = float(look.roughness).add(fine.mul(0.08))
  return m
}

/** the closed volume of a mesh's triangles, cubic metres (the divergence theorem; world space) */
export function meshVolume(mesh: Mesh): number {
  mesh.updateWorldMatrix(true, false)
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry
  const p = g.getAttribute('position')
  const a = new Vector3(), b = new Vector3(), c = new Vector3()
  let v = 0
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld)
    b.fromBufferAttribute(p, i + 1).applyMatrix4(mesh.matrixWorld)
    c.fromBufferAttribute(p, i + 2).applyMatrix4(mesh.matrixWorld)
    v += a.dot(b.clone().cross(c)) / 6
  }
  return Math.abs(v)
}

/** a heap as a turned profile, closed by its foot, lying on the floor at its place */
function heapMesh(R: number, mat: MeshStandardNodeMaterial, name: string): Mesh {
  const prof = heapProfile(R, undefined, 64)
  // from the foot up to the top, so the lathe's faces look out
  const pts = [new Vector2(0, 0), ...[...prof].reverse().map(([r, y]) => new Vector2(r, y))]
  const g = new LatheGeometry(pts, 128)
  g.computeVertexNormals()
  const m = new Mesh(g, mat)
  m.name = name
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** the dates as fruits over their heap: ellipsoids lying along the slope, each standing `proud` out of it */
function dateFruits(R: number, mat: MeshStandardNodeMaterial): InstancedMesh {
  const L = HEAPS_LOOK.dates, prof = heapProfile(R, undefined, 64)
  const rnd = seeded(5)
  const per = L.fruit.long * L.fruit.wide * 0.8
  let area = 0
  for (let i = 0; i + 1 < prof.length; i++) area += Math.PI * (prof[i]![0] + prof[i + 1]![0]) * Math.hypot(prof[i + 1]![0] - prof[i]![0], prof[i + 1]![1] - prof[i]![1])
  const count = Math.round(area / per)
  const geo = new SphereGeometry(1, 12, 8)
  const mesh = new InstancedMesh(geo, mat, count)
  const M = new Matrix4(), q = new Quaternion(), s = new Vector3(), pos = new Vector3(), n = new Vector3(), along = new Vector3(), up = new Vector3(0, 1, 0)
  const k = Math.tan(28 * Math.PI / 180)
  for (let i = 0; i < count; i++) {
    // an even spread over the slant area: the radius by its share of the area
    const r = R * Math.sqrt(rnd()) * 0.995, a = rnd() * Math.PI * 2
    const y = (() => { for (let j = 0; j + 1 < prof.length; j++) if (r >= prof[j]![0] && r <= prof[j + 1]![0]) { const f = (r - prof[j]![0]) / (prof[j + 1]![0] - prof[j]![0]); return prof[j]![1] + (prof[j + 1]![1] - prof[j]![1]) * f } return 0 })()
    n.set(Math.cos(a) * k, 1, Math.sin(a) * k).normalize()
    const half = L.fruit.wide / 2
    pos.set(Math.cos(a) * r, y, Math.sin(a) * r).addScaledVector(n, L.proud - half)
    // the fruit's long axis in the slope's plane at a random turn, its flat side on the heap
    along.set(-Math.sin(a), 0, Math.cos(a)).applyAxisAngle(n, rnd() * Math.PI)
    const x = along, z = new Vector3().crossVectors(x, n).normalize()
    M.makeBasis(x, n, z)
    q.setFromRotationMatrix(M)
    s.set(L.fruit.long / 2 * (0.85 + rnd() * 0.3), half * (0.8 + rnd() * 0.25), L.fruit.wide / 2 * (0.85 + rnd() * 0.3))
    M.compose(pos, q, s)
    mesh.setMatrixAt(i, M)
  }
  void up
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.name = 'sky/heaps/date-fruits'
  return mesh
}

/** one shekel of silver as a cast lump cut from a larger cake: a flattened rounded body, uneven, with one flat face
    where the chisel cut it, scaled to the shekel's volume exactly */
function silverLump(mat: MeshStandardNodeMaterial): Mesh {
  const rnd = seeded(11)
  const g = new SphereGeometry(1, 48, 32)
  const p = g.getAttribute('position')
  const bumps = Array.from({ length: 9 }, () => ({ d: new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), h: (rnd() - 0.4) * 0.3 }))
  const v = new Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    let r = 1
    for (const b of bumps) r += b.h * Math.max(0, v.dot(b.d)) ** 3
    v.multiplyScalar(r)
    // the cuts: a flat face across the lump's one end and a slanted one along a side, as a chisel leaves them
    if (v.x > 0.5) v.x = 0.5 + (v.x - 0.5) * 0.05
    const side = v.z * 0.94 + v.x * 0.34
    if (side > 0.62) { const d = side - 0.62; v.z -= d * 0.94 * 0.95; v.x -= d * 0.34 * 0.95 }
    v.set(v.x * SILVER_MM.l / 2000, v.y * SILVER_MM.h / 2000, v.z * SILVER_MM.w / 2000)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  const m = new Mesh(g, mat)
  const scale = Math.cbrt(silverVolumeCm3() / 1e6 / meshVolume(m))
  g.scale(scale, scale, scale)
  g.computeBoundingBox()
  g.translate(0, -g.boundingBox!.min.y, 0)
  m.name = 'sky/heaps/silver'
  m.castShadow = true
  m.receiveShadow = true
  return m
}

export interface HeapsBuild {
  group: Group
  figure: Group
  meshes: Record<Good | 'silver', Mesh>
  fruits: InstancedMesh
  /** each heap's foot radius as built, metres, and the dates' shell its fruits add, litres */
  built: Record<Good, { R: number }> & { shell: number }
}

export function buildHeaps(): HeapsBuild {
  const group = new Group()
  group.name = 'sky/heaps'
  const P = HEAPS_PLAN, L = HEAPS_LOOK
  const core = datesCore()
  const Rs = { barley: heapRadius(litresOf('barley')), dates: core.R, sesame: heapRadius(litresOf('sesame')) }
  const meshes = {} as Record<Good | 'silver', Mesh>
  for (const id of ['barley', 'dates', 'sesame'] as const) {
    const m = heapMesh(Rs[id], grainMaterial(L[id]), `sky/heaps/${id}`)
    m.position.set(P[id][0], 0, P[id][1])
    group.add(m)
    meshes[id] = m
  }
  const fruitMat = new MeshStandardNodeMaterial({ roughness: L.dates.roughness, metalness: 0 })
  const spot = mx_fractal_noise_float(positionWorld.mul(1 / 0.012), 2, 2.0, 0.5)
  fruitMat.colorNode = mix(vec3(...L.dates.albedo).mul(0.75), vec3(...L.dates.albedo).mul(1.35), spot.mul(0.5).add(0.5))
  const fruits = dateFruits(core.R, fruitMat)
  fruits.position.set(P.dates[0], 0, P.dates[1])
  group.add(fruits)
  const silverMat = new MeshStandardNodeMaterial({ roughness: L.silver.roughness, metalness: 1 })
  // a worn face: its colour and gloss broken a little at the scale of a few millimetres
  const wear = mx_fractal_noise_float(positionWorld.mul(1 / 0.0025), 2, 2.0, 0.5)
  silverMat.colorNode = vec3(...L.silver.albedo).mul(float(1).add(wear.mul(0.04)))
  silverMat.roughnessNode = float(L.silver.roughness).add(wear.mul(0.06)).clamp(0.3, 0.6)
  const lump = silverLump(silverMat)
  lump.position.set(P.silver[0], 0, P.silver[1])
  lump.rotation.y = 0.5
  group.add(lump)
  meshes.silver = lump
  // the walk's own figure for size, facing the eye
  const personMat = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 })
  personMat.colorNode = vec3(0.16)
  const figure = signPerson(PERSON_FORMS.f2, personMat)
  figure.position.set(P.figure[0], 0, P.figure[1])
  figure.rotation.y = -Math.PI / 2
  figure.name = 'sky/heaps/figure'
  return { group, figure, meshes, fruits, built: { barley: { R: Rs.barley }, dates: { R: core.R }, sesame: { R: Rs.sesame }, shell: core.shell } }
}
