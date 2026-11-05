/* FEATURE 11'S FACTS, each with its holder. The two evenings are read from their computed files at run time
   (`sky-0414.json` here, `crescent/sky-570.json` the stop's own; JPL Horizons, DE441, written by
   `forge/babylon/crescent-sky.py`), never typed; Yallop's q is the tool's printout, which a test holds to its class.
   The tablet's numbers are the 1915 edition's as the research's arithmetic reads them: every one "about" in words.
   Pure: no DOM, no three. */

import { limbClockwise, litShare, moonAtUT, type MoonNow, type SkyFile } from '../crescent/sky'

export type P2 = readonly [number, number]

/* ───────────── the two evenings ───────────── */

/** Yallop's classes (NAO Technical Note 69): the lower bound of q for each, A down to E; under E's bound, F */
export const YALLOP_BOUNDS = { A: 0.216, B: -0.014, C: -0.16, D: -0.232, E: -0.293 } as const
export type YallopClass = keyof typeof YALLOP_BOUNDS | 'F'
export function yallopClass(q: number): YallopClass {
  for (const [k, lo] of Object.entries(YALLOP_BOUNDS)) if (q > lo) return k as YallopClass
  return 'F'
}

/** q at Yallop's best time, as crescent-sky.py prints it for each evening's tables */
export const YALLOP = {
  '0414': { q: -0.187, best: '15:40', src: 'crescent-sky.py on the 14 April tables (this round), its printout' },
  '0415': { q: 1.639, best: '16:09', src: 'crescent-sky.py on the 15 April tables (the crescent round), its printout' },
} as const

export type EveningId = '0414' | '0415'
export const EVENING_IDS: readonly EveningId[] = ['0414', '0415']

export interface Evening {
  id: EveningId
  /** UT minutes after midnight, to the second */
  sunset: number
  moonset: number
  /** minutes from sunset to moonset, the file's own events */
  lag: number
  /** the Sun and the Moon at the sunset second: true azimuths, airless topocentric altitudes (the centre), degrees */
  sun: { az: number; el: number; diam: number }
  moon: MoonNow
  /** the bright limb's direction on the disc as seen, degrees clockwise from straight up */
  limb: number
  /** the lit share of the disc from the phase angle, 0 to 1 (Horizons' own percent is `moon.illu`) */
  lit: number
  /** the Moon's airless place each minute from sunset until its centre is under the horizon: [az, el] */
  track: P2[]
  q: number
  cls: YallopClass
}

const secs = (s: string): number => { const [h, m, x] = s.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0) + (x ?? 0) / 60 }

/** the Sun's apparent diameter, degrees: not in the files' rows (Horizons' Ang-diam 1893.7 arcseconds at 15:24 UT on 14 April) */
export const SUN_DIAM = 0.526

export function eveningOf(id: EveningId, sky: SkyFile): Evening {
  const ev = sky.events
  const sunset = secs(String(ev['sunsetAt'])), moonset = secs(String(ev['moonsetAt']))
  const moon = moonAtUT(sky, sunset)
  if (!moon) throw new Error(`${id}: no row at sunset`)
  const track: P2[] = [[moon.az, moon.el]]
  for (const r of sky.minutes) {
    const m = secs(r.ut)
    if (m <= sunset) continue
    track.push([r.moon.az, r.moon.el])
    if (r.moon.el < 0) break
  }
  const Y = YALLOP[id]
  return {
    id, sunset, moonset, lag: Number(ev['lag']),
    sun: { az: moon.sunAz, el: moon.sunEl, diam: SUN_DIAM },
    moon, limb: limbClockwise(sky, moon), lit: litShare(moon.sto), track, q: Y.q, cls: yallopClass(Y.q),
  }
}

/** the numbers the plate and the words print for an evening, rounded as printed */
export function printed(e: Evening): { height: number; lit: number; lag: number } {
  return { height: Math.round(e.moon.el * 10) / 10, lit: Math.round(e.moon.illu * 10) / 10, lag: Math.round(e.lag) }
}

/** the window of sky the panels show, true azimuth and airless altitude, degrees, on one scale for the two evenings:
    wide the same window for both; upright narrower across (the Moons, the set Sun and both settings inside it), and
    stacked each evening only as high as its own Moon and drawn disc need */
export const SKY_WINDOW = {
  wide: { az: [261, 287] as const, el: { '0414': [-2.5, 22], '0415': [-2.5, 22] } },
  upright: { az: [264, 284.5] as const, el: { '0414': [-2.5, 14], '0415': [-2.5, 22] } },
} as const

/* ───────────── the tablet and what a shekel bought ───────────── */

/** the diary the numbers come from (TARGETS-W2B feature 11, RES section 3): text of year 37, Berlin */
export const DIARY = {
  name: 'VAT 4956',
  holder: { en: 'Vorderasiatisches Museum, Berlin', de: 'Vorderasiatisches Museum, Berlin' },
  year: '568/567',
  kingsYear: 37,
  edition: 'P. V. Neugebauer and E. F. Weidner, 1915',
  src: 'RES section 3 via TARGETS-W2B feature 11',
} as const

/** the photograph of a diary's form: BM 36761, always under its own date (PHOTOS N3), never as VAT 4956 */
export const PHOTO = {
  name: 'BM 36761',
  date: { en: '331 to 330 BC', de: '331 bis 330 v. Chr.' },
  file: { w: 1280, h: 1346 },
  /** the tablet with a margin; the museum's clips and the cloth's far corners cut away */
  crop: { l: 96, t: 70, r: 1236, b: 1250 },
  /** as feature 10 prints its photograph's: the author, the date, the source's host, the licence (the file page:
      commons.wikimedia.org/wiki/File:Astronomical_Diary_331_330_BC_BM_36761.jpg) */
  credit: 'Zunkir, 9 March 2020, commons.wikimedia.org, CC BY-SA 4.0',
  src: 'PHOTOS.md row N3; the credit file beside the photograph',
} as const

/** THE EDITION'S NUMBERS (Neugebauer and Weidner 1915, by RES section 3's arithmetic with Pirngruber's units: kurru
    180 litres, qu 1 litre, shekel 8.33 g): what one shekel of silver bought in month XI of year 37 */
export const SHEKEL_G = 8.33
export const UNITS = { kurru: 180, qu: 1 } as const
export const GOODS = {
  /** "nur noch 1 GUR" in month XI (month X: 1 GUR 12 KA, about 190) */
  barley: { gur: 1, ka: 0 },
  /** 1 GUR 60 KA in months X and XI */
  dates: { gur: 1, ka: 60 },
  /** 24 KA in month XI */
  sesame: { gur: 0, ka: 24 },
} as const
export type Good = keyof typeof GOODS
export const GOOD_IDS: readonly Good[] = ['barley', 'dates', 'sesame']
export const litresOf = (g: Good): number => GOODS[g].gur * UNITS.kurru + GOODS[g].ka * UNITS.qu

/** the heaps' slope, one for the three so that their sizes compare by volume alone: ours, no source read for these goods */
export const REPOSE_DEG = 28

/** a heap's profile: a cone at the slope with its top rounded over the inner `CAP` share of its radius (a parabola
    meeting the slope) and its foot easing out over the outer `TOE` share, so it reads as poured; [radius, height]
    pairs in metres from the axis out to the foot */
export const CAP = 0.16, TOE = 0.12
export function heapProfile(R: number, deg = REPOSE_DEG, n = 48): P2[] {
  const k = Math.tan(deg * Math.PI / 180), a = CAP * R
  const toe = (r: number): number => { const u = (R - r) / (TOE * R); return u >= 1 ? 1 : 1 - 0.35 * (1 - u) ** 2 }
  const y = (r: number): number => (r >= a ? k * (R - r) * toe(r) : k * (R - a) + k * (a * a - r * r) / (2 * a))
  const pts: P2[] = []
  for (let i = 0; i <= n; i++) { const r = R * i / n; pts.push([r, y(r)]) }
  return pts
}
/** the volume of a profile turned about its axis, cubic metres (the trapezoid rule on 2 pi r y) */
export function profileVolume(p: readonly P2[]): number {
  let v = 0
  for (let i = 0; i + 1 < p.length; i++) {
    const [r0, y0] = p[i]!, [r1, y1] = p[i + 1]!
    // the exact volume of a frustum-like ring between two points of the profile, linear in between
    const dr = r1 - r0
    v += Math.PI * dr * (r0 * y0 * 2 + r0 * y1 + r1 * y0 + r1 * y1 * 2) / 3
  }
  return v
}
/** the foot radius whose heap holds `litres` */
export function heapRadius(litres: number, deg = REPOSE_DEG): number {
  let lo = 0.01, hi = 3
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (profileVolume(heapProfile(mid, deg)) * 1000 < litres) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

/** SILVER, weighed, not coined: one shekel as a cut lump, its size from pure silver's density (ours to use: the
    alloy of a lump of 568 BC is not known); a box with its edges cut, millimetres */
export const SILVER_DENSITY = 10.49
export const SILVER_MM = { l: 14, w: 9, h: 6.3 } as const
export const silverVolumeCm3 = (): number => SHEKEL_G / SILVER_DENSITY

/** the scale figure (place/person.ts f2; the paper kit's FIGURE_M): metres */
export const FIGURE_HEIGHT = 1.7

/** THE STAGE'S PLAN for the heaps: their places on the floor (x right, z toward the eye, metres), the figure's, the
    lump's; and the eye per framing (position, target, vertical field of view, the picture's aspect) */
export const HEAPS_PLAN = {
  barley: [-0.72, -0.1] as P2,
  dates: [0.92, -0.3] as P2,
  sesame: [0.2, 0.9] as P2,
  figure: [-1.78, -0.38] as P2,
  silver: [0.86, 1.18] as P2,
  views: {
    wide: { eye: [0.05, 1.95, 5.6] as const, target: [-0.25, 0.62, 0.15] as const, fov: 25, aspect: 1.6 },
    // the figure whole inside the plate's lower share, about the wide eye's 14 degrees down
    upright: { eye: [-0.9, 2.7, 5.5] as const, target: [-0.3, 1.3, 0.2] as const, fov: 38, aspect: 1.0 },
    silver: { eye: [0.86, 0.05, 1.3] as const, target: [0.86, 0.004, 1.18] as const, fov: 22, aspect: 1.0 },
  },
} as const
export type HeapView = keyof typeof HEAPS_PLAN.views

type V3 = readonly [number, number, number]
/** a point of the stage on the picture as three's perspective camera draws it (lookAt with y up): shares of the
    picture's width and height from its top left, and the depth along the view */
export function project(view: HeapView, p: V3): { x: number; y: number; depth: number } {
  const v = HEAPS_PLAN.views[view]
  const sub = (a: V3, b: V3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const norm = (a: V3): [number, number, number] => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l] }
  const cross = (a: V3, b: V3): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const back = norm(sub(v.eye, v.target)), right = norm(cross([0, 1, 0], back)), up = cross(back, right)
  const d = sub(p, v.eye)
  const cx = dot(d, right), cy = dot(d, up), cz = -dot(d, back)
  const t = Math.tan(v.fov * Math.PI / 360)
  return { x: 0.5 + cx / (cz * t * v.aspect) / 2, y: 0.5 - cy / (cz * t) / 2, depth: cz }
}

/** each heap's foot radius and height, its volume in litres, its place */
export function heaps(): { id: Good; R: number; H: number; litres: number; at: P2 }[] {
  return GOOD_IDS.map((id) => {
    const R = heapRadius(litresOf(id)), p = heapProfile(R)
    return { id, R, H: p[0]![1], litres: profileVolume(p) * 1000, at: HEAPS_PLAN[id] }
  })
}

/* ───────────── the river's rise ───────────── */

/** "Vom 8. Schaltadar bis zum 29. stieg die Flut 3 Ellen 8 Finger" (the 1915 translation; the commentary has "bis zum
    28. Nisan"); the commentary's cubit 0.495 m of 24 fingers */
export const RISE = { cubits: 3, fingers: 8, cubitM: 0.495, fingersPerCubit: 24, src: 'Neugebauer and Weidner 1915 via RES section 3' } as const
export const riseM = (): number => (RISE.cubits + RISE.fingers / RISE.fingersPerCubit) * RISE.cubitM

/** THE GOODS' LOOK on the stage, ours: linear albedos from each good's usual colour (hulled barley straw-pale, dried
    dates a dark red brown, hulled sesame cream), the grain's size for the surface's grain, and the dates as fruits
    laid over their heap (a dried date about 35 by 18 mm, ours), standing `proud` mm out of the heap's surface; the heap
    under them is made smaller by the shell they add, so the whole holds the edition's litres */
export const HEAPS_LOOK = {
  barley: { albedo: [0.56, 0.4, 0.17] as const, grain: 0.008, roughness: 0.85 },
  dates: { albedo: [0.075, 0.03, 0.016] as const, grain: 0.03, roughness: 0.55, fruit: { long: 0.035, wide: 0.018 }, proud: 0.006,
    /** the heap under the fruits, seen only in their gaps: darker and dull */
    core: { shade: 0.55, roughness: 0.92 } },
  sesame: { albedo: [0.72, 0.6, 0.36] as const, grain: 0.003, roughness: 0.8 },
  silver: { albedo: [0.78, 0.77, 0.74] as const, roughness: 0.42 },
} as const

/** a profile's slant area, square metres (the fruits' shell) */
export function profileArea(p: readonly P2[]): number {
  let a = 0
  for (let i = 0; i + 1 < p.length; i++) {
    const [r0, y0] = p[i]!, [r1, y1] = p[i + 1]!
    a += Math.PI * (r0 + r1) * Math.hypot(r1 - r0, y1 - y0)
  }
  return a
}

/** the dates' heap under its fruits: the bulk to the fruits' mean outer face (half their proud height) is the edition's */
export function datesCore(): { R: number; shell: number } {
  const L = litresOf('dates'), proud = HEAPS_LOOK.dates.proud
  let R = heapRadius(L)
  for (let i = 0; i < 4; i++) {
    const shell = profileArea(heapProfile(R)) * proud / 2 * 1000
    R = heapRadius(L - shell)
  }
  return { R, shell: profileArea(heapProfile(R)) * proud / 2 * 1000 }
}
