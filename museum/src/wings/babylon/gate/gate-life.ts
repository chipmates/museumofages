/* LIFE WITHOUT BODIES, pure: date palms beyond the walls and a few birds over the forecourt, built in code with
   vertex colours. Every one is a guess (class G); their places are in gate-plan.json `life`. No DOM, no renderer. */
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'

type V3 = [number, number, number]
export interface PalmSpec { x: number; z: number; h: number; lean: [number, number]; turn: number }
export interface BirdSpec { x: number; y: number; z: number; span: number; yaw: number; beat: number }

class Mesh {
  pos: number[] = []
  col: number[] = []
  tri(a: V3, b: V3, c: V3, ca: V3, cb: V3 = ca, cc: V3 = ca): void {
    this.pos.push(...a, ...b, ...c)
    this.col.push(...ca, ...cb, ...cc)
  }
  quad(a: V3, b: V3, c: V3, d: V3, ca: V3, cb: V3 = ca): void {
    this.tri(a, b, c, ca, ca, cb)
    this.tri(a, c, d, ca, cb, cb)
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    g.computeVertexNormals()
    return g
  }
}

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const rnd = (seed: number): (() => number) => {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

const TRUNK: V3 = [0.16, 0.12, 0.085], SCAR: V3 = [0.1, 0.075, 0.055]
const FROND: V3 = [0.06, 0.095, 0.035], FROND_PALE: V3 = [0.13, 0.15, 0.06], DEAD: V3 = [0.3, 0.22, 0.11]

/** one date palm: a slightly bent trunk ringed with old leaf bases, a crown of arching fronds folded along the rib */
function palm(m: Mesh, p: PalmSpec, base: number, seed: number): void {
  const r = rnd(seed)
  const SEG = 14, SIDES = 7
  const spine: V3[] = []
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    // the lean grows toward the top, as a palm leans out of a wall's shade
    spine.push([p.x + p.lean[0] * t * t, base + p.h * t, p.z + p.lean[1] * t * t])
  }
  for (let i = 0; i < SEG; i++) {
    const r0 = 0.24 - 0.06 * (i / SEG), r1 = 0.24 - 0.06 * ((i + 1) / SEG)
    for (let k = 0; k < SIDES; k++) {
      const a0 = (k / SIDES) * Math.PI * 2, a1 = ((k + 1) / SIDES) * Math.PI * 2
      const P = (c: V3, rr: number, a: number): V3 => [c[0] + Math.cos(a) * rr, c[1], c[2] + Math.sin(a) * rr]
      const ring = i % 2 === 0 ? TRUNK : SCAR
      m.quad(P(spine[i]!, r0, a0), P(spine[i]!, r0, a1), P(spine[i + 1]!, r1, a1), P(spine[i + 1]!, r1, a0), ring, ring)
    }
  }
  const top = spine[SEG]!
  const N = 24
  for (let f = 0; f < N; f++) {
    const az = p.turn + f * 2.39996 + (r() - 0.5) * 0.3
    // young fronds stand up, old ones droop; the lowest few are dead and hang
    const age = f / N
    const el = 1.1 - age * 1.55 + (r() - 0.5) * 0.15
    const L = 3.0 + r() * 0.9 - (age > 0.85 ? 0.6 : 0)
    const dir: V3 = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)]
    const side = norm(cross(dir, [0, 1, 0]))
    const colour = age > 0.88 ? DEAD : age > 0.6 ? FROND_PALE : FROND
    const S = 9
    let prev: { c: V3; l: V3; rr: V3 } | null = null
    for (let i = 0; i <= S; i++) {
      const t = i / S
      // the rib arches: out along the frond's direction, falling with t squared
      const c = add(add(top, dir, L * t), [0, -1, 0], 1.4 * t * t * (0.6 + age))
      const w = 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1)), 0.7) + 0.02
      // the leaflets fold down from the rib, a shallow V
      const l = add(add(c, side, w), [0, -1, 0], w * 0.35)
      const rr = add(add(c, side, -w), [0, -1, 0], w * 0.35)
      if (prev) {
        m.quad(prev.c, c, l, prev.l, colour)
        m.quad(prev.rr, rr, c, prev.c, colour)
      }
      prev = { c, l, rr }
    }
  }
}

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
