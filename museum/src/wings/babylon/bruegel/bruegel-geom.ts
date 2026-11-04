/* BRUEGEL'S TOWER OF BABEL, the switch's third state on the map page (pure geometry, so node builds the same): a model
   after the Vienna painting (GG 1026, 1563), its forms read off by eye and drawn in code, never the painting's pixels.
   Round storeys with their arcades (Roman below, pointed above, in the material), the white facing whole on the lower
   three and only on the left and behind higher up, the red brick inside showing in the cutaway on the front right, the
   red core rising unfinished, one ramp per terrace and the rock the tower is built round. It stands on the real tower's
   centre at the scale the plan names (a design choice). Scene frame as plan.ts (x east, y up, z south). */

import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'
import type { P2 } from '../map/plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

/** what a face is, for the material: its stone or brick, an arcaded face or a plain one */
export const BK = { stone: 0, brick: 1, rock: 2, stoneTop: 3, brickTop: 4, stonePlain: 5, brickPlain: 6 } as const

export interface BruegelBody { id: string; geometry: BufferGeometry }
export interface BruegelFrame { x: number; z: number; c: number; s: number; base: number }
export interface Bruegel { bodies: BruegelBody[]; frame: BruegelFrame; facts: Record<string, unknown> }

const D2R = Math.PI / 180
/** degrees per segment round the axis: at 46 m a 2-degree chord sags 7 mm */
const SEG = 2

/** a smooth value noise in space, -1 to 1 (pure, so the page and node agree) */
function noise3(x: number, y: number, z: number): number {
  const h = (i: number, j: number, k: number): number => {
    const t = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453
    return (t - Math.floor(t)) * 2 - 1
  }
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z)
  const f = (t: number): number => t * t * (3 - 2 * t)
  const u = f(x - i), v = f(y - j), w = f(z - k)
  const l = (a: number, b: number, t: number): number => a + (b - a) * t
  return l(l(l(h(i, j, k), h(i + 1, j, k), u), l(h(i, j + 1, k), h(i + 1, j + 1, k), u), v),
    l(l(h(i, j, k + 1), h(i + 1, j, k + 1), u), l(h(i, j + 1, k + 1), h(i + 1, j + 1, k + 1), u), v), w)
}

/** a soup of triangles with the material's attributes: `bk` (what the face is), `bring` (its storey's foot and top over
    the tower's foot, its bays round the ring, its arch: 0 none, 1 round, 2 pointed) */
class Soup {
  pos: number[] = []
  nrm: number[] = []
  bk: number[] = []
  ring: number[] = []
  /** a triangle; its normals given per corner (a round face's, smooth round the axis) or else its own */
  tri(a: number[], b: number[], c: number[], k: number, r: number[], n?: number[][]): void {
    this.pos.push(...a, ...b, ...c)
    let ns = n
    if (!ns) {
      const u = b.map((x, i) => x - a[i]!), v = c.map((x, i) => x - a[i]!)
      const m = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
      const l = Math.hypot(...m) || 1
      ns = [0, 1, 2].map(() => m.map((x) => x / l))
    }
    for (let i = 0; i < 3; i++) { this.nrm.push(...ns[i]!); this.bk.push(k); this.ring.push(...r) }
  }
  quad(a: number[], b: number[], c: number[], d: number[], k: number, r: number[], n?: number[][]): void {
    this.tri(a, b, c, k, r, n && [n[0]!, n[1]!, n[2]!])
    this.tri(a, c, d, k, r, n && [n[0]!, n[2]!, n[3]!])
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('bk', new Float32BufferAttribute(this.bk, 1))
    g.setAttribute('bring', new Float32BufferAttribute(this.ring, 4))
    return g
  }
}

export function buildBruegel(f0: { x: number; z: number; c: number; s: number }, ground: (x: number, z: number) => number, bp: J): Bruegel {
  // its foot: the ground's mean round the base storey's circle
  let sum = 0, lo = Infinity
  for (let a = 0; a < 360; a += 5) {
    const [x, z] = sceneAt(f0, a, bp.storeys[0].r0)
    const g = ground(x, z)
    sum += g
    lo = Math.min(lo, g)
  }
  const base = sum / 72
  const f: BruegelFrame = { ...f0, base }
  const P = (phi: number, r: number, y: number): number[] => {
    const [x, z] = sceneAt(f, phi, r)
    return [x, base + y, z]
  }
  const NONE = [0, 0, 0, 0]
  const segs = (a0: number, a1: number): number[] => {
    const n = Math.max(1, Math.ceil((a1 - a0) / SEG))
    return Array.from({ length: n + 1 }, (_, i) => a0 + ((a1 - a0) * i) / n)
  }
  /** a cylinder's (or a cone's) face between two angles; out: facing away from the axis */
  const face = (s: Soup, ra: number, rb: number, ya: number, yb: number | ((phi: number) => number), a0: number, a1: number, k: number, ring: number[], out = true): void => {
    const as = segs(a0, a1)
    for (let i = 0; i + 1 < as.length; i++) {
      const p = as[i]!, q = as[i + 1]!
      const top = typeof yb === 'number' ? yb : yb((p + q) / 2)
      const t = (top - ya) / Math.max(1e-6, (typeof yb === 'number' ? yb : top) - ya)
      const rt = ra + (rb - ra) * Math.min(1, t)
      const a = P(p, ra, ya), b = P(q, ra, ya), c = P(q, rt, top), d = P(p, rt, top)
      // smooth round the axis: the radial direction at each edge, tilted by a cone's batter
      const nAt = (phi: number): number[] => {
        const [x, z] = sceneAt(f, phi, 1)
        const rx = x - f.x, rz = z - f.z, sgn = out ? 1 : -1, hgt = Math.max(1e-6, top - ya), tilt = (ra - rt) / hgt
        const l = Math.hypot(rx, tilt, rz)
        return [(sgn * rx) / l, (sgn * tilt) / l, (sgn * rz) / l]
      }
      const np = nAt(p), nq = nAt(q)
      // angles grow to the viewer's right: seen from outside, p to q runs left to right
      if (out) s.quad(a, b, c, d, k, ring, [np, nq, nq, np])
      else s.quad(b, a, d, c, k, ring, [nq, np, np, nq])
    }
  }
  /** a flat ring between two radii at one height, facing up (or down) */
  const annulus = (s: Soup, ri: number, ro: number, y: number | ((phi: number) => number), a0: number, a1: number, k: number, up = true): void => {
    const as = segs(a0, a1)
    for (let i = 0; i + 1 < as.length; i++) {
      const p = as[i]!, q = as[i + 1]!
      const h = typeof y === 'number' ? y : y((p + q) / 2)
      const a = P(p, ri, h), b = P(q, ri, h), c = P(q, ro, h), d = P(p, ro, h)
      if (ri <= 1e-6) { if (up) s.tri(a, d, c, k, NONE); else s.tri(a, c, d, k, NONE); continue }
      if (up) s.quad(a, d, c, b, k, NONE)
      else s.quad(a, b, c, d, k, NONE)
    }
  }
  /** a radial end face at one angle; toward: +1 faces growing angles, -1 shrinking */
  const cap = (s: Soup, ri: number, ro: number, ya: number, yb: number, a: number, toward: 1 | -1, k: number): void => {
    const v = [P(a, ri, ya), P(a, ro, ya), P(a, ro, yb), P(a, ri, yb)] as [number[], number[], number[], number[]]
    if (toward > 0) s.quad(v[0], v[3], v[2], v[1], k, NONE)
    else s.quad(v[0], v[1], v[2], v[3], k, NONE)
  }
  /** a broken top: whole in its middle, falling in steps toward the ends where the masonry stops */
  const broken = (y0: number, y1: number, a0: number, a1: number, seed: number) => (phi: number): number => {
    const e = Math.min(phi - a0, a1 - phi)
    if (e > 26) return y1
    const k = 1 - e / 26
    // never below a course or two over its storey's foot
    // whole courses of 0.3 m, so the steps' risers are never slivers
    const drop = Math.pow(k, 1.4) * 9 + Math.max(0, noise3(phi * 0.12, seed * 1.3, 0.5)) * 1.2 * k
    return Math.max(y0 + 0.9, y1 - Math.round(drop / 0.3) * 0.3)
  }
  const C = bp.cornice
  const bodies: BruegelBody[] = []
  const S = bp.storeys as J[]
  /* ── the storeys ── */
  S.forEach((st, n) => {
    const s = new Soup()
    const arch = st.arch === 'pointed' ? 2 : 1
    const ring = [st.y0, st.y1, st.bays, arch]
    const whole = st.white.length === 1 && st.white[0][0] === -180 && st.white[0][1] === 180
    if (whole) {
      // solid: its face (the foot's a little into the ground), the cornice, the terrace on top reaching to the axis
      const y0 = n === 0 ? st.y0 - (base - lo) - 0.6 : st.y0
      face(s, st.r0 + (n === 0 ? ((st.r0 - st.r1) * (st.y0 - y0)) / (st.y1 - st.y0) : 0), st.r1, y0, st.y1 - C.h, -180, 180, BK.stone, ring)
      face(s, st.r1 + C.out, st.r1 + C.out, st.y1 - C.h, st.y1, -180, 180, BK.stonePlain, NONE)
      annulus(s, st.r1, st.r1 + C.out, st.y1 - C.h, -180, 180, BK.stonePlain, false)
      annulus(s, 0, st.r1 + C.out, st.y1, -180, 180, BK.stoneTop)
      bodies.push({ id: `bruegel-storey-${n + 1}`, geometry: s.geometry() })
      return
    }
    // a shell, only where its facing (or its bare brick) stands; its top broken where the plan says so
    const shell = (s2: Soup, a0: number, a1: number, k: number, kp: number, kt: number, seed: number): void => {
      const ri = st.r1 - bp.wall
      if (!st.broken) {
        face(s2, st.r1, st.r1, st.y0, st.y1 - C.h, a0, a1, k, ring)
        face(s2, st.r1 + C.out, st.r1 + C.out, st.y1 - C.h, st.y1, a0, a1, kp, NONE)
        annulus(s2, st.r1, st.r1 + C.out, st.y1 - C.h, a0, a1, kp, false)
        face(s2, ri, ri, st.y0, st.y1, a0, a1, kp, NONE, false)
        annulus(s2, ri, st.r1 + C.out, st.y1, a0, a1, kt)
        for (const [a, t] of [[a0, -1], [a1, 1]] as Array<[number, 1 | -1]>) {
          cap(s2, ri, st.r1, st.y0, st.y1, a, t, kp)
          cap(s2, st.r1, st.r1 + C.out, st.y1 - C.h, st.y1, a, t, kp)
        }
        return
      }
      // a broken top keeps no cornice: it falls in steps toward its ends, a riser between each step
      const top = broken(st.y0, st.y1, a0, a1, seed)
      face(s2, st.r1, st.r1, st.y0, top, a0, a1, k, ring)
      face(s2, ri, ri, st.y0, top, a0, a1, kp, NONE, false)
      annulus(s2, ri, st.r1, top, a0, a1, kt)
      cap(s2, ri, st.r1, st.y0, top(a0 + 0.5), a0, -1, kp)
      cap(s2, ri, st.r1, st.y0, top(a1 - 0.5), a1, 1, kp)
      const as = segs(a0, a1)
      for (let i = 1; i + 1 < as.length; i++) {
        const yl = top((as[i - 1]! + as[i]!) / 2), yr = top((as[i]! + as[i + 1]!) / 2)
        if (Math.abs(yl - yr) < 1e-3) continue
        cap(s2, ri, st.r1, Math.min(yl, yr), Math.max(yl, yr), as[i]!, yl < yr ? -1 : 1, kp)
      }
    }
    st.white.forEach(([a0, a1]: number[], i: number) => shell(s, a0!, a1!, BK.stone, BK.stonePlain, BK.stoneTop, n * 10 + i))
    ;(st.brick ?? []).forEach(([a0, a1]: number[], i: number) => shell(s, a0!, a1!, BK.brick, BK.brickPlain, BK.brickTop, n * 10 + 5 + i))
    bodies.push({ id: `bruegel-storey-${n + 1}`, geometry: s.geometry() })
  })
  /* ── the red brick inside: rows of vaulted cells stepping back toward the core, radial walls between them ── */
  {
    const s = new Soup()
    const cells = bp.cells as Array<{ r: number; y1: number }>
    let y0 = S[2].y1
    for (const c of cells) {
      face(s, c.r, c.r, y0, c.y1, -180, 180, BK.brick, [y0, c.y1, Math.round(360 / bp.cellsFins.every), 1])
      annulus(s, 0, c.r, c.y1, -180, 180, BK.brickTop)
      const fin = bp.cellsFins
      for (let a = fin.from; a <= fin.to + 1e-6; a += fin.every) {
        const w = (0.4 / c.r) / D2R
        const ro = c.r + fin.out
        face(s, ro, ro, y0, c.y1, a - w, a + w, BK.brickPlain, NONE)
        cap(s, c.r, ro, y0, c.y1, a - w, -1, BK.brickPlain)
        cap(s, c.r, ro, y0, c.y1, a + w, 1, BK.brickPlain)
        annulus(s, c.r, ro, c.y1, a - w, a + w, BK.brickTop)
      }
      y0 = c.y1
    }
    bodies.push({ id: 'bruegel-cells', geometry: s.geometry() })
  }
  /* ── the red core, its top ring unfinished ── */
  {
    const s = new Soup()
    for (const c of bp.core as J[]) {
      const ring = [c.y0, c.y1, c.bays, 1]
      if (c.broken) {
        const top = (phi: number): number => c.y1 - Math.round(Math.max(0, noise3(phi * 0.06, 9.1, 0.3) * 2.6 + noise3(phi * 0.21, 2.2, 0.7) * 0.9) / 0.3) * 0.3
        face(s, c.r, c.r, c.y0, top, -180, 180, BK.brick, ring)
        annulus(s, 0, c.r, top, -180, 180, BK.brickTop)
        const as = segs(-180, 180)
        for (let i = 1; i + 1 < as.length; i++) {
          const yl = top((as[i - 1]! + as[i]!) / 2), yr = top((as[i]! + as[i + 1]!) / 2)
          if (Math.abs(yl - yr) < 1e-3) continue
          cap(s, 0, c.r, Math.min(yl, yr), Math.max(yl, yr), as[i]!, yl < yr ? -1 : 1, BK.brickPlain)
        }
      } else {
        face(s, c.r, c.r, c.y0, c.y1 - C.h, -180, 180, BK.brick, ring)
        face(s, c.r + C.out, c.r + C.out, c.y1 - C.h, c.y1, -180, 180, BK.brickPlain, NONE)
        annulus(s, c.r, c.r + C.out, c.y1 - C.h, -180, 180, BK.brickPlain, false)
        annulus(s, 0, c.r + C.out, c.y1, -180, 180, BK.brickTop)
      }
    }
    bodies.push({ id: 'bruegel-core', geometry: s.geometry() })
  }
  /* ── the outer ramp: on a terrace, along the next storey's face, rising one storey from right to left ── */
  {
    const s = new Soup()
    for (const rp of bp.ramp as J[]) {
      const lowSt = S[rp.on - 1], upSt = S[rp.on]
      const ri = upSt.r1, ro = lowSt.r1 + C.out - 0.25
      const ya = lowSt.y1, yb = upSt.y1
      // its rise: level at its foot (to the right), a full storey at its head (to the left)
      const at = (phi: number): number => ya + ((yb - ya) * (rp.to - phi)) / (rp.to - rp.from)
      annulus(s, ri, ro, at, rp.from, rp.to, BK.stoneTop)
      face(s, ro, ro, ya, at, rp.from, rp.to, BK.stonePlain, NONE)
      cap(s, ri, ro, ya, yb, rp.from, -1, BK.stonePlain)
    }
    bodies.push({ id: 'bruegel-ramp', geometry: s.geometry() })
  }
  /* ── the rock the tower is built round: a sheet over each patch of the face where the painting shows it bare, standing
     proud of the masonry in its middle and sinking behind it at its ragged edges, broken in planes and clefts ── */
  {
    const wallAt = (y: number): number => {
      for (const st of S) if (y < st.y1) return st.r0 + ((st.r1 - st.r0) * Math.max(0, y - st.y0)) / (st.y1 - st.y0)
      return S[S.length - 1].r1
    }
    const envAt = (y: number): number => {
      let sum = 0
      for (let d = -3; d <= 3; d++) sum += wallAt(y + d)
      return sum / 7
    }
    const pos: number[] = []
    for (const rk of bp.rocks as J[]) {
      const [a0, a1] = rk.phi as [number, number], [y0, y1] = rk.y as [number, number]
      const rMid = envAt((y0 + y1) / 2)
      // a coarse step, so the rock breaks in broad planes as the painter drew it
      const nPhi = Math.max(4, Math.ceil(((a1 - a0) * D2R * rMid) / 1.6)), nY = Math.max(4, Math.ceil((y1 - y0) / 1.6))
      const at = (i: number, j: number): number[] => {
        // the grid's inner points shaken, so no row or diagonal of facets lines up
        const inner = i > 0 && i < nPhi && j > 0 && j < nY ? 0.42 : 0
        const ji = i + inner * noise3(i * 1.31, j * 0.77, rk.seed + 21), jj = j + inner * noise3(i * 0.83, j * 1.29, rk.seed + 23)
        // a crag standing free in the cutaway rises as a mound: its sides come down to its foot, behind the red cells
        const phi = a0 + ((a1 - a0) * ji) / nPhi, w = (2 * (phi - a0)) / (a1 - a0) - 1
        const y = y0 + (rk.mound ? 1 - 0.75 * w * w : 1) * ((y1 - y0) * jj) / nY
        const arc = phi * D2R * rMid
        // its edges ragged; a patch that starts under the ground or stands on a terrace keeps its full bulge there
        const ragged = noise3(arc * 0.18, y * 0.18, rk.seed * 3.1) * 0.12
        // its top broken into crags and spires
        const spires = (1 - j / nY) - Math.abs(noise3(arc * 0.22, rk.seed * 1.9, 0.4)) * 0.3
        const e = Math.min(i / nPhi, 1 - i / nPhi, y0 < 0 || rk.stands ? 1 : j / nY, spires) + ragged
        const m = Math.pow(Math.min(1, Math.max(0, e / 0.32)), 0.7)
        const lumps = noise3(arc * 0.1, y * 0.07, rk.seed) * 1.5 + noise3(arc * 0.3, y * 0.25, rk.seed + 7) * 0.5
        const cleft = -Math.pow(1 - Math.abs(noise3(arc * 0.32, y * 0.04, rk.seed + 3)), 5) * 1.8
        const bed = y + arc * 0.12 + noise3(arc * 0.05, y * 0.05, rk.seed + 11) * 2
        const strata = Math.pow(bed / 3.1 - Math.floor(bed / 3.1), 4) * 0.25
        const back = rk.back ?? wallAt(y) - 0.8
        const r = back + (envAt(y) + rk.out + lumps + cleft + strata - back) * m
        return P(phi, r, y)
      }
      for (let j = 0; j < nY; j++) for (let i = 0; i < nPhi; i++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
        // seen from outside, growing angles run to the right and y up: a, b, c, d wind counter-clockwise; the
        // diagonal flips from cell to cell by a hash, so the facets never hatch in one direction
        if (noise3(i * 2.71 + 0.5, j * 3.13 + 0.5, rk.seed) > 0) pos.push(...a, ...b, ...c, ...a, ...c, ...d)
        else pos.push(...a, ...b, ...d, ...b, ...c, ...d)
      }
    }
    const g = new BufferGeometry()
    const n = pos.length / 3
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    g.setAttribute('bk', new Float32BufferAttribute(new Float32Array(n).fill(BK.rock), 1))
    g.setAttribute('bring', new Float32BufferAttribute(new Float32Array(n * 4), 4))
    bodies.push({ id: 'bruegel-rock', geometry: g })
  }
  const top = Math.max(...(bp.core as J[]).map((c) => c.y1))
  return {
    bodies, frame: f,
    facts: { foot: +base.toFixed(2), footLow: +lo.toFixed(2), baseDiameter: 2 * S[0].r0, height: top, storeys: S.length, core: (bp.core as J[]).length, scale: bp.scale.mPerPx },
  }
}

/** a point round the tower's axis: angle 0 toward the stairs (+u), growing to the right of one who faces the tower from there */
export function sceneAt(f: { x: number; z: number; c: number; s: number }, phiDeg: number, r: number): P2 {
  const u = r * Math.cos(phiDeg * D2R), v = -r * Math.sin(phiDeg * D2R)
  return [f.x + u * f.c + v * f.s, f.z - u * f.s + v * f.c]
}
