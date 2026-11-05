/* THE MOON ON THE WALK'S LAST EVENING, pure (the page and node): the rows of sky-570.json (JPL Horizons, DE441, one a
   minute) read at the minute whose Sun stands where the page's own sun (map/sun.ts) stands, so the crescent and the
   sky's afterglow keep one clock. Directions in the scene's frame (x east, y up, z south) on the map's grid: the
   computed azimuths are true, the grid stands `convergence` degrees from true north at the site. No imports, for node. */

const D2R = Math.PI / 180
type V3 = [number, number, number]

export interface SkyRow {
  ut: string
  sun: { az: number; el: number; elR: number; ra: number; dec: number }
  moon: { az: number; el: number; elR: number; ra: number; dec: number; illu: number; diam: number; sto: number; sot: number }
  last: number
  limbCw: number
}
export interface SkyFile {
  site: [number, number, number]
  convergence: number
  events: Record<string, string | number>
  hold: string
  minutes: SkyRow[]
}

/** the Moon at one moment: azimuths true, altitudes topocentric (elR with Horizons' refraction), degrees */
export interface MoonNow {
  /** minutes after 0h UT */
  ut: number
  sunAz: number
  sunEl: number
  az: number
  el: number
  elR: number
  /** apparent diameter, degrees */
  diam: number
  /** lit percent, Horizons' */
  illu: number
  /** the phase angle (Sun, Moon, observer), degrees */
  sto: number
}

const minutes = (s: string): number => {
  const [h, m] = s.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function blend(a: SkyRow, b: SkyRow, f: number): MoonNow {
  const l = (p: number, q: number): number => p + (q - p) * f
  return {
    ut: l(minutes(a.ut), minutes(b.ut)),
    sunAz: l(a.sun.az, b.sun.az), sunEl: l(a.sun.el, b.sun.el),
    az: l(a.moon.az, b.moon.az), el: l(a.moon.el, b.moon.el), elR: l(a.moon.elR, b.moon.elR),
    diam: l(a.moon.diam, b.moon.diam), illu: l(a.moon.illu, b.moon.illu), sto: l(a.moon.sto, b.moon.sto),
  }
}

/** the Moon at a UT minute (fractions allowed), null outside the file's evening */
export function moonAtUT(sky: SkyFile, ut: number): MoonNow | null {
  const R = sky.minutes
  for (let i = 0; i + 1 < R.length; i++) {
    const a = minutes(R[i]!.ut), b = minutes(R[i + 1]!.ut)
    if (ut >= a && ut <= b) return blend(R[i]!, R[i + 1]!, (ut - a) / (b - a))
  }
  return null
}

/** the Moon at the page's solar hour, given as the elevation map/sun.ts gives the sun then: the minute whose computed Sun
    stands there (the two agree to a constant 2 h 58 min after UT on this evening); null outside the file's evening */
export function moonAtSun(sky: SkyFile, el: number): MoonNow | null {
  const R = sky.minutes
  for (let i = 0; i + 1 < R.length; i++) {
    const a = R[i]!.sun.el, b = R[i + 1]!.sun.el
    if (el <= a && el >= b) return blend(R[i]!, R[i + 1]!, (a - el) / (a - b))
  }
  return null
}

/** a direction at a true azimuth and an altitude, on the map's grid */
export function dirOf(sky: SkyFile, az: number, el: number): V3 {
  const A = (az - sky.convergence) * D2R, c = Math.cos(el * D2R)
  return [c * Math.sin(A), Math.sin(el * D2R), -c * Math.cos(A)]
}

const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a)
  return [a[0] / l, a[1] / l, a[2] / l]
}
const along = (a: V3, m: V3): V3 => {
  const k = dot(a, m)
  return norm([a[0] - k * m[0], a[1] - k * m[1], a[2] - k * m[2]])
}

/** the disc's frame: toward the drawn Moon (refracted), and on its face the bright limb's direction (toward the Sun along
    the great circle, from the two airless positions) and the direction a quarter turn from it */
export function moonFrame(sky: SkyFile, m: MoonNow): { dir: V3; limb: V3; side: V3 } {
  const dir = dirOf(sky, m.az, m.elR)
  const limb = along(dirOf(sky, m.sunAz, m.sunEl), dirOf(sky, m.az, m.el))
  const l = along(limb, dir)
  const z: V3 = [-dir[0], -dir[1], -dir[2]]
  const side: V3 = [z[1] * l[2] - z[2] * l[1], z[2] * l[0] - z[0] * l[2], z[0] * l[1] - z[1] * l[0]]
  return { dir, limb: l, side }
}

/** the bright limb's direction on the disc as the eye sees it: degrees clockwise from straight up (toward the zenith) */
export function limbClockwise(sky: SkyFile, m: MoonNow): number {
  const { dir, limb } = moonFrame(sky, m)
  const up = along([0, 1, 0], dir)
  // toward increasing azimuth at the Moon (to the right of a look at it)
  const A = (m.az - sky.convergence) * D2R
  const right: V3 = [Math.cos(A), 0, Math.sin(A)]
  return ((Math.atan2(dot(limb, right), dot(limb, up)) / D2R) % 360 + 360) % 360
}

/** the disc at (u toward the bright limb, v across), radius 1: the lit part's brightness 0 to 1 (Lommel-Seeliger, the
    law for a dusty surface: no darkening toward the limb, falling to the terminator), 0 on the dark part and outside */
export function litAt(u: number, v: number, sto: number): number {
  const r2 = u * u + v * v
  if (r2 >= 1) return 0
  const w = Math.sqrt(1 - r2)
  const i = sto * D2R
  const mu0 = u * Math.sin(i) + w * Math.cos(i)
  if (mu0 <= 0) return 0
  return mu0 / (mu0 + w)
}

/** the lit share of the disc for a phase angle (the sphere's own geometry) */
export const litShare = (sto: number): number => (1 + Math.cos(sto * D2R)) / 2
