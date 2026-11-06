/* THE MAP'S BODIES: the pure plan (`plan.ts`) as three meshes. One grey for
   every block, a lighter grey for the street, the ground, the water; and the
   class view, where each body paints its plan's class in a band at its foot
   and its height's class above it, read from per-vertex or per-instance
   attributes so one material serves every body. */

import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Group, InstancedBufferAttribute,
  InstancedMesh, Matrix4, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, Path, Quaternion, Shape, ShapeGeometry, ShapeUtils, Vector2, Vector3,
  type Material,
} from 'three/webgpu'
import * as TSL from 'three/tsl'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Built, Cls, P2 } from './plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { attribute, cameraPosition, cameraProjectionMatrix, clamp, float, floor, mix, mx_noise_float, normalize, normalWorld, positionWorld, screenSize, step, uniform, vec3, abs, max, min, smoothstep, dot } = TSL as unknown as Record<string, N>

/* the gate's hatch (gate-mat.ts hatchOf, its lines here hatchLines), copied: the forge's node tools load this file and
   cannot load gate-mat's; record.test.mjs holds the two copies equal */
const lineInt = (x: N, P: number, h: number): N => {
  const m = x.sub(floor(x.div(P)).mul(P))
  return floor(x.div(P)).mul(2 * h).add(min(m, h)).add(max(m.sub(P - h), 0))
}
const hatchLines = (x: N, P: number, h: number, w: N): N => {
  const ww = max(w, 1e-4)
  return clamp(lineInt(x.add(ww.mul(0.5)), P, h).sub(lineInt(x.sub(ww.mul(0.5)), P, h)).div(ww), 0, 1)
}
const hatchOf = (s: N, fw: N, n?: N): N => {
  const h = hatchLines(s, 0.6, 0.09, fw.mul(1.4)).mul(float(1).sub(smoothstep(0.08, 0.2, fw))).mul(0.28)
  return n ? h.mul(smoothstep(0.3, 0.9, abs(dot(n, normalize(cameraPosition.sub(positionWorld)))))) : h
}

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
  const i = mix(cls.x, cls.y, step(positionWorld.y, band))
  // the guessed tone hatched as the gate's, the footprint from the camera's pixel angle (no screen derivatives)
  // capped: a pass without a screen size would give an infinite footprint, and a NaN survives the switch's mix at 0
  const fw = min(positionWorld.distance(cameraPosition).mul(2).div(cameraProjectionMatrix.element(1).y.mul(screenSize.y)), 1)
  const s = positionWorld.x.add(positionWorld.y).add(positionWorld.z)
  return pick(i).mul(float(1).sub(hatchOf(s, fw, normalWorld).mul(step(1.5, i))))
}

/** grey that still tells faces apart: a little lighter on top, a slow mottle so a big face is never one flat value */
export function greyNode(base: number): N {
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
    if (p.top) {
      parts.push(loftGeometry(p, pi))
      return
    }
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

/** a prism whose top outline is smaller than its foot (a battered pier): sides, foot and top, every face outward */
function loftGeometry(p: Built['prisms'][number], pi: number): BufferGeometry {
  let foot = p.poly, top = p.top!
  let area = 0
  for (let i = 0; i < foot.length; i++) {
    const a = foot[i]!, b = foot[(i + 1) % foot.length]!
    area += a[0] * b[1] - b[0] * a[1]
  }
  if (area < 0) {
    foot = [...foot].reverse()
    top = [...top].reverse()
  }
  const pos: number[] = []
  const tri = (a: number[], b: number[], c: number[]): void => { pos.push(...a, ...b, ...c) }
  const n = foot.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const p0 = [foot[i]![0], p.y0, foot[i]![1]], q0 = [foot[j]![0], p.y0, foot[j]![1]]
    const p1 = [top[i]![0], p.y1, top[i]![1]], q1 = [top[j]![0], p.y1, top[j]![1]]
    tri(p0, p1, q0)
    tri(q0, p1, q1)
  }
  for (const [ring, y, up] of [[top, p.y1, 1], [foot, p.y0, -1]] as Array<[P2[], number, number]>) {
    for (const [i, j, k] of ShapeUtils.triangulateShape(ring.map(([x, z]) => new Vector2(x, z)), [])) {
      const A = [ring[i!]![0], y, ring[i!]![1]], B = [ring[j!]![0], y, ring[j!]![1]], C = [ring[k!]![0], y, ring[k!]![1]]
      // the y part of (B - A) x (C - A) says which way the face looks
      const ny = (B[2]! - A[2]!) * (C[0]! - A[0]!) - (B[0]! - A[0]!) * (C[2]! - A[2]!)
      if (ny * up > 0) tri(A, B, C)
      else tri(A, C, B)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  const m = pos.length / 3
  const cls = new Float32Array(m * 2), band = new Float32Array(m)
  for (let i = 0; i < m; i++) {
    cls[i * 2] = CLS[p.height]
    cls[i * 2 + 1] = CLS[p.plan]
    band[i] = p.band
  }
  g.setAttribute('cls', new Float32BufferAttribute(cls, 2))
  g.setAttribute('band', new Float32BufferAttribute(band, 1))
  g.setAttribute('pid', new Float32BufferAttribute(new Float32Array(m).fill(pi), 1))
  return g
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

/** the ground mesh's grid lines (x, z): 6 m round the stops, 20 m over the city, 250 m beyond */
function groundLines(canalZ: number[]): { xs: number[]; zs: number[] } {
  return {
    xs: lines(-30000, 30000, [-560, 640, 6], [-1700, 3300, 20], 250).filter((v) => Math.abs(v) <= 9000 || v % 3000 === 0),
    zs: lines(-30000, 30000, [-980, 860, 6], [-3500, 2100, 20], 250, canalZ).filter((v) => Math.abs(v) <= 9000 || v % 3000 === 0),
  }
}

export function groundGeometry(built: Built, canalZ: number[]): BufferGeometry {
  const { xs, zs } = groundLines(canalZ)
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

/** one rebuilt house box, as the arrival's houses.ts gives it (that module is passed in: node resolves no import here) */
export interface HouseBoxLike { house: number; part: number; butt: number; block: number; x: number; z: number; sx: number; sz: number; yaw: number; y0: number; y1: number; gy: number }
/** a house's roof drawn as a tray (open/houses.ts HouseTray): parapets on the `rims` sides, each side's face drawn above
    its `hide` level, a door on side `door`; part 5 a room standing on tray `on` */
export interface HouseTrayLike extends HouseBoxLike { rims: number; hide: [number, number, number, number]; door: number; doorAt: number; doorW: number; doorH: number; on: number }
export type HouseRebuild = (boxes: Built['boxes'], ground: (x: number, z: number) => number) => { boxes: HouseBoxLike[]; trays?: HouseTrayLike[] }
/** the parapet's width and height over the roof: open/houses.ts RIM (a test holds the two equal; the kit's node checks
    load this file without resolving a value import) */
export const TRAY_RIM = { w: 0.45, h: 0.5 }

/** a stop module's paint over a shared body's colour (the ground under a precinct); none leaves the map's own. `houses`
    rebuilds the generic house boxes as the arrival does (rooms of their own heights round a court of its own size), the
    class band `band` metres over each house's ground */
export interface Paint { ground?: (base: N) => N; houses?: { rebuild: HouseRebuild; band: number } }

/** the rebuilt houses in one instanced mesh, packed as the arrival packs them: `hinfo` (house, range + 8 x the butted
    sides, the ground's level, the block), `size`, the class letters (the type, G over G) and the band over the ground */
/** the arrival's houses set on the map's ground mesh for its nearer eyes: each box's foot below the mesh under it (a
    centimetre deeper for each box of a house, so the rooms' overlapping feet never share a plane), each court floor
    above it, and where two rooms of one house overlap at one roof height (the side ranges reach 2 cm
    into the end ranges) the later one cut back to butt, so no two roofs share a plane */
function settleHouses(list: HouseBoxLike[], ground: (x: number, z: number) => number, grid: { xs: number[]; zs: number[] }): HouseBoxLike[] {
  // the mesh between its grid nodes is their interpolation: its lowest and highest over a box lie among the nodes round it
  const span = (a: number[], v0: number, v1: number): number[] => {
    let i0 = 0, i1 = a.length - 1
    while (i0 + 1 < a.length && a[i0 + 1]! <= v0) i0++
    while (i1 - 1 >= 0 && a[i1 - 1]! >= v1) i1--
    return a.slice(i0, i1 + 1)
  }
  const local = (b: HouseBoxLike): { u: number; v: number; ca: [number, number]; cb: [number, number] } => {
    const ca: [number, number] = [Math.cos(b.yaw), -Math.sin(b.yaw)], cb: [number, number] = [Math.sin(b.yaw), Math.cos(b.yaw)]
    return { u: b.x * ca[0] + b.z * ca[1], v: b.x * cb[0] + b.z * cb[1], ca, cb }
  }
  // one foot level per house (its lowest), each box a centimetre under the one before
  const foot = new Map<number, number>()
  for (const b of list) {
    const { ca, cb } = local(b)
    let lo = Infinity, hi = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const x = b.x + ca[0] * su * b.sx / 2 + cb[0] * sv * b.sz / 2, z = b.z + ca[1] * su * b.sx / 2 + cb[1] * sv * b.sz / 2
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z)
    }
    for (const x of span(grid.xs, x0, x1)) for (const z of span(grid.zs, z0, z1)) {
      const g = ground(x, z)
      lo = Math.min(lo, g)
      hi = Math.max(hi, g)
    }
    foot.set(b.house, Math.min(foot.get(b.house) ?? Infinity, b.y0, lo - 0.1))
    if (b.part === 4) b.y1 = Math.max(b.y1, hi + 0.03)
  }
  const nth = new Map<number, number>()
  for (const b of list) {
    const k = nth.get(b.house) ?? 0
    nth.set(b.house, k + 1)
    b.y0 = foot.get(b.house)! - 0.01 * k
  }
  const byHouse = new Map<number, HouseBoxLike[]>()
  for (const b of list) (byHouse.get(b.house) ?? byHouse.set(b.house, []).get(b.house)!).push(b)
  for (const rooms of byHouse.values()) {
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
      const A = rooms[i]!, B = rooms[j]!
      if (Math.abs(A.y1 - B.y1) > 0.003 || A.yaw !== B.yaw) continue
      const a = local(A), b = local(B)
      const ou = Math.min(a.u + A.sx / 2, b.u + B.sx / 2) - Math.max(a.u - A.sx / 2, b.u - B.sx / 2)
      const ov = Math.min(a.v + A.sz / 2, b.v + B.sz / 2) - Math.max(a.v - A.sz / 2, b.v - B.sz / 2)
      if (ou <= 0 || ov <= 0) continue
      let u0 = b.u - B.sx / 2, u1 = b.u + B.sx / 2, v0 = b.v - B.sz / 2, v1 = b.v + B.sz / 2
      if (ou < ov) { if (b.u > a.u) u0 = a.u + A.sx / 2; else u1 = a.u - A.sx / 2 }
      else { if (b.v > a.v) v0 = a.v + A.sz / 2; else v1 = a.v - A.sz / 2 }
      const du = (u0 + u1) / 2 - b.u, dv = (v0 + v1) / 2 - b.v
      B.x += b.ca[0] * du + b.cb[0] * dv
      B.z += b.ca[1] * du + b.cb[1] * dv
      B.sx = u1 - u0
      B.sz = v1 - v0
    }
  }
  // two houses of neighbouring lots whose roofs or buried feet meet within the bed: the later's roof a few millimetres up,
  // its foot down
  const cell = 24, near = new Map<string, HouseBoxLike[]>()
  for (const b of list) {
    const r = Math.hypot(b.sx, b.sz) / 2
    for (let i = Math.floor((b.x - r) / cell); i <= Math.floor((b.x + r) / cell); i++) for (let j = Math.floor((b.z - r) / cell); j <= Math.floor((b.z + r) / cell); j++) {
      const k = `${i},${j}`
      for (const o of near.get(k) ?? []) {
        if (o.house === b.house || Math.hypot(o.x - b.x, o.z - b.z) >= (Math.hypot(o.sx, o.sz) + Math.hypot(b.sx, b.sz)) / 2) continue
        if (Math.abs(o.y1 - b.y1) <= 0.004) b.y1 = o.y1 + 0.008
        if (Math.abs(o.y0 - b.y0) <= 0.004) b.y0 = o.y0 - 0.008
      }
      ;(near.get(k) ?? near.set(k, []).get(k)!).push(b)
    }
  }
  return list
}

/** the trays settled as the boxes are (settleHouses), the rooms on the roofs then stood on their host's settled deck; and
    where two neighbouring houses' roofs or parapet tops meet within the bed, the later house's roof a few millimetres up */
function settleTrays(list: HouseTrayLike[], ground: (x: number, z: number) => number, grid: { xs: number[]; zs: number[] }): HouseTrayLike[] {
  const rooms = list.filter((t) => t.part === 5).map((t) => ({ t, host: list[t.on]!, over: t.y1 - list[t.on]!.y1 }))
  settleHouses(list.filter((t) => t.part !== 5), ground, grid)
  const levels = (t: HouseTrayLike): number[] => (t.part === 4 ? [t.y1] : t.rims ? [t.y1, t.y1 + TRAY_RIM.h] : [t.y1])
  const cell = 24, near = new Map<string, HouseTrayLike[]>()
  for (const b of list) {
    if (b.part === 5) continue
    const r = Math.hypot(b.sx, b.sz) / 2
    for (let i = Math.floor((b.x - r) / cell); i <= Math.floor((b.x + r) / cell); i++) for (let j = Math.floor((b.z - r) / cell); j <= Math.floor((b.z + r) / cell); j++) {
      const k = `${i},${j}`
      for (const o of near.get(k) ?? []) {
        if (o.house === b.house || Math.hypot(o.x - b.x, o.z - b.z) >= (Math.hypot(o.sx, o.sz) + Math.hypot(b.sx, b.sz)) / 2) continue
        for (const lo of levels(o)) for (const lb of levels(b)) if (Math.abs(lo - lb) <= 0.004) b.y1 += 0.008 + lo - lb
      }
      ;(near.get(k) ?? near.set(k, []).get(k)!).push(b)
    }
  }
  for (const { t, host, over } of rooms) { t.y0 = host.y1 - 0.05; t.y1 = host.y1 + over }
  return list
}

/** the trays as one mesh of their faces (each a quad, outward): every side from its `hide` level (the foot under the
    ground) to the roof or the parapet's top, the parapets' tops and inner faces, the roof's floor inside them; the
    court only its floor. Per vertex: `hinfo` (house, kind + 16 x part, the ground's level, the block), `hdoor` (the
    distance along a door's face from its centre, the door's top level; 1000 where no door), the class letters and band.
    kind: 0 a range's outer face, 1 a parapet's top, 2 a parapet's inner face, 3 a roof, 4 the court, 5 a roof room's wall,
    6 a range's face on its court */
function trayHouses(list: HouseTrayLike[], band: number, mat: Material): Mesh {
  const W = TRAY_RIM.w, RH = TRAY_RIM.h
  // at most 21 quads a tray (4 sides, 8 parapet ends, 4 parapet tops, 4 inner faces, the roof); typed arrays cut to size
  const cap = list.length * 21 * 4
  const pos = new Float32Array(cap * 3), nor = new Float32Array(cap * 3), info = new Float32Array(cap * 4), door = new Float32Array(cap * 2)
  const idx = new Uint32Array((cap / 4) * 6)
  let nv = 0, ni = 0
  const P = new Float64Array(12)
  for (const t of list) {
    const c0 = Math.cos(t.yaw), c1 = -Math.sin(t.yaw), d0 = -c1, d1 = c0
    const hx = t.sx / 2, hz = t.sz / 2, top = t.y1
    // rims only where the roof between them keeps 30 cm
    let r = t.rims
    if (t.sx - ((r & 1 ? W : 0) + (r & 2 ? W : 0)) < 0.3) r &= ~3
    if (t.sz - ((r & 4 ? W : 0) + (r & 8 ? W : 0)) < 0.3) r &= ~12
    const has = (s: number): boolean => (r & (1 << s)) !== 0
    const kind0 = 16 * t.part
    const dTop = (t.part === 5 ? t.y0 + 0.05 : t.gy) + t.doorH
    // a quad from local corners (u, y, v) x 4, wound so its normal points along n (0 -u, 1 +u, 2 -v, 3 +v, 4 up); `da` the
    // door's distance along this face at u (or v), NaN where the face has no door
    const quad = (q: number[], n: number, kind: number, doorAlongU: number): void => {
      const nx = n === 4 ? 0 : n < 2 ? c0 * (n === 0 ? -1 : 1) : d0 * (n === 2 ? -1 : 1)
      const ny = n === 4 ? 1 : 0
      const nz = n === 4 ? 0 : n < 2 ? c1 * (n === 0 ? -1 : 1) : d1 * (n === 2 ? -1 : 1)
      for (let i = 0; i < 4; i++) {
        const u = q[i * 3]!, y = q[i * 3 + 1]!, v = q[i * 3 + 2]!
        P[i * 3] = t.x + c0 * u + d0 * v; P[i * 3 + 1] = y; P[i * 3 + 2] = t.z + c1 * u + d1 * v
      }
      const e1x = P[3]! - P[0]!, e1y = P[4]! - P[1]!, e1z = P[5]! - P[2]!, e2x = P[6]! - P[0]!, e2y = P[7]! - P[1]!, e2z = P[8]! - P[2]!
      const flip = (e1y * e2z - e1z * e2y) * nx + (e1z * e2x - e1x * e2z) * ny + (e1x * e2y - e1y * e2x) * nz < 0
      for (let i = 0; i < 4; i++) {
        const k = nv + i
        pos[k * 3] = P[i * 3]!; pos[k * 3 + 1] = P[i * 3 + 1]!; pos[k * 3 + 2] = P[i * 3 + 2]!
        nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz
        info[k * 4] = t.house; info[k * 4 + 1] = (t.part === 5 && kind === 0 ? 5 : kind) + kind0; info[k * 4 + 2] = t.gy; info[k * 4 + 3] = t.block
        door[k * 2] = Number.isNaN(doorAlongU) ? 1000 : (doorAlongU === 0 ? q[i * 3]! + hx : q[i * 3 + 2]! + hz) - t.doorAt
        door[k * 2 + 1] = dTop
      }
      if (flip) { idx[ni++] = nv; idx[ni++] = nv + 2; idx[ni++] = nv + 1; idx[ni++] = nv; idx[ni++] = nv + 3; idx[ni++] = nv + 2 }
      else { idx[ni++] = nv; idx[ni++] = nv + 1; idx[ni++] = nv + 2; idx[ni++] = nv; idx[ni++] = nv + 2; idx[ni++] = nv + 3 }
      nv += 4
    }
    const u0 = -hx + (has(0) ? W : 0), u1 = hx - (has(1) ? W : 0), v0 = -hz + (has(2) ? W : 0), v1 = hz - (has(3) ? W : 0)
    // the sides: s 0 and 1 at u = -hx, +hx along v; 2 and 3 at v = -hz, +hz along u
    for (let s = 0; s < 4; s++) {
      if (t.hide[s] === Infinity) continue
      const lo = Math.max(t.y0, t.hide[s]!), hi = has(s) ? top + RH : top
      const alongU = s >= 2, c = s === 0 ? -hx : s === 1 ? hx : s === 2 ? -hz : hz
      const face = (a0: number, a1: number, y0: number, y1: number): number[] => (alongU ? [a0, y0, c, a1, y0, c, a1, y1, c, a0, y1, c] : [c, y0, a0, c, y0, a1, c, y1, a1, c, y1, a0])
      const half = alongU ? hx : hz
      // a range's face on its court (kind 6): the court's walls see less of the sky
      const onCourt = t.part < 4 && s === [3, 2, 1, 0][t.part]
      if (hi > lo) quad(face(-half, half, lo, hi), s, onCourt ? 6 : 0, t.door === s ? (alongU ? 0 : 1) : NaN)
      if (has(s)) continue
      // the ends of the neighbouring sides' parapets on this face
      const cl = Math.max(lo, top)
      if (top + RH <= cl) continue
      if (has(alongU ? 0 : 2)) quad(face(-half, -half + W, cl, top + RH), s, 0, NaN)
      if (has(alongU ? 1 : 3)) quad(face(half - W, half, cl, top + RH), s, 0, NaN)
    }
    // the parapets' tops (the -v and +v ones take the corners) and their inner faces
    const T = top + RH
    if (has(2)) quad([-hx, T, -hz, hx, T, -hz, hx, T, -hz + W, -hx, T, -hz + W], 4, 1, NaN)
    if (has(3)) quad([-hx, T, hz - W, hx, T, hz - W, hx, T, hz, -hx, T, hz], 4, 1, NaN)
    if (has(0)) quad([-hx, T, v0, -hx + W, T, v0, -hx + W, T, v1, -hx, T, v1], 4, 1, NaN)
    if (has(1)) quad([hx - W, T, v0, hx, T, v0, hx, T, v1, hx - W, T, v1], 4, 1, NaN)
    if (has(2)) quad([u0, top, -hz + W, u1, top, -hz + W, u1, T, -hz + W, u0, T, -hz + W], 3, 2, NaN)
    if (has(3)) quad([u0, top, hz - W, u1, top, hz - W, u1, T, hz - W, u0, T, hz - W], 2, 2, NaN)
    if (has(0)) quad([-hx + W, top, v0, -hx + W, top, v1, -hx + W, T, v1, -hx + W, T, v0], 1, 2, NaN)
    if (has(1)) quad([hx - W, top, v0, hx - W, top, v1, hx - W, T, v1, hx - W, T, v0], 0, 2, NaN)
    // the roof (or the court's floor, or the roof room's top) inside the parapets
    quad([u0, top, v0, u1, top, v0, u1, top, v1, u0, top, v1], 4, t.part === 4 ? 4 : 3, NaN)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos.slice(0, nv * 3), 3))
  geo.setAttribute('normal', new BufferAttribute(nor.slice(0, nv * 3), 3))
  geo.setAttribute('hinfo', new BufferAttribute(info.slice(0, nv * 4), 4))
  geo.setAttribute('hdoor', new BufferAttribute(door.slice(0, nv * 2), 2))
  const cls = new Float32Array(nv * 2).fill(CLS.G), bd = new Float32Array(nv)
  for (let i = 0; i < nv; i++) bd[i] = info[i * 4 + 2]! + band
  geo.setAttribute('cls', new BufferAttribute(cls, 2))
  geo.setAttribute('band', new BufferAttribute(bd, 1))
  geo.setIndex(new BufferAttribute(idx.slice(0, ni), 1))
  geo.computeBoundingSphere()
  const mesh = new Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.name = 'houses'
  return mesh
}

function rebuiltHouses(list: HouseBoxLike[], band: number, mat: Material): InstancedMesh {
  const geo = new BoxGeometry(1, 1, 1)
  geo.deleteAttribute('uv')
  const im = new InstancedMesh(geo, mat, list.length)
  const n = list.length
  const info = new Float32Array(n * 4), size = new Float32Array(n * 3), cls = new Float32Array(n * 2), bd = new Float32Array(n)
  const m4 = new Matrix4(), qq = new Quaternion(), upY = new Vector3(0, 1, 0)
  list.forEach((b, i) => {
    qq.setFromAxisAngle(upY, b.yaw)
    m4.compose(new Vector3(b.x, (b.y0 + b.y1) / 2, b.z), qq, new Vector3(b.sx, b.y1 - b.y0, b.sz))
    im.setMatrixAt(i, m4)
    info.set([b.house, b.part + 8 * b.butt, b.gy, b.block], i * 4)
    size.set([b.sx, b.y1 - b.y0, b.sz], i * 3)
    cls.set([CLS.G, CLS.G], i * 2)
    bd[i] = b.gy + band
  })
  for (const [k, v, w] of [['hinfo', info, 4], ['size', size, 3], ['cls', cls, 2], ['band', bd, 1]] as Array<[string, Float32Array, number]>) geo.setAttribute(k, new InstancedBufferAttribute(v, w))
  im.instanceMatrix.needsUpdate = true
  im.castShadow = true
  im.receiveShadow = true
  im.frustumCulled = false
  im.name = 'houses'
  return im
}

export function buildBodies(built: Built, tones: ClassTones, sky: Sky, sunDir: N, canalZ: number[], passage?: Passage, paint: Paint = {}): Bodies {
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
  const rest = built.boxes.filter((b) => b.group !== 'house' && !b.hidden)
  const rebuilt = houses.length && paint.houses ? paint.houses.rebuild(houses, built.ground) : null
  if (rebuilt?.trays) group.add(trayHouses(settleTrays(rebuilt.trays, built.ground, groundLines(canalZ)), paint.houses!.band, bodyMaterial(tones, 0.47)))
  else if (rebuilt) group.add(rebuiltHouses(settleHouses(rebuilt.boxes, built.ground, groundLines(canalZ)), paint.houses!.band, bodyMaterial(tones, 0.47)))
  else if (houses.length) group.add(boxMesh(houses, bodyMaterial(tones, 0.47), 'houses'))
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
  const groundBase = g0.mul(mx_noise_float(positionWorld.mul(0.02)).mul(0.06).add(1)).mul(smoothstep(-4, 1, positionWorld.y).mul(0.4).add(0.6))
  groundMat.colorNode = paint.ground ? paint.ground(groundBase) : groundBase
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
