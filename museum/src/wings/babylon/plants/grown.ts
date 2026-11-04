/* THE GROWN TREES: a wing-side adapter on the stack's tree kit (kit-stack-planting). The kit grows a tree by space
   colonisation; its leaf atlas is drawn on a canvas, so only a page grows one, and node mounts the tree's stand-in
   (`standIn`, the crown's bounds). The kit's wood is kept, its twigs under `minTwig` dropped (they fall under a pixel
   from where the walk sees them); each leaf card becomes a spray of opaque leaves in the kind's April colour, so the
   tree draws in the gardens' own vertex-colour material, with `leaf` (1 foliage, 0 wood) and `centre` (the crown's
   middle) per vertex. A grown tree stands at the origin, its foot at 0. */

import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3, type InstancedMesh, type Mesh } from 'three/webgpu'
import { planting, type Species } from '../../../stack/parts/planting'
import type { Bench } from '../../../stack/parts/common'

type V3 = [number, number, number]
/** how a kind carries its leaves at a twig's end: broad blades, narrow ones, a scale-leaved spray, drooping threads */
export type Spray = 'broad' | 'narrow' | 'scale' | 'thread'
export interface GrowSpec {
  species: Species
  height: number
  /** the crown's radius: the kit's own spread is scaled to it across, never in height */
  radius: number
  seed: number
  spray: Spray
  leaf: V3
  wood: V3
  lod?: 1 | 2 | 3
  /** wood thinner than this radius (m) is dropped */
  minTwig?: number
  /** the share of the kit's leaf cards kept (a tree seen only from far off), each kept spray drawn larger to keep the
      crown's mass */
  keep?: number
  /** how much larger than its card a spray is drawn (1.32: the gardens' trees from 100 m and more) */
  fill?: number
}
export interface Crown { y0: number; y1: number; rx: number; rz: number }
export interface Grown { geometry: BufferGeometry; crown: Crown; triangles: number; shoots: string }

const rnd = (seed: number): (() => number) => {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/* the kit asks its bench for a bark material and a detail level only; the wood's material is never drawn here */
const BENCH = { detail: () => 1, surface: () => ({ dispose() {} }) } as unknown as Bench

class Out {
  pos: number[] = []
  nor: number[] = []
  col: number[] = []
  leaf: number[] = []
  cen: number[] = []
  constructor(private centre: V3) {}
  tri(a: Vector3, b: Vector3, c: Vector3, n: [Vector3, Vector3, Vector3], col: V3, leaf: number): void {
    for (const [p, q] of [[a, n[0]], [b, n[1]], [c, n[2]]] as Array<[Vector3, Vector3]>) {
      this.pos.push(p.x, p.y, p.z)
      this.nor.push(q.x, q.y, q.z)
      this.col.push(col[0], col[1], col[2])
      this.leaf.push(leaf)
      this.cen.push(...this.centre)
    }
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    g.setAttribute('leaf', new Float32BufferAttribute(this.leaf, 1))
    g.setAttribute('centre', new Float32BufferAttribute(this.cen, 3))
    return g
  }
}

/** a spray's leaves in the card's own plane (x, y), the card `s` metres across: each leaf a kite from near the middle */
function sprayShape(kind: Spray, s: number, r: () => number): Array<[number, number][]> {
  const leaves: Array<[number, number][]> = []
  const kite = (a: number, len: number, w: number, from = 0.06): void => {
    const c = Math.cos(a), si = Math.sin(a)
    const at = (u: number, v: number): [number, number] => [(c * u - si * v) * s, (si * u + c * v) * s]
    leaves.push([at(from, 0), at(from + len * 0.42, w / 2), at(from + len, 0), at(from + len * 0.42, -w / 2)])
  }
  // about half the card covered, as the kit's own atlas sprays cover it
  if (kind === 'broad') for (let i = 0; i < 5; i++) kite((i / 5) * Math.PI * 2 + (r() - 0.5) * 0.6, 0.5 + r() * 0.12, 0.34, 0.03)
  else if (kind === 'narrow') for (let i = 0; i < 6; i++) kite((i / 6) * Math.PI * 2 + (r() - 0.5) * 0.5, 0.5 + r() * 0.12, 0.15, 0.03)
  else if (kind === 'scale') {
    // a scale-leaved spray: a dense lozenge, not separate blades
    const fan: [number, number][] = []
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; fan.push([Math.cos(a) * 0.42 * s * (0.85 + r() * 0.3), Math.sin(a) * 0.58 * s * (0.85 + r() * 0.3)]) }
    leaves.push(fan)
  }
  return leaves
}

/** one tree of the kit at a crown's radius, in the gardens' vertex format */
export function grow(spec: GrowSpec): Grown {
  const lod = spec.lod ?? 1
  const part = planting.treePart(BENCH, { species: spec.species, height: spec.height, season: 'summer', seed: spec.seed, lod })
  const habit = planting.HABIT[spec.species]
  const k = spec.radius / Math.max(0.1, spec.height * habit.spread * 0.5)
  const S = new Matrix4().makeScale(k, 1, k)
  const crownMid: V3 = [0, spec.height * (habit.crownBase + 1) * 0.5, 0]
  const out = new Out(crownMid)
  const r = rnd(spec.seed ^ 0x5bd1e995)
  const cv = new Vector3(...crownMid)
  const sides = lod >= 3 ? 6 : lod === 2 ? 5 : 4
  const minTwig = spec.minTwig ?? 0.025
  let wood: Mesh | null = null
  const cards: InstancedMesh[] = []
  part.traverse((o) => {
    if ((o as InstancedMesh).isInstancedMesh) cards.push(o as InstancedMesh)
    else if ((o as Mesh).isMesh && o.name === 'wood') wood = o as Mesh
  })
  /* the wood: a ring of sides + 1 vertices per shoot; a quad between a shoot's ring and its parent's is kept when the
     shoot's own ring is thick enough to be seen */
  if (wood) {
    const g = (wood as Mesh).geometry
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), idx = g.getIndex()!
    const per = sides + 1, rings = pos.count / per
    const radius = new Float32Array(rings)
    const a = new Vector3(), c = new Vector3()
    for (let i = 0; i < rings; i++) {
      c.set(0, 0, 0)
      for (let j = 0; j < sides; j++) c.add(a.fromBufferAttribute(pos, i * per + j))
      c.multiplyScalar(1 / sides)
      radius[i] = a.fromBufferAttribute(pos, i * per).distanceTo(c)
    }
    const P = [new Vector3(), new Vector3(), new Vector3()], N = [new Vector3(), new Vector3(), new Vector3()]
    for (let t = 0; t < idx.count; t += 3) {
      const ii = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)]
      const ring = Math.floor(Math.max(...ii) / per)
      if (radius[ring]! < minTwig) continue
      for (let j = 0; j < 3; j++) {
        P[j]!.fromBufferAttribute(pos, ii[j]!).applyMatrix4(S)
        N[j]!.fromBufferAttribute(nor, ii[j]!).multiply(new Vector3(1 / k, 1, 1 / k)).normalize()
      }
      // the lower wood a little darker, as bark is under a crown's shade
      const shade = 0.8 + 0.25 * Math.min(1, P[0]!.y / spec.height)
      out.tri(P[0]!, P[1]!, P[2]!, [N[0]!, N[1]!, N[2]!], [spec.wood[0] * shade, spec.wood[1] * shade, spec.wood[2] * shade], 0)
    }
  }
  /* the leaves: every card a spray, turned to face out of the crown */
  const M = new Matrix4(), q = new Vector3(), n0 = new Vector3(), out3 = new Vector3()
  let y0 = Infinity, y1 = -Infinity, rx = 0, rz = 0
  for (const im of cards) {
    const cg = im.geometry
    const half = Math.abs(cg.getAttribute('position').getX(0))
    const keep = Math.min(1, Math.max(0.05, spec.keep ?? 1))
    const size = half * 2 / Math.sqrt(keep)
    for (let i = 0; i < im.count; i++) {
      if (keep < 1 && r() > keep) continue
      im.getMatrixAt(i, M)
      M.premultiply(S)
      n0.set(0, 0, 1).transformDirection(M)
      const centre = new Vector3(0, 0, 0).applyMatrix4(M)
      out3.copy(centre).sub(cv).setY((centre.y - cv.y) * 0.6).normalize()
      if (n0.dot(out3) < 0) n0.negate()
      const nrm = n0.clone().multiplyScalar(0.45).addScaledVector(out3, 0.55).normalize()
      // inner sprays darker, upper and outer ones lighter; a few a shade off the kind's colour
      const depth = Math.min(1, centre.clone().sub(cv).setY(0).length() / Math.max(0.5, spec.radius))
      const tone = (0.86 + 0.3 * depth + (r() - 0.5) * 0.18) * (0.9 + 0.2 * Math.min(1, Math.max(0, centre.y / spec.height)))
      const hue = (r() - 0.5) * 0.12
      const col: V3 = [spec.leaf[0] * tone * (1 + hue), spec.leaf[1] * tone, spec.leaf[2] * tone * (1 - hue)]
      const nn: [Vector3, Vector3, Vector3] = [nrm, nrm, nrm]
      if (spec.spray === 'thread') {
        // drooping jointed twigs: three threads hang from the card's middle, each narrowing to its tip
        for (let j = 0; j < 3; j++) {
          const a = (j / 3) * Math.PI * 2 + r()
          const top = centre.clone().add(new Vector3(Math.cos(a) * size * 0.22, size * 0.1, Math.sin(a) * size * 0.22))
          const len = size * (0.8 + r() * 0.5) * (spec.fill ?? 1.32) / 1.32
          const bot = top.clone().add(new Vector3(out3.x * size * 0.15, -len, out3.z * size * 0.15))
          const side = new Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(size * 0.2)
          out.tri(top.clone().add(side), top.clone().sub(side), bot, nn, col, 1)
          y0 = Math.min(y0, bot.y)
        }
        y1 = Math.max(y1, centre.y + size * 0.1)
      } else {
        // a spray drawn a third larger than its card: seen from 150 m and more the crown keeps its mass, as the kit's
        // alpha-tested cards keep theirs through their mips
        for (const leafPts of sprayShape(spec.spray, size * (spec.fill ?? 1.32), r)) {
          const W = leafPts.map(([x, y]) => q.set(x, y, 0).applyMatrix4(M).clone())
          for (let j = 1; j + 1 < W.length; j++) {
            // wound so the face looks out of the crown
            const f = new Vector3().subVectors(W[j]!, W[0]!).cross(new Vector3().subVectors(W[j + 1]!, W[0]!))
            if (f.dot(out3) >= 0) out.tri(W[0]!, W[j]!, W[j + 1]!, nn, col, 1)
            else out.tri(W[0]!, W[j + 1]!, W[j]!, nn, col, 1)
          }
          for (const w of W) { y0 = Math.min(y0, w.y); y1 = Math.max(y1, w.y) }
        }
      }
      rx = Math.max(rx, Math.abs(centre.x) + size * 0.5)
      rz = Math.max(rz, Math.abs(centre.z) + size * 0.5)
    }
    im.geometry.dispose()
  }
  /* a scale-leaved column (the cypress) keeps its sprays to the top of the kit's twigs only: its skin is clothed from the
     foot of the crown up, on the spindle a cypress makes, widest a third of the way up */
  if (spec.spray === 'scale') {
    const y00 = spec.height * Math.max(0.06, habit.crownBase * 0.6), H = spec.height - y00
    const s = 0.55
    const n = Math.round((2 * Math.PI * spec.radius * 0.7 * H) / (s * s * 0.6))
    for (let i = 0; i < n; i++) {
      const t = (i + r()) / n
      const y = y00 + H * t
      const w = spec.radius * Math.pow(Math.sin(Math.PI * Math.min(1, 0.16 + t * 0.9)), 0.75) * (1 - 0.35 * t)
      const a = i * 2.39996
      const rr = w * (0.82 + r() * 0.2)
      const c = new Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr)
      const o = new Vector3(Math.cos(a), 0.35 + 0.5 * t, Math.sin(a)).normalize()
      const u = new Vector3(0, 1, 0).sub(o.clone().multiplyScalar(o.y)).normalize(), v = o.clone().cross(u)
      const nrm = o.clone().multiplyScalar(0.6).add(new Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.4)).normalize()
      const tone = (0.85 + 0.25 * t + (r() - 0.5) * 0.18)
      const col: V3 = [spec.leaf[0] * tone, spec.leaf[1] * tone, spec.leaf[2] * tone]
      const fan: Vector3[] = []
      for (let j = 0; j < 6; j++) { const b = (j / 6) * Math.PI * 2; fan.push(c.clone().addScaledVector(v, Math.cos(b) * s * 0.42).addScaledVector(u, Math.sin(b) * s * 0.62)) }
      for (let j = 1; j + 1 < 6; j++) out.tri(fan[0]!, fan[j]!, fan[j + 1]!, [nrm, nrm, nrm], col, 1)
      y0 = Math.min(y0, y - s * 0.62)
      y1 = Math.max(y1, y + s * 0.62)
      rx = Math.max(rx, Math.abs(c.x) + s * 0.5)
      rz = Math.max(rz, Math.abs(c.z) + s * 0.5)
    }
  }
  ;(part.getObjectByName('wood') as Mesh | undefined)?.geometry.dispose()
  const geometry = out.geometry()
  return { geometry, crown: { y0, y1, rx, rz }, triangles: out.pos.length / 9, shoots: String(part.userData.part.says) }
}
