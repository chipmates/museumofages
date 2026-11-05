/* Stop 15's plants, pure: the page (top.ts) and the node checks (forge/babylon/mounts.mjs) both take them. The builders
   come in as arguments, so this file imports types only and runs in node as it is. */
import type { Palm, Plain } from '../open/plain'
import type { Built } from '../map/plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
export interface Make {
  buildPlain: (mapPlan: J, opts?: { palms?: boolean; reach?: number }) => Plain
  rebuildHouses: (boxes: Built['boxes'], ground: (x: number, z: number) => number) => { boxes: Array<{ house: number; part: number; x: number; z: number; sx: number; sz: number }> }
}

/** the plain's plants (open/plain.ts, from the map's own plan) and the courts' crowns */
export function topPlants(built: Built, plan: J, tp: J, make: Make): { plain: Plain; all: Palm[] } {
  const plain = make.buildPlain(plan, { reach: Number(tp.plain.reach) })
  return { plain, all: [...plain.palms, ...courtPalms(built, plan, tp.courts, make.rebuildHouses)] }
}

/** one palm in every `every`-th house court on the east bank within `reach` metres of the eye, outside the precinct and
    the quays: each at its court's middle, the court the arrival's house type gives its lot (open/houses.ts, the same
    seeded rebuild the page draws); the mid preset where the eye is nearer than `mid` metres */
function courtPalms(built: Built, plan: J, c: J, rebuild: Make['rebuildHouses']): Palm[] {
  const E0: number = plan.frame.E0, N0: number = plan.frame.N0
  const eye = [Number(c.eye[0]) - E0, N0 - Number(c.eye[1])]
  const keepOut: Array<[number, number, number, number]> = (c.keepOut as Array<[number, number, number, number]>).map(([e0, n0, e1, n1]) => [e0 - E0, N0 - n1, e1 - E0, N0 - n0])
  const out: Palm[] = []
  const houses = rebuild(built.boxes.filter((b) => b.group === 'house'), built.ground).boxes
  for (const b of houses) {
    if (b.part !== 4 || Math.min(b.sx, b.sz) < Number(c.minCourt)) continue
    if (b.x < Number(c.eastOf) - E0) continue
    if (((b.house * 2654435761) >>> 0) % Number(c.every) !== 0) continue
    const d = Math.hypot(b.x - eye[0]!, b.z - eye[1]!)
    if (d > Number(c.reach)) continue
    if (keepOut.some(([x0, z0, x1, z1]) => b.x > x0 && b.x < x1 && b.z > z0 && b.z < z1)) continue
    const h = ((b.house * 40503) % 997) / 997
    out.push({ x: b.x, z: b.z, s: 0.7 + h * 0.35, yaw: h * Math.PI * 2, lean: (h - 0.5) * 0.08, row: 'court', ...(d < Number(c.mid) ? { detail: 'mid' as const } : {}) })
  }
  return out
}
