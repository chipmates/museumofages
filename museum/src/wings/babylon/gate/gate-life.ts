/* LIFE WITHOUT BODIES, pure: date palms beyond the walls and a few birds over the forecourt, built in code with
   vertex colours. Every one is a guess (class G); their places are in gate-plan.json `life`. No DOM, no renderer.

   The date palm (palm-date-babylon) comes in three presets by the distance it is seen from: near (within about 60 m:
   the leaf bases' relief on the trunk, every leaflet), mid (150 to 400 m: the leaflets in teeth along the rib) and far
   (the plain's groves from the air, instanced: a folded blade per frond). Sizes after the Flora of Pakistan (fronds up
   to 5.1 m, leaflets 20 to 40 by 2 to 2.5 cm, spines at the frond's foot); the season, mid-April, after FAO's date palm
   manual (flowering February to April, harvest September and October): open inflorescences, never ripe dates. */
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'

type V3 = [number, number, number]
export interface PalmSpec { x: number; z: number; h: number; lean: [number, number]; turn: number }
export interface BirdSpec { x: number; y: number; z: number; span: number; yaw: number; beat: number }

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const mixV = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (e0: number, e1: number, v: number): number => { const t = clamp01((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t) }
const rnd = (seed: number): (() => number) => {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}
const hash2 = (a: number, b: number): number => { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h) }

class Mesh {
  pos: number[] = []
  col: number[] = []
  nor: number[] = []
  leaf: number[] = []
  /** 1 while fronds and bunches are laid, 0 for the trunk: the garden's material shades foliage by it */
  leafy = 0
  /** a triangle; without normals it takes its face's, as three's computeVertexNormals gives a soup */
  tri(a: V3, b: V3, c: V3, ca: V3, cb: V3 = ca, cc: V3 = ca, n?: [V3, V3, V3]): void {
    this.pos.push(...a, ...b, ...c)
    this.col.push(...ca, ...cb, ...cc)
    this.leaf.push(this.leafy, this.leafy, this.leafy)
    if (n) for (const q of n) this.nor.push(...q)
    else { const f = norm(cross(sub(b, a), sub(c, a))); this.nor.push(...f, ...f, ...f) }
  }
  quad(a: V3, b: V3, c: V3, d: V3, ca: V3, cb: V3 = ca, n?: [V3, V3, V3, V3]): void {
    this.tri(a, b, c, ca, ca, cb, n ? [n[0], n[1], n[2]] : undefined)
    this.tri(a, c, d, ca, cb, cb, n ? [n[0], n[2], n[3]] : undefined)
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3))
    if (this.leaf.some((v) => v > 0)) g.setAttribute('leaf', new Float32BufferAttribute(this.leaf, 1))
    return g
  }
}

/* linear albedos, ours, read against the Hilla grove photographs: the leaflets a glaucous grey-green, the rib paler and
   yellower, the old fronds yellowing, the dead ones straw grey; the leaf bases grey-brown with dark fibre between */
const LEAF_YOUNG: V3 = [0.078, 0.108, 0.062], LEAF: V3 = [0.056, 0.079, 0.05], LEAF_OLD: V3 = [0.1, 0.095, 0.05]
const DEAD: V3 = [0.25, 0.19, 0.12], RIB: V3 = [0.15, 0.14, 0.075], SPINE: V3 = [0.2, 0.18, 0.1]
const BOOT: V3 = [0.125, 0.097, 0.073], BOOT_CUT: V3 = [0.2, 0.165, 0.12], FIBRE: V3 = [0.045, 0.036, 0.027]
const TRUNK_FAR: V3 = [0.085, 0.068, 0.05], SCAR_FAR: V3 = [0.06, 0.048, 0.036]
/* mid-April: the female strands yellowish green, the male flowers waxy white, the split spathe brown (FAO's manual) */
const STALK: V3 = [0.32, 0.22, 0.07], STRAND: V3 = [0.2, 0.2, 0.08], SPATHE: V3 = [0.2, 0.13, 0.07]

/** how finely a palm is built: rings and sides of the trunk, fronds, segments along a rib; leaflets each side of a rib
    (0 a folded blade, a few: teeth of leaflets, many: one leaflet each); the leaf bases' relief; the season's bunches */
export interface PalmDetail { seg: number; sides: number; fronds: number; steps: number; leaflets?: number; boots?: boolean; bunches?: number; young?: boolean }
/** within about 60 m of an eye: the gate's street palms */
export const PALM_NEAR: PalmDetail = { seg: 240, sides: 27, fronds: 60, steps: 12, leaflets: 64, boots: true, bunches: 3 }
/** 150 to 400 m: the garden's palms on the map page */
export const PALM_MID: PalmDetail = { seg: 8, sides: 6, fronds: 26, steps: 6, leaflets: 9, bunches: 2 }
/** the plain's groves seen from the air, instanced by the ten thousand */
export const PALM_FAR: PalmDetail = { seg: 2, sides: 5, fronds: 16, steps: 3, leaflets: 0 }
/** a young palm or an offshoot in a grove (bab.green.palm.young): a fan of fronds from the ground on a stub of trunk,
    no dead fronds hanging, no flowers yet; the far and the mid preset's leaflets */
export const PALM_YOUNG_FAR: PalmDetail = { seg: 1, sides: 5, fronds: 14, steps: 3, leaflets: 0, young: true }
export const PALM_YOUNG_MID: PalmDetail = { seg: 2, sides: 6, fronds: 18, steps: 5, leaflets: 8, young: true }
/** the young palm's height to the crown, metres, before an instance's scale */
export const YOUNG_H = 0.7

/** the trunk's radius without the leaf bases: a column, a flared foot, a collar of old bases under the crown */
const trunkR = (t: number, near: boolean): number => (near ? 0.2 : 0.23 - 0.03 * t) * (1 + 0.32 * Math.pow(1 - t, 9)) + (near ? 0.1 : 0.06) * smooth(0.9, 1, t)

/** the leaf bases as a staggered lattice of diamonds over (round, up): `q` 1 at a base's middle and 0 in the groove of
    fibre, `s` from its lower tip (-1) to its cut top (1), `id` a number per base */
function bootAt(u: number, v: number): { q: number; s: number; id: number } {
  let best = { q: -1, s: 0, id: 0 }
  for (const r of [Math.floor(v), Math.floor(v) + 1]) {
    const off = (r & 1) * 0.5
    const uc = Math.round(u - off) + off
    const d = Math.abs(u - uc) / 0.5 + Math.abs(v - r)
    const q = 1 - d
    if (q > best.q) best = { q, s: v - r, id: Math.round(uc * 2) * 7919 + r }
  }
  return best
}

/** the near trunk: rings of the lattice's relief, fine over the top where the bases stand clear above any wall, coarse
    below; its vertex count is the preset's, whatever the height, so a list of palms splits evenly per palm */
function trunkNear(m: Mesh, spine: (t: number) => V3, H: number, d: PalmDetail, r: () => number): void {
  const S = d.sides, NB = 9, ROW = 0.09
  const fine = Math.round(d.seg * 0.82), coarse = d.seg - fine
  const split = Math.max(0.3, 1 - 7.5 / H)
  const ts: number[] = []
  for (let i = 0; i <= coarse; i++) ts.push((split * i) / coarse)
  for (let i = 1; i <= fine; i++) ts.push(split + ((1 - split) * i) / fine)
  const twist = 0.03 + r() * 0.03
  const ring = ts.map((t) => {
    const c = spine(t), y = H * t
    const R = trunkR(t, true)
    // the bases weather back toward the foot: deep and clean under the crown, shallow and grey low down
    const depth = 0.055 * (0.35 + 0.65 * smooth(0.25, 0.75, t))
    return Array.from({ length: S + 1 }, (_, k) => {
      const a = ((k % S) / S) * Math.PI * 2
      const b = bootAt((k / S) * NB + y * twist, y / ROW)
      const q = clamp01(b.q)
      const lift = smooth(0.0, 0.35, q) * (0.5 + 0.5 * clamp01((b.s + 0.4) / 1.2))
      const rr = R + depth * lift
      const tone = 0.85 + hash2(b.id, 3.1) * 0.3
      let col = mixV(FIBRE, scale(BOOT, tone), smooth(0.05, 0.3, q))
      if (b.s > 0.45 && q > 0.25) col = mixV(col, scale(BOOT_CUT, tone), smooth(0.45, 0.85, b.s) * 0.8)
      col = mixV(col, scale(BOOT, 0.8), (1 - smooth(0.2, 0.6, t)) * 0.5)
      return { p: [c[0] + Math.cos(a) * rr, c[1], c[2] + Math.sin(a) * rr] as V3, n: [Math.cos(a), 0, Math.sin(a)] as V3, col }
    })
  })
  for (let i = 0; i + 1 < ring.length; i++) {
    for (let k = 0; k < S; k++) {
      const a = ring[i]![k]!, b = ring[i]![k + 1]!, c = ring[i + 1]![k + 1]!, e = ring[i + 1]![k]!
      m.tri(a.p, e.p, c.p, a.col, e.col, c.col, [a.n, e.n, c.n])
      m.tri(a.p, c.p, b.p, a.col, c.col, b.col, [a.n, c.n, b.n])
    }
  }
}

/** the mid and far trunk: a tapered tube banded light and dark where the old bases ring it */
function trunkPlain(m: Mesh, spine: (t: number) => V3, d: PalmDetail, far: boolean): void {
  const SEG = d.seg, S = d.sides
  for (let i = 0; i < SEG; i++) {
    const t0 = i / SEG, t1 = (i + 1) / SEG
    const r0 = trunkR(t0, false), r1 = trunkR(t1, false)
    const c0 = spine(t0), c1 = spine(t1)
    const col = far ? (i % 2 === 0 ? TRUNK_FAR : SCAR_FAR) : i % 2 === 0 ? scale(BOOT, 0.8) : scale(FIBRE, 1.6)
    for (let k = 0; k < S; k++) {
      const a0 = (k / S) * Math.PI * 2, a1 = ((k + 1) / S) * Math.PI * 2
      const P = (c: V3, rr: number, a: number): V3 => [c[0] + Math.cos(a) * rr, c[1], c[2] + Math.sin(a) * rr]
      const n0: V3 = [Math.cos(a0), 0, Math.sin(a0)], n1: V3 = [Math.cos(a1), 0, Math.sin(a1)]
      m.quad(P(c0, r0, a0), P(c0, r0, a1), P(c1, r1, a1), P(c1, r1, a0), col, col, [n0, n1, n1, n0])
    }
  }
}

/** a frond's rib as a curve: out along its direction, sinking with the square of the distance */
interface Rib { at: (t: number) => V3; tan: (t: number) => V3; side: (t: number) => V3; up: (t: number) => V3 }
function rib(o: V3, dir: V3, L: number, droop: number, az: number): Rib {
  const at = (t: number): V3 => add(add(o, dir, L * t), [0, -1, 0], droop * L * t * t)
  const tan = (t: number): V3 => norm(add(scale(dir, L), [0, -1, 0], 2 * droop * L * t))
  const side = (t: number): V3 => {
    const s = cross(tan(t), [0, 1, 0])
    return Math.hypot(...s) > 1e-3 ? norm(s) : [Math.sin(az), 0, -Math.cos(az)]
  }
  const up = (t: number): V3 => norm(cross(side(t), tan(t)))
  return { at, tan, side, up }
}

/** a face's three normals: its own, turned to the outside of the crown, and leant toward the crown's own outward */
function outward(a: V3, b: V3, c: V3, crown: V3, lean: number): { tri: [V3, V3, V3]; n: [V3, V3, V3] } {
  let f = norm(cross(sub(b, a), sub(c, a)))
  const mid = scale(add(add(a, b), c), 1 / 3)
  const out = norm(sub(mid, crown))
  let tri: [V3, V3, V3] = [a, b, c]
  if (dot(f, out) < 0) { f = scale(f, -1); tri = [a, c, b] }
  const n = norm(add(scale(f, 1 - lean), out, lean))
  return { tri, n: [n, n, n] }
}

/** one date palm: the trunk, a crown of fronds whose oldest hang browner below, and in mid-April a few open bunches */
function palm(m: Mesh, p: PalmSpec, base: number, seed: number, d: PalmDetail = PALM_NEAR): void {
  const r = rnd(seed)
  const H = p.h
  const near = !!d.boots, far = !d.leaflets
  // the lean grows toward the top, as a palm leans out of a wall's shade
  const spine = (t: number): V3 => [p.x + p.lean[0] * t * t, base + H * t, p.z + p.lean[1] * t * t]
  m.leafy = 0
  if (near) trunkNear(m, spine, H, d, r)
  else trunkPlain(m, spine, d, far)
  m.leafy = 1
  const top = spine(1)
  const crown: V3 = add(top, [0, -0.4, 0])
  const N = d.fronds
  const jig = (): number => 0.9 + r() * 0.2
  for (let f = 0; f < N; f++) {
    // the youngest stand up in the middle, the oldest droop, the last few are dead and hang along the trunk
    const age = (f + 0.5) / N
    const dead = !d.young && age > 0.92
    const az = p.turn + f * 2.39996 + (r() - 0.5) * 0.5
    // a young palm's fan: the oldest fronds spread low but stay off the ground
    const el = dead ? -1.2 + (r() - 0.5) * 0.25 : d.young ? 1.4 - 1.15 * Math.pow(age, 1.1) + (r() - 0.5) * 0.3 : 1.3 - 1.85 * Math.pow(age, 1.15) + (r() - 0.5) * 0.3
    const L = (d.young ? 2.1 + r() * 1.1 : (3.3 + r() * 1.2) * (f < 2 ? 0.7 : 1)) * (dead ? 0.85 : 1)
    const droop = dead ? 0.06 : (d.young ? 0.08 + 0.3 * age * age : 0.14 + 0.62 * age * age) + r() * 0.08
    const dir: V3 = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)]
    // older fronds rise from lower on the collar
    const o: V3 = d.young ? add(add(top, [0, -0.05 - 0.3 * age, 0]), [Math.cos(az), 0, Math.sin(az)], 0.06 + 0.06 * age) : add(add(top, [0, -0.15 - 0.85 * age, 0]), [Math.cos(az), 0, Math.sin(az)], 0.12 + 0.1 * age)
    const R = rib(o, dir, L, droop, az)
    const tone = jig()
    const leafCol = scale(dead ? DEAD : age > 0.78 ? mixV(LEAF, LEAF_OLD, smooth(0.78, 0.92, age)) : mixV(LEAF_YOUNG, LEAF, smooth(0.1, 0.45, age)), tone)
    if (far) {
      // a folded blade: the leaflets' span either side of the rib, a shallow V
      const S = d.steps
      let prev: { c: V3; l: V3; rr: V3 } | null = null
      for (let i = 0; i <= S; i++) {
        const t = i / S
        const c = R.at(t), sd = R.side(t)
        const w = 0.72 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.08)), 0.6) + 0.12
        const l = add(add(c, sd, w), R.up(t), -w * 0.3), rr = add(add(c, sd, -w), R.up(t), -w * 0.3)
        if (prev) {
          for (const [a, b, cc] of [[prev.c, c, l], [prev.c, l, prev.l], [prev.rr, rr, c], [prev.rr, c, prev.c]] as Array<[V3, V3, V3]>) {
            const q = outward(a, b, cc, crown, 0.45)
            m.tri(q.tri[0], q.tri[1], q.tri[2], leafCol, leafCol, leafCol, q.n)
          }
        }
        prev = { c, l, rr }
      }
      continue
    }
    const n = d.leaflets!
    if (near) {
      // the rib: a narrow strip, wide at the stalk
      const S = d.steps
      for (let i = 0; i < S; i++) {
        const t0 = i / S, t1 = (i + 1) / S
        const w0 = 0.035 * (1 - t0) + 0.008, w1 = 0.035 * (1 - t1) + 0.008
        const a = add(R.at(t0), R.side(t0), w0), b = add(R.at(t1), R.side(t1), w1), c = add(R.at(t1), R.side(t1), -w1), e = add(R.at(t0), R.side(t0), -w0)
        const ribCol = scale(dead ? DEAD : RIB, tone)
        for (const [x, y, z] of [[a, b, c], [a, c, e]] as Array<[V3, V3, V3]>) {
          const q = outward(x, y, z, crown, 0.2)
          m.tri(q.tri[0], q.tri[1], q.tri[2], ribCol, ribCol, ribCol, q.n)
        }
      }
      // the spines on the stalk: leaflets turned to thorns
      for (let j = 0; j < 7; j++) {
        const t = 0.05 + 0.11 * (j / 6)
        for (const s of [1, -1]) {
          const c = R.at(t), T = R.tan(t), Sd = R.side(t), U = R.up(t)
          const D = norm(add(add(scale(Sd, s), T, 0.9), U, 0.5))
          const len = 0.09 + 0.06 * (j / 6)
          const b0 = add(c, T, -0.008), b1 = add(c, T, 0.008)
          const q = outward(b0, b1, add(c, D, len), crown, 0.2)
          m.tri(q.tri[0], q.tri[1], q.tri[2], scale(dead ? DEAD : SPINE, tone), scale(dead ? DEAD : SPINE, tone), scale(dead ? DEAD : SPINE, tone), q.n)
        }
      }
    }
    // the leaflets in many planes: each side alternates one raised, one near the rib's plane, so the frond reads as a V
    for (let j = 0; j < n; j++) {
      const t = 0.17 + (0.81 * (j + 0.5)) / n
      const span = Math.pow(Math.sin(Math.PI * clamp01((t - 0.12) / 0.9)), 0.6)
      const len = (near ? 0.16 + 0.3 * span : 0.2 + 0.24 * span) * (L / 4)
      for (const s of [1, -1]) {
        const c = R.at(t), T = R.tan(t), Sd = R.side(t), U = R.up(t)
        const raised = (j + (s > 0 ? 0 : 1)) % 2 === 0
        const alpha = dead ? -0.9 - r() * 0.3 : (raised ? 0.62 : 0.06) + (r() - 0.5) * 0.18
        const beta = 0.72 + (r() - 0.5) * 0.15
        const D1 = norm(add(scale(Sd, s * Math.cos(beta)), T, Math.sin(beta)))
        const D = norm(add(scale(D1, Math.cos(alpha)), U, Math.sin(alpha)))
        const col = scale(leafCol, 0.9 + r() * 0.2)
        if (near) {
          // one leaflet: a narrow kite bent where it is widest, its tip falling a little
          const W = norm(sub(T, scale(D, dot(T, D))))
          // a leaflet 2 to 2.5 cm wide (the flora); drawn 3 cm, as half the flora's count of leaflets is drawn
          const w = 0.015
          const base = add(c, Sd, s * 0.012)
          const mid = add(base, D, len * 0.4)
          const tip = add(add(base, D, len), [0, -1, 0], len * (0.06 + 0.1 * age))
          for (const [x, y, z] of [[base, add(mid, W, w), add(mid, W, -w)], [add(mid, W, w), tip, add(mid, W, -w)]] as Array<[V3, V3, V3]>) {
            const q = outward(x, y, z, crown, 0.25)
            m.tri(q.tri[0], q.tri[1], q.tri[2], col, col, col, q.n)
          }
        } else {
          // a tooth: the leaflets of a stretch of rib as one blade, its foot along the rib so the teeth make the rib
          // the teeth meet along the rib: with gaps between them a frond reads as a string of beads from 300 m
          const half = (0.81 * L) / n * 1.02
          const f0 = add(c, T, -half), f1 = add(c, T, half)
          const tip = add(add(c, D, len), [0, -1, 0], len * (0.08 + 0.12 * age))
          const q = outward(f0, f1, tip, crown, 0.4)
          m.tri(q.tri[0], q.tri[1], q.tri[2], col, col, col, q.n)
        }
      }
    }
  }
  // mid-April: inflorescences open among the leaf bases, a split spathe beside each, strands of small flowers or set fruit
  const nb = d.bunches ?? 0
  const male = r() < 0.15
  for (let b = 0; b < nb; b++) {
    const az = p.turn + 0.9 + b * 2.1 + (r() - 0.5) * 0.4
    const out: V3 = [Math.cos(az), 0, Math.sin(az)]
    const o = add(add(top, [0, -0.55 - r() * 0.3, 0]), out, 0.22)
    const stalkDir = norm(add(out, [0, 0.55 + r() * 0.3, 0]))
    const sl = near ? 0.55 + r() * 0.25 : 0.7
    const end = add(o, stalkDir, sl)
    const side = norm(cross(stalkDir, [0, 1, 0]))
    const sw = near ? 0.025 : 0.09
    const stalkCol = male ? scale(STRAND, 1.6) : STALK
    m.quad(add(o, side, sw), add(end, side, sw * 0.7), add(end, side, -sw * 0.7), add(o, side, -sw), stalkCol)
    // the spathe split open along the stalk
    const sp = add(o, side, near ? 0.09 : 0.15)
    m.tri(sp, add(add(sp, stalkDir, sl * 0.95), side, 0.05), add(sp, stalkDir, sl * 0.7), SPATHE)
    // the strands: a fan out of the stalk's end, drooping
    const ns = near ? 9 : 3
    for (let k = 0; k < ns; k++) {
      const a = (k / ns - 0.5) * 1.6
      const sDir = norm(add(add(stalkDir, side, Math.sin(a) * 0.9), [0, -1, 0], 0.35 + r() * 0.3))
      const len = near ? 0.35 + r() * 0.2 : 0.6
      const w = near ? 0.018 : 0.12
      const tipS = add(end, sDir, len)
      const col = male ? [0.42, 0.4, 0.33] as V3 : scale(STRAND, 0.9 + r() * 0.2)
      m.quad(add(end, side, w), add(tipS, side, w * 0.8), add(tipS, side, -w * 0.8), add(end, side, -w), col)
    }
  }
  m.leafy = 0
}

/** one palm at the origin, its foot at 0, built at a preset (the plain's instanced groves take PALM_FAR, 12 m to the crown) */
export function palmGeometry(h: number, detail: PalmDetail, seed = 17): BufferGeometry {
  const m = new Mesh()
  palm(m, { x: 0, z: 0, h, lean: [0, 0], turn: 0 }, -0.3, seed, detail)
  return m.geometry()
}

/** the gate's palms where they stand, at the near preset */
export function palmsGeometry(list: PalmSpec[], level: (z: number) => number): BufferGeometry {
  const m = new Mesh()
  list.forEach((p, i) => palm(m, p, level(p.z) - 0.3, 17 + i * 101))
  return m.geometry()
}

/** a bird as two swept wings and a short body, gliding: a dark shape a few pixels long against the sky */
export function birdsGeometry(list: BirdSpec[]): BufferGeometry {
  const m = new Mesh()
  const C: V3 = [0.035, 0.032, 0.03]
  for (const b of list) {
    const f: V3 = [Math.sin(b.yaw), 0, Math.cos(b.yaw)], s: V3 = [Math.cos(b.yaw), 0, -Math.sin(b.yaw)]
    const o: V3 = [b.x, b.y, b.z]
    const h = b.span / 2
    for (const k of [1, -1]) {
      const root: V3 = add(o, f, 0.04)
      const rootB: V3 = add(o, f, -0.08)
      const tip: V3 = add(add(add(o, s, k * h), f, -0.12), [0, 1, 0], h * b.beat)
      const elbow: V3 = add(add(add(o, s, k * h * 0.45), f, 0.06), [0, 1, 0], h * b.beat * 0.6)
      m.tri(root, elbow, rootB, C)
      m.tri(elbow, tip, rootB, C)
    }
    m.tri(add(o, f, 0.16), add(add(o, s, 0.03), f, -0.1), add(add(o, s, -0.03), f, -0.1), C)
    m.tri(add(o, f, -0.08), add(add(o, s, 0.05), f, -0.2), add(add(o, s, -0.05), f, -0.2), C)
  }
  return m.geometry()
}
