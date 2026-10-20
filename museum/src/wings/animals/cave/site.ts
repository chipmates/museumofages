/* THE STATION'S NUMBERS: where the lookdev cave's light comes from, in the
   station's frame (x the animal's snout, y up, z the animal's right, metres,
   the origin on the floor under the hip). The geometry and its provenance are
   in the cave's own json, written by the forge (`cave_build.py`); what the
   engine needs to light it lives here, so the Blender side can read the same
   numbers from `site()` through the rig (`__cave.site()`).

   The sun: NOAA equations for 43.1757 N, 24.0730 E (the light study's
   `tools/sun.py`); bearings turned into the station's frame by its facing,
   80.2 degrees (the snout toward the small mouth A along the B-C leg). */

export type StateName = 'eyes' | 'gallery' | 'mouth'

export interface SunState {
  /** the date and hour the state stands for, and why */
  when: string
  /** geographic sun position */
  azimuthDeg: number
  altitudeDeg: number
  /** the sun's normal illuminance in engine units (1 = 1000 lux) */
  illuminance: number
  kelvin: number
  /** true under the Eyes: the vault's own penumbra map gates the key; otherwise the cascades' shadow of all the rock does */
  aperture: boolean
}

export interface HazeState {
  /** scattering coefficient, per metre */
  sigma: number
  /** Henyey-Greenstein anisotropy */
  g: number
  /** the air the march covers, station frame */
  box: { min: [number, number, number]; max: [number, number, number] }
  /** how much of the skylight the air scatters back, engine units of radiance */
  ambient: [number, number, number]
}

export interface Print {
  exposure: number
  toe: number
  shoulder: number
  lift: [number, number, number]
  gamma: [number, number, number]
  gain: [number, number, number]
  warm: [number, number, number]
  cool: [number, number, number]
  split: number
  saturation: number
  vignette: number
  grain: number
  /** a lens's halo around what clips: threshold after exposure, strength, and two radii as shares of the frame's height */
  glow: { threshold: number; strength: number; radii: [number, number] }
}

export interface StateSpec {
  name: StateName
  says: string
  sun: SunState
  haze: HazeState | null
  print: Print
}

const FACING_DEG = 80.2

/** a geographic bearing and altitude as a unit vector toward the sun, station frame */
export function sunVector(azimuthDeg: number, altitudeDeg: number): [number, number, number] {
  const r = Math.PI / 180
  const c = Math.cos(altitudeDeg * r)
  return [c * Math.cos((azimuthDeg - FACING_DEG) * r), Math.sin(altitudeDeg * r), c * Math.cos((azimuthDeg - FACING_DEG - 90) * r)]
}

const BASE_PRINT: Print = {
  exposure: 1,
  toe: 0.012,
  shoulder: 1,
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  warm: [1.02, 1.0, 0.97],
  cool: [0.97, 1.0, 1.03],
  split: 0.35,
  saturation: 0.96,
  vignette: 0.18,
  grain: 0.004,
  glow: { threshold: 1.0, strength: 0.05, radii: [0.012, 0.06] },
}

export const STATES: Record<StateName, StateSpec> = {
  eyes: {
    name: 'eyes',
    says: 'under the Eyes: the west eye\'s afternoon beam from above and behind the animal, through haze; the warm bounce of the sunlit stone; skylight through both Eyes',
    sun: {
      when: '21 June, 15:20 EEST (the light study\'s Look 1, a summer afternoon; its times carry about 45 minutes of doubt): the west Eye\'s beam along the animal, 83 percent of its sun-facing surface lit (blender/beam_hours.py on the forge\'s mesh); never a dated beam',
      azimuthDeg: 239.5,
      altitudeDeg: 59.2,
      illuminance: 100,
      kelvin: 5900,
      aperture: true,
    },
    haze: {
      sigma: 0.012,
      g: 0.55,
      box: { min: [-40, -2, -18], max: [36, 44, 22] },
      ambient: [0.0035, 0.0042, 0.005],
    },
    // a clay grey (0.25) square to the sun lands at 0.68 before the curve, under its shoulder: the lit side of an animal keeps its detail
    print: { ...BASE_PRINT, exposure: 0.085 },
  },
  gallery: {
    name: 'gallery',
    says: 'the gallery: the Eyes closed, a mouth 51 m behind the animal lights it from behind, a dim fill; a stand-in for the passage between the Eyes and a mouth',
    sun: {
      when: '21 June, 13:20 EEST (solar noon): the sun high in the south never reaches into the passage; the mouth is sky-lit',
      azimuthDeg: 180.0,
      altitudeDeg: 70.25,
      illuminance: 100,
      kelvin: 6000,
      aperture: false,
    },
    haze: {
      sigma: 0.003,
      g: 0.55,
      box: { min: [-60, -3, -18], max: [36, 44, 22] },
      ambient: [0.004, 0.0045, 0.005],
    },
    print: { ...BASE_PRINT, exposure: 0.55 },
  },
  mouth: {
    name: 'mouth',
    says: 'against the mouth: the Eyes closed, a mouth 17 m behind the tail opens on bright day; exposed for the day, the animal a dark shape',
    sun: {
      when: '21 June, 13:20 EEST (solar noon): the country outside in full sun, the sun never inside',
      azimuthDeg: 180.0,
      altitudeDeg: 70.25,
      illuminance: 100,
      kelvin: 6000,
      aperture: false,
    },
    haze: {
      sigma: 0.0025,
      g: 0.55,
      box: { min: [-42, -3, -18], max: [36, 44, 22] },
      ambient: [0.004, 0.0045, 0.005],
    },
    print: { ...BASE_PRINT, exposure: 0.045 },
  },
}

/** the scale figure's fixed place for every arm: in front of the snout on the midline, facing the animal */
export const FIGURE = { height: 1.75, x: 6.4, z: 0, facing: -1 as const }

/** where the probe stands: the animal's middle, a little above the hip's height of a person */
export const PROBE_AT: [number, number, number] = [-0.8, 2.3, 0]

/** the sun's angular radius, radians: the half-width of a penumbra per metre of distance */
export const SUN_RADIUS = 0.00465
