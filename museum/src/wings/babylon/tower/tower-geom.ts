/* STOP 9'S BODIES, pure geometry (three's buffers, no DOM), so the map page and the node checks build the same: the
   precinct's east wall with Gate 5's recess and the store blocks either side, their slight towers, the threshold at the
   recess's inner end, the street's paving before the gate, and Etemenanki's stages drawn with their faces' own data.
   Scene frame as plan.ts (x east, y up, z south). Every body carries one attribute set, so the page merges them into one
   mesh: `kind` (0 plaster wall, 1 tower brick, 2 the glazed temple, 3 the street, 4 the threshold, 5 a stair) and `fa`
   (per kind: the tower's face centre in plan, its half width and panel pitch; the street's along and across metres; a
   stair's foot and its run direction scaled to steps per metre).
   Only type imports from the wing: node resolves no relative module without its extension. */

import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape } from 'three/webgpu'
import type { BoxRec, Built, Cls, P2, Ramp } from '../map/plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

export const KIND = { wall: 0, brick: 1, glaze: 2, street: 3, threshold: 4, stair: 5 } as const

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
  tri(p: number[][], k: number, f: number[][]): void {
    for (let j = 0; j < 3; j++) {
      this.pos.push(...p[j]!)
      this.kind.push(k)
      this.fa.push(...f[j]!)
    }
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
  return g
}

/** an upright box as the map draws its BoxRec (centre x, z; sx along its own x turned by yaw; sz across), every face
    carrying its plan centre, its half width and the panel pitch for the tower's material */
function towerBox(b: BoxRec, kind: number, pitch: number): BufferGeometry {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw)
  // three's rotation about y: local (x, z) -> (x c + z s, -x s + z c)
  const P = (lx: number, lz: number, y: number): number[] => [b.x + lx * c + lz * s, y, b.z - lx * s + lz * c]
  const hx = b.sx / 2, hz = b.sz / 2
  const q = new Soup()
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
    bodies.push({ id: p.id, geometry: prism(p.poly, p.y0, p.y1, KIND.wall), band: wallBand, letters: [p.plan, p.height] })
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
  for (const b of stages) {
    const k = Number(b.id.split('-').pop())
    const glazed = k === stages.length && tp.tower.temple.glaze
    // about 13 panels a side on the first stage; the upper stages keep its pitch, so the rhythm runs up the tower
    const geo = towerBox(b, glazed ? KIND.glaze : KIND.brick, PN.pitch1)
    bodies.push({ id: b.id, geometry: geo, band: k === 1 ? towerGround + BAND : -1, letters: [b.plan, b.height] })
  }
  // the three stairs up to the first stage's top, on the map's ramps
  const stairs = built.ramps.filter((r) => TAKEN_RAMP(r.id))
  for (const r of stairs) bodies.push({ id: r.id, geometry: stairBody(r, tp.tower.stairs.riser), band: r.band, letters: [r.plan, r.height] })

  const facts = {
    opening: +(2 * half).toFixed(2),
    recessDepth: +(tEnd - out).toFixed(2),
    wallTop: top,
    towers: n,
    street: { dugTo: +sSplit.toFixed(1), width: pts.map((p) => p.w) },
    stages: stages.map((b) => ({ id: b.id, side: b.sx, across: b.sz, y0: b.y0, y1: b.y1 })),
    gateToTower: +Math.hypot(stages[0]!.x - axisAt[0], stages[0]!.z - axisAt[1]).toFixed(1),
    stairs: stairs.map((r) => ({ id: r.id, w: r.w, rise: +(r.y1 - r.y0).toFixed(2), run: +Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]).toFixed(2) })),
  }
  return {
    F, bodies, facts,
    built: { ...built, prisms: built.prisms.filter((p) => !TAKEN_PRISM(p.id)), boxes: built.boxes.filter((b) => !TAKEN_BOX(b.id)), ramps: built.ramps.filter((r) => !TAKEN_RAMP(r.id)) },
  }
}
