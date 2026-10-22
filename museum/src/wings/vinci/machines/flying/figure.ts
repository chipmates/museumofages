/** A PLAIN GREY FIGURE of 1.70 m: a marker for size and for where a body goes,
 * never a sculpture. Each segment is built along its own +Y from the joint
 * it hangs from, and posed by the two joints it spans and a facing hint. */
import { BufferGeometry, Group, Matrix4, Mesh, Quaternion, Vector3, type Material } from 'three/webgpu'
import { Mesher, tube, type V3 } from './shapes'

export interface FigureJoints {
  pelvis: V3; chest: V3; neck: V3; head: V3
  /** which way the body's front faces */
  front: V3
  shoulder: [V3, V3]; elbow: [V3, V3]; hand: [V3, V3]
  hip: [V3, V3]; knee: [V3, V3]; ankle: [V3, V3]; toe: [V3, V3]
}

/** a solid of revolution along +Y with elliptical sections: (u, rx, rz) */
function loft(m: Mesher, length: number, sections: readonly [number, number, number][], sides = 18): void {
  const ring = (u: number): [number, number] => {
    for (let i = 0; i < sections.length - 1; i++) {
      const a = sections[i]!, b = sections[i + 1]!
      if (u <= b[0]) { const k = (u - a[0]) / Math.max(1e-6, b[0] - a[0]); const s = k * k * (3 - 2 * k); return [a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s] }
    }
    const l = sections[sections.length - 1]!; return [l[1], l[2]]
  }
  const r0 = ring(0), r1 = ring(1)
  const cap0 = Math.min(r0[0], r0[1]), cap1 = Math.min(r1[0], r1[1])
  const path: V3[] = [], radii: [number, number][] = []
  for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI / 2; path.push([0, -cap0 * Math.cos(a), 0]); radii.push([r0[0] * Math.sin(a) + 1e-4, r0[1] * Math.sin(a) + 1e-4]) }
  for (let k = 1; k < 20; k++) { const u = k / 20; path.push([0, u * length, 0]); radii.push(ring(u)) }
  for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI / 2; path.push([0, length + cap1 * Math.sin(a), 0]); radii.push([r1[0] * Math.cos(a) + 1e-4, r1[1] * Math.cos(a) + 1e-4]) }
  // an elliptical tube: the shared tube with x scaled per station
  const base = m.count, stride = sides + 1
  for (let i = 0; i < path.length; i++) {
    const [rx, rz] = radii[i]!
    const prev = radii[Math.max(0, i - 1)]!, next = radii[Math.min(path.length - 1, i + 1)]!
    const dy = path[Math.min(path.length - 1, i + 1)]![1] - path[Math.max(0, i - 1)]![1]
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2
      const c = Math.cos(a), s = Math.sin(a)
      const drx = (next[0] - prev[0]) / Math.max(1e-6, dy), drz = (next[1] - prev[1]) / Math.max(1e-6, dy)
      const nx = c / Math.max(rx, 1e-4), nz = s / Math.max(rz, 1e-4)
      const ny = -(c * c * drx / Math.max(rx, 1e-4) + s * s * drz / Math.max(rz, 1e-4))
      const l = Math.hypot(nx, ny, nz) || 1
      m.vertex([c * rx, path[i]![1], s * rz], [nx / l, ny / l, nz / l], j / sides, path[i]![1], 1)
    }
  }
  for (let i = 0; i < path.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = base + i * stride + j, b = a + stride
    m.quad(a, b, b + 1, a + 1)
  }
}

interface Segment { node: Group; length: number }
export interface Figure {
  group: Group
  pose(j: FigureJoints): void
  dispose(): void
}

/** The figure: segments built once, posed from joint positions. */
export function makeFigure(material: Material, name = 'figure'): Figure {
  const group = new Group()
  group.name = name
  const geometries: BufferGeometry[] = []
  const make = (id: string, length: number, sections: readonly [number, number, number][], sides = 18): Segment => {
    const m = new Mesher()
    loft(m, length, sections, sides)
    const g = m.geometry()
    geometries.push(g)
    const node = new Group(); node.name = `${name}:${id}`
    const mesh = new Mesh(g, material); mesh.name = `${name}:${id}:surface`
    mesh.castShadow = true; mesh.receiveShadow = true
    node.add(mesh); group.add(node)
    return { node, length }
  }
  // the trunk from pelvis to neck; sections (u, half width, half depth)
  const trunk = make('trunk', 0.52, [[0, 0.155, 0.1], [0.22, 0.145, 0.095], [0.42, 0.135, 0.09], [0.7, 0.165, 0.105], [0.9, 0.17, 0.095], [1, 0.08, 0.06]], 22)
  const neck = make('neck', 0.09, [[0, 0.055, 0.055], [1, 0.05, 0.052]])
  const head = make('head', 0.13, [[0, 0.07, 0.08], [0.45, 0.08, 0.095], [1, 0.06, 0.07]], 20)
  const limb = (id: string, len: number, r0: number, r1: number, mid = 1.08): Segment =>
    make(id, len, [[0, r0, r0], [0.3, r0 * mid, r0 * mid], [1, r1, r1]], 14)
  const upperArm = [limb('upper-arm-l', 0.28, 0.048, 0.038), limb('upper-arm-r', 0.28, 0.048, 0.038)]
  const forearm = [limb('forearm-l', 0.25, 0.038, 0.028), limb('forearm-r', 0.25, 0.038, 0.028)]
  const hand = [make('hand-l', 0.15, [[0, 0.026, 0.044], [0.6, 0.022, 0.045], [1, 0.016, 0.03]], 12), make('hand-r', 0.15, [[0, 0.026, 0.044], [0.6, 0.022, 0.045], [1, 0.016, 0.03]], 12)]
  const thigh = [limb('thigh-l', 0.42, 0.075, 0.05, 1.04), limb('thigh-r', 0.42, 0.075, 0.05, 1.04)]
  const shin = [limb('shin-l', 0.42, 0.05, 0.033, 1.1), limb('shin-r', 0.42, 0.05, 0.033, 1.1)]
  const foot = [make('foot-l', 0.2, [[0, 0.035, 0.04], [0.5, 0.04, 0.03], [1, 0.035, 0.018]], 12), make('foot-r', 0.2, [[0, 0.035, 0.04], [0.5, 0.04, 0.03], [1, 0.035, 0.018]], 12)]

  const up = new Vector3(), side = new Vector3(), fwd = new Vector3(), hint = new Vector3(), q = new Quaternion(), mat = new Matrix4()
  /** place a segment from a toward b, its local +Z toward the facing hint */
  const place = (s: Segment, a: V3, b: V3, facing: V3, stretch = false): void => {
    up.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const l = up.length() || 1
    up.divideScalar(l)
    hint.set(facing[0], facing[1], facing[2])
    fwd.copy(hint).addScaledVector(up, -up.dot(hint))
    if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1).addScaledVector(up, -up.z)
    fwd.normalize()
    side.crossVectors(up, fwd).normalize()
    fwd.crossVectors(side, up).normalize()
    q.setFromRotationMatrix(mat.makeBasis(side, up, fwd))
    s.node.quaternion.copy(q)
    s.node.position.set(a[0], a[1], a[2])
    s.node.scale.set(1, stretch ? l / s.length : 1, 1)
  }
  const mid = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
  return {
    group,
    pose(j) {
      const back: V3 = [-j.front[0], -j.front[1], -j.front[2]]
      place(trunk, j.pelvis, j.neck, j.front, true)
      place(neck, j.neck, mid(j.neck, j.head, 0.55), j.front, true)
      place(head, mid(j.neck, j.head, 0.42), [j.head[0] + (j.head[0] - j.neck[0]) * 0.3, j.head[1] + (j.head[1] - j.neck[1]) * 0.3, j.head[2] + (j.head[2] - j.neck[2]) * 0.3], j.front, true)
      for (const k of [0, 1] as const) {
        place(upperArm[k]!, j.shoulder[k], j.elbow[k], back, true)
        place(forearm[k]!, j.elbow[k], j.hand[k], back, true)
        const reach: V3 = [j.hand[k][0] + (j.hand[k][0] - j.elbow[k][0]) * 0.55, j.hand[k][1] + (j.hand[k][1] - j.elbow[k][1]) * 0.55, j.hand[k][2] + (j.hand[k][2] - j.elbow[k][2]) * 0.55]
        place(hand[k]!, j.hand[k], reach, j.front)
        place(thigh[k]!, j.hip[k], j.knee[k], j.front, true)
        place(shin[k]!, j.knee[k], j.ankle[k], j.front, true)
        place(foot[k]!, j.ankle[k], j.toe[k], back, true)
      }
      group.updateMatrixWorld(true)
    },
    dispose() { for (const g of geometries) g.dispose() },
  }
}

/** two-bone reach: where the middle joint stands, bent toward the pole */
export function bend(a: V3, c: V3, l1: number, l2: number, pole: V3): V3 {
  const d: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const L = Math.min(Math.hypot(d[0], d[1], d[2]), l1 + l2 - 1e-4)
  const dn: V3 = [d[0] / (Math.hypot(...d) || 1), d[1] / (Math.hypot(...d) || 1), d[2] / (Math.hypot(...d) || 1)]
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L)
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x))
  const pd = pole[0] * dn[0] + pole[1] * dn[1] + pole[2] * dn[2]
  let p: V3 = [pole[0] - dn[0] * pd, pole[1] - dn[1] * pd, pole[2] - dn[2] * pd]
  const pl = Math.hypot(...p) || 1
  p = [p[0] / pl, p[1] / pl, p[2] / pl]
  return [a[0] + dn[0] * x + p[0] * h, a[1] + dn[1] * x + p[1] * h, a[2] + dn[2] * x + p[2] * h]
}

/** the figure standing, for size: feet on the floor at the origin, facing +Z */
export function standingJoints(turn = 0, at: V3 = [0, 0, 0]): FigureJoints {
  const c = Math.cos(turn), s = Math.sin(turn)
  const P = (x: number, y: number, z: number): V3 => [at[0] + x * c + z * s, at[1] + y, at[2] - x * s + z * c]
  return {
    pelvis: P(0, 0.95, 0), chest: P(0, 1.27, 0.01), neck: P(0, 1.46, 0), head: P(0, 1.6, 0.012), front: [s, 0, c],
    shoulder: [P(0.19, 1.41, 0), P(-0.19, 1.41, 0)], elbow: [P(0.23, 1.13, -0.03), P(-0.23, 1.13, -0.03)],
    hand: [P(0.24, 0.88, 0.02), P(-0.24, 0.88, 0.02)],
    hip: [P(0.095, 0.92, 0), P(-0.095, 0.92, 0)], knee: [P(0.1, 0.52, 0.02), P(-0.1, 0.52, 0.02)],
    ankle: [P(0.1, 0.105, -0.01), P(-0.1, 0.105, -0.01)], toe: [P(0.11, 0.05, 0.17), P(-0.11, 0.05, 0.17)],
  }
}
/** keep tube reachable for the checks */
export { tube }
