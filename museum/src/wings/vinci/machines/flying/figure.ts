/** A PLAIN GREY FIGURE of 1.70 m: a marker for size and for where a body goes,
 * never a sculpture. Each segment is built along its own +Y from the joint
 * it hangs from, and posed by the two joints it spans and a facing hint. */
import { BufferGeometry, Group, Matrix4, Mesh, Quaternion, Vector3, type Material } from 'three/webgpu'
import { Mesher, tube, type V3 } from './shapes'

export interface FigureJoints {
  pelvis: V3; chest: V3; neck: V3; head: V3
  /** which way the body's front faces */
  front: V3
  shoulder: [V3, V3]; elbow: [V3, V3]
  /** the wrists */
  hand: [V3, V3]
  hip: [V3, V3]; knee: [V3, V3]; ankle: [V3, V3]
  /** the tips of the toes, each FOOT_LENGTH from its ankle */
  toe: [V3, V3]
  /** the way each sole faces (else the body's back) */
  sole?: [V3, V3]
  /** where each closed hand's knuckles point (else on along the forearm) */
  knuckle?: [V3, V3]
  /** the line each hand closes round, a held cord's direction (else across the body) */
  grip?: [V3, V3]
}

/** THE FOOT, a type of a man's foot of 1.70 m: 0.255 m from the heel to the
 * toes. Profiles along the sole from the back of the heel (a, metres): the
 * sole's lift, the top line and the half width; the ankle's joint stands
 * 0.075 m over the sole, 0.055 m in front of the heel. */
const FOOT_A = [0, 0.012, 0.025, 0.045, 0.07, 0.1, 0.13, 0.16, 0.19, 0.215, 0.235, 0.248, 0.255] as const
const FOOT_SOLE = [0.026, 0.009, 0.003, 0.001, 0, 0, 0.002, 0.001, 0, 0.001, 0.003, 0.006, 0.011] as const
const FOOT_TOP = [0.052, 0.068, 0.078, 0.086, 0.087, 0.078, 0.064, 0.05, 0.037, 0.03, 0.026, 0.022, 0.016] as const
const FOOT_HALF = [0.017, 0.027, 0.03, 0.031, 0.032, 0.035, 0.041, 0.046, 0.048, 0.046, 0.04, 0.032, 0.02] as const
const ANKLE = [0.055, 0.075] as const
const TOE_TIP = [0.255, 0.019] as const
/** the segment's own frame: +Y from the ankle to the toes' tip, +Z toward the sole */
const footAxis = (() => {
  const d = [TOE_TIP[0] - ANKLE[0], TOE_TIP[1] - ANKLE[1]], l = Math.hypot(d[0]!, d[1]!)
  return { y: [d[0]! / l, d[1]! / l] as const, z: [d[1]! / l, -d[0]! / l] as const, length: l }
})()
export const FOOT_LENGTH = footAxis.length
/** a point given along the sole and over it (a, h), across (w), in the segment's frame */
export function footPoint(a: number, h: number, w = 0): V3 {
  const r = [a - ANKLE[0], h - ANKLE[1]]
  return [-w, r[0]! * footAxis.y[0] + r[1]! * footAxis.y[1], r[0]! * footAxis.z[0] + r[1]! * footAxis.z[1]]
}
function lerpTable(xs: readonly number[], ys: readonly number[], x: number): number {
  if (x <= xs[0]!) return ys[0]!
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]!) {
    const k = (x - xs[i - 1]!) / (xs[i]! - xs[i - 1]!), s = k * k * (3 - 2 * k)
    return ys[i - 1]! + (ys[i]! - ys[i - 1]!) * s
  }
  return ys[ys.length - 1]!
}
/** the top of the foot over the sole, a metres from the back of the heel */
export const footTopAt = (a: number): number => lerpTable(FOOT_A, FOOT_TOP, a)
/** the foot's surface: rounded sections, flat under the sole, closed at heel and toe */
function footSurface(m: Mesher): void {
  const ns = 34, sides = 22, grid: V3[][] = []
  const at = (i: number): number => FOOT_A[FOOT_A.length - 1]! * (0.5 - 0.5 * Math.cos(Math.PI * i / (ns - 1)))
  for (let i = 0; i < ns; i++) {
    const a = at(i), b = lerpTable(FOOT_A, FOOT_SOLE, a), t = lerpTable(FOOT_A, FOOT_TOP, a)
    // the heel and the toes close round, not on a flat cap
    const L = FOOT_A[FOOT_A.length - 1]!, round = (d: number, r: number): number => d >= r ? 1 : Math.sqrt(Math.max(0, 1 - ((r - d) / r) ** 2))
    const f = Math.max(0.02, round(a, 0.024) * round(L - a, 0.016))
    const hw = lerpTable(FOOT_A, FOOT_HALF, a) * f
    const mid = (t + b) / 2, hh = (t - b) / 2 * f, row: V3[] = []
    for (let j = 0; j <= sides; j++) {
      const th = (j / sides) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th)
      const x = hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / 2.6)
      const y = mid + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / (s < 0 ? 5 : 2.3))
      row.push([a, y, x])
    }
    grid.push(row)
  }
  const ends = [[-0.004, 0], [FOOT_A[FOOT_A.length - 1]! + 0.003, ns - 1]] as const
  const P = (i: number, j: number): V3 => grid[i]![j]!
  const base = m.count, stride = sides + 1
  for (let i = 0; i < ns; i++) for (let j = 0; j <= sides; j++) {
    const du = sub3(P(Math.min(ns - 1, i + 1), j), P(Math.max(0, i - 1), j))
    const dv = sub3(P(i, (j + 1) % sides), P(i, (j - 1 + sides) % sides))
    const n = i === 0 ? [-1, 0, 0] as V3 : i === ns - 1 ? [1, 0, 0] as V3 : norm3(cross3(du, dv))
    const p = P(i, j)
    m.vertex(footPoint(p[0], p[1], p[2]), footDir(n), j / sides, p[0], 1)
  }
  for (let i = 0; i < ns - 1; i++) for (let j = 0; j < sides; j++) {
    const a = base + i * stride + j
    m.quad(a, a + stride, a + stride + 1, a + 1)
  }
  for (const [ax, i] of ends) {
    const row = grid[i]!, cy = row.reduce((v, p) => v + p[1], 0) / row.length
    const tip = m.vertex(footPoint(ax, cy, 0), footDir([i === 0 ? -1 : 1, 0, 0]), 0.5, ax, 1)
    for (let j = 0; j < sides; j++) {
      const a = base + i * stride + j
      if (i === 0) m.tri(tip, a, a + 1); else m.tri(tip, a + 1, a)
    }
  }
}
/** a direction from the sole's frame (a, h, w) into the segment's */
function footDir(n: readonly number[]): V3 {
  return norm3([-n[2]!, n[0]! * footAxis.y[0] + n[1]! * footAxis.y[1], n[0]! * footAxis.z[0] + n[1]! * footAxis.z[1]])
}
/** THE CLOSED HAND: the fingers rolled into the palm, the thumb across them.
 * +Y from the wrist to the knuckles, X across the four fingers (the line a
 * held cord runs through the fist), the thumb on the -Z side. */
function fistSurface(m: Mesher): void {
  const ny = 26, sides = 24, base = m.count, stride = sides + 1
  const cy = 0.05, ry = 0.05, rx = 0.043, rz = 0.033
  const rows: { p: V3; n: V3 }[][] = []
  for (let i = 0; i <= ny; i++) {
    const v = -Math.PI / 2 + Math.PI * i / ny, sv = Math.sin(v), cv = Math.cos(v)
    const row: { p: V3; n: V3 }[] = []
    for (let j = 0; j <= sides; j++) {
      const u = (j / sides) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u)
      const e = (q: number, k: number): number => Math.sign(q) * Math.pow(Math.abs(q), 2 / k)
      // the four rolled fingers ridge the palm's side, near the knuckles
      const ridge = su < 0 && sv > -0.2 ? 0.0028 * Math.abs(Math.sin(4 * Math.PI * (e(cu, 3) * 0.5 + 0.5))) * (1 - sv * sv) : 0
      const x = rx * e(cv, 3) * e(cu, 3), z = (rz + ridge) * e(cv, 3) * e(su, 3), y = cy + ry * e(sv, 2.6)
      row.push({ p: [x, Math.max(y, 0.004), z + 0.004], n: [0, 0, 0] })
    }
    rows.push(row)
  }
  for (let i = 0; i <= ny; i++) for (let j = 0; j <= sides; j++) {
    const du = sub3(rows[Math.min(ny, i + 1)]![j]!.p, rows[Math.max(0, i - 1)]![j]!.p)
    const dv = sub3(rows[i]![(j + 1) % sides]!.p, rows[i]![(j - 1 + sides) % sides]!.p)
    let n = norm3(cross3(du, dv))
    const out = sub3(rows[i]![j]!.p, [0, cy, 0.004])
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]]
    if (i === 0) n = [0, -1, 0]
    if (i === ny) n = [0, 1, 0]
    m.vertex(rows[i]![j]!.p, n, j / sides, i / ny, 1)
  }
  for (let i = 0; i < ny; i++) for (let j = 0; j < sides; j++) {
    const a = base + i * stride + j
    m.quad(a, a + stride, a + stride + 1, a + 1)
  }
  // the thumb: from its root at the wrist's edge, laid over the first two fingers
  tube(m, [[0.036, 0.018, -0.012], [0.03, 0.045, -0.03], [0.012, 0.068, -0.037], [-0.004, 0.074, -0.034]], {
    sides: 12, caps: true, capTone: 1, radius: (i) => [0.014, 0.013, 0.0115, 0.0105][i]!,
  })
}
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm3 = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return [a[0]! / l, a[1]! / l, a[2]! / l] }

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
  const built = (id: string, length: number, surface: (m: Mesher) => void): Segment => {
    const m = new Mesher()
    surface(m)
    const g = m.geometry()
    geometries.push(g)
    const node = new Group(); node.name = `${name}:${id}`
    const mesh = new Mesh(g, material); mesh.name = `${name}:${id}:surface`
    mesh.castShadow = true; mesh.receiveShadow = true
    node.add(mesh); group.add(node)
    return { node, length }
  }
  const hand = [built('hand-l', 0.1, fistSurface), built('hand-r', 0.1, fistSurface)]
  const thigh = [limb('thigh-l', 0.42, 0.075, 0.05, 1.04), limb('thigh-r', 0.42, 0.075, 0.05, 1.04)]
  const shin = [limb('shin-l', 0.42, 0.05, 0.033, 1.1), limb('shin-r', 0.42, 0.05, 0.033, 1.1)]
  const foot = [built('foot-l', FOOT_LENGTH, footSurface), built('foot-r', FOOT_LENGTH, footSurface)]

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
        const reach: V3 = j.knuckle?.[k] ?? [j.hand[k][0] + (j.hand[k][0] - j.elbow[k][0]) * 0.55, j.hand[k][1] + (j.hand[k][1] - j.elbow[k][1]) * 0.55, j.hand[k][2] + (j.hand[k][2] - j.elbow[k][2]) * 0.55]
        // the fist's -Z carries the thumb: toward the body's front unless a held line says where the fingers close
        const along = norm3(sub3(reach, j.hand[k])), held = j.grip?.[k]
        place(hand[k]!, j.hand[k], reach, held ? cross3(held, along) : back)
        place(thigh[k]!, j.hip[k], j.knee[k], j.front, true)
        place(shin[k]!, j.knee[k], j.ankle[k], j.front, true)
        place(foot[k]!, j.ankle[k], j.toe[k], j.sole?.[k] ?? back, true)
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
    ankle: [P(0.1, ANKLE[1], -0.01), P(-0.1, ANKLE[1], -0.01)],
    toe: [P(0.115, TOE_TIP[1], TOE_TIP[0] - ANKLE[0] - 0.01), P(-0.115, TOE_TIP[1], TOE_TIP[0] - ANKLE[0] - 0.01)],
    sole: [[0, -1, 0], [0, -1, 0]],
  }
}
/** keep tube reachable for the checks */
export { tube }
