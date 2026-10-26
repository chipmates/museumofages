/* THE MEASURE'S RECIPE, field to finished surface, with no renderer in it:
   the bake runs it once in node and writes the file the wings load; a page
   may run it to look at a change before a bake. */

import { compile, type Field } from './field'
import { nets, pull, reduce, type Surface } from './mesh'
import { drawnBody, standing } from './body'

export interface Recipe {
  /** crown above the soles, metres */
  height: number
  /** the nets' cell, metres; the hand's thinnest part (1 cm) needs two cells */
  voxel: number
  /** triangles kept; 0 keeps the nets' full surface */
  triangles: number
}

export const RECIPE: Recipe = { height: 1.7, voxel: 0.004, triangles: 4000 }

export interface Built extends Surface {
  stats: { netsTriangles: number; triangles: number; vertices: number; top: number; bottom: number; lift: number; ms: { nets: number; reduce: number; finish: number } }
}

/** the finished surface of a body field (the measure's own unless given), standing with its crown at `height` */
export function buildSurface(recipe: Recipe = RECIPE, drawn: Field = drawnBody()): Built {
  const field = standing(drawn, recipe.height)
  const c = compile(field)
  const t0 = performance.now()
  const full = nets(c, recipe.voxel)
  const t1 = performance.now()
  // the crown is pinned so the reduction never lowers it
  let crown = 0
  for (let v = 1; v < full.pos.length / 3; v++) if (full.pos[3 * v + 1]! > full.pos[3 * crown + 1]!) crown = v
  const kept = recipe.triangles > 0 ? reduce(full, recipe.triangles, new Set([crown])) : full
  const t2 = performance.now()
  pull(c, kept.pos, kept.nrm, recipe.voxel * 1.5, 3)
  // soles exactly on the floor; then the last fraction of a millimetre between the top vertex and the height
  let top = 0
  for (let v = 0; v < kept.pos.length / 3; v++) {
    if (kept.nrm[3 * v + 1]! < -0.9 && Math.abs(kept.pos[3 * v + 1]!) < 3e-4) kept.pos[3 * v + 1] = 0
    else if (kept.pos[3 * v + 1]! < 0) kept.pos[3 * v + 1] = 0
    top = Math.max(top, kept.pos[3 * v + 1]!)
  }
  const lift = recipe.height / top
  for (let v = 0; v < kept.pos.length / 3; v++) kept.pos[3 * v + 1] = kept.pos[3 * v + 1]! * lift
  let bottom = Infinity
  top = 0
  for (let v = 0; v < kept.pos.length / 3; v++) {
    bottom = Math.min(bottom, kept.pos[3 * v + 1]!)
    top = Math.max(top, kept.pos[3 * v + 1]!)
  }
  const t3 = performance.now()
  return {
    ...kept,
    stats: { netsTriangles: full.idx.length / 3, triangles: kept.idx.length / 3, vertices: kept.pos.length / 3, top, bottom, lift, ms: { nets: t1 - t0, reduce: t2 - t1, finish: t3 - t2 } },
  }
}
