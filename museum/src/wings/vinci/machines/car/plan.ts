/** THE ARMOURED CAR'S NUMBERS (British Museum 1860,0616.99). The sheet gives
 * no size, so every metre here is the museum's; the forms, counts and the
 * drive's arrangement are read off the sheet. Frame: metres, +Y up, +X along
 * the car (the way its wheels roll), +Z toward the viewer of the sheet's
 * opened view; origin on the ground under the centre.
 *
 * THE DRIVE AS DRAWN. Each side's shaft carries a lantern at each end, and
 * each lantern meets its wheel's pegs on the side of the ring facing the
 * car's middle. One crank turn so drives the front and rear wheels of a side
 * in opposite senses: the car binds, and the motion shows it.
 */

export const TAU = Math.PI * 2

/** The basin the drive stands in, read as round in plan. */
export const TUB = {
  rimR: 2.35, rimY: 0.8,
  bottomR: 2.08, bottomY: 0.17,
  wall: 0.05,
  staves: 72,
  floorTop: 0.22, floorT: 0.05, plank: 0.25,
  lip: { inner: 2.27, outer: 2.37, top: 0.88 },
  ports: { count: 24, y: 0.56, r: 0.08, collar: 0.115 },
} as const

/** The wall's radius at a height: nearly upright under the rim, turning in at the bilge. */
export function wallRadius(y: number): number {
  const s = Math.min(1, Math.max(0, (y - TUB.bottomY) / (TUB.rimY - TUB.bottomY)))
  return TUB.bottomR + (TUB.rimR - TUB.bottomR) * Math.sqrt(s)
}

/** The cover: a cone of boards resting on its eave band, the lookout on top. */
export const COVER = {
  band: { r0: 2.36, r1: 2.42, y0: 0.88, y1: 0.98 },
  eaveEdge: 2.48, topR: 0.62, slope: Math.PI / 6,
  boards: 64, boardT: 0.035,
  nailRings: [0.14, 0.38, 0.62, 0.84],
  sill: { r: 0.62, w: 0.1, below: 0.04, above: 0.05 },
  posts: 8, postW: 0.07, slot: 0.2,
  cap: { r: 0.72, ringR: 0.66, ringH: 0.06, slope: (34 * Math.PI) / 180, boards: 12, t: 0.03 },
  knob: { r: 0.06, h: 0.135 },
} as const
/** The cone's outer surface at a radius: its underside rests on the band's middle. */
export function coneY(r: number): number {
  const { band, boardT, slope } = COVER
  return band.y1 + boardT / Math.cos(slope) + ((band.r0 + band.r1) / 2 - r) * Math.tan(slope)
}
export const CONE_TOP_Y = coneY(COVER.topR)
export const SILL_TOP = CONE_TOP_Y + COVER.sill.above
export const CAP_FOOT = SILL_TOP + COVER.slot
export const CAP_RING_TOP = CAP_FOOT + COVER.cap.ringH
export function capY(r: number): number {
  const { cap } = COVER
  return CAP_RING_TOP + cap.t / Math.cos(cap.slope) + (cap.ringR - r) * Math.tan(cap.slope)
}
export const KNOB_FOOT = capY(0) - 0.035
export const KNOB_TOP = KNOB_FOOT + COVER.knob.h

/** Hubs at (±x, y, ±z): left (x < 0) is the rear, right the front. */
/** The hub stands so the iron strakes just meet the ground. */
export const HUB = { x: 1.12, y: 0.628, z: 1.0 } as const
export const WHEEL = {
  tread: 0.62, felloeIn: 0.47, width: 0.09,
  spokes: 10, felloes: 5,
  hubR: 0.12, hubLen: 0.28, axleR: 0.045,
} as const
export const PEGS = { count: 24, pitch: 0.536, r: 0.0225, stand: 0.11 } as const
/** A quarter of the peg circle, so one crank turn is a quarter wheel turn. */
export const LANTERN = { staves: 6, pitch: PEGS.pitch / 4, staveR: 0.0175, discR: 0.17, discT: 0.04, half: 0.2, x: 0.66 } as const
/** How far a peg's tip reaches past the near staves' circle. */
const ENGAGE = 0.03
export const SHAFT = {
  z: HUB.z - WHEEL.width / 2 - PEGS.stand + ENGAGE - LANTERN.pitch,
  half: 0.05, end: 0.88,
} as const
export const CRANK = { cheekX: 0.3, cheekT: 0.06, cheekW: 0.1, throw: 0.3, gripR: 0.0275 } as const
export const POSTS = { x: 0.38, w: 0.07 } as const

/** The six guns: three at the front ports, three at the rear. The count is ours. */
export const GUN_ANGLES_DEG = [0, 15, -15, 180, 165, 195] as const
export const GUN = { length: 1.05, breechR: 0.078, muzzleR: 0.056, bore: 0.026, out: 0.1 } as const

/** Where each wheel stands: sx -1 rear, +1 front; sz -1 far, +1 near. */
export const WHEELS = [
  { id: 'wheel-rear-far', sx: -1, sz: -1 },
  { id: 'wheel-front-far', sx: 1, sz: -1 },
  { id: 'wheel-rear-near', sx: -1, sz: 1 },
  { id: 'wheel-front-near', sx: 1, sz: 1 },
] as const
export const SHAFTS = [
  { id: 'shaft-far', sz: -1 },
  { id: 'shaft-near', sz: 1 },
] as const

export const PERIOD = 12
const smoother = (u: number): number => { const x = Math.min(1, Math.max(0, u)); return x * x * x * (x * (x * 6 - 15) + 10) }
const step = (a: number, b: number, x: number): number => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u) }
/** The schedule: stand, one slow turn forward, the bind, back, stand. */
export const PHASES = [
  { name: 'The crew stands at the cranks', start: 0, end: 1 },
  { name: 'One slow turn forward: the front and rear wheels turn against each other', start: 1, end: 6 },
  { name: 'The bind: the cranks shudder and stop', start: 6, end: 7.6 },
  { name: 'Turned back: the wheels fight the other way', start: 7.6, end: 11 },
  { name: 'At rest', start: 11, end: 12 },
] as const

/** The far crank's angle about +X, radians, at any time (a 12 s loop). */
export function crankAngle(time: number): number {
  const t = ((time % PERIOD) + PERIOD) % PERIOD
  if (t < 1) return 0
  if (t < 6) return TAU * smoother((t - 1) / 5)
  if (t < 7.6) {
    const u = t - 6
    return TAU + 0.08 * Math.sin(TAU * 4.5 * u) * Math.exp(-2 * u) * step(0, 0.06, u) * (1 - step(1.1, 1.6, u))
  }
  if (t < 11) return TAU * (1 - smoother((t - 7.6) / 3.4))
  return 0
}

/** Every joint: the near crank is turned as the far one's mirror, so both
 * front wheels turn together and both rear wheels together, against them. */
export function carJoints(time: number): Record<string, number> {
  const phi = crankAngle(time)
  const ratio = LANTERN.pitch / PEGS.pitch
  return {
    'shaft-far': phi,
    'shaft-near': -phi,
    'wheel-rear-far': phi * ratio,
    'wheel-rear-near': phi * ratio,
    'wheel-front-far': -phi * ratio,
    'wheel-front-near': -phi * ratio,
  }
}
