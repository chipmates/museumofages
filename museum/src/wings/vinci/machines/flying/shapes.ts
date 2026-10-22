/** Surface primitives for the flying machine, in metres and pure: a tapered
 * tube along a path, a cane bundle and its lashings, a lath, a disc. Every
 * surface carries position, normal, a metric uv and a vertex tone, so one
 * material per kind can dress the welded batch. */
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'

export type V3 = readonly [number, number, number]
type M3 = [number, number, number]
const add = (a: V3, b: V3): M3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): M3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: V3, k: number): M3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): M3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2])
const unit = (a: V3): M3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
export const v3 = { add, sub, mul, dot, cross, len, unit }

/** a stable pseudo-random number in [0, 1) from integers */
export function hash(...n: number[]): number {
  let h = 2166136261
  for (const x of n) h = Math.imul(h ^ Math.floor(x * 1000 + 7919), 16777619)
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Builds indexed triangles with the four attributes every batch carries. */
export class Mesher {
  readonly p: number[] = []
  readonly n: number[] = []
  readonly uv: number[] = []
  readonly c: number[] = []
  readonly i: number[] = []
  /** a hue laid over every tone that follows, until it is set back */
  tint: V3 = [1, 1, 1]
  vertex(p: V3, n: V3, u: number, v: number, tone = 1): number {
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.uv.push(u, v); this.c.push(tone * this.tint[0], tone * this.tint[1], tone * this.tint[2])
    return this.p.length / 3 - 1
  }
  tri(a: number, b: number, c: number): void { this.i.push(a, b, c) }
  quad(a: number, b: number, c: number, d: number): void { this.i.push(a, b, c, a, c, d) }
  get count(): number { return this.p.length / 3 }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.p, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.n, 3))
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new Float32BufferAttribute(this.c, 3))
    g.setIndex(this.i)
    g.computeBoundingBox(); g.computeBoundingSphere()
    return g
  }
}

/** parallel-transported frames along a path: tangent, normal, binormal */
export function frames(path: readonly V3[], up: V3 = [0, 1, 0]): { t: M3[]; n: M3[]; b: M3[]; s: number[] } {
  const t: M3[] = [], n: M3[] = [], b: M3[] = [], s: number[] = [0]
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)]!, c = path[Math.min(path.length - 1, i + 1)]!
    t.push(unit(sub(c, a)))
    if (i > 0) s.push(s[i - 1]! + len(sub(path[i]!, path[i - 1]!)))
  }
  let nn: M3 = unit(sub(up, mul(t[0]!, dot(up, t[0]!))))
  if (len(cross(t[0]!, up)) < 1e-4) nn = unit(cross(t[0]!, [1, 0, 0]))
  for (let i = 0; i < path.length; i++) {
    nn = unit(sub(nn, mul(t[i]!, dot(nn, t[i]!))))
    n.push(nn); b.push(cross(t[i]!, nn))
  }
  return { t, n, b, s }
}

export interface TubeOptions {
  sides: number
  /** radius at a station: index and distance along */
  radius: (i: number, along: number) => number
  /** tone at a station and around it */
  tone?: (i: number, along: number, around: number) => number
  caps?: boolean
  capTone?: number
  /** a fixed up for the first frame, so a member's seam is placed the same way */
  up?: V3
}
export function tube(m: Mesher, path: readonly V3[], o: TubeOptions): void {
  const f = frames(path, o.up)
  const base = m.count, stride = o.sides + 1
  for (let i = 0; i < path.length; i++) {
    const r = o.radius(i, f.s[i]!)
    for (let j = 0; j <= o.sides; j++) {
      const a = (j / o.sides) * Math.PI * 2
      const d = add(mul(f.n[i]!, Math.cos(a)), mul(f.b[i]!, Math.sin(a)))
      m.vertex(add(path[i]!, mul(d, r)), d, (j / o.sides) * Math.PI * 2 * r, f.s[i]!, o.tone?.(i, f.s[i]!, j / o.sides) ?? 1)
    }
  }
  for (let i = 0; i < path.length - 1; i++)
    for (let j = 0; j < o.sides; j++) {
      const a = base + i * stride + j, c = a + stride
      m.quad(a, a + 1, c + 1, c)
    }
  if (!o.caps) return
  for (const end of [0, path.length - 1]) {
    const tn = end === 0 ? mul(f.t[0]!, -1) : f.t[end]!
    const r = o.radius(end, f.s[end]!)
    const centre = m.vertex(path[end]!, tn, 0, 0, o.capTone ?? 0.7)
    const ring: number[] = []
    for (let j = 0; j <= o.sides; j++) {
      const a = (j / o.sides) * Math.PI * 2
      const d = add(mul(f.n[end]!, Math.cos(a)), mul(f.b[end]!, Math.sin(a)))
      ring.push(m.vertex(add(path[end]!, mul(d, r)), tn, Math.cos(a) * r, Math.sin(a) * r, o.capTone ?? 0.7))
    }
    for (let j = 0; j < o.sides; j++) {
      if (end === 0) m.tri(centre, ring[j + 1]!, ring[j]!)
      else m.tri(centre, ring[j]!, ring[j + 1]!)
    }
  }
}

/** sample a straight run into stations no longer than step */
export function line(a: V3, b: V3, step: number): V3[] {
  const n = Math.max(1, Math.ceil(len(sub(b, a)) / step))
  return Array.from({ length: n + 1 }, (_, i) => add(a, mul(sub(b, a), i / n)))
}

export interface BundleOptions {
  /** bundle radius at the start and at the end */
  r0: number
  r1: number
  seed: number
  /** a lashing every this many metres, starting this far in */
  lashEvery: number
  lashStart?: number
  /** extra lashings at these distances along */
  lashAt?: readonly number[]
  sides?: number
  step?: number
  up?: V3
  /** turns the canes make about each other over the whole run */
  twist?: number
}
/** THE BOUND CANE (77v, "canne armate"): three canes laid round each other,
 * each with its own nodes and colour, wrapped with hemp at intervals. */
export function caneBundle(cane: Mesher, lash: Mesher, path: readonly V3[], o: BundleOptions): void {
  const f = frames(path, o.up)
  const total = f.s[f.s.length - 1]!
  const R = (along: number): number => o.r0 + (o.r1 - o.r0) * (along / total)
  // eight sides: a cane is under 25 px across in the closest view, where an octagon's flats are under a pixel
  const sides = o.sides ?? 8
  const twist = o.twist ?? total / 3
  for (let k = 0; k < 3; k++) {
    // a node about every 0.3 m, each cane its own spacing
    const spacing = 0.24 + 0.12 * hash(o.seed, k)
    const shift = spacing * hash(o.seed, k, 3)
    // canes of one bundle differ: a few older and darker, the rest from straw
    // to a warmer brown, each its own girth inside the bundle's line
    const dark = hash(o.seed, k, 11) < 0.2
    const shade = dark ? 0.6 + 0.1 * hash(o.seed, k, 5) : 0.8 + 0.32 * hash(o.seed, k, 5)
    const girth = 0.93 + 0.14 * hash(o.seed, k, 7), rr = 0.464 * girth, off = 1 - rr
    const warm = hash(o.seed, k, 13)
    cane.tint = [1 + 0.05 * warm, 1 - 0.015 * warm, 1 - 0.12 * warm]
    const cPath: V3[] = path.map((p, i) => {
      const a = (k / 3) * Math.PI * 2 + (f.s[i]! / Math.max(total, 1e-6)) * twist * Math.PI * 2 + o.seed
      const d = add(mul(f.n[i]!, Math.cos(a)), mul(f.b[i]!, Math.sin(a)))
      return add(p, mul(d, off * R(f.s[i]!)))
    })
    // signed distance past the nearest node
    const nodeOff = (along: number): number => {
      const x = (along + shift) / spacing
      return (x - Math.round(x)) * spacing
    }
    // the node swells over a few millimetres, its sheath's scar a dark line
    // across it, the skin pale for a finger's width above it
    const swell = (along: number): number => { const d = nodeOff(along) / 0.007; return Math.max(0, 1 - d * d) }
    const scar = (along: number): number => Math.max(0, 1 - Math.abs(nodeOff(along) - 0.0015) / 0.0025)
    const pale = (along: number): number => { const d = nodeOff(along); return d > 0.002 ? Math.max(0, 1 - Math.abs(d - 0.01) / 0.008) : 0 }
    const band = (along: number): boolean => nodeOff(along) > -0.008 && nodeOff(along) < 0.019
    // between nodes the cane's skin varies a little in tone
    const internode = (along: number): number => 0.93 + 0.07 * Math.sin(Math.round((along + shift) / spacing) * 2.3 + k)
    const cr = (along: number): number => rr * R(along) * (1 + 0.24 * swell(along))
    tube(cane, densify(cPath, 0.003, band, f.s), {
      sides, up: o.up, caps: true, capTone: 0.62,
      radius: (_i, along) => cr(along),
      tone: (_i, along, around) => shade * internode(along) * (1 - 0.55 * scar(along)) * (1 + 0.18 * pale(along)) * (0.96 + 0.04 * Math.cos(around * Math.PI * 2 * 3)),
    })
    // the cut ends split along the fibre: a few slivers splayed past the cap
    for (const end of [0, path.length - 1]) {
      const i1 = end === 0 ? 1 : path.length - 2
      const dir = unit(sub(cPath[end]!, cPath[i1]!))
      const r = cr(f.s[end]!)
      for (let q = 0; q < 3; q++) {
        if (hash(o.seed, k, end, q) < 0.35) continue
        const a = Math.PI * 2 * (q / 3 + hash(o.seed, k, end, q, 1) * 0.3)
        const side = add(mul(f.n[end]!, Math.cos(a)), mul(f.b[end]!, Math.sin(a)))
        const base = add(cPath[end]!, mul(side, r * 0.55))
        const reach = 0.012 + 0.022 * hash(o.seed, k, end, q, 2)
        const tip = add(add(base, mul(dir, reach)), mul(side, r * 0.25 + reach * 0.18))
        lath(cane, [sub(base, mul(dir, 0.006)), add(base, mul(dir, reach * 0.5)), tip], r * 0.5, r * 0.18, side, shade * 0.86)
      }
    }
  }
  cane.tint = [1, 1, 1]
  const places: number[] = []
  for (let at = o.lashStart ?? o.lashEvery * 0.5; at < total - 0.02; at += o.lashEvery) places.push(at)
  for (const at of o.lashAt ?? []) places.push(at)
  for (const at of places) {
    // the station nearest, then the frame there
    let i = 0
    while (i < f.s.length - 2 && f.s[i + 1]! < at) i++
    const k = (at - f.s[i]!) / Math.max(1e-6, f.s[i + 1]! - f.s[i]!)
    const centre = add(path[i]!, mul(sub(path[i + 1]!, path[i]!), k))
    lashing(lash, centre, f.t[i]!, f.n[i]!, R(at) * 1.004, 3 + Math.round(hash(o.seed, at) * 2), hash(o.seed, at, 9))
  }
}

/** a path with extra stations where a test along it holds (a node's ridge
 * needs stations a few millimetres apart to show) */
export function densify(path: readonly V3[], step: number, where: (along: number) => boolean, s: readonly number[]): V3[] {
  const out: V3[] = [path[0]!]
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, l = s[i]! - s[i - 1]!
    const n = Math.max(1, Math.ceil(l / step))
    for (let j = 1; j <= n; j++) {
      const along = s[i - 1]! + l * j / n
      if (j === n || where(along) || where(along - step) || where(along + step)) out.push(add(a, mul(sub(b, a), j / n)))
    }
  }
  return out
}

/** a hemp wrapping laid tight round two members at once: each turn follows
 * the hull of the two sections, so it sits on both and bridges between */
export function lashTwo(m: Mesher, a: V3, ra: number, b: V3, rb: number, axis: V3, turns: number, phase = 0, rr = 0.0042): void {
  const t = unit(axis)
  const ref: V3 = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  const n = unit(cross(t, ref)), bb = cross(t, n)
  const mid = mul(add(a, b), 0.5)
  const flat = (c: V3): M3 => sub(c, mul(t, dot(sub(c, mid), t)))
  const A = flat(a), B = flat(b)
  const pitch = rr * 2.1, per = 28, steps = Math.ceil(turns * per)
  const pts: V3[] = []
  for (let s = 0; s <= steps; s++) {
    const ang = (s / per) * Math.PI * 2 + phase * 6.28
    const d = add(mul(n, Math.cos(ang)), mul(bb, Math.sin(ang)))
    const useA = dot(sub(A, mid), d) + ra >= dot(sub(B, mid), d) + rb
    const c = useA ? A : B, r = useA ? ra : rb
    const along = (s / steps - 0.5) * turns * pitch
    pts.push(add(add(c, mul(t, along)), mul(d, r + rr)))
  }
  tube(m, pts, { sides: 6, radius: () => rr, caps: true, capTone: 0.8, tone: (_i, along) => 0.92 + 0.08 * Math.sin(along * 900) })
}

/** a hemp wrapping: a tight helix of a few turns round an axis */
export function lashing(m: Mesher, centre: V3, axis: V3, normal: V3, radius: number, turns: number, phase = 0, rr = 0.0042): void {
  const t = unit(axis), n = unit(normal), b = cross(t, n)
  const pitch = rr * 2.1, steps = Math.ceil(turns * 14)
  const pts: V3[] = []
  for (let s = 0; s <= steps; s++) {
    const a = (s / 14) * Math.PI * 2 + phase * 6.28
    const along = (s / steps - 0.5) * turns * pitch
    const d = add(mul(n, Math.cos(a)), mul(b, Math.sin(a)))
    pts.push(add(add(centre, mul(t, along)), mul(d, radius + rr)))
  }
  tube(m, pts, { sides: 6, radius: () => rr, caps: true, capTone: 0.8, tone: (_i, along) => 0.92 + 0.08 * Math.sin(along * 900) })
}

/** a lath of rectangular section swept along a path; up names the wide face's normal */
export function lath(m: Mesher, path: readonly V3[], w: number, h: number, up: V3, tone = 1): void {
  const f = frames(path, up)
  const corners: [number, number][] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
  const normals: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]
  for (let side = 0; side < 4; side++) {
    const c0 = corners[side]!, c1 = corners[(side + 1) % 4]!, nn = normals[side]!
    const base = m.count
    for (let i = 0; i < path.length; i++) {
      // n is the lath's width direction (across), b its thickness direction
      const across = f.b[i]!, thick = f.n[i]!
      const normal = add(mul(across, nn[0]), mul(thick, nn[1]))
      for (const c of [c0, c1]) {
        const p = add(path[i]!, add(mul(across, c[0]), mul(thick, c[1])))
        m.vertex(p, normal, side % 2 === 0 ? c[0] : c[1], f.s[i]!, tone)
      }
    }
    for (let i = 0; i < path.length - 1; i++) {
      const a = base + i * 2
      m.quad(a, a + 2, a + 3, a + 1)
    }
  }
  // the two sawn ends, darker: end grain
  for (const end of [0, path.length - 1]) {
    const tn = end === 0 ? mul(f.t[0]!, -1) : f.t[end]!
    const ids = corners.map(c => m.vertex(add(path[end]!, add(mul(f.b[end]!, c[0]), mul(f.n[end]!, c[1]))), tn, c[0], c[1], tone * 0.62))
    if (end === 0) m.quad(ids[0]!, ids[1]!, ids[2]!, ids[3]!)
    else m.quad(ids[0]!, ids[3]!, ids[2]!, ids[1]!)
  }
}

/** a turned wheel, sheave or hub: a short cylinder about an axis, with a
 * groove when it carries a cord */
export function wheel(m: Mesher, centre: V3, axis: V3, radius: number, width: number, groove = 0, sides = 24, tone = 1): void {
  const t = unit(axis)
  const up: V3 = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  const n = unit(cross(t, up)), b = cross(t, n)
  // profile across the rim: rim, groove floor, rim
  const profile: [number, number][] = groove > 0
    ? [[-width / 2, radius], [-width * 0.2, radius - groove], [0, radius - groove * 1.15], [width * 0.2, radius - groove], [width / 2, radius]]
    : [[-width / 2, radius], [width / 2, radius]]
  const base = m.count
  for (let j = 0; j <= sides; j++) {
    const a = (j / sides) * Math.PI * 2
    const d = add(mul(n, Math.cos(a)), mul(b, Math.sin(a)))
    for (let k = 0; k < profile.length; k++) {
      const [x, r] = profile[k]!
      const prev = profile[Math.max(0, k - 1)]!, next = profile[Math.min(profile.length - 1, k + 1)]!
      const slope = (next[1] - prev[1]) / Math.max(1e-6, next[0] - prev[0])
      const nrm = unit(sub(d, mul(t, slope)))
      m.vertex(add(add(centre, mul(t, x)), mul(d, r)), nrm, (j / sides) * Math.PI * 2 * radius, x, tone)
    }
  }
  const stride = profile.length
  for (let j = 0; j < sides; j++)
    for (let k = 0; k < stride - 1; k++) {
      const a = base + j * stride + k, c = a + stride
      m.quad(a, c, c + 1, a + 1)
    }
  for (const sgn of [-1, 1]) {
    const tn = mul(t, sgn)
    const centreId = m.vertex(add(centre, mul(t, sgn * width / 2)), tn, 0, 0, tone * 0.82)
    const ring: number[] = []
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2
      const d = add(mul(n, Math.cos(a)), mul(b, Math.sin(a)))
      ring.push(m.vertex(add(add(centre, mul(t, sgn * width / 2)), mul(d, radius)), tn, Math.cos(a) * radius, Math.sin(a) * radius, tone * 0.82))
    }
    for (let j = 0; j < sides; j++) {
      if (sgn > 0) m.tri(centreId, ring[j]!, ring[j + 1]!)
      else m.tri(centreId, ring[j + 1]!, ring[j]!)
    }
  }
}

/** a closed ring (an iron eye or band) about an axis */
export function ring(m: Mesher, centre: V3, axis: V3, radius: number, rr: number, sides = 8, segments = 20, tone = 1): void {
  const t = unit(axis)
  const up: V3 = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  const n = unit(cross(t, up)), b = cross(t, n)
  const pts: V3[] = []
  for (let s = 0; s <= segments; s++) {
    const a = (s / segments) * Math.PI * 2
    pts.push(add(centre, mul(add(mul(n, Math.cos(a)), mul(b, Math.sin(a))), radius)))
  }
  tube(m, pts, { sides, radius: () => rr, up: t, tone: () => tone })
}

/** a flat bar between two points, its wide face toward `face` */
export function bar(m: Mesher, a: V3, b: V3, w: number, h: number, face: V3, tone = 1): void {
  lath(m, [a, b], w, h, face, tone)
}

/** a plain rod between two points */
export function rod(m: Mesher, a: V3, b: V3, r: number, sides = 10, tone = 1): void {
  tube(m, line(a, b, 0.2), { sides, radius: () => r, caps: true, capTone: tone * 0.85, tone: () => tone })
}
