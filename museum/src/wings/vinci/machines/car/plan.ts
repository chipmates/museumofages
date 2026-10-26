/** THE ARMOURED CAR'S NUMBERS (British Museum 1860,0616.99). The sheet gives
 * no size, so every metre here is the museum's; the forms, counts and the
 * drive's arrangement are read off the sheet. Frame: metres, +Y up, +X along
 * the car (the way its wheels roll), +Z toward the viewer of the sheet's
 * opened view; origin on the ground under the centre.
 *
 * THE DRIVE AS DRAWN. Each side's shaft carries a lantern at each end, and
 * each lantern meets its wheel's pegs on the side of the ring facing the
 * car's middle. One crank turn so drives the front and rear wheels of a side
 * in opposite senses: the car cannot roll, and the motion shows the two
 * wheels of a side turning against each other.
 *
 * THE CLOSED FORM. The sheet's shell is low and broad (about 1.8 to 1 in its
 * own view): a short skirt under the eave, a cone of boards, and a low ribbed
 * cap over a ring at the top. Its eave overhangs the skirt and ends in a point
 * at each side. The eave can only come down as far as the wheels' upper outer
 * quarter still clears the cone's underside.
 */

export const TAU = Math.PI * 2

/** The basin the drive stands in, read as round in plan: a short skirt that
 * tapers in toward the ground, its rim under the cover's eave band. The staves
 * stand upright over the floor's thickness (the chime, where a cooper cuts the
 * groove the bottom boards sit in) and lean out straight above it. */
export const TUB = {
  rimR: 2.3, rimY: 0.565,
  bottomR: 1.85, bottomY: 0.06,
  wall: 0.05,
  staves: 72,
  floorTop: 0.11, floorT: 0.05, plank: 0.25,
  lip: { inner: 2.21, outer: 2.4, top: 0.645 },
  ports: { y: 0.36, r: 0.08, collar: 0.115 },
} as const

/** The wall's radius at a height: upright at the chime, then straight staves leaning out to the rim, a cone, as a
 * cooper's staves are straight and as the sheet's opened bowl is drawn. */
export function wallRadius(y: number): number {
  const s = Math.min(1, Math.max(0, (y - TUB.floorTop) / (TUB.rimY - TUB.floorTop)))
  return TUB.bottomR + (TUB.rimR - TUB.bottomR) * s
}

/** A gun at every port. The ports leave out the four arcs where a wheel, its
 * pegs or its axle cheek stand inside the wall, so no barrel or stock meets
 * the drive. The count (20) is ours; the sheet shows ports and muzzles all
 * along the skirt and gives no number. Along the sides one every 10 degrees;
 * at the front and the rear one every 20, since seen across a side those
 * barrels stack up at the skirt's ends. Degrees from +X toward +Z. */
export const PORT_ANGLES_DEG = [
  -20, 0, 20,
  60, 70, 80, 90, 100, 110, 120,
  160, 180, 200,
  240, 250, 260, 270, 280, 290, 300,
] as const
/** A bronze piece of the 1480s as a type: a short barrel with its rings and a muzzle swell. */
export const GUN = { length: 0.92, breechR: 0.074, muzzleR: 0.052, bore: 0.022, out: 0.24 } as const

/** The cover: a cone of boards resting on its eave band, the lookout on top. */
export const COVER = {
  band: { r0: 2.33, r1: 2.41, y0: 0.645, y1: 0.765 },
  eaveEdge: 2.7, topR: 0.8, slope: (32 * Math.PI) / 180,
  /** the eave's kick: a course of short boards under the cone boards' feet, laid flatter, so the eave runs out
   * over the skirt to a thin edge (a carpenter's sprocket, as on a conical roof); the boards above end at `from` */
  kick: { from: 2.48, inner: 2.42, slope: (15 * Math.PI) / 180, t: 0.03 },
  boards: 64, boardT: 0.035,
  /** where the hidden hoops lie under the boards, as fractions from the cone boards' feet to the lookout */
  nailRings: [0.14, 0.38, 0.62, 0.86],
  sill: { r: 0.8, w: 0.1, below: 0.04, above: 0.03 },
  /** the posts stand back under the cap's ring, so the sighting slot reads as the sheet's dark open ring */
  posts: 8, postW: 0.055, postR: 0.775, slot: 0.07,
  /** the cap's boards end flush with its ring, as the sheet's small cone ends on the ring */
  cap: { r: 0.83, ringR: 0.8, ringH: 0.03, slope: (28 * Math.PI) / 180, boards: 16, t: 0.03 },
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
/** The pegs run through the felloe and stand `proud` of its outer face; `endTone` darkens the whole peg a little,
 * so its end grain on the outer face reads as the sheet's ring of dots (the standing part is lifted back by its grime). */
export const PEGS = { count: 24, pitch: 0.52, r: 0.0225, stand: 0.11, proud: 0.004, endTone: 0.8 } as const
/** One spoke of each wheel is marked. At rest it points up and in, toward the car's middle (54 degrees on a rear
 * wheel, 126 on a front one), so a side's two markers are mirror images as the wheels turn against each other. */
export const SPOKES = { zero: Math.PI / 10, rear: 1, front: 3 } as const
/** Ten staves on the pegs' own spacing: one crank turn is ten twenty-fourths of a wheel turn. The drum runs from
 * the hub's side to the fork post, as long as the space between them allows. */
export const LANTERN = { staves: 10, pitch: (PEGS.pitch * 10) / 24, staveR: 0.026, discR: 0.262, discT: 0.07, half: 0.22, x: 0.715 } as const
/** The staves' hand finish: facets round (segments), and the worn flats on both flanks where the pegs bear: `depth`
 * deep at the middle of a band `half` either side of the pegs' line, its middle `shift` outboard of the ring's
 * innermost point (the pegs at 0 and 15 degrees both bear there). */
export const RUNDLE = { segments: 18, wear: { depth: 0.0035, half: 0.04, shift: 0.009 } } as const
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

/** How the drive is shown. Built as drawn and standing on its wheels, the crank jams, or at best the two wheels of a
 * side scrub and skid against each other (the blind read of the sheet). 'scrub' turns the cranks steadily and the
 * wheels steadily against each other; 'jam' is the schedule that turns once into the jam and back. Never a roll. */
export type DriveReading = 'scrub' | 'jam'
export const DRIVE_READING = 'scrub' as DriveReading
/** The scrub: a third of a crank turn a second. A wheel turns 10/24 of a crank turn and shows its turn by one marked
 * spoke, so the loop closes only on whole turns of both: twelve crank turns, five wheel turns. */
export const SCRUB = { turns: 12, period: 36 } as const
export const periodOf = (reading: DriveReading): number => (reading === 'scrub' ? SCRUB.period : 12)
export const PERIOD = periodOf(DRIVE_READING)
const smoother = (u: number): number => { const x = Math.min(1, Math.max(0, u)); return x * x * x * (x * (x * 6 - 15) + 10) }
const step = (a: number, b: number, x: number): number => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u) }
export const SCRUB_PHASES = [
  { name: 'The crew turns the cranks steadily: the front and rear wheels of each side turn against each other and scrub, and the car stands', start: 0, end: SCRUB.period },
] as const
/** The jam's schedule: stand, one turn forward that jams dead, two shoves against the jam, back, stand. */
export const JAM_PHASES = [
  { name: 'The crew stands at the cranks', start: 0, end: 1 },
  { name: 'One turn forward: the front and rear wheels turn against each other', start: 1, end: 5.4 },
  { name: 'The bind: the drive stops dead, the crew shoves twice and it will not go', start: 5.4, end: 7.6 },
  { name: 'Turned back: the wheels fight the other way', start: 7.6, end: 11 },
  { name: 'At rest', start: 11, end: 12 },
] as const
export const PHASES = DRIVE_READING === 'scrub' ? SCRUB_PHASES : JAM_PHASES

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

/** The jam's crank angle in its 12 s loop. The forward turn eases in and arrives at the jam still moving, so the stop
 * reads as the drive's, not the crew's. */
function jamAngle(t: number): number {
  if (t < 1) return 0
  if (t < 5.4) { const u = (t - 1) / 4.4; return TAU * u * u * (2 - u) }
  if (t < 7.6) return TAU + bind(t - 5.4)
  if (t < 11) return TAU * (1 - smoother((t - 7.6) / 3.4))
  return 0
}

/** The far crank's angle about +X, radians, at any time of its reading's loop. */
export function crankAngle(time: number, reading: DriveReading = DRIVE_READING): number {
  const period = periodOf(reading)
  const t = ((time % period) + period) % period
  return reading === 'scrub' ? (TAU * SCRUB.turns * t) / period : jamAngle(t)
}

/** Every joint: the near crank is turned as the far one's mirror, so both
 * front wheels turn together and both rear wheels together, against them. */
export function carJoints(time: number, reading: DriveReading = DRIVE_READING): Record<string, number> {
  const phi = crankAngle(time, reading)
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
