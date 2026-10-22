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
 * tapers in toward the ground, its rim under the cover's eave band. The staves
 * stand upright over the floor's thickness (the chime, where a cooper cuts the
 * groove the bottom boards sit in) and flare above it. */
export const TUB = {
  rimR: 2.3, rimY: 0.565,
  bottomR: 1.85, bottomY: 0.06,
  wall: 0.05,
  staves: 72,
  floorTop: 0.11, floorT: 0.05, plank: 0.25,
  lip: { inner: 2.21, outer: 2.4, top: 0.645 },
  ports: { y: 0.36, r: 0.075, collar: 0.11 },
} as const

/** The wall's radius at a height: upright at the chime, turning out above the floor, nearly upright under the rim. */
export function wallRadius(y: number): number {
  const s = Math.min(1, Math.max(0, (y - TUB.floorTop) / (TUB.rimY - TUB.floorTop)))
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
export const GUN = { length: 0.92, breechR: 0.074, muzzleR: 0.052, bore: 0.022, out: 0.24 } as const

/** The cover: a cone of boards resting on its eave band, the lookout on top. */
export const COVER = {
  band: { r0: 2.33, r1: 2.41, y0: 0.645, y1: 0.765 },
  eaveEdge: 2.53, topR: 0.8, slope: (32 * Math.PI) / 180,
  /** the thick rim the sheet draws at the eave: a fascia hung from the boards' ends, over the skirt */
  fascia: { r0: 2.455, r1: 2.515, bottom: 0.525 },
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
/** The spokes stand off the hub's zero so that one of them, the marked one, points straight up at rest on every
 * wheel: the turns of a side's two wheels then read as mirror images. */
export const SPOKES = { zero: Math.PI / 10, marked: 2 } as const
/** Ten staves on the pegs' own spacing: one crank turn is ten twenty-fourths of a wheel turn. The drum runs from
 * the hub's side to the fork post, as long as the space between them allows. */
export const LANTERN = { staves: 10, pitch: (PEGS.pitch * 10) / 24, staveR: 0.026, discR: 0.262, discT: 0.07, half: 0.22, x: 0.715 } as const
/** How far a peg's tip reaches past the near staves' circle. */
const ENGAGE = 0.055
export const SHAFT = {
  z: HUB.z - WHEEL.width / 2 - PEGS.stand + ENGAGE - LANTERN.pitch,
  half: 0.06, end: 0.95,
} as const
/** The crank frame: two heavy cheeks, the shaft through their feet and the grip across their heads, one rigid
 * rectangle as the sheet draws it. Its sweep clears the floor by about 3 cm. */
export const CRANK = { cheekX: 0.29, cheekT: 0.13, cheekW: 0.16, throw: 0.42, gripR: 0.045 } as const
export const POSTS = { x: 0.41, w: 0.07 } as const

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
/** The schedule: stand, one turn forward that jams dead, two shoves against the jam, back, stand. */
export const PHASES = [
  { name: 'The crew stands at the cranks', start: 0, end: 1 },
  { name: 'One turn forward: the front and rear wheels turn against each other', start: 1, end: 5.4 },
  { name: 'The bind: the drive stops dead, the crew shoves twice and it will not go', start: 5.4, end: 7.6 },
  { name: 'Turned back: the wheels fight the other way', start: 7.6, end: 11 },
  { name: 'At rest', start: 11, end: 12 },
] as const

/** One shove into the jam: the play taken up quickly, stopped dead, held, let go. Radians. */
function shove(u: number, amount: number): number {
  if (u <= 0 || u >= 0.5) return 0
  if (u < 0.12) return amount * (u / 0.12) ** 2
  if (u < 0.24) return amount
  return amount * (1 - step(0.24, 0.5, u))
}
/** The bind, from the moment the drive jams: thrown back a hand's width by the stop, then held under strain while
 * the crew shoves twice. Radians about the full turn. */
function bind(u: number): number {
  const recoil = u < 0.32 ? -0.075 * Math.sin((Math.PI * u) / 0.32) * Math.exp(-3 * u) : 0
  const strain = 0.006 * Math.sin(TAU * 7 * u) * step(0.3, 0.4, u) * (1 - step(2.0, 2.2, u))
  return recoil + strain + shove(u - 0.8, 0.11) + shove(u - 1.5, 0.08)
}

/** The far crank's angle about +X, radians, at any time (a 12 s loop). The forward turn eases in and arrives at
 * the jam still moving, so the stop reads as the drive's, not the crew's. */
export function crankAngle(time: number): number {
  const t = ((time % PERIOD) + PERIOD) % PERIOD
  if (t < 1) return 0
  if (t < 5.4) { const u = (t - 1) / 4.4; return TAU * u * u * (2 - u) }
  if (t < 7.6) return TAU + bind(t - 5.4)
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
