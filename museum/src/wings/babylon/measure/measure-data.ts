/* FEATURE 7'S FACTS, each with its holder. The stages are the walk's own build
   (`map/map-plan.json` tower, the Esagila tablet at about 6 m a gar; a test
   holds them equal); the readings and the counts are the targets' (TARGETS-W2A
   feature 7). The height is not known: every height here is someone's reading,
   and the counts are one model's arithmetic, never a count of bricks used. */

/** a stage of the tablet's tower, side-on: its width and its height, metres */
export interface Stage { side: number; h: number }

export const TOWER = {
  /** the base as built on the measured footprint, "about 90 m" in words (REC bab.tower.base, In place) */
  base: 91.5,
  /** WHAT WAS DUG, in metres against the tower's foot at +2.5 (C914 S9-13): the mud-brick core about 60 m square,
      its top about +2.0 to +2.5; round it the baked mantle founded at -4.0, its remains up to -2.0 */
  core: { side: 60, top: -0.25 },
  mantle: { foot: -6.5, top: -4.5 },
  /** the Esagila tablet's stages, as the walk builds them (map-plan.json tower.stages; stage 6 Smith's restoration) */
  stages: [
    { side: 91.5, h: 33 }, { side: 78, h: 18 }, { side: 60, h: 6 }, { side: 51, h: 6 }, { side: 42, h: 6 }, { side: 33, h: 6 }, { side: 24, h: 15 },
  ] as readonly Stage[],
} as const

/** THE READINGS the slider stops at, in its order; null is "not known" */
export const READINGS = [null, 66, 90, null] as const

/** THE COUNT in one model (P2021 p. 164 to 165): the tower at the end of the king's reign, millions of bricks */
export const BRICKS = {
  /** the core, unbaked mud brick */
  mud: 8.7,
  /** the mantle, upper levels and stairs, baked brick */
  baked: 30.2,
  /** the city walls held this many times the tower's bricks in the same model: 12 or 15 by how the palace walls count */
  walls: [12, 15] as const,
} as const

/** the tower's height in the tablet's set: the stages summed */
export const tabletHeight = (): number => TOWER.stages.reduce((s, x) => s + x.h, 0)
