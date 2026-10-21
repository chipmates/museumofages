/* THE MAP'S BODIES: the pure plan (`plan.ts`) as three meshes. One grey for
   every block, a lighter grey for the street, the ground, the water; and the
   class view, where each body paints its plan's class in a band at its foot
   and its height's class above it, read from per-vertex or per-instance
   attributes so one material serves every body. */

import {
  BoxGeometry, BufferGeometry, Color, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Group, InstancedBufferAttribute,
  InstancedMesh, Matrix4, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, Path, Quaternion, Shape, ShapeGeometry, Vector3,
  type Material,
} from 'three/webgpu'
import * as TSL from 'three/tsl'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Built, Cls, P2 } from './plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { attribute, float, mix, mx_noise_float, normalWorld, positionWorld, step, uniform, vec3, abs, max, smoothstep, dot } = TSL as unknown as Record<string, N>

const CLS: Record<Cls, number> = { M: 0, R: 1, G: 2 }

export interface ClassTones { M: [number, number, number]; R: [number, number, number]; G: [number, number, number] }

export function tonesFrom(plan: { classes: Record<string, { colour: string; value: number }> }): ClassTones {
  const lin = (hex: string, k: number): [number, number, number] => {
    const c = new Color(hex)
    return [c.r * k, c.g * k, c.b * k]
  }
  return { M: lin(plan.classes['M']!.colour, plan.classes['M']!.value), R: lin(plan.classes['R']!.colour, plan.classes['R']!.value), G: lin(plan.classes['G']!.colour, plan.classes['G']!.value) }
}

/** the view switch: 0 grey, 1 classes; one uniform every material reads */
export const uView = uniform(0)

export function classColour(t: ClassTones, cls: N, band: N): N {
  const pick = (i: N): N => mix(mix(vec3(...t.M), vec3(...t.R), step(0.5, i)), vec3(...t.G), step(1.5, i))
  // under the band the plan's class, above it the height's
  return mix(pick(cls.x), pick(cls.y), step(positionWorld.y, band))
}

/** grey that still tells faces apart: a little lighter on top, a slow mottle so a big face is never one flat value */
function greyNode(base: number): N {
  const up = max(normalWorld.y, 0)
  const mottle = mx_noise_float(positionWorld.mul(0.07)).mul(0.05).add(1)
  return vec3(base).mul(float(1).add(up.mul(0.08))).mul(mottle)
}

/** a gate's passage: origin and unit directions along and across its axis (scene x, z), length and half width */
export interface Passage { o: P2; a: P2; c: P2; len: number; half: number }

/* a passage's side walls and soffit take their own lighter grey: in the facade's grey a door read as a dark
   wedge over a slit of light, the opening never as an opening (a tone of the grey view, not of the plan) */
function passageGrey(base: N, p: Passage): N {
  const dx = positionWorld.x.sub(p.o[0]), dz = positionWorld.z.sub(p.o[1])
  const along = dx.mul(p.a[0]).add(dz.mul(p.a[1])), across = dx.mul(p.c[0]).add(dz.mul(p.c[1]))
  const inside = step(-0.3, along).mul(step(along, p.len)).mul(step(abs(across), p.half))
  const side = smoothstep(0.6, 0.8, abs(normalWorld.x.mul(p.c[0]).add(normalWorld.z.mul(p.c[1]))))
  const soffit = smoothstep(0.6, 0.8, normalWorld.y.negate())
  // seen down the axis the side walls are edge-on, so the soffit carries the opening: near white, lit only by bounce
  return mix(base, mix(mix(base, vec3(0.6), side), vec3(0.95), soffit), inside)
}

export function bodyMaterial(t: ClassTones, grey: number, passage?: Passage): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 })
  const g = passage ? passageGrey(greyNode(grey), passage) : greyNode(grey)
  m.colorNode = mix(g, classColour(t, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  return m
}

/** extruded prisms of one plan, merged into one geometry with their class attributes */
function prismGeometry(built: Built): BufferGeometry {
  const parts: BufferGeometry[] = []
  built.prisms.forEach((p, pi) => {
    // shape in (x, -z) so that extruding along +z and turning up lands on (x, y, z)
    const sh = new Shape()
    sh.moveTo(p.poly[0]![0], -p.poly[0]![1])
    for (const [x, z] of p.poly.slice(1)) sh.lineTo(x, -z)
    sh.closePath()
    for (const h of p.holes) {
      const path = new Path()
      path.moveTo(h[0]![0], -h[0]![1])
      for (const [x, z] of h.slice(1)) path.lineTo(x, -z)
      path.closePath()
      sh.holes.push(path)
    }
    const g = new ExtrudeGeometry(sh, { depth: p.y1 - p.y0, bevelEnabled: false, steps: 1 })
    g.rotateX(-Math.PI / 2)
    g.translate(0, p.y0, 0)
    g.deleteAttribute('uv')
    const n = g.getAttribute('position').count
    const cls = new Float32Array(n * 2), band = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      cls[i * 2] = CLS[p.height]
      cls[i * 2 + 1] = CLS[p.plan]
      band[i] = p.band
    }
    g.setAttribute('cls', new Float32BufferAttribute(cls, 2))
    g.setAttribute('band', new Float32BufferAttribute(band, 1))
    // which prism a vertex belongs to, so a page can tone each body on its own (-1 on the ramps)
    g.setAttribute('pid', new Float32BufferAttribute(new Float32Array(n).fill(pi), 1))
    parts.push(g)
  })
  for (const r of built.ramps) {
    const g = rampGeometry(r.a, r.b, r.y0, r.y1, r.w, r.floor, CLS[r.plan], CLS[r.height], r.band)
    g.setAttribute('pid', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(-1), 1))
    parts.push(g)
  }
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))
  for (const g of parts) g.dispose()
  return merged
}

/** a sloped solid: a top face from a (low) to b (high), sides down to the floor */
function rampGeometry(a: P2, b: P2, y0: number, y1: number, w: number, floor: number, plan: number, height: number, band: number): BufferGeometry {
  const d = new Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize()
  const n = new Vector3(-d.z, 0, d.x).multiplyScalar(w / 2)
  const A0 = new Vector3(a[0], y0, a[1]).add(n), A1 = new Vector3(a[0], y0, a[1]).sub(n)
  const B0 = new Vector3(b[0], y1, b[1]).add(n), B1 = new Vector3(b[0], y1, b[1]).sub(n)
  const fa0 = A0.clone().setY(floor), fa1 = A1.clone().setY(floor), fb0 = B0.clone().setY(floor), fb1 = B1.clone().setY(floor)
  const tris: Vector3[] = []
  const quad = (p: Vector3, q: Vector3, r: Vector3, s: Vector3): void => {
    tris.push(p, q, r, p, r, s)
  }
  quad(A1, A0, B0, B1)
  quad(A0, fa0, fb0, B0)
  quad(B1, fb1, fa1, A1)
  quad(B0, fb0, fb1, B1)
  quad(A1, fa1, fa0, A0)
  quad(fa0, fa1, fb1, fb0)
  const pos = new Float32Array(tris.length * 3)
  tris.forEach((v, i) => pos.set([v.x, v.y, v.z], i * 3))
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  // a quad's winding is set by eye above; flip the whole if the top faces down
  const ny = g.getAttribute('normal').getY(0)
  if (ny < 0) {
    const p = g.getAttribute('position')
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1)
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2))
      p.setXYZ(i + 2, x, y, z)
    }
    g.computeVertexNormals()
  }
  const k = tris.length
  const cls = new Float32Array(k * 2), bd = new Float32Array(k)
  for (let i = 0; i < k; i++) {
    cls[i * 2] = height
    cls[i * 2 + 1] = plan
    bd[i] = band
  }
  g.setAttribute('cls', new Float32BufferAttribute(cls, 2))
  g.setAttribute('band', new Float32BufferAttribute(bd, 1))
  return g
}

function boxMesh(list: Built['boxes'], mat: Material, name: string): InstancedMesh {
  const geo = new BoxGeometry(1, 1, 1)
  geo.deleteAttribute('uv')
  const im = new InstancedMesh(geo, mat, list.length)
  const cls = new Float32Array(list.length * 2), band = new Float32Array(list.length)
  const m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0)
  list.forEach((b, i) => {
    q.setFromAxisAngle(up, b.yaw)
    m.compose(new Vector3(b.x, (b.y0 + b.y1) / 2, b.z), q, new Vector3(b.sx, b.y1 - b.y0, b.sz))
    im.setMatrixAt(i, m)
    cls[i * 2] = CLS[b.height]
    cls[i * 2 + 1] = CLS[b.plan]
    band[i] = b.band
  })
  geo.setAttribute('cls', new InstancedBufferAttribute(cls, 2))
  geo.setAttribute('band', new InstancedBufferAttribute(band, 1))
  im.instanceMatrix.needsUpdate = true
  im.castShadow = true
  im.receiveShadow = true
  im.frustumCulled = false
  im.name = name
  return im
}

/** grid lines: fine inside the walk's box, coarser over the city, coarse to the horizon */
function lines(lo: number, hi: number, fine: [number, number, number], mid: [number, number, number], far: number, extra: number[] = []): number[] {
  const out = new Set<number>()
  for (let v = fine[0]; v <= fine[1]; v += fine[2]) out.add(Math.round(v * 100) / 100)
  for (let v = mid[0]; v <= mid[1]; v += mid[2]) if (v < fine[0] || v > fine[1]) out.add(v)
  for (let v = lo; v <= hi; v += far) if (v < mid[0] || v > mid[1]) out.add(v)
  for (const e of extra) out.add(e)
  return [...out].sort((a, b) => a - b)
}

export function groundGeometry(built: Built, canalZ: number[]): BufferGeometry {
  const xs = lines(-30000, 30000, [-560, 640, 6], [-1700, 3300, 20], 250).filter((v) => Math.abs(v) <= 9000 || v % 3000 === 0)
  const zs = lines(-30000, 30000, [-980, 860, 6], [-3500, 2100, 20], 250, canalZ).filter((v) => Math.abs(v) <= 9000 || v % 3000 === 0)
  const nx = xs.length, nz = zs.length
  const pos = new Float32Array(nx * nz * 3)
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = xs[i]!, z = zs[j]!
    pos.set([x, built.ground(x, z), z], (j * nx + i) * 3)
  }
  const idx: number[] = []
  for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1
    idx.push(a, c, b, b, c, d)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function streetGeometry(built: Built): BufferGeometry {
  const P = built.street
  const tris: number[] = [], cls: number[] = []
  const left: Vector3[] = [], right: Vector3[] = []
  for (let i = 0; i < P.length; i++) {
    const p = P[i]!
    const prev = P[Math.max(0, i - 1)]!, next = P[Math.min(P.length - 1, i + 1)]!
    const d = new Vector3(next.x - prev.x, 0, next.z - prev.z).normalize()
    const n = new Vector3(-d.z, 0, d.x).multiplyScalar(p.w / 2)
    left.push(new Vector3(p.x, p.level, p.z).add(n))
    right.push(new Vector3(p.x, p.level, p.z).sub(n))
  }
  const c = (i: number): number => CLS[P[i]!.cls]
  const push = (v: Vector3[], k: number): void => {
    for (const p of v) {
      tris.push(p.x, p.y, p.z)
      cls.push(k, k)
    }
  }
  for (let i = 0; i + 1 < P.length; i++) {
    if (P[i]!.deck) continue
    const k = c(i + 1)
    // subdivide so the deck follows a long slope smoothly
    const L = Math.hypot(P[i + 1]!.x - P[i]!.x, P[i + 1]!.z - P[i]!.z)
    const steps = Math.max(1, Math.ceil(L / 6))
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps
      const l0 = left[i]!.clone().lerp(left[i + 1]!, t0), l1 = left[i]!.clone().lerp(left[i + 1]!, t1)
      const r0 = right[i]!.clone().lerp(right[i + 1]!, t0), r1 = right[i]!.clone().lerp(right[i + 1]!, t1)
      push([l0, r0, r1, l0, r1, l1], k)
      // skirts down past the ground on both edges
      for (const [a, b] of [[r0, r1], [l1, l0]] as Array<[Vector3, Vector3]>) {
        const ga = Math.min(built.ground(a.x, a.z), a.y) - 1.5, gb = Math.min(built.ground(b.x, b.z), b.y) - 1.5
        const a2 = a.clone().setY(ga), b2 = b.clone().setY(gb)
        push([a, a2, b2, a, b2, b], k)
      }
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(tris, 3))
  g.computeVertexNormals()
  // the street's top faces up: flip any triangle that came out facing down
  const p = g.getAttribute('position'), nrm = g.getAttribute('normal')
  for (let i = 0; i < p.count; i += 3) {
    const e1 = new Vector3(p.getX(i + 1) - p.getX(i), p.getY(i + 1) - p.getY(i), p.getZ(i + 1) - p.getZ(i))
    const e2 = new Vector3(p.getX(i + 2) - p.getX(i), p.getY(i + 2) - p.getY(i), p.getZ(i + 2) - p.getZ(i))
    const fn = e1.cross(e2)
    if (Math.abs(fn.y) > 1e-6 && fn.y < 0) {
      const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1)
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2))
      p.setXYZ(i + 2, x, y, z)
    }
  }
  g.computeVertexNormals()
  void nrm
  const bandArr = new Float32Array(p.count).fill(1e6)
  g.setAttribute('cls', new Float32BufferAttribute(cls, 2))
  g.setAttribute('band', new Float32BufferAttribute(bandArr, 1))
  return g
}

export interface Sky { colour: (dir: N) => N }

export function waterMaterial(sky: Sky, sunDir: N): Material {
  const m = new MeshBasicNodeMaterial({ side: DoubleSide })
  const view = positionWorld.sub(TSL.cameraPosition).normalize()
  // a slow swell bends the mirror so the sky breaks into bands, as open water does
  const sw = mx_noise_float(positionWorld.mul(vec3(0.05, 0, 0.012))).mul(0.06)
  const n = vec3(sw, 1, mx_noise_float(positionWorld.mul(vec3(0.011, 0, 0.06)).add(7)).mul(0.06)).normalize()
  const refl = TSL.reflect(view, n)
  const cosV = abs(view.y)
  const fres = float(0.03).add(float(0.97).mul(TSL.pow(float(1).sub(cosV), 4)))
  const body = vec3(0.03, 0.075, 0.095)
  // the reflection is cooled and capped below the haze, so water keeps its own tone at a grazing view
  // instead of taking the far ground's grey; a broad sheen under the glint carries the low sun along it
  const glint = TSL.pow(max(dot(refl, sunDir), 0), 90).mul(3.5)
  const sheen = TSL.pow(max(dot(refl, sunDir), 0), 10).mul(0.35)
  m.colorNode = mix(body, sky.colour(refl).mul(vec3(0.62, 0.8, 0.95)), fres.mul(0.72)).add(vec3(1, 0.8, 0.58).mul(glint.add(sheen)))
  m.fog = true
  return m
}

export interface Bodies {
  group: Group
  counts: { prisms: number; boxes: number; houses: number; triangles: number }
}

export function buildBodies(built: Built, tones: ClassTones, sky: Sky, sunDir: N, canalZ: number[], passage?: Passage): Bodies {
  const group = new Group()
  group.name = 'babylon-map'
  const blockMat = bodyMaterial(tones, 0.42, passage)
  const prismGeo = prismGeometry(built)
  const prisms = new Mesh(prismGeo, blockMat)
  prisms.castShadow = true
  prisms.receiveShadow = true
  prisms.name = 'blocks'
  prisms.frustumCulled = false
  group.add(prisms)
  const houses = built.boxes.filter((b) => b.group === 'house')
  const rest = built.boxes.filter((b) => b.group !== 'house')
  if (houses.length) group.add(boxMesh(houses, bodyMaterial(tones, 0.47), 'houses'))
  if (rest.length) group.add(boxMesh(rest, blockMat, 'towers-and-piers'))

  const streetMat = new MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 })
  streetMat.colorNode = mix(greyNode(0.6), classColour(tones, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  const street = new Mesh(streetGeometry(built), streetMat)
  street.receiveShadow = true
  street.castShadow = true
  street.name = 'street'
  group.add(street)

  const groundMat = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 })
  const g0 = vec3(0.5, 0.48, 0.44)
  groundMat.colorNode = g0.mul(mx_noise_float(positionWorld.mul(0.02)).mul(0.06).add(1)).mul(smoothstep(-4, 1, positionWorld.y).mul(0.4).add(0.6))
  const ground = new Mesh(groundGeometry(built, canalZ), groundMat)
  ground.receiveShadow = true
  ground.castShadow = true
  ground.name = 'ground'
  group.add(ground)

  const wm = waterMaterial(sky, sunDir)
  for (const w of built.water) {
    const sh = new Shape()
    sh.moveTo(w.poly[0]![0], -w.poly[0]![1])
    for (const [x, z] of w.poly.slice(1)) sh.lineTo(x, -z)
    sh.closePath()
    const g = new ShapeGeometry(sh)
    g.rotateX(-Math.PI / 2)
    g.translate(0, w.level, 0)
    const mesh = new Mesh(g, wm)
    mesh.name = `water-${w.id}`
    mesh.receiveShadow = false
    group.add(mesh)
  }

  let triangles = 0
  group.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh) return
    const g = m.geometry
    const t = (g.index ? g.index.count : g.getAttribute('position').count) / 3
    triangles += (o as InstancedMesh).isInstancedMesh ? t * (o as InstancedMesh).count : t
  })
  return { group, counts: { prisms: built.prisms.length, boxes: built.boxes.length, houses: built.houses, triangles: Math.round(triangles) } }
}
