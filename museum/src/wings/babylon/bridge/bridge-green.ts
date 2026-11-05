/* THE WEST BANK'S TREES BESIDE THE PALMS, pure (three's buffers, no DOM): the Euphrates poplar and the willow along the
   bank and the tamarisk on its slope, each a type (Guessed: bab.green.poplar, bab.green.tamarisk). Built in code with
   vertex colours, seen across 100 to 300 m of water: a trunk and a crown of a few rough lobes, its shape the kind's
   (the poplar tall and open, the willow broad with its outer lobes hanging, the tamarisk low and feathery from the
   ground). The date palm is the gate's part (gate-life.ts palmGeometry). Sizes and colours ours. */

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
const LEAF: Record<TreeKind, V3> = { poplar: [0.085, 0.098, 0.062], willow: [0.092, 0.115, 0.05], tamarisk: [0.1, 0.11, 0.09], reed: [0.15, 0.15, 0.075] }
const WOOD: V3 = [0.12, 0.1, 0.08]

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

/** the icosahedron split once (42 points, 80 faces): a lobe's outline stays round enough not to read as facets */
const ICO1 = (() => {
  const pts: V3[] = ICO.map((v) => [...v] as V3)
  const mid = new Map<string, number>()
  const half = (i: number, j: number): number => {
    const key = i < j ? `${i}-${j}` : `${j}-${i}`
    const got = mid.get(key)
    if (got !== undefined) return got
    const p = pts[i]!, q = pts[j]!
    const m: V3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]
    const l = Math.hypot(...m)
    pts.push([m[0] / l, m[1] / l, m[2] / l])
    mid.set(key, pts.length - 1)
    return pts.length - 1
  }
  const faces: number[][] = []
  for (const [a, b, c] of FACES as [number, number, number][]) {
    const ab = half(a, b), bc = half(b, c), ca = half(c, a)
    faces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
  }
  return { pts, faces }
})()

/** a rough lobe of leaves: the split icosahedron pushed in and out by a smooth wobble of its own, so its outline breaks
    like a crown's; its normals from its middle so it shades soft; darker underneath and inside, lighter toward the sky */
function lobe(s: Soup, c: V3, r: V3, col: V3, R: () => number, droop = 0): void {
  const ph = [R() * 6.28, R() * 6.28, R() * 6.28, R() * 6.28]
  const k = ICO1.pts.map((v) => 0.8 + 0.14 * Math.sin(v[0] * 3.1 + ph[0]!) * Math.cos(v[2] * 2.7 + ph[1]!) + 0.1 * Math.sin(v[1] * 4.3 + v[0] * 2.2 + ph[2]!) + 0.06 * Math.sin(v[2] * 6.1 + ph[3]!))
  const P = ICO1.pts.map((v, i): V3 => {
    // a hanging lobe: its lower half drawn down and its sides in
    const y = v[1] < 0 ? v[1] * (1 + droop) : v[1]
    return [c[0] + v[0] * r[0] * k[i]!, c[1] + y * r[1] * k[i]!, c[2] + v[2] * r[2] * k[i]!]
  })
  const tone = ICO1.pts.map((v) => 0.6 + 0.5 * Math.max(0, v[1] * 0.6 + 0.4) + (R() - 0.5) * 0.14)
  for (const f of ICO1.faces) {
    for (const i of f) {
      const v = ICO1.pts[i]!
      s.push(P[i]!, v, [col[0] * tone[i]!, col[1] * tone[i]!, col[2] * tone[i]!])
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
  if (kind === 'poplar') {
    // one trunk, often leaning and bent, an open crown of several lobes in its upper half (the Gobi stand on the sheet)
    const a = R() * Math.PI * 2, lean = 0.06 + R() * 0.1
    const mid: V3 = [Math.cos(a) * lean * h * 0.5, h * 0.42, Math.sin(a) * lean * h * 0.5]
    const top: V3 = [Math.cos(a) * lean * h, h * 0.62, Math.sin(a) * lean * h]
    trunk(s, [0, -0.3, 0], mid, 0.26, 0.2)
    trunk(s, mid, top, 0.2, 0.12)
    const n = 11 + Math.floor(R() * 4)
    for (let j = 0; j < n; j++) {
      const b = (j / n) * Math.PI * 2 + R() * 0.6, out = h * (0.06 + R() * 0.2)
      const y = h * (0.56 + R() * 0.36)
      const rr = h * (0.065 + R() * 0.05)
      lobe(s, [top[0] + Math.cos(b) * out, y, top[2] + Math.sin(b) * out], [rr, rr * (0.8 + R() * 0.3), rr], leaf, R)
    }
  } else if (kind === 'willow') {
    // a short trunk under a low dome of narrow leaves hanging almost to the ground (the willow on the sheet)
    trunk(s, [0, -0.3, 0], [0, h * 0.35, 0], 0.3, 0.2)
    lobe(s, [0, h * 0.64, 0], [h * 0.28, h * 0.24, h * 0.28], leaf, R)
    for (let j = 0; j < 13; j++) {
      const b = (j / 13) * Math.PI * 2 + R() * 0.5, out = h * (0.24 + R() * 0.16)
      lobe(s, [Math.cos(b) * out, h * (0.4 + R() * 0.25), Math.sin(b) * out], [h * 0.12, h * (0.17 + R() * 0.06), h * 0.12], leaf, R, 0.7)
    }
  } else if (kind === 'reed') {
    // a clump of reed: thin blades from one foot, leaning out, last year's straw among the new green
    const n = 18 + Math.floor(R() * 10)
    for (let j = 0; j < n; j++) {
      // each blade a narrow strip (a few leaves seen together at 100 m and more), wide enough to stay a pixel
      const b = R() * Math.PI * 2, lean = 0.1 + R() * 0.35, hh = h * (0.55 + R() * 0.45), w = 0.06 + R() * 0.02
      const foot: V3 = [Math.cos(b) * R() * 0.35, -0.2, Math.sin(b) * R() * 0.35]
      const tip: V3 = [foot[0] + Math.cos(b) * lean * hh, hh, foot[2] + Math.sin(b) * lean * hh]
      const sx = -Math.sin(b) * w, sz = Math.cos(b) * w
      const nrm: V3 = [Math.cos(b) * 0.3, 0.9, Math.sin(b) * 0.3]
      const straw = R() < 0.35
      const c0: V3 = straw ? [0.2, 0.17, 0.1] : leaf
      const c1: V3 = [c0[0] * 1.25, c0[1] * 1.25, c0[2] * 1.2]
      const q: V3[] = [[foot[0] - sx, foot[1], foot[2] - sz], [foot[0] + sx, foot[1], foot[2] + sz], [tip[0] + sx * 0.7, tip[1], tip[2] + sz * 0.7], [tip[0] - sx * 0.7, tip[1], tip[2] - sz * 0.7]]
      const qc = [c0, c0, c1, c1]
      for (const i of [0, 1, 2, 0, 2, 3]) s.push(q[i]!, nrm, qc[i]!)
    }
  } else {
    // a dense, upright, feathery shrub-tree from the ground, wider than high, in a few columns (the athel on the sheet)
    const n = 9 + Math.floor(R() * 4)
    for (let j = 0; j < n; j++) {
      const b = R() * Math.PI * 2, out = h * (0.1 + R() * 0.45)
      const rr = h * (0.15 + R() * 0.08)
      lobe(s, [Math.cos(b) * out, h * (0.25 + R() * 0.42), Math.sin(b) * out], [rr, h * (0.24 + R() * 0.1), rr], leaf, R, 0.4)
    }
  }
  return s.geometry()
}

/** the palm part's builder (gate-life.ts palmGeometry), passed in so this module keeps no relative import for node */
export type PalmBuilder = (h: number, detail: { seg: number; sides: number; fronds: number; steps: number }, seed: number) => BufferGeometry
/** the palms across the river: between the garden's middle palm and the plain's far one, seen at 100 to 400 m */
export const PALM_BANK = { seg: 3, sides: 5, fronds: 14, steps: 3 }
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
