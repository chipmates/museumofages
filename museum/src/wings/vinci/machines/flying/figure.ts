/** A PLAIN GREY FIGURE of 1.70 m: a marker for size and for where a body goes,
 * never a sculpture. Each segment is built along its own +Y from the joint
 * it hangs from, and posed by the two joints it spans and a facing hint. */
import { Bone, Float32BufferAttribute, Group, Matrix4, Quaternion, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3, type BufferGeometry, type Material } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
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
const FOOT_HALF = [0.019, 0.029, 0.033, 0.034, 0.034, 0.036, 0.041, 0.046, 0.048, 0.046, 0.04, 0.032, 0.02] as const
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
/** the foot's surface: rounded sections, flatter under the sole, closed at heel and toe;
 * medial names the side of the big toe and the arch (+1: the segment's -X) */
function footSurface(m: Mesher, medial: 1 | -1): void {
  const ns = 34, sides = 22, grid: V3[][] = []
  const at = (i: number): number => FOOT_A[FOOT_A.length - 1]! * (0.5 - 0.5 * Math.cos(Math.PI * i / (ns - 1)))
  for (let i = 0; i < ns; i++) {
    const a = at(i), b = lerpTable(FOOT_A, FOOT_SOLE, a), t = lerpTable(FOOT_A, FOOT_TOP, a)
    // the heel and the toes close round, not on a flat cap
    const L = FOOT_A[FOOT_A.length - 1]!, round = (d: number, r: number): number => d >= r ? 1 : Math.sqrt(Math.max(0, 1 - ((r - d) / r) ** 2))
    const f = Math.max(0.02, round(a, 0.024) * round(L - a, 0.016))
    const hw = lerpTable(FOOT_A, FOOT_HALF, a) * f
    const mid = (t + b) / 2, hh = (t - b) / 2 * f, row: V3[] = []
    // the big toe's side runs straighter to the tip; the arch lifts the sole's inner edge under the midfoot
    const toe = medial * 0.006 * smooth01((a - 0.17) / 0.08), arch = 0.008 * Math.exp(-(((a - 0.125) / 0.045) ** 2))
    for (let j = 0; j <= sides; j++) {
      const th = (j / sides) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th)
      const x = hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / 2.2)
      const inner = Math.max(0, x * medial / Math.max(hw, 1e-4))
      const y = mid + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / (s < 0 ? 3.4 : 2.1)) + (s < 0 ? arch * inner * inner * Math.abs(s) : 0)
      row.push([a, y, x + toe])
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
    const row = grid[i]!, cy = row.reduce((v, p) => v + p[1], 0) / row.length, cx = row.reduce((v, p) => v + p[2], 0) / row.length
    const tip = m.vertex(footPoint(ax, cy, cx), footDir([i === 0 ? -1 : 1, 0, 0]), 0.5, ax, 1)
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
  const cy = 0.052, ry = 0.052, rx = 0.045, rz = 0.034
  const rows: { p: V3; n: V3 }[][] = []
  for (let i = 0; i <= ny; i++) {
    const v = -Math.PI / 2 + Math.PI * i / ny, sv = Math.sin(v), cv = Math.cos(v)
    const row: { p: V3; n: V3 }[] = []
    for (let j = 0; j <= sides; j++) {
      const u = (j / sides) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u)
      const e = (q: number, k: number): number => Math.sign(q) * Math.pow(Math.abs(q), 2 / k)
      // the four rolled fingers ridge the palm's side, near the knuckles
      const ridge = su < 0 && sv > -0.2 ? 0.0045 * Math.abs(Math.sin(4 * Math.PI * (e(cu, 3) * 0.5 + 0.5))) * (1 - sv * sv)
        // the four knuckles stand on the back of the hand where it turns over the fingers
        : su > 0 && sv > 0.3 ? 0.004 * Math.pow(Math.abs(Math.sin(4 * Math.PI * (e(cu, 3) * 0.5 + 0.5))), 2) * Math.sin(Math.PI * (sv - 0.3) / 0.7) * su : 0
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
  tube(m, [[0.038, 0.018, -0.012], [0.032, 0.047, -0.031], [0.013, 0.07, -0.039], [-0.004, 0.077, -0.036]], {
    sides: 12, caps: true, capTone: 1, radius: (i) => [0.015, 0.014, 0.0125, 0.011][i]!,
  })
}
const smooth01 = (x: number): number => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u) }
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm3 = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return [a[0]! / l, a[1]! / l, a[2]! / l] }

/** A body form's section: along (0 to 1), half width, depth to the front (+Z)
 * and depth to the back (-Z), in metres */
type Section = readonly [number, number, number, number]
/** a form's relief: an outward offset in metres by along, across (x) and side (+1 front, -1 back) */
type Relief = (u: number, x: number, side: 1 | -1) => number
const gauss = (d: number, w: number): number => Math.exp(-((d / w) ** 2))

/** A form along +Y with rounded ends: sections eased between, a little squarer
 * than an ellipse, and a relief laid over the front or the back */
function form(m: Mesher, length: number, sections: readonly Section[], sides = 18, relief?: Relief): void {
  const at = (u: number): [number, number, number] => {
    for (let i = 0; i < sections.length - 1; i++) {
      const a = sections[i]!, b = sections[i + 1]!
      if (u <= b[0]) { const k = smooth01((u - a[0]) / Math.max(1e-6, b[0] - a[0])); return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k] }
    }
    const l = sections[sections.length - 1]!; return [l[1], l[2], l[3]]
  }
  const r0 = at(0), r1 = at(1), cap0 = Math.min(...r0), cap1 = Math.min(...r1)
  const rows: { y: number; k: number; u: number }[] = []
  for (let q = 0; q <= 6; q++) { const a = (q / 6) * Math.PI / 2; rows.push({ y: -cap0 * Math.cos(a), k: Math.sin(a), u: 0 }) }
  for (let q = 1; q < 24; q++) rows.push({ y: (q / 24) * length, k: 1, u: q / 24 })
  for (let q = 0; q <= 6; q++) { const a = (q / 6) * Math.PI / 2; rows.push({ y: length + cap1 * Math.sin(a), k: Math.cos(a), u: 1 }) }
  const e = (q: number): number => Math.sign(q) * Math.pow(Math.abs(q), 2 / 2.2)
  const grid: V3[][] = rows.map(({ y, k, u }) => {
    const [rx, rf, rb] = at(u), row: V3[] = []
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), side: 1 | -1 = sn >= 0 ? 1 : -1
      const x = rx * e(c) * k
      const z = (side > 0 ? rf : rb) * e(sn) * k + (relief ? side * relief(u, x, side) * Math.abs(sn) * k : 0)
      row.push([x, y, z])
    }
    return row
  })
  const base = m.count, stride = sides + 1, last = rows.length - 1
  for (let i = 0; i <= last; i++) for (let j = 0; j <= sides; j++) {
    const p = grid[i]![j]!
    let n: V3
    if (i === 0) n = [0, -1, 0]
    else if (i === last) n = [0, 1, 0]
    else {
      const du = sub3(grid[i + 1]![j]!, grid[i - 1]![j]!), dv = sub3(grid[i]![(j + 1) % sides]!, grid[i]![(j - 1 + sides) % sides]!)
      n = norm3(cross3(du, dv))
      if (n[0] * p[0] + n[2] * p[2] < 0) n = [-n[0], -n[1], -n[2]]
    }
    m.vertex(p, n, j / sides, p[1], 1)
  }
  for (let i = 0; i < last; i++) for (let j = 0; j < sides; j++) {
    const a = base + i * stride + j, b = a + stride
    m.quad(a, b, b + 1, a + 1)
  }
}

/** THE HEAD, a type: the skull's dome and the jaw narrowing to the chin, no
 * face drawn on it. +Y from the neck up the head, +Z the face; a distance
 * field of three ellipsoids, met by rays from inside. */
function headSurface(m: Mesher): void {
  const ell = (p: V3, c: V3, r: V3): number => {
    const q = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]]
    const k0 = Math.hypot(q[0]!, q[1]!, q[2]!), k1 = Math.hypot(q[0]! / r[0], q[1]! / r[1], q[2]! / r[2])
    return k0 * (k0 - 1) / Math.max(k1, 1e-6)
  }
  const smin = (a: number, b: number, k: number): number => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4 }
  const field = (p: V3): number => {
    const skull = ell(p, [0, 0.091, -0.012], [0.074, 0.099, 0.094])
    // the jaw narrows from the cheekbones down to the chin
    const narrow = 0.62 + 0.38 * smooth01((p[1] + 0.045) / 0.095)
    const jaw = ell([p[0] / narrow, p[1], p[2]], [0, 0.022, 0.03], [0.058, 0.066, 0.06])
    const chin = ell(p, [0, -0.03, 0.066], [0.024, 0.021, 0.02])
    return smin(smin(skull, jaw, 0.028), chin, 0.014)
  }
  const c: V3 = [0, 0.06, 0], ny = 24, sides = 28, base = m.count, stride = sides + 1
  const surface = (d: V3): V3 => {
    let lo = 0, hi = 0.2
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (field([c[0] + d[0] * mid, c[1] + d[1] * mid, c[2] + d[2] * mid]) < 0) lo = mid; else hi = mid }
    const r = (lo + hi) / 2
    return [c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r]
  }
  const h = 1e-4
  for (let i = 0; i <= ny; i++) {
    const th = Math.PI * i / ny
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2
      const p = surface([Math.sin(th) * Math.cos(a), -Math.cos(th), Math.sin(th) * Math.sin(a)])
      const n = norm3([
        field([p[0] + h, p[1], p[2]]) - field([p[0] - h, p[1], p[2]]),
        field([p[0], p[1] + h, p[2]]) - field([p[0], p[1] - h, p[2]]),
        field([p[0], p[1], p[2] + h]) - field([p[0], p[1], p[2] - h]),
      ])
      m.vertex(p, n, j / sides, i / ny, 1)
    }
  }
  for (let i = 0; i < ny; i++) for (let j = 0; j < sides; j++) {
    const a = base + i * stride + j, b = a + stride
    m.quad(a, b, b + 1, a + 1)
  }
}

/** the back's relief: the spine's furrow, the shoulder blades, the buttocks and their cleft */
const trunkRelief: Relief = (u, x, side) => {
  if (side > 0) return 0
  const ax = Math.abs(x)
  return -0.007 * gauss(x, 0.02) * smooth01((u - 0.12) / 0.18) * (1 - smooth01((u - 0.88) / 0.1))
    + 0.009 * gauss(ax - 0.085, 0.04) * gauss(u - 0.8, 0.09)
    + 0.02 * gauss(ax - 0.07, 0.055) * gauss(u, 0.12) - 0.012 * gauss(x, 0.012) * gauss(u + 0.02, 0.12)
}

interface Segment { node: Bone; length: number }
export interface Figure {
  group: Group
  pose(j: FigureJoints): void
  dispose(): void
}

/** The figure: segments built once, posed from joint positions. Each segment
 * is a bone of one skinned mesh, so the whole figure is one draw per pass. */
export function makeFigure(material: Material, name = 'figure'): Figure {
  const group = new Group()
  group.name = name
  const parts: BufferGeometry[] = [], bones: Bone[] = []
  const segment = (id: string, length: number, m: Mesher): Segment => {
    const g = m.geometry()
    const n = g.getAttribute('position').count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) { si[i * 4] = bones.length; sw[i * 4] = 1 }
    g.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4))
    g.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4))
    parts.push(g)
    const node = new Bone(); node.name = `${name}:${id}`
    bones.push(node); group.add(node)
    return { node, length }
  }
  const built = (id: string, length: number, surface: (m: Mesher) => void): Segment => {
    const m = new Mesher()
    surface(m)
    return segment(id, length, m)
  }
  const make = (id: string, length: number, sections: readonly Section[], sides = 18, relief?: Relief): Segment => {
    const m = new Mesher()
    form(m, length, sections, sides, relief)
    return segment(id, length, m)
  }
  // the trunk from pelvis to neck: (u, half width, depth to the front, to the back)
  const trunk = make('trunk', 0.52, [[0, 0.158, 0.088, 0.098], [0.12, 0.152, 0.09, 0.095], [0.3, 0.138, 0.09, 0.084], [0.45, 0.134, 0.092, 0.084], [0.65, 0.15, 0.1, 0.09], [0.86, 0.166, 0.098, 0.092], [1, 0.07, 0.055, 0.05]], 28, trunkRelief)
  const neck = make('neck', 0.09, [[0, 0.05, 0.047, 0.047], [1, 0.044, 0.042, 0.044]], 16)
  const head = built('head', 0.13, headSurface)
  // the arms: the shoulder's round, the forearm full under the elbow and flat at the wrist
  const upperArm = (['l', 'r'] as const).map(k => make(`upper-arm-${k}`, 0.28, [[0, 0.05, 0.047, 0.047], [0.2, 0.049, 0.046, 0.046], [0.55, 0.043, 0.042, 0.04], [0.88, 0.037, 0.034, 0.034], [1, 0.036, 0.033, 0.033]], 16))
  const forearm = (['l', 'r'] as const).map(k => make(`forearm-${k}`, 0.25, [[0, 0.036, 0.034, 0.034], [0.2, 0.042, 0.037, 0.036], [0.62, 0.034, 0.027, 0.027], [1, 0.028, 0.019, 0.019]], 16))
  const hand = [built('hand-l', 0.1, fistSurface), built('hand-r', 0.1, fistSurface)]
  // the legs: the thigh full at the top, the calf behind the shin, the ankle slim
  const thigh = (['l', 'r'] as const).map(k => make(`thigh-${k}`, 0.42, [[0, 0.078, 0.072, 0.075], [0.3, 0.07, 0.068, 0.066], [0.75, 0.056, 0.052, 0.05], [1, 0.047, 0.046, 0.044]], 18))
  const shin = (['l', 'r'] as const).map(k => make(`shin-${k}`, 0.42, [[0, 0.047, 0.046, 0.044], [0.22, 0.05, 0.04, 0.058], [0.55, 0.042, 0.034, 0.042], [0.88, 0.028, 0.027, 0.029], [1, 0.03, 0.03, 0.03]], 18))
  // the left foot's big toe toward -X, the right's toward +X: the same side of the body's middle
  const foot = [built('foot-l', FOOT_LENGTH, m => footSurface(m, 1)), built('foot-r', FOOT_LENGTH, m => footSurface(m, -1))]

  // bound with every bone at rest at the group's origin: each segment's own frame is the mesh's
  const geometry = mergeGeometries(parts, false)
  if (!geometry) throw new Error('the figure could not be merged')
  for (const g of parts) g.dispose()
  const mesh = new SkinnedMesh(geometry, material)
  mesh.name = `${name}:surface`
  mesh.castShadow = true; mesh.receiveShadow = true
  mesh.frustumCulled = false
  group.add(mesh)
  group.updateWorldMatrix(true, true)
  mesh.bind(new Skeleton(bones))
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
        const reach: V3 = j.knuckle?.[k] ?? [j.hand[k][0] + (j.hand[k][0] - j.elbow[k][0]) * 0.55, j.hand[k][1] + (j.hand[k][1] - j.elbow[k][1]) * 0.55, j.hand[k][2] + (j.hand[k][2] - j.elbow[k][2]) * 0.55]
        // the fist's -Z carries the thumb: toward the body's front unless a held line says where the fingers close
        const along = norm3(sub3(reach, j.hand[k])), held = j.grip?.[k], palm = held ? cross3(held, along) : back
        place(forearm[k]!, j.elbow[k], j.hand[k], palm, true)
        place(hand[k]!, j.hand[k], reach, palm)
        place(thigh[k]!, j.hip[k], j.knee[k], j.front, true)
        place(shin[k]!, j.knee[k], j.ankle[k], j.front, true)
        place(foot[k]!, j.ankle[k], j.toe[k], j.sole?.[k] ?? back, true)
      }
      group.updateMatrixWorld(true)
    },
    dispose() { geometry.dispose(); mesh.skeleton.dispose() },
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
