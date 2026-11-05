/* THE WEST BANK'S TREES BESIDE THE PALMS, pure (three's buffers, no DOM): the Euphrates poplar and the willow along the
   bank and the tamarisk on its slope, each a type (Guessed: bab.green.poplar, bab.green.tamarisk). Built in code with
   vertex colours, seen across 100 to 300 m of water: a trunk and a crown of a few rough lobes under small leaf blades,
   its shape the kind's (the poplar tall and open, the willow broad with its outer lobes hanging, the tamarisk low and
   feathery from the ground). The date palm is the gate's part (gate-life.ts palmGeometry). Sizes and colours ours. */

import { BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import type { PlantKind, PlantSpot } from './bridge-geom'

type V3 = [number, number, number]
export type TreeKind = 'poplar' | 'willow' | 'tamarisk' | 'reed'

const rnd = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}
const PHI = (1 + Math.sqrt(5)) / 2
const ICO: V3[] = ([[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]] as V3[]).map((v) => {
  const l = Math.hypot(...v)
  return [v[0] / l, v[1] / l, v[2] / l]
})
const FACES = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]

/** linear albedo of each kind's leaves (a grey-green; the tamarisk's finer, bluer), its wood */
const LEAF: Record<TreeKind, V3> = { poplar: [0.095, 0.11, 0.05], willow: [0.1, 0.125, 0.045], tamarisk: [0.115, 0.118, 0.07], reed: [0.15, 0.15, 0.075] }
const WOOD: V3 = [0.12, 0.1, 0.08]
/** each kind's leaf blades: the poplar's broad, the willow's long, narrow and hanging, the tamarisk's fine scale-leaved sprays */
const CUT: Record<Exclude<TreeKind, 'reed'>, LeafCut> = {
  poplar: { gap: 0.21, len: 0.32, width: 0.19, tilt: 0.35, hang: 0, under: -0.9 },
  willow: { gap: 0.25, len: 0.36, width: 0.14, tilt: 0.3, hang: 0.5, under: -2 },
  tamarisk: { gap: 0.24, len: 0.32, width: 0.17, tilt: 0.35, hang: 0, under: -0.75 },
}

class Soup {
  pos: number[] = []
  nrm: number[] = []
  col: number[] = []
  push(p: V3, n: V3, c: V3): void {
    this.pos.push(...p)
    this.nrm.push(...n)
    this.col.push(...c)
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    return g
  }
}

/** the points of the icosahedron split once, the lobe's old shape: one draw each keeps every lobe where it stood */
const SPLIT_POINTS = 42

/** a lobe of the crown: its middle and radii, how far its lower half hangs, the floor its hem keeps above, its wobble */
interface Lobe { c: V3; r: V3; droop: number; floor: number; ph: number[]; col: V3 }
/** a leaf blade's size: the gap between blades on a lobe's face, its length and half width (m), how far it tilts out of
    the face, how far it hangs (the willow's) */
export interface LeafCut { gap: number; len: number; width: number; tilt: number; hang: number; under: number }
const wobble = (v: V3, ph: number[]): number => 0.8 + 0.14 * Math.sin(v[0] * 3.1 + ph[0]!) * Math.cos(v[2] * 2.7 + ph[1]!) + 0.1 * Math.sin(v[1] * 4.3 + v[0] * 2.2 + ph[2]!) + 0.06 * Math.sin(v[2] * 6.1 + ph[3]!)
const onLobe = (L: Lobe, v: V3, scale: number): V3 => {
  const k = wobble(v, L.ph) * scale
  const y = v[1] < 0 ? v[1] * (1 + L.droop) : v[1]
  return [L.c[0] + v[0] * L.r[0] * k, Math.max(L.floor, L.c[1] + y * L.r[1] * k), L.c[2] + v[2] * L.r[2] * k]
}
/** darker underneath and inside, lighter toward the sky */
const shade = (v: V3): number => 0.6 + 0.5 * Math.max(0, v[1] * 0.6 + 0.4)
/** the core sits inside the blades' shell, so its facets never make the outline */
const CORE = 0.95

/** a lobe's core: an icosahedron pushed in and out by the lobe's smooth wobble, its normals from its middle so it shades
    soft, a little inside the blades that make its face and outline; the lobe kept in the list for the blades */
function lobe(s: Soup, c: V3, r: V3, col: V3, R: () => number, list: Lobe[], droop = 0, floor = -Infinity): void {
  const L: Lobe = { c, r, droop, floor, ph: [R() * 6.28, R() * 6.28, R() * 6.28, R() * 6.28], col }
  list.push(L)
  const P = ICO.map((v) => onLobe(L, v, CORE))
  for (let i = 0; i < SPLIT_POINTS; i++) R()
  for (const f of FACES) {
    for (const i of f) {
      const v = ICO[i]!, t = shade(v) * 0.8
      s.push(P[i]!, v, [col[0] * t, col[1] * t, col[2] * t])
    }
  }
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
/** the crown's leaves: blades over every lobe's face that no other lobe hides, each tilted a little out of the face and
    turned its own way, so the outline breaks into leaf clusters a few centimetres across and not into facets */
function blades(s: Soup, lobes: Lobe[], cut: LeafCut, R: () => number): void {
  const hidden = (p: V3, L: Lobe): boolean => lobes.some((M) => M !== L && Math.hypot((p[0] - M.c[0]) / M.r[0], (p[1] - M.c[1]) / (M.r[1] * (p[1] < M.c[1] ? 1 + M.droop : 1)), (p[2] - M.c[2]) / M.r[2]) < 0.78)
  for (const L of lobes) {
    const area = 4 * Math.PI * ((L.r[0] * L.r[1] * (1 + L.droop / 2) + L.r[1] * (1 + L.droop / 2) * L.r[2] + L.r[0] * L.r[2]) / 3) * 0.64
    const n = Math.max(12, Math.round(area / (cut.gap * cut.gap)))
    for (let i = 0; i < n; i++) {
      const yy = 1 - (2 * (i + 0.5)) / n, rr = Math.sqrt(Math.max(0, 1 - yy * yy)), th = i * 2.39996 + R() * 0.6
      const v: V3 = [rr * Math.cos(th), yy, rr * Math.sin(th)]
      const p = onLobe(L, v, 0.97 + R() * 0.06)
      if (hidden(p, L)) continue
      // the underside, in the crown's own shade and seen against the bank, keeps its core alone (not the hanging willow's)
      if (v[1] < cut.under) continue
      const t1 = unit(cross(v, Math.abs(v[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), t2 = cross(v, t1)
      const a = R() * Math.PI * 2, tilt = cut.tilt * (0.5 + R())
      const u = unit([t1[0] * Math.cos(a) + t2[0] * Math.sin(a) + v[0] * tilt, t1[1] * Math.cos(a) + t2[1] * Math.sin(a) + v[1] * tilt - cut.hang, t1[2] * Math.cos(a) + t2[2] * Math.sin(a) + v[2] * tilt])
      const b0 = unit(cross(u, v)), b1 = cross(u, b0), roll = (R() - 0.5) * 1.4
      const b: V3 = [b0[0] * Math.cos(roll) + b1[0] * Math.sin(roll), b0[1] * Math.cos(roll) + b1[1] * Math.sin(roll), b0[2] * Math.cos(roll) + b1[2] * Math.sin(roll)]
      const len = cut.len * (0.75 + R() * 0.5), w = cut.width * (0.75 + R() * 0.5)
      const base: V3 = [p[0] - u[0] * len * 0.45, p[1] - u[1] * len * 0.45, p[2] - u[2] * len * 0.45]
      const tip: V3 = [p[0] + u[0] * len * 0.55, Math.max(L.floor, p[1] + u[1] * len * 0.55), p[2] + u[2] * len * 0.55]
      const t = shade(v) * (0.62 + R() * 0.22)
      const c: V3 = [L.col[0] * t, L.col[1] * t, L.col[2] * t]
      const q0: V3 = [base[0] + b[0] * w, base[1] + b[1] * w, base[2] + b[2] * w], q1: V3 = [base[0] - b[0] * w, base[1] - b[1] * w, base[2] - b[2] * w]
      // wound to face out of the lobe: a double-sided blade seen from its back takes its normal flipped, toward the sun
      // behind the crown, and would light up
      const fn = cross([q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]], [tip[0] - q0[0], tip[1] - q0[1], tip[2] - q0[2]])
      const out = fn[0] * v[0] + fn[1] * v[1] + fn[2] * v[2] >= 0
      for (const q of (out ? [q0, q1, tip] : [q1, q0, tip]) as V3[]) s.push(q, v, c)
    }
  }
}

function trunk(s: Soup, foot: V3, top: V3, r0: number, r1: number): void {
  const SIDES = 5
  for (let k = 0; k < SIDES; k++) {
    const a0 = (k / SIDES) * Math.PI * 2, a1 = ((k + 1) / SIDES) * Math.PI * 2
    const at = (c: V3, rr: number, a: number): V3 => [c[0] + Math.cos(a) * rr, c[1], c[2] + Math.sin(a) * rr]
    const n0: V3 = [Math.cos(a0), 0, Math.sin(a0)], n1: V3 = [Math.cos(a1), 0, Math.sin(a1)]
    const q = [at(foot, r0, a0), at(foot, r0, a1), at(top, r1, a1), at(top, r1, a0)]
    const nn = [n0, n1, n1, n0]
    for (const i of [0, 2, 1, 0, 3, 2]) s.push(q[i]!, nn[i]!, WOOD)
  }
}

/** one tree of a kind at the origin, its foot at 0, h metres high */
export function treeGeometry(kind: TreeKind, h: number, seed: number): BufferGeometry {
  const s = new Soup()
  const R = rnd(seed)
  const leaf = LEAF[kind]
  const crown: Lobe[] = []
  if (kind === 'poplar') {
    // one trunk, often leaning and bent, an open crown of several lobes in its upper half (the Gobi stand on the sheet)
    const a = R() * Math.PI * 2, lean = 0.06 + R() * 0.1
    const mid: V3 = [Math.cos(a) * lean * h * 0.5, h * 0.42, Math.sin(a) * lean * h * 0.5]
    const top: V3 = [Math.cos(a) * lean * h, h * 0.62, Math.sin(a) * lean * h]
    trunk(s, [0, -0.3, 0], mid, 0.26, 0.2)
    trunk(s, mid, top, 0.2, 0.12)
    // lobes held close and overlapping, so the crown reads as one ragged mass and never as loose balls
    const n = 11 + Math.floor(R() * 4)
    for (let j = 0; j < n; j++) {
      const b = (j / n) * Math.PI * 2 + R() * 0.6, out = h * (0.04 + R() * 0.12)
      const y = h * (0.58 + R() * 0.3)
      const rr = h * (0.09 + R() * 0.05)
      lobe(s, [top[0] + Math.cos(b) * out, y, top[2] + Math.sin(b) * out], [rr, rr * (0.8 + R() * 0.3), rr], leaf, R, crown)
    }
  } else if (kind === 'willow') {
    // a short trunk under a low dome of narrow leaves hanging almost to the ground (the willow on the sheet)
    trunk(s, [0, -0.3, 0], [0, h * 0.35, 0], 0.3, 0.2)
    lobe(s, [0, h * 0.64, 0], [h * 0.28, h * 0.24, h * 0.28], leaf, R, crown)
    for (let j = 0; j < 13; j++) {
      const b = (j / 13) * Math.PI * 2 + R() * 0.5, out = h * (0.24 + R() * 0.16)
      lobe(s, [Math.cos(b) * out, h * (0.4 + R() * 0.25), Math.sin(b) * out], [h * 0.12, h * (0.17 + R() * 0.06), h * 0.12], leaf, R, crown, 0.7)
    }
  } else if (kind === 'reed') {
    // a clump of reed as the deck sees it across 100 to 400 m of water: many sheaves of blades from one foot, each a
    // quarter metre across (two to three pixels at that range: a narrower one falls under a pixel), facing across the
    // local x axis as the instance turns it to the bridge, each leaning and turned a little its own way, so the clump
    // reads as a mass with a ragged top and not as a few lit wedges; a standing sheaf's face is near vertical, so its
    // normal lies near the horizontal. Last year's straw among the new green, a dark plume on some of the straw
    const n = 16 + Math.floor(R() * 7)
    for (let j = 0; j < n; j++) {
      const b = R() * Math.PI * 2, lean = 0.04 + R() * 0.2, hh = h * (0.5 + R() * 0.5)
      const foot: V3 = [(R() - 0.5) * 0.6, -0.2, (R() - 0.5) * 0.6]
      const tip: V3 = [foot[0] + Math.cos(b) * lean * hh, hh, foot[2] + Math.sin(b) * lean * hh]
      // the blade bows outward a little at its middle
      const mid: V3 = [foot[0] + (tip[0] - foot[0]) * 0.55 + Math.cos(b) * lean * hh * 0.12, hh * 0.55, foot[2] + (tip[2] - foot[2]) * 0.55 + Math.sin(b) * lean * hh * 0.12]
      const a = Math.PI / 2 + (R() - 0.5) * 0.9, ax = Math.cos(a), az = Math.sin(a)
      const w = 0.12 + R() * 0.06
      const side = (p: V3, k: number): V3 => [p[0] + ax * k, p[1], p[2] + az * k]
      const nrm: V3 = [-az * 0.94, 0.34, ax * 0.94]
      const straw = R() < 0.35
      const c0: V3 = straw ? [0.2, 0.17, 0.1] : leaf
      const c1: V3 = [c0[0] * (1.05 + R() * 0.2), c0[1] * (1.05 + R() * 0.2), c0[2] * 1.1]
      const base: V3 = [c0[0] * 0.75, c0[1] * 0.75, c0[2] * 0.75]
      for (const [p, c] of [[side(foot, -w), base], [side(foot, w), base], [side(mid, w * 0.7), c1], [side(foot, -w), base], [side(mid, w * 0.7), c1], [side(mid, -w * 0.7), c1], [side(mid, -w * 0.7), c1], [side(mid, w * 0.7), c1], [tip, c1]] as Array<[V3, V3]>) s.push(p, nrm, c)
      if (straw && R() < 0.6) {
        // the plume: a small dark tuft hanging from the stem's top
        const pl: V3 = [0.16, 0.12, 0.08]
        const t1: V3 = [tip[0] + Math.cos(b) * 0.1, tip[1] - 0.4, tip[2] + Math.sin(b) * 0.1]
        for (const p of [side(tip, -0.13), side(tip, 0.13), t1] as V3[]) s.push(p, nrm, pl)
      }
    }
  } else {
    // a dense, upright, feathery shrub-tree from the ground, wider than high, in a few columns (the athel on the sheet)
    // its stems gathered in one thick foot inside the crown: the plant stands on it, the lobes' hems stop above it
    trunk(s, [0, -0.3, 0], [0, h * 0.28, 0], 0.4, 0.25)
    const n = 9 + Math.floor(R() * 4)
    for (let j = 0; j < n; j++) {
      const b = R() * Math.PI * 2, out = h * (0.1 + R() * 0.45)
      const rr = h * (0.15 + R() * 0.08)
      lobe(s, [Math.cos(b) * out, h * (0.25 + R() * 0.42), Math.sin(b) * out], [rr, h * (0.24 + R() * 0.1), rr], leaf, R, crown, 0.4, -0.15)
    }
  }
  // the blades draw from their own stream, so the lobes keep their places
  if (crown.length) blades(s, crown, CUT[kind as Exclude<TreeKind, 'reed'>], rnd(seed * 7 + 3))
  return s.geometry()
}

/** the palm part's builder (gate-life.ts palmGeometry), passed in so this module keeps no relative import for node */
export type PalmBuilder = (h: number, detail: { seg: number; sides: number; fronds: number; steps: number; leaflets?: number }, seed: number) => BufferGeometry
/** the palms across the river: between the garden's middle palm and the plain's far one, seen at 100 to 400 m; their
    fronds toothed (the leaflets of a stretch of rib as one blade), so a crown against the dusk reads feathered, not as
    folded blades with straight edges */
export const PALM_BANK = { seg: 3, sides: 5, fronds: 24, steps: 3, leaflets: 14 }
/** each kind's base height; an instance scales it */
export const PLANT_BASE_H: Record<PlantKind, number> = { palm: 12, poplar: 11, willow: 9, tamarisk: 4, reed: 2 }
/** a kind's two shapes, v 0 or 1 (the plants of a kind take them in turn) */
export function plantShape(kind: PlantKind, v: number, palm: PalmBuilder): BufferGeometry {
  return kind === 'palm' ? palm(PLANT_BASE_H.palm, PALM_BANK, 17 + v * 31) : treeGeometry(kind, PLANT_BASE_H[kind], 5 + v * 97 + kind.length)
}
/** a plant's place: turned about its yaw, leaning, scaled to its height */
export function plantMatrix(p: PlantSpot): Matrix4 {
  const lean = new Quaternion().setFromAxisAngle(new Vector3(Math.cos(p.yaw), 0, Math.sin(p.yaw)).normalize(), p.lean)
  const q = lean.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), p.yaw))
  const s = p.h / PLANT_BASE_H[p.kind]
  return new Matrix4().compose(new Vector3(p.x, p.y, p.z), q, new Vector3(s, s, s))
}
