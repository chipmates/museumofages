/* STOP 6'S BODIES, pure geometry (three's buffers, no DOM), so the map page and the node checks build the same:
   the throne room hollow with its three arched doors and the niche, the paving of the court and the room, and the
   palace's rooms body taken over from the map so its court faces can carry their own brick. Scene frame as plan.ts
   (x east, y up, z south). Only type imports from the wing: node resolves no relative module without its extension. */

import { BufferGeometry, ExtrudeGeometry, Path, Shape } from 'three/webgpu'
import type { Built, Cls, P2 } from '../map/plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

export interface Box2 { x0: number; x1: number; z0: number; z1: number }
export interface Door { x0: number; x1: number; c: number; r: number; spring: number; crown: number }

/** the court plan in scene metres: z0 is the north (smaller z) side, z1 the south */
export interface CourtFrame {
  floor: number
  pave: number
  sunk: number
  wallTop: number
  top: number
  court: Box2
  outer: Box2
  inner: Box2
  /** the facade's plane: the court's south side, the throne room's north face */
  zF: number
  /** the north wall's back face, inside the room */
  zB: number
  doors: Door[]
  niche: { x0: number; x1: number; s0: number; s1: number; z: number; d1: number; d2: number }
}

export function courtFrame(cp: J, E0: number, N0: number): CourtFrame {
  const x = (E: number): number => +(E - E0).toFixed(4)
  const z = (N: number): number => +(N0 - N).toFixed(4)
  const box = (e: number[], n: number[]): Box2 => ({ x0: x(e[0]!), x1: x(e[1]!), z0: z(n[1]!), z1: z(n[0]!) })
  const floor: number = cp.floor
  const court = box(cp.court.e, cp.court.n), outer = box(cp.room.outer.e, cp.room.outer.n), inner = box(cp.room.inner.e, cp.room.inner.n)
  const doors: Door[] = cp.doors.map((d: J) => ({ x0: x(d.e - d.w / 2), x1: x(d.e + d.w / 2), c: x(d.e), r: d.w / 2, spring: floor + d.crown - d.w / 2, crown: floor + d.crown }))
  const N = cp.niche
  return {
    floor, pave: floor + cp.paving.top, sunk: cp.paving.sunk, wallTop: cp.room.wallTop, top: cp.room.top,
    court, outer, inner, zF: outer.z0, zB: inner.z0, doors,
    niche: { x0: x(N.e0), x1: x(N.e1), s0: x(N.step0), s1: x(N.step1), z: inner.z1, d1: N.d1, d2: N.d2 },
  }
}

export interface CourtBody { id: string; geometry: BufferGeometry; band: number; letters: [Cls, Cls] }

/** a vertical prism from a plan outline (scene x, z) with holes, y0 to y1, as mass.ts extrudes the map's */
function prism(poly: P2[], y0: number, y1: number, holes: P2[][] = []): BufferGeometry {
  const sh = new Shape()
  sh.moveTo(poly[0]![0], -poly[0]![1])
  for (const [px, pz] of poly.slice(1)) sh.lineTo(px, -pz)
  sh.closePath()
  for (const h of holes) {
    const p = new Path()
    p.moveTo(h[0]![0], -h[0]![1])
    for (const [px, pz] of h.slice(1)) p.lineTo(px, -pz)
    p.closePath()
    sh.holes.push(p)
  }
  const g = new ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, steps: 1 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  g.deleteAttribute('uv')
  return g.toNonIndexed()
}
const rect = (b: Box2): P2[] => [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]]
const slab = (b: Box2, y0: number, y1: number): BufferGeometry => prism(rect(b), y0, y1)

/** the north wall in its own plane: the outline with the doors cut up to their round arches, thrown 6 m south */
function northWall(F: CourtFrame): BufferGeometry {
  const { x0, x1 } = F.outer, y0 = F.floor, y1 = F.wallTop
  const sh = new Shape()
  sh.moveTo(x0, y0)
  for (const d of [...F.doors].sort((a, b) => a.x0 - b.x0)) {
    sh.lineTo(d.x0, y0)
    sh.lineTo(d.x0, d.spring)
    const n = Math.max(12, Math.round(d.r * 10))
    for (let i = 1; i < n; i++) {
      const a = Math.PI - (Math.PI * i) / n
      sh.lineTo(d.c + Math.cos(a) * d.r, d.spring + Math.sin(a) * d.r)
    }
    sh.lineTo(d.x1, d.spring)
    sh.lineTo(d.x1, y0)
  }
  sh.lineTo(x1, y0)
  sh.lineTo(x1, y1)
  sh.lineTo(x0, y1)
  sh.closePath()
  const g = new ExtrudeGeometry(sh, { depth: F.zB - F.zF, bevelEnabled: false, steps: 1, curveSegments: 1 })
  g.translate(0, 0, F.zF)
  g.deleteAttribute('uv')
  return g.toNonIndexed()
}

/** the south wall with the doubly recessed niche cut into its inner face, full height */
function southWall(F: CourtFrame): BufferGeometry {
  const { x0, x1, z1 } = F.outer, zi = F.niche.z, N = F.niche
  const a = zi + N.d1, b = a + N.d2
  const poly: P2[] = [[x0, zi], [N.x0, zi], [N.x0, a], [N.s0, a], [N.s0, b], [N.s1, b], [N.s1, a], [N.x1, a], [N.x1, zi], [x1, zi], [x1, z1], [x0, z1]]
  return prism(poly, F.floor, F.wallTop)
}

/** the hole the map's rooms body leaves for the court and the room, as UTM points (map-plan.json takes it), wound
    against the palace's outline: three's extrusion turns a hole's faces outward only when its winding opposes the outline's */
export function holePoly(F: CourtFrame, E0: number, N0: number): Array<[number, number]> {
  const c = F.court, o = F.outer
  const s: P2[] = [[c.x0, c.z0], [c.x1, c.z0], [c.x1, c.z1], [o.x1, o.z0], [o.x1, o.z1], [o.x0, o.z1], [o.x0, o.z0], [c.x0, c.z1]]
  return s.reverse().map(([px, pz]) => [+(px + E0).toFixed(2), +(N0 - pz).toFixed(2)])
}

/** the map prisms this module draws on the map page instead of the map */
export const TAKEN = (id: string): boolean => id === 'south-palace-rooms' || id.startsWith('throne-room')

export interface Court { F: CourtFrame; bodies: CourtBody[]; built: Built; facts: Record<string, unknown> }

/** the court's bodies, and the map's plan without the prisms they replace (pass that one to buildBodies) */
export function buildCourt(built: Built, mapPlan: J, cp: J): Court {
  const F = courtFrame(cp, mapPlan.frame.E0, mapPlan.frame.N0)
  const BAND: number = mapPlan.classes.band
  const room = mapPlan.blocks.find((b: J) => b.id === 'throne-room')
  const roomLetters: [Cls, Cls] = [room?.plan ?? 'M', room?.height ?? 'G']
  const bodies: CourtBody[] = []
  const rooms = built.prisms.find((p) => p.id === 'south-palace-rooms')
  if (rooms) bodies.push({ id: rooms.id, geometry: prism(rooms.poly, rooms.y0, rooms.y1, rooms.holes), band: rooms.band, letters: [rooms.plan, rooms.height] })
  const wallBand = F.floor + BAND
  const { inner, outer } = F
  bodies.push({ id: 'throne-room-facade', geometry: northWall(F), band: wallBand, letters: roomLetters })
  bodies.push({ id: 'throne-room-wall-s', geometry: southWall(F), band: wallBand, letters: roomLetters })
  bodies.push({ id: 'throne-room-wall-w', geometry: slab({ x0: outer.x0, x1: inner.x0, z0: inner.z0, z1: inner.z1 }, F.floor, F.wallTop), band: wallBand, letters: roomLetters })
  bodies.push({ id: 'throne-room-wall-e', geometry: slab({ x0: inner.x1, x1: outer.x1, z0: inner.z0, z1: inner.z1 }, F.floor, F.wallTop), band: wallBand, letters: roomLetters })
  bodies.push({ id: 'throne-room-roof', geometry: slab(outer, F.wallTop, F.top), band: F.wallTop - 1, letters: roomLetters })
  // the paving, sunk into the palace's floor body so no face of it is a sliver: the court, then the doors, the room and the niche
  const y0 = F.floor - F.sunk, y1 = F.pave
  bodies.push({ id: 'court-paving', geometry: slab(F.court, y0, y1), band: 1e6, letters: ['M', 'M'] })
  const floorParts: BufferGeometry[] = [slab(inner, y0, y1)]
  for (const d of F.doors) floorParts.push(slab({ x0: d.x0, x1: d.x1, z0: F.zF, z1: F.zB }, y0, y1))
  const N = F.niche
  floorParts.push(slab({ x0: N.x0, x1: N.x1, z0: N.z, z1: N.z + N.d1 }, y0, y1), slab({ x0: N.s0, x1: N.s1, z0: N.z + N.d1, z1: N.z + N.d1 + N.d2 }, y0, y1))
  floorParts.forEach((g, i) => bodies.push({ id: `throne-room-floor-${i}`, geometry: g, band: 1e6, letters: roomLetters }))
  const facts = {
    court: [+(F.court.x1 - F.court.x0).toFixed(2), +(F.court.z1 - F.court.z0).toFixed(2)],
    roomOuter: [+(outer.x1 - outer.x0).toFixed(2), +(outer.z1 - outer.z0).toFixed(2)],
    roomInner: [+(inner.x1 - inner.x0).toFixed(2), +(inner.z1 - inner.z0).toFixed(2)],
    walls: { north: +(F.zB - F.zF).toFixed(2), south: +(outer.z1 - inner.z1).toFixed(2), west: +(inner.x0 - outer.x0).toFixed(2), east: +(outer.x1 - inner.x1).toFixed(2) },
    doors: F.doors.map((d) => ({ w: +(d.x1 - d.x0).toFixed(2), fromRoomCentre: +(d.c - (inner.x0 + inner.x1) / 2).toFixed(2), crownOverFloor: +(d.crown - F.floor).toFixed(2) })),
    niche: { opening: +(N.x1 - N.x0).toFixed(2), step: +(N.s1 - N.s0).toFixed(2) },
    facade: +(F.court.x1 - F.court.x0).toFixed(2),
    top: F.top,
  }
  return { F, bodies, built: { ...built, prisms: built.prisms.filter((p) => !TAKEN(p.id)) }, facts }
}
