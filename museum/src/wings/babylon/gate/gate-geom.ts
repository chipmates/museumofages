/* THE GATE'S GEOMETRY, pure: `gate-plan.json` turned into bodies, glazed faces,
   relief panels, battlement runs and the street's profile, in the gate's frame
   (x to the right of a visitor facing the gate, y up from the +15.40 street,
   z out of the face). No DOM, no renderer and no imports, so node mounts it
   (`--experimental-strip-types`) and checks exactly what the page builds. */

export type Cls = 'M' | 'R' | 'G' | 'T'
export type Surf = 'glaze' | 'brick' | 'mud' | 'cedar' | 'copper' | 'bronze' | 'pedestal'
export type P2 = [number, number]
export type V3 = [number, number, number]
export type Kind = 'bull' | 'dragon' | 'lion'

/** an upright box in the gate's frame; `inset` pulls a side in behind a glazed skin */
export interface GBox {
  id: string
  part: string
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number
  surf: Surf
  plan: Cls
  height: Cls
  /** top of the measured class's band at this body's foot (gate frame y) */
  band: number
  /** where the class turns from R to G (top of the last relief row), if the body carries rows */
  rTop?: number
  inset?: Partial<Record<'px' | 'nx' | 'pz' | 'nz', number>>
  shadow?: boolean
}

/** an upright prism over a polygon (x, z) */
export interface GPrism {
  id: string
  part: string
  poly: P2[]
  y0: number
  y1: number
  surf: Surf
  plan: Cls
  height: Cls
  band: number
  rTop?: number
  /** a lion wall piece: the frieze's foot (gate frame y) on every side */
  frieze?: number
}

/** a wall piece over a door: x0..x1 wide, z0..z1 deep, from the springing to the top, a semicircle cut over the door's half width */
export interface GArch {
  id: string
  part: string
  x0: number; x1: number; z0: number; z1: number
  springing: number
  r: number
  top: number
  inset: number
  /** a step back at z0 (the separation pass sets it) */
  inset0?: number
  plan: Cls
  height: Cls
}

/** a glazed (or friezed) face that carries the procedural pattern, and the relief panels on it */
export interface Face {
  id: string
  part: string
  /** left-bottom corner as seen from outside */
  origin: V3
  uDir: V3
  normal: V3
  width: number
  y0: number
  y1: number
  /** u at the left edge (so faces on one plane share their bond) */
  uOff: number
  /** distance in u of the convex corners that carry the corner stripes, or null */
  convex: [number | null, number | null]
  /** corner borders (yellow band, red stripe) on this face; flanks only take the blue stripe */
  borders: boolean
  /** the course parity: 0 across the axis, 1 along it (a row sits one course higher across a corner) */
  shift: number
  /** what the face is: the gate's glazed wall, or a lion wall's frieze on plain brick */
  kind: 'gate' | 'lion'
  /** frieze start (gate frame y) on a lion wall */
  frieze?: number
  /** top of the last relief row (R below, G above) */
  rTop: number
  /** an arch cut through this face: centre u, springing, radius */
  arch?: { u: number; springing: number; r: number }
  plan: Cls
  height: Cls
}

export interface Panel {
  id: string
  face: string
  kind: Kind
  /** +1 walks toward +u, -1 toward -u */
  dir: number
  row: number
  /** left end of the animal's grid (face u), its feet course's base (gate frame y) */
  u0: number
  y0: number
  colour: 'yellow' | 'white' | 'lionWhite' | 'lionYellow'
  /** world placement: origin at (u0, y0) on the face, the face's u axis and normal */
  origin: V3
  uDir: V3
  normal: V3
  cls: Cls
}

/** a battlement run: a straight wall top, its outer edge line, outward normal, the walk's height */
export interface Run {
  id: string
  a: P2
  b: P2
  out: P2
  y: number
  thick: number
  plan: Cls
}

export interface Built {
  boxes: GBox[]
  prisms: GPrism[]
  arches: GArch[]
  faces: Face[]
  panels: Panel[]
  runs: Run[]
  loopholes: Array<{ id: string; c: V3; n: V3; r: number; depth: number }>
  doors: Array<{ id: string; pivot: P2; along: P2; w: number; h: number; springing: number; thick: number }>
  beams: GBox[]
  pedestals: Array<{ n: number; x: number; z: number; shape: string; d: number; y0: number; y1: number; animal?: string; plan: Cls; height: Cls }>
  level: (z: number) => number
  street: { dir: P2; halfWidth: number; s: (x: number, z: number) => number; t: (x: number, z: number) => number }
  facts: Record<string, unknown>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

const D2R = Math.PI / 180

/* ── frames: the gate's, UTM, the map's scene ── */
export function gateFrame(plan: J) {
  const [FE, FN] = plan.frame.face as [number, number]
  const zb = plan.frame.zGrid * D2R, xb = (plan.frame.zGrid - 90) * D2R
  const L0: number = plan.frame.level0
  const utm = (x: number, z: number): P2 => [FE + z * Math.sin(zb) + x * Math.sin(xb), FN + z * Math.cos(zb) + x * Math.cos(xb)]
  const fromUtm = (E: number, N: number): P2 => {
    const dE = E - FE, dN = N - FN
    return [dE * Math.sin(xb) + dN * Math.cos(xb), dE * Math.sin(zb) + dN * Math.cos(zb)]
  }
  /** the map's scene (x = E - 445700, y = level, z = 3600400 - N) as a 4x4 column-major matrix taking gate points to map points */
  const toMap = (E0: number, N0: number): number[] => {
    const xc: V3 = [Math.sin(xb), 0, -Math.cos(xb)], zc: V3 = [Math.sin(zb), 0, -Math.cos(zb)]
    return [xc[0], xc[1], xc[2], 0, 0, 1, 0, 0, zc[0], zc[1], zc[2], 0, FE - E0, L0, N0 - FN, 1]
  }
  return { utm, fromUtm, toMap, level0: L0 }
}

/* ── the sun (GATE-RESEARCH 5.1, `PILOT/scratch/sun2.py`): local apparent solar time ── */
export function sunAt(plan: J, hour: number): { azimuth: number; elevation: number; dec: number } {
  const phi = plan.hour.latitude * D2R
  const dec = Math.asin(Math.sin(plan.hour.obliquity * D2R) * Math.sin(plan.hour.days * D2R))
  const H = (hour - 12) * 15 * D2R
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H))
  const az = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(H))
  return { azimuth: ((az / D2R) % 360 + 360) % 360, elevation: el / D2R, dec: dec / D2R }
}

/** toward the sun in the gate's frame */
export function sunVector(plan: J, hour: number): V3 {
  const { azimuth, elevation } = sunAt(plan, hour)
  const n = plan.frame.faceNormalTrue as number
  const c = Math.cos(elevation * D2R)
  return [c * Math.cos((azimuth - (n - 90)) * D2R), Math.sin(elevation * D2R), c * Math.cos((azimuth - n) * D2R)]
}

/** "17:00" in hours */
export const hourOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) + (m ?? 0) / 60
}

/* ── the street's profile through the measured spots, in the gate's frame ── */
export function makeLevel(plan: J): (z: number) => number {
  const L0: number = plan.frame.level0
  const pts: Array<{ a: number; level: number }> = plan.street.levels
  return (z: number): number => {
    if (z <= pts[0]!.a) return pts[0]!.level - L0
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i]!, q = pts[i + 1]!
      if (z <= q.a) return p.level + ((q.level - p.level) * (z - p.a)) / (q.a - p.a) - L0
    }
    const p = pts[pts.length - 2]!, q = pts[pts.length - 1]!
    return q.level + ((q.level - p.level) * (z - q.a)) / (q.a - p.a) - L0
  }
}

/* ── seeded numbers ── */
export function hash2(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function buildGate(plan: J): Built {
  const C: number = plan.course
  const BR: number = plan.brick
  const level = makeLevel(plan)
  const boxes: GBox[] = [], prisms: GPrism[] = [], arches: GArch[] = [], faces: Face[] = [], panels: Panel[] = []
  const runs: Run[] = [], loopholes: Built['loopholes'] = [], doors: Built['doors'] = [], beams: GBox[] = []
  const facts: Record<string, unknown> = {}
  const SK = 0.015
  const FOOT = -2.5
  const band = (y: number): number => y + C

  /* the street's own axis (346.3 grid), through the gate's axis at the face */
  const turn = (plan.street.bearingGrid - plan.frame.zGrid) * D2R
  const sd: P2 = [-Math.sin(turn), Math.cos(turn)]
  const st: P2 = [Math.cos(turn), Math.sin(turn)]
  const street = {
    dir: sd,
    halfWidth: plan.street.halfWidth as number,
    s: (x: number, z: number): number => x * sd[0] + z * sd[1],
    t: (x: number, z: number): number => x * st[0] + z * st[1],
  }
  const fromST = (s: number, t: number): P2 => [s * sd[0] + t * st[0], s * sd[1] + t * st[1]]

  /* ── the front gate ── */
  const FG = plan.front
  const tw: number = FG.towers.w, tp: number = FG.towers.proj, gap: number = FG.towers.gap
  const fw: number = FG.frontWall, ow: number = FG.walls, [chL, chD] = FG.chamber as [number, number]
  const hd = FG.door / 2
  const xT0 = gap / 2, xT1 = gap / 2 + tw
  const zBack = -(fw + chD + ow), zCh0 = -fw, zCh1 = -(fw + chD)
  const xSide0 = chL / 2, xSide1 = chL / 2 + ow
  const top: number = FG.wallTop.value, ttop: number = FG.towerTop.value
  const spr: number = FG.arch.springing, cr: number = FG.arch.crown
  const gs = FG.guardStorey
  const rowsTop = (n: number, shift = 0): number => (plan.rows.plinth + plan.rows.pitch * (n - 1) + plan.rows.animal + shift) * C
  const rTopFront = rowsTop(plan.rows.facade)
  const rTopDoor = rowsTop(plan.rows.door, 1)
  facts['front'] = { towerW: tw, towerProj: tp, towerGap: xT0 * 2, frontWall: fw, walls: ow, chamber: [xSide0 * 2, chD], across: xSide1 * 2, along: tp + fw + chD + ow, door: hd * 2, springing: spr, crown: cr, wallTop: top, towerTop: ttop, rowsTop: rTopFront, doorRowsTop: rTopDoor }
  for (const s of [1, -1]) {
    const side = s > 0 ? 'w' : 'e'
    const lo = (a: number, b: number): [number, number] => (s > 0 ? [a, b] : [-b, -a])
    const [px0, px1] = lo(hd, xSide1)
    // the front wall's pier beside the door: its face and its reveal carry skins
    boxes.push({ id: `front-pier-${side}`, part: 'front gate', x0: px0, x1: px1, y0: FOOT, y1: top, z0: zCh0, z1: 0, surf: 'glaze', plan: 'M', height: 'G', band: band(0), rTop: rTopFront, inset: { pz: SK, ...(s > 0 ? { nx: SK } : { px: SK }) } })
    const [bx0, bx1] = lo(hd, xSide1)
    boxes.push({ id: `back-pier-${side}`, part: 'front gate', x0: bx0, x1: bx1, y0: FOOT, y1: top, z0: zBack, z1: zCh1, surf: 'glaze', plan: 'M', height: 'G', band: band(0) })
    const [sx0, sx1] = lo(xSide0, xSide1)
    boxes.push({ id: `front-side-${side}`, part: 'front gate', x0: sx0, x1: sx1, y0: FOOT, y1: top, z0: zCh1 - 0.2, z1: zCh0 + 0.2, surf: 'glaze', plan: 'M', height: 'G', band: band(0) })
    const [tx0, tx1] = lo(xT0, xT1)
    boxes.push({ id: `front-tower-${side}`, part: 'front gate', x0: tx0, x1: tx1, y0: FOOT, y1: gs.from + 0.4, z0: -0.4, z1: tp, surf: 'glaze', plan: 'M', height: 'G', band: band(0), rTop: rTopFront, inset: { pz: SK, nx: SK, px: SK } })
    // the guard storey: four walls round a hollow, slightly proud of the shaft
    const g0 = gs.from, g1 = ttop, pr = gs.proj, wt = 0.66
    const gx0 = tx0 - pr, gx1 = tx1 + pr, gz0 = -0.4, gz1 = tp + pr
    boxes.push({ id: `guard-${side}-n`, part: 'front gate', x0: gx0, x1: gx1, y0: g0, y1: g1, z0: gz1 - wt, z1: gz1, surf: 'glaze', plan: 'G', height: 'G', band: -99 })
    boxes.push({ id: `guard-${side}-w`, part: 'front gate', x0: gx1 - wt, x1: gx1, y0: g0, y1: g1, z0: gz0, z1: gz1 - wt + 0.01, surf: 'glaze', plan: 'G', height: 'G', band: -99 })
    boxes.push({ id: `guard-${side}-e`, part: 'front gate', x0: gx0, x1: gx0 + wt, y0: g0, y1: g1, z0: gz0, z1: gz1 - wt + 0.01, surf: 'glaze', plan: 'G', height: 'G', band: -99 })
    boxes.push({ id: `guard-${side}-floor`, part: 'front gate', x0: gx0 + 0.3, x1: gx1 - 0.3, y0: g0 - 0.2, y1: g0 + 0.25, z0: gz0, z1: gz1 - 0.3, surf: 'glaze', plan: 'G', height: 'G', band: -99, shadow: true })
    boxes.push({ id: `guard-${side}-roof`, part: 'front gate', x0: gx0 + 0.05, x1: gx1 - 0.05, y0: g1 - 0.35, y1: g1, z0: gz0, z1: gz1 - 0.05, surf: 'glaze', plan: 'G', height: 'G', band: -99 })
    // round loopholes: three on the front, one on each flank
    const lr = gs.loophole / 2, ly = gs.loopholeY
    for (const k of [-1, 0, 1]) loopholes.push({ id: `loop-${side}-n${k}`, c: [(gx0 + gx1) / 2 + k * 1.9, ly, gz1], n: [0, 0, 1], r: lr, depth: wt })
    loopholes.push({ id: `loop-${side}-out`, c: [s > 0 ? gx1 : gx0, ly, (gz0 + gz1) / 2 + 0.3], n: [s, 0, 0], r: lr, depth: wt })
    loopholes.push({ id: `loop-${side}-in`, c: [s > 0 ? gx0 : gx1, ly, (gz0 + gz1) / 2 + 0.3], n: [-s, 0, 0], r: lr, depth: wt })
    runs.push({ id: `guard-${side}-n`, a: [gx0, gz1], b: [gx1, gz1], out: [0, 1], y: g1, thick: 0.33, plan: 'G' })
    runs.push({ id: `guard-${side}-o`, a: [s > 0 ? gx1 : gx0, gz1], b: [s > 0 ? gx1 : gx0, gz0], out: [s, 0], y: g1, thick: 0.33, plan: 'G' })
    runs.push({ id: `guard-${side}-i`, a: [s > 0 ? gx0 : gx1, gz1], b: [s > 0 ? gx0 : gx1, gz0], out: [-s, 0], y: g1, thick: 0.33, plan: 'G' })
    runs.push({ id: `guard-${side}-s`, a: [gx0, gz0], b: [gx1, gz0], out: [0, -1], y: g1, thick: 0.33, plan: 'G' })
    // wall-top runs of the front gate outside the towers
    runs.push({ id: `front-top-${side}-n`, a: [s * xT1, 0], b: [s * xSide1, 0], out: [0, 1], y: top, thick: 0.33, plan: 'G' })
    runs.push({ id: `front-top-${side}-o`, a: [s * xSide1, 0], b: [s * xSide1, zBack], out: [s, 0], y: top, thick: 0.33, plan: 'G' })
    // the open door leaves: cedar with copper, swung into the chamber
    doors.push({ id: `leaf-front-${side}`, pivot: [s * (hd - 0.05), zCh0 + 0.05], along: [Math.sin(-s * 12 * D2R) * 0, -1], w: hd - 0.1, h: cr - 0.1, springing: spr, thick: 0.16 })
  }
  runs.push({ id: 'front-top-over', a: [-xT0, 0], b: [xT0, 0], out: [0, 1], y: top, thick: 0.33, plan: 'G' })
  runs.push({ id: 'front-top-back', a: [-xSide1, zBack], b: [xSide1, zBack], out: [0, -1], y: top, thick: 0.33, plan: 'G' })
  arches.push({ id: 'front-arch-outer', part: 'front gate', x0: -hd - 0.15, x1: hd + 0.15, z0: zCh0, z1: 0, springing: spr, r: hd, top, inset: SK, plan: 'G', height: 'G' })
  arches.push({ id: 'front-arch-inner', part: 'front gate', x0: -hd - 0.15, x1: hd + 0.15, z0: zBack, z1: zCh1, springing: spr, r: hd, top, inset: 0, plan: 'G', height: 'G' })
  // the chamber's cedar roof: beams across the 3.68 m, a deck over them
  for (let x = -xSide0 + 0.3; x <= xSide0 - 0.3 + 1e-6; x += 0.62) beams.push({ id: `beam-front-${beams.length}`, part: 'front gate', x0: x - 0.16, x1: x + 0.16, y0: top - 1.55, y1: top - 1.15, z0: zCh1 - 0.25, z1: zCh0 + 0.25, surf: 'cedar', plan: 'T', height: 'T', band: -99 })
  boxes.push({ id: 'front-roof', part: 'front gate', x0: -xSide0 - 0.2, x1: xSide0 + 0.2, y0: top - 1.15, y1: top - 0.6, z0: zCh1 - 0.2, z1: zCh0 + 0.2, surf: 'cedar', plan: 'T', height: 'T', band: -99 })

  /* ── the glazed faces of the front gate ── */
  const R = plan.rows
  const face = (f: Omit<Face, 'kind' | 'plan' | 'height'> & Partial<Pick<Face, 'kind' | 'plan' | 'height'>>): Face => {
    const out: Face = { kind: 'gate', plan: 'M', height: 'G', ...f }
    faces.push(out)
    return out
  }
  const faceTop = top
  // door wall: one plane from the east tower's inner corner, so its parts share their bond
  const dwOff = -xT0
  face({ id: 'door-e', part: 'front gate', origin: [-xT0, 0, 0], uDir: [1, 0, 0], normal: [0, 0, 1], width: xT0 - hd, y0: FOOT, y1: faceTop, uOff: 0, convex: [null, xT0 - hd], borders: true, shift: 0, rTop: rTopFront })
  face({ id: 'door-w', part: 'front gate', origin: [hd, 0, 0], uDir: [1, 0, 0], normal: [0, 0, 1], width: xT0 - hd, y0: FOOT, y1: faceTop, uOff: hd - dwOff, convex: [hd - dwOff, null], borders: true, shift: 0, rTop: rTopFront })
  face({ id: 'over-door', part: 'front gate', origin: [-hd, spr, 0], uDir: [1, 0, 0], normal: [0, 0, 1], width: 2 * hd, y0: spr, y1: faceTop, uOff: -hd - dwOff, convex: [null, null], borders: false, shift: 0, rTop: -1, arch: { u: -dwOff, springing: spr, r: hd }, height: 'G' })
  face({ id: 'reveal-w', part: 'front gate', origin: [hd, 0, -fw], uDir: [0, 0, 1], normal: [-1, 0, 0], width: fw, y0: FOOT, y1: spr, uOff: 0, convex: [0, fw], borders: false, shift: 1, rTop: rTopDoor })
  face({ id: 'reveal-e', part: 'front gate', origin: [-hd, 0, 0], uDir: [0, 0, -1], normal: [1, 0, 0], width: fw, y0: FOOT, y1: spr, uOff: 0, convex: [0, fw], borders: false, shift: 1, rTop: rTopDoor })
  for (const s of [1, -1]) {
    const side = s > 0 ? 'w' : 'e'
    // tower front, inner flank (toward the door), outer flank, and the wall strip beyond the tower
    face({ id: `tower-${side}-front`, part: 'front gate', origin: [s > 0 ? xT0 : -xT1, 0, tp], uDir: [1, 0, 0], normal: [0, 0, 1], width: tw, y0: FOOT, y1: gs.from + 0.01, uOff: 0, convex: [0, tw], borders: true, shift: 0, rTop: rTopFront })
    face({ id: `tower-${side}-inner`, part: 'front gate', origin: s > 0 ? [xT0, 0, 0] : [-xT0, 0, tp], uDir: s > 0 ? [0, 0, 1] : [0, 0, -1], normal: [-s, 0, 0], width: tp, y0: FOOT, y1: gs.from + 0.01, uOff: 0, convex: s > 0 ? [null, tp] : [0, null], borders: false, shift: 1, rTop: rTopFront })
    face({ id: `tower-${side}-outer`, part: 'front gate', origin: s > 0 ? [xT1, 0, tp] : [-xT1, 0, 0], uDir: s > 0 ? [0, 0, -1] : [0, 0, 1], normal: [s, 0, 0], width: tp, y0: FOOT, y1: gs.from + 0.01, uOff: 0, convex: s > 0 ? [0, null] : [null, tp], borders: false, shift: 1, rTop: rTopFront })
    face({ id: `strip-${side}`, part: 'front gate', origin: [s > 0 ? xT1 : -xSide1, 0, 0], uDir: [1, 0, 0], normal: [0, 0, 1], width: xSide1 - xT1, y0: FOOT, y1: faceTop, uOff: 0, convex: s > 0 ? [null, xSide1 - xT1] : [0, null], borders: true, shift: 0, rTop: rTopFront })
  }

  /* ── the relief panels: animals per row and face, walking toward the door or north ── */
  const L: Record<Kind, number> = { bull: plan.animals.bull.length, dragon: plan.animals.dragon.length, lion: plan.animals.lion.length }
  const kindOf = (row: number): Kind => R.order[row - 1] as Kind
  const colourOf = (k: Kind): Panel['colour'] => (R.colour[k] === 'yellow' ? 'yellow' : 'white')
  const place = (f: Face, row: number, centres: number[], dir: number, rowShift = 0): void => {
    const k = kindOf(row)
    const y0 = (R.plinth + R.pitch * (row - 1) + f.shift + rowShift) * C
    for (const cu of centres) {
      // the animal's left end on a head joint of its feet course, so the bond runs through it the same way every time
      // a mirrored animal of an odd half-brick length keeps its own grid by starting half a brick over
      const want = cu - L[k] / 2 + f.uOff
      const phase = dir < 0 ? ((-L[k] % BR) + BR) % BR : 0
      const u0 = Math.round((want - phase) / BR) * BR + phase - f.uOff
      const o: V3 = [f.origin[0] + f.uDir[0] * u0, y0, f.origin[2] + f.uDir[2] * u0]
      panels.push({ id: `${f.id}-r${row}-${panels.length}`, face: f.id, kind: k, dir, row, u0, y0, colour: colourOf(k), origin: o, uDir: f.uDir, normal: f.normal, cls: 'R' })
    }
  }
  const byId = (id: string): Face => faces.find((f) => f.id === id)!
  for (let row = 1; row <= R.facade; row++) {
    for (const s of [1, -1]) {
      const side = s > 0 ? 'w' : 'e'
      const tf = byId(`tower-${side}-front`)
      // two on each tower front, toward the door (west tower walks east, -u)
      place(tf, row, [tw * 0.27, tw * 0.73], s > 0 ? -1 : 1)
      // one on the tower's inner flank, walking north
      const fl = byId(`tower-${side}-inner`)
      const flc = s > 0 ? tp - 0.08 - L[kindOf(row)] / 2 - 0.02 : 0.08 + L[kindOf(row)] / 2 + 0.02
      place(fl, row, [flc], s > 0 ? 1 : -1)
      // one beside the door, toward it
      const dw = byId(`door-${side}`)
      place(dw, row, [dw.width / 2 + (s > 0 ? 0.12 : -0.12)], s > 0 ? -1 : 1)
    }
  }
  for (let row = 1; row <= R.door; row++) {
    place(byId('reveal-w'), row, [fw / 2], 1)
    place(byId('reveal-e'), row, [fw / 2], -1)
  }
  facts['panelsFront'] = panels.length

  /* ── the intermediate court and the main gate ── */
  const MG = plan.main
  const court = plan.court.depth
  const zMT = zBack - court
  const mtw: number = MG.towers.w, mtp: number = MG.towers.proj, mgap: number = MG.towers.gap
  const mw: number = MG.walls, [mchL, mchW] = MG.chamber as [number, number]
  const zM0 = zMT - mtp, zMch0 = zM0 - mw, zMch1 = zMch0 - mchL, zMS = zMch1 - mw
  const mx0 = mgap / 2, mx1 = mgap / 2 + mtw
  const mHalf = mchW / 2 + mw
  const mtop: number = MG.wallTop.value, mttop: number = MG.towerTop.value
  const mcr: number = MG.arch.crown, mhd = MG.door.w / 2, mspr = mcr - mhd
  const rTopMain = rowsTop(R.main)
  facts['main'] = { towerW: mtw, towerProj: mtp, towerGap: mx0 * 2, walls: mw, chamber: [mchL, mchW], along: zMT - zMS, across: mHalf * 2, door: mhd * 2, crown: mcr, wallTop: mtop, towerTop: mttop, court: zBack - zMT, complex: tp - zMS, rowsTop: rTopMain }
  for (const s of [1, -1]) {
    const side = s > 0 ? 'w' : 'e'
    const lo = (a: number, b: number): [number, number] => (s > 0 ? [a, b] : [-b, -a])
    let [a0, a1] = lo(mhd, mHalf)
    boxes.push({ id: `main-north-${side}`, part: 'main gate', x0: a0, x1: a1, y0: FOOT, y1: mtop, z0: zMch0, z1: zM0, surf: 'glaze', plan: 'M', height: 'G', band: band(0), rTop: rTopMain, inset: { pz: SK, ...(s > 0 ? { nx: SK } : { px: SK }) } })
    ;[a0, a1] = lo(mchW / 2, mHalf)
    boxes.push({ id: `main-side-${side}`, part: 'main gate', x0: a0, x1: a1, y0: FOOT, y1: mtop, z0: zMch1 - 0.2, z1: zMch0 + 0.2, surf: 'glaze', plan: 'M', height: 'G', band: band(0) })
    ;[a0, a1] = lo(mhd, mHalf)
    boxes.push({ id: `main-south-${side}`, part: 'main gate', x0: a0, x1: a1, y0: FOOT, y1: mtop, z0: zMS, z1: zMch1, surf: 'glaze', plan: 'M', height: 'G', band: band(0) })
    ;[a0, a1] = lo(mx0, mx1)
    boxes.push({ id: `main-tower-${side}`, part: 'main gate', x0: a0, x1: a1, y0: FOOT, y1: mtop + 0.4, z0: zM0 - 0.4, z1: zMT, surf: 'glaze', plan: 'M', height: 'G', band: band(0), rTop: rTopMain, inset: { pz: SK, nx: SK, px: SK } })
    const pr = gs.proj, wt = 0.66
    const gx0 = a0 - pr, gx1 = a1 + pr, gz0 = zM0 - 0.4, gz1 = zMT + pr
    boxes.push({ id: `mguard-${side}-n`, part: 'main gate', x0: gx0, x1: gx1, y0: mtop, y1: mttop, z0: gz1 - wt, z1: gz1, surf: 'glaze', plan: 'G', height: 'G', band: -99 })
    boxes.push({ id: `mguard-${side}-w`, part: 'main gate', x0: gx1 - wt, x1: gx1, y0: mtop, y1: mttop, z0: gz0, z1: gz1 - wt + 0.01, surf: 'glaze', plan: 'G', height: 'G', band: -99 })
    boxes.push({ id: `mguard-${side}-e`, part: 'main gate', x0: gx0, x1: gx0 + wt, y0: mtop, y1: mttop, z0: gz0, z1: gz1 - wt + 0.01, surf: 'glaze', plan: 'G', height: 'G', band: -99 })
    boxes.push({ id: `mguard-${side}-roof`, part: 'main gate', x0: gx0 + 0.05, x1: gx1 - 0.05, y0: mttop - 0.35, y1: mttop, z0: gz0, z1: gz1 - 0.05, surf: 'glaze', plan: 'G', height: 'G', band: -99 })
    for (const k of [-1, 0, 1]) loopholes.push({ id: `mloop-${side}-n${k}`, c: [(gx0 + gx1) / 2 + k * 2.6, mtop + 1.9, gz1], n: [0, 0, 1], r: gs.loophole / 2, depth: wt })
    runs.push({ id: `mguard-${side}-n`, a: [gx0, gz1], b: [gx1, gz1], out: [0, 1], y: mttop, thick: 0.33, plan: 'G' })
    runs.push({ id: `mguard-${side}-o`, a: [s > 0 ? gx1 : gx0, gz1], b: [s > 0 ? gx1 : gx0, gz0], out: [s, 0], y: mttop, thick: 0.33, plan: 'G' })
    runs.push({ id: `mguard-${side}-i`, a: [s > 0 ? gx0 : gx1, gz1], b: [s > 0 ? gx0 : gx1, gz0], out: [-s, 0], y: mttop, thick: 0.33, plan: 'G' })
    runs.push({ id: `main-top-${side}-o`, a: [s * mHalf, zM0], b: [s * mHalf, zMS], out: [s, 0], y: mtop, thick: 0.33, plan: 'G' })
    runs.push({ id: `main-top-${side}-n`, a: [s * mx1, zM0], b: [s * mHalf, zM0], out: [0, 1], y: mtop, thick: 0.33, plan: 'G' })
    // the court's short side walls between the two buildings
    ;[a0, a1] = lo(xSide1 - 1.1, xSide1)
    boxes.push({ id: `court-side-${side}`, part: 'court', x0: a0, x1: a1, y0: FOOT, y1: top, z0: zMT - 0.3, z1: zBack + 0.3, surf: 'glaze', plan: 'M', height: 'G', band: band(0) })
    // main gate faces: tower front, inner flank, the door wall beside the door, the reveal
    face({ id: `mtower-${side}-front`, part: 'main gate', origin: [s > 0 ? mx0 : -mx1, 0, zMT], uDir: [1, 0, 0], normal: [0, 0, 1], width: mtw, y0: FOOT, y1: mtop + 0.01, uOff: 0, convex: [0, mtw], borders: true, shift: 0, rTop: rTopMain })
    face({ id: `mtower-${side}-inner`, part: 'main gate', origin: s > 0 ? [mx0, 0, zM0] : [-mx0, 0, zMT], uDir: s > 0 ? [0, 0, 1] : [0, 0, -1], normal: [-s, 0, 0], width: mtp, y0: FOOT, y1: mtop + 0.01, uOff: 0, convex: s > 0 ? [null, mtp] : [0, null], borders: false, shift: 1, rTop: rTopMain })
    face({ id: `mdoor-${side}`, part: 'main gate', origin: [s > 0 ? mhd : -mx0, 0, zM0], uDir: [1, 0, 0], normal: [0, 0, 1], width: mx0 - mhd, y0: FOOT, y1: mtop, uOff: 0, convex: s > 0 ? [0, null] : [null, mx0 - mhd], borders: true, shift: 0, rTop: rTopMain })
    doors.push({ id: `leaf-main-${side}`, pivot: [s * (mhd - 0.05), zMch0 + 0.05], along: [0, -1], w: mhd - 0.1, h: mcr - 0.1, springing: mspr, thick: 0.18 })
  }
  runs.push({ id: 'main-top-over', a: [-mx0, zM0], b: [mx0, zM0], out: [0, 1], y: mtop, thick: 0.33, plan: 'G' })
  runs.push({ id: 'main-top-s', a: [-mHalf, zMS], b: [mHalf, zMS], out: [0, -1], y: mtop, thick: 0.33, plan: 'G' })
  arches.push({ id: 'main-arch-north', part: 'main gate', x0: -mhd - 0.15, x1: mhd + 0.15, z0: zMch0, z1: zM0, springing: mspr, r: mhd, top: mtop, inset: SK, plan: 'G', height: 'G' })
  arches.push({ id: 'main-arch-south', part: 'main gate', x0: -mhd - 0.15, x1: mhd + 0.15, z0: zMS, z1: zMch1, springing: mspr, r: mhd, top: mtop, inset: 0, plan: 'G', height: 'G' })
  face({ id: 'mover-door', part: 'main gate', origin: [-mhd, mspr, zM0], uDir: [1, 0, 0], normal: [0, 0, 1], width: 2 * mhd, y0: mspr, y1: mtop, uOff: 0, convex: [null, null], borders: false, shift: 0, rTop: -1, arch: { u: mhd, springing: mspr, r: mhd }, height: 'G' })
  for (let x = -mchW / 2 + 0.3; x <= mchW / 2 - 0.3 + 1e-6; x += 0.62) beams.push({ id: `beam-main-${beams.length}`, part: 'main gate', x0: x - 0.16, x1: x + 0.16, y0: mtop - 1.55, y1: mtop - 1.15, z0: zMch1 - 0.25, z1: zMch0 + 0.25, surf: 'cedar', plan: 'T', height: 'T', band: -99 })
  boxes.push({ id: 'main-roof', part: 'main gate', x0: -mchW / 2 - 0.2, x1: mchW / 2 + 0.2, y0: mtop - 1.15, y1: mtop - 0.6, z0: zMch1 - 0.2, z1: zMch0 + 0.2, surf: 'cedar', plan: 'T', height: 'T', band: -99 })
  for (let row = 1; row <= R.main; row++) {
    for (const s of [1, -1]) {
      const side = s > 0 ? 'w' : 'e'
      place(byId(`mtower-${side}-front`), row, [mtw * 0.28, mtw * 0.72], s > 0 ? -1 : 1)
      const fl = byId(`mtower-${side}-inner`)
      place(fl, row, [mtp / 2], s > 0 ? 1 : -1)
      const dw = byId(`mdoor-${side}`)
      if (row <= R.facade) place(dw, row, [dw.width / 2], s > 0 ? -1 : 1)
    }
  }
  facts['panels'] = panels.length

  /* ── the forecourt: connecting walls, the wing, the postern, the east stairs ── */
  const FC = plan.forecourt
  const H: number = FC.height.value
  const wIn: number = FC.westWall.inner, wTh: number = FC.westWall.thick
  const eIn: number = FC.eastWall.inner, eTh: number = FC.eastWall.thick + FC.eastWall.strengthening
  const [wz0, wz1] = FC.wing.z as [number, number]
  const westEnd = 21.3, eastEnd = 20.25
  const lvMid = (z0: number, z1: number): number => Math.max(level(z0), level(z1))
  for (const s of [1, -1]) {
    const side = s > 0 ? 'w' : 'e'
    const inner = s > 0 ? wIn : eIn
    const x0 = s > 0 ? xSide1 - 0.2 : inner, x1 = s > 0 ? inner : -xSide1 + 0.2
    boxes.push({ id: `wing-${side}`, part: 'forecourt', x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: FOOT, y1: H, z0: wz0, z1: wz1, surf: 'brick', plan: 'M', height: 'G', band: band(0) })
  }
  // west connecting wall, cut by the postern
  {
    const pz: number = FC.postern.z, pw: number = FC.postern.w, ph: number = FC.postern.h
    const xa = wIn, xb = wIn + wTh
    boxes.push({ id: 'conn-w-a', part: 'forecourt', x0: xa, x1: xb, y0: FOOT, y1: H, z0: wz1 - 0.3, z1: pz - pw / 2, surf: 'brick', plan: 'M', height: 'G', band: band(level(pz)) })
    boxes.push({ id: 'conn-w-b', part: 'forecourt', x0: xa, x1: xb, y0: FOOT, y1: H, z0: pz + pw / 2, z1: westEnd + 0.4, surf: 'brick', plan: 'M', height: 'G', band: band(level(westEnd)) })
    boxes.push({ id: 'conn-w-lintel', part: 'forecourt', x0: xa, x1: xb, y0: level(pz) + ph, y1: H, z0: pz - pw / 2 - 0.2, z1: pz + pw / 2 + 0.2, surf: 'brick', plan: 'M', height: 'G', band: -99 })
    runs.push({ id: 'conn-w-top', a: [xa, wz1], b: [xa, westEnd], out: [-1, 0], y: H, thick: 0.33, plan: 'G' })
    facts['postern'] = { z: pz, w: pw, floor: level(pz) }
  }
  // east connecting wall with its three stairs down east
  {
    const xa = eIn - eTh, xb = eIn
    const st: number[] = FC.eastStairs.z, sw: number = FC.eastStairs.w, sh: number = FC.eastStairs.h
    let from = wz1 - 0.3
    st.forEach((z, k) => {
      boxes.push({ id: `conn-e-${k}`, part: 'forecourt', x0: xa, x1: xb, y0: FOOT, y1: H, z0: from, z1: z - sw / 2, surf: 'brick', plan: 'M', height: 'G', band: band(level(z)) })
      boxes.push({ id: `conn-e-lintel-${k}`, part: 'forecourt', x0: xa, x1: xb, y0: level(z) + sh, y1: H, z0: z - sw / 2 - 0.2, z1: z + sw / 2 + 0.2, surf: 'brick', plan: 'M', height: 'G', band: -99 })
      from = z + sw / 2
    })
    boxes.push({ id: 'conn-e-end', part: 'forecourt', x0: xa, x1: xb, y0: FOOT, y1: H, z0: from, z1: eastEnd + 0.4, surf: 'brick', plan: 'M', height: 'G', band: band(level(eastEnd)) })
    runs.push({ id: 'conn-e-top', a: [xb, eastEnd], b: [xb, wz1], out: [1, 0], y: H, thick: 0.33, plan: 'G' })
    // the stairs' wells beyond the wall, so the openings show depth and not the void
    st.forEach((z, k) => boxes.push({ id: `stair-well-${k}`, part: 'forecourt', x0: xa - 4, x1: xa + 0.2, y0: FOOT, y1: level(z) - 2.2, z0: z - sw / 2 - 0.1, z1: z + sw / 2 + 0.1, surf: 'brick', plan: 'M', height: 'G', band: -99 }))
    st.forEach((z, k) => boxes.push({ id: `stair-cover-${k}`, part: 'forecourt', x0: xa - 4, x1: xa + 0.2, y0: level(z) + sh, y1: level(z) + sh + 0.6, z0: z - sw / 2 - 0.4, z1: z + sw / 2 + 0.4, surf: 'brick', plan: 'M', height: 'G', band: -99 }))
    boxes.push({ id: 'postern-well', part: 'forecourt', x0: wIn + wTh - 0.2, x1: wIn + wTh + 5, y0: FOOT, y1: level(FC.postern.z) - 2.6, z0: FC.postern.z - FC.postern.w / 2 - 0.1, z1: FC.postern.z + FC.postern.w / 2 + 0.1, surf: 'brick', plan: 'M', height: 'G', band: -99 })
    boxes.push({ id: 'postern-cover', part: 'forecourt', x0: wIn + wTh - 0.2, x1: wIn + wTh + 5, y0: level(FC.postern.z) + FC.postern.h, y1: level(FC.postern.z) + FC.postern.h + 0.6, z0: FC.postern.z - FC.postern.w / 2 - 0.4, z1: FC.postern.z + FC.postern.w / 2 + 0.4, surf: 'brick', plan: 'M', height: 'G', band: -99 })
  }

  /* ── the bastions (read off the sheet) ── */
  const BH: number = plan.bastions.height.value
  for (const [id, b] of [['bastion-w', plan.bastions.west], ['bastion-e', plan.bastions.east]] as Array<[string, J]>) {
    const poly: P2[] = b.poly
    const zs = poly.map((p) => p[1])
    const y1 = level((Math.min(...zs) + Math.max(...zs)) / 2) + BH
    prisms.push({ id, part: 'forecourt', poly, y0: FOOT - 2, y1, surf: 'brick', plan: 'M', height: 'G', band: band(level(Math.max(...zs))) })
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, c = poly[(i + 1) % poly.length]!
      const dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz)
      // the outward normal of a counter-clockwise ring seen from above (x right, z down the page)
      const area = poly.reduce((acc, p, k) => { const q = poly[(k + 1) % poly.length]!; return acc + p[0] * q[1] - q[0] * p[1] }, 0)
      const sgn = area > 0 ? 1 : -1
      runs.push({ id: `${id}-top-${i}`, a, b: c, out: [(sgn * dz) / l, (-sgn * dx) / l], y: y1, thick: 0.33, plan: 'G' })
    }
  }

  /* ── the lion walls along the street, with their towers and the lion frieze ── */
  const LW = plan.lionWalls
  const hw: number = street.halfWidth
  const lt: number = LW.towers.w, lp: number = LW.towers.pitch, lproj: number = LW.towers.proj
  const LH: number = LW.height.value, LTH: number = LW.towerHeight.value
  const lionL: number = L.lion
  let lionCount = 0
  const lionFaces: Face[] = []
  for (const s of [1, -1]) {
    const side = s > 0 ? 'w' : 'e'
    // west wall: t from +hw to +hw + thick; the inner face faces east (normal -t)
    const inner = s * hw, outer = s * (hw + LW.thick)
    let k = 0
    for (let s0 = LW.from; s0 < LW.to - 0.01; s0 += lp / 2, k++) {
      const isTower = k % 2 === 1
      const s1 = Math.min(LW.to, s0 + lp / 2)
      const faceT = isTower ? inner - s * lproj : inner
      const lv = level(fromST((s0 + s1) / 2, inner)[1])
      const y1 = lv + (isTower ? LTH : LH)
      // the frieze face: level within the piece, on the course above the street's height at its high end
      const hi = Math.max(level(fromST(s0, inner)[1]), level(fromST(s1, inner)[1]))
      // the lions' feet course is a course of whole bricks (odd), as on the gate
      let friezeY = Math.ceil((hi + LW.lions.bandFrom) / C) * C
      if (Math.round(friezeY / C + 9) % 2 === 0) friezeY += C
      // the body stands a skin's depth behind its glazed face, so the two never share a plane
      const back = faceT + s * SK
      const ring: P2[] = [fromST(s0 - (k > 0 ? 0.3 : 0), back), fromST(s1, back), fromST(s1, outer), fromST(s0 - (k > 0 ? 0.3 : 0), outer)]
      prisms.push({ id: `lion-${side}-${k}`, part: 'lion walls', poly: s > 0 ? ring : ring.reverse(), y0: Math.min(level(fromST(s1, inner)[1]), lv) - 3, y1, surf: 'brick', plan: 'M', height: 'G', band: band(lv), rTop: friezeY + 23 * C, frieze: friezeY })
      const [ox, oz] = fromST(s > 0 ? s0 : s1, faceT)
      const ud: V3 = s > 0 ? [sd[0], 0, sd[1]] : [-sd[0], 0, -sd[1]]
      const n: V3 = [-s * st[0], 0, -s * st[1]]
      const f: Face = { id: `lion-${side}-${k}`, part: 'lion walls', origin: [ox, lv - 3, oz], uDir: ud, normal: n, width: s1 - s0, y0: lv - 3, y1, uOff: 0, convex: isTower ? [0, s1 - s0] : [null, null], borders: false, shift: 0, kind: 'lion', frieze: friezeY, rTop: friezeY + 23 * C, plan: 'M', height: 'G' }
      faces.push(f)
      lionFaces.push(f)
      // two lions on every piece, walking north: west wall +u, east wall -u
      const n2 = Math.max(1, Math.floor((s1 - s0) / LW.lions.spacing))
      for (let i = 0; i < n2; i++) {
        const cu = ((i + 0.5) * (s1 - s0)) / n2
        const u0 = Math.round((cu - lionL / 2) / BR) * BR
        const yL = friezeY + 9 * C
        const o: V3 = [ox + ud[0] * u0, yL, oz + ud[2] * u0]
        panels.push({ id: `lion-${side}-${k}-${i}`, face: f.id, kind: 'lion', dir: s > 0 ? 1 : -1, row: 0, u0, y0: yL, colour: (lionCount++ % 2 === 0) === (s > 0) ? 'lionWhite' : 'lionYellow', origin: o, uDir: ud, normal: n, cls: 'R' })
      }
      runs.push({ id: `lion-${side}-${k}-top`, a: fromST(s0, faceT), b: fromST(s1, faceT), out: [-s * st[0], -s * st[1]], y: y1, thick: 0.33, plan: 'G' })
    }
  }
  facts['lions'] = lionCount

  /* ── the city walls by the gate (mud brick) ── */
  const CW = plan.cityWalls
  const cwH: number = CW.height.value
  for (const s of [1, -1]) {
    const side = s > 0 ? 'w' : 'e'
    const reach = CW.reach as number
    const n0 = s > 0 ? Math.max(xSide1, wIn + wTh) - 0.3 : Math.min(-xSide1, eIn - eTh) + 0.3
    boxes.push({ id: `nemet-${side}`, part: 'city walls', x0: Math.min(n0, s * reach), x1: Math.max(n0, s * reach), y0: FOOT, y1: cwH, z0: CW.nemet.outer - CW.nemet.thick, z1: CW.nemet.outer, surf: 'mud', plan: 'M', height: 'G', band: band(0) })
    const m0 = s > 0 ? mHalf - 0.3 : -mHalf + 0.3
    boxes.push({ id: `imgur-${side}`, part: 'city walls', x0: Math.min(m0, s * reach), x1: Math.max(m0, s * reach), y0: FOOT, y1: cwH + 1.5, z0: zM0 - CW.imgur.thick - 0.5, z1: zM0 - 0.5, surf: 'mud', plan: 'M', height: 'G', band: band(0) })
  }

  /* ── pedestals ── */
  const pedestals = (plan.pedestals as J[]).map((p) => ({ n: p.n, x: p.x, z: p.z, shape: p.shape, d: p.d, y0: level(p.z) - 0.4, y1: level(p.z) + p.h, ...(p.animal ? { animal: p.animal } : {}), plan: p.cls as Cls, height: (p.hCls ?? 'G') as Cls }))

  facts['street'] = (plan.street.levels as J[]).map((p) => ({ a: p.a, level: p.level, y: +(p.level - plan.frame.level0).toFixed(3), atLevel: +(level(p.a) + plan.frame.level0).toFixed(3) }))
  facts['grades'] = (plan.street.levels as J[]).slice(1).map((p, i) => { const q = plan.street.levels[i]; return { from: q.a, to: p.a, percent: +((100 * (q.level - p.level)) / (p.a - q.a)).toFixed(2) } })
  facts['forecourt'] = { width: wIn - eIn, westWall: wIn, eastWall: eIn, depthWest: westEnd, depthEast: eastEnd, height: H }
  facts['lionFaces'] = lionFaces.length
  separate(boxes, arches, prisms)
  return { boxes, prisms, arches, faces, panels, runs, loopholes, doors, beams, pedestals, level, street, facts }
}

/** Two bodies that overlap and share an upright face plane looking the same way fight for depth (the card's rule: a lap or step
    of at least 4 mm). The arch, or else the smaller body, steps back 12 mm on that face: the default depth buffer resolves about 4 mm
    at 85 m (the main gate from the desktop still), so the step is three of its steps. Two boxes whose soffits coincide: the smaller
    sinks the same into what carries it (a lap, never a slit); the faces looking up stand above every eye. */
function separate(boxes: GBox[], arches: GArch[], prisms: GPrism[]): void {
  const STEP = 0.012
  type E = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }
  type It = { box?: GBox; arch?: GArch }
  const ext = (it: It): E => {
    if (it.box) { const b = it.box; return { x0: b.x0 + (b.inset?.nx ?? 0), x1: b.x1 - (b.inset?.px ?? 0), y0: b.y0, y1: b.y1, z0: b.z0 + (b.inset?.nz ?? 0), z1: b.z1 - (b.inset?.pz ?? 0) } }
    const a = it.arch!
    return { x0: a.x0, x1: a.x1, y0: a.springing, y1: a.top, z0: a.z0 + (a.inset0 ?? 0), z1: a.z1 - a.inset }
  }
  const vol = (e: E): number => (e.x1 - e.x0) * (e.y1 - e.y0) * (e.z1 - e.z0)
  const back = (it: It, side: 'nx' | 'px' | 'nz' | 'pz'): void => {
    if (it.box) { it.box.inset = { ...(it.box.inset ?? {}), [side]: (it.box.inset?.[side] ?? 0) + STEP }; return }
    const a = it.arch!
    if (side === 'nx') a.x0 += STEP
    else if (side === 'px') a.x1 -= STEP
    else if (side === 'nz') a.inset0 = (a.inset0 ?? 0) + STEP
    else a.inset += STEP
  }
  const items: It[] = [...boxes.map((box) => ({ box })), ...arches.map((arch) => ({ arch }))]
  const over = (a0: number, a1: number, b0: number, b1: number): boolean => Math.min(a1, b1) - Math.max(a0, b0) > 1e-3
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i]!, Bq = items[j]!
    for (const [lo, hi, sLo, sHi] of [['x0', 'x1', 'nx', 'px'], ['z0', 'z1', 'nz', 'pz']] as const) {
      const ea = ext(A), eb = ext(Bq)
      if (!(over(ea.x0, ea.x1, eb.x0, eb.x1) && over(ea.y0, ea.y1, eb.y0, eb.y1) && over(ea.z0, ea.z1, eb.z0, eb.z1))) break
      const second = Bq.arch && !A.arch ? Bq : A.arch && !Bq.arch ? A : vol(ea) <= vol(eb) ? A : Bq
      if (Math.abs(ea[lo] - eb[lo]) < 1e-4) back(second, sLo)
      if (Math.abs(ea[hi] - eb[hi]) < 1e-4) back(second, sHi)
    }
    if (A.box && Bq.box) {
      const ea = ext(A), eb = ext(Bq)
      if (over(ea.x0, ea.x1, eb.x0, eb.x1) && over(ea.y0, ea.y1, eb.y0, eb.y1) && over(ea.z0, ea.z1, eb.z0, eb.z1) && Math.abs(ea.y0 - eb.y0) < 1e-4) (vol(ea) <= vol(eb) ? A : Bq).box!.y0 -= STEP
    }
  }
  // the prisms' soffits the same way, their plans compared by their bounds (a sink where they do not meet costs nothing)
  const pe = (p: GPrism): E => ({ x0: Math.min(...p.poly.map((q) => q[0])), x1: Math.max(...p.poly.map((q) => q[0])), y0: p.y0, y1: p.y1, z0: Math.min(...p.poly.map((q) => q[1])), z1: Math.max(...p.poly.map((q) => q[1])) })
  for (let i = 0; i < prisms.length; i++) for (let j = i + 1; j < prisms.length; j++) {
    const ea = pe(prisms[i]!), eb = pe(prisms[j]!)
    if (over(ea.x0, ea.x1, eb.x0, eb.x1) && over(ea.y0, ea.y1, eb.y0, eb.y1) && over(ea.z0, ea.z1, eb.z0, eb.z1) && Math.abs(ea.y0 - eb.y0) < 1e-4) (vol(ea) <= vol(eb) ? prisms[i]! : prisms[j]!).y0 -= STEP
  }
}
