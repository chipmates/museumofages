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
 *
 * THE CLOSED FORM. The sheet's shell is low and broad (about 1.8 to 1 in its
 * own view): a short skirt under a thick eave band, a cone of boards, and a
 * low ribbed cap over a ring at the top. The eave can only come down as far
 * as the wheels' upper outer quarter still clears the cone's underside.
 */

export const TAU = Math.PI * 2

/** The basin the drive stands in, read as round in plan: a short skirt that
 * tapers in toward the ground, its rim under the cover's eave band. */
export const TUB = {
  rimR: 2.3, rimY: 0.565,
  bottomR: 2.0, bottomY: 0.06,
  wall: 0.05,
  staves: 72,
  floorTop: 0.11, floorT: 0.05, plank: 0.25,
  lip: { inner: 2.21, outer: 2.4, top: 0.645 },
  ports: { y: 0.36, r: 0.075, collar: 0.11 },
} as const

/** The wall's radius at a height: nearly upright under the rim, turning in at the bilge. */
export function wallRadius(y: number): number {
  const s = Math.min(1, Math.max(0, (y - TUB.bottomY) / (TUB.rimY - TUB.bottomY)))
  return TUB.bottomR + (TUB.rimR - TUB.bottomR) * Math.sqrt(s)
}

/** A gun at every port. The ports leave out the four arcs where a wheel, its
 * pegs or its axle cheek stand inside the wall, so no barrel or stock meets
 * the drive. The count (24) is ours; the sheet shows ports and muzzles all
 * along the skirt and gives no number. Degrees from +X toward +Z. */
export const PORT_ANGLES_DEG = [
  -20, -10, 0, 10, 20,
  60, 70, 80, 90, 100, 110, 120,
  160, 170, 180, 190, 200,
  240, 250, 260, 270, 280, 290, 300,
] as const
/** A bronze piece of the 1480s as a type: a short barrel with its rings and a muzzle swell. */
export const GUN = { length: 0.92, breechR: 0.074, muzzleR: 0.052, bore: 0.022, out: 0.16 } as const

/** The cover: a cone of boards resting on its eave band, the lookout on top. */
export const COVER = {
  band: { r0: 2.33, r1: 2.41, y0: 0.645, y1: 0.765 },
  eaveEdge: 2.5, topR: 0.8, slope: (32 * Math.PI) / 180,
  boards: 64, boardT: 0.035,
  nailRings: [0.14, 0.38, 0.62, 0.86],
  sill: { r: 0.8, w: 0.1, below: 0.04, above: 0.03 },
  posts: 12, postW: 0.055, slot: 0.07,
  cap: { r: 0.85, ringR: 0.8, ringH: 0.03, slope: (28 * Math.PI) / 180, boards: 16, t: 0.03 },
  knob: { r: 0.045, h: 0.15 },
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
export const HUB = { x: 1.12, y: 0.608, z: 0.95 } as const
export const WHEEL = {
  tread: 0.6, felloeIn: 0.455, width: 0.09,
  spokes: 10, felloes: 5,
  hubR: 0.12, hubLen: 0.28, axleR: 0.045,
} as const
export const PEGS = { count: 24, pitch: 0.52, r: 0.0225, stand: 0.11 } as const
/** Ten staves on the pegs' own spacing: one crank turn is ten twenty-fourths of a wheel turn. */
export const LANTERN = { staves: 10, pitch: (PEGS.pitch * 10) / 24, staveR: 0.024, discR: 0.255, discT: 0.06, half: 0.17, x: 0.65 } as const
/** How far a peg's tip reaches past the near staves' circle. */
const ENGAGE = 0.055
export const SHAFT = {
  z: HUB.z - WHEEL.width / 2 - PEGS.stand + ENGAGE - LANTERN.pitch,
  half: 0.06, end: 0.88,
} as const
export const CRANK = { cheekX: 0.27, cheekT: 0.1, cheekW: 0.14, throw: 0.4, gripR: 0.036 } as const
export const POSTS = { x: 0.385, w: 0.08 } as const

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

/** The bind: the men keep pushing into a drive that will not go, and the
 * crank jolts against the pegs and is thrown back, dying away. Radians. */
function bindShudder(u: number): number {
  return 0.11 * Math.sin(TAU * 3.2 * u) * Math.exp(-1.7 * u) * step(0, 0.05, u) * (1 - step(1.15, 1.6, u))
}

/** The far crank's angle about +X, radians, at any time (a 12 s loop). */
export function crankAngle(time: number): number {
  const t = ((time % PERIOD) + PERIOD) % PERIOD
  if (t < 1) return 0
  if (t < 6) return TAU * smoother((t - 1) / 5)
  if (t < 7.6) return TAU + bindShudder(t - 6)
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
