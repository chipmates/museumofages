/* THE ARRIVAL'S CITY PLAN, pure: the map's plan (without the gate's blocks) as
   the arrival builds it, in one place for the page and the node checks. The north
   entry (north.ts) replaces the map's North Gate, dam walls and north wall and
   trims the North Fortification; the North Palace's two sunken courts open (S3.45,
   REC bab.northpalace.main.plan); the West Fortification takes its walls and its
   embankment (outwork.ts); the quay south of the bridge stands on the river's
   bank, its face on the water's edge (REC bab.river.quay570; the map's line ran
   up to 32 m out in the water there); the street north of the dam comes down to
   the plain as an unpaved way (REC bab.street.outer-north, Guessed, never as dug).
   The functions it needs come in as arguments: node mounts it without a bundler. */

import type { NorthEntry } from './north'
import type { OutworkSpec } from './outwork'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

export interface CityDeps {
  buildPlan: (plan: J, opts?: { houses?: boolean }) => { streetAt: (x: number, z: number) => { level: number }; ground: (x: number, z: number) => number }
  northEntry: (plan: J, level: (x: number, z: number) => number, band: number) => NorthEntry
  westOutwork: (o: OutworkSpec) => NorthEntry['prisms']
}

/** the lion frame's axis (map-plan.json frames.lion) at a metres out, UTM */
const LION = { E: 445773.0, N: 3600844.0, dE: -0.19156, dN: 0.98148 }
const onAxis = (a: number): [number, number] => [+(LION.E + a * LION.dE).toFixed(2), +(LION.N + a * LION.dN).toFixed(2)]

/** the street north of the dam (ours, Guessed): +7.5 to the dam's north end at a = 335, down about 3 percent to the plain's
    +3.2 by a = 478, then level to a = 640, where the ground's painted way takes over (earth.ts) */
export const OUTER_STREET = [
  { at: onAxis(640), level: 3.2, w: 12, cls: 'G', note: 'the way north of the moat on the plain, ours (REC bab.street.outer-north)' },
  { at: onAxis(478), level: 3.2, w: 14, cls: 'G', note: 'the foot of the way down from the dam, ours' },
  { at: onAxis(335), level: 7.5, w: 20, cls: 'R', note: "the dam's north end; the crest at about +7.5 (REC bab.dam.crest)" },
]
/** the painted way on from the street's end, UTM, fading out along the river's east side */
export const OUTER_TRACK: Array<[number, number]> = [onAxis(640), [445700, 3601700], [445790, 3601920]]

/** the quay south of the bridge's east end, its river face on the water's edge (the map's euphrates outline offset 2.7 m) */
const QUAY_SOUTH: Array<[number, number]> = [[445576.82, 3599815.53], [445558.7, 3599700.1], [445602.5, 3599521.0], [445702.3, 3599331.4], [445832.2, 3599141.5]]

/** extra rows of the ground's grid (scene z, 6 m) over the river bank south of the bridge, under the first frames: the map's
    20 m cells there cut the bank into a staircase of lit and shaded triangles */
export function groundRows(canalZ: number[]): number[] {
  const out = [...canalZ]
  for (let z = 866; z <= 1700; z += 6) out.push(z)
  return out
}

export function editCity(cp: J, D: CityDeps): { north: NorthEntry } {
  const probe = D.buildPlan(cp, { houses: false })
  const north = D.northEntry(cp, (x, z) => probe.streetAt(x, z).level, Number(cp.classes.band))
  cp.blocks = cp.blocks.filter((b: J) => !north.drop.includes(b.id))
  for (const b of cp.blocks) {
    if (north.trim[b.id]) b.poly = north.trim[b.id]
    if (b.id === 'north-palace-main') b.holes = [{ id: 'court-west', rect: [445546, 445580, 3600903, 3600940] }, { id: 'court-east', rect: [445598, 445632, 3600900, 3600935] }]
  }
  const ow = cp.blocks.find((b: J) => b.id === 'west-outwork')
  if (ow) {
    cp.blocks = cp.blocks.filter((b: J) => b !== ow)
    north.prisms.push(...D.westOutwork({ poly: ow.poly, E0: cp.frame.E0, N0: cp.frame.N0, band: -1 + Number(cp.classes.band), kind: 3, ground: probe.ground }))
    north.drop.push('west-outwork')
  }
  const rw = cp.walls.find((w: J) => w.id === 'river-wall-south')
  if (rw) rw.line = QUAY_SOUTH.map((p) => [...p])
  // the map's two points north of the North Gate (+7.5 to N 3601320) give way to the dam's end and the way down
  const ng = cp.street.points.findIndex((p: J) => p.at[1] < 3601100)
  cp.street.points = [...OUTER_STREET.map((p) => ({ ...p, at: [...p.at] })), ...cp.street.points.slice(ng)]
  return { north }
}
