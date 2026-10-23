/** THE CAR'S JOINERY KIT. Every piece is built as the hand made it: a board is
 * a chamfered slab, a felloe an arc, a peg or a stave a turned rod. Each
 * vertex carries `aTone` = (the piece's own tone, how worn it is, end grain),
 * and UVs in metres with U along the grain, so the library's photograph runs
 * along each member and no two pieces of one tree read as one tone.
 */
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'

export type V3 = [number, number, number]
export const v = (x: number, y: number, z: number): V3 => [x, y, z]
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2])
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
export const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** A hash in [0, 1) for a piece's own variation, the same on every load. */
export function hash(...values: number[]): number {
  let h = 2166136261
  for (const value of values) {
    h = Math.imul(h ^ Math.round(value * 1000 + 7919), 16777619)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
  }
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export interface Finish {
  /** the piece's own tone, about 1 */
  tone: number
  /** 0 new, 1 worn smooth by hands, feet or the ground */
  wear?: number
  /** where the piece starts in the photograph; the tone when absent, so grime can darken a piece without moving its grain */
  seed?: number
  /** 1 where the piece stands out in the weather (the cover's boards), 0 elsewhere */
  weather?: number
  /** 1: the painted band that marks a spoke; 2: a face dressed by hand, its tool marks showing; 3: a felloe, its pegs' mortises darkened */
  mark?: number
}

const pickAxis = (n: V3, grain: V3): [V3, V3, number] => {
  const along = dot(n, grain)
  // a face across the grain is end grain: its UVs run on two axes in its own plane
  if (Math.abs(along) > 0.7) {
    const helper: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const a = norm(cross(helper, n))
    return [a, cross(n, a), 1]
  }
  const u = norm(sub(grain, mul(n, along)))
  return [u, cross(n, u), 0]
}

export class Kit {
  readonly position: number[] = []
  readonly normal: number[] = []
  readonly uv: number[] = []
  readonly tone: number[] = []
  readonly weather: number[] = []
  readonly mark: number[] = []

  private vertex(p: V3, n: V3, u: number, w: number, f: Finish, end: number): void {
    this.position.push(p[0], p[1], p[2])
    this.normal.push(n[0], n[1], n[2])
    // each piece starts at its own place in the photograph, so a knot never repeats board to board
    const t = (f.seed ?? f.tone) * 7919.37
    this.uv.push(u + (t - Math.floor(t)) * 3.7, w + ((t * 13.1) - Math.floor(t * 13.1)) * 0.9)
    this.tone.push(f.tone, f.wear ?? 0, end)
    this.weather.push(f.weather ?? 0)
    this.mark.push(f.mark ?? 0)
  }

  /** A flat convex polygon, its normal facing away from `inside`, its UVs along `grain`. */
  polygon(points: V3[], grain: V3, f: Finish, inside?: V3): void {
    if (points.length < 3) return
    let n: V3 = [0, 0, 0]
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!, b = points[(i + 1) % points.length]!
      n = add(n, cross(a, b))
    }
    if (len(n) < 1e-12) return
    n = norm(n)
    let pts = points
    if (inside) {
      const c = points.reduce((s, p) => add(s, p), [0, 0, 0] as V3)
      if (dot(n, sub(mul(c, 1 / points.length), inside)) < 0) { n = mul(n, -1); pts = [...points].reverse() }
    }
    const [ua, va, end] = pickAxis(n, grain)
    for (let i = 1; i + 1 < pts.length; i++) {
      for (const p of [pts[0]!, pts[i]!, pts[i + 1]!]) this.vertex(p, n, dot(p, ua), dot(p, va), f, end)
    }
  }

  /** A quad with its own per-vertex normals (a smooth surface), UVs given; `fs` grades the finish corner by corner. */
  smoothQuad(p: [V3, V3, V3, V3], n: [V3, V3, V3, V3], uvs: [number, number][], f: Finish, end = 0, fs?: [Finish, Finish, Finish, Finish]): void {
    // wound so the face looks along its normals, whichever order the corners came in
    const facing = dot(cross(sub(p[1], p[0]), sub(p[2], p[0])), add(add(n[0], n[1]), add(n[2], n[3]))) >= 0
    const order = facing ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]
    for (const i of order) this.vertex(p[i]!, n[i]!, uvs[i]![0], uvs[i]![1], fs ? fs[i]! : f, end)
  }

  /** A hexahedron from eight corners (index = x + 2y + 4z), every edge eased by `c`. */
  slab(c8: V3[], grain: V3, f: Finish, chamfer: number): void {
    const centre = mul(c8.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / 8)
    const faces: [number, number, number, number][] = [
      [0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6],
    ]
    if (chamfer <= 0) {
      for (const face of faces) this.polygon(face.map(i => c8[i]!), grain, f, centre)
      return
    }
    // the corner of face `fi` at corner `i`, drawn in along the face's two edges
    const inset = (i: number, fi: number): V3 => {
      const face = faces[fi]!
      const k = face.indexOf(i)
      const a = c8[face[(k + 1) % 4]!]!, b = c8[face[(k + 3) % 4]!]!, p = c8[i]!
      const ea = sub(a, p), eb = sub(b, p)
      const ca = Math.min(chamfer, len(ea) * 0.45), cb = Math.min(chamfer, len(eb) * 0.45)
      return add(p, add(mul(norm(ea), ca), mul(norm(eb), cb)))
    }
    for (let fi = 0; fi < 6; fi++) this.polygon(faces[fi]!.map(i => inset(i, fi)), grain, f, centre)
    const facesOf = (i: number): number[] => faces.flatMap((face, fi) => face.includes(i) ? [fi] : [])
    for (let i = 0; i < 8; i++) {
      for (const bit of [1, 2, 4]) {
        const j = i ^ bit
        if (j < i) continue
        const shared = facesOf(i).filter(fi => faces[fi]!.includes(j))
        const [f1, f2] = shared as [number, number]
        this.polygon([inset(i, f1), inset(j, f1), inset(j, f2), inset(i, f2)], grain, f, centre)
      }
      const [a, b, d] = facesOf(i) as [number, number, number]
      this.polygon([inset(i, a), inset(i, b), inset(i, d)], grain, f, centre)
    }
  }

  /** A box from a centre, three unit axes and half sizes; the grain along `axes[0]`. */
  box(centre: V3, axes: [V3, V3, V3], half: V3, f: Finish, chamfer = 0.004, grain?: V3): void {
    const c8: V3[] = []
    for (let i = 0; i < 8; i++) {
      const sx = i & 1 ? 1 : -1, sy = i & 2 ? 1 : -1, sz = i & 4 ? 1 : -1
      c8.push(add(centre, add(mul(axes[0], sx * half[0]), add(mul(axes[1], sy * half[1]), mul(axes[2], sz * half[2])))))
    }
    this.slab(c8, grain ?? axes[0], f, chamfer)
  }

  /** A solid of revolution about the line from `origin` along `axis`: the
   * profile is (distance along the axis, radius) pairs; smooth around, flat
   * caps where the radius closes or `caps` is set. */
  lathe(origin: V3, axis: V3, profile: [number, number][], segments: number, f: Finish, caps = true, wearAt?: (s: number) => number, grimeAt?: (s: number) => number): void {
    const w = norm(axis)
    const helper: V3 = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const e1 = norm(cross(helper, w)), e2 = cross(w, e1)
    const ring = (s: number, r: number, k: number): V3 => {
      const a = (k / segments) * Math.PI * 2
      return add(origin, add(mul(w, s), add(mul(e1, Math.cos(a) * r), mul(e2, Math.sin(a) * r))))
    }
    const radial = (k: number): V3 => { const a = (k / segments) * Math.PI * 2; return add(mul(e1, Math.cos(a)), mul(e2, Math.sin(a))) }
    for (let i = 0; i + 1 < profile.length; i++) {
      const [s0, r0] = profile[i]!, [s1, r1] = profile[i + 1]!
      const slopeN = (dr: number, ds: number, k: number): V3 => norm(add(mul(radial(k), ds), mul(w, -dr)))
      const ds = s1 - s0, dr = r1 - r0
      if (Math.hypot(ds, dr) < 1e-9) continue
      // wear and dirt graded ring by ring, so neither steps from one row to the next; the grain never moves
      const at = (s: number): Finish => {
        let g = wearAt ? { ...f, wear: Math.max(f.wear ?? 0, wearAt(s)) } : f
        if (grimeAt) g = { ...g, seed: f.seed ?? f.tone, tone: f.tone * grimeAt(s) }
        return g
      }
      const graded = wearAt || grimeAt ? [at(s0), at(s0), at(s1), at(s1)] as [Finish, Finish, Finish, Finish] : undefined
      for (let k = 0; k < segments; k++) {
        const p: [V3, V3, V3, V3] = [ring(s0, r0, k), ring(s0, r0, k + 1), ring(s1, r1, k + 1), ring(s1, r1, k)]
        const n: [V3, V3, V3, V3] = [slopeN(dr, ds, k), slopeN(dr, ds, k + 1), slopeN(dr, ds, k + 1), slopeN(dr, ds, k)]
        const circ = (kk: number, r: number): number => (kk / segments) * Math.PI * 2 * Math.max(r, 0.02)
        // the grain runs along the axis: U along, V around
        this.smoothQuad(p, n, [[s0, circ(k, r0)], [s0, circ(k + 1, r0)], [s1, circ(k + 1, r1)], [s1, circ(k, r1)]], f, 0, graded)
      }
    }
    if (!caps) return
    const capAt = (s: number, r: number, outward: number): void => {
      if (r < 1e-6) return
      const pts: V3[] = []
      for (let k = 0; k < segments; k++) pts.push(ring(s, r, k))
      if (outward < 0) pts.reverse()
      const n = mul(w, outward)
      const [ua, va] = pickAxis(n, w)
      for (let k = 1; k + 1 < segments; k++) {
        for (const p of [pts[0]!, pts[k]!, pts[k + 1]!]) this.vertex(p, n, dot(p, ua), dot(p, va), f, 1)
      }
    }
    const first = profile[0]!, last = profile[profile.length - 1]!
    capAt(first[0], first[1], -1)
    capAt(last[0], last[1], 1)
  }

  /** A turned rod from a to b; `along` splits it so wear and grime can vary along its length. */
  rod(a: V3, b: V3, r: number, segments: number, f: Finish, ease = 0.0, along?: { rows: number; wearAt?: (u: number) => number; grimeAt?: (u: number) => number }): void {
    const d = sub(b, a), l = len(d)
    const e = Math.min(ease, l * 0.2)
    const profile: [number, number][] = e > 0 ? [[0, r - e], [e, r]] : [[0, r]]
    const rows = along ? Math.max(1, along.rows) : 1
    for (let i = 1; i < rows; i++) profile.push([e + ((l - 2 * e) * i) / rows, r])
    profile.push(...(e > 0 ? [[l - e, r], [l, r - e]] as [number, number][] : [[l, r]] as [number, number][]))
    const wearAt = along?.wearAt ? (s: number) => along.wearAt!(s / l) : undefined
    const grimeAt = along?.grimeAt ? (s: number) => along.grimeAt!(s / l) : undefined
    this.lathe(a, d, profile, segments, f, true, wearAt, grimeAt)
  }

  /** An arc of a ring about `axis` through `centre`: radii r0..r1, angles
   * a0..a1 (from `zero`, turning by the right hand about the axis), height
   * h0..h1 along the axis. Curved faces smooth, the rest flat. */
  arc(centre: V3, axis: V3, zero: V3, r0: number, r1: number, a0: number, a1: number, h0: number, h1: number, segments: number, f: Finish, ends = true): void {
    const w = norm(axis), e1 = norm(sub(zero, mul(w, dot(zero, w)))), e2 = cross(w, e1)
    const dir = (a: number): V3 => add(mul(e1, Math.cos(a)), mul(e2, Math.sin(a)))
    const at = (r: number, a: number, h: number): V3 => add(centre, add(mul(dir(a), r), mul(w, h)))
    const tangent = (a: number): V3 => add(mul(e1, -Math.sin(a)), mul(e2, Math.cos(a)))
    const inside = add(centre, add(mul(dir((a0 + a1) / 2), (r0 + r1) / 2), mul(w, (h0 + h1) / 2)))
    for (let k = 0; k < segments; k++) {
      const aa = a0 + ((a1 - a0) * k) / segments, ab = a0 + ((a1 - a0) * (k + 1)) / segments
      const sa = ((r0 + r1) / 2) * (aa - a0), sb = ((r0 + r1) / 2) * (ab - a0)
      // outer and inner curved faces
      for (const [r, sign] of [[r1, 1], [r0, -1]] as const) {
        if (r < 1e-6) continue
        const p: [V3, V3, V3, V3] = sign > 0
          ? [at(r, aa, h0), at(r, ab, h0), at(r, ab, h1), at(r, aa, h1)]
          : [at(r, aa, h1), at(r, ab, h1), at(r, ab, h0), at(r, aa, h0)]
        const na = mul(dir(aa), sign), nb = mul(dir(ab), sign)
        const n: [V3, V3, V3, V3] = [na, nb, nb, na]
        const uvs: [number, number][] = sign > 0 ? [[sa, h0], [sb, h0], [sb, h1], [sa, h1]] : [[sa, h1], [sb, h1], [sb, h0], [sa, h0]]
        this.smoothQuad(p, n, uvs, f)
      }
      // the two flat faces across the axis
      this.polygon([at(r0, aa, h0), at(r0, ab, h0), at(r1, ab, h0), at(r1, aa, h0)], tangent((aa + ab) / 2), f, inside)
      this.polygon([at(r0, aa, h1), at(r0, ab, h1), at(r1, ab, h1), at(r1, aa, h1)], tangent((aa + ab) / 2), f, inside)
    }
    if (ends) {
      this.polygon([at(r0, a0, h0), at(r1, a0, h0), at(r1, a0, h1), at(r0, a0, h1)], tangent(a0), f, inside)
      this.polygon([at(r0, a1, h0), at(r1, a1, h0), at(r1, a1, h1), at(r0, a1, h1)], tangent(a1), f, inside)
    }
  }

  get count(): number { return this.position.length / 3 }

  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.position, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.normal, 3))
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2))
    g.setAttribute('aTone', new Float32BufferAttribute(this.tone, 3))
    g.setAttribute('aWeather', new Float32BufferAttribute(this.weather, 1))
    g.setAttribute('aMark', new Float32BufferAttribute(this.mark, 1))
    g.computeBoundingBox()
    g.computeBoundingSphere()
    return g
  }
}
