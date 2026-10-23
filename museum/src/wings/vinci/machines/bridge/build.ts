/** THE BRIDGE'S GEOMETRY. A pole is a turned surface along its own axis: a
 * round stem tapering butt to tip, its ends cut square and eased, with a
 * slow wander in its girth. A lashing is three square-lashing turns of hemp
 * round a rod and the support it crosses, each turn a closed loop swept with
 * the rope's round section. Every vertex carries what the surfaces need:
 * UVs in metres (U along the stem, as the library's grain runs, V round it), `aTone` (the piece's own
 * tone, peeled or in its bark, end grain), `aSeed`.
 */
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'
import { BANK, CROSSINGS, POLES, ROPE_R, TAU, TURNS, LASH_TIME, groundY, hash, lashStart, supportOf, type Crossing, type Pole, type V3 } from './plan'

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2])
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

export class Sheet {
  readonly position: number[] = []
  readonly normal: number[] = []
  readonly uv: number[] = []
  readonly tone: number[] = []
  readonly seed: number[] = []
  readonly index: number[] = []
  extra: Record<string, { size: number; data: number[] }> = {}
  /** a stem's own cylinder coordinates at each vertex (along, then the round at the mean radius) */
  readonly cyl: number[] = []
  vertex(p: V3, n: V3, u: number, v: number, tone: V3, seed: number, cyl?: V3): number {
    this.position.push(p[0], p[1], p[2]); this.normal.push(n[0], n[1], n[2]); this.uv.push(u, v)
    this.tone.push(tone[0], tone[1], tone[2]); this.seed.push(seed)
    if (cyl) this.cyl.push(cyl[0], cyl[1], cyl[2])
    return this.position.length / 3 - 1
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.position, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.normal, 3))
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2))
    g.setAttribute('aTone', new Float32BufferAttribute(this.tone, 3))
    g.setAttribute('aSeed', new Float32BufferAttribute(this.seed, 1))
    for (const [name, { size, data }] of Object.entries(this.extra)) g.setAttribute(name, new Float32BufferAttribute(data, size))
    if (this.cyl.length) g.setAttribute('aCyl', new Float32BufferAttribute(this.cyl, 3))
    g.setIndex(this.index)
    g.computeBoundingBox(); g.computeBoundingSphere()
    return g
  }
}

/** The girth's slow wander, a few millimetres: knots and swellings of a grown stem. Kept small where a pole bears. */
function wander(seed: number, s: number, a: number): number {
  return 0.0016 * Math.sin(s * 2.3 + seed * 40) + 0.0011 * Math.sin(s * 5.9 + a * 2 + seed * 17) + 0.0008 * Math.sin(a * 3 + s * 1.1 + seed * 9)
}

/** A stem of `length` along +X from -length/2, radius `r(s)` (s from end a), its ends cut square and eased. */
export function stem(sheet: Sheet, length: number, r: (s: number) => number, seed: number, tone: number, peeled: number, around = 22): void {
  const rows = Math.max(6, Math.ceil(length / 0.09))
  const ease = 0.012
  const side: [number, number][] = [[0, 0.84], [ease * 0.35, 0.965], [ease, 1]]
  for (let i = 1; i < rows; i++) side.push([(length * i) / rows, 1])
  side.push([length - ease, 1], [length - ease * 0.35, 0.965], [length, 0.84])
  const x0 = -length / 2, girth = TAU * r(length / 2)
  const ring = (s: number, scale: number, cap: 0 | -1 | 1, slope: number): number => {
    const start = sheet.position.length / 3
    for (let k = 0; k <= around; k++) {
      const a = (k / around) * TAU, c = Math.cos(a), sn = Math.sin(a)
      const rr = (r(s) + wander(seed, s, a)) * scale
      const p: V3 = [x0 + s, rr * c, rr * sn]
      const cyl: V3 = [s, (girth / TAU) * c, (girth / TAU) * sn]
      if (cap !== 0) sheet.vertex(p, [cap, 0, 0], rr * c, rr * sn, [tone, peeled, 1], seed, cyl)
      else sheet.vertex(p, norm([-slope, c, sn]), s, (k / around) * girth, [tone, peeled, 0], seed, cyl)
    }
    return start
  }
  const capFan = (centre: number, edge: number, facing: number): void => {
    for (let k = 0; k < around; k++) {
      if (facing < 0) sheet.index.push(centre + k, edge + k + 1, edge + k)
      else sheet.index.push(centre + k, edge + k, edge + k + 1)
    }
  }
  capFan(ring(0, 0, -1, 0), ring(0, 0.84, -1, 0), -1)
  let prev = -1
  side.forEach(([s, scale], i) => {
    const [sa, ka] = side[Math.max(0, i - 1)]!, [sb, kb] = side[Math.min(side.length - 1, i + 1)]!
    const slope = ((kb - ka) * r(s)) / Math.max(1e-6, sb - sa)
    const at = ring(s, scale, 0, slope)
    if (prev >= 0) for (let k = 0; k < around; k++) sheet.index.push(prev + k, at + k + 1, at + k, prev + k, prev + k + 1, at + k + 1)
    prev = at
  })
  capFan(ring(length, 0, 1, 0), ring(length, 0.84, 1, 0), 1)
}

/** One pole's geometry in its own frame: along +X, centred. */
export function poleGeometry(p: Pole): BufferGeometry {
  const sheet = new Sheet()
  stem(sheet, p.length, s => p.r + p.taper * (0.5 - s / p.length), p.seed, p.tone, p.peeled)
  return sheet.geometry()
}

/** The seats, the stakes that hold them and the pile's sleepers, in place: one surface, in their bark. */
export function groundworkGeometry(parts: { a: V3; b: V3; r: number; taper: number; seed: number; tone: number; point?: boolean }[]): BufferGeometry {
  const sheet = new Sheet()
  for (const part of parts) {
    const from = sheet.position.length / 3
    const length = len(sub(part.b, part.a))
    stem(sheet, length, s => part.r + part.taper * (0.5 - s / length), part.seed, part.tone, 0, 18)
    // place: the stem was built along +X centred at the origin
    const dir = norm(sub(part.b, part.a))
    const helper: V3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const zAxis = norm(cross(dir, helper)), yAxis = cross(zAxis, dir)
    const centre = mul(add(part.a, part.b), 0.5)
    for (let i = from; i < sheet.position.length / 3; i++) {
      const p: V3 = [sheet.position[i * 3]!, sheet.position[i * 3 + 1]!, sheet.position[i * 3 + 2]!]
      const n: V3 = [sheet.normal[i * 3]!, sheet.normal[i * 3 + 1]!, sheet.normal[i * 3 + 2]!]
      const w = add(centre, add(mul(dir, p[0]), add(mul(yAxis, p[1]), mul(zAxis, p[2]))))
      const wn = add(mul(dir, n[0]), add(mul(yAxis, n[1]), mul(zAxis, n[2])))
      sheet.position.splice(i * 3, 3, ...w); sheet.normal.splice(i * 3, 3, ...wn)
    }
  }
  return sheet.geometry()
}

/** A rod's frame at a crossing: its direction, the plane's Z and its axis at the support. */
function crossingFrame(c: Crossing): { o: V3; d: V3; w: V3; m: V3; rr: number; rs: number } {
  const rod = POLES.find(p => p.id === c.rod)!
  const s = supportOf(c.support)
  const z = rod.a[2]
  const o: V3 = [s.xy[0], s.xy[1], z]
  const d = norm(sub(rod.b, rod.a))
  const w: V3 = [0, 0, 1]
  // from the support's axis toward the rod's
  const toRod = sub(rod.a, o), along = dot(toRod, d)
  const foot = add(rod.a, mul(d, -along))
  const m = norm(sub(foot, o))
  const rr = rod.r + rod.taper * (0.5 + along / rod.length)
  return { o, d, w, m, rr, rs: s.r }
}

/** The closed centreline of one square-lashing turn: over the rod beside the support on one side, round the
 * support beside the rod, over the rod on the other side, round the support on the other: side by side with the
 * turns before it. */
function turnPath(c: Crossing, i: number): { p: V3; serve: number }[] {
  const { o, d, w, m, rr, rs } = crossingFrame(c)
  const gap = 0.0006
  const rRope = ROPE_R
  const a = rs + rRope * (1 + 2 * i) + gap
  const b = rr + rRope * (1 + 2 * i) + gap
  const hRod = dot(sub(add(o, mul(m, rs + rr)), o), m)
  const at = (du: number, dw: number, dm: number): V3 => add(o, add(mul(d, du), add(mul(w, dw), mul(m, dm))))
  const N = 14
  const path: { p: V3; serve: number }[] = []
  // round the rod (its axis at height hRod along m) at d = side*a, from w = -from to +from over its far face
  const overRod = (side: number, dir: number): void => {
    for (let j = 0; j <= N; j++) {
      const t = Math.PI * (j / N)
      const ang = dir > 0 ? Math.PI - t : t
      const rad = rr + rRope + gap
      path.push({ p: at(side * a, rad * Math.cos(ang), hRod + rad * Math.sin(ang)), serve: Math.sin(t) > 0.35 ? 1 : 0 })
    }
  }
  // round the support (its axis at the origin) at w = side*b, from d = +from to -from over its far face
  const roundSupport = (side: number, dir: number): void => {
    for (let j = 0; j <= N; j++) {
      const t = Math.PI * (j / N)
      const ang = dir > 0 ? t : Math.PI - t
      const rad = rs + rRope + gap
      path.push({ p: at(rad * Math.cos(ang), side * b, -rad * Math.sin(ang)), serve: Math.sin(t) > 0.35 ? 1 : 0 })
    }
  }
  overRod(1, 1)
  roundSupport(1, 1)
  overRod(-1, -1)
  roundSupport(-1, -1)
  return chaikin(path, 2)
}

/** Corner cutting on a closed path: rounds the turns where one wrap hands over to the next. */
function chaikin(path: { p: V3; serve: number }[], passes: number): { p: V3; serve: number }[] {
  let cur = path
  for (let k = 0; k < passes; k++) {
    const next: { p: V3; serve: number }[] = []
    for (let i = 0; i < cur.length; i++) {
      const A = cur[i]!, B = cur[(i + 1) % cur.length]!
      next.push({ p: add(mul(A.p, 0.75), mul(B.p, 0.25)), serve: A.serve }, { p: add(mul(A.p, 0.25), mul(B.p, 0.75)), serve: B.serve })
    }
    cur = next
  }
  return cur
}

/** Every lashing as one surface: each vertex knows the centre of the rope where it lies (`aSpine`), the moment
 * it is wound (`aBorn`) and whether it is served there (`aServe`). */
export function lashingGeometry(): BufferGeometry {
  const sheet = new Sheet()
  const spine: number[] = [], born: number[] = [], serve: number[] = []
  const around = 8
  CROSSINGS.forEach((c, ci) => {
    const start = lashStart(c)
    const turns = Array.from({ length: TURNS }, (_, i) => turnPath(c, i))
    const lengths = turns.map(t => t.reduce((sum, q, j) => sum + len(sub(t[(j + 1) % t.length]!.p, q.p)), 0))
    const total = lengths.reduce((s, l) => s + l, 0)
    let done = 0
    const seed = hash(ci, 41)
    turns.forEach((path, ti) => {
      const n = path.length
      // parallel-transport frames round the closed loop, the twist's mismatch spread along it
      const tangents = path.map((q, j) => norm(sub(path[(j + 1) % n]!.p, path[(j - 1 + n) % n]!.p)))
      const t0 = tangents[0]!
      let normal = norm(cross(t0, Math.abs(t0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
      const normals: V3[] = []
      for (let j = 0; j < n; j++) {
        const t = tangents[j]!
        normal = norm(sub(normal, mul(t, dot(normal, t))))
        normals.push(normal)
      }
      const endN = norm(sub(normals[n - 1]!, mul(t0, dot(normals[n - 1]!, t0))))
      const startB = cross(t0, normals[0]!)
      const twist = Math.atan2(dot(endN, startB), dot(endN, normals[0]!))
      let s = 0
      const ringStart: number[] = []
      for (let j = 0; j <= n; j++) {
        const q = path[j % n]!, t = tangents[j % n]!
        const fix = -twist * (j / n)
        const nn = normals[j % n]!, bb = cross(t, nn)
        const cn = add(mul(nn, Math.cos(fix)), mul(bb, Math.sin(fix))), cb = cross(t, cn)
        if (j > 0) s += len(sub(q.p, path[(j - 1) % n]!.p))
        const bornAt = start + LASH_TIME * (done + s) / total
        ringStart.push(sheet.position.length / 3)
        for (let k = 0; k <= around; k++) {
          const ang = (k / around) * TAU
          const nrm = add(mul(cn, Math.cos(ang)), mul(cb, Math.sin(ang)))
          sheet.vertex(add(q.p, mul(nrm, ROPE_R)), nrm, (k / around) * TAU * ROPE_R, s, [0.92 + 0.16 * seed, 0, 0], seed)
          spine.push(q.p[0], q.p[1], q.p[2]); born.push(bornAt); serve.push(q.serve)
        }
      }
      for (let j = 0; j < n; j++) {
        const A = ringStart[j]!, B = ringStart[j + 1]!
        for (let k = 0; k < around; k++) sheet.index.push(A + k, B + k + 1, B + k, A + k, A + k + 1, B + k + 1)
      }
      done += lengths[ti]!
    })
  })
  sheet.extra = { aSpine: { size: 3, data: spine }, aBorn: { size: 1, data: born }, aServe: { size: 1, data: serve } }
  return sheet.geometry()
}

/** The bank, cut square at its edges as a model's ground is: the level banks and the channel on top, the section
 * through the earth on the four sides. UVs in metres. */
export function bankGeometry(): BufferGeometry {
  const sheet = new Sheet()
  const zero: V3 = [0, 0, 0]
  const X = BANK.halfX, Z0 = BANK.zMin, Z1 = BANK.zMax, h = 0.02
  // fine across the channel's sides, coarse on the level banks and the bed
  const xs: number[] = []
  for (let x = -X; x < X - 1e-6;) { xs.push(x); const ax = Math.abs(x); x += ax > 5 ? 0.3 : ax > 2.8 ? 0.08 : 0.25 }
  xs.push(X)
  const zs: number[] = []
  for (let z = Z0; z < Z1 - 1e-6; z += 0.25) zs.push(z)
  zs.push(Z1)
  const nx = xs.length - 1, nz = zs.length - 1
  const top = sheet.position.length / 3
  for (const z of zs) for (const x of xs) {
    const y = groundY(x, z)
    const n = norm([groundY(x - h, z) - groundY(x + h, z), 2 * h, groundY(x, z - h) - groundY(x, z + h)])
    sheet.vertex([x, y, z], n, x, z, zero, 0)
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = top + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1
    sheet.index.push(a, c, b, b, c, d)
  }
  const face = (points: V3[], n: V3, u: (p: V3) => number, flip: boolean): void => {
    const start = sheet.position.length / 3
    for (const p of points) {
      sheet.vertex(p, n, u(p), p[1], zero, 0)
      sheet.vertex([p[0], BANK.bottom, p[2]], n, u(p), BANK.bottom, zero, 0)
    }
    for (let i = 0; i + 1 < points.length; i++) {
      const a = start + 2 * i, b = a + 1, c = a + 2, d = a + 3
      if (flip) sheet.index.push(a, c, b, b, c, d); else sheet.index.push(a, b, c, b, d, c)
    }
  }
  face(xs.map(x => [x, groundY(x, Z1), Z1] as V3), [0, 0, 1], p => p[0], false)
  face(xs.map(x => [x, groundY(x, Z0), Z0] as V3), [0, 0, -1], p => p[0], true)
  face(zs.map(z => [X, groundY(X, z), z] as V3), [1, 0, 0], p => p[2], true)
  face(zs.map(z => [-X, groundY(-X, z), z] as V3), [-1, 0, 0], p => p[2], false)
  return sheet.geometry()
}

/** the stream's half width at its level: the level face is a plane of its own, for the mirror */
export const STREAM_HALF = 4.3

/** The stream's two cut faces where the bank is cut. */
export function waterGeometry(): BufferGeometry {
  const sheet = new Sheet()
  const zero: V3 = [0, 0, 0]
  const W = STREAM_HALF
  for (const side of [1, -1]) {
    const n = 120, first = sheet.position.length / 3, Z = side > 0 ? BANK.zMax : BANK.zMin
    for (let i = 0; i <= n; i++) {
      const x = -W + (2 * W * i) / n
      const floor = Math.min(BANK.water, groundY(x, Z))
      sheet.vertex([x, BANK.water, Z], [0, 0, side], x, BANK.water, zero, 0)
      sheet.vertex([x, floor, Z], [0, 0, side], x, floor, zero, 0)
    }
    for (let i = 0; i < n; i++) {
      const a = first + 2 * i, b = a + 1, c = a + 2, d = a + 3
      if (side > 0) sheet.index.push(a, b, c, b, d, c); else sheet.index.push(a, c, b, b, c, d)
    }
  }
  return sheet.geometry()
}
