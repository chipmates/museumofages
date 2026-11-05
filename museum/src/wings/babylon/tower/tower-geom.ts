/* STOP 9'S BODIES, pure geometry (three's buffers, no DOM), so the map page and the node checks build the same: the
   precinct's east wall with Gate 5's recess and the store blocks either side, their slight towers, the threshold at the
   recess's inner end, the street's paving before the gate, and Etemenanki's stages drawn with their faces' own data.
   Scene frame as plan.ts (x east, y up, z south). Every body carries one attribute set, so the page merges them into one
   mesh: `kind` (0 plaster wall, 1 tower brick, 2 the glazed temple, 3 the street, 4 the threshold, 5 a stair, 6 a stair's
   side wall, 7 the temple's door), `fa` (per kind: the tower's face centre in plan, its half width and panel pitch; the
   street's along and across metres; a stair's foot and its run direction scaled to steps per metre) and `fb` (a stage's
   face: the level its visible foot stands on, its top, the stage's number).
   Only type imports from the wing: node resolves no relative module without its extension. */

import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape } from 'three/webgpu'
import type { BoxRec, Built, Cls, P2, Ramp } from '../map/plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

export const KIND = { wall: 0, brick: 1, glaze: 2, street: 3, threshold: 4, stair: 5, cheek: 6, door: 7 } as const

export interface TowerBody { id: string; geometry: BufferGeometry; band: number; letters: [Cls, Cls] }

/** the gate's frame in scene metres: `at(s, t)` is the point s metres along the wall line from its north end and t
    metres inward from its centre line (the outer face at t = -thick/2) */
export interface GateFrame {
  a: P2
  d: P2
  /** inward, square to the wall line */
  i: P2
  thick: number
  len: number
  /** the opening's centre along the line, and its half width */
  sG: number
  half: number
  /** the recess's inner end, inward from the centre line */
  tEnd: number
  at: (s: number, t: number) => P2
}

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]]
const dot = (a: P2, b: P2): number => a[0] * b[0] + a[1] * b[1]
const norm = (a: P2): P2 => {
  const l = Math.hypot(a[0], a[1]) || 1
  return [a[0] / l, a[1] / l]
}

export function gateFrame(mapPlan: J, tp: J): GateFrame {
  const E0: number = mapPlan.frame.E0, N0: number = mapPlan.frame.N0
  const S = (E: number, N: number): P2 => [E - E0, N0 - N]
  const w = mapPlan.walls.find((x: J) => x.id === 'precinct-east-wall')
  const a = S(w.line[0][0], w.line[0][1]), b = S(w.line[1][0], w.line[1][1])
  const d = norm(sub(b, a))
  // inward is the side away from the street (west, scene -x)
  let i: P2 = [d[1], -d[0]]
  if (i[0] > 0) i = [-i[0], -i[1]]
  const gc = S(tp.gate5.opening[0], tp.gate5.opening[1])
  const sG = dot(sub(gc, a), d)
  const thick: number = w.thick
  const at = (s: number, t: number): P2 => [a[0] + d[0] * s + i[0] * t, a[1] + d[1] * s + i[1] * t]
  return { a, d, i, thick, len: Math.hypot(b[0] - a[0], b[1] - a[1]), sG, half: tp.gate5.half, tEnd: -thick / 2 + tp.gate5.depth, at }
}

/* ── a triangle soup with the shared attribute set ── */
class Soup {
  pos: number[] = []
  kind: number[] = []
  fa: number[] = []
  fb: number[] = []
  /** the stage data every following face carries */
  stage: number[] = [0, 0, 0, 0]
  tri(p: number[][], k: number, f: number[][]): void {
    for (let j = 0; j < 3; j++) {
      this.pos.push(...p[j]!)
      this.kind.push(k)
      this.fa.push(...f[j]!)
      this.fb.push(...this.stage)
    }
  }
  /** a quad turned so its front faces `out` */
  quadOut(p: number[][], k: number, f: number[][], out: number[]): void {
    const a = p[0]!, b = p[1]!, c = p[2]!
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!]
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
    if (n[0]! * out[0]! + n[1]! * out[1]! + n[2]! * out[2]! < 0) this.quad([p[0]!, p[3]!, p[2]!, p[1]!], k, [f[0]!, f[3]!, f[2]!, f[1]!])
    else this.quad(p, k, f)
  }
  /** a triangle turned so its front faces `out` */
  triOut(p: number[][], k: number, f: number[][], out: number[]): void {
    const a = p[0]!, b = p[1]!, c = p[2]!
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!]
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
    if (n[0]! * out[0]! + n[1]! * out[1]! + n[2]! * out[2]! < 0) this.tri([a, c, b], k, [f[0]!, f[2]!, f[1]!])
    else this.tri([a, b, c], k, [f[0]!, f[1]!, f[2]!])
  }
  /** an upright box (centre x, z, yaw as the map's boxes) without its underside, every face plain */
  box(x: number, z: number, yaw: number, sx: number, sz: number, y0: number, y1: number, k: number): void {
    const c = Math.cos(yaw), s = Math.sin(yaw)
    const P = (lx: number, lz: number, y: number): number[] => [x + lx * c + lz * s, y, z - lx * s + lz * c]
    const hx = sx / 2, hz = sz / 2
    const f = Array(4).fill([x, z, 0, 0])
    const ring: Array<[number, number]> = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = ring[i]!, [x1, z1] = ring[(i + 1) % 4]!
      const m = P((x0 + x1) / 2, (z0 + z1) / 2, 0)
      this.quadOut([P(x0, z0, y0), P(x0, z0, y1), P(x1, z1, y1), P(x1, z1, y0)], k, f, [m[0]! - x, 0, m[2]! - z])
    }
    this.quadOut([P(-hx, -hz, y1), P(-hx, hz, y1), P(hx, hz, y1), P(hx, -hz, y1)], k, f, [0, 1, 0])
  }
  /** a quad p0 p1 p2 p3 (counter-clockwise seen from its front) */
  quad(p: number[][], k: number, f: number[][]): void {
    this.tri([p[0]!, p[1]!, p[2]!], k, [f[0]!, f[1]!, f[2]!])
    this.tri([p[0]!, p[2]!, p[3]!], k, [f[0]!, f[2]!, f[3]!])
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('kind', new Float32BufferAttribute(this.kind, 1))
    g.setAttribute('fa', new Float32BufferAttribute(this.fa, 4))
    g.setAttribute('fb', new Float32BufferAttribute(this.fb, 4))
    g.computeVertexNormals()
    return g
  }
}

/** a vertical prism from a plan outline (scene x, z), y0 to y1, with the shared attributes (fa zero) */
function prism(poly: P2[], y0: number, y1: number, kind: number): BufferGeometry {
  const sh = new Shape()
  sh.moveTo(poly[0]![0], -poly[0]![1])
  for (const [px, pz] of poly.slice(1)) sh.lineTo(px, -pz)
  sh.closePath()
  const e = new ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, steps: 1 })
  e.rotateX(-Math.PI / 2)
  e.translate(0, y0, 0)
  e.deleteAttribute('uv')
  const g = e.index ? e.toNonIndexed() : e
  const n = g.getAttribute('position').count
  g.setAttribute('kind', new Float32BufferAttribute(new Float32Array(n).fill(kind), 1))
  g.setAttribute('fa', new Float32BufferAttribute(new Float32Array(n * 4), 4))
  g.setAttribute('fb', new Float32BufferAttribute(new Float32Array(n * 4), 4))
  return g
}

/** an upright box as the map draws its BoxRec (centre x, z; sx along its own x turned by yaw; sz across), every face
    carrying its plan centre, its half width and the panel pitch for the tower's material */
function towerBox(b: BoxRec, kind: number, pitch: number, stage: number[] = [0, 0, 0, 0]): BufferGeometry {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw)
  // three's rotation about y: local (x, z) -> (x c + z s, -x s + z c)
  const P = (lx: number, lz: number, y: number): number[] => [b.x + lx * c + lz * s, y, b.z - lx * s + lz * c]
  const hx = b.sx / 2, hz = b.sz / 2
  const q = new Soup()
  q.stage = stage
  const fa = (half: number): number[][] => Array(4).fill([b.x, b.z, half, pitch])
  // the four sides: corners walked so each face looks outward
  const ring: Array<[number, number]> = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]
  for (let k = 0; k < 4; k++) {
    const [x0, z0] = ring[k]!, [x1, z1] = ring[(k + 1) % 4]!
    const half = k % 2 === 0 ? hx : hz
    q.quad([P(x0, z0, b.y0), P(x0, z0, b.y1), P(x1, z1, b.y1), P(x1, z1, b.y0)], kind, fa(half))
  }
  q.quad([P(-hx, -hz, b.y1), P(-hx, hz, b.y1), P(hx, hz, b.y1), P(hx, -hz, b.y1)], kind, fa(0))
  q.quad([P(-hx, -hz, b.y0), P(hx, -hz, b.y0), P(hx, hz, b.y0), P(-hx, hz, b.y0)], kind, fa(0))
  const g = q.geometry()
  fixWinding(g)
  return g
}

/** turn every triangle whose winding disagrees with the outward direction from `centre` (a convex body) */
function fixWinding(g: BufferGeometry): void {
  const p = g.getAttribute('position')
  let cx = 0, cy = 0, cz = 0
  for (let k = 0; k < p.count; k++) {
    cx += p.getX(k)
    cy += p.getY(k)
    cz += p.getZ(k)
  }
  cx /= p.count
  cy /= p.count
  cz /= p.count
  for (let k = 0; k < p.count; k += 3) {
    const ax = p.getX(k), ay = p.getY(k), az = p.getZ(k)
    const ux = p.getX(k + 1) - ax, uy = p.getY(k + 1) - ay, uz = p.getZ(k + 1) - az
    const vx = p.getX(k + 2) - ax, vy = p.getY(k + 2) - ay, vz = p.getZ(k + 2) - az
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const mx = (ax + p.getX(k + 1) + p.getX(k + 2)) / 3 - cx, my = (ay + p.getY(k + 1) + p.getY(k + 2)) / 3 - cy, mz = (az + p.getZ(k + 1) + p.getZ(k + 2)) / 3 - cz
    if (nx * mx + ny * my + nz * mz < 0) {
      for (let c = 0; c < 3; c++) {
        const t = p.getComponent(k + 1, c)
        p.setComponent(k + 1, c, p.getComponent(k + 2, c))
        p.setComponent(k + 2, c, t)
      }
    }
  }
  p.needsUpdate = true
  g.computeVertexNormals()
}

/** a slight tower: a box standing against a wall face, its back on the face, sunk below the ground */
function slightTower(F: GateFrame, s: number, t: number, along: P2, out: P2, w: number, dep: number, y0: number, y1: number): BufferGeometry {
  const c: P2 = [F.at(s, t)[0] + out[0] * dep / 2, F.at(s, t)[1] + out[1] * dep / 2]
  const yaw = Math.atan2(-along[1], along[0])
  return towerBox({ id: '', group: '', x: c[0], z: c[1], y0, y1, sx: w, sz: dep, yaw, plan: 'M', height: 'G', band: 0 }, KIND.wall, 0)
}

/** a stair as the map's ramp (a sloped solid from its foot `a` to its head `b`, down to its floor), each vertex carrying
    the foot and the run direction in steps per metre, so the material draws the treads */
function stairBody(r: Ramp, riser: number): BufferGeometry {
  const d = norm(sub(r.b, r.a)), run = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1])
  const k = Math.max(1, Math.round((r.y1 - r.y0) / riser)) / run
  const nx = -d[1] * r.w / 2, nz = d[0] * r.w / 2
  const A0 = [r.a[0] + nx, r.y0, r.a[1] + nz], A1 = [r.a[0] - nx, r.y0, r.a[1] - nz]
  const B0 = [r.b[0] + nx, r.y1, r.b[1] + nz], B1 = [r.b[0] - nx, r.y1, r.b[1] - nz]
  const fl = (p: number[]): number[] => [p[0]!, r.floor, p[2]!]
  const fa = Array(4).fill([r.a[0], r.a[1], d[0] * k, d[1] * k])
  const q = new Soup()
  q.quad([A1, A0, B0, B1], KIND.stair, fa)
  q.quad([A0, fl(A0), fl(B0), B0], KIND.stair, fa)
  q.quad([B1, fl(B1), fl(A1), A1], KIND.stair, fa)
  q.quad([B0, fl(B0), fl(B1), B1], KIND.stair, fa)
  q.quad([A1, fl(A1), fl(A0), A0], KIND.stair, fa)
  q.quad([fl(A0), fl(A1), fl(B1), fl(B0)], KIND.stair, fa)
  const g = q.geometry()
  fixWinding(g)
  return g
}

/** a stair as the dig gives it: a flight between side walls (`walls`: the side, -1 or 1 across the run, and the
    width each takes off the ramp's), their tops `above` over the flight's line, from the foot to `inset` short of the
    ramp's head (the map sinks the middle stair's head into the face); a side with no wall stands against the tower and
    draws no face. The flight carries its tread data as `stairBody`'s; a wall's outer face carries the mantle's panels. */
function flankedStair(r: Ramp, riser: number, walls: Array<{ side: number; w: number }>, above: number, inset: number, terrace: number, pitch: number, wallEnd = inset): { flight: BufferGeometry; walls: Array<{ side: number; geometry: BufferGeometry }> } {
  const d = norm(sub(r.b, r.a)), run = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1])
  const n: P2 = [-d[1], d[0]]
  const k = Math.max(1, Math.round((r.y1 - r.y0) / riser)) / run
  const fa = Array(4).fill([r.a[0], r.a[1], d[0] * k, d[1] * k])
  const at = (t: number, v: number, y: number): number[] => [r.a[0] + d[0] * run * t + n[0] * v, y, r.a[1] + d[1] * run * t + n[1] * v]
  const line = (t: number): number => r.y0 + (r.y1 - r.y0) * t
  // the walls stop `wallEnd` short of the head (inside the side stairs' landings, which then close the wall's end);
  // their panels keep the rhythm the full wall had
  const tEnd = 1 - wallEnd / run, tPanel = 1 - inset / run
  const ho = r.w / 2
  const edge = (side: number): number => side * (ho - (walls.find((w) => w.side === side)?.w ?? 0))
  const lo = edge(-1), hi = edge(1)
  const fl = new Soup()
  fl.quadOut([at(0, lo, line(0)), at(0, hi, line(0)), at(1, hi, line(1)), at(1, lo, line(1))], KIND.stair, fa, [0, 1, 0])
  fl.quadOut([at(0, lo, r.floor), at(0, hi, r.floor), at(0, hi, line(0)), at(0, lo, line(0))], KIND.stair, fa, [-d[0], 0, -d[1]])
  // an open head (a side stair's, beside the middle stair) shows its end
  if (inset === 0) fl.quadOut([at(1, lo, r.floor), at(1, hi, r.floor), at(1, hi, line(1)), at(1, lo, line(1))], KIND.stair, fa, [d[0], 0, d[1]])
  const out = walls.map(({ side }) => {
    const q = new Soup()
    const vi = edge(side), vo = side * ho
    const f0 = Array(4).fill([0, 0, 0, 0])
    const mid = at(tPanel / 2, vo, 0)
    const fp = Array(4).fill([mid[0]!, mid[2]!, (run * tPanel) / 2, pitch])
    const o: number[] = [n[0] * side, 0, n[1] * side], inn: number[] = [-n[0] * side, 0, -n[1] * side]
    q.quadOut([at(0, vi, line(0)), at(tEnd, vi, line(tEnd)), at(tEnd, vi, line(tEnd) + above), at(0, vi, line(0) + above)], KIND.cheek, f0, inn)
    q.quadOut([at(0, vo, r.floor), at(tEnd, vo, r.floor), at(tEnd, vo, line(tEnd) + above), at(0, vo, line(0) + above)], KIND.brick, fp, o)
    q.quadOut([at(0, vi, line(0) + above), at(tEnd, vi, line(tEnd) + above), at(tEnd, vo, line(tEnd) + above), at(0, vo, line(0) + above)], KIND.cheek, f0, [0, 1, 0])
    q.quadOut([at(0, vi, r.floor), at(0, vo, r.floor), at(0, vo, line(0) + above), at(0, vi, line(0) + above)], KIND.cheek, f0, [-d[0], 0, -d[1]])
    // the head: over the terrace where the stair runs into the face, whole where it stands free, none where a landing
    // closes it
    const y0h = inset > 0 ? terrace : r.floor
    if (wallEnd === inset) q.quadOut([at(tEnd, vi, y0h), at(tEnd, vo, y0h), at(tEnd, vo, line(tEnd) + above), at(tEnd, vi, line(tEnd) + above)], KIND.cheek, f0, [d[0], 0, d[1]])
    return { side, geometry: q.geometry() }
  })
  return { flight: fl.geometry(), walls: out }
}

export interface SideStairOpts {
  riser: number
  /** the foot's distance beyond the ramp's start (the dug foot beyond the tower's corner) */
  beyond: number
  /** the outer parapet's thickness and its top over the treads' nosings */
  wall: number
  above: number
  /** -1 or 1 across the run: the parapet's side, away from the tower */
  outer: number
  /** how far the inner edge runs into the tower's face, so no seam opens along it */
  sink: number
  /** the landing past the ramp's head, flat at the head's level, to the middle flight's edge */
  landing: number
  /** the parapet's setback from the mass's outer face (the ledge's width), and the mantle's panel pitch on that face */
  ledge: number
  pitch: number
  /** the middle flight's level under a point (scene x, z), where the landing's end stands on it */
  under: (x: number, z: number) => number
}

/** a side stair as built steps: a riser and a tread per step from the foot (`beyond` short of the ramp's start, at
    its level) to the ramp's head, a flat landing on to the middle flight's edge, and the parapet on the outer edge with
    its top `above` over the nosings, level over the landing. Risers stand upright (the material lays them in the bond);
    treads and the landing carry a constant phase in the tread data, so the material paints them as treads without
    drawing steps of its own on them. The flight's facts return the steps as built, for the checks. */
export function sideStair(r: Ramp, o: SideStairOpts): { flight: BufferGeometry; wall: BufferGeometry; facts: { steps: number; riser: number; tread: number; run: number; foot: P2; head: P2; end: P2; y0: number; y1: number; width: number } } {
  const d = norm(sub(r.b, r.a)), n: P2 = [-d[1], d[0]]
  const run = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) + o.beyond
  const foot: P2 = [r.a[0] - d[0] * o.beyond, r.a[1] - d[1] * o.beyond]
  const N = Math.max(1, Math.round((r.y1 - r.y0) / o.riser))
  const rr = (r.y1 - r.y0) / N, tt = run / N
  const at = (s: number, v: number, y: number): number[] => [foot[0] + d[0] * s + n[0] * v, y, foot[1] + d[1] * s + n[1] * v]
  const ho = r.w / 2
  const vIn = -o.outer * (ho + o.sink), vFace = -o.outer * ho, vi = o.outer * (ho - o.wall), vo = o.outer * ho
  const sEnd = run + o.landing
  const up = [0, 1, 0], back = [-d[0], 0, -d[1]], fwd = [d[0], 0, d[1]], out = [n[0] * o.outer, 0, n[1] * o.outer], inn = [-n[0] * o.outer, 0, -n[1] * o.outer]
  // the phase 0.31 the material reads as a tread's middle, held over the whole flight by a vanishing step rate
  const K = 1e-4
  const fT = Array(4).fill([foot[0] - (d[0] * 0.31) / K, foot[1] - (d[1] * 0.31) / K, d[0] * K, d[1] * K])
  const f0 = Array(4).fill([0, 0, 0, 0])
  const fl = new Soup()
  for (let k = 0; k < N; k++) {
    const s = k * tt, y = r.y0 + k * rr
    fl.quadOut([at(s, vIn, k === 0 ? r.floor : y), at(s, vi, k === 0 ? r.floor : y), at(s, vi, y + rr), at(s, vIn, y + rr)], KIND.stair, fT, back)
    // a tread level with the stage's top meets its face instead of running into it (no two planes on one level)
    const e = k === N - 1 ? vFace : vIn
    fl.quadOut([at(s, e, y + rr), at(s, vi, y + rr), at(s + tt, vi, y + rr), at(s + tt, e, y + rr)], KIND.stair, fT, up)
  }
  fl.quadOut([at(run, vFace, r.y1), at(run, vi, r.y1), at(sEnd, vi, r.y1), at(sEnd, vFace, r.y1)], KIND.stair, fT, up)
  // the landing's end, down onto the middle flight
  const below = (v: number): number => { const p = at(sEnd, v, 0); return o.under(p[0]!, p[2]!) - 0.05 }
  fl.quadOut([at(sEnd, vIn, below(vIn)), at(sEnd, vi, below(vi)), at(sEnd, vi, r.y1), at(sEnd, vIn, r.y1)], KIND.cheek, f0, fwd)
  // the stair's mass carries the mantle's panels up to its flight's line; on it, set back over a ledge, the parapet in
  // the stair's own brick steps with the flight, `above` over each tread (its stepped edge draws the stair where the
  // treads hide behind it), then runs level over the landing
  const yB = r.y1 + o.above, env = (s: number): number => r.y0 + o.above + (rr / tt) * s, low = (s: number): number => r.y0 + (rr / tt) * s
  const vo2 = vo - o.outer * o.ledge
  const midP = at(sEnd / 2, vo, 0)
  const fp = Array(4).fill([midP[0]!, midP[2]!, sEnd / 2, o.pitch])
  const w = new Soup()
  // the mass: its outer face, the ledge on it, its foot
  w.quadOut([at(0, vo, r.floor), at(run, vo, r.floor), at(run, vo, r.y1), at(0, vo, r.y0)], KIND.brick, fp, out)
  w.quadOut([at(run, vo, r.floor), at(sEnd, vo, r.floor), at(sEnd, vo, r.y1), at(run, vo, r.y1)], KIND.brick, fp, out)
  w.quadOut([at(0, vo2, r.y0), at(run, vo2, r.y1), at(run, vo, r.y1), at(0, vo, r.y0)], KIND.cheek, f0, up)
  w.quadOut([at(run, vo2, r.y1), at(sEnd, vo2, r.y1), at(sEnd, vo, r.y1), at(run, vo, r.y1)], KIND.cheek, f0, up)
  w.quadOut([at(0, vi, r.floor), at(0, vo, r.floor), at(0, vo, r.y0), at(0, vi, r.y0)], KIND.cheek, f0, back)
  // the parapet: inner and outer faces under the teeth, the teeth, each step's riser and top, then level
  w.quadOut([at(0, vi, low(0) - 0.05), at(run, vi, low(run) - 0.05), at(run, vi, env(run)), at(0, vi, env(0))], KIND.cheek, f0, inn)
  w.quadOut([at(0, vo2, low(0)), at(run, vo2, low(run)), at(run, vo2, env(run)), at(0, vo2, env(0))], KIND.cheek, f0, out)
  for (let k = 0; k < N; k++) {
    const s0 = k * tt, s1 = s0 + tt, y = env(s0) + rr
    for (const [v, f] of [[vi, inn], [vo2, out]] as Array<[number, number[]]>) w.triOut([at(s0, v, env(s0)), at(s1, v, env(s1)), at(s0, v, y)], KIND.cheek, f0, f)
    w.quadOut([at(s0, vi, env(s0)), at(s0, vo2, env(s0)), at(s0, vo2, y), at(s0, vi, y)], KIND.cheek, f0, back)
    w.quadOut([at(s0, vi, y), at(s0, vo2, y), at(s1, vo2, y), at(s1, vi, y)], KIND.cheek, f0, up)
  }
  w.quadOut([at(run, vi, r.y1 - 0.05), at(sEnd, vi, r.y1 - 0.05), at(sEnd, vi, yB), at(run, vi, yB)], KIND.cheek, f0, inn)
  w.quadOut([at(run, vo2, r.y1), at(sEnd, vo2, r.y1), at(sEnd, vo2, yB), at(run, vo2, yB)], KIND.cheek, f0, out)
  w.quadOut([at(run, vi, yB), at(sEnd, vi, yB), at(sEnd, vo2, yB), at(run, vo2, yB)], KIND.cheek, f0, up)
  w.quadOut([at(0, vi, r.y0), at(0, vo2, r.y0), at(0, vo2, env(0)), at(0, vi, env(0))], KIND.cheek, f0, back)
  // the head, down onto the middle flight: the mass under the parapet, then the parapet
  w.quadOut([at(sEnd, vi, below(vi)), at(sEnd, vo, below(vo)), at(sEnd, vo, r.y1), at(sEnd, vi, r.y1)], KIND.cheek, f0, fwd)
  w.quadOut([at(sEnd, vi, r.y1), at(sEnd, vo2, r.y1), at(sEnd, vo2, yB), at(sEnd, vi, yB)], KIND.cheek, f0, fwd)
  const p2 = (s: number): P2 => { const p = at(s, 0, 0); return [+p[0]!.toFixed(3), +p[2]!.toFixed(3)] }
  return { flight: fl.geometry(), wall: w.geometry(), facts: { steps: N, riser: +rr.toFixed(4), tread: +tt.toFixed(4), run: +run.toFixed(3), foot: p2(0), head: p2(run), end: p2(sEnd), y0: r.y0, y1: r.y1, width: r.w } }
}

/** the temple on the top: its box, a door in the face toward the stairs (own +x), and the stepped battlements round its
    roof as their own body; every face but the door's recess carries the panels' data */
function templeBody(b: BoxRec, pitch: number, door: { w: number; h: number; d: number; floor: number }, crest: { pitch: number; low: [number, number, number]; high: [number, number, number] }, stage: number[]): { body: BufferGeometry; crest: BufferGeometry } {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw)
  const P = (lx: number, lz: number, y: number): number[] => [b.x + lx * c + lz * s, y, b.z - lx * s + lz * c]
  const dir = (lx: number, lz: number): number[] => [lx * c + lz * s, 0, -lx * s + lz * c]
  const hx = b.sx / 2, hz = b.sz / 2
  const q = new Soup()
  q.stage = stage
  const fa = (half: number): number[][] => Array(4).fill([b.x, b.z, half, pitch])
  const plain = Array(4).fill([b.x, b.z, 0, pitch])
  // the three plain sides
  q.quadOut([P(-hx, -hz, b.y0), P(hx, -hz, b.y0), P(hx, -hz, b.y1), P(-hx, -hz, b.y1)], KIND.glaze, fa(hx), dir(0, -1))
  q.quadOut([P(-hx, hz, b.y0), P(hx, hz, b.y0), P(hx, hz, b.y1), P(-hx, hz, b.y1)], KIND.glaze, fa(hx), dir(0, 1))
  q.quadOut([P(-hx, -hz, b.y0), P(-hx, hz, b.y0), P(-hx, hz, b.y1), P(-hx, -hz, b.y1)], KIND.glaze, fa(hz), dir(-1, 0))
  // the face toward the stairs, round its door
  const dw = door.w / 2, yd = door.floor + door.h, X = hx, Xb = hx - door.d
  q.quadOut([P(X, -hz, b.y0), P(X, -dw, b.y0), P(X, -dw, b.y1), P(X, -hz, b.y1)], KIND.glaze, fa(hz), dir(1, 0))
  q.quadOut([P(X, dw, b.y0), P(X, hz, b.y0), P(X, hz, b.y1), P(X, dw, b.y1)], KIND.glaze, fa(hz), dir(1, 0))
  q.quadOut([P(X, -dw, yd), P(X, dw, yd), P(X, dw, b.y1), P(X, -dw, b.y1)], KIND.glaze, fa(hz), dir(1, 0))
  // the recess: its back the door, its sides and the lintel's underside plain glaze
  q.quadOut([P(Xb, -dw, door.floor), P(Xb, dw, door.floor), P(Xb, dw, yd), P(Xb, -dw, yd)], KIND.door, plain, dir(1, 0))
  q.quadOut([P(Xb, -dw, door.floor), P(X, -dw, door.floor), P(X, -dw, yd), P(Xb, -dw, yd)], KIND.glaze, plain, dir(0, 1))
  q.quadOut([P(Xb, dw, door.floor), P(X, dw, door.floor), P(X, dw, yd), P(Xb, dw, yd)], KIND.glaze, plain, dir(0, -1))
  q.quadOut([P(Xb, -dw, yd), P(X, -dw, yd), P(X, dw, yd), P(Xb, dw, yd)], KIND.glaze, plain, [0, -1, 0])
  q.quadOut([P(-hx, -hz, b.y1), P(-hx, hz, b.y1), P(hx, hz, b.y1), P(hx, -hz, b.y1)], KIND.glaze, fa(0), [0, 1, 0])
  q.quadOut([P(-hx, -hz, b.y0), P(-hx, hz, b.y0), P(hx, hz, b.y0), P(hx, -hz, b.y0)], KIND.glaze, fa(0), [0, -1, 0])
  // the battlements: a broad lower tier and a narrow upper one along each edge, their outer faces 5 cm inside it
  const cr = new Soup()
  cr.stage = stage
  const edges: Array<[number, number, number, number, number]> = [[-hx, -hz, hx, -hz, 1], [hx, -hz, hx, hz, 1], [hx, hz, -hx, hz, 1], [-hx, hz, -hx, -hz, 1]]
  for (const [x0, z0, x1, z1] of edges) {
    const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len
    // inward in the box's own frame
    const ix = -uz, iz = ux
    const count = Math.max(1, Math.floor((len - crest.low[1]) / crest.pitch))
    const step = (len - crest.low[1]) / count
    for (let k = 0; k <= count; k++) {
      const along = crest.low[1] / 2 + step * k
      for (const [w, dpt, h, y0] of [[crest.low[0], crest.low[1], crest.low[2], b.y1], [crest.high[0], crest.high[1], crest.high[2], b.y1 + crest.low[2]]] as Array<[number, number, number, number]>) {
        const lx = x0 + ux * along + ix * (dpt / 2 + 0.05), lz = z0 + uz * along + iz * (dpt / 2 + 0.05)
        const wc = P(lx, lz, 0)
        // the box's own x along the edge: the yaw of the edge in the scene
        const ed = dir(ux, uz)
        cr.box(wc[0]!, wc[2]!, Math.atan2(-ed[2]!, ed[0]!), w, dpt, y0, y0 + h, KIND.glaze)
      }
    }
  }
  return { body: q.geometry(), crest: cr.geometry() }
}

/** the map prisms and boxes this module draws on the map page instead of the map */
export const TAKEN_PRISM = (id: string): boolean => id.startsWith('precinct-')
export const TAKEN_BOX = (id: string): boolean => id.startsWith('tower-stage-')
export const TAKEN_RAMP = (id: string): boolean => id.startsWith('tower-stair-')

export interface Tower { F: GateFrame; bodies: TowerBody[]; built: Built; facts: Record<string, unknown> }

/** the stop's bodies, and the map's plan without the bodies they replace (pass that one on to buildBodies) */
export function buildTower(built: Built, mapPlan: J, tp: J): Tower {
  const F = gateFrame(mapPlan, tp)
  const BAND: number = mapPlan.classes.band
  const bodies: TowerBody[] = []
  const g = (x: number, z: number): number => built.ground(x, z)
  const W = tp.wall
  const top: number = W.top
  const out = -F.thick / 2, inn = F.thick / 2
  const { sG, half, tEnd } = F
  const back: number = W.store.back

  /* ── the precinct's east wall: north and south of the opening, each with its recess side and its store block ── */
  const north: P2[] = [F.at(0, out), F.at(sG - half, out), F.at(sG - half, tEnd), F.at(sG - half - back, tEnd), F.at(sG - half - back, inn), F.at(0, inn)]
  const south: P2[] = [F.at(sG + half, out), F.at(F.len, out), F.at(F.len, inn), F.at(sG + half + back, inn), F.at(sG + half + back, tEnd), F.at(sG + half, tEnd)]
  const wallLetters: [Cls, Cls] = ['M', 'G']
  const wallBand = g(...F.at(sG, out - 4)) + BAND
  bodies.push({ id: 'precinct-east-n', geometry: prism(north, 0, top, KIND.wall), band: wallBand, letters: wallLetters })
  bodies.push({ id: 'precinct-east-s', geometry: prism(south, 0, top, KIND.wall), band: wallBand, letters: wallLetters })
  // the precinct's other walls and rooms keep the map's outlines and heights, drawn in the same plaster
  for (const p of built.prisms.filter((q) => TAKEN_PRISM(q.id) && !/^precinct-(east-wall|ne-block|se-block)/.test(q.id))) {
    // the south rooms overlap the west rooms and the east wall at their corners: their roofs 3 cm lower, so no two
    // roofs fight in depth where the flight looks down on them
    const y1 = p.id.startsWith('precinct-south-rooms') ? p.y1 - 0.03 : p.y1
    bodies.push({ id: p.id, geometry: prism(p.poly, p.y0, y1, KIND.wall), band: wallBand, letters: [p.plan, p.height] })
  }

  /* ── the slight towers: on the street face, and on both sides of the recess ── */
  const T = W.towers
  const minG = (pts: P2[]): number => Math.min(...pts.map((p) => g(p[0], p[1])))
  const outward: P2 = [-F.i[0], -F.i[1]]
  let n = 0
  const tower = (s: number, t: number, along: P2, o: P2): void => {
    const c = F.at(s, t)
    const corners: P2[] = ([[-1, 0], [1, 0], [-1, 1], [1, 1]] as Array<[number, number]>).map(([u, v]) => [c[0] + along[0] * u * T.w / 2 + o[0] * v * T.out, c[1] + along[1] * u * T.w / 2 + o[1] * v * T.out])
    const geo = slightTower(F, s, t, along, o, T.w, T.out, minG(corners) - 0.4, top + T.over)
    bodies.push({ id: `precinct-tower-${++n}`, geometry: geo, band: wallBand, letters: wallLetters })
  }
  for (let s = T.pitch / 2 + 4; s < sG - half - T.w; s += T.pitch) tower(s, out, F.d, outward)
  for (let s = sG + half + T.w + T.pitch / 2; s < F.len - T.pitch / 2; s += T.pitch) tower(s, out, F.d, outward)
  const inward: P2 = F.i
  for (let t = out + T.pitch / 2 + 2; t < tEnd - T.w; t += T.pitch) {
    tower(sG - half, t, inward, F.d)
    tower(sG + half, t, inward, [-F.d[0], -F.d[1]])
  }

  /* ── the threshold at the recess's inner end: the destroyed gate's place, flush with the court, no height ── */
  {
    const q = [F.at(sG - half, tEnd - 2), F.at(sG + half, tEnd - 2), F.at(sG + half, tEnd), F.at(sG - half, tEnd)]
    const y1 = Math.max(...q.map((p) => g(p[0], p[1]))) + 0.12
    bodies.push({ id: 'gate5-threshold', geometry: prism(q, minG(q) - 0.4, y1, KIND.threshold), band: 1e6, letters: ['G', 'G'] })
  }

  /* ── the street's paving: the map's street points from..to, its own triangles 5 cm over the map's, split where
     the dug stretch before the entrance ends ── */
  const ST = tp.street
  const pts = built.street.slice(ST.from, ST.to + 1)
  const prev = built.street[ST.from - 1] ?? pts[0]!, next = built.street[ST.to + 1] ?? pts[pts.length - 1]!
  const edges = pts.map((p, k) => {
    const a = k === 0 ? prev : pts[k - 1]!, b = k === pts.length - 1 ? next : pts[k + 1]!
    const dd = norm([b.x - a.x, b.z - a.z])
    const nn: P2 = [-dd[1] * p.w / 2, dd[0] * p.w / 2]
    return { l: [p.x + nn[0], p.level, p.z + nn[1]], r: [p.x - nn[0], p.level, p.z - nn[1]], w: p.w }
  })
  const axisAt = F.at(sG, out)
  const LIFT = 0.05
  const dug = new Soup(), rest = new Soup()
  let sAcc = 0, sSplit = 0
  // where the opening's axis crosses the street: the along-distance of the nearest edge midpoint, then the split
  {
    let best = 1e9, acc = 0
    for (let k = 0; k + 1 < pts.length; k++) {
      const L = Math.hypot(pts[k + 1]!.x - pts[k]!.x, pts[k + 1]!.z - pts[k]!.z)
      for (let u = 0; u <= 1; u += 0.002) {
        const x = pts[k]!.x + (pts[k + 1]!.x - pts[k]!.x) * u, z = pts[k]!.z + (pts[k + 1]!.z - pts[k]!.z) * u
        const dd = Math.abs(dot(sub([x, z], axisAt), F.d))
        if (dd < best) {
          best = dd
          sSplit = acc + L * u
        }
      }
      acc += L
    }
    sSplit += ST.split
  }
  const lerp3 = (a: number[], b: number[], u: number): number[] => a.map((v, c) => v + (b[c]! - v) * u)
  for (let k = 0; k + 1 < pts.length; k++) {
    const L = Math.hypot(pts[k + 1]!.x - pts[k]!.x, pts[k + 1]!.z - pts[k]!.z)
    const steps = Math.max(1, Math.ceil(L / 6))
    for (let st = 0; st < steps; st++) {
      const u0 = st / steps, u1 = (st + 1) / steps
      const l0 = lerp3(edges[k]!.l, edges[k + 1]!.l, u0), l1 = lerp3(edges[k]!.l, edges[k + 1]!.l, u1)
      const r0 = lerp3(edges[k]!.r, edges[k + 1]!.r, u0), r1 = lerp3(edges[k]!.r, edges[k + 1]!.r, u1)
      const w0 = edges[k]!.w + (edges[k + 1]!.w - edges[k]!.w) * u0, w1 = edges[k]!.w + (edges[k + 1]!.w - edges[k]!.w) * u1
      const s0 = sAcc + L * u0, s1 = sAcc + L * u1
      const up = (p: number[]): number[] => [p[0]!, p[1]! + LIFT, p[2]!]
      const into = s0 < sSplit ? dug : rest
      // left is the west edge (t 0), right the east (t w); the top wound to face up, each lip to face away from the middle
      into.quad([up(l0), up(l1), up(r1), up(r0)], KIND.street, [[s0, 0, w0, 0], [s1, 0, w1, 0], [s1, w1, w1, 0], [s0, w0, w0, 0]])
      into.quad([l1, up(l1), up(l0), l0], KIND.street, [[s1, 0, w1, 1], [s1, 0, w1, 1], [s0, 0, w0, 1], [s0, 0, w0, 1]])
      into.quad([r0, up(r0), up(r1), r1], KIND.street, [[s0, w0, w0, 1], [s0, w0, w0, 1], [s1, w1, w1, 1], [s1, w1, w1, 1]])
    }
    sAcc += L
  }
  const streetGeo = (q: Soup): BufferGeometry => q.geometry()
  bodies.push({ id: 'gate5-street-dug', geometry: streetGeo(dug), band: 1e6, letters: ['M', 'M'] })
  bodies.push({ id: 'gate5-street-south', geometry: streetGeo(rest), band: 1e6, letters: ['R', 'R'] })

  /* ── Etemenanki: the map's stages, each face with its panels' data; the top a glazed temple ── */
  const stages = built.boxes.filter((b) => TAKEN_BOX(b.id))
  const PN = tp.tower.panels
  const towerGround = g(stages[0]!.x, stages[0]!.z)
  const TT = tp.tower
  for (const b of stages) {
    const k = Number(b.id.split('-').pop())
    // the stage's visible foot: the court for the first, the terrace below for the rest
    const stage = [k === 1 ? towerGround : b.y0 + 0.05, b.y1, k, 0]
    if (k === stages.length && TT.temple.glaze) {
      const t = templeBody(b, PN.pitch1, { ...TT.temple.door, floor: b.y0 + 0.05 }, TT.temple.crest, stage)
      bodies.push({ id: b.id, geometry: t.body, band: -1, letters: [b.plan, b.height] })
      bodies.push({ id: 'tower-top-crest', geometry: t.crest, band: -1, letters: [b.plan, b.height] })
      continue
    }
    // about 13 panels a side on the first stage; the upper stages keep its pitch, so the rhythm runs up the tower
    bodies.push({ id: b.id, geometry: towerBox(b, KIND.brick, PN.pitch1, stage), band: k === 1 ? towerGround + BAND : -1, letters: [b.plan, b.height] })
  }
  // the three stairs up to the first stage's top, on the map's ramps: the middle one a flight between its side walls,
  // the side ones from a foot beyond the tower's corner (the west one's dug foot lies 1.9 m west of the tower)
  const stairs = built.ramps.filter((r) => TAKEN_RAMP(r.id))
  const terrace = stages[0]!.y1
  const MS = TT.stairs.middle, SS = TT.stairs.side
  const centre: P2 = [stages[0]!.x, stages[0]!.z]
  // the middle flight: its line under any point, and the side stairs' outer edge, where its walls end in their landings
  const mid = stairs.find((r) => r.id === 'tower-stair-middle')!
  const dM = norm(sub(mid.b, mid.a)), runM = Math.hypot(mid.b[0] - mid.a[0], mid.b[1] - mid.a[1]), nM: P2 = [-dM[1], dM[0]]
  const under = (x: number, z: number): number => mid.y0 + (mid.y1 - mid.y0) * Math.min(1, Math.max(0, dot(sub([x, z], mid.a), dM) / runM))
  const sides = stairs.filter((r) => r !== mid)
  const wallEnd = Math.max(...sides.map((r) => dot(sub(r.a, mid.b), [-dM[0], -dM[1]]) + r.w / 2))
  const sideFacts: Record<string, unknown> = {}
  for (const r of stairs) {
    const middle = r === mid
    if (middle) {
      const walls = [{ side: -1, w: (r.w - MS.clear) / 2 }, { side: 1, w: (r.w - MS.clear) / 2 }]
      const st = flankedStair(r, TT.stairs.riser, walls, MS.above, MS.inset, terrace, PN.pitch1, wallEnd)
      bodies.push({ id: r.id, geometry: st.flight, band: r.band, letters: [r.plan, r.height] })
      for (const w of st.walls) {
        const g0 = w.geometry
        g0.computeBoundingBox()
        const name = (g0.boundingBox!.min.x + g0.boundingBox!.max.x) / 2 > (r.a[0] + r.b[0]) / 2 ? 'e' : 'w'
        bodies.push({ id: `${r.id}-wall-${name}`, geometry: g0, band: r.band, letters: [r.plan, r.height] })
      }
      continue
    }
    // a side stair's parapet stands on its outer edge, away from the tower; its landing runs on to the middle flight
    const d = norm(sub(r.b, r.a)), n: P2 = [-d[1], d[0]], m: P2 = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2]
    const outer = dot(sub(m, centre), n) > 0 ? 1 : -1
    const landing = Math.abs(dot(sub(r.b, mid.a), nM)) - MS.clear / 2
    const st = sideStair(r, { riser: TT.stairs.riser, beyond: SS.beyond, wall: SS.wall, above: SS.above, outer, sink: SS.sink, ledge: SS.ledge, pitch: PN.pitch1, landing, under })
    bodies.push({ id: r.id, geometry: st.flight, band: r.band, letters: [r.plan, r.height] })
    bodies.push({ id: `${r.id}-wall-outer`, geometry: st.wall, band: r.band, letters: [r.plan, r.height] })
    // in the tower's own frame: out along the middle stair's axis, across it
    const uv = (p: P2): number[] => [+dot(sub(p, centre), [-dM[0], -dM[1]]).toFixed(3), +dot(sub(p, centre), nM).toFixed(3)]
    sideFacts[r.id] = { ...st.facts, landing: +landing.toFixed(3), footUV: uv(st.facts.foot), headUV: uv(st.facts.head), endUV: uv(st.facts.end), outerU: +(dot(sub(m, centre), [-dM[0], -dM[1]]) + r.w / 2).toFixed(3), clear: MS.clear }
  }

  const facts = {
    opening: +(2 * half).toFixed(2),
    recessDepth: +(tEnd - out).toFixed(2),
    wallTop: top,
    towers: n,
    street: { dugTo: +sSplit.toFixed(1), width: pts.map((p) => p.w) },
    stages: stages.map((b) => ({ id: b.id, side: b.sx, across: b.sz, y0: b.y0, y1: b.y1 })),
    gateToTower: +Math.hypot(stages[0]!.x - axisAt[0], stages[0]!.z - axisAt[1]).toFixed(1),
    stairs: stairs.map((r) => ({ id: r.id, w: r.w, rise: +(r.y1 - r.y0).toFixed(2), run: +Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]).toFixed(2) })),
    sideStairs: sideFacts,
    middleWallsEnd: +wallEnd.toFixed(3),
  }
  return {
    F, bodies, facts,
    built: { ...built, prisms: built.prisms.filter((p) => !TAKEN_PRISM(p.id)), boxes: built.boxes.filter((b) => !TAKEN_BOX(b.id)), ramps: built.ramps.filter((r) => !TAKEN_RAMP(r.id)) },
  }
}
