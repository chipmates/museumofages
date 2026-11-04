/* STOP 5'S BODIES, pure geometry (three's buffers, no DOM), so the map page and the node checks build the same: the
   vaulted building as its own block in the South Palace's north-east corner (a hole in the palace's rooms over it), the
   North Palace on its terrace with its two courts and principal rooms, the edge terraces and their stairs. Scene frame
   as plan.ts (x east, y up, z south). Only type imports from the wing: node resolves no relative module without its
   extension. */

import { BoxGeometry, BufferGeometry, ExtrudeGeometry, Path, Shape } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Built, Cls, P2, Prism } from '../map/plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

/** how a body is drawn (gardens-mat.ts): palace brick and roofs, the terrace and its garden tops, the courts' paving,
    the vaulted building's roofs, stairs */
export const LOOK = { palace: 0, terrace: 1, garden: 2, paving: 3, vaulted: 4, stair: 5 } as const
export type Look = (typeof LOOK)[keyof typeof LOOK]

export interface GardenBody {
  id: string
  geometry: BufferGeometry
  band: number
  letters: [Cls, Cls]
  look: Look
  /** the garden's own bodies (the edge terraces and their stairs), which the bare switch keeps and the dug switch drops */
  garden: boolean
}

export interface Strip { id: string; level: number; x0: number; x1: number; z0: number; z1: number; out: 'w' | 'n' }

const area = (p: P2[]): number => {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}
/** a hole wound against its outline: three's extrusion turns a hole's faces outward only then */
const against = (outline: P2[], hole: P2[]): P2[] => (Math.sign(area(outline)) === Math.sign(area(hole)) ? [...hole].reverse() : hole)

/** a vertical prism from a plan outline (scene x, z) with holes, y0 to y1, as mass.ts extrudes the map's */
export function prism(poly: P2[], y0: number, y1: number, holes: P2[][] = []): BufferGeometry {
  const sh = new Shape()
  sh.moveTo(poly[0]![0], -poly[0]![1])
  for (const [px, pz] of poly.slice(1)) sh.lineTo(px, -pz)
  sh.closePath()
  for (const h of holes) {
    const hh = against(poly, h)
    const p = new Path()
    p.moveTo(hh[0]![0], -hh[0]![1])
    for (const [px, pz] of hh.slice(1)) p.lineTo(px, -pz)
    p.closePath()
    sh.holes.push(p)
  }
  const g = new ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, steps: 1 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  g.deleteAttribute('uv')
  return g.index ? g.toNonIndexed() : g
}
const rect = (x0: number, x1: number, z0: number, z1: number): P2[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]

/** an outline moved inward by d along each edge's normal (convex outlines, as the plan's are here) */
export function inset(poly: P2[], d: number): P2[] {
  const s = Math.sign(area(poly))
  const n = poly.length
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n]!
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz)
    // the inward normal of a counter-clockwise outline (in x, z) is (-dz, dx)
    const nx = (-dz / l) * s, nz = (dx / l) * s
    return { p: [a[0] + nx * d, a[1] + nz * d] as P2, d: [dx / l, dz / l] as P2 }
  })
  return lines.map((L, i) => {
    const M = lines[(i + n - 1) % n]!
    // where the previous edge's moved line meets this one's
    const den = M.d[0] * L.d[1] - M.d[1] * L.d[0]
    if (Math.abs(den) < 1e-9) return L.p
    const t = ((L.p[0] - M.p[0]) * L.d[1] - (L.p[1] - M.p[1]) * L.d[0]) / den
    return [M.p[0] + M.d[0] * t, M.p[1] + M.d[1] * t] as P2
  })
}

/** how far (x, z) lies outside a polygon, 0 inside */
export function outside(poly: P2[], x: number, z: number): number {
  let inside = false, d = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
    const ex = b[0] - a[0], ez = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez)))
    d = Math.min(d, Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t))
  }
  return inside ? 0 : d
}

/** a flight of stairs as boxes: from (x, z) at level `top` down to `low`, running along the unit direction (dx, dz), w wide */
function flight(x: number, z: number, dx: number, dz: number, top: number, low: number, w: number, tread: number, riser: number, foot: number): BufferGeometry {
  const n = Math.max(2, Math.round((top - low) / riser))
  const r = (top - low) / n
  const yaw = Math.atan2(dx, dz)
  const parts: BufferGeometry[] = []
  // each step a block from the foot up to its tread, so the flight is solid; the top tread a riser under `top`, the last
  // a riser over `low` (the lower terrace is the last step: no tread lies in its plane)
  for (let i = 0; i < n - 1; i++) {
    const yTop = top - r * (i + 1)
    const b = new BoxGeometry(w, yTop - foot, tread)
    b.translate(0, (yTop + foot) / 2, tread * (i + 0.5))
    b.rotateY(yaw)
    b.translate(x, 0, z)
    parts.push(b.index ? b.toNonIndexed() : b)
  }
  const g = mergeGeometries(parts)!
  g.deleteAttribute('uv')
  return g
}

export interface GardensFrame {
  E0: number; N0: number; strips: Strip[]; vaultedUnit: P2[]; vaultedCore: P2[]
  /** the cells block's passage in plan, for the roof's drawing of it */
  cells: { o: [number, number]; a: [number, number]; c: [number, number]; len: number; cells: number; top: number }
}

/** the map prisms this module draws on the map page instead of the map */
export const TAKEN = (id: string): boolean => id === 'north-palace-main' || id === 'north-palace-terrace' || id.startsWith('gardens-edge-')

export interface Gardens { F: GardensFrame; bodies: GardenBody[]; built: Built; facts: Record<string, unknown> }

/** the stop's bodies, and the map's plan without the prisms they replace and with the vaulted building's hole in the
    South Palace's rooms (pass that one on to the court and then to buildBodies) */
export function buildGardens(built: Built, mapPlan: J, gp: J): Gardens {
  const E0: number = mapPlan.frame.E0, N0: number = mapPlan.frame.N0
  const s = (E: number, N: number): P2 => [+(E - E0).toFixed(4), +(N0 - N).toFixed(4)]
  const BAND: number = mapPlan.classes.band
  const bodies: GardenBody[] = []
  const add = (id: string, geometry: BufferGeometry, band: number, letters: [Cls, Cls], look: Look, garden = false): void => {
    bodies.push({ id, geometry, band, letters, look, garden })
  }
  const byId = (id: string): Prism | undefined => built.prisms.find((p) => p.id === id)

  /* ── the vaulted building: its own block where the palace's rooms are opened over it ── */
  const V = gp.vaulted
  const unit: P2[] = V.unit.map((p: number[]) => s(p[0]!, p[1]!))
  const core: P2[] = V.core.map((p: number[]) => s(p[0]!, p[1]!))
  const vLetters: [Cls, Cls] = ['M', 'G']
  const ring = inset(unit, V.parapet.t)
  // the unit's body to its deck: the plan's band on its few visible decimetres, the deck itself above it (guessed)
  add('vaulted-unit', prism(unit, V.foot, V.deck), V.deck - 0.02, vLetters, LOOK.vaulted)
  // the parapet on the drawn outline: the plan as dug, shown whole in the plan's class
  add('vaulted-outline', prism(unit, V.deck, V.parapet.top, [ring]), V.parapet.top + 1, vLetters, LOOK.vaulted)
  add('vaulted-core', prism(core, V.deck, V.coreTop), V.deck, vLetters, LOOK.vaulted)
  const out: Prism[] = built.prisms.filter((p) => !TAKEN(p.id)).map((p) => (p.id === 'south-palace-rooms' ? { ...p, holes: [...p.holes, against(p.poly, unit)] } : p))

  /* ── the North Palace: its terrace, its main building with the courts open and the principal rooms raised ── */
  const NP = gp.northPalace
  const terrace = byId('north-palace-terrace'), main = byId('north-palace-main')
  if (!terrace || !main) throw new Error('the map plan has no north-palace-terrace or north-palace-main')
  add('north-palace-terrace', prism(terrace.poly, terrace.y0, terrace.y1), terrace.y0 + BAND, [terrace.plan, terrace.height], LOOK.terrace)
  const box = (r: number[]): P2[] => rect(r[0]! - E0, r[1]! - E0, N0 - r[3]!, N0 - r[2]!)
  const courts: P2[][] = NP.courts.map((c: J) => box(c.rect))
  const halls: P2[][] = NP.halls.map((h: J) => box(h.rect))
  const mainLetters: [Cls, Cls] = [main.plan, main.height]
  add('north-palace-main', prism(main.poly, NP.floor, NP.roof, [...courts, ...halls]), NP.floor + BAND, mainLetters, LOOK.palace)
  const pRing = inset(main.poly, NP.parapet.t)
  add('north-palace-parapet', prism(main.poly, NP.roof, NP.roof + NP.parapet.h, [pRing]), NP.roof, mainLetters, LOOK.palace)
  NP.halls.forEach((h: J, i: number) => {
    const poly = halls[i]!
    add(h.id, prism(poly, NP.floor, NP.hallTop), NP.floor + BAND, mainLetters, LOOK.palace)
    add(`${h.id}-parapet`, prism(poly, NP.hallTop, NP.hallTop + NP.parapet.h * 0.8, [inset(poly, NP.parapet.t * 0.8)]), NP.hallTop, mainLetters, LOOK.palace)
  })
  NP.courts.forEach((c: J, i: number) => {
    // the paving sunk into the terrace under it, so none of its faces is a sliver over the terrace's top
    add(c.id, prism(courts[i]!, NP.floor - NP.paving.sunk, NP.floor + NP.paving.top), 1e6, [main.plan, main.plan], LOOK.paving)
  })

  /* ── the edge terraces, as the map draws them, and their stairs ── */
  const edges = built.prisms.filter((p) => p.id.startsWith('gardens-edge-'))
  for (const e of edges) add(e.id, prism(e.poly, e.y0, e.y1), e.y0 + BAND, [e.plan, e.height], LOOK.garden, true)
  const T = gp.terraces
  const strips: Strip[] = T.strips.map((t: J) => {
    const [xa, za] = s(t.e[0], t.n[1]), [xb, zb] = s(t.e[1], t.n[0])
    return { id: t.id, level: t.level, x0: xa, x1: xb, z0: za, z1: zb, out: t.out }
  })
  const levels = [NP.floor, ...edges.map((e) => e.y1).sort((a, b) => b - a), 0]
  const west = strips.filter((t) => t.out === 'w').sort((a, b) => b.level - a.level)
  const north = strips.filter((t) => t.out === 'n').sort((a, b) => b.level - a.level)
  const stairW = T.stairs.find((x: J) => x.id === 'garden-stair-w'), stairN = T.stairs.find((x: J) => x.id === 'garden-stair-n')
  const flights: BufferGeometry[] = []
  const flightsN: BufferGeometry[] = []
  if (stairW) {
    const z = N0 - stairW.n
    // from each level down to the next, westward, starting at the higher strip's outer edge
    const edgesX = [main.poly.reduce((m, p) => Math.min(m, p[0]), Infinity), ...west.map((t) => t.x0)]
    // from +13 down to +4: the +15 floor's edge is the palace's wall, and below +4 lies the plain
    for (let i = 1; i < levels.length - 2; i++) {
      const top = levels[i]!, low = levels[i + 1]!
      const x = edgesX[i]!
      flights.push(flight(x, z, -1, 0, top, low, stairW.w, T.tread, T.riser, low - 0.3))
    }
  }
  if (stairN) {
    const x = stairN.e - E0
    // along the face on the north side: each flight runs east to west against the higher strip's wall
    const edgesZ = [main.poly.reduce((m, p) => Math.min(m, p[1]), Infinity), ...north.map((t) => t.z0)]
    for (let i = 1; i < levels.length - 2; i++) {
      const top = levels[i]!, low = levels[i + 1]!
      const z = edgesZ[i]! - stairN.w / 2
      flightsN.push(flight(x, z, -1, 0, top, low, stairN.w, T.tread, T.riser, low - 0.3))
    }
  }
  if (flights.length) add('garden-stair-w', mergeGeometries(flights)!, -1e6, ['G', 'G'], LOOK.stair, true)
  if (flightsN.length) add('garden-stair-n', mergeGeometries(flightsN)!, -1e6, ['G', 'G'], LOOK.stair, true)

  /* ── the ground round the terraces at the canal's embankment, climbing back to the map's field outside ── */
  const G = gp.ground
  const zone: P2[] = G.poly.map((p: number[]) => s(p[0]!, p[1]!))
  const field = built.ground
  const ground = (x: number, z: number): number => Math.min(field(x, z), G.level + G.slope * outside(zone, x, z))

  const areaOf = (p: P2[]): number => +Math.abs(area(p)).toFixed(1)
  const span = (p: P2[], k: 0 | 1): number => +(Math.max(...p.map((q) => q[k])) - Math.min(...p.map((q) => q[k]))).toFixed(2)
  const facts = {
    vaulted: { unitArea: areaOf(unit), coreArea: areaOf(core), unitSpan: [span(unit, 0), span(unit, 1)], deck: V.deck, coreTop: V.coreTop, parapetTop: V.parapet.top },
    northPalace: {
      outline: [span(main.poly, 0), span(main.poly, 1)],
      courts: courts.map((c) => [span(c, 0), span(c, 1)]),
      halls: halls.map((h) => [span(h, 0), span(h, 1)]),
      floor: NP.floor, roof: NP.roof, hallTop: NP.hallTop,
    },
    terraces: { levels, strips: strips.map((t) => ({ id: t.id, level: t.level, w: +(t.x1 - t.x0).toFixed(2), d: +(t.z1 - t.z0).toFixed(2) })) },
  }
  // the passage from the middle of the cells block's north side to the middle of its south side
  const mid = (a: P2, b: P2): P2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const pn = mid(core[0]!, core[1]!), ps = mid(core[3]!, core[2]!)
  const L = Math.hypot(ps[0] - pn[0], ps[1] - pn[1])
  const ax: [number, number] = [(ps[0] - pn[0]) / L, (ps[1] - pn[1]) / L]
  const cells = { o: pn as [number, number], a: ax, c: [ax[1], -ax[0]] as [number, number], len: L, cells: V.cells ?? 7, top: V.coreTop }
  return { F: { E0, N0, strips, vaultedUnit: unit, vaultedCore: core, cells }, bodies, built: { ...built, prisms: out, ground }, facts }
}
